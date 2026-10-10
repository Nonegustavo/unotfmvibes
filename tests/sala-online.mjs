// Sala online pelas telas (fase 3, etapa 3): o servidor das salas roda no computador e três abas do navegador fazem
// o que as pessoas fariam nos celulares.
// - O dono cria a sala pelo 👥 ("Pela internet") e recebe o código e o link.
// - A Bia entra abrindo o link; o Caio digita o código.
// - O dono muda os lugares e troca a ordem; os outros veem a mesma lista e ficam prontos; o dono começa.
// - A partida anda; a Dani entra pelo link no meio dela e assiste (todas as cadeiras em cima, "Assistindo…", sem emojis),
//   e os outros veem "👁️ 1" ao lado do menu. O dono manda um emoji: aparece acima das cartas dele e na cadeira dele
//   para a Bia.
// - A Bia recarrega a página no meio da partida e volta sozinha para a mesma cadeira.
// - No fim, todos veem só "Voltar à sala"; a Bia volta à sala sem estar pronta, e o dono não consegue começar.
// - O dono tira o Caio da sala e depois sai: o posto de dono passa para a Bia, que vê os botões de dono.
// Tira capturas (tests/sala-online-*.png).
// Uso: npm run test:sala-online   (--ver abre o navegador visível)
//      npm run test:sala-online -- --site=https://nonegustavo.github.io/unotfmvibes/   (o site e o servidor publicados)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { ROOT } from './robo.mjs';
import { sobeServidor } from './servidor-teste.mjs';

const HEADED = process.argv.includes('--ver');
const SITE = (process.argv.find(a => a.startsWith('--site=')) || '').slice(7); // com o site publicado, o servidor é o dele
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const web = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => web.listen(0, '127.0.0.1', r));
const srv = SITE ? { para: async () => {} } : await sobeServidor({ velocidade: 3 });
const BASE = SITE ? SITE.replace(/\/?$/, '/') + '?x=1' : `http://127.0.0.1:${web.address().port}/?servidor=${encodeURIComponent(srv.url)}`;
const browser = await chromium.launch(HEADED ? { headless: false, channel: 'chrome' } : {});
const erros = [];
const falhou = m => { console.error('FALHOU: ' + m); process.exitCode = 1; };
const confere = (ok, m) => ok ? console.log('ok: ' + m) : falhou(m);
// cada pessoa num contexto próprio (como aparelhos diferentes: cada um guarda a própria chave)
const abre = async (nome, q = '') => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('unotfm-solo-cfg')) localStorage.setItem('unotfm-solo-cfg', JSON.stringify({ mode: 'custom', poker: false, trade: true, gift: true })); } catch (e) {} });
  const p = await ctx.newPage(); p.nome = nome;
  p.on('pageerror', e => erros.push(`${nome}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/vibrate|O convidado chamou/.test(m.text())) erros.push(`${nome} console: ${m.text()}`); });
  await p.goto(BASE + q); return p;
};
const foto = (p, nome) => p.screenshot({ path: path.join(ROOT, 'tests', `sala-online-${nome}.png`) });
const nomesNaLista = (p, id) => p.evaluate(id => [...document.querySelectorAll(`#${id} li .nm`)].map(e => e.textContent), id);
const joga = p => p.evaluate(() => {
  const shown = id => document.getElementById(id)?.classList.contains('show');
  for (const [ov, box] of [['colorOv', 'colorBtns'], ['pickOv', 'picks'], ['swapOv', 'swaps']]) if (shown(ov)) { document.querySelector(`#${box} button, #${box} .card, #${box} [role=button]`)?.click(); return; }
  const ok = document.querySelector('#hand .card.ok'); if (ok) { ok.click(); return; }
  if (typeof myTurn === 'function' && myTurn()) document.getElementById('deck').click();
});

try {
  // ---------- o dono cria a sala ----------
  const dono = await abre('dono');
  await dono.click('#homeAmigos');
  // sem nome não dá: é ele que os outros veem na mesa
  await dono.fill('#salaNome', '');
  await dono.click('#salaCriarOnline');
  confere(/Escreva seu nome/.test(await dono.textContent('#salaEstadoInicio')) && await dono.isVisible('#salaInicio'), 'sem nome, a sala não é criada');
  await dono.fill('#salaNome', 'Gustavo');
  await dono.click('#salaCriarOnline');
  await dono.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('salaCodigoTxt')?.textContent || ''), null, { timeout: 10000 });
  const codigo = await dono.textContent('#salaCodigoTxt');
  confere(true, `o dono criou a sala ${codigo}`);
  confere(await dono.isVisible('#salaAnfitriao') && !(await dono.isVisible('#salaConvidar')), 'a sala online do dono, sem o convite por QR code da rede local');
  const link = await dono.evaluate(() => document.getElementById('salaLink').textContent);
  confere(link.includes('sala=' + codigo), `o link leva à sala (${link})`);
  await foto(dono, 'dono');

  // ---------- a Bia entra pelo link; o Caio digita o código ----------
  const bia = await abre('Bia', '&sala=' + codigo);
  await bia.waitForSelector('#salaOv.show', { timeout: 5000 });
  await bia.fill('#salaNome', 'Bia');
  confere(await bia.isVisible('#salaEntrarConvite') && !(await bia.isVisible('#salaCriarOnline')) && (await bia.textContent('#salaEntrarConvite')).includes(codigo), 'pelo link: só o nome e "Entrar na sala"');
  await foto(bia, 'link');
  await bia.click('#salaEntrarConvite');
  await bia.waitForSelector('#salaDentro:not([hidden])', { timeout: 10000 });
  confere(true, 'a Bia entrou abrindo o link');
  const caio = await abre('Caio');
  await caio.click('#homeAmigos'); await caio.fill('#salaNome', 'Caio');
  await caio.click('#salaEntrarOnline');
  confere(await caio.isVisible('#salaCodigoTela') && await caio.isDisabled('#salaCodigoEntrar'), 'Entrar com código abre a janela do código, com Entrar apagado até ter 4 caracteres');
  // código errado: volta à janela do código, com o aviso e o código ainda escrito
  await caio.fill('#salaCodigo', 'zzzz'); await caio.click('#salaCodigoEntrar');
  await caio.waitForFunction(() => !document.getElementById('salaCodigoTela').hidden && /não encontrada/.test(document.getElementById('salaEstadoCodigo').textContent), null, { timeout: 8000 });
  confere(await caio.inputValue('#salaCodigo') === 'ZZZZ', 'código errado: volta à janela do código com o aviso e o código escrito');
  await foto(caio, 'codigo');
  await caio.fill('#salaCodigo', codigo.toLowerCase()); await caio.press('#salaCodigo', 'Enter');
  await caio.waitForSelector('#salaDentro:not([hidden])', { timeout: 10000 });
  confere(true, 'o Caio entrou digitando o código');
  await dono.waitForFunction(() => document.querySelectorAll('#salaLugares li:not(.bot)').length === 3, null, { timeout: 5000 });
  confere(true, 'o dono vê as duas pessoas');

  // ---------- lugares e prontos ----------
  await dono.click('#salaLugaresSeg button[data-n="5"]');
  await dono.waitForFunction(() => document.querySelectorAll('#salaLugares li').length === 5, null, { timeout: 5000 });
  const antes = (await nomesNaLista(dono, 'salaLugares')).join(',');
  await dono.click('#salaLugares [data-desce="1"]');
  await dono.waitForFunction(a => [...document.querySelectorAll('#salaLugares li .nm')].map(e => e.textContent).join(',') !== a, antes, { timeout: 5000 });
  const depois = (await nomesNaLista(dono, 'salaLugares')).join(',');
  confere(true, `troca de lugar (${antes} → ${depois})`);
  await bia.waitForFunction(d => [...document.querySelectorAll('#salaLugaresConv li .nm')].map(e => e.textContent).join(',') === d, depois, { timeout: 5000 });
  confere(true, 'a Bia vê a mesma lista');
  await bia.click('#salaPronto'); await caio.click('#salaPronto');
  await dono.waitForFunction(() => (document.getElementById('salaLugares').textContent.match(/pronto/g) || []).length >= 2, null, { timeout: 5000 });
  confere(true, 'o dono vê os dois prontos');
  await foto(bia, 'convidado');

  // ---------- começa ----------
  await dono.click('#salaComecar');
  for (const [p, nome] of [[dono, 'Gustavo'], [bia, 'Bia'], [caio, 'Caio']]) {
    await p.waitForFunction(() => S && S.players && S.players.length === 5 && S.discard.length, null, { timeout: 10000 });
    confere(await p.evaluate(() => S.players[0].name) === nome && !(await p.isVisible('#salaOv')), `${nome} está na partida, na própria cadeira`);
  }
  for (let i = 0; i < 25; i++) { for (const p of [dono, bia, caio]) await joga(p); await dono.waitForTimeout(200); }
  confere(await dono.evaluate(() => S.vezes > 3), 'a partida anda');
  // quem não é o dono abre a sala no meio da partida e volta ao jogo
  await caio.click('#menuBtn'); await caio.click('#menuSala');
  await caio.waitForSelector('#salaOv.show', { timeout: 5000 });
  confere(await caio.isVisible('#salaComecar') && (await caio.textContent('#salaComecar')) === 'Voltar ao jogo', 'o Caio abre a sala e vê "Voltar ao jogo"');
  await caio.click('#salaComecar');
  await caio.waitForFunction(() => !document.getElementById('salaOv').classList.contains('show'), null, { timeout: 3000 });
  confere(true, 'o Caio voltou ao jogo');
  await foto(dono, 'jogo');

  // ---------- a Dani entra no meio da partida e assiste ----------
  const dani = await abre('Dani', '&sala=' + codigo);
  await dani.waitForSelector('#salaOv.show', { timeout: 5000 });
  await dani.fill('#salaNome', 'Dani'); await dani.click('#salaEntrarConvite');
  await dani.waitForFunction(() => S && S.players && S.players[0].espectador && S.phase !== 'over', null, { timeout: 10000 });
  await dani.waitForFunction(() => !document.getElementById('salaOv').classList.contains('show'), null, { timeout: 5000 });
  const vd = await dani.evaluate(() => ({ cadeiras: document.querySelectorAll('#seatrow .seat').length, status: document.getElementById('status').textContent, mao: document.querySelectorAll('#hand .card').length, emojis: document.getElementById('emojis').hidden, primeira: S.players[1].name }));
  confere(vd.cadeiras === 5 && vd.status === 'Assistindo…' && vd.mao === 0 && vd.emojis && vd.primeira === 'Gustavo', `a Dani assiste com as 5 cadeiras em cima, a partir do dono (${JSON.stringify(vd)})`);
  await dono.waitForFunction(() => !document.getElementById('assistindo').hidden && document.getElementById('assistindo').textContent === '👁️ 1', null, { timeout: 5000 });
  confere(true, 'o dono vê "👁️ 1" ao lado do menu');
  await foto(dani, 'espectador');
  // emoji do dono
  await dono.click('#emojiBtn');
  confere(await dono.isVisible('#emojiMenu') && await dono.evaluate(() => document.querySelectorAll('#emojiMenu button').length === EMOJIS.length), 'o dono abre o menu de emojis');
  await foto(dono, 'emojis');
  await dono.click('#emojiMenu button[data-e="0"]');
  confere(await dono.evaluate(() => !!document.querySelector('.emo-balao.meu') && document.getElementById('emojiBtn').textContent === EMOJIS[0]), 'o emoji aparece acima das cartas do dono, e o botão passa a mostrar ele');
  await foto(dono, 'emoji-meu');
  await bia.waitForFunction(() => [...document.querySelectorAll('.emo-balao')].some(b => /Gustavo/.test(b.getAttribute('aria-label'))), null, { timeout: 5000 });
  confere(true, 'a Bia vê o emoji na cadeira do dono');
  await foto(bia, 'emoji');

  // ---------- a Bia recarrega a página e volta sozinha ----------
  const vizinhos = await bia.evaluate(() => S.players.map(p => p.name).join(','));
  await bia.reload();
  await bia.waitForFunction(() => S && S.players && S.players[0].name === 'Bia' && S.discard.length, null, { timeout: 10000 });
  confere(await bia.evaluate(() => S.players.map(p => p.name).join(',')) === vizinhos || await bia.evaluate(() => S.phase === 'over'), 'a Bia recarregou a página e voltou para a mesma cadeira');
  confere(await bia.evaluate(() => document.getElementById('home').hidden), 'depois de voltar, ela vê a partida (e não a tela inicial)');

  // ---------- fim da partida: só "Voltar à sala", e todos dão pronto de novo ----------
  const fimVisto = p => p.evaluate(() => document.getElementById('endOv').classList.contains('show'));
  for (let i = 0; i < 600 && !(await fimVisto(dono) && await fimVisto(bia)); i++) { for (const p of [dono, bia, caio]) await joga(p); await dono.waitForTimeout(150); }
  for (const p of [dono, bia, dani]) {
    const b = await p.evaluate(() => ({ voltar: !document.getElementById('endRules').hidden && document.getElementById('endRules').textContent, outra: !document.getElementById('againBtn').hidden, menu: getComputedStyle(document.getElementById('endMenu')).display !== 'none' }));
    confere(b.voltar === 'Voltar à sala' && !b.outra && !b.menu, `${p.nome}: no fim, só "Voltar à sala" (${JSON.stringify(b)})`);
  }
  await foto(dani, 'fim');
  await bia.click('#endRules');
  await bia.waitForSelector('#salaOv.show', { timeout: 5000 });
  confere(await bia.textContent('#salaPronto') === 'Estou pronto', 'a Bia volta à sala sem estar pronta');
  await bia.evaluate(() => document.getElementById('salaOv').classList.remove('show'));
  await dono.click('#endRules');
  await dono.waitForSelector('#salaOv.show', { timeout: 5000 });
  confere(await dono.isDisabled('#salaComecar') && /^Esperando/.test(await dono.textContent('#salaComecar')), `o dono não consegue começar sem todos prontos ("${await dono.textContent('#salaComecar')}")`);
  await dono.evaluate(() => document.getElementById('salaOv').classList.remove('show'));

  // ---------- o dono tira o Caio e sai ----------
  await dono.click('#menuBtn');
  confere(/Sala [A-Z0-9]{4}/.test(await dono.textContent('#menuTitulo')) && await dono.isVisible('#menuSala') && !(await dono.isVisible('#menuNova')), 'o menu do canto mostra o código da sala e "Sala e regras"');
  await dono.click('#menuSala');
  await dono.waitForSelector('#salaOv.show', { timeout: 5000 });
  await dono.click('#salaLugares li[data-nome="Caio"] [data-tirar]');
  await caio.waitForFunction(() => /tirad/.test(document.getElementById('salaEstado')?.textContent + document.getElementById('toast')?.textContent + document.body.textContent), null, { timeout: 8000 });
  confere(true, 'o Caio foi tirado da sala e ficou sabendo');
  await caio.waitForFunction(() => !document.getElementById('home').hidden && document.getElementById('confirmOv').classList.contains('show') && /tirado da sala/.test(document.getElementById('confirmTitulo').textContent), null, { timeout: 8000 });
  confere(true, 'o Caio foi para a tela inicial, com o aviso numa janela do jogo');
  await foto(caio, 'tirado');
  await dono.waitForFunction(() => ![...document.querySelectorAll('#salaLugares li .nm')].some(e => e.textContent === 'Caio'), null, { timeout: 5000 });
  confere(true, 'o Caio saiu da lista do dono');
  await dono.click('#salaSair');
  await dono.waitForSelector('#confirmOv.show', { timeout: 3000 });
  confere(/outra pessoa vira dona/.test(await dono.textContent('#confirmTexto')), 'o dono vê a pergunta antes de sair da sala');
  await dono.click('#confirmSim');
  await bia.waitForFunction(() => SALA.dono, null, { timeout: 8000 });
  await bia.click('#menuBtn'); await bia.click('#menuSala');
  await bia.waitForSelector('#salaAnfitriao:not([hidden])', { timeout: 5000 });
  confere(true, 'o dono saiu e a Bia virou dona da sala (vê os botões de dono)');
  await foto(bia, 'nova-dona');
} catch (e) {
  falhou(e.stack || e.message);
} finally {
  if (erros.length) falhou('erros nas páginas:\n' + [...new Set(erros)].slice(0, 10).join('\n'));
  await browser.close(); web.close(); await srv.para();
}
