// Teste da prova de conceito da rede local: um anfitrião e dois convidados em sessões separadas do Chromium
// se conectam pelos códigos em texto, conversam, medem o ping e fazem a rajada de 500 mensagens.
// Também confere se o QR code desenhado na tela é lido de volta igual ao código.
// Uso: npm run test:lan        (--ver abre o navegador visível; --sem-camera testa sem permissão de câmera, quando o
//      navegador esconde o endereço do aparelho atrás de um nome .local)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEADED = process.argv.includes('--ver');
const SEM_CAMERA = process.argv.includes('--sem-camera');
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
const URL_BASE = `http://127.0.0.1:${server.address().port}/lan-teste.html`;

const browser = await chromium.launch({ headless: !HEADED, args: SEM_CAMERA ? [] : ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const erros = [];
async function aparelho(nome) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, permissions: SEM_CAMERA ? [] : ['camera'] });
  const page = await ctx.newPage();
  page.on('pageerror', e => erros.push(`${nome}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') erros.push(`${nome} (console): ${m.text()}`); });
  await page.goto(URL_BASE);
  await page.fill('#nome', nome); await page.dispatchEvent('#nome', 'change');
  if (SEM_CAMERA) await page.evaluate(() => { document.getElementById('optCamera').checked = false; });
  return page;
}
const falhou = msg => { console.error('FALHOU: ' + msg); process.exitCode = 1; };
const confere = (ok, msg) => { if (ok) console.log('ok: ' + msg); else falhou(msg); };
// lê o QR code do canvas com o próprio jsQR da página
const lerCanvas = (page, id) => page.evaluate(id => {
  const cv = document.getElementById(id), g = cv.getContext('2d'), img = g.getImageData(0, 0, cv.width, cv.height);
  const r = jsQR(img.data, cv.width, cv.height); return r ? r.data : null;
}, id);
const codigo = v => v.replace(/^\[|\]$/g, '');

async function convidar(host, guest, n) {
  const anterior = await host.inputValue('#txtOferta');
  await host.click('#btnConvidar');
  await host.waitForFunction(a => { const v = document.getElementById('txtOferta').value; return v.length > 10 && v !== a; }, anterior, { timeout: 15000 });
  const oferta = await host.inputValue('#txtOferta');
  confere(await lerCanvas(host, 'qrOferta') === codigo(oferta), `convite ${n}: o QR code na tela é lido igual ao código (${codigo(oferta).length} caracteres)`);
  await guest.click('#btnEntrar');
  await guest.click('#passoLer details summary');
  await guest.fill('#txtOfertaColada', oferta);
  await guest.click('#btnColarOferta');
  await guest.waitForFunction(() => document.getElementById('txtRespostaGerada').value.length > 10, null, { timeout: 15000 });
  const resposta = await guest.inputValue('#txtRespostaGerada');
  confere(await lerCanvas(guest, 'qrResposta') === codigo(resposta), `resposta ${n}: o QR code na tela é lido igual ao código (${codigo(resposta).length} caracteres)`);
  if (!(await host.isVisible('#txtResposta'))) await host.click('#btnLerResposta ~ details summary');
  await host.fill('#txtResposta', resposta);
  await host.click('#btnColarResposta');
  await guest.waitForFunction(() => /Conectado/.test(document.getElementById('estadoConvidado').textContent), null, { timeout: 20000 });
  console.log(`ok: convidado ${n} conectado`);
}

try {
  const host = await aparelho('Anfitriao');
  const g1 = await aparelho('Convidado A');
  const g2 = await aparelho('Convidado B');
  await host.click('#btnCriar');
  await convidar(host, g1, 1);
  // código errado: resposta de outro convite
  await convidar(host, g2, 2);

  // conversa: B escreve, o anfitrião repassa para A
  await g2.fill('#txtMsg', 'oi do B'); await g2.click('#formMsg button');
  await g1.waitForFunction(() => /oi do B/.test(document.getElementById('msgs').textContent), null, { timeout: 5000 });
  console.log('ok: mensagem de B chegou em A, passando pelo anfitrião');

  // rajada do anfitrião para os dois
  await host.click('#btnRajada');
  await host.waitForFunction(() => (document.getElementById('msgs').textContent.match(/Rajada para/g) || []).length >= 2, null, { timeout: 15000 });
  const raj = await host.evaluate(() => [...document.querySelectorAll('#msgs .sis')].map(p => p.textContent).filter(t => /Rajada/.test(t)));
  confere(raj.every(t => /500\/500/.test(t) && /0 fora de ordem/.test(t)), 'rajada: ' + raj.join(' | '));

  // ping
  await host.waitForTimeout(4500);
  const lista = await host.evaluate(() => document.getElementById('listaConvidados').textContent);
  confere(/ping \d+ ms/.test(lista), 'ping medido: ' + lista.replace(/\s+/g, ' '));

  // código inválido não quebra a página
  await g1.evaluate(() => aplicarOferta('UT1OXXXX'));
  confere(/código|inválido|incompleto/i.test(await g1.textContent('#estadoConvidado')), 'código inválido mostra erro: ' + await g1.textContent('#estadoConvidado'));

  console.log('\n--- relatório do anfitrião ---\n' + (await host.evaluate(() => relatorio())).split('\nEventos:')[0]);
  console.log('\n--- relatório do convidado A ---\n' + (await g1.evaluate(() => relatorio())).split('\nEventos:')[0]);
} catch (e) {
  falhou(e.message);
  for (const pg of browser.contexts().map(c => c.pages()[0]).filter(Boolean)) console.log('\n--- ' + await pg.inputValue('#nome') + ' ---\n' + await pg.evaluate(() => relatorio()).catch(x => x.message));
} finally {
  if (erros.length) { falhou('erros na página:\n' + erros.join('\n')); }
  await browser.close(); server.close();
}
