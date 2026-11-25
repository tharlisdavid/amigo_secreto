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

function mostrar(...els) {
  app.replaceChildren(...els);
  scrollTo(0, 0);
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

/* ---------- Início: criar sorteio ---------- */

function telaInicio() {
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
  const botao = h('button', { className: 'botao grande cheio' }, 'Criar amigo secreto');
  const form = h('form', { onsubmit(e) {
    e.preventDefault();
    tentar(botao, async () => {
      const dados = festa.ler();
      const r = await api('POST', '/grupos', { ...dados, participantes: nomesDe(lista.value) });
      guardados.por({ ...r, nome: dados.nome });
      location.href = `/organizar/${r.id}#${r.chave}`;
    });
  } }, carta(h('h2', {}, 'Querido Papai Noel,'), ...festa.els, campo('Quem vai participar', lista, '(um nome por linha)'), conta, etiquetas, botao));

  const meus = guardados.ler();
  mostrar(h('div', { className: 'inicio' },
    h('header', { className: 'chamada' }, h('h1', {}, 'Amigo Secreto'),
      h('p', {}, 'Escreva os nomes, faça o sorteio e mande o link. Cada um abre o seu presente e descobre quem tirou.'),
      enfeiteGrande(),
      meus.length > 0 && h('nav', { className: 'meus' }, h('p', {}, 'Sorteios que você organiza'),
        meus.map((s) => h('a', { href: `/organizar/${s.id}#${s.chave}` }, s.nome)))),
    form));
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
    const d = h('dialog', { oncancel: (e) => e.preventDefault() }, h('div', { className: 'globo' },
      h('div', { className: 'bola' }, [...g.participantes].sort(() => Math.random() - .5).slice(0, 6).map((p, i) => {
        const el = h('i', {}, p.nome.split(' ')[0].slice(0, 12));
        el.style.animationDelay = `${-i * .19}s`;
        return el;
      })), h('h2', {}, 'Misturando os nomes…')));
    document.body.append(d); d.showModal();
    const pausa = new Promise((r) => setTimeout(r, 2400));
    await tentar(botao, async () => {
      try {
        const novo = await api('POST', `${base}/sortear`, {}, chave);
        await pausa;
        g = novo; desenhar(); aviso('Sorteio feito! Agora é só mandar o link.');
        estourar(innerWidth / 2, innerHeight * .6);
      } finally { d.close(); d.remove(); }
    });
  }

  function desenhar() {
    document.title = `${g.nome} | organizar`;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const link = `${local && g.enderecoRede ? g.enderecoRede : location.origin}/g/${id}`;
    const convite = `🎄 ${g.nome}: entre no link, toque no seu nome e descubra quem você tirou! ${link}`;
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

    const convidar = carta(h('h2', {}, 'Link para a turma'),
      h('p', {}, 'Um link só, para mandar no grupo. Cada pessoa toca no próprio nome e cria um PIN.'),
      h('div', { className: 'link' }, link),
      local && !link.startsWith('https:') && h('p', { className: 'dica' }, 'Este link funciona para quem está no mesmo Wi-Fi que este computador.'),
      h('div', { className: 'acoes' },
        h('a', { className: 'botao verde', href: `https://wa.me/?text=${encodeURIComponent(convite)}`, target: '_blank', rel: 'noopener noreferrer' }, 'Mandar no WhatsApp'),
        h('button', { className: 'botao claro', onclick: () => copiar(link) }, 'Copiar link'),
        h('a', { className: 'botao claro', href: `/g/${id}` }, 'Ver a árvore')));

    const novos = h('input', { placeholder: 'Nome de quem faltou', maxLength: 400, 'aria-label': 'Nome de quem faltou' });
    const pessoas = carta(h('h2', {}, 'Participantes'),
      h('ul', { className: 'lista' }, g.participantes.map((p) => {
        const sit = [p.abriu ? 'já abriu o presente' : p.temPin ? 'já entrou' : 'ainda não entrou', g.comDesejos.includes(p.id) && 'deixou lista de desejos'].filter(Boolean).join(', ');
        return h('li', {}, h('i', { className: `luz ${p.abriu ? 'on' : ''}` }), h('div', { className: 'quem' }, p.nome, h('small', {}, sit)),
          p.temPin && h('button', { className: 'texto-botao', 'aria-label': `Apagar PIN de ${p.nome}`, onclick(e) {
            if (confirm(`Apagar o PIN de ${p.nome}? A pessoa cria outro quando entrar.`)) agir(e.target, 'POST', `/participantes/${p.id}/resetar-pin`, {}, 'PIN apagado');
          } }, 'Apagar PIN'),
          !g.sorteado && h('button', { className: 'texto-botao', 'aria-label': `Tirar ${p.nome} da lista`, onclick(e) {
            if (confirm(`Tirar ${p.nome} da lista?`)) agir(e.target, 'DELETE', `/participantes/${p.id}`);
          } }, 'Tirar'));
      })),
      !g.sorteado && h('form', { className: 'linha-campos', onsubmit(e) {
        e.preventDefault();
        agir(e.submitter, 'POST', '/participantes', { nomes: nomesDe(novos.value) });
      } }, novos, h('button', { className: 'botao verde' }, 'Adicionar')));

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
      ...(g.sorteado ? [convidar, sorteio] : [sorteio]), pessoas, ...[restricoes].filter(Boolean), ...(g.sorteado ? [] : [convidar]), editar));
    scrollTo(0, y);
  }
  desenhar();
}

/* ---------- Árvore: cada um toca no seu nome ---------- */

async function telaArvore(id) {
  const base = `/grupos/${id}`;
  let g = await api('GET', base), naArvore = true, larguraAntes = 0;

  function desenhar() {
    document.title = g.nome;
    const abertos = g.participantes.filter((p) => p.abriu).length, total = g.participantes.length;
    const largura = larguraAntes = Math.min(app.clientWidth - 32, 660);
    const a = montarArvore(total, largura, abertos === total);
    const arvore = h('div', { className: 'arvore', role: 'group', 'aria-label': 'Participantes' }, a.desenho);
    arvore.style.width = `${largura}px`; arvore.style.height = `${a.altura}px`;
    g.participantes.forEach((p, i) => {
      const b = h('button', { className: `bolinha ${p.abriu ? 'acesa' : ''}`, title: p.nome, onclick: () => pedirPin(p) },
        bolinha(i), h('span', {}, p.nome), p.abriu && h('em', { className: 'so-leitor' }, ' (já abriu o presente)'));
      Object.assign(b.style, { left: `${a.pos[i].x}px`, top: `${a.pos[i].y}px`, width: `${a.larguraItem}px` });
      arvore.append(b);
    });
    const y = scrollY;
    mostrar(h('div', { className: 'festa' }, h('h1', {}, g.nome), detalhes(g),
      h('p', { className: 'convite' }, !g.sorteado ? 'O sorteio ainda não foi feito. Toque no seu nome e já deixe sua lista de desejos.'
        : abertos === total ? 'Todos já sabem quem tiraram. A árvore está toda acesa!' : 'Toque no seu nome para abrir o seu presente. Sua bolinha acende na árvore.'),
      arvore, g.sorteado && h('p', { className: 'placar' }, `${abertos} de ${total} bolinhas acesas`)));
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
    // Confere o estado mais novo: outra pessoa pode ter criado o PIN há pouco.
    try { g = await api('GET', base); } catch (e) { return aviso(e.message, true); }
    p = g.participantes.find((x) => x.id === p.id);
    if (!p || document.querySelector('dialog')) return p || desenhar();
    const criar = !p.temPin;
    const erro = h('p', { className: 'erro', role: 'alert' });
    const pin = h('input', { inputMode: 'numeric', pattern: '[0-9]{4}', maxLength: 4, required: true, autocomplete: 'off', type: criar ? 'text' : 'password', 'aria-label': 'PIN de 4 números',
      oninput() { pin.value = pin.value.replace(/\D/g, ''); } });
    const ok = h('button', { className: 'botao cheio' }, criar ? `Sou ${p.nome}, criar PIN` : 'Entrar');
    const d = h('dialog', { onclose: () => { d.remove(); if (naArvore) desenhar(); }, onclick: (e) => e.target === d && d.close() }, h('form', { async onsubmit(e) {
      e.preventDefault();
      ok.disabled = true; erro.textContent = '';
      try {
        const r = await api('POST', `${base}/entrar`, { pid: p.id, pin: pin.value, criar });
        naArvore = false;
        d.close();
        pessoal({ pid: p.id, pin: pin.value }, r);
      } catch (x) { erro.textContent = x.message; pin.value = ''; pin.focus(); } finally { ok.disabled = false; }
    } }, carta(h('h2', {}, `Olá, ${p.nome}!`),
      h('p', {}, criar ? 'Crie um PIN de 4 números. Só com ele dá para ver quem você tirou.' : 'Digite o seu PIN de 4 números.'),
      h('div', { className: 'pin' }, pin), erro, ok,
      h('button', { type: 'button', className: 'texto-botao', onclick: () => d.close() }, 'Não sou eu, voltar'),
      !criar && h('p', { className: 'dica' }, 'Esqueceu? Peça para quem organizou apagar o seu PIN.'))));
    document.body.append(d); d.showModal(); pin.focus();
  }

  function pessoal(cred, r) {
    const desejos = h('textarea', { value: r.eu.desejos, maxLength: 600, placeholder: 'Livro de receitas, meias divertidas, chocolate amargo, camiseta M…' });
    const listaDela = h('div');
    const titulo = h('h1', {}, r.sorteado ? (r.eu.abriu ? `${r.eu.nome}, é só abrir de novo` : `${r.eu.nome}, este é o seu presente`) : `Olá, ${r.eu.nome}!`);

    const dica = h('p', {}, r.sorteado ? 'Toque na caixa. Veja se ninguém está espiando!' : 'O sorteio ainda não foi feito. Enquanto isso, conte o que você gostaria de ganhar.');
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
        naArvore = true; desenhar();
      } }, 'Sair e voltar para a árvore')));
    app.focus({ preventScroll: true });
  }

  desenhar();
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
  else telaInicio();
} catch (e) {
  mostrar(carta(h('h2', {}, 'Esse link não abriu'), h('p', {}, e.message), h('div', {}, h('a', { className: 'botao', href: '/' }, 'Ir para o início'))));
}
