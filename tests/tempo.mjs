// Regras do multiplayer (fase 1.5, etapa 3), pela rede de mentira com tempos curtos (?tempo=rapido: 2 a 3 s):
// 1. Mix de Regras com 3 pessoas: cada uma escolhe a sua, uma por vez, e a partida começa quando todas fecham a lista;
// 2. tempo para jogar: um convidado parado é substituído pelo computador a cada tempo esgotado, fica com ele depois de 3
//    seguidos e volta ao tocar numa carta;
// 3. queda: a aba do convidado fecha, o computador assume em até 10 s e, com a aba aberta de novo (mesmo aparelho),
//    ele volta para a mesma cadeira.
// Uso: npm run test:tempo
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
const browser = await chromium.launch();
const erros = [];
const falhou = m => { console.error('FALHOU: ' + m); process.exitCode = 1; };
const confere = (ok, m) => ok ? console.log('ok: ' + m) : falhou(m);
// a rede de mentira só funciona entre abas do mesmo contexto: cada aba finge ser um aparelho pelo ?id= (o número dele)
let ctx = null;
const novoCtx = async cfg => { if (ctx) await ctx.close(); ctx = await browser.newContext({ viewport: { width: 390, height: 800 } }); await ctx.addInitScript(c => { try { localStorage.setItem('unotfm-solo-cfg', JSON.stringify(c)); } catch (e) {} }, cfg); };
const aparelho = async (nome, q) => {
  const p = await ctx.newPage();
  p.on('pageerror', e => erros.push(`${nome}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/O convidado chamou|navigator.vibrate/.test(m.text())) erros.push(`${nome} console: ${m.text()}`); });
  await p.goto(BASE + q + '&id=' + encodeURIComponent(nome));p.nome = nome;
  return p;
};
const espera = async (p, fn, arg, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await p.evaluate(fn, arg)) return true; await p.waitForTimeout(150); } return false; };
// joga por uma pessoa: janelas, carta jogável, comprar/passar
const joga = p => p.evaluate(() => {
  if (!S || !S.players) return;
  const shown = id => document.getElementById(id)?.classList.contains('show');
  if (shown('pokerOv')) { document.getElementById('pokerGo').click(); return; }
  for (const [ov, box] of [['colorOv', 'colorBtns'], ['pickOv', 'picks'], ['swapOv', 'swaps'], ['simonOv', 'simonBtns']]) if (shown(ov)) { document.querySelector(`#${box} button, #${box} .card`)?.click(); return; }
  const ok = document.querySelector('#hand .card.ok'); if (ok) { ok.click(); return; }
  if (myTurn()) document.getElementById('drawBtn').click();
});

try {
  /* ---------- 1. Mix com 3 pessoas ---------- */
  {
    await novoCtx({ mode: 'mix' });
    const host = await aparelho('anfitrião', '?rede=anfitriao&convidados=2&tempo=rapido');
    const a = await aparelho('Ana', '?rede=convidado&nome=Ana');
    const b = await aparelho('Beto', '?rede=convidado&nome=Beto');
    // cada pessoa escolhe a primeira regra da janela dela, quando ela aparecer
    const escolhidas = [];
    for (let k = 0; k < 120 && escolhidas.length < 3; k++) {
      for (const p of [host, a, b]) {
        const r = await p.evaluate(() => { const o = document.getElementById('swapOv'); if (!o.classList.contains('show')) return null; const bt = document.querySelector('#swaps button'); const k = bt && bt.dataset.k; bt && bt.click(); return k; });
        if (r) escolhidas.push([p.nome, r]);
      }
      await host.waitForTimeout(150);
    }
    confere(escolhidas.length === 3, `as 3 pessoas escolheram, uma por vez: ${escolhidas.map(x => x.join(' → ')).join(', ')}`);
    const lista = await espera(host, () => document.getElementById('pokerOv').classList.contains('show'));
    const listaConv = await espera(a, () => document.getElementById('pokerOv').classList.contains('show'));
    confere(lista && listaConv, 'a lista das regras abre para o anfitrião e para os convidados');
    const added = await host.evaluate(() => S.added.map(x => texto(x.by)));
    confere(added.length >= 4 && ['você', 'Ana', 'Beto'].every(n => added.includes(n)), `regras de cada um: ${added.join(', ')}`);
    // o anfitrião fecha; a partida só começa quando os outros fecharem (ou o tempo do Mix acabar)
    await host.evaluate(() => document.getElementById('pokerGo').click());
    await host.waitForTimeout(500);
    confere(await host.evaluate(() => !S.discard.length), 'com só o anfitrião tendo fechado, a partida ainda não começou');
    confere(await host.evaluate(() => VIS.mixVoou && !!document.querySelector('.rulefly, #rulestrip .ri.fresh')), 'os ícones do anfitrião voaram para a faixa assim que ele fechou');
    confere(await a.evaluate(() => !VIS.mixVoou && document.getElementById('pokerOv').classList.contains('show')), 'a lista da Ana continua aberta (os ícones dela ainda não voaram)');
    for (const p of [a, b]) await p.evaluate(() => document.getElementById('pokerGo').click());
    confere(await espera(host, () => S.discard.length > 0), 'todos fecharam: as cartas foram distribuídas');

  }

  /* ---------- 1b. a lista do Mix fica aberta até o tempo acabar ---------- */
  {
    await novoCtx({ mode: 'mix' });
    const host = await aparelho('anfitrião', '?rede=anfitriao&tempo=rapido');
    const f = await aparelho('Fábio', '?rede=convidado&nome=F%C3%A1bio');
    for (let k = 0; k < 80; k++) {
      for (const p of [host, f]) await p.evaluate(() => { if (document.getElementById('swapOv').classList.contains('show')) document.querySelector('#swaps button')?.click(); });
      if (await f.evaluate(() => document.getElementById('pokerOv').classList.contains('show'))) break;
      await host.waitForTimeout(150);
    }
    await host.evaluate(() => document.getElementById('pokerGo').click());
    const comecou = await espera(host, () => S.discard.length > 0, null, 8000);
    confere(comecou, 'o tempo do Mix acabou com a lista do Fábio aberta: a partida começou');
    confere(await espera(f, () => VIS.mixVoou && !document.getElementById('pokerOv').classList.contains('show'), null, 3000), 'a lista dele fechou sozinha e os ícones voaram');
  }

  /* ---------- 2. tempo para jogar ---------- */
  {
    await novoCtx({ mode: 'classic' });
    const host = await aparelho('anfitrião', '?rede=anfitriao&tempo=rapido');
    const c = await aparelho('Caio', '?rede=convidado&nome=Caio');
    await espera(host, () => S && S.players && S.discard.length);
    const g = await host.evaluate(() => S.players.findIndex(p => p.name === 'Caio'));
    // o anfitrião joga; o Caio fica parado
    let substituido = false, fixo = false, barra = false;
    const t0 = Date.now();
    while (Date.now() - t0 > -1 && Date.now() - t0 < 90000 && !fixo) {
      await joga(host);
      const st = await host.evaluate(g => ({ c: S.players[g].ctrl, real: S.players[g].ctrlReal, esg: S.players[g].esgotou || 0, vez: S.turn, fase: S.phase }), g);
      if (st.real) substituido = true;
      if (st.esg >= 3 && st.real && st.vez !== g) fixo = true;
      if (!barra) barra = await c.evaluate(() => { const b = document.getElementById('tempoBar'); return !!b && !b.hidden; });
      if (st.fase === 'over') { await host.evaluate(() => document.getElementById('againBtn').click()); await host.waitForTimeout(800); }
      await host.waitForTimeout(150);
    }
    confere(barra, 'o convidado vê a barra do tempo na vez dele');
    confere(substituido, 'tempo esgotado: o computador jogou pelo convidado');
    confere(fixo, 'depois de 3 tempos esgotados seguidos, o computador ficou na cadeira');
    confere(await host.evaluate(g => seatStatus(g).some(x => x.ic === '💤'), g), 'a cadeira dele mostra 💤 (Ausente) para o anfitrião');
    // ele toca numa carta (ou compra) na vez dele: volta a jogar
    let voltou = false;
    for (let k = 0; k < 400 && !voltou; k++) {
      await joga(host);
      await c.evaluate(() => { const ok = document.querySelector('#hand .card'); if (ok && S.turn === 0) ok.click(); });
      voltou = await host.evaluate(g => !S.players[g].ctrlReal && S.players[g].ctrl === 'rede', g);
      if (await host.evaluate(() => S.phase === 'over')) { await host.evaluate(() => document.getElementById('againBtn').click()); await host.waitForTimeout(800); }
      await host.waitForTimeout(150);
    }
    confere(voltou, 'ao agir de novo, o convidado voltou a jogar');

  }

  /* ---------- 3. queda e volta ---------- */
  {
    await novoCtx({ mode: 'classic' });
    const host = await aparelho('anfitrião', '?rede=anfitriao');
    const abreD = () => aparelho('Dora', '?rede=convidado&nome=Dora');
    let d = await abreD();
    await espera(host, () => S && S.players && S.discard.length);
    const g = await host.evaluate(() => S.players.findIndex(p => p.name === 'Dora'));
    const id1 = await d.evaluate(() => OPCOES.meuId);
    await d.close();
    const t0 = Date.now();
    let caiu = false;
    while (Date.now() - t0 < 15000 && !caiu) { await joga(host); caiu = await host.evaluate(g => !!S.players[g].caiu, g); await host.waitForTimeout(200); }
    confere(caiu, `a aba fechou: em ${((Date.now() - t0) / 1000).toFixed(1)} s o anfitrião marcou a queda`);
    // a partida continua com o computador na cadeira
    const v0 = await host.evaluate(() => S.vezes);
    for (let k = 0; k < 40; k++) { await joga(host); await host.waitForTimeout(150); if (await host.evaluate(() => S.phase === 'over')) break; }
    confere(await host.evaluate(v0 => S.vezes > v0 || S.phase === 'over', v0), 'a partida seguiu com o computador jogando por ela');
    // volta: a mesma pessoa (mesmo aparelho) abre de novo
    d = await abreD();
    confere((await d.evaluate(() => OPCOES.meuId)) === id1, 'o aparelho tem o mesmo número de antes');
    const voltou = await espera(host, g => !S.players[g].caiu, g, 12000);
    confere(voltou, 'ao abrir de novo, ela voltou para a mesma cadeira');
    confere(await espera(d, () => S && S.players && S.players[0].name === 'Dora', null, 8000), 'na tela dela, ela está embaixo de novo');

  }

  /* ---------- 4. janela de escolha aberta até o tempo acabar ---------- */
  {
    await novoCtx({ mode: 'custom', poker: false, trade: true });
    const host = await aparelho('anfitrião', '?rede=anfitriao&tempo=rapido');
    const e = await aparelho('Eva', '?rede=convidado&nome=Eva');
    await espera(host, () => S && S.players && S.discard.length);
    const g = await host.evaluate(() => S.players.findIndex(p => p.name === 'Eva'));
    // a Eva recebe uma Carta da Troca da cor da mesa; quando for a vez dela, joga e deixa a janela aberta
    let abriu = false, fechou = false, trocou = false;
    for (let k = 0; k < 300 && !fechou; k++) {
      if (await host.evaluate(g => S.turn !== g, g)) { await joga(host); await host.waitForTimeout(150); continue; }
      if (!abriu) {
        await host.evaluate(g => { const p = S.players[g]; if (!p.hand.some(c => c.type === 'trade')) { p.hand.push(mk(S.color === 'k' ? 'r' : S.color, 'trade')); atualiza(); } }, g);
        await e.waitForTimeout(700);
        await e.evaluate(() => { const c = [...document.querySelectorAll('#hand .card.ok')].find(x => S.players[0].hand.find(y => y.id === +x.dataset.id)?.type === 'trade'); c && c.click(); });
        abriu = await espera(e, () => document.getElementById('swapOv').classList.contains('show'), null, 4000);
        if (!abriu) continue;
      }
      fechou = await espera(e, () => !document.getElementById('swapOv').classList.contains('show'), null, 5000);
      trocou = await espera(host, () => /trocou de mão/.test(VIS.log.join(' ')), null, 4000);
    }
    confere(abriu, 'a janela da Troca abriu para a convidada');
    confere(fechou, 'o tempo acabou e a janela dela fechou sozinha');
    confere(trocou, 'o computador escolheu por ela e a troca aconteceu');
  }
} catch (e) {
  falhou(e.message);
} finally {
  if (erros.length) falhou('erros nas páginas:\n' + [...new Set(erros)].slice(0, 10).join('\n'));
  await browser.close(); server.close();
}
