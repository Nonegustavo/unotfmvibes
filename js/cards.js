/* unotfm solo: desenhos e janelas das cartas especiais (dado, Banimento, Mágica, cartas mostradas, faixa de regras,
   Mix de Regras, balões). Os efeitos (regras) ficam em js/mesa/cartas.js */
/* ---------- special cards ---------- */
const discardRect=()=>$('discard').getBoundingClientRect();
function diceSVG(n,sz='calc(var(--cw)*1.3)'){
  const P={1:[[50,50]],2:[[28,28],[72,72]],3:[[26,26],[50,50],[74,74]],4:[[28,28],[72,28],[28,72],[72,72]],5:[[26,26],[74,26],[50,50],[26,74],[74,74]],6:[[28,24],[72,24],[28,50],[72,50],[28,76],[72,76]]}[n];
  return `<svg viewBox="0 0 100 100" style="width:${sz};height:${sz};filter:drop-shadow(0 4px 0 rgba(0,0,0,.25))"><rect x="5" y="5" width="90" height="90" rx="20" fill="#fff" stroke="var(--accent)" stroke-width="6"/>${P.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="9" fill="${n===1?'#e0433a':'#241c3a'}"/>`).join('')}</svg>`;
}
// dado pequeno rolando perto da cadeira do adversário; para no resultado e fica até o efeito acontecer
function miniDie(pi,n,ms){
  const seat=document.querySelector(`[data-seat="${pi}"]`);if(RM||!seat)return null;
  const r=seat.getBoundingClientRect(),el=document.createElement('div');el.className='minidie';document.body.appendChild(el);
  const w=el.offsetWidth||34;el.style.left=Math.max(4,Math.min(innerWidth-w-4,r.left+r.width/2-w/2))+'px';el.style.top=(r.bottom+6)+'px';
  const g=S.gen,end=Date.now()+ms;let last=0;
  const tick=()=>{
    if(g!==S.gen||!el.isConnected){el.remove();return}
    if(Date.now()>=end){el.innerHTML=diceSVG(n,'100%');el.animate([{transform:'scale(1.35)'},{transform:'none'}],{duration:260,easing:'cubic-bezier(.2,.9,.3,1.3)'});return}
    let v;do{v=1+Math.floor(Math.random()*6)}while(v===last);last=v;
    el.innerHTML=diceSVG(v,'100%');el.animate([{transform:`rotate(${(Math.random()-.5)*80}deg) translateY(-0.25rem)`},{transform:'none'}],{duration:110});
    setTimeout(tick,110);
  };
  tick();setTimeout(()=>el.remove(),ms+DICE_WAIT+3000);
  return el;
}
// Mágica: uma carta de ação de cada adversário vira número aleatório (mesma cor; curinga ganha cor aleatória).
// Volta a ser o que era ao retornar ao monte (restoreCard)
const MAGIC=['Tadá!','Essa era a sua carta?','Diante dos seus olhos!','Voilà!','Abracadabra!','Nada nas mangas!','Plim!','Um aplauso, por favor!','Hocus pocus!'];
// largura das cartas que os adversários mostram abaixo da cadeira: a mesma das cartas da mesa
const shownW=()=>$('deck').getBoundingClientRect().width;
const tiltKeys=(dy,rot)=>[{transform:'translateY(0) rotate(0deg)',opacity:1},{transform:`translateY(${dy*.85}px) rotate(${rot}deg)`,opacity:1,offset:.75},{transform:`translateY(${dy}px) rotate(${rot}deg) scale(.9)`,opacity:0}];
const tilt=()=>(Math.random()<.5?-1:1)*(8+Math.random()*10);
/* Ímã: as cartas da cor aparecem de frente sobre quem jogou (a sua sai da mão) e, uma de cada vez, são puxadas cada vez
   mais depressa até o Ímã na mesa, sumindo por baixo dele. Dura IMA_MS (a mesa espera) */
const IMA_ESPERA=350; // as cartas aparecem enquanto o 🧲 grande ainda está no meio da mesa
function imaFx(pi,cartas){
  if(RM||S.turbo||!cartas.length)return;
  const alvo=discardRect(),w=shownW(),seat=pi===0?null:targetRect(pi);
  cartas.forEach((c,j)=>{
    const src=pi===0?document.querySelector(`#hand [data-id="${c.id}"]`):null,r=src&&src.getBoundingClientRect();
    if(!r&&!seat)return;
    const cw=r?r.width:w,x0=r?r.left:Math.max(4,Math.min(innerWidth-w-4,seat.left+seat.width/2-w/2+(j-(cartas.length-1)/2)*w*.4)),y0=r?r.top:seat.bottom+4;
    const el=makeCard(c);el.className=`card c-${c.chosen||c.color} flyclone`;el.disabled=true;
    Object.assign(el.style,{position:'fixed',left:x0+'px',top:y0+'px',width:cw+'px',margin:'0',zIndex:21,pointerEvents:'none'});el.style.setProperty('--cw',cw+'px');
    document.body.appendChild(el);if(src)src.style.visibility='hidden';
    const s=alvo.width/cw,dx=alvo.left+alvo.width/2-(x0+cw/2)+(j%2?1:-1)*alvo.width*.12,dy=alvo.top+alvo.height/2-(y0+cw*.75),rot=(Math.random()<.5?-1:1)*(6+Math.random()*10);
    const fim=`translate(${dx}px,${dy}px) rotate(${rot}deg) scale(${s})`;
    el.animate([
      {transform:'scale(.6)',opacity:0},
      {transform:'scale(1.06)',opacity:1,offset:.12},
      {transform:'scale(1)',offset:.2},
      // treme um pouco, já puxada na direção do Ímã
      {transform:`translate(${dx*.03}px,${dy*.03}px) rotate(-3deg)`,offset:.32},
      {transform:`translate(${dx*.06}px,${dy*.06}px) rotate(3deg)`,offset:.42,easing:'cubic-bezier(.6,0,.95,.5)'},
      {transform:fim,opacity:1,offset:.9},
      {transform:fim,opacity:0}
    ],{duration:900,delay:IMA_ESPERA+j*160,fill:'both'});
    setTimeout(()=>{el.remove();sfx('play')},IMA_ESPERA+j*160+830);
  });
}
function vanishCards(target,cards,sp=1){
  if(RM||!cards.length)return 0;
  if(target===0){
    // cada carta sobe como uma cópia solta por cima da mesa (a mão corta o que passa dos limites dela)
    const els=cards.map(c=>[c,document.querySelector(`#hand [data-id="${c.id}"]`)]).filter(([,el])=>el);
    const g=S.gen;
    els.forEach(([c,src],k)=>setTimeout(()=>{
      if(g!==S.gen)return;
      sfx('vanishUp');
      const a=src.getBoundingClientRect();
      const fly=makeCard(c);fly.className=`card c-${c.chosen||c.color} flyclone`;fly.disabled=true;
      Object.assign(fly.style,{position:'fixed',left:a.left+'px',top:a.top+'px',width:a.width+'px',margin:'0',zIndex:21,pointerEvents:'none'});fly.style.setProperty('--cw',a.width+'px');
      document.body.appendChild(fly);src.style.visibility='hidden';
      fly.animate(tiltKeys(-a.width*1.6,tilt()),{duration:DROP*sp,easing:'ease-in',fill:'forwards'});
      setTimeout(()=>fly.remove(),DROP*sp+80);
    },k*VANISH_GAP*sp));
    return ((els.length-1)*VANISH_GAP+DROP)*sp;
  }
  const r=targetRect(target);if(!r)return 0;
  const w=shownW(r);
  cards.forEach((c,j)=>setTimeout(()=>{
    const el=makeCard(c);el.className=`card c-${c.chosen||c.color} banc`;el.disabled=true;el.style.setProperty('--cw',w+'px');
    el.style.left=Math.max(4,Math.min(innerWidth-w-4,r.left+r.width/2-w/2))+'px';el.style.top=(r.bottom+4)+'px';
    document.body.appendChild(el);
    el.animate(tiltKeys(w*1.05,tilt()),{duration:DROP*sp,easing:'ease-in',fill:'forwards'});
    sfx('vanishDown');
    setTimeout(()=>el.remove(),DROP*sp+80);
  },j*VANISH_GAP*sp));
  return ((cards.length-1)*VANISH_GAP+DROP)*sp;
}
function transformFx(el,swap){
  const n=10,keys=[];
  for(let k=0;k<=n;k++){const f=k/n,amp=k===n?0:1+f*2.5,s=k%2?1:-1;
    keys.push({translate:`${s*amp}px ${-s*amp*.5}px`,filter:`brightness(${1+f*1.3}) drop-shadow(0 0 ${f*.75}rem rgba(255,255,255,${f*.9}))`})}
  el.animate(keys,{duration:PUF,easing:'ease-in'});
  setTimeout(()=>{
    swap();puffAt(el);
    el.animate([{scale:'1.3',filter:'brightness(2.6) drop-shadow(0 0 .9rem #fff)'},{scale:'.94',offset:.45},{scale:'1',filter:'brightness(1) drop-shadow(0 0 0 transparent)'}],{duration:POP,easing:'ease-out'});
  },PUF);
}
function puffAt(el){
  const r=el.getBoundingClientRect(),d=document.createElement('div');d.className='puff';
  Object.assign(d.style,{left:r.left+r.width/2+'px',top:r.top+r.height/2+'px'});d.style.setProperty('--s',r.width+'px');
  const sm=7,sk=9,html=[];
  for(let k=0;k<sm;k++){const a=(k/sm)*Math.PI*2+Math.random()*.6,dist=r.width*(.35+Math.random()*.3);
    html.push(`<i style="--x:${Math.cos(a)*dist}px;--y:${Math.sin(a)*dist}px;animation-delay:${Math.random()*60}ms"></i>`)}
  for(let k=0;k<sk;k++){const a=Math.random()*Math.PI*2,dist=r.width*(.6+Math.random()*.5);
    html.push(`<b style="--x:${Math.cos(a)*dist}px;--y:${Math.sin(a)*dist}px"></b>`)}
  d.innerHTML=html.join('');document.body.appendChild(d);setTimeout(()=>d.remove(),1000);
}
function morphMine(card,before,after,sp=1){
  const tMorph=(SHOW_IN+SHOW_HOLD)*sp,total=tMorph+PUF+(MORPH_HOLD+MINE_BACK)*sp;
  const src=document.querySelector(`#hand [data-id="${card.id}"]`);
  if(RM||!src)return RM?0:total;
  const a=src.getBoundingClientRect(),hr=$('hand').getBoundingClientRect();
  const fly=makeCard(before);fly.className=`card c-${before.color} flyclone`;fly.disabled=true;
  Object.assign(fly.style,{position:'fixed',left:a.left+'px',top:a.top+'px',width:a.width+'px',margin:'0',zIndex:21,pointerEvents:'none'});fly.style.setProperty('--cw',a.width+'px');
  document.body.appendChild(fly);src.style.visibility='hidden';
  const mid={x:hr.left+hr.width/2-a.width/2,y:hr.top-a.height*1.15};
  const at=(x,y,extra='')=>`translate(${x-a.left}px,${y-a.top}px) ${extra}`;
  fly.animate([{transform:'none'},{transform:at(mid.x,mid.y,'scale(1.15)')}],{duration:MINE_GO*sp,easing:'cubic-bezier(.2,.9,.3,1.05)',fill:'forwards'});
  // antes de transformar, a cópia passa a ficar no centro por left/top: o salto da transformação (propriedade scale)
  // multiplicaria o translate da ida e a carta escorregaria
  setTimeout(()=>{
    fly.getAnimations().forEach(x=>x.cancel());
    Object.assign(fly.style,{left:mid.x+'px',top:mid.y+'px',transform:'scale(1.15)'});
    transformFx(fly,()=>{fly.innerHTML=faceHTML(after);fly.className=`card c-${after.color} flyclone`});
  },tMorph);
  // volta: a mão é redesenhada com a carta nova no lugar certo e a cópia voa até lá
  setTimeout(()=>{
    const el=document.querySelector(`#hand [data-id="${card.id}"]`);
    if(el){el.innerHTML=faceHTML(card);el.setAttribute('aria-label',cardName(card));el.style.visibility='hidden'}
    render();
    // a carta (escondida) não desliza: a cópia mede e voa direto para o lugar novo
    const ne=document.querySelector(`#hand [data-id="${card.id}"]`);ne?._flip?.cancel();
    const dst=(ne||src).getBoundingClientRect();
    fly.animate([{transform:'scale(1.15)'},{transform:`translate(${dst.left-mid.x}px,${dst.top-mid.y}px)`}],{duration:MINE_BACK*sp,easing:'cubic-bezier(.4,.1,.3,1)',fill:'forwards'});
    setTimeout(()=>{fly.remove();const e=document.querySelector(`#hand [data-id="${card.id}"]`);if(e)e.style.visibility=''},MINE_BACK*sp);
  },tMorph+PUF+MORPH_HOLD*sp);
  return total;
}
function showCards(target,cards,mode,sp=1,to){
  const total=(SHOW_IN+SHOW_HOLD+MORPH_HOLD)*sp+PUF;
  if(RM)return 0;
  if(!cards.length)return total;
  let els=[],box=null;
  if(target===0){
    els=cards.map(c=>document.querySelector(`#hand [data-id="${c.id}"]`)).filter(Boolean);
    els.forEach(el=>el.animate([{transform:'none'},{transform:LIFT,boxShadow:'0 0 0 3px var(--accent),0 0 1rem var(--accent)'}],{duration:SHOW_IN*sp,fill:'forwards',easing:'ease-out'}));
  }else{
    const r=targetRect(target);if(!r)return total;
    const w=shownW(r);
    box=document.createElement('div');box.className='showc';
    const max=3;
    cards.slice(0,max).forEach(c=>{const el=makeCard(c);el.className=`card c-${c.chosen||c.color}`;el.disabled=true;el.style.setProperty('--cw',w+'px');box.appendChild(el);els.push(el)});
    if(cards.length>max)box.insertAdjacentHTML('beforeend',`<span class="xn">×${cards.length}</span>`);
    document.body.appendChild(box);
    const bw=box.offsetWidth,bh=box.offsetHeight;
    box.style.left=Math.max(4,Math.min(innerWidth-bw-4,r.left+r.width/2-bw/2))+'px';
    box.style.top=(r.bottom+4)+'px';
    box.animate([{opacity:0,transform:'translateY(-0.75rem) scale(.6)'},{opacity:1,transform:'none'}],{duration:SHOW_IN*sp,easing:'ease-out',fill:'backwards'});
  }
  const at=(SHOW_IN+SHOW_HOLD)*sp;
  {
    // troca a face por tempo (não pelo fim da animação, que para com a aba em segundo plano)
    setTimeout(()=>{els.forEach((el,k)=>transformFx(el,()=>{
      const c=to[k];el.innerHTML=faceHTML(c);el.setAttribute('aria-label',cardName(c));
      el.classList.remove('c-w','c-r','c-y','c-g','c-b');el.classList.add('c-'+c.color);
    }))},at);
    setTimeout(()=>{
      if(box){box.animate([{opacity:1},{opacity:0}],{duration:250,fill:'forwards'});setTimeout(()=>box.remove(),260)}
      else els.forEach(el=>el.getAnimations().forEach(a=>a.cancel()));
    },total-250*sp);
  }
  return total;
}
function peek(i,c){
  if(RM)return;const r=targetRect(i);if(!r)return;
  const el=makeCard(c);el.className=`card c-${c.color} peekc`;el.disabled=true;
  const w=shownW(r);el.style.setProperty('--cw',w+'px');el.style.left=Math.max(4,Math.min(innerWidth-w-4,r.left+r.width/2-w/2))+'px';el.style.top=(r.bottom+4)+'px';
  document.body.appendChild(el);el.addEventListener('animationend',()=>el.remove());
}
function revealCard(pi,c){
  if(!c)return;
  if(pi===0){const el=document.querySelector(`#hand [data-id="${c.id}"]`);if(el){el.classList.add('revealed');setTimeout(()=>el.classList.remove('revealed'),2200)}}
  else peek(pi,c);
}
const RICON={stack:'📚',sequence:'🔢',neighbor:'↕️',hell:'🔥',jumpin:'✂️',perfection:'💯',clean:'🧼',nou:'↩️',satisfaction:'😤',insatisfaction:'👋',
  fastdraw:'⏩',tracking:'🔎',overload:'🏋️',dos:'✌️',shiny:'🌈',team:'🤝',black:'🔘',noaction:'🥱',mess:'🎭',
  revelation:'🔦',mini:'🤏',maxi:'🤌',mulligan:'🆕',camouflage:'😶‍🌫️',bg:'🩵',nochallenge:'🤐',twohands:'✋',poker:'🃏',
  tournament:'🏆',survivor:'🏅',weather:'🌤️',mix:'⇄⊘',plus99:'+99',dfnormal:'✅',dfrise:'📶',dfsuper:'✳️',dfnone:'❎'};
// ícones de texto (+99, ⇄⊘) usam fonte menor para caber no círculo
const txtIcon=ic=>/[+⇄⊘]/.test(ic);
function ruleIcon(k){
  if(RICON[k])return RICON[k];
  const e=Object.entries(SP).find(([t,v])=>(v.rule||t)===k&&!v.hide)||Object.entries(SP).find(([t,v])=>(v.rule||t)===k);
  return e?e[1].g:'📜';
}
const ruleDesc=k=>(RULES.find(r=>r.k===k)||{}).d||'';
// possibilidades do Dado, da Maldição e das Cartas de Clima: uma por linha, com ícone (durante o jogo aparecem sempre;
// no menu de regras, só ao tocar em "Ver ...")
const RULE_MORE={dice:'consequências',curse:'maldições',weather:'climas'};
function ruleItems(k){
  const dot=t=>t.replace(/\.$/,'');
  if(k==='dice')return DICE_TXT.map((t,i)=>({ic:diceSVG(i+1,'1.15rem'),txt:t}));
  if(k==='curse')return Object.values(CURSES).map(c=>({ic:c.g,txt:`<b>${c.nm}:</b> ${dot(c.t)}`}));
  if(k==='weather')return Object.values(WEATHER).map(w=>({ic:w.g,txt:`<b>${w.n}:</b> ${dot(w.t)}`}));
  return null;
}
const ruleListHtml=k=>{const L=ruleItems(k);return L?`<span class="rlist">${L.map(x=>`<span class="rl"><i>${x.ic}</i><span>${x.txt}</span></span>`).join('')}</span>`:''};
function notice(k,by,opts={}){
  const box=$('notices');
  const ex=box.querySelector(`[data-k="${k}"]`);if(ex)ex.remove();
  const el=document.createElement('div');el.className='notice'+(opts.gone?' gone':'');el.dataset.k=k;el.setAttribute('role','status');
  const ic=ruleIcon(k);
  el.innerHTML=`<div class="ni">${ic}</div><div class="nt">${opts.title||(opts.gone?'Regra removida: ':'Nova regra: ')+RNAME[k]}</div><div class="nb">${by||''}</div><div class="nd">${ruleDesc(k)}${ruleListHtml(k)}</div>`;
  el.onclick=()=>{el.remove();document.querySelectorAll('.ri.on').forEach(x=>x.classList.remove('on'))};
  if(opts.anchor){box.innerHTML='';const r=opts.anchor.getBoundingClientRect();box.style.top=(r.bottom+12)+'px';box.appendChild(el);el.classList.add('pointed');
    requestAnimationFrame(()=>{const a=$('rulestrip').querySelector(`[data-k="${k}"]`)||opts.anchor;box.style.top=(a.getBoundingClientRect().bottom+12)+'px'})}
  else{box.style.top='';box.appendChild(el)}
  while(box.children.length>3)box.firstElementChild.remove();
  if(!opts.info)sfx('rule');
}
function renderRuleStrip(){
  const keys=ruleKeys();
  const sig=keys.join(',');const strip=$('rulestrip');
  if(strip.dataset.sig===sig)return;strip.dataset.sig=sig;
  const fresh=VIS.freshRules||[];VIS.freshRules=[];
  strip.innerHTML=keys.map(k=>{const ic=ruleIcon(k);const txt=txtIcon(ic);
    return `<button class="ri ${txt?'txt':''} ${fresh.includes(k)?'fresh':''} ${VIS.stripHold?'pre':''}" data-k="${k}" aria-label="${RNAME[k]}">${ic}</button>`}).join('');
  const f=strip.querySelector('.fresh');if(f){VIS.progScroll=Date.now();f.scrollIntoView({behavior:'auto',inline:'center',block:'nearest'})}
  strip.querySelectorAll('.fresh').forEach(freshen);
}
// destaque de regra nova: some sozinho (e suave) depois de 6 s, mesmo sem tocar no ícone
function freshen(el){el.classList.add('fresh');setTimeout(()=>el.classList.remove('fresh'),6000)}
function openPoker(){
  const list=S.added.map(a=>{const ic=ruleIcon(a.k);
    return `<div class="pk"><div class="pk-ic ${txtIcon(ic)?'txt':''}">${ic}</div><div class="pk-body"><div class="pk-head"><b>${RNAME[a.k]}</b><em class="new">${texto(a.by)==='você'?'sua':'de '+texto(a.by)}</em></div><p>${ruleDesc(a.k)}</p></div></div>`}).join('');
  $('pokerList').innerHTML=list||'<p class="sub">Nenhuma regra disponível para escolher.</p>';
  VIS.freshRules=[];render();
  $('pokerOv').classList.add('show');$('pokerGo').focus();
  $('pokerGo').onclick=()=>{
    // os ícones voam para a faixa assim que esta pessoa fecha a lista; as cartas saem quando todas fecharem
    fechaListaMix();acao({t:'fecharMix'});
    if(S.mixFaltam&&S.mixFaltam.length)toast('Esperando os outros fecharem a lista…');
  };
}
// fecha a lista do Mix desta tela e manda os ícones para a faixa (uma vez só)
function fechaListaMix(){
  if(VIS.mixVoou)return;VIS.mixVoou=true;
  const aberta=$('pokerOv').classList.contains('show');
  const src=aberta?[...$('pokerList').querySelectorAll('.pk-ic')].map((el,j)=>({k:S.added[j].k,r:el.getBoundingClientRect(),fs:getComputedStyle(el).fontSize})):[];
  $('pokerOv').classList.remove('show');
  flyRules(src);
}
// Mix de Regras: os ícones escolhidos voam até a faixa e ficam centralizados sozinhos; depois os ícones das
// outras regras entram um por vez na ponta direita, crescendo, e a fileira se recentraliza aos poucos. Só então as cartas são distribuídas
function flyRules(src,done=()=>{}){
  const g=S.gen,strip=$('rulestrip');VIS.stripHold=false;
  const all=[...strip.querySelectorAll('.ri')];
  if(RM){all.forEach(el=>el.classList.remove('pre'));done();return}
  const chosen=src.map(s=>({s,tgt:strip.querySelector(`[data-k="${s.k}"]`)})).filter(x=>x.tgt);
  const rest=all.filter(el=>!chosen.some(x=>x.tgt===el));
  const grow=()=>{
    if(!rest.length){done();return}
    rest.forEach((el,j)=>setTimeout(()=>{if(g!==S.gen)return;el.classList.remove('pre');
      el.animate([{width:0,marginLeft:'-0.375rem',transform:'scale(0)'},{width:'2rem',marginLeft:0,transform:'scale(1.2)',offset:.7},{width:'2rem',marginLeft:0,transform:'none'}],{duration:420,easing:'ease-out'});sfx('tick')},j*260));
    setTimeout(()=>{if(g===S.gen)done()},rest.length*260+450);
  };
  if(!chosen.length){grow();return}
  sfx('rule');
  // os escolhidos ocupam a faixa (ainda invisíveis), já centralizados entre si
  chosen.forEach(x=>{x.tgt.classList.remove('pre');x.tgt.style.visibility='hidden'});
  const st=strip.getBoundingClientRect();let left=chosen.length;
  const end=()=>{if(--left===0)setTimeout(()=>{if(g===S.gen)grow()},300)};
  chosen.forEach(({s,tgt},j)=>{
    const a=s.r,b=tgt.getBoundingClientRect();
    const bx=Math.max(st.left+b.width/2,Math.min(st.right-b.width/2,b.left+b.width/2)),by=b.top+b.height/2;
    const el=document.createElement('div');el.className='rulefly';el.textContent=ruleIcon(s.k);
    Object.assign(el.style,{left:(a.left+a.width/2)+'px',top:(a.top+a.height/2)+'px',fontSize:s.fs});
    document.body.appendChild(el);
    const sc=Math.max(.3,b.height/a.height);
    el.animate([{transform:'translate(-50%,-50%) scale(1.2)'},{transform:`translate(calc(-50% + ${bx-a.left-a.width/2}px),calc(-50% + ${by-a.top-a.height/2}px)) scale(${sc})`}],
      {duration:700,delay:j*160,easing:'cubic-bezier(.5,0,.3,1)',fill:'both'});
    // termina por tempo: com a aba em segundo plano a animação para, e a partida não pode ficar esperando
    setTimeout(()=>{
      el.remove();tgt.style.visibility='';if(g!==S.gen){end();return}
      tgt.animate([{transform:'scale(1.6)'},{transform:'none'}],{duration:300,easing:'cubic-bezier(.2,.9,.3,1.3)'});freshen(tgt);sfx('tick');end()},j*160+700);
  });
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
