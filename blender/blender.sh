#!/usr/bin/env bash
# Run Blender headlessly from the repo root. Override the binary with $BLENDER.
set -euo pipefail
BLENDER="${BLENDER:-}"
if [[ -z "$BLENDER" ]]; then
  if command -v blender >/dev/null 2>&1; then
    BLENDER="$(command -v blender)"
  elif [[ -x /Applications/Blender.app/Contents/MacOS/Blender ]]; then
    BLENDER=/Applications/Blender.app/Contents/MacOS/Blender
  else
    echo "Blender not found. Install it (brew install --cask blender) or set BLENDER=/path/to/blender" >&2
    exit 1
  fi
fi
cd "$(dirname "$0")/.."
exec "$BLENDER" "$@"
