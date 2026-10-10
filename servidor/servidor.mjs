// unotfm: servidor das salas online (fase 3). Cada sala tem a própria mesa e o próprio anfitrião (js/mesa/*.js num
// contexto vm, como no test:mesa): as regras, a sala e o que cada pessoa pode ver são os mesmos da rede local
// (js/mesa/anfitriao.js). O servidor só cria as salas, liga cada WebSocket à pessoa certa (pela chave secreta dela) e
// confere o formato e a quantidade das mensagens.
// Uso: npm run servidor
//   PORTA=8787            porta (no Fly.io vem em PORT)
//   ORIGENS=https://...   sites que podem conectar, separados por vírgula (padrão: o GitHub Pages do jogo)
//   DEV=1                 aceita também páginas abertas no computador ou na rede local (http://localhost, 192.168…)
//   VELOCIDADE=10         só nos testes: as esperas da mesa ficam 10 vezes mais curtas
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MESA = process.env.MESA || path.join(AQUI, '..', 'js', 'mesa');
const PORTA = Number(process.env.PORT ?? process.env.PORTA ?? 8787);
const VELOCIDADE = Math.max(1, +process.env.VELOCIDADE || 1);
const ORIGENS = (process.env.ORIGENS || 'https://nonegustavo.github.io').split(',').map(x => x.trim()).filter(Boolean);
const DEV = process.env.DEV === '1';
const LIM = {
  mensagem: 4096,          // bytes por mensagem
  porSegundo: 30,          // mensagens por segundo (com folga para rajadas curtas)
  avisos: 20,              // mensagens recusadas antes de desconectar
  salasPorIp: 5, salasJanela: 10 * 60e3,     // salas criadas por endereço a cada 10 min
  errosCodigo: 10, errosJanela: 60e3,        // códigos errados por endereço por minuto
  salas: 500,              // salas ao mesmo tempo
  cadeiras: 6,
  primeira: 10e3,          // tempo para mandar "criar" ou "entrar" depois de conectar
  vazia: 10 * 60e3,        // sala sem ninguém ligado acaba
  donoAusente: 30e3,       // dono desligado por esse tempo passa o posto adiante
  foraDaSala: 2 * 60e3,    // fora da partida, quem ficou desligado por esse tempo sai da sala
  mudo: 30e3,              // conexão sem nenhuma mensagem por esse tempo (o jogo manda um "oi" a cada 2 s) está morta:
                           // o celular fechou o app ou trocou de rede sem avisar. Ela é fechada, e o jogo volta pela chave
};
// nos testes, os limites podem ser trocados (LIMITES={"primeira":1000,...})
Object.assign(LIM, JSON.parse(process.env.LIMITES || '{}'));
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I/L
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* ---------- a mesa de cada sala ---------- */
const ARQUIVOS = ['dados', 'regras', 'cartas', 'adversarios', 'visao', 'anfitriao']
  .map(f => new vm.Script(fs.readFileSync(path.join(MESA, f + '.js'), 'utf8'), { filename: 'js/mesa/' + f + '.js' }));
function novaMesa(sala) {
  // os timers da sala ficam guardados para parar todos quando ela acaba; um erro numa regra não derruba o servidor
  const timers = new Set();
  const st = (fn, ms) => { const h = setTimeout(() => { timers.delete(h); try { fn(); } catch (e) { erroNaSala(sala, e); } }, Math.max(0, +ms || 0) / VELOCIDADE); timers.add(h); return h; };
  const ct = h => { clearTimeout(h); timers.delete(h); };
  const ctx = vm.createContext({ console, setTimeout: st, clearTimeout: ct });
  for (const s of ARQUIVOS) s.runInContext(ctx);
  vm.runInContext(`function TELA() {} ANF.sala = true; ANF.manterCaidos = true; anfInicia();`, ctx);
  sala.parar = () => { for (const h of timers) clearTimeout(h); timers.clear(); };
  return ctx;
}
const MODELO = vm.createContext({ console });
for (const s of ARQUIVOS) s.runInContext(MODELO);
const VERSAO = vm.runInContext('VERSAO_REDE', MODELO);
function erroNaSala(sala, e) { sala.erros = (sala.erros || 0) + 1; log('erro na sala', sala.codigo, e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e); }
// roda algo dentro da sala (com o objeto em __x)
const naSala = (sala, codigo, x) => { sala.ctx.__x = x; try { return vm.runInContext(codigo, sala.ctx); } catch (e) { erroNaSala(sala, e); } finally { sala.ctx.__x = undefined; } };

/* ---------- salas ---------- */
const SALAS = new Map();
let SEQ = 0;
function novoCodigo() {
  for (let k = 0; k < 1000; k++) {
    let c = ''; for (let i = 0; i < 4; i++) c += ALFABETO[crypto.randomInt(ALFABETO.length)];
    if (!SALAS.has(c)) return c;
  }
  return null;
}
function criaSala() {
  const codigo = novoCodigo(); if (!codigo) return null;
  const sala = { codigo, criada: Date.now(), vaziaDesde: Date.now(), removidos: new Set() };
  sala.ctx = novaMesa(sala);
  SALAS.set(codigo, sala);
  log('sala nova', codigo, '| salas:', SALAS.size);
  return sala;
}
function fechaSala(sala, motivo) {
  sala.parar();
  for (const l of naSala(sala, 'ANF.ligacoes') || []) if (l.ws) { try { l.ws.close(4000, motivo || 'sala encerrada'); } catch (e) {} }
  SALAS.delete(sala.codigo);
  log('sala fechada', sala.codigo, motivo || '', '| salas:', SALAS.size);
}
// a ligação de uma pessoa com a sala: o objeto fica o mesmo quando ela volta (só troca o WebSocket)
function novaLigacao(ws) {
  const l = { id: 'p' + (++SEQ), aberta: true, enviouEm: 0, visto: Date.now(), ws, chave: crypto.randomBytes(16).toString('base64url'), aoReceber: null, aoFechar: null, fechadaEm: 0 };
  l.enviar = m => { if (l.ws && l.ws.readyState === 1) { l.enviouEm = Date.now(); l.ws.send(JSON.stringify(m)); } };
  // tirada da sala pelo dono: a conexão fecha, e a chave dela não entra mais nesta sala
  l.fechar = () => { if (l.sala) l.sala.removidos.add(l.chave); const ws = l.ws; l.ws = null; l.aberta = false; if (ws) setTimeout(() => { try { ws.close(4002, 'removido'); } catch (e) {} }, 50); };
  return l;
}
// a cada segundo: o sinal de cada sala, o dono ausente, quem saiu da sala e as salas vazias
setInterval(() => {
  const agora = Date.now();
  for (const sala of [...SALAS.values()]) {
    naSala(sala, 'anfSinal()');
    const ls = naSala(sala, 'ANF.ligacoes') || [];
    const jogando = naSala(sala, '!!(S && S.phase !== "over")');
    for (const l of ls) {
      if (l.aberta && l.ws && agora - (l.visto || 0) > LIM.mudo) { try { l.ws.terminate(); } catch (e) {} continue; }
      if (l.aberta) continue;
      const fora = agora - l.fechadaEm;
      if (fora > LIM.donoAusente && naSala(sala, 'ANF.dono') === l) naSala(sala, 'anfNovoDono()');
      if (fora > LIM.foraDaSala && !(jogando && l.cadeira != null)) naSala(sala, 'anfRemove(__x, false)', l);
    }
    if (ls.some(l => l.aberta)) sala.vaziaDesde = agora;
    else if (agora - sala.vaziaDesde > LIM.vazia) fechaSala(sala, 'sala vazia');
  }
}, 1000);

/* ---------- limites por endereço ---------- */
const PORIP = new Map();
const contaIp = (ip, k, janela) => {
  const agora = Date.now(), e = PORIP.get(ip) || {}; PORIP.set(ip, e);
  e[k] = (e[k] || []).filter(t => agora - t < janela);
  return e[k];
};
setInterval(() => { for (const [ip, e] of PORIP) if (Object.values(e).every(l => !l.length)) PORIP.delete(ip); }, 60e3);

/* ---------- mensagens ---------- */
const ACOES = ['jogar', 'principal', 'sineta', 'pegar', 'desafiar', 'fecharMix', 'trocarMao'];
const int = x => x === undefined || Number.isInteger(x);
// formato fixo de cada mensagem: o que não passa é recusado; o que passa vai sem campos a mais
function confere(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  switch (m.t) {
    case 'oi': case 'sair': return { t: m.t };
    case 'acao': { const a = m.acao; if (!a || typeof a !== 'object' || !ACOES.includes(a.t) || !int(a.id) || !int(a.alvo) || !int(m.n)) return null;
      return { t: 'acao', acao: { t: a.t, id: a.id, alvo: a.alvo }, n: m.n }; }
    case 'escolher': if (!Number.isInteger(m.id) || !(m.valor == null || typeof m.valor === 'string' || typeof m.valor === 'number')) return null;
      if (m.toques !== undefined && !(Array.isArray(m.toques) && m.toques.length <= 50 && m.toques.every(x => typeof x === 'string' && x.length <= 2))) return null;
      return { t: 'escolher', id: m.id, valor: m.valor, toques: m.toques };
    case 'pronto': return typeof m.pronto === 'boolean' ? { t: 'pronto', pronto: m.pronto } : null;
    case 'comando': if (typeof m.c !== 'string' || !int(m.n) || !int(m.i) || !int(m.j)) return null;
      return { t: 'comando', c: m.c, n: m.n, i: m.i, j: m.j, v: typeof m.v === 'string' || typeof m.v === 'boolean' ? m.v : undefined, cfg: m.cfg && typeof m.cfg === 'object' ? m.cfg : undefined };
  }
  return null;
}
const nomeLimpo = n => String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f\u2028\u2029\ue000-\ue004<>&"'`]/g, '').trim().slice(0, 16);

function aoConectar(ws, ip) {
  let sala = null, l = null, avisos = 0, fichas = LIM.porSegundo * 2, ultimo = Date.now();
  const recusa = motivo => { if (++avisos > LIM.avisos) { log('desconectado por mensagens recusadas', ip); ws.close(1008, 'mensagens demais'); } else if (motivo) ws.send(JSON.stringify({ t: 'erro', motivo })); };
  const espera = setTimeout(() => { if (!l) ws.close(1008, 'sem entrar'); }, LIM.primeira);
  ws.on('message', (dados, binario) => {
    // quantidade: fichas que recarregam a LIM.porSegundo por segundo
    const agora = Date.now(); fichas = Math.min(LIM.porSegundo * 2, fichas + (agora - ultimo) / 1000 * LIM.porSegundo); ultimo = agora;
    if (fichas < 1) { if (++avisos > LIM.avisos) ws.close(1008, 'mensagens demais'); return; }
    fichas--;
    if (binario) return recusa();
    let m; try { m = JSON.parse(dados.toString()); } catch (e) { return recusa(); }
    if (!l) return entra(m);
    const c = confere(m);
    if (!c) return recusa();
    if (!SALAS.has(sala.codigo)) return;
    if (c.t === 'sair') { naSala(sala, 'anfRemove(__x, false)', l); l.ws = null; ws.close(1000, 'saiu'); return; }
    naSala(sala, '__x.l.aoReceber(__x.m)', { l, m: sala.parse(JSON.stringify(c)) });
  });
  ws.on('close', () => {
    clearTimeout(espera);
    if (!l || l.ws !== ws) return; // já voltou por outra conexão
    l.ws = null; l.aberta = false; l.fechadaEm = Date.now();
    if (SALAS.has(sala.codigo)) naSala(sala, 'anfMudou()');
  });
  ws.on('error', () => {});

  // primeira mensagem: criar uma sala ou entrar numa (ou voltar a ela com a chave)
  function entra(m) {
    if (!m || (m.t !== 'criar' && m.t !== 'entrar')) return recusa('primeiro, crie uma sala ou entre numa');
    if (m.versao !== VERSAO) { ws.send(JSON.stringify({ t: 'versao', versao: VERSAO })); return; }
    const nome = nomeLimpo(m.nome);
    if (m.t === 'criar') {
      const criadas = contaIp(ip, 'salas', LIM.salasJanela);
      if (criadas.length >= LIM.salasPorIp) return recusa('muitas salas criadas daqui. Espere alguns minutos');
      if (SALAS.size >= LIM.salas) return recusa('o servidor está cheio. Tente daqui a pouco');
      criadas.push(Date.now());
      sala = criaSala(); if (!sala) return recusa('o servidor está cheio. Tente daqui a pouco');
      sala.parse = vm.runInContext('JSON.parse', sala.ctx);
      l = novaLigacao(ws); l.sala = sala;
      naSala(sala, `anfNovaLigacao(__x.l); ANF.dono = __x.l; ANF.n = 4; ANF.lugares = [__x.l, null, null, null];
        ANF.cfg = limpaCfg(__x.cfg); ANF.tempo = TEMPOS_REDE.hasOwnProperty(__x.tempo) ? __x.tempo : 'normal';`, { l, cfg: sala.parse(JSON.stringify(m.cfg || {})), tempo: m.tempo });
      l.enviar({ t: 'entrou', codigo: sala.codigo, chave: l.chave });
      naSala(sala, '__x.l.aoReceber(__x.m)', { l, m: sala.parse(JSON.stringify({ t: 'ola', nome, versao: VERSAO, id: l.chave })) });
      return;
    }
    // entrar: pelo código; com a chave de antes, a pessoa volta para o lugar dela
    const codigo = String(m.codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    const erros = contaIp(ip, 'codigo', LIM.errosJanela);
    if (erros.length >= LIM.errosCodigo) return recusa('muitas tentativas. Espere um minuto');
    const s = SALAS.get(codigo);
    if (!s) { erros.push(Date.now()); return recusa('sala não encontrada. Confira o código'); }
    sala = s;
    const velha = typeof m.chave === 'string' && (naSala(sala, 'ANF.ligacoes') || []).find(x => x.chave === m.chave);
    if (velha) {
      l = velha;
      if (l.ws && l.ws !== ws) { const antigo = l.ws; l.ws = null; try { antigo.close(4001, 'conectou de novo'); } catch (e) {} }
      l.ws = ws; l.aberta = true; l.visto = Date.now(); l.fechadaEm = 0;
      l.enviar({ t: 'entrou', codigo: sala.codigo, chave: l.chave, voltou: true });
      naSala(sala, 'anfVolta(__x)', l);
      return;
    }
    const ocupadas = naSala(sala, 'ANF.ligacoes.filter(x => x.nome).length');
    if (ocupadas >= LIM.cadeiras) return recusa('a sala está cheia');
    if (typeof m.chave === 'string' && sala.removidos.has(m.chave)) { sala = null; return recusa('você foi tirado desta sala'); }
    l = novaLigacao(ws); l.sala = sala;
    naSala(sala, 'anfNovaLigacao(__x)', l);
    l.enviar({ t: 'entrou', codigo: sala.codigo, chave: l.chave });
    naSala(sala, '__x.l.aoReceber(__x.m)', { l, m: sala.parse(JSON.stringify({ t: 'ola', nome, versao: VERSAO, id: l.chave })) });
  }
}

/* ---------- servidor HTTP + WebSocket ---------- */
const origemOk = o => !o ? DEV : ORIGENS.includes(o) || (DEV && /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(o));
const ipDe = req => String(req.headers['fly-client-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '').trim();
const servidor = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  let conectadas = 0;
  for (const sala of SALAS.values()) conectadas += (naSala(sala, "ANF.ligacoes") || []).filter(l => l.aberta).length;
  res.end(`unotfm: servidor das salas online (${VERSAO}), ${SALAS.size} sala(s), ${conectadas} pessoa(s) conectada(s)\n`);
});
const wss = new WebSocketServer({ server: servidor, maxPayload: LIM.mensagem, verifyClient: ({ origin }) => origemOk(origin) });
wss.on('connection', (ws, req) => aoConectar(ws, ipDe(req)));
servidor.listen(PORTA, () => log(`servidor das salas na porta ${servidor.address().port} (${VERSAO})${DEV ? ', modo de desenvolvimento' : ''}${VELOCIDADE > 1 ? `, velocidade ${VELOCIDADE}x` : ''}`));
// ao desligar (atualização do servidor): as salas acabam e quem está nelas fica sabendo
const desliga = () => { for (const sala of [...SALAS.values()]) fechaSala(sala, 'o servidor reiniciou'); servidor.close(); setTimeout(() => process.exit(0), 300); };
process.on('SIGTERM', desliga); process.on('SIGINT', desliga);
