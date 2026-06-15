#!/usr/bin/env bash
# Wrap a built .app bundle into a macOS .pkg installer.
set -euo pipefail

APP_PATH="${1:?Usage: package-macos-pkg.sh <path-to.app> <version> <output.pkg>}"
VERSION="${2:?missing version}"
OUTPUT_PKG="${3:?missing output pkg path}"

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

mkdir -p "$STAGING/root/Applications"
cp -R "$APP_PATH" "$STAGING/root/Applications/"

pkgbuild \
  --root "$STAGING/root" \
  --identifier "dev.sushimc.papyrus.client" \
  --version "$VERSION" \
  --install-location "/" \
  "$OUTPUT_PKG"

echo "Created $OUTPUT_PKG"
