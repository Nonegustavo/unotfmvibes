/* unotfm: sala para jogar com amigos (botão 👥 da tela inicial). Dois jeitos:
   - Pela internet (fase 3): quem cria a sala é o dono dela. O servidor das salas (servidor/servidor.mjs) roda a mesa e o
     anfitrião e dá um código de 4 caracteres e um link. Quem recebe abre o link (ou digita o código) e entra. Cada
     aparelho guarda a chave da própria cadeira e volta sozinho se a conexão cair ou o jogo for aberto de novo.
   - Na mesma Wi-Fi (fase 1.5): o aparelho que cria a sala roda a mesa e o anfitrião (ANF, js/mesa/anfitriao.js) e
     convida cada pessoa com um QR code (e lê o QR code de resposta dela). Funciona sem internet.
   Nos dois, quem criou escolhe quantos lugares, a ordem das pessoas (ou sorteio a cada partida), o tempo para jogar e
   as regras; os outros tocam em "Estou pronto"; quem começa a partida é quem criou (ou o novo dono, online). Aqui só se
   desenha e se mandam os comandos: a sala em si é a do ANF, neste aparelho (rede local) ou no servidor (online). */
const SALA={papel:null,online:false,dono:false,ultima:null,codigo:null,chave:null,convite:null,resposta:null,camera:false,pronto:false,saindo:false,tentativas:0,
  dentro:false,voltando:false}; // online: já entrou na sala por esta conexão; voltou no meio de uma partida
const TEMPOS=[['normal','Normal'],['longo','Longo'],['livre','Sem limite']];
const TEMPO_TXT={normal:'20 s por jogada, 15 s para cor e alvo, 30 s para Memória, Carta da Regra e Mix.',longo:'O dobro do Normal.',livre:'Ninguém tem pressa (bom para aprender as regras).'};
function salaEstado(id,txt,tipo){const e=$(id);e.textContent=txt||'';e.className='sala-estado'+(tipo?' '+tipo:'')}
function salaMostra(qual){['salaInicio','salaCodigoTela','salaCriando','salaAnfitriao','salaConvidado'].forEach(id=>$(id).hidden=id!==qual);$('salaRodape').hidden=qual==='salaCodigoTela'}
// nomes vão para o HTML da sala: sem os caracteres que viram marcação
const salaHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- câmera: lê um QR code do jogo (BarcodeDetector quando houver, senão jsQR) ---------- */
async function lerQRCamera(titulo){
  $('camTitulo').textContent=titulo;$('camDica').textContent='Aponte a câmera para o QR code do outro aparelho.';$('camOv').classList.add('show');
  const video=$('camVideo');let stream;
  try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false})}
  catch(e){$('camOv').classList.remove('show');return {erro:e.name==='NotAllowedError'?'Sem permissão para usar a câmera. Use "Sem câmera?" para colar o código.':'Não deu para abrir a câmera. Use "Sem câmera?" para colar o código.'}}
  SALA.camera=true;video.srcObject=stream;try{await video.play()}catch(e){}
  let det=null;try{if('BarcodeDetector' in window)det=new BarcodeDetector({formats:['qr_code']})}catch(e){det=null}
  const cv=document.createElement('canvas'),g=cv.getContext('2d',{willReadFrequently:true});
  return new Promise(res=>{
    let fim=false;
    const parar=v=>{if(fim)return;fim=true;stream.getTracks().forEach(t=>t.stop());video.srcObject=null;$('camOv').classList.remove('show');res(v)};
    $('camCancelar').onclick=()=>parar(null);
    const passo=async()=>{
      if(fim)return;
      if(video.readyState>=2&&video.videoWidth){
        try{
          let txt=null;
          if(det){const r=await det.detect(video);if(r.length)txt=r[0].rawValue}
          else{const k=Math.min(1,800/Math.max(video.videoWidth,video.videoHeight));cv.width=Math.round(video.videoWidth*k);cv.height=Math.round(video.videoHeight*k);
            g.drawImage(video,0,0,cv.width,cv.height);const r=jsQR(g.getImageData(0,0,cv.width,cv.height).data,cv.width,cv.height,{inversionAttempts:'dontInvert'});if(r)txt=r.data}
          if(txt&&txt.startsWith('UT1')){parar({texto:txt});return}
          if(txt)$('camDica').textContent='Esse QR code não é de uma sala do unotfm.';
        }catch(e){det=null}
      }
      setTimeout(passo,det?90:140);
    };
    passo();
  });
}
// pedir a câmera antes de criar o convite costuma fazer o navegador mostrar o endereço real do aparelho na rede
async function salaLiberaCamera(){
  if(SALA.camera)return;
  try{const s=await navigator.mediaDevices.getUserMedia({video:true,audio:false});s.getTracks().forEach(t=>t.stop());SALA.camera=true}catch(e){}
}
async function salaCopia(texto,aviso='Código copiado'){try{await navigator.clipboard.writeText(texto);toast(aviso)}catch(e){toast('Não deu para copiar')}}

/* ---------- tela acesa enquanto houver sala (na rede local, se o anfitrião sair do jogo, a partida para para todos) ---------- */
let TELA_ACESA=null;
async function telaAcesa(){
  try{if('wakeLock' in navigator&&!TELA_ACESA){TELA_ACESA=await navigator.wakeLock.request('screen');TELA_ACESA.addEventListener('release',()=>{TELA_ACESA=null})}}catch(e){}
}
document.addEventListener('visibilitychange',()=>{
  if(!SALA.papel||document.visibilityState!=='visible')return;
  telaAcesa();
  // online: a aba voltou do segundo plano sem conexão (o celular costuma fechar): reconecta na hora
  if(SALA.online&&SALA.codigo&&!SALA.saindo&&REDE.anfitriao&&!REDE.anfitriao.aberta&&!SALA.reconectando)onlineConecta();
});

/* ---------- início ---------- */
// a primeira tela: o nome e Criar sala ou Entrar com código (com o link de um convite, só Entrar na sala)
function salaAbre(){
  $('salaNome').value=load('unotfm-nome','')||'';$('salaTitulo').textContent='Jogar com amigos';
  salaMostra('salaInicio');$('salaComecar').hidden=true;$('salaSair').textContent='Voltar';salaEstado('salaEstadoInicio','');
  $('salaEscolha').hidden=false;$('salaEntrarConvite').hidden=true;$('salaConviteTxt').hidden=true;SALA.conviteCodigo=null;
  // a sala na mesma Wi-Fi (sem internet) fica escondida: aparece com ?wifi=1 no endereço
  $('salaWifi').hidden=!/^(1|sim)$/.test(new URLSearchParams(location.search).get('wifi')||'');
  $('salaOv').classList.add('show');
}
// convidado pelo link (?sala=CÓDIGO): a primeira tela tem só o nome e Entrar na sala
function salaConviteAbre(codigo){
  salaAbre();SALA.conviteCodigo=codigo;
  $('salaEscolha').hidden=true;$('salaEntrarConvite').hidden=false;$('salaEntrarConvite').textContent=`Entrar na sala ${codigo}`;
  $('salaConviteTxt').hidden=false;$('salaConviteTxt').textContent=`Você foi convidado para a sala ${codigo}.`;
}
// a janela de escrever o código
function salaCodigoAbre(erro){
  $('salaTitulo').textContent='Entrar com código';salaMostra('salaCodigoTela');salaEstado('salaEstadoCodigo',erro||'',erro?'erro':'');
  salaCodigoConfere();$('salaCodigo').focus();
}
function salaCodigoConfere(){
  const c=$('salaCodigo'),v=c.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4);
  if(c.value!==v)c.value=v;
  $('salaCodigoEntrar').disabled=v.length!==4;
}
// o nome é obrigatório para jogar online: é ele que os outros veem na mesa
function salaNomeOk(){
  salaGuardaNome();
  if(OPCOES.meuNome)return true;
  salaEstado('salaEstadoInicio','Escreva seu nome primeiro: é ele que os outros veem na mesa.','erro');$('salaNome').focus();
  return false;
}
function salaGuardaNome(){
  const n=$('salaNome').value.replace(/[<>&"'`]/g,'').trim().slice(0,16);save('unotfm-nome',n);OPCOES.meuNome=n||(SALA.papel==='anfitriao'?'Anfitrião':'');
}

/* ---------- o que a sala mostra a quem manda nela ---------- */
// na rede local, o ANF deste aparelho; online, a última lista que o servidor mandou. min: a primeira cadeira que se pode
// mexer (na rede local, a 0 é do anfitrião)
function salaModelo(){
  if(SALA.online){const m=SALA.ultima||{lugares:[],regras:resumoRegras(CFG),tempo:CFG.tempoRede,sortear:false};return {...m,n:m.lugares.length,min:0}}
  return {n:ANF.n,min:1,sortear:ANF.sortear,tempo:ANF.tempo,regras:resumoRegras(CFG),
    lugares:ANF.lugares.map((x,i)=>x==='eu'?{nome:OPCOES.meuNome||'Anfitrião',voce:true,col:'var(--accent)'}:!x?{tipo:'bot'}:{nome:x.nome,pronto:!!x.pronto,caiu:x.caiu||x.aberta===false,col:corDaPessoa(i)})};
}
function salaLinhas(lugares){
  return lugares.map((x,i)=>{
    const bot=!x||x.tipo==='bot',nome=bot?'Bot':x.nome;
    const tag=x&&x.voce?'você':bot?'':x.anfitriao?'anfitrião':x.dono?'dono da sala':x.caiu?'📵 caiu':x.pronto?'✓ pronto':'entrou';
    return {i,bot,nome,tag,ok:!!(x&&x.pronto),col:bot?'#4a3f6b':x.col,voce:!!(x&&x.voce),dono:!!(x&&(x.dono||x.anfitriao)),caiu:!!(x&&x.caiu)};
  });
}
// texto das regras da sala a partir do resumo (resumoRegras: modo, dificuldade e quantas regras)
function salaRegrasTxt(r){
  const modo=(SEGS.mode.find(x=>x[0]===r.mode)||[])[1]||'';
  const dif=(SEGS.diff.find(x=>x[0]===r.diff)||[])[1]||'';
  return `${modo}${r.mode==='custom'?` (${r.n} regra${r.n===1?'':'s'})`:''} · bots no ${dif.toLowerCase()}`;
}
// as regras ligadas, uma por etiqueta, e a defesa contra compras
function salaRegrasLista(r){
  const def=(SEGS.combo.find(x=>x[0]===r.combo)||[])[1];
  return [...(r.lista||[]).map(k=>`${ruleIcon(k)} ${RNAME[k]||k}`),...(def?[`🛡️ Defesa contra compras: ${def}`]:[])].map(t=>`<li>${t}</li>`).join('');
}
// desenha a sala de quem manda nela (o anfitrião da rede local ou o dono online); os outros veem salaDoAnfitriao
function salaDesenha(){
  if(SALA.papel!=='anfitriao'&&!(SALA.online&&SALA.dono))return;
  const m=salaModelo(),linhas=salaLinhas(m.lugares),pessoas=linhas.filter(x=>!x.bot).length,lan=!SALA.online;
  $('salaAviso').textContent=lan?'A tela fica acesa enquanto a sala estiver aberta. Se você sair do jogo ou bloquear a tela, a partida para para todos.'
    :'Mande o código ou o link para quem vai jogar. Se você sair do jogo, a partida continua e outra pessoa vira dona da sala.';
  $('salaLugaresLegenda').textContent=lan?'Os lugares vazios ficam com bots. Toque num bot para convidar alguém para o lugar dele.':'Os lugares vazios ficam com bots. Quem entrar pelo link ocupa um deles.';
  $('salaLugaresSeg').innerHTML=[2,3,4,5,6].map(n=>`<button type="button" data-n="${n}" aria-pressed="${n===m.n}" ${n<pessoas?'disabled':''}>${n}</button>`).join('');
  $('salaLugares').innerHTML=linhas.map(({i,bot,nome,tag,ok,col,voce})=>{
    if(bot&&lan&&!m.sortear)tag=ANF.lugarConvite===i&&SALA.convite?'convidando…':'➕ convidar';
    const mexe=i>=m.min&&!m.sortear;
    return `<li class="${bot?'bot':''} ${bot&&lan?'convida':''}" ${bot&&lan?`data-convidar="${i}"`:''} data-nome="${bot?'':salaHtml(nome)}"><span class="av" style="background:${col}">${bot?'🤖':salaHtml(nome[0])}</span><span class="nm">${salaHtml(nome)}</span><span class="tg ${ok?'ok':''}">${tag}</span>`+
      (!lan&&!bot&&!voce?`<button type="button" data-tirar="${i}" aria-label="Tirar ${salaHtml(nome)} da sala">✕</button>`:'')+
      (mexe?`<button type="button" data-sobe="${i}" ${i<=m.min?'disabled':''} aria-label="Subir">▲</button><button type="button" data-desce="${i}" ${i>=m.n-1?'disabled':''} aria-label="Descer">▼</button>`:'')+'</li>'}).join('');
  $('salaSortear').checked=!!m.sortear;
  $('salaTempoSeg').innerHTML=TEMPOS.map(([k,t])=>`<button type="button" data-tempo="${k}" aria-pressed="${m.tempo===k}">${t}</button>`).join('');
  $('salaTempoLegenda').textContent=TEMPO_TXT[m.tempo]||'';
  $('salaRegrasTxt').textContent=salaRegrasTxt(m.regras);$('salaRegrasLista').innerHTML=salaRegrasLista(m.regras);
  $('salaConvidar').hidden=!lan;
  $('salaConvidar').textContent=pessoas>1?'➕ Convidar outra pessoa':'➕ Convidar alguém';
  $('salaConvidar').disabled=pessoas>=6;
  const jogando=S&&S.phase!=='over';
  // começar: com pelo menos mais uma pessoa e todas prontas (a próxima rodada de um torneio não espera)
  const faltam=linhas.filter(x=>!x.bot&&!x.voce&&!x.dono&&!x.caiu&&!x.ok).length,segue=!!(TOUR&&!TOUR.done&&S&&S.phase==='over');
  $('salaComecar').hidden=false;
  $('salaComecar').textContent=jogando?'Voltar ao jogo':faltam&&!segue&&pessoas>=2?`Esperando ${faltam===1?'1 pessoa ficar pronta':faltam+' pessoas ficarem prontas'}…`:segue?'Próxima rodada':'Começar partida';
  $('salaComecar').disabled=!jogando&&(pessoas<2||(faltam>0&&!segue));
  if(!SALA.online){ASSISTINDO=anfAssistindo();mostraAssistindo()}
}
// comandos de quem manda na sala: na rede local, direto no ANF deste aparelho; online, para o servidor
function salaCmd(c,x={}){
  if(SALA.online){if(REDE.anfitriao)REDE.anfitriao.enviar({t:'comando',c,...x});return}
  if(c==='lugares')anfLugares(x.n);
  else if(c==='troca')anfTroca(x.i,x.j);
  else if(c==='sortear'){ANF.sortear=x.v;anfMudou()}
  else if(c==='tempo'){ANF.tempo=x.v;anfMudou()}
  else if(c==='regras')anfMudou();
  else if(c==='comecar')anfComecaSala();
}
// as regras da sala: as das Configurações deste aparelho
function cfgDaSala(){const c={mode:CFG.mode,diff:CFG.diff,start:CFG.start,combo:CFG.combo};RULES.forEach(x=>{if(CFG[x.k]===true)c[x.k]=true});return c}
// a partida: cada pessoa no lugar escolhido (ou sorteado entre os lugares das pessoas)
function salaComeca(){$('salaOv').classList.remove('show');$('endOv').classList.remove('show');salaCmd('comecar')}
// as regras: as Configurações de sempre, sem a quantidade de adversários (vem dos lugares) e sem começar a partida
function salaEditaRegras(){
  $('salaOv').classList.remove('show');openSettings();$('botsField').hidden=true;
  const st=$('startBtn'),cl=$('closeSettings'),antes=st.onclick,antesCl=cl.onclick,txt=st.textContent;
  // a sala mostra as regras novas (e os outros também)
  const volta=()=>{$('settingsOv').classList.remove('show');st.onclick=antes;cl.onclick=antesCl;st.textContent=txt;$('botsField').hidden=false;$('salaOv').classList.add('show');salaCmd('regras',{cfg:cfgDaSala()});salaDesenha()};
  st.textContent='Salvar';st.onclick=()=>{save('unotfm-solo-cfg',CFG);volta()};cl.onclick=volta;
}

/* ---------- rede local: anfitrião ---------- */
// lugares: um por cadeira, na ordem da mesa. 0 é sempre o anfitrião ('eu'); os outros são uma ligação (pessoa) ou null
function salaCria(){
  SALA.papel='anfitriao';salaGuardaNome();telaAcesa();
  redeAnfitriao();ANF.sala=true;ANF.aoMudar=salaDesenha;
  ANF.aoEntrar=l=>{salaEstado('salaEstado',`✅ ${l.nome} entrou na sala!`,'ok');$('salaConvite').hidden=true;SALA.convite=null};
  ANF.n=Math.min(6,Math.max(2,(CFG.bots||3)+1));ANF.lugares=['eu',...Array(ANF.n-1).fill(null)];
  ANF.sortear=!!CFG.sortearLugares;
  if(!CFG.tempoRede)CFG.tempoRede='normal';ANF.tempo=CFG.tempoRede;
  $('salaTitulo').textContent='Sua sala';$('salaSair').textContent='Sair da sala';
  salaMostra('salaAnfitriao');salaDesenha();
  // fim da partida: nova rodada com a mesma sala, ou de volta à sala para mudar alguma coisa
  FIM_BOTOES=salaBotoesFim;
}
// a sala durante a partida (Sala e regras, no menu, e Ver a sala / Voltar à sala, no fim da rodada)
function salaVer(){$('salaOv').classList.add('show');salaDesenha();salaBotaoJogo()}
// quem manda na sala: o anfitrião da rede local ou o dono online
const salaManda=()=>SALA.papel==='anfitriao'||SALA.online&&SALA.dono;
// quem não manda na sala: com a partida andando, o botão da sala volta ao jogo (quem manda tem o de começar/voltar)
function salaBotaoJogo(){
  if(salaManda()){$('salaComecar').hidden=false;return}
  const jogando=!!(S&&S.players&&S.phase!=='over');
  $('salaComecar').hidden=!jogando;$('salaComecar').disabled=false;$('salaComecar').textContent='Voltar ao jogo';
}
// fim da rodada: todos voltam à sala (os convidados dão Pronto de novo). No torneio que ainda não acabou, quem manda
// começa a próxima rodada direto e os outros esperam
function salaBotoesFim(){
  const segue=!!(TOUR&&!TOUR.done);
  $('endMenu').hidden=true;$('endRules').hidden=segue;$('againBtn').hidden=!segue;
  $('endRules').textContent='Voltar à sala';$('endRules').onclick=()=>{$('endOv').classList.remove('show');salaVer()};
  if(!segue)return;
  if(salaManda()){$('againBtn').disabled=false;$('againBtn').onclick=salaComeca;$('againBtn').textContent='Próxima rodada'}
  else{$('againBtn').disabled=true;$('againBtn').onclick=null;$('againBtn').textContent=SALA.online?'Esperando o dono…':'Esperando o anfitrião…'}
}
// sair da sala (Sair da partida, no menu; Menu principal, no fim da rodada; Sair da sala, na sala): pergunta antes, com
// o que acontece para quem sai
function salaDentro(){return SALA.online?!!(SALA.codigo&&!SALA.saindo):SALA.papel==='anfitriao'||!!REDE.conectado}
async function salaSai(){
  if(!salaDentro()){
    if(SALA.online){onlineEsquece();location.href=semSala();return}
    if(SALA.papel){location.reload();return}
    $('salaOv').classList.remove('show');return;
  }
  const jogando=!!(S&&S.players&&S.phase!=='over'),bot=jogando?' Na partida, um bot joga no seu lugar.':'';
  const texto=SALA.papel==='anfitriao'?'A sala fecha e a partida acaba para todos.'
    :SALA.online&&SALA.dono?'Você volta ao menu principal e outra pessoa vira dona da sala.'+bot:'Você volta ao menu principal.'+bot;
  if(!await confirmaJogo({titulo:'Sair da sala?',texto,sim:'Sair',nao:'Ficar'}))return;
  if(SALA.online){SALA.saindo=true;if(REDE.anfitriao)REDE.anfitriao.enviar({t:'sair'});onlineEsquece();setTimeout(()=>{location.href=semSala()},150);return}
  location.reload();
}
async function salaConvida(){
  const b=$('salaConvidar');b.disabled=true;salaEstado('salaEstado','Preparando o convite…');
  $('salaConvite').hidden=true;
  try{
    await salaLiberaCamera();
    SALA.convite=await redeConvidar();
    desenharQR($('salaQR'),SALA.convite);$('salaColar').value='';
    $('salaConvite').hidden=false;salaEstado('salaEstado','Esperando a pessoa ler o convite…');
  }catch(e){salaEstado('salaEstado','Não deu para criar o convite: '+e.message,'erro')}
  b.disabled=anfPessoas().length>=5;
}
async function salaUsaResposta(texto){
  try{await redeResposta(lerCodigo(texto));salaEstado('salaEstado','Conectando…');
    setTimeout(()=>{if($('salaEstado').textContent==='Conectando…')salaEstado('salaEstado','A pessoa não conectou em 15 s. Os dois aparelhos estão na mesma Wi-Fi? Tente convidar de novo.','erro')},15000)}
  catch(e){salaEstado('salaEstado',e.message,'erro')}
}

/* ---------- rede local: convidado ---------- */
function salaEntra(){
  SALA.papel='convidado';salaGuardaNome();telaAcesa();
  redeConvidado();
  REDE.aoSala=salaDoAnfitriao;
  $('salaTitulo').textContent='Entrar numa sala';$('salaSair').textContent='Sair';$('salaComecar').hidden=true;
  $('salaLerConvite').hidden=false;$('salaResposta').hidden=true;$('salaDentro').hidden=true;salaEstado('salaEstadoConv','');
  salaMostra('salaConvidado');
  // o fim da partida: a próxima rodada é com o anfitrião
  FIM_BOTOES=salaBotoesFim;
}
async function salaUsaConvite(texto){
  salaEstado('salaEstadoConv','Preparando a resposta…');
  try{
    SALA.resposta=await redeEntrar(lerCodigo(texto));
    desenharQR($('salaQRResp'),SALA.resposta);
    $('salaLerConvite').hidden=true;$('salaResposta').hidden=false;
    salaEstado('salaEstadoConv','Esperando o anfitrião ler a resposta…');
  }catch(e){salaEstado('salaEstadoConv',e.message,'erro')}
}
// a sala vista por quem não manda nela (convidado da rede local ou quem não é o dono, online)
function salaDoAnfitriao(m){
  if(m.t==='versao'){salaEstado('salaEstadoConv','O anfitrião está com outra versão do jogo. Atualizem o jogo nos dois aparelhos (feche e abra de novo, com internet).','erro');return}
  if(m.t==='caiu'){salaEstado('salaEstadoConv','A conexão com o anfitrião caiu.','erro');$('salaOv').classList.add('show');return}
  $('salaTitulo').textContent='Na sala';
  $('salaLerConvite').hidden=true;$('salaResposta').hidden=true;$('salaDentro').hidden=false;
  const quem=(m.lugares.find(x=>x.anfitriao||x.dono)||{}).nome||'anfitrião';
  $('salaDentroTxt').textContent=`Você está na sala de ${quem}. A partida começa quando ${quem} tocar em Começar.`;
  $('salaLugaresConv').innerHTML=salaLinhas(m.lugares).map(({bot,nome,tag,ok,col})=>`<li class="${bot?'bot':''}" data-nome="${bot?'':salaHtml(nome)}"><span class="av" style="background:${col}">${bot?'🤖':salaHtml(nome[0])}</span><span class="nm">${salaHtml(nome)}</span><span class="tg ${ok?'ok':''}">${tag}</span></li>`).join('');
  $('salaRegrasListaConv').innerHTML=salaRegrasLista(m.regras);
  $('salaRegrasConv').textContent=`${salaRegrasTxt(m.regras)} · tempo para jogar: ${(TEMPOS.find(x=>x[0]===m.tempo)||[])[1]||''}${m.sortear?' · lugares sorteados a cada partida':''}`;
  // o pronto é o que a sala diz (no fim de cada partida, todos voltam a não estar prontos)
  const eu=m.lugares.find(x=>x&&x.voce);if(eu)SALA.pronto=!!eu.pronto;
  $('salaPronto').textContent=SALA.pronto?'✓ Pronto (tocar para cancelar)':'Estou pronto';
  salaEstado('salaEstadoConv','✅ Conectado!','ok');
}

/* ---------- pela internet ---------- */
const ONLINE_KEY='unotfm-online',CODIGO_OK=/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}$/;
// o link da sala (com o servidor do endereço, quando ele foi trocado, para os testes no computador)
function salaLink(codigo){
  const u=new URL(location.pathname,location.origin);u.searchParams.set('sala',codigo);
  const sv=new URLSearchParams(location.search).get('servidor');if(sv)u.searchParams.set('servidor',sv);
  return u.href;
}
// o endereço do jogo sem a sala (para sair dela sem entrar de novo ao recarregar)
function semSala(){const u=new URL(location.href);u.searchParams.delete('sala');return u.href}
const onlineEsquece=()=>{try{localStorage.removeItem(ONLINE_KEY)}catch(e){}};
// entra no modo online (uma vez por página): a tela vira a de um convidado do servidor
function onlineInicia(){
  if(SALA.online)return;
  SALA.online=true;SALA.papel='online';telaAcesa();
  redeConvidado();REDE.online=true;REDE.aoSala=onlineMsg;FIM_BOTOES=salaBotoesFim;
  // voltou no meio de uma partida: a sala fecha e a partida aparece
  // entrou com a partida andando: a sala fecha uma vez e a partida aparece, para assistir
  REDE.aoVisao=()=>{if(S&&S.players)$('home').hidden=true;if(SALA.voltando&&S&&S.players&&S.phase!=='over'){SALA.voltando=false;$('salaOv').classList.remove('show')}
    const esp=espectador();if(esp&&!SALA.assistiu&&S.phase!=='over')$('salaOv').classList.remove('show');SALA.assistiu=esp};
  // até chegar uma partida, atrás das janelas da sala fica a tela inicial (e não uma mesa vazia)
  $('home').hidden=false;
  $('salaSair').textContent='Sair da sala';
}
// enquanto o servidor não responde: uma tela só de espera (a sala aparece quando chegar a lista dela)
function salaEspera(txt){$('salaCriandoTxt').textContent=txt;salaMostra('salaCriando');$('salaOv').classList.add('show')}
// mensagem com que se entra: criar a sala, entrar pelo código, ou voltar com a chave
function onlinePrimeira(){
  const base={nome:OPCOES.meuNome||'',versao:VERSAO_REDE};
  if(SALA.codigo)return {t:'entrar',codigo:SALA.codigo,chave:SALA.chave||undefined,...base};
  return {t:'criar',cfg:cfgDaSala(),tempo:CFG.tempoRede||'normal',...base};
}
function onlineConecta(){
  SALA.reconectando=true;SALA.dentro=false;
  const l=ligacaoWS(SERVIDOR);redeLigaAnfitriao(l);
  l.aoAbrir=()=>{SALA.reconectando=false;l.enviar(onlinePrimeira())};
  l.aoFechar=e=>onlineCaiu(l,e);
}
function onlineCria(){
  if(!salaNomeOk())return;
  SALA.tentativa='criar';SALA.codigo=null;SALA.chave=null;onlineInicia();
  salaEspera('Criando a sala…');onlineConecta();
}
// entrar numa sala pelo código (da janela de escrever o código, ou do link de um convite)
function onlineEntra(texto,tentativa='codigo'){
  const codigo=String(texto||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!CODIGO_OK.test(codigo)){salaCodigoAbre('O código tem 4 letras ou números (sem 0, O, 1, I nem L). Confira com quem criou a sala.');return}
  SALA.tentativa=tentativa;
  const salvo=load(ONLINE_KEY,null);
  SALA.codigo=codigo;SALA.chave=salvo&&salvo.codigo===codigo&&salvo.servidor===SERVIDOR?salvo.chave:null;
  onlineInicia();salaEspera(`Entrando na sala ${codigo}…`);onlineConecta();
}
// volta para a sala guardada (a página recarregou ou o jogo foi aberto de novo)
function onlineVolta(salvo){
  OPCOES.meuNome=load('unotfm-nome','')||'';SALA.codigo=salvo.codigo;SALA.chave=salvo.chave;SALA.tentativa='volta';
  onlineInicia();salaAbre();salaEspera(`Voltando para a sala ${salvo.codigo}…`);onlineConecta();
}
// a conexão fechou: de propósito (sala acabou, tirado, outra aba) ou não (sinal): nesse caso, tenta de novo
function onlineCaiu(l,e){
  if(l!==REDE.anfitriao||SALA.saindo)return;
  SALA.reconectando=false;
  const fim=t=>{SALA.saindo=true;onlineEsquece();$('endOv').classList.remove('show');salaAbre();$('salaSair').textContent='Voltar';salaEstado('salaEstadoInicio',t,'erro')};
  if(e.code===4000)return fim(`A sala acabou (${e.reason||'encerrada'}).`);
  if(e.code===4001)return fim('Você entrou nesta sala por outra aba ou aparelho.');
  if(e.code===4002)return fim('Você foi tirado da sala.');
  if(e.code===1008)return fim('A conexão com o servidor foi encerrada.');
  if(!SALA.chave){if(++SALA.tentativas>2)return fim('Não deu para falar com o servidor das salas. Confira a internet e tente de novo.');}
  else SALA.tentativas++;
  const ms=Math.min(10000,500*2**Math.min(5,SALA.tentativas));
  setTimeout(()=>{if(!SALA.saindo&&REDE.anfitriao===l)onlineConecta()},ms);
}
// mensagens do servidor que não são da partida: entrar, erros, a lista da sala
function onlineMsg(m){
  if(m.t==='entrou'){
    SALA.codigo=m.codigo;SALA.chave=m.chave;SALA.tentativas=0;SALA.dentro=true;SALA.voltando=!!m.voltou;
    save(ONLINE_KEY,{codigo:m.codigo,chave:m.chave,servidor:SERVIDOR,t:Date.now()});
    $('salaCodigoTxt').textContent=m.codigo;$('salaLink').textContent=salaLink(m.codigo);$('salaOnlineBox').hidden=false;
    salaEstado('salaEstadoInicio','');$('salaSair').textContent='Sair da sala';
    if(m.voltou)toast('Você voltou para a sala');
    return;
  }
  if(m.t==='erro'){
    if(!SALA.dentro){
      // não entrou: a sala não existe, está cheia, a pessoa foi tirada…
      if(/não encontrada|tirado/.test(m.motivo))onlineEsquece();
      SALA.saindo=true;if(REDE.anfitriao&&REDE.anfitriao.ws)REDE.anfitriao.ws.close();
      const txt=m.motivo[0].toUpperCase()+m.motivo.slice(1)+'.';
      // pelo código, volta à janela do código (com ele ainda escrito, para corrigir); senão, à primeira tela
      if(SALA.tentativa==='codigo'){$('salaCodigo').value=SALA.codigo||$('salaCodigo').value;salaCodigoAbre(txt)}
      else{salaAbre();salaEstado('salaEstadoInicio',txt,'erro')}
      SALA.saindo=false;SALA.codigo=null;SALA.chave=null;REDE.anfitriao=null;
    }else toast(m.motivo);
    return;
  }
  if(m.t==='removido'){SALA.saindo=true;onlineEsquece();$('endOv').classList.remove('show');salaAbre();$('salaSair').textContent='Voltar';salaEstado('salaEstadoInicio','Você foi tirado da sala.','erro');return}
  if(m.t==='versao'){salaAbre();salaEstado('salaEstadoInicio','O servidor está com outra versão do jogo. Feche o jogo e abra de novo, com internet, para atualizar.','erro');return}
  if(m.t!=='sala')return;
  const antes=SALA.ultima;SALA.ultima=m;ASSISTINDO=m.assistindo||0;mostraAssistindo();
  const eu=m.lugares.find(x=>x.voce),dono=!!(eu&&eu.dono);
  if(dono&&!SALA.dono&&antes)toast('Agora você é o dono da sala');
  SALA.dono=dono;
  $('salaTitulo').textContent=dono?'Sua sala':'Na sala';
  salaBotaoJogo();salaBotoesFim();
  if(dono){salaMostra('salaAnfitriao');salaDesenha()}
  else{salaMostra('salaConvidado');salaDoAnfitriao(m)}
}
function onlineCompartilha(){
  const url=salaLink(SALA.codigo),txt=`Entre na minha sala do unotfm: ${url} (código ${SALA.codigo})`;
  if(navigator.share)navigator.share({title:'unotfm',text:`Entre na minha sala do unotfm (código ${SALA.codigo})`,url}).catch(()=>{});
  else salaCopia(txt,'Link copiado');
}
// abrir o jogo pelo link de uma sala (?sala=CÓDIGO), ou de volta para a sala em que estava
{
  const q=new URLSearchParams(location.search),cod=(q.get('sala')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4);
  const salvo=load(ONLINE_KEY,null),valido=salvo&&salvo.servidor===SERVIDOR&&Date.now()-salvo.t<12*3600e3;
  if(!REDE_MODO){
    if(cod&&valido&&salvo.codigo===cod)onlineVolta(salvo);
    else if(cod)salaConviteAbre(cod);
    else if(valido)onlineVolta(salvo);
  }
}

/* ---------- botões ---------- */
$('homeAmigos').onclick=salaAbre;
$('salaCriar').onclick=salaCria;
$('salaEntrar').onclick=salaEntra;
$('salaCriarOnline').onclick=onlineCria;
$('salaEntrarOnline').onclick=()=>{if(salaNomeOk())salaCodigoAbre()};
$('salaEntrarConvite').onclick=()=>{if(salaNomeOk())onlineEntra(SALA.conviteCodigo,'convite')};
$('salaCodigo').oninput=salaCodigoConfere;
$('salaCodigo').onkeydown=e=>{if(e.key==='Enter'&&!$('salaCodigoEntrar').disabled)onlineEntra($('salaCodigo').value)};
$('salaCodigoEntrar').onclick=()=>onlineEntra($('salaCodigo').value);
$('salaCodigoVoltar').onclick=()=>{$('salaTitulo').textContent='Jogar com amigos';salaMostra('salaInicio')};
$('salaCompartilhar').onclick=onlineCompartilha;
$('salaCopiarLink').onclick=()=>SALA.codigo&&salaCopia(salaLink(SALA.codigo),'Link copiado');
$('salaSair').onclick=salaSai;
$('salaLugaresSeg').onclick=e=>{const b=e.target.closest('button[data-n]');if(b&&!b.disabled){const n=+b.dataset.n;CFG.bots=n-1;save('unotfm-solo-cfg',CFG);salaCmd('lugares',{n})}};
$('salaLugares').onclick=e=>{const s=e.target.closest('[data-sobe]'),d=e.target.closest('[data-desce]'),t=e.target.closest('[data-tirar]');
  if(s)return salaCmd('troca',{i:+s.dataset.sobe,j:+s.dataset.sobe-1});if(d)return salaCmd('troca',{i:+d.dataset.desce,j:+d.dataset.desce+1});
  if(t)return salaCmd('remover',{i:+t.dataset.tirar});
  // rede local, tocar num bot: convida alguém para o lugar dele
  const c=e.target.closest('[data-convidar]');if(c&&!$('salaConvidar').disabled){ANF.lugarConvite=+c.dataset.convidar;salaConvida().then(salaDesenha)}};
$('salaSortear').onchange=e=>{CFG.sortearLugares=e.target.checked;save('unotfm-solo-cfg',CFG);salaCmd('sortear',{v:e.target.checked})};
$('salaTempoSeg').onclick=e=>{const b=e.target.closest('button[data-tempo]');if(b){CFG.tempoRede=b.dataset.tempo;save('unotfm-solo-cfg',CFG);salaCmd('tempo',{v:b.dataset.tempo})}};
$('salaRegras').onclick=salaEditaRegras;
$('salaConvidar').onclick=salaConvida;
$('salaCopiar').onclick=()=>SALA.convite&&salaCopia(comColchetes(SALA.convite));
$('salaLerResposta').onclick=async()=>{const r=await lerQRCamera('Ler a resposta');if(!r)return;if(r.erro){salaEstado('salaEstado',r.erro,'erro');return}salaUsaResposta(r.texto)};
$('salaUsarColado').onclick=()=>salaUsaResposta($('salaColar').value);
$('salaLerConviteBtn').onclick=async()=>{const r=await lerQRCamera('Ler o convite');if(!r)return;if(r.erro){salaEstado('salaEstadoConv',r.erro,'erro');return}salaUsaConvite(r.texto)};
$('salaUsarConvite').onclick=()=>salaUsaConvite($('salaColarConvite').value);
$('salaCopiarResp').onclick=()=>SALA.resposta&&salaCopia(comColchetes(SALA.resposta));
$('salaPronto').onclick=()=>{SALA.pronto=!SALA.pronto;if(REDE.anfitriao)REDE.anfitriao.enviar({t:'pronto',pronto:SALA.pronto});$('salaPronto').textContent=SALA.pronto?'✓ Pronto (tocar para cancelar)':'Estou pronto'};
$('salaComecar').onclick=()=>{if($('salaComecar').disabled)return;if(S&&S.phase!=='over')$('salaOv').classList.remove('show');else salaComeca()};
