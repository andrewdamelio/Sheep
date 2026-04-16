import { useEffect, useState } from 'react';

interface PrefsShape {
  idleSleepSeconds: number;
  sheepSpeed: number;
  crypto: { enabled: boolean; fiveMinPct: number; oneHourPct: number };
  activeApp: { enabled: boolean };
  windowWalk: { enabled: boolean };
  ambient: { enabled: boolean };
  ai: { enabled: boolean; apiKey: string; model: string };
  sound: { enabled: boolean; volume: number };
}

declare global {
  interface Window {
    smpPrefs?: {
      get: () => Promise<PrefsShape>;
      set: (patch: Partial<PrefsShape>) => Promise<PrefsShape>;
      testAi: () => Promise<{ ok: boolean; text?: string; error?: string }>;
      getScreenStatus: () => Promise<string>;
      requestScreen: () => Promise<string>;
      openScreenSettings: () => void;
      resetAndRelaunch: () => Promise<{ ok: boolean; error?: string }>;
    };
  }
}

const section: React.CSSProperties = {
  background: '#fff',
  borderRadius: 10,
  padding: '14px 16px',
  marginBottom: 14,
  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
};
const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  color: '#6e6e73',
  margin: '0 0 10px 0',
  fontWeight: 600,
};
const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 0',
  borderBottom: '1px solid #f0f0f0',
};
const label: React.CSSProperties = { fontSize: 13 };
const hint: React.CSSProperties = { fontSize: 11, color: '#8e8e93', marginTop: 2 };
const input: React.CSSProperties = {
  fontSize: 13,
  padding: '4px 8px',
  border: '1px solid #d1d1d6',
  borderRadius: 6,
  background: '#fff',
  outline: 'none',
  width: 70,
  textAlign: 'right',
};
const textInput: React.CSSProperties = { ...input, width: 220, textAlign: 'left', fontFamily: 'ui-monospace, monospace' };

export default function Prefs() {
  const [prefs, setPrefs] = useState<PrefsShape | null>(null);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [screenStatus, setScreenStatus] = useState<string>('unknown');
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    window.smpPrefs?.getScreenStatus().then(setScreenStatus);
    const id = setInterval(() => {
      window.smpPrefs?.getScreenStatus().then(setScreenStatus);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  async function requestScreen() {
    if (!window.smpPrefs) return;
    const next = await window.smpPrefs.requestScreen();
    setScreenStatus(next);
  }

  async function resetAndRelaunch() {
    if (!window.smpPrefs) return;
    setResetError(null);
    if (!confirm('Screen Recording is in the system TCC database, so clearing it requires admin privileges. You\'ll see a macOS password prompt. After reset the app will relaunch and ask for the permission fresh.')) return;
    const res = await window.smpPrefs.resetAndRelaunch();
    if (!res.ok) setResetError(res.error ?? 'Unknown error');
  }

  async function runAiTest() {
    if (!window.smpPrefs) return;
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const res = await window.smpPrefs.testAi();
      setAiTestResult({
        ok: res.ok,
        msg: res.ok ? (res.text ?? 'OK — check the sheep.') : (res.error ?? 'Unknown error'),
      });
    } finally {
      setAiTesting(false);
    }
  }

  useEffect(() => {
    window.smpPrefs?.get().then(setPrefs);
  }, []);

  async function update(patch: Partial<PrefsShape>) {
    if (!window.smpPrefs) return;
    const next = await window.smpPrefs.set(patch);
    setPrefs(next);
  }

  if (!prefs) {
    return <div style={{ padding: 20, fontSize: 13, color: '#6e6e73' }}>Loading…</div>;
  }

  return (
    <div style={{ padding: 20, maxWidth: 440, margin: '0 auto' }}>
      <h1 style={{ fontSize: 18, margin: '0 0 16px 0' }}>Preferences</h1>

      <div style={section}>
        <div style={sectionTitle}>Sheep</div>
        <div style={row}>
          <div>
            <div style={label}>Idle sleep threshold</div>
            <div style={hint}>Sheep falls asleep after this many seconds of inactivity.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              min={30}
              max={3600}
              step={30}
              value={prefs.idleSleepSeconds}
              onChange={(e) => update({ idleSleepSeconds: Math.max(30, Number(e.target.value) || 180) })}
              style={input}
            />
            <span style={{ fontSize: 12, color: '#6e6e73' }}>sec</span>
          </div>
        </div>
        <div style={{ ...row, borderBottom: 'none' }}>
          <div>
            <div style={label}>Sheep speed</div>
            <div style={hint}>Multiplier on walk/run speed. 1.0 is stock.</div>
          </div>
          <input
            type="number"
            min={0.25}
            max={3}
            step={0.25}
            value={prefs.sheepSpeed}
            onChange={(e) => update({ sheepSpeed: Math.max(0.25, Math.min(3, Number(e.target.value) || 1)) })}
            style={input}
          />
        </div>
      </div>

      <div style={section}>
        <div style={sectionTitle}>Active app awareness</div>
        <div style={{ ...row, flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={label}>Screen Recording permission</div>
              <div style={hint}>
                Status: <code style={{ fontFamily: 'ui-monospace, monospace' }}>{screenStatus}</code>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {screenStatus === 'not-determined' && (
                <button
                  type="button"
                  onClick={requestScreen}
                  style={{
                    fontSize: 12, padding: '6px 10px', borderRadius: 6,
                    border: '1px solid #d1d1d6', background: '#fff', cursor: 'pointer',
                  }}
                >
                  Request
                </button>
              )}
              {screenStatus === 'denied' && (
                <button
                  type="button"
                  onClick={resetAndRelaunch}
                  style={{
                    fontSize: 12, padding: '6px 10px', borderRadius: 6,
                    border: '1px solid #b00020', background: '#fdecea', color: '#b00020',
                    cursor: 'pointer', fontWeight: 600,
                  }}
                  title="Runs tccutil reset with admin privileges and relaunches. You'll get a fresh prompt."
                >
                  Reset &amp; Relaunch
                </button>
              )}
              {resetError && (
                <div style={{
                  flexBasis: '100%', fontSize: 11, color: '#b00020',
                  fontFamily: 'ui-monospace, monospace', marginTop: 4, textAlign: 'right',
                }}>
                  {resetError}
                </div>
              )}
              <button
                type="button"
                onClick={() => window.smpPrefs?.openScreenSettings()}
                style={{
                  fontSize: 12, padding: '6px 10px', borderRadius: 6,
                  border: '1px solid #d1d1d6', background: '#fff', cursor: 'pointer',
                }}
              >
                Open Settings
              </button>
            </div>
          </div>
        </div>
        <div style={row}>
          <div>
            <div style={label}>Sheep reacts to the frontmost app</div>
            <div style={hint}>Requires Screen Recording permission in System Settings.</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.activeApp.enabled}
            onChange={(e) => update({ activeApp: { ...prefs.activeApp, enabled: e.target.checked } })}
          />
        </div>
        <div style={{ ...row, borderBottom: 'none' }}>
          <div>
            <div style={label}>Walk on window titlebars</div>
            <div style={hint}>Sheep can land on the top edge of the frontmost window. Experimental.</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.windowWalk.enabled}
            onChange={(e) => update({ windowWalk: { ...prefs.windowWalk, enabled: e.target.checked } })}
          />
        </div>
      </div>

      <div style={section}>
        <div style={sectionTitle}>Crypto alerts</div>
        <div style={row}>
          <div style={label}>Watch BTC & ETH</div>
          <input
            type="checkbox"
            checked={prefs.crypto.enabled}
            onChange={(e) => update({ crypto: { ...prefs.crypto, enabled: e.target.checked } })}
          />
        </div>
        <div style={row}>
          <div>
            <div style={label}>5-minute move threshold</div>
            <div style={hint}>Alert if |Δ| ≥ this in a 5-minute window.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              min={0.25}
              max={50}
              step={0.25}
              value={prefs.crypto.fiveMinPct}
              onChange={(e) => update({ crypto: { ...prefs.crypto, fiveMinPct: Math.max(0.25, Number(e.target.value) || 2) } })}
              style={input}
            />
            <span style={{ fontSize: 12, color: '#6e6e73' }}>%</span>
          </div>
        </div>
        <div style={{ ...row, borderBottom: 'none' }}>
          <div>
            <div style={label}>1-hour move threshold</div>
            <div style={hint}>Alert if |Δ| ≥ this in a 60-minute window.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              min={0.5}
              max={100}
              step={0.5}
              value={prefs.crypto.oneHourPct}
              onChange={(e) => update({ crypto: { ...prefs.crypto, oneHourPct: Math.max(0.5, Number(e.target.value) || 5) } })}
              style={input}
            />
            <span style={{ fontSize: 12, color: '#6e6e73' }}>%</span>
          </div>
        </div>
      </div>

      <div style={section}>
        <div style={sectionTitle}>Sound</div>
        <div style={row}>
          <div>
            <div style={label}>Enable sound effects</div>
            <div style={hint}>Procedurally synthesised — baas, boings, UFO hums. Off by default.</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.sound.enabled}
            onChange={(e) => update({ sound: { ...prefs.sound, enabled: e.target.checked } })}
          />
        </div>
        <div style={{ ...row, borderBottom: 'none' }}>
          <div>
            <div style={label}>Volume</div>
            <div style={hint}>0 silent, 1 maximum.</div>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={prefs.sound.volume}
            onChange={(e) => update({ sound: { ...prefs.sound, volume: Number(e.target.value) } })}
            style={{ width: 140 }}
          />
        </div>
      </div>

      <div style={section}>
        <div style={sectionTitle}>AI personality (optional)</div>
        <div style={row}>
          <div>
            <div style={label}>Enable Claude-powered quips</div>
            <div style={hint}>Bring your own Anthropic API key. Off by default.</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.ai.enabled}
            onChange={(e) => update({ ai: { ...prefs.ai, enabled: e.target.checked } })}
          />
        </div>
        <div style={row}>
          <div>
            <div style={label}>Ambient chatter</div>
            <div style={hint}>Sheep fetches weather, HN, Wikipedia, random facts every 10–30 min.</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.ambient.enabled}
            onChange={(e) => update({ ambient: { ...prefs.ambient, enabled: e.target.checked } })}
          />
        </div>
        <div style={row}>
          <div style={label}>API key</div>
          <input
            type="password"
            placeholder="sk-ant-…"
            value={prefs.ai.apiKey}
            onChange={(e) => update({ ai: { ...prefs.ai, apiKey: e.target.value } })}
            style={textInput}
          />
        </div>
        <div style={row}>
          <div style={label}>Model</div>
          <input
            type="text"
            value={prefs.ai.model}
            onChange={(e) => update({ ai: { ...prefs.ai, model: e.target.value } })}
            style={textInput}
          />
        </div>
        <div style={{ ...row, borderBottom: 'none', flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={label}>Test the API key</div>
              <div style={hint}>Sends one message — bypasses cooldown &amp; hourly cap.</div>
            </div>
            <button
              type="button"
              onClick={runAiTest}
              disabled={aiTesting || !prefs.ai.apiKey}
              style={{
                fontSize: 12, padding: '6px 12px', borderRadius: 6,
                border: '1px solid #d1d1d6', background: aiTesting ? '#f0f0f0' : '#fff',
                cursor: aiTesting || !prefs.ai.apiKey ? 'default' : 'pointer',
              }}
            >
              {aiTesting ? 'Testing…' : 'Test'}
            </button>
          </div>
          {aiTestResult && (
            <div style={{
              fontSize: 12,
              padding: '6px 10px',
              borderRadius: 6,
              background: aiTestResult.ok ? '#e8f5e9' : '#fdecea',
              color: aiTestResult.ok ? '#1b5e20' : '#b00020',
              fontFamily: aiTestResult.ok ? 'inherit' : 'ui-monospace, monospace',
              wordBreak: 'break-word',
            }}>
              {aiTestResult.msg}
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#8e8e93', textAlign: 'center', marginTop: 8 }}>
        Changes save instantly.
      </div>
    </div>
  );
}
