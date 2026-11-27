#!/usr/bin/env bash
# Instala o vigia (deploy/vigia.sh) como serviço do usuário: sobe junto com o
# computador, mesmo sem login. Parar: systemctl --user disable --now natal-vigia
set -euo pipefail
DIR=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/natal-vigia.service <<EOF
[Unit]
Description=Mantém o túnel do amigo secreto no ar
After=network-online.target docker.service

[Service]
ExecStart=$DIR/deploy/vigia.sh
Restart=always
RestartSec=30

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now natal-vigia
loginctl enable-linger "$USER" 2>/dev/null || true
systemctl --user --no-pager status natal-vigia | head -5
