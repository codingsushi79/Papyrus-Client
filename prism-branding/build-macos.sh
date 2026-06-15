#!/usr/bin/env bash
# Build a branded Prism Launcher on macOS (local or CI helper).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PRISM_SRC="${PRISM_SRC:-$ROOT/.cache/prism-launcher-src}"
BUILD_TYPE="${BUILD_TYPE:-Release}"

"$ROOT/prism-branding/apply-branding.sh" "$PRISM_SRC"

cd "$PRISM_SRC"
git submodule update --init --recursive

export ARTIFACT_NAME="macOS"
export BUILD_PLATFORM="official"

cmake --preset macos
cmake --build --preset macos --config "$BUILD_TYPE"
cmake --install build --config "$BUILD_TYPE"

APP_PATH="install/Papyrus Client.app"
if [ ! -d "$APP_PATH" ]; then
  APP_PATH="install/PrismLauncher.app"
fi

codesign --sign - --deep --force "$APP_PATH/Contents/MacOS/"* || true
echo "Built $APP_PATH"
