// Cliente trapaceiro (fase 3, seção 6.4 do plano): tenta burlar o servidor das salas online por fora do jogo, mandando
// mensagens que a tela nunca mandaria. Tudo precisa ser recusado, sem derrubar o servidor nem atrapalhar a partida:
// site de origem errado, conexão que não entra em sala, versão errada, códigos chutados, salas demais, regras e nomes
// malformados, comandos de dono sem ser dono, jogar fora da vez ou com carta que não tem, responder pedido alheio,
// mensagens quebradas, enxurrada de mensagens, mensagem grande demais, chave inventada e chave de quem foi tirado.
// Uso: npm run test:trapaca
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './robo.mjs';
import { sobeServidor, conecta } from './servidor-teste.mjs';

const VERSAO = /VERSAO_REDE='([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'js', 'mesa', 'anfitriao.js'), 'utf8'))[1];
const problemas = [];
const confere = (ok, m) => { if (ok) console.log('ok: ' + m); else { problemas.push(m); console.error('FALHOU: ' + m); } };
const espera = ms => new Promise(r => setTimeout(r, ms));
// janelas curtas para os limites por endereço, para o teste não esperar minutos
const srv = await sobeServidor({ velocidade: 10, limites: { primeira: 1500, salasPorIp: 5, salasJanela: 3000, errosCodigo: 10, errosJanela: 3000 } });
const ultima = (c, t) => [...c.recebidas].reverse().find(m => m && m.t === t);
const erroDe = async (c, ms = 2000) => (await c.espera(m => m && m.t === 'erro', ms).catch(() => null))?.motivo || '';
const marcador = String.fromCharCode(0xe000), controle = String.fromCharCode(7);

try {
  // ---------- antes de entrar numa sala ----------
  const recusou = await conecta(srv.url, { origin: 'https://site-estranho.example' }).then(() => false, e => /recusado/.test(e.message));
  confere(recusou, 'conexão de outro site é recusada');
  const doJogo = await conecta(srv.url, { origin: 'https://nonegustavo.github.io' }).then(c => (c.ws.close(), true), () => false);
  confere(doJogo, 'conexão do site do jogo é aceita');
  {
    const c = await conecta(srv.url);
    const f = await c.esperaFechar(4000).catch(() => null);
    confere(f && f.code === 1008, 'quem conecta e não entra em sala é desconectado');
  }
  {
    const c = await conecta(srv.url);
    c.manda({ t: 'acao', acao: { t: 'principal' } });
    confere(/crie uma sala ou entre/.test(await erroDe(c)), 'ação antes de entrar numa sala é recusada');
    c.manda({ t: 'criar', nome: 'X', versao: 'rede-0' });
    confere(!!(await c.espera(m => m && m.t === 'versao', 2000).catch(() => null)), 'versão diferente recebe "atualize o jogo"');
    c.ws.close();
  }
  {
    const c = await conecta(srv.url);
    let bloqueou = false;
    for (let k = 0; k < 12 && !bloqueou; k++) { c.manda({ t: 'entrar', codigo: 'ZZZ' + k, nome: 'X', versao: VERSAO }); bloqueou = /muitas tentativas/.test(await erroDe(c, 1000)); }
    confere(bloqueou, 'códigos chutados: depois de 10 erros, o endereço espera');
    c.ws.close(); await espera(3200);
  }
  {
    const cs = [];
    let recusada = '';
    for (let k = 0; k < 6; k++) {
      const c = await conecta(srv.url); cs.push(c);
      c.manda({ t: 'criar', nome: 'Sala ' + k, versao: VERSAO });
      const r = await c.espera(m => m && (m.t === 'entrou' || m.t === 'erro'), 2000);
      if (r.t === 'erro') recusada = r.motivo;
    }
    confere(/muitas salas/.test(recusada), 'a sexta sala seguida do mesmo endereço é recusada');
    for (const c of cs) c.ws.close();
    await espera(3200);
  }

  // ---------- numa sala ----------
  const dono = await conecta(srv.url);
  dono.manda({ t: 'criar', nome: 'Dono', versao: VERSAO, cfg: { mode: 'custom', trade: true } });
  const codigo = (await dono.espera(m => m && m.t === 'entrou')).codigo;
  const ana = await conecta(srv.url);
  ana.manda({ t: 'entrar', codigo, nome: controle + 'Ana' + marcador + 'Silva', versao: VERSAO });
  const anaChave = (await ana.espera(m => m && m.t === 'entrou')).chave;
  await espera(300);
  const nomes = () => (ultima(dono, 'sala') || { lugares: [] }).lugares.filter(x => x.nome).map(x => x.nome);
  confere(nomes().includes('AnaSilva'), `nome sem caracteres de controle nem marcadores (${nomes().join(', ')})`);
  // regras malformadas: só o que existe e sem conflitos
  dono.manda({ t: 'comando', c: 'regras', cfg: { mode: 'zzz', diff: 'deus', start: 999, combo: 'x' } });
  await espera(300);
  let r = ultima(ana, 'sala').regras;
  confere(r.mode === 'classic' && r.diff === 'normal', `regras inválidas viram as do Clássico (${JSON.stringify(r)})`);
  dono.manda({ t: 'comando', c: 'regras', cfg: { mode: 'custom', stack: true, sequence: true, trade: 'sim', dfnone: true, inexistente: true } });
  await espera(300);
  r = ultima(ana, 'sala').regras;
  confere(r.mode === 'custom' && r.n === 1, `regras em conflito, de defesa e com valores errados ficam de fora (${r.n} regra)`);
  // comandos de dono, mandados por quem não é dono
  const antes = JSON.stringify(ultima(dono, 'sala').lugares.map(x => x.nome || 'bot'));
  for (const cmd of [{ c: 'lugares', n: 2 }, { c: 'remover', i: 0 }, { c: 'tempo', v: 'rapido' }, { c: 'comecar' }]) ana.manda({ t: 'comando', ...cmd });
  await espera(500);
  confere(JSON.stringify(ultima(dono, 'sala').lugares.map(x => x.nome || 'bot')) === antes && !ana.recebidas.some(m => m && m.t === 'evento'), 'comandos de dono mandados por outra pessoa não fazem nada');
  // começa (o dono)
  dono.manda({ t: 'comando', c: 'tempo', v: 'normal' });
  dono.manda({ t: 'comando', c: 'comecar' });
  await ana.espera(m => m && m.t === 'evento' && m.visao && m.visao.S.discard.length, 5000);
  // jogar fora da vez e carta que não tem
  const S = () => ultima(ana, 'evento').visao.S;
  let n = 100;
  const recusadas = async acao => { const k = ++n; ana.manda({ t: 'acao', acao, n: k }); return !!(await ana.espera(m => m && m.t === 'recusada' && m.n === k, 2000).catch(() => null)); };
  confere(await recusadas({ t: 'jogar', id: 123456789 }), 'jogar uma carta que não está na mão é recusado');
  for (let k = 0; k < 60 && S().turn === 0; k++) await espera(50);
  if (S().turn !== 0) confere(await recusadas({ t: 'jogar', id: S().players[0].hand[0].id }), 'jogar fora da vez é recusado');
  confere(await recusadas({ t: 'pegar', alvo: 99 }), 'pegar alguém que não existe é recusado');
  confere(await recusadas({ t: 'desafiar' }), 'desafiar sem +4 na mesa é recusado');
  // responder pedidos que não são dela: nada acontece e a partida continua
  for (let id = 1; id <= 40; id++) ana.manda({ t: 'escolher', id, valor: 0 });
  const vezes = S().vezes;
  await dono.espera(m => m && m.t === 'evento' && m.visao && m.visao.S.vezes > vezes + 2, 15000).then(() => confere(true, 'respostas a pedidos alheios não fazem nada, e a partida continua'), () => confere(false, 'a partida parou depois das respostas a pedidos alheios'));

  // ---------- quem insiste é desconectado ----------
  {
    const b = await conecta(srv.url);
    b.manda({ t: 'entrar', codigo, nome: 'Beto', versao: VERSAO });
    await b.espera(m => m && m.t === 'entrou');
    for (let k = 0; k < 25; k++) b.manda(k % 2 ? '{quebrada' : { t: 'acao', acao: { t: 'hackear' } });
    const f = await b.esperaFechar(3000).catch(() => null);
    confere(f && f.code === 1008, 'mensagens quebradas ou desconhecidas: depois de 20, desconectado');
  }
  {
    const c = await conecta(srv.url);
    c.manda({ t: 'entrar', codigo, nome: 'Caio', versao: VERSAO });
    await c.espera(m => m && m.t === 'entrou');
    for (let k = 0; k < 400; k++) c.manda({ t: 'oi' });
    const f = await c.esperaFechar(3000).catch(() => null);
    confere(f && f.code === 1008, 'enxurrada de mensagens: desconectado');
  }
  {
    const c = await conecta(srv.url);
    c.manda({ t: 'entrar', codigo, nome: 'Duda', versao: VERSAO });
    await c.espera(m => m && m.t === 'entrou');
    c.manda({ t: 'oi', lixo: 'x'.repeat(6000) });
    const f = await c.esperaFechar(3000).catch(() => null);
    confere(f && f.code === 1009, 'mensagem grande demais: desconectado');
  }
  // chave inventada: entra como pessoa nova, sem tomar o lugar de ninguém
  {
    const e = await conecta(srv.url);
    e.manda({ t: 'entrar', codigo, chave: 'a'.repeat(22), nome: 'Eva', versao: VERSAO });
    const m = await e.espera(x => x && (x.t === 'entrou' || x.t === 'erro'));
    confere(m.t === 'entrou' && !m.voltou && m.chave !== anaChave && !ana.fechou && !dono.fechou, 'chave inventada entra como pessoa nova e ninguém perde o lugar');
    e.ws.close();
  }
  // quem foi tirado não volta com a chave
  {
    const i = ultima(dono, 'sala').lugares.findIndex(x => x.nome === 'AnaSilva');
    dono.manda({ t: 'comando', c: 'remover', i });
    const f = await ana.esperaFechar(3000).catch(() => null);
    confere(!!f && ana.recebidas.some(m => m && m.t === 'removido'), 'o dono tirou a Ana da sala');
    const a2 = await conecta(srv.url);
    a2.manda({ t: 'entrar', codigo, chave: anaChave, nome: 'Ana', versao: VERSAO });
    confere(/tirado desta sala/.test(await erroDe(a2)), 'com a chave de antes, ela não entra de novo');
    a2.ws.close();
  }
  // o servidor continua de pé e a partida do dono continua
  const v2 = ultima(dono, 'evento').visao.S.vezes;
  await dono.espera(m => m && m.t === 'evento' && m.visao && (m.visao.S.vezes > v2 + 2 || m.ev.t === 'fim'), 20000).then(() => confere(true, 'depois de tudo, a partida continua'), () => confere(false, 'a partida parou'));
  dono.ws.close();
} catch (e) {
  confere(false, e.stack || e.message);
} finally {
  await srv.para();
}
const errosServidor = srv.saida.split('\n').filter(l => /erro na sala/.test(l));
confere(!errosServidor.length, 'nenhum erro nas regras do servidor' + (errosServidor.length ? ': ' + errosServidor[0] : ''));
console.log(`\nProblemas: ${problemas.length}`);
process.exit(problemas.length ? 1 : 0);
