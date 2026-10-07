#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

git pull

if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

npm run build

if [[ ! -f dist/index.html ]]; then
  echo "Build failed: dist/index.html not found" >&2
  exit 1
fi

if [[ ! -d dist/assets ]] || [[ -z "$(ls -A dist/assets 2>/dev/null)" ]]; then
  echo "Build failed: dist/assets is empty" >&2
  exit 1
fi

# Сборка в dist/, на сайт — копия в корень (Apache без proxy; dev index.html не отдаём)
cp -f dist/index.html ./index.html
rm -rf ./assets
cp -r dist/assets ./assets

if [[ -f dist/robots.txt ]]; then
  cp -f dist/robots.txt ./robots.txt
fi

echo "Deploy OK — published dist/ → index.html + assets/"
echo "Check: ls -la index.html assets/ .htaccess"
