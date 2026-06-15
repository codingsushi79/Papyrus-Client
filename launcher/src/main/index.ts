import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Auth, LauncherProfile, Version } from '@xmcl/core';
import { installFabric, installVersion, getVersionList } from '@xmcl/installer';
import { launch } from '@xmcl/launch';
import { MicrosoftAuthenticator } from '@xmcl/user';

const HIDDEN_MOD_ID = 'papyrus-shield';
const DOCS_DOWNLOAD = 'https://docs.sushii.dev/papyrus-client/download';
const PREFERRED_VERSIONS = ['26.1.2', '1.21.11', '1.21.10', '1.21.8', '1.21.4', '1.21.1'];

type StoredProfile = {
  id: string;
  name: string;
  mcVersion: string;
  mods: string[];
};

type Session = {
  uuid: string;
  name: string;
  accessToken: string;
  userType: string;
};

let mainWindow: BrowserWindow | null = null;
let auth: Auth | null = null;
let session: Session | null = null;

function getDataRoot() {
  return path.join(app.getPath('userData'), 'papyrus-client');
}

function getProfilesPath() {
  return path.join(getDataRoot(), 'profiles.json');
}

async function ensureDirs() {
  await fs.mkdir(path.join(getDataRoot(), 'instances'), { recursive: true });
  await fs.mkdir(path.join(getDataRoot(), 'mods'), { recursive: true });
}

async function loadProfiles(): Promise<StoredProfile[]> {
  try {
    const raw = await fs.readFile(getProfilesPath(), 'utf8');
    return JSON.parse(raw) as StoredProfile[];
  } catch {
    return [];
  }
}

async function saveProfiles(profiles: StoredProfile[]) {
  await fs.writeFile(getProfilesPath(), JSON.stringify(profiles, null, 2));
}

function bundledModPath(mcVersion: string) {
  const resourceRoot = process.resourcesPath;
  const bundled = path.join(resourceRoot, 'bundled-mods');
  if (!existsSync(bundled)) {
    return null;
  }
  const files = require('node:fs').readdirSync(bundled) as string[];
  const versioned = files.find((f) => f.startsWith(`papyrus-shield-${mcVersion}-`) && f.endsWith('.jar'));
  if (versioned) {
    return path.join(bundled, versioned);
  }
  const fallback = files.find((f) => f.startsWith('papyrus-shield') && f.endsWith('.jar'));
  return fallback ? path.join(bundled, fallback) : null;
}

async function installHiddenMod(instanceRoot: string, mcVersion: string) {
  const modsDir = path.join(instanceRoot, 'mods');
  await fs.mkdir(modsDir, { recursive: true });
  const src = bundledModPath(mcVersion);
  if (!src) {
    console.warn('[papyrus-client] bundled mod missing — build mod before packaging launcher');
    return;
  }
  const dest = path.join(modsDir, path.basename(src));
  await fs.copyFile(src, dest);
}

async function prepareInstance(profile: StoredProfile) {
  const instanceRoot = path.join(getDataRoot(), 'instances', profile.id);
  await fs.mkdir(instanceRoot, { recursive: true });

  const versionId = `papyrus-fabric-${profile.mcVersion}`;
  const versionList = await getVersionList();
  await installVersion(profile.mcVersion, { minecraft: versionList, root: instanceRoot });
  await installFabric({ minecraft: versionList, version: profile.mcVersion, loader: 'latest' }, instanceRoot);

  await installHiddenMod(instanceRoot, profile.mcVersion);

  const modsDir = path.join(instanceRoot, 'mods');
  for (const modFile of profile.mods) {
    const src = path.join(getDataRoot(), 'mods', modFile);
    if (existsSync(src)) {
      await fs.copyFile(src, path.join(modsDir, modFile));
    }
  }

  return { instanceRoot, versionId: `fabric-loader-${profile.mcVersion}` };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    title: 'Papyrus Client',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  await ensureDirs();
  auth = new Auth(getDataRoot());
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('auth:status', () => ({
  signedIn: session != null,
  name: session?.name ?? null,
}));

ipcMain.handle('auth:login', async () => {
  if (!auth) throw new Error('Auth not ready');
  const authenticator = new MicrosoftAuthenticator();
  const result = await authenticator.authenticate(auth, (url) => {
    shell.openExternal(url);
  });
  session = {
    uuid: result.uuid,
    name: result.name,
    accessToken: result.accessToken,
    userType: result.userType,
  };
  return { name: result.name, uuid: result.uuid };
});

ipcMain.handle('auth:logout', async () => {
  session = null;
  return { ok: true };
});

ipcMain.handle('versions:list', async () => {
  const list = await getVersionList();
  const releases = list.versions.filter((v) => v.type === 'release').map((v) => v.id);
  const merged = [...PREFERRED_VERSIONS];
  for (const id of releases) {
    if (!merged.includes(id)) merged.push(id);
  }
  return merged.slice(0, 60);
});

ipcMain.handle('profiles:list', async () => {
  const profiles = await loadProfiles();
  return profiles.map((p) => ({
    ...p,
    mods: p.mods.filter((m) => !m.includes(HIDDEN_MOD_ID)),
  }));
});

ipcMain.handle('profiles:save', async (_e, profile: StoredProfile) => {
  const profiles = await loadProfiles();
  const idx = profiles.findIndex((p) => p.id === profile.id);
  const cleanMods = profile.mods.filter((m) => !m.includes(HIDDEN_MOD_ID));
  const next = { ...profile, mods: cleanMods };
  if (idx >= 0) profiles[idx] = next;
  else profiles.push(next);
  await saveProfiles(profiles);
  return next;
});

ipcMain.handle('mods:listUser', async () => {
  const dir = path.join(getDataRoot(), 'mods');
  const files = await fs.readdir(dir);
  return files.filter((f) => f.endsWith('.jar') && !f.includes(HIDDEN_MOD_ID));
});

ipcMain.handle('launch:start', async (_e, profileId: string) => {
  if (!session) {
    throw new Error('Sign in with Microsoft before launching.');
  }
  const profiles = await loadProfiles();
  const profile = profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error('Profile not found');

  const { instanceRoot, versionId } = await prepareInstance(profile);

  const proc = await launch({
    gamePath: instanceRoot,
    javaPath: 'java',
    version: versionId,
    gameProfile: {
      id: session.uuid,
      name: session.name,
    },
    accessToken: session.accessToken,
    userType: session.userType,
    extraExecOption: {
      detached: false,
    },
  });

  proc.on('exit', (code) => {
    mainWindow?.webContents.send('launch:exit', code);
  });

  return { ok: true };
});

ipcMain.handle('shell:openDocs', () => {
  shell.openExternal(DOCS_DOWNLOAD);
});
