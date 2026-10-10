// Sala para jogar com amigos, pelas telas: o anfitrião cria a sala, convida duas pessoas, arruma os lugares, muda para 5
// lugares, os convidados tocam em "Estou pronto" e o anfitrião começa. A conexão é a WebRTC de verdade, entre abas.
// Confere nomes e lugares nas três telas, que a partida anda e tira capturas (tests/sala-*.png).
// Sem câmera (padrão), os códigos são trocados pelo "Sem câmera?", colando o texto; sem a permissão da câmera, o navegador
// esconde o endereço do aparelho atrás de um nome .local, e a conexão precisa funcionar assim também.
// Com --camera, cada pessoa fica num navegador com uma câmera falsa (um vídeo de arquivo) e o script desenha nela o QR
// code da tela do outro aparelho: o convite e a resposta são lidos pela câmera, como nos celulares.
// Uso: npm run test:sala   (--camera lê os QR codes pela câmera falsa; --ver abre o navegador visível)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEADED = process.argv.includes('--ver');
const CAMERA = process.argv.includes('--camera');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
// a sala na mesma Wi-Fi fica escondida no 👥: aparece com ?wifi=1
const BASE = `http://127.0.0.1:${server.address().port}/?wifi=1`;
const regras = () => { try { localStorage.setItem('unotfm-solo-cfg', JSON.stringify({ mode: 'custom', poker: false, trade: true, gift: true })); } catch (e) {} };
const navegadores = [];
const lanca = args => chromium.launch({ ...(HEADED ? { headless: false, channel: 'chrome' } : {}), args }).then(b => (navegadores.push(b), b));
let ctx = null;
if (!CAMERA) { ctx = await (await lanca([])).newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 }); await ctx.addInitScript(regras); }

// câmera falsa: quadro de vídeo 640x480 (YUV 4:2:0) com o QR code no meio, sobre fundo cinza claro
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
// o QR code desenhado na tela (canvas), em tons de cinza
const pixels = (page, id) => page.evaluate(id => {
  const cv = document.getElementById(id), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, px = [];
  for (let i = 0; i < d.length; i += 4) px.push(d[i]);
  return { w: cv.width, h: cv.height, px };
}, id);
const tmp = CAMERA ? fs.mkdtempSync(path.join(os.tmpdir(), 'unotfm-sala-cam-')) : null;

const erros = [];
const falhou = m => { console.error('FALHOU: ' + m); process.exitCode = 1; };
const confere = (ok, m) => ok ? console.log('ok: ' + m) : falhou(m);
// com --camera, cada pessoa tem o próprio navegador (cada um com a sua câmera falsa)
const abre = async nome => {
  let c = ctx, cam = null;
  if (CAMERA) {
    cam = path.join(tmp, nome + '.y4m'); y4m(cam, null);
    c = await (await lanca(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cam}`]))
      .newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, permissions: ['camera'] });
    await c.addInitScript(regras);
  }
  const p = await c.newPage(); p.cam = cam;
  p.on('pageerror', e => erros.push(`${nome}: ${e.message}`)); p.on('console', m => { if (m.type() === 'error') erros.push(`${nome} console: ${m.text()}`); });
  await p.goto(BASE); return p;
};
const foto = (p, nome) => p.screenshot({ path: path.join(ROOT, 'tests', `sala-${nome}.png`) });

try {
  const host = await abre('anfitrião');
  await host.click('#homeAmigos');
  await host.fill('#salaNome', 'Gustavo');
  await host.click('#salaCriar');
  confere(await host.isVisible('#salaAnfitriao'), 'o anfitrião cria a sala');
  await foto(host, 'anfitriao-vazia');
  // regras: as Configurações abrem sem a quantidade de adversários, e Salvar volta para a sala
  await host.click('#salaRegras');
  confere(await host.isVisible('#settingsOv') && !(await host.isVisible('#botsField')), 'as regras abrem sem a quantidade de adversários');
  await host.click('.seg[data-key=mode] button[data-v=classic]'); await host.click('#startBtn');
  confere(await host.isVisible('#salaOv') && /Clássico/.test(await host.textContent('#salaRegrasTxt')), 'Salvar volta para a sala com o modo novo');
  await host.click('#salaRegras'); await host.click('.seg[data-key=mode] button[data-v=custom]'); await host.click('#startBtn');

  const convidados = [];
  for (const nome of ['Bia', 'Caio']) {
    const c = await abre(nome);
    await c.click('#homeAmigos'); await c.fill('#salaNome', nome); await c.click('#salaEntrar');
    // convite: o anfitrião mostra o QR code (o teste pega o código, como se a câmera lesse)
    // a Bia pelo botão de convidar; o Caio tocando no primeiro bot da lista (ele senta naquele lugar)
    let lugarBot = null;
    if (nome === 'Bia') await host.click('#salaConvidar');
    else { lugarBot = await host.evaluate(() => { const l = document.querySelector('#salaLugares li[data-convidar]'); return +l.dataset.convidar; }); await host.click(`#salaLugares li[data-convidar="${lugarBot}"] .nm`); }
    await host.waitForFunction(() => !!SALA.convite, null, { timeout: 15000 });
    if (!convidados.length) await foto(host, 'anfitriao-convite');
    if (CAMERA) { y4m(c.cam, await pixels(host, 'salaQR')); await c.click('#salaLerConviteBtn'); }
    else { const convite = await host.evaluate(() => SALA.convite); await c.click('#salaLerConvite summary'); await c.fill('#salaColarConvite', convite); await c.click('#salaUsarConvite'); }
    await c.waitForFunction(() => !!SALA.resposta, null, { timeout: 20000 });
    if (CAMERA) confere(true, `${nome} leu o convite pela câmera`);
    if (!convidados.length) await foto(c, 'convidado-resposta');
    if (CAMERA) { y4m(host.cam, await pixels(c, 'salaQRResp')); await host.click('#salaLerResposta'); }
    else { const resposta = await c.evaluate(() => SALA.resposta); await host.evaluate(() => { document.querySelector('#salaConvite details').open = true; }); await host.fill('#salaColar', resposta); await host.click('#salaUsarColado'); }
    await c.waitForSelector('#salaDentro:not([hidden])', { timeout: 20000 });
    confere(true, `${nome} entrou na sala${CAMERA ? ' (o anfitrião leu a resposta pela câmera)' : ''}`);
    if (lugarBot != null) { await host.waitForTimeout(300); confere(await host.evaluate(l => ANF.lugares[l] && ANF.lugares[l].nome === 'Caio', lugarBot), `convidado pelo bot do lugar ${lugarBot}, o Caio sentou nele`); }
    convidados.push(c);
  }
  await host.waitForFunction(() => document.querySelectorAll('#salaLugares li:not(.bot)').length === 3, null, { timeout: 5000 });
  confere(true, 'o anfitrião vê as duas pessoas na lista');
  // sem a câmera, o navegador costuma esconder o endereço do aparelho atrás de um nome .local (e a conexão funciona assim)
  const enderecos = await host.evaluate(() => ANF.ligacoes.filter(l => l.pc && l.aberta).map(l => /\.local/.test(l.pc.localDescription.sdp) ? 'nome .local' : 'endereço IP'));
  console.log(`   endereço do anfitrião nos convites: ${[...new Set(enderecos)].join(', ')}`);
  // pronto: sem todos prontos, não dá para começar
  await convidados[0].click('#salaPronto');
  await host.waitForFunction(() => /pronto/.test(document.getElementById('salaLugares').textContent), null, { timeout: 5000 });
  confere(true, 'o anfitrião vê quem está pronto');
  confere(await host.isDisabled('#salaComecar'), 'com uma pessoa ainda não pronta, o anfitrião não consegue começar');
  await convidados[1].click('#salaPronto');
  await host.waitForFunction(() => !document.getElementById('salaComecar').disabled, null, { timeout: 5000 });
  confere(true, 'com todos prontos, o anfitrião pode começar');
  // 5 lugares e uma troca de lugar
  await host.click('#salaLugaresSeg button[data-n="5"]');
  const antes = await host.evaluate(() => ANF.lugares.map(x => x === 'eu' ? 'eu' : x ? x.nome : '-').join(','));
  await host.click('#salaLugares [data-desce="1"]');
  const depois = await host.evaluate(() => ANF.lugares.map(x => x === 'eu' ? 'eu' : x ? x.nome : '-').join(','));
  confere(antes !== depois, `troca de lugar (${antes} → ${depois})`);
  await convidados[1].waitForFunction(n => document.querySelectorAll('#salaLugaresConv li').length === n, 5, { timeout: 5000 });
  await foto(host, 'anfitriao-lista');
  await foto(convidados[1], 'convidado-dentro');
  // começa
  await host.click('#salaComecar');
  await host.waitForFunction(() => S && S.players && S.players.length === 5, null, { timeout: 5000 });
  const mesa = await host.evaluate(() => S.players.map(p => p.name));
  const esperado = depois.split(',').map((x, i) => i === 0 ? 'Gustavo' : x);
  confere(mesa.every((n, i) => esperado[i] === '-' || n === esperado[i]), `lugares na mesa como na sala: ${mesa.join(', ')}`);
  for (const [k, c] of convidados.entries()) {
    await c.waitForFunction(() => S && S.players && S.players.length === 5, null, { timeout: 8000 });
    const eu = await c.evaluate(() => S.players[0].name);
    confere(eu === ['Bia', 'Caio'][k], `${eu} se vê na própria cadeira (embaixo)`);
    confere(!(await c.isVisible('#salaOv')), `a sala fechou para ${eu}`);
  }
  // a partida anda: alguns lances de todos
  for (let i = 0; i < 40; i++) {
    for (const p of [host, ...convidados]) await p.evaluate(() => {
      const shown = id => document.getElementById(id)?.classList.contains('show');
      for (const [ov, box] of [['colorOv', 'colorBtns'], ['pickOv', 'picks'], ['swapOv', 'swaps']]) if (shown(ov)) { document.querySelector(`#${box} button, #${box} .card, #${box} [role=button]`)?.click(); return; }
      const ok = document.querySelector('#hand .card.ok'); if (ok) { ok.click(); return; }
      if (typeof myTurn === 'function' && myTurn()) document.getElementById('drawBtn').click();
    });
    await host.waitForTimeout(250);
  }
  const vezes = await host.evaluate(() => S.vezes);
  confere(vezes > 5, `a partida andou (${vezes} vezes)`);
  await foto(host, 'jogo-anfitriao');
  await foto(convidados[0], 'jogo-convidado');
} catch (e) {
  falhou(e.message);
} finally {
  if (erros.length) falhou('erros nas páginas:\n' + [...new Set(erros)].join('\n'));
  for (const b of navegadores) await b.close();
  server.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
}
