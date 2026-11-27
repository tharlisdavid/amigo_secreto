#!/usr/bin/env bash
# Abre um túnel https gratuito (sem conta) até a API e grava o endereço no vercel.json.
# O endereço muda quando o túnel reinicia: rode de novo e envie o vercel.json para o GitHub.
# Argumentos extras vão para o cloudflared, por exemplo --edge 198.41.200.13:7844
# quando a rede bloqueia parte dos servidores da Cloudflare.
set -euo pipefail
cd "$(dirname "$0")/.."
docker rm -f natal_tunel >/dev/null 2>&1 || true
# Fica na rede "natal", então só enxerga a API do sorteio.
REDE=(--network natal) ALVO=http://natal_api:2512
# Com o Cloudflare WARP ligado, os contêineres ficam sem internet. TUNEL_HOST=1 usa a
# rede do computador e chega à API pelo IP interno dela (a API segue sem porta aberta).
if [ "${TUNEL_HOST:-}" = 1 ]; then
  # O WARP também desvia o caminho do computador até 172.x. A faixa 192.0.0.0/24 fica
  # fora dele, então a API ganha uma segunda rede ("natal_ponte") nessa faixa.
  docker network inspect natal_ponte >/dev/null 2>&1 \
    || docker network create --subnet 192.0.0.0/24 natal_ponte >/dev/null
  docker network connect natal_ponte natal_api 2>/dev/null || true
  IP=$(docker inspect -f '{{(index .NetworkSettings.Networks "natal_ponte").IPAddress}}' natal_api)
  REDE=(--network host) ALVO=http://$IP:2512
fi
docker run -d --name natal_tunel --restart unless-stopped "${REDE[@]}" \
  --read-only --cap-drop ALL --security-opt no-new-privileges --memory 128m \
  cloudflare/cloudflared:latest tunnel --no-autoupdate --protocol http2 "$@" --url "$ALVO" >/dev/null
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
