/* unotfm: prova de conceito da rede local.
   Um aparelho cria a sala (anfitrião) e os outros entram lendo QR codes. A conexão é WebRTC direta pela Wi-Fi, sem
   servidor: a "proposta" do anfitrião e a "resposta" do convidado viajam nos QR codes, compactadas.
   A página registra tudo o que acontece (endereços, caminho da conexão, ping, quedas) para montar um relatório. */
'use strict';
const VERSAO='lan-1';
const $=id=>document.getElementById(id);
const T0=performance.now();
const seg=(a,b=performance.now())=>((b-a)/1000).toFixed(1);

/* ---------- registro de eventos (vai para o relatório) ---------- */
const EVENTOS=[];
function registrar(txt){
  EVENTOS.push(`${seg(T0)}s ${txt}`);if(EVENTOS.length>400)EVENTOS.shift();
  if($('relatorio').closest('details').open)$('relatorio').textContent=relatorio();
}
let avisoT=null;
function aviso(txt,ms=2600){const a=$('aviso');a.textContent=txt;a.hidden=false;clearTimeout(avisoT);avisoT=setTimeout(()=>a.hidden=true,ms)}
function ler(k){try{return localStorage.getItem(k)}catch(e){return null}}
function gravar(k,v){try{localStorage.setItem(k,v)}catch(e){}}

/* ---------- este aparelho ---------- */
const UA=navigator.userAgent;
const IOS=/iPhone|iPad|iPod/.test(UA)||(/Macintosh/.test(UA)&&navigator.maxTouchPoints>1);
function sistemaTxt(){
  const so=IOS?'iOS '+(((UA.match(/OS (\d+)[_.](\d+)/)||[]).slice(1).join('.'))||'?')
    :/Android/.test(UA)?'Android '+((UA.match(/Android ([\d.]+)/)||[])[1]||'?')
    :/Windows/.test(UA)?'Windows':/Mac OS X/.test(UA)?'macOS':/Linux/.test(UA)?'Linux':'?';
  const nav=/EdgA?\/|Edg\//.test(UA)?'Edge':/SamsungBrowser/.test(UA)?'Samsung Internet':/CriOS/.test(UA)?'Chrome':/FxiOS/.test(UA)?'Firefox'
    :/Firefox\//.test(UA)?'Firefox':/Chrome\//.test(UA)?'Chrome '+((UA.match(/Chrome\/(\d+)/)||[])[1]||''):/Safari\//.test(UA)?'Safari '+((UA.match(/Version\/([\d.]+)/)||[])[1]||''):'?';
  // no iPhone, todo navegador usa o motor do Safari
  return `${so} · ${nav.trim()}${IOS&&!/^Safari/.test(nav)?' (motor do Safari)':''}`;
}
const instalado=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
let LEITOR='jsQR';
let NOME=ler('unotfm-lan-nome')||((IOS?'iPhone':/Android/.test(UA)?'Android':'PC')+' '+Math.floor(10+Math.random()*90));
function mostrarAparelho(){
  $('infoSo').textContent=sistemaTxt();
  $('infoApp').textContent=instalado()?'sim':'não (aberto no navegador)';
  $('infoNet').textContent=navigator.onLine?'sim':'não';
  $('infoLeitor').textContent=LEITOR==='sistema'?'do sistema':'jsQR (biblioteca)';
}

/* ---------- Base45: texto que cabe no modo alfanumérico do QR code (o mais compacto) ---------- */
const B45='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
function b45enc(b){
  let s='';
  for(let i=0;i<b.length;i+=2){
    if(i+1<b.length){const n=b[i]*256+b[i+1];s+=B45[n%45]+B45[Math.floor(n/45)%45]+B45[Math.floor(n/2025)]}
    else{const n=b[i];s+=B45[n%45]+B45[Math.floor(n/45)]}
  }
  return s;
}
function b45dec(s){
  const v=[...s].map(ch=>{const k=B45.indexOf(ch);if(k<0)throw new Error('o código tem caracteres estranhos');return k});
  const out=[];
  for(let i=0;i<v.length;i+=3){
    if(i+2<v.length){const n=v[i]+v[i+1]*45+v[i+2]*2025;if(n>65535)throw new Error('código inválido');out.push(n>>8,n&255)}
    else if(i+1<v.length){const n=v[i]+v[i+1]*45;if(n>255)throw new Error('código inválido');out.push(n)}
    else throw new Error('código incompleto');
  }
  return out;
}
class Escrita{
  constructor(){this.b=[]}
  u8(n){this.b.push(n&255)}
  u16(n){this.u8(n>>8);this.u8(n)}
  bytes(a){for(const x of a)this.u8(x)}
  txt(s){const a=new TextEncoder().encode(s);if(a.length>255)throw new Error('campo grande demais');this.u8(a.length);this.bytes(a)}
}
class Leitura{
  constructor(b){this.b=b;this.i=0}
  u8(){if(this.i>=this.b.length)throw new Error('código incompleto');return this.b[this.i++]}
  u16(){return this.u8()*256+this.u8()}
  bytes(n){const a=this.b.slice(this.i,this.i+n);if(a.length<n)throw new Error('código incompleto');this.i+=n;return a}
  txt(){return new TextDecoder().decode(new Uint8Array(this.bytes(this.u8())))}
}

/* ---------- compactação da descrição da conexão (SDP) ----------
   Do texto da conexão (uns 1.000 caracteres), só vai no QR code o que importa: usuário e senha da conexão, impressão
   digital da criptografia, papel na criptografia e os endereços (UDP). O outro lado remonta um texto completo */
const SETUPS=['actpass','active','passive'],TIPOS=['host','srflx','prflx'];
const UUID=/^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.local$/i;
// tipo de endereço: 0 IPv4, 1 IPv6, 2 nome .local (o navegador esconde o IP), 3 outro nome
function tipoEnd(e){if(/^\d{1,3}(\.\d{1,3}){3}$/.test(e))return 0;if(UUID.test(e))return 2;if(e.includes(':'))return 1;return 3}
function ipv6Bytes(e){
  e=e.replace(/^\[|\]$/g,'').split('%')[0];
  const [a,b]=e.split('::'),pa=a?a.split(':'):[],pb=b===undefined?null:(b?b.split(':'):[]);
  const partes=pb===null?pa:[...pa,...Array(8-pa.length-pb.length).fill('0'),...pb];
  if(partes.length!==8)throw new Error('endereço IPv6 inesperado');
  const out=[];partes.forEach(h=>{const n=parseInt(h,16)||0;out.push(n>>8,n&255)});return out;
}
function ipv6Txt(b){const g=[];for(let i=0;i<16;i+=2)g.push(((b[i]<<8)|b[i+1]).toString(16));return g.join(':')}
function lerSdp(sdp){
  const g=re=>(sdp.match(re)||[])[1];
  const d={ufrag:g(/a=ice-ufrag:(\S+)/),pwd:g(/a=ice-pwd:(\S+)/),fp:g(/a=fingerprint:sha-256 ([0-9A-Fa-f:]+)/),setup:g(/a=setup:(\w+)/),
    mid:g(/a=mid:(\S+)/)||'0',sctp:+(g(/a=sctp-port:(\d+)/)||5000),cands:[],todos:[]};
  for(const m of sdp.matchAll(/a=candidate:\S+ (\d+) (\w+) \d+ (\S+) (\d+) typ (\w+)/g)){
    const c={comp:m[1],proto:m[2].toLowerCase(),end:m[3],porta:+m[4],tipo:m[5]};
    d.todos.push(c);
    if(c.comp==='1'&&c.proto==='udp'&&TIPOS.includes(c.tipo))d.cands.push(c);
  }
  return d;
}
function compactar(sdp,papel,sess){
  const d=lerSdp(sdp);
  if(!d.ufrag||!d.pwd||!d.fp||!SETUPS.includes(d.setup))throw new Error('a descrição da conexão veio incompleta');
  const fp=d.fp.split(':').map(h=>parseInt(h,16));if(fp.length!==32)throw new Error('impressão digital inesperada');
  // primeiro os endereços que mais funcionam numa rede local; no máximo 6, para o QR code continuar pequeno
  const ordem=c=>c.tipo!=='host'?3:tipoEnd(c.end)===1?2:0,vistos=new Set();
  const cands=d.cands.filter(c=>{const k=c.end+' '+c.porta;if(vistos.has(k))return false;vistos.add(k);return true}).sort((a,b)=>ordem(a)-ordem(b)).slice(0,6);
  const w=new Escrita();
  w.u8(1);w.u8(papel);w.u16(sess);w.u8(SETUPS.indexOf(d.setup));w.txt(d.mid);w.txt(d.ufrag);w.txt(d.pwd);w.bytes(fp);w.u16(d.sctp);w.u8(cands.length);
  for(const c of cands){
    const k=tipoEnd(c.end);w.u8(k<<4|TIPOS.indexOf(c.tipo));
    if(k===0)w.bytes(c.end.split('.').map(Number));
    else if(k===1)w.bytes(ipv6Bytes(c.end));
    else if(k===2)w.bytes(c.end.slice(0,36).replace(/-/g,'').match(/../g).map(h=>parseInt(h,16)));
    else w.txt(c.end);
    w.u16(c.porta);
  }
  return {texto:'UT1'+(papel?'R':'O')+b45enc(w.b),cands,todos:d.todos};
}
function descompactar(texto){
  const m=/^UT1([OR])([0-9A-Z $%*+\-./:]+)$/.exec(texto||'');
  if(!m)throw new Error('este código não é do teste de rede local do unotfm');
  const r=new Leitura(b45dec(m[2]));
  if(r.u8()!==1)throw new Error('o código é de outra versão do teste. Atualize a página nos dois aparelhos');
  const d={papel:r.u8(),sess:r.u16(),setup:SETUPS[r.u8()],mid:r.txt(),ufrag:r.txt(),pwd:r.txt(),fp:r.bytes(32),sctp:r.u16(),cands:[]};
  const n=r.u8();
  for(let i=0;i<n;i++){
    const x=r.u8(),k=x>>4;let end;
    if(k===0)end=r.bytes(4).join('.');
    else if(k===1)end=ipv6Txt(r.bytes(16));
    else if(k===2){const h=r.bytes(16).map(b=>b.toString(16).padStart(2,'0')).join('');end=`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}.local`}
    else end=r.txt();
    d.cands.push({end,porta:r.u16(),tipo:TIPOS[x&15]||'host',proto:'udp'});
  }
  if(!d.setup)throw new Error('código inválido');
  return d;
}
function montarSdp(d){
  const fp=d.fp.map(b=>b.toString(16).padStart(2,'0').toUpperCase()).join(':');
  const L=['v=0',`o=- ${Math.floor(Math.random()*1e15)} 2 IN IP4 127.0.0.1`,'s=-','t=0 0',`a=group:BUNDLE ${d.mid}`,'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel','c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${d.ufrag}`,`a=ice-pwd:${d.pwd}`,'a=ice-options:trickle',`a=fingerprint:sha-256 ${fp}`,`a=setup:${d.setup}`,
    `a=mid:${d.mid}`,`a=sctp-port:${d.sctp}`,'a=max-message-size:262144'];
  d.cands.forEach((c,i)=>{
    const pri=(c.tipo==='host'?126:100)*2**24+(65535-i)*2**8+255;
    L.push(`a=candidate:${i+1} 1 udp ${pri} ${c.end} ${c.porta} typ ${c.tipo}${c.tipo!=='host'?' raddr 0.0.0.0 rport 0':''} generation 0`);
  });
  return L.join('\r\n')+'\r\n';
}
// resumo dos endereços sem mostrar os números (vai para o relatório)
function resumoEnd(lista){
  const n={mdns:0,ipv4:0,ipv6:0,srflx:0,tcp:0};
  lista.forEach(x=>{if(x.proto==='tcp')n.tcp++;else if(x.tipo!=='host')n.srflx++;else{const k=tipoEnd(x.end);if(k===2)n.mdns++;else if(k===0)n.ipv4++;else if(k===1)n.ipv6++}});
  const nome={mdns:'nome .local',ipv4:'IPv4',ipv6:'IPv6',srflx:'externo (STUN)',tcp:'TCP'};
  return Object.entries(n).filter(([,v])=>v).map(([k,v])=>`${v} ${nome[k]}`).join(', ')||'nenhum';
}
function classeEnd(a){
  if(!a)return 'oculto';if(/\.local$/.test(a))return 'nome .local';
  if(/^\d+\.\d+\.\d+\.\d+$/.test(a))return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a)?'IPv4 privado':/^169\.254\./.test(a)?'IPv4 automático':'IPv4';
  if(a.includes(':'))return /^fe80/i.test(a)?'IPv6 local':'IPv6';
  return 'outro';
}

/* ---------- QR code ---------- */
function desenharQR(cv,texto){
  const qr=qrcode(0,'M');qr.addData(texto,'Alphanumeric');qr.make();
  const n=qr.getModuleCount(),mz=4,tot=n+mz*2;
  const css=Math.max(3,Math.floor(Math.min(320,innerWidth-80)/tot)),dpr=Math.min(3,devicePixelRatio||1),px=Math.round(css*dpr);
  cv.width=cv.height=px*tot;cv.style.width=cv.style.height=css*tot+'px';
  const g=cv.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,cv.width,cv.height);g.fillStyle='#000';
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(qr.isDark(r,c))g.fillRect((c+mz)*px,(r+mz)*px,px,px);
  return (n-17)/4;
}
// o código em texto vai entre colchetes: o Base45 pode terminar em espaço, que se perderia ao copiar e colar
const comColchetes=t=>`[${t}]`;
function lerCodigo(s){s=String(s||'');const m=/\[([^\]]+)\]/.exec(s);return m?m[1]:s.trim()}

/* ---------- câmera ---------- */
let CAMERA_OK=false;
async function lerQR(titulo){
  $('camTitulo').textContent=titulo;$('cam').hidden=false;
  const video=$('camVideo');let stream;
  try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false})}
  catch(e){$('cam').hidden=true;registrar(`câmera: ${e.name}`);aviso(e.name==='NotAllowedError'?'Sem permissão para usar a câmera. Use o código em texto.':'Não deu para abrir a câmera. Use o código em texto.',4000);return null}
  CAMERA_OK=true;video.srcObject=stream;
  try{await video.play()}catch(e){}
  let det=null;
  if(LEITOR==='sistema'){try{det=new BarcodeDetector({formats:['qr_code']})}catch(e){det=null}}
  const cv=document.createElement('canvas'),g=cv.getContext('2d',{willReadFrequently:true}),t0=performance.now();
  return new Promise(res=>{
    let fim=false;
    const parar=v=>{if(fim)return;fim=true;stream.getTracks().forEach(t=>t.stop());video.srcObject=null;$('cam').hidden=true;res(v)};
    $('camCancelar').onclick=()=>{registrar('leitura do QR cancelada');parar(null)};
    const passo=async()=>{
      if(fim)return;
      if(video.readyState>=2&&video.videoWidth){
        try{
          let txt=null;
          if(det){const r=await det.detect(video);if(r.length)txt=r[0].rawValue}
          else{
            const k=Math.min(1,800/Math.max(video.videoWidth,video.videoHeight));
            cv.width=Math.round(video.videoWidth*k);cv.height=Math.round(video.videoHeight*k);
            g.drawImage(video,0,0,cv.width,cv.height);
            const img=g.getImageData(0,0,cv.width,cv.height),r=jsQR(img.data,cv.width,cv.height,{inversionAttempts:'dontInvert'});
            if(r)txt=r.data;
          }
          if(txt&&txt.startsWith('UT1')){registrar(`QR lido em ${seg(t0)} s (${det?'leitor do sistema':'jsQR'})`);parar(txt);return}
          if(txt)$('camDica').textContent='Esse QR code não é do teste. Aponte para o QR code do outro aparelho.';
        }catch(e){if(det){registrar('leitor do sistema falhou, usando jsQR: '+e.message);det=null}}
      }
      setTimeout(passo,det?90:140);
    };
    passo();
  });
}
// pedir a câmera antes de criar o convite costuma fazer o navegador mostrar o endereço real do aparelho na rede
async function liberarCamera(){
  try{const s=await navigator.mediaDevices.getUserMedia({video:true,audio:false});s.getTracks().forEach(t=>t.stop());CAMERA_OK=true;registrar('câmera liberada antes do convite')}
  catch(e){registrar(`câmera recusada antes do convite (${e.name})`)}
}

/* ---------- conexões ---------- */
let PAPEL=null,SALA=[],pendente=null,seq=0,pingSeq=0;
const CONEXOES=[],ULT={};
const aberta=c=>c.dc&&c.dc.readyState==='open';
function criarPc(){return new RTCPeerConnection({iceServers:$('optStun').checked?[{urls:'stun:stun.l.google.com:19302'}]:[]})}
function esperarEnderecos(pc,ms=5000){
  return new Promise(res=>{
    if(pc.iceGatheringState==='complete')return res(true);
    const t=setTimeout(()=>res(false),ms);
    pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete'){clearTimeout(t);res(true)}});
  });
}
function novaConexao(pc,nome){
  const c={id:++seq,nome,pc,dc:null,pings:[],t:{}};
  CONEXOES.push(c);
  pc.addEventListener('iceconnectionstatechange',()=>{
    const s=pc.iceConnectionState;registrar(`${c.nome}: ICE ${s}`);
    if((s==='connected'||s==='completed')&&!c.t.con){c.t.con=performance.now();caminho(c)}
    if(s==='failed'||s==='disconnected')aviso(`${c.nome}: ${s==='failed'?'a conexão falhou':'a conexão caiu'}`);
    if(s==='failed')estado(PAPEL==='anfitriao'?'estadoConvite':'estadoConvidado',`${c.nome}: a conexão falhou. Copie o relatório e mande para o Claude.`,'erro');
    atualizar();
  });
  pc.addEventListener('connectionstatechange',()=>{registrar(`${c.nome}: conexão ${pc.connectionState}`);atualizar()});
  return c;
}
// por onde a conexão passou (tipo de endereço dos dois lados), sem mostrar os números
async function caminho(c){
  try{
    const st=await c.pc.getStats();let par=null;
    st.forEach(r=>{if(r.type==='transport'&&r.selectedCandidatePairId)par=st.get(r.selectedCandidatePairId)});
    if(!par)st.forEach(r=>{if(!par&&r.type==='candidate-pair'&&(r.selected||r.nominated)&&r.state==='succeeded')par=r});
    if(!par){registrar(`${c.nome}: caminho desconhecido`);return}
    const l=st.get(par.localCandidateId),rm=st.get(par.remoteCandidateId);
    const d=x=>x?`${x.candidateType}${x.candidateType==='host'?' ('+classeEnd(x.address||x.ip)+')':''} ${x.protocol||''}`.trim():'?';
    c.par=`este aparelho ${d(l)} ↔ outro ${d(rm)}`;registrar(`${c.nome}: caminho ${c.par}`);atualizar();
  }catch(e){registrar('não deu para ler as estatísticas: '+e.message)}
}
function ligarCanal(c,dc){
  c.dc=dc;
  dc.onopen=()=>{
    c.t.canal=performance.now();registrar(`${c.nome}: canal aberto`);
    enviar(c,{t:'ola',nome:NOME,versao:VERSAO,aparelho:sistemaTxt()});
    c.pingT=setInterval(()=>enviar(c,{t:'ping',id:++pingSeq,ts:performance.now()}),2000);
    $('conversa').hidden=false;manterTelaAcesa();atualizar();
  };
  dc.onclose=()=>{clearInterval(c.pingT);if(!c.t.canal)return;registrar(`${c.nome}: canal fechado`);msgSis(`${c.nome} saiu.`);if(PAPEL==='anfitriao')enviarLista();atualizar()};
  dc.onerror=e=>registrar(`${c.nome}: erro no canal (${(e.error&&e.error.message)||'sem detalhes'})`);
  dc.onmessage=e=>receber(c,e.data);
}
function enviar(c,obj){if(aberta(c))try{c.dc.send(JSON.stringify(obj))}catch(e){registrar(`${c.nome}: falha ao enviar (${e.message})`)}}
const limpa=(s,n)=>String(s==null?'':s).slice(0,n);
function receber(c,raw){
  let m;try{m=JSON.parse(raw)}catch(e){return}
  switch(m.t){
    case 'ola':
      c.nome=limpa(m.nome,16)||c.nome;c.versao=limpa(m.versao,20);c.aparelho=limpa(m.aparelho,80);
      registrar(`${c.nome} entrou (${c.aparelho}, versão ${c.versao})`);
      msgSis(`${c.nome} conectou.`);
      if(c.versao!==VERSAO)msgSis(`⚠️ ${c.nome} está com outra versão do teste (${c.versao}). Atualizem a página nos dois aparelhos.`);
      if(PAPEL==='anfitriao'){enviarLista();estado('estadoConvite',`✅ ${c.nome} entrou na sala!`,'ok');$('convite').hidden=true;rotuloConvidar()}
      else{estado('estadoConvidado','✅ Conectado ao anfitrião!','ok');$('passoResposta').hidden=true}
      atualizar();break;
    case 'ping':enviar(c,{t:'pong',id:m.id,ts:m.ts});break;
    case 'pong':c.pings.push(performance.now()-m.ts);if(c.pings.length>60)c.pings.shift();atualizar();break;
    case 'chat':{
      const de=limpa(m.de,16)||c.nome,txt=limpa(m.txt,200);msg(de,txt);
      if(PAPEL==='anfitriao')CONEXOES.forEach(o=>{if(o!==c)enviar(o,{t:'chat',de,txt})});
      break}
    case 'lista':SALA=Array.isArray(m.nomes)?m.nomes.slice(0,8).map(x=>limpa(x,16)):[];atualizar();break;
    case 'rajada':receberRajada(c,m);break;
    case 'rajadaRes':
      c.rajada=`${m.recebidas}/${m.total} em ${m.ms} ms, ${m.fora} fora de ordem`;
      msgSis(`Rajada para ${c.nome}: ${c.rajada}.`);registrar(`rajada para ${c.nome}: ${c.rajada}`);atualizar();break;
  }
}
function enviarLista(){const nomes=[NOME,...CONEXOES.filter(aberta).map(c=>c.nome)];CONEXOES.forEach(c=>enviar(c,{t:'lista',nomes}))}

// mostra o estado de um passo; os erros também vão para o relatório
function estado(id,txt,tipo){const e=$(id);e.textContent=txt;e.className='estado'+(tipo?' '+tipo:'');if(tipo==='erro')registrar('erro: '+txt)}

/* ---------- anfitrião ---------- */
function criarSala(){
  PAPEL='anfitriao';registrar('papel: anfitrião');
  $('inicio').hidden=true;$('anfitriao').hidden=false;
}
async function convidar(){
  const b=$('btnConvidar');b.disabled=true;estado('estadoConvite','Preparando o convite…');$('convite').hidden=false;
  // o convite anterior some na hora, para ninguém ler um QR code velho
  $('txtOferta').value='';$('txtResposta').value='';$('qrOfertaInfo').textContent='';$('qrOferta').width=$('qrOferta').height=0;
  try{
    if(pendente){pendente.c.pc.close();CONEXOES.splice(CONEXOES.indexOf(pendente.c),1);pendente=null}
    if($('optCamera').checked&&!CAMERA_OK)await liberarCamera();
    const pc=criarPc(),c=novaConexao(pc,`Convidado ${CONEXOES.length+1}`);
    ligarCanal(c,pc.createDataChannel('jogo',{ordered:true}));
    const sess=Math.floor(Math.random()*65536),t0=performance.now();
    await pc.setLocalDescription(await pc.createOffer());
    const completo=await esperarEnderecos(pc);
    const z=compactar(pc.localDescription.sdp,0,sess);
    ULT.enderecos=`convite: ${resumoEnd(z.todos)}, no QR ${z.cands.length} (${completo?'busca completa':'busca cortada em 5 s'} em ${seg(t0)} s; câmera liberada antes: ${CAMERA_OK?'sim':'não'})`;
    registrar(ULT.enderecos);
    pendente={c,sess};
    const v=desenharQR($('qrOferta'),z.texto);ULT.qr=`convite com ${z.texto.length} caracteres, QR versão ${v}`;
    $('qrOfertaInfo').textContent=`${z.texto.length} caracteres · QR versão ${v}`;$('txtOferta').value=comColchetes(z.texto);
    if(!z.cands.length)estado('estadoConvite','Nenhum endereço de rede encontrado. O aparelho está conectado à Wi-Fi?','erro');
    else estado('estadoConvite','Esperando o convidado…');
    atualizar();
  }catch(e){estado('estadoConvite','Não deu para criar o convite: '+e.message,'erro')}
  b.disabled=false;rotuloConvidar();
}
async function aplicarResposta(texto){
  const E='estadoConvite';
  if(!pendente){estado(E,'Toque em "Convidar alguém" primeiro.','erro');return}
  let d;
  try{d=descompactar(texto)}catch(e){estado(E,e.message,'erro');return}
  if(d.papel!==1){estado(E,'Esse é um código de convite, não de resposta.','erro');return}
  if(d.sess!==pendente.sess){estado(E,'Essa resposta é de outro convite. Peça para o convidado ler o QR code que está na tela agora.','erro');return}
  const c=pendente.c;pendente=null;
  try{
    c.t.resp=performance.now();
    await c.pc.setRemoteDescription({type:'answer',sdp:montarSdp(d)});
    registrar(`${c.nome}: resposta aplicada (endereços do outro lado: ${resumoEnd(d.cands)})`);
    estado(E,'Conectando…');
    setTimeout(()=>{if(!c.t.canal&&c.pc.connectionState!=='closed')estado(E,`${c.nome} não conectou em 15 s (ICE ${c.pc.iceConnectionState}). Copie o relatório e mande para o Claude.`,'erro')},15000);
  }catch(e){estado(E,'Não deu para usar a resposta: '+e.message,'erro')}
  atualizar();
}

// sem ninguém conectado, tocar de novo troca o convite pendente; depois, convida mais alguém
function rotuloConvidar(){$('btnConvidar').textContent=CONEXOES.some(aberta)?'➕ Convidar outra pessoa':pendente?'🔄 Gerar outro convite':'➕ Convidar alguém'}

/* ---------- convidado ---------- */
function entrarSala(){
  PAPEL='convidado';registrar('papel: convidado');
  $('inicio').hidden=true;$('convidado').hidden=false;
}
async function aplicarOferta(texto){
  const E='estadoConvidado';
  let d;
  try{d=descompactar(texto)}catch(e){estado(E,e.message,'erro');return}
  if(d.papel!==0){estado(E,'Esse é um código de resposta. Leia o QR code de convite do anfitrião.','erro');return}
  CONEXOES.splice(0).forEach(c=>{clearInterval(c.pingT);c.pc.close()});
  estado(E,'Preparando a resposta…');$('txtRespostaGerada').value='';
  try{
    const pc=criarPc(),c=novaConexao(pc,'Anfitrião');
    pc.ondatachannel=e=>ligarCanal(c,e.channel);
    await pc.setRemoteDescription({type:'offer',sdp:montarSdp(d)});
    registrar(`convite lido (endereços do anfitrião: ${resumoEnd(d.cands)})`);
    const t0=performance.now();
    await pc.setLocalDescription(await pc.createAnswer());
    const completo=await esperarEnderecos(pc);
    const z=compactar(pc.localDescription.sdp,1,d.sess);
    ULT.enderecos=`resposta: ${resumoEnd(z.todos)}, no QR ${z.cands.length} (${completo?'busca completa':'busca cortada em 5 s'} em ${seg(t0)} s; câmera liberada: ${CAMERA_OK?'sim':'não'})`;
    registrar(ULT.enderecos);
    const v=desenharQR($('qrResposta'),z.texto);ULT.qr=`resposta com ${z.texto.length} caracteres, QR versão ${v}`;
    $('qrRespostaInfo').textContent=`${z.texto.length} caracteres · QR versão ${v}`;$('txtRespostaGerada').value=comColchetes(z.texto);
    $('passoLer').hidden=true;$('passoResposta').hidden=false;
    estado(E,'Esperando o anfitrião ler a resposta…');
    atualizar();
  }catch(e){estado(E,'Não deu para usar o convite: '+e.message,'erro')}
}

/* ---------- conversa e rajada ---------- */
function linha(cls,partes){
  const p=document.createElement('p');p.className=cls;
  partes.forEach(([c,t])=>{const s=document.createElement('span');if(c)s.className=c;s.textContent=t;p.appendChild(s)});
  const box=$('msgs');box.appendChild(p);box.scrollTop=box.scrollHeight;
}
const msg=(de,txt)=>linha('',[['de',de+': '],['',txt]]);
const msgSis=txt=>linha('sis',[['',txt]]);
function enviarMsg(e){
  e.preventDefault();const txt=$('txtMsg').value.trim().slice(0,200);if(!txt)return;
  $('txtMsg').value='';msg(NOME,txt);
  CONEXOES.forEach(c=>enviar(c,{t:'chat',de:NOME,txt}));
}
function rajada(){
  const alvo=CONEXOES.filter(aberta);if(!alvo.length){aviso('Ninguém conectado.');return}
  const N=500,carga='x'.repeat(180);
  alvo.forEach(c=>{for(let i=0;i<N;i++)enviar(c,{t:'rajada',i,n:N,carga})});
  msgSis(`Enviando ${N} mensagens para ${alvo.map(c=>c.nome).join(', ')}…`);registrar(`rajada enviada (${N} mensagens)`);
}
function receberRajada(c,m){
  if(m.i===0||!c.rec)c.rec={n:m.n,cont:0,fora:0,ult:-1,t0:performance.now()};
  const r=c.rec;r.cont++;if(m.i!==r.ult+1)r.fora++;r.ult=m.i;
  if(m.i===m.n-1){enviar(c,{t:'rajadaRes',recebidas:r.cont,total:r.n,fora:r.fora,ms:Math.round(performance.now()-r.t0)});c.rec=null}
}

/* ---------- listas na tela ---------- */
function estadoTxt(c){
  if(aberta(c))return 'conectado';
  const s=c.pc.connectionState||c.pc.iceConnectionState;
  if(c.dc&&c.dc.readyState==='closed'&&c.t.canal)return 'saiu';
  return {new:PAPEL==='anfitriao'?'esperando a resposta':'esperando o anfitrião',connecting:'conectando',checking:'conectando',connected:'conectado',completed:'conectado',
    disconnected:'caiu',failed:'falhou',closed:'fechado'}[s]||s;
}
function pingTxt(c){
  if(!c.pings.length)return '';
  const p=[...c.pings].sort((a,b)=>a-b),med=p[Math.floor(p.length/2)];
  return `ping ${Math.round(med)} ms (mín. ${Math.round(p[0])}, máx. ${Math.round(p[p.length-1])}, ${p.length} medidas)`;
}
function itemLista(ul,nome,st,cls){
  const li=document.createElement('li'),a=document.createElement('span'),b=document.createElement('span');
  a.textContent=nome;b.className='st '+(cls||'');b.textContent=st;li.append(a,b);ul.appendChild(li);
}
function atualizar(){
  const ul=$('listaConvidados');ul.innerHTML='';
  const vis=CONEXOES.filter(c=>c.t.resp||c.t.canal||c.dc&&c.dc.readyState!=='connecting'||c.pc.iceConnectionState!=='new');
  if(!vis.length){const li=document.createElement('li');li.className='vazio';li.textContent='Ninguém entrou ainda.';ul.appendChild(li)}
  vis.forEach(c=>{const s=estadoTxt(c);itemLista(ul,c.nome,[s,pingTxt(c)].filter(Boolean).join(' · '),s==='conectado'?'ok':/caiu|falhou|saiu/.test(s)?'erro':'')});
  const ul2=$('listaConexoes');ul2.innerHTML='';
  if(PAPEL==='convidado'&&SALA.length)SALA.forEach(n=>itemLista(ul2,n===NOME?n+' (você)':n,'',''));
  else{itemLista(ul2,NOME+' (você)',PAPEL==='anfitriao'?'anfitrião':'','');CONEXOES.filter(aberta).forEach(c=>itemLista(ul2,c.nome,pingTxt(c),'ok'))}
  if($('relatorio').closest('details').open)$('relatorio').textContent=relatorio();
}

/* ---------- tela acesa e eventos da página ---------- */
let TELA=null;
async function manterTelaAcesa(){
  if(TELA)return;
  if(!('wakeLock' in navigator)){if(!ULT.tela){ULT.tela='não suportado';registrar('manter a tela acesa: não suportado neste navegador')}return}
  try{TELA=await navigator.wakeLock.request('screen');ULT.tela='funciona';registrar('manter a tela acesa: ligado');TELA.addEventListener('release',()=>{TELA=null;registrar('manter a tela acesa: liberado')})}
  catch(e){ULT.tela='falhou';registrar(`manter a tela acesa: falhou (${e.name})`)}
}
document.addEventListener('visibilitychange',()=>{registrar(document.hidden?'página escondida (app em segundo plano ou tela bloqueada)':'página visível de novo');if(!document.hidden&&CONEXOES.some(aberta))manterTelaAcesa()});
addEventListener('online',()=>{registrar('internet: voltou');mostrarAparelho()});
addEventListener('offline',()=>{registrar('internet: caiu');mostrarAparelho()});
addEventListener('pagehide',()=>registrar('página fechando'));

/* ---------- relatório ---------- */
function relatorio(){
  const L=[
    `Teste de rede local do unotfm (${VERSAO})`,
    `Aparelho: ${sistemaTxt()}`,
    `App instalado: ${instalado()?'sim':'não'} · Internet: ${navigator.onLine?'sim':'não'}`,
    `Papel: ${PAPEL==='anfitriao'?'anfitrião':PAPEL==='convidado'?'convidado':'nenhum'} · Leitor de QR: ${LEITOR==='sistema'?'do sistema':'jsQR'}`,
    `Opções: câmera antes do convite ${$('optCamera').checked?'sim':'não'} · STUN ${$('optStun').checked?'sim':'não'} · manter a tela acesa: ${ULT.tela||'ainda não testado'}`,
  ];
  if(ULT.enderecos)L.push(`Endereços: ${ULT.enderecos}`);
  if(ULT.qr)L.push(`QR: ${ULT.qr}`);
  L.push(`Conexões: ${CONEXOES.length||'nenhuma'}`);
  CONEXOES.forEach(c=>{
    const p=[estadoTxt(c)];
    if(c.t.con&&c.t.resp)p.push(`conectou ${seg(c.t.resp,c.t.con)} s depois de ler a resposta`);
    if(c.par)p.push(c.par);
    if(c.pings.length)p.push(pingTxt(c));
    if(c.rajada)p.push(`rajada ${c.rajada}`);
    if(c.aparelho)p.push(`aparelho ${c.aparelho}`);
    if(c.versao&&c.versao!==VERSAO)p.push(`OUTRA VERSÃO (${c.versao})`);
    L.push(`• ${c.nome}: ${p.join('; ')}`);
  });
  L.push('','Eventos:',...EVENTOS.slice(-80));
  return L.join('\n');
}
async function copiarTexto(t){
  try{await navigator.clipboard.writeText(t);return true}
  catch(e){const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();let ok=false;try{ok=document.execCommand('copy')}catch(x){}a.remove();return ok}
}

/* ---------- início ---------- */
function iniciar(){
  mostrarAparelho();
  $('nome').value=NOME;
  $('nome').addEventListener('change',()=>{NOME=$('nome').value.trim().slice(0,16)||NOME;$('nome').value=NOME;gravar('unotfm-lan-nome',NOME)});
  registrar(`página aberta: ${sistemaTxt()}; app instalado: ${instalado()?'sim':'não'}; internet: ${navigator.onLine?'sim':'não'}`);
  if(!window.RTCPeerConnection){
    $('btnCriar').disabled=$('btnEntrar').disabled=true;
    $('inicio').insertAdjacentHTML('beforeend','<p class="estado erro">Este navegador não tem WebRTC, que é necessário para o teste.</p>');
    registrar('sem WebRTC (RTCPeerConnection) neste navegador');
  }
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)registrar('sem acesso à câmera neste navegador (getUserMedia)');
  if('BarcodeDetector' in window)BarcodeDetector.getSupportedFormats().then(f=>{if(f.includes('qr_code'))LEITOR='sistema';mostrarAparelho()}).catch(()=>{});
  $('btnCriar').onclick=criarSala;
  $('btnEntrar').onclick=entrarSala;
  $('btnConvidar').onclick=convidar;
  $('btnLerResposta').onclick=async()=>{const t=await lerQR('Leia a resposta do convidado');if(t)aplicarResposta(t)};
  $('btnColarResposta').onclick=()=>aplicarResposta(lerCodigo($('txtResposta').value));
  $('btnLerOferta').onclick=async()=>{const t=await lerQR('Leia o QR code do anfitrião');if(t)aplicarOferta(t)};
  $('btnColarOferta').onclick=()=>aplicarOferta(lerCodigo($('txtOfertaColada').value));
  $('formMsg').addEventListener('submit',enviarMsg);
  $('btnRajada').onclick=rajada;
  document.querySelectorAll('[data-copiar]').forEach(b=>b.onclick=async()=>{aviso(await copiarTexto($(b.dataset.copiar).value)?'Código copiado.':'Não deu para copiar. Selecione o texto e copie.')});
  $('btnCopiarRel').onclick=async()=>{const t=relatorio();$('relatorio').textContent=t;aviso(await copiarTexto(t)?'Relatório copiado. Cole na conversa com o Claude.':'Não deu para copiar. Abra "Ver o relatório" e copie.',3500)};
  if(navigator.share){$('btnCompartilharRel').hidden=false;$('btnCompartilharRel').onclick=()=>navigator.share({text:relatorio()}).catch(()=>{})}
  $('relatorio').closest('details').addEventListener('toggle',e=>{if(e.target.open)$('relatorio').textContent=relatorio()});
  if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)&&!/claude\.ai|claudeusercontent/.test(location.host))navigator.serviceWorker.register('sw.js').catch(()=>{});
}
iniciar();
