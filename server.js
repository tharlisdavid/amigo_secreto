import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promises as fs, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { sortear } from './sorteio.js';
import { CSP_DEMO, montarDemo } from './demo/pagina.mjs';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUBLICO = path.join(RAIZ, 'public');
const DADOS = process.env.DADOS || path.join(RAIZ, 'data');
const PORTA = Number(process.env.PORT ?? 2512);
const MAX_PESSOAS = 60;
const MIN_PESSOAS = 3;
const MAX_GRUPOS = 300; // aberto na internet, evita que alguém encha o disco
const scryptAsync = promisify(scrypt);

/* ---------- Armazenamento: um arquivo JSON por sorteio ---------- */

mkdirSync(DADOS, { recursive: true });
const grupos = new Map();
for (const arq of readdirSync(DADOS).filter((f) => f.endsWith('.json'))) {
  const g = JSON.parse(readFileSync(path.join(DADOS, arq), 'utf8'));
  grupos.set(g.id, g);
}

// PIN do sorteio: 6 números, é o que a turma digita para entrar.
const porCodigo = new Map();
function darCodigo(g) {
  while (!g.codigo || porCodigo.has(g.codigo)) g.codigo = String(randomInt(100000, 1000000));
  porCodigo.set(g.codigo, g.id);
}
for (const g of grupos.values()) if (g.codigo) porCodigo.set(g.codigo, g.id);

const filas = new Map();
function salvar(g) {
  const gravar = async () => {
    const destino = path.join(DADOS, `${g.id}.json`);
    await fs.writeFile(`${destino}.tmp`, JSON.stringify(g, null, 2), { mode: 0o600 });
    await fs.rename(`${destino}.tmp`, destino);
  };
  const p = (filas.get(g.id) ?? Promise.resolve()).catch(() => {}).then(gravar);
  filas.set(g.id, p);
  return p;
}

for (const g of grupos.values()) if (!g.codigo) { darCodigo(g); salvar(g); }

/* ---------- Utilidades ---------- */

class Erro extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}
const novoId = (n = 6) => randomBytes(n).toString('base64url');
const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const texto = (v, max) => String(v ?? '').trim().slice(0, max);
const umaLinha = (v, max) => texto(String(v ?? '').replace(/\s+/g, ' '), max);

function dadosFesta(b) {
  const nome = umaLinha(b.nome, 60);
  if (!nome) throw new Erro(400, 'Dê um nome para o amigo secreto.');
  const data = /^\d{4}-\d{2}-\d{2}$/.test(b.data ?? '') ? b.data : '';
  return { nome, data, valor: umaLinha(b.valor, 40), local: umaLinha(b.local, 80) };
}

function incluirPessoas(lista, nomes) {
  if (!Array.isArray(nomes)) throw new Erro(400, 'Envie a lista de nomes.');
  const limpos = nomes.map((n) => umaLinha(n, 40)).filter(Boolean);
  if (!limpos.length) throw new Erro(400, 'Escreva pelo menos um nome.');
  const chave = (n) => n.toLocaleLowerCase('pt-BR');
  const usados = new Set(lista.map((p) => chave(p.nome)));
  const novos = [];
  for (const nome of limpos) {
    if (usados.has(chave(nome))) {
      throw new Erro(400, `"${nome}" aparece duas vezes. Acrescente um sobrenome para diferenciar.`);
    }
    usados.add(chave(nome));
    novos.push({ id: novoId(), nome, pin: null, abriuEm: null, desejos: '', tirou: null });
  }
  if (lista.length + novos.length > MAX_PESSOAS) {
    throw new Erro(400, `O limite é de ${MAX_PESSOAS} pessoas por sorteio.`);
  }
  lista.push(...novos);
}

function exigirAntesDoSorteio(g) {
  if (g.sorteadoEm) throw new Erro(409, 'O sorteio já foi feito. Desfaça o sorteio para mudar a lista.');
}

/* ---------- O que cada um pode ver (nunca inclui quem tirou quem) ---------- */

const visaoPublica = (g) => ({
  id: g.id, codigo: g.codigo, nome: g.nome, data: g.data, valor: g.valor, local: g.local,
  site: process.env.ENDERECO || null,
  sorteado: Boolean(g.sorteadoEm),
  participantes: g.participantes.map((p) => ({
    id: p.id, nome: p.nome, abriu: Boolean(p.abriuEm), temPin: Boolean(p.pin),
  })),
});

const visaoAdmin = (g) => ({
  ...visaoPublica(g),
  restricoes: g.restricoes,
  comDesejos: g.participantes.filter((p) => p.desejos).map((p) => p.id),
  enderecoRede: enderecoRede(),
});

function visaoPessoal(g, p, revelar) {
  const amigo = revelar && g.sorteadoEm ? g.participantes.find((x) => x.id === p.tirou) : null;
  return {
    eu: { id: p.id, nome: p.nome, desejos: p.desejos, abriu: Boolean(p.abriuEm) },
    sorteado: Boolean(g.sorteadoEm),
    amigo: amigo ? { nome: amigo.nome, desejos: amigo.desejos } : null,
  };
}

function enderecoRede() {
  // No Docker o IP da máquina não é visível daqui; ENDERECO diz qual link divulgar.
  if (process.env.ENDERECO !== undefined) return process.env.ENDERECO || null;
  for (const [nome, ifs] of Object.entries(os.networkInterfaces())) {
    if (/^(lo|docker|br-|veth|virbr|tun|tap|wg|tailscale|vbox|vmnet)/i.test(nome)) continue;
    const v4 = ifs.find((i) => i.family === 'IPv4' && !i.internal);
    if (v4) return `http://${v4.address}:${servidor.address().port}`;
  }
  return null;
}

/* ---------- PIN ---------- */

const tentativas = new Map();
const MAX_ERROS = 5;
const CASTIGO = 5 * 60_000;

async function hashPin(pin, sal) {
  return (await scryptAsync(pin, sal, 32)).toString('hex');
}

async function autenticar(g, { pid, pin, criar }) {
  const p = g.participantes.find((x) => x.id === pid);
  if (!p) throw new Erro(404, 'Não encontramos esse nome na lista.');
  if (!/^\d{4}$/.test(pin ?? '')) throw new Erro(400, 'A senha tem 4 números.');

  if (!p.pin) {
    if (!criar) throw new Erro(409, 'Esse nome está sem senha. Volte à árvore e crie uma.');
    const sal = novoId(12);
    const hash = await hashPin(pin, sal);
    if (p.pin) throw new Erro(409, 'Alguém acabou de criar a senha desse nome.');
    p.pin = { sal, hash };
    await salvar(g);
    return p;
  }
  // Nunca deixa um pedido de "criar" passar por cima de um PIN existente.
  if (criar) throw new Erro(409, 'Esse nome já tem senha. Toque nele de novo para entrar.');

  const k = `${g.id}|${pid}`;
  let t = tentativas.get(k);
  if (!t || (t.ate && t.ate <= Date.now())) tentativas.set(k, (t = { erros: 0, ate: 0 }));
  if (t.ate > Date.now()) {
    const min = Math.ceil((t.ate - Date.now()) / 60_000);
    throw new Erro(429, `Muitas tentativas. Espere ${min} min e tente de novo.`);
  }
  // Conta antes de conferir, para pedidos simultâneos não furarem o limite.
  if (++t.erros >= MAX_ERROS) t.ate = Date.now() + CASTIGO;
  const { sal, hash } = p.pin;
  const ok = timingSafeEqual(Buffer.from(await hashPin(pin, sal), 'hex'), Buffer.from(hash, 'hex'));
  if (!ok) throw new Erro(401, 'Senha errada. Confira os 4 números.');
  tentativas.delete(k);
  return p;
}

/* ---------- Rotas da API ---------- */

function exigirOrganizador(g, req) {
  const dada = Buffer.from(sha(req.headers['x-chave'] ?? ''));
  if (!timingSafeEqual(dada, Buffer.from(g.chaveHash))) {
    throw new Erro(403, 'Este link de organizador não é válido.');
  }
}

const rotas = [];
const rota = (metodo, padrao, fn) =>
  rotas.push({ metodo, re: new RegExp(`^/api${padrao.replace(/:(\w+)/g, '(?<$1>[\\w-]+)')}$`), fn });

const rotaAdmin = (metodo, padrao, fn) =>
  rota(metodo, padrao, async (ctx) => {
    exigirOrganizador(ctx.g, ctx.req);
    await fn(ctx);
    if (metodo !== 'GET') await salvar(ctx.g);
    return visaoAdmin(ctx.g);
  });

rota('POST', '/grupos', async ({ corpo }) => {
  if (grupos.size >= MAX_GRUPOS) throw new Erro(503, 'Já temos sorteios demais por aqui.');
  const festa = dadosFesta(corpo);
  const participantes = [];
  incluirPessoas(participantes, corpo.participantes);
  if (participantes.length < MIN_PESSOAS) {
    throw new Erro(400, `São precisas pelo menos ${MIN_PESSOAS} pessoas.`);
  }
  const chave = novoId(18);
  const g = {
    id: novoId(), chaveHash: sha(chave), ...festa,
    criadoEm: new Date().toISOString(), sorteadoEm: null, restricoes: [], participantes,
  };
  darCodigo(g);
  await salvar(g);
  grupos.set(g.id, g);
  return { id: g.id, chave };
});

// Com 6 números daria para chutar; depois de 40 erros por minuto, todos esperam (o link e o QR seguem valendo).
let errosCodigo = { n: 0, ate: 0 };
rota('GET', '/codigo/:codigo', ({ par }) => {
  if (errosCodigo.ate < Date.now()) errosCodigo = { n: 0, ate: Date.now() + 60_000 };
  if (errosCodigo.n >= 40) throw new Erro(429, 'Muitas tentativas. Espere um minuto ou use o QR code.');
  const id = porCodigo.get(par.codigo);
  if (!id) { errosCodigo.n++; throw new Erro(404, 'Não achamos sorteio com esse PIN. Confira os 6 números.'); }
  return { id };
});

rota('GET', '/grupos/:id', ({ g }) => visaoPublica(g));

rotaAdmin('GET', '/grupos/:id/admin', () => {});

rotaAdmin('PATCH', '/grupos/:id', ({ g, corpo }) => { Object.assign(g, dadosFesta(corpo)); });

rotaAdmin('POST', '/grupos/:id/participantes', ({ g, corpo }) => {
  exigirAntesDoSorteio(g);
  incluirPessoas(g.participantes, corpo.nomes);
});

rotaAdmin('DELETE', '/grupos/:id/participantes/:pid', ({ g, par }) => {
  exigirAntesDoSorteio(g);
  g.participantes = g.participantes.filter((p) => p.id !== par.pid);
  g.restricoes = g.restricoes.filter((r) => !r.includes(par.pid));
});

rotaAdmin('POST', '/grupos/:id/participantes/:pid/resetar-pin', ({ g, par }) => {
  const p = g.participantes.find((x) => x.id === par.pid);
  if (!p) throw new Erro(404, 'Não encontramos esse nome na lista.');
  p.pin = null;
  tentativas.delete(`${g.id}|${p.id}`);
});

rotaAdmin('PUT', '/grupos/:id/restricoes', ({ g, corpo }) => {
  exigirAntesDoSorteio(g);
  const ids = new Set(g.participantes.map((p) => p.id));
  const vistos = new Set();
  g.restricoes = (Array.isArray(corpo.pares) ? corpo.pares : []).filter((r) => {
    if (!Array.isArray(r) || r.length !== 2 || r[0] === r[1] || !r.every((i) => ids.has(i))) return false;
    const k = [...r].sort().join('|');
    return !vistos.has(k) && vistos.add(k);
  });
});

rotaAdmin('POST', '/grupos/:id/sortear', ({ g }) => {
  exigirAntesDoSorteio(g);
  if (g.participantes.length < MIN_PESSOAS) {
    throw new Erro(400, `São precisas pelo menos ${MIN_PESSOAS} pessoas para sortear.`);
  }
  const r = sortear(g.participantes.map((p) => p.id), g.restricoes);
  if (!r) throw new Erro(409, 'Com essas restrições não existe combinação possível. Retire alguma e tente de novo.');
  for (const p of g.participantes) { p.tirou = r.get(p.id); p.abriuEm = null; }
  g.sorteadoEm = new Date().toISOString();
});

rotaAdmin('POST', '/grupos/:id/desfazer', ({ g }) => {
  for (const p of g.participantes) { p.tirou = null; p.abriuEm = null; }
  g.sorteadoEm = null;
});

rota('POST', '/grupos/:id/entrar', async ({ g, corpo }) =>
  visaoPessoal(g, await autenticar(g, corpo), false));

rota('POST', '/grupos/:id/abrir', async ({ g, corpo }) => {
  const p = await autenticar(g, { ...corpo, criar: false });
  if (!g.sorteadoEm) throw new Erro(409, 'O sorteio ainda não foi feito.');
  if (!p.abriuEm) { p.abriuEm = new Date().toISOString(); await salvar(g); }
  return visaoPessoal(g, p, true);
});

rota('PUT', '/grupos/:id/desejos', async ({ g, corpo }) => {
  const p = await autenticar(g, { ...corpo, criar: false });
  p.desejos = texto(corpo.desejos, 600);
  await salvar(g);
  return { desejos: p.desejos };
});

/* ---------- Servidor ---------- */

async function lerCorpo(req) {
  const partes = [];
  let total = 0;
  for await (const c of req) {
    if ((total += c.length) > 64 * 1024) throw new Erro(413, 'Mensagem grande demais.');
    partes.push(c);
  }
  if (!total) return {};
  let v;
  try { v = JSON.parse(Buffer.concat(partes).toString('utf8')); } catch { throw new Erro(400, 'Pedido inválido.'); }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Erro(400, 'Pedido inválido.');
  return v;
}

async function api(req, caminho) {
  for (const r of rotas) {
    if (r.metodo !== req.method) continue;
    const m = caminho.match(r.re);
    if (!m) continue;
    const par = m.groups ?? {};
    const g = par.id ? grupos.get(par.id) : null;
    if (par.id && !g) throw new Erro(404, 'Esse amigo secreto não existe. Confira o link.');
    return r.fn({ req, g, par, corpo: await lerCorpo(req) });
  }
  throw new Erro(404, 'Endereço não encontrado.');
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

async function demonstracao(res) {
  const miolo = await fs.readFile(path.join(RAIZ, 'demo', 'arvore-amigo-secreto.html'), 'utf8');
  res.writeHead(200, { 'content-type': TIPOS['.html'], 'cache-control': 'no-cache', 'content-security-policy': CSP_DEMO });
  res.end(montarDemo(miolo));
}

async function estatico(caminho, res) {
  if (/^\/demo\/?$/.test(caminho)) return demonstracao(res);
  if (caminho === '/nomes.js') {
    // Lista opcional de nomes da demonstração (não vai para o Git).
    const lista = await fs.readFile(path.join(RAIZ, 'demo', 'nomes.js'), 'utf8').catch(() => '');
    res.writeHead(200, { 'content-type': TIPOS['.js'], 'cache-control': 'no-cache' });
    return res.end(lista);
  }
  const pagina = caminho === '/' || /^\/(novo|(g|organizar|telao)\/[\w-]+)\/?$/.test(caminho);
  const arq = path.join(PUBLICO, pagina ? 'index.html' : path.normalize(decodeURIComponent(caminho)));
  const tipo = TIPOS[path.extname(arq)];
  if (!arq.startsWith(PUBLICO + path.sep) || !tipo) throw new Erro(404, 'Página não encontrada.');
  let conteudo;
  try { conteudo = await fs.readFile(arq); } catch { throw new Erro(404, 'Página não encontrada.'); }
  res.writeHead(200, {
    'content-type': tipo,
    'cache-control': tipo === 'font/woff2' ? 'public, max-age=604800' : 'no-cache',
  });
  res.end(conteudo);
}

export const servidor = http.createServer(async (req, res) => {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('content-security-policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  try {
    const caminho = req.url.split('?')[0];
    if (caminho.startsWith('/api/')) {
      const saida = await api(req, caminho);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(saida));
    } else {
      await estatico(caminho, res);
    }
  } catch (e) {
    const conhecido = e instanceof Erro;
    if (!conhecido && !(e instanceof URIError)) console.error(e);
    if (res.headersSent) return res.destroy();
    res.writeHead(conhecido ? e.status : 500, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ erro: conhecido ? e.message : 'Algo deu errado. Tente de novo.' }));
  }
});

for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => servidor.close(() => process.exit(0)) && servidor.closeIdleConnections());

servidor.listen(PORTA, () => {
  console.log(`\n  Amigo Secreto de Natal no ar`);
  console.log(`  Neste computador:  http://localhost:${servidor.address().port}`);
  const rede = enderecoRede();
  if (rede) console.log(`  No mesmo Wi-Fi:    ${rede}\n`);
});
