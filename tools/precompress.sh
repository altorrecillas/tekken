#!/bin/bash
# Precompress the fighter meshes (the game loads mesh.bin.gz and inflates it with DecompressionStream).
# Run after rebuilding characters: tools/precompress.sh
cd "$(dirname "$0")/.."
for f in assets/chars/*/mesh.bin; do gzip -9 -k -f -n "$f" && echo "$f.gz $(stat -c %s "$f.gz") bytes"; done
