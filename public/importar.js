// Lê nomes de participantes de um arquivo .txt, .csv ou .xlsx, sem enviar o arquivo a lugar nenhum.
// Uso: const { nomes, repetidos } = await importarNomes(arquivo)
(() => {
  const TIPOS = ['txt', 'csv', 'xlsx'];
  const LIMITE = 2 * 1024 * 1024, LIMITE_ABERTO = 20 * 1024 * 1024;
  const simples = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[:*]+$/, '').replace(/\s+/g, ' ').trim();
  const CABECALHO = /^((primeiro )?nomes?( completo)?|nomes? (do|da|dos|das|de) .+|lista de nomes|participantes?|pessoas?|convidados?|integrantes?|funcionarios?|colaboradore?s?|colaborador|(full |first )?name)$/;
  const SOBRENOME = /^(sobrenomes?|ultimo nome|last name|surname)$/;

  function texto(bytes) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
    // Excel no Windows costuma salvar CSV em Windows-1252; sem isso os acentos quebram.
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('windows-1252').decode(bytes); }
  }

  function limpar(v) {
    let s = v.replace(/[\s​﻿]+/g, ' ').trim().replace(/^(\d+\s*[.)º°-]|[-*•–])\s*/, '').trim();
    const virgula = s.match(/^([^,;]+),\s*([^,;]+)$/); // "Souza, Ana" vira "Ana Souza"
    if (virgula) s = `${virgula[2]} ${virgula[1]}`;
    return s.replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40).trim();
  }
  const pareceNome = (s) => /\p{L}/u.test(s) && !s.includes('@') && !/:\/\//.test(s);

  function linhasCsv(t) {
    t = t.replace(/^﻿/, '');
    const sep = t.match(/^sep=(.)\r?\n/i);
    if (sep) t = t.slice(sep[0].length);
    let d = sep?.[1];
    if (!d) {
      const fora = t.replace(/"(?:[^"]|"")*"/g, ''), conta = (x) => fora.split(x).length;
      d = [';', '\t', ','].reduce((a, b) => (conta(b) > conta(a) ? b : a));
    }
    const linhas = [[]];
    let c = '', aspas = false;
    for (let i = 0; i < t.length; i++) {
      const x = t[i];
      if (aspas) { if (x !== '"') c += x; else if (t[i + 1] === '"') { c += x; i++; } else aspas = false; }
      else if (x === '"' && !c.trim()) { c = ''; aspas = true; }
      else if (x === d) { linhas.at(-1).push(c); c = ''; }
      else if (x === '\n' || x === '\r') { if (x === '\r' && t[i + 1] === '\n') i++; linhas.at(-1).push(c); c = ''; linhas.push([]); }
      else c += x;
    }
    linhas.at(-1).push(c);
    return linhas;
  }

  function nomesDaTabela(bruta) {
    const linhas = bruta.map((l) => Array.from(l, (c) => String(c ?? '').trim())).filter((l) => l.some(Boolean));
    if (!linhas.length) return [];
    for (let i = 0; i < Math.min(10, linhas.length); i++) {
      const cab = linhas[i].map(simples), col = cab.findIndex((c) => CABECALHO.test(c));
      if (col < 0) continue;
      const sob = cab.findIndex((c) => SOBRENOME.test(c));
      return linhas.slice(i + 1).filter((l) => l[col]).map((l) => (sob >= 0 && l[sob] ? `${l[col]} ${l[sob]}` : l[col]));
    }
    if (linhas.length === 1) return linhas[0];
    // Sem cabeçalho: usa a coluna que mais parece ter nomes (a da esquerda desempata).
    const total = Math.max(...linhas.map((l) => l.length));
    let melhor = 0, pontos = -1;
    for (let k = 0; k < total; k++) {
      const p = linhas.filter((l) => pareceNome(l[k] ?? '')).length;
      if (p > pontos) { pontos = p; melhor = k; }
    }
    return linhas.map((l) => l[melhor] ?? '');
  }

  function nomesDoTxt(t) {
    const l = t.replace(/^﻿/, '').split(/[\r\n;\t,]+/).map((s) => s.trim()).filter(Boolean);
    return l.length && CABECALHO.test(simples(l[0])) ? l.slice(1) : l;
  }

  /* ---- XLSX: um zip com XMLs dentro ---- */
  function abrirZip(b) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let fim = b.length - 22;
    while (fim >= 0 && v.getUint32(fim, true) !== 0x06054b50) fim--;
    if (fim < 0) throw 0;
    const pastas = new Map();
    let p = v.getUint32(fim + 16, true);
    for (let n = v.getUint16(fim + 10, true); n > 0; n--) {
      if (v.getUint32(p, true) !== 0x02014b50) throw 0;
      const nl = v.getUint16(p + 28, true), nome = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl));
      pastas.set(nome, { metodo: v.getUint16(p + 10, true), tam: v.getUint32(p + 20, true), inicio: v.getUint32(p + 42, true) });
      p += 46 + nl + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    }
    return async (nome) => {
      const e = pastas.get(nome);
      if (!e) return null;
      const i = e.inicio + 30 + v.getUint16(e.inicio + 26, true) + v.getUint16(e.inicio + 28, true);
      const dados = b.subarray(i, i + e.tam);
      if (e.metodo === 0) return xml(new TextDecoder().decode(dados));
      if (e.metodo !== 8) throw 0;
      const leitor = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const partes = [];
      for (let total = 0; ;) {
        const { done, value } = await leitor.read();
        if (done) break;
        if ((total += value.length) > LIMITE_ABERTO) { leitor.cancel(); throw 0; }
        partes.push(value);
      }
      return xml(await new Blob(partes).text());
    };
  }
  function xml(t) {
    const d = new DOMParser().parseFromString(t, 'application/xml');
    if (d.querySelector('parsererror')) throw 0;
    return d;
  }
  const tags = (no, nome) => [...no.getElementsByTagNameNS('*', nome)];
  // Ignora o texto fonético (rPh), que repetiria o nome.
  const textoDe = (no) => tags(no, 't').filter((t) => t.parentNode.localName !== 'rPh').map((t) => t.textContent).join('');

  async function linhasXlsx(bytes) {
    const ler = abrirZip(bytes);
    const pasta = await ler('xl/workbook.xml'), rels = await ler('xl/_rels/workbook.xml.rels');
    if (!pasta || !rels) throw 0;
    const compart = await ler('xl/sharedStrings.xml');
    const frases = compart ? tags(compart, 'si').map(textoDe) : [];
    const visiveis = tags(pasta, 'sheet').filter((s) => !/hidden/i.test(s.getAttribute('state') ?? ''));
    for (const s of visiveis) {
      const rid = [...s.attributes].find((a) => a.localName === 'id' && a.name !== 'id')?.value;
      const alvo = tags(rels, 'Relationship').find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target');
      if (!alvo) continue;
      const aba = await ler(alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo}`);
      if (!aba) continue;
      const linhas = tags(aba, 'row').map((r) => {
        const l = [];
        for (const c of tags(r, 'c')) {
          const tipo = c.getAttribute('t'), v = tags(c, 'v')[0]?.textContent ?? '';
          const letras = (c.getAttribute('r') ?? '').match(/^[A-Z]{1,3}/)?.[0];
          const col = letras ? [...letras].reduce((n, x) => n * 26 + x.charCodeAt(0) - 64, 0) - 1 : l.length;
          l[col] = tipo === 's' ? frases[Number(v)] ?? '' : tipo === 'inlineStr' ? textoDe(c) : tipo === 'e' || tipo === 'b' ? '' : v;
        }
        return l;
      });
      // Pula abas vazias ou só com números.
      if (linhas.some((l) => l.some((c) => c && pareceNome(c)))) return linhas;
    }
    return [];
  }

  window.importarNomes = async (arquivo) => {
    const ext = arquivo.name.split('.').pop().toLowerCase();
    if (!arquivo.name.includes('.') || !TIPOS.includes(ext)) {
      throw new Error(ext === 'xls' ? 'Esse é o Excel antigo (.xls). Salve como .xlsx e tente de novo.' : 'Use um arquivo .txt, .csv ou .xlsx.');
    }
    if (arquivo.size > LIMITE) throw new Error('O arquivo passa de 2 MB. Deixe só a lista de nomes.');
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const ehZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
    let brutos;
    if (ext === 'xlsx') {
      try { if (!ehZip) throw 0; brutos = nomesDaTabela(await linhasXlsx(bytes)); } catch { throw new Error('Não consegui ler essa planilha. Abra no Excel, salve como .xlsx sem senha e tente de novo.'); }
    } else {
      if (ehZip || (bytes.includes(0) && bytes[0] < 0xfe)) throw new Error(`Esse arquivo não é um .${ext} de verdade.`);
      brutos = ext === 'csv' ? nomesDaTabela(linhasCsv(texto(bytes))) : nomesDoTxt(texto(bytes));
    }
    const nomes = [], vistos = new Set();
    let repetidos = 0;
    for (const n of brutos.map(limpar).filter(pareceNome)) {
      const k = n.toLocaleLowerCase('pt-BR');
      if (vistos.has(k)) { repetidos++; continue; }
      vistos.add(k); nomes.push(n);
    }
    if (!nomes.length) throw new Error('Não encontrei nenhum nome nesse arquivo.');
    return { nomes, repetidos };
  };
})();
