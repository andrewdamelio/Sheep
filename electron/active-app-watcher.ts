import type { BrowserWindow } from 'electron';

const REACTIONS: { match: RegExp; say: { text: string; emoji?: string } }[] = [
  { match: /terminal|iterm/i,              say: { text: "Hacking time!",           emoji: '🧑‍💻' } },
  { match: /xcode/i,                       say: { text: "Swift vibes.",             emoji: '🍎' } },
  { match: /vscode|visual studio|cursor/i, say: { text: "Let's ship something.",    emoji: '💻' } },
  { match: /chrome|safari|firefox|arc/i,   say: { text: "Browsing again, huh?",     emoji: '🌐' } },
  { match: /slack|discord/i,               say: { text: "Tell them I say baa.",     emoji: '💬' } },
  { match: /zoom|meet|teams|facetime/i,    say: { text: "I'll stay off-camera.",    emoji: '🎥' } },
  { match: /figma|sketch/i,                say: { text: "Pretty pixels.",           emoji: '🎨' } },
  { match: /spotify|music|podcast/i,       say: { text: "Turn it up!",              emoji: '🎧' } },
  { match: /notion|obsidian|bear/i,        say: { text: "Noted.",                   emoji: '📝' } },
  { match: /mail|outlook|spark/i,          say: { text: "Inbox zero? Doubt it.",    emoji: '✉️' } },
  { match: /calendar/i,                    say: { text: "Schedule me a nap.",       emoji: '📆' } },
  { match: /finder/i,                      say: { text: "Where ARE you going?",     emoji: '🗂️' } },
];

export interface ActiveAppWatcherOptions {
  getWindow: () => BrowserWindow | null;
  enabled: () => boolean;
  hasScreenPermission: () => boolean;
  aiQuip?: (summary: string) => Promise<string | null>;
}

interface ActiveWinShape { (): Promise<{ owner?: { name?: string; bundleId?: string }; title?: string } | undefined> }

let activeWinLoader: Promise<ActiveWinShape | null> | null = null;
async function loadActiveWin(): Promise<ActiveWinShape | null> {
  if (!activeWinLoader) {
    activeWinLoader = (async () => {
      try {
        const mod = (await import('active-win')) as unknown as { default?: ActiveWinShape } | ActiveWinShape;
        return typeof mod === 'function'
          ? (mod as ActiveWinShape)
          : ((mod as { default?: ActiveWinShape }).default ?? null);
      } catch (err) {
        console.warn('[active-app] failed to load active-win module:', err);
        return null;
      }
    })();
  }
  return activeWinLoader;
}

const FAST_MS = 3_000;
const SLOW_MS = 60_000; // back off if we lack permission

export function startActiveAppWatcher(opts: ActiveAppWatcherOptions) {
  let lastAppKey: string | null = null;
  let permissionWarned = false;
  let disabled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function poll() {
    if (disabled) return;
    if (!opts.enabled()) { schedule(FAST_MS); return; }
    if (!opts.hasScreenPermission()) {
      // Skip entirely until user grants Screen Recording — prevents active-win's
      // AppleScript fallback from triggering the Accessibility prompt on every tick.
      if (!permissionWarned) {
        permissionWarned = true;
        console.warn('[active-app] Screen Recording not granted — idle until user grants it.');
      }
      schedule(SLOW_MS);
      return;
    }
    const activeWin = await loadActiveWin();
    if (!activeWin) { disabled = true; return; }

    try {
      const w = await activeWin();
      if (!w?.owner) { schedule(FAST_MS); return; }
      const key = w.owner.bundleId ?? w.owner.name ?? '';
      if (key && key !== lastAppKey) {
        lastAppKey = key;
        const name = w.owner.name ?? '';
        const haystack = `${w.owner.bundleId ?? ''} ${name}`;
        const reaction = REACTIONS.find((r) => r.match.test(haystack));
        const title = (w.title ?? '').slice(0, 80);

        const aiText = opts.aiQuip
          ? await opts.aiQuip(`User switched to app "${name}"${title ? ` — window titled "${title}"` : ''}.`)
          : null;

        if (aiText) {
          opts.getWindow()?.webContents.send('smp:say', {
            text: aiText,
            emoji: reaction?.say.emoji,
            durationMs: 6000,
            tint: 'neutral',
          });
        } else if (reaction) {
          opts.getWindow()?.webContents.send('smp:say', {
            ...reaction.say,
            durationMs: 5000,
            tint: 'neutral',
          });
        }
      }
      schedule(FAST_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const needsPerm = /screen recording permission|screen capture/i.test(msg);
      if (needsPerm) {
        if (!permissionWarned) {
          permissionWarned = true;
          console.warn('[active-app] Screen Recording permission not granted — app awareness disabled. System Settings › Privacy & Security › Screen Recording.');
        }
        schedule(SLOW_MS);
      } else {
        if (!permissionWarned) console.warn('[active-app] poll failed:', msg);
        schedule(SLOW_MS);
      }
    }
  }

  function schedule(ms: number) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(poll, ms);
  }

  schedule(2000);
  return () => { if (timer) clearTimeout(timer); disabled = true; };
}
