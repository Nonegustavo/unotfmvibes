// Jogo em rede: o anfitrião e os convidados são abas do mesmo navegador. Pela rede de mentira (BroadcastChannel com
// atraso de 100 a 300 ms, como online) ou, com --webrtc, pela conexão de verdade da rede local (WebRTC, trocando os
// códigos de convite e resposta como nos QR codes). O teste joga por todas as pessoas clicando nas cartas e nas janelas,
// e confere:
// - nenhum erro nas abas e nenhuma partida travada; as partidas terminam em todas as abas;
// - a mão de cada convidado é a que a mesa tem para ele, e todas as abas mostram a mesma vez, pilha e monte;
// - nenhum convidado recebe o que não pode saber (mãos dos outros, monte, memória dos adversários, blefe do +4, semente);
// - a carta tocada sai da mão na hora (resposta instantânea), o sino de quem tocou não volta da mesa (nem som nem aviso) e o anfitrião vê o balão de
//   quem está escolhendo.
// Uso: npm run test:rede              (3 partidas, 1 convidado, rede de mentira)
//      npm run test:rede -- 5 --regras=trade,gift,simon,rule,jumpin   (regras do modo Personalizado; "mix" para o Mix)
//      npm run test:rede -- --convidados=3   (até 5)
//      npm run test:rede -- --webrtc         (conexão de verdade)
//      npm run test:rede -- --ver            (navegador visível)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const PARTIDAS = Number(args.find(a => /^\d+$/.test(a)) || 3);
const HEADED = args.includes('--ver');
const WEBRTC = args.includes('--webrtc');
const REGRAS = (args.find(a => a.startsWith('--regras=')) || '').slice(9);
const NCONV = Math.max(1, Math.min(5, Number((args.find(a => a.startsWith('--convidados=')) || '').slice(13)) || 1));
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
const abre = async (nome, q) => {
  const p = await ctx.newPage();
  p.on('pageerror', e => erros.push(`${nome}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') erros.push(`${nome} console: ${m.text()}`); });
  await p.goto(BASE + q);
  p.nome = nome;
  return p;
};
const host = await abre('anfitrião', `?rede=${WEBRTC ? 'lan-anfitriao' : 'anfitriao'}&convidados=${NCONV}`);
const convs = [];
for (let k = 1; k <= NCONV; k++) convs.push(await abre(`convidado ${k}`, `?rede=${WEBRTC ? 'lan-convidado' : 'convidado'}&nome=${encodeURIComponent('Convidado ' + k)}`));
if (WEBRTC) {
  // convite → resposta → conexão, como na troca dos QR codes
  for (const c of convs) {
    await c.evaluate(n => { OPCOES.meuNome = n; }, c.nome.replace('convidado', 'Convidado'));
    const convite = await host.evaluate(() => redeConvidar());
    const resposta = await c.evaluate(t => redeEntrar(t), convite);
    await host.evaluate(t => redeResposta(t), resposta);
  }
}
// o sino de cada convidado: quem tocou já ouviu na prévia; o som e o aviso da mesa não podem voltar para ele
for (const c of convs) await c.evaluate(() => { window.__sinos = 0; const t0 = toast, T0 = TELA; window.toast = (m, cor) => { if (/Você tocou o sino/.test(m)) window.__sinos++; return t0(m, cor); }; window.TELA = ev => { if (ev && ev.p === 0 && ((ev.t === 'som' && ev.k === 'bell') || (ev.t === 'aviso' && /sino/.test(ev.txt)))) window.__sinos++; return T0(ev); }; });

// um passo de uma pessoa: resolve janelas, toca o sino, joga uma carta jogável ou compra/passa
const passo = p => p.evaluate(() => {
  if (!S || !S.players) return 'esperar';
  const shown = id => document.getElementById(id)?.classList.contains('show');
  const click = el => { if (el) { el.click(); return true; } return false; };
  const pick = l => l[Math.floor(Math.random() * l.length)];
  if (shown('endOv')) return 'fim';
  if (shown('pokerOv')) return click(document.getElementById('pokerGo')) && 'mix';
  for (const [ov, box] of [['colorOv', 'colorBtns'], ['pickOv', 'picks'], ['swapOv', 'swaps'], ['simonOv', 'simonBtns']])
    if (shown(ov)) { const b = [...document.querySelectorAll(`#${box} button, #${box} .card`)].filter(x => !x.disabled); return click(pick(b)) && ov; }
  // sino: quem toca vê o botão marcado na hora
  if (document.querySelectorAll('#hand .card').length === 2 && !S.players[0].called && !document.getElementById('unoBtn').disabled) { document.getElementById('unoBtn')?.click(); if (S.players[0].hand.length === 2 && (S.turn === 0 || S.players[0].hand.length === target()) && !VIS.sineta && !S.players[0].called) window.__sinetaLenta = (window.__sinetaLenta || 0) + 1; }
  const ok = [...document.querySelectorAll('#hand .card.ok')];
  // na vez, a carta tocada sai da mão na hora (resposta instantânea), antes de a mesa confirmar
  if (ok.length && Math.random() < .9) { const el = pick(ok), me = S.players[0], c = me.hand.find(x => x.id === +el.dataset.id), vez = myTurn() && c && canPlay(me, c); click(el); return vez && document.querySelector(`#hand [data-id="${el.dataset.id}"]`) ? 'lento' : 'jogar'; }
  const d = document.getElementById('drawBtn');
  // passar pelo botão da mesa ou comprar tocando no monte
  if (d && !d.disabled && !d.hidden && typeof myTurn === 'function' && myTurn()) return click(d) && 'passar';
  const monte = document.querySelector('#deck.can');
  if (monte && typeof myTurn === 'function' && myTurn()) return click(monte) && 'comprar';
  document.body.click();
  return 'esperar';
});
// o que um convidado sabe e não devia
const vazamentos = c => c.evaluate(() => {
  if (!S || !S.players) return [];
  const v = [];
  S.players.forEach((q, i) => { if (i > 0) [...(q.hand || []), ...(q.hand2 || [])].forEach(x => { if (!x.oculta && x.type !== 'batata') v.push(`carta de ${q.name} visível`); }); });
  const vistas = S.deck.filter(x => !x.oculta).length;
  if (vistas > (R.revelation ? 1 : 0)) v.push(`${vistas} cartas do monte visíveis`);
  for (const k of ['mem', 'semente', 'fxUntil']) if (S[k] !== undefined) v.push(`S.${k} chegou`);
  if (S.chal && 'bluff' in S.chal) v.push('blefe do +4 chegou');
  if (S.other) S.other.players.forEach((q, i) => { if (i > 0) (q.hand || []).forEach(x => { if (!x.oculta && x.type !== 'batata') v.push('carta do outro lado visível'); }); });
  return [...new Set(v)];
});
// cadeira de um convidado na mesa (pelo nome)
const cadeira = async c => { const nome = await c.evaluate(() => S && S.players ? S.players[0].name : null); return host.evaluate(n => S && S.players ? S.players.findIndex(p => p.name === n) : -1, nome); };
// as abas mostram a mesma partida: vez, topo da pilha e monte; e só quem está na vez vê "Sua vez"
const mesmaPartida = async c => {
  const g = await cadeira(c); if (g < 0) return [];
  const h = await host.evaluate(g => S && S.players && S.discard.length ? { vez: (S.turn - g + S.players.length) % S.players.length, topo: S.discard[S.discard.length - 1].id, monte: S.deck.length, status: document.getElementById('status').textContent, euVez: S.turn === 0 } : null, g);
  const v = await c.evaluate(() => S && S.players && S.discard.length ? { vez: S.turn, topo: S.discard[S.discard.length - 1].id, monte: S.deck.length, status: document.getElementById('status').textContent, euVez: S.turn === 0 } : null);
  if (!h || !v) return [];
  const p = [];
  if (h.vez !== v.vez || h.topo !== v.topo || h.monte !== v.monte) p.push(`${c.nome} diferente do anfitrião: ${JSON.stringify(h)} / ${JSON.stringify(v)}`);
  for (const [nome, x] of [['anfitrião', h], [c.nome, v]]) if (!x.euVez && /Sua vez/.test(x.status)) p.push(`${nome} mostra "Sua vez" fora da vez`);
  return p;
};
const maoIgual = async c => {
  const g = await cadeira(c); if (g < 0) return true;
  const a = await c.evaluate(() => S && S.players ? S.players[0].hand.map(x => x.id).sort().join(',') : '');
  const b = await host.evaluate(g => S && S.players ? S.players[g].hand.map(x => x.id).sort().join(',') : '', g);
  return a === b;
};
const foto = () => host.evaluate(() => S ? [S.turn, S.discard.length, S.players.map(p => p.hand.length).join('/'), S.phase].join('|') : '');
const janelaAberta = c => c.evaluate(() => ['colorOv', 'pickOv', 'swapOv', 'simonOv'].some(id => document.getElementById(id).classList.contains('show')));

// espera a partida começar (o anfitrião começa quando todos os convidados entram)
for (let k = 0; k < 100 && !(await host.evaluate(() => !!(S && S.players))); k++) await host.waitForTimeout(100);

const problemas = [];
let feitas = 0;
for (let g = 1; g <= PARTIDAS; g++) {
  const t0 = Date.now();
  let ultimo = await foto(), mudou = Date.now(), resultado = '', divergencias = 0, conferidas = 0, n = 0, balaoVisto = 0, janelas = 0;
  while (true) {
    // com uma janela de escolha aberta num convidado, o anfitrião vê o balão dele
    for (const c of convs) if (await janelaAberta(c)) { await host.waitForTimeout(400); balaoVisto += await host.evaluate(() => !!document.querySelector('.think')) ? 1 : 0; janelas++; }
    const a = await passo(host);
    for (const c of convs) if ((await passo(c)) === 'lento') problemas.push(`partida ${g}: a carta de ${c.nome} não saiu da mão na hora`);
    if (a === 'fim') {
      // o fim também chega a todos os convidados
      let viram = 0;
      for (const c of convs) { let ok = false; for (let k = 0; k < 30 && !ok; k++) { ok = await c.evaluate(() => document.getElementById('endOv').classList.contains('show')); if (!ok) await host.waitForTimeout(100); } if (ok) viram++; else problemas.push(`partida ${g}: o fim não chegou a ${c.nome}`); }
      resultado = (await host.evaluate(() => document.getElementById('endTitle').textContent)) + ` (${viram} de ${convs.length} convidados viram o fim)`;
      await host.click('#againBtn'); for (const c of convs) await c.evaluate(() => document.getElementById('againBtn').click());
      break;
    }
    await host.waitForTimeout(120);
    if (++n % 15 === 0) {
      // espera a rede assentar e confere as mãos, as abas e o que cada convidado recebeu
      await host.waitForTimeout(700);
      for (const c of convs) {
        conferidas++;
        if (!(await maoIgual(c))) { await host.waitForTimeout(800); if (!(await maoIgual(c))) divergencias++; }
        // os adversários não param de jogar: só conta se a diferença continuar em 3 conferências seguidas
        let dif = await mesmaPartida(c); for (let k = 0; k < 2 && dif.length; k++) { await host.waitForTimeout(900); dif = await mesmaPartida(c); } for (const x of dif) problemas.push(`partida ${g}: ${x}`);
        for (const v of await vazamentos(c)) problemas.push(`partida ${g}: ${c.nome}: ${v}`);
      }
    }
    const agora = await foto();
    if (agora !== ultimo) { ultimo = agora; mudou = Date.now(); }
    if (Date.now() - mudou > 20000) {
      resultado = 'TRAVOU'; problemas.push(`partida ${g} travou`);
      console.log('anfitrião:', JSON.stringify(await host.evaluate(() => ({ vez: S.turn, busy: S.busy, auto: S.auto, fase: S.phase, compra: S.pending, pedidos: Object.keys(ANF.pedidos), enviadas: REDE.enviadas, registro: VIS.log }))));
      for (const c of convs) console.log(c.nome + ':', JSON.stringify(await c.evaluate(() => ({ vez: S.turn, busy: S.busy, fase: S.phase, recebidas: REDE.recebidas, ultimas: REDE.ultimas, registro: VIS.log, janelas: ['colorOv', 'pickOv', 'swapOv', 'simonOv'].filter(id => document.getElementById(id).classList.contains('show')) }))));
      await host.screenshot({ path: path.join(ROOT, 'tests', `rede-travou-${g}-anfitriao.png`) });
      break;
    }
    if (Date.now() - t0 > 6 * 60 * 1000) { resultado = 'tempo esgotado'; problemas.push(`partida ${g} não terminou em 6 min`); break; }
  }
  if (janelas && !balaoVisto) problemas.push(`partida ${g}: o anfitrião não viu o balão de quem escolhia (${janelas} janelas)`);
  if (divergencias) problemas.push(`partida ${g}: mão de convidado diferente da mesa ${divergencias} vez(es) em ${conferidas} conferências`);
  feitas++;
  console.log(`Partida ${g}/${PARTIDAS}: ${resultado} (${Math.round((Date.now() - t0) / 1000)} s, ${conferidas} conferências, balão visto em ${balaoVisto} de ${janelas} janelas)`);
  if (resultado === 'TRAVOU') break;
}
for (const c of convs) {
  const sino = await c.evaluate(() => ({ lenta: window.__sinetaLenta || 0, eco: window.__sinos }));
  if (sino.eco) problemas.push(`o sino de ${c.nome} voltou da mesa para ele ${sino.eco} vez(es)`);
  if (sino.lenta) problemas.push(`o sino de ${c.nome} não respondeu na hora ${sino.lenta} vez(es)`);
}
await browser.close(); server.close();
const todos = [...new Set([...problemas, ...erros])];
console.log(`\nPartidas: ${feitas} | Convidados: ${NCONV}${WEBRTC ? ' (WebRTC)' : ' (rede de mentira)'}${REGRAS ? ' | Regras: ' + REGRAS : ''} | Problemas: ${todos.length}`);
for (const p of todos.slice(0, 20)) console.log('  - ' + p);
process.exit(todos.length ? 1 : 0);
