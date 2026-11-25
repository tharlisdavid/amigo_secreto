#!/usr/bin/env bash
# Publica o frontend no Vercel, mandando /api para o endereço público da API.
# Uso: deploy/publicar-site.sh https://endereco-publico-da-api
set -euo pipefail
cd "$(dirname "$0")/.."
API="${1:?Informe o endereço https da API}"
API="${API%/}" node -e '
const api = process.env.API;
if (!/^https:\/\/[\w.-]+$/.test(api)) { console.error("Endereço inválido: " + api); process.exit(1); }
require("fs").writeFileSync("vercel.json", JSON.stringify({
  $schema: "https://openapi.vercel.sh/vercel.json",
  framework: null, buildCommand: null, installCommand: null, outputDirectory: "public",
  rewrites: [
    { source: "/api/:path*", destination: api + "/api/:path*" },
    { source: "/g/:id", destination: "/index.html" },
    { source: "/organizar/:id", destination: "/index.html" },
  ],
  headers: [{ source: "/(.*)", headers: [
    { key: "Content-Security-Policy", value: "default-src 'self'; frame-ancestors 'none'; base-uri 'none'" },
    { key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Content-Type-Options", value: "nosniff" },
  ] }],
}, null, 2) + "\n");'
npx --yes vercel@latest deploy --prod
