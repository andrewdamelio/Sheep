import type { BrowserWindow } from 'electron';

// Ambient AI chatter. Periodically pulls a snippet from one of several free,
// no-auth public sources (weather, HN, Wikipedia, random fact), feeds the
// summary to the AI quipper, and speaks the resulting line.

type SourceKey = 'weather' | 'hn' | 'wiki' | 'fact';

export interface AmbientWatcherOptions {
  getWindow: () => BrowserWindow | null;
  enabled: () => boolean; // gated on both ambient pref AND AI enabled+keyed
  aiQuip: (summary: string) => Promise<string | null>;
}

const MIN_INTERVAL_MS = 10 * 60_000;
const MAX_INTERVAL_MS = 30 * 60_000;
const FIRST_FIRE_MS = 90_000;

function emojiFor(k: SourceKey): string {
  return k === 'weather' ? '🌤️' : k === 'hn' ? '📰' : k === 'wiki' ? '📚' : '🤓';
}

async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', ...(headers ?? {}) },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    console.warn('[ambient] fetch failed', url, err);
    return null;
  }
}

function weatherDesc(code: number): string {
  if (code === 0) return 'clear skies';
  if (code <= 3) return 'partly cloudy';
  if (code <= 48) return 'foggy';
  if (code <= 57) return 'drizzling';
  if (code <= 67) return 'raining';
  if (code <= 77) return 'snowing';
  if (code <= 82) return 'showery';
  if (code <= 86) return 'snow showers';
  if (code <= 99) return 'thunderstorms';
  return 'unusual weather';
}

async function fetchWeather(): Promise<string | null> {
  const geo = await fetchJson<{ city?: string; region?: string; latitude?: number; longitude?: number }>(
    'https://ipapi.co/json/',
  );
  if (!geo?.latitude || !geo?.longitude) return null;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`;
  const wx = await fetchJson<{ current?: { temperature_2m?: number; weather_code?: number } }>(url);
  const t = wx?.current?.temperature_2m;
  const code = wx?.current?.weather_code;
  if (typeof t !== 'number' || typeof code !== 'number') return null;
  const place = geo.city ?? geo.region ?? 'here';
  return `Weather in ${place}: ${weatherDesc(code)}, ${t.toFixed(0)}°F.`;
}

async function fetchHackerNews(): Promise<string | null> {
  const ids = await fetchJson<number[]>('https://hacker-news.firebaseio.com/v0/topstories.json');
  if (!ids?.length) return null;
  const pick = ids[Math.floor(Math.random() * Math.min(30, ids.length))];
  const item = await fetchJson<{ title?: string; score?: number; by?: string; url?: string }>(
    `https://hacker-news.firebaseio.com/v0/item/${pick}.json`,
  );
  if (!item?.title) return null;
  return `Top Hacker News story right now: "${item.title}" (${item.score ?? 0} points).`;
}

async function fetchWikipedia(): Promise<string | null> {
  const r = await fetchJson<{ title?: string; extract?: string; description?: string }>(
    'https://en.wikipedia.org/api/rest_v1/page/random/summary',
    { 'user-agent': 'ScreenMatePoo/0.1 (desktop sheep)' },
  );
  if (!r?.title) return null;
  const firstSentence = (r.extract ?? '').split(/(?<=[.!?])\s/)[0] ?? r.description ?? '';
  return `Random Wikipedia article: "${r.title}" — ${firstSentence}`.slice(0, 280);
}

async function fetchUselessFact(): Promise<string | null> {
  const r = await fetchJson<{ text?: string }>(
    'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en',
  );
  if (!r?.text) return null;
  return `A random fact from the internet: ${r.text}`;
}

async function fetchRandomSource(): Promise<{ kind: SourceKey; summary: string } | null> {
  const order: SourceKey[] = ['weather', 'hn', 'wiki', 'fact'];
  // Shuffle so a single failing source doesn't pin us to the first option forever
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const kind of order) {
    let summary: string | null = null;
    if (kind === 'weather') summary = await fetchWeather();
    else if (kind === 'hn') summary = await fetchHackerNews();
    else if (kind === 'wiki') summary = await fetchWikipedia();
    else summary = await fetchUselessFact();
    if (summary) return { kind, summary };
  }
  return null;
}

export function startAmbientWatcher(opts: AmbientWatcherOptions) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disabled = false;

  function scheduleNext(ms?: number) {
    if (disabled) return;
    const delay = ms ?? Math.floor(MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS));
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, delay);
  }

  async function fire() {
    if (disabled) return;
    if (!opts.enabled()) { scheduleNext(); return; }
    const win = opts.getWindow();
    if (!win || win.isDestroyed()) { scheduleNext(); return; }

    const src = await fetchRandomSource();
    if (!src) { scheduleNext(); return; }

    const aiText = await opts.aiQuip(src.summary);
    if (aiText) {
      try {
        win.webContents.send('smp:say', {
          text: aiText,
          emoji: emojiFor(src.kind),
          tint: 'neutral',
          durationMs: 10000,
        });
      } catch { /* window closed mid-send */ }
    }
    scheduleNext();
  }

  scheduleNext(FIRST_FIRE_MS);
  return () => { if (timer) clearTimeout(timer); disabled = true; };
}
