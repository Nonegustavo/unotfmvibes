// Anfitrião sem página, no Node: a mesa e o anfitrião (js/mesa/anfitriao.js) num contexto vm, como no servidor, com
// convidados robôs (tests/robo.mjs) que jogam só pelas mensagens, numa rede de mentira com atraso, num relógio virtual.
// Cada partida tem regras sorteadas e de 2 a 4 pessoas espalhadas entre bots, sem ninguém "da tela" (como no servidor).
// Confere: a partida termina para todos; cada pessoa recebe a visão da cadeira dela (nome e mão iguais aos da mesa quando
// a mensagem saiu), nada que ela não possa saber; em parte das partidas uma pessoa fica muda por 12 s, o bot joga por
// ela e ela volta.
// Uso: npm run test:anfitriao                      (40 partidas)
//      npm run test:anfitriao -- 200               (quantas partidas)
//      npm run test:anfitriao -- --regras=trade,chair --semente=7
import vm from 'node:vm';
import { carregaMesa, criaRobo } from './robo.mjs';

const args = process.argv.slice(2);
const PARTIDAS = Number(args.find(a => /^\d+$/.test(a)) || 40);
const REGRAS = (args.find(a => a.startsWith('--regras=')) || '').slice(9);
const SEMENTE = Number((args.find(a => a.startsWith('--semente=')) || '--semente=1').slice(10));

// sorteios do teste (pessoas, lugares, atrasos, escolhas dos robôs), com semente
let semente = SEMENTE;
const sorte = () => { semente = (semente + 0x6d2b79f5) | 0; let t = Math.imul(semente ^ (semente >>> 15), 1 | semente); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// relógio virtual: a mesa, as mensagens e os robôs usam a mesma fila, e o tempo pula direto para o próximo
let AGORA = 0, SEQ = 0, FILA = [];
const agenda = (fn, ms) => { const id = ++SEQ; FILA.push({ id, fn, due: AGORA + Math.max(0, +ms || 0) }); return id; };
const cancela = id => { FILA = FILA.filter(t => t.id !== id); };
function proximo() {
  if (!FILA.length) return false;
  let k = 0;
  for (let i = 1; i < FILA.length; i++) if (FILA[i].due < FILA[k].due || (FILA[i].due === FILA[k].due && FILA[i].id < FILA[k].id)) k = i;
  const t = FILA.splice(k, 1)[0]; AGORA = Math.max(AGORA, t.due); t.fn(); return true;
}
// uma via da rede de mentira: atraso de 20 a 120 ms, sem trocar a ordem
const via = () => { let ultimo = 0; return (fn) => { const em = Math.max(ultimo, AGORA + 20 + sorte() * 100); ultimo = em; agenda(fn, em - AGORA); }; };

function partida(k) {
  AGORA = 0; FILA = [];
  const host = carregaMesa(['anfitriao']);
  Object.assign(host, { agenda, cancela, agoraT: () => AGORA, SEMENTE: SEMENTE * 100000 + k });
  vm.runInContext('RELOGIO.agora = () => agoraT(); RELOGIO.depois = (fn, ms) => agenda(fn, ms); RELOGIO.cancela = id => cancela(id); ANF.agora = () => agoraT(); anfInicia();', host);
  const parseHost = vm.runInContext('JSON.parse', host);
  const mesa = () => vm.runInContext('S', host);
  // regras: as pedidas, o Mix ou algumas sorteadas
  const lista = vm.runInContext('RULES', host).filter(r => !['poker', 'tournament', 'survivor'].includes(r.k)).map(r => r.k);
  const conflito = vm.runInContext('CONFLICT', host);
  let cfg;
  if (REGRAS) cfg = { mode: 'custom', ...Object.fromEntries(REGRAS.split(',').map(x => [x.trim(), true])) };
  else if (sorte() < 0.15) cfg = { mode: 'mix' };
  else { cfg = { mode: 'custom' }; const n = 1 + Math.floor(sorte() * 6); for (let i = 0; i < n; i++) { const r = lista[Math.floor(sorte() * lista.length)]; if (!(conflito[r] || []).some(x => cfg[x])) cfg[r] = true; } }
  host.__cfg = { ...vm.runInContext('regrasBase()', host), ...cfg, diff: ['easy', 'normal', 'hard', 'master'][Math.floor(sorte() * 4)] };
  host.__tempo = sorte() < 0.5 ? 'normal' : 'livre';
  vm.runInContext('ANF.cfg = __cfg; ANF.tempo = __tempo; ANF.automatico = 99;', host);
  // pessoas e lugares: de 2 a 4 pessoas, até 6 cadeiras, espalhadas ao acaso
  const np = 2 + Math.floor(sorte() * 3), n = Math.max(np, Math.min(6, np + Math.floor(sorte() * 3)));
  const robos = [], ligs = [];
  for (let j = 0; j < np; j++) {
    const paraHost = via(), paraRobo = via();
    const l = { id: 'r' + j, aberta: true, enviouEm: 0, aoReceber: null, aoFechar: null };
    const robo = criaRobo({ nome: 'Pessoa ' + (j + 1), id: 'aparelho' + j, versao: vm.runInContext('VERSAO_REDE', host), agenda, sorte,
      envia: txt => paraHost(() => l.aoReceber && l.aoReceber(parseHost(txt))) });
    l.enviar = m => {
      l.enviouEm = AGORA;
      const S = mesa(), pi = l.cadeira, txt = JSON.stringify(m);
      const esperado = m.visao && S && pi != null ? { nome: S.players[pi].name, mao: S.players[pi].hand.map(c => c.id).sort().join(',') } : null;
      paraRobo(() => robo.recebe(txt, esperado));
    };
    host.__l = l; vm.runInContext('anfNovaLigacao(__l)', host);
    robo.ola(); robos.push(robo); ligs.push(l);
  }
  const lugares = Array(n).fill(null), cads = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(sorte() * (i + 1)); [cads[i], cads[j]] = [cads[j], cads[i]]; }
  ligs.forEach((l, j) => { lugares[cads[j]] = l; });
  // sinal: o anfitrião confere a cada segundo; cada robô manda um "oi" a cada 2 s
  const sinal = () => { vm.runInContext('anfSinal()', host); agenda(sinal, 1000); };
  agenda(sinal, 1000);
  robos.forEach(r => { const oi = () => { r.oi(); agenda(oi, 2000); }; agenda(oi, 2000 * sorte()); });
  agenda(() => { host.__mapa = lugares; vm.runInContext('anfComeca(__mapa)', host); }, 500);
  // queda: uma pessoa fica muda por 12 s, 20 s depois do começo. Se a partida ainda estiver andando, o anfitrião
  // precisa notar (8 s sem sinal) e, 3 s depois de ela voltar, ver a volta
  const queda = sorte() < 0.35 ? robos[Math.floor(sorte() * np)] : null;
  let caiu = null, voltou = null;
  if (queda) {
    const l = ligs[robos.indexOf(queda)], andando = () => { const S = mesa(); return S && S.phase !== 'over'; };
    agenda(() => {
      queda.calar();
      agenda(() => { if (andando()) caiu = !!l.caiu; }, 9500);
      agenda(() => { queda.voltar(); agenda(() => { if (caiu && andando()) voltou = !l.caiu; }, 3000); }, 12000);
    }, 20000);
  }
  // roda até todos verem o fim (ou travar)
  let vezes = -1, mudou = 0;
  while (true) {
    if (!proximo()) return { fim: 'travou', cfg, motivo: 'fila vazia' };
    const S = mesa();
    if (S && S.vezes !== vezes) { vezes = S.vezes; mudou = AGORA; }
    if (S && S.phase === 'over' && robos.every(r => r.fim)) break;
    if (AGORA - mudou > 10 * 60000) return { fim: 'travou', cfg, motivo: `nada mudou por 10 min (fase ${S && S.phase}, busy ${S && S.busy}, vez ${S && S.turn})` };
    if ((S && S.vezes) > 3000) return { fim: 'longa', cfg };
  }
  const soma = f => robos.reduce((a, r) => a + f(r), 0);
  return { fim: 'fim', cfg, np, n, vezes, tempo: AGORA, pedidos: soma(r => r.pedidos), acoes: soma(r => r.acoes), recusadas: soma(r => r.recusadas),
    vazamentos: robos.flatMap(r => r.vazamentos), errado: robos.flatMap(r => r.errado.map(e => r.nome + ': ' + e)), queda: !!queda, caiu, voltou };
}

const t0 = Date.now(), res = [], erros = [];
for (let k = 0; k < PARTIDAS; k++) {
  try { res.push(partida(k)); }
  catch (e) { erros.push(`partida ${k}: ${e.stack.split('\n').slice(0, process.env.PILHA ? 15 : 3).join(' | ')}`); }
}
const ok = res.filter(r => r.fim === 'fim');
const soma = f => ok.reduce((a, r) => a + f(r), 0);
const quedas = ok.filter(r => r.queda);
console.log(`Partidas: ${PARTIDAS} em ${((Date.now() - t0) / 1000).toFixed(1)} s | terminaram: ${ok.length} | travaram: ${res.filter(r => r.fim === 'travou').length} | longas: ${res.filter(r => r.fim === 'longa').length} | erros: ${erros.length}`);
console.log(`Pessoas: ${soma(r => r.np)} em ${soma(r => r.n)} cadeiras | vezes: ${soma(r => r.vezes)} | ações das pessoas: ${soma(r => r.acoes)} (recusadas: ${soma(r => r.recusadas)}) | pedidos respondidos: ${soma(r => r.pedidos)}`);
const conferidas = quedas.filter(r => r.caiu !== null);
console.log(`Quedas de 12 s: ${quedas.length} (${conferidas.length} com a partida andando): o anfitrião viu ${conferidas.filter(r => r.caiu).length} e a volta de ${conferidas.filter(r => r.voltou).length} (das ${conferidas.filter(r => r.voltou !== null).length} conferidas)`);
const problemas = [
  ...erros,
  ...res.map((r, k) => [r, k]).filter(([r]) => r.fim !== 'fim').map(([r, k]) => `partida ${k} ${r.fim.toUpperCase()}${r.motivo ? ': ' + r.motivo : ''} (regras ${Object.keys(r.cfg).filter(x => r.cfg[x] === true).join(',') || r.cfg.mode})`),
  ...[...new Set(ok.flatMap(r => r.vazamentos))].map(v => 'visão com ' + v),
  ...ok.flatMap(r => r.errado).slice(0, 5),
  ...quedas.filter(r => r.caiu === false || r.voltou === false).map(() => 'uma queda não foi vista (ou a volta)'),
];
for (const p of problemas.slice(0, 15)) console.log('  - ' + p);
process.exit(problemas.length ? 1 : 0);
