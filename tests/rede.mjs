// Rede de mentira: duas abas do mesmo navegador jogam a mesma partida (anfitrião na cadeira 0, convidado na 1) pelo
// BroadcastChannel com atraso. O teste joga pelas duas pessoas clicando nas cartas e nas janelas, e confere:
// - nenhum erro nas duas abas e nenhuma partida travada;
// - a mão do convidado é a mesma que a mesa tem para ele;
// - o convidado não recebe o que não pode saber (mãos dos outros, monte, memória dos adversários, blefe do +4, semente);
// - as partidas terminam nas duas abas.
// Uso: npm run test:rede              (3 partidas)
//      npm run test:rede -- 5 --regras=trade,gift,simon,rule,jumpin   (regras do modo Personalizado)
//      npm run test:rede -- --ver     (abre o navegador visível, com as duas abas lado a lado)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const PARTIDAS = Number(args.find(a => /^\d+$/.test(a)) || 3);
const HEADED = args.includes('--ver');
const REGRAS = (args.find(a => a.startsWith('--regras=')) || '').slice(9);
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
const BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch(HEADED ? { headless: false, channel: 'chrome' } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
await ctx.addInitScript(regras => {
  try { localStorage.setItem('unotfm-solo-cfg', JSON.stringify(regras === 'mix' ? { mode: 'mix' } : regras ? { mode: 'custom', poker: false, ...Object.fromEntries(regras.split(',').map(k => [k.trim(), true])) } : { mode: 'classic' })); } catch (e) {}
}, REGRAS);
const erros = [];
const abre = async (modo) => {
  const p = await ctx.newPage();
  p.on('pageerror', e => erros.push(`${modo}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') erros.push(`${modo} console: ${m.text()}`); });
  await p.goto(BASE + '?rede=' + modo);
  return p;
};
const host = await abre('anfitriao');
const conv = await abre('convidado');

// um passo de uma pessoa: resolve janelas, toca a sineta, joga uma carta jogável ou compra/passa
const passo = p => p.evaluate(() => {
  const shown = id => document.getElementById(id)?.classList.contains('show');
  const click = el => { if (el) { el.click(); return true; } return false; };
  const pick = l => l[Math.floor(Math.random() * l.length)];
  if (shown('endOv')) return 'fim';
  if (shown('pokerOv')) return click(document.getElementById('pokerGo')) && 'mix';
  for (const [ov, box] of [['colorOv', 'colorBtns'], ['pickOv', 'picks'], ['swapOv', 'swaps'], ['simonOv', 'simonBtns']])
    if (shown(ov)) { const b = [...document.querySelectorAll(`#${box} button, #${box} .card`)].filter(x => !x.disabled); return click(pick(b)) && ov; }
  if (document.querySelectorAll('#hand .card').length === 2) document.getElementById('unoBtn')?.click();
  const ok = [...document.querySelectorAll('#hand .card.ok')];
  // na vez, a carta tocada sai da mão na hora (resposta instantânea), antes de a mesa confirmar
  if (ok.length && Math.random() < .9) { const el = pick(ok), me = S.players[0], c = me.hand.find(x => x.id === +el.dataset.id), vez = myTurn() && c && canPlay(me, c); click(el); return vez && document.querySelector(`#hand [data-id="${el.dataset.id}"]`) ? 'lento' : 'jogar'; }
  const d = document.getElementById('drawBtn');
  // comprar pelo botão ou tocando no monte
  if (d && !d.disabled && !d.hidden && typeof myTurn === 'function' && myTurn()) return click(Math.random() < .5 ? d : document.getElementById('deck')) && 'comprar';
  document.body.click();
  return 'esperar';
});
// o que o convidado sabe e não devia
const vazamentos = () => conv.evaluate(() => {
  if (!S || !S.players) return [];
  const v = [];
  S.players.forEach((q, i) => { if (i > 0) [...(q.hand || []), ...(q.hand2 || [])].forEach(c => { if (!c.oculta && c.type !== 'batata') v.push(`carta de ${q.name} visível`); }); });
  const vistas = S.deck.filter(c => !c.oculta).length;
  if (vistas > (R.revelation ? 1 : 0)) v.push(`${vistas} cartas do monte visíveis`);
  for (const k of ['mem', 'semente', 'fxUntil', 'autoResolveMesa']) if (S[k] !== undefined) v.push(`S.${k} chegou`);
  if (S.chal && 'bluff' in S.chal) v.push('blefe do +4 chegou');
  if (S.other) S.other.players.forEach((q, i) => { if (i > 0) (q.hand || []).forEach(c => { if (!c.oculta && c.type !== 'batata') v.push('carta do outro lado visível'); }); });
  return [...new Set(v)];
});
// as duas abas mostram a mesma partida: vez, topo da pilha e monte; e só quem está na vez vê "Sua vez"
const mesmaPartida = async () => {
  const h = await host.evaluate(() => S && S.players ? { vez: (S.turn - 1 + S.players.length) % S.players.length, topo: S.discard[S.discard.length - 1].id, monte: S.deck.length, fase: S.phase, status: document.getElementById('status').textContent, euVez: S.turn === 0 } : null);
  const c = await conv.evaluate(() => S && S.players ? { vez: S.turn, topo: S.discard[S.discard.length - 1].id, monte: S.deck.length, fase: S.phase, status: document.getElementById('status').textContent, euVez: S.turn === 0 } : null);
  if (!h || !c) return [];
  const p = [];
  if (h.vez !== c.vez || h.topo !== c.topo || h.monte !== c.monte) p.push(`abas diferentes: anfitrião ${JSON.stringify(h)}, convidado ${JSON.stringify(c)}`);
  for (const [nome, x] of [['anfitrião', h], ['convidado', c]]) if (!x.euVez && /Sua vez/.test(x.status)) p.push(`${nome} mostra "Sua vez" fora da vez`);
  return p;
};
const maoConvidado = () => conv.evaluate(() => S && S.players ? S.players[0].hand.map(c => c.id).sort().join(',') : '');
const maoNaMesa = () => host.evaluate(() => S && S.players ? S.players[1].hand.map(c => c.id).sort().join(',') : '');
const foto = () => host.evaluate(() => S ? [S.turn, S.discard.length, S.players.map(p => p.hand.length).join('/'), S.phase].join('|') : '');

const problemas = [];
let feitas = 0;
for (let g = 1; g <= PARTIDAS; g++) {
  const t0 = Date.now();
  let ultimo = await foto(), mudou = Date.now(), resultado = '', divergencias = 0, conferidas = 0, n = 0, balaoVisto = 0, janelas = 0;
  while (true) {
    // com uma janela de escolha aberta no convidado, o anfitrião vê o balão dele
    if (await conv.evaluate(() => ['colorOv', 'pickOv', 'swapOv', 'simonOv'].some(id => document.getElementById(id).classList.contains('show')))) {
      await host.waitForTimeout(400); balaoVisto += await host.evaluate(() => !!document.querySelector('.think')) ? 1 : 0; janelas++;
    }
    const [a, b] = [await passo(host), await passo(conv)];
    if (b === 'lento') problemas.push(`partida ${g}: a carta do convidado não saiu da mão na hora`);
    if (a === 'fim') {
      // o fim também chega ao convidado
      let chegou = false; for (let k = 0; k < 30 && !chegou; k++) { chegou = await conv.evaluate(() => document.getElementById('endOv').classList.contains('show')); if (!chegou) await host.waitForTimeout(100); }
      resultado = (await host.evaluate(() => document.getElementById('endTitle').textContent)) + (chegou ? ' (o convidado viu o fim)' : ' (O CONVIDADO NÃO VIU O FIM)');
      if (!chegou) problemas.push(`partida ${g}: o fim não chegou ao convidado`);
      await host.click('#againBtn'); await conv.evaluate(() => document.getElementById('againBtn').click());
      break;
    }
    await host.waitForTimeout(120);
    if (++n % 15 === 0) {
      // espera a rede assentar e confere a mão do convidado e o que ele recebeu
      await host.waitForTimeout(700);
      const [m1, m2] = [await maoConvidado(), await maoNaMesa()];
      conferidas++;
      if (m1 !== m2) { await host.waitForTimeout(800); if ((await maoConvidado()) !== (await maoNaMesa())) divergencias++; }
      let dif = await mesmaPartida(); if (dif.length) { await host.waitForTimeout(1000); dif = await mesmaPartida(); } for (const x of dif) problemas.push(`partida ${g}: ${x}`);
      for (const v of await vazamentos()) problemas.push(`partida ${g}: ${v}`);
    }
    const agora = await foto();
    if (agora !== ultimo) { ultimo = agora; mudou = Date.now(); }
    if (Date.now() - mudou > 20000) { resultado = 'TRAVOU'; problemas.push(`partida ${g} travou`); console.log('anfitrião:', JSON.stringify(await host.evaluate(() => ({ vez: S.turn, busy: S.busy, auto: S.auto, fase: S.phase, compra: S.pending, pedidos: Object.keys(REDE.pedidos), enviadas: REDE.enviadas, registro: VIS.log, janelas: ['colorOv','pickOv','swapOv','simonOv'].filter(id => document.getElementById(id).classList.contains('show')) })))); console.log('convidado:', JSON.stringify(await conv.evaluate(() => ({ vez: S.turn, busy: S.busy, fase: S.phase, recebidas: REDE.recebidas, ultimas: REDE.ultimas, registro: VIS.log, janelas: ['colorOv','pickOv','swapOv','simonOv'].filter(id => document.getElementById(id).classList.contains('show')) })))); await host.screenshot({ path: path.join(ROOT, 'tests', `rede-travou-${g}-anfitriao.png`) }); await conv.screenshot({ path: path.join(ROOT, 'tests', `rede-travou-${g}-convidado.png`) }); break; }
    if (Date.now() - t0 > 6 * 60 * 1000) { console.log('anfitrião:', JSON.stringify(await host.evaluate(() => ({ vez: S.turn, busy: S.busy, fase: S.phase, vezes: S.vezes, regras: Object.keys(R).filter(k => R[k] === true), maos: S.players.map(p => p.hand.length), clima: S.weather, maldicao: S.curse, janelas: ['colorOv','pickOv','swapOv','simonOv','pokerOv'].filter(id => document.getElementById(id).classList.contains('show')), registro: VIS.log }))));
      resultado = 'tempo esgotado'; problemas.push(`partida ${g} não terminou em 6 min`); break; }
  }
  if (janelas && !balaoVisto) problemas.push(`partida ${g}: o anfitrião não viu o balão do convidado escolhendo (${janelas} janelas)`);
  if (divergencias) problemas.push(`partida ${g}: a mão do convidado ficou diferente da mesa ${divergencias} vez(es) em ${conferidas} conferências`);
  feitas++;
  console.log(`Partida ${g}/${PARTIDAS}: ${resultado} (${Math.round((Date.now() - t0) / 1000)} s, mão conferida ${conferidas} vezes, balão do convidado visto em ${balaoVisto} de ${janelas} janelas)`);
  if (resultado === 'TRAVOU') break;
}
await browser.close(); server.close();
const todos = [...new Set([...problemas, ...erros])];
console.log(`\nPartidas: ${feitas}${REGRAS ? ' | Regras: ' + REGRAS : ''} | Problemas: ${todos.length}`);
for (const p of todos.slice(0, 20)) console.log('  - ' + p);
process.exit(todos.length ? 1 : 0);
