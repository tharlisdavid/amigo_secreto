#!/usr/bin/env bash
# Mantém o site no ar: testa a API pelo site a cada minuto. Se o túnel gratuito
# morrer (a Cloudflare derruba depois de algumas horas, ou o computador reiniciou),
# abre outro túnel, grava o endereço no vercel.json e envia para o main.
# Roda como serviço: deploy/instalar-vigia.sh. Log: journalctl --user -u natal-vigia -f
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH=/usr/local/bin:/usr/bin:/bin
SITE=${SITE:-https://amigo-secreto-woad-gamma.vercel.app}
falhas=0

# 2xx/4xx vêm da API (ex.: 404 "não existe"); 5xx vem do túnel ou do Vercel.
no_ar() {
  local c
  c=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$SITE/api/grupos/vigia000")
  [[ $c =~ ^[24] ]]
}

# O túnel novo responde? Usa DNS da Cloudflare (o DNS local às vezes só dá IPv6).
tunel_ok() {
  local h=${1#https://} ip c
  ip=$(curl -s -m 10 "https://cloudflare-dns.com/dns-query?name=$h&type=A" \
    -H 'accept: application/dns-json' | grep -oE '"data":"[0-9.]+"' | head -1 | cut -d'"' -f4)
  [ -n "$ip" ] || return 1
  c=$(curl -s -o /dev/null -m 10 -w '%{http_code}' --resolve "$h:443:$ip" "$1/api/grupos/vigia000")
  [[ $c =~ ^[24] ]]
}

refazer() {
  local api
  echo "Site fora; abrindo túnel novo"
  docker start natal_api >/dev/null 2>&1 || true
  git pull -q --rebase origin main || true
  api=$(TUNEL_HOST=1 deploy/tunel.sh) || { echo "tunel.sh falhou"; return 1; }
  for _ in $(seq 1 30); do tunel_ok "$api" && break; sleep 3; done
  tunel_ok "$api" || { echo "Túnel $api não respondeu"; return 1; }
  git commit -q -m "Novo endereço do túnel (vigia)" -- vercel.json && git push -q origin main \
    && echo "Publicado: $api" || echo "Falhou ao enviar o vercel.json"
}

while true; do
  if no_ar; then
    falhas=0
  else
    falhas=$((falhas + 1))
    echo "Site sem resposta ($falhas)"
  fi
  if [ "$falhas" -ge 3 ]; then
    refazer
    falhas=0
    sleep 240 # tempo do Vercel publicar antes de testar de novo
  fi
  sleep 60
done
