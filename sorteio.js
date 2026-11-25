import { randomInt } from 'node:crypto';

function embaralhar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Sorteia quem tira quem. Ninguém tira a si mesmo e os pares em `restricoes`
 * nunca se tiram (vale para os dois lados).
 * Devolve um Map quemTira -> quemFoiTirado, ou null se não existe combinação.
 */
export function sortear(ids, restricoes = []) {
  const proibido = new Set();
  for (const [a, b] of restricoes) proibido.add(`${a}|${b}`).add(`${b}|${a}`);
  const pode = (a, b) => a !== b && !proibido.has(`${a}|${b}`);

  // Embaralha até dar certo: todas as combinações válidas têm a mesma chance.
  for (let t = 0; t < 3000; t++) {
    const s = embaralhar(ids);
    if (ids.every((id, i) => pode(id, s[i]))) return new Map(ids.map((id, i) => [id, s[i]]));
  }

  // Muitas restrições: procura uma combinação de forma garantida (emparelhamento de Kuhn).
  const donoDe = new Map();
  const encaixar = (a, vistos) => {
    for (const b of embaralhar(ids)) {
      if (!pode(a, b) || vistos.has(b)) continue;
      vistos.add(b);
      if (!donoDe.has(b) || encaixar(donoDe.get(b), vistos)) {
        donoDe.set(b, a);
        return true;
      }
    }
    return false;
  };
  for (const a of embaralhar(ids)) if (!encaixar(a, new Set())) return null;
  return new Map([...donoDe].map(([b, a]) => [a, b]));
}
