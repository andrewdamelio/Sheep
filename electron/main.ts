import { app, BrowserWindow, screen, ipcMain } from 'electron';
import path from 'node:path';

const isDev = process.argv.includes('--dev') || !!process.env.VITE_DEV_SERVER_URL;
const DEV_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';

let overlay: BrowserWindow | null = null;

// Current sheep bounds as reported by renderer (in screen coordinates, since the overlay
// spans display.bounds starting at its origin).
let sheepBounds: { x: number; y: number; w: number; h: number } | null = null;
let capturing = false; // whether we're currently accepting mouse events
let forceCapture = false; // set true during drags / menus / drops

function setCapture(shouldCapture: boolean) {
  if (!overlay) return;
  if (shouldCapture === capturing) return;
  capturing = shouldCapture;
  overlay.setIgnoreMouseEvents(!shouldCapture, { forward: true });
}

function cursorOverSheep(): boolean {
  if (!sheepBounds || !overlay) return false;
  const p = screen.getCursorScreenPoint();
  const winBounds = overlay.getBounds();
  const lx = p.x - winBounds.x;
  const ly = p.y - winBounds.y;
  return lx >= sheepBounds.x && lx <= sheepBounds.x + sheepBounds.w
      && ly >= sheepBounds.y && ly <= sheepBounds.y + sheepBounds.h;
}

function pollCursor() {
  if (forceCapture) {
    setCapture(true);
    return;
  }
  setCapture(cursorOverSheep());
}

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

  if (isDev) {
    overlay.loadURL(DEV_URL);
  } else {
    overlay.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  overlay.once('ready-to-show', () => overlay?.show());

  // Poll cursor ~20 times/sec to keep click-through toggle responsive
  setInterval(pollCursor, 50);
}

ipcMain.on('sheep-bounds', (_evt, bounds: { x: number; y: number; w: number; h: number }) => {
  sheepBounds = bounds;
});

ipcMain.on('force-capture', (_evt, force: boolean) => {
  forceCapture = force;
});

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  createOverlay();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
