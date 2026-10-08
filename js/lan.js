/* unotfm: conexão direta entre aparelhos pela rede local (WebRTC), sem servidor. A "proposta" do anfitrião e a
   "resposta" do convidado viajam em QR codes, compactadas (só o essencial da descrição da conexão, em Base45, que cabe
   no modo mais compacto do QR code). Usado pelo jogo (js/rede.js) e pela página de teste (lan-teste.html).
   Precisa de qrcode-generator (js/vendor/qrcode.js) para desenhar os QR codes */
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
  if(!m)throw new Error('este código não é de uma sala do unotfm');
  const r=new Leitura(b45dec(m[2]));
  if(r.u8()!==1)throw new Error('o código é de outra versão do jogo. Atualize o jogo nos dois aparelhos');
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

function esperarEnderecos(pc,ms=5000){
  return new Promise(res=>{
    if(pc.iceGatheringState==='complete')return res(true);
    const t=setTimeout(()=>res(false),ms);
    pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete'){clearTimeout(t);res(true)}});
  });
}

// conexão sem servidor STUN (a rede local não precisa; stun liga um, só para o teste)
const lanPc=stun=>new RTCPeerConnection({iceServers:stun?[{urls:'stun:stun.l.google.com:19302'}]:[]});
