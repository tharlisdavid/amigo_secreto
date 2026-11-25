// Todos os desenhos são SVG feitos aqui; só números entram nos modelos, nunca texto digitado.
export function svg(marcacao) {
  const t = document.createElement('template');
  t.innerHTML = marcacao.trim();
  t.content.firstChild.setAttribute('aria-hidden', 'true');
  return t.content.firstChild;
}

const CORES = [['#c22637', '#7f101d'], ['#eab043', '#a26a12'], ['#8fc4e6', '#3f7ba6'], ['#d9745a', '#8f3a27'], ['#9a5fb5', '#5a2f72'], ['#f3ead8', '#b3a27f']];
const faixas = [
  '<path d="M4 40c9 7 16-7 25 0s16-7 25 0v7c-9 7-16-7-25 0s-16-7-25 0Z" fill="#fff" opacity=".8"/>',
  '<g fill="#fff" opacity=".85"><circle cx="16" cy="36" r="3"/><circle cx="29" cy="31" r="3"/><circle cx="42" cy="36" r="3"/><circle cx="22" cy="48" r="3"/><circle cx="36" cy="48" r="3"/></g>',
  '<g stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".85"><path d="M29 27v28M17 34l24 14M41 34 17 48"/></g>',
  '<g fill="none" stroke="#fff" stroke-width="3" opacity=".75"><path d="M6 33q23 10 46 0M6 49q23 10 46 0"/></g>',
];
let n = 0;
export function bolinha(i) {
  const [a, b] = CORES[i % CORES.length], id = `b${n++}`;
  return svg(`<svg viewBox="0 0 58 68"><defs><radialGradient id="${id}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".18" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient><clipPath id="${id}c"><circle cx="29" cy="41" r="25"/></clipPath></defs>
  <path d="M29 0v8" stroke="#ffe3a0" stroke-width="2"/><rect x="22" y="8" width="14" height="10" rx="3" fill="#f2b84b"/>
  <circle cx="29" cy="41" r="25" fill="${a}"/><g clip-path="url(#${id}c)">${faixas[(i * 7 + (i >> 2)) % faixas.length]}</g><circle cx="29" cy="41" r="25" fill="url(#${id})" opacity=".62"/></svg>`);
}

export function enfeiteGrande() {
  const e = bolinha(0);
  e.classList.add('enfeite');
  return e;
}

export function varal(largura) {
  const vao = 150, q = Math.ceil(largura / vao) + 1, cores = ['#ffcf5c', '#ff6b6b', '#7fe0a8', '#8fd0ff'];
  let fio = 'M0 4', luzes = '', k = 0;
  for (let i = 0; i < q; i++) {
    const x = i * vao;
    fio += `Q${x + vao / 2} 56 ${x + vao} 4`;
    for (const t of [.18, .4, .62, .84]) {
      const px = x + vao * t, py = 4 + 104 * t * (1 - t);
      const cor = cores[k++ % 4];
      luzes += `<g class="lampada"><circle cx="${px}" cy="${py + 12}" r="15" fill="${cor}" opacity=".22"/><rect x="${px - 3}" y="${py - 1}" width="6" height="6" rx="1" fill="#1a2c27"/><path d="M${px - 5} ${py + 9}a5 5 0 0 1 10 0c0 6-3 9-5 12-2-3-5-6-5-12Z" fill="${cor}"/></g>`;
    }
  }
  return svg(`<svg width="${q * vao}" height="64"><path d="${fio}" fill="none" stroke="#0b1712" stroke-width="2.5"/>${luzes}</svg>`);
}

/** Distribui as bolinhas em linhas que formam um pinheiro e desenha os galhos na mesma medida. */
export function montarArvore(total, largura, todosAbriram) {
  const maxCol = largura < 480 ? 3 : 5;
  const caps = [];
  let soma = 0;
  while (soma < total || caps.length < 4 || caps.length % 2) {
    const andar = caps.length >> 1;
    const cap = Math.min(maxCol - (caps.length % 2 ? 0 : 1), andar + 1 + (caps.length % 2));
    caps.push(cap); soma += cap;
  }
  const cont = [...caps];
  for (let sobra = soma - total; sobra > 0; sobra--) {
    let m = 0;
    cont.forEach((v, i) => { if (v > cont[m]) m = i; });
    cont[m]--;
  }
  const passo = Math.min(128, (largura - 8) / (maxCol + .1)), alt = 116, topo = 104, cx = largura / 2;
  const y = (r) => topo + r * alt;
  const meia = (r) => (caps[r] * passo) / 2;
  const pos = [];
  cont.forEach((q, r) => {
    const p = q ? Math.min(passo * 1.25, (caps[r] * passo) / q) : 0;
    const desvio = q === 1 && caps[r] > 1 ? (r % 2 ? -.3 : .3) * passo : 0;
    for (let i = 0; i < q; i++) pos.push({ x: cx + (i - (q - 1) / 2) * p + desvio, y: y(r) + (i % 2 ? 6 : 0) });
  });
  const base = y(caps.length) + 6;
  let andares = '', luzes = '';
  for (let r = caps.length - 2; r >= 0; r -= 2) {
    const y0 = r === 0 ? topo - 50 : y(r) - 62, y1 = y(r + 2) - 4;
    const w1 = Math.min(meia(r + 1) + 30, largura / 2 + 10), w0 = r === 0 ? 4 : Math.max(meia(r) * .42, 26);
    const bicos = Math.max(4, Math.round(w1 / 24)), lb = (2 * w1) / bicos;
    let d = `M${cx - w0} ${y0}Q${cx - w0 - (w1 - w0) * .3} ${y0 + (y1 - y0) * .62} ${cx - w1} ${y1 - 8}`;
    for (let b = 0; b < bicos; b++) {
      const x = cx - w1 + b * lb;
      d += `Q${x + lb / 2} ${y1 + 26} ${x + lb} ${y1 - 8}`;
      luzes += `<g class="lampada"><circle cx="${x + lb / 2}" cy="${y1 + 8}" r="9" fill="#ffd56b" opacity=".25"/><circle cx="${x + lb / 2}" cy="${y1 + 8}" r="3.6" fill="${b % 2 ? '#ffd56b' : '#ff8f7a'}"/></g>`;
    }
    d += `Q${cx + w0 + (w1 - w0) * .3} ${y0 + (y1 - y0) * .62} ${cx + w0} ${y0}Z`;
    andares += `<path d="${d}" fill="#0a2c22" opacity=".45" transform="translate(0 9)"/><path d="${d}" fill="url(#pinho)"/>`;
    const ym = y0 + (y1 - y0) * .56;
    andares += `<path d="M${cx - w1 * .62} ${ym}Q${cx} ${ym + 46} ${cx + w1 * .6} ${ym - 8}" fill="none" stroke="#f2cf7c" stroke-width="3" stroke-dasharray="1 8" stroke-linecap="round" opacity=".8"/>`;
  }
  const est = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 14 : 32;
    return `${(cx + Math.cos(a) * r).toFixed(1)},${(topo - 58 + Math.sin(a) * r).toFixed(1)}`;
  }).join(' ');
  const cxp = (x, w, h, a, f) => `<rect x="${cx + x}" y="${base + 66 - h}" width="${w}" height="${h}" rx="4" fill="${a}"/><rect x="${cx + x + w / 2 - 5}" y="${base + 66 - h}" width="10" height="${h}" fill="${f}"/><path d="M${cx + x + w / 2} ${base + 66 - h}q-18-18-20-4 4 8 20 4 16 4 20-4-2-14-20 4Z" fill="${f}"/>`;
  const altura = base + 96;
  const desenho = svg(`<svg width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">
    <defs><linearGradient id="pinho" x1="0" x2="1"><stop offset="0" stop-color="#1f6a4e"/><stop offset=".5" stop-color="#1a5c44"/><stop offset="1" stop-color="#0f4031"/></linearGradient></defs>
    <ellipse cx="${cx}" cy="${base + 66}" rx="${Math.min(largura * .48, 250)}" ry="24" fill="#f4f7fd"/>
    <rect x="${cx - 20}" y="${base - 30}" width="40" height="92" rx="5" fill="#5a3828"/>
    ${andares}${luzes}
    ${cxp(-118, 62, 44, '#b3202f', '#f2cf7c')}${cxp(52, 56, 58, '#2d5aa0', '#fff8ea')}${cxp(-48, 46, 32, '#f2b84b', '#b3202f')}
    <polygon class="estrela ${todosAbriram ? 'viva' : ''}" points="${est}" fill="#ffd56b" stroke="#fff3cf" stroke-width="3" stroke-linejoin="round"/></svg>`);
  return { pos, altura, desenho, larguraItem: Math.min(passo - 6, 122) };
}

export function presente() {
  let raios = '';
  for (let i = 0; i < 11; i++) {
    const a = Math.PI + ((i + .5) * Math.PI) / 11, d = .07;
    raios += `<path d="M170 230 ${170 + Math.cos(a - d) * 330} ${230 + Math.sin(a - d) * 330} ${170 + Math.cos(a + d) * 330} ${230 + Math.sin(a + d) * 330}Z"/>`;
  }
  return svg(`<svg viewBox="0 0 340 400"><defs>
    <radialGradient id="luz" gradientUnits="userSpaceOnUse" cx="170" cy="230" r="320"><stop offset="0" stop-color="#ffe7a6" stop-opacity=".95"/><stop offset="1" stop-color="#ffd56b" stop-opacity="0"/></radialGradient>
    <linearGradient id="cx" x1="0" x2="1"><stop offset="0" stop-color="#cb2f40"/><stop offset="1" stop-color="#9a1826"/></linearGradient>
    <linearGradient id="ft" x1="0" x2="1"><stop offset="0" stop-color="#ffd980"/><stop offset="1" stop-color="#e0a033"/></linearGradient></defs>
    <g class="raios" fill="url(#luz)">${raios}</g>
    <ellipse cx="170" cy="384" rx="150" ry="14" fill="#0b1330" opacity=".4"/>
    <g class="embrulho"><rect x="46" y="216" width="248" height="166" rx="8" fill="url(#cx)"/>
      <g fill="#fff" opacity=".2"><circle cx="84" cy="262" r="8"/><circle cx="118" cy="318" r="8"/><circle cx="78" cy="350" r="8"/><circle cx="222" cy="344" r="8"/><circle cx="262" cy="292" r="8"/><circle cx="226" cy="258" r="8"/></g>
      <rect x="146" y="216" width="48" height="166" fill="url(#ft)"/><rect x="46" y="216" width="248" height="16" fill="#000" opacity=".2"/>
      <g class="tampa"><rect x="32" y="168" width="276" height="56" rx="9" fill="#cb2f40"/><rect x="32" y="168" width="276" height="10" rx="5" fill="#fff" opacity=".2"/><rect x="143" y="168" width="54" height="56" fill="url(#ft)"/>
        <path d="M170 168c-70-10-112-46-92-76s74 14 92 76c18-62 72-106 92-76s-22 66-92 76Z" fill="url(#ft)"/><path d="M166 160c-42-12-68-36-58-50s44 12 58 50ZM174 160c42-12 68-36 58-50s-44 12-58 50Z" fill="#b87a1b"/>
        <path d="M158 160 118 214l22-2 8 18 22-58 22 58 8-18 22 2-40-54Z" fill="#eab043" opacity=".9"/><rect x="150" y="148" width="40" height="30" rx="11" fill="#ffdf95"/></g></g></svg>`);
}
