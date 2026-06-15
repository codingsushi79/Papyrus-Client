import React, { useEffect, useState } from 'react';

type Profile = { id: string; name: string; mcVersion: string; mods: string[] };

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

  async function refresh() {
    const auth = await window.papyrus.authStatus();
    setSignedIn(auth.signedIn);
    setPlayerName(auth.name);
    setVersions(await window.papyrus.listVersions());
    setProfiles(await window.papyrus.listProfiles());
    setUserMods(await window.papyrus.listUserMods());
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

  async function createProfile() {
    const id = crypto.randomUUID();
    await window.papyrus.saveProfile({
      id,
      name: newProfileName,
      mcVersion: newMcVersion,
      mods: [],
    });
    setSelectedProfile(id);
    await refresh();
    setStatus(`Created profile ${newProfileName}`);
  }

  async function handleLaunch() {
    if (!signedIn) {
      setStatus('Microsoft sign-in is required before launching.');
      return;
    }
    if (!selectedProfile) {
      setStatus('Select or create a profile first.');
      return;
    }
    setStatus('Installing Fabric and launching…');
    try {
      await window.papyrus.launch(selectedProfile);
      setStatus('Game launched.');
    } catch (e) {
      setStatus(`Launch failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">Fabric only · Papyrus</p>
          <h1>Papyrus Client</h1>
        </div>
        <div className="auth">
          {signedIn ? (
            <>
              <span>{playerName}</span>
              <button type="button" onClick={() => window.papyrus.authLogout().then(refresh)}>Sign out</button>
            </>
          ) : (
            <button type="button" className="primary" onClick={handleLogin}>Sign in with Microsoft</button>
          )}
        </div>
      </header>

      <main className="grid">
        <section className="card">
          <h2>Profiles</h2>
          <div className="row">
            <input value={newProfileName} onChange={(e) => setNewProfileName(e.target.value)} placeholder="Profile name" />
            <select value={newMcVersion} onChange={(e) => setNewMcVersion(e.target.value)}>
              {versions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <button type="button" onClick={createProfile}>Create</button>
          </div>
          <ul className="list">
            {profiles.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={selectedProfile === p.id ? 'selected' : ''}
                  onClick={() => setSelectedProfile(p.id)}
                >
                  {p.name} · {p.mcVersion} · {p.mods.length} mods
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="primary launch" onClick={handleLaunch} disabled={!signedIn}>
            Launch Fabric
          </button>
        </section>

        <section className="card">
          <h2>Mods</h2>
          <p className="hint">Drop .jar files into the launcher mods folder. Papyrus integrity is bundled automatically and not shown here.</p>
          <ul className="list">
            {userMods.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <button type="button" onClick={() => window.papyrus.openDocs()}>Documentation & downloads</button>
        </section>
      </main>

      <footer className="status">{status}</footer>
    </div>
  );
}
