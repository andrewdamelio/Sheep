import { contextBridge, ipcRenderer } from 'electron';

const api = {
  get: () => ipcRenderer.invoke('prefs:get'),
  set: (patch: unknown) => ipcRenderer.invoke('prefs:set', patch),
  testAi: () => ipcRenderer.invoke('ai:test') as Promise<{ ok: boolean; text?: string; error?: string }>,
  getScreenStatus: () => ipcRenderer.invoke('perms:screen-status') as Promise<string>,
  requestScreen: () => ipcRenderer.invoke('perms:request-screen') as Promise<string>,
  openScreenSettings: () => ipcRenderer.send('perms:open-screen-settings'),
  resetAndRelaunch: () => ipcRenderer.invoke('perms:reset-and-relaunch') as Promise<{ ok: boolean; error?: string }>,
};

contextBridge.exposeInMainWorld('smpPrefs', api);

export type SmpPrefsApi = typeof api;
