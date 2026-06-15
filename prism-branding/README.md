# Prism Launcher branding for Papyrus Client

Papyrus Client is modeled after [Prism Launcher](https://github.com/PrismLauncher/PrismLauncher): instance sidebar, version/mods tabs, and Modrinth installs.

The Electron launcher in `launcher/` implements that workflow today. To ship a **native** Prism-based binary later:

1. Clone Prism Launcher `release-10.0.1` (or newer) into `.cache/prism-launcher-src`
2. Run `./prism-branding/apply-branding.sh`
3. Build with `./prism-branding/build-macos.sh` (requires Qt 6, CMake, vcpkg — see Prism docs)
4. Package with `./prism-branding/package-macos-pkg.sh "install/Papyrus Client.app" 1.0.0 Papyrus-Client-1.0.0-arm64.pkg`

Replace `program_info` icons with Papyrus assets before release builds.

The current GitHub release pipeline builds the Electron launcher and publishes:

- macOS: `.pkg` installer + `.zip` for auto-update
- Windows: NSIS `.exe` installer
