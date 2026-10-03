/* unotfm solo: efeitos das cartas especiais, decisões do jogador, troca/carrossel e corte */
/* ---------- special cards ---------- */
const discardRect=()=>$('discard').getBoundingClientRect();
function discardCard(i,c,k=0){
  const p=S.players[i];p.hand=p.hand.filter(x=>x!==c);
  c.rot=Math.random()*24-12;S.discard.splice(S.discard.length-1,0,c);
  ghost(targetRect(i),discardRect(),k*70);
}
function massCheck(){for(const i of alive())if(overloaded(i)&&markOut(i))return 'win';return 'done'}
function selfCheck(pi){
  const p=S.players[pi];
  if(p.hand.length===0&&!nextHand(pi)){endRound(pi);return 'win'}
  if(p.hand.length===target()&&!p.called)afterOneCard(pi);
  return 'done';
}
const opponents=pi=>alive().filter(i=>i!==pi&&i!==partner(pi));
function fewest(list){return list.reduce((a,b)=>S.players[b].hand.length<S.players[a].hand.length?b:a)}
function giftCard(pi,t){
  const p=S.players[pi];if(!p.hand.length||t==null||t<0)return 'done';
  const times=ab(pi,'jingle')?2:1;
  for(let k=0;k<times&&p.hand.length;k++){
    const c=rand(p.hand);p.hand=p.hand.filter(x=>x!==c);
    S.players[t].hand.push(c);S.players[t].called=false;
    if(t===0){S.newIds.push(c.id);S.handFrom=targetRect(pi)}else ghost(targetRect(pi),targetRect(t),k*90);
  }
  fx('❤️‍🔥',`${who(pi)} doou uma carta para ${t===0?'você':who(t)}`,'var(--cg)','stamp');
  log(`${who(pi)} doou uma carta para ${t===0?'você':who(t)}.`);
  if(massCheck()==='win')return 'win';
  return selfCheck(pi);
}
function webOn(pi,t){
  if(t==null||t<0)return;
  S.players[t].webbed=true;stampOn(t,'🕸️','var(--muted)');
  fx('🕸️',t===0?'Você perde a próxima vez':`${who(t)} perde a próxima vez`,'var(--muted)','stamp');
  log(`${who(pi)} prendeu ${t===0?'você':who(t)} na teia.`);
}
function wishOptions(){return shuffle(S.discard.slice(0,-1)).slice(0,3)}
function wishSwap(pi,c){
  const p=S.players[pi];if(!p.hand.length||!c)return;
  const out=rand(p.hand);
  S.discard=S.discard.filter(x=>x!==c);
  p.hand=p.hand.filter(x=>x!==out);out.rot=Math.random()*24-12;S.discard.splice(S.discard.length-1,0,out);
  if(c.color==='w')c.chosen=null;
  p.hand.push(c);if(pi===0){S.newIds.push(c.id);S.handFrom=discardRect()}
  ghost(discardRect(),targetRect(pi),0);
  fx('☄️',`${who(pi)} pegou ${cardName(c)} da pilha`,'var(--cy)','stamp');
  log(`${who(pi)} trocou uma carta com a pilha.`);
}
function giveBatata(pi,card,t){
  if(t!=null&&t>=0)setTimeout(()=>FX3D.steam(targetRect(t)),250);
  if(t==null||t<0)return;
  S.discard=S.discard.filter(x=>x!==card);S.color=S.colBefore||S.color;S.lastTop=null;
  if(card.baseColor==null)card.baseColor=card.color;card.color=rand(COLORS);card.chosen=null;
  S.players[t].hand.push(card);S.players[t].batata=0;S.players[t].called=false;
  if(t===0){S.newIds.push(card.id);S.handFrom=discardRect()}else ghost(discardRect(),targetRect(t),0);
  stampOn(t,'🥔','var(--cy)');fx('🥔',`A batata foi para ${t===0?'você':who(t)}!`,'var(--cy)','slam');log(`${who(pi)} passou a batata para ${t===0?'você':who(t)}.`);
}
function diceSVG(n){
  const P={1:[[50,50]],2:[[28,28],[72,72]],3:[[26,26],[50,50],[74,74]],4:[[28,28],[72,28],[28,72],[72,72]],5:[[26,26],[74,26],[50,50],[26,74],[74,74]],6:[[28,24],[72,24],[28,50],[72,50],[28,76],[72,76]]}[n];
  return `<svg viewBox="0 0 100 100" style="width:calc(var(--cw)*1.3);height:calc(var(--cw)*1.3);filter:drop-shadow(0 4px 0 rgba(0,0,0,.25))"><rect x="5" y="5" width="90" height="90" rx="20" fill="#fff" stroke="var(--accent)" stroke-width="6"/>${P.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="9" fill="${n===1?'#e0433a':'#241c3a'}"/>`).join('')}</svg>`;
}
function rollDice(pi,t,then,n0,d3){
  const n=n0||1+Math.floor(Math.random()*6);
  const txt=['Pega 1 carta do jogador anterior','Compra 2 cartas','Descarta até ficar com 3','Joga um 4 ou compra 4','Distribui 5 cartas','Compra até ficar com 6'][n-1];
  if(d3){$('fx').innerHTML=`<div class="fxin" style="--fxc:var(--accent);animation-duration:2600ms;margin-top:calc(var(--cw)*1.9)"><div class="fxcap">${t===0?'Você':who(t)}: ${txt}</div></div>`;hold(2600)}
  else{fx(diceSVG(n),`${t===0?'Você':who(t)}: ${txt}`,'var(--accent)','slam',3000);sfx('dice')}log(`Dado de ${who(t)}: ${n} (${txt.toLowerCase()}).`);
  S.annText=`Dado: ${n}. ${t===0?'Você':who(t)}: ${txt.toLowerCase()}`;S.announcing=true;render();
  const g=S.gen;
  setTimeout(()=>{if(g!==S.gen||S.phase==='over')return;S.announcing=false;const r=diceEffect(pi,t,n);if(r==='win')return;then()},S.spectate?700:(d3?2000:2600));
}
function diceEffect(pi,t,n){
  const q=S.players[t];
  if(n===1&&S.players[pi].hand.length){const c=rand(S.players[pi].hand);S.players[pi].hand=S.players[pi].hand.filter(x=>x!==c);q.hand.push(c);if(t===0){S.newIds.push(c.id);S.handFrom=targetRect(pi)}else ghost(targetRect(pi),targetRect(t),0);if(S.players[pi].hand.length===0&&!nextHand(pi)){endRound(pi);return 'win'}}
  if(n===2){const k=drawAmt(t,2);drawN(t,k);floatOn(t,`+${k}`,'var(--cr)')}
  if(n===3){let k=0;while(q.hand.length>3)discardCard(t,rand(q.hand),k++)}
  if(n===4){const f=q.hand.find(c=>c.type==='num'&&c.value===4);if(f)discardCard(t,f);else{const k=drawAmt(t,4);drawN(t,k);floatOn(t,`+${k}`,'var(--cr)')}}
  if(n===5){const others=alive().filter(i=>i!==t);const k=Math.min(5,q.hand.length-1);for(let j=0;j<k;j++){const c=rand(q.hand);const o=rand(others);q.hand=q.hand.filter(x=>x!==c);S.players[o].hand.push(c);S.players[o].called=false;if(o===0){S.newIds.push(c.id);S.handFrom=targetRect(t)}else ghost(targetRect(t),targetRect(o),j*60)}}
  if(n===6){while(q.hand.length<6&&drawOne(t)){}}
  q.called=q.hand.length<=target()&&q.called;
  if(q.hand.length===0&&!nextHand(t)){endRound(t);return 'win'}
  return massCheck();
}
function resolveSimon(pi,card,ok,col){
  S.lastTop=null;
  if(ok){S.color=col;card.chosen=col;S.simon.push(col);burst(CVAR[col]);fx('🧠',S.simon.length>1?`Acertou! Sequência de ${S.simon.length}`:`Primeira cor: ${CNAME[col]}`,CVAR[col],'stamp');log(`${who(pi)} acertou a memorização (${S.simon.length}).`);return 'done'}
  drawN(pi,1);floatOn(pi,'+1','var(--cr)');const c=rand(COLORS);S.color=c;card.chosen=c;
  fx('🧠','Errou a sequência! +1','var(--cr)','slam');log(`${who(pi)} errou a memorização.`);return massCheck();
}
function stealWild(pi,t){
  if(t==null||t<0)return 'done';
  const q=S.players[t];const w=q.hand.filter(c=>c.color==='w'&&c.type!=='bomb');
  if(!w.length){fx('🧤',`${t===0?'Você não tinha':who(t)+' não tinha'} curinga`,'var(--muted)','stamp');log(`${who(pi)} tentou roubar ${who(t)}, sem curingas.`);return 'done'}
  const c=rand(w);q.hand=q.hand.filter(x=>x!==c);S.players[pi].hand.push(c);S.players[pi].called=false;
  if(pi===0){S.newIds.push(c.id);S.handFrom=targetRect(t)}else ghost(targetRect(t),targetRect(pi),0);
  fx('🧤',`${who(pi)} roubou ${label(c)} de ${t===0?'você':who(t)}`,'var(--cy)','slam');log(`${who(pi)} roubou um curinga de ${who(t)}.`);
  if(q.hand.length===0&&!nextHand(t)){endRound(t);return 'win'}
  return massCheck();
}
function banType(pi,c){
  const m=x=>x.type===c.type&&(c.type!=='num'||x.value===c.value);
  const t=topCard();let n=0;
  n+=S.deck.filter(m).length;S.deck=S.deck.filter(x=>!m(x));
  const keep=S.discard.slice(0,-1).filter(x=>!m(x));n+=S.discard.length-1-keep.length;S.discard=[...keep,t];
  S.players.forEach((q,i)=>{if(q.out)return;const k=q.hand.filter(m).length;if(k){n+=k;q.hand=q.hand.filter(x=>!m(x));ghost(targetRect(i),discardRect(),0);floatOn(i,`-${k}`,'var(--cg)')}});
  if(SP[c.type]){const rk=SP[c.type].rule||c.type;if(R[rk]){R[rk]=false;S.removed.push({k:rk,by:pi===0?'você':who(pi)})}}
  fx('✖️',`${label(c)} banido do jogo (${n} carta${n===1?'':'s'})`,'var(--cr)','slam');log(`${who(pi)} baniu ${label(c)}: ${n} cartas saíram do jogo.`);
  if(S.players[pi].hand.length===0&&!nextHand(pi)){endRound(pi);return 'win'}
  const empty=alive().find(i=>S.players[i].hand.length===0&&!nextHand(i));if(empty!=null){endRound(empty);return 'win'}
  graceCalls();return 'done';
}
function peek(i,c){
  if(RM)return;const r=targetRect(i);if(!r)return;
  const el=makeCard(c);el.className=`card c-${c.color} peekc`;el.disabled=true;
  const w=Math.min(r.width*.6,46);el.style.setProperty('--cw',w+'px');el.style.left=(r.left+r.width/2-w/2)+'px';el.style.top=(r.bottom+4)+'px';
  document.body.appendChild(el);el.addEventListener('animationend',()=>el.remove());
}
function revealCard(pi,c){
  if(!c)return;
  if(pi===0){const el=document.querySelector(`#hand [data-id="${c.id}"]`);if(el){el.classList.add('revealed');setTimeout(()=>el.classList.remove('revealed'),2200)}}
  else peek(pi,c);
}
function doChallenge(pi){
  const c0=S.chal;if(!c0)return;
  S.busy=true;clearFlash();const g=S.gen;
  fx('⚔️',`${pi===0?'Você desafiou':who(pi)+' desafiou'} o +${c0.amt} de ${c0.by===0?'você':who(c0.by)}`,'var(--accent)','stamp',1300);
  log(`${who(pi)} desafiou o +${c0.amt} de ${who(c0.by)}.`);
  setTimeout(()=>{
    if(g!==S.gen||S.phase==='over')return;
    if(c0.bluff){
      const b=S.players[c0.by];const proof=b.hand.find(x=>x.color!=='w'&&sameCol(x.color,c0.col));
      fx('🃏',`Blefe! ${c0.by===0?'Você podia':who(c0.by)+' podia'} ter jogado ${proof?cardName(proof):'outra carta'}`,'var(--cg)','stamp',1500);
      revealCard(c0.by,proof);
      setTimeout(()=>{if(g!==S.gen||S.phase==='over')return;S.busy=false;challengeResolve(pi)},S.spectate?600:1500);
    }else{S.busy=false;challengeResolve(pi)}
  },S.spectate?500:1300);
}
function challengeResolve(pi){
  const c=S.chal;S.chal=null;if(!c)return;const n=S.pending;S.pending=0;S.pendingType=null;
  const amt=Math.min(n,c.amt||n),rest=n-amt;
  const frozenBy=S.weather==='blizzard'||curseOn('ice',c.by),frozen=S.weather==='blizzard'||curseOn('ice',pi);
  if(c.bluff){
    if(S.death&&!immune(c.by)){
      fx('⚔️',`Blefe! ${c.by===0?'Você foi eliminado':who(c.by)+' foi eliminado'}`,'var(--cg)','slam');stampOn(c.by,'⚔️','var(--cr)');
      log(`${who(pi)} desafiou: ${who(c.by)} blefou com +${amt} na morte súbita e foi eliminado.`);
      if(markOut(c.by,`foi pego blefando com +${amt} na morte súbita`))return;
    }else{
      const k=frozenBy?0:drawAmt(c.by,amt);if(k){drawN(c.by,k);floatOn(c.by,`+${k}`,'var(--cr)')}
      fx('⚔️',`Blefe! ${c.by===0?'Você compra':who(c.by)+' compra'} ${k}`+(rest?`, ${pi===0?'você compra':who(pi)+' compra'} o resto (+${rest})`:''),'var(--cg)','slam');
      log(`${who(pi)} desafiou: ${who(c.by)} blefou com +${amt} e comprou ${k}.`);
      if(massCheck()==='win')return;
    }
    if(rest>0&&!frozen){
      const k2=drawAmt(pi,rest);if(k2){drawN(pi,k2);floatOn(pi,`+${k2}`,'var(--cr)')}
      log(`${who(pi)} comprou o restante acumulado: ${k2}.`);
      if(overloaded(pi)&&markOut(pi))return;endTurn();return;
    }
    S.tok++;render();if(cur().bot)scheduleBot();else if(R.flash||curseIs('time'))startFlash();
  }else{
    if(S.death&&!immune(pi)){
      fx('⚔️',`Jogada legal! ${pi===0?'Você foi eliminado':who(pi)+' foi eliminado'}`,'var(--cr)','slam');log(`${who(pi)} desafiou errado na morte súbita e foi eliminado.`);
      if(markOut(pi,'desafiou errado na morte súbita'))return;endTurn();return;
    }
    const k=frozen?0:drawAmt(pi,n+2);if(k){drawN(pi,k);floatOn(pi,`+${k}`,'var(--cr)')}
    fx('⚔️',`Jogada legal! ${pi===0?'Você compra':who(pi)+' compra'} ${k}`,'var(--cr)','slam');log(`${who(pi)} desafiou e errou: comprou ${k}.`);
    if(overloaded(pi)&&markOut(pi))return;endTurn();
  }
}
function autoHuman(){
  const g=S.gen,tok=S.tok;S.auto=true;render();
  toast('Confuso! Jogada aleatória','var(--cy)');
  setTimeout(()=>{
    if(g!==S.gen||tok!==S.tok||S.turn!==0||S.phase==='over')return;
    const me=S.players[0];const opts=me.hand.filter(c=>canPlay(me,c));
    if(!opts.length){
      takeDraw(0);
      if(S.busy&&S.autoResolve)setTimeout(()=>S.autoResolve&&S.autoResolve(),800);
      else if(S.phase==='drawn'&&S.turn===0){const d=me.hand.find(c=>c.id===S.drawnId);if(d)autoPlay(d)}
      return;
    }
    autoPlay(rand(opts));
  },1000);
}
function autoPlay(card){
  finishHuman(card,isWildPick(card)?rand(COLORS):null);
  if(S.busy&&S.autoResolve)setTimeout(()=>S.autoResolve&&S.autoResolve(),800);
  else if(S.phase==='combo'&&S.turn===0)endTurn();
}
const CARD_RULES=()=>RULES.filter(r=>r.g==='Cartas especiais').map(r=>r.k);
function ruleOptions(n=2,pre){
  const pool=[...RULE_POOL,...CARD_RULES(),...(pre?['noaction','mess','mulligan','mini','maxi','twohands']:[])].filter(k=>!R[k]&&!(CONFLICT[k]||[]).some(x=>R[x])&&!(k==='bg'&&S&&S.side==='b')&&!(k==='portal'&&!pre));
  return shuffle(pool).slice(0,n);
}
function addRule(pi,k,quiet,done){
  R[k]=true;if(k==='bg')applyBg();
  const by=pi==null?'o jogo':pi===0?'você':who(pi);
  S.added.push({k,by});S.freshRules=[...(S.freshRules||[]),k];
  const cards=[];
  Object.entries(SP).forEach(([t,v])=>{if((v.rule||t)===k)v.deck.forEach(c=>cards.push(mk(c,t)))});
  if(k==='bomb')cards.push(mk('w','bomb'));
  cards.forEach(c=>S.deck.splice(Math.floor(Math.random()*(S.deck.length+1)),0,c));
  const extra=cards.length?` (+${cards.length} carta${cards.length>1?'s':''} no monte)`:'';
  if(quiet){const deckR=$('deck').getBoundingClientRect(),dr=discardRect();for(let j=0;j<Math.min(cards.length,6);j++)ghost(dr,deckR,j*90)}
  else ruleReveal(k,cards,done);
  log(`${pi==null?'O jogo':who(pi)} adicionou a regra ${RNAME[k]}${extra}.`);
}
// Carta da Regra: ícone grande com o nome, voa até a faixa de regras enquanto as cartas novas caem no monte; depois a janela explicativa
function ruleReveal(k,cards,done){
  const g=S.gen,sp=S.spectate?.4:1;S.busy=true;clearFlash();hold(99999);sfx('rule');
  const fin=()=>{if(g!==S.gen)return;$('fx').innerHTML='';S.fxUntil=0;S.busy=false;render();showRuleInfo(k);if(done)done()};
  if(RM){render();fin();return}
  $('fx').innerHTML=`<div class="fxin ruleshow" style="--fxc:var(--accent)"><div class="fxg" id="ruleG" style="color:var(--accent)">${ruleIcon(k)}</div><div class="fxcap" id="ruleCap">${RNAME[k]}</div></div>`;
  setTimeout(()=>{
    if(g!==S.gen||S.phase==='over')return;
    render();
    const tgt=$('rulestrip').querySelector(`[data-k="${k}"]`),src=$('ruleG');
    const dr=$('deck').getBoundingClientRect();cards.slice(0,6).forEach((c,j)=>cardDrop(c,dr,j*110*sp));
    if(!tgt||!src){setTimeout(fin,700*sp);return}
    const a=src.getBoundingClientRect(),b=tgt.getBoundingClientRect();
    const el=document.createElement('div');el.className='rulefly';el.textContent=ruleIcon(k);
    Object.assign(el.style,{left:(a.left+a.width/2)+'px',top:(a.top+a.height/2)+'px',fontSize:getComputedStyle(src).fontSize});
    document.body.appendChild(el);src.style.visibility='hidden';tgt.style.visibility='hidden';
    const cap=$('ruleCap');if(cap)cap.animate([{opacity:1},{opacity:0}],{duration:300,fill:'forwards'});
    const sc=Math.max(.2,b.height*.6/a.height);
    el.animate([{transform:'translate(-50%,-50%)'},{transform:`translate(calc(-50% + ${b.left+b.width/2-a.left-a.width/2}px),calc(-50% + ${b.top+b.height/2-a.top-a.height/2}px)) scale(${sc})`}],{duration:700*sp,easing:'cubic-bezier(.5,0,.3,1)',fill:'forwards'}).onfinish=()=>{
      el.remove();tgt.style.visibility='';tgt.animate([{transform:'scale(1.6)'},{transform:'none'}],{duration:300,easing:'cubic-bezier(.2,.9,.3,1.3)'});fin()};
  },1200*sp);
}
const RICON={stack:'📚',sequence:'🔢',neighbor:'↕️',hell:'🔥',jumpin:'✂️',perfection:'💯',clean:'🧼',nou:'↩️',satisfaction:'😋',insatisfaction:'😒',
  fastdraw:'⏩',tracking:'🔎',flash:'🏃',overload:'🏋️',limbo:'🪜',hard:'🎯',dos:'✌️',shiny:'✨',team:'🤝',black:'⬛',noaction:'🥱',mess:'🎭',
  revelation:'🔦',mini:'🤏',maxi:'🤌',mulligan:'🆕',camouflage:'😶‍🌫️',bg:'🩵',nochallenge:'🤐',time:'⏰',limitless:'♾️',twohands:'✋',poker:'🃏',addrules:'➕',
  tournament:'🏆',survivor:'🏅',drekkemaus:'🐉',jingle:'🔔',papaille:'🦋',charlotte:'🕷️',elisah:'🔮',buffy:'🐣',snowy:'⛄',icemice:'🐭',elise:'⚜️',red:'🔴',blue:'🔵',yellow:'🟡',green:'🟢',weather:'🌤️',mix:'⇄⊘',plus99:'+99'};
function ruleIcon(k){
  if(RICON[k])return RICON[k];
  if(BOTRULES.includes(k))return k[0].toUpperCase();
  const e=Object.entries(SP).find(([t,v])=>(v.rule||t)===k&&!v.hide)||Object.entries(SP).find(([t,v])=>(v.rule||t)===k);
  return e?e[1].g:'📜';
}
const ruleDesc=k=>(RULES.find(r=>r.k===k)||{}).d||'';
function notice(k,by,opts={}){
  const box=$('notices');
  const ex=box.querySelector(`[data-k="${k}"]`);if(ex)ex.remove();
  const el=document.createElement('div');el.className='notice'+(opts.gone?' gone':'');el.dataset.k=k;el.setAttribute('role','status');
  const ic=ruleIcon(k),bot=BOTRULES.includes(k);
  el.innerHTML=`<div class="ni" ${bot?`style="background:${AVCOL[BOTNAMES.indexOf(k[0].toUpperCase()+k.slice(1))]}"`:''}>${ic}</div><div class="nt">${opts.title||(opts.gone?'Regra removida: ':'Nova regra: ')+RNAME[k]}</div><div class="nb">${by||''}</div><div class="nd">${ruleDesc(k)}</div>`;
  el.onclick=()=>{el.remove();document.querySelectorAll('.ri.on').forEach(x=>x.classList.remove('on'))};
  if(opts.anchor){box.innerHTML='';const r=opts.anchor.getBoundingClientRect();box.style.top=(r.bottom+12)+'px';box.appendChild(el);el.classList.add('pointed');
    requestAnimationFrame(()=>{const a=$('rulestrip').querySelector(`[data-k="${k}"]`)||opts.anchor;const rr=a.getBoundingClientRect(),br=el.getBoundingClientRect();box.style.top=(rr.bottom+12)+'px';el.style.setProperty('--ax',Math.max(18,Math.min(br.width-18,rr.left+rr.width/2-br.left))+'px')});
    const br=el.getBoundingClientRect();el.classList.add('pointed');el.style.setProperty('--ax',Math.max(18,Math.min(br.width-18,r.left+r.width/2-br.left))+'px')}
  else{box.style.top='';box.appendChild(el)}
  while(box.children.length>3)box.firstElementChild.remove();
  if(!opts.info)sfx('rule');
}
function renderRuleStrip(){
  const keys=RULES.filter(r=>R[r.k]).map(r=>r.k);
  const sig=keys.join(',');const strip=$('rulestrip');
  if(strip.dataset.sig===sig)return;strip.dataset.sig=sig;
  const fresh=S.freshRules||[];S.freshRules=[];
  strip.innerHTML=keys.map(k=>{const ic=ruleIcon(k);const txt=[...ic].length>2;
    const bot=BOTRULES.includes(k);
    return `<button class="ri ${txt?'txt':''} ${fresh.includes(k)?'fresh':''}" data-k="${k}" title="${RNAME[k]}" aria-label="${RNAME[k]}" ${bot?`style="background:${AVCOL[BOTNAMES.indexOf(k[0].toUpperCase()+k.slice(1))]};color:#fff;border-color:transparent"`:''}>${ic}</button>`}).join('');
  const f=strip.querySelector('.fresh');if(f){S.progScroll=Date.now();f.scrollIntoView({behavior:'auto',inline:'center',block:'nearest'})}
}
function openPoker(){
  const list=S.added.map(a=>{const bot=BOTRULES.includes(a.k),ic=ruleIcon(a.k);
    return `<div class="pk"><div class="pk-ic ${[...ic].length>2?'txt':''}" ${bot?`style="background:${AVCOL[BOTNAMES.indexOf(a.k[0].toUpperCase()+a.k.slice(1))]};color:#fff;border-color:transparent"`:''}>${ic}</div><div class="pk-body"><div class="pk-head"><b>${RNAME[a.k]}</b><em class="new">${a.by==='você'?'sua':'de '+a.by}</em></div><p>${ruleDesc(a.k)}</p></div></div>`}).join('');
  $('pokerList').innerHTML=list||'<p class="sub">Nenhuma regra disponível para escolher.</p>';
  S.busy=true;render();
  $('pokerOv').classList.add('show');$('pokerGo').focus();
  $('pokerGo').onclick=()=>{$('pokerOv').classList.remove('show');S.busy=false;S.freshRules=[];dealAndStart()};
}
function openRuleChoice(opts,cb,title='Carta da Regra',sub='Escolha uma regra para adicionar à partida.'){
  $('swaps').classList.remove('row');$('swapTitle').textContent=title;$('swapSub').textContent=sub;
  const desc=k=>(RULES.find(r=>r.k===k)||{}).d||'';
  const icon=ruleIcon;
  $('swaps').innerHTML=opts.map(k=>`<button data-k="${k}" style="flex-direction:column;align-items:flex-start;gap:4px"><span style="display:flex;align-items:center;gap:10px"><span class="av" style="background:var(--accent);font-size:1.05rem">${icon(k)}</span>${RNAME[k]}</span><small style="margin:0;font-weight:400">${desc(k)}</small></button>`).join('');
  $('swapOv').classList.add('show');
  const done=k=>{closeOverlays();cb(k)};
  S.autoResolve=()=>done(opts[0]);
  $('swaps').onclick=e=>{const b=e.target.closest('button');if(b)done(b.dataset.k)};
  $('swaps').firstChild&&$('swaps').firstChild.focus();
}
function charlotteFx(pi,c){
  const p=S.players[pi],others=alive().filter(i=>i!==pi);if(!others.length)return 'done';
  if(c==='r'){const nums=p.hand.filter(x=>x.type==='num');if(!nums.length)return 'done';const x=rand(nums),t=rand(others);
    p.hand=p.hand.filter(y=>y!==x);S.players[t].hand.push(x);S.players[t].called=false;if(t===0){S.newIds.push(x.id);S.handFrom=targetRect(pi)}else ghost(targetRect(pi),targetRect(t),0);
    fx('💗',`Amor? Charlotte doou uma carta para ${t===0?'você':who(t)}`,'var(--cr)','stamp');return selfCheck(pi)}
  if(c==='b'){S.numOnly=2;fx('🕊️','Paz? No próximo turno, só cartas numéricas','var(--cb)','stamp');return 'done'}
  if(c==='y'){const t=rand(others),n=1+Math.floor(Math.random()*3);drawN(t,n);floatOn(t,`+${n}`,'var(--cy)');fx('😠',`Ira? ${t===0?'Você compra':who(t)+' compra'} ${n}`,'var(--cy)','slam');return massCheck()}
  if(c==='g'){const m=Math.min(...others.map(i=>S.players[i].hand.length));let k=0;
    while(p.hand.length>m&&p.hand.length>1)discardCard(pi,rand(p.hand),k++);while(p.hand.length<m&&drawOne(pi)){}
    fx('⚖️',`Igualdade? Charlotte fica com ${p.hand.length} cartas`,'var(--cg)','stamp');return selfCheck(pi)}
  return 'done';
}
// sequência de efeitos, um jogador por vez; a partida espera e depois segue
function sequenceFx(list,step){
  const g=S.gen,sp=S.spectate?.4:1;S.busy=true;clearFlash();hold(99999);
  const go=j=>{if(g!==S.gen||S.phase==='over')return;
    if(j>=list.length){S.fxUntil=0;S.busy=false;if(massCheck()==='win')return;render();endTurn();return}
    step(list[j],()=>go(j+1),sp)};
  go(0);return 'defer';
}
// as cartas compradas aparecem direto na mão, sem voar do monte
function quietDraw(i){if(i===0)S.newIds=[];else delete S.botDraw[i]}
function flashStorm(){
  if(RM)return;const t=document.querySelector('.table');t.classList.remove('bolt','flick');void t.offsetWidth;t.classList.add('bolt');setTimeout(()=>t.classList.remove('bolt'),800);
}
/* adversary thinking bubble */
function thinkItems(kind,list){
  if(kind==='color')return list.map(c=>`<span class="ti sq" style="background:${CVAR[c]}"></span>`);
  if(kind==='player')return list.map(i=>`<span class="ti pl" style="background:${S.players[i].col}">${S.players[i].name[0]}</span>`);
  if(kind==='rule')return list.map(k=>`<span class="ti rl">${ruleIcon(k)}</span>`);
  if(kind==='down')return list.map(()=>`<span class="ti cd back"></span>`);
  if(kind==='up')return list.map(c=>`<span class="ti cd c-${c.chosen||c.color}"><b>${c.type==='num'?c.value:(SP[c.type]?SP[c.type].g:({skip:'⊘',rev:'⇄',d2:'+2',d4:'+4',wild:'✦'}[c.type]||''))}</b></span>`);
  return [];
}
function botThink(pi,kind,list,pickIdx,done){
  const seat=document.querySelector(`[data-seat="${pi}"]`);
  const g=S.gen;const sp=S.spectate?.4:1;
  if(!seat||RM){setTimeout(()=>{if(g===S.gen)done()},300*sp);return}
  const r=seat.getBoundingClientRect();
  const el=document.createElement('div');el.className='think';el.innerHTML=`<span class="tdots">💭</span>${thinkItems(kind,list).join('')}`;
  document.body.appendChild(el);
  const w=el.offsetWidth;el.style.left=Math.max(6,Math.min(innerWidth-w-6,r.left+r.width/2-w/2))+'px';el.style.top=(r.bottom+6)+'px';
  const items=[...el.querySelectorAll('.ti')];let k=0,steps=Math.max(3,Math.round((4+Math.random()*3)*sp));
  const tick=()=>{
    if(g!==S.gen){el.remove();return}
    items.forEach(x=>x.classList.remove('hl'));
    if(steps-->0){const j=items.length>1?(Math.random()*items.length|0):0;items[j].classList.add('hl');sfx('tick');setTimeout(tick,200*sp);return}
    items[pickIdx]&&items[pickIdx].classList.add('pick');sfx('play');
    setTimeout(()=>{el.remove();if(g===S.gen&&S.phase!=='over')done()},550*sp);
  };
  setTimeout(tick,250*sp);
}
function botTypeSimon(pi,seq,ok,done){
  const seat=document.querySelector(`[data-seat="${pi}"]`);const g=S.gen;const sp=S.spectate?.4:1;
  if(!seat||RM){setTimeout(()=>{if(g===S.gen)done()},300*sp);return}
  const r=seat.getBoundingClientRect();
  const failAt=ok?-1:Math.floor(Math.random()*seq.length);
  const el=document.createElement('div');el.className='think';el.innerHTML=`<span class="tdots">🧠</span>${seq.map(()=>'<span class="ti sq"></span>').join('')}`;
  document.body.appendChild(el);const w=el.offsetWidth;el.style.left=Math.max(6,Math.min(innerWidth-w-6,r.left+r.width/2-w/2))+'px';el.style.top=(r.bottom+6)+'px';
  const items=[...el.querySelectorAll('.ti')];let i=0;
  const step=()=>{
    if(g!==S.gen){el.remove();return}
    if(i===failAt){items[i].classList.add('bad');items[i].textContent='✕';sfx('error');setTimeout(()=>{el.remove();if(g===S.gen&&S.phase!=='over')done()},700*sp);return}
    if(i>=seq.length){setTimeout(()=>{el.remove();if(g===S.gen&&S.phase!=='over')done()},400*sp);return}
    items[i].style.background=CVAR[seq[i]];items[i].classList.add('pick');sfx('tick');i++;setTimeout(step,380*sp);
  };
  setTimeout(step,300*sp);
}
function botDefer(pi,kind,list,pickIdx,effect){
  S.busy=true;clearFlash();
  botThink(pi,kind,list,pickIdx,()=>{S.busy=false;const r=effect();if(r==='win'||S.phase==='over')return;if(r==='defer')return;render();endTurn()});
  return 'defer';
}
function applySpecial(pi,card){
  const p=S.players[pi],T=card.type,col=CVAR[card.color]||'var(--accent)';
  const opp=alive().filter(i=>i!==pi);
  hold(1000);
  switch(T){
    case 'trade':if(!opp.length)return 'done';if(pi===0)return 'ask';{const t=botSwapTarget(pi),l=alive().filter(i=>i!==pi);return botDefer(pi,'player',l,l.indexOf(t),()=>{swapHands(pi,t);return 'done'})}
    case 'carousel':rotateHands();return 'done';
    case 'gift':if(!p.hand.length)return 'done';if(pi===0)return 'ask';{const o=opponents(pi).filter(i=>!ab(i,'papaille'));if(!o.length)return 'done';const t=R.diff==='easy'?rand(o):fewest(o),l=alive().filter(i=>i!==pi);return botDefer(pi,'player',l,l.indexOf(t),()=>giftCard(pi,t))}
    case 'web':{if(pi===0)return 'ask';const o=opponents(pi);const n=nextIdx(pi,1);const t=o.includes(n)?n:(o.length?fewest(o):-1);if(t<0)return 'done';const l=alive().filter(i=>i!==pi);return botDefer(pi,'player',l,l.indexOf(t),()=>{webOn(pi,t);return 'done'})}
    case 'wish':if(!p.hand.length||S.discard.length<2)return 'done';if(pi===0)return 'ask';{
      const opts=wishOptions();const best=opts.find(c=>c.color==='w')||opts.find(c=>c.color===S.color)||opts[0];return botDefer(pi,'up',opts,opts.indexOf(best),()=>{wishSwap(pi,best);return 'done'})}
    case 'rain':{
      // um adversário por vez, no sentido do jogo: a carta cai do céu até ele
      const order=[];for(let i=nextIdx(pi,1);i!==pi&&!order.includes(i);i=nextIdx(i,1))if(opp.includes(i))order.push(i);
      log('Chuva: todos os adversários compram 1.');sfx('rain');
      return sequenceFx(order,(i,next,sp)=>rainDrop(i,560*sp,()=>{drawN(i,1);quietDraw(i);floatOn(i,'+1','var(--cb)');render();setTimeout(next,160*sp)}))}
    case 'thunder':{
      // 2 jogadores sorteados (pode ser quem jogou), cada um compra de 1 a 5; um por vez, as cartas aparecem de repente
      const vs=shuffle(alive().filter(i=>!ab(i,'drekkemaus'))).slice(0,2);
      log(`Trovão atingiu ${vs.map(who).join(' e ')}.`);
      return sequenceFx(vs,(i,next,sp)=>{const n=1+Math.floor(Math.random()*5);
        flashStorm();boltOn(i);sfx('thunder');drawN(i,n);quietDraw(i);floatOn(i,`+${n}`,'var(--cy)');stampOn(i,'⚡','var(--cy)');render();setTimeout(next,950*sp)})}
    case 'equality':{
      alive().forEach(i=>{const q=S.players[i];let k=0;while(q.hand.length>3)discardCard(i,rand(q.hand),k++);while(q.hand.length<3&&drawOne(i)){}});
      graceCalls();fx('=','Todos ficam com 3 cartas',col,'stamp');log('Igualdade: todos ficaram com 3 cartas.');
      const r=massCheck();if(r==='win')return r;return selfCheck(pi)}
    case 'justice':{
      const k=Math.max(0,Math.min(opp.filter(i=>S.players[i].hand.length<p.hand.length).length,p.hand.length-1));
      for(let j=0;j<k;j++)discardCard(pi,rand(p.hand),j);
      fx('🙏',k?`${who(pi)} descartou ${k} carta${k>1?'s':''}`:'Ninguém tem menos cartas',col,'stamp');log(`Misericórdia: ${who(pi)} descartou ${k}.`);
      return selfCheck(pi)}
    case 'magnet':{FX3D.sparks(targetRect(pi),col);
      const same=p.hand.filter(c=>c.color===card.color);same.forEach((c,j)=>discardCard(pi,c,j));
      fx('🧲',same.length?`${who(pi)} descartou ${same.length} carta${same.length>1?'s':''}`:'Nenhuma carta da cor',col,'stamp');
      log(`Imã: ${who(pi)} descartou ${same.length}.`);return selfCheck(pi)}
    case 'tornado':{FX3D.swirl('tornado');
      if(opp.length<2){fx('🌪️','Nada para embaralhar',col,'stamp');return 'done'}
      const sizes=opp.map(i=>S.players[i].hand.length);const pool=shuffle(opp.flatMap(i=>S.players[i].hand));
      const center=discardRect();
      opp.forEach(i=>ghost(targetRect(i),center,0));
      opp.forEach((i,k)=>{const h=pool.splice(0,sizes[k]);S.players[i].hand=h;memReset(i);if(i===0){S.newIds=h.map(c=>c.id);S.handFrom=center}setTimeout(()=>ghost(center,targetRect(i),0),350)});
      graceCalls();fx('🌪️','Mãos dos adversários embaralhadas',col,'slam');log('Tornado embaralhou as mãos dos adversários.');return 'done'}
    case 'steal':{
      opp.forEach(i=>{const q=S.players[i];const acts=q.hand.filter(c=>c.type!=='num');if(acts.length){discardCard(i,rand(acts));drawOne(i)}});
      fx('♻️','Adversários trocam uma ação',col,'stamp');log('Reciclagem: adversários descartaram uma ação e compraram 1.');return massCheck()}
    case 'peace':{const n=alive().length*2+2;S.peace=n+1;fx('🌼','Ações sem efeito por alguns turnos','var(--cg)','stamp');log('Paz: cartas de ação sem efeito por alguns turnos.');return 'done'}
    case 'batata':if(pi===0)return 'ask';{const o=opponents(pi);const t=o.length?rand(o):rand(opp),l=alive().filter(i=>i!==pi);return botDefer(pi,'player',l,l.indexOf(t),()=>{giveBatata(pi,card,t);return 'done'})}
    case 'curse':{
      const keys=Object.keys(CURSES).filter(c=>!(R.mess&&c==='shoe')),k=rand(keys),g=S.gen,sp=S.spectate?.35:1;
      S.busy=true;clearFlash();hold(99999);
      $('fx').innerHTML='<div class="fxin roul" style="--fxc:#6b2fa3"><div class="fxg" id="roulG" style="color:#6b2fa3"></div><div class="fxcap">Sorteando a maldição…</div></div>';
      const steps=[];let t=0;for(let j=0;j<16;j++){t+=(55+j*j*1.4)*sp;steps.push(t)}
      let idx=Math.floor(Math.random()*keys.length);
      steps.forEach((at,j)=>setTimeout(()=>{if(g!==S.gen)return;const el=$('roulG');if(!el)return;
        idx=j===steps.length-1?keys.indexOf(k):(idx+1)%keys.length;el.textContent=CURSES[keys[idx]].g;
        if(!RM)el.animate([{transform:'scale(.8)'},{transform:'none'}],{duration:120});sfx('tick')},at));
      setTimeout(()=>{
        if(g!==S.gen||S.phase==='over')return;
        S.curse={k,left:CURSES[k].n*alive().length+2};FX3D.aura('#8b3fd1');
        S.fxUntil=0;fx(CURSES[k].g,`Maldição ${CURSES[k].nm}: ${CURSES[k].t}`,'#6b2fa3','slam',2600*sp);
        log(`Maldição ${CURSES[k].nm}: ${CURSES[k].t.toLowerCase()}.`);render();
        setTimeout(()=>{if(g!==S.gen||S.phase==='over')return;S.busy=false;render();endTurn()},2500*sp);
      },steps[steps.length-1]+250*sp);
      return 'defer'}
    case 'dice':{
      const t=nextIdx(pi,1),g=S.gen;S.busy=true;clearFlash();
      const n=1+Math.floor(Math.random()*6);
      const d3=FX3D.available()&&FX3D.rollDie(n);
      if(d3){sfx('dice');hold(3000);S.annText=`${t===0?'Você rola':who(t)+' rola'} o dado…`;S.announcing=true;render()}
      else fx('🎲',`${t===0?'Você rola':who(t)+' rola'} o dado…`,'var(--accent)','roll',1100);
      setTimeout(()=>{
        if(g!==S.gen||S.phase==='over')return;
        rollDice(pi,t,()=>{if(g!==S.gen||S.phase==='over')return;S.busy=false;render();if(S.phase!=='over')endTurn()},n,d3);
      },S.spectate?500:(d3?1450:900));
      return 'defer'}
    case 'oddeven':S.traffic=S.traffic==='odd'?'even':S.traffic==='even'?'odd':rand(['odd','even']);
      fx('🚦',`Proibido vencer com cartas ${S.traffic==='odd'?'ímpares':'pares'}`,col,'stamp');log(`Semáforo: proibido vencer com ${S.traffic==='odd'?'ímpares':'pares'}.`);return 'done';
    case 'death':S.death=true;fx('☠️','Morte súbita! Quem comprar ou errar é eliminado','#0d0a14','slam');log('Morte súbita ativada.');return 'done';
    case 'share':{
      const copies=shuffle([...p.hand]).slice(0,10).map(c=>{const n=mk(c.color,c.type,c.value);n.extra=true;return n});
      copies.forEach((c,k)=>{const t=rand(opp);if(t==null)return;S.players[t].hand.push(c);S.players[t].called=false;if(t===0){S.newIds.push(c.id);S.handFrom=targetRect(pi)}else ghost(targetRect(pi),targetRect(t),k*50)});
      fx('🤲',`${who(pi)} partilhou ${copies.length} cópia${copies.length===1?'':'s'}`,col,'slam');log(`${who(pi)} deu ${copies.length} cópias das suas cartas.`);return massCheck()}
    case 'simon':
      if(pi===0)return 'ask';{
        const seq=[...S.simon];const ok=!seq.length||Math.random()<Math.pow({easy:.6,normal:.85,hard:.95,master:.98}[R.diff],seq.length);
        const col=bestColor(p.hand);S.busy=true;clearFlash();
        const fin=r=>{S.busy=false;if(r==='win'||S.phase==='over')return;render();endTurn()};
        const pickCol=()=>{const cols=COLORS.filter(c=>!(R.bg&&c==='g'));S.busy=true;botThink(pi,'color',cols,Math.max(0,cols.findIndex(c=>sameCol(c,col))),()=>fin(resolveSimon(pi,card,true,col)))};
        if(!seq.length){pickCol();return 'defer'}
        botTypeSimon(pi,seq,ok,()=>{if(ok)pickCol();else fin(resolveSimon(pi,card,false))});
        return 'defer'}
    case 'chair':{
      const idx=alive().filter(i=>i!==0&&i!==pi);
      if(R.team||idx.length<2){fx('🪑','Ninguém trocou de lugar',col,'stamp');return 'done'}
      S.seatFlip=Object.fromEntries([...document.querySelectorAll('#seatrow .seat')].map(e=>[e.dataset.name,e.getBoundingClientRect()]));
      const objs=shuffle(idx.map(i=>S.players[i]));idx.forEach((i,k)=>S.players[i]=objs[k]);
      fx('🪑','Os adversários trocaram de lugar',col,'slam');log('Dança: os adversários trocaram de lugar.');return 'done'}
    case 'view':
      opp.forEach(i=>{const q=S.players[i];if(q.hand.length&&i!==0)peek(i,rand(q.hand))});
      fx('👁️','Todos mostram uma carta',col,'stamp');log('Clarividência: todos mostraram uma carta.');return 'done';
    case 'treasure':{
      p.treasure=(p.treasure||0)+1;
      if(p.treasure>=3){p.treasure=0;const c=mk(card.color,'chest');c.extra=true;p.hand.push(c);p.called=false;if(pi===0){S.newIds.push(c.id);S.handFrom=discardRect()}
        fx('💰',`${who(pi)} achou a Carta do Tesouro!`,'var(--cy)','slam');log(`${who(pi)} recebeu a Carta do Tesouro.`)}
      else{fx('🧭',`Busca de ${pi===0?'você':who(pi)}: ${p.treasure}/3`,col,'stamp')}
      return 'done'}
    case 'lock':
      opp.forEach(i=>{const free=shuffle(S.players[i].hand.filter(c=>!c.lock)).slice(0,2);free.forEach(c=>c.lock=true);if(free.length)stampOn(i,'🔒',col)});
      fx('🔒','Duas cartas trancadas por jogador',col,'stamp');log('Tranca: duas cartas de cada adversário trancadas.');return 'done';
    case 'theft':if(pi===0)return 'ask';{const o=opponents(pi);const t=o.length?(R.diff==='easy'?rand(o):o.reduce((a,b)=>S.players[b].hand.length>S.players[a].hand.length?b:a)):rand(opp),l=alive().filter(i=>i!==pi);return botDefer(pi,'player',l,l.indexOf(t),()=>stealWild(pi,t))}
    case 'ban':if(!p.hand.length)return 'done';if(pi===0)return 'ask';{const o3=shuffle([...p.hand]).slice(0,3),pk=rand(o3);return botDefer(pi,'down',o3,o3.indexOf(pk),()=>banType(pi,pk))}
    case 'box':
      alive().forEach((i,k)=>{const c=mk('w','random');c.extra=true;S.players[i].hand.push(c);S.players[i].called=false;if(i===0){S.newIds.push(c.id)}else ghost($('deck').getBoundingClientRect(),targetRect(i),k*60)});
      fx('📦','Todos ganham uma Carta Misteriosa',col,'slam');log('Presente: todos ganharam uma Carta Misteriosa.');return massCheck();
    case 'confuse':p.confuseNext=true;fx('🍄',`${pi===0?'Você jogará':who(pi)+' jogará'} aleatoriamente na próxima vez`,col,'stamp');log(`${who(pi)} ficará confuso.`);return 'done';
    case 'ink':{
      const t=nextIdx(pi,1);S.players[t].hand.forEach(c=>{if(c.color!=='w'){if(c.baseColor==null)c.baseColor=c.color;c.color=card.color}});
      stampOn(t,'🖌️',col);fx('🖌️',`Cartas de ${t===0?'você':who(t)} pintadas de ${CNAME[card.color].toLowerCase()}`,col,'slam');log(`Tinta: cartas de ${who(t)} pintadas.`);return 'done'}
    case 'mix1':case 'mix2':case 'mix3':{
      if(T!=='mix3'){S.dir*=-1;S.flipArrows=true;const r=$('dirring');r.classList.remove('flipped');void r.offsetWidth;r.classList.add('flipped')}
      const a=nextIdx(pi,1);
      if(T==='mix1'){S.skip=1;stampOn(a,'⊘','var(--cr)');fx(ARROWS,`Inverte e ${a===0?'você perde':who(a)+' perde'} a vez`,'var(--accent)',S.dir===1?'cw':'ccw')}
      if(T==='mix2'){const n=drawAmt(a,2);drawN(a,n);floatOn(a,`+${n}`,'var(--cr)');stampOn(a,'⊘','var(--cr)');S.skip=1;fx(ARROWS,`Inverte e ${a===0?'você compra':who(a)+' compra'} ${n}`,'var(--cr)',S.dir===1?'cw':'ccw')}
      if(T==='mix3'){const b=nextIdx(pi,2);const n=drawAmt(b,2);stampOn(a,'⊘','var(--cr)');drawN(b,n);floatOn(b,`+${n}`,'var(--cr)');stampOn(b,'⊘','var(--cr)');S.skip=2;fx('⊘+2',`${who(a)} perde a vez, ${who(b)} compra ${n}`,'var(--cr)','slam')}
      return massCheck()}
    case 'rule':{
      const opts=ruleOptions(3);
      if(!opts.length){fx('📜','Nenhuma regra nova disponível',col,'stamp');return 'done'}
      if(pi===0)return 'ask';
      {const k=rand(opts);return botDefer(pi,'rule',opts,opts.indexOf(k),()=>{addRule(pi,k,false,()=>{render();endTurn()});return 'defer'})}}
    case 'paradox':{
      if(!p.hand.length)return 'done';const c=rand(p.hand);p.hand=p.hand.filter(x=>x!==c);
      (CARRY[p.name]=CARRY[p.name]||[]).push({color:c.color,type:c.type,value:c.value});
      ghost(targetRect(pi),discardRect(),0);
      fx('⏳',`${pi===0?'Você mandou':who(pi)+' mandou'} uma carta para a próxima partida`,col,'slam');log(`${who(pi)} enviou uma carta para a próxima partida.`);
      return selfCheck(pi)}
    case 'sun':case 'fog':case 'storm':case 'blizzard':{
      const w=WEATHER[T];S.weather=T;S.passes=0;if(T==='blizzard'){S.pending=0;S.pendingType=null;S.chal=null}
      fx(w.g,`${w.n}: ${w.t}`,w.c,'slam');log(`O clima mudou para ${w.n.toLowerCase()}.`);
      if(T==='storm')flashStorm();
      if(T==='fog')S.players.forEach(q=>q.called=false);
      return 'done'}
    case 'portal':if(!S.other)return 'done';portalSequence(pi);return 'defer';
    case 'luck':p.luck=true;fx('🍀',pi===0?'Sua próxima compra será jogável':`Próxima compra de ${who(pi)} será jogável`,'var(--cg)','stamp');log(`${who(pi)} está com sorte.`);return 'done';
  }
  return 'done';
}
function humanAsk(card){
  S.busy=true;render();const g=S.gen;
  if(S.preLanded===card){S.preLanded=null;humanAskOpen(card);return}
  setTimeout(()=>{if(g===S.gen&&S.phase!=='over')humanAskOpen(card)},480);
}
function humanAskOpen(card){
  const T=card.type;
  const fin=r=>{S.busy=false;if(r==='win')return;endTurn()};
  const others=alive().filter(i=>i!==0);
  if(T==='trade')openTarget('Trocar de mão com…','Escolha com quem trocar todas as cartas.',others,t=>{swapHands(0,t);fin('done')});
  else if(T==='gift'&&others.some(i=>!ab(i,'papaille')))openTarget('Doar uma carta para…','Uma carta aleatória da sua mão vai para quem você escolher.',others.filter(i=>!ab(i,'papaille')),t=>fin(giftCard(0,t)));
  else if(T==='web')openTarget('Prender na teia…','Quem você escolher perde a próxima vez.',others,t=>{webOn(0,t);fin('done')});
  else if(T==='rule'){const o=ruleOptions(3);if(!o.length)fin('done');else openRuleChoice(o,k=>{addRule(0,k,false,()=>fin('done'))})}
  else if(T==='batata')openTarget('Passar a batata para…','Quem ficar 5 turnos com ela é eliminado.',others,t=>{giveBatata(0,card,t);fin('done')});
  else if(T==='theft')openTarget('Roubar um curinga de…','Se ele tiver um curinga, ele vai para a sua mão.',others,t=>fin(stealWild(0,t)));
  else if(T==='ban')openPick(shuffle([...S.players[0].hand]).slice(0,3),c=>fin(banType(0,c)),'Carta do Banimento','Escolha uma carta. Todas as cartas com o mesmo símbolo saem do jogo.');
  else if(T==='simon'){
    if(!S.simon.length)openColors(col=>fin(resolveSimon(0,card,true,col)),card);
    else openSimon(S.simon.length,taps=>{
      const ok=taps.length===S.simon.length&&taps.every((c,i)=>sameCol(c,S.simon[i]));
      if(ok){S.busy=true;openColors(col=>fin(resolveSimon(0,card,true,col)),card)}else fin(resolveSimon(0,card,false));
    });
  }
  else if(T==='wish')openPick(wishOptions(),c=>{wishSwap(0,c);fin('done')},'Carta do Desejo','Escolha uma carta da pilha. Uma carta aleatória sua vai para a pilha no lugar.');
  else fin('done');
  if(S.auto&&S.autoResolve)setTimeout(()=>S.autoResolve&&S.autoResolve(),800);
}

/* ---------- trade / carousel ---------- */
function handTo(i,hand,fromIdx){
  S.players[i].hand=hand;memReset(i);
  if(i===0){S.newIds=hand.map(c=>c.id);S.handFrom=targetRect(fromIdx)}
}
function graceCalls(){S.players.forEach(p=>{p.called=p.hand.length<=target()})}
function swapHands(a,b){
  if(b==null||b<0)return;
  const ha=S.players[a].hand,hb=S.players[b].hand;
  const ra=targetRect(a),rb=targetRect(b);
  for(let k=0;k<3;k++){ghost(ra,rb,k*80);ghost(rb,ra,k*80)}
  handTo(a,hb,b);handTo(b,ha,a);graceCalls();
  fx('⇆',`${who(a)} ⇆ ${who(b)}`,'var(--cb)','stamp');hold(1000);
  log(`${who(a)} trocou de mão com ${b===0?'você':who(b)}.`);
}
function rotateHands(){
  FX3D.swirl('orbit',S.dir);
  const ids=alive();const old=Object.fromEntries(ids.map(i=>[i,S.players[i].hand]));
  ids.forEach(i=>{const to=nextIdx(i,1);ghost(targetRect(i),targetRect(to),0)});
  ids.forEach(i=>{const to=nextIdx(i,1);handTo(to,old[i],i)});
  graceCalls();
  fx(ARROWS,'Todos passam as cartas adiante','var(--cb)',S.dir===1?'cw':'ccw');hold(1000);
  log('Todas as mãos giraram no sentido do jogo.');
}
function botSwapTarget(pi){
  let others=alive().filter(i=>i!==pi&&i!==partner(pi));
  if(!others.length)others=alive().filter(i=>i!==pi);
  if(!others.length)return -1;
  if(R.diff==='easy')return rand(others);
  return others.reduce((a,b)=>S.players[b].hand.length<S.players[a].hand.length?b:a);
}

/* ---------- jump-in ---------- */
function canJump(pi,c){
  return R.jumpin&&S.phase==='play'&&!S.busy&&S.turn!==pi&&!S.players[pi].out&&identical(c,topCard());
}
function doJumpIn(pi,card){
  S.tok++;clearFlash();
  S.turn=pi;S.extra=false;S.skip=false;
  if(pi===0)S.mull=false;
  fx('✂',pi===0?'Você cortou!':`Corte de ${who(pi)}!`,'var(--cy)','stamp');
  log(`${who(pi)} cortou a vez!`);
  const go=()=>{
    const r=playCard(pi,card,null);
    if(r==='win'||r==='defer')return;
    if(r==='ask'){if(S.players[pi].bot){endTurn();return}S.preLanded=card;humanAsk(card);return}
    if(r==='combo'){S.tok++;render();if(S.players[pi].bot)scheduleBot();else if(R.flash||curseIs('time'))startFlash();return}
    endTurn();
  };
  if(card.type!=='num'||(S.weather==='storm'&&card.value===0)){announce(pi,card,go,S.spectate?250:480);return}
  go();
}
function scheduleJumps(){
  if(!R.jumpin||S.phase!=='play')return;
  const tok=S.tok,g=S.gen,p=DIFF[R.diff].jump;
  const humanTurn=S.turn===0;
  alive().forEach(i=>{
    if(i===S.turn||!S.players[i].bot)return;
    const c=S.players[i].hand.find(x=>identical(x,topCard()));
    if(!c||Math.random()>p)return;
    setTimeout(()=>{
      if(g!==S.gen||tok!==S.tok||S.phase!=='play'||S.busy)return;
      if(!S.players[i].hand.includes(c)||!identical(c,topCard()))return;
      doJumpIn(i,c);
    },(humanTurn?1600:500)+Math.random()*(humanTurn?1000:500));
  });
}
