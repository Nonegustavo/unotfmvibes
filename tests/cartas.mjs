// Teste de cada carta e regra: monta uma situação com semente fixa, joga a carta (ou começa a partida com a regra),
// avança o tempo pelo relógio virtual do turbo e compara o resultado (mãos, mesa, vez, registro da partida e eventos mandados à tela) com o guardado em
// tests/cartas-resultados.json. Serve para conferir que uma mudança no código não mudou o jogo.
// Uso: npm run test:cartas                     (compara com os resultados guardados)
//      npm run test:cartas -- --gravar         (grava os resultados de agora, depois de uma mudança de propósito)
//      npm run test:cartas -- --so=carta:dice  (só os cenários cujo nome contém o texto)
//      npm run test:cartas -- --ignorar=eventos (compara sem essas partes; útil quando uma mudança troca os eventos de propósito)
// Na sua vez, o teste joga a primeira carta jogável da mão (ou compra/passa) e resolve as janelas pelo autoResolve.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARQ = path.join(ROOT, 'tests', 'cartas-resultados.json');
const args = process.argv.slice(2);
const GRAVAR = args.includes('--gravar');
const SO = (args.find(a => a.startsWith('--so=')) || '').slice(5);
const IGNORAR = ((args.find(a => a.startsWith('--ignorar=')) || '').slice(10)).split(',').filter(Boolean);
const PARALELO = 4;

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

// Roda dentro da página: prepara a partida no tempo virtual, joga e devolve o resultado.
// c = {regras:{...}, carta, quem (0 = você, 1 = adversário), turnos, semente, dif}
async function cenarioNaPagina(c) {
  // situação de cada jogador além das cartas (sineta, teia, confusão, sorte, batata, busca)
  const marcas = p => ['called', 'webbed', 'confuse', 'confuseNext', 'luck', 'escaped', 'thorned'].filter(k => p[k]).map(k => ' [' + k + ']').join('') +
    (p.batata ? ` [batata ${p.batata}]` : '') + (p.treasure ? ` [busca ${p.treasure}]` : '');
  const fmt = x => x ? `${x.color}:${x.type}${x.value ?? ''}${x.chosen ? '>' + x.chosen : ''}${x.lock ? '#' : ''}` : '-';
  // tempo virtual desde o começo: Date.now() fica fixo e os timers só andam quando o teste manda
  TB.on = true; TB.now = 1e12; TB.q.clear();
  for (const [, t] of TB.live) nativeClear(t.h);
  TB.live.clear();
  MUTED = true;
  CFG = Object.assign({}, DEF, { mode: 'custom', poker: false, fx3d: false, fast: false, diff: c.dif || 'normal' }, c.regras);
  R = rulesForMode(); TOUR = null;
  window.SEMENTE = c.semente;
  // o registro completo da partida (o do jogo guarda só as últimas linhas)
  const registro = [], logJogo = log;
  log = msg => { registro.push(texto(msg)); logJogo(msg); };
  // os eventos que as regras mandam para a tela (efeitos, sons, cartas voando), resumidos numa linha cada
  const eventos = [];
  const valor = v => v && typeof v === 'object' ? (Array.isArray(v) ? '[' + v.map(valor).join(' ') + ']' : 'type' in v ? fmt(v) : JSON.stringify(v)) : texto(String(v)).replace(/<svg[\s\S]*<\/svg>/, '<svg>');
  // o registro e o histórico já vêm inteiros em 'registro'; os textos saem como você os vê (texto())
  const IGNORA = ['registro', 'jogada', 'fimJogada', 'histInicio', 'atualiza', 'cores']; // redesenhar não é evento de jogo
  espiaEventos = ev => IGNORA.includes(ev.t) || eventos.push(Object.entries(ev).filter(([k, v]) => v !== undefined && typeof v !== 'function').map(([k, v]) => k === 't' ? v : k + '=' + valor(v)).join(' '));
  newGame();
  S.turbo = true;
  const erros = [];
  const shown = id => document.getElementById(id)?.classList.contains('show');
  const OVS = ['colorOv', 'pickOv', 'swapOv', 'simonOv', 'pokerOv'];
  // a sua vez: resolve janelas, toca a sineta, joga a primeira carta jogável ou compra/passa
  function jogarPorVoce() {
    if (S.players[0].out) return false;
    if (S.autoResolve && OVS.some(shown)) { const f = S.autoResolve; f(); return true; }
    for (const ov of OVS) if (shown(ov)) {
      const b = [...document.querySelectorAll(`#${ov} button, #${ov} .card`)].filter(x => !x.disabled)[0];
      if (b) { b.click(); return true; }
    }
    if (!myTurn()) return false;
    const me = S.players[0];
    if (!me.called && me.hand.length === target() + 1) humanUno();
    const k = me.hand.find(x => canPlay(me, x));
    if (k) jogar(0, k); else humanMain();
    return true;
  }
  // sem timers e sem o que fazer na sua vez: dá um tempo ao navegador (animações que o Portal e a Chuva esperam)
  const respiro = () => new Promise(ok => nativeTimeout(ok, 20));
  async function avancar(limTurnos) {
    let espera = 0;
    for (let guarda = 0; guarda < 20000; guarda++) {
      if (S.phase === 'over') return 'fim';
      if ((S.vezes || 0) >= limTurnos) return 'turnos';
      let next = null;
      for (const x of TB.q.values()) if (!next || x.due < next.due || (x.due === next.due && x.id < next.id)) next = x;
      if (next) {
        TB.q.delete(next.id); TB.now = Math.max(TB.now, next.due);
        try { next.fn(...next.a); } catch (e) { erros.push(e.message); return 'erro'; }
        espera = 0; continue;
      }
      let fez;
      try { fez = jogarPorVoce(); } catch (e) { erros.push(e.message); return 'erro'; }
      if (fez) { espera = 0; continue; }
      if (++espera > 50) return 'parado';
      await respiro();
    }
    return 'limite';
  }
  if (c.carta) {
    // a vez de quem joga, com uma carta numérica da cor na mesa e a carta na mão
    TB.q.clear(); closeOverlays();
    const [tipo, cor] = c.carta;
    const corMesa = cor === 'w' ? 'r' : cor;
    Object.assign(S, { turn: c.quem, phase: 'play', pending: 0, pendingType: null, busy: false, announcing: false, comboValue: null, seqDir: null, chal: null });
    S.discard.push(mk(corMesa, 'num', 5)); S.color = corMesa;
    const carta = mk(cor, tipo);
    S.players[c.quem].hand.push(carta);
    S.tok++;
    jogar(c.quem, carta);
  }
  const fim = await avancar((S.vezes || 0) + c.turnos);
  // "Azul?"/"Verde?" (Azul e Verde) é sorteado só no texto, fora da semente
  const txt = s => String(s).replace(/(Azul|Verde)\?/g, 'Azul/Verde?');
  return {
    fim, erros,
    vez: S.turn, sentido: S.dir, cor: S.color, fase: S.phase, compra: S.pending, lado: S.side,
    clima: S.weather || null, maldicao: S.curse ? `${S.curse.k} ${S.curse.left}` : null, morte: !!S.death, semaforo: S.traffic || null,
    paz: S.peace || 0, memoria: (S.simon || []).join(''),
    mesa: S.discard.slice(-4).map(fmt), monte: S.deck.length,
    jogadores: S.players.map(p => `${p.name}${p.out ? ' (fora)' : ''}: ${p.hand.map(fmt).join(' ')}${p.hand2 && p.hand2.length ? ' | ' + p.hand2.map(fmt).join(' ') : ''}${marcas(p)}`),
    registro: registro.map(txt),
    eventos: eventos.map(txt),
  };
}

// lista de cenários, montada com os dados do próprio jogo
const browser = await chromium.launch();
const pagina0 = await browser.newPage();
await pagina0.goto(URL_BASE);
const dados = await pagina0.evaluate(() => ({
  sp: Object.entries(SP).map(([k, v]) => ({ k, regra: v.rule || k, cor: v.deck[0] || (k === 'chest' ? 'w' : null) })),
  regras: RULES.filter(r => r.g !== 'Cartas especiais' && r.k !== 'poker').map(r => r.k),
}));
await pagina0.close();
const cenarios = [];
const base = [['skip', 'r'], ['rev', 'r'], ['d2', 'r'], ['wild', 'w'], ['d4', 'w']];
for (const [t, cor] of base) for (const quem of [1, 0]) cenarios.push({ nome: `carta:${t}:${quem ? 'adversario' : 'voce'}`, regras: {}, carta: [t, cor], quem, turnos: 8, semente: 101 });
for (const s of dados.sp) {
  if (s.k === 'bomb') continue; // a bomba não é jogada: explode ao ser comprada (aparece no cenário regra:bomb)
  for (const quem of [1, 0]) cenarios.push({ nome: `carta:${s.k}:${quem ? 'adversario' : 'voce'}`, regras: { [s.regra]: true }, carta: [s.k, s.cor || 'r'], quem, turnos: 8, semente: 202 });
}
for (const k of [...dados.regras, ...dados.sp.filter(s => !['chest', 'mix1', 'mix2', 'mix3', 'sun', 'fog', 'storm', 'blizzard', 'd99'].includes(s.k)).map(s => s.regra), 'weather', 'mix', 'plus99'])
  if (!cenarios.some(c => c.nome === `regra:${k}`)) cenarios.push({ nome: `regra:${k}`, regras: { [k]: true }, turnos: 16, semente: 303 });
cenarios.push({ nome: 'partida:classica', regras: {}, turnos: 40, semente: 404 });
cenarios.push({ nome: 'partida:mestre', regras: {}, turnos: 40, semente: 405, dif: 'master' });
cenarios.push({ nome: 'partida:bagunca', regras: { mess: true }, turnos: 40, semente: 406 });
const lista = SO ? cenarios.filter(c => c.nome.includes(SO)) : cenarios;

// roda em algumas abas ao mesmo tempo; cada cenário numa página recém-carregada
const resultados = {};
let i = 0;
async function trabalhador() {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  while (i < lista.length) {
    const c = lista[i++];
    await page.goto(URL_BASE);
    erros.length = 0;
    try {
      // duas vezes na mesma semente: a segunda confere que o resultado se repete
      const a = await page.evaluate(cenarioNaPagina, c);
      await page.goto(URL_BASE);
      const b = await page.evaluate(cenarioNaPagina, c);
      if (JSON.stringify(a) !== JSON.stringify(b)) a.erros.push('o resultado mudou ao repetir com a mesma semente');
      a.erros.push(...erros);
      resultados[c.nome] = a;
    } catch (e) { resultados[c.nome] = { fim: 'erro', erros: [e.message] }; }
  }
  await page.close();
}
const t0 = Date.now();
await Promise.all(Array.from({ length: PARALELO }, trabalhador));
await browser.close(); server.close();

let falhas = 0;
const guardado = fs.existsSync(ARQ) ? JSON.parse(fs.readFileSync(ARQ, 'utf8')) : {};
for (const c of lista) {
  const r = resultados[c.nome];
  if (r.erros && r.erros.length) { falhas++; console.log(`ERRO ${c.nome}: ${[...new Set(r.erros)].join(' | ')}`); }
  if (['erro', 'limite'].includes(r.fim)) { falhas++; console.log(`ERRO ${c.nome}: terminou em "${r.fim}"`); }
}
if (GRAVAR) {
  const novo = SO ? { ...guardado, ...resultados } : resultados;
  const ordenado = Object.fromEntries(Object.keys(novo).sort().map(k => [k, novo[k]]));
  fs.writeFileSync(ARQ, JSON.stringify(ordenado, null, 1) + '\n');
  console.log(`Gravados ${lista.length} cenários em ${path.relative(ROOT, ARQ)}.`);
} else {
  for (const c of lista) {
    const sem = o => o && Object.fromEntries(Object.entries(o).filter(([k]) => !IGNORAR.includes(k)));
    const a = sem(guardado[c.nome]), b = sem(resultados[c.nome]);
    if (!a) { falhas++; console.log(`NOVO ${c.nome}: sem resultado guardado (rode com --gravar)`); continue; }
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    falhas++;
    console.log(`DIFERENTE ${c.nome}:`);
    for (const k of Object.keys({ ...a, ...b })) {
      const x = JSON.stringify(a[k]), y = JSON.stringify(b[k]);
      if (x === y) continue;
      if (Array.isArray(a[k]) && Array.isArray(b[k])) {
        const j = a[k].findIndex((v, n) => JSON.stringify(v) !== JSON.stringify(b[k][n]));
        const at = j < 0 ? a[k].length : j;
        console.log(`  ${k}[${at}]: antes ${JSON.stringify(a[k][at])}\n  ${' '.repeat(k.length + String(at).length + 2)}agora ${JSON.stringify(b[k][at])}`);
      } else console.log(`  ${k}: antes ${x}, agora ${y}`);
    }
  }
}
const fins = {};
for (const c of lista) fins[resultados[c.nome].fim] = (fins[resultados[c.nome].fim] || 0) + 1;
console.log(`\nCenários: ${lista.length} (${Object.entries(fins).map(([k, v]) => `${k}: ${v}`).join(', ')}) | Problemas: ${falhas} | ${Math.round((Date.now() - t0) / 1000)}s`);
process.exit(falhas ? 1 : 0);
