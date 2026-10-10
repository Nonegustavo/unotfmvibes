// Teste de fumaça: joga partidas automáticas no Chromium headless e procura erros e travamentos.
// Uso: npm test            (3 partidas)
//      npm test -- 10      (10 partidas)
//      npm test -- 3 --ver (abre o navegador visível)
//      npm test -- 10 --vel=5 (encurta as esperas do jogo em 5x; o padrão é 1, a velocidade normal)
//      npm test -- 5 --regras=mess,weather (modo Personalizado só com essas regras; chaves de RULES em js/data.js)
//      npm test -- --semente=123 (sorteios do jogo e escolhas do teste a partir dessa semente; a partida N usa 123+N-1)
// Cada partida mostra a semente dela. Repetir a semente repete a distribuição e os primeiros lances, mas o jogo corre
// em tempo real, então a partida pode se separar depois (para repetir exatamente, use o teste das cartas: npm run test:cartas).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const GAMES = Number(args.find(a => /^\d+$/.test(a)) || 3);
const HEADED = args.includes('--ver');
const SPEED = Math.max(1, Number((args.find(a => a.startsWith('--vel=')) || '').slice(6)) || 1);
const RULES_ARG = (args.find(a => a.startsWith('--regras=')) || '').slice(9);
const SEED_ARG = (args.find(a => a.startsWith('--semente=')) || '').slice(10);
const STALL_MS = 15000;
const GAME_TIMEOUT_MS = 5 * 60 * 1000;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_BASE = `http://127.0.0.1:${server.address().port}/`;

// Visível: usa o Chrome (ou Edge) instalado, porque o Chromium completo do Playwright pode não abrir no Windows.
async function launch() {
  if (!HEADED) return chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const channel of ['chrome', 'msedge', undefined]) {
    try { return await chromium.launch({ headless: false, channel }); } catch (e) { if (!channel) throw e; }
  }
}
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(process.env.STACK ? e.stack : e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

// Acelera as esperas do jogo (jogadas dos adversários, anúncios, efeitos) sem mudar o código do jogo.
if (SPEED > 1) await page.addInitScript(v => {
  const st = window.setTimeout;
  window.setTimeout = (fn, ms, ...a) => st(fn, (ms || 0) / v, ...a);
}, SPEED);

// Regras escolhidas: grava a configuração salva antes de o jogo carregar
if (RULES_ARG) await page.addInitScript(keys => {
  try { localStorage.setItem('unotfm-solo-cfg', JSON.stringify({ mode: 'custom', poker: false, ...Object.fromEntries(keys.split(',').map(k => [k.trim(), true])) })); } catch (e) {}
}, RULES_ARG);

// Semente fixa: o jogo usa window.SEMENTE (data.js) e as escolhas do teste usam um sorteio próprio com a mesma semente
if (SEED_ARG) await page.addInitScript(n => {
  window.SEMENTE = n;
  let x = n >>> 0;
  window.__escolha = () => { x = (x + 0x6d2b79f5) | 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}, Number(SEED_ARG));

await page.goto(URL_BASE);

// Um passo do "jogador": resolve janelas abertas ou joga/compra.
async function step() {
  return page.evaluate(() => {
    const shown = id => document.getElementById(id)?.classList.contains('show');
    const click = el => { if (el) { el.click(); return true; } return false; };
    const pick = list => list[Math.floor((window.__escolha || Math.random)() * list.length)];
    if (shown('endOv')) return 'fim';
    if (!document.getElementById('home').hidden && !shown('settingsOv')) return click(document.getElementById('homePlay')) && 'tela inicial';
    if (shown('settingsOv')) return click(document.getElementById('startBtn')) && 'iniciar';
    if (shown('pokerOv')) return click(document.getElementById('pokerGo')) && 'mix';
    for (const [ov, box] of [['colorOv', 'colorBtns'], ['pickOv', 'picks'], ['swapOv', 'swaps'], ['simonOv', 'simonBtns']]) {
      if (shown(ov)) { const b = [...document.querySelectorAll(`#${box} button, #${box} .card, #${box} [role=button]`)].filter(x => !x.disabled); return click(pick(b)) && ov; }
    }
    for (const ov of ['activeOv', 'histOv', 'configOv', 'iosOv']) if (shown(ov)) document.querySelector(`#${ov} .btn.main`)?.click();
    const hand = document.querySelectorAll('#hand .card');
    if (hand.length === 2) document.getElementById('unoBtn')?.click();
    const ok = [...document.querySelectorAll('#hand .card.ok')];
    if (ok.length) return click(pick(ok)) && 'jogar';
    const draw = document.getElementById('drawBtn');
    if (draw && !draw.disabled && !draw.hidden) return click(draw) && 'passar';
    const deck = document.querySelector('#deck.can');
    if (deck) return click(deck) && 'comprar';
    document.body.click(); // fecha balões de informação
    return 'esperar';
  });
}

const snapshot = () => page.evaluate(() => ['status', 'hand', 'seatrow', 'discard'].map(id => document.getElementById(id)?.innerHTML).join('|'));

let played = 0, stalls = 0;
for (let g = 1; g <= GAMES; g++) {
  const start = Date.now();
  let last = await snapshot(), lastChange = Date.now(), result = '', seed = null;
  while (true) {
    const r = await step();
    if (seed == null) seed = await page.evaluate(() => S && S.semente);
    if (r === 'fim' && Date.now() - start > 1000) {
      result = await page.evaluate(() => document.getElementById('endTitle').textContent);
      await page.click('#againBtn');
      break;
    }
    await page.waitForTimeout(Math.max(60, 250 / SPEED));
    const now = await snapshot();
    if (now !== last) { last = now; lastChange = Date.now(); }
    if (Date.now() - lastChange > STALL_MS) {
      stalls++;
      const shot = path.join(ROOT, 'tests', `travou-${g}.png`);
      await page.screenshot({ path: shot });
      result = `TRAVOU (nada mudou em ${STALL_MS / 1000}s), captura em ${path.relative(ROOT, shot)}`;
      await page.reload();
      break;
    }
    if (Date.now() - start > GAME_TIMEOUT_MS) { result = 'tempo esgotado'; stalls++; await page.reload(); break; }
  }
  played++;
  console.log(`Partida ${g}/${GAMES}: ${result} (${Math.round((Date.now() - start) / 1000)}s, semente ${seed})`);
}

const webgl = await page.evaluate(() => typeof THREE !== 'undefined');
await browser.close();
server.close();

console.log(`\nPartidas: ${played} | Velocidade: ${SPEED}x |${RULES_ARG ? ` Regras: ${RULES_ARG} |` : ''} Travamentos: ${stalls} | Erros: ${errors.length} | three.js carregou: ${webgl ? 'sim' : 'não'}`);
for (const e of [...new Set(errors)]) console.log('  - ' + e);
process.exit(stalls || errors.length ? 1 : 0);
