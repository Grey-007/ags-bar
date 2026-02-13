#!/bin/bash

# Build script for AGS v3 configuration
# Compiles SCSS to CSS (pre-compilation, not at runtime)

set -e

STYLE_DIR="./style"
SCSS_FILE="$STYLE_DIR/style.scss"
CSS_FILE="$STYLE_DIR/style.css"

echo "🎨 Compiling SCSS..."

if ! command -v sassc &> /dev/null; then
    echo "❌ sassc not found. Install: sudo pacman -S sassc"
    exit 1
fi

sassc "$SCSS_FILE" "$CSS_FILE"

echo "✓ CSS compiled: $CSS_FILE"
echo ""
echo "Now run: ags"
