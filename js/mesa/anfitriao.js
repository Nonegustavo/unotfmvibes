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
const resumoRegras=cfg=>({mode:cfg.mode,diff:cfg.diff,n:cfg.mode==='custom'?RULES.filter(x=>cfg[x.k]&&x.k!=='poker').length:0});
const anfPessoas=()=>ANF.ligacoes.filter(l=>l.aberta&&l.nome);
const ligDaCadeira=pi=>ANF.ligacoes.find(l=>l.cadeira===pi);

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
      ANF.pedidos[id]={pi,ped,opcoes};
      if(l)l.enviar({t:'pedido',id,tipo:ped.tipo,carta:copia(ped.carta),titulo:t.titulo,sub:t.sub,mix:!!ped.mix,
        opcoes:opcoes&&(ped.tipo==='alvo'?opcoes.map(i=>giraPara(pi,i)):copia(opcoes))});
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
  // partida nova: cada pessoa volta ao lugar dela; na Dança das Cadeiras, vai para a cadeira nova (e os pedidos abertos dela também)
  if(ev.t==='novaPartida')for(const l of ANF.ligacoes)if(l.lugar!=null)l.cadeira=l.lugar;
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
  ANF.ligacoes.forEach(l=>l.cadeira=l.lugar=null);
  OPCOES.controles=mapa.map(x=>x==='eu'?'tela':x?'rede':'bot');
  OPCOES.nomes=mapa.map(x=>x==='eu'?(OPCOES.meuNome||'Anfitrião'):x?x.nome:null);
  OPCOES.cores=mapa.map((x,i)=>x&&x!=='eu'?corDaPessoa(i):null);
  // lugar: a cadeira da pessoa no começo de cada partida (a Dança das Cadeiras muda a cadeira só durante a partida)
  mapa.forEach((x,i)=>{if(x&&x!=='eu')x.cadeira=x.lugar=i});
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
    const novo=!l.nome;l.nome=String(m.nome||'').slice(0,16)||`Convidado ${ANF.ligacoes.indexOf(l)+1}`;
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
// quem entra senta no lugar vazio mais espalhado (ou no do bot pelo qual foi convidado); quem sai vira bot
function anfSentaNovos(){
  const ls=anfPessoas();
  const jogando=S&&S.phase!=='over';
  ANF.lugares=ANF.lugares.map(x=>x==='eu'||!x||ls.includes(x)||(jogando&&x.cadeira!=null)?x:null);
  for(const l of ls)if(!ANF.lugares.includes(l)){
    const vazios=ANF.lugares.map((x,i)=>x?-1:i).filter(i=>i>0);
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
    lugares:ANF.lugares.map((x,i)=>x==='eu'?{nome:OPCOES.meuNome||'Anfitrião',anfitriao:true,col:'var(--accent)'}:!x?{tipo:'bot'}:{nome:x.nome,pronto:!!x.pronto,voce:x===l,col:corDaPessoa(i)})});
}
// quantos lugares (2 a 6): mantém a ordem das pessoas e completa com bots. Devolve se mudou
function anfLugares(n){
  const pessoas=ANF.lugares.filter(x=>x&&x!=='eu');
  if(n<2||n>6||n-1<pessoas.length)return false;
  let lug=ANF.lugares.slice(0,n);
  const fora=pessoas.filter(p=>!lug.includes(p));
  for(const p of fora){const i=lug.findIndex((x,k)=>k>0&&!x);lug[i]=p}
  while(lug.length<n)lug.push(null);
  ANF.n=n;ANF.lugares=lug;anfMudou();return true;
}
function anfTroca(i,j){if(i<1||j<1||i>=ANF.n||j>=ANF.n)return;[ANF.lugares[i],ANF.lugares[j]]=[ANF.lugares[j],ANF.lugares[i]];anfMudou()}
// a partida da sala: cada pessoa no lugar escolhido (ou sorteado entre os lugares das pessoas)
function anfComecaSala(){
  let mapa=[...ANF.lugares];
  if(ANF.sortear){
    const ps=mapa.filter(x=>x&&x!=='eu'),idx=mapa.map((x,i)=>i).filter(i=>i>0);
    for(let i=idx.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]]}
    mapa=Array(ANF.n).fill(null);mapa[0]=ANF.lugares[0];ps.forEach((p,k)=>mapa[idx[k]]=p);
  }
  anfComeca(mapa);
}
