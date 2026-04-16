import Store from 'electron-store';

export interface Prefs {
  idleSleepSeconds: number;
  sheepSpeed: number;
  crypto: {
    enabled: boolean;
    fiveMinPct: number;
    oneHourPct: number;
  };
  activeApp: {
    enabled: boolean;
  };
  windowWalk: {
    enabled: boolean;
  };
  ambient: {
    enabled: boolean;
  };
  ai: {
    enabled: boolean;
    apiKey: string;
    model: string;
  };
  sound: {
    enabled: boolean;
    volume: number; // 0 to 1
  };
}

export const DEFAULT_PREFS: Prefs = {
  idleSleepSeconds: 180,
  sheepSpeed: 1.0,
  crypto: { enabled: true, fiveMinPct: 2, oneHourPct: 5 },
  activeApp: { enabled: true },
  windowWalk: { enabled: false },
  ambient: { enabled: true },
  ai: { enabled: false, apiKey: '', model: 'claude-haiku-4-5-20251001' },
  sound: { enabled: false, volume: 0.5 },
};

type Listener = (prefs: Prefs) => void;

const store = new Store<Prefs>({
  name: 'prefs',
  defaults: DEFAULT_PREFS,
});

const listeners = new Set<Listener>();

function deepMerge<T>(base: T, patch: Partial<T>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const prev = out[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && prev && typeof prev === 'object') {
      out[k] = deepMerge(prev as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

export function getPrefs(): Prefs {
  return deepMerge(DEFAULT_PREFS, store.store);
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  const merged = deepMerge(getPrefs(), patch);
  store.store = merged;
  for (const fn of listeners) {
    try { fn(merged); } catch (err) { console.warn('[prefs] listener threw:', err); }
  }
  return merged;
}

export function onPrefsChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
