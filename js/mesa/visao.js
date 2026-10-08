/* unotfm, mesa: o que cada jogador pode saber da partida (visao) e o giro das cadeiras. Cada tela se vê na cadeira 0:
   a visão e os eventos chegam girados para quem os recebe. Mãos dos outros, monte, memória dos adversários, blefe do
   +4 e semente não saem daqui; das mãos dos outros vai só a quantidade (e o que é público: Batata, Mão Colorida).
   Não usa nada da página */
// cadeira da mesa -> cadeira de quem vê (pi fica na 0); e o contrário
const giraPara=(pi,i)=>typeof i!=='number'||i<0?i:(i-pi+S.players.length)%S.players.length;
const giraDe=(pi,i)=>typeof i!=='number'||i<0?i:(i+pi)%S.players.length;
const copia=o=>o==null?o:JSON.parse(JSON.stringify(o));
// cartas que só o dono vê: ficam só as públicas (a Batata, que todos viram passar)
const mascara=(mao,dono)=>dono?copia(mao):(mao||[]).map(c=>c.type==='batata'?copia(c):{oculta:true});
function jogadorVisto(q,dono,lado){
  const v={};
  for(const k of ['name','col','ctrl','called','out','outAt','outPts','outIcon','luck','webbed','confuse','confuseNext','treasure','batata','escaped','thorned'])if(q[k]!==undefined)v[k]=q[k];
  v.hand=mascara(q.hand,dono);v.hand2=mascara(q.hand2,dono);
  // Mão Colorida (R.shiny) é pública: se ele segura todas as cores ou um curinga
  v.colorida=colorful(q);
  return v;
}
function ladoVisto(pi,o,R0){
  // o outro lado do Portal: regras, clima, pilha e mãos (só a quantidade dos outros)
  const v={R:copia(R0)};
  for(const k of ['color','pending','pendingType','comboValue','seqDir','weather','peace','curse','death','traffic','simon','passes','added','removed'])v[k]=copia(o[k]);
  v.boom=giraPara(pi,o.boom);
  v.discard=copia(o.discard);v.deck=(o.deck||[]).map(()=>({oculta:true}));
  v.chal=o.chal?{by:giraPara(pi,o.chal.by),amt:o.chal.amt,col:o.chal.col}:null;
  const n=S.players.length;v.players=[];for(let k=0;k<n;k++){const i=(k+pi)%n;v.players.push(jogadorVisto(o.players[i],i===pi))}
  return v;
}
function visao(pi){
  const n=S.players.length,v={};
  for(const k of ['gen','tok','dir','pending','pendingType','phase','comboValue','seqDir','skip','extra','busy','color','side','weather','peace',
    'curse','death','traffic','simon','passes','added','removed','ruleOrder','timeWin','vezes','auto','spectate'])v[k]=copia(S[k]);
  v.turn=giraPara(pi,S.turn);v.boom=giraPara(pi,S.boom);
  v.drawnId=S.turn===pi?S.drawnId:null;
  v.mull=false;v.turbo=false;
  v.discard=copia(S.discard);v.ann=copia(S.ann);
  // monte: só a quantidade; com a Revelação, a carta do topo é de todos
  v.deck=S.deck.map(()=>({oculta:true}));if(R.revelation&&S.deck.length)v.deck[v.deck.length-1]=copia(S.deck[S.deck.length-1]);
  v.chal=S.chal?{by:giraPara(pi,S.chal.by),amt:S.chal.amt,col:S.chal.col}:null;
  v.players=[];for(let k=0;k<n;k++){const i=(k+pi)%n;v.players.push(jogadorVisto(S.players[i],i===pi))}
  v.other=S.other?ladoVisto(pi,S.other,S.other.R):null;
  return {S:v,R:copia(R),TOUR:copia(TOUR)};
}
// evento girado para quem vê (as cadeiras dentro dele)
function eventoPara(pi,ev){
  const e=copia(ev);
  for(const k of ['p','de','para','onde','pi','a','exceto'])if(typeof e[k]==='number')e[k]=giraPara(pi,e[k]);
  // balão escolhendo um jogador: as opções também são cadeiras
  if(e.t==='pensa'&&e.tipo==='player'&&Array.isArray(e.lista))e.lista=e.lista.map(i=>giraPara(pi,i));
  if(Array.isArray(e.vencedores))e.vencedores=e.vencedores.map(i=>giraPara(pi,i));
  return e;
}
