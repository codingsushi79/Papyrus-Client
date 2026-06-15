#!/usr/bin/env bash
# Apply Papyrus Client branding to a Prism Launcher source tree.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PRISM_SRC="${1:-$ROOT/.cache/prism-launcher-src}"

if [ ! -f "$PRISM_SRC/CMakeLists.txt" ]; then
  echo "Prism Launcher source not found at: $PRISM_SRC" >&2
  echo "Clone it first, for example:" >&2
  echo "  git clone --depth 1 --branch release-10.0.1 https://github.com/PrismLauncher/PrismLauncher.git $PRISM_SRC" >&2
  exit 1
fi

patch -p1 -d "$PRISM_SRC" < "$ROOT/prism-branding/papyrus-brand.patch"
echo "Applied Papyrus branding patch to $PRISM_SRC"
