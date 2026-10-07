// Teste da leitura de QR code pela câmera no teste de rede local. O Chromium usa um vídeo de arquivo no lugar da
// câmera: o script desenha o QR code da tela de um aparelho num quadro de vídeo (.y4m) e o outro aparelho lê pela
// "câmera". Faz isso nos dois sentidos (convite e resposta) e confere se a conexão abre.
// Uso: npm run test:lan-camera   (--ver abre o navegador visível)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEADED = process.argv.includes('--ver');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
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

// quadro de vídeo 640x480 (YUV 4:2:0) com o QR code no meio, sobre fundo cinza claro, um pouco inclinado no tamanho
const W = 640, H = 480;
function y4m(arquivo, qr) {
  const Y = Buffer.alloc(W * H, 200), UV = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  if (qr) {
    const lado = 360, x0 = (W - lado) >> 1, y0 = (H - lado) >> 1;
    for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) {
      const sx = Math.floor(x * qr.w / lado), sy = Math.floor(y * qr.h / lado);
      Y[(y0 + y) * W + x0 + x] = qr.px[sy * qr.w + sx] < 128 ? 30 : 230;
    }
  }
  fs.writeFileSync(arquivo, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\nFRAME\n`), Y, UV]));
}
const pixels = (page, id) => page.evaluate(id => {
  const cv = document.getElementById(id), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, px = [];
  for (let i = 0; i < d.length; i += 4) px.push(d[i]);
  return { w: cv.width, h: cv.height, px };
}, id);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unotfm-cam-'));
const camHost = path.join(tmp, 'host.y4m'), camGuest = path.join(tmp, 'guest.y4m');
y4m(camHost, null); y4m(camGuest, null);
const abrir = cam => chromium.launch({ headless: !HEADED, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cam}`] });
const bHost = await abrir(camHost), bGuest = await abrir(camGuest);
const erros = [];
const falhou = msg => { console.error('FALHOU: ' + msg); process.exitCode = 1; };
async function pagina(b, nome) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, permissions: ['camera'] });
  const p = await ctx.newPage();
  p.on('pageerror', e => erros.push(`${nome}: ${e.message}`));
  await p.goto(URL_BASE);
  return p;
}
try {
  const host = await pagina(bHost, 'anfitrião'), guest = await pagina(bGuest, 'convidado');
  await host.click('#btnCriar'); await host.click('#btnConvidar');
  await host.waitForFunction(() => document.getElementById('txtOferta').value.length > 10, null, { timeout: 15000 });
  y4m(camGuest, await pixels(host, 'qrOferta'));
  await guest.click('#btnEntrar'); await guest.click('#btnLerOferta');
  await guest.waitForFunction(() => document.getElementById('txtRespostaGerada').value.length > 10, null, { timeout: 20000 });
  console.log('ok: o convidado leu o convite pela câmera');
  y4m(camHost, await pixels(guest, 'qrResposta'));
  await host.click('#btnLerResposta');
  await guest.waitForFunction(() => /Conectado/.test(document.getElementById('estadoConvidado').textContent), null, { timeout: 20000 });
  console.log('ok: o anfitrião leu a resposta pela câmera e a conexão abriu');
  const ev = (await host.evaluate(() => relatorio())).split('\n').filter(l => /QR lido|câmera/.test(l));
  const ev2 = (await guest.evaluate(() => relatorio())).split('\n').filter(l => /QR lido|câmera/.test(l));
  console.log('anfitrião: ' + ev.join(' | ') + '\nconvidado: ' + ev2.join(' | '));
} catch (e) {
  falhou(e.message);
} finally {
  if (erros.length) falhou('erros na página:\n' + erros.join('\n'));
  await bHost.close(); await bGuest.close(); server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
