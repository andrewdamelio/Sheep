import type { BrowserWindow } from 'electron';

// CoinGecko simple-price endpoint (free, no key required; ~30 calls/min limit on free tier)
const API = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true';

const COINS = [
  { id: 'bitcoin' as const, symbol: 'BTC', emoji: '₿' },
  { id: 'ethereum' as const, symbol: 'ETH', emoji: 'Ξ' },
];

interface PriceSnapshot { ts: number; price: number }

const POLL_MS = 60_000;
const HISTORY_MAX = 90; // 90 minutes of 1-min samples
const COOLDOWN_MS = 10 * 60_000; // 10 min between alerts for the same coin

export interface CryptoThresholds {
  fiveMinPct: number; // percent (e.g. 2 = 2%)
  oneHourPct: number;
}

const DEFAULT_THRESHOLDS: CryptoThresholds = { fiveMinPct: 2, oneHourPct: 5 };

export interface CryptoWatcherOptions {
  getWindow: () => BrowserWindow | null;
  getThresholds?: () => CryptoThresholds;
  enabled?: () => boolean;
  aiQuip?: (summary: string) => Promise<string | null>;
}

export function startCryptoWatcher(opts: CryptoWatcherOptions) {
  const getThresholds = opts.getThresholds ?? (() => DEFAULT_THRESHOLDS);
  const isEnabled = opts.enabled ?? (() => true);
  const history: Record<string, PriceSnapshot[]> = { bitcoin: [], ethereum: [] };
  const lastAlertAt: Record<string, number> = { bitcoin: 0, ethereum: 0 };

  async function poll() {
    if (!isEnabled()) return;
    const thresholds = getThresholds();
    try {
      const res = await fetch(API, { headers: { 'accept': 'application/json' } });
      if (!res.ok) return;
      const json = (await res.json()) as Record<string, { usd: number }>;
      const now = Date.now();

      for (const c of COINS) {
        const price = json[c.id]?.usd;
        if (!Number.isFinite(price)) continue;

        const h = history[c.id];
        h.push({ ts: now, price });
        while (h.length > HISTORY_MAX) h.shift();

        const windowMins = [5, 60] as const;
        for (const mins of windowMins) {
          const cutoff = now - mins * 60_000;
          const old = h.find((s) => s.ts <= cutoff);
          if (!old) continue;
          const deltaPct = ((price - old.price) / old.price) * 100;
          const thresh = mins === 5 ? thresholds.fiveMinPct : thresholds.oneHourPct;
          if (Math.abs(deltaPct) < thresh) continue;
          if (now - lastAlertAt[c.id] < COOLDOWN_MS) continue;

          lastAlertAt[c.id] = now;
          const up = deltaPct > 0;
          const arrow = up ? '▲' : '▼';
          const emoji = up ? '🚀' : '📉';
          const pctStr = Math.abs(deltaPct).toFixed(1);
          const priceStr = `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
          const baseText = `${c.symbol} ${arrow} ${pctStr}% in ${mins}m — ${priceStr}`;

          const aiText = opts.aiQuip
            ? await opts.aiQuip(`${c.symbol} moved ${up ? 'up' : 'down'} ${pctStr}% over ${mins} minutes to ${priceStr}.`)
            : null;

          const win = opts.getWindow();
          win?.webContents.send('smp:say', {
            text: aiText ? `${baseText} — ${aiText}` : baseText,
            emoji,
            tint: up ? 'green' : 'red',
            durationMs: aiText ? 10000 : 8000,
          });
          win?.webContents.send('smp:play-sfx', up ? 'cryptoUp' : 'cryptoDown');
          break; // only the strongest signal per coin per poll
        }
      }
    } catch (err) {
      console.warn('[crypto-watcher] poll failed:', err);
    }
  }

  // Kick off with a slight delay so the app finishes booting first
  setTimeout(poll, 4000);
  const handle = setInterval(poll, POLL_MS);
  return () => clearInterval(handle);
}
