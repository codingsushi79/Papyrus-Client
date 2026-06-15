import { contextBridge, ipcRenderer } from 'electron';

export type ModrinthSearchHit = {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  iconUrl: string | null;
  downloads: number;
};

contextBridge.exposeInMainWorld('papyrus', {
  authStatus: () => ipcRenderer.invoke('auth:status'),
  authLogin: () => ipcRenderer.invoke('auth:login'),
  authLogout: () => ipcRenderer.invoke('auth:logout'),
  listVersions: () => ipcRenderer.invoke('versions:list'),
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  saveProfile: (profile: unknown) => ipcRenderer.invoke('profiles:save', profile),
  deleteProfile: (profileId: string) => ipcRenderer.invoke('profiles:delete', profileId),
  listUserMods: () => ipcRenderer.invoke('mods:listUser'),
  openModsFolder: () => ipcRenderer.invoke('mods:openFolder'),
  removeModFromProfile: (profileId: string, filename: string) =>
    ipcRenderer.invoke('mods:removeFromProfile', profileId, filename),
  searchModrinth: (query: string) => ipcRenderer.invoke('modrinth:search', query),
  installModrinthMod: (profileId: string, projectId: string) =>
    ipcRenderer.invoke('modrinth:install', profileId, projectId),
  launch: (profileId: string) => ipcRenderer.invoke('launch:start', profileId),
  openDocs: () => ipcRenderer.invoke('shell:openDocs'),
  onLaunchExit: (cb: (code: number) => void) => {
    ipcRenderer.on('launch:exit', (_e, code) => cb(code));
  },
});

declare global {
  interface Window {
    papyrus: {
      authStatus: () => Promise<{ signedIn: boolean; name: string | null }>;
      authLogin: () => Promise<{ name: string; uuid: string }>;
      authLogout: () => Promise<{ ok: boolean }>;
      listVersions: () => Promise<string[]>;
      listProfiles: () => Promise<Array<{ id: string; name: string; mcVersion: string; mods: string[] }>>;
      saveProfile: (profile: { id: string; name: string; mcVersion: string; mods: string[] }) => Promise<unknown>;
      deleteProfile: (profileId: string) => Promise<{ ok: boolean }>;
      listUserMods: () => Promise<string[]>;
      openModsFolder: () => Promise<void>;
      removeModFromProfile: (profileId: string, filename: string) => Promise<string[]>;
      searchModrinth: (query: string) => Promise<ModrinthSearchHit[]>;
      installModrinthMod: (
        profileId: string,
        projectId: string,
      ) => Promise<{ filename: string; versionNumber: string }>;
      launch: (profileId: string) => Promise<{ ok: boolean }>;
      openDocs: () => Promise<void>;
      onLaunchExit: (cb: (code: number) => void) => void;
    };
  }
}
