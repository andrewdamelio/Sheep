import { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, powerMonitor, systemPreferences, desktopCapturer, shell } from 'electron';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { startCryptoWatcher } from './crypto-watcher';
import { startActiveAppWatcher } from './active-app-watcher';
import { startWindowRectWatcher } from './window-rect-watcher';
import { startAmbientWatcher } from './ambient-watcher';
import { getPrefs, setPrefs, onPrefsChange, type Prefs } from './prefs-store';
import { createAiQuipper } from './ai-quipper';

const SELF_BUNDLE_ID = 'com.andydrew.screenmatepoo';

function hasScreenPermission(): boolean {
  if (process.platform !== 'darwin') return true;
  try { return systemPreferences.getMediaAccessStatus('screen') === 'granted'; }
  catch { return false; }
}

// macOS only surfaces the Screen Recording prompt when the app actually tries
// to capture. Ping desktopCapturer once to trigger that prompt the first time.
let screenPromptFired = false;
async function ensureScreenPermissionPrompt(): Promise<void> {
  if (process.platform !== 'darwin') return;
  if (screenPromptFired) return;
  let status: string;
  try { status = systemPreferences.getMediaAccessStatus('screen'); }
  catch { return; }
  if (status === 'granted' || status === 'denied') return;
  screenPromptFired = true;
  try {
    await desktopCapturer.getSources({
      types: ['window'],
      fetchWindowIcons: false,
      thumbnailSize: { width: 0, height: 0 },
    });
  } catch (err) {
    console.warn('[perms] screen permission ping failed:', err);
  }
}

const isDev = process.argv.includes('--dev') || !!process.env.VITE_DEV_SERVER_URL;
const DEV_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';

let overlay: BrowserWindow | null = null;
let prefsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let sheepVisible = true;

// ── click-through plumbing ────────────────────────────────────────────────
let sheepBounds: { x: number; y: number; w: number; h: number } | null = null;
let capturing = false;
let forceCapture = false;

function overlayAlive(): boolean {
  return !!overlay && !overlay.isDestroyed();
}

function setCapture(shouldCapture: boolean) {
  if (!overlayAlive()) return;
  if (shouldCapture === capturing) return;
  capturing = shouldCapture;
  overlay!.setIgnoreMouseEvents(!shouldCapture, { forward: true });
}

function cursorOverSheep(): boolean {
  if (!sheepBounds || !overlayAlive()) return false;
  const p = screen.getCursorScreenPoint();
  const winBounds = overlay!.getBounds();
  const lx = p.x - winBounds.x;
  const ly = p.y - winBounds.y;
  return lx >= sheepBounds.x && lx <= sheepBounds.x + sheepBounds.w
      && ly >= sheepBounds.y && ly <= sheepBounds.y + sheepBounds.h;
}

function pollCursor() {
  if (!overlayAlive()) return;
  if (!sheepVisible) { setCapture(false); return; }
  if (forceCapture) { setCapture(true); return; }
  setCapture(cursorOverSheep());
}

// ── overlay window ────────────────────────────────────────────────────────
function createOverlay() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  overlay = new BrowserWindow({
    x, y, width, height,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    roundedCorners: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true, { forward: true });

  if (isDev) overlay.loadURL(DEV_URL);
  else overlay.loadFile(path.join(__dirname, '../dist/index.html'));

  overlay.once('ready-to-show', () => overlay?.show());

  const cursorTimer = setInterval(pollCursor, 50);
  overlay.on('closed', () => {
    clearInterval(cursorTimer);
    overlay = null;
  });
}

// ── prefs window ──────────────────────────────────────────────────────────
function createPrefsWindow() {
  if (prefsWindow && !prefsWindow.isDestroyed()) {
    prefsWindow.show();
    prefsWindow.focus();
    return;
  }

  prefsWindow = new BrowserWindow({
    width: 460,
    height: 560,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Screen Mate Poo — Preferences',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-prefs.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) prefsWindow.loadURL(`${DEV_URL}/prefs.html`);
  else prefsWindow.loadFile(path.join(__dirname, '../dist/prefs.html'));

  prefsWindow.once('ready-to-show', () => prefsWindow?.show());
  prefsWindow.on('closed', () => { prefsWindow = null; });
}

// ── menu bar tray ─────────────────────────────────────────────────────────
type SummonAction =
  | 'burn' | 'boing' | 'climb' | 'ufo' | 'alien' | 'blacksheep'
  | 'jump' | 'flower' | 'random' | 'sleep' | 'sit' | 'yawn' | 'roll' | 'pee'
  | 'blink' | 'yawnQuirk' | 'baa' | 'sneeze' | 'amazed' | 'blush'
  | 'spin' | 'rollMove' | 'lookDown' | 'turnAround' | 'jumpDown';

function sendToRenderer(channel: string, ...args: unknown[]) {
  if (!overlayAlive()) return;
  try { overlay!.webContents.send(channel, ...args); } catch { /* window closed mid-send */ }
}

function setSheepVisible(v: boolean) {
  sheepVisible = v;
  sendToRenderer('smp:set-visible', v);
  rebuildTrayMenu();
}

function buildTrayMenu() {
  const summon = (label: string, action: SummonAction) => ({
    label,
    click: () => sendToRenderer('smp:summon', action),
  });

  return Menu.buildFromTemplate([
    {
      label: sheepVisible ? 'Hide Sheep' : 'Show Sheep',
      click: () => setSheepVisible(!sheepVisible),
    },
    { type: 'separator' },
    {
      label: 'Summon',
      submenu: [
        summon('Random event', 'random'),
        { type: 'separator' },
        summon('Set on fire 🔥', 'burn'),
        summon('Boing!', 'boing'),
        summon('Climb screen edge', 'climb'),
        summon('UFO abduction', 'ufo'),
        summon('Alien encounter', 'alien'),
        summon('Black sheep passes', 'blacksheep'),
        { type: 'separator' },
        summon('Jump', 'jump'),
        summon('Spawn flower', 'flower'),
        summon('Sit & stare', 'sit'),
        summon('Yawn', 'yawn'),
        summon('Sleep', 'sleep'),
        summon('Roll around', 'roll'),
        summon('Pee 💦', 'pee'),
      ],
    },
    {
      label: 'Quirks',
      submenu: [
        summon('Blink', 'blink'),
        summon('Baa', 'baa'),
        summon('Yawn (sheep)', 'yawnQuirk'),
        summon('Sneeze', 'sneeze'),
        summon('Amazed ✨', 'amazed'),
        summon('Blush 💗', 'blush'),
      ],
    },
    {
      label: 'Movement',
      submenu: [
        summon('Spin', 'spin'),
        summon('Roll along ground', 'rollMove'),
        summon('Look down 👀', 'lookDown'),
        summon('Turn around', 'turnAround'),
        summon('Jump down 🦘', 'jumpDown'),
      ],
    },
    { type: 'separator' },
    { label: 'Preferences…', click: () => createPrefsWindow(), accelerator: 'Cmd+,' },
    { type: 'separator' },
    { label: 'About ScreenMatePoo', enabled: false },
    { label: 'Quit', role: 'quit' },
  ]);
}

function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('🐑');
  tray.setToolTip('Screen Mate Poo');
  rebuildTrayMenu();
}

// ── idle detection ────────────────────────────────────────────────────────
let wasIdle = false;

function pollIdle(prefs: Prefs) {
  if (!overlayAlive()) return;
  const idleSec = powerMonitor.getSystemIdleTime();
  const nowIdle = idleSec >= prefs.idleSleepSeconds;
  if (nowIdle && !wasIdle) {
    wasIdle = true;
    sendToRenderer('smp:idle-sleep');
  } else if (!nowIdle && wasIdle) {
    wasIdle = false;
    sendToRenderer('smp:idle-wake');
  }
}

// ── IPC ───────────────────────────────────────────────────────────────────
ipcMain.on('sheep-bounds', (_evt, bounds: { x: number; y: number; w: number; h: number }) => {
  sheepBounds = bounds;
});

ipcMain.on('force-capture', (_evt, force: boolean) => {
  forceCapture = force;
});

ipcMain.handle('prefs:get', () => getPrefs());
ipcMain.handle('prefs:set', (_evt, patch: Partial<Prefs>) => setPrefs(patch));

ipcMain.handle('perms:screen-status', () => {
  if (process.platform !== 'darwin') return 'granted';
  try { return systemPreferences.getMediaAccessStatus('screen'); }
  catch { return 'unknown'; }
});
ipcMain.handle('perms:request-screen', async () => {
  if (process.platform !== 'darwin') return 'granted';
  let status: string;
  try { status = systemPreferences.getMediaAccessStatus('screen'); }
  catch { return 'unknown'; }
  if (status === 'not-determined' || status === 'unknown') {
    screenPromptFired = false;
    await ensureScreenPermissionPrompt();
    try { return systemPreferences.getMediaAccessStatus('screen'); }
    catch { return 'unknown'; }
  }
  // 'denied' — macOS won't prompt again; 'granted' — nothing to do.
  // Either way, jump the user to the Screen Recording settings pane so they
  // can flip it (or verify it). This is the only remedy after first denial.
  if (status === 'denied') {
    void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  }
  return status;
});
ipcMain.on('perms:open-screen-settings', () => {
  void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
});

// When macOS has recorded a denial, the only reliable way back to a fresh prompt
// is to clear the TCC rows for this bundle via `tccutil reset` and relaunch.
// Screen Recording lives in the *system* TCC DB, so the reset must run with
// administrator privileges. osascript's `with administrator privileges` surfaces
// the standard macOS password prompt and runs the commands via sudo.
ipcMain.handle('perms:reset-and-relaunch', async () => {
  if (process.platform !== 'darwin') return { ok: false, error: 'macOS only' };
  const shellScript = [
    `/usr/bin/tccutil reset ScreenCapture ${SELF_BUNDLE_ID}`,
    `/usr/bin/tccutil reset Accessibility ${SELF_BUNDLE_ID}`,
    `/usr/bin/tccutil reset AppleEvents ${SELF_BUNDLE_ID}`,
  ].join('; ');
  const osaArg = `do shell script "${shellScript}" with administrator privileges`;
  try {
    await new Promise<void>((resolve, reject) => {
      execFile('/usr/bin/osascript', ['-e', osaArg], (err, _stdout, stderr) => {
        if (err) reject(new Error(stderr.trim() || err.message));
        else resolve();
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // User cancelling the admin prompt looks like "User canceled." — not an error to relaunch over.
    if (/canceled|cancelled/i.test(msg)) return { ok: false, error: 'Cancelled.' };
    return { ok: false, error: msg };
  }
  setTimeout(() => { app.relaunch(); app.exit(0); }, 250);
  return { ok: true };
});

let aiQuipperRef: ReturnType<typeof createAiQuipper> | null = null;
ipcMain.handle('ai:test', async () => {
  if (!aiQuipperRef) return { ok: false, error: 'AI not initialised.' };
  const result = await aiQuipperRef.quipRaw({
    trigger: 'manual',
    summary: 'This is a test from the Preferences window — say hi.',
  });
  if (result.ok) {
    sendToRenderer('smp:say', {
      text: result.text,
      emoji: '🧪',
      durationMs: 7000,
      tint: 'neutral',
    });
  }
  return result;
});

ipcMain.on('smp:open-prefs', () => createPrefsWindow());

ipcMain.on('smp:show-sheep-menu', () => {
  if (!overlayAlive()) return;
  const summonItem = (label: string, action: SummonAction) => ({
    label,
    click: () => sendToRenderer('smp:summon', action),
  });
  const menu = Menu.buildFromTemplate([
    summonItem('Jump', 'jump'),
    summonItem('Random event ✨', 'random'),
    { type: 'separator' },
    {
      label: 'Summon',
      submenu: [
        summonItem('Set on fire 🔥', 'burn'),
        summonItem('Boing!', 'boing'),
        summonItem('Climb edge', 'climb'),
        summonItem('UFO abduction', 'ufo'),
        summonItem('Alien encounter', 'alien'),
        summonItem('Black sheep', 'blacksheep'),
        summonItem('Spawn flower', 'flower'),
        summonItem('Pee 💦', 'pee'),
      ],
    },
    {
      label: 'Movement',
      submenu: [
        summonItem('Spin', 'spin'),
        summonItem('Roll', 'rollMove'),
        summonItem('Look down 👀', 'lookDown'),
        summonItem('Turn around', 'turnAround'),
        summonItem('Jump down 🦘', 'jumpDown'),
      ],
    },
    { type: 'separator' },
    { label: 'Hide Sheep', click: () => setSheepVisible(false) },
    { label: 'Preferences…', click: () => createPrefsWindow(), accelerator: 'Cmd+,' },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ]);
  menu.popup({ window: overlay! });
});

// ── app lifecycle ─────────────────────────────────────────────────────────
let idleTimer: ReturnType<typeof setInterval> | null = null;

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  createOverlay();
  createTray();

  // Kick the Screen Recording prompt on first launch so the user can grant once.
  void ensureScreenPermissionPrompt();

  idleTimer = setInterval(() => pollIdle(getPrefs()), 5000);

  const getWindow = () => overlay;
  const ai = createAiQuipper({ getPrefs });
  aiQuipperRef = ai;
  const aiQuipForTrigger = (trigger: 'active-app' | 'crypto-move' | 'ambient') => async (summary: string) =>
    ai.quip({ trigger, summary });

  startCryptoWatcher({
    getWindow,
    enabled: () => getPrefs().crypto.enabled,
    getThresholds: () => {
      const p = getPrefs();
      return { fiveMinPct: p.crypto.fiveMinPct, oneHourPct: p.crypto.oneHourPct };
    },
    aiQuip: aiQuipForTrigger('crypto-move'),
  });
  startActiveAppWatcher({
    getWindow,
    enabled: () => getPrefs().activeApp.enabled,
    hasScreenPermission,
    aiQuip: aiQuipForTrigger('active-app'),
  });
  startWindowRectWatcher({
    getWindow,
    enabled: () => getPrefs().windowWalk.enabled,
    hasScreenPermission,
    selfBundleId: SELF_BUNDLE_ID,
  });
  startAmbientWatcher({
    getWindow,
    enabled: () => {
      const p = getPrefs();
      return p.ambient.enabled && p.ai.enabled && !!p.ai.apiKey;
    },
    aiQuip: aiQuipForTrigger('ambient'),
  });

  // Broadcast pref changes to the overlay so renderer-side features (e.g., sheep speed) can react.
  onPrefsChange((prefs) => {
    sendToRenderer('smp:prefs-changed', prefs);
    // If user just turned on a Screen-Recording-dependent feature, surface the prompt.
    if (prefs.activeApp.enabled || prefs.windowWalk.enabled) void ensureScreenPermissionPrompt();
  });
  // Push initial prefs to overlay once it's ready so sheepSpeed etc. are applied on launch.
  overlay?.webContents.once('did-finish-load', () => sendToRenderer('smp:prefs-changed', getPrefs()));

  // Welcome bubble so the user immediately sees SpeechBubble working
  setTimeout(() => {
    overlay?.webContents.send('smp:say', {
      text: "baa — I'm back, and I live on your desktop now.",
      emoji: '🐑',
      tint: 'neutral',
      durationMs: 7000,
    });
  }, 2500);
});

app.on('before-quit', () => {
  if (idleTimer) { clearInterval(idleTimer); idleTimer = null; }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
