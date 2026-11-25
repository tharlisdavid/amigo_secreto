// Sobe o servidor de verdade, com dados descartáveis, e tenta ver o que não deveria.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const pasta = mkdtempSync(path.join(tmpdir(), 'natal-'));
const pastaChave = mkdtempSync(path.join(tmpdir(), 'natal-chave-'));
process.env.DADOS = pasta;
process.env.CHAVE = path.join(pastaChave, 'mestra.key');
process.env.PORT = '0';
const { servidor } = await import('./server.js');

const N = 18;
let url, id, chave, pessoas;
const pin = (i) => String(1000 + i);
async function api(metodo, caminho, corpo, k) {
  const r = await fetch(`${url}/api/grupos${caminho}`, { method: metodo, headers: k ? { 'x-chave': k } : {}, body: corpo && JSON.stringify(corpo) });
  const bruto = await r.text();
  return { status: r.status, bruto, json: JSON.parse(bruto) };
}

before(async () => {
  if (!servidor.listening) await new Promise((r) => servidor.once('listening', r));
  url = `http://127.0.0.1:${servidor.address().port}`;
  const c = await api('POST', '', { nome: 'Teste', participantes: Array.from({ length: N }, (_, i) => `Pessoa ${i + 1}`) });
  ({ id, chave } = c.json);
  pessoas = (await api('GET', `/${id}`)).json.participantes;
});
after(() => { servidor.close(); servidor.closeAllConnections(); for (const d of [pasta, pastaChave]) rmSync(d, { recursive: true, force: true }); });
const pastaDoSorteio = (i) => readdirSync(pasta).find((f) => f.endsWith(`--${i}`));

test('antes do sorteio ninguém abre nada', async () => {
  for (const [i, p] of pessoas.entries()) assert.equal((await api('POST', `/${id}/entrar`, { pid: p.id, pin: pin(i), criar: true })).status, 200);
  assert.equal((await api('POST', `/${id}/abrir`, { pid: pessoas[0].id, pin: pin(0) })).status, 409);
});

test('só o organizador sorteia', async () => {
  assert.equal((await api('POST', `/${id}/sortear`, {})).status, 403);
  assert.equal((await api('POST', `/${id}/sortear`, {}, 'chave-errada')).status, 403);
  assert.equal((await api('POST', `/${id}/sortear`, {}, chave)).status, 200);
  assert.equal((await api('POST', `/${id}/sortear`, {}, chave)).status, 409, 'não sorteia por cima');
});

test('entrar com o PIN ainda não entrega o nome', async () => {
  for (const [i, p] of pessoas.entries()) assert.equal((await api('POST', `/${id}/entrar`, { pid: p.id, pin: pin(i) })).json.amigo, null);
});

test('cada um tira uma pessoa diferente, nunca a si mesmo, e sempre a mesma', async () => {
  const saiu = [];
  for (const [i, p] of pessoas.entries()) {
    const a = (await api('POST', `/${id}/abrir`, { pid: p.id, pin: pin(i) })).json.amigo.nome;
    const b = (await api('POST', `/${id}/abrir`, { pid: p.id, pin: pin(i) })).json.amigo.nome;
    assert.equal(a, b);
    assert.notEqual(a, p.nome);
    saiu.push(a);
  }
  assert.equal(new Set(saiu).size, N);
});

test('um não vê o do outro: o PIN de um não abre o presente de ninguém mais', async () => {
  for (const [i, p] of pessoas.entries()) {
    const outro = await api('POST', `/${id}/abrir`, { pid: p.id, pin: pin((i + 1) % N) });
    assert.equal(outro.status, 401);
    assert.equal(outro.json.amigo, undefined);
    assert.equal((await api('POST', `/${id}/abrir`, { pid: p.id })).status, 400, 'sem PIN');
    assert.equal((await api('POST', `/${id}/entrar`, { pid: p.id, pin: '9999', criar: true })).status, 409, 'não troca o PIN de outro');
    assert.equal((await api('PUT', `/${id}/desejos`, { pid: p.id, pin: '9999', desejos: 'x' })).status, 401);
  }
});

test('as páginas da árvore e do organizador não trazem quem tirou quem', async () => {
  const publica = await api('GET', `/${id}`), admin = await api('GET', `/${id}/admin`, null, chave);
  assert.deepEqual(Object.keys(publica.json.participantes[0]).sort(), ['abriu', 'id', 'nome', 'temPin']);
  assert.deepEqual(Object.keys(admin.json.participantes[0]).sort(), ['abriu', 'id', 'nome', 'temPin']);
  for (const r of [publica, admin]) assert.doesNotMatch(r.bruto, /tirou|"pin"|hash|desejos"/);
  assert.equal((await api('GET', `/${id}/admin`)).status, 403);
});

test('a lista de desejos só aparece para quem tirou a pessoa', async () => {
  const dono = pessoas[3], texto = 'meias-de-teste-unicas';
  assert.equal((await api('PUT', `/${id}/desejos`, { pid: dono.id, pin: pin(3), desejos: texto })).status, 200);
  let viram = 0;
  for (const [i, p] of pessoas.entries()) {
    if (p.id === dono.id) continue;
    const r = await api('POST', `/${id}/abrir`, { pid: p.id, pin: pin(i) });
    if (r.bruto.includes(texto)) { viram++; assert.equal(r.json.amigo.nome, dono.nome); }
  }
  assert.equal(viram, 1);
});

test('o arquivo com o resultado não é servido', async () => {
  const arq = `${pastaDoSorteio(id)}/sorteio.json`;
  for (const c of [`/data/${arq}`, `/dados/${arq}`, `/${arq}`, `/..%2f..%2f${arq}`, '/chave/mestra.key', '/server.js']) assert.equal((await fetch(url + c)).status, 404, c);
});

test('adivinhar o PIN trava depois de 5 erros', async () => {
  const alvo = pessoas[N - 1], st = [];
  for (let i = 0; i < 8; i++) st.push((await api('POST', `/${id}/abrir`, { pid: alvo.id, pin: `500${i}` })).status);
  assert.equal(st.filter((s) => s === 401).length <= 5, true);
  assert.equal(st.at(-1), 429);
  assert.equal((await api('POST', `/${id}/abrir`, { pid: alvo.id, pin: pin(N - 1) })).status, 429, 'nem o certo passa durante o bloqueio');
});

test('o PIN do sorteio leva ao sorteio certo e trava quem fica chutando', async () => {
  const { codigo } = (await api('GET', `/${id}`)).json;
  assert.match(codigo, /^\d{6}$/);
  const buscar = async (c) => { const r = await fetch(`${url}/api/codigo/${c}`); return { status: r.status, json: await r.json() }; };
  assert.deepEqual((await buscar(codigo)).json, { id });
  const errado = codigo === '111111' ? '222222' : '111111', st = [];
  for (let i = 0; i < 45; i++) st.push((await buscar(errado)).status);
  assert.equal(st[0], 404);
  assert.equal(st.at(-1), 429);
});

test('quem abre a pasta vê os nomes, mas não quem tirou quem nem os desejos', async () => {
  const p = path.join(pasta, pastaDoSorteio(id));
  assert.equal(readFileSync(path.join(p, 'participantes', 'nomes.txt'), 'utf8').trim().split('\n').length, N);
  const bruto = readFileSync(path.join(p, 'sorteio.json'), 'utf8');
  assert.doesNotMatch(bruto, /tirou|desejos|meias-de-teste-unicas/);
  // Cada id aparece uma vez só: ninguém aponta para ninguém.
  for (const x of pessoas) assert.equal(bruto.split(x.id).length - 1, 1);
});

test('sorteios com o mesmo nome não se sobrescrevem, e mudar o nome muda a pasta', async () => {
  const criar = async () => (await api('POST', '', { nome: 'Natal da Família', participantes: ['A', 'B', 'C'] })).json;
  const a = await criar(), b = await criar();
  assert.notEqual(a.id, b.id);
  assert.equal(readdirSync(pasta).filter((f) => f.startsWith('natal-da-familia--')).length, 2);
  await api('PATCH', `/${a.id}`, { nome: '../../Ção & Cia' }, a.chave);
  assert.equal(pastaDoSorteio(a.id), `cao-cia--${a.id}`);
  assert.equal(pastaDoSorteio(b.id), `natal-da-familia--${b.id}`);
  // Um organizador não mexe no sorteio do outro.
  assert.equal((await api('GET', `/${b.id}/admin`, null, a.chave)).status, 403);
  assert.equal((await api('POST', `/${b.id}/sortear`, {}, a.chave)).status, 403);
});

function outroServidor(env) {
  const f = spawn(process.execPath, ['server.js'], { cwd: import.meta.dirname, env: { ...process.env, PORT: '0', ...env } });
  let txt = '';
  return new Promise((r) => {
    const ver = (d) => { txt += d; const m = txt.match(/localhost:(\d+)/); if (m) r({ f, url: `http://127.0.0.1:${m[1]}`, txt }); };
    f.stdout.on('data', ver); f.stderr.on('data', ver);
    f.on('exit', (codigo) => r({ f, codigo, txt }));
  });
}

test('reiniciar mantém tudo: mesmas senhas e mesmos nomes', async () => {
  const antes = (await api('POST', `/${id}/abrir`, { pid: pessoas[1].id, pin: pin(1) })).json;
  const s = await outroServidor();
  const r = await fetch(`${s.url}/api/grupos/${id}/abrir`, { method: 'POST', body: JSON.stringify({ pid: pessoas[1].id, pin: pin(1) }) });
  assert.deepEqual(await r.json(), antes);
  s.f.kill();
});

test('sem a chave o servidor para, em vez de criar outra e perder os resultados', async () => {
  const s = await outroServidor({ CHAVE: path.join(pastaChave, 'sumiu.key') });
  assert.equal(s.codigo, 1);
  assert.match(s.txt, /Falta a chave/);
});

test('arquivos do formato antigo viram pasta sem perder nada', async () => {
  const d = mkdtempSync(path.join(tmpdir(), 'natal-velho-')), k = path.join(d, '..', `${path.basename(d)}.key`);
  const p = (i, t) => ({ id: `p${i}`, nome: `N${i}`, pin: null, abriuEm: null, desejos: `d${i}`, tirou: t });
  writeFileSync(path.join(d, 'Velho123.json'), JSON.stringify({ id: 'Velho123', chaveHash: 'x', nome: 'Antigo', data: '', valor: '', local: '', criadoEm: '', sorteadoEm: 'sim', restricoes: [], codigo: '123456', participantes: [p(1, 'p2'), p(2, 'p3'), p(3, 'p1')] }));
  const s = await outroServidor({ DADOS: d, CHAVE: k });
  assert.deepEqual(readdirSync(d), ['antigo--Velho123']);
  const post = async (c, b) => (await fetch(`${s.url}/api/grupos/Velho123/${c}`, { method: 'POST', body: JSON.stringify(b) })).json();
  await post('entrar', { pid: 'p1', pin: '1234', criar: true });
  assert.deepEqual((await post('abrir', { pid: 'p1', pin: '1234' })).amigo, { nome: 'N2', desejos: 'd2' });
  s.f.kill();
  rmSync(d, { recursive: true, force: true }); rmSync(k, { force: true });
});
