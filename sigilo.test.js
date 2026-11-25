// Sobe o servidor de verdade, com dados descartáveis, e tenta ver o que não deveria.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const pasta = mkdtempSync(path.join(tmpdir(), 'natal-'));
process.env.DADOS = pasta;
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
after(() => { servidor.close(); servidor.closeAllConnections(); rmSync(pasta, { recursive: true, force: true }); });

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
  const arq = readdirSync(pasta).find((f) => f.endsWith('.json'));
  for (const c of [`/data/${arq}`, `/dados/${arq}`, `/${arq}`, `/..%2f..%2f${arq}`, '/server.js']) assert.equal((await fetch(url + c)).status, 404, c);
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
