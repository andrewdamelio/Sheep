import { contextBridge, ipcRenderer } from 'electron';

const api = {
  reportSheepBounds: (bounds: { x: number; y: number; w: number; h: number }) =>
    ipcRenderer.send('sheep-bounds', bounds),
  forceCapture: (force: boolean) => ipcRenderer.send('force-capture', force),
  openPrefs: () => ipcRenderer.send('smp:open-prefs'),
  showSheepMenu: () => ipcRenderer.send('smp:show-sheep-menu'),
  on: (channel: string, handler: (...args: unknown[]) => void) => {
    const listener = (_evt: Electron.IpcRendererEvent, ...args: unknown[]) => handler(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld('smp', api);

export type SmpApi = typeof api;
