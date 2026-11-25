import test from 'node:test';
import assert from 'node:assert/strict';
import { sortear } from './sorteio.js';

const ids = (n) => Array.from({ length: n }, (_, i) => `p${i}`);
function valido(lista, r, pares = []) {
  assert.equal(r.size, lista.length);
  assert.equal(new Set(r.values()).size, lista.length, 'todos são tirados uma única vez');
  for (const [a, b] of r) {
    assert.notEqual(a, b, 'ninguém tira a si mesmo');
    for (const [x, y] of pares) assert.ok(!(a === x && b === y) && !(a === y && b === x), 'respeita restrição');
  }
}

test('sorteios de 3 a 60 pessoas são sempre válidos', () => {
  for (let n = 3; n <= 60; n++) for (let i = 0; i < 20; i++) valido(ids(n), sortear(ids(n)));
});
test('casais nunca se tiram', () => {
  const l = ids(10), pares = [0, 2, 4, 6, 8].map((i) => [l[i], l[i + 1]]);
  for (let i = 0; i < 300; i++) valido(l, sortear(l, pares), pares);
});
test('encontra a solução mesmo quando quase tudo é proibido', () => {
  // Só sobra um ciclo de 12: cada um só pode tirar os vizinhos.
  const l = ids(12), pares = [];
  for (let a = 0; a < 12; a++) for (let b = a + 2; b < 12; b++) if (!(a === 0 && b === 11)) pares.push([l[a], l[b]]);
  for (let i = 0; i < 20; i++) valido(l, sortear(l, pares), pares);
});
test('avisa quando é impossível', () => {
  assert.equal(sortear(ids(3), [['p0', 'p1']]), null);
});
test('as combinações saem com a mesma frequência', () => {
  const c = {}; const N = 18000;
  for (let i = 0; i < N; i++) { const k = [...sortear(ids(4)).values()].join(); c[k] = (c[k] ?? 0) + 1; }
  assert.equal(Object.keys(c).length, 9);
  for (const v of Object.values(c)) assert.ok(Math.abs(v - N / 9) < 250, `desvio alto: ${v}`);
});
