/* unotfm: jogar com outras pessoas, a parte da página. O anfitrião roda a mesa e joga numa cadeira; o que ele faz com
   as pessoas (sala, eventos, pedidos, ações, sinal) está em js/mesa/anfitriao.js, sem página. Cada convidado tem uma
   ligação com ele e só tem a tela. Toda mensagem vira texto (JSON).
   - Anfitrião → convidado: cada evento da mesa (girado para o convidado ficar na cadeira 0) com a visão dele da partida
     (visao), e os pedidos de escolha (CONTROLES.rede).
   - Convidado → anfitrião: as ações (acao → agir) e as respostas dos pedidos. O anfitrião confere tudo.
   Ligações:
   - de mentira, entre abas do mesmo navegador (BroadcastChannel), com cada mensagem atrasada de 100 a 300 ms, como numa
     partida online: ?rede=anfitriao (com ?convidados=N, padrão 1) e ?rede=convidado;
   - WebRTC pela rede local (js/lan.js), com o convite e a resposta trocados em QR codes: redeConvidar, redeResposta e
     redeEntrar (nos testes, ?rede=lan-anfitriao e ?rede=lan-convidado);
   - WebSocket com o servidor das salas online (servidor/servidor.mjs): a página é um convidado do servidor, que roda a
     mesa e o anfitrião (js/sala.js cuida de entrar, voltar e da sala).
   Sem ?rede, nada daqui roda. */
const REDE_MODO=new URLSearchParams(location.search).get('rede');
// no convidado: a ligação com o anfitrião (anfitriao) e a sala (aoSala); no anfitrião, as pessoas ficam em ANF.ligacoes
// servidor das salas online: no site publicado (https), o do Fly.io; aberto pelo computador ou pela rede local (http),
// o do próprio computador (npm run servidor). ?servidor= troca (nos testes)
const SERVIDOR=new URLSearchParams(location.search).get('servidor')||(location.protocol==='https:'?'wss://mesa-tfm.fly.dev':`ws://${location.hostname||'localhost'}:8787`);
const REDE={papel:null,ultimoSinal:0,anfitriao:null,pendente:null,seq:0,canal:null,eu:null,aoSala:null,aoVisao:null,online:false,
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
    let l=ANF.ligacoes.find(x=>x.id===env.de)||(REDE.anfitriao&&REDE.anfitriao.id===env.de?REDE.anfitriao:null);
    if(!l&&REDE.papel==='anfitriao'){l=ligacaoMentira(env.de);anfNovaLigacao(l)}
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
// WebSocket com o servidor das salas online
function ligacaoWS(url){
  const ws=new WebSocket(url),l={tipo:'ws',ws,aberta:false,aoReceber:null,aoAbrir:null,aoFechar:null};
  ws.onopen=()=>{l.aberta=true;if(l.aoAbrir)l.aoAbrir()};
  ws.onclose=e=>{l.aberta=false;if(l.aoFechar)l.aoFechar(e)};
  ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch(x){return}if(l.aoReceber)l.aoReceber(m)};
  l.enviar=m=>{if(ws.readyState===1){l.enviouEm=realNow();if(m.t!=='oi')REDE.enviadas++;ws.send(JSON.stringify(m))}};
  return l;
}

/* ---------- anfitrião: roda a mesa (js/mesa/anfitriao.js) ---------- */
// Sinal: cada lado manda um "oi" a cada 2 s. O anfitrião confere quem ficou mudo (anfSinal); o convidado, se o
// anfitrião sumiu por mais de 8 s
function redeSinal(){
  const agora=realNow();
  if(REDE.papel==='anfitriao')anfSinal();
  else if(REDE.anfitriao){
    const l=REDE.anfitriao;
    if(l.aberta&&agora-(l.enviouEm||0)>=2000)l.enviar({t:'oi'});
    redeSemSinal(REDE.conectado&&(!l.aberta||agora-REDE.ultimoSinal>8000));
  }
  nativeTimeout(redeSinal,1000);
}
function redeSemSinal(sem){
  let el=document.getElementById('semSinal');
  if(!el){el=document.createElement('div');el.id='semSinal';el.className='sem-sinal';el.hidden=true;document.body.appendChild(el)}
  el.textContent=REDE.online?'📵 Sem conexão com o servidor. Tentando de novo…':REDE.anfitriao&&!REDE.anfitriao.aberta?'📵 A conexão com o anfitrião caiu. Para voltar, saia e entre com um convite novo.':'📵 Sem sinal do anfitrião…';
  el.hidden=!sem;
}
function redeAnfitriao(){
  REDE.papel='anfitriao';semTurbo=true;nativeTimeout(redeSinal,1000);
  ANF.agora=realNow;ANF.cfg=CFG;ANF.aviso=redeAviso;anfInicia();
  // partida nova (pela sala ou, nos testes, quando os convidados chegam): o placar e as Configurações fecham
  ANF.aoComecar=()=>{$('endOv').classList.remove('show');$('settingsOv').classList.remove('show')};
  $('home').hidden=true;
  $('openSettings').hidden=true; // partida nova é pela sala ou pelo fim da partida
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
  l.aoAbrir=()=>{};l.aoFechar=anfMudou;anfNovaLigacao(l);
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
    if(['sala','entrou','erro','removido'].includes(m.t)){if(REDE.aoSala)REDE.aoSala(m);return}
    if(m.visao){
      // a visão substitui a partida inteira; o que a tela guardou nela (janela aberta) continua
      const auto=S&&S.autoResolve,pre=S&&S.preLanded;
      S=m.visao.S;R=m.visao.R;TOUR=m.visao.TOUR;
      if(auto)S.autoResolve=auto;if(pre)S.preLanded=pre;
      if(REDE.aoVisao)REDE.aoVisao();
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
  // sem a sala: a partida começa sozinha quando chegam os convidados, com o tempo para jogar do endereço (?tempo=)
  ANF.automatico=Math.max(1,Math.min(5,+q.get('convidados')||1));ANF.tempo=q.get('tempo')||'livre';
  if(REDE_MODO==='anfitriao'){
    redeAnfitriao();abreCanalMentira('anfitriao');
    redeAviso(`Rede de mentira: anfitrião (esperando ${ANF.automatico} convidado(s) em outras abas, com ?rede=convidado)`);
  }else if(REDE_MODO==='convidado'){
    redeConvidado();abreCanalMentira('c'+Math.floor(Math.random()*1e9));
    OPCOES.meuNome=q.get('nome')||'';
    redeLigaAnfitriao(ligacaoMentira('anfitriao'));
    redeAviso('Rede de mentira: convidado (procurando o anfitrião)');
    const ola=()=>{if(!REDE.conectado){redeOla();setTimeout(ola,1500)}};ola();
  }else if(REDE_MODO==='lan-anfitriao'){redeAnfitriao();redeAviso('Rede local: anfitrião')}
  else if(REDE_MODO==='lan-convidado'){redeConvidado();redeAviso('Rede local: convidado')}
}
