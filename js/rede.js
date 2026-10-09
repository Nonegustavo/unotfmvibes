/* unotfm: jogar com outras pessoas. O anfitrião roda a mesa e joga numa cadeira; cada convidado tem uma ligação com ele
   e só tem a tela. Toda mensagem vira texto (JSON).
   - Anfitrião → convidado: cada evento da mesa (girado para o convidado ficar na cadeira 0) com a visão dele da partida
     (visao), e os pedidos de escolha (CONTROLES.rede).
   - Convidado → anfitrião: as ações (acao → agir) e as respostas dos pedidos. O anfitrião confere tudo.
   Ligações:
   - de mentira, entre abas do mesmo navegador (BroadcastChannel), com cada mensagem atrasada de 100 a 300 ms, como numa
     partida online: ?rede=anfitriao (com ?convidados=N, padrão 1) e ?rede=convidado;
   - WebRTC pela rede local (js/lan.js), com o convite e a resposta trocados em QR codes: redeConvidar, redeResposta e
     redeEntrar (nos testes, ?rede=lan-anfitriao e ?rede=lan-convidado).
   Sem ?rede, nada daqui roda. */
const REDE_MODO=new URLSearchParams(location.search).get('rede');
const VERSAO_REDE='rede-1'; // os aparelhos comparam ao entrar: com versões diferentes, aparece "atualize o jogo"
const REDE={papel:null,ultimoSinal:0,ligacoes:[],anfitriao:null,pendente:null,seq:0,pedidos:{},convidados:1,canal:null,eu:null,
  sala:false,aoMudar:null,aoSala:null, // com a sala (js/sala.js), o anfitrião começa a partida; sem ela (testes), começa sozinho
  conectado:false,enviadas:0,recebidas:0,ultimas:[]}; // contadores: para os testes
// faixa no topo com o estado da rede: só nas abas de teste (?rede=…); na sala, as telas dela mostram o estado
function redeAviso(txt){
  if(!REDE_MODO)return;
  let el=document.getElementById('redeAviso');
  if(!el){el=document.createElement('div');el.id='redeAviso';
    Object.assign(el.style,{position:'fixed',left:'50%',top:'calc(env(safe-area-inset-top,0px) + 0.25rem)',transform:'translateX(-50%)',zIndex:40,
      background:'var(--panel)',border:'2px solid var(--accent)',borderRadius:'0.75rem',padding:'0.125rem 0.625rem',fontSize:'.72rem',fontWeight:'600',pointerEvents:'none'});
    document.body.appendChild(el)}
  el.textContent=txt;
}

/* ---------- ligações ---------- */
// de mentira: todos na mesma BroadcastChannel, cada mensagem com de e para; atraso de 100 a 300 ms numa fila por ligação
// (uma fila só por ligação: com um timer por mensagem, duas marcadas para quase o mesmo instante podiam chegar trocadas)
function ligacaoMentira(outro){
  const l={tipo:'mentira',id:outro,aberta:true,fila:[],ultimo:0,aoReceber:null};
  const entrega=()=>{
    while(l.fila.length&&l.fila[0].em<=realNow())REDE.canal.postMessage(l.fila.shift().txt);
    if(l.fila.length)nativeTimeout(entrega,Math.max(0,l.fila[0].em-realNow()));
  };
  l.enviar=m=>{
    l.enviouEm=realNow();if(m.t!=='oi')REDE.enviadas++;const txt=JSON.stringify({de:REDE.eu,para:outro,m});
    const em=Math.max(l.ultimo,realNow()+100+Math.random()*200);l.ultimo=em;
    l.fila.push({em,txt});if(l.fila.length===1)nativeTimeout(entrega,em-realNow());
  };
  return l;
}
function abreCanalMentira(eu){
  REDE.eu=eu;REDE.canal=new BroadcastChannel('unotfm-rede');
  REDE.canal.onmessage=e=>{
    const env=JSON.parse(e.data);if(env.para!==REDE.eu)return;
    let l=REDE.ligacoes.find(x=>x.id===env.de)||(REDE.anfitriao&&REDE.anfitriao.id===env.de?REDE.anfitriao:null);
    if(!l&&REDE.papel==='anfitriao'){l=ligacaoMentira(env.de);redeNovaLigacao(l)}
    if(l&&l.aoReceber)l.aoReceber(env.m);
  };
}
// WebRTC: canal de dados confiável e em ordem
function ligacaoWebRTC(pc,dc){
  const l={tipo:'webrtc',id:'w'+(++REDE.seq),pc,dc,aberta:false,aoReceber:null,aoAbrir:null,aoFechar:null};
  dc.onopen=()=>{l.aberta=true;if(l.aoAbrir)l.aoAbrir()};
  dc.onclose=()=>{l.aberta=false;if(l.aoFechar)l.aoFechar()};
  dc.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch(x){return}if(l.aoReceber)l.aoReceber(m)};
  l.enviar=m=>{if(dc.readyState==='open'){l.enviouEm=realNow();if(m.t!=='oi')REDE.enviadas++;try{dc.send(JSON.stringify(m))}catch(x){}}};
  return l;
}

/* ---------- anfitrião: roda a mesa ---------- */
const ligDaCadeira=pi=>REDE.ligacoes.find(l=>l.cadeira===pi);
// a pessoa de outro aparelho responde aos pedidos de lá: a janela abre lá, e a resposta volta para cá (respondePedido)
CONTROLES.rede={
  jogada(){},
  pedido(pi,ped){
    const g=S.gen;
    const envia=()=>{
      if(g!==S.gen||S.phase==='over')return;
      const l=ligDaCadeira(pi),t=ped.tela||{},id=++REDE.seq;
      const opcoes=ped.tipo==='cor'||ped.tipo==='memoria'?null:t.opcoes();
      if(ped.tipo==='regra'&&!opcoes.length){ped.responde(null);return}
      REDE.pedidos[id]={pi,ped,opcoes};
      if(l)l.enviar({t:'pedido',id,tipo:ped.tipo,carta:copia(ped.carta),titulo:t.titulo,sub:t.sub,mix:!!ped.mix,
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
// resposta de um pedido: só vale de quem está na cadeira e se for uma das opções oferecidas (senão, a primeira)
function respondePedido(l,m){
  const pd=REDE.pedidos[m.id];if(!pd||!S||pd.pi!==l.cadeira)return;delete REDE.pedidos[m.id];
  const {pi,ped,opcoes}=pd;
  if(ped.encerrado)return; // o computador já respondeu (o tempo acabou)
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
// tempo para jogar (ms): jogada, cor e alvo, carta, e o que precisa de leitura (Memória, Carta da Regra, Mix)
const TEMPOS_REDE={normal:{jogada:20000,cor:15000,alvo:15000,carta:15000,regra:30000,memoria:30000,mix:30000},
  longo:{jogada:40000,cor:30000,alvo:30000,carta:30000,regra:60000,memoria:60000,mix:60000},livre:null,
  rapido:{jogada:2500,cor:2000,alvo:2000,carta:2000,regra:2500,memoria:2500,mix:3000}}; // rapido: só nos testes
/* Sinal: cada lado manda um "oi" a cada 2 s. Sem nada do convidado por 8 s (tela bloqueada, Wi-Fi caiu), o computador
   joga por ele até o sinal voltar; se a ligação fechar, ele volta lendo um convite novo e recupera a cadeira (o aparelho
   tem um número próprio, OPCOES.meuId) */
function redeSinal(){
  const agora=realNow();
  if(REDE.papel==='anfitriao'){
    for(const l of REDE.ligacoes){
      if(l.aberta&&agora-(l.enviouEm||0)>=2000)l.enviar({t:'oi'});
      if(l.cadeira==null||!S||S.phase==='over'||!S.players[l.cadeira])continue;
      const mudo=!l.aberta||agora-(l.visto||agora)>8000;
      if(mudo&&!l.caiu){l.caiu=true;caiu(l.cadeira);if(REDE.aoMudar)REDE.aoMudar()}
      else if(!mudo&&l.caiu){l.caiu=false;voltou(l.cadeira);if(REDE.aoMudar)REDE.aoMudar()}
    }
  }else if(REDE.anfitriao){
    const l=REDE.anfitriao;
    if(l.aberta&&agora-(l.enviouEm||0)>=2000)l.enviar({t:'oi'});
    redeSemSinal(REDE.conectado&&(!l.aberta||agora-REDE.ultimoSinal>8000));
  }
  nativeTimeout(redeSinal,1000);
}
function redeSemSinal(sem){
  let el=document.getElementById('semSinal');
  if(!el){el=document.createElement('div');el.id='semSinal';el.className='sem-sinal';el.hidden=true;document.body.appendChild(el)}
  el.textContent=REDE.anfitriao&&!REDE.anfitriao.aberta?'📵 A conexão com o anfitrião caiu. Para voltar, saia e entre com um convite novo.':'📵 Sem sinal do anfitrião…';
  el.hidden=!sem;
}
// cor de uma pessoa de outro aparelho: a mesma na sala e na mesa
const corDaPessoa=i=>AVCOL[(i*4+1)%AVCOL.length];
// cadeiras das pessoas de fora: espalhadas entre os adversários (com 4 cadeiras e 1 convidado, ele fica na da frente)
function cadeirasConvidados(n,k){const out=[];for(let j=1;j<=k;j++)out.push(Math.min(n-1,Math.max(1,Math.round(j*n/(k+1)))));return [...new Set(out)]}
// mapa: quem senta em cada cadeira (null = adversário do computador; a 0 é sempre do anfitrião). Sem mapa (testes), os
// convidados sentam espalhados entre os adversários
function redeComeca(mapa){
  const ls=REDE.ligacoes.filter(l=>l.aberta&&l.nome);
  R=rulesForMode(); // o torneio continua de uma rodada para a outra (newGame recomeça quando ele acaba ou o modo muda)
  if(!mapa){R.bots=Math.max(R.bots,ls.length);const n=R.bots+1,cads=cadeirasConvidados(n,ls.length);mapa=Array(n).fill(null);ls.forEach((l,k)=>mapa[cads[k]]=l)}
  R.bots=mapa.length-1;
  OPCOES.tempos=TEMPOS_REDE[REDE.sala?CFG.tempoRede:(new URLSearchParams(location.search).get('tempo')||'livre')]||null;
  REDE.ligacoes.forEach(l=>l.cadeira=l.lugar=null);
  OPCOES.controles=mapa.map((l,i)=>i===0?'tela':l?'rede':'bot');
  OPCOES.nomes=mapa.map((l,i)=>i===0?(OPCOES.meuNome||'Anfitrião'):l?l.nome:null);
  OPCOES.cores=mapa.map((l,i)=>l?corDaPessoa(i):null);
  // lugar: a cadeira da pessoa no começo de cada partida (a Dança das Cadeiras muda a cadeira só durante a partida)
  mapa.forEach((l,i)=>{if(l)l.cadeira=l.lugar=i});
  $('endOv').classList.remove('show');$('settingsOv').classList.remove('show');
  newGame();
}
function redeNovaLigacao(l){
  REDE.ligacoes.push(l);
  l.aoReceber=m=>{l.visto=realNow();if(m.t!=='oi')redeDoConvidado(l,m)};
}
function redeDoConvidado(l,m){
  if(m.t==='ola'){
    if(m.versao!==VERSAO_REDE){l.enviar({t:'versao',versao:VERSAO_REDE});return}
    // o mesmo aparelho voltando (convite novo depois de a ligação cair): fica com a cadeira e o nome de antes
    const velha=m.id&&REDE.ligacoes.find(x=>x!==l&&x.meuId===m.id&&x.cadeira!=null);
    if(velha&&!l.nome){
      l.meuId=m.id;l.nome=velha.nome;l.cadeira=velha.cadeira;l.lugar=velha.lugar;l.pronto=velha.pronto;REDE.ligacoes=REDE.ligacoes.filter(x=>x!==velha);
      if(typeof SALA!=='undefined')SALA.lugares=SALA.lugares.map(x=>x===velha?l:x);
      l.caiu=false;if(S&&S.phase!=='over'&&S.players[l.cadeira]){voltou(l.cadeira);l.enviar({t:'evento',ev:{t:'atualiza'},visao:visao(l.cadeira)})}
      if(REDE.aoMudar)REDE.aoMudar();return;
    }
    l.meuId=m.id;
    const novo=!l.nome;l.nome=String(m.nome||'').slice(0,16)||`Convidado ${REDE.ligacoes.indexOf(l)+1}`;
    // nomes repetidos ganham um número (os textos do jogo usam o nome para saber quem é "Você")
    const usados=[OPCOES.meuNome||'Anfitrião',...REDE.ligacoes.filter(x=>x!==l&&x.nome).map(x=>x.nome)];
    if(novo&&usados.includes(l.nome)){let k=2;while(usados.includes(l.nome+' '+k))k++;l.nome=l.nome+' '+k}
    if(REDE.sala){if(REDE.aoMudar)REDE.aoMudar();if(S&&S.phase!=='over'&&l.cadeira!=null)l.enviar({t:'evento',ev:{t:'atualiza'},visao:visao(l.cadeira)});return}
    if(novo)redeAviso(`Anfitrião: ${REDE.ligacoes.filter(x=>x.nome).length} convidado(s) na sala`);
    if((!S||S.phase==='over')&&REDE.ligacoes.filter(x=>x.nome).length>=REDE.convidados)redeComeca();
    else if(S&&l.cadeira!=null)l.enviar({t:'evento',ev:{t:'atualiza'},visao:visao(l.cadeira)});
    return;
  }
  if(m.t==='pronto'){l.pronto=!!m.pronto;if(REDE.aoMudar)REDE.aoMudar();return}
  if(l.cadeira==null||!S)return;
  // ação do convidado: a mesa confere; se recusar, ele fica sabendo na hora (e a prévia dele sai)
  if(m.t==='acao'&&m.acao){const a={...m.acao};if(typeof a.alvo==='number')a.alvo=giraDe(l.cadeira,a.alvo);if(!agir(l.cadeira,a))l.enviar({t:'recusada',n:m.n});return}
  if(m.t==='escolher')respondePedido(l,m);
}
function redeAnfitriao(){
  REDE.papel='anfitriao';semTurbo=true;nativeTimeout(redeSinal,1000);
  $('home').hidden=true;
  $('openSettings').hidden=true; // partida nova é pela sala ou pelo fim da partida
  // cada evento da mesa vai para cada convidado (os que são só de outro jogador, não), girado e com a visão dele
  OUVINTES.push(ev=>{
    if(!S||!S.players)return;
    // partida nova: cada pessoa volta ao lugar dela; na Dança das Cadeiras, vai para a cadeira nova (e os pedidos abertos dela também)
    if(ev.t==='novaPartida')for(const l of REDE.ligacoes)if(l.lugar!=null)l.cadeira=l.lugar;
    if(ev.t==='cadeirasTrocadas'){
      for(const l of REDE.ligacoes)if(l.cadeira!=null)l.cadeira=ev.mapa[l.cadeira];
      for(const pd of Object.values(REDE.pedidos))pd.pi=ev.mapa[pd.pi];
    }
    for(const l of REDE.ligacoes){
      const pi=l.cadeira;if(pi==null||!l.aberta||!S.players[pi])continue;
      if(ev.a!=null&&ev.a!=='todos'&&ev.a!==pi)continue;
      if(ev.exceto===pi)continue;
      l.enviar({t:'evento',ev:eventoPara(pi,ev),visao:visao(pi)});
    }
  });
}
// convite por WebRTC: devolve o texto do QR code; a resposta do convidado entra por redeResposta
async function redeConvidar(){
  if(REDE.pendente){try{REDE.pendente.l.pc.close()}catch(e){}REDE.pendente=null}
  const pc=lanPc(false),l=ligacaoWebRTC(pc,pc.createDataChannel('jogo',{ordered:true})),sess=Math.floor(Math.random()*65536);
  await pc.setLocalDescription(await pc.createOffer());
  await esperarEnderecos(pc);
  const z=compactar(pc.localDescription.sdp,0,sess);
  if(!z.cands.length)throw new Error('nenhum endereço de rede encontrado. O aparelho está conectado à Wi-Fi?');
  REDE.pendente={l,sess};
  l.aoAbrir=()=>{};l.aoFechar=()=>{if(REDE.aoMudar)REDE.aoMudar()};redeNovaLigacao(l);
  return z.texto;
}
async function redeResposta(texto){
  const d=descompactar(texto);
  if(d.papel!==1)throw new Error('esse é um código de convite, não de resposta');
  if(!REDE.pendente||d.sess!==REDE.pendente.sess)throw new Error('essa resposta é de outro convite');
  const {l}=REDE.pendente;REDE.pendente=null;
  await l.pc.setRemoteDescription({type:'answer',sdp:montarSdp(d)});
}

/* ---------- convidado: só a tela ---------- */
function redeConvidado(){
  REDE.papel='convidado';semTurbo=true;nativeTimeout(redeSinal,1000);
  $('home').hidden=true;
  $('openSettings').hidden=true; // quem começa as partidas é o anfitrião
  acaoRemota=a=>{const n=++REDE.seq;if(VIS.previa)VIS.previa.n=n;if(REDE.anfitriao)REDE.anfitriao.enviar({t:'acao',acao:a,n});return true};
  // o convidado não tem mesa: se a tela chamar uma regra direto (em vez de acao), é erro, e os testes pegam pelo console
  for(const k of ['agir','jogar','termina','playCard','takeDraw','endTurn','startTurn','doJumpIn','penalize','doChallenge','newGame','dealAndStart','comecaMix','drawOne','markOut'])
    globalThis[k]=()=>console.error('O convidado chamou uma regra direto: '+k);
  // começar e recomeçar a partida é com o anfitrião
  $('startBtn').onclick=$('againBtn').onclick=()=>{$('endOv').classList.remove('show');$('settingsOv').classList.remove('show')};
}
function redeLigaAnfitriao(l){
  REDE.anfitriao=l;
  l.aoReceber=m=>{
    REDE.ultimoSinal=realNow();if(m.t==='oi')return;
    REDE.recebidas++;REDE.ultimas=[...REDE.ultimas.slice(-5),m.t+':'+(m.ev?m.ev.t:'')];
    if(!REDE.conectado){REDE.conectado=true;redeAviso('Convidado: conectado ao anfitrião')}
    if(m.t==='versao'){redeAviso('Atualize o jogo: o anfitrião está com outra versão');if(REDE.aoSala)REDE.aoSala({t:'versao'});return}
    if(m.t==='sala'){if(REDE.aoSala)REDE.aoSala(m);return}
    if(m.visao){
      // a visão substitui a partida inteira; o que a tela guardou nela (janela aberta) continua
      const auto=S&&S.autoResolve,pre=S&&S.preLanded;
      S=m.visao.S;R=m.visao.R;TOUR=m.visao.TOUR;
      if(auto)S.autoResolve=auto;if(pre)S.preLanded=pre;
    }
    // partida nova: a sala e o placar da anterior fecham
    if(m.t==='evento'&&m.ev.t==='novaPartida'){$('salaOv').classList.remove('show');$('endOv').classList.remove('show')}
    if(m.t==='evento')TELA(m.ev);
    else if(m.t==='pedido')redeAbrePedido(m);
    else if(m.t==='recusada'&&VIS.previa&&VIS.previa.n===m.n)desfazPrevia('recusada');
  };
}
// número deste aparelho: o anfitrião reconhece quem volta depois de cair
OPCOES.meuId=new URLSearchParams(location.search).get('id')||load('unotfm-id',null)||(()=>{const id=Math.random().toString(36).slice(2,12);save('unotfm-id',id);return id})();
const redeOla=()=>REDE.anfitriao&&REDE.anfitriao.enviar({t:'ola',nome:OPCOES.meuNome||'',versao:VERSAO_REDE,id:OPCOES.meuId});
// entrar pelo convite (WebRTC): devolve o texto do QR code de resposta, que o anfitrião lê
async function redeEntrar(texto){
  const d=descompactar(texto);
  if(d.papel!==0)throw new Error('esse é um código de resposta. Leia o QR code de convite do anfitrião');
  const pc=lanPc(false);
  pc.ondatachannel=e=>{const l=ligacaoWebRTC(pc,e.channel);redeLigaAnfitriao(l);l.aoFechar=()=>{if(REDE.aoSala)REDE.aoSala({t:'caiu'})};l.aoAbrir=redeOla;if(e.channel.readyState==='open'){l.aberta=true;redeOla()}};
  await pc.setRemoteDescription({type:'offer',sdp:montarSdp(d)});
  await pc.setLocalDescription(await pc.createAnswer());
  await esperarEnderecos(pc);
  return compactar(pc.localDescription.sdp,1,d.sess).texto;
}
// pedido do anfitrião: abre a mesma janela da tela e manda a escolha de volta
function redeAbrePedido(m){
  const resp=(valor,extra)=>REDE.anfitriao.enviar({t:'escolher',id:m.id,valor,...extra});
  if(m.tipo==='cor'){S.busy=true;openColors(col=>resp(col),m.carta);return}
  abrirPedido(0,{tipo:m.tipo,carta:m.carta,mix:m.mix,tela:{titulo:m.titulo,sub:m.sub,opcoes:()=>m.opcoes},
    responde:(v,col,taps)=>m.tipo==='carta'?resp(v&&v.id):m.tipo==='memoria'?resp(col,{toques:taps||[]}):resp(v)});
}

if(REDE_MODO){
  const q=new URLSearchParams(location.search);
  REDE.convidados=Math.max(1,Math.min(5,+q.get('convidados')||1));
  if(REDE_MODO==='anfitriao'){
    redeAnfitriao();abreCanalMentira('anfitriao');
    redeAviso(`Rede de mentira: anfitrião (esperando ${REDE.convidados} convidado(s) em outras abas, com ?rede=convidado)`);
  }else if(REDE_MODO==='convidado'){
    redeConvidado();abreCanalMentira('c'+Math.floor(Math.random()*1e9));
    OPCOES.meuNome=q.get('nome')||'';
    redeLigaAnfitriao(ligacaoMentira('anfitriao'));
    redeAviso('Rede de mentira: convidado (procurando o anfitrião)');
    const ola=()=>{if(!REDE.conectado){redeOla();setTimeout(ola,1500)}};ola();
  }else if(REDE_MODO==='lan-anfitriao'){redeAnfitriao();redeAviso('Rede local: anfitrião')}
  else if(REDE_MODO==='lan-convidado'){redeConvidado();redeAviso('Rede local: convidado')}
}
