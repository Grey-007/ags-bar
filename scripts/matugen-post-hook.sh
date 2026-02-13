#!/usr/bin/env bash
set -euo pipefail
ROOT="/home/grey/.config/ags"

# Keep both filenames in sync for old/new wallpaper scripts.
if [[ -f "$ROOT/style/_matugen.generated.scss" ]]; then
  cp "$ROOT/style/_matugen.generated.scss" "$ROOT/style/_matugen.scss"
elif [[ -f "$ROOT/style/_matugen.scss" ]]; then
  cp "$ROOT/style/_matugen.scss" "$ROOT/style/_matugen.generated.scss"
fi

"$ROOT/build.sh"
pkill ags || true
ags run --gtk 4 >/tmp/ags-theme.log 2>&1 & disown
