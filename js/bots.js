/* unotfm solo: inteligência dos adversários (inclui o nível Mestre) */
/* ---------- bots ---------- */
function scheduleBot(){
  const g=S.gen,tok=S.tok;
  setTimeout(()=>{
    if(g!==S.gen||tok!==S.tok||S.phase==='over'||!cur().bot||S.busy)return;
    if(cur().out){endTurn();return}
    botAct();
  },S.spectate?Math.max(350+Math.random()*250,Math.min(700,(S.fxUntil||0)-Date.now())):Math.max(1400+Math.random()*700,(S.fxUntil||0)-Date.now()+400));
}
function colorCounts(hand){const o={r:0,y:0,g:0,b:0};hand.forEach(c=>{if(c.color!=='w')o[c.color]++});return o}
/* ---------- Mestre: memória e decisões ---------- */
const memSet=pi=>(S.mem.lacks[pi]=S.mem.lacks[pi]||new Set());
function memLack(pi,c){if(!S.mem||!c||c==='k'||c==='w')return;memSet(pi).add(c);if(R.bg&&(c==='b'||c==='g')){memSet(pi).add('b');memSet(pi).add('g')}}
function memPlay(pi,card){if(!S.mem)return;const k=card.type+':'+(card.value??'');S.mem.played[k]=(S.mem.played[k]||0)+1;
  if(card.color!=='w'){memSet(pi).delete(card.color);if(R.bg&&(card.color==='b'||card.color==='g')){memSet(pi).delete('b');memSet(pi).delete('g')}S.mem.lastCol[pi]=card.color}}
function memReset(pi){if(S.mem){delete S.mem.lacks[pi];delete S.mem.lastCol[pi]}}
const lacksCol=(pi,c)=>!!(S.mem&&S.mem.lacks[pi]&&S.mem.lacks[pi].has(c));
function threats(){return alive().filter(i=>i!==S.turn&&i!==partner(S.turn)&&S.players[i].hand.length<=2)}
function masterColor(hand,pi){
  const cc=colorCounts(hand);const nx=nextIdx(pi,1);const th=threats();
  let best=null,bs=-1e9;
  for(const c of COLORS){
    if(R.bg&&c==='g')continue;
    const own=R.bg&&c==='b'?cc.b+cc.g:cc[c];
    let s=own*3;
    if(nx!==partner(pi)&&lacksCol(nx,c))s+=5;
    th.forEach(i=>{if(lacksCol(i,c))s+=4;if(S.mem.lastCol[i]===c)s-=4});
    if(nx!==partner(pi)&&S.mem.lastCol[nx]===c)s-=2;
    if(own===0)s-=4;
    s+=Math.random()*.3;
    if(s>bs){bs=s;best=c}
  }
  return best||rand(COLORS);
}
function masterBonus(p,c,nn){
  let s=0;const pi=S.turn;const nx=nextIdx(pi,1);const enemyNext=nx!==partner(pi);
  if(S.pending===0&&c.color!=='w'){
    if(enemyNext&&lacksCol(nx,c.color))s+=8;
    if(enemyNext&&S.mem.lastCol[nx]===c.color)s-=4;
    threats().forEach(i=>{if(lacksCol(i,c.color))s+=10;if(S.mem.lastCol[i]===c.color)s-=8});
  }
  const wilds=p.hand.filter(x=>x.color==='w'&&x.type!=='bomb').length;
  if(c.color==='w'&&wilds===1&&p.hand.length>2&&!threats().length)s-=15;
  if(S.pending===0&&(c.type==='skip'||c.type==='d2'||c.type==='rev')&&!threats().length&&nn>3&&p.hand.length>3)s-=6;
  if(isDraw(c)&&S.pending===0){const total=R.noaction?0:8,left=total-(S.mem.played['d2:']||0);if(left<=0&&nn<=3)s+=8}
  if(c.type==='num'&&R.perfection&&c.value===p.hand.length)s+=10;
  if(c.type==='num'&&R.perfection&&!threats().length){const nxtLen=p.hand.length-1;if(p.hand.some(x=>x!==c&&x.type==='num'&&x.value===nxtLen))s+=4}
  if(c.type==='trade'){const opp=alive().filter(i=>i!==pi);const mn=opp.length?Math.min(...opp.map(i=>S.players[i].hand.length)):99;if(p.hand.length-mn<2)s-=25}
  if(c.type==='carousel'){const prev=alive().find(i=>nextIdx(i,1)===pi);if(prev!=null&&S.players[prev].hand.length>=p.hand.length)s-=20}
  if(c.type==='blizzard'&&p.hand.length>nn+2)s+=10;
  return s;
}
function masterChallenge(ch){
  const by=ch.by,ah=S.players[by].hand.length;
  if(lacksCol(by,ch.col))return S.death?0:.05;
  if(S.mem.lastCol[by]&&sameCol(S.mem.lastCol[by],ch.col))return S.death?.75:.8;
  return S.death?(ah>=6?.35:.1):(ah>=5?.4:.2);
}
function bestColor(hand){
  if(R.diff==='master'&&S&&S.mem&&S.phase!=='over'&&cur()&&cur().bot)return masterColor(hand,S.turn);
  const cc=colorCounts(hand);const m=Math.max(...Object.values(cc));
  if(R.diff==='easy'||m===0)return rand(COLORS);
  return rand(COLORS.filter(c=>cc[c]===m));
}
function botChoose(p,opts){
  if(S.pending===0&&!R.nochallenge&&(S.death||Math.random()<{easy:.4,normal:.7,hard:.85,master:.97}[R.diff])){
    const hasCol=p.hand.some(x=>x.color!=='w'&&sameCol(x.color,S.color));
    if(hasCol){const safe=opts.filter(c=>!(c.type==='d4'||c.type==='d99'));if(safe.length)opts=safe}
  }
  if(ab(S.turn,'elise')&&S.pending===0){const fair=opts.filter(c=>!(c.type==='d4'||c.type==='d99')||!p.hand.some(x=>x.color!=='w'&&sameCol(x.color,S.color)));if(fair.length)opts=fair}
  if(R.diff==='easy'||confused(S.turn))return rand(opts);
  const nn=S.players[nextIdx(S.turn,1)].hand.length;
  const cc=colorCounts(p.hand);
  let best=null,bs=-1e9;
  for(const c of opts){
    let s=0;
    if(S.pending>0)s=c.type==='rev'?14:10;
    else if(c.type==='num'){
      s=10+cc[c.color]*3;
      if(R.stack)s+=p.hand.filter(x=>x.type==='num'&&x.value===c.value).length*4;
      if(R.sequence)s+=p.hand.filter(x=>x.type==='num'&&x.color===c.color&&Math.abs(x.value-c.value)===1).length*4;
      if(R.perfection&&c.value===p.hand.length)s+=25;
    }else if(c.type==='skip'||c.type==='rev'||c.type==='d2'){
      s=(nn<=2?45:(R.diff==='hard'||R.diff==='master'?6:12))+cc[c.color]*2+(c.type==='d2'?2:0);
    }else if(SP[c.type]){
      const opp=alive().filter(i=>i!==S.turn),mn=opp.length?Math.min(...opp.map(i=>S.players[i].hand.length)):99;
      const sc={trade:10+(p.hand.length-mn)*6,carousel:10,gift:18,web:nn<=2?40:12,rain:20,thunder:12,equality:10+(p.hand.length-3)*6,
        justice:opp.filter(i=>S.players[i].hand.length<p.hand.length).length*9,magnet:6+p.hand.filter(x=>x.color===c.color).length*9,
        tornado:8,steal:12,wish:8,peace:mn<=2?25:5,luck:10,random:11,clone:topCard().type==='num'?3:14,
        batata:30+(p.batata||0)*10,curse:10,dice:14,oddeven:6,half:p.hand.length<=2?30:1,death:p.hand.length<=3?25:3,share:10,simon:6,chair:6,view:5,
        treasure:20+(p.treasure||0)*10,chest:999,lock:12,theft:10,ban:8,box:8,confuse:1,ink:12,mix1:nn<=2?45:14,mix2:nn<=2?50:16,mix3:16,
        d99:nn<=2?80:(p.hand.length<=2?40:1),rule:8,
        portal:(()=>{if(!S.other)return 0;const oh=S.other.players[S.turn].hand.length,h=p.hand.length-1;let v=-8;if(oh<=h-2)v=35;
          const th=alive().filter(i=>i!==S.turn&&S.players[i].hand.length<=2);if(th.some(i=>S.other.players[i].hand.length>3))v=Math.max(v,30);if(oh>=h+3&&!th.length)v=-25;return v})(),
        sun:12,fog:p.hand.length<=3?28:6,storm:10,blizzard:(p.hand.length>6||S.players[nextIdx(S.turn,1)].hand.length<=2)?22:6};
      s=(sc[c.type]??10)+(cc[c.color]||0);
    }else if(c.type==='wild'){s=p.hand.length<=2?30:2}
    else{s=nn<=2?50:(p.hand.length<=2?28:0)}
    if(R.clean&&p.hand.length===2&&c.type!=='num')s+=60;
    if(S.weather==='sun'&&S.pending===0&&!matchTop(c))s-=14;
    if(S.weather==='storm'&&S.pending===0&&(c.color==='w'||!sameCol(c.color,S.color)))s+=8;
    if(R.overload&&nn>=8&&isDraw(c))s+=40;
    if(R.team&&partner(S.turn)===nextIdx(S.turn,1)&&['skip','d2','d4'].includes(c.type)&&S.pending===0)s-=40;
    {const opp=alive().filter(i=>i!==S.turn),mn=opp.length?Math.min(...opp.map(i=>S.players[i].hand.length)):99;
     if(mn<=2)s+=cardPoints(c)/4;
     if(S.peace>0&&c.type!=='num')s+=mn<=2?6:-12;
     const lim=limit(),nxt=S.players[nextIdx(S.turn,1)];
     if(lim<999&&isDraw(c)&&lim-nxt.hand.length<=drawVal(c))s+=35;
     if(S.pending>0&&R.combo==='rise')s+=c.type==='d2'?6:c.type==='d4'?3:0;
     if(R.clean&&p.hand.length<=3&&c.type==='num'&&p.hand.filter(x=>x.type==='num').length===1)s-=20;
     if(c.type==='batata'&&p.batata>=3)s+=40;
     if(S.weather==='blizzard'&&isDraw(c))s-=10;
     if(S.color==='k'&&c.color==='w'&&p.hand.length>3)s-=8;}
    if(R.diff==='master')s+=masterBonus(p,c,nn);
    s+=Math.random()*(R.diff==='normal'?10:R.diff==='master'?.5:2);
    if(s>bs){bs=s;best=c}
  }
  return best;
}
function botAct(){
  const pi=S.turn,p=cur();
  if(S.phase==='combo'){
    const opts=p.hand.filter(c=>canPlay(p,c));
    if(!opts.length){endTurn();return}
    const cc=colorCounts(p.hand);
    opts.sort((a,b)=>cc[a.color]-cc[b.color]);
    botPlay(opts[0]);return;
  }
  if(S.phase==='drawn'){const o=p.hand.filter(c=>canPlay(p,c,confused(pi)));if(o.length)botPlay(botChoose(p,o));else endTurn();return}
  const opts=p.hand.filter(c=>canPlay(p,c,confused(pi)));
  if(S.pending>0&&S.chal&&S.chal.by!==pi&&!opts.length){
    const ah=S.players[S.chal.by].hand.length;let pr=R.diff==='master'?masterChallenge(S.chal):{easy:.15,normal:ah>=5?.35:.22,hard:ah>=5?.5:ah>=3?.3:.15}[R.diff];if(S.death&&R.diff!=='master')pr*=ah>=6?.8:.35;
    if(S.pending>=99)pr=1; // comprar o +99 elimina: desafiar é a única chance
    if(Math.random()<pr){doChallenge(pi);return}
  }
  if(!opts.length){takeDraw(pi);return}
  if(S.phase==='combo'&&confused(pi)){endTurn();return}
  botPlay(botChoose(p,opts));
}
function randomPool(){
  const ex=['random','clone','bomb','chest','d99','half','simon','batata'];
  const pool=R.noaction?[]:['skip','rev','d2'];
  if(!R.noaction)Object.entries(SP).forEach(([k,v])=>{if(!ex.includes(k)&&spOn(k))pool.push(k)});
  return pool.length?pool:['skip','rev','d2'];
}
function morphCard(card,prev){
  card.orig=card.orig||card.type;
  if(card.type==='clone'&&(!prev||['chest','batata','simon','half','bomb','clone','random'].includes(prev.type)))card.type='random';
  if(card.type==='clone'){card.type=prev.type;card.value=prev.value;card.color=(prev.color==='w'||prev.color==='k')?'w':prev.color}
  else if(card.type==='random'){card.type=rand(randomPool());card.value=null;card.color=rand(COLORS)}
}
const ASK_TYPES=['trade','gift','web','wish','ban','theft','batata','rule','simon'];
const needsAnn=(pi,card)=>card.type==='random'||card.type==='clone'||(pi!==0&&(isWildPick(card)||ASK_TYPES.includes(card.type)));
function announce(pi,card,cont,wait){
  clearFlash();
  const p=S.players[pi];const rect=S.fastSrc||srcRect(pi,card);S.fastSrc=null;
  p.hand=p.hand.filter(c=>c.id!==card.id);
  card.rot=Math.random()*24-12;S.discard.push(card);S.ann=card;
  if(p.bot&&p.hand.length===target())afterOneCard(pi);
  S.animPlay=rect;S.busy=true;S.announcing=true;S.annText='';sfx('play');
  render();
  const g=S.gen;
  const done=()=>{if(g!==S.gen||S.phase==='over')return;S.busy=false;S.announcing=false;cont()};
  setTimeout(()=>{
    if(g!==S.gen||S.phase==='over')return;
    if(S.peace<=0&&(card.type==='clone'||card.type==='random')){
      const og=SP[card.type].g;
      morphCard(card,S.discard[S.discard.length-2]);S.lastTop=null;S.morph=true;card.flipped=true;
      fx(og,`Virou ${card.color==='w'?label(card):cardName(card)}`,CVAR[card.color]||'var(--accent)','stamp');
      render();setTimeout(done,S.spectate?400:950);
    }else done();
  },wait||(S.spectate?400:950));
}
function botPlay(card){
  const pi=S.turn;
  if(needsAnn(pi,card)){announce(pi,card,()=>botPlayNow(card,pi));return}
  if(card.type!=='num'){announce(pi,card,()=>botPlayNow(card,pi),S.spectate?250:480);return}
  botPlayNow(card,pi);
}
function botPlayNow(card,pi0){
  const pi=S.turn,p=cur();
  const col=isWildPick(card)&&S.peace<=0?bestColor(p.hand.filter(c=>c.id!==card.id)):null;
  const go=()=>{const r=playCard(pi,card,col);
    if(r==='win'||r==='defer')return;
    if(r==='combo'){S.tok++;render();scheduleBot();return}
    endTurn()};
  if(col&&!confused(pi)){const cols=COLORS.filter(c=>!(R.bg&&c==='g'));S.busy=true;botThink(pi,'color',cols,Math.max(0,cols.findIndex(c=>sameCol(c,col))),()=>{S.busy=false;go()});return}
  go();
}
