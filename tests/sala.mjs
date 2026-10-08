// Sala para jogar com amigos, pelas telas: o anfitrião cria a sala, convida duas pessoas (o QR code é trocado pelo
// "Sem câmera?", colando o código), arruma os lugares, muda para 5 lugares, os convidados tocam em "Estou pronto" e o
// anfitrião começa. A conexão é a WebRTC de verdade, entre abas. Confere nomes e lugares nas três telas, que a partida
// anda e tira capturas (tests/sala-*.png).
// Uso: npm run test:sala   (--ver abre o navegador visível)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEADED = process.argv.includes('--ver');
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
const BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(HEADED ? { headless: false, channel: 'chrome' } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { try { localStorage.setItem('unotfm-solo-cfg', JSON.stringify({ mode: 'custom', poker: false, trade: true, gift: true })); } catch (e) {} });
const erros = [];
const falhou = m => { console.error('FALHOU: ' + m); process.exitCode = 1; };
const confere = (ok, m) => ok ? console.log('ok: ' + m) : falhou(m);
const abre = async nome => { const p = await ctx.newPage(); p.on('pageerror', e => erros.push(`${nome}: ${e.message}`)); p.on('console', m => { if (m.type() === 'error') erros.push(`${nome} console: ${m.text()}`); }); await p.goto(BASE); return p; };
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
    await host.click('#salaConvidar');
    await host.waitForFunction(() => !!SALA.convite, null, { timeout: 15000 });
    if (!convidados.length) await foto(host, 'anfitriao-convite');
    const convite = await host.evaluate(() => SALA.convite);
    await c.click('#salaLerConvite summary'); await c.fill('#salaColarConvite', convite); await c.click('#salaUsarConvite');
    await c.waitForFunction(() => !!SALA.resposta, null, { timeout: 15000 });
    if (!convidados.length) await foto(c, 'convidado-resposta');
    const resposta = await c.evaluate(() => SALA.resposta);
    await host.evaluate(() => { document.querySelector('#salaConvite details').open = true; }); await host.fill('#salaColar', resposta); await host.click('#salaUsarColado');
    await c.waitForSelector('#salaDentro:not([hidden])', { timeout: 15000 });
    confere(true, `${nome} entrou na sala`);
    convidados.push(c);
  }
  await host.waitForFunction(() => document.querySelectorAll('#salaLugares li:not(.bot)').length === 3, null, { timeout: 5000 });
  confere(true, 'o anfitrião vê as duas pessoas na lista');
  // pronto
  await convidados[0].click('#salaPronto');
  await host.waitForFunction(() => /pronto/.test(document.getElementById('salaLugares').textContent), null, { timeout: 5000 });
  confere(true, 'o anfitrião vê quem está pronto');
  // 5 lugares e uma troca de lugar
  await host.click('#salaLugaresSeg button[data-n="5"]');
  const antes = await host.evaluate(() => SALA.lugares.map(x => x === 'eu' ? 'eu' : x ? x.nome : '-').join(','));
  await host.click('#salaLugares [data-desce="1"]');
  const depois = await host.evaluate(() => SALA.lugares.map(x => x === 'eu' ? 'eu' : x ? x.nome : '-').join(','));
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
      for (const [ov, box] of [['colorOv', 'colorBtns'], ['pickOv', 'picks'], ['swapOv', 'swaps']]) if (shown(ov)) { document.querySelector(`#${box} button, #${box} .card`)?.click(); return; }
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
  await browser.close(); server.close();
}
