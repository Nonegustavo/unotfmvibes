/* unotfm solo: "Terminar e descobrir vencedor" (turbo). Todo setTimeout passa pelo invólucro daqui: fora do turbo
   vai para o timer do navegador; no turbo, para uma fila de tempo virtual que turboRun() roda sem esperar */
/* Turbo ("Terminar e descobrir vencedor"): todo setTimeout passa por aqui. Fora do turbo vai para o timer do navegador
   e fica registrado em TB.live; no turbo entra numa fila de tempo virtual (TB.q) que turboRun() roda
   sem esperar, na ordem em que os timers venceriam. Date.now() acompanha o tempo virtual */
const TB={on:false,now:0,seq:0,turns:0,q:new Map(),live:new Map()};
const nativeTimeout=setTimeout.bind(window),nativeClear=clearTimeout.bind(window),realNow=Date.now.bind(Date);
window.setTimeout=(fn,ms,...a)=>{
  const id=++TB.seq;ms=Math.max(0,+ms||0);
  if(TB.on)TB.q.set(id,{fn,a,due:TB.now+ms,id});
  else TB.live.set(id,{fn,a,due:realNow()+ms,h:nativeTimeout(()=>{TB.live.delete(id);fn(...a)},ms)});
  return id;
};
window.clearTimeout=id=>{const t=TB.live.get(id);if(t){nativeClear(t.h);TB.live.delete(id)}TB.q.delete(id);if(TB.parados)TB.parados.delete(id)};
/* Pausa (menu do solo): os timers que estão esperando param e guardam quanto faltava (TB.parados); tbContinua arma
   todos de novo com esse tempo. Timers criados durante a pausa (os do próprio menu) correm normalmente */
TB.parados=null;
function tbPausa(){
  if(TB.on||TB.parados)return;
  const agora=realNow();TB.parados=new Map();
  for(const [id,t] of TB.live){nativeClear(t.h);TB.parados.set(id,{fn:t.fn,a:t.a,resta:Math.max(0,t.due-agora)})}
  TB.live.clear();
}
function tbContinua(){
  const p=TB.parados;if(!p)return;TB.parados=null;
  for(const [id,t] of p)TB.live.set(id,{fn:t.fn,a:t.a,due:realNow()+t.resta,h:nativeTimeout(()=>{TB.live.delete(id);t.fn(...t.a)},t.resta)});
}
Date.now=()=>TB.on?TB.now:realNow();

/* ---------- Terminar e descobrir vencedor (turbo) ----------
   Depois que você é eliminado, joga o resto da partida sem esperas, sons nem efeitos 3D: os timers pendentes vão
   para a fila virtual (TB, em data.js) e turboRun() os executa na ordem, em blocos curtos para a tela não travar.
   Ao terminar, o que sobrou da fila volta para o navegador (a tela de fim aparece no tempo normal).
   Partida longa demais (TURBO_MAX vezes): vence quem tiver menos pontos na mão */
const TURBO_MAX=2000;
let semTurbo=false; // jogando com outras pessoas (rede): quem é eliminado assiste no ritmo normal
function turboStart(){
  if(semTurbo||!S||S.phase==='over'||!S.players[0].out||TB.on)return;
  const now=realNow();
  TB.on=true;TB.now=now;TB.turns=S.vezes||0;TB.idle=0;
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
    if((S.vezes||0)-TB.turns>=TURBO_MAX){turboStop();S.timeWin=true;log('Partida longa demais: vence quem tem menos pontos na mão.');endRound(pointsLeader());return}
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
  if(S){S.turbo=false;S.fxUntil=0;VIS.progScroll=0}
  // restos visuais criados durante o cálculo
  $('fx').innerHTML='';$('toast').classList.remove('show');$('kingNote').classList.remove('show');document.querySelectorAll('.stamp,.showc,.peekc,.minidie,.think,.puff,.rulefly,.flyclone,.banc,.burst,.ghost,.pcover,.pring,.raincard,.raindrop,.rainsplash,.dropcard').forEach(e=>e.remove());
  $('turboOv').hidden=true;render();
}
