// A demonstração é um arquivo único, sem o esqueleto HTML; aqui ela vira uma página completa.
export const CSP_DEMO = "default-src 'none'; img-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'none'";
export const montarDemo = (miolo) =>
  `<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><link rel="icon" href="/icone.svg" type="image/svg+xml"><style>[hidden]{display:none!important}</style>${miolo}</html>\n`;
