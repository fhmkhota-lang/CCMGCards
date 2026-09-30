#!/bin/zsh
# Deploy the Access-protected build of CCMG Cards (worker: ccmgcards-secure).
# Leaves the open "ccmgcards" worker and GitHub Pages site untouched.
set -e
cd "$(dirname "$0")"

OUT=.deploy-public
rm -rf "$OUT"
mkdir -p "$OUT/logos"

# Allowlist: only what the browser needs. Nothing else gets published.
cp index.html app.js style.css data.js "$OUT/"
cp logos/*.png "$OUT/logos/"

echo "Publishing:"
( cd "$OUT" && find . -type f | sort )

npx wrangler deploy --config wrangler.secure.toml
