#!/bin/bash
# Installs Simkl Radar for Mac: shared core, Übersicht desktop widget, SwiftBar menu bar plugin.
# Usage:  bash mac/install.sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$HOME/.simkl-radar"
cp "$HERE/simkl/simkl.js" "$HOME/.simkl-radar/simkl.js"
echo "✓ core       → ~/.simkl-radar/simkl.js"

# Übersicht: use its configured widgets folder, else the default (created if the app hasn't run yet)
if [ -d "/Applications/Übersicht.app" ] || [ -d "$HOME/Applications/Übersicht.app" ]; then
  UB="$(defaults read tracesOf.Uebersicht widgetsDir 2>/dev/null || true)"
  [ -z "$UB" ] && UB="$HOME/Library/Application Support/Übersicht/widgets"
  mkdir -p "$UB"
  rm -rf "$UB/simkl-radar.widget"; cp -R "$HERE/simkl/simkl-radar.widget" "$UB/"
  echo "✓ desktop    → $UB"
  open -a "Übersicht" || true
else
  echo "• Übersicht not installed — run: brew install --cask ubersicht   then run this again"
fi

# SwiftBar: use its plugin folder, or set one up if it was never chosen
if [ -d "/Applications/SwiftBar.app" ] || [ -d "$HOME/Applications/SwiftBar.app" ]; then
  SB="$(defaults read com.ameba.SwiftBar PluginDirectory 2>/dev/null || true)"
  if [ -z "$SB" ]; then
    SB="$HOME/Library/Application Support/SwiftBar/Plugins"
    defaults write com.ameba.SwiftBar PluginDirectory "$SB"
  fi
  mkdir -p "$SB"
  cp "$HERE/simkl/simkl.10m.js" "$SB/"; chmod +x "$SB/simkl.10m.js"
  echo "✓ menu bar   → $SB"
  osascript -e 'quit app "SwiftBar"' 2>/dev/null || true; sleep 1; open -a SwiftBar || true
else
  echo "• SwiftBar not installed — run: brew install --cask swiftbar   then run this again"
fi

if [ ! -s "$HOME/.simkl-radar/token" ]; then
  echo; echo "Linking your Simkl account (one time)…"
  osascript -l JavaScript "$HOME/.simkl-radar/simkl.js" login
fi
