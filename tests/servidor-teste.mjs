// Para os testes do servidor das salas online: sobe o servidor (servidor/servidor.mjs) numa porta livre, com as opções
// dos testes, e cria clientes WebSocket (a biblioteca ws do servidor, que deixa escolher o site de origem).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ROOT } from './robo.mjs';

const require = createRequire(path.join(ROOT, 'servidor', 'package.json'));
export const WebSocket = require('ws');

// sobe o servidor; devolve {url, para(), saida} (saida: tudo o que ele escreveu, para mostrar se algo der errado)
export function sobeServidor({ velocidade = 10, limites = {}, origens } = {}) {
  return new Promise((ok, falha) => {
    const env = { ...process.env, DEV: '1', PORTA: '0', VELOCIDADE: String(velocidade), LIMITES: JSON.stringify(limites) };
    if (origens) env.ORIGENS = origens;
    const p = spawn(process.execPath, [path.join(ROOT, 'servidor', 'servidor.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const s = { saida: '', para: () => new Promise(r => { p.once('exit', r); p.kill(); }) };
    const le = d => {
      s.saida += d;
      const m = /porta (\d+)/.exec(s.saida);
      if (m && !s.url) { s.url = `ws://127.0.0.1:${m[1]}`; ok(s); }
    };
    p.stdout.on('data', le); p.stderr.on('data', le);
    p.on('exit', c => { s.saiu = c; if (!s.url) falha(new Error('o servidor não subiu:\n' + s.saida)); });
  });
}

// um cliente: manda objetos, guarda tudo o que chega e espera por mensagens
export function conecta(url, { origin } = {}) {
  return new Promise((ok, falha) => {
    const ws = new WebSocket(url, origin ? { origin } : {});
    const c = { ws, recebidas: [], aoReceber: null, fechou: null };
    c.manda = m => { if (ws.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };
    // espera a primeira mensagem (a partir de agora, ou já recebida, com desde=0) que passe no teste
    c.espera = (teste, ms = 5000, desde = c.recebidas.length) => new Promise((ok2, falha2) => {
      const ve = () => c.recebidas.slice(desde).find(teste);
      const achou = ve(); if (achou) return ok2(achou);
      const t = setTimeout(() => { clearInterval(i); falha2(new Error('não chegou a mensagem esperada em ' + ms + ' ms')); }, ms);
      const i = setInterval(() => { const a = ve(); if (a) { clearTimeout(t); clearInterval(i); ok2(a); } }, 20);
    });
    c.esperaFechar = (ms = 5000) => new Promise((ok2, falha2) => {
      if (c.fechou) return ok2(c.fechou);
      const t = setTimeout(() => falha2(new Error('a conexão não fechou em ' + ms + ' ms')), ms);
      ws.once('close', (code, motivo) => { clearTimeout(t); ok2({ code, motivo: String(motivo) }); });
    });
    ws.on('message', d => { const txt = String(d); let m = null; try { m = JSON.parse(txt); } catch (e) {} c.recebidas.push(m); if (c.aoReceber) c.aoReceber(txt, m); });
    ws.on('close', (code, motivo) => { c.fechou = { code, motivo: String(motivo) }; });
    ws.on('open', () => ok(c));
    ws.on('error', e => falha(e));
    ws.on('unexpected-response', (req, res) => falha(new Error('recusado: ' + res.statusCode)));
  });
}
