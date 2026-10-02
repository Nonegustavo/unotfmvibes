// Teste de fumaça: joga partidas automáticas no Chromium headless e procura erros e travamentos.
// Uso: npm test            (3 partidas)
//      npm test -- 10      (10 partidas)
//      npm test -- 3 --ver (abre o navegador visível)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const GAMES = Number(args.find(a => /^\d+$/.test(a)) || 3);
const HEADED = args.includes('--ver');
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

const browser = await chromium.launch({ headless: !HEADED, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(URL_BASE);

// Um passo do "jogador": resolve janelas abertas ou joga/compra.
async function step() {
  return page.evaluate(() => {
    const shown = id => document.getElementById(id)?.classList.contains('show');
    const click = el => { if (el) { el.click(); return true; } return false; };
    const pick = list => list[Math.floor(Math.random() * list.length)];
    if (shown('endOv')) return 'fim';
    if (shown('settingsOv')) return click(document.getElementById('startBtn')) && 'iniciar';
    if (shown('pokerOv')) return click(document.getElementById('pokerGo')) && 'mix';
    for (const [ov, box] of [['colorOv', 'colorBtns'], ['pickOv', 'picks'], ['swapOv', 'swaps'], ['simonOv', 'simonBtns']]) {
      if (shown(ov)) { const b = [...document.querySelectorAll(`#${box} button, #${box} .card`)].filter(x => !x.disabled); return click(pick(b)) && ov; }
    }
    for (const ov of ['activeOv', 'histOv', 'configOv', 'iosOv']) if (shown(ov)) document.querySelector(`#${ov} .btn.main`)?.click();
    const hand = document.querySelectorAll('#hand .card');
    if (hand.length === 2) document.getElementById('unoBtn')?.click();
    const ok = [...document.querySelectorAll('#hand .card.ok')];
    if (ok.length) return click(pick(ok)) && 'jogar';
    const draw = document.getElementById('drawBtn');
    if (draw && !draw.disabled && !draw.hidden) return click(draw) && 'comprar';
    document.body.click(); // fecha balões de informação
    return 'esperar';
  });
}

const snapshot = () => page.evaluate(() => ['status', 'hand', 'seatrow', 'discard'].map(id => document.getElementById(id)?.innerHTML).join('|'));

let played = 0, stalls = 0;
for (let g = 1; g <= GAMES; g++) {
  const start = Date.now();
  let last = await snapshot(), lastChange = Date.now(), result = '';
  while (true) {
    const r = await step();
    if (r === 'fim' && Date.now() - start > 1000) {
      result = await page.evaluate(() => document.getElementById('endTitle').textContent);
      await page.click('#againBtn');
      break;
    }
    await page.waitForTimeout(250);
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
  console.log(`Partida ${g}/${GAMES}: ${result} (${Math.round((Date.now() - start) / 1000)}s)`);
}

const webgl = await page.evaluate(() => typeof THREE !== 'undefined');
await browser.close();
server.close();

console.log(`\nPartidas: ${played} | Travamentos: ${stalls} | Erros: ${errors.length} | three.js carregou: ${webgl ? 'sim' : 'não'}`);
for (const e of [...new Set(errors)]) console.log('  - ' + e);
process.exit(stalls || errors.length ? 1 : 0);
