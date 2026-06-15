import React, { useEffect, useMemo, useState } from 'react';
import logo from './assets/papyrus.png';

type Profile = { id: string; name: string; mcVersion: string; mods: string[] };
type ModrinthHit = {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  iconUrl: string | null;
  downloads: number;
};

type InstanceTab = 'version' | 'mods';

function formatDownloads(count: number) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

export default function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [versions, setVersions] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userMods, setUserMods] = useState<string[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [status, setStatus] = useState('Sign in with Microsoft to play.');
  const [newProfileName, setNewProfileName] = useState('Survival');
  const [newMcVersion, setNewMcVersion] = useState('26.1.2');
  const [showCreateInstance, setShowCreateInstance] = useState(false);
  const [activeTab, setActiveTab] = useState<InstanceTab>('version');
  const [modQuery, setModQuery] = useState('');
  const [modResults, setModResults] = useState<ModrinthHit[]>([]);
  const [modSearchBusy, setModSearchBusy] = useState(false);
  const [installingProjectId, setInstallingProjectId] = useState<string | null>(null);

  const activeInstance = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfile) ?? null,
    [profiles, selectedProfile],
  );

  async function refresh() {
    const auth = await window.papyrus.authStatus();
    setSignedIn(auth.signedIn);
    setPlayerName(auth.name);
    setVersions(await window.papyrus.listVersions());
    const nextProfiles = await window.papyrus.listProfiles();
    setProfiles(nextProfiles);
    setUserMods(await window.papyrus.listUserMods());
    if (selectedProfile && !nextProfiles.some((profile) => profile.id === selectedProfile)) {
      setSelectedProfile(nextProfiles[0]?.id ?? '');
    } else if (!selectedProfile && nextProfiles.length > 0) {
      setSelectedProfile(nextProfiles[0].id);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleLogin() {
    setStatus('Opening Microsoft sign-in…');
    try {
      const result = await window.papyrus.authLogin();
      setStatus(`Signed in as ${result.name}`);
      await refresh();
    } catch (e) {
      setStatus(`Login failed: ${(e as Error).message}`);
    }
  }

  async function createInstance() {
    const id = crypto.randomUUID();
    await window.papyrus.saveProfile({
      id,
      name: newProfileName,
      mcVersion: newMcVersion,
      mods: [],
    });
    setSelectedProfile(id);
    setShowCreateInstance(false);
    await refresh();
    setStatus(`Created instance ${newProfileName}`);
  }

  async function handleLaunch() {
    if (!signedIn) {
      setStatus('Microsoft sign-in is required before launching.');
      return;
    }
    if (!selectedProfile) {
      setStatus('Select or create an instance first.');
      return;
    }
    setStatus('Installing Fabric and launching…');
    try {
      await window.papyrus.launch(selectedProfile);
      setStatus('Minecraft launched.');
    } catch (e) {
      setStatus(`Launch failed: ${(e as Error).message}`);
    }
  }

  async function handleModSearch() {
    if (!modQuery.trim()) {
      setModResults([]);
      return;
    }
    setModSearchBusy(true);
    setStatus('Searching Modrinth…');
    try {
      const hits = await window.papyrus.searchModrinth(modQuery);
      setModResults(hits);
      setStatus(hits.length ? `Found ${hits.length} Fabric mods.` : 'No Fabric mods matched that search.');
    } catch (e) {
      setStatus(`Mod search failed: ${(e as Error).message}`);
    } finally {
      setModSearchBusy(false);
    }
  }

  async function handleInstallMod(projectId: string, title: string) {
    if (!activeInstance) {
      setStatus('Select an instance before installing mods.');
      return;
    }
    setInstallingProjectId(projectId);
    setStatus(`Installing ${title} for Minecraft ${activeInstance.mcVersion}…`);
    try {
      const result = await window.papyrus.installModrinthMod(activeInstance.id, projectId);
      await refresh();
      setStatus(`Installed ${title} ${result.versionNumber}.`);
    } catch (e) {
      setStatus(`Install failed: ${(e as Error).message}`);
    } finally {
      setInstallingProjectId(null);
    }
  }

  async function handleRemoveMod(filename: string) {
    if (!activeInstance) return;
    await window.papyrus.removeModFromProfile(activeInstance.id, filename);
    await refresh();
    setStatus(`Removed ${filename} from ${activeInstance.name}.`);
  }

  async function handleDeleteInstance() {
    if (!activeInstance) return;
    const name = activeInstance.name;
    if (!confirm(`Delete instance "${name}"? Its game files will be removed and this cannot be undone.`)) {
      return;
    }
    const deletedId = activeInstance.id;
    const nextSelection = profiles.find((profile) => profile.id !== deletedId)?.id ?? '';
    await window.papyrus.deleteProfile(deletedId);
    setSelectedProfile(nextSelection);
    await refresh();
    setStatus(`Deleted instance ${name}.`);
  }

  return (
    <div className="prism-shell">
      <aside className="instance-sidebar">
        <div className="sidebar-brand">
          <img src={logo} alt="" className="sidebar-logo" />
          <div>
            <strong>Papyrus Client</strong>
            <span>Fabric only</span>
          </div>
        </div>

        <div className="instance-list">
          {profiles.map((instance) => (
            <button
              key={instance.id}
              type="button"
              className={`instance-item ${selectedProfile === instance.id ? 'selected' : ''}`}
              onClick={() => setSelectedProfile(instance.id)}
            >
              <span className="instance-icon">{instance.name.slice(0, 1).toUpperCase()}</span>
              <span className="instance-meta">
                <span className="instance-name">{instance.name}</span>
                <span className="instance-version">{instance.mcVersion}</span>
              </span>
            </button>
          ))}
        </div>

        <button type="button" className="add-instance" onClick={() => setShowCreateInstance((open) => !open)}>
          + New instance
        </button>

        {showCreateInstance && (
          <div className="create-instance-panel">
            <input
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              placeholder="Instance name"
            />
            <select value={newMcVersion} onChange={(e) => setNewMcVersion(e.target.value)}>
              {versions.map((version) => (
                <option key={version} value={version}>{version}</option>
              ))}
            </select>
            <button type="button" className="primary" onClick={createInstance}>Create</button>
          </div>
        )}

        <div className="sidebar-footer">
          {signedIn ? (
            <>
              <span className="account-name">{playerName}</span>
              <button type="button" onClick={() => window.papyrus.authLogout().then(refresh)}>Sign out</button>
            </>
          ) : (
            <button type="button" className="primary" onClick={handleLogin}>Sign in</button>
          )}
        </div>
      </aside>

      <section className="instance-workspace">
        {activeInstance ? (
          <>
            <header className="workspace-header">
              <div>
                <h1>{activeInstance.name}</h1>
                <p>Minecraft {activeInstance.mcVersion} · Fabric · {activeInstance.mods.length} mods</p>
              </div>
              <div className="workspace-actions">
                <button type="button" className="delete-instance" onClick={handleDeleteInstance}>
                  Delete
                </button>
                <button type="button" className="launch-button" onClick={handleLaunch} disabled={!signedIn}>
                  Launch
                </button>
              </div>
            </header>

            <nav className="workspace-tabs">
              <button
                type="button"
                className={activeTab === 'version' ? 'active' : ''}
                onClick={() => setActiveTab('version')}
              >
                Version
              </button>
              <button
                type="button"
                className={activeTab === 'mods' ? 'active' : ''}
                onClick={() => setActiveTab('mods')}
              >
                Mods
              </button>
            </nav>

            <div className="workspace-content">
              {activeTab === 'version' && (
                <div className="version-panel">
                  <div className="info-card">
                    <h2>Instance setup</h2>
                    <dl>
                      <div>
                        <dt>Minecraft version</dt>
                        <dd>{activeInstance.mcVersion}</dd>
                      </div>
                      <div>
                        <dt>Mod loader</dt>
                        <dd>Fabric (installed on launch)</dd>
                      </div>
                      <div>
                        <dt>Integrity mod</dt>
                        <dd>papyrus-shield (bundled automatically)</dd>
                      </div>
                      <div>
                        <dt>Account</dt>
                        <dd>{signedIn ? playerName : 'Not signed in'}</dd>
                      </div>
                    </dl>
                  </div>
                  <p className="hint">
                    Prism Launcher-style instance management: each instance keeps its own Minecraft version,
                    Fabric install, and mod list. Launch downloads assets and starts the game.
                  </p>
                </div>
              )}

              {activeTab === 'mods' && (
                <div className="mods-panel">
                  <div className="mod-search-row">
                    <input
                      value={modQuery}
                      onChange={(e) => setModQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleModSearch()}
                      placeholder="Search Modrinth for Fabric mods"
                    />
                    <button type="button" onClick={handleModSearch} disabled={modSearchBusy}>
                      {modSearchBusy ? 'Searching…' : 'Search'}
                    </button>
                  </div>

                  <ul className="mod-results">
                    {modResults.map((hit) => (
                      <li key={hit.projectId} className="mod-result">
                        {hit.iconUrl ? <img src={hit.iconUrl} alt="" className="mod-icon" /> : <div className="mod-icon mod-icon-fallback" />}
                        <div className="mod-copy">
                          <div className="mod-title-row">
                            <strong>{hit.title}</strong>
                            <span className="mod-downloads">{formatDownloads(hit.downloads)} downloads</span>
                          </div>
                          <p className="mod-description">{hit.description}</p>
                        </div>
                        <button
                          type="button"
                          className="primary mod-install"
                          disabled={installingProjectId === hit.projectId}
                          onClick={() => handleInstallMod(hit.projectId, hit.title)}
                        >
                          {installingProjectId === hit.projectId ? 'Installing…' : 'Install'}
                        </button>
                      </li>
                    ))}
                  </ul>

                  <h3>Installed on this instance</h3>
                  {activeInstance.mods.length === 0 ? (
                    <p className="hint">No extra mods yet. Search Modrinth or drop jars into the mods folder.</p>
                  ) : (
                    <ul className="installed-mods">
                      {activeInstance.mods.map((mod) => (
                        <li key={mod}>
                          <span>{mod}</span>
                          <button type="button" onClick={() => handleRemoveMod(mod)}>Remove</button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <h3>Downloaded mod files</h3>
                  {userMods.length === 0 ? (
                    <p className="hint">Installed mod jars are stored locally for reuse across instances.</p>
                  ) : (
                    <ul className="compact-list">
                      {userMods.map((mod) => (
                        <li key={mod}>{mod}</li>
                      ))}
                    </ul>
                  )}

                  <div className="mod-actions">
                    <button type="button" onClick={() => window.papyrus.openModsFolder()}>Open mods folder</button>
                    <button type="button" onClick={() => window.papyrus.openDocs()}>Help</button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="empty-workspace">
            <h1>Welcome to Papyrus Client</h1>
            <p className="hint">Create an instance to get started. Layout and workflow are based on Prism Launcher.</p>
            <button type="button" className="primary" onClick={() => setShowCreateInstance(true)}>Create instance</button>
          </div>
        )}

        <footer className="status-bar">{status}</footer>
      </section>
    </div>
  );
}
