#!/usr/bin/env bash
# Abre um túnel https gratuito (sem conta) até a API e grava o endereço no vercel.json.
# O endereço muda quando o túnel reinicia: rode de novo e envie o vercel.json para o GitHub.
set -euo pipefail
cd "$(dirname "$0")/.."
docker rm -f natal_tunel >/dev/null 2>&1 || true
# Fica na rede "natal", então só enxerga a API do sorteio.
docker run -d --name natal_tunel --restart unless-stopped --network natal \
  --read-only --cap-drop ALL --security-opt no-new-privileges --memory 128m \
  cloudflare/cloudflared:latest tunnel --no-autoupdate --protocol http2 --url http://natal_api:2512 >/dev/null
for _ in $(seq 1 30); do
  sleep 1
  API=$(docker logs natal_tunel 2>&1 | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | grep -v '//api\.' | head -1 || true)
  [ -n "$API" ] && break
done
[ -n "$API" ] || { echo "O túnel não abriu:"; docker logs --tail 15 natal_tunel; exit 1; }
API="$API" node -e '
const fs = require("fs"), v = JSON.parse(fs.readFileSync("vercel.json"));
v.rewrites = [
  { source: "/api/:path*", destination: process.env.API + "/api/:path*" },
  ...(v.rewrites ?? []).filter((r) => !r.source.startsWith("/api")),
];
fs.writeFileSync("vercel.json", JSON.stringify(v, null, 2) + "\n");'
echo "$API"
