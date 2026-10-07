// Teste do mostruário de cartas: abre a página, "envia" desenhos de teste feitos na hora (um 7 preto em fundo branco,
// um Bloqueio em fundo transparente, um coringa colorido, textura, moldura e verso), confere os avisos, se as imagens
// continuam depois de recarregar e tira capturas (tests/mostruario-*.png).
// Uso: npm run test:mostruario   (--ver abre o navegador visível)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEADED = process.argv.includes('--ver');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_M = `http://127.0.0.1:${server.address().port}/mostruario.html`;
const browser = await chromium.launch({ headless: !HEADED });
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const erros = [];
page.on('pageerror', e => erros.push(e.message));
page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
const falhou = msg => { console.error('FALHOU: ' + msg); process.exitCode = 1; };
const confere = (ok, msg) => { if (ok) console.log('ok: ' + msg); else falhou(msg); };
const foto = async (nome, sel) => { const el = sel ? page.locator(sel).first() : page; await el.screenshot({ path: path.join(ROOT, 'tests', `mostruario-${nome}.png`) }); };

try {
  await page.goto(URL_M);
  await page.evaluate(() => document.fonts.ready);
  confere(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'a página cabe na largura do celular');
  confere(await page.locator('#galeria .card').count() > 150, `galeria com ${await page.locator('#galeria .card').count()} cartas`);

  // desenhos de teste feitos num canvas e entregues como arquivos
  await page.evaluate(async () => {
    const arq = async (nome, w, h, desenho) => { const c = document.createElement('canvas'); c.width = w; c.height = h; desenho(c.getContext('2d'), w, h); const b = await new Promise(r => c.toBlob(r, 'image/png')); return new File([b], nome, { type: 'image/png' }); };
    const lista = [
      await arq('7.png', 1024, 1024, (g, w) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, w); g.fillStyle = '#000'; g.font = 'bold 760px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('7', w / 2, w / 2 + 40); }),
      await arq('Bloqueio.PNG', 1024, 1024, (g, w) => { g.strokeStyle = '#111'; g.lineWidth = 110; g.beginPath(); g.arc(w / 2, w / 2, 360, 0, 7); g.stroke(); g.beginPath(); g.moveTo(260, 760); g.lineTo(760, 260); g.stroke(); }),
      await arq('coringa.png', 1024, 1024, (g, w) => { g.fillStyle = '#e33'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 190 : 430; g.lineTo(w / 2 + r * Math.cos(a), w / 2 + r * Math.sin(a)); } g.fill(); }),
      await arq('textura.png', 512, 512, (g, w) => { for (let y = 0; y < w; y += 8) for (let x = 0; x < w; x += 8) { const v = 170 + Math.floor(Math.random() * 85); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 8, 8); } }),
      await arq('moldura.png', 600, 900, (g, w, h) => { g.strokeStyle = '#ffd24d'; g.lineWidth = 40; g.strokeRect(40, 40, w - 80, h - 80); g.lineWidth = 10; g.strokeRect(90, 90, w - 180, h - 180); }),
      await arq('verso.png', 600, 900, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#6a47cf'); gr.addColorStop(1, '#e8479a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'bold 160px sans-serif'; g.textAlign = 'center'; g.fillText('★', w / 2, h / 2 + 50); }),
      await arq('rabisco.png', 200, 200, (g) => { g.fillRect(20, 20, 100, 100); }),
    ];
    await receberArquivos(lista);
  });
  const est = await page.evaluate(() => Object.fromEntries(Object.entries(IMG).map(([k, v]) => [k, v.avisos])));
  confere(Object.keys(est).length === 6, 'seis imagens reconhecidas pelo nome: ' + Object.keys(est).join(', '));
  confere((est['sim:7'] || []).includes('fundo branco tirado'), '7.png: fundo branco tirado');
  confere((est['sim:wild'] || []).includes('tem cores: só o formato aparece'), 'coringa.png: avisa que tem cores');
  confere(await page.locator('#soltos li').count() === 1, 'rabisco.png ficou esperando escolher onde entra');
  confere(await page.evaluate(() => getComputedStyle(document.querySelector('#galeria .card.c-r')).backgroundImage.includes('blob:')), 'textura e moldura aplicadas nas cartas');
  await page.waitForTimeout(4200); // espera o aviso sumir
  await foto('inicio');
  await foto('painel', '#painel');
  await page.selectOption('#grupo', 'acao');
  await foto('acoes', '#galeria');
  await page.selectOption('#grupo', 'num');
  await foto('numeros', '#galeria');
  await page.selectOption('#grupo', 'esp');
  await foto('especiais', '#galeria');
  await page.selectOption('#grupo', 'verso');
  await foto('verso', '#galeria');
  // carta em vários tamanhos
  await page.selectOption('#grupo', 'num');
  await page.locator('#galeria .card[data-i="7"]').first().click();
  confere(await page.isVisible('#detalhe'), 'detalhe da carta abre');
  await foto('detalhe', '#detalhe .m-folha');
  await page.click('#detFechar');
  // continua depois de recarregar
  await page.reload();
  await page.waitForFunction(() => Object.keys(IMG).length >= 6, null, { timeout: 5000 });
  confere(true, 'as imagens continuam depois de recarregar a página');
  // tirar um símbolo volta ao de hoje
  await page.click('#simbolos details[data-grupo="Números"] > summary');
  await page.click('[data-tirar="sim:7"]');
  confere(await page.evaluate(() => !document.querySelector('#galeria .card .sim') || !IMG['sim:7']), 'tirar o 7 volta ao número de hoje');
  // computador: painel à esquerda e cartas à direita
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.selectOption('#grupo', 'tudo');
  await page.waitForTimeout(4200);
  await foto('computador');
} catch (e) {
  falhou(e.message);
} finally {
  if (erros.length) falhou('erros na página:\n' + erros.join('\n'));
  await browser.close(); server.close();
}
