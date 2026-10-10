// Salas online pelo servidor (fase 3): sobe o servidor no computador (com as esperas da mesa 10 vezes mais curtas) e
// joga partidas inteiras com convidados robôs (tests/robo.mjs) ligados por WebSocket de verdade, como os celulares
// vão fazer, em várias salas ao mesmo tempo. Em cada sala:
// - o dono cria a sala e muda lugares, regras e tempo; as outras pessoas entram pelo código e ficam prontas;
// - o dono começa; durante a partida, uma pessoa cai e volta com a chave dela, para o mesmo lugar;
// - na primeira sala, alguém entra com a partida andando e assiste (todas as cadeiras em cima, sem a mão de ninguém, e o
//   dono vê 1 assistindo); emojis chegam a todos na cadeira de quem mandou (no máximo um a cada 2 s; quem assiste não manda);
// - todos veem o fim e deixam de estar prontos; sem todos prontos a partida não começa; prontos de novo, o dono começa
//   outra partida (quem assistia ganha cadeira), tira uma pessoa da sala e sai: o posto de dono passa adiante.
// Antes, uma conexão que fica muda (o app fechado sem avisar) precisa ser fechada pelo servidor.
// Confere também que cada um se vê na própria cadeira e que nada que ele não pode saber chega a ele.
// Uso: npm run test:online             (4 salas)
//      npm run test:online -- 10       (quantas salas)
import fs from 'node:fs';
import path from 'node:path';
import { criaRobo, ROOT } from './robo.mjs';
import { sobeServidor, conecta } from './servidor-teste.mjs';

const args = process.argv.slice(2);
const SALAS = Number(args.find(a => /^\d+$/.test(a)) || 4);
const VEL = 10;
const VERSAO = /VERSAO_REDE='([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'js', 'mesa', 'anfitriao.js'), 'utf8'))[1];
const problemas = [];
const falhou = m => { problemas.push(m); console.error('FALHOU: ' + m); };
const espera = ms => new Promise(r => setTimeout(r, ms));
const ate = async (f, ms, oque) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await espera(50); } falhou(oque + ` (esperou ${ms / 1000} s)`); return false; };
const REGRAS = [['trade', 'gift', 'chair'], ['web', 'wish', 'rule', 'jumpin'], ['simon', 'theft', 'batata', 'portal'], ['stack', 'dice', 'weather', 'camouflage'], []];

// todas as salas saem deste computador: o limite de salas por endereço fica de fora (ele é conferido no test:trapaca)
const srv = await sobeServidor({ velocidade: VEL, limites: { salasPorIp: 1000, mudo: 5000 } });
console.log('servidor em ' + srv.url);

// uma pessoa: um robô ligado ao servidor por WebSocket (que pode cair e voltar com a chave)
async function pessoa(nome) {
  const p = { nome, chave: null, codigo: null, c: null, msgs: [], erros: [] };
  p.robo = criaRobo({ nome, id: nome, versao: VERSAO, sorte: Math.random,
    envia: txt => p.c && p.c.manda(txt), agenda: (fn, ms) => setTimeout(fn, ms / VEL) });
  p.liga = async () => {
    p.c = await conecta(srv.url);
    p.c.aoReceber = (txt, m) => {
      p.msgs.push(m);
      if (m.t === 'entrou') { p.chave = m.chave; p.codigo = m.codigo; }
      if (m.t === 'erro') p.erros.push(m.motivo);
      if (m.visao && m.visao.S.players[0].name !== nome) p.erros.push('se vê como ' + m.visao.S.players[0].name + ' (evento ' + (m.ev && m.ev.t) + ', ' + p.msgs.filter(x => x.t === 'evento').slice(-4, -1).map(x => x.ev.t).join(' ') + ')');
      p.robo.recebe(txt);
    };
  };
  await p.liga();
  p.oi = setInterval(() => p.c && p.c.manda({ t: 'oi' }), 2000);
  p.fim = () => { clearInterval(p.oi); try { p.c.ws.close(); } catch (e) {} };
  return p;
}
const sala = p => p.robo.sala;
const linha = (p, nome) => sala(p) && sala(p).lugares.find(x => x.nome === nome);

async function umaSala(k) {
  const tag = `sala ${k + 1}`;
  const dono = await pessoa(`Dono ${k + 1}`);
  const regras = Object.fromEntries(REGRAS[k % REGRAS.length].map(x => [x, true]));
  dono.c.manda({ t: 'criar', nome: dono.nome, versao: VERSAO, cfg: { mode: 'custom', diff: 'normal', ...regras }, tempo: 'normal' });
  if (!await ate(() => dono.codigo, 5000, `${tag}: o dono não recebeu o código`)) return;
  const outros = [];
  for (let j = 0; j < 1 + (k % 3); j++) {
    const p = await pessoa(`Pessoa ${k + 1}.${j + 1}`);
    p.c.manda({ t: 'entrar', codigo: dono.codigo.toLowerCase(), nome: p.nome, versao: VERSAO });
    await ate(() => p.codigo === dono.codigo, 5000, `${tag}: ${p.nome} não entrou pelo código`);
    outros.push(p);
  }
  const todos = [dono, ...outros];
  // o dono muda os lugares (5), o tempo e as regras; todos veem a mesma sala
  dono.c.manda({ t: 'comando', c: 'lugares', n: 5 });
  dono.c.manda({ t: 'comando', c: 'tempo', v: 'longo' });
  dono.c.manda({ t: 'comando', c: 'regras', cfg: { mode: 'custom', diff: 'hard', ...regras } });
  await ate(() => todos.every(p => sala(p) && sala(p).lugares.length === 5 && sala(p).tempo === 'longo' && sala(p).regras.diff === 'hard'), 5000, `${tag}: a sala não mudou para todos`);
  for (const p of todos) {
    const eu = sala(p).lugares.filter(x => x.voce);
    if (eu.length !== 1 || eu[0].nome !== p.nome) falhou(`${tag}: ${p.nome} não se vê na lista`);
    if (!linha(p, dono.nome)?.dono) falhou(`${tag}: ${p.nome} não vê quem é o dono`);
    if (todos.some(q => !linha(p, q.nome))) falhou(`${tag}: ${p.nome} não vê todos na lista`);
  }
  for (const p of outros) p.c.manda({ t: 'pronto', pronto: true });
  await ate(() => outros.every(p => linha(dono, p.nome)?.pronto), 5000, `${tag}: o dono não vê quem está pronto`);
  // começa: cada um recebe a partida, na própria cadeira
  dono.c.manda({ t: 'comando', c: 'comecar' });
  await ate(() => todos.every(p => p.robo.estado() && p.robo.estado().players && p.robo.estado().players.length === 5 && p.robo.estado().discard.length), 8000, `${tag}: a partida não começou para todos`);
  // queda e volta com a chave (alguém que não é o dono)
  await espera(1500);
  const q = outros[0], antes = q.robo.estado().players.map(x => x.name).join();
  q.c.ws.close(); await espera(1200);
  await q.liga();
  q.c.manda({ t: 'entrar', codigo: dono.codigo, chave: q.chave, nome: q.nome, versao: VERSAO });
  await ate(() => q.msgs.some(m => m.t === 'entrou' && m.voltou), 5000, `${tag}: ${q.nome} não voltou com a chave`);
  // a mesma cadeira: os mesmos vizinhos (a não ser que uma Dança das Cadeiras tenha trocado os lugares no meio)
  const dancou = () => q.msgs.some(m => m.t === 'evento' && m.ev.t === 'cadeirasTrocadas');
  await ate(() => q.robo.estado().players.map(x => x.name).join() === antes || q.robo.fim || dancou(), 5000, `${tag}: ${q.nome} não voltou para a mesma cadeira`);
  // espectador: entra com a partida andando (só na primeira sala)
  if (k === 0 && !q.robo.fim) {
    const esp = await pessoa(`Espectador ${k + 1}`);
    esp.c.manda({ t: 'entrar', codigo: dono.codigo, nome: esp.nome, versao: VERSAO });
    await ate(() => esp.robo.estado() && esp.robo.estado().players, 5000, `${tag}: quem entrou não recebeu a partida para assistir`);
    const v = esp.robo.estado();
    if (v && v.players) {
      if (!v.players[0].espectador || v.players.length !== 6) falhou(`${tag}: a visão de quem assiste não tem a cadeira de mentira mais as 5 (${v.players.length})`);
      if (v.players[1].name !== dono.nome) falhou(`${tag}: quem assiste não vê a mesa a partir do dono (${v.players[1].name})`);
      if (v.players.some(p => p.hand.some(c => !c.oculta && c.type !== 'batata'))) falhou(`${tag}: quem assiste vê cartas de alguém`);
    }
    await ate(() => sala(dono) && sala(dono).assistindo === 1, 5000, `${tag}: o dono não vê 1 pessoa assistindo`);
    // emojis: q manda dois seguidos (só o primeiro passa); o dono e quem assiste veem na cadeira dele
    const emojis = p => p.msgs.filter(m => m.t === 'emoji');
    q.c.manda({ t: 'emoji', e: 2 }); q.c.manda({ t: 'emoji', e: 3 });
    esp.c.manda({ t: 'emoji', e: 4 });
    await ate(() => emojis(dono).length && emojis(esp).length, 5000, `${tag}: o emoji não chegou`);
    await espera(600);
    for (const p of [dono, esp]) {
      const l = emojis(p), vv = p.robo.estado();
      if (l.length !== 1 || l[0].e !== 2) falhou(`${tag}: ${p.nome} recebeu emojis ${JSON.stringify(l)} (esperava só o 2)`);
      else if (vv.players[l[0].p]?.name !== q.nome) falhou(`${tag}: ${p.nome} viu o emoji na cadeira de ${vv.players[l[0].p]?.name}, e não de ${q.nome}`);
    }
    todos.push(esp); outros.push(esp);
  }
  // até o fim
  await ate(() => todos.every(p => p.robo.fim), 240000, `${tag}: nem todos viram o fim da partida`);
  const vezes = q.robo.estado().vezes;
  // fim: ninguém está pronto, e sem os prontos a partida não começa
  await ate(() => sala(dono) && outros.every(p => linha(dono, p.nome) && !linha(dono, p.nome).pronto), 5000, `${tag}: no fim, os outros continuam prontos`);
  dono.c.manda({ t: 'comando', c: 'comecar' }); await espera(800);
  if (todos.some(p => !p.robo.fim)) falhou(`${tag}: a partida começou sem todos prontos`);
  for (const p of outros) p.c.manda({ t: 'pronto', pronto: true });
  await ate(() => outros.every(p => linha(dono, p.nome)?.pronto), 5000, `${tag}: o dono não vê quem ficou pronto de novo`);
  // outra partida, depois o dono tira uma pessoa e sai
  dono.c.manda({ t: 'comando', c: 'comecar' });
  await ate(() => todos.every(p => !p.robo.fim && p.robo.estado().discard.length), 8000, `${tag}: a segunda partida não começou`);
  if (todos.some(p => p.robo.estado().players[0].espectador)) falhou(`${tag}: alguém continuou só assistindo na segunda partida`);
  if (outros.length >= 2) {
    const tirada = outros[outros.length - 1], i = sala(dono).lugares.findIndex(x => x.nome === tirada.nome);
    dono.c.manda({ t: 'comando', c: 'remover', i });
    await ate(() => tirada.msgs.some(m => m.t === 'removido') && tirada.c.fechou, 5000, `${tag}: ${tirada.nome} não foi tirado da sala`);
    await ate(() => !linha(dono, tirada.nome), 5000, `${tag}: ${tirada.nome} continua na lista`);
    outros.pop(); tirada.fim();
  }
  dono.c.manda({ t: 'sair' });
  await ate(() => outros.every(p => sala(p) && sala(p).lugares.some(x => x.dono && x.nome !== dono.nome)), 5000, `${tag}: o posto de dono não passou adiante`);
  const novo = sala(outros[0]).lugares.find(x => x.dono);
  for (const p of [...todos]) {
    for (const v of p.robo.vazamentos) falhou(`${tag}: ${p.nome}: visão com ${v}`);
    for (const e of p.erros) falhou(`${tag}: ${p.nome}: ${e}`);
  }
  console.log(`${tag}: ${todos.length} pessoas, ${vezes} vezes na primeira partida, ${todos.reduce((a, p) => a + p.robo.pedidos, 0)} pedidos, ${todos.reduce((a, p) => a + p.robo.recusadas, 0)} ações recusadas; novo dono: ${novo && novo.nome}`);
  for (const p of todos) p.fim();
}

const t0 = Date.now();
// conexão muda: entra numa sala e não manda mais nada (nem o "oi" a cada 2 s)
{
  const c = await conecta(srv.url);
  c.manda({ t: 'criar', nome: 'Mudo', versao: VERSAO });
  await c.espera(m => m && m.t === 'entrou');
  const t = Date.now(), f = await c.esperaFechar(10000).catch(() => null);
  if (f) console.log(`conexão muda fechada pelo servidor em ${((Date.now() - t) / 1000).toFixed(1)} s`);
  else falhou('a conexão muda não foi fechada pelo servidor');
}
try {
  await Promise.all(Array.from({ length: SALAS }, (_, k) => umaSala(k).catch(e => falhou(`sala ${k + 1}: ${e.stack || e.message}`))));
} finally {
  await srv.para();
}
const errosServidor = srv.saida.split('\n').filter(l => /erro na sala/.test(l));
for (const l of errosServidor.slice(0, 5)) falhou('servidor: ' + l);
console.log(`\nSalas: ${SALAS} em ${((Date.now() - t0) / 1000).toFixed(0)} s | Problemas: ${problemas.length}`);
process.exit(problemas.length ? 1 : 0);
