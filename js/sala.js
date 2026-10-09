/* unotfm: sala para jogar com amigos na rede local (fase 1.5). O anfitrião cria a sala, escolhe quantos lugares, a
   ordem das pessoas na mesa (ou sorteio a cada partida), o tempo para jogar e as regras, e convida cada pessoa com um
   QR code (e lê o QR code de resposta dela). Os convidados entram lendo o convite e tocam em "Estou pronto"; quem
   começa a partida é o anfitrião. A conexão é a de js/rede.js (redeConvidar, redeResposta, redeEntrar), e a sala em si
   (lugares, sortear, tempo, começar) é a do anfitrião sem página (ANF, js/mesa/anfitriao.js): aqui só se desenha. */
const SALA={papel:null,convite:null,resposta:null,camera:false,pronto:false};
const TEMPOS=[['normal','Normal'],['longo','Longo'],['livre','Sem limite']];
const TEMPO_TXT={normal:'20 s por jogada, 15 s para cor e alvo, 30 s para Memória, Carta da Regra e Mix.',longo:'O dobro do Normal.',livre:'Ninguém tem pressa (bom para aprender as regras).'};
function salaEstado(id,txt,tipo){const e=$(id);e.textContent=txt||'';e.className='sala-estado'+(tipo?' '+tipo:'')}
function salaMostra(qual){['salaInicio','salaAnfitriao','salaConvidado'].forEach(id=>$(id).hidden=id!==qual)}

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
async function salaCopia(texto){try{await navigator.clipboard.writeText(comColchetes(texto));toast('Código copiado')}catch(e){toast('Não deu para copiar')}}

/* ---------- tela acesa enquanto houver sala (se o anfitrião sair do jogo, a partida para para todos) ---------- */
let TELA_ACESA=null;
async function telaAcesa(){
  try{if('wakeLock' in navigator&&!TELA_ACESA){TELA_ACESA=await navigator.wakeLock.request('screen');TELA_ACESA.addEventListener('release',()=>{TELA_ACESA=null})}}catch(e){}
}
document.addEventListener('visibilitychange',()=>{if(SALA.papel&&document.visibilityState==='visible')telaAcesa()});

/* ---------- início ---------- */
function salaAbre(){
  $('salaNome').value=load('unotfm-nome','')||'';
  salaMostra('salaInicio');$('salaComecar').hidden=true;$('salaSair').textContent='Voltar';
  $('salaOv').classList.add('show');
}
function salaGuardaNome(){
  const n=$('salaNome').value.trim().slice(0,16);save('unotfm-nome',n);OPCOES.meuNome=n||(SALA.papel==='anfitriao'?'Anfitrião':'');
}

/* ---------- anfitrião ---------- */
// lugares: um por cadeira, na ordem da mesa. 0 é sempre o anfitrião ('eu'); os outros são uma ligação (pessoa) ou null
function salaCria(){
  SALA.papel='anfitriao';salaGuardaNome();telaAcesa();
  redeAnfitriao();ANF.sala=true;ANF.aoMudar=salaDesenha;
  ANF.aoEntrar=l=>{salaEstado('salaEstado',`✅ ${l.nome} entrou na sala!`,'ok');$('salaConvite').hidden=true;SALA.convite=null};
  ANF.n=Math.min(6,Math.max(2,(CFG.bots||3)+1));ANF.lugares=['eu',...Array(ANF.n-1).fill(null)];
  ANF.sortear=!!CFG.sortearLugares;$('salaSortear').checked=ANF.sortear;
  if(!CFG.tempoRede)CFG.tempoRede='normal';ANF.tempo=CFG.tempoRede;
  $('salaTitulo').textContent='Sua sala';$('salaSair').textContent='Sair da sala';$('salaComecar').hidden=false;
  salaMostra('salaAnfitriao');salaDesenha();
  // fim da partida: nova rodada com a mesma sala, ou de volta à sala para mudar alguma coisa
  const bs=$('openSettings');bs.hidden=false;bs.textContent='Sala';bs.setAttribute('aria-label','Sala');bs.onclick=()=>{$('salaOv').classList.add('show');salaDesenha()};
  $('againBtn').onclick=salaComeca;
  $('endRules').textContent='Voltar à sala';$('endRules').onclick=()=>{$('endOv').classList.remove('show');$('salaOv').classList.add('show');salaDesenha()};
}
// quantos lugares: a quantidade de bots fica salva nas Configurações
function salaMudaLugares(n){if(anfLugares(n)){CFG.bots=n-1;save('unotfm-solo-cfg',CFG)}}
// texto das regras da sala a partir do resumo (resumoRegras: modo, dificuldade e quantas regras)
function salaRegrasTxt(r){
  const modo=(SEGS.mode.find(x=>x[0]===r.mode)||[])[1]||'';
  const dif=(SEGS.diff.find(x=>x[0]===r.diff)||[])[1]||'';
  return `${modo}${r.mode==='custom'?` (${r.n} regra${r.n===1?'':'s'})`:''} · bots no ${dif.toLowerCase()}`;
}
function salaLinhas(lugares,eu){
  return lugares.map((x,i)=>{
    const bot=!x||x.tipo==='bot',nome=x==='eu'?(OPCOES.meuNome||'Anfitrião'):bot?'Bot':x.nome;
    const tag=x==='eu'||(x&&x.voce)?'você':bot?'':x.anfitriao?'anfitrião':x.caiu||x.aberta===false?'📵 caiu':x.pronto?'✓ pronto':'entrou';
    return {i,bot,nome,tag,ok:!!(x&&x.pronto)};
  });
}
// desenha a sala do anfitrião (os convidados recebem a lista pelo anfEnviaSala)
function salaDesenha(){
  if(SALA.papel!=='anfitriao')return;
  const pessoas=ANF.lugares.filter(x=>x&&x!=='eu').length;
  $('salaLugaresSeg').innerHTML=[2,3,4,5,6].map(n=>`<button type="button" data-n="${n}" aria-pressed="${n===ANF.n}" ${n-1<pessoas?'disabled':''}>${n}</button>`).join('');
  $('salaLugares').innerHTML=salaLinhas(ANF.lugares).map(({i,bot,nome,tag,ok})=>{if(bot&&!ANF.sortear)tag=ANF.lugarConvite===i&&SALA.convite?'convidando…':'➕ convidar';return `<li class="${bot?'bot convida':''}" ${bot?`data-convidar="${i}"`:''}><span class="av" style="background:${i===0?'var(--accent)':bot?'#4a3f6b':corDaPessoa(i)}">${bot?'🤖':nome[0]}</span><span class="nm">${nome}</span><span class="tg ${ok?'ok':''}">${tag}</span>${i>0&&!ANF.sortear?`<button type="button" data-sobe="${i}" ${i<=1?'disabled':''} aria-label="Subir">▲</button><button type="button" data-desce="${i}" ${i>=ANF.n-1?'disabled':''} aria-label="Descer">▼</button>`:''}</li>`}).join('');
  $('salaTempoSeg').innerHTML=TEMPOS.map(([k,t])=>`<button type="button" data-tempo="${k}" aria-pressed="${CFG.tempoRede===k}">${t}</button>`).join('');
  $('salaTempoLegenda').textContent=TEMPO_TXT[CFG.tempoRede]||'';
  $('salaRegrasTxt').textContent=salaRegrasTxt(resumoRegras(CFG));
  $('salaConvidar').textContent=pessoas?'➕ Convidar outra pessoa':'➕ Convidar alguém';
  $('salaConvidar').disabled=pessoas>=5;
  const jogando=S&&S.phase!=='over';
  $('salaComecar').textContent=jogando?'Voltar ao jogo':'Começar partida';
  $('salaComecar').disabled=!pessoas&&!jogando;
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
// a partida: cada pessoa no lugar escolhido (ou sorteado entre os lugares das pessoas)
function salaComeca(){$('salaOv').classList.remove('show');anfComecaSala()}
// as regras: as Configurações de sempre, sem a quantidade de adversários (vem dos lugares) e sem começar a partida
function salaEditaRegras(){
  $('salaOv').classList.remove('show');openSettings();$('botsField').hidden=true;
  const st=$('startBtn'),cl=$('closeSettings'),antes=st.onclick,antesCl=cl.onclick,txt=st.textContent;
  // a sala mostra as regras novas (e os convidados também)
  const volta=()=>{$('settingsOv').classList.remove('show');st.onclick=antes;cl.onclick=antesCl;st.textContent=txt;$('botsField').hidden=false;$('salaOv').classList.add('show');anfMudou();salaDesenha()};
  st.textContent='Salvar';st.onclick=()=>{save('unotfm-solo-cfg',CFG);volta()};cl.onclick=volta;
}

/* ---------- convidado ---------- */
function salaEntra(){
  SALA.papel='convidado';salaGuardaNome();telaAcesa();
  redeConvidado();
  REDE.aoSala=salaDoAnfitriao;
  $('salaTitulo').textContent='Entrar numa sala';$('salaSair').textContent='Sair';$('salaComecar').hidden=true;
  $('salaLerConvite').hidden=false;$('salaResposta').hidden=true;$('salaDentro').hidden=true;salaEstado('salaEstadoConv','');
  salaMostra('salaConvidado');
  // o fim da partida não tem botões: a próxima rodada é com o anfitrião
  $('againBtn').hidden=true;$('endRules').hidden=true;
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
function salaDoAnfitriao(m){
  if(m.t==='versao'){salaEstado('salaEstadoConv','O anfitrião está com outra versão do jogo. Atualizem o jogo nos dois aparelhos (feche e abra de novo, com internet).','erro');return}
  if(m.t==='caiu'){salaEstado('salaEstadoConv','A conexão com o anfitrião caiu.','erro');$('salaOv').classList.add('show');return}
  $('salaTitulo').textContent='Na sala';
  $('salaLerConvite').hidden=true;$('salaResposta').hidden=true;$('salaDentro').hidden=false;
  const anf=(m.lugares.find(x=>x.anfitriao)||{}).nome||'anfitrião';
  $('salaDentroTxt').textContent=`Você está na sala de ${anf}. A partida começa quando ${anf} tocar em Começar.`;
  $('salaLugaresConv').innerHTML=salaLinhas(m.lugares).map(({i,bot,nome,tag,ok})=>`<li class="${bot?'bot':''}"><span class="av" style="background:${bot?'#4a3f6b':m.lugares[i].col}">${bot?'🤖':nome[0]}</span><span class="nm">${nome}</span><span class="tg ${ok?'ok':''}">${tag}</span></li>`).join('');
  $('salaRegrasConv').textContent=`${salaRegrasTxt(m.regras)} · tempo para jogar: ${(TEMPOS.find(x=>x[0]===m.tempo)||[])[1]||''}${m.sortear?' · lugares sorteados a cada partida':''}`;
  $('salaPronto').textContent=SALA.pronto?'✓ Pronto (tocar para cancelar)':'Estou pronto';
  salaEstado('salaEstadoConv','✅ Conectado!','ok');
}

/* ---------- botões ---------- */
$('homeAmigos').onclick=salaAbre;
$('salaCriar').onclick=salaCria;
$('salaEntrar').onclick=salaEntra;
$('salaSair').onclick=()=>{if(SALA.papel)location.reload();else $('salaOv').classList.remove('show')};
$('salaLugaresSeg').onclick=e=>{const b=e.target.closest('button[data-n]');if(b&&!b.disabled)salaMudaLugares(+b.dataset.n)};
$('salaLugares').onclick=e=>{const s=e.target.closest('[data-sobe]'),d=e.target.closest('[data-desce]');if(s)return anfTroca(+s.dataset.sobe,+s.dataset.sobe-1);if(d)return anfTroca(+d.dataset.desce,+d.dataset.desce+1);
  // tocar num bot: convida alguém para o lugar dele
  const c=e.target.closest('[data-convidar]');if(c&&!$('salaConvidar').disabled){ANF.lugarConvite=+c.dataset.convidar;salaConvida().then(salaDesenha)}};
$('salaSortear').onchange=e=>{ANF.sortear=e.target.checked;CFG.sortearLugares=ANF.sortear;save('unotfm-solo-cfg',CFG);anfMudou()};
$('salaTempoSeg').onclick=e=>{const b=e.target.closest('button[data-tempo]');if(b){CFG.tempoRede=ANF.tempo=b.dataset.tempo;save('unotfm-solo-cfg',CFG);anfMudou()}};
$('salaRegras').onclick=salaEditaRegras;
$('salaConvidar').onclick=salaConvida;
$('salaCopiar').onclick=()=>SALA.convite&&salaCopia(SALA.convite);
$('salaLerResposta').onclick=async()=>{const r=await lerQRCamera('Ler a resposta');if(!r)return;if(r.erro){salaEstado('salaEstado',r.erro,'erro');return}salaUsaResposta(r.texto)};
$('salaUsarColado').onclick=()=>salaUsaResposta($('salaColar').value);
$('salaLerConviteBtn').onclick=async()=>{const r=await lerQRCamera('Ler o convite');if(!r)return;if(r.erro){salaEstado('salaEstadoConv',r.erro,'erro');return}salaUsaConvite(r.texto)};
$('salaUsarConvite').onclick=()=>salaUsaConvite($('salaColarConvite').value);
$('salaCopiarResp').onclick=()=>SALA.resposta&&salaCopia(SALA.resposta);
$('salaPronto').onclick=()=>{SALA.pronto=!SALA.pronto;if(REDE.anfitriao)REDE.anfitriao.enviar({t:'pronto',pronto:SALA.pronto});$('salaPronto').textContent=SALA.pronto?'✓ Pronto (tocar para cancelar)':'Estou pronto'};
$('salaComecar').onclick=()=>{if($('salaComecar').disabled)return;if(S&&S.phase!=='over')$('salaOv').classList.remove('show');else salaComeca()};
