/* unotfm, mesa: motor da partida (eventos, controladores e pedidos, relógio, baralho, canPlay, distribuição, Portal,
   jogar e playCard, fim de turno, compras, eliminação e fim da partida). Não usa nada da página */
/* ---------- eventos ----------
   As regras não desenham nem tocam som: avisam a tela com emit({t:...}). Cada evento é só dados: lugares são números
   de cadeira, 'mesa' ou 'monte'. A plateia fica em ev.a: 'todos' (padrão, quando não vem) ou o número do único jogador
   que pode ver. Por enquanto a tela (TELA, em ui.js) executa cada evento na hora, e alguns ainda devolvem algo da tela
   (duração da animação, se o dado 3D rolou), que a etapa F troca por tempos da própria mesa.
   A pausa ({t:'pausa'}) também segura a mesa: os adversários esperam o efeito acabar (S.fxUntil). */
let espiaEventos=null; // o teste das cartas grava aqui os eventos de cada cenário
// a tela redesenha a partida (no navegador, render())
const atualiza=()=>emit({t:'atualiza'});
function emit(ev){
  // pausas da mesa: os adversários esperam o efeito acabar (um efeito na tela dura ms, ou 950 ms sem ms)
  if(ev.t==='pausa')hold(ev.ms);
  else if(ev.t==='fx'||ev.t==='tada')hold(ev.ms?ev.ms+200:950);
  if(espiaEventos)espiaEventos(ev);
  for(const f of OUVINTES)f(ev);
  return TELA(ev);
}
// outros que recebem os eventos além da tela deste aparelho (a ponte com a rede, em js/rede.js)
const OUVINTES=[];
/* ---------- quem controla cada cadeira ----------
   Cada jogador tem um controlador (p.ctrl): 'tela' (a pessoa deste aparelho), 'bot' (adversário do computador) e, mais
   tarde, 'rede' (pessoa em outro aparelho). As regras não perguntam "é o jogador 0?": perguntam o tipo (deBot/humano)
   e, quando precisam de uma escolha, fazem um pedido a quem controla a cadeira (CONTROLES: o do bot em adversarios.js e o da
   tela em ui.js). Pedido: {tipo:'cor'|'alvo'|'carta'|'regra'|'memoria', carta, responde(escolha), bot() com a escolha do
   computador (que também decide se o tempo acabar), tela:{titulo, sub, opcoes()}}. pedir devolve 'defer' (a jogada
   continua quando a resposta chegar) ou 'done' (o computador não tinha o que escolher) */
const CONTROLES={};
const ctrl=pi=>CONTROLES[S.players[pi].ctrl];
const deBot=pi=>S.players[pi].ctrl==='bot';
const humano=pi=>!deBot(pi);
// cadeira de uma pessoa, mesmo enquanto o computador joga por ela (tempo esgotado, queda)
const pessoa=pi=>(S.players[pi].ctrlReal||S.players[pi].ctrl)!=='bot';
function pedir(pi,ped){
  if(humano(pi)){
    if(!ped.mix)balaoPessoa(pi,ped);
    pedidoDePessoa(pi,ped);
  }
  return ctrl(pi).pedido(pi,ped)||'defer';
}
/* ---------- tempo para jogar (só no multiplayer) ----------
   OPCOES.tempos: quanto tempo (ms) cada tipo de pedido tem (jogada, cor, alvo, carta, regra, memoria, mix); sem tempos
   (solo), ninguém tem pressa. Quando o tempo acaba, o computador decide pela pessoa. Depois de 3 tempos esgotados
   seguidos, ou se a pessoa cair, o computador fica na cadeira (p.ctrl 'bot', o controlador dela guardado em p.ctrlReal)
   até ela voltar a agir (ou a conexão voltar) */
const RELOGIOS={},ABERTOS={};
const tempoDe=tipo=>{const t=OPCOES.tempos;return t?(t[tipo]||t.jogada||0):0};
function poeRelogio(pi,tipo,acaba){
  tiraRelogio(pi);const ms=tempoDe(tipo);if(!ms)return;
  const g=S.gen,r={tipo};
  r.id=agendar(()=>{if(g!==S.gen||RELOGIOS[pi]!==r)return;delete RELOGIOS[pi];emit({t:'relogioFim',p:pi});acaba()},ms);
  RELOGIOS[pi]=r;emit({t:'relogio',p:pi,ms,tipo});
}
function tiraRelogio(pi){const r=RELOGIOS[pi];if(!r)return;RELOGIO.cancela(r.id);delete RELOGIOS[pi];emit({t:'relogioFim',p:pi})}
// pedido de uma pessoa: a resposta vale uma vez só (a dela, ou a do computador quando o tempo acaba ou ela cai)
function pedidoDePessoa(pi,ped){
  const r0=ped.responde;
  ped.responde=(...a)=>{if(ped.encerrado)return;ped.encerrado=true;delete ABERTOS[pi];tiraRelogio(pi);return r0(...a)};
  ABERTOS[pi]=ped;
  poeRelogio(pi,ped.mix?'mix':ped.tipo,()=>{S.players[pi].esgotou=(S.players[pi].esgotou||0)+1;decidePor(pi)});
}
// o computador responde ao pedido aberto da pessoa (a janela dela fecha)
function decidePor(pi){
  const ped=ABERTOS[pi];if(!ped||ped.encerrado||S.phase==='over')return;
  emit({t:'fechaJanelas',a:pi});
  if(ped.mix&&!ped.bot)return ped.responde((ped.tela.opcoes()||[])[0]);
  if(CONTROLES.bot.pedido(pi,ped)==='done'){S.busy=false;ped.responde(null)}
}
// o computador assume a cadeira (tempo esgotado, ausência, queda) e devolve quando a pessoa volta
function assume(pi){const p=S.players[pi];if(!p.ctrlReal){p.ctrlReal=p.ctrl;p.ctrl='bot';emit({t:'ausente',p:pi})}}
function devolve(pi){const p=S.players[pi];if(!p.ctrlReal)return;p.ctrl=p.ctrlReal;delete p.ctrlReal;emit({t:'ausente',p:pi});atualiza()}
function esgotouJogada(pi){
  if(S.phase==='over'||S.turn!==pi||!humano(pi))return;
  if(S.busy){const q=S.players[pi];agendar(()=>esgotouJogada(S.players.indexOf(q)),300);return}
  const p=S.players[pi];p.esgotou=(p.esgotou||0)+1;
  log(`O tempo de ${J(pi)} acabou: um bot jogou.`);
  assume(pi);S.tok++;botAct();
}
// queda: o computador joga pela pessoa (e responde o que estiver aberto); a volta devolve a cadeira na vez dela
function caiu(pi){
  const p=S.players[pi];if(!p||p.caiu||p.out)return;
  p.caiu=true;tiraRelogio(pi);assume(pi);
  emit({t:'aviso',txt:`📵 ${J(pi)} caiu: um bot joga até ele voltar`});log(`${J(pi)} caiu.`);
  if(ABERTOS[pi])decidePor(pi);
  else if(S.turn===pi&&!S.busy&&S.phase!=='over'){S.tok++;pedirJogada(pi)}
  atualiza();
}
function voltou(pi){
  const p=S.players[pi];if(!p||!p.caiu)return;
  p.caiu=false;p.esgotou=0;emit({t:'aviso',txt:`📶 ${J(pi)} voltou`});log(`${J(pi)} voltou.`);
  // volta na próxima vez dela (no meio da vez, o computador termina o que começou)
  if(S.turn!==pi)devolve(pi);
  atualiza();
}
/* Enquanto uma pessoa escolhe, os outros veem o balão de pensar perto da cadeira dela (como o dos adversários), até ela
   escolher. Escolhas secretas (cartas da mão, do monte ou da pilha, regras sorteadas) aparecem viradas para baixo */
function balaoPessoa(pi,ped){
  const cols=COLORS.filter(c=>!(R.bg&&c==='g'));
  const [tipo,lista]=ped.tipo==='cor'?['color',cols]:ped.tipo==='alvo'?['player',outros(pi)]:ped.tipo==='memoria'?['memoria',[...S.simon]]:['down',Array(ped.quantas||3).fill(0)];
  emit({t:'pensa',p:pi,tipo,lista,escolha:-1,aberto:true,exceto:pi,sp:fastMode()?.4:1});
  // a escolha marca a opção no balão (nas secretas, a posição dela entre as opções)
  let vistas=null;
  if(ped.tela&&ped.tela.opcoes){const o=ped.tela.opcoes;ped.tela={...ped.tela,opcoes:()=>(vistas=o())}}
  const r0=ped.responde;
  ped.responde=(e,...resto)=>{
    const idx=tipo==='color'?cols.findIndex(c=>sameCol(c,e)):tipo==='player'?lista.indexOf(e):tipo==='memoria'?-1:vistas?vistas.indexOf(e):-1;
    emit({t:'pensouFim',p:pi,escolha:idx,exceto:pi});
    return r0(e,...resto);
  };
}
// a vez (ou a continuação dela, no combo e depois de comprar) é de pi: o adversário pensa e joga; a pessoa usa a tela
function pedirJogada(pi,rapido){
  ctrl(pi).jogada(pi,rapido);
  if(humano(pi))poeRelogio(pi,'jogada',()=>esgotouJogada(pi));
}
/* Relógio da mesa: as regras esperam por ele, nunca pelo setTimeout direto, e leem a hora em RELOGIO.agora(). No solo
   ele usa o timer do navegador, que o turbo transforma em tempo virtual (TB, em data.js); no Node e no servidor, o
   relógio é trocado sem mexer nas regras */
const RELOGIO={agora:()=>Date.now(),depois:(fn,ms)=>setTimeout(fn,ms),cancela:id=>clearTimeout(id)};
const agendar=(fn,ms)=>RELOGIO.depois(fn,ms);
// tempo de uma animação que a regra espera: nada com movimento reduzido nem no turbo (que não espera o tempo real)
const anim=ms=>OPCOES.semAnimacao||S.turbo?0:ms;
/* ---------- deck ops ---------- */
function restoreCard(c){if(c.tm){Object.assign(c,c.tm);delete c.tm}if(c.orig){c.type=c.orig;c.color='w';c.value=null;delete c.orig}if(c.baseColor!=null){c.color=c.baseColor;delete c.baseColor}c.chosen=null;c.lock=false;c.flipped=false;return c}
const returnable=cards=>cards.filter(c=>!c.extra).map(restoreCard);
function popDeck(){
  if(!S.deck.length){
    // a Batata no topo ainda vai sair da pilha (para a mão de alguém): guarda também a carta de baixo, senão a pilha fica vazia
    const keep=S.discard.length>2&&S.discard[S.discard.length-1].type==='batata'?2:1;
    const t=S.discard.splice(-keep);S.deck=shuffle(returnable(S.discard));S.discard=t;
    if(!S.deck.length)return null;
  }
  return S.deck.pop();
}
function give(pi,c){
  const p=S.players[pi];
  emit({t:'somCompra'});
  if(c.type==='bomb'){
    S.deck.splice(Math.floor(rng()*(S.deck.length+1)),0,c);
    S.boom=pi;emit({t:'3d',k:'explode',onde:pi});emit({t:'fx',g:'💣',txt:`${J(pi)} comprou a bomba!`,cor:'#0d0a14',modo:'slam'});emit({t:'selo',p:pi,ic:'💥',cor:'var(--cr)'});
    return;
  }
  p.hand.push(c);
  if(p.hand.length>target()){p.called=false;p.sinoAntes=false}
  emit({t:'compra',p:pi,id:c.id});
}
function drawOne(pi){if(S.weather==='blizzard'&&S.phase!=='deal')return null;if(thornHit(pi))return null;const c=popDeck();if(c)give(pi,c);return c}
// Maldição do espinho: qualquer compra (dado, chuva, desafio, sol, pego sem tocar o sino…) marca o jogador, que não recebe a carta
// e é eliminado no fim do efeito (massCheck/checkLimits/endTurn), sem interromper o efeito no meio
function thornHit(pi){
  const p=S.players[pi];
  if(!curseIs('thorn')||p.out)return false;
  if(!p.thorned){p.thorned=true;emit({t:'voa',de:'monte',para:pi,atraso:0});emit({t:'selo',p:pi,ic:'🌵',cor:'var(--cg)'})}
  return true;
}
function drawN(pi,n){let k=0;for(let i=0;i<n;i++)if(drawOne(pi))k++;return k}
const limit=()=>R.overload?10:Infinity;
const overloaded=pi=>!S.players[pi].out&&(S.players[pi].hand.length>limit()||S.boom===pi||!!S.players[pi].thorned);
function checkLimits(){
  for(const i of alive())if(overloaded(i)&&markOut(i))return;
  if(S.players[S.turn].out)endTurn();else atualiza();
}
function markOut(pi,reason,icon){
  const p=S.players[pi];
  emit({t:'3d',k:'smoke',onde:pi});p.out=true;p.outAt=S.outSeq=(S.outSeq||0)+1;emit({t:'som',k:'out'});
  // torneios: a mão do eliminado vale os pontos das cartas que ele tinha, no mínimo 50
  p.outPts=Math.max(50,[...p.hand,...(p.hand2||[])].reduce((a,c)=>a+cardPoints(c),0));
  if(S.other){const o=S.other.players[pi];S.other.deck.unshift(...returnable([...o.hand,...(o.hand2||[])]));o.hand=[];o.hand2=[]}
  const cards=[...p.hand,...(p.hand2||[])];p.hand=[];p.hand2=[];
  S.deck.unshift(...returnable(cards));shuffle(S.deck);
  const why=reason||(S.boom===pi?'explodiu com a bomba':p.thorned?'comprou com a maldição do espinho':`passou de ${limit()} cartas`);p.thorned=false;
  p.outIcon=icon||(S.boom===pi?'💣':/morte súbita/.test(why)?'☠️':/espinho/.test(why)?'🌵':/batata/.test(why)?'🥔':(R.overload&&limit()<=10?'🏋️':String(limit())));
  if(S.boom===pi)S.boom=null;
  log(`${J(pi)} foi eliminado: ${why}.`);emit({t:'aviso',txt:`${J(pi)} foi eliminado!`,cor:'var(--cr)'});
  emit({t:'eliminado',p:pi,motivo:why,a:pi});
  // sem nenhuma pessoa no jogo, os bots jogam mais rápido (com outras pessoas ainda jogando, o ritmo continua o mesmo)
  if(pessoa(pi)&&!alive().some(pessoa))S.spectate=true;
  const a=alive();
  if(a.length>1)emit({t:'aviso',a:pi,txt:'Você foi eliminado. Assistindo os adversários…',cor:'var(--cr)'});
  if(a.length===1||(R.team&&new Set(a.map(teamOf)).size===1)){endRound(a[0]);return true}
  return false;
}

/* ---------- rules ---------- */
function comboOk(c){
  if(c.type!=='num')return false;
  if(R.stack&&c.value===S.comboValue)return true;
  if(R.sequence&&c.color===S.color){
    const d=c.value-S.comboValue;
    return S.seqDir?d===S.seqDir:Math.abs(d)===1;
  }
  return false;
}
// any: jogada da Confusão, que ignora cor e símbolo (tranca, Final Limpo, Semáforo e compras acumuladas continuam valendo)
function canPlay(p,c,any){
  if(S.phase==='combo')return comboOk(c);
  if(c.type==='bomb'||c.lock)return false;
  if(S.traffic&&p.hand.length===1&&c.type==='num'&&((c.value%2===1)===(S.traffic==='odd')))return false;
  if(R.clean&&p.hand.length===1&&c.type!=='num')return false;
  const t=topCard();
  if(S.pending>0){
    if(R.nou&&c.type==='rev')return true;
    if(comboMode()==='super')return isDraw(c);
    if(comboMode()==='rise')return isDraw(c)&&drawVal(c)>=drawVal({type:S.pendingType});
    if(comboMode()==='normal')return c.type===S.pendingType;
    return false;
  }
  return !!any||matchTop(c)||S.weather==='sun';
}
function matchTop(c){
  const t=topCard();
  // carta cinza (Descolorir): só coringa ou mesmo símbolo; com o Inferno, também ação sobre ação
  if(S.color==='k')return c.color==='w'||c.type===t.type&&(c.type!=='num'||c.value===t.value)||R.hell&&c.type!=='num'&&t.type!=='num';
  if(c.color==='w'||sameCol(c.color,S.color))return true;
  if(R.hell&&c.type!=='num'&&t.type!=='num')return true;
  if(c.type!=='num')return c.type===t.type;
  if(t.type!=='num')return false;
  return R.neighbor?Math.abs(c.value-t.value)===1:c.value===t.value;
}
function canCombo(p,card){
  if(card.type!=='num')return false;
  return p.hand.some(c=>{
    if(c.type!=='num')return false;
    if(R.stack&&c.value===card.value)return true;
    if(R.sequence&&c.color===S.color){const d=c.value-card.value;return S.seqDir?d===S.seqDir:Math.abs(d)===1}
    return false;
  });
}

/* ---------- setup ---------- */
function newGame(){
  const gen=S?S.gen+1:1;
  semear(novaSemente());
  emit({t:'fechaJanelas'});
  const tourMode=R.tournament?'tournament':R.survivor?'survivor':null;
  if(!tourMode)TOUR=null;
  else if(!TOUR||TOUR.mode!==tourMode||TOUR.done)TOUR={mode:tourMode,pts:{},names:null,out:[],round:0};
  // com pessoas de outros aparelhos (sala), as cadeiras são as da sala: no torneio, quem saiu dele continua na cadeira,
  // fora da partida. No solo, os adversários que saíram do torneio deixam a mesa
  const sala=!!(OPCOES.controles&&OPCOES.controles.includes('rede'));
  let names;
  if(TOUR&&TOUR.names)names=sala?TOUR.names:TOUR.names.filter(n=>!TOUR.out.includes(n));
  else{
    names=shuffle([...BOTNAMES]).slice(0,R.bots);
    if(TOUR)TOUR.names=names;
  }
  const ctl=i=>(OPCOES.controles&&OPCOES.controles[i])||(i===0?'tela':'bot');
  // nomes das pessoas (no solo, "Você"); as cadeiras de adversários usam os nomes sorteados
  const nome=(i,n)=>(OPCOES.nomes&&OPCOES.nomes[i])||n;
  const players=[];
  if(sala){
    // os bots ficam com os nomes sorteados na ordem das cadeiras deles, inclusive a 0 (online, ela pode ser de um bot:
    // o dono saiu, trocou de lugar ou os lugares foram sorteados); no torneio, os mesmos em todas as rodadas
    let b=0;
    const outroBot=()=>BOTNAMES.find(n=>!names.includes(n)&&!players.some(p=>p.name===n));
    for(let i=0;i<=R.bots;i++){const bot=ctl(i)==='bot',n=bot?(names[b++]||outroBot()):nome(i,i===0?'Você':'Convidado');
      players.push({name:n,ctrl:ctl(i),hand:[],called:false,col:bot?AVCOL[BOTNAMES.indexOf(n)]:(OPCOES.cores&&OPCOES.cores[i])||(i===0?'var(--accent)':AVCOL[0])})}
  }else{
    players.push({name:nome(0,'Você'),ctrl:ctl(0),hand:[],called:false,col:(OPCOES.cores&&OPCOES.cores[0])||'var(--accent)'});
    names.forEach((n,k)=>players.push({name:ctl(k+1)==='bot'?n:nome(k+1,n),ctrl:ctl(k+1),hand:[],called:false,col:ctl(k+1)!=='bot'&&OPCOES.cores&&OPCOES.cores[k+1]||AVCOL[BOTNAMES.indexOf(n)]}));
  }
  if(TOUR){TOUR.round++;players.forEach(p=>{TOUR.pts[p.name]=TOUR.pts[p.name]||0;if(TOUR.out.includes(p.name)){p.out=true;p.outIcon='🏅';p.foraTorneio=true}})}
  S={gen,tok:0,players,deck:buildDeck(),discard:[],color:null,turn:0,dir:1,pending:0,pendingType:null,
     phase:'play',comboValue:null,seqDir:null,drawnId:null,skip:false,extra:false,busy:false,
     autoResolve:null,semente:RNG.semente};
  nomesCor();emit({t:'cores'});S.added=[];S.removed=[];S.ruleOrder=[];
  S.mem={lacks:{},lastCol:{},played:{}};S.side='a';S.other=null;S.added=S.added||[];S.removed=S.removed||[];
  S.weather=null;S.peace=0;S.boom=null;S.curse=null;S.death=false;S.traffic=null;S.simon=[];S.chal=null;S.timeWin=false;
  emit({t:'novaPartida'});
  if(R.poker){
    const o=ruleOptions(3,true);
    // a faixa de regras fica vazia até o fim do Mix (flyRules)
    S.busy=true;emit({t:'seguraFaixa'});atualiza();
    // as pessoas escolhem uma de cada vez (cada uma já vê as regras de quem escolheu antes), depois os adversários
    const pessoas=S.players.map((p,i)=>i).filter(i=>humano(i)&&!S.players[i].out);
    const adversarios=()=>{S.players.forEach((p,i)=>{if(humano(i)||p.out)return;const b=ruleOptions(4,true).filter(k=>k!=='mess');if(b.length)addRule(i,b[0],true)});listaMix(pessoas)};
    const escolhe=(k,op)=>{
      if(k>=pessoas.length)return adversarios();
      const pi=pessoas[k];op=op||ruleOptions(3,true);
      if(!op.length)return escolhe(k+1);
      pedir(pi,{tipo:'regra',mix:true,bot:()=>({e:op[0],lista:op,ver:'rule'}),
        tela:{opcoes:()=>op,titulo:'Mix de Regras',sub:k===0?'Você escolhe primeiro. Depois cada adversário escolhe a regra dele. As cartas só são distribuídas depois.':'Escolha a sua regra. Ela entra junto com as que já foram escolhidas.'},
        responde:r=>{if(r!=null)addRule(pi,r,true);escolhe(k+1)}});
    };
    if(o.length&&pessoas.length){escolhe(0,o);return}
    adversarios();return;
  }
  dealAndStart();
}
// lista das regras do Mix para todos: a partida começa quando cada pessoa fechar a lista (ou o tempo acabar)
function listaMix(pessoas){
  S.busy=true;S.mixFaltam=[...pessoas];
  emit({t:'mostraMix'});
  if(!pessoas.length)return comecaMix();
  const g=S.gen,ms=tempoDe('mix');
  if(ms)agendar(()=>{if(g===S.gen&&S.mixFaltam&&S.mixFaltam.length){S.mixFaltam=[];comecaMix()}},ms);
}
function fechouMix(pi){S.mixFaltam=S.mixFaltam.filter(i=>i!==pi);if(!S.mixFaltam.length)comecaMix()}
// fim do Mix: os ícones escolhidos voam até a faixa e os das outras regras entram um a um (flyRules); depois, a distribuição
function comecaMix(){
  if(S.mixComecou)return;S.mixComecou=true;
  const n=S.added.length,m=ruleKeys().length-n,cresce=m?m*260+450:0;
  emit({t:'voaMix'});
  agendar(()=>{S.busy=false;dealAndStart()},OPCOES.semAnimacao?0:n?(n-1)*160+700+300+cresce:cresce);
}
function dealAndStart(){
  const players=S.players;
  // Segunda Chance: cada pessoa pode trocar a mão até a primeira ação dela
  S.deck=buildDeck();players.forEach(p=>p.mull=!!R.mulligan&&p.ctrl!=='bot');nomesCor();emit({t:'cores'});
  const startOf=i=>R.mini?4:R.maxi?9:R.start;
  for(let r=0;r<10;r++)for(let i=0;i<players.length;i++)if(r<startOf(i)&&!players[i].out)drawOne(i);
  if(R.twohands)players.forEach((p,i)=>{if(p.out)return;const keep=p.hand;p.hand=[];for(let r=0;r<startOf(i);r++)drawOne(i);p.hand2=p.hand;p.hand=keep});
  let first;
  do{first=S.deck.pop();if(first.color==='w'||SP[first.type]){S.deck.unshift(first);first=null}}while(!first);
  S.discard.push(first);S.color=first.color;if(spOn('bomb')&&!R.noaction)S.deck.splice(Math.floor(rng()*(S.deck.length+1)),0,mk('w','bomb'));emit({t:'histInicio',carta:snap(first)});
  S.turn=Math.floor(rng()*players.length);if(players[S.turn].out)S.turn=nextIdx(S.turn,1);
  log(`Primeira carta: ${cardName(first)}. ${J(S.turn)} ${V(S.turn,'começa','começa')}.`);
  if(spOn('portal'))buildSideB(startOf);
  emit({t:'distribuiu'});
  S.ruleOrder=ruleKeys(); // daqui em diante, cada regra nova vai para o fim da faixa
  startTurn();
}

/* ---------- portal: two sides ---------- */
const SIDE_KEYS=['deck','discard','color','pending','pendingType','chal','comboValue','seqDir','weather','peace','curse','death','traffic','simon','passes','boom','mem','added','removed'];
const PLAYER_KEYS=['hand','hand2','called','luck','webbed','confuse','confuseNext','treasure','batata','escaped'];
function captureSide(){const o={R};SIDE_KEYS.forEach(k=>o[k]=S[k]);o.players=S.players.map(p=>{const q={};PLAYER_KEYS.forEach(k=>q[k]=p[k]);return q});return o}
function applySide(o){R=o.R;SIDE_KEYS.forEach(k=>S[k]=o[k]);S.players.forEach((p,i)=>PLAYER_KEYS.forEach(k=>p[k]=o.players[i][k]))}
function buildSideB(startOf){
  const saved=captureSide();
  R={...saved.R,bg:false};
  S.deck=buildDeck();
  S.players.forEach(p=>{p.hand=[];p.hand2=[];p.called=false;p.sinoAntes=false;p.luck=false;p.webbed=false;p.confuse=false;p.confuseNext=false;p.treasure=0;p.batata=0;p.escaped=false});
  for(let r=0;r<10;r++)S.players.forEach((p,i)=>{if(r<startOf(i)&&!p.out){const c=popDeck();if(c&&c.type==='bomb'){S.deck.unshift(c);const d=popDeck();if(d)p.hand.push(d)}else if(c)p.hand.push(c)}});
  if(R.twohands)S.players.forEach((p,i)=>{if(p.out)return;for(let r=0;r<startOf(i);r++){const c=popDeck();if(c&&c.type!=='bomb')p.hand2.push(c)}});
  let first;S.discard=[];
  do{first=S.deck.pop();if(first.color==='w'||SP[first.type]){S.deck.unshift(first);first=null}}while(!first);
  S.discard.push(first);S.color=first.color;if(spOn('bomb')&&!R.noaction)S.deck.splice(Math.floor(rng()*(S.deck.length+1)),0,mk('w','bomb'));
  Object.assign(S,{pending:0,pendingType:null,chal:null,comboValue:null,seqDir:null,weather:null,peace:0,curse:null,death:false,traffic:null,simon:[],passes:0,boom:null,
    mem:{lacks:{},lastCol:{},played:{}},added:[...(saved.added||[])],removed:[]});
  S.other=captureSide();
  applySide(saved);
}
function switchSide(pi){
  endTurnHook(pi);
  const here=captureSide();applySide(S.other);S.other=here;
  S.side=S.side==='b'?'a':'b';S.crossed=true;
  S.phase='play';S.drawnId=null;S.comboValue=null;S.seqDir=null;
  nomesCor();emit({t:'cores'});
  emit({t:'trocaLado'});
  log(`${J(pi)} abriu o portal: a mesa foi para ${S.side==='b'?'o outro lado':'o lado normal'}.`);
}
function portalSequence(pi){
  const g=S.gen,sp=fastMode()?.35:1;
  S.busy=true;atualiza();
  const finish=()=>{if(g!==S.gen||S.phase==='over')return;S.busy=false;atualiza();endTurn()};
  if(OPCOES.semAnimacao){switchSide(pi);atualiza();finish();return}
  // carga sobre a pilha, cortina abrindo, troca de lado por baixo, cortina fechando sobre a pilha nova
  agendar(()=>{
    if(g!==S.gen)return;
    emit({t:'portal',fase:'carga'});
    agendar(()=>{
      if(g!==S.gen)return;
      emit({t:'portal',fase:'abre',ms:520*sp});
      agendar(()=>{
        if(g!==S.gen)return;
        switchSide(pi);atualiza();
        agendar(()=>{
          if(g!==S.gen)return;
          emit({t:'portal',fase:'fecha',ms:520*sp});
          agendar(()=>{if(g!==S.gen)return;emit({t:'portal',fase:'fim'});emit({t:'aviso',txt:S.side==='b'?'🌀 Outro lado':'🌀 Lado normal',cor:'#8a4fd8'});finish()},anim(520*sp));
        },260*sp);
      },anim(520*sp));
    },900*sp);
  },480*sp);
}
/* ---------- core play ---------- */
// raio + compra (Trovão e Tempestade): a tela mira o raio na cadeira ou, em você, nas cartas compradas
function thunderDraw(pi,n){
  emit({t:'relampago'});emit({t:'som',k:'thunder'});
  const h=S.players[pi].hand,before=h.length;drawN(pi,n);
  emit({t:'raio',p:pi,ids:S.players[pi].hand.slice(before).map(c=>c.id)});
}
function playCard(pi,card,chosen){
  const p=S.players[pi];
  const annc=S.ann===card;if(annc){S.discard=S.discard.filter(c=>c!==card);S.ann=null;emit({t:'redesenhaMesa'})}
  const before=p.hand.length+(p.hand.includes(card)?0:1);if(!annc)emit({t:'som',k:'play'});S.passes=0;
  emit({t:'origem',p:pi,carta:card,anunciada:annc});
  const inCombo=S.phase==='combo';
  if(inCombo&&R.sequence&&card.value!==S.comboValue&&!S.seqDir)S.seqDir=card.value-S.comboValue;
  const black=R.black&&identical(card,topCard());
  const prev=topCard();const colBefore=S.color;S.colBefore=colBefore;
  const sunPen=!S.forcedPlay&&!confused(pi)&&S.weather==='sun'&&(S.phase==='play'||S.phase==='drawn')&&S.pending===0&&!matchTop(card);S.forcedPlay=false;
  const hadColor=p.hand.some(c=>c.id!==card.id&&c.color!=='w'&&sameCol(c.color,colBefore));
  const peaceOn=S.peace>0,wasColorful=colorful({hand:p.hand.includes(card)?p.hand:[...p.hand,card]});
  if(!peaceOn&&(card.type==='clone'||card.type==='random'))morphCard(card,prev);
  const orig=card.orig||card.type;
  if(card.color==='w'&&!chosen&&orig!==card.type)chosen=S.color==='k'?rand(COLORS):S.color;
  if(peaceOn&&card.color==='w')chosen=S.color;
  if(annc&&((card.color==='w'&&chosen)||(orig!==card.type&&!card.flipped)))emit({t:'gira'});
  p.hand=p.hand.filter(c=>c.id!==card.id);
  S.discard.push(card);
  S.color=card.color==='w'?(chosen||S.color):card.color;
  memPlay(pi,card);
  // Mão Colorida: perdeu o ícone ao jogar uma carta colorida, então não tem mais essa cor (o Mestre anota)
  if(R.shiny&&wasColorful&&orig===card.type&&card.color!=='w'&&!colorful(p)&&!(R.bg&&(card.color==='b'||card.color==='g')))memLack(pi,card.color);
  if(black){S.color='k';card.chosen='k';emit({t:'fx',g:`<span class="wheel" style="width:calc(var(--cw)*1.1);background:${CVAR.k}"></span>`,txt:'Descolorida!',cor:CVAR.k,modo:'stamp'});emit({t:'brilho',cor:CVAR.k})}
  emit({t:'jogada',p:pi,carta:card,lado:S.side||'a'});
  let msg=`${J(pi)} jogou ${orig!==card.type?SP[orig].n+' → ':''}${cardName(card)}`;
  if(card.color==='w'&&chosen)msg+=` → ${CNAME[chosen]}`;
  const on=!(S.peace>0);
  if(orig!==card.type&&!annc)emit({t:'selo',p:pi,ic:SP[orig].g,cor:'var(--accent)'});
  if(!on&&card.type!=='num'){msg+=' (sem efeito: Paz)';emit({t:'fx',g:'🌼',txt:card.color==='w'?`Sem efeito: Paz. A cor continua ${CNAME[S.color]||'a mesma'}`:'Sem efeito: Paz',cor:'var(--cg)',modo:'stamp',mudo:true})}
  if(on&&card.type==='skip'){S.skip=true;const v=nextIdx(pi,1);emit({t:'fx',g:'⊘',txt:V(v,'Você perdeu a vez',`${J(v)} perdeu a vez`),cor:'var(--cr)',modo:'stamp'});emit({t:'selo',p:v,ic:'⊘',cor:'var(--cr)'})}
  if(on&&card.type==='rev'){
    S.dir*=-1;emit({t:'sentido'});
    if(S.pending>0){emit({t:'fx',g:ARROWS,txt:`Contra-ataque! +${S.pending} volta`,cor:'var(--accent)',modo:S.dir===1?'cw':'ccw'});msg+=' e devolveu a compra'}
    else{emit({t:'fx',g:ARROWS,txt:'Sentido invertido',cor:S.dir===1?'var(--accent)':'var(--accent)',modo:S.dir===1?'cw':'ccw'});if(alive().length===2)S.skip=true}
  }
  if(on&&isDraw(card)){
    S.pending+=drawVal(card);S.pendingType=card.type;
    S.chal=(card.type!=='d2'&&!R.nochallenge)?{by:pi,bluff:hadColor,amt:drawVal(card),col:colBefore}:null;
    if(S.pending>drawVal(card))msg+=` (acumulado +${S.pending})`;
    emit({t:'som',k:'plus'});emit({t:'pausa',ms:600});
  }
  if(card.color==='w'&&chosen&&peaceOn){card.chosen=chosen}
  else if(card.color==='w'&&chosen){card.chosen=chosen;emit({t:'brilho',cor:CVAR[chosen]});emit({t:'3d',k:'sparks',onde:'mesa',args:[CVAR[chosen]]});if(!isDraw(card))emit({t:'fx',g:`<span class="wheel" style="width:calc(var(--cw)*1.1);background:${CVAR[chosen]}"></span>`,txt:CNAME[chosen],cor:CVAR[chosen],modo:'stamp'})}
  log(msg+'.');
  if(sunPen){const k=drawN(pi,curseIs('anvil')?2:1);log(`${J(pi)} jogou fora da cor com sol e comprou ${k}.`)}
  if(p.hand.length===0&&!nextHand(pi)){endRound(pi);return 'win'}
  if(p.hand.length===target())afterOneCard(pi);
  if(card.type==='num'&&R.perfection&&card.value===before){S.extra=true;log(`Perfeição! ${J(pi)} joga de novo.`);emit({t:'fx',g:'★',txt:'Joga de novo',cor:'var(--cg)',modo:'stamp'})}
  if(S.weather==='storm'&&colBefore&&S.color!==colBefore&&!sameCol(S.color,colBefore)){
    // Tempestade: mudou a cor, um adversário aleatório compra 1 (mesmo raio do Trovão)
    const o=alive().filter(i=>i!==pi);
    if(o.length&&congelado()){avisoCongelado();log('Tempestade: o monte está congelado, ninguém comprou.')}
    else if(o.length){const v=rand(o);thunderDraw(v,1);
      log(`Tempestade: ${J(pi)} mudou a cor e ${J(v)} ${V(v,'compra','comprou')} 1.`);if(massCheck()==='win')return 'win'}
  }
  if(curseIs('shoe')&&orig!=='num'&&card.type!=='num'){drawN(pi,1);log(`${J(pi)} comprou 1 (maldição da bota).`);if(massCheck()==='win')return 'win'}
  if(card.type==='chest'){
    // Tesouro: descarta todas as cartas que sobraram, uma de cada vez, e só então vence
    emit({t:'fx',g:'💰',txt:`${J(pi)} abriu o tesouro!`,cor:'var(--cy)',modo:'slam'});
    const rest=[...p.hand];if(!rest.length){endRound(pi);return 'win'}
    rest.forEach((c,k)=>discardCard(pi,c,k));log(`${J(pi)} descartou ${rest.length} carta${rest.length===1?'':'s'} com o tesouro.`);
    const g=S.gen;S.busy=true;atualiza();
    agendar(()=>{if(g!==S.gen||S.phase==='over')return;S.busy=false;endRound(pi)},(fastMode()?300:700)+rest.length*70);
    return 'win'}
  if(on&&SP[card.type]){const r=applySpecial(pi,card);if(r!=='done')return r}
  if(canCombo(p,card)&&(R.stack||R.sequence)){
    S.phase='combo';S.comboValue=card.value;S.drawnId=null;
    if(!inCombo)S.seqDir=null;
    return 'combo';
  }
  return 'done';
}
function afterOneCard(pi){
  const p=S.players[pi];
  if(S.weather==='fog')return;
  // quem tocou o sino antes de jogar: os outros só ouvem agora, com a carta já na mesa (como com os bots)
  if(p.sinoAntes){p.sinoAntes=false;p.called=true;anunciaSino(pi,true);return}
  if(deBot(pi)&&!p.called){p.called=rng()<(S.death?Math.max(.96,DIFF[R.diff].call):DIFF[R.diff].call);if(p.called)anunciaSino(pi)}
  if(!p.called)scheduleCatch(pi);
}
// o som e o aviso do sino; quem tocou com as próprias mãos (pessoa) já ouviu na hora, pela prévia da tela
function anunciaSino(pi,pessoa){
  const so=pessoa?{exceto:pi}:{};
  emit({t:'som',k:'bell',p:pi,...so});log(`${J(pi)} tocou o sino.`);emit({t:'aviso',txt:`🛎️ ${J(pi)} tocou o sino!`,cor:'var(--cr)',p:pi,...so});
}
// tocar o sino antes de jogar a carta que deixa no alvo: só na vez, sem nada em andamento, com alguma carta jogável
function sinoAntesOk(pi){
  const p=S.players[pi];
  return S.phase!=='over'&&S.turn===pi&&!S.busy&&!S.auto&&S.discard.length>0&&p.hand.length===target()+1&&p.hand.some(c=>canPlay(p,c));
}
function scheduleCatch(pi){
  const g=S.gen,d=DIFF[R.diff],p=S.players[pi];
  agendar(()=>{
    if(!S||g!==S.gen||S.phase==='over')return;
    const pi=S.players.indexOf(p); // pela pessoa, não pela cadeira (a Dança das Cadeiras muda os números)
    if(S.weather==='fog'||p.out||p.hand.length!==target()||p.called)return;
    const catchers=alive().filter(i=>i!==pi&&deBot(i)&&i!==partner(pi));
    if(catchers.length&&rng()<d.catchP)penalize(pi,rand(catchers));
  },d.catchMs+rng()*500);
}
function penalize(pi,by){
  const p=S.players[pi];
  if(S.weather==='fog'||p.out)return;
  emit({t:'som',k:'caught'});p.called=false;
  if(S.death){
    log(`${J(by)} pegou ${V(pi,'você',J(pi))} sem tocar o sino na morte súbita: eliminado!`);
    emit({t:'fx',g:'🚨',txt:`${V(pi,'Você foi pego',J(pi)+' foi pego')} sem tocar o sino!`,cor:'var(--cr)',modo:'slam'});emit({t:'selo',p:pi,ic:'🚨',cor:'var(--cr)'});
    if(markOut(pi,'foi pego sem tocar o sino na morte súbita'))return;
    if(pi===S.turn){endTurn();return}
    atualiza();return;
  }
  const n=S.weather==='blizzard'?0:drawAmt(pi,2);
  if(n)drawN(pi,n);
  log(`${J(by)} pegou ${V(pi,'você',J(pi))} sem tocar o sino${n?`: +${n}`:' (nevasca: ninguém compra)'}.`);
  emit({t:'aviso',txt:`${V(pi,'Você foi pego',J(pi)+' foi pego')} sem tocar o sino!${n?` +${n}`:''}`,cor:'var(--cy)'});
  if(overloaded(pi)){if(markOut(pi))return;if(pi===S.turn){endTurn();return}}
  atualiza();
}
function endTurnHook(pi){
  const fp=S.players[pi];
  if(!fp.out){
    fp.hand.forEach(c=>c.lock=false);
    const wasNext=fp.confuseNext;fp.confuse=false;if(wasNext){fp.confuse=true;fp.confuseNext=false}
    const bt=fp.hand.find(c=>c.type==='batata');
    if(bt){
      if(fp.batata>=5){
        fp.hand=fp.hand.filter(c=>c!==bt);fp.batata=0;
        emit({t:'fx',g:'🥔',txt:`${J(pi)} ficou com a batata por 5 turnos!`,cor:'var(--cr)',modo:'slam'});emit({t:'selo',p:pi,ic:'🥔',cor:'var(--cr)'});
        if(markOut(pi,'ficou 5 turnos com a batata','🥔'))return true;
        const t=rand(alive());if(bt.baseColor==null)bt.baseColor=bt.color;bt.color=rand(COLORS);S.players[t].hand.push(bt);S.players[t].batata=0;
        emit({t:'recebe',p:t,ids:[bt.id],de:pi,origem:false});
        emit({t:'pausa',ms:1200});
      }
    }else fp.batata=0;
  }
  if(S.curse){S.curse.left--;if(S.curse.left<=0){S.curse=null;emit({t:'aviso',txt:'A maldição acabou!',cor:'var(--cg)'})}}
  if(S.peace>0)S.peace--;
  return false;
}
function endTurn(){
  if(S.phase==='over')return;
  S.players.forEach(q=>q.sinoAntes=false);
  tiraRelogio(S.turn);
  emit({t:'fimJogada'});
  S.auto=false;
  const crossed=S.crossed;S.crossed=false;
  for(const i of alive())if(S.players[i].thorned&&markOut(i))return;
  if(!crossed&&endTurnHook(S.turn))return;
  S.phase='play';S.drawnId=null;S.comboValue=null;S.seqDir=null;S.busy=false;
  let steps=S.extra?0:1;steps+=S.skip===true?1:(S.skip||0);
  S.extra=false;S.skip=false;
  S.turn=S.players[S.turn].out&&steps===0?nextIdx(S.turn,1):nextIdx(S.turn,steps);
  if(S.pending>0&&comboMode()==='none'&&!R.nou){
    const v=S.turn;S.chal=null;
    if(noDraw(v)||curseIs('ice')||S.weather==='blizzard'){S.pending=0;S.pendingType=null;if(noDraw(v)){if(markOut(v,S.death?'precisou comprar na morte súbita':'comprou com a maldição do espinho',S.death?'☠️':'🌵'))return}S.turn=nextIdx(v,1);startTurn();return}
    if(S.pending>=99){S.pending=0;S.pendingType=null;S.turn=v;drawn99(v,()=>{S.turn=nextIdx(v,1);startTurn()});return}
    const n=drawAmt(v,S.pending);drawN(v,n);emit({t:'selo',p:v,ic:'⊘',cor:'var(--cr)'});emit({t:'pausa',ms:900});
    log(`${J(v)} ${V(v,'compra','comprou')} ${n} e perde a vez.`);
    S.pending=0;S.pendingType=null;
    if(overloaded(v)&&markOut(v))return;
    S.turn=nextIdx(v,1);
  }
  startTurn();
}
function startTurn(){
  S.tok++;S.vezes=(S.vezes||0)+1; // quantas vezes começaram nesta partida (o turbo e os testes contam por aqui)
  const cp=cur();
  // Batata: o contador mostra a vez atual com ela (1/5 na primeira, 5/5 na última)
  if(!cp.out&&cp.hand.some(c=>c.type==='batata'))cp.batata=(cp.batata||0)+1;
  if(cp.webbed){
    cp.webbed=false;const g=S.gen,tok=S.tok;
    emit({t:'selo',p:S.turn,ic:'🕸️',cor:'var(--muted)'});emit({t:'fx',g:'🕸️',txt:V(S.turn,'Você está preso na teia',`${J(S.turn)} está preso na teia`),cor:'var(--muted)',modo:'stamp'});
    log(`${J(S.turn)} perdeu a vez (teia).`);atualiza();
    agendar(()=>{if(g===S.gen&&tok===S.tok&&S.phase!=='over')endTurn()},1100);
    return;
  }
  if(cp.ctrlReal&&!cp.caiu&&(cp.esgotou||0)<3)devolve(S.turn);
  atualiza();
  // a pessoa confusa joga ao acaso (a mesa joga por ela); o adversário confuso joga ao acaso no botAct
  if(humano(S.turn)&&confused(S.turn))autoHuman(S.turn);
  else pedirJogada(S.turn);
  scheduleJumps();
}
function takeDraw(pi){
  const p=S.players[pi];
  p.mull=false;
  // Morte súbita: quem precisa comprar é eliminado, mesmo com o monte congelado (não dá para só passar a vez)
  if(S.death&&(S.weather==='blizzard'||curseIs('ice'))){
    S.pending=0;S.pendingType=null;S.chal=null;
    emit({t:'fx',g:'☠️',txt:`${J(pi)} não podia passar!`,cor:'#0d0a14',modo:'slam'});log(`${J(pi)} passou a vez na morte súbita e foi eliminado.`);
    if(markOut(pi,'passou a vez na morte súbita','☠️'))return;endTurn();return;
  }
  if(S.pending>0&&(S.weather==='blizzard'||curseIs('ice'))){
    const n=S.pending;S.pending=0;S.pendingType=null;S.chal=null;
    emit({t:'fx',g:S.weather==='blizzard'?'❄️':'🧊',txt:`${V(pi,'Você perde',J(pi)+' perde')} a vez (+${n} congelado)`,cor:'#5aa9d6',modo:'stamp',mudo:true});emit({t:'som',k:'gelo'});emit({t:'selo',p:pi,ic:'⊘',cor:'var(--cr)'});
    log(`${J(pi)} perdeu a vez sem comprar (+${n} congelado).`);endTurn();return;
  }
  if(S.weather==='blizzard'){
    if(S.color&&S.pending===0)memLack(pi,S.color);
    S.pending=0;S.pendingType=null;S.chal=null;
    S.passes=(S.passes||0)+1;
    log(`${J(pi)} passou sem comprar (nevasca).`);
    if(S.passes>=alive().length){
      S.weather=null;S.passes=0;
      emit({t:'fx',g:'🌤️',txt:'A nevasca acabou: todos passaram a vez',cor:'#5aa9d6',modo:'slam'});emit({t:'som',k:'sun'});
      log('Todos passaram a vez: a nevasca acabou.');
    }else{emit({t:'fx',g:'❄️',txt:`${V(pi,'Você passa',J(pi)+' passa')} (${S.passes}/${alive().length})`,cor:'#5aa9d6',modo:'stamp',mudo:true});emit({t:'som',k:'gelo'})}
    endTurn();return;
  }
  if(noDraw(pi)){
    S.pending=0;S.pendingType=null;S.chal=null;
    emit({t:'fx',g:'☠️',txt:`${J(pi)} não podia comprar!`,cor:'#0d0a14',modo:'slam'});log(`${J(pi)} precisou comprar e foi eliminado.`);
    if(markOut(pi,S.death?'precisou comprar na morte súbita':'comprou com a maldição do espinho',S.death?'☠️':'🌵'))return;endTurn();return;
  }
  if(curseIs('ice')){
    S.pending=0;S.pendingType=null;S.chal=null;
    emit({t:'fx',g:'🧊',txt:`${J(pi)} não pode comprar e passa`,cor:'var(--cb)',modo:'stamp',mudo:true});emit({t:'som',k:'gelo'});log(`${J(pi)} passou (gelo).`);endTurn();return;
  }
  if(S.pending>0){
    if(S.pending>=99){S.pending=0;S.pendingType=null;S.chal=null;drawn99(pi,endTurn);return}
    const n=drawAmt(pi,S.pending);S.pending=0;S.pendingType=null;S.chal=null;drawN(pi,n);emit({t:'pausa',ms:700});
    log(`${J(pi)} comprou ${n}.`);
    if(overloaded(pi)&&markOut(pi))return;
    endTurn();return;
  }
  if(R.tracking){
    if(S.color&&S.pending===0)memLack(pi,S.color);
    const opts=[];
    if(p.luck){
      p.luck=false;const idx=[];for(let i=S.deck.length-1;i>=0&&idx.length<3;i--){const c=S.deck[i];if(c.type!=='bomb'&&canPlay(p,c))idx.push(i)}
      idx.sort((a,b)=>b-a).forEach(i=>opts.push(S.deck.splice(i,1)[0]));if(opts.length)emit({t:'fx',g:'🍀',txt:'Sorte: só cartas jogáveis',cor:'var(--cg)',modo:'stamp'});
    }
    if(!opts.length)for(let i=0;i<3;i++){const c=popDeck();if(c)opts.push(c)}
    if(!opts.length){endTurn();return}
    const wasCalled=p.called;
    // com a Bigorna, também vai para a mão uma das opções que sobraram (ao acaso)
    const finish=pick=>{
      const rest=opts.filter(c=>c!==pick),extra=curseIs('anvil')&&rest.length?rand(rest):null;
      rest.filter(c=>c!==extra).forEach(c=>S.deck.unshift(c));
      emit({t:'rastreando',p:null});
      give(pi,pick);if(extra)give(pi,extra);afterDraw(pi,pick,extra?2:1,wasCalled);
    };
    // enquanto alguém escolhe, a carta de cima do monte fica puxada para fora
    emit({t:'rastreando',p:pi});
    pedir(pi,{tipo:'carta',ja:true,quantas:opts.length,responde:finish,tela:{opcoes:()=>opts,titulo:'Rastrear',sub:'Escolha qual carta comprar.'},
      bot:()=>{const safe=opts.filter(c=>c.type!=='bomb');const good=safe.filter(c=>canPlay(p,c));
        return {e:good.length?(R.diff==='easy'?rand(good):botChoose(p,good)):rand(safe.length?safe:opts),lista:opts,ver:'down'}}});
    return;
  }
  if(S.color&&S.pending===0)memLack(pi,S.color);
  let drawn,count=0;
  if(p.luck){
    p.luck=false;
    const idx=S.deck.map((c,i)=>i).reverse().find(i=>S.deck[i].type!=='bomb'&&canPlay(p,S.deck[i]));
    if(idx!=null){const [c]=S.deck.splice(idx,1);S.deck.push(c);emit({t:'fx',g:'🍀',txt:'Sorte!',cor:'var(--cg)',modo:'stamp'})}
  }
  const wasCalled=p.called;
  drawn=drawOne(pi);if(drawn)count=1;
  if(curseIs('anvil')&&drawOne(pi))count++;
  afterDraw(pi,drawn,count,wasCalled);
}
// +99: quem precisa comprar as cartas dele é eliminado na hora, depois de uma enxurrada de cartas voando do monte até ele.
// As cartas não são compradas de verdade. Só escapa quem não compraria por causa da Nevasca ou do Gelo
function drawn99(pi,then){
  const g=S.gen,sp=fastMode()?.4:1,N=OPCOES.semAnimacao?0:22,step=50*sp;S.busy=true;atualiza();
  for(let k=0;k<N;k++)agendar(()=>{if(g!==S.gen)return;emit({t:'voa',de:'monte',para:pi,atraso:0});if(k%3===0)emit({t:'som',k:'draw'})},k*step);
  log(`${J(pi)} ${V(pi,'precisa','precisou')} comprar as cartas do +99.`);
  agendar(()=>{
    if(g!==S.gen||S.phase==='over')return;S.busy=false;
    emit({t:'fx',g:'+99',txt:`${V(pi,'Você não aguentou',J(pi)+' não aguentou')} o +99!`,cor:'var(--cr)',modo:'slam'});emit({t:'selo',p:pi,ic:'+99',cor:'var(--cr)'});
    if(markOut(pi,'comprou as cartas do +99','+99'))return;
    then();
  },N*step+450);
}
// wasCalled: se o jogador já tinha tocado o sino antes de comprar (a Compra Rápida mantém o pedido)
function afterDraw(pi,drawn,count,wasCalled){
  const p=S.players[pi];
  log(`${J(pi)} comprou ${count} carta${count===1?'':'s'}.`);
  if(overloaded(pi)){if(markOut(pi))return;endTurn();return}
  const fast=R.fastdraw&&drawn&&drawn.type!=='bomb'&&p.hand.includes(drawn);
  if(!fast&&(!drawn||R.insatisfaction)){endTurn();return}
  if(!fast&&R.satisfaction&&!p.hand.some(c=>canPlay(p,c))&&S.deck.length+S.discard.length>1){
    S.phase='play';S.drawnId=drawn.id;S.tok++;atualiza();pedirJogada(pi,true);return;
  }
  S.phase='drawn';S.drawnId=drawn.id;
  if(fast){
    S.forcedPlay=true;emit({t:'aviso',txt:'Compra Rápida!'});
    // quem já tinha tocado o sino e volta a ter a mesma quantidade depois de jogar a carta comprada não precisa pedir de novo
    if(wasCalled&&p.hand.length-1<=target())p.called=true;
    emit({t:'jogaDoMonte',p:pi,id:drawn.id});
    jogar(pi,drawn);return}
  // a pessoa que comprou e não tem o que jogar passa sozinha
  if(humano(pi)&&!p.hand.some(c=>canPlay(p,c))){
    S.busy=true;S.tok++;atualiza();const g=S.gen;
    agendar(()=>{if(g!==S.gen||S.phase!=='drawn'||S.turn!==pi)return;S.busy=false;endTurn()},700);return;
  }
  S.tok++;atualiza();
  pedirJogada(pi);
}
function endRound(pi){
  S.phase='over';emit({t:'fechaJanelas'});
  let pts=0;const winners=pi<0?[]:R.team?[pi,partner(pi)]:[pi];
  if(pi>=0){
    pts=S.players.reduce((s,p)=>s+p.hand.reduce((a,c)=>a+cardPoints(c),0),0);
  }
  let tourMsg='';
  if(TOUR){
    const handPts=p=>p.out?(p.outPts||50):[...p.hand,...(p.hand2||[])].reduce((a,c)=>a+cardPoints(c),0);
    // participantes: todos os que já jogaram (na ordem em que entraram); quem saiu da Sobrevivência não soma mais pontos
    const jogam=S.players.filter(p=>!p.foraTorneio),pessoas=S.players.filter((p,i)=>pessoa(i)).map(p=>p.name);
    if(TOUR.mode==='tournament'){
      if(pi>=0){pts=jogam.reduce((s,p)=>s+handPts(p),0);winners.forEach(i=>TOUR.pts[S.players[i].name]+=pts)}
      const champ=Object.entries(TOUR.pts).find(([n,v])=>v>=500);
      if(champ){TOUR.done=true;tourMsg=VN(champ[0],'Você venceu o torneio!',`${champ[0]} venceu o torneio.`)}
    }else{
      S.players.forEach((p,i)=>{if(!winners.includes(i)&&!p.foraTorneio)TOUR.pts[p.name]+=handPts(p)});
      const antes=[...TOUR.out];
      Object.entries(TOUR.pts).forEach(([n,v])=>{if(v>=300&&!TOUR.out.includes(n))TOUR.out.push(n)});
      const left=Object.keys(TOUR.pts).filter(n=>!TOUR.out.includes(n));
      // acaba quando todas as pessoas saíram (no solo, você) ou quando sobra um só
      if(pessoas.length&&pessoas.every(n=>TOUR.out.includes(n))){TOUR.done=true;tourMsg=pessoas.length===1?VN(pessoas[0],'Você foi eliminado do torneio.',`${pessoas[0]} saiu do torneio.`):'Todas as pessoas saíram do torneio.'}
      else if(left.length<=1){TOUR.done=true;tourMsg=VN(left[0],'Você sobreviveu e venceu o torneio!',`${left[0]} venceu o torneio.`)}
      // com várias pessoas, quem saiu agora fica sabendo (e assiste às próximas partidas na cadeira)
      else tourMsg=pessoas.filter(n=>TOUR.out.includes(n)&&!antes.includes(n)).map(n=>VN(n,'Você saiu do torneio e assiste às próximas partidas.',`${n} saiu do torneio.`)).join(' ');
    }
  }
  atualiza();
  agendar(()=>emit({t:'fim',pi,vencedores:winners,pts,tourMsg}),900);
}

const ASK_TYPES=['trade','gift','web','wish','ban','theft','batata','rule','simon'];
function announce(pi,card,cont,wait){
  const p=S.players[pi];emit({t:'origem',p:pi,carta:card});
  p.hand=p.hand.filter(c=>c.id!==card.id);
  S.discard.push(card);S.ann=card;
  if(deBot(pi)&&p.hand.length===target())afterOneCard(pi);
  S.busy=true;emit({t:'anuncio',txt:''});emit({t:'som',k:'play'});
  atualiza();
  const g=S.gen;
  const done=()=>{if(g!==S.gen||S.phase==='over')return;S.busy=false;emit({t:'anuncioFim'});cont()};
  agendar(()=>{
    if(g!==S.gen||S.phase==='over')return;
    if(S.peace<=0&&(card.type==='clone'||card.type==='random')){
      const og=SP[card.type].g;
      morphCard(card,S.discard[S.discard.length-2]);emit({t:'redesenhaMesa'});emit({t:'gira'});card.flipped=true;
      emit({t:'fx',g:og,txt:`Virou ${card.color==='w'?label(card):cardName(card)}`,cor:CVAR[card.color]||'var(--accent)',modo:'stamp'});
      atualiza();agendar(done,fastMode()?400:950);
    }else done();
  },wait||(fastMode()?400:950));
}
/* ---------- ações de uma pessoa ----------
   Tudo o que uma pessoa faz chega aqui, seja deste aparelho ou de outro: jogar uma carta (na vez ou cortando),
   comprar/passar (botão principal), tocar o sino, pegar quem esqueceu, desafiar o +4 e trocar a mão no início.
   A mesa confere se a ação vale antes de fazer qualquer coisa e devolve se ela foi aceita */
function agir(pi,a){
  if(!S||S.phase==='over'||!a||!S.players[pi])return false;
  // a pessoa que o computador estava substituindo (fora de uma queda) volta ao agir
  if(S.players[pi].ctrlReal&&!S.players[pi].caiu&&a.t!=='fecharMix'){devolve(pi);if(S.turn===pi&&!S.busy){S.tok++;pedirJogada(pi)}}
  if(!humano(pi))return false;
  const ok=agirValida(pi,a);
  if(ok){S.players[pi].esgotou=0;if(['jogar','principal','desafiar'].includes(a.t)&&S.turn!==pi)tiraRelogio(pi)}
  return ok;
}
function agirValida(pi,a){
  // sem carta na mesa (no Mix, enquanto as pessoas escolhem as regras), ainda não é a vez de ninguém
  const p=S.players[pi],naVez=S.turn===pi&&!S.busy&&!S.auto&&!p.out&&S.discard.length>0;
  switch(a.t){
    case 'jogar':{
      const c=p.hand.find(x=>x.id===a.id);if(!c)return false;
      if(!naVez){if(!canJump(pi,c))return false;doJumpIn(pi,c);return true}
      if(!canPlay(p,c))return false;
      jogar(pi,c);return true}
    case 'principal':
      if(!naVez)return false;
      if(S.phase==='combo'||S.phase==='drawn'){endTurn();return true}
      takeDraw(pi);return true;
    case 'sineta':
      if(p.called||p.sinoAntes||p.out||S.weather==='fog')return false;
      // já no alvo (tocou atrasado): os outros ouvem na hora
      if(p.hand.length===target()){p.called=true;anunciaSino(pi,true);atualiza();return true}
      // antes de jogar: fica guardado em segredo até a carta sair (afterOneCard); sem jogar, o toque se perde (endTurn)
      if(!sinoAntesOk(pi))return false;
      p.sinoAntes=true;atualiza();return true;
    case 'pegar':{
      const q=S.players[a.alvo];if(!q||a.alvo===pi||p.out||q.hand.length!==target()||q.called)return false;
      penalize(a.alvo,pi);return true}
    case 'desafiar':
      if(!naVez||!S.chal)return false;
      doChallenge(pi);return true;
    case 'fecharMix':if(!S.mixFaltam||!S.mixFaltam.includes(pi))return false;fechouMix(pi);return true;
    case 'trocarMao':{
      if(!p.mull||p.out)return false;
      const n=p.hand.length;
      S.deck.unshift(...p.hand);shuffle(S.deck);p.hand=[];
      drawN(pi,n);p.mull=false;log(V(pi,'Você trocou sua mão.',`${J(pi)} trocou de mão.`));emit({t:'aviso',txt:'Mão nova!',a:pi});
      if(overloaded(pi)&&markOut(pi))return true;atualiza();return true}
  }
  return false;
}
/* ---------- jogar uma carta (pessoa ou adversário) ----------
   Cartas de ação pousam na mesa antes do efeito (announce). A pessoa vê o anúncio curto e escolhe a cor depois; o
   adversário anuncia com mais calma as cartas em que vai pensar (cor, alvo). A última carta da pessoa vence direto,
   sem escolher cor; na Paz o curinga não muda a cor */
function jogar(pi,card){
  const p=S.players[pi],h=humano(pi);
  const ultima=h&&p.hand.length===1&&!(p.hand2&&p.hand2.length);
  p.mull=false;
  const vira=card.type==='clone'||card.type==='random';
  // espera do anúncio: undefined é a padrão, null é sem anúncio
  let espera;
  if(h)espera=card.type==='num'?null:vira&&!ultima&&!(S.peace>0)?undefined:480;
  else espera=vira||isWildPick(card)||ASK_TYPES.includes(card.type)?undefined:card.type!=='num'?(fastMode()?250:480):null;
  const depois=()=>{
    if(isWildPick(card)&&S.peace<=0&&!ultima){pedir(pi,{tipo:'cor',carta:card,responde:col=>termina(pi,card,col)});return}
    if(h&&card.type!=='num')S.preLanded=card;
    termina(pi,card,null);
  };
  if(espera===null)depois();else announce(pi,card,depois,espera);
}
function termina(pi,card,col){
  S.busy=false;
  const r=playCard(pi,card,col);
  if(r==='win'||r==='defer')return;
  if(r==='combo'){S.tok++;atualiza();pedirJogada(S.turn);return} // S.turn: a Dança das Cadeiras pode ter mudado o número da cadeira
  endTurn();
}
