import { safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { MicrosoftAuthenticator } from '@xmcl/user';

const MS_CLIENT_ID = '00000000402b5328';
const MS_REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';
const MS_SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL';

export type Session = {
  uuid: string;
  name: string;
  accessToken: string;
};

type MicrosoftTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type StoredAccountFile = {
  version: 1;
  encrypted: boolean;
  uuid: string;
  name: string;
  refreshToken: string;
};

let session: Session | null = null;

export function getSession() {
  return session;
}

export function clearSession() {
  session = null;
}

function getAccountPath(dataRoot: string) {
  return path.join(dataRoot, 'account.json');
}

function protectSecret(value: string) {
  if (safeStorage.isEncryptionAvailable()) {
    return { encrypted: true as const, value: safeStorage.encryptString(value).toString('base64') };
  }
  return { encrypted: false as const, value };
}

function unprotectSecret(value: string, encrypted: boolean) {
  if (encrypted) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Saved sign-in cannot be decrypted on this system.');
    }
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  }
  return value;
}

async function saveAccount(dataRoot: string, account: { uuid: string; name: string; refreshToken: string }) {
  const protectedToken = protectSecret(account.refreshToken);
  const payload: StoredAccountFile = {
    version: 1,
    encrypted: protectedToken.encrypted,
    uuid: account.uuid,
    name: account.name,
    refreshToken: protectedToken.value,
  };
  await fs.writeFile(getAccountPath(dataRoot), JSON.stringify(payload, null, 2), { mode: 0o600 });
}

async function loadAccount(dataRoot: string) {
  try {
    const raw = await fs.readFile(getAccountPath(dataRoot), 'utf8');
    const parsed = JSON.parse(raw) as StoredAccountFile;
    if (parsed.version !== 1 || !parsed.refreshToken) {
      return null;
    }
    return {
      uuid: parsed.uuid,
      name: parsed.name,
      refreshToken: unprotectSecret(parsed.refreshToken, parsed.encrypted),
    };
  } catch {
    return null;
  }
}

async function clearAccount(dataRoot: string) {
  try {
    await fs.unlink(getAccountPath(dataRoot));
  } catch {
    // no saved account
  }
}

async function requestMicrosoftTokens(body: URLSearchParams) {
  const tokenRes = await fetch('https://login.live.com/oauth20_token.srf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const token = (await tokenRes.json()) as MicrosoftTokenResponse;
  if (!token.access_token) {
    throw new Error(token.error_description ?? token.error ?? 'Microsoft token request failed.');
  }
  return token;
}

export async function exchangeMicrosoftCode(code: string) {
  return requestMicrosoftTokens(
    new URLSearchParams({
      client_id: MS_CLIENT_ID,
      code,
      redirect_uri: MS_REDIRECT_URI,
      grant_type: 'authorization_code',
      scope: MS_SCOPE,
    }),
  );
}

async function refreshMicrosoftAccessToken(refreshToken: string) {
  return requestMicrosoftTokens(
    new URLSearchParams({
      client_id: MS_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: MS_SCOPE,
    }),
  );
}

async function minecraftSessionFromMicrosoftToken(msAccessToken: string): Promise<Session> {
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

async function establishSession(dataRoot: string, msTokens: MicrosoftTokenResponse, savedRefreshToken?: string) {
  const refreshToken = msTokens.refresh_token ?? savedRefreshToken;
  if (!refreshToken) {
    throw new Error('Microsoft did not return a refresh token. Sign in again to stay signed in.');
  }

  const nextSession = await minecraftSessionFromMicrosoftToken(msTokens.access_token!);
  session = nextSession;
  await saveAccount(dataRoot, {
    uuid: nextSession.uuid,
    name: nextSession.name,
    refreshToken,
  });
  return nextSession;
}

export async function restoreSession(dataRoot: string) {
  const saved = await loadAccount(dataRoot);
  if (!saved) {
    return null;
  }

  try {
    const msTokens = await refreshMicrosoftAccessToken(saved.refreshToken);
    return await establishSession(dataRoot, msTokens, saved.refreshToken);
  } catch {
    await clearAccount(dataRoot);
    session = null;
    return null;
  }
}

export async function completeMicrosoftLogin(dataRoot: string, msTokens: MicrosoftTokenResponse) {
  return establishSession(dataRoot, msTokens);
}

export async function logout(dataRoot: string) {
  session = null;
  await clearAccount(dataRoot);
}

export const microsoftOAuth = {
  clientId: MS_CLIENT_ID,
  redirectUri: MS_REDIRECT_URI,
  scope: MS_SCOPE,
};
