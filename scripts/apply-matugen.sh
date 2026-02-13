#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CFG="$ROOT/theming/matugen/config.toml"

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 [image|color] <source> [dark|light]"
  echo "Example: $0 image ~/Pictures/wall.jpg dark"
  echo "Example: $0 color '#ff6b8a' dark"
  exit 1
fi

MODE="${3:-dark}"
KIND="$1"
SOURCE="$2"

case "$KIND" in
  image)
    matugen image "$SOURCE" -m "$MODE" -c "$CFG"
    ;;
  color)
    matugen color hex "$SOURCE" -m "$MODE" -c "$CFG"
    ;;
  *)
    echo "Unknown source kind: $KIND (use image|color)"
    exit 1
    ;;
esac

"$ROOT/build.sh"

# Restart AGS to apply new CSS
pkill ags || true
ags run --gtk 4 >/tmp/ags-theme.log 2>&1 & disown

echo "Applied Matugen theme and restarted AGS."
