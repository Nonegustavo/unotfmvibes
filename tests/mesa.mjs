// Mesa no Node: carrega as regras (js/mesa/*.js) com o módulo vm, como num navegador mas sem página, e joga muitas
// partidas só com adversários num relógio virtual. Procura erros e partidas que travam, e mostra estatísticas.
// Uso: npm run test:mesa                       (2000 partidas, com regras sorteadas)
//      npm run test:mesa -- 10000              (quantas partidas)
//      npm run test:mesa -- --regras=mess,dice (sempre essas regras; "nenhuma" para o Clássico)
//      npm run test:mesa -- --semente=7        (repete exatamente as mesmas partidas)
//      npm run test:mesa -- --dif=master       (dificuldade dos adversários; padrão: sorteada)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const PARTIDAS = Number(args.find(a => /^\d+$/.test(a)) || 2000);
const REGRAS = (args.find(a => a.startsWith('--regras=')) || '').slice(9);
const SEMENTE = Number((args.find(a => a.startsWith('--semente=')) || '--semente=1').slice(10));
const DIF = (args.find(a => a.startsWith('--dif=')) || '').slice(6);
const LIMITE_VEZES = 3000; // depois disso a partida conta como "longa demais"

// contexto vazio (sem window nem document): só a mesa e um relógio virtual
const ctx = vm.createContext({ console });
for (const f of ['dados', 'regras', 'cartas', 'adversarios']) {
  const arq = path.join(ROOT, 'js', 'mesa', f + '.js');
  vm.runInContext(fs.readFileSync(arq, 'utf8'), ctx, { filename: arq });
}
vm.runInContext(`
  // a tela não existe: os eventos só são contados
  var EVENTOS = 0;
  function TELA(ev) { EVENTOS++; }
  // relógio virtual: os timers vão para uma fila e o tempo pula direto para o próximo
  var FILA = [], AGORA = 0, SEQ = 0;
  RELOGIO.agora = () => AGORA;
  RELOGIO.depois = (fn, ms) => { const id = ++SEQ; FILA.push({ id, fn, due: AGORA + Math.max(0, +ms || 0) }); return id; };
  RELOGIO.cancela = id => { FILA = FILA.filter(t => t.id !== id); };
  function proximo() {
    if (!FILA.length) return false;
    let k = 0;
    for (let i = 1; i < FILA.length; i++) if (FILA[i].due < FILA[k].due || (FILA[i].due === FILA[k].due && FILA[i].id < FILA[k].id)) k = i;
    const t = FILA.splice(k, 1)[0]; AGORA = Math.max(AGORA, t.due); t.fn(); return true;
  }
  // sorteio das regras de cada partida (fora da semente do jogo, para não mexer nela)
  var SORTE = 0;
  function sorte() { SORTE = (SORTE + 0x6d2b79f5) | 0; let t = Math.imul(SORTE ^ (SORTE >>> 15), 1 | SORTE); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function sortearRegras(n) {
    const lista = RULES.filter(r => !['poker', 'tournament', 'survivor'].includes(r.k)).map(r => r.k), r = {};
    for (let i = 0; i < n; i++) { const k = lista[Math.floor(sorte() * lista.length)]; if (!(CONFLICT[k] || []).some(x => r[x])) r[k] = true; }
    return r;
  }
  function partida(semente, fixas, dif) {
    OPCOES.controles = ['bot', 'bot', 'bot', 'bot', 'bot', 'bot'];
    const modo = fixas ? null : sorte();
    const base = regrasBase();
    const ligadas = fixas || (modo < .15 ? {} : modo < .35 ? { poker: true } : sortearRegras(1 + Math.floor(sorte() * 6)));
    R = Object.assign(base, ligadas, { diff: dif || ['easy', 'normal', 'hard', 'master'][Math.floor(sorte() * 4)], bots: 3 });
    TOUR = null; FILA = []; AGORA = 0;
    globalThis.SEMENTE = semente;
    newGame();
    let passos = 0;
    while (S.phase !== 'over' && (S.vezes || 0) < ${LIMITE_VEZES}) {
      if (!proximo()) return { fim: 'travou', regras: Object.keys(ligadas).filter(k => ligadas[k]), vezes: S.vezes, passos, fase: S.phase, busy: S.busy, vez: S.turn };
      passos++;
    }
    const venc = S.phase === 'over' ? S.players.findIndex(p => !p.out && p.hand.length === 0) : -1;
    return { fim: S.phase === 'over' ? 'fim' : 'longa', vezes: S.vezes, passos, tempo: AGORA, regras: Object.keys(R).filter(k => R[k] === true && RNAME[k]),
      vencedor: venc, eliminados: S.players.filter(p => p.out).length, dif: R.diff };
  }
`, ctx);

const fixas = REGRAS ? (REGRAS === 'nenhuma' ? {} : Object.fromEntries(REGRAS.split(',').map(k => [k.trim(), true]))) : null;
const t0 = Date.now();
const res = [], erros = [];
vm.runInContext(`SORTE = ${SEMENTE}`, ctx);
for (let i = 0; i < PARTIDAS; i++) {
  try { res.push(ctx.partida(SEMENTE * 100000 + i, fixas, DIF)); }
  catch (e) { erros.push({ partida: i, erro: e.stack.split('\n').slice(0, 3).join(' | ') }); }
}
const seg = (Date.now() - t0) / 1000;

const cont = (lista, f) => lista.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const fins = cont(res, r => r.fim);
const ok = res.filter(r => r.fim === 'fim');
const media = l => l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : 0;
console.log(`Partidas: ${PARTIDAS} em ${seg.toFixed(1)} s (${Math.round(PARTIDAS / seg)} por segundo) | ${Object.entries(fins).map(([k, v]) => `${k}: ${v}`).join(', ')} | erros: ${erros.length}`);
console.log(`Vezes por partida: média ${media(ok.map(r => r.vezes))}, maior ${Math.max(0, ...ok.map(r => r.vezes))} | tempo de jogo médio: ${Math.round(media(ok.map(r => r.tempo)) / 60000)} min`);
const porCadeira = cont(ok.filter(r => r.vencedor >= 0), r => r.vencedor);
console.log('Vitórias por cadeira (0 a 3): ' + [0, 1, 2, 3].map(i => `${i}: ${((porCadeira[i] || 0) / Math.max(1, ok.length) * 100).toFixed(1)}%`).join(' | ') + ` | sem vencedor de mão vazia (eliminação/pontos): ${ok.filter(r => r.vencedor < 0).length}`);
// regras com partidas mais longas e mais curtas (só as que apareceram em pelo menos 30 partidas)
const porRegra = {};
ok.forEach(r => r.regras.forEach(k => { (porRegra[k] = porRegra[k] || []).push(r.vezes); }));
const linhas = Object.entries(porRegra).filter(([, v]) => v.length >= 30).map(([k, v]) => [k, media(v), v.length]).sort((a, b) => b[1] - a[1]);
if (linhas.length) {
  const nome = k => vm.runInContext(`RNAME[${JSON.stringify(k)}]`, ctx) || k;
  console.log('Partidas mais longas com: ' + linhas.slice(0, 5).map(([k, m, n]) => `${nome(k)} (${m} vezes, ${n} partidas)`).join(', '));
  console.log('Partidas mais curtas com: ' + linhas.slice(-5).reverse().map(([k, m, n]) => `${nome(k)} (${m} vezes, ${n} partidas)`).join(', '));
}
const travadas = res.map((r, i) => [i, r]).filter(([, r]) => r.fim !== 'fim');
for (const [i, r] of travadas.slice(0, 10)) console.log(`  ${r.fim.toUpperCase()} partida ${i} (semente ${SEMENTE * 100000 + i}): regras ${r.regras.join(',') || 'nenhuma'}, ${r.vezes} vezes${r.fase ? `, fase ${r.fase}, busy ${r.busy}, vez ${r.vez}` : ''}`);
for (const e of erros.slice(0, 10)) console.log(`  ERRO partida ${e.partida} (semente ${SEMENTE * 100000 + e.partida}): ${e.erro}`);
process.exit(erros.length || fins.travou ? 1 : 0);
