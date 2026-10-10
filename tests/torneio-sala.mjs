// Torneio de Sobrevivência numa sala (anfitrião sem página, no Node, num relógio virtual, como no servidor): Ana (dona) e
// Bia em 4 cadeiras, o computador jogando por elas. Quem chega a 300 pontos sai do torneio e deixa a mesa: Bia assiste à
// rodada seguinte (a visão de espectador, com todas as cadeiras em cima a partir da dona) e a dona vê 1 assistindo; um bot
// que sai também deixa a mesa; a próxima rodada começa sem esperar os prontos; os lugares da sala não mudam.
// Uso: npm run test:torneio-sala
import vm from 'node:vm';
import { carregaMesa } from './robo.mjs';
let AGORA = 0, SEQ = 0, FILA = [];
const agenda = (fn, ms) => { const id = ++SEQ; FILA.push({ id, fn, due: AGORA + Math.max(0, +ms || 0) }); return id; };
const cancela = id => { FILA = FILA.filter(t => t.id !== id); };
function proximo() { if (!FILA.length) return false; let k = 0; for (let i = 1; i < FILA.length; i++) if (FILA[i].due < FILA[k].due || (FILA[i].due === FILA[k].due && FILA[i].id < FILA[k].id)) k = i; const t = FILA.splice(k, 1)[0]; AGORA = Math.max(AGORA, t.due); t.fn(); return true; }
const host = carregaMesa(['anfitriao']);
Object.assign(host, { agenda, cancela, agoraT: () => AGORA });
vm.runInContext('RELOGIO.agora = () => agoraT(); RELOGIO.depois = (fn, ms) => agenda(fn, ms); RELOGIO.cancela = id => cancela(id); ANF.agora = () => agoraT(); anfInicia(); ANF.sala = true; ANF.manterCaidos = true;', host);
const run = (cond, max = 200000) => { for (let i = 0; i < max; i++) { if (cond()) return true; if (!proximo()) return cond(); } return false; };
const msgs = { Ana: [], Bia: [] };
vm.runInContext(`ANF.cfg = { ...regrasBase(), mode: 'custom', survivor: true }; ANF.tempo = 'livre';`, host);
const S = () => vm.runInContext('S', host);
for (const nome of ['Ana', 'Bia']) {
  const l = { nome: null, aberta: true, enviouEm: 0, enviar: m => msgs[nome].push(JSON.parse(JSON.stringify(m))) };
  host.__l = l; vm.runInContext('anfNovaLigacao(__l)', host);
  host.__m = { t: 'ola', nome, versao: vm.runInContext('VERSAO_REDE', host), id: nome };
  vm.runInContext('__l.aoReceber(__m)', host);
  host['__' + nome] = l;
}
vm.runInContext(`ANF.dono = __Ana; ANF.n = 4; ANF.lugares = [__Ana, null, __Bia, null]; ANF.cfg = { ...regrasBase(), mode: 'custom', survivor: true }; ANF.tempo = 'livre';`, host);
// as pessoas não jogam: o computador joga por elas (sem tempo, assume já)
vm.runInContext(`OPCOES.tempos = null;`, host);
const ok = (c, m) => { console.log((c ? 'ok: ' : 'FALHOU: ') + m); if (!c) process.exitCode = 1; };
vm.runInContext('anfComecaSala()', host);
run(() => S() && S().discard.length);
ok(S().players.length === 4, 'rodada 1 com 4 cadeiras: ' + S().players.map(p => p.name));
// Bia chega a 300
vm.runInContext(`TOUR.pts.Bia = 299; endRound(S.players.findIndex(p => p.name === 'Ana'));`, host);
run(() => msgs.Ana.some(m => m.ev && m.ev.t === 'fim'));
const salaA = () => msgs.Ana.filter(m => m.t === 'sala').at(-1);
ok(vm.runInContext('TOUR.out.includes("Bia") && !TOUR.done', host), 'Bia saiu do torneio, que continua');
ok(salaA().segue === true, 'a sala diz que o torneio segue');
vm.runInContext(`anfComando({ c: 'comecar' })`, host);
run(() => S().phase !== 'over' && S().discard.length && S().gen > 1);
const nomes = S().players.map(p => p.name);
ok(nomes.length === 3 && !nomes.includes('Bia'), 'rodada 2 sem a Bia: ' + nomes);
run(() => msgs.Bia.filter(m => m.visao).length && msgs.Bia.filter(m => m.visao).at(-1).visao.S.gen === S().gen, 5000);
const vb = msgs.Bia.filter(m => m.visao).at(-1).visao.S;
ok(vb.players[0].espectador && vb.players.length === 4 && vb.players[1].name === 'Ana', 'Bia assiste: ' + vb.players.map(p => p.name));
ok(salaA().assistindo === 1, 'Ana vê 1 assistindo: ' + salaA().assistindo);
// um bot sai também
const bot = nomes.find(n => n !== 'Ana');
host.__bot = bot;
vm.runInContext(`TOUR.pts[__bot] = 299; endRound(S.players.findIndex(p => p.name === 'Ana'));`, host);
run(() => S().phase === 'over' && msgs.Ana.filter(m => m.ev && m.ev.t === 'fim').length === 2);
const fezAntes = S().gen;
vm.runInContext(`anfComando({ c: 'comecar' })`, host);
run(() => S().gen > fezAntes && S().discard.length);
const n3 = S().players.map(p => p.name);
ok(!vm.runInContext('TOUR.done', host) ? (n3.length === 2 && !n3.includes(bot)) : true, `rodada 3 sem o bot ${bot}: ` + n3 + ' done=' + vm.runInContext('TOUR.done', host));
// fim do torneio: volta à sala com os lugares de antes
ok(vm.runInContext('ANF.lugares.map(x=>x&&x.nome||x).join()', host) === 'Ana,,Bia,', 'os lugares da sala continuam: ' + vm.runInContext('ANF.lugares.map(x=>x&&x.nome||x).join()', host));
