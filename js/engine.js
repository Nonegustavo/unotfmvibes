/* unotfm solo: motor da partida (baralho, regras de jogada, distribuição, portal, jogada de carta e fluxo de turnos) */
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
  if(Date.now()-lastDrawSnd>70){lastDrawSnd=Date.now();sfx('draw')}
  if(c.type==='bomb'){
    S.deck.splice(Math.floor(rng()*(S.deck.length+1)),0,c);
    S.boom=pi;FX3D.explode(targetRect(pi));fx('💣',`${who(pi)} comprou a bomba!`,'#0d0a14','slam');stampOn(pi,'💥','var(--cr)');
    return;
  }
  p.hand.push(c);
  if(p.hand.length>target())p.called=false;
  if(pi===0)S.newIds.push(c.id);else S.botDraw[pi]=(S.botDraw[pi]||0)+1;
}
function drawOne(pi){if(S.weather==='blizzard'&&S.phase!=='deal')return null;if(thornHit(pi))return null;const c=popDeck();if(c)give(pi,c);return c}
// Maldição do espinho: qualquer compra (dado, chuva, desafio, sol, pego sem tocar a sineta…) marca o jogador, que não recebe a carta
// e é eliminado no fim do efeito (massCheck/checkLimits/endTurn), sem interromper o efeito no meio
function thornHit(pi){
  const p=S.players[pi];
  if(!curseOn('thorn',pi)||immune(pi)||p.out)return false;
  if(!p.thorned){p.thorned=true;ghost($('deck').getBoundingClientRect(),targetRect(pi),0);stampOn(pi,'🌵','var(--cg)')}
  return true;
}
function drawN(pi,n){let k=0;for(let i=0;i<n;i++)if(drawOne(pi))k++;return k}
const limit=()=>Math.min(R.overload?10:Infinity,R.limbo?S.limit:Infinity);
const overloaded=pi=>!S.players[pi].out&&(S.players[pi].hand.length>limit()||S.boom===pi||!!S.players[pi].thorned);
function checkLimits(){
  for(const i of alive())if(overloaded(i)&&markOut(i))return;
  if(S.players[S.turn].out)endTurn();else render();
}
function markOut(pi,reason,icon){
  const p=S.players[pi];
  if(immune(pi)){if(S.boom===pi)S.boom=null;toast('Charlotte não pode ser eliminada!','var(--cg)');return false}
  FX3D.smoke(targetRect(pi));p.out=true;p.outAt=S.outSeq=(S.outSeq||0)+1;sfx('out');
  // torneios: a mão do eliminado vale os pontos das cartas que ele tinha, no mínimo 50
  p.outPts=Math.max(50,[...p.hand,...(p.hand2||[])].reduce((a,c)=>a+cardPoints(c),0));
  if(S.other){const o=S.other.players[pi];S.other.deck.unshift(...returnable([...o.hand,...(o.hand2||[])]));o.hand=[];o.hand2=[]}
  const cards=[...p.hand,...(p.hand2||[])];p.hand=[];p.hand2=[];
  if(ab(pi,'snowy')&&alive().length){
    cards.forEach((c,k)=>{const t=rand(alive());S.players[t].hand.push(c);S.players[t].called=false;if(t===0)S.newIds.push(c.id);else if(k<8)ghost(targetRect(pi),targetRect(t),k*60)});
    S.handFrom=targetRect(pi);log('Snowy distribuiu as cartas dele para os outros.');
  }else{S.deck.unshift(...returnable(cards));shuffle(S.deck)}
  const why=reason||(S.boom===pi?'explodiu com a bomba':p.thorned?'comprou com a maldição do espinho':`passou de ${limit()} cartas`);p.thorned=false;
  p.outIcon=icon||(S.boom===pi?'💣':/morte súbita/.test(why)?'☠️':/espinho/.test(why)?'🌵':/batata/.test(why)?'🥔':(R.overload&&limit()<=10?'🏋️':String(limit())));
  if(S.boom===pi)S.boom=null;
  log(`${who(pi)} foi eliminado: ${why}.`);toast(`${who(pi)} foi eliminado!`,'var(--cr)');
  if(pi===0){S.outWhy=why;S.spectate=true}
  const a=alive();
  if(pi===0&&a.length>1){toast('Você foi eliminado. Assistindo os adversários…','var(--cr)')}
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
  if(S.numOnly===1&&c.type!=='num')return false;
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
  $('home').hidden=true;
  const gen=S?S.gen+1:1;
  semear(novaSemente());
  clearFlash();closeOverlays();
  const tourMode=R.tournament?'tournament':R.survivor?'survivor':null;
  if(!tourMode)TOUR=null;
  else if(!TOUR||TOUR.mode!==tourMode||TOUR.done)TOUR={mode:tourMode,pts:{},names:null,out:[],round:0};
  let names;
  if(TOUR&&TOUR.names)names=TOUR.names.filter(n=>!TOUR.out.includes(n));
  else{
    const forced=BOTRULES.filter(k=>R[k]).map(k=>k[0].toUpperCase()+k.slice(1));
    if(['red','blue','yellow','green'].some(k=>R[k])&&!forced.includes('Charlotte'))forced.push('Charlotte');
    const rest=shuffle(BOTNAMES.filter(n=>!forced.includes(n)));
    names=[...shuffle(forced),...rest].slice(0,R.bots);
    if(TOUR)TOUR.names=names;
  }
  if(TOUR){TOUR.round++;['Você',...names].forEach(n=>TOUR.pts[n]=TOUR.pts[n]||0)}
  if(addT){clearInterval(addT);addT=null}
  const players=[{name:'Você',bot:false,hand:[],called:false,col:'var(--accent)'}];
  names.forEach(n=>players.push({name:n,bot:true,hand:[],called:false,col:AVCOL[BOTNAMES.indexOf(n)]}));
  S={gen,tok:0,players,deck:buildDeck(),discard:[],color:null,turn:0,dir:1,pending:0,pendingType:null,
     phase:'play',comboValue:null,seqDir:null,drawnId:null,skip:false,extra:false,log:[],busy:false,
     newIds:[],botDraw:{},animPlay:null,mull:R.mulligan,autoResolve:null,lastTop:null,semente:RNG.semente};
  applyBg();S.added=[];S.removed=[];S.freshRules=[];S.ruleOrder=[];S.stripHold=false;$('notices').innerHTML='';delete $('rulestrip').dataset.sig; // sem assinatura: a faixa sempre se redesenha, mesmo sem regras (Clássico)
  S.mem={lacks:{},lastCol:{},played:{}};S.side='a';S.other=null;S.added=S.added||[];S.removed=S.removed||[];
  S.weather=null;S.peace=0;S.boom=null;S.curse=null;S.death=false;S.traffic=null;S.simon=[];S.chal=null;S.timeWin=false;
  if(timeT){clearInterval(timeT);timeT=null}
  if(limboT){clearInterval(limboT);limboT=null}
  $('hand').innerHTML='';$('fx').innerHTML='';FX3D.reset();MK={turn:null,ver:MK.ver+1,until:0};$('discard').innerHTML='';S.limit=12;
  if(R.poker){
    const o=ruleOptions(3,true);
    // a faixa de regras fica vazia até o fim do Mix (flyRules)
    S.busy=true;S.stripHold=!RM;render();
    const go=()=>{S.players.forEach((p,i)=>{if(i===0)return;const b=ruleOptions(4,true).filter(k=>k!=='mess');if(b.length)addRule(i,b[0],true)});S.busy=false;openPoker()};
    if(o.length){openRuleChoice(o,k=>{addRule(0,k,true);go()},'Mix de Regras','Você escolhe primeiro. Depois cada adversário escolhe a regra dele. As cartas só são distribuídas depois.');return}
    go();return;
  }
  dealAndStart();
}
function dealAndStart(){
  const players=S.players;
  S.deck=buildDeck();S.mull=R.mulligan;applyBg();
  if(R.time){const g=S.gen;S.timeEnd=Date.now()+360000;timeT=setInterval(()=>{if(!S||S.gen!==g||S.phase==='over')return;const el=$('timeLeft');const left=Math.max(0,S.timeEnd-Date.now());if(el)el.textContent=fmtTime(left);if(left<=0)timeUp()},1000)}
  if(R.limbo){const g=S.gen;limboT=setInterval(()=>{
    if(!S||S.gen!==g||S.phase==='over')return;
    if(S.limit>3)S.limit--;toast(`Limite: ${S.limit} cartas`,'var(--cr)');checkLimits();
  },60000)}
  const startOf=i=>R.mini?4:R.maxi?9:R.start;
  for(let r=0;r<10;r++)for(let i=0;i<players.length;i++)if(r<startOf(i))drawOne(i);
  if(R.twohands)players.forEach((p,i)=>{const keep=p.hand;p.hand=[];for(let r=0;r<startOf(i);r++)drawOne(i);p.hand2=p.hand;p.hand=keep});
  players.forEach((p,i)=>{if(ab(i,'elisah'))for(let k=0;k<3;k++)give(i,mk(rand(COLORS),'curse'))});
  players.forEach((p,i)=>{const cs=CARRY[p.name];if(cs&&cs.length){cs.forEach(c=>give(i,mk(c.color,c.type,c.value)));delete CARRY[p.name];log(`${who(i)} recebeu ${cs.length} carta${cs.length>1?'s':''} do paradoxo.`)}});
  let first;
  do{first=S.deck.pop();if(first.color==='w'||SP[first.type]){S.deck.unshift(first);first=null}}while(!first);
  S.discard.push(first);S.color=first.color;if(spOn('bomb')&&!R.noaction)S.deck.splice(Math.floor(rng()*(S.deck.length+1)),0,mk('w','bomb'));S.hist=[{by:null,card:snap(first),notes:['Primeira carta da mesa.']}];S.histCur=null;
  S.turn=Math.floor(rng()*players.length);
  log(`Primeira carta: ${cardName(first)}. ${who(S.turn)} ${S.turn===0?'começa':'começa'}.`);
  if(R.addrules){const g=S.gen;addT=setInterval(()=>{if(!S||S.gen!==g||S.phase==='over'||S.busy)return;const o=ruleOptions(1);if(o.length){addRule(null,o[0]);render()}},75000)}
  if(spOn('portal'))buildSideB(startOf);
  S.lastTop=null;S.newIds=players[0].hand.map(c=>c.id);
  S.ruleOrder=ruleKeys(); // daqui em diante, cada regra nova vai para o fim da faixa
  startTurn();
}

/* ---------- portal: two sides ---------- */
const SIDE_KEYS=['deck','discard','color','pending','pendingType','chal','comboValue','seqDir','weather','peace','curse','death','traffic','simon','passes','numOnly','boom','mem','added','removed'];
const PLAYER_KEYS=['hand','hand2','called','luck','webbed','confuse','confuseNext','treasure','batata','escaped'];
function captureSide(){const o={R};SIDE_KEYS.forEach(k=>o[k]=S[k]);o.players=S.players.map(p=>{const q={};PLAYER_KEYS.forEach(k=>q[k]=p[k]);return q});return o}
function applySide(o){R=o.R;SIDE_KEYS.forEach(k=>S[k]=o[k]);S.players.forEach((p,i)=>PLAYER_KEYS.forEach(k=>p[k]=o.players[i][k]))}
function buildSideB(startOf){
  const saved=captureSide();
  R={...saved.R,bg:false};
  S.deck=buildDeck();
  S.players.forEach(p=>{p.hand=[];p.hand2=[];p.called=false;p.luck=false;p.webbed=false;p.confuse=false;p.confuseNext=false;p.treasure=0;p.batata=0;p.escaped=false});
  for(let r=0;r<10;r++)S.players.forEach((p,i)=>{if(r<startOf(i)){const c=popDeck();if(c&&c.type==='bomb'){S.deck.unshift(c);const d=popDeck();if(d)p.hand.push(d)}else if(c)p.hand.push(c)}});
  if(R.twohands)S.players.forEach((p,i)=>{for(let r=0;r<startOf(i);r++){const c=popDeck();if(c&&c.type!=='bomb')p.hand2.push(c)}});
  let first;S.discard=[];
  do{first=S.deck.pop();if(first.color==='w'||SP[first.type]){S.deck.unshift(first);first=null}}while(!first);
  S.discard.push(first);S.color=first.color;if(spOn('bomb')&&!R.noaction)S.deck.splice(Math.floor(rng()*(S.deck.length+1)),0,mk('w','bomb'));
  Object.assign(S,{pending:0,pendingType:null,chal:null,comboValue:null,seqDir:null,weather:null,peace:0,curse:null,death:false,traffic:null,simon:[],passes:0,numOnly:0,boom:null,
    mem:{lacks:{},lastCol:{},played:{}},added:[...(saved.added||[])],removed:[]});
  S.other=captureSide();
  applySide(saved);
}
function switchSide(pi){
  endTurnHook(pi);
  const here=captureSide();applySide(S.other);S.other=here;
  S.side=S.side==='b'?'a':'b';S.crossed=true;S.wxNow=true;S.cntJump=true;
  S.phase='play';S.drawnId=null;S.comboValue=null;S.seqDir=null;S.lastTop=null;
  applyBg();
  $('hand').innerHTML='';S.newIds=[];$('fx').innerHTML='';
  log(`${who(pi)} abriu o portal: a mesa foi para ${S.side==='b'?'o outro lado':'o lado normal'}.`);
}
function portalSequence(pi){
  const g=S.gen,sp=fastMode()?.35:1;
  S.busy=true;clearFlash();render();
  const finish=()=>{if(g!==S.gen||S.phase==='over')return;S.busy=false;render();endTurn()};
  if(RM){switchSide(pi);render();finish();return}
  setTimeout(()=>{
    if(g!==S.gen)return;
    // 1. carga discreta sobre a pilha
    const dr=discardRect();const cx=dr.left+dr.width/2,cy=dr.top+dr.height/2;
    const ring=document.createElement('div');ring.className='pring';const sz=dr.height*1.25;
    Object.assign(ring.style,{left:(cx-sz/2)+'px',top:(cy-sz/2)+'px',width:sz+'px',height:sz+'px'});
    ring.innerHTML='<i></i><i></i><i></i>';
    document.body.appendChild(ring);sfx('portalCharge');
    setTimeout(()=>{
      if(g!==S.gen){ring.remove();return}
      // 2. cortina circular a partir da pilha
      const ov=document.createElement('div');ov.className='pcover';
      const R0=Math.hypot(Math.max(cx,innerWidth-cx),Math.max(cy,innerHeight-cy))+10;
      ov.style.setProperty('--px',cx+'px');ov.style.setProperty('--py',cy+'px');
      document.body.appendChild(ov);sfx('portal');ring.remove();
      const open=ov.animate([{clipPath:`circle(0px at ${cx}px ${cy}px)`},{clipPath:`circle(${R0}px at ${cx}px ${cy}px)`}],{duration:520*sp,easing:'cubic-bezier(.6,0,.8,.3)',fill:'forwards'});
      open.onfinish=()=>{
        if(g!==S.gen){ov.remove();return}
        // 3. troca de lado por baixo, já com a mão pronta
        switchSide(pi);render();
        setTimeout(()=>{
          if(g!==S.gen){ov.remove();return}
          const nr=discardRect();const nx=nr.left+nr.width/2,ny=nr.top+nr.height/2;
          const R1=Math.hypot(Math.max(nx,innerWidth-nx),Math.max(ny,innerHeight-ny))+10;
          ov.style.setProperty('--px',nx+'px');ov.style.setProperty('--py',ny+'px');
          const close=ov.animate([{clipPath:`circle(${R1}px at ${nx}px ${ny}px)`},{clipPath:`circle(0px at ${nx}px ${ny}px)`}],{duration:520*sp,easing:'cubic-bezier(.2,.7,.4,1)',fill:'forwards'});
          close.onfinish=()=>{ov.remove();toast(S.side==='b'?'🌀 Outro lado':'🌀 Lado normal','#8a4fd8');finish()};if(S.turbo)close.finish();
        },260*sp);
      };
      if(S.turbo)open.finish(); // turbo: a cortina não espera o tempo real
    },900*sp);
  },480*sp);
}
/* ---------- core play ---------- */
function srcRect(pi,card){
  const el=pi===0?document.querySelector(`#hand [data-id="${card.id}"]`):document.querySelector(`[data-seat="${pi}"] .av`);
  return el?el.getBoundingClientRect():null;
}
function playCard(pi,card,chosen){
  const p=S.players[pi];
  const annc=S.ann===card;if(annc){S.discard=S.discard.filter(c=>c!==card);S.ann=null;S.lastTop=null}
  const before=p.hand.length+(p.hand.includes(card)?0:1);if(!annc)sfx('play');S.passes=0;
  S.animPlay=annc?null:(S.fastSrc||srcRect(pi,card));S.fastSrc=null;
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
  if(annc&&((card.color==='w'&&chosen)||(orig!==card.type&&!card.flipped)))S.morph=true;
  p.hand=p.hand.filter(c=>c.id!==card.id);
  if(!annc||card.rot==null)card.rot=Math.random()*24-12;
  S.discard.push(card);
  S.color=card.color==='w'?(chosen||S.color):card.color;
  memPlay(pi,card);
  // Mão Colorida: perdeu o ícone ao jogar uma carta colorida, então não tem mais essa cor (o Mestre anota)
  if(R.shiny&&wasColorful&&orig===card.type&&card.color!=='w'&&!colorful(p)&&!(R.bg&&(card.color==='b'||card.color==='g')))memLack(pi,card.color);
  if(black){S.color='k';card.chosen='k';fx(`<span class="wheel" style="width:calc(var(--cw)*1.1);background:${CVAR.k}"></span>`,'Descolorida!',CVAR.k,'stamp');burst(CVAR.k)}
  if(S.histCur&&S.histCur.live){S.histCur.card=snap(S.histCur.live);S.histCur.live=null}
  S.hist=S.hist||[];const he={by:pi,live:card,card:null,notes:[],side:S.side||'a'};S.hist.push(he);if(S.hist.length>12)S.hist.shift();S.histCur=he;
  let msg=`${who(pi)} jogou ${orig!==card.type?SP[orig].n+' → ':''}${cardName(card)}`;
  if(card.color==='w'&&chosen)msg+=` → ${CNAME[chosen]}`;
  const on=!(S.peace>0);
  if(orig!==card.type&&!annc)stampOn(pi,SP[orig].g,'var(--accent)');
  if(!on&&card.type!=='num'){msg+=' (sem efeito: Paz)';fx('🌼',card.color==='w'?`Sem efeito: Paz. A cor continua ${CNAME[S.color]||'a mesma'}`:'Sem efeito: Paz','var(--cg)','stamp')}
  if(on&&card.type==='skip'){S.skip=true;const v=nextIdx(pi,1);fx('⊘',v===0?'Você perdeu a vez':`${who(v)} perdeu a vez`,'var(--cr)','stamp');stampOn(v,'⊘','var(--cr)')}
  if(on&&card.type==='rev'){
    S.dir*=-1;chevFlip();
    if(S.pending>0){fx(ARROWS,`Contra-ataque! +${S.pending} volta`,'var(--accent)',S.dir===1?'cw':'ccw');msg+=' e devolveu a compra'}
    else{fx(ARROWS,'Sentido invertido',S.dir===1?'var(--accent)':'var(--accent)',S.dir===1?'cw':'ccw');if(alive().length===2)S.skip=true}
  }
  if(on&&isDraw(card)){
    S.pending+=drawVal(card);S.pendingType=card.type;
    S.chal=(card.type!=='d2'&&!R.nochallenge)?{by:pi,bluff:hadColor,amt:drawVal(card),col:colBefore}:null;
    if(S.pending>drawVal(card))msg+=` (acumulado +${S.pending})`;
    sfx('plus');hold(600);
  }
  if(card.color==='w'&&chosen&&peaceOn){card.chosen=chosen}
  else if(card.color==='w'&&chosen){card.chosen=chosen;burst(CVAR[chosen]);FX3D.sparks(discardRect(),CVAR[chosen]);if(!isDraw(card))fx(`<span class="wheel" style="width:calc(var(--cw)*1.1);background:${CVAR[chosen]}"></span>`,CNAME[chosen],CVAR[chosen],'stamp')}
  log(msg+'.');
  if(sunPen){const k=drawN(pi,curseOn('anvil',pi)?2:1);log(`${who(pi)} jogou fora da cor com sol e comprou ${k}.`)}
  if(p.hand.length===0&&!nextHand(pi)){endRound(pi);return 'win'}
  if(p.hand.length===target())afterOneCard(pi);
  if(card.type==='num'&&R.perfection&&card.value===before){S.extra=true;log(`Perfeição! ${who(pi)} joga de novo.`);fx('★','Joga de novo','var(--cg)','stamp')}
  if(S.weather==='storm'&&colBefore&&S.color!==colBefore&&!sameCol(S.color,colBefore)){
    // Tempestade: mudou a cor, um adversário aleatório compra 1 (mesmo raio do Trovão)
    const o=alive().filter(i=>i!==pi);
    if(o.length){const v=rand(o);thunderDraw(v,1);
      log(`Tempestade: ${who(pi)} mudou a cor e ${who(v)} ${v===0?'compra':'comprou'} 1.`);if(massCheck()==='win')return 'win'}
  }
  if(curseOn('shoe',pi)&&orig!=='num'&&card.type!=='num'){drawN(pi,1);log(`${who(pi)} comprou 1 (maldição da bota).`);if(massCheck()==='win')return 'win'}
  if(card.type==='num'&&S.players[pi].name==='Charlotte'&&on){const k={r:'red',b:'blue',y:'yellow',g:'green'}[card.color];if(k&&R[k]){const r=charlotteFx(pi,card.color);if(r==='win')return r}}
  if(card.type==='chest'){
    // Tesouro: descarta todas as cartas que sobraram, uma de cada vez, e só então vence
    fx('💰',`${who(pi)} abriu o tesouro!`,'var(--cy)','slam');
    const rest=[...p.hand];if(!rest.length){endRound(pi);return 'win'}
    rest.forEach((c,k)=>discardCard(pi,c,k));log(`${who(pi)} descartou ${rest.length} carta${rest.length===1?'':'s'} com o tesouro.`);
    const g=S.gen;S.busy=true;render();
    setTimeout(()=>{if(g!==S.gen||S.phase==='over')return;S.busy=false;endRound(pi)},(fastMode()?300:700)+rest.length*70);
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
  if(p.bot&&!p.called){p.called=ab(pi,'elise')||rng()<(S.death?Math.max(.96,DIFF[R.diff].call):DIFF[R.diff].call);if(p.called){sfx('bell');log(`${p.name} tocou a sineta.`);toast(`🛎️ ${p.name} tocou a sineta!`,'var(--cr)')}}
  if(!p.called)scheduleCatch(pi);
}
function scheduleCatch(pi){
  const g=S.gen,d=DIFF[R.diff];
  setTimeout(()=>{
    if(!S||g!==S.gen||S.phase==='over')return;
    const p=S.players[pi];
    if(S.weather==='fog'||p.out||p.hand.length!==target()||p.called)return;
    const catchers=alive().filter(i=>i!==pi&&S.players[i].bot&&i!==partner(pi));
    if(catchers.length&&rng()<d.catchP)penalize(pi,rand(catchers));
  },d.catchMs+rng()*500);
}
function penalize(pi,by){
  const p=S.players[pi];
  if(S.weather==='fog'||p.out)return;
  sfx('caught');p.called=false;
  if(S.death&&!immune(pi)){
    log(`${who(by)} pegou ${pi===0?'você':p.name} sem tocar a sineta na morte súbita: eliminado!`);
    fx('🚨',`${pi===0?'Você foi pego':p.name+' foi pego'} sem tocar a sineta!`,'var(--cr)','slam');stampOn(pi,'🚨','var(--cr)');
    if(markOut(pi,'foi pego sem tocar a sineta na morte súbita'))return;
    if(pi===S.turn){endTurn();return}
    render();return;
  }
  const n=S.weather==='blizzard'?0:drawAmt(pi,2);
  if(n){drawN(pi,n);icemiceHook(pi)}
  log(`${who(by)} pegou ${pi===0?'você':p.name} sem tocar a sineta${n?`: +${n}`:' (nevasca: ninguém compra)'}.`);
  toast(`${pi===0?'Você foi pego':p.name+' foi pego'} sem tocar a sineta!${n?` +${n}`:''}`,'var(--cy)');
  if(overloaded(pi)){if(markOut(pi))return;if(pi===S.turn){endTurn();return}}
  render();
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
        fx('🥔',`${who(pi)} ficou com a batata por 5 turnos!`,'var(--cr)','slam');stampOn(pi,'🥔','var(--cr)');
        if(markOut(pi,'ficou 5 turnos com a batata','🥔'))return true;
        const t=rand(alive());if(bt.baseColor==null)bt.baseColor=bt.color;bt.color=rand(COLORS);S.players[t].hand.push(bt);S.players[t].batata=0;
        if(t===0){S.newIds.push(bt.id)}else ghost(targetRect(pi),targetRect(t),0);
        hold(1200);
      }
    }else fp.batata=0;
  }
  if(S.curse){S.curse.left--;if(S.curse.left<=0){S.curse=null;toast('A maldição acabou!','var(--cg)')}}
  if(S.peace>0)S.peace--;
  if(S.numOnly>0)S.numOnly--;
  return false;
}
function endTurn(){
  if(S.phase==='over')return;
  if(S.histCur&&S.histCur.live){S.histCur.card=snap(S.histCur.live);S.histCur.live=null}S.histCur=null;
  clearFlash();S.auto=false;
  const crossed=S.crossed;S.crossed=false;
  for(const i of alive())if(S.players[i].thorned&&markOut(i))return;
  if(!crossed&&endTurnHook(S.turn))return;
  S.phase='play';S.drawnId=null;S.comboValue=null;S.seqDir=null;S.busy=false;
  let steps=S.extra?0:1;steps+=S.skip===true?1:(S.skip||0);
  S.extra=false;S.skip=false;
  S.turn=S.players[S.turn].out&&steps===0?nextIdx(S.turn,1):nextIdx(S.turn,steps);
  if(S.pending>0&&comboMode()==='none'&&!R.nou){
    const v=S.turn;S.chal=null;
    if(noDraw(v)||curseOn('ice',v)||S.weather==='blizzard'){S.pending=0;S.pendingType=null;if(noDraw(v)){if(markOut(v,S.death?'precisou comprar na morte súbita':'comprou com a maldição do espinho',S.death?'☠️':'🌵'))return}S.turn=nextIdx(v,1);startTurn();return}
    if(S.pending>=99){S.pending=0;S.pendingType=null;S.turn=v;drawn99(v,()=>{S.turn=nextIdx(v,1);startTurn()});return}
    const n=drawAmt(v,S.pending);drawN(v,n);stampOn(v,'⊘','var(--cr)');hold(900);
    log(`${who(v)} ${v===0?'compra':'comprou'} ${n} e perde a vez.`);
    S.pending=0;S.pendingType=null;
    if(overloaded(v)&&markOut(v))return;
    S.turn=nextIdx(v,1);
  }
  startTurn();
}
function startTurn(){
  S.tok++;if(TB.on)TB.turns++;
  const cp=cur();
  // Batata: o contador mostra a vez atual com ela (1/5 na primeira, 5/5 na última)
  if(!cp.out&&cp.hand.some(c=>c.type==='batata'))cp.batata=(cp.batata||0)+1;
  if(cp.webbed){
    cp.webbed=false;const g=S.gen,tok=S.tok;
    stampOn(S.turn,'🕸️','var(--muted)');fx('🕸️',S.turn===0?'Você está preso na teia':`${cp.name} está preso na teia`,'var(--muted)','stamp');
    log(`${who(S.turn)} perdeu a vez (teia).`);render();
    setTimeout(()=>{if(g===S.gen&&tok===S.tok&&S.phase!=='over')endTurn()},1100);
    return;
  }
  render();
  if(cur().bot)scheduleBot();
  else if(confused(0))autoHuman();
  else if(R.flash||curseIs('time'))startFlash();
  scheduleJumps();
}
function takeDraw(pi){
  const p=S.players[pi];
  if(pi===0)S.mull=false;
  if(S.pending>0&&(S.weather==='blizzard'||curseOn('ice',pi))){
    const n=S.pending;S.pending=0;S.pendingType=null;S.chal=null;
    fx(S.weather==='blizzard'?'❄️':'🧊',`${pi===0?'Você perde':who(pi)+' perde'} a vez (+${n} congelado)`,'#5aa9d6','stamp');stampOn(pi,'⊘','var(--cr)');
    log(`${who(pi)} perdeu a vez sem comprar (+${n} congelado).`);endTurn();return;
  }
  if(S.weather==='blizzard'){
    if(S.color&&S.pending===0)memLack(pi,S.color);
    S.pending=0;S.pendingType=null;S.chal=null;
    S.passes=(S.passes||0)+1;
    log(`${who(pi)} passou sem comprar (nevasca).`);
    if(S.passes>=alive().length){
      S.weather=null;S.passes=0;
      fx('🌤️','A nevasca acabou: todos passaram a vez','#5aa9d6','slam');sfx('sun');
      log('Todos passaram a vez: a nevasca acabou.');
    }else fx('❄️',`${pi===0?'Você passa':who(pi)+' passa'} (${S.passes}/${alive().length})`,'#5aa9d6','stamp');
    endTurn();return;
  }
  if(noDraw(pi)){
    S.pending=0;S.pendingType=null;S.chal=null;
    fx('☠️',`${who(pi)} não podia comprar!`,'#0d0a14','slam');log(`${who(pi)} precisou comprar e foi eliminado.`);
    if(markOut(pi,S.death?'precisou comprar na morte súbita':'comprou com a maldição do espinho',S.death?'☠️':'🌵'))return;endTurn();return;
  }
  if(curseOn('ice',pi)){
    S.pending=0;S.pendingType=null;S.chal=null;
    fx('🧊',`${who(pi)} não pode comprar e passa`,'var(--cb)','stamp');log(`${who(pi)} passou (gelo).`);endTurn();return;
  }
  if(S.pending>0){
    if(S.pending>=99){S.pending=0;S.pendingType=null;S.chal=null;drawn99(pi,endTurn);return}
    const n=drawAmt(pi,S.pending);S.pending=0;S.pendingType=null;S.chal=null;drawN(pi,n);hold(700);icemiceHook(pi);
    log(`${who(pi)} comprou ${n}.`);
    if(overloaded(pi)&&markOut(pi))return;
    endTurn();return;
  }
  if(R.tracking||(p.bot&&['drekkemaus','jingle','charlotte'].some(k=>ab(pi,k)))){
    if(S.color&&S.pending===0)memLack(pi,S.color);
    const opts=[];
    if(p.luck){
      p.luck=false;const idx=[];for(let i=S.deck.length-1;i>=0&&idx.length<3;i--){const c=S.deck[i];if(c.type!=='bomb'&&canPlay(p,c))idx.push(i)}
      idx.sort((a,b)=>b-a).forEach(i=>opts.push(S.deck.splice(i,1)[0]));if(opts.length)fx('🍀','Sorte: só cartas jogáveis','var(--cg)','stamp');
    }
    if(!opts.length)for(let i=0;i<3;i++){const c=popDeck();if(c)opts.push(c)}
    if(!opts.length){endTurn();return}
    const wasCalled=p.called;
    // com a Bigorna, também vai para a mão uma das opções que sobraram (ao acaso)
    const finish=pick=>{
      const rest=opts.filter(c=>c!==pick),extra=curseOn('anvil',pi)&&rest.length?rand(rest):null;
      rest.filter(c=>c!==extra).forEach(c=>S.deck.unshift(c));
      give(pi,pick);if(extra)give(pi,extra);afterDraw(pi,pick,extra?2:1,wasCalled);
    };
    if(p.bot){
      const safe=opts.filter(c=>c.type!=='bomb');const good=safe.filter(c=>canPlay(p,c));
      const pk=good.length?(R.diff==='easy'?rand(good):botChoose(p,good)):rand(safe.length?safe:opts);
      S.busy=true;botThink(pi,'down',opts,opts.indexOf(pk),()=>{S.busy=false;finish(pk)});
    }else{S.busy=true;render();openPick(opts,finish)}
    return;
  }
  if(S.color&&S.pending===0)memLack(pi,S.color);
  let drawn,count=0;
  if(p.luck){
    p.luck=false;
    const idx=S.deck.map((c,i)=>i).reverse().find(i=>S.deck[i].type!=='bomb'&&canPlay(p,S.deck[i]));
    if(idx!=null){const [c]=S.deck.splice(idx,1);S.deck.push(c);fx('🍀','Sorte!','var(--cg)','stamp')}
  }
  const wasCalled=p.called;
  drawn=drawOne(pi);if(drawn)count=1;
  if(curseOn('anvil',pi)&&drawOne(pi))count++;
  icemiceHook(pi);
  afterDraw(pi,drawn,count,wasCalled);
}
// +99: quem precisa comprar as cartas dele é eliminado na hora, depois de uma enxurrada de cartas voando do monte até ele.
// As cartas não são compradas de verdade. Só escapa quem não compraria por causa da Nevasca ou do Gelo
function drawn99(pi,then){
  const g=S.gen,sp=fastMode()?.4:1,N=RM?0:22,step=50*sp;S.busy=true;clearFlash();render();
  const from=$('deck').getBoundingClientRect();
  for(let k=0;k<N;k++)setTimeout(()=>{if(g!==S.gen)return;ghost(from,targetRect(pi),0);if(k%3===0)sfx('draw')},k*step);
  log(`${who(pi)} ${pi===0?'precisa':'precisou'} comprar as cartas do +99.`);
  setTimeout(()=>{
    if(g!==S.gen||S.phase==='over')return;S.busy=false;
    fx('+99',`${pi===0?'Você não aguentou':who(pi)+' não aguentou'} o +99!`,'var(--cr)','slam');stampOn(pi,'+99','var(--cr)');
    if(markOut(pi,'comprou as cartas do +99','+99'))return;
    then();
  },N*step+450);
}
// wasCalled: se o jogador já tinha tocado a sineta antes de comprar (a Compra Rápida mantém o pedido)
function afterDraw(pi,drawn,count,wasCalled){
  const p=S.players[pi];
  log(`${who(pi)} comprou ${count} carta${count===1?'':'s'}.`);
  if(overloaded(pi)){if(markOut(pi))return;endTurn();return}
  const fast=(R.fastdraw||ab(pi,'papaille'))&&drawn&&drawn.type!=='bomb'&&p.hand.includes(drawn);
  if(!fast&&(!drawn||R.insatisfaction)){endTurn();return}
  if(!fast&&R.satisfaction&&!p.hand.some(c=>canPlay(p,c))&&S.deck.length+S.discard.length>1){
    S.phase='play';S.drawnId=drawn.id;S.tok++;render();if(p.bot)scheduleBot(true);return;
  }
  S.phase='drawn';S.drawnId=drawn.id;
  if(fast){
    S.forcedPlay=true;toast('Compra Rápida!');
    // quem já tinha tocado a sineta e volta a ter a mesma quantidade depois de jogar a carta comprada não precisa pedir de novo
    if(wasCalled&&p.hand.length-1<=target())p.called=true;
    S.fastSrc=$('deck').getBoundingClientRect();S.newIds=S.newIds.filter(id=>id!==drawn.id);if(S.botDraw[pi]){S.botDraw[pi]--;if(!S.botDraw[pi])delete S.botDraw[pi]}
    if(p.bot)botPlay(drawn);else humanPlay(drawn);return}
  if(!p.bot&&!p.hand.some(c=>canPlay(p,c))){
    S.busy=true;S.tok++;render();const g=S.gen;
    setTimeout(()=>{if(g!==S.gen||S.phase!=='drawn'||S.turn!==pi)return;S.busy=false;endTurn()},700);return;
  }
  S.tok++;render();
  if(p.bot)scheduleBot();else if(R.flash||curseIs('time'))startFlash();
}
/* ---------- Terminar e descobrir vencedor (turbo) ----------
   Depois que você é eliminado, joga o resto da partida sem esperas, sons nem efeitos 3D: os timers pendentes vão
   para a fila virtual (TB, em data.js) e turboRun() os executa na ordem, em blocos curtos para a tela não travar.
   Ao terminar, o que sobrou da fila volta para o navegador (a tela de fim aparece no tempo normal).
   Partida longa demais (TURBO_MAX vezes): vence quem tiver menos pontos na mão */
const TURBO_MAX=2000;
function turboStart(){
  if(!S||S.phase==='over'||!S.players[0].out||TB.on)return;
  const now=realNow();
  TB.on=true;TB.now=now;TB.turns=0;TB.idle=0;
  for(const [id,t] of TB.live){nativeClear(t.h);TB.q.set(id,{fn:t.fn,a:t.a,due:now+Math.max(0,t.due-now),id})}
  TB.live.clear();
  TB.saved={muted:MUTED,fx3d:CFG.fx3d};MUTED=true;CFG.fx3d=false;FX3D.reset();
  $('turboOv').hidden=false;render();S.turbo=true;
  nativeTimeout(turboRun,30);
}
function turboRun(){
  const lim=realNow()+40;let next=null;
  while(TB.on){
    if(!S||S.phase==='over'){turboStop();return}
    if(TB.turns>=TURBO_MAX){turboStop();S.timeWin=true;log('Partida longa demais: vence quem tem menos pontos na mão.');endRound(pointsLeader());return}
    next=null;for(const x of TB.q.values())if(!next||x.due<next.due||(x.due===next.due&&x.id<next.id))next=x;
    if(!next||realNow()>lim)break;
    TB.q.delete(next.id);TB.now=Math.max(TB.now,next.due);
    try{next.fn(...next.a)}catch(e){turboStop();throw e}
  }
  // fila vazia: espera algo do navegador (animação do Portal etc.); parado por mais de 5 s, desiste do turbo
  if(next)TB.idle=0;else if(!TB.idle)TB.idle=realNow();else if(realNow()-TB.idle>5000){turboStop();return}
  if(TB.on)nativeTimeout(turboRun,next?0:30);
}
function turboStop(){
  if(!TB.on)return;
  const now=realNow();TB.on=false;
  for(const [id,x] of TB.q){const ms=Math.min(Math.max(0,x.due-TB.now),5000);TB.live.set(id,{fn:x.fn,a:x.a,due:now+ms,h:nativeTimeout(()=>{TB.live.delete(id);x.fn(...x.a)},ms)})}
  TB.q.clear();
  // marcas de tempo guardadas no tempo virtual voltam a zero
  MUTED=TB.saved.muted;CFG.fx3d=TB.saved.fx3d;lastDrawSnd=0;MK.until=0;
  if(S){S.turbo=false;S.fxUntil=0;S.progScroll=0}
  // restos visuais criados durante o cálculo
  $('fx').innerHTML='';$('toast').classList.remove('show');$('kingNote').classList.remove('show');document.querySelectorAll('.stamp,.showc,.peekc,.minidie,.think,.puff,.rulefly,.flyclone,.banc,.burst,.ghost,.pcover,.pring,.raincard,.raindrop,.rainsplash,.dropcard').forEach(e=>e.remove());
  $('turboOv').hidden=true;render();
}
function endRound(pi){
  S.phase='over';clearFlash();closeOverlays();if(limboT){clearInterval(limboT);limboT=null}if(timeT){clearInterval(timeT);timeT=null}if(addT){clearInterval(addT);addT=null}
  let pts=0;const winners=pi<0?[]:R.team?[pi,partner(pi)]:[pi];
  if(pi>=0){
    pts=S.players.reduce((s,p)=>s+p.hand.reduce((a,c)=>a+cardPoints(c),0),0);
    winners.forEach(i=>{const n=S.players[i].name;SCORE[n]=(SCORE[n]||0)+1});save('unotfm-solo-score',SCORE);
  }
  let tourMsg='';
  if(TOUR){
    const handPts=p=>p.out?(p.outPts||50):[...p.hand,...(p.hand2||[])].reduce((a,c)=>a+cardPoints(c),0);
    if(TOUR.mode==='tournament'){
      if(pi>=0){pts=S.players.reduce((s,p)=>s+handPts(p),0);winners.forEach(i=>TOUR.pts[S.players[i].name]+=pts)}
      const champ=Object.entries(TOUR.pts).find(([n,v])=>v>=500);
      if(champ){TOUR.done=true;tourMsg=champ[0]==='Você'?'Você venceu o torneio!':`${champ[0]} venceu o torneio.`}
    }else{
      S.players.forEach((p,i)=>{if(!winners.includes(i))TOUR.pts[p.name]+=handPts(p)});
      Object.entries(TOUR.pts).forEach(([n,v])=>{if(v>=300&&!TOUR.out.includes(n))TOUR.out.push(n)});
      const left=['Você',...TOUR.names].filter(n=>!TOUR.out.includes(n));
      if(TOUR.out.includes('Você')){TOUR.done=true;tourMsg='Você foi eliminado do torneio.'}
      else if(left.length<=1){TOUR.done=true;tourMsg=left[0]==='Você'?'Você sobreviveu e venceu o torneio!':`${left[0]} venceu o torneio.`}
    }
  }
  render();
  setTimeout(()=>{
    sfx(pi>=0&&winners.includes(0)?'win':'lose');if(pi>=0&&winners.includes(0))FX3D.confetti();
    let title=pi===0?'Você venceu!':pi<0?'Você foi eliminado':`${S.players[pi].name} venceu`;
    if(R.team&&pi>=0)title=winners.includes(0)?(pi===0?'Sua dupla venceu!':`Sua dupla venceu com ${S.players[pi].name}!`):`${S.players[winners[0]].name} e ${S.players[winners[1]].name} venceram`;
    if(S.timeWin&&pi>=0)title+=' por pontos';
    $('endTitle').textContent=title;
    $('endSub').textContent=(pi>=0?`Pontos da rodada: ${pts}. `:`Você ${S.outWhy}. `)+'Vitórias acumuladas neste navegador:';
    if(TOUR){
      const goal=TOUR.mode==='tournament'?500:300;
      $('endSub').textContent=(tourMsg?tourMsg+' ':'')+`Rodada ${TOUR.round}. ${TOUR.mode==='tournament'?'Primeiro a 500 pontos vence.':'Quem chega a 300 pontos sai do torneio.'}`;
      $('scoreTbl').innerHTML=['Você',...TOUR.names].sort((a,b)=>TOUR.mode==='tournament'?TOUR.pts[b]-TOUR.pts[a]:TOUR.pts[a]-TOUR.pts[b]).map(n=>`<tr><td>${n}${TOUR.out.includes(n)?' <span style="color:var(--muted)">(fora)</span>':''}</td><td>${TOUR.pts[n]} / ${goal}</td></tr>`).join('');
      $('againBtn').textContent=TOUR.done?'Novo torneio':'Próxima partida';
      $('endOv').classList.add('show');$('againBtn').focus();return;
    }
    $('againBtn').textContent='Nova rodada';
    const hp=p=>[...p.hand,...(p.hand2||[])].reduce((a,c)=>a+cardPoints(c),0);
    const rank=S.players.map((p,i)=>({p,i,pts:hp(p),n:p.hand.length+(p.hand2||[]).length})).sort((a,b)=>((!!a.p.out)-(!!b.p.out))||((b.p.outAt||0)-(a.p.outAt||0))||(a.pts-b.pts)||(a.n-b.n));
    $('endSub').textContent=(S.players[0].out?`Você ${S.outWhy}. `:'')+`Ranking pelos pontos das cartas que sobraram na mão (menos é melhor). Números valem o próprio número, ações coloridas 20 e curingas 50. Suas vitórias neste navegador: ${SCORE['Você']||0}.`;
    $('scoreTbl').innerHTML=rank.map((x,k)=>`<tr${x.i===0?' style="font-weight:700"':''}><td>${['🥇','🥈','🥉'][k]||`${k+1}º`} ${x.p.name}${x.p.out?' <span style="color:var(--muted)">(eliminado)</span>':` <span style="color:var(--muted)">(${x.n} carta${x.n===1?'':'s'})</span>`}</td><td>${x.p.out?'—':x.pts+' pts'}</td></tr>`).join('');
    $('endOv').classList.add('show');$('againBtn').focus();
  },900);
}
