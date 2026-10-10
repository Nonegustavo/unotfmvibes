// Regras que mudam com várias pessoas, na rede de mentira (o anfitrião e dois convidados em abas): Segunda Chance de
// cada pessoa (o botão só na vez dela), Dança das Cadeiras com pessoas trocando de lugar (jogada por bot, convidado e anfitrião) e Torneio de
// Sobrevivência com pessoas saindo do torneio. A partida é montada à mão (cartas postas na mão de quem está com a vez,
// pontos do torneio ajustados) e o teste confere o que cada tela mostra.
// Uso: npm run test:rede-regras   (--ver abre o navegador visível)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEADED = process.argv.includes('--ver');
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
// 5 cadeiras: anfitrião, Ana, Bia e dois bots; o Portal leva junto as mãos do outro lado
await ctx.addInitScript(() => { try { localStorage.setItem('unotfm-solo-cfg', JSON.stringify({ mode: 'custom', poker: false, mulligan: true, chair: true, portal: true, survivor: true, bots: 4 })); } catch (e) {} });
const erros = [];
const falhou = m => { console.error('FALHOU: ' + m); process.exitCode = 1; };
const confere = (ok, m) => ok ? console.log('ok: ' + m) : falhou(m);
const abre = async (nome, q) => {
  const p = await ctx.newPage(); p.nome = nome;
  p.on('pageerror', e => erros.push(`${nome}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/vibrate/.test(m.text())) erros.push(`${nome} console: ${m.text()}`); });
  await p.goto(BASE + q); return p;
};
const espera = ms => new Promise(r => setTimeout(r, ms));
const ate = async (p, fn, arg, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await espera(150); } return false; };

try {
  const host = await abre('anfitrião', '?rede=anfitriao&convidados=2');
  const ana = await abre('Ana', '?rede=convidado&nome=Ana');
  const bia = await abre('Bia', '?rede=convidado&nome=Bia');
  const convs = [ana, bia];
  confere(await ate(host, () => S && S.phase === 'play' && S.players.length === 5 && !S.busy), 'a partida começou com 5 cadeiras');
  await espera(800);

  // ---------- Segunda Chance: cada pessoa tem a sua, e o botão só aparece na vez dela ----------
  const mull = p => p.evaluate(() => !document.getElementById('mullBtn').hidden);
  const vezDe = nome => host.evaluate(n => { S.turn = S.players.findIndex(p => p.name === n); S.tok++; atualiza(); }, nome);
  await vezDe('Ana');
  confere(await ate(ana, () => !document.getElementById('mullBtn').hidden, null, 5000) && !(await mull(host)) && !(await mull(bia)), 'só quem está com a vez (Ana) vê "Trocar mão"');
  const antes = await ana.evaluate(() => S.players[0].hand.map(c => c.id).sort().join(','));
  await ana.click('#mullBtn');
  confere(await ate(ana, a => S.players[0].hand.map(c => c.id).sort().join(',') !== a && document.getElementById('mullBtn').hidden, antes, 5000), 'Ana trocou a mão e o botão sumiu para ela');
  await vezDe('Bia');
  confere(await ate(bia, () => !document.getElementById('mullBtn').hidden, null, 5000) && !(await mull(ana)), 'na vez de Bia, ela vê "Trocar mão" (e Ana não)');
  confere(await host.evaluate(() => S.players.filter(p => p.name === 'Anfitrião' || p.name === 'Bia').every(p => p.mull)), 'o anfitrião e Bia continuam com a Segunda Chance');

  // ---------- Dança das Cadeiras ----------
  // compara cada convidado com a mesa: ele se vê embaixo, a ordem é a da mesa girada, mão, vez e o outro lado do Portal
  const compara = async () => {
    const h = await host.evaluate(() => ({ nomes: S.players.map(p => p.name), maos: S.players.map(p => p.hand.map(c => c.id).sort().join(',')), vez: S.turn, outro: S.other ? S.other.players.map(p => p.hand.length) : null, hist: (VIS.hist || []).filter(x => x.by != null).map(x => S.players[x.by].name) }));
    const probs = [];
    for (const c of convs) {
      const g = await c.evaluate(() => ({ nomes: S.players.map(p => p.name), mao: S.players[0].hand.map(c => c.id).sort().join(','), vez: S.turn, outro: S.other ? S.other.players.map(p => p.hand.length) : null, hist: (VIS.hist || []).filter(x => x.by != null).map(x => S.players[x.by].name) }));
      const k = h.nomes.indexOf(g.nomes[0]), n = h.nomes.length;
      if (g.nomes[0] !== c.nome) probs.push(`${c.nome} se vê como ${g.nomes[0]}`);
      if (g.nomes.some((x, i) => x !== h.nomes[(i + k) % n])) probs.push(`${c.nome}: ordem ${g.nomes} na mesa ${h.nomes}`);
      if (g.mao !== h.maos[k]) probs.push(`${c.nome}: mão diferente da mesa`);
      if ((g.vez + k) % n !== h.vez) probs.push(`${c.nome}: vez diferente`);
      if (g.outro && h.outro && g.outro.some((x, i) => x !== h.outro[(i + k) % n])) probs.push(`${c.nome}: outro lado do Portal diferente`);
      if (g.hist.join() !== h.hist.join()) probs.push(`${c.nome}: histórico ${g.hist} x ${h.hist}`);
    }
    return { probs, h };
  };
  const quemJogou = new Set();
  let trocas = 0, jogadas = 0;
  for (let r = 0; r < 8 && quemJogou.size < 3; r++) {
    if (!(await ate(host, () => S.phase === 'play' && !S.busy && !S.players[S.turn].out, null, 25000))) { falhou('a vez não chegou a ninguém'); break; }
    // as pessoas aqui só jogam a Dança: uma compra acumulada (+2 de um bot) sai da mesa antes
    const { ctrl, nome, ordem } = await host.evaluate(() => { S.pending = 0; S.pendingType = null; S.chal = null; return { ctrl: S.players[S.turn].ctrl, nome: S.players[S.turn].name, ordem: S.players.map(p => p.name).join(',') }; });
    // a carta da Dança na cor da mesa, na mão de quem está com a vez
    const id = await host.evaluate(() => { const c = mk(S.color === 'k' ? 'r' : S.color, 'chair'); S.players[S.turn].hand.push(c); atualiza(); return c.id; });
    if (ctrl === 'bot') await host.evaluate(id => { const c = S.players[S.turn].hand.find(x => x.id === id); S.tok++; jogar(S.turn, c); }, id);
    else { const pg = ctrl === 'tela' ? host : nome === 'Ana' ? ana : bia; await espera(700); await pg.click(`#hand [data-id="${id}"]`); }
    // a carta foi jogada (está na mesa) e a vez passou
    await ate(host, id => S.discard.some(c => c.id === id) && !S.busy, id, 15000);
    await espera(1200);
    let res = await compara();
    for (let k = 0; k < 4 && res.probs.length; k++) { await espera(700); res = await compara(); }
    const depois = res.h.nomes.join(',');
    jogadas++; if (depois !== ordem) trocas++;
    confere(!res.probs.length, `Dança jogada por ${nome} (${ctrl === 'tela' ? 'anfitrião' : ctrl === 'bot' ? 'bot' : 'convidado'}): ${ordem} → ${depois}${res.probs.length ? ' | ' + res.probs.join('; ') : ''}`);
    confere(res.h.nomes[0] === 'Anfitrião', 'o anfitrião continua na cadeira 0');
    quemJogou.add(ctrl);
  }
  confere(quemJogou.size === 3, `a Dança foi jogada por bot, convidado e anfitrião (${[...quemJogou].join(', ')})`);
  confere(trocas === jogadas, `a Dança sempre mudou alguém de lugar (${trocas} de ${jogadas} jogadas)`);

  // ---------- Torneio de Sobrevivência ----------
  const fim = async () => { for (const p of [host, ...convs]) await ate(p, () => document.getElementById('endOv').classList.contains('show'), null, 8000); };
  const sub = p => p.evaluate(() => document.getElementById('endSub').textContent);
  const tabela = p => p.evaluate(() => [...document.querySelectorAll('#scoreTbl tr')].map(r => r.textContent).join(' | '));
  // Ana chega a 300: sai do torneio e assiste à próxima partida na cadeira dela
  await host.evaluate(() => { TOUR.pts.Ana = 295; endRound(0); });
  await fim();
  confere(/Você saiu do torneio/.test(await sub(ana)) && /Ana saiu do torneio/.test(await sub(bia)), 'Ana fica sabendo que saiu do torneio (e Bia vê que ela saiu)');
  confere(/Você \(fora\)/.test(await tabela(ana)) && /Ana \(fora\)/.test(await tabela(host)), 'o placar mostra "Você" para cada um e quem está fora');
  await host.click('#againBtn');
  confere(await ate(host, () => S && S.phase === 'play' && TOUR.round === 2), 'a segunda partida do torneio começou');
  await espera(1500);
  const a2 = await ana.evaluate(() => ({ fora: !!S.players[0].out, mao: S.players[0].hand.length, status: document.getElementById('status').textContent }));
  confere(a2.fora && a2.mao === 0 && /Fora do torneio/.test(a2.status), `Ana assiste sem cartas na cadeira dela (${JSON.stringify(a2)})`);
  confere(await host.evaluate(() => S.players.length === 5 && S.players.filter(p => !p.out).every(p => p.hand.length > 0)), 'as outras cadeiras receberam cartas');
  // Bia e o anfitrião também saem: sem nenhuma pessoa no torneio, ele acaba
  await host.evaluate(() => { const i = S.players.findIndex(p => p.ctrl === 'bot' && !p.out); TOUR.pts.Bia = 299; TOUR.pts[S.players[0].name] = 299; endRound(i); });
  await fim();
  confere(/Todas as pessoas saíram do torneio/.test(await sub(host)) && await host.evaluate(() => document.getElementById('againBtn').textContent === 'Novo torneio'), 'sem pessoas no torneio, ele acaba ("Novo torneio")');
} catch (e) {
  falhou(e.stack || e.message);
} finally {
  if (erros.length) falhou('erros nas páginas:\n' + [...new Set(erros)].slice(0, 10).join('\n'));
  await browser.close(); server.close();
}
