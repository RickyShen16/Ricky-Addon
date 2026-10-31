#!/bin/bash
# Installs Simkl Radar for Mac: shared core, Übersicht desktop widget, SwiftBar menu bar plugin.
# Usage:  bash mac/install.sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$HOME/.simkl-radar"
cp "$HERE/simkl/simkl.js" "$HOME/.simkl-radar/simkl.js"
echo "✓ core       → ~/.simkl-radar/simkl.js"

UB="$HOME/Library/Application Support/Übersicht/widgets"
if [ -d "$UB" ]; then
  rm -rf "$UB/simkl-radar.widget"; cp -R "$HERE/simkl/simkl-radar.widget" "$UB/"
  echo "✓ desktop    → Übersicht widgets folder"
else
  echo "• Übersicht not found — install it from https://tracesof.net/uebersicht/ and run this again"
fi

SB="$(defaults read com.ameba.SwiftBar PluginDirectory 2>/dev/null || true)"
if [ -n "$SB" ] && [ -d "$SB" ]; then
  cp "$HERE/simkl/simkl.10m.js" "$SB/"; chmod +x "$SB/simkl.10m.js"
  echo "✓ menu bar   → $SB"
else
  echo "• SwiftBar not set up — install it (brew install --cask swiftbar), pick a plugin folder, and run this again"
fi

if [ ! -s "$HOME/.simkl-radar/token" ]; then
  echo; echo "Linking your Simkl account (one time)…"
  osascript -l JavaScript "$HOME/.simkl-radar/simkl.js" login
fi
