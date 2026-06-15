import { app, BrowserWindow, ipcMain, nativeImage, shell } from 'electron';
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
import {
  completeMicrosoftLogin,
  exchangeMicrosoftCode,
  getSession,
  logout as logoutAccount,
  microsoftOAuth,
  restoreSession,
} from './auth';

const HIDDEN_MOD_ID = 'papyrus-shield';
const DOCS_DOWNLOAD = 'https://docs.sushii.dev/papyrus-client/download';
const PREFERRED_VERSIONS = ['26.1.2', '1.21.11', '1.21.10', '1.21.8', '1.21.4', '1.21.1'];

type StoredProfile = {
  id: string;
  name: string;
  mcVersion: string;
  mods: string[];
};

let mainWindow: BrowserWindow | null = null;

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

async function acquireMicrosoftAuthCode() {
  return new Promise<string>((resolve, reject) => {
    let finished = false;

    const finish = (handler: () => void) => {
      if (finished) return;
      finished = true;
      handler();
    };

    const authWindow = new BrowserWindow({
      width: 520,
      height: 720,
      parent: mainWindow ?? undefined,
      modal: !!mainWindow,
      title: 'Sign in with Microsoft',
      icon: getAppIconPath(),
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const authUrl = new URL('https://login.live.com/oauth20_authorize.srf');
    authUrl.searchParams.set('client_id', microsoftOAuth.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', microsoftOAuth.redirectUri);
    authUrl.searchParams.set('scope', microsoftOAuth.scope);
    authUrl.searchParams.set('prompt', 'select_account');

    const handleRedirect = (url: string) => {
      if (!url.startsWith(microsoftOAuth.redirectUri)) return;

      const parsed = new URL(url);
      const error = parsed.searchParams.get('error');
      if (error) {
        finish(() => {
          authWindow.close();
          reject(new Error(parsed.searchParams.get('error_description') ?? error));
        });
        return;
      }

      const code = parsed.searchParams.get('code');
      if (!code) return;

      finish(() => {
        authWindow.close();
        resolve(code);
      });
    };

    authWindow.webContents.on('will-redirect', (_event, url) => handleRedirect(url));
    authWindow.webContents.on('will-navigate', (_event, url) => handleRedirect(url));
    authWindow.on('closed', () => {
      finish(() => reject(new Error('Microsoft sign-in was cancelled.')));
    });

    authWindow.loadURL(authUrl.toString()).catch((error: Error) => {
      finish(() => {
        authWindow.close();
        reject(error);
      });
    });
  });
}

async function loginWithMicrosoft() {
  const code = await acquireMicrosoftAuthCode();
  const msTokens = await exchangeMicrosoftCode(code);
  return completeMicrosoftLogin(getDataRoot(), msTokens);
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

function getAppIconPath() {
  const packaged = path.join(process.resourcesPath, 'icon.png');
  if (app.isPackaged && existsSync(packaged)) {
    return packaged;
  }
  return path.join(app.getAppPath(), 'build', 'icon.png');
}

function createWindow() {
  const iconPath = getAppIconPath();
  const icon = nativeImage.createFromPath(iconPath);

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    title: 'Papyrus Client',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === 'darwin' && app.dock && !icon.isEmpty()) {
    app.dock.setIcon(icon);
  }

  if (process.env.VITE_DEV_SERVER) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  await ensureDirs();
  await restoreSession(getDataRoot());
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('auth:status', () => {
  const session = getSession();
  return {
    signedIn: session != null,
    name: session?.name ?? null,
  };
});

ipcMain.handle('auth:login', async () => {
  const result = await loginWithMicrosoft();
  return { name: result.name, uuid: result.uuid };
});

ipcMain.handle('auth:logout', async () => {
  await logoutAccount(getDataRoot());
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
  const session = getSession();
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
