/* unotfm, mesa: o que cada jogador pode saber da partida (visao) e o giro das cadeiras. Cada tela se vê na cadeira 0:
   a visão e os eventos chegam girados para quem os recebe. Mãos dos outros, monte, memória dos adversários, blefe do
   +4 e semente não saem daqui; das mãos dos outros vai só a quantidade (e o que é público: Batata, Mão Colorida). Com
   a Neblina, ou com a Camuflagem enquanto ele não tem 1 carta, nem a quantidade: vão UNSEEN cartas, como os bots
   enxergam. Não usa nada da página */
// cadeira da mesa -> cadeira de quem vê (pi fica na 0); e o contrário
const giraPara=(pi,i)=>typeof i!=='number'||i<0?i:(i-pi+S.players.length)%S.players.length;
const giraDe=(pi,i)=>typeof i!=='number'||i<0?i:(i+pi)%S.players.length;
/* Espectador (quem entrou na sala com a partida andando, ou saiu da Sobrevivência): não tem cadeira. Ele vê a mesa a
   partir da cadeira ref (a do dono), com todas as cadeiras em cima: na cadeira 0 da visão dele fica um jogador de
   mentira, fora da partida e sem cartas (ele mesmo, como quem foi eliminado), e as de verdade vêm depois, uma a mais */
const giraEsp=(ref,i)=>typeof i!=='number'||i<0?i:giraPara(ref,i)+1;
const fantasma=nome=>({name:nome,col:'var(--accent)',ctrl:'espectador',espectador:true,out:true,hand:[],hand2:[],colorida:false});
const copia=o=>o==null?o:JSON.parse(JSON.stringify(o));
// cartas que só o dono vê: ficam só as públicas (a Batata, que todos viram passar); escondida: sem a quantidade
const mascara=(mao,dono,escondida)=>{
  if(dono)return copia(mao);
  if(!escondida)return (mao||[]).map(c=>c.type==='batata'?copia(c):{oculta:true});
  const pub=(mao||[]).filter(c=>c.type==='batata').map(copia);
  return [...pub,...Array.from({length:Math.max(0,UNSEEN-pub.length)},()=>({oculta:true}))];
};
function jogadorVisto(q,dono,escondida){
  const v={};
  for(const k of ['name','col','ctrl','mull','foraTorneio','ctrlReal','caiu','esgotou','called','out','outAt','outPts','outIcon','luck','webbed','confuse','confuseNext','treasure','batata','escaped','thorned'])if(q[k]!==undefined)v[k]=q[k];
  // o sino tocado antes de jogar é segredo até a carta sair
  if(dono&&q.sinoAntes)v.sinoAntes=true;
  v.hand=mascara(q.hand,dono,escondida);v.hand2=mascara(q.hand2,dono);
  // Mão Colorida (R.shiny) é pública: se ele segura todas as cores ou um curinga
  v.colorida=colorful(q);
  return v;
}
function ladoVisto(pi,o,R0,esp){
  // o outro lado do Portal: regras, clima, pilha e mãos (só a quantidade dos outros)
  const v={R:copia(R0)},g=i=>esp?giraEsp(pi,i):giraPara(pi,i);
  for(const k of ['color','pending','pendingType','comboValue','seqDir','weather','peace','curse','death','traffic','simon','passes','added','removed'])v[k]=copia(o[k]);
  v.boom=g(o.boom);
  v.discard=copia(o.discard);v.deck=(o.deck||[]).map(()=>({oculta:true}));
  v.chal=o.chal?{by:g(o.chal.by),amt:o.chal.amt,col:o.chal.col}:null;
  const n=S.players.length;v.players=esp?[fantasma(esp.nome)]:[];
  for(let k=0;k<n;k++){const i=(k+pi)%n,dono=!esp&&i===pi;v.players.push(jogadorVisto(o.players[i],dono,!dono&&handHidden(i,o)))}
  return v;
}
// a visão de quem assiste (sem cadeira): a partir da cadeira ref, sem a mão de ninguém
const visaoEspectador=(ref,nome)=>visao(ref,{nome});
function visao(pi,esp){
  const n=S.players.length,v={},g=i=>esp?giraEsp(pi,i):giraPara(pi,i);
  for(const k of ['gen','tok','dir','pending','pendingType','phase','comboValue','seqDir','skip','extra','busy','color','side','weather','peace',
    'curse','death','traffic','simon','passes','added','removed','ruleOrder','timeWin','vezes','auto','spectate'])v[k]=copia(S[k]);
  v.turn=g(S.turn);v.boom=g(S.boom);
  v.drawnId=!esp&&S.turn===pi?S.drawnId:null;
  v.turbo=false;
  v.discard=copia(S.discard);v.ann=copia(S.ann);
  // monte: só a quantidade; com a Revelação, a carta do topo é de todos
  v.deck=S.deck.map(()=>({oculta:true}));if(R.revelation&&S.deck.length)v.deck[v.deck.length-1]=copia(S.deck[S.deck.length-1]);
  v.chal=S.chal?{by:g(S.chal.by),amt:S.chal.amt,col:S.chal.col}:null;
  v.players=esp?[fantasma(esp.nome)]:[];
  for(let k=0;k<n;k++){const i=(k+pi)%n,dono=!esp&&i===pi;v.players.push(jogadorVisto(S.players[i],dono,!dono&&handHidden(i)))}
  v.other=S.other?ladoVisto(pi,S.other,S.other.R,esp):null;
  return {S:v,R:copia(R),TOUR:copia(TOUR)};
}
// evento girado para quem vê (as cadeiras dentro dele)
// esp: para um espectador, com pi a cadeira de referência dele (giraEsp)
function eventoPara(pi,ev,esp){
  const e=copia(ev),g=i=>esp?giraEsp(pi,i):giraPara(pi,i);
  for(const k of ['p','de','para','onde','pi','a','exceto'])if(typeof e[k]==='number')e[k]=g(e[k]);
  // balão escolhendo um jogador: as opções também são cadeiras
  if(e.t==='pensa'&&e.tipo==='player'&&Array.isArray(e.lista))e.lista=e.lista.map(g);
  if(Array.isArray(e.vencedores))e.vencedores=e.vencedores.map(g);
  // Dança das Cadeiras: pi já é a cadeira nova de quem vê; o mapa (antes -> agora) vai do giro de antes para o de agora
  if(e.t==='cadeirasTrocadas'){
    const n=ev.mapa.length,antes=ev.mapa.indexOf(pi);
    if(!esp)e.mapa=ev.mapa.map((x,k)=>giraPara(pi,ev.mapa[(k+antes)%n]));
    // o espectador: a cadeira 0 (ele) fica; as outras vão do giro pela referência de antes para o de agora
    else{e.mapa=Array(n+1).fill(0);for(let i=0;i<n;i++)e.mapa[giraPara(antes,i)+1]=giraPara(pi,ev.mapa[i])+1}
  }
  return e;
}
