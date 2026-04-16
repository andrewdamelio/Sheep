import type { BrowserWindow } from 'electron';

export interface WindowRectWatcherOptions {
  getWindow: () => BrowserWindow | null;
  enabled: () => boolean;
  hasScreenPermission: () => boolean;
  selfBundleId: string;
}

interface ActiveWinResult {
  bounds?: { x: number; y: number; width: number; height: number };
  owner?: { bundleId?: string; name?: string };
}
type ActiveWinFn = () => Promise<ActiveWinResult | undefined>;

let loader: Promise<ActiveWinFn | null> | null = null;
async function loadActiveWin(): Promise<ActiveWinFn | null> {
  if (!loader) {
    loader = (async () => {
      try {
        const mod = (await import('active-win')) as unknown as { default?: ActiveWinFn } | ActiveWinFn;
        return typeof mod === 'function'
          ? (mod as ActiveWinFn)
          : ((mod as { default?: ActiveWinFn }).default ?? null);
      } catch (err) {
        console.warn('[window-rect] failed to load active-win:', err);
        return null;
      }
    })();
  }
  return loader;
}

interface WinRect { x: number; y: number; w: number; h: number }

function rectChanged(a: WinRect | null, b: WinRect | null): boolean {
  if (!a && !b) return false;
  if (!a || !b) return true;
  return a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h;
}

const FAST_MS = 400;
const IDLE_MS = 1500;
const BACKOFF_MS = 6000;

export function startWindowRectWatcher(opts: WindowRectWatcherOptions) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disabled = false;
  let permissionWarned = false;
  let lastSent: WinRect | null = null;

  function push(overlayWin: BrowserWindow, rect: WinRect | null) {
    if (!rectChanged(lastSent, rect)) return;
    lastSent = rect;
    try { overlayWin.webContents.send('smp:window-rect', rect); } catch { /* window closed */ }
  }

  async function poll() {
    if (disabled) return;
    const overlayWin = opts.getWindow();
    if (!overlayWin || overlayWin.isDestroyed()) return schedule(IDLE_MS);
    if (!opts.enabled()) {
      push(overlayWin, null);
      return schedule(IDLE_MS);
    }
    if (!opts.hasScreenPermission()) {
      if (!permissionWarned) {
        permissionWarned = true;
        console.warn('[window-rect] Screen Recording not granted — window-walk idle.');
      }
      push(overlayWin, null);
      return schedule(BACKOFF_MS);
    }

    const activeWin = await loadActiveWin();
    if (!activeWin) { disabled = true; return; }

    try {
      const w = await activeWin();
      let rect: WinRect | null = null;
      const bundleId = w?.owner?.bundleId ?? '';
      const isSelf = bundleId === opts.selfBundleId;
      const b = w?.bounds;
      if (b && !isSelf) {
        const ob = overlayWin.getBounds();
        const local: WinRect = {
          x: Math.round(b.x - ob.x),
          y: Math.round(b.y - ob.y),
          w: Math.round(b.width),
          h: Math.round(b.height),
        };
        const offscreen = local.x + local.w < 40 || local.x > ob.width - 40
          || local.y + local.h < 40 || local.y > ob.height - 40;
        const tooSmall = local.w < 80 || local.h < 40;
        if (!offscreen && !tooSmall) rect = local;
      }
      push(overlayWin, rect);
      schedule(FAST_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const needsPerm = /screen recording|screen capture/i.test(msg);
      if (needsPerm) {
        if (!permissionWarned) {
          permissionWarned = true;
          console.warn('[window-rect] Screen Recording permission required for window-walk.');
        }
      } else if (!permissionWarned) {
        console.warn('[window-rect] poll failed:', msg);
      }
      schedule(BACKOFF_MS);
    }
  }

  function schedule(ms: number) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(poll, ms);
  }

  schedule(3000);
  return () => { if (timer) clearTimeout(timer); disabled = true; };
}
