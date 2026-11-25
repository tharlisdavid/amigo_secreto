// Build do Vercel: copia o site para dist/ e monta a demonstração em /demo.
// Variável opcional NOMES (um por linha ou separados por vírgula) define a lista da demonstração.
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { montarDemo } from '../demo/pagina.mjs';

rmSync('dist', { recursive: true, force: true });
cpSync('public', 'dist', { recursive: true });
writeFileSync('dist/demo.html', montarDemo(readFileSync('demo/arvore-amigo-secreto.html', 'utf8')));
const nomes = (process.env.NOMES ?? '').split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
writeFileSync('dist/nomes.js', nomes.length >= 3 ? `window.NOMES = ${JSON.stringify(nomes)};\n` : '');
console.log(`dist/ pronto, ${nomes.length >= 3 ? `${nomes.length} nomes` : 'nomes de exemplo'}`);
