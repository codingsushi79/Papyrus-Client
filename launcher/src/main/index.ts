import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { launch } from '@xmcl/core';
import {
  getLoaderArtifactListFor,
  getVersionList,
  install,
  installFabric,
} from '@xmcl/installer';
import { MicrosoftAuthenticator } from '@xmcl/user';

const HIDDEN_MOD_ID = 'papyrus-shield';
const DOCS_DOWNLOAD = 'https://docs.sushii.dev/papyrus-client/download';
const PREFERRED_VERSIONS = ['26.1.2', '1.21.11', '1.21.10', '1.21.8', '1.21.4', '1.21.1'];
const MS_CLIENT_ID = '00000000402b5328';
const MS_SCOPE = 'XboxLive.signin offline_access';

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
};

let mainWindow: BrowserWindow | null = null;
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
  const files = readdirSync(bundled) as string[];
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

async function acquireMicrosoftAccessToken() {
  const deviceRes = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: MS_CLIENT_ID, scope: MS_SCOPE }),
  });
  const device = (await deviceRes.json()) as {
    user_code: string;
    device_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
    error?: string;
    error_description?: string;
  };
  if (device.error) {
    throw new Error(device.error_description ?? device.error);
  }

  await shell.openExternal(device.verification_uri);
  const dialogOptions = {
    type: 'info' as const,
    title: 'Microsoft Sign In',
    message: 'Sign in in your browser',
    detail: `If prompted, enter this code: ${device.user_code}`,
    buttons: ['Continue'],
  };
  if (mainWindow) {
    await dialog.showMessageBox(mainWindow, dialogOptions);
  } else {
    await dialog.showMessageBox(dialogOptions);
  }

  const deadline = Date.now() + device.expires_in * 1000;
  const interval = (device.interval ?? 5) * 1000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    const tokenRes = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: MS_CLIENT_ID,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: device.device_code,
      }),
    });
    const token = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (token.access_token) {
      return token.access_token;
    }
    if (token.error && token.error !== 'authorization_pending') {
      throw new Error(token.error_description ?? token.error);
    }
  }

  throw new Error('Microsoft sign-in timed out');
}

async function loginWithMicrosoft() {
  const msAccessToken = await acquireMicrosoftAccessToken();
  const authenticator = new MicrosoftAuthenticator({});
  const { minecraftXstsResponse } = await authenticator.acquireXBoxToken(msAccessToken);
  const mcResponse = await authenticator.loginMinecraftWithXBox(
    minecraftXstsResponse.DisplayClaims.xui[0].uhs,
    minecraftXstsResponse.Token,
  );

  const profileRes = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${mcResponse.access_token}` },
  });
  if (!profileRes.ok) {
    throw new Error('This Microsoft account does not own Minecraft Java Edition.');
  }
  const profile = (await profileRes.json()) as { id: string; name: string };

  return {
    uuid: profile.id,
    name: profile.name,
    accessToken: mcResponse.access_token,
  };
}

async function prepareInstance(profile: StoredProfile) {
  const instanceRoot = path.join(getDataRoot(), 'instances', profile.id);
  await fs.mkdir(instanceRoot, { recursive: true });

  const versionList = await getVersionList();
  const versionMeta = versionList.versions.find((v) => v.id === profile.mcVersion);
  if (!versionMeta) {
    throw new Error(`Unknown Minecraft version: ${profile.mcVersion}`);
  }

  await install(versionMeta, instanceRoot);

  const loaderArtifacts = await getLoaderArtifactListFor(profile.mcVersion);
  const loaderArtifact =
    [...loaderArtifacts].reverse().find((artifact) => artifact.loader.stable) ??
    loaderArtifacts[loaderArtifacts.length - 1];
  if (!loaderArtifact) {
    throw new Error(`No Fabric loader available for ${profile.mcVersion}`);
  }

  const fabricVersionId = await installFabric({
    minecraftVersion: profile.mcVersion,
    version: loaderArtifact.loader.version,
    minecraft: instanceRoot,
  });

  await installHiddenMod(instanceRoot, profile.mcVersion);

  const modsDir = path.join(instanceRoot, 'mods');
  for (const modFile of profile.mods) {
    const src = path.join(getDataRoot(), 'mods', modFile);
    if (existsSync(src)) {
      await fs.copyFile(src, path.join(modsDir, modFile));
    }
  }

  return { instanceRoot, versionId: fabricVersionId };
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
  const result = await loginWithMicrosoft();
  session = result;
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
    extraExecOption: {
      detached: false,
    },
  });

  proc.on('exit', (code: number | null) => {
    mainWindow?.webContents.send('launch:exit', code);
  });

  return { ok: true };
});

ipcMain.handle('shell:openDocs', () => {
  shell.openExternal(DOCS_DOWNLOAD);
});
