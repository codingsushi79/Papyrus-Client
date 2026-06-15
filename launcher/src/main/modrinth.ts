import fs from 'node:fs/promises';

const MODRINTH_API = 'https://api.modrinth.com/v2';
const USER_AGENT = 'Papyrus-Client/1.0.0 (github.com/codingsushi79/Papyrus-Client)';

export type ModrinthSearchHit = {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  iconUrl: string | null;
  downloads: number;
};

export type ModrinthInstallVersion = {
  versionId: string;
  versionNumber: string;
  filename: string;
  url: string;
};

async function modrinthFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${MODRINTH_API}${path}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Modrinth request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function searchModrinth(query: string, limit = 20): Promise<ModrinthSearchHit[]> {
  const facets = JSON.stringify([['project_type:mod'], ['categories:fabric']]);
  const params = new URLSearchParams({
    query: query.trim(),
    facets,
    limit: String(limit),
  });
  const data = await modrinthFetch<{ hits: Array<Record<string, unknown>> }>(`/search?${params}`);
  return data.hits.map((hit) => ({
    projectId: String(hit.project_id),
    slug: String(hit.slug),
    title: String(hit.title),
    description: String(hit.description),
    iconUrl: hit.icon_url ? String(hit.icon_url) : null,
    downloads: Number(hit.downloads) || 0,
  }));
}

export async function getModrinthVersion(
  projectId: string,
  mcVersion: string,
): Promise<ModrinthInstallVersion | null> {
  const params = new URLSearchParams({
    game_versions: JSON.stringify([mcVersion]),
    loaders: JSON.stringify(['fabric']),
  });
  const versions = await modrinthFetch<Array<Record<string, unknown>>>(
    `/project/${projectId}/version?${params}`,
  );
  if (!versions.length) {
    return null;
  }

  const version =
    versions.find((entry) => entry.version_type === 'release') ?? versions[0];
  const files = version.files as Array<Record<string, unknown>>;
  const file = files.find((entry) => entry.primary) ?? files[0];
  if (!file?.url || !file.filename) {
    return null;
  }

  return {
    versionId: String(version.id),
    versionNumber: String(version.version_number),
    filename: String(file.filename),
    url: String(file.url),
  };
}

export async function downloadModFile(url: string, destPath: string) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Mod download failed (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buf);
}
