import { estourar } from './neve.js';
import { bolinha, enfeiteGrande, montarArvore, presente, varal } from './desenhos.js';

const app = document.getElementById('app');

/* ---------- Ajudantes ---------- */

function h(tag, props = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...filhos.flat().filter((f) => f != null && f !== false));
  return el;
}

async function api(metodo, url, corpo, chave) {
  let r;
  try {
    r = await fetch(`/api${url}`, {
      method: metodo,
      headers: { ...(corpo && { 'content-type': 'application/json' }), ...(chave && { 'x-chave': chave }) },
      body: corpo && JSON.stringify(corpo),
    });
  } catch { throw new Error('Sem conexão com o servidor. Tente de novo.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'Algo deu errado. Tente de novo.');
  return j;
}

function aviso(msg, ruim) {
  const el = h('div', { className: `aviso ${ruim ? 'ruim' : ''}` }, msg);
  document.getElementById('avisos').append(el);
  setTimeout(() => el.remove(), 4200);
}

/** Roda uma ação travando o botão, e mostra o erro se falhar. */
async function tentar(botao, fn) {
  if (botao) botao.disabled = true;
  try { return await fn(); } catch (e) { aviso(e.message, true); } finally { if (botao) botao.disabled = false; }
}

async function copiar(txt) {
  try { await navigator.clipboard.writeText(txt); } catch {
    // Fora de https o navegador bloqueia a área de transferência; usa o jeito antigo.
    const t = h('textarea', { value: txt });
    document.body.append(t); t.select(); document.execCommand('copy'); t.remove();
  }
  aviso('Link copiado');
}

const guardados = {
  ler() { try { return JSON.parse(localStorage.getItem('sorteios')) || []; } catch { return []; } },
  por(s) { try { localStorage.setItem('sorteios', JSON.stringify([s, ...this.ler().filter((x) => x.id !== s.id)].slice(0, 12))); } catch { /* navegação privada */ } },
};

const carta = (...f) => h('section', { className: 'carta' }, h('div', { className: 'carta-miolo' }, ...f));
const campo = (rotulo, entrada, dica) => h('label', { className: 'campo' }, h('span', {}, rotulo, dica && h('small', {}, ` ${dica}`)), entrada);
const nomesDe = (t) => t.split(/[\n,;]+/).map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);

/** Botão que abre um .txt, .csv ou .xlsx e entrega os nomes lidos. Também aceita soltar o arquivo em `alvo`. */
function importador(rotulo, receber, alvo) {
  const ler = (arq) => arq && tentar(botao, async () => receber(await importarNomes(arq)));
  const entrada = h('input', { type: 'file', accept: '.txt,.csv,.xlsx', hidden: true, onchange() { ler(entrada.files[0]); entrada.value = ''; } });
  const botao = h('button', { type: 'button', className: 'botao claro', onclick: () => entrada.click() }, rotulo);
  if (alvo) {
    alvo.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); alvo.classList.add('soltar'); } });
    alvo.addEventListener('dragleave', () => alvo.classList.remove('soltar'));
    alvo.addEventListener('drop', (e) => { alvo.classList.remove('soltar'); if (e.dataTransfer.files.length) { e.preventDefault(); ler(e.dataTransfer.files[0]); } });
  }
  return h('div', { className: 'importar' }, botao, entrada, h('span', { className: 'dica' }, 'Aceita TXT, CSV e XLSX'));
}
const semRepetir = (atuais, novos) => {
  const vistos = new Set(atuais.map((n) => n.toLocaleLowerCase('pt-BR')));
  return novos.filter((n) => !vistos.has(n.toLocaleLowerCase('pt-BR')));
};
const quantos = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function mostrar(...els) {
  app.replaceChildren(...els);
  scrollTo(0, 0);
}

/* ---------- Modo de usar: abre sozinho na primeira visita e fica num botão ---------- */

const USO = {
  organizador: ['Como organizar', [
    ['Preencha a cartinha.', 'Dê um nome ao amigo secreto e, se quiser, o dia, o valor e o lugar.'],
    ['Coloque os nomes.', 'Escreva um por linha ou importe um arquivo TXT, CSV ou XLSX.'],
    ['Guarde a sua página.', 'Depois de criar, você cai na página do organizador. Salve esse endereço e não mande para a turma.'],
    ['Faça o sorteio.', 'Antes, se precisar, marque quem não pode se tirar, como casais.'],
    ['Chame a turma.', 'Mostre o telão com o QR code e o PIN, ou mande o link no WhatsApp. Cada um entra do próprio aparelho.'],
  ], 'Nem a sua página mostra quem tirou quem.'],
  participante: ['Como usar', [
    ['Toque no seu nome.', 'Use o seu celular (iPhone ou Android) ou computador, de onde estiver. Cada bolinha é uma pessoa.'],
    ['Crie uma senha de 4 números.', 'Guarde bem: só com ela dá para ver quem você tirou.'],
    ['Abra a caixa.', 'Ela aparece assim que o sorteio for feito. Toque no presente e veja o nome. Confira se ninguém está espiando!'],
    ['Deixe a sua lista de desejos.', 'Só quem tirou você vai ler.'],
    ['Volte quando quiser.', 'Entre com a mesma senha, até de outro aparelho, para rever o nome e a lista da pessoa.'],
  ], 'Vai pegar por uma criança? Toque no nome dela e crie outra senha. Esqueceu a senha? Peça para quem organizou apagar.'],
};
function comoUsar(tipo) {
  const [titulo, passos, nota] = USO[tipo];
  const d = h('dialog', { 'aria-label': titulo, onclose: () => { d.remove(); try { localStorage.setItem(`viu-${tipo}`, '1'); } catch { /* navegação privada */ } } },
    carta(h('h2', {}, titulo), h('ol', { className: 'passos' }, passos.map(([a, b]) => h('li', {}, h('b', {}, a), ` ${b}`))), h('p', { className: 'dica' }, nota),
      h('button', { className: 'botao cheio', onclick: () => d.close() }, 'Entendi')));
  document.body.append(d);
  d.showModal();
}
function primeiraVisita(tipo) {
  try { if (localStorage.getItem(`viu-${tipo}`)) return; } catch { /* mostra */ }
  comoUsar(tipo);
}
const botaoUso = (tipo) => h('p', { className: 'ver-uso' }, h('button', { className: 'botao claro', onclick: () => comoUsar(tipo) }, 'Como usar'));

/* ---------- PIN do sorteio, QR code e link da turma ---------- */

const NA_MAQUINA = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const siteDaTurma = (g) => (NA_MAQUINA && (g.site || g.enderecoRede)) || location.origin;
const linkDaTurma = (g) => `${siteDaTurma(g)}/g/${g.id}`;
const pinBonito = (c) => `${c.slice(0, 3)} ${c.slice(3)}`;

function qr(texto) {
  const q = qrcode(0, 'M');
  q.addData(texto);
  q.make();
  const n = q.getModuleCount(), ns = 'http://www.w3.org/2000/svg';
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
  const s = document.createElementNS(ns, 'svg'), p = document.createElementNS(ns, 'path');
  for (const [k, v] of [['viewBox', `0 0 ${n + 8} ${n + 8}`], ['class', 'qr'], ['role', 'img'], ['aria-label', 'QR code para entrar no sorteio'], ['shape-rendering', 'crispEdges']]) s.setAttribute(k, v);
  p.setAttribute('d', d);
  s.append(p);
  return s;
}

/** Mostra o globo de neve enquanto o servidor sorteia. Devolve o resultado, ou undefined se falhou. */
async function globoDeNeve(g, botao, pedir) {
  const d = h('dialog', { oncancel: (e) => e.preventDefault() }, h('div', { className: 'globo' },
    h('div', { className: 'bola' }, [...g.participantes].sort(() => Math.random() - .5).slice(0, 6).map((p, i) => {
      const el = h('i', {}, p.nome.split(' ')[0].slice(0, 12));
      el.style.animationDelay = `${-i * .19}s`;
      return el;
    })), h('h2', {}, 'Misturando os nomes…')));
  document.body.append(d); d.showModal();
  const pausa = new Promise((r) => setTimeout(r, 2400));
  return tentar(botao, async () => {
    try { const novo = await pedir(); await pausa; return novo; } finally { d.close(); d.remove(); }
  });
}

/** Árvore com uma bolinha por pessoa: apagada, entrou (cor viva) ou acesa (abriu o presente). */
function arvoreDe(g, largura, aoTocar, novos = new Set()) {
  const total = g.participantes.length;
  const a = montarArvore(total, largura, g.participantes.every((p) => p.abriu));
  const arvore = h('div', { className: 'arvore', role: 'group', 'aria-label': 'Participantes' }, a.desenho);
  arvore.style.width = `${largura}px`; arvore.style.height = `${a.altura}px`;
  g.participantes.forEach((p, i) => {
    const b = h(aoTocar ? 'button' : 'div', { className: `bolinha ${p.abriu ? 'acesa' : p.temPin ? 'entrou' : ''} ${novos.has(p.id) ? 'chegou' : ''}`, title: p.nome, onclick: aoTocar && (() => aoTocar(p)) },
      bolinha(i), h('span', {}, p.nome), p.abriu && h('em', { className: 'so-leitor' }, ' (já abriu o presente)'));
    Object.assign(b.style, { left: `${a.pos[i].x}px`, top: `${a.pos[i].y}px`, width: `${a.larguraItem}px` });
    arvore.append(b);
  });
  return { arvore, altura: a.altura };
}

function detalhes(g) {
  const itens = [];
  if (g.data) {
    const [a, m, d] = g.data.split('-').map(Number);
    const dia = new Date(a, m - 1, d), hoje = new Date();
    const faltam = Math.round((dia - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) / 864e5);
    const quando = faltam > 1 ? `faltam ${faltam} dias` : faltam === 1 ? 'é amanhã' : faltam === 0 ? 'é hoje!' : '';
    itens.push(h('li', {}, h('b', {}, dia.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })), quando && `, ${quando}`));
  }
  if (g.local) itens.push(h('li', {}, 'em ', h('b', {}, g.local)));
  if (g.valor) itens.push(h('li', {}, 'presente de ', h('b', {}, g.valor)));
  return h('ul', { className: 'detalhes' }, itens);
}

function camposFesta(v = {}) {
  const nome = h('input', { required: true, maxLength: 60, value: v.nome ?? '', placeholder: 'Natal da família Souza', autocomplete: 'off' });
  const data = h('input', { type: 'date', value: v.data ?? '' });
  const valor = h('input', { maxLength: 40, value: v.valor ?? '', placeholder: 'até R$ 80', autocomplete: 'off' });
  const local = h('input', { maxLength: 80, value: v.local ?? '', placeholder: 'casa da vó Lúcia', autocomplete: 'off' });
  return {
    els: [campo('Nome do amigo secreto', nome),
      h('div', { className: 'dupla' }, campo('Dia da troca', data, '(opcional)'), campo('Valor do presente', valor, '(opcional)')),
      campo('Onde vai ser', local, '(opcional)')],
    ler: () => ({ nome: nome.value, data: data.value, valor: valor.value, local: local.value }),
  };
}

/** Campo de números em quadradinhos. `oculto` mostra pontos no lugar dos números. */
function quadradinhos(n, rotulo, { oculto, id, aoCompletar, aoMudar } = {}) {
  const casas = Array.from({ length: n }, () => h('i', { 'aria-hidden': 'true' }));
  const entrada = h('input', { id, type: 'text', inputMode: 'numeric', required: true, autocomplete: 'off', enterKeyHint: 'go', 'aria-label': rotulo,
    oninput() {
      entrada.value = entrada.value.replace(/\D/g, '').slice(0, n);
      pintar();
      aoMudar?.();
      if (entrada.value.length === n) aoCompletar?.();
    },
    onfocus: noFim, onclick: noFim });
  // O cursor fica sempre no fim, como nos quadradinhos.
  function noFim() { entrada.setSelectionRange(n, n); }
  function pintar() {
    const v = entrada.value;
    casas.forEach((c, i) => {
      c.textContent = v[i] ? (oculto ? '•' : v[i]) : '';
      c.className = `${v[i] ? 'cheio' : ''} ${i === v.length ? 'vez' : ''}`;
    });
  }
  pintar();
  return { el: h('div', { className: `pin ${n === 6 ? 'seis' : ''}` }, casas, entrada), entrada, limpar() { entrada.value = ''; pintar(); entrada.focus(); } };
}

/* ---------- Início: entrar com o PIN ---------- */

function telaEntrar() {
  document.title = 'Amigo Secreto de Natal';
  const erro = h('p', { className: 'erro', role: 'alert' });
  const codigo = quadradinhos(6, 'PIN do sorteio, 6 números', { id: 'codigo', aoMudar() { erro.textContent = ''; }, aoCompletar: () => form.requestSubmit() });
  const botao = h('button', { className: 'botao grande cheio' }, 'Entrar');
  const form = h('form', { async onsubmit(e) {
    e.preventDefault();
    const n = codigo.entrada.value;
    if (n.length !== 6 || botao.disabled) { if (n.length !== 6) erro.textContent = 'O PIN tem 6 números.'; return; }
    botao.disabled = true;
    try { location.href = `/g/${(await api('GET', `/codigo/${n}`)).id}`; } catch (x) { erro.textContent = x.message; codigo.limpar(); } finally { botao.disabled = false; }
  } }, carta(h('h2', {}, 'Digite o PIN do sorteio'), codigo.el, erro, botao,
    h('p', { className: 'dica' }, 'Ou aponte a câmera do celular para o QR code.')));
  const meus = guardados.ler();
  mostrar(h('div', { className: 'entrada' },
    h('header', { className: 'chamada' }, h('h1', {}, 'Amigo Secreto')), form,
    h('div', { className: 'acoes' }, h('a', { className: 'botao verde', href: '/novo' }, 'Criar um sorteio'), h('button', { className: 'botao claro', onclick: () => comoUsar('participante') }, 'Como usar')),
    meus.length > 0 && h('nav', { className: 'meus' }, h('p', {}, 'Sorteios que você organiza'), meus.map((s) => h('a', { href: `/organizar/${s.id}#${s.chave}` }, s.nome)))));
}

/* ---------- Telão: QR code, PIN e a turma chegando ao vivo ---------- */

async function telaTelao(id) {
  const base = `/grupos/${id}`;
  let g = await api('GET', base), festejou = g.participantes.every((p) => p.abriu);
  const chave = guardados.ler().find((s) => s.id === id)?.chave;
  document.body.classList.add('modo-telao');
  function desenhar(novos) {
    document.title = `${g.nome} | telão`;
    const total = g.participantes.length, entraram = g.participantes.filter((p) => p.temPin).length, abriram = g.participantes.filter((p) => p.abriu).length;
    const largo = innerWidth >= 900, largura = Math.min(largo ? app.clientWidth - 460 : app.clientWidth - 32, 660);
    const { arvore, altura } = arvoreDe(g, largura, null, novos);
    // Cabe inteira na tela: num telão ninguém rola a página.
    const escala = largo ? Math.min(1, Math.max(.55, (innerHeight - 110) / altura)) : 1;
    arvore.style.transform = `scale(${escala})`; arvore.style.transformOrigin = '50% 0'; arvore.style.marginBottom = `${-altura * (1 - escala)}px`;
    const botao = h('button', { className: 'botao grande', async onclick() {
      const novo = await globoDeNeve(g, botao, () => api('POST', `${base}/sortear`, {}, chave));
      if (novo) { g = novo; desenhar(); estourar(innerWidth / 2, innerHeight * .6); tocarSinos(); }
    } }, 'Sortear os nomes');
    const situacao = !g.sorteado ? (entraram === total ? 'Todos chegaram!' : `${entraram} de ${total} já entraram`)
      : abriram === total ? 'Feliz Natal! Todos já sabem quem tiraram.' : `Abram os presentes! ${abriram} de ${total} já abriram`;
    const y = scrollY;
    mostrar(h('div', { className: 'telao' },
      h('section', { className: 'telao-lado' }, h('h1', {}, g.nome),
        h('div', { className: 'cartao-qr' }, qr(linkDaTurma(g)), h('p', {}, 'Aponte a câmera ou entre em'), h('b', { className: 'site' }, new URL(siteDaTurma(g)).host), h('p', {}, 'e digite o PIN'), h('strong', {}, pinBonito(g.codigo))),
        h('p', { className: 'placar', role: 'status' }, situacao),
        chave && !g.sorteado && botao,
        chave && h('a', { className: 'botao claro', href: `/organizar/${id}#${chave}` }, 'Página do organizador')),
      h('section', {}, arvore)));
    scrollTo(0, y);
    if (abriram === total && !festejou) { festejou = true; estourar(innerWidth * .65, innerHeight * .4); tocarSinos(); }
  }
  desenhar();
  setInterval(async () => {
    if (document.hidden || document.querySelector('dialog')) return;
    const novo = await api('GET', base).catch(() => null);
    if (!novo || document.querySelector('dialog') || JSON.stringify(novo) === JSON.stringify(g)) return;
    const antes = new Map(g.participantes.map((p) => [p.id, p]));
    const novos = new Set(novo.participantes.filter((p) => { const a = antes.get(p.id); return a && ((p.temPin && !a.temPin) || (p.abriu && !a.abriu)); }).map((p) => p.id));
    g = novo;
    desenhar(novos);
  }, 3000);
  let espera;
  addEventListener('resize', () => { clearTimeout(espera); espera = setTimeout(() => !document.querySelector('dialog') && desenhar(), 150); });
}

/* ---------- Criar sorteio ---------- */

function telaNovo() {
  document.title = 'Amigo Secreto de Natal';
  const festa = camposFesta();
  const etiquetas = h('div', { className: 'etiquetas' });
  const conta = h('p', { className: 'dica' });
  const lista = h('textarea', { required: true, placeholder: 'Ana\nBruno\nCarla\nDiego', oninput: atualizar });
  function atualizar() {
    const n = nomesDe(lista.value);
    etiquetas.replaceChildren(...n.map((x) => h('span', { className: 'etiqueta' }, x)));
    conta.textContent = n.length < 3 ? 'Coloque pelo menos 3 pessoas.' : `${n.length} pessoas na lista.`;
  }
  atualizar();
  const importar = importador('Importar lista', ({ nomes, repetidos }) => {
    const atuais = nomesDe(lista.value), novos = semRepetir(atuais, nomes), fora = repetidos + nomes.length - novos.length;
    lista.value = [...atuais, ...novos].join('\n');
    atualizar();
    aviso(quantos(novos.length, 'nome importado', 'nomes importados') + (fora ? `, ${quantos(fora, 'repetido ficou', 'repetidos ficaram')} de fora` : ''));
  }, lista);
  const botao = h('button', { className: 'botao grande cheio' }, 'Criar amigo secreto');
  const form = h('form', { onsubmit(e) {
    e.preventDefault();
    tentar(botao, async () => {
      const dados = festa.ler();
      const r = await api('POST', '/grupos', { ...dados, participantes: nomesDe(lista.value) });
      guardados.por({ ...r, nome: dados.nome });
      location.href = `/organizar/${r.id}#${r.chave}`;
    });
  } }, carta(h('h2', {}, 'Querido Papai Noel,'), ...festa.els, campo('Quem vai participar', lista, '(um nome por linha)'), importar, conta, etiquetas, botao));

  const meus = guardados.ler();
  mostrar(h('div', { className: 'inicio' },
    h('header', { className: 'chamada' }, h('h1', {}, 'Amigo Secreto'),
      h('p', {}, 'Escreva os nomes e chame a turma com QR code ou PIN. Cada um abre o seu presente no próprio celular ou computador.'),
      h('div', { className: 'ver-uso acoes centro' }, h('button', { className: 'botao claro', onclick: () => comoUsar('organizador') }, 'Como usar'), h('a', { className: 'botao claro', href: '/' }, 'Tenho um PIN')),
      enfeiteGrande(),
      meus.length > 0 && h('nav', { className: 'meus' }, h('p', {}, 'Sorteios que você organiza'),
        meus.map((s) => h('a', { href: `/organizar/${s.id}#${s.chave}` }, s.nome)))),
    form));
  primeiraVisita('organizador');
}

/* ---------- Organizador ---------- */

async function telaOrganizar(id) {
  const chave = location.hash.slice(1);
  const base = `/grupos/${id}`;
  let g = await api('GET', `${base}/admin`, null, chave);
  guardados.por({ id, chave, nome: g.nome });
  // Só muda a tela depois que o servidor confirma.
  const agir = (botao, metodo, url, corpo, msg) => tentar(botao, async () => {
    g = await api(metodo, base + url, corpo, chave);
    desenhar();
    if (msg) aviso(msg);
  });

  async function sortearAgora(botao) {
    const novo = await globoDeNeve(g, botao, () => api('POST', `${base}/sortear`, {}, chave));
    if (!novo) return;
    g = novo; desenhar(); aviso('Sorteio feito! As caixas já apareceram para a turma.');
    estourar(innerWidth / 2, innerHeight * .6);
  }

  function desenhar() {
    document.title = `${g.nome} | organizar`;
    const link = linkDaTurma(g);
    const convite = `🎄 ${g.nome}: entre no link, toque no seu nome e descubra quem você tirou! ${link} (ou digite o PIN ${pinBonito(g.codigo)} em ${siteDaTurma(g)})`;
    const nome = (pid) => g.participantes.find((p) => p.id === pid)?.nome ?? '';
    const abertos = g.participantes.filter((p) => p.abriu).length;

    const sorteio = g.sorteado
      ? carta(h('h2', {}, 'Nomes sorteados'),
        h('p', {}, abertos === g.participantes.length ? 'Todo mundo já abriu o presente.' : `${abertos} de ${g.participantes.length} já abriram o presente. Nem você consegue ver quem tirou quem por aqui.`),
        h('div', {}, h('button', { className: 'texto-botao', onclick(e) {
          if (confirm('Desfazer o sorteio? Quem já abriu o presente vai tirar outro nome.')) agir(e.target, 'POST', '/desfazer', {}, 'Sorteio desfeito');
        } }, 'Desfazer o sorteio')))
      : carta(h('h2', {}, 'Tudo pronto?'), h('p', {}, `${g.participantes.length} pessoas na lista. Depois do sorteio a lista fica travada.`),
        h('button', { className: 'botao grande', onclick: (e) => sortearAgora(e.currentTarget) }, 'Sortear os nomes'));

    const convidar = carta(h('h2', {}, 'Chame a turma'),
      h('p', {}, 'Por QR code, PIN ou link. Cada pessoa toca no próprio nome e cria uma senha.'),
      h('div', { className: 'convite-qr' }, qr(link), h('p', {}, 'PIN do sorteio', h('strong', {}, pinBonito(g.codigo)))),
      h('div', { className: 'link' }, link),
      NA_MAQUINA && !link.startsWith('https:') && h('p', { className: 'dica' }, 'Este link funciona para quem está no mesmo Wi-Fi que este computador.'),
      h('div', { className: 'acoes' },
        h('a', { className: 'botao', href: `/telao/${id}` }, 'Abrir o telão'),
        h('a', { className: 'botao verde', href: `https://wa.me/?text=${encodeURIComponent(convite)}`, target: '_blank', rel: 'noopener noreferrer' }, 'Mandar no WhatsApp'),
        h('button', { className: 'botao claro', onclick: () => copiar(link) }, 'Copiar link'),
        h('a', { className: 'botao claro', href: `/g/${id}` }, 'Ver a árvore')));

    const novos = h('input', { placeholder: 'Nome de quem faltou', maxLength: 400, 'aria-label': 'Nome de quem faltou' });
    const pessoas = carta(h('h2', {}, 'Participantes'),
      h('ul', { className: 'lista' }, g.participantes.map((p) => {
        const sit = [p.abriu ? 'já abriu o presente' : p.temPin ? 'já entrou' : 'ainda não entrou', g.comDesejos.includes(p.id) && 'deixou lista de desejos'].filter(Boolean).join(', ');
        return h('li', {}, h('i', { className: `luz ${p.abriu ? 'on' : ''}` }), h('div', { className: 'quem' }, p.nome, h('small', {}, sit)),
          p.temPin && h('button', { className: 'texto-botao', 'aria-label': `Apagar senha de ${p.nome}`, onclick(e) {
            if (confirm(`Apagar a senha de ${p.nome}? A pessoa cria outra quando entrar.`)) agir(e.target, 'POST', `/participantes/${p.id}/resetar-pin`, {}, 'Senha apagada');
          } }, 'Apagar senha'),
          !g.sorteado && h('button', { className: 'texto-botao', 'aria-label': `Tirar ${p.nome} da lista`, onclick(e) {
            if (confirm(`Tirar ${p.nome} da lista?`)) agir(e.target, 'DELETE', `/participantes/${p.id}`);
          } }, 'Tirar'));
      })),
      !g.sorteado && h('form', { className: 'linha-campos', onsubmit(e) {
        e.preventDefault();
        agir(e.submitter, 'POST', '/participantes', { nomes: nomesDe(novos.value) });
      } }, novos, h('button', { className: 'botao verde' }, 'Adicionar')),
      !g.sorteado && importador('Importar lista', async ({ nomes }) => {
        const faltam = semRepetir(g.participantes.map((p) => p.nome), nomes);
        if (!faltam.length) return aviso('Todos os nomes do arquivo já estão na lista.');
        if (!confirm(`Adicionar ${quantos(faltam.length, 'pessoa', 'pessoas')}?\n\n${faltam.slice(0, 20).join('\n')}${faltam.length > 20 ? '\n…' : ''}`)) return;
        g = await api('POST', `${base}/participantes`, { nomes: faltam }, chave);
        desenhar();
        aviso(quantos(faltam.length, 'pessoa adicionada', 'pessoas adicionadas'));
      }));

    const opcoes = () => g.participantes.map((p) => h('option', { value: p.id }, p.nome));
    const a = h('select', { 'aria-label': 'Primeira pessoa' }, opcoes()), b = h('select', { 'aria-label': 'Segunda pessoa' }, opcoes());
    if (b.options.length > 1) b.selectedIndex = 1;
    const restricoes = (!g.sorteado || g.restricoes.length > 0) && carta(h('h2', {}, 'Quem não pode se tirar'),
      h('p', { className: 'dica' }, 'Bom para casais ou para quem já se tirou no ano passado. Vale para os dois lados.'),
      g.restricoes.length > 0 && h('ul', { className: 'lista' }, g.restricoes.map((r) => h('li', {}, h('div', { className: 'quem' }, `${nome(r[0])} e ${nome(r[1])}`),
        !g.sorteado && h('button', { className: 'texto-botao', 'aria-label': `Remover ${nome(r[0])} e ${nome(r[1])}`, onclick: (e) => agir(e.target, 'PUT', '/restricoes', { pares: g.restricoes.filter((x) => x !== r) }) }, 'Remover')))),
      !g.sorteado && h('form', { className: 'linha-campos', onsubmit(e) {
        e.preventDefault();
        if (a.value === b.value) return aviso('Escolha duas pessoas diferentes.', true);
        agir(e.submitter, 'PUT', '/restricoes', { pares: [...g.restricoes, [a.value, b.value]] });
      } }, a, h('span', {}, 'e'), b, h('button', { className: 'botao verde' }, 'Adicionar')));

    const festa = camposFesta(g);
    const editar = h('form', { onsubmit(e) { e.preventDefault(); agir(e.submitter, 'PATCH', '', festa.ler(), 'Alterações salvas'); } },
      carta(h('h2', {}, 'Dados da festa'), ...festa.els, h('div', {}, h('button', { className: 'botao verde' }, 'Salvar alterações'))));

    const y = scrollY;
    mostrar(h('div', { className: 'painel' },
      h('header', { className: 'festa' }, h('h1', {}, g.nome), detalhes(g),
        h('p', { className: 'convite' }, 'Guarde o endereço desta página: só por ele dá para organizar. Não mande este link para a turma.')),
      convidar, sorteio, pessoas, ...[restricoes].filter(Boolean), editar));
    scrollTo(0, y);
  }
  desenhar();
}

/* ---------- Árvore: cada um toca no seu nome ---------- */

async function telaArvore(id) {
  const base = `/grupos/${id}`;
  let g = await api('GET', base), naArvore = true, larguraAntes = 0, vigia = 0;

  function desenhar() {
    document.title = g.nome;
    const abertos = g.participantes.filter((p) => p.abriu).length, total = g.participantes.length;
    const largura = larguraAntes = Math.min(app.clientWidth - 32, 660);
    const { arvore } = arvoreDe(g, largura, pedirPin);
    const y = scrollY;
    mostrar(h('div', { className: 'festa' }, h('h1', {}, g.nome), detalhes(g),
      h('p', { className: 'convite' }, !g.sorteado ? 'O sorteio ainda não foi feito. Toque no seu nome e já deixe sua lista de desejos.'
        : abertos === total ? 'Todos já sabem quem tiraram. A árvore está toda acesa!' : 'Toque no seu nome para abrir o seu presente. Sua bolinha acende na árvore.'),
      botaoUso('participante'), arvore, g.sorteado && h('p', { className: 'placar' }, `${abertos} de ${total} bolinhas acesas`)));
    scrollTo(0, y);
  }

  async function atualizar() {
    if (!naArvore || document.hidden || document.querySelector('dialog')) return;
    const novo = await api('GET', base).catch(() => null);
    if (!novo || !naArvore || document.querySelector('dialog') || JSON.stringify(novo) === JSON.stringify(g)) return;
    g = novo;
    desenhar();
  }

  async function pedirPin(p) {
    // Confere o estado mais novo: outra pessoa pode ter criado a senha há pouco.
    try { g = await api('GET', base); } catch (e) { return aviso(e.message, true); }
    p = g.participantes.find((x) => x.id === p.id);
    if (!p || document.querySelector('dialog')) return p || desenhar();
    const criar = !p.temPin;
    const erro = h('p', { className: 'erro', role: 'alert' });
    const campoSenha = quadradinhos(4, 'Senha de 4 números', { oculto: !criar, aoMudar() { erro.textContent = ''; } }), pin = campoSenha.entrada;
    const ok = h('button', { className: 'botao cheio' }, criar ? `Sou ${p.nome}, criar senha` : 'Entrar');
    const d = h('dialog', { onclose: () => { d.remove(); if (naArvore) desenhar(); }, onclick: (e) => e.target === d && d.close() }, h('form', { async onsubmit(e) {
      e.preventDefault();
      ok.disabled = true; erro.textContent = '';
      try {
        const r = await api('POST', `${base}/entrar`, { pid: p.id, pin: pin.value, criar });
        naArvore = false;
        d.close();
        pessoal({ pid: p.id, pin: pin.value }, r);
      } catch (x) { erro.textContent = x.message; campoSenha.limpar(); } finally { ok.disabled = false; }
    } }, carta(h('h2', {}, `Olá, ${p.nome}!`),
      h('p', {}, criar ? 'Crie uma senha de 4 números. Só com ela dá para ver quem você tirou.' : 'Digite a sua senha de 4 números.'),
      campoSenha.el, erro, ok,
      h('button', { type: 'button', className: 'texto-botao', onclick: () => d.close() }, 'Não sou eu, voltar'),
      !criar && h('p', { className: 'dica' }, 'Esqueceu? Peça para quem organizou apagar a sua senha.'))));
    document.body.append(d); d.showModal(); pin.focus();
  }

  function pessoal(cred, r) {
    const desejos = h('textarea', { value: r.eu.desejos, maxLength: 600, placeholder: 'Livro de receitas, meias divertidas, chocolate amargo, camiseta M…' });
    const listaDela = h('div');
    const titulo = h('h1', {}, r.sorteado ? (r.eu.abriu ? `${r.eu.nome}, é só abrir de novo` : `${r.eu.nome}, este é o seu presente`) : `Olá, ${r.eu.nome}!`);

    const dica = h('p', {}, r.sorteado ? 'Toque na caixa. Veja se ninguém está espiando!' : 'Você está na árvore! Esperando o sorteio… a sua caixa aparece aqui sozinha. Enquanto isso, conte o que gostaria de ganhar.');
    const palco = h('div', { className: 'palco' });
    function fechar() {
      listaDela.replaceChildren();
      const caixa = h('button', { className: 'caixa', 'aria-label': 'Abrir o presente', onclick: () => tentar(caixa, async () => {
        const { amigo } = await api('POST', `${base}/abrir`, cred);
        caixa.classList.add('aberta');
        caixa.tabIndex = -1;
        tocarSinos();
        const q = palco.getBoundingClientRect();
        setTimeout(() => estourar(q.left + q.width / 2, q.top + q.height * .55), 250);
        titulo.textContent = 'Você tirou…'; dica.hidden = true;
        palco.append(h('div', { className: 'cartao-nome', role: 'status' }, h('p', {}, 'Seu amigo secreto é'), h('strong', {}, amigo.nome)));
        listaDela.replaceChildren(carta(h('h2', {}, `O que ${amigo.nome} quer ganhar`),
          amigo.desejos ? h('p', { className: 'desejos-dele' }, amigo.desejos) : h('p', {}, 'Ainda não deixou sugestões. Volte outro dia para conferir.'),
          h('button', { className: 'botao claro', onclick() { fechar(); dica.hidden = false; titulo.textContent = `${r.eu.nome}, é só abrir de novo`; scrollTo({ top: 0, behavior: 'smooth' }); } }, 'Fechar a caixa')));
      }) }, presente());
      palco.replaceChildren(caixa);
    }
    if (r.sorteado) fechar();
    // Ainda sem sorteio: fica de olho e mostra a caixa na hora, sem perder o que a pessoa digitou.
    clearInterval(vigia);
    if (!r.sorteado) vigia = setInterval(async () => {
      if (document.hidden) return;
      const novo = await api('GET', base).catch(() => null);
      if (!novo?.sorteado || naArvore) return;
      clearInterval(vigia);
      const r2 = await api('POST', `${base}/entrar`, cred).catch((e) => aviso(e.message, true));
      if (!r2 || naArvore) return;
      r2.eu.desejos = desejos.value;
      pessoal(cred, r2);
      aviso('O sorteio foi feito!');
    }, 3000);

    listaDela.className = 'lista-dele';
    const salvar = h('button', { className: 'botao verde' }, 'Salvar minha lista');
    mostrar(h('div', { className: 'pessoal' }, titulo,
      dica,
      r.sorteado && palco, listaDela,
      h('form', { className: 'lista-dele', onsubmit(e) {
        e.preventDefault();
        tentar(salvar, async () => { await api('PUT', `${base}/desejos`, { ...cred, desejos: desejos.value }); aviso('Lista salva'); });
      } }, carta(h('h2', {}, 'Minha lista de desejos'), h('p', { className: 'dica' }, 'Só quem tirou você vai ler.'), campo('O que você gostaria de ganhar', desejos), h('div', {}, salvar))),
      h('button', { className: 'botao claro', async onclick() {
        g = await api('GET', base).catch(() => g);
        clearInterval(vigia); naArvore = true; desenhar();
      } }, 'Sair e voltar para a árvore')));
    app.focus({ preventScroll: true });
  }

  desenhar();
  primeiraVisita('participante');
  setInterval(atualizar, 12_000);
  addEventListener('resize', () => {
    if (naArvore && !document.querySelector('dialog') && Math.min(app.clientWidth - 32, 660) !== larguraAntes) desenhar();
  });
}

function tocarSinos() {
  try {
    const ac = new AudioContext(), t0 = ac.currentTime + .25;
    [1318.5, 1568, 2093, 2637].forEach((f, i) => {
      for (const [mult, vol] of [[1, .09], [2.76, .025]]) {
        const o = ac.createOscillator(), v = ac.createGain(), t = t0 + i * .13;
        o.frequency.value = f * mult;
        v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(vol, t + .01); v.gain.exponentialRampToValueAtTime(.0001, t + 1.3);
        o.connect(v).connect(ac.destination); o.start(t); o.stop(t + 1.4);
      }
    });
    setTimeout(() => ac.close(), 2500);
  } catch { /* sem som */ }
}

/* ---------- Começo ---------- */

const faixa = document.getElementById('varal');
const porVaral = () => faixa.replaceChildren(varal(innerWidth));
porVaral();
let larg = innerWidth;
addEventListener('resize', () => { if (innerWidth !== larg) { larg = innerWidth; porVaral(); } });

const [, tela, id] = location.pathname.split('/');
try {
  if (tela === 'g') await telaArvore(id);
  else if (tela === 'organizar') await telaOrganizar(id);
  else if (tela === 'telao') await telaTelao(id);
  else if (tela === 'novo') telaNovo();
  else telaEntrar();
} catch (e) {
  mostrar(carta(h('h2', {}, 'Esse link não abriu'), h('p', {}, e.message), h('div', {}, h('a', { className: 'botao', href: '/' }, 'Ir para o início'))));
}
