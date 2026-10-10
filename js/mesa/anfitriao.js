/* unotfm, mesa: o anfitrião de uma sala com pessoas de outros aparelhos. Não usa nada da página: roda no navegador de
   quem cria a sala na rede local e, nas salas online, no servidor.
   - Sala: as pessoas ligadas (ANF.ligacoes), os lugares da mesa (ANF.lugares, um por cadeira: 'eu' é a pessoa do
     aparelho que roda a mesa, quando há uma; uma ligação é uma pessoa de outro aparelho; null é um bot), sortear os
     lugares a cada partida, tempo para jogar e regras (ANF.cfg, as Configurações de quem criou a sala).
   - Partida: cada evento da mesa vai para cada pessoa girado para ela (eventoPara) e com a visão dela (visao); os
     pedidos de escolha vão até ela (CONTROLES.rede) e as ações e respostas que ela manda são conferidas aqui.
   - Sinal: cada lado manda um "oi" a cada 2 s; sem nada de uma pessoa por 8 s, um bot joga por ela até o sinal voltar.
   Uma ligação é {enviar(m), aberta, aoReceber, aoFechar, enviouEm (hora do último envio)}: de mentira (abas do mesmo
   navegador), WebRTC (rede local) ou WebSocket (servidor). As mensagens são objetos que viram texto (JSON).
   Quem roda o anfitrião chama anfInicia() uma vez e anfSinal() a cada segundo, e liga ANF.aoMudar (a sala mudou),
   ANF.aoEntrar (uma pessoa sentou), ANF.aoComecar (uma partida vai começar) e ANF.aviso (textos de teste) se quiser
   saber das mudanças */
const VERSAO_REDE='rede-2'; // os aparelhos comparam ao entrar: com versões diferentes, aparece "atualize o jogo"
const ANF={ligacoes:[],lugares:['eu',null,null,null],n:4,sortear:false,tempo:'livre',cfg:null,pedidos:{},seq:0,lugarConvite:null,
  sala:false,     // com a sala, quem criou começa a partida; sem ela (testes), começa sozinha quando chegam ANF.automatico pessoas
  automatico:1,
  dono:null,      // nas salas online, a ligação de quem manda na sala (comandos); na rede local, é quem roda a mesa ('eu')
  manterCaidos:false, // online: quem desligou continua com o lugar na sala até voltar (ou o servidor tirar)
  agora:()=>Date.now(),aoMudar:null,aoEntrar:null,aoComecar:null,aviso:null};
// tempo para jogar (ms): jogada, cor e alvo, carta, e o que precisa de leitura (Memória, Carta da Regra, Mix)
const TEMPOS_REDE={normal:{jogada:20000,cor:15000,alvo:15000,carta:15000,regra:30000,memoria:30000,mix:30000},
  longo:{jogada:40000,cor:30000,alvo:30000,carta:30000,regra:60000,memoria:60000,mix:60000},livre:null,
  rapido:{jogada:2500,cor:2000,alvo:2000,carta:2000,regra:2500,memoria:2500,mix:3000}}; // rapido: só nos testes
// cor de uma pessoa de outro aparelho: a mesma na sala e na mesa
const corDaPessoa=i=>AVCOL[(i*4+1)%AVCOL.length];
// cadeiras das pessoas de fora: espalhadas entre os adversários (com 4 cadeiras e 1 convidado, ele fica na da frente)
function cadeirasConvidados(n,k){const out=[];for(let j=1;j<=k;j++)out.push(Math.min(n-1,Math.max(1,Math.round(j*n/(k+1)))));return [...new Set(out)]}
// resumo das regras para a lista da sala (a tela de cada um escreve o texto)
// (as chaves das regras ligadas, no Personalizado, e a defesa contra compras, que vale em todos os modos)
const resumoRegras=cfg=>{const lista=cfg.mode==='custom'?RULES.filter(x=>cfg[x.k]===true&&x.k!=='poker').map(x=>x.k):[];
  return {mode:cfg.mode,diff:cfg.diff,n:lista.length,lista,combo:cfg.combo||'normal'}};
const anfPessoas=()=>ANF.ligacoes.filter(l=>l.aberta&&l.nome);
const ligDaCadeira=pi=>ANF.ligacoes.find(l=>l.cadeira===pi);
// a primeira cadeira que se pode mexer: a 0 é de quem roda a mesa, quando há um ('eu'); online, todas
const anfMin=()=>ANF.lugares[0]==='eu'?1:0;

/* ---------- partida ---------- */
// a pessoa de outro aparelho responde aos pedidos de lá: a janela abre lá, e a resposta volta para cá (respondePedido)
CONTROLES.rede={
  jogada(){},
  pedido(pi,ped){
    const g=S.gen;
    const envia=()=>{
      if(g!==S.gen||S.phase==='over')return;
      const l=ligDaCadeira(pi),t=ped.tela||{},id=++ANF.seq;
      const opcoes=ped.tipo==='cor'||ped.tipo==='memoria'?null:t.opcoes();
      if(ped.tipo==='regra'&&!opcoes.length){ped.responde(null);return}
      const msg={t:'pedido',id,tipo:ped.tipo,carta:copia(ped.carta),titulo:t.titulo,sub:t.sub,mix:!!ped.mix,
        opcoes:opcoes&&(ped.tipo==='alvo'?opcoes.map(i=>giraPara(pi,i)):copia(opcoes))};
      ANF.pedidos[id]={pi,ped,opcoes,msg};
      if(l)l.enviar(msg);
    };
    // os mesmos tempos da tela de quem roda a mesa: cor e Mix na hora; carta especial depois do anúncio
    if(ped.tipo==='cor'){S.busy=true;atualiza();envia();return}
    if(ped.mix){envia();return}
    S.busy=true;atualiza();
    if(ped.ja){envia();return}
    if(S.preLanded===ped.carta){S.preLanded=null;envia();return}
    agendar(envia,480);
  },
};
// resposta de um pedido: só vale de quem está na cadeira e se for uma das opções oferecidas (senão, a primeira)
function respondePedido(l,m){
  const pd=ANF.pedidos[m.id];if(!pd||!S||pd.pi!==l.cadeira)return;delete ANF.pedidos[m.id];
  const {pi,ped,opcoes}=pd;
  if(ped.encerrado)return; // o computador já respondeu (o tempo acabou)
  S.busy=false; // como a janela fechando na tela de quem roda a mesa
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
// cada evento da mesa vai para cada pessoa (os que são só de outro jogador, não), girado e com a visão dela
function anfOuvinte(ev){
  if(!S||!S.players)return;
  // partida nova (a partir do primeiro evento dela): cada pessoa vai para o lugar dela nesta partida. Antes disso, os
  // eventos ainda são da partida anterior e vão para a cadeira de lá
  if(S.gen!==ANF.gen){ANF.gen=S.gen;for(const l of ANF.ligacoes)l.cadeira=l.lugar}
  // na Dança das Cadeiras, cada pessoa vai para a cadeira nova (e os pedidos abertos dela também)
  if(ev.t==='cadeirasTrocadas'){
    for(const l of ANF.ligacoes)if(l.cadeira!=null)l.cadeira=ev.mapa[l.cadeira];
    for(const pd of Object.values(ANF.pedidos))pd.pi=ev.mapa[pd.pi];
  }
  for(const l of ANF.ligacoes){
    const pi=l.cadeira;if(pi==null||!l.aberta||!S.players[pi])continue;
    if(ev.a!=null&&ev.a!=='todos'&&ev.a!==pi)continue;
    if(ev.exceto===pi)continue;
    l.enviar({t:'evento',ev:eventoPara(pi,ev),visao:visao(pi)});
  }
}
function anfInicia(){if(!OUVINTES.includes(anfOuvinte))OUVINTES.push(anfOuvinte)}
/* Começa uma partida. mapa: quem senta em cada cadeira ('eu', uma ligação ou null para um bot). Sem mapa (testes), a
   pessoa deste aparelho fica na 0 e as outras sentam espalhadas entre os bots */
function anfComeca(mapa){
  const ls=anfPessoas();
  R=regrasDe(ANF.cfg); // o torneio continua de uma rodada para a outra (newGame recomeça quando ele acaba ou o modo muda)
  if(!mapa){R.bots=Math.max(R.bots,ls.length);const n=R.bots+1,cads=cadeirasConvidados(n,ls.length);mapa=Array(n).fill(null);mapa[0]='eu';ls.forEach((l,k)=>mapa[cads[k]]=l)}
  R.bots=mapa.length-1;
  OPCOES.tempos=TEMPOS_REDE[ANF.tempo]||null;
  ANF.ligacoes.forEach(l=>l.lugar=null);
  OPCOES.controles=mapa.map(x=>x==='eu'?'tela':x?'rede':'bot');
  OPCOES.nomes=mapa.map(x=>x==='eu'?(OPCOES.meuNome||'Anfitrião'):x?x.nome:null);
  OPCOES.cores=mapa.map((x,i)=>x&&x!=='eu'?corDaPessoa(i):null);
  // lugar: a cadeira da pessoa no começo de cada partida (a Dança das Cadeiras muda a cadeira só durante a partida);
  // a cadeira passa a ser essa no primeiro evento da partida nova (anfOuvinte)
  mapa.forEach((x,i)=>{if(x&&x!=='eu')x.lugar=i});
  if(ANF.aoComecar)ANF.aoComecar();
  newGame();
}

/* ---------- pessoas ---------- */
function anfNovaLigacao(l){
  ANF.ligacoes.push(l);
  l.aoReceber=m=>{l.visto=ANF.agora();if(m&&m.t!=='oi')anfDoConvidado(l,m)};
}
function anfDoConvidado(l,m){
  if(m.t==='ola'){
    if(m.versao!==VERSAO_REDE){l.enviar({t:'versao',versao:VERSAO_REDE});return}
    // o mesmo aparelho voltando (ligação nova depois de a anterior cair): fica com a cadeira e o nome de antes
    const velha=m.id&&ANF.ligacoes.find(x=>x!==l&&x.meuId===m.id&&x.cadeira!=null);
    if(velha&&!l.nome){
      l.meuId=m.id;l.nome=velha.nome;l.cadeira=velha.cadeira;l.lugar=velha.lugar;l.pronto=velha.pronto;ANF.ligacoes=ANF.ligacoes.filter(x=>x!==velha);
      ANF.lugares=ANF.lugares.map(x=>x===velha?l:x);
      l.caiu=false;if(S&&S.phase!=='over'&&S.players[l.cadeira]){voltou(l.cadeira);l.enviar({t:'evento',ev:{t:'atualiza'},visao:visao(l.cadeira)})}
      anfMudou();return;
    }
    l.meuId=m.id;
    const novo=!l.nome;l.nome=String(m.nome||'').replace(/[<>&"'`]/g,'').trim().slice(0,16)||`Convidado ${ANF.ligacoes.indexOf(l)+1}`;
    // nomes repetidos ganham um número (os textos do jogo usam o nome para saber quem é "Você")
    const usados=[OPCOES.meuNome||'Anfitrião',...ANF.ligacoes.filter(x=>x!==l&&x.nome).map(x=>x.nome)];
    if(novo&&usados.includes(l.nome)){let k=2;while(usados.includes(l.nome+' '+k))k++;l.nome=l.nome+' '+k}
    if(ANF.sala){anfMudou();if(S&&S.phase!=='over'&&l.cadeira!=null)l.enviar({t:'evento',ev:{t:'atualiza'},visao:visao(l.cadeira)});return}
    if(novo&&ANF.aviso)ANF.aviso(`Anfitrião: ${ANF.ligacoes.filter(x=>x.nome).length} convidado(s) na sala`);
    if((!S||S.phase==='over')&&ANF.ligacoes.filter(x=>x.nome).length>=ANF.automatico)anfComeca();
    else if(S&&l.cadeira!=null)l.enviar({t:'evento',ev:{t:'atualiza'},visao:visao(l.cadeira)});
    return;
  }
  if(m.t==='pronto'){l.pronto=!!m.pronto;anfMudou();return}
  if(m.t==='comando'){if(l===ANF.dono)anfComando(m);return}
  if(l.cadeira==null||!S)return;
  // ação de uma pessoa: a mesa confere; se recusar, ela fica sabendo na hora (e a prévia dela sai)
  if(m.t==='acao'&&m.acao){const a={...m.acao};if(typeof a.alvo==='number')a.alvo=giraDe(l.cadeira,a.alvo);if(!agir(l.cadeira,a))l.enviar({t:'recusada',n:m.n});return}
  if(m.t==='escolher')respondePedido(l,m);
}
// Sinal (a cada segundo): manda o "oi" e confere quem está mudo há mais de 8 s (tela bloqueada, Wi-Fi caiu): um bot joga
// por ele até o sinal voltar. Se a ligação fechar, a pessoa volta com uma ligação nova e recupera a cadeira pelo número
// do aparelho (OPCOES.meuId de lá)
function anfSinal(){
  const agora=ANF.agora();
  for(const l of ANF.ligacoes){
    if(l.aberta&&agora-(l.enviouEm||0)>=2000)l.enviar({t:'oi'});
    if(l.cadeira==null||!S||S.phase==='over'||!S.players[l.cadeira])continue;
    const mudo=!l.aberta||agora-(l.visto||agora)>8000;
    if(mudo&&!l.caiu){l.caiu=true;caiu(l.cadeira);anfMudou()}
    else if(!mudo&&l.caiu){l.caiu=false;voltou(l.cadeira);anfMudou()}
  }
}

/* ---------- sala ---------- */
// alguém entrou, saiu, caiu ou ficou pronto, ou quem criou mudou alguma coisa: arruma os lugares e avisa todos
function anfMudou(){
  if(!ANF.sala)return;
  anfSentaNovos();anfEnviaSala();
  if(ANF.aoMudar)ANF.aoMudar();
}
// quem entra senta no lugar vazio mais espalhado (ou no do bot pelo qual foi convidado); quem sai vira bot. Online,
// quem desligou continua no lugar dele (ANF.manterCaidos) até voltar ou sair da sala
function anfSentaNovos(){
  const ls=anfPessoas(),ficam=ANF.manterCaidos?ANF.ligacoes.filter(l=>l.nome):ls;
  const jogando=S&&S.phase!=='over';
  ANF.lugares=ANF.lugares.map(x=>x==='eu'||!x||ficam.includes(x)||(jogando&&x.cadeira!=null)?x:null);
  for(const l of ls)if(!ANF.lugares.includes(l)){
    const vazios=ANF.lugares.map((x,i)=>x?-1:i).filter(i=>i>=anfMin());
    if(!vazios.length){if(ANF.n<6){ANF.n++;ANF.lugares.push(null);vazios.push(ANF.n-1)}else continue}
    const k=ANF.lugares.filter(x=>x&&x!=='eu').length+1,ideal=cadeirasConvidados(ANF.n,k)[k-1]||vazios[0];
    const melhor=vazios.includes(ANF.lugarConvite)?ANF.lugarConvite:vazios.reduce((a,b)=>Math.abs(b-ideal)<Math.abs(a-ideal)?b:a);ANF.lugarConvite=null;
    ANF.lugares[melhor]=l;
    if(ANF.aoEntrar)ANF.aoEntrar(l);
  }
}
// cada pessoa recebe a lista da sala do jeito dela ("você" na linha dela)
function anfEnviaSala(){
  for(const l of anfPessoas())l.enviar({t:'sala',regras:resumoRegras(ANF.cfg),tempo:ANF.tempo,sortear:ANF.sortear,
    lugares:ANF.lugares.map((x,i)=>x==='eu'?{nome:OPCOES.meuNome||'Anfitrião',anfitriao:true,col:'var(--accent)'}:!x?{tipo:'bot'}:
      {nome:x.nome,pronto:!!x.pronto,voce:x===l,dono:x===ANF.dono,caiu:!x.aberta,col:corDaPessoa(i)})});
}
// quantos lugares (2 a 6): mantém a ordem das pessoas e completa com bots. Devolve se mudou
function anfLugares(n){
  const pessoas=ANF.lugares.filter(x=>x&&x!=='eu');
  if(n<2||n>6||n-1<pessoas.length)return false;
  let lug=ANF.lugares.slice(0,n);
  const fora=pessoas.filter(p=>!lug.includes(p));
  for(const p of fora){const i=lug.findIndex((x,k)=>k>=anfMin()&&!x);lug[i]=p}
  while(lug.length<n)lug.push(null);
  ANF.n=n;ANF.lugares=lug;anfMudou();return true;
}
function anfTroca(i,j){const min=anfMin();if(!(i>=min&&j>=min&&i<ANF.n&&j<ANF.n))return;[ANF.lugares[i],ANF.lugares[j]]=[ANF.lugares[j],ANF.lugares[i]];anfMudou()}
// a partida da sala: cada pessoa no lugar escolhido (ou sorteado entre os lugares das pessoas)
function anfComecaSala(){
  // quem já saiu da sala (o servidor tirou) senta como bot
  let mapa=ANF.lugares.map(x=>x==='eu'||!x||ANF.ligacoes.includes(x)?x:null);
  if(ANF.sortear){
    const min=anfMin(),ps=mapa.filter(x=>x&&x!=='eu'),idx=mapa.map((x,i)=>i).filter(i=>i>=min);
    for(let i=idx.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]]}
    mapa=Array(ANF.n).fill(null);if(min)mapa[0]=ANF.lugares[0];ps.forEach((p,k)=>mapa[idx[k]]=p);
  }
  anfComeca(mapa);
}

/* ---------- salas online (no servidor) ---------- */
// comandos do dono da sala; durante a partida, só os que não mexem nela
function anfComando(m){
  const jogando=S&&S.phase!=='over';
  switch(m.c){
    case 'lugares':if(!jogando)anfLugares(m.n);return;
    case 'troca':if(!jogando)anfTroca(m.i,m.j);return;
    case 'sortear':ANF.sortear=!!m.v;anfMudou();return;
    case 'tempo':if(TEMPOS_REDE.hasOwnProperty(m.v))ANF.tempo=m.v;anfMudou();return;
    case 'regras':ANF.cfg=limpaCfg(m.cfg);anfMudou();return;
    case 'comecar':if(!jogando)anfComecaSala();return;
    case 'remover':{const x=ANF.lugares[m.i];if(x&&x!=='eu'&&x!==ANF.dono)anfRemove(x,true);return}
  }
}
// regras mandadas por alguém de fora: só as chaves e os valores que existem, sem regras em conflito
function limpaCfg(c){
  c=c&&typeof c==='object'?c:{};
  const r=regrasBase(),um=(v,l,d)=>l.includes(v)?v:d;
  r.mode=um(c.mode,['classic','mix','custom'],'classic');
  r.diff=um(c.diff,Object.keys(DIFF),'normal');
  r.start=um(c.start,[3,4,5,6,7,8,9,10],7);
  r.combo=um(c.combo,['normal','rise','super','none'],'normal');
  for(const x of RULES)r[x.k]=c[x.k]===true&&!DEF_RULES[x.k];
  for(const [a,b] of CONFLICT_PAIRS)if(r[a]&&r[b])r[b]=false;
  if(r.nou&&r.combo==='none')r.nou=false;
  return r;
}
// uma pessoa sai da sala (pediu para sair, o dono tirou, ou ficou desligada demais). Na partida, um bot fica no lugar
function anfRemove(l,avisa){
  if(!ANF.ligacoes.includes(l))return;
  if(avisa){l.enviar({t:'removido'});if(l.fechar)l.fechar()}
  ANF.ligacoes=ANF.ligacoes.filter(x=>x!==l);
  const pi=l.cadeira,p=S&&S.phase!=='over'&&pi!=null?S.players[pi]:null;
  if(p&&!p.out){
    tiraRelogio(pi);p.ctrl='bot';delete p.ctrlReal;p.caiu=false;
    emit({t:'aviso',txt:`${J(pi)} saiu da sala: um bot joga no lugar`});log(`${J(pi)} saiu da sala.`);
    for(const [id,pd] of Object.entries(ANF.pedidos))if(pd.pi===pi)delete ANF.pedidos[id];
    if(S.mixFaltam&&S.mixFaltam.includes(pi))fechouMix(pi); // a lista do Mix não espera mais por ele
    if(ABERTOS[pi])decidePor(pi);else if(S.turn===pi&&!S.busy){S.tok++;pedirJogada(pi)}
    atualiza();
  }
  l.cadeira=l.lugar=null;
  if(ANF.dono===l)anfNovoDono();else anfMudou();
}
// o posto de dono passa para a próxima pessoa ligada, na ordem dos lugares
function anfNovoDono(){
  const antes=ANF.dono,ls=anfPessoas();
  ANF.dono=ANF.lugares.find(x=>x&&x!=='eu'&&x!==antes&&ls.includes(x))||ls.find(x=>x!==antes)||null;
  anfMudou();
}
// quem voltou (por uma ligação nova, com a chave dele): a sala, a partida e os pedidos que estavam abertos para ele
function anfVolta(l){
  anfMudou();
  if(S&&S.phase!=='over'&&l.cadeira!=null&&S.players[l.cadeira]){
    l.enviar({t:'evento',ev:{t:'atualiza'},visao:visao(l.cadeira)});
    for(const pd of Object.values(ANF.pedidos))if(pd.pi===l.cadeira&&!pd.ped.encerrado)l.enviar(pd.msg);
  }
}
