import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('papyrus', {
  authStatus: () => ipcRenderer.invoke('auth:status'),
  authLogin: () => ipcRenderer.invoke('auth:login'),
  authLogout: () => ipcRenderer.invoke('auth:logout'),
  listVersions: () => ipcRenderer.invoke('versions:list'),
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  saveProfile: (profile: unknown) => ipcRenderer.invoke('profiles:save', profile),
  listUserMods: () => ipcRenderer.invoke('mods:listUser'),
  launch: (profileId: string) => ipcRenderer.invoke('launch:start', profileId),
  openDocs: () => ipcRenderer.invoke('shell:openDocs'),
  onLaunchExit: (cb: (code: number) => void) => {
    ipcRenderer.on('launch:exit', (_e, code) => cb(code));
  },
});

export type PapyrusApi = typeof window.papyrus;

declare global {
  interface Window {
    papyrus: {
      authStatus: () => Promise<{ signedIn: boolean; name: string | null }>;
      authLogin: () => Promise<{ name: string; uuid: string }>;
      authLogout: () => Promise<{ ok: boolean }>;
      listVersions: () => Promise<string[]>;
      listProfiles: () => Promise<Array<{ id: string; name: string; mcVersion: string; mods: string[] }>>;
      saveProfile: (profile: { id: string; name: string; mcVersion: string; mods: string[] }) => Promise<unknown>;
      listUserMods: () => Promise<string[]>;
      launch: (profileId: string) => Promise<{ ok: boolean }>;
      openDocs: () => Promise<void>;
      onLaunchExit: (cb: (code: number) => void) => void;
    };
  }
}
