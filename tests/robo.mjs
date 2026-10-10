// Convidado robô: uma pessoa de mentira que joga só pelas mensagens do anfitrião, como a tela de um convidado. Tem a
// mesa carregada num contexto vm (para saber quais cartas da mão pode jogar, como a tela faz com canPlay), mas só
// conhece a visão que recebe. Usado pelo teste do anfitrião sem página (tests/anfitriao.mjs) e pelos testes do servidor.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MESA = ['dados', 'regras', 'cartas', 'adversarios', 'visao'];

// a mesa num contexto vm, sem página (extras: outros arquivos de js/mesa, como o anfitriao)
export function carregaMesa(extras = []) {
  const ctx = vm.createContext({ console });
  for (const f of [...MESA, ...extras]) {
    const arq = path.join(ROOT, 'js', 'mesa', f + '.js');
    vm.runInContext(fs.readFileSync(arq, 'utf8'), ctx, { filename: arq });
  }
  vm.runInContext('function TELA() {}', ctx);
  return ctx;
}

// o que a visão de um jogador não pode trazer: cartas dos outros, monte (fora o topo com a Revelação), memória, blefe, semente
export function vazamentos(v) {
  const s = v.S, ruim = [];
  s.players.forEach((q, i) => { if (i > 0) [...q.hand, ...(q.hand2 || [])].forEach(c => { if (!c.oculta && c.type !== 'batata') ruim.push('carta de outro jogador'); }); });
  if (s.deck.filter(c => !c.oculta).length > (v.R.revelation ? 1 : 0)) ruim.push('carta do monte');
  if (s.mem || s.semente !== undefined || s.fxUntil !== undefined) ruim.push('estado interno da mesa');
  if (s.chal && 'bluff' in s.chal) ruim.push('blefe do +4');
  // com a Neblina (ou a Camuflagem, fora de quem tem 1 carta), nem a quantidade de cartas dos outros: vão 5
  if (s.phase !== 'over') s.players.forEach((q, i) => {
    if (i === 0 || q.out) return;
    if (s.weather === 'fog' && q.hand.length !== 5) ruim.push('quantidade de cartas na Neblina');
    if (v.R.camouflage && ![1, 5].includes(q.hand.length)) ruim.push('quantidade de cartas na Camuflagem');
  });
  if (s.other) s.other.players.forEach((q, i) => { if (i > 0) q.hand.forEach(c => { if (!c.oculta && c.type !== 'batata') ruim.push('carta do outro lado'); }); });
  return ruim;
}

// decide a próxima ação olhando só a visão (roda dentro do contexto do robô, com S e R da visão)
const DECIDE = `
function __decide(sorte, feitas) {
  if (!S || !S.players || S.phase === 'over' || !S.discard.length) return null;
  const me = S.players[0];
  if (me.out) return null;
  const uma = (k, a) => feitas.has(k) ? null : (feitas.add(k), a);
  if (me.mull && sorte() < 0.3) return uma('mull', { t: 'trocarMao' });
  // o sino: como o botão da tela (no alvo, ou antes de jogar, com carta jogável)
  if (!me.called && !me.sinoAntes && S.weather !== 'fog' && (me.hand.length === target() || sinoAntesOk(0)) && sorte() < 0.85)
    return uma('sineta' + S.tok, { t: 'sineta' });
  for (let i = 1; i < S.players.length; i++) {
    const q = S.players[i];
    if (!q.out && !q.called && q.hand.length === target() && S.weather !== 'fog' && sorte() < 0.15) return uma('pegar' + S.tok + ':' + i, { t: 'pegar', alvo: i });
  }
  if (S.turn !== 0 || S.busy || S.auto || !['play', 'drawn', 'combo'].includes(S.phase)) return null;
  const opts = me.hand.filter(c => canPlay(me, c));
  if (S.pending > 0 && S.chal && S.chal.by !== 0 && !opts.length && sorte() < 0.3) return uma('vez' + S.tok, { t: 'desafiar' });
  if (opts.length && (S.phase !== 'drawn' || sorte() < 0.9)) return uma('vez' + S.tok, { t: 'jogar', id: opts[Math.floor(sorte() * opts.length)].id });
  return uma('vez' + S.tok, { t: 'principal' });
}`;

/* Cria um robô. envia(texto) leva a mensagem ao anfitrião; agenda(fn, ms) marca algo no relógio do teste; sorte() é o
   sorteio (com semente, para repetir). Devolve {recebe(texto), ola(), ...contadores} */
export function criaRobo({ nome, id, versao, envia, agenda, sorte }) {
  const ctx = carregaMesa();
  vm.runInContext(DECIDE, ctx);
  const parse = vm.runInContext('JSON.parse', ctx);
  // mudo: como uma tela travada (aba em segundo plano): não manda nada e guarda o que chega para quando voltar
  const r = { nome, id, fim: false, recebidas: 0, acoes: 0, pedidos: 0, recusadas: 0, vazamentos: [], errado: [], mudo: false, guardadas: [], sala: null, versaoErrada: false, feitas: new Set(), pensando: false };
  r.calar = () => { r.mudo = true; };
  r.voltar = () => { r.mudo = false; r.oi(); const g = r.guardadas; r.guardadas = []; for (const [txt, esp] of g) r.recebe(txt, esp); };
  const manda = m => { if (!r.mudo) envia(JSON.stringify(m)); };
  r.ola = () => manda({ t: 'ola', nome, versao, id });
  r.oi = () => manda({ t: 'oi' });
  r.estado = () => vm.runInContext('S', ctx);
  const pensa = () => {
    r.pensando = false;
    if (r.mudo) return;
    ctx.__sorte = sorte; ctx.__feitas = r.feitas;
    const a = vm.runInContext('__decide(__sorte, __feitas)', ctx);
    if (a) { manda({ t: 'acao', acao: JSON.parse(JSON.stringify(a)), n: ++r.acoes }); if (!r.pensando) { r.pensando = true; agenda(pensa, 60 + sorte() * 200); } }
  };
  const responde = m => {
    const S = vm.runInContext('S', ctx), cores = ['r', 'y', 'g', 'b'];
    if (m.tipo === 'cor') return manda({ t: 'escolher', id: m.id, valor: cores[Math.floor(sorte() * 4)] });
    if (m.tipo === 'memoria') return manda({ t: 'escolher', id: m.id, valor: cores[Math.floor(sorte() * 4)], toques: sorte() < 0.8 ? [...(S.simon || [])] : ['r'] });
    const o = m.opcoes || [], e = o[Math.floor(sorte() * o.length)];
    manda({ t: 'escolher', id: m.id, valor: m.tipo === 'carta' ? e && e.id : e });
  };
  // esperado: o que o anfitrião tinha na cadeira desta pessoa quando mandou a mensagem (para conferir a visão)
  r.recebe = (txt, esperado) => {
    if (r.mudo) { r.guardadas.push([txt, esperado]); return; }
    const m = parse(txt);
    if (m.t === 'oi') return;
    r.recebidas++;
    if (m.t === 'versao') { r.versaoErrada = true; return; }
    if (m.t === 'sala') { r.sala = m; return; }
    if (m.t === 'recusada') { r.recusadas++; r.feitas.clear(); }
    if (m.visao) {
      ctx.__v = m.visao; vm.runInContext('S = __v.S; R = __v.R; TOUR = __v.TOUR;', ctx);
      for (const v of vazamentos(m.visao)) if (r.vazamentos.length < 10) r.vazamentos.push(v);
      if (esperado) {
        const me = m.visao.S.players[0], ids = me.hand.map(c => c.id).sort().join(',');
        if (me.name !== esperado.nome) r.errado.push(`se vê como ${me.name}, e não ${esperado.nome}`);
        else if (m.visao.S.players.some((q, i) => i > 0 && q.name === 'Você')) r.errado.push('um jogador chamado "Você" na mesa');
        else if (ids !== esperado.mao) r.errado.push(`mão diferente da mesa (evento ${m.ev && m.ev.t})`);
      }
    }
    if (m.t === 'evento') {
      if (m.ev.t === 'fim') r.fim = true;
      if (m.ev.t === 'novaPartida') { r.fim = false; r.feitas.clear(); }
      if (m.ev.t === 'mostraMix') agenda(() => manda({ t: 'acao', acao: { t: 'fecharMix' }, n: 0 }), 300 + sorte() * 1500);
    }
    if (m.t === 'pedido') { r.pedidos++; agenda(() => responde(m), 150 + sorte() * 900); }
    if (!r.pensando) { r.pensando = true; agenda(pensa, 60 + sorte() * 300); }
  };
  return r;
}
