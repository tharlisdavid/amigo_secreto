#!/usr/bin/env bash
# Constrói e sobe a API no Docker deste Linux. Os sorteios ficam no volume natal_dados.
# Uso: deploy/subir-api.sh [https://endereco-do-site]   (o endereço vai nos links da turma)
set -euo pipefail
cd "$(dirname "$0")/.."
docker build -q -t sorteio-natal . >/dev/null
docker network inspect natal >/dev/null 2>&1 || docker network create natal >/dev/null
docker rm -f natal_api >/dev/null 2>&1 || true
# Sem porta aberta nesta máquina: só o túnel (natal_tunel) alcança a API, pela rede "natal".
docker run -d --name natal_api --init --restart unless-stopped --network natal \
  -v natal_dados:/dados -e ENDERECO="${1:-}" \
  --read-only --cap-drop ALL --security-opt no-new-privileges --memory 256m sorteio-natal >/dev/null
echo "API no ar (sem porta local; acesso pelo túnel)"
