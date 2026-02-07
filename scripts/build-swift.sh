#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SRC="$PROJECT_DIR/src/native/ax-reader.swift"
OUT="$PROJECT_DIR/resources/ax-reader"

if [ ! -f "$SRC" ]; then
  echo "Swift source not found at $SRC — skipping build"
  exit 0
fi

echo "Compiling Swift accessibility helper..."
swiftc -framework Cocoa -framework ApplicationServices -O -o "$OUT" "$SRC"
echo "Built: $OUT"
