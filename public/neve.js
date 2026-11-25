// Neve contínua no fundo e chuva de papel picado quando o presente abre.
const tela = document.getElementById('neve');
const c = tela.getContext('2d');
const parado = matchMedia('(prefers-reduced-motion: reduce)');
let L, A, flocos = [], papeis = [], ultimo = 0;

function medir() {
  const d = Math.min(devicePixelRatio || 1, 2);
  L = innerWidth; A = innerHeight;
  tela.width = L * d; tela.height = A * d;
  c.setTransform(d, 0, 0, d, 0, 0);
  const n = Math.min(130, Math.round((L * A) / 8500));
  flocos = Array.from({ length: n }, () => {
    const p = Math.random();
    return { x: Math.random() * L, y: Math.random() * A, r: 1 + p * 2.6, v: 16 + p * 38, f: Math.random() * 6.3, o: .35 + p * .55 };
  });
  if (parado.matches) desenhar(0);
}

function desenhar(dt, t = 0) {
  c.clearRect(0, 0, L, A);
  c.fillStyle = '#fff';
  for (const s of flocos) {
    s.y += s.v * dt; s.x += Math.sin(t * .6 + s.f) * 14 * dt;
    if (s.y > A + 5) { s.y = -5; s.x = Math.random() * L; }
    c.globalAlpha = s.o;
    c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.3); c.fill();
  }
  c.globalAlpha = 1;
  papeis = papeis.filter((p) => p.y < A + 20);
  for (const p of papeis) {
    p.vy += 620 * dt; p.vx *= 1 - 1.2 * dt; p.x += p.vx * dt; p.y += Math.min(p.vy, 230) * dt; p.a += p.va * dt;
    c.save(); c.translate(p.x, p.y); c.rotate(p.a); c.scale(1, Math.cos(p.a * 1.7));
    c.fillStyle = p.cor; c.fillRect(-5, -3, 10, 6); c.restore();
  }
}

function quadro(ms) {
  const dt = Math.min((ms - ultimo) / 1000, .05);
  ultimo = ms;
  if (!parado.matches) desenhar(dt, ms / 1000);
  requestAnimationFrame(quadro);
}

export function estourar(x, y) {
  if (parado.matches) return;
  const cores = ['#f2b84b', '#c22637', '#fff8ea', '#2f9a72', '#a9d3e8'];
  for (let i = 0; i < 150; i++) {
    const a = -Math.PI / 2 + (Math.random() - .5) * 2.4, v = 260 + Math.random() * 620;
    papeis.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, a: Math.random() * 6, va: (Math.random() - .5) * 14, cor: cores[i % 5] });
  }
}

addEventListener('resize', medir);
medir();
requestAnimationFrame(quadro);
