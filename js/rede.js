/* unotfm: rede de mentira (etapa H do multiplayer). Duas abas jogam a mesma partida: o anfitrião (?rede=anfitriao) roda
   a mesa e joga na cadeira 0; o convidado (?rede=convidado) só tem a tela e joga na cadeira 1. Elas conversam por
   BroadcastChannel, e toda mensagem vira texto (JSON) e chega 100 a 300 ms depois, como numa rede de verdade.
   - Anfitrião → convidado: cada evento da mesa (girado para o convidado ficar na cadeira 0) com a visão dele da partida
     (visao), e os pedidos de escolha (CONTROLES.rede).
   - Convidado → anfitrião: as ações (acao → agir) e as respostas dos pedidos. O anfitrião confere tudo.
   Sem ?rede, nada daqui roda. */
const REDE_MODO=new URLSearchParams(location.search).get('rede'); // 'anfitriao', 'convidado' ou null
const REDE={canal:null,fila:[],ultimo:0,seq:0,pedidos:{},cadeira:1,conectado:false,enviadas:0,recebidas:0,ultimas:[]}; // contadores: para os testes
// manda pela "rede": vira texto e chega depois de 100 a 300 ms, sempre na ordem em que saiu
// (uma fila só: com um timer por mensagem, duas marcadas para quase o mesmo instante podiam chegar trocadas)
function redeEnvia(msg){
  const txt=JSON.stringify(msg);REDE.enviadas++;
  const em=Math.max(REDE.ultimo,realNow()+100+Math.random()*200);REDE.ultimo=em;
  REDE.fila.push({em,txt});
  if(REDE.fila.length===1)nativeTimeout(redeEntrega,em-realNow());
}
function redeEntrega(){
  while(REDE.fila.length&&REDE.fila[0].em<=realNow())REDE.canal.postMessage(REDE.fila.shift().txt);
  if(REDE.fila.length)nativeTimeout(redeEntrega,Math.max(0,REDE.fila[0].em-realNow()));
}
function redeAviso(txt){
  let el=document.getElementById('redeAviso');
  if(!el){el=document.createElement('div');el.id='redeAviso';
    Object.assign(el.style,{position:'fixed',left:'50%',top:'calc(env(safe-area-inset-top,0px) + 0.25rem)',transform:'translateX(-50%)',zIndex:40,
      background:'var(--panel)',border:'2px solid var(--accent)',borderRadius:'0.75rem',padding:'0.125rem 0.625rem',fontSize:'.72rem',fontWeight:'600',pointerEvents:'none'});
    document.body.appendChild(el)}
  el.textContent=txt;
}

/* ---------- anfitrião: roda a mesa ---------- */
// a pessoa da outra aba responde aos pedidos de lá: a janela abre lá, e a resposta volta para cá (respondePedido)
CONTROLES.rede={
  jogada(){},
  pedido(pi,ped){
    const g=S.gen;
    const envia=()=>{
      if(g!==S.gen||S.phase==='over')return;
      const t=ped.tela||{},id=++REDE.seq;
      const opcoes=ped.tipo==='cor'||ped.tipo==='memoria'?null:t.opcoes();
      if(ped.tipo==='regra'&&!opcoes.length){ped.responde(null);return}
      REDE.pedidos[id]={pi,ped,opcoes};
      redeEnvia({t:'pedido',id,tipo:ped.tipo,carta:copia(ped.carta),titulo:t.titulo,sub:t.sub,mix:!!ped.mix,
        opcoes:opcoes&&(ped.tipo==='alvo'?opcoes.map(i=>giraPara(pi,i)):copia(opcoes))});
    };
    // os mesmos tempos da tela deste aparelho: cor e Mix na hora; carta especial depois do anúncio
    if(ped.tipo==='cor'){S.busy=true;atualiza();envia();return}
    if(ped.mix){envia();return}
    S.busy=true;atualiza();
    if(ped.ja){envia();return}
    if(S.preLanded===ped.carta){S.preLanded=null;envia();return}
    agendar(envia,480);
  },
};
// resposta de um pedido: só vale se for uma das opções oferecidas (senão, a mesa escolhe a primeira)
function respondePedido(m){
  const pd=REDE.pedidos[m.id];if(!pd||!S)return;delete REDE.pedidos[m.id];
  const {pi,ped,opcoes}=pd;
  S.busy=false; // como a janela fechando na tela deste aparelho
  if(ped.tipo==='cor')return ped.responde(COLORS.includes(m.valor)?m.valor:bestColor(S.players[pi].hand));
  if(ped.tipo==='alvo'){const t=giraDe(pi,m.valor);return ped.responde(opcoes.includes(t)?t:opcoes[0])}
  if(ped.tipo==='carta')return ped.responde(opcoes.find(c=>c.id===m.valor)||opcoes[0]);
  if(ped.tipo==='regra')return ped.responde(opcoes.includes(m.valor)?m.valor:opcoes[0]);
  if(ped.tipo==='memoria'){
    // a mesa confere os toques em vez de acreditar no "acertei"
    const taps=Array.isArray(m.toques)?m.toques:[];
    const ok=taps.length===S.simon.length&&taps.every((c,i)=>sameCol(c,S.simon[i]));
    return ped.responde(ok,ok?(COLORS.includes(m.valor)?m.valor:'r'):null);
  }
}
function redeComeca(){
  OPCOES.controles=['tela','rede','bot','bot','bot','bot'];OPCOES.nomes=['Anfitrião','Convidado'];
  R=rulesForMode();R.bots=Math.max(R.bots,1);R.tournament=false;R.survivor=false;TOUR=null;
  $('endOv').classList.remove('show');$('settingsOv').classList.remove('show');
  newGame();
}
function redeAnfitriao(){
  redeAviso('Rede de mentira: anfitrião (esperando o convidado em outra aba, com ?rede=convidado)');
  $('home').hidden=true;
  REDE.canal.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.t==='ola'){
      REDE.conectado=true;redeAviso('Rede de mentira: anfitrião, com o convidado na cadeira 1');
      if(!S||S.phase==='over')redeComeca();else redeEnvia({t:'evento',ev:{t:'atualiza'},visao:visao(REDE.cadeira)});
      return;
    }
    // ação do convidado: a mesa confere; se recusar, ele fica sabendo na hora (e a prévia dele sai)
    if(m.t==='acao'&&m.acao){const a={...m.acao};if(typeof a.alvo==='number')a.alvo=giraDe(REDE.cadeira,a.alvo);if(!agir(REDE.cadeira,a))redeEnvia({t:'recusada',n:m.n});return}
    if(m.t==='escolher')respondePedido(m);
  };
  // cada evento da mesa vai para o convidado (os que são só de outro jogador, não), girado e com a visão dele
  OUVINTES.push(ev=>{
    if(!REDE.conectado||!S||!S.players||!S.players[REDE.cadeira])return;
    const pi=REDE.cadeira;
    if(ev.a!=null&&ev.a!=='todos'&&ev.a!==pi)return;
    redeEnvia({t:'evento',ev:eventoPara(pi,ev),visao:visao(pi)});
  });
}

/* ---------- convidado: só a tela ---------- */
function redeConvidado(){
  redeAviso('Rede de mentira: convidado (procurando o anfitrião)');
  $('home').hidden=true;
  acaoRemota=a=>{const n=++REDE.seq;if(VIS.previa)VIS.previa.n=n;redeEnvia({t:'acao',acao:a,n});return true};
  // o convidado não tem mesa: se a tela chamar uma regra direto (em vez de acao), é erro, e os testes pegam pelo console
  for(const k of ['agir','jogar','termina','playCard','takeDraw','endTurn','startTurn','doJumpIn','penalize','doChallenge','newGame','dealAndStart','comecaMix','drawOne','markOut'])
    globalThis[k]=()=>console.error('O convidado chamou uma regra direto: '+k);
  // começar e recomeçar a partida é com o anfitrião
  $('startBtn').onclick=$('againBtn').onclick=()=>{$('endOv').classList.remove('show');$('settingsOv').classList.remove('show')};
  const ola=()=>{if(!REDE.conectado){redeEnvia({t:'ola'});setTimeout(ola,1500)}};ola();
  REDE.canal.onmessage=e=>{
    const m=JSON.parse(e.data);REDE.recebidas++;REDE.ultimas=[...REDE.ultimas.slice(-5),m.t+':'+(m.ev?m.ev.t:'')];
    if(!REDE.conectado){REDE.conectado=true;redeAviso('Rede de mentira: convidado')}
    if(m.visao){
      // a visão substitui a partida inteira; o que a tela guardou nela (janela aberta) continua
      const auto=S&&S.autoResolve,pre=S&&S.preLanded;
      S=m.visao.S;R=m.visao.R;TOUR=m.visao.TOUR;
      if(auto)S.autoResolve=auto;if(pre)S.preLanded=pre;
    }
    if(m.t==='evento'){if(m.ev.t!=='mostraMix')TELA(m.ev)} // a janela do Mix (começar a partida) é do anfitrião
    else if(m.t==='pedido')redeAbrePedido(m);
    else if(m.t==='recusada'&&VIS.previa&&VIS.previa.n===m.n)desfazPrevia('recusada');
  };
}
// pedido do anfitrião: abre a mesma janela da tela e manda a escolha de volta
function redeAbrePedido(m){
  const resp=(valor,extra)=>redeEnvia({t:'escolher',id:m.id,valor,...extra});
  if(m.tipo==='cor'){S.busy=true;openColors(col=>resp(col),m.carta);return}
  abrirPedido(0,{tipo:m.tipo,carta:m.carta,mix:m.mix,tela:{titulo:m.titulo,sub:m.sub,opcoes:()=>m.opcoes},
    responde:(v,col,taps)=>m.tipo==='carta'?resp(v&&v.id):m.tipo==='memoria'?resp(col,{toques:taps||[]}):resp(v)});
}

if(REDE_MODO==='anfitriao'||REDE_MODO==='convidado'){
  REDE.canal=new BroadcastChannel('unotfm-rede');
  // o turbo só existe no solo
  turboStart=()=>{};
  if(REDE_MODO==='anfitriao')redeAnfitriao();else redeConvidado();
}
