# Papyrus Client

Fabric-only Minecraft launcher for macOS and Windows with Microsoft sign-in, mod management, and a bundled client integrity mod that reports installed mods to [Papyrus](https://github.com/codingsushi79/Papyrus) servers.

Documentation: [docs.sushii.dev/papyrus-client](https://docs.sushii.dev/papyrus-client/)

Supported mod builds: **26.1.2**, **1.21.11**, **1.21.10**, **1.21.8**, 1.21.4, 1.21.1 (see `SUPPORTED_VERSIONS.txt`).

## Components

| Path | Description |
|------|-------------|
| `launcher/` | Electron launcher (Microsoft auth, Fabric install, mod profiles) |
| `mod/` | Fabric mod `papyrus-shield` for obfuscated 1.21.x |
| `mod-unobf/` | Same mod sources for unobfuscated **26.1.2** |

## Downloads

Releases publish:

- **Launcher** — `Papyrus-Client-<version>-mac.dmg`, `Papyrus-Client-<version>-win.exe`
- **Mod only** — `papyrus-shield-<minecraftVersion>-<modVersion>.jar` (e.g. `papyrus-shield-26.1.2-1.0.0.jar`)

## Build locally

Requires **Gradle 9.5+** (wrapper is generated on first build). Use **Java 21** for `mod/` (1.21.x) and **Java 25** for `mod-unobf/` (26.1.2).

```bash
# Obfuscated versions (1.21.x)
cd mod && gradle wrapper --gradle-version 9.5 && ./gradlew build

# 26.1.2 (unobfuscated, Java 25)
cd mod-unobf && gradle wrapper --gradle-version 9.5 && ./gradlew build

# Launcher
cd launcher && npm install && npm run build
```

## Server integration

Papyrus servers enable `anticheat.client-integrity` in `paper-global.yml`. Players without the client mod are kicked with a link to the docs download page.
