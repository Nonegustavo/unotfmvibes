/* unotfm solo: jogador humano, renderização, janelas, configurações, ligações de eventos e PWA */
/* ---------- human ---------- */
const myTurn=()=>S&&S.phase!=='over'&&S.turn===0&&!S.busy&&!S.auto&&!S.players[0].out;
function humanClick(id,el){
  if(!S||S.phase==='over')return;
  const me=S.players[0];const card=me.hand.find(c=>c.id===id);if(!card)return;
  if(!myTurn()){if(canJump(0,card))doJumpIn(0,card);return}
  if(!canPlay(me,card)){
    el.classList.remove('shake');void el.offsetWidth;el.classList.add('shake');sfx('error');
    return;
  }
  humanPlay(card);
}
function humanPlay(card){
  S.mull=false;
  // a última carta (com Duas mãos, só a última da segunda mão) vence direto, sem escolhas
  const me=S.players[0],last=me.hand.length===1&&!(me.hand2&&me.hand2.length);
  if(last&&(isWildPick(card)||card.type==='clone'||card.type==='random')){announce(0,card,()=>{S.preLanded=card;finishHuman(card,null)},480);return}
  if(S.peace>0&&card.color==='w'){announce(0,card,()=>{S.preLanded=card;finishHuman(card,null)},480);return}
  if(isWildPick(card)){announce(0,card,()=>{S.busy=true;render();openColors(col=>finishHuman(card,col),card)},480);return}
  if(card.type==='clone'||card.type==='random'){
    announce(0,card,()=>{if(isWildPick(card)){S.busy=true;render();openColors(col=>finishHuman(card,col),card)}else{S.preLanded=card;finishHuman(card,null)}});
    return;
  }
  if(card.type!=='num'){announce(0,card,()=>{S.preLanded=card;finishHuman(card,null)},480);return}
  finishHuman(card,null);
}
function finishHuman(card,col){
  S.busy=false;
  const r=playCard(0,card,col);
  if(r==='win'||r==='defer')return;
  if(r==='ask'){humanAsk(card);return}
  if(r==='combo'){S.tok++;render();if(R.flash||curseIs('time'))startFlash();return}
  endTurn();
}
function humanMain(){
  if(!myTurn())return;
  if(S.phase==='combo'||S.phase==='drawn'){endTurn();return}
  takeDraw(0);
}
function humanUno(){
  const me=S&&S.players[0];if(!me||me.called||S.phase==='over')return;
  if(me.hand.length===target()||(me.hand.length===target()+1&&S.turn===0)){me.called=true;sfx('uno');log(`Você: ${word()}!`);toast(`${word()}!`,'var(--cr)');render()}
}
function humanCatch(i){const p=S.players[i];if(p.hand.length===target()&&!p.called&&S.phase!=='over')penalize(i,0)}
function mulligan(){
  if(!S.mull||S.phase==='over')return;
  const me=S.players[0];const n=me.hand.length;
  S.deck.unshift(...me.hand);shuffle(S.deck);me.hand=[];
  drawN(0,n);S.mull=false;log('Você trocou sua mão.');toast('Mão nova!');
  if(overloaded(0)&&markOut(0))return;render();
}

/* ---------- flash ---------- */
function clearFlash(){if(flashT){clearInterval(flashT);flashT=null}$('flash').classList.remove('show')}
function startFlash(){
  clearFlash();
  const dur=curseIs('time')?3000:5000;const end=Date.now()+dur,g=S.gen,tok=S.tok;
  $('flash').classList.add('show');
  flashT=setInterval(()=>{
    const left=end-Date.now();
    $('flashBar').style.width=Math.max(0,left/dur*100)+'%';
    const sec=Math.ceil(left/1000);if(left>0&&sec<=3&&sec!==S.lastTick){S.lastTick=sec;sfx('tick')}
    if(left>0)return;
    clearFlash();
    if(g!==S.gen||tok!==S.tok||S.phase==='over'||S.turn!==0)return;
    toast('Tempo esgotado!','var(--cr)');log('Tempo esgotado!');
    if(S.busy&&S.autoResolve){S.autoResolve();return}
    if(S.phase==='combo'||S.phase==='drawn'){endTurn();return}
    if(S.pending>0){takeDraw(0);return}
    if(noDraw(0)){if(!markOut(0))endTurn();return}
    if(!curseIs('ice'))drawN(0,drawAmt(0,1));if(overloaded(0)&&markOut(0))return;endTurn();
  },60);
}

/* ---------- animation helpers ---------- */
function flyClone(target,from,o={}){
  if(RM||!target||!from)return;
  const r=target.getBoundingClientRect(),w=target.offsetWidth,h=target.offsetHeight;if(!w)return;
  const cx=r.left+r.width/2,cy=r.top+r.height/2;
  const g=target.cloneNode(true);g.classList.add('flyclone');g.querySelectorAll('.cb').forEach(x=>x.remove());g.removeAttribute('data-id');
  Object.assign(g.style,{position:'fixed',left:(cx-w/2)+'px',top:(cy-h/2)+'px',width:w+'px',height:h+'px',margin:'0',zIndex:6,pointerEvents:'none',transition:'none',visibility:'visible'});
  g.style.setProperty('--cw',w+'px'); // fora da mesa a cópia herdaria o --cw da mão: mantém as proporções da carta de destino
  document.body.appendChild(g);
  target.style.visibility='hidden';
  const dx=from.left+from.width/2-cx,dy=from.top+from.height/2-cy;
  const sc=Math.max(.35,Math.min(1.3,from.width/w));
  const a=g.animate([{transform:`translate(${dx}px,${dy}px) rotate(${o.rot||0}deg) scale(${sc})`},{transform:`rotate(${o.endRot||0}deg)`}],
    {duration:o.dur||420,delay:o.delay||0,easing:'cubic-bezier(.2,.9,.25,1.05)',fill:'both'});
  const end=()=>{g.remove();target.style.visibility=''};
  a.onfinish=end;a.oncancel=end;setTimeout(end,(o.delay||0)+(o.dur||420)+400);
}
function flyFrom(el,from,o={}){
  if(RM||!el||!from)return;
  const to=el.getBoundingClientRect();
  const dx=from.left+from.width/2-(to.left+to.width/2),dy=from.top+from.height/2-(to.top+to.height/2);
  const s=Math.max(.35,Math.min(1.2,from.width/to.width));
  el.animate([{transform:`translate(${dx}px,${dy}px) rotate(${o.rot||0}deg) scale(${s})`,opacity:o.fade?0:1},{transform:'none',opacity:1}],
    {duration:o.dur||420,delay:o.delay||0,easing:'cubic-bezier(.2,.9,.25,1.05)',fill:'backwards'});
}
function ghost(from,to,delay){
  if(RM||!from||!to)return;
  const g=document.createElement('div');g.className='card back ghost';g.innerHTML='<span class="face">unotfm</span>';
  const cw=$('deck').getBoundingClientRect().width,ch=cw*1.5;
  g.style.left=(from.left+from.width/2-cw/2)+'px';g.style.top=(from.top+from.height/2-ch/2)+'px';g.style.width=cw+'px';g.style.setProperty('--cw',cw+'px');
  document.body.appendChild(g);
  const dx=to.left+to.width/2-(from.left+from.width/2),dy=to.top+to.height/2-(from.top+from.height/2);
  const a=g.animate([{transform:'none',opacity:1},{transform:`translate(${dx}px,${dy}px) scale(.35) rotate(20deg)`,opacity:.2}],{duration:430,delay,easing:'cubic-bezier(.4,.1,.3,1)',fill:'both'});
  a.onfinish=()=>g.remove();
}

/* ---------- rendering ---------- */
function faceHTML(c){
  if(c.type==='num')return `<span class="cn">${c.value}</span><span class="face">${c.value}</span><span class="cn br">${c.value}</span>`;
  if(SP[c.type]){const g=SP[c.type].g,sm=SP[c.type].small?' sm':'';return `${WEATHER[c.type]?'<span class="wxf"></span>':''}<span class="cn${sm}">${g}</span><span class="face sym sp${sm}">${g}</span><span class="cn br${sm}">${g}</span>`}
  const sym={skip:'⊘',rev:'⇄',d2:'+2'}[c.type];
  if(sym)return `<span class="cn">${sym}</span><span class="face sym">${sym}</span><span class="cn br">${sym}</span>`;
  if(c.type==='wild')return `<span class="cn"><i class="mw"></i></span><span class="wheel"></span><span class="cn br"><i class="mw"></i></span>`;
  return `<span class="cn">+4</span><span class="wheel"><span>+4</span></span><span class="cn br">+4</span>`;
}
function makeCard(c){
  const b=document.createElement('button');b.dataset.id=c.id;b.innerHTML=faceHTML(c);b.setAttribute('aria-label',cardName(c));return b;
}
function baseMatch(c){
  const t=topCard();
  if(c.color==='w')return true;
  if(S.color==='k')return c.type===t.type&&(c.type!=='num'||c.value===t.value);
  if(c.color===S.color)return true;
  if(c.type!=='num')return c.type===t.type;
  return t.type==='num'&&c.value===t.value&&!R.neighbor;
}
function blockReason(p,c){
  if(S.phase!=='play'||S.pending>0)return null;
  if(c.lock)return '🔒';
  if(R.clean&&p.hand.length===1&&c.type!=='num')return '🧼';
  if(S.traffic&&p.hand.length===1&&c.type==='num'&&((c.value%2===1)===(S.traffic==='odd')))return '🚦';
  const t=topCard();if(!t)return null;
  if(R.neighbor&&c.type==='num'&&t.type==='num'&&c.value===t.value&&!sameCol(c.color,S.color))return '↕️';
  return null;
}
function cardBadges(p,c,turn){
  const b=[];
  if(c.lock){b.push('🔒');b.blocked=true}
  else if(turn&&!canPlay(p,c)){const br=blockReason(p,c);if(br){b.push(br);b.blocked=true}}
  if(turn&&canPlay(p,c)){
    if(S.phase==='combo')b.push(R.stack&&c.type==='num'&&c.value===S.comboValue?'📚':'🔢');
    else if(S.pending>0)b.push(R.nou&&c.type==='rev'&&!isDraw(c)?'↩️':'🛡️');
    // também depois de comprar (fase 'drawn'), quando dá para jogar qualquer carta jogável (o Sol também cobra +1)
    else if((S.phase==='play'||S.phase==='drawn')&&!baseMatch(c)){
      const t=topCard();
      if(R.bg&&S.color!=='k'&&sameCol(c.color,S.color)){}
      else if(R.hell&&c.type!=='num'&&t.type!=='num')b.push('🔥');
      else if(R.neighbor&&c.type==='num'&&t.type==='num'&&Math.abs(c.value-t.value)===1)b.push('↕️');
      else if(S.weather==='sun')b.push('☀️+1');
    }
  }else if(!turn&&canJump(0,c))b.push('✂️');
  if(c.type==='batata')b.push(`🥔 ${p.batata||0}/5`);
  if(R.perfection&&c.type==='num'&&c.value===p.hand.length)b.push('💯');
  if(S.peace>0&&c.type!=='num')b.push('🌼');
  if(turn&&S.weather==='storm'&&canPlay(p,c)&&(c.color==='w'?S.peace<=0:!sameCol(c.color,S.color)))b.push('⛈️');
  if(curseOn('shoe',0)&&c.type!=='num')b.push('👢');
  return b;
}
function sortHand(h){
  const o={r:0,y:1,g:2,b:3,w:4},t={num:0,skip:1,rev:2,d2:3,wild:4,d4:5};
  return [...h].sort((a,b)=>o[a.color]-o[b.color]||(t[a.type]??6)-(t[b.type]??6)||a.type.localeCompare(b.type)||(a.value??0)-(b.value??0));
}
function statusText(){
  if(S.phase==='over')return 'Fim da rodada';
  const p=cur();
  if(S.players[0].out)return 'Você foi eliminado. Assistindo os adversários…';
  if(S.announcing&&S.annText)return S.annText;
  if(p.bot)return '';
  if(S.busy)return ['colorOv','pickOv','swapOv','simonOv'].some(id=>$(id).classList.contains('show'))?'Escolha…':'';
  if(S.phase==='combo'){
    const parts=[];if(R.stack)parts.push(`outro ${S.comboValue}`);if(R.sequence)parts.push('continue a sequência');
    return `Combo: ${parts.join(' ou ')} — ou encerre`;
  }
  if(S.phase==='drawn')return 'Jogue uma carta ou passe';
  if(R.satisfaction&&S.drawnId!=null&&S.phase==='play')return 'Compra Implacável: compre até poder jogar';
  if(S.pending>0){
    const any=S.players[0].hand.some(c=>canPlay(S.players[0],c));
    return any?`Defenda o +${S.pending} ou compre`:`Você compra ${S.pending}`;
  }
  return 'Sua vez';
}
function seatStatus(i){
  const p=S.players[i],L=[];if(p.out)return L;
  if(TOUR&&i===0)L.push(tourItem('Você'));
  const n=p.hand.length;
  const shiny=R.shiny&&colorful(p);
  const camo=R.camouflage&&n!==1&&S.phase!=='over',fog=S.weather==='fog'&&S.phase!=='over';
  if(p.webbed)L.push({ic:'🕸️',short:'🕸️',name:'Teia',txt:'perde a próxima vez'});
  if(p.hand.some(c=>c.type==='batata')&&p.batata)L.push({ic:'🥔',short:`🥔${p.batata}`,name:'Batata',txt:`está com ela há ${p.batata}/5 turnos. Se ainda estiver com ela no fim do quinto, é eliminado`});
  if(p.treasure)L.push({ic:'🧭',short:`🧭${p.treasure}`,name:'Busca',txt:`jogou ${p.treasure}/3, na terceira ganha a Carta do Tesouro`});
  if(p.hand2&&p.hand2.length)L.push({ic:'✋',short:`✋${p.hand2.length}`,name:'Segunda mão',txt:`${p.hand2.length} carta${p.hand2.length===1?'':'s'} pendente${p.hand2.length===1?'':'s'} na segunda mão`});
  if(S.other){const k=S.other.players[i].hand.length;
    // no outro lado, a Camuflagem (até ter 1 carta) e a Neblina escondem a quantidade dos adversários
    const hid=i!==0&&!S.other.players[i].out&&((S.other.R.camouflage&&k!==1)||S.other.weather==='fog');
    L.push({ic:'🌀',short:`🌀${hid?'?':k}`,name:'Portal',txt:hid?'quantidade de cartas no outro lado oculta':`${k} carta${k===1?'':'s'} no outro lado`})}
  if(shiny)L.push({ic:'🌈',short:'🌈',name:'Mão Colorida',txt:'tem todas as cores ou um curinga'});
  if(p.luck)L.push({ic:'🍀',short:'🍀',name:'Sorte',txt:'a próxima compra será uma carta jogável'});
  if(p.confuse)L.push({ic:'🍄',short:'🍄',name:'Confusão',txt:'a próxima jogada será aleatória'});
  if(camo&&!fog)L.push({ic:'😶‍🌫️',short:'😶‍🌫️',name:'Camuflagem',txt:'quantidade de cartas ocultada até ter 1 carta'});
  if(fog)L.push({ic:'☁️',short:'☁️',name:'Neblina',txt:'quantidade de cartas ocultada até mudar o clima'});
  return L;
}
const OUT_INFO={'+99':['+99','comprou as cartas do +99'],'💣':['Bomba','comprou a Carta Bomba'],'🏋️':['Sobrecarga','passou de 10 cartas na mão'],'☠️':['Morte súbita','precisou comprar ou cometeu um erro durante a Morte súbita'],'🥔':['Batata','ficou 5 turnos com a Batata'],'🌵':['Maldição do espinho','comprou cartas com a maldição ativa']};
function seatInfoItems(i){
  const p=S.players[i];
  if(p.out){const ic=p.outIcon||'✖';const inf=OUT_INFO[ic]||['Limite de cartas',`passou de ${ic} cartas na mão`];return [{ic,name:inf[0],txt:inf[1]},...(TOUR?[tourItem(p.name)]:[])]}
  const L=seatStatus(i);
  if(TOUR)L.unshift(tourItem(p.name));
  if(partner(i)===0)L.unshift({ic:'🤝',name:'Sua dupla',txt:'se ele vencer, você vence junto'});
  return L;
}
/* Torneio e Torneio de sobrevivência: pontos de cada jogador (selo na cadeira e no seu selo) e classificação (selo da mesa) */
const tourIc=()=>TOUR.mode==='tournament'?'🏆':'🏅';
const tourGoal=()=>TOUR.mode==='tournament'?500:300;
function tourItem(name){
  const pts=TOUR.pts[name]||0,me=name==='Você';
  return {ic:tourIc(),short:`${tourIc()}${pts}`,name:TOUR.mode==='tournament'?'Torneio':'Sobrevivência',
    txt:`${me?'você tem':'tem'} ${pts} de ${tourGoal()} pontos. ${TOUR.mode==='tournament'?`Quem chegar a ${tourGoal()} vence o torneio`:`Quem chegar a ${tourGoal()} sai do torneio`}`};
}
function tourRanking(){
  const all=['Você',...TOUR.names],up=TOUR.mode==='tournament';
  const sorted=all.sort((a,b)=>{const oa=TOUR.out.includes(a),ob=TOUR.out.includes(b);if(oa!==ob)return oa?1:-1;return up?TOUR.pts[b]-TOUR.pts[a]:TOUR.pts[a]-TOUR.pts[b]});
  return sorted.map((n,k)=>({ic:TOUR.out.includes(n)?'✖':`${k+1}º`,name:n,txt:`${TOUR.pts[n]||0} pontos${TOUR.out.includes(n)?' (fora do torneio)':''}`}));
}
// selos do monte de compra (regras e efeitos que mudam a compra), com a explicação de cada um
function deckBadges(){
  const L=[],rule=(k,ic)=>{if(R[k])L.push({ic,name:RNAME[k],txt:(RULES.find(x=>x.k===k)||{}).d||''})};
  rule('revelation','🔦');rule('satisfaction','😤');rule('insatisfaction','👋');rule('tracking','🔎');rule('fastdraw','⏩');
  if(S.death)L.push({ic:'☠️',name:'Morte súbita',txt:'quem precisar comprar ou cometer um erro é eliminado'});
  if(S.curse&&S.curse.k!=='shoe'){const c=CURSES[S.curse.k];L.push({ic:c.g,name:`Maldição ${c.nm}`,txt:`${c.t.toLowerCase()}. Faltam ${S.curse.left} turno${S.curse.left===1?'':'s'}`})}
  if(S.weather==='blizzard'){const w=WEATHER.blizzard;L.push({ic:w.g,name:`Clima ${w.n}`,txt:w.t})}
  return L;
}
function showDeckInfo(){const L=S?deckBadges():[];if(!L.length)return false;infoPopup('deck','',L,$('deck'),true);buzz(15);return true}
function tableStatus(){
  const L=[];
  if(S.weather){const w=WEATHER[S.weather];L.push({short:w.g,ic:w.g,name:`Clima ${w.n}`,txt:w.t})}
  if(S.curse){const c=CURSES[S.curse.k];L.push({short:`${c.g}${S.curse.left}`,ic:c.g,name:`Maldição ${c.nm}`,txt:`${c.t.toLowerCase()}. Faltam ${S.curse.left} turno${S.curse.left===1?'':'s'}`,warn:1})}
  if(S.peace>0)L.push({short:`🌼${S.peace}`,ic:'🌼',name:'Paz',txt:`cartas de ação não têm efeito. Faltam ${S.peace} turno${S.peace===1?'':'s'}`});
  if(S.death)L.push({short:'☠️',ic:'☠️',name:'Morte súbita',txt:'quem precisar comprar ou cometer um erro é eliminado',warn:1});
  if(S.traffic)L.push({short:`🚦${S.traffic==='odd'?'ímpar':'par'}`,ic:'🚦',name:'Semáforo',txt:`proibido vencer com carta ${S.traffic==='odd'?'ímpar':'par'}`});
  if(R.overload)L.push({short:`🏋️${limit()}`,ic:'🏋️',name:'Sobrecarga',txt:`quem passar de ${limit()} cartas na mão é eliminado`});
  if(S.simon&&S.simon.length)L.push({short:`🧠${S.simon.length}`,ic:'🧠',name:'Memorização',txt:`a sequência a repetir tem ${S.simon.length} cor${S.simon.length===1?'':'es'}`});
  if(TOUR){const nm=TOUR.mode==='tournament'?'Torneio':'Torneio de sobrevivência',head={ic:tourIc(),name:`${nm}, rodada ${TOUR.round}`,txt:TOUR.mode==='tournament'?`o primeiro a ${tourGoal()} pontos vence`:`quem chega a ${tourGoal()} pontos sai. Vence quem sobrar`};
    L.push({...head,short:`${tourIc()}${TOUR.round}ª`,rows:[head,...tourRanking()]})}
  return L;
}
function infoPopup(key,head,items,anchor,up,force){
  const box=$('notices');const open=box.querySelector(`[data-info="${key}"]`);box.innerHTML='';document.querySelectorAll('.ri.on').forEach(x=>x.classList.remove('on'));
  if(open||(!items.length&&!force))return;
  const arrow=!key.startsWith('card');
  const el=document.createElement('div');el.className='notice seatinfo'+(arrow?' pointed':'');el.dataset.info=key;
  el.innerHTML=`${head}${items.map(x=>`<div class="si-row"><span class="si-ic">${x.ic}</span><span><b>${x.name}:</b> ${x.txt}</span></div>`).join('')}`;
  el.onclick=()=>el.remove();
  const r=anchor.getBoundingClientRect();box.style.top=(r.bottom+12)+'px';box.appendChild(el);
  // usa a posição do ícone no momento da abertura: o render() pode trocar o elemento antes do próximo quadro
  requestAnimationFrame(()=>{const rr=r;let br=el.getBoundingClientRect();
    if(up||br.bottom>innerHeight-8){box.style.top=Math.max(8,rr.top-12-br.height)+'px';el.classList.add('up');br=el.getBoundingClientRect()}
    el.style.setProperty('--ax',Math.max(18,Math.min(br.width-18,rr.left+rr.width/2-br.left))+'px')});
}
function showSeatInfo(i,anchor){
  const p=S.players[i];
  const items=i===0?seatStatus(0).filter(x=>x.ic!=='😶‍🌫️'&&x.ic!=='☁️'):seatInfoItems(i);
  infoPopup('seat'+i,i===0?'<div class="si-head"><b>Você</b></div>':`<div class="si-head"><span class="si-av" style="background:${p.col}">${p.name[0]}</span><b>${p.name}</b>${p.out?'<em>eliminado</em>':''}</div>`,items,anchor,i===0);
}
function showSeatInfoOld(i,anchor){
  const items=seatInfoItems(i);if(!items.length)return;
  const box=$('notices');const open=box.querySelector(`[data-seat-info="${i}"]`);box.innerHTML='';document.querySelectorAll('.ri.on').forEach(x=>x.classList.remove('on'));
  if(open)return;
  const p=S.players[i];
  const el=document.createElement('div');el.className='notice seatinfo pointed';el.dataset.seatInfo=i;
  el.innerHTML=`<div class="si-head"><span class="si-av" style="background:${p.col}">${p.name[0]}</span><b>${p.name}</b>${p.out?'<em>eliminado</em>':''}</div>${items.map(x=>`<div class="si-row"><span class="si-ic">${x.ic}</span><span><b>${x.name}:</b> ${x.txt}</span></div>`).join('')}`;
  el.onclick=()=>el.remove();
  const r=anchor.getBoundingClientRect();box.style.top=(r.bottom+12)+'px';box.appendChild(el);
  requestAnimationFrame(()=>{const rr=anchor.getBoundingClientRect(),br=el.getBoundingClientRect();el.style.setProperty('--ax',Math.max(18,Math.min(br.width-18,rr.left+rr.width/2-br.left))+'px')});
}
/* Número de cartas nas cadeiras: anda uma unidade por vez até a quantidade real (a contagem inteira leva até ~0,7 s,
   então quanto mais cartas, mais rápido), pulsando verde ao diminuir e vermelho ao aumentar. Oculto (Neblina,
   Camuflagem), em trocas de mão e no Portal (S.cntJump) o número muda direto, sem pulso */
const CNT={gen:null,shown:{},timer:{},step:{},flash:{}};
// a cor verde/vermelha fica firme por CNT_HOLD ms depois do último passo e volta em CNT_FADE ms
// (refeita a cada render, que recria as cadeiras, a partir do ponto em que estava)
const CNT_HOLD=100,CNT_FADE=400;
function cntColor(el,i){
  const f=CNT.flash[i];if(!el||!f||el.classList.contains('said')||el.textContent==='?')return;
  const t=performance.now()-f.t,tot=CNT_HOLD+CNT_FADE;if(t>=tot){delete CNT.flash[i];return}
  el._col?.cancel();
  el._col=el.animate([{color:f.col},{color:f.col,offset:CNT_HOLD/tot}],{duration:tot,easing:'ease-in'});el._col.currentTime=t;
}
function cntShown(i,n,hidden){
  if(CNT.gen!==S.gen){Object.values(CNT.timer).forEach(clearTimeout);Object.assign(CNT,{gen:S.gen,shown:{},timer:{},step:{},flash:{}})}
  if(CNT.shown[i]==null||hidden||RM||S.cntJump||S.phase==='over'){clearTimeout(CNT.timer[i]);CNT.timer[i]=null;delete CNT.flash[i];return CNT.shown[i]=n}
  const left=Math.abs(n-CNT.shown[i]);
  if(left){const st=Math.max(25,Math.min(110,700/left));CNT.step[i]=CNT.timer[i]?Math.min(CNT.step[i],st):st;if(!CNT.timer[i])CNT.timer[i]=setTimeout(()=>cntTick(i),0)}
  return CNT.shown[i];
}
function cntTick(i){
  const p=S&&S.players[i];CNT.timer[i]=null;if(!p||CNT.gen!==S.gen)return;
  const d=p.hand.length-CNT.shown[i];if(!d)return;
  const v=CNT.shown[i]+=Math.sign(d);
  const el=document.querySelector(`#seatrow [data-seat="${i}"] .cnt`);
  if(el&&!el.classList.contains('said')&&el.textContent!=='?'){
    if(el.classList.contains('nr'))el.textContent=`${v}/${limit()}`;else{el.textContent=v;el.classList.toggle('low',v<=3)}
    el.animate([{scale:'1'},{scale:'1.18',offset:.35},{scale:'1'}],{duration:Math.max(160,Math.min(260,CNT.step[i]*2)),easing:'ease-out'});
    CNT.flash[i]={col:d<0?'#4ade80':'#ff5a52',t:performance.now()};cntColor(el,i);
  }
  if(v!==p.hand.length)CNT.timer[i]=setTimeout(()=>cntTick(i),CNT.step[i]);
}
/* Sentido do jogo: as filas de chevrons andam devagar para onde apontam (--chx, fração de um chevron).
   Ao inverter, viram na hora e aceleram, desacelerando aos poucos até a velocidade normal */
const CHEV={off:0,boost:0,last:0};
function chevFlip(){$('chevs').classList.toggle('ccw',S.dir===-1);CHEV.boost=1}
function chevLoop(t){
  const dt=Math.min(.1,(t-(CHEV.last||t))/1000);CHEV.last=t;
  if(!RM){CHEV.boost*=Math.exp(-dt/.9);CHEV.off=(CHEV.off+dt*.4*(1+9*CHEV.boost))%1;$('chevs').style.setProperty('--chx',CHEV.off.toFixed(4))}
  requestAnimationFrame(chevLoop);
}
/* Maldição do espinho: ramo com espinhos em volta do monte (viewBox com a carta em 8..108 × 7.5..157.5) */
function thornsSVG(){
  const X0=8,Y0=7.5,W=100,H=150,th=[],f=n=>n.toFixed(1);
  const tri=(x,y,nx,ny,len)=>{const b=3.2;len*=1.35;th.push(`<path d="M${f(x-ny*b)} ${f(y+nx*b)}L${f(x+nx*len)} ${f(y+ny*len)}L${f(x+ny*b)} ${f(y-nx*b)}z"/>`)};
  for(let k=0;k<7;k++){const x=X0+16+k*(W-32)/6,l=k%2?5.5:7.5;tri(x,Y0,0,-1,l);tri(x+5,Y0+H,0,1,l)}
  for(let k=0;k<9;k++){const y=Y0+20+k*(H-40)/8,l=k%2?7.5:5.5;tri(X0,y,-1,0,l);tri(X0+W,y+7,1,0,l)}
  [[X0+4,Y0+4,-.7,-.7],[X0+W-4,Y0+4,.7,-.7],[X0+4,Y0+H-4,-.7,.7],[X0+W-4,Y0+H-4,.7,.7]].forEach(([x,y,nx,ny])=>tri(x,y,nx,ny,8));
  const leaves=[[X0+30,Y0,-25],[X0+W,Y0+60,65],[X0+70,Y0+H,160],[X0,Y0+105,-110]].map(([x,y,r])=>`<ellipse cx="${x}" cy="${y}" rx="5.5" ry="2.4" transform="rotate(${r} ${x} ${y})"/>`).join('');
  const rect=a=>`<rect x="${X0}" y="${Y0}" width="${W}" height="${H}" rx="14" fill="none" ${a}/>`;
  return `<svg viewBox="0 0 116 165"><g fill="#e2d7a0" stroke="#5b4b1f" stroke-width=".6" stroke-linejoin="round">${th.join('')}</g>${rect('stroke="#2f6b26" stroke-width="3.6"')}${rect('stroke="#5aa845" stroke-width="1.5" stroke-dasharray="9 6"')}<g fill="#5fae48">${leaves}</g></svg>`;
}
function renderRail(){
  const row=$('seatrow');$('rail').classList.toggle('many',S.players.length>=5);const ccw=S.dir===-1;
  const parts=[];
  S.players.forEach((p,i)=>{
    if(i===0)return;
    const n=p.hand.length;
    const hidden=((R.camouflage&&n!==1)||S.weather==='fog')&&!p.out&&S.phase!=='over';
    const canCatch=S.weather!=='fog'&&n===target()&&!p.called&&!p.out&&S.phase!=='over';
    const said=!p.out&&n===target()&&p.called&&!hidden;
    const lim=limit(),thr=Math.max(3,Math.round(lim*.25)),rem=lim-n;
    const near=!p.out&&!hidden&&lim<999&&rem<thr;const lv=near?Math.min(1,1-rem/thr):0;
    const v=p.out?n:cntShown(i,n,hidden);
    const badge=hidden?'?':said?`${word()}!`:near?`${v}/${lim}`:String(v);
    const ctCls=said?'said':hidden?'':near?'nr':v<=3?'low':'';
    const fanN=hidden?1:Math.min(n,8);
    parts.push(`<div data-name="${p.name}" class="seat ${p.webbed&&!p.out?'webbed':''} ${near?'near':''} ${S.turn===i&&S.phase!=='over'?'on':''} ${p.out?'out':''} ${partner(i)===0?'partner':''}" style="--lv:${lv.toFixed(2)}" data-seat="${i}">
      ${R.team?`<span class="tdot" style="background:${TEAMCOL[teamOf(i)]}" title="${partner(i)===0?'sua dupla':'dupla '+(teamOf(i)+1)}"></span>`:''}
      
      <div class="nm">${p.name}</div>
      <div class="av" style="background:${p.col}">${p.name[0]}</div>
      ${p.out?'<div class="ct">eliminado</div>':`<div class="fan ${hidden?'fog':''}" style="--n:${fanN}" aria-label="${hidden?'quantidade oculta':n+' cartas'}">${Array.from({length:fanN},(_,k)=>`<i style="--k:${k}"></i>`).join('')}${hidden?'<b class="mist"></b>':''}<span class="cnt ${ctCls}">${badge}</span></div>`}
      ${canCatch?`<button class="catch" data-catch="${i}">Pegar!</button>`:p.out?`<span class="tag outic" aria-label="eliminado">${p.outIcon||'✖'}</span>`:(()=>{const st=seatStatus(i).map(x=>x.short);
        return st.length?`<span class="tag stat">${st.join(' ')}</span>`:''})()}${(()=>{const t=[];if(!p.out&&partner(i)===0)t.push('🤝');if(TOUR)t.push(tourItem(p.name).short);
        return t.length?`<span class="tops">${t.map(x=>`<span class="tag top">${x}</span>`).join('')}</span>`:''})()}</div>`);
  });
  row.innerHTML=parts.join('');
  S.cntJump=false;
  Object.keys(CNT.flash).forEach(i=>cntColor(row.querySelector(`[data-seat="${i}"] .cnt`),i));
  $('rail').setAttribute('aria-label',`Ordem de jogada, sentido ${ccw?'anti-horário':'horário'}`);
}
/* turn marker */
let MK={turn:null,ver:0,until:0};
function placeMarker(idx,anim){
  const m=$('marker'),seat=document.querySelector(`#seatrow [data-seat="${idx}"]`);if(!seat)return;
  m.classList.toggle('noanim',!anim||RM);
  m.style.left=(seat.offsetLeft-4)+'px';m.style.top=(seat.offsetTop-4)+'px';
  m.style.width=(seat.offsetWidth+8)+'px';m.style.height=(seat.offsetHeight+8)+'px';m.style.opacity=1;
}
function edgeMarker(side,anim){
  const m=$('marker'),w=m.offsetWidth||80;
  m.classList.toggle('noanim',!anim||RM);
  m.style.left=(side==='right'?$('seatrow').scrollWidth+14:-w-14)+'px';m.style.opacity=0;
}
function scrollToSeat(idx){
  const rail=$('rail'),on=document.querySelector(`#seatrow [data-seat="${idx}"]`);if(!on)return;
  if(on.offsetLeft<rail.scrollLeft||on.offsetLeft+on.offsetWidth>rail.scrollLeft+rail.clientWidth)
    rail.scrollTo({left:on.offsetLeft-rail.clientWidth/2+on.offsetWidth/2,behavior:RM?'auto':'smooth'});
}
function moveMarker(from,to){
  const ver=++MK.ver,m=$('marker');
  const flow=S.dir===1?'right':'left',enter=S.dir===1?'left':'right';
  if(to!==0)scrollToSeat(to);
  if(from===null){if(to===0)edgeMarker(flow,false);else placeMarker(to,false);return}
  if(from===to){placeMarker(to,true);m.classList.remove('again');void m.offsetWidth;m.classList.add('again');return}
  const wrap=from===0||to===0||(S.dir===1?to<from:to>from);
  if(!wrap){placeMarker(to,true);return}
  MK.until=Date.now()+900;
  if(from!==0)edgeMarker(flow,true);
  if(to===0)return;
  setTimeout(()=>{
    if(ver!==MK.ver)return;
    edgeMarker(enter,false);void m.offsetWidth;
    requestAnimationFrame(()=>{if(ver===MK.ver)placeMarker(to,true)});
  },from!==0?420:0);
}
function render(){
  if(!S)return;
  const me=S.players[0];
  const railScroll=$('rail').scrollLeft;
  renderRail();$('rail').scrollLeft=railScroll;renderRuleStrip();
  if(S.pendingInfo){const k=S.pendingInfo;S.pendingInfo=null;setTimeout(()=>showRuleInfo(k),120)}
  if(S.seatFlip){const old=S.seatFlip;S.seatFlip=null;if(!RM)document.querySelectorAll('#seatrow .seat').forEach(e=>{const o=old[e.dataset.name];if(!o)return;const n=e.getBoundingClientRect();const dx=o.left-n.left;if(Math.abs(dx)>2)e.animate([{transform:`translateX(${dx}px)`},{transform:'none'}],{duration:600,easing:'cubic-bezier(.3,.8,.3,1)'})})}
  const hw=$('handwrap');
  hw.style.setProperty('--sweep',S.dir===1?'right':'left');
  if(S.phase==='over'){if(MK.turn!==null){edgeMarker('right',true);MK.turn=null}}
  else if(MK.turn!==S.turn){
    if(S.turn===0){hw.classList.remove('arrive');void hw.offsetWidth;hw.classList.add('arrive');setTimeout(()=>sfx('turn'),250);if(!S.players[0].out)buzz(30)}
    moveMarker(MK.turn,S.turn);MK.turn=S.turn;
  }else if(S.turn!==0&&Date.now()>MK.until)placeMarker(S.turn,true);
  hw.classList.toggle('yourturn',S.turn===0&&S.phase!=='over');
  hw.classList.toggle('webbed',!!S.players[0].webbed&&S.phase!=='over');
  {const dz=S.phase!=='over'&&!S.players[0].out&&confused(0);$('hand').classList.toggle('dizzy',dz);
   const st=S.phase==='over'||S.players[0].out?[]:seatStatus(0).filter(x=>x.ic!=='😶‍🌫️'&&x.ic!=='☁️');
   const ms=$('mystat');ms.hidden=!st.length;ms.textContent=st.map(x=>x.short).join(' ');}
  {const me0=S.players[0],lim=limit(),thr=Math.max(3,Math.round(lim*.25)),n=me0.hand.length,rem=lim-n;
   const near=S.phase!=='over'&&!me0.out&&lim<999&&rem<thr;const lv=near?Math.min(1,1-rem/thr):0;
   hw.classList.toggle('near',near);hw.style.setProperty('--lv',lv.toFixed(2));
   const w=$('limitwarn');w.hidden=!near;w.style.setProperty('--lv',lv.toFixed(2));w.classList.toggle('hot',lv>=.66);
   if(near)w.textContent=rem<=0?`⚠️ ${n}/${lim} cartas: mais uma e você é eliminado!`:`⚠️ ${n}/${lim} cartas na mão (limite ${lim})`;}
  $('chevs').classList.toggle('ccw',S.dir===-1);
  $('thorns').classList.toggle('on',curseIs('thorn')&&S.phase!=='over');
  // deck
  const deck=$('deck');const dtop=S.deck[S.deck.length-1];
  const mine=myTurn()&&S.phase==='play';
  if(R.revelation&&dtop){deck.className=`card deckbtn reveal c-${dtop.color}`;deck.innerHTML=faceHTML(dtop)}
  else{deck.className='card back deckbtn';deck.innerHTML='<span class="face">unotfm</span>'}
  // sem "disabled": o monte precisa receber o toque longo e o mouse para mostrar os selos (a compra confere a vez)
  deck.classList.toggle('can',mine);deck.classList.toggle('off',!mine);deck.setAttribute('aria-disabled',String(!mine));
  {const ic=deckBadges().map(x=>x.ic);
   if(ic.length){const sp=document.createElement('span');sp.className='cb deckcb';sp.textContent=ic.join(' ');deck.appendChild(sp)}
   deck.classList.toggle('frozen',S.weather==='blizzard'||curseIs('ice'));deck.classList.toggle('gone',!!S.death);}
  // altura do monte: 1 px a cada 8 cartas, até 14 px
  deck.parentElement.style.setProperty('--stk',(S.death?0:Math.min(14,Math.ceil(S.deck.length/8)))+'px');
  $('deckStack').style.visibility=S.death?'hidden':''; // na Morte súbita o monte some, e a ilusão de monte cheio também
  // discard
  const t=topCard();const dis=$('discard');
  dis.style.setProperty('--ring',S.color?CVAR[S.color]:'transparent');
  if(t&&S.lastTop!==t.id){
    S.lastTop=t.id;
    dis.innerHTML=S.discard.slice(-3).map(c=>`<div class="dc" style="--rot:${c.rot.toFixed(1)}deg"><div class="card c-${c.chosen||c.color}">${faceHTML(c)}</div></div>`).join('');
    if(S.morph&&!RM){dis.lastElementChild.firstElementChild.animate([{transform:'rotateY(90deg) scale(1.15)'},{transform:'none'}],{duration:450,easing:'cubic-bezier(.2,.9,.3,1.2)'})}
    else if(S.animPlay){const tc=S.discard[S.discard.length-1];flyClone(dis.lastElementChild.firstElementChild,S.animPlay,{rot:-25,dur:430,endRot:tc.rot||0})}
    S.morph=false;
  }
  S.animPlay=null;
  const wxNow=S.wxNow;S.wxNow=false;
  {const tb=document.querySelector('.table');if(wxNow)tb.classList.add('wxnow');tb.dataset.weather=S.weather||'';if(wxNow){void tb.offsetWidth;tb.classList.remove('wxnow')}}
  if(S.weather==='storm'&&S.phase!=='over'&&!RM&&!stormT){const g=S.gen;const tick=()=>{stormT=null;if(!S||S.gen!==g||S.weather!=='storm'||S.phase==='over')return;
      const t=document.querySelector('.table');if(!t.classList.contains('bolt')){t.classList.remove('flick');void t.offsetWidth;t.classList.add('flick')}
      if(Math.random()<.5)noise(1.2,{f:120,filter:'lowpass',vol:.12});stormT=setTimeout(tick,6000+Math.random()*9000)};
    stormT=setTimeout(tick,4000+Math.random()*6000)}FX3D.setWeather(S.phase==='over'?null:S.weather,wxNow);
  $('meta').innerHTML=tableStatus().map((x,k)=>`<button type="button" class="tst ${x.warn?'warn':''}" data-k="${k}" aria-label="${x.name}">${x.short}</button>`).join('');
  {const pe=$('pend'),show=S.pending>0&&S.phase!=='over';
   if(!show){pe.hidden=true;pe.dataset.v=''}
   else{const v=String(S.pending),tgt=S.turn,lbl=tgt===0?'para você':'para '+who(tgt);
     if(pe.dataset.v!==v||pe.hidden){pe.hidden=false;pe.innerHTML=`<b>+${v}</b><span>${lbl}</span>`;pe.classList.remove('bump');void pe.offsetWidth;if(!RM)pe.classList.add('bump');pe.dataset.v=v}
     else pe.querySelector('span').textContent=lbl}}
  $('status').textContent=statusText();
  $('log').innerHTML=S.log.map(l=>`<div>${l}</div>`).join('');
  // hand (keyed)
  const hand=$('hand');const turn=myTurn();
  hand.classList.toggle('myturn',turn);
  const existing=new Map([...hand.children].map(e=>[+e.dataset.id,e]));
  // posição de cada carta antes de redesenhar (inclui o deslize em andamento), para ela deslizar até o lugar novo
  const handX=e=>e.offsetLeft-hand.scrollLeft;
  const oldX=RM?null:new Map([...existing].map(([id,e])=>[id,handX(e)+(e._flip?.playState==='running'?parseFloat(getComputedStyle(e).translate)||0:0)]));
  sortHand(me.hand).forEach((c,idx)=>{
    let el=existing.get(c.id);if(!el)el=makeCard(c);existing.delete(c.id);
    let cls=`card c-${c.color}`;
    if(turn)cls+=canPlay(me,c)?(S.weather==='sun'&&(S.phase==='play'||S.phase==='drawn')&&S.pending===0&&!matchTop(c)?' ok sunny':' ok'):' no';
    else if(canJump(0,c))cls+=' jump';
    if(c.id===S.drawnId)cls+=' fresh';
    if(c.lock)cls+=' locked';
    if(R.perfection&&c.type==='num'&&c.value===me.hand.length&&S.phase!=='over')cls+=' perf';
    if(S.peace>0&&c.type!=='num'&&S.phase!=='over')cls+=' calm';
    if(el.className.replace(' shake','')!==cls)el.className=cls;
    {const bs=S.phase==='over'?[]:cardBadges(me,c,turn);let bt=el.querySelector('.cb');el.classList.toggle('blocked',!!bs.blocked);if(bt)bt.classList.toggle('bad',!!bs.blocked);
     if(bs.length){if(!bt){bt=document.createElement('span');bt.className='cb'+(bs.blocked?' bad':'');el.appendChild(bt)}const tx=bs.join(' ');if(bt.textContent!==tx)bt.textContent=tx}
     else if(bt)bt.remove()}
    if(hand.children[idx]!==el)hand.insertBefore(el,hand.children[idx]||null);
  });
  existing.forEach(e=>e.remove());
  const cw=hand.firstElementChild?hand.firstElementChild.getBoundingClientRect().width:60;
  const n=me.hand.length,avail=hand.clientWidth-28;
  let ov=n>1?Math.min(6,(avail-cw)/(n-1)-cw):0;
  hand.style.setProperty('--ov',Math.max(ov,-cw*.72)+'px');
  if(oldX)[...hand.children].forEach(e=>{
    const x0=oldX.get(+e.dataset.id);if(x0===undefined)return;
    const dx=x0-handX(e);if(Math.abs(dx)<1)return;
    e._flip?.cancel();e._flip=e.animate([{translate:`${dx}px 0`},{translate:'0 0'}],{duration:180,easing:'cubic-bezier(.2,.8,.3,1)'});
  });
  // animations for draws
  const deckR=deck.getBoundingClientRect();
  const from=S.handFrom||deckR;S.handFrom=null;
  S.newIds.forEach((id,k)=>flyClone(hand.querySelector(`[data-id="${id}"]`),from,{delay:k*(S.newIds.length>8?35:70),rot:-15}));
  S.newIds=[];
  Object.entries(S.botDraw).forEach(([pi,cnt])=>{
    const av=document.querySelector(`[data-seat="${pi}"] .av`);const r=av&&av.getBoundingClientRect();
    for(let k=0;k<Math.min(cnt,4);k++)ghost(deckR,r,k*90);
  });
  S.botDraw={};
  // actions
  const main=$('drawBtn');
  if(S.phase==='combo'&&S.turn===0)main.textContent='Encerrar jogada';
  else if(S.phase==='drawn'&&S.turn===0)main.textContent='Passar';
  else if(S.pending>0&&S.turn===0)main.textContent=(S.weather==='blizzard'||curseOn('ice',0))?`Perder a vez (+${S.pending})`:`Comprar ${S.pending}`;
  else main.textContent=S.weather==='blizzard'&&S.turn===0?'Passar':'Comprar';
  main.disabled=!turn;
  const unoOk=S.weather!=='fog'&&!me.called&&!me.out&&S.phase!=='over'&&(me.hand.length===target()||(me.hand.length===target()+1&&S.turn===0));
  $('unoBtn').textContent=word()+'!';
  $('unoBtn').disabled=!unoOk;
  $('unoBtn').classList.toggle('lit',unoOk&&me.hand.length===target());
  $('mullBtn').hidden=!(S.mull&&S.phase!=='over');
  $('chalBtn').hidden=!(turn&&S.phase==='play'&&S.pending>0&&S.chal&&S.chal.by!==0);
}

/* ---------- overlays ---------- */
function closeOverlays(){['colorOv','pickOv','swapOv','simonOv','pokerOv','histOv'].forEach(id=>$(id).classList.remove('show'));if(S)S.autoResolve=null}
function placeLite(){const t=$('handwrap').getBoundingClientRect().top;document.documentElement.style.setProperty('--liteBottom',Math.max(80,innerHeight-t+4)+'px')}
function openColors(cb,preview){
  placeLite();
  const me=S.players[0];const cc=colorCounts(me.hand);
  const pv=preview||{type:'wild',color:'w'};
  const cols=COLORS.filter(c=>!(R.bg&&c==='g'));
  $('colorBtns').style.gridTemplateColumns=`repeat(${cols.length},1fr)`;
  $('colorBtns').innerHTML=cols.map(c=>`<button class="cpick" data-c="${c}" style="--pc:${CVAR[c]}"><div class="card c-${c}" style="--cw:2.875rem">${faceHTML(pv)}</div><span>${CNAME[c]}</span><small>${R.bg&&c==='b'?cc.b+cc.g:cc[c]} na mão</small></button>`).join('');
  $('colorOv').classList.add('show');
  const done=c=>{closeOverlays();cb(c)};
  S.autoResolve=()=>done(bestColor(me.hand));
  $('colorBtns').onclick=e=>{const b=e.target.closest('button');if(b)done(b.dataset.c)};
  $('colorBtns').firstChild.focus();
}
function openSimon(n,cb){
  const taps=[];
  $('simonSub').textContent=`Repita as ${n} cores escolhidas nas Cartas da Memorização, na ordem.`;
  let failed=false,closed=false;
  const dots=()=>{$('simonDots').innerHTML=Array.from({length:n},(_,i)=>{
    if(i<taps.length){const ok=sameCol(taps[i],S.simon[i]);return `<i class="${ok?'on':'bad'}" style="${ok?`background:${CVAR[taps[i]]}`:''}">${ok?'':'✕'}</i>`}
    return '<i></i>'}).join('')};dots();
  const cols=COLORS.filter(c=>!(R.bg&&c==='g'));
  $('simonBtns').style.gridTemplateColumns=`repeat(${cols.length},1fr)`;
  $('simonBtns').innerHTML=cols.map(c=>`<button data-c="${c}" style="background:${CVAR[c]}">${CNAME[c]}</button>`).join('');
  $('simonOv').classList.add('show');
  const done=()=>{if(closed)return;closed=true;closeOverlays();cb(taps)};
  S.autoResolve=()=>{if(!taps.length)taps.push(rand(COLORS.filter(c=>!sameCol(c,S.simon[0]))));done()};
  $('simonBtns').onclick=e=>{const b=e.target.closest('button');if(!b||failed||closed)return;taps.push(b.dataset.c);
    const ok=sameCol(b.dataset.c,S.simon[taps.length-1]);dots();
    if(!RM)b.animate([{transform:'scale(.9)'},{transform:'none'}],{duration:150});
    if(!ok){failed=true;sfx('error');$('simonSub').textContent='Errou a sequência!';setTimeout(done,700);return}
    sfx('tick');
    if(taps.length>=n)setTimeout(done,250)};
}
function openTarget(title,sub,opts,cb){
  $('swapTitle').textContent=title;$('swapSub').textContent=sub;$('swaps').classList.add('row');
  $('swaps').innerHTML=opts.map(i=>{const p=S.players[i];return `<button data-i="${i}"><span class="av" style="background:${p.col}">${p.name[0]}</span>${p.name}${partner(i)===0?' (dupla)':''}<small>${handHidden(i)?'? cartas':p.hand.length+' carta'+(p.hand.length===1?'':'s')}</small></button>`}).join('');
  $('swapOv').classList.add('show');
  const done=i=>{closeOverlays();cb(i)};
  S.autoResolve=()=>done(fewest(0,opts));
  $('swaps').onclick=e=>{const b=e.target.closest('button');if(b)done(+b.dataset.i)};
  $('swaps').firstChild&&$('swaps').firstChild.focus();
}
function openPick(opts,cb,title='Rastrear',sub='Escolha qual carta comprar.'){
  placeLite();
  const me=S.players[0];$('pickTitle').textContent=title;$('pickSub').textContent=sub;
  $('picks').innerHTML='';
  opts.forEach(c=>{const el=makeCard(c);el.className=`card c-${c.color}`;el.style.opacity=canPlay(me,c)?1:.75;el.onclick=()=>done(c);$('picks').appendChild(el)});
  $('pickOv').classList.add('show');
  if(!RM)[...$('picks').children].forEach((el,k)=>el.animate([{transform:'translateY(30px) rotate(-10deg)',opacity:0},{transform:'none',opacity:1}],{duration:320,delay:k*80,fill:'backwards',easing:'ease-out'}));
  const done=c=>{closeOverlays();S.busy=false;cb(c)};
  S.autoResolve=()=>done(opts[0]);
  $('picks').firstChild.focus();
}
function buildSettings(){
  SEGS.diff=[['easy','Fácil'],['normal','Normal'],['hard','Difícil'],...(MESTRE?[['master','Mestre']]:[])];
  document.querySelectorAll('.seg').forEach(seg=>{
    const k=seg.dataset.key;
    seg.innerHTML=SEGS[k].map(([v,l])=>`<button type="button" data-v="${v}" aria-pressed="${String(CFG[k])===String(v)}">${l}</button>`).join('');
    seg.onclick=e=>{const b=e.target.closest('button');if(!b)return;CFG[k]=SEGS[k].find(x=>String(x[0])===b.dataset.v)[0];
      if(k==='diff'&&!MESTRE){const now=Date.now();if(b.dataset.v==='hard'){hardClicks.n=now-hardClicks.t<1500?hardClicks.n+1:1;hardClicks.t=now;
        if(hardClicks.n>=7){MESTRE=true;save('unotfm-solo-master',true);CFG.diff='master';sfx('chest');setTimeout(()=>sfx('win'),350);
setTimeout(()=>{const mb=document.querySelector('.seg[data-key=diff] [data-v=master]');if(mb&&!RM)mb.animate([{transform:'scale(.4)',opacity:0},{transform:'scale(1.15)'},{transform:'none',opacity:1}],{duration:600,easing:'cubic-bezier(.2,.9,.3,1.3)'})},30)}}
        else hardClicks.n=0}
      if(k==='sound'){MUTED=!CFG.sound;save('unotfm-solo-mute',MUTED);if(!MUTED)sfx('special')}
      if(k==='vibrate'&&CFG.vibrate)buzz(40);
      if(k==='fx3d'||k==='sound'||k==='vibrate'||k==='ruleInfo'){save('unotfm-solo-cfg',CFG);if(k==='fx3d'&&S){if(!CFG.fx3d)FX3D.reset();render()}}
      buildSettings()};
  });
  $('comboLegend').textContent=COMBO_DESC[CFG.combo]||'';$('modeLegend').textContent=MODE_DESC[CFG.mode]||'';$('rulesField').hidden=CFG.mode!=='custom';$('botsField').hidden=CFG.mode!=='custom';$('startField').hidden=CFG.mode!=='custom';
  let html='',g='';
  if(CFG.bots%2===0)CFG.team=false;
  RULES.forEach(r=>{
    if(r.g!==g){g=r.g;html+=`<div class="group">${g}</div>`}
    const block=(CONFLICT[r.k]||[]).filter(x=>CFG[x]);
    let why=block.length?`Incompatível com ${block.map(x=>RNAME[x]).join(', ')}`:'';
    if(r.k==='team'&&CFG.bots%2===0)why='Precisa de 1, 3 ou 5 adversários';
    html+=`<label class="rule ${why?'off':''}" data-g="${r.g}"><input type="checkbox" data-k="${r.k}" ${CFG[r.k]?'checked':''} ${why?'disabled':''}><span class="mi ${txtIcon(ruleIcon(r.k))?'txt':''}" ${BOTRULES.includes(r.k)?`style="background:${AVCOL[BOTNAMES.indexOf(r.k[0].toUpperCase()+r.k.slice(1))]};color:#fff;border-color:transparent"`:''}>${ruleIcon(r.k)}</span><div><b>${r.n}</b><span>${r.d}</span>${why?`<em>${why}</em>`:''}</div></label>`;
  });
  $('ruleList').innerHTML=html;
  $('ruleList').onchange=e=>{const k=e.target.dataset.k;if(!k)return;CFG[k]=e.target.checked;buildSettings()};
  const cats=[['all','Todas'],['on','Ativadas'],...[...new Set(RULES.map(r=>r.g))].map(x=>[x,x])];
  $('ruleCats').innerHTML=cats.map(([v,l])=>`<button type="button" class="rcat" data-v="${v}" aria-pressed="${RF.cat===v}">${l}</button>`).join('');
  $('ruleCats').onclick=e=>{const b=e.target.closest('.rcat');if(!b)return;RF.cat=b.dataset.v;buildSettings()};
  filterRules();
}
/* filtro das regras da casa: categoria, ativadas e busca pelo nome (volta para "Todas" ao abrir) */
const RF={cat:'all',q:''};
const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function filterRules(){
  const q=norm(RF.q.trim());let any=false;
  const list=$('ruleList');let head=null,headOn=false;
  [...list.children].forEach(el=>{
    if(el.classList.contains('group')){if(head)head.hidden=!headOn;head=el;headOn=false;return}
    const inp=el.querySelector('input');
    const ok=(RF.cat==='all'||(RF.cat==='on'?inp.checked:el.dataset.g===RF.cat))&&(!q||norm(el.querySelector('b').textContent).includes(q));
    el.hidden=!ok;if(ok){headOn=true;any=true}
  });
  if(head)head.hidden=!headOn;
  $('ruleNone').hidden=any;
}
$('ruleSearch').addEventListener('input',e=>{RF.q=e.target.value;filterRules()});
function openActive(){
  if(!S){openSettings();return}
  const segName=(k,v)=>{const e=SEGS[k].find(x=>String(x[0])===String(v));return e?e[1]:v};
  const basics=[`${S.players.length-1} adversário${S.players.length>2?'s':''}`,`Dificuldade: ${segName('diff',R.diff)}`,`Cartas iniciais: ${segName('start',R.start)}`,`Defesa contra compras: ${segName('combo',R.combo)}`];
  const added=Object.fromEntries(S.added.map(a=>[a.k,a.by]));
  const on=RULES.filter(r=>R[r.k]);
  let html=`<div class="act-basics">${basics.map(b=>`<span class="chip">${b}</span>`).join('')}</div><p class="legend">${COMBO_DESC[R.combo]}</p>`;
  if(!R.nochallenge)html+=`<div class="act"><b>Desafio do +4</b><span>Quem recebe um +4 pode desafiar: se foi blefe, quem jogou compra; se não, quem desafiou compra 2 a mais.</span></div>`;
  let g='';
  on.forEach(r=>{
    if(r.g!==g){g=r.g;html+=`<div class="act-group">${g}</div>`}
    html+=`<div class="act act-i"><span class="mi ${txtIcon(ruleIcon(r.k))?'txt':''}" ${BOTRULES.includes(r.k)?`style="background:${AVCOL[BOTNAMES.indexOf(r.k[0].toUpperCase()+r.k.slice(1))]};color:#fff;border-color:transparent"`:''}>${ruleIcon(r.k)}</span><div><b>${r.n}</b>${added[r.k]?`<em class="new" style="font-style:normal">adicionada por ${added[r.k]}</em>`:''}<span>${r.d}</span></div></div>`;
  });
  if(S.removed.length){html+=`<div class="act-group">Removidas nesta partida</div>`;S.removed.forEach(x=>{html+=`<div class="act"><b>${RNAME[x.k]}</b><em class="new gone" style="font-style:normal">banida por ${x.by}</em></div>`})}
  if(!on.length)html+='<p class="sub" style="margin-top:10px">Nenhuma regra da casa ativa: UNO clássico.</p>';
  $('activeSub').textContent=S.added.length?`${on.length} regra${on.length===1?'':'s'} da casa ativa${on.length===1?'':'s'}, ${S.added.length} adicionada${S.added.length===1?'':'s'} durante a partida.`:`${on.length} regra${on.length===1?'':'s'} da casa ativa${on.length===1?'':'s'}.`;
  $('activeList').innerHTML=html;
  $('activeOv').classList.add('show');$('closeActive').focus();
}
function openHistory(){
  if(!S||!S.hist)return;
  const list=S.hist.slice(-5).reverse().map(h=>{
    const c=h.live?snap(h.live):h.card;if(!c)return '';
    const col=c.chosen||c.color;
    return `<div class="hrow ${S.other?(h.side==='b'?'side-b':'side-a'):''}"><div class="card c-${col}" style="--cw:2.75rem">${faceHTML(c)}</div><div class="hbody"><b>${h.by==null?'Mesa':h.by===0?'Você':S.players[h.by].name}${S.other&&h.side==='b'?' <span class="hside">🌀 outro lado</span>':''}</b>${h.notes.map(n=>`<span>${n}</span>`).join('')}</div></div>`}).join('');
  $('histList').innerHTML=list||'<p class="sub">Nenhuma jogada ainda.</p>';
  $('histOv').classList.add('show');$('histClose').focus();
}
function openSettings(){
  updateInstallUI();
  $('tipBox').innerHTML=`<b>💡 Dica</b>${rand(TIPS)}`;
  RF.cat='all';RF.q='';$('ruleSearch').value='';
  buildSettings();$('closeSettings').style.display=(S&&S.phase!=='over')||!$('home').hidden?'':'none';
  $('endOv').classList.remove('show');$('settingsOv').classList.add('show');
}

/* ---------- segurar uma carta da mão: o que ela faz ---------- */
const BASIC_DESC={
  skip:'O próximo jogador perde a vez.',
  rev:'Inverte o sentido do jogo.',
  d2:'O próximo jogador compra 2 cartas e perde a vez, a não ser que se defenda.',
  wild:'Pode ser jogada sobre qualquer carta. Ao jogar, escolha a cor.',
  d4:'O próximo jogador compra 4 cartas e perde a vez, a não ser que se defenda. Ao jogar, escolha a cor. Se você tinha carta da cor atual e for desafiado, quem compra é você.',
  chest:'Ao jogar esta carta, você vence a partida.',
  mix1:'Inverte o sentido do jogo e o próximo jogador perde a vez.',
  mix2:'Inverte o sentido do jogo e o próximo jogador compra 2 cartas.',
  mix3:'O próximo jogador perde a vez e o jogador seguinte compra 2 cartas.',
};
function cardDesc(c){
  if(WEATHER[c.type]&&SP[c.type])return `Muda o clima para ${WEATHER[c.type].n}: ${WEATHER[c.type].t.replace(/\.$/,'').toLowerCase()}. Dura até outra carta de clima ser jogada.`;
  return BASIC_DESC[c.type]||(SP[c.type]&&SP[c.type].d)||'';
}
function badgeInfo(b,c,blocked){
  const r=k=>({ic:b,name:RNAME[k],txt:(RULES.find(x=>x.k===k)||{}).d||''});
  const ic=b.split(' ')[0];
  switch(ic){
    case '🛡️':return {ic,name:'Defesa',txt:`pode ser jogada para se defender do +${S.pending} acumulado`};
    case '↩️':return r('nou');
    case '✂️':return {ic,name:'Corte',txt:'é igual à carta da mesa e pode ser jogada mesmo fora da sua vez'};
    case '📚':return r('stack');
    case '🔢':return r('sequence');
    case '↕️':return blocked?{ic,name:'Vizinho',txt:'números iguais não combinam mais, só um número acima ou abaixo'}:r('neighbor');
    case '🔥':return r('hell');
    case '☀️+1':return {ic:'☀️',name:'Ensolarado',txt:`está fora da cor. Pode ser jogada, mas você compra ${curseOn('anvil',0)?2:1}`};
    case '🥔':return {ic,name:'Batata',txt:`você está com ela há ${S.players[0].batata||0}/5 turnos. No quinto, você é eliminado`};
    case '💯':return r('perfection');
    case '🌼':return {ic,name:'Paz',txt:'cartas de ação não têm efeito enquanto a Paz durar'};
    case '⛈️':return {ic,name:'Tempestade',txt:'esta carta pode mudar a cor. Se mudar, um adversário aleatório compra 1 carta'};
    case '👢':return {ic,name:'Maldição da bota',txt:'jogar uma carta de ação faz você comprar 1 carta'};
    case '🔒':return {ic,name:'Tranca',txt:'esta carta está bloqueada por 1 turno'};
    case '🧼':return r('clean');
    case '🚦':return {ic,name:'Semáforo',txt:`é proibido vencer com cartas ${S.traffic==='odd'?'ímpares':'pares'}`};
  }
  return null;
}
function showCardInfo(id,el){
  const me=S&&S.players[0];const c=me&&me.hand.find(x=>x.id===id);if(!c)return false;
  const bs=S.phase==='over'?[]:cardBadges(me,c,myTurn());
  const rows=bs.map(b=>badgeInfo(b,c,bs.blocked)).filter(Boolean);
  const desc=c.type==='num'?'':cardDesc(c);
  if(!desc&&!rows.length)return false;
  const name=c.type==='num'?`${c.value} ${CNAME[c.color]||''}`.trim():label(c);
  infoPopup('card'+id,`<div class="si-head"><b>${name}</b></div>${desc?`<p class="ci-desc">${desc}</p>`:''}`,rows,el,true,true);
  buzz(15);
  return true;
}
// vibração leve (pode ser desligada nas Configurações; o iPhone não vibra pelo navegador)
function buzz(ms){if(CFG.vibrate!==false&&navigator.vibrate)try{navigator.vibrate(ms)}catch(e){}}
/* ---------- wiring ---------- */
// tempo segurando (toque/clique) e com o mouse parado em cima de uma carta da mão ou do monte para abrir a explicação
const HOLD_MS=500,HOVER_SLOW=700;
{let lp=null,fired=false;
 const cancel=()=>{if(lp){clearTimeout(lp.t);lp=null}};
 $('hand').addEventListener('pointerdown',e=>{const b=e.target.closest('.card');fired=false;cancel();if(!b||!S)return;
   lp={x:e.clientX,y:e.clientY,t:setTimeout(()=>{lp=null;fired=true;showCardInfo(+b.dataset.id,b)},HOLD_MS)}});
 $('hand').addEventListener('pointermove',e=>{if(lp&&Math.hypot(e.clientX-lp.x,e.clientY-lp.y)>10)cancel()});
 ['pointerup','pointercancel','pointerleave'].forEach(ev=>$('hand').addEventListener(ev,cancel));
 $('hand').addEventListener('contextmenu',e=>{if(e.target.closest('.card'))e.preventDefault()});
 $('hand').addEventListener('click',e=>{const b=e.target.closest('.card');if(fired){fired=false;return}if(b)humanClick(+b.dataset.id,b)});}
['pointerdown','click'].forEach(ev=>$('rail').addEventListener(ev,e=>{const b=e.target.closest('[data-catch]');if(b){e.preventDefault();humanCatch(+b.dataset.catch)}}));
$('rail').addEventListener('click',e=>{if(e.target.closest('[data-catch]')||!S)return;const seat=e.target.closest('.seat');if(!seat)return;showSeatInfo(+seat.dataset.seat,seat)});
document.addEventListener('pointerdown',e=>{if(e.target.closest('.seat')&&!e.target.closest('[data-catch]'))e.stopPropagation()},true);
// monte: segurar 0,5 s mostra a explicação dos selos (como nas cartas da mão) e não compra
{let lp=null,fired=false;const deck=$('deck'),cancel=()=>{if(lp){clearTimeout(lp.t);lp=null}};
 deck.addEventListener('pointerdown',e=>{fired=false;cancel();if(!S||!deckBadges().length)return;
   lp={x:e.clientX,y:e.clientY,t:setTimeout(()=>{lp=null;fired=showDeckInfo()},HOLD_MS)}});
 deck.addEventListener('pointermove',e=>{if(lp&&Math.hypot(e.clientX-lp.x,e.clientY-lp.y)>10)cancel()});
 ['pointerup','pointercancel','pointerleave'].forEach(ev=>deck.addEventListener(ev,cancel));
 deck.addEventListener('contextmenu',e=>e.preventDefault());
 deck.onclick=()=>{if(fired){fired=false;return}if(myTurn()&&S.phase==='play')takeDraw(0)};}
$('drawBtn').onclick=humanMain;
$('unoBtn').onclick=humanUno;
$('mullBtn').onclick=mulligan;
$('chalBtn').onclick=()=>{if(myTurn()&&S.chal)doChallenge(0)};
$('openSettings').onclick=openSettings;
$('discard').addEventListener('click',openHistory);
$('mystat').addEventListener('click',e=>{e.stopPropagation();showSeatInfo(0,$('mystat'))});
$('thorns').innerHTML=thornsSVG();requestAnimationFrame(chevLoop);
$('meta').addEventListener('click',e=>{const b=e.target.closest('.tst');if(!b)return;e.stopPropagation();const x=tableStatus()[+b.dataset.k];if(x)infoPopup('tst'+b.dataset.k,'',x.rows||[x],b)});
document.addEventListener('pointerdown',e=>{if(e.target.closest('#mystat')||e.target.closest('.tst'))e.stopPropagation()},true);$('histClose').onclick=()=>$('histOv').classList.remove('show');
document.addEventListener('pointerdown',e=>{
  if(e.target.closest('#notices')||e.target.closest('.ri'))return;
  if($('notices').children.length){$('notices').innerHTML='';document.querySelectorAll('.ri.on').forEach(x=>x.classList.remove('on'))}
});
{const st=$('rulestrip');
  st.addEventListener('wheel',e=>{if(Math.abs(e.deltaY)>Math.abs(e.deltaX)){st.scrollLeft+=e.deltaY;e.preventDefault()}},{passive:false});
  st.addEventListener('scroll',()=>{if(S&&Date.now()-(S.progScroll||0)<250)return;if($('notices').children.length){$('notices').innerHTML='';document.querySelectorAll('.ri.on').forEach(x=>x.classList.remove('on'))}});
  let drag=null;
  st.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')return;drag={x:e.clientX,l:st.scrollLeft,moved:false}});
  addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x;if(Math.abs(dx)>4)drag.moved=true;st.scrollLeft=drag.l-dx});
  addEventListener('pointerup',()=>{if(drag&&drag.moved)st.dataset.dragged='1';drag=null;setTimeout(()=>delete st.dataset.dragged,0)});
}
$('rulestrip').addEventListener('click',e=>{
  if($('rulestrip').dataset.dragged)return;
  const b=e.target.closest('.ri');if(!b)return;const k=b.dataset.k;
  const open=$('notices').querySelector(`[data-k="${k}"]`);
  document.querySelectorAll('.ri.on').forEach(x=>x.classList.remove('on'));
  if(open){open.remove();return}
  openRuleIcon(b);
});
function openRuleIcon(b){
  const k=b.dataset.k;b.classList.add('on');b.classList.remove('fresh');
  const a=(S&&S.added||[]).find(x=>x.k===k);
  notice(k,a?`Em jogo, adicionada por ${a.by}`:'Em jogo desde o início',{info:true,title:RNAME[k],anchor:b});
}
// janela automática da regra adicionada no meio da partida (pode ser desligada nas Configurações; tocar no ícone sempre abre)
function showRuleInfo(k){
  if(CFG.ruleInfo===false)return;
  const b=$('rulestrip').querySelector(`[data-k="${k}"]`);if(!b)return;
  document.querySelectorAll('.ri.on').forEach(x=>x.classList.remove('on'));b.classList.add('on');
  const a=(S&&S.added||[]).find(x=>x.k===k);
  notice(k,a?`Nova regra, adicionada por ${a.by}`:'Em jogo',{info:true,title:RNAME[k],anchor:b});
}
$('openConfig').onclick=()=>{updateInstallUI();CFG.sound=!MUTED;buildSettings();$('configOv').classList.add('show');$('cfgClose').focus()};
$('cfgClose').onclick=()=>$('configOv').classList.remove('show');
document.addEventListener('pointerdown',()=>{if(!MUTED)audio()},{once:true});
$('closeActive').onclick=()=>$('activeOv').classList.remove('show');
$('endRules').onclick=openSettings;
$('closeSettings').onclick=()=>$('settingsOv').classList.remove('show');
$('startBtn').onclick=()=>{save('unotfm-solo-cfg',CFG);R=rulesForMode();TOUR=null;$('settingsOv').classList.remove('show');newGame()};
$('againBtn').onclick=()=>{$('endOv').classList.remove('show');R=rulesForMode();newGame()};
window.addEventListener('resize',()=>{if(!S)return;render();if(S.turn!==0&&S.phase!=='over')placeMarker(S.turn,false)});
/* PWA: instalação dentro do jogo */
let installEvt=null;
const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const hosted=()=>/^https?:$/.test(location.protocol)&&!/claude\.ai|claudeusercontent/.test(location.host);
const canInstall=()=>hosted()&&!isStandalone()&&(!!installEvt||isIOS());
function updateInstallUI(){
  const can=canInstall();
  const snooze=load('unotfm-solo-install-snooze',0);
  $('installBox').hidden=!(can&&Date.now()>snooze);
  $('installField').hidden=!can;
}
function doInstall(){
  if(installEvt){const ev=installEvt;installEvt=null;ev.prompt();ev.userChoice.then(r=>{if(r&&r.outcome==='dismissed')save('unotfm-solo-install-snooze',Date.now()+3*864e5);updateInstallUI()}).catch(()=>{});updateInstallUI();return}
  if(isIOS()){$('iosOv').classList.add('show');$('iosClose').focus()}
}
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;updateInstallUI()});
addEventListener('appinstalled',()=>{installEvt=null;updateInstallUI();if(S)toast('unotfm instalado!','var(--cg)')});
$('installYes').onclick=doInstall;$('installCfg').onclick=doInstall;
$('installNo').onclick=()=>{save('unotfm-solo-install-snooze',Date.now()+7*864e5);updateInstallUI()};
$('iosClose').onclick=()=>$('iosOv').classList.remove('show');
/* PWA: registra o service worker quando hospedado (GitHub Pages etc.) */
if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)&&!/claude\.ai|claudeusercontent/.test(location.host)){
  addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').catch(()=>{})});
}
/* passar o mouse (computador): abre a mesma janela de informação das cartas da mão e dos selos de status */
{const FINE=matchMedia('(hover:hover) and (pointer:fine)');let hov=null,hovT=null;
 const openKey=k=>k.startsWith('rule:')?$('notices').querySelector(`[data-k="${k.slice(5)}"]`):$('notices').querySelector(`[data-info="${k}"]`);
 function hoverTarget(t){
   const ri=t.closest('#rulestrip .ri');if(ri)return {key:'rule:'+ri.dataset.k,fast:1,open:()=>openRuleIcon(ri)};
   const c=t.closest('#hand .card');if(c)return {key:'card'+c.dataset.id,slow:1,open:()=>showCardInfo(+c.dataset.id,c)};
   if(t.closest('#deck')&&deckBadges().length)return {key:'deck',slow:1,open:showDeckInfo};
   const st=t.closest('.seat .tag.stat,.seat .outic');if(st){const seat=st.closest('.seat'),i=+seat.dataset.seat;return {key:'seat'+i,open:()=>showSeatInfo(i,seat)}}
   if(t.closest('#mystat'))return {key:'seat0',open:()=>showSeatInfo(0,$('mystat'))};
   const b=t.closest('.tst');if(b)return {key:'tst'+b.dataset.k,open:()=>{const x=tableStatus()[+b.dataset.k];if(x)infoPopup('tst'+b.dataset.k,'',x.rows||[x],b)}};
   return null;
 }
 document.addEventListener('pointerover',e=>{
   if(e.pointerType!=='mouse'||!FINE.matches||!S||e.target.closest('#notices'))return;
   const h=hoverTarget(e.target),k=h&&h.key;
   if(k===hov)return;
   clearTimeout(hovT);
   if(hov&&openKey(hov)){$('notices').innerHTML='';document.querySelectorAll('.ri.on').forEach(x=>x.classList.remove('on'))}
   hov=k;const x=e.clientX,y=e.clientY;
   // reabre a partir do elemento atual sob o mouse: o render() pode ter trocado o ícone nesse intervalo
   // regras abrem na hora; cartas da mão e monte esperam mais (HOVER_SLOW), para a janela não abrir só de passar o mouse
   if(h&&h.fast){h.open();return}
   if(h)hovT=setTimeout(()=>{if(hov!==k||openKey(k))return;const el=document.elementFromPoint(x,y),h2=el&&hoverTarget(el);if(h2&&h2.key===k)h2.open()},h.slow?HOVER_SLOW:300);
 });}
/* neve 2D: flocos individuais com posição, tamanho, velocidade e balanço sorteados */
{const box=document.querySelector('.w-snow'),R1=(a,b)=>a+Math.random()*(b-a);
 for(let i=0;i<60;i++){const f=document.createElement('i'),d=R1(5,11);
   f.style.cssText=`--x:${R1(-2,100).toFixed(1)}%;--sz:${R1(.25,.7).toFixed(2)}rem;--o:${R1(.55,1).toFixed(2)};--d:${d.toFixed(1)}s;--dl:${(-R1(0,d)).toFixed(1)}s;--sd:${R1(1.6,3.2).toFixed(1)}s;--sw:${R1(.3,1.4).toFixed(2)}rem`;
   box.insertBefore(f,box.lastElementChild)}}
/* tela inicial: no lugar da mesa vazia até a primeira partida */
$('homeFan').innerHTML=[['r','num',7],['y','skip'],['w','wild'],['g','rev'],['b','num',0]].map(([c,t,v],k)=>`<div class="card c-${c}" style="--k:${k}">${faceHTML({color:c,type:t,value:v??null})}</div>`).join('');
$('homePlay').onclick=()=>openSettings();
$('homeCfg').onclick=()=>$('openConfig').click();

