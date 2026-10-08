/* unotfm: teste de sons. Os controles mudam os parâmetros de campainha() e cuboGelo() (js/sons.js, os mesmos do jogo) */
let CTX=null,SAIDA=null;
function contexto(){
  if(!CTX){CTX=new (window.AudioContext||window.webkitAudioContext)();SAIDA=CTX.createGain();SAIDA.gain.value=.5;SAIDA.connect(CTX.destination)}
  if(CTX.state==='suspended')CTX.resume();
  return CTX;
}
const SONS={
  sineta:{bloco:'blocoSineta',padrao:SOM_SINETA,toca:(p,n)=>campainha(contexto(),SAIDA,p,0,n),
    controles:[
      ['tom','Tom',1200,3600,10,'Hz','mais alto deixa a campainha mais aguda'],
      ['duracao','Duração',.3,3,.05,'s','quanto tempo o som fica ressoando'],
      ['brilho','Brilho',0,1,.05,'','força dos sons agudos do metal'],
      ['batimento','Ondulação',0,25,1,'cents','o "tremor" do metal ressoando; 0 deixa o som liso'],
      ['clique','Clique do botão',0,1,.05,'','o estalo de quando a mão bate no botão'],
      ['variacao','Variação do tom',0,8,.5,'%','quanto o tom muda a cada toque, para não cansar'],
      ['intervalo','Intervalo (Duas!)',.1,.35,.01,'s','tempo entre os dois toques da regra Duas!'],
      ['volume','Volume',.2,2,.05,'',''],
    ],
    modelos:{'Padrão':{},'Hotel clássico':{tom:2600,duracao:2.2,brilho:.6,batimento:8,clique:.6},'Agudo e curto':{tom:3200,duracao:.9,brilho:.4,batimento:4,clique:.4},
      'Grave e longo':{tom:1500,duracao:2.6,brilho:.55,batimento:10,clique:.5},'Liso, sem clique':{batimento:0,clique:0}}},
  gelo:{bloco:'blocoGelo',padrao:SOM_GELO,toca:p=>cuboGelo(contexto(),SAIDA,p),
    controles:[
      ['tom','Tom',1500,6000,50,'Hz','copo fino é mais agudo, copo grosso mais grave'],
      ['quiques','Quiques',1,6,1,'','quantas vezes o gelo bate no copo'],
      ['intervalo','Primeiro intervalo',.04,.25,.005,'s','tempo entre o primeiro e o segundo toque'],
      ['queda','Encurtamento',.3,.9,.05,'','quanto cada quique fica mais curto e fraco que o anterior'],
      ['tinido','Tinido',.03,.4,.01,'s','quanto cada toque no vidro ressoa'],
      ['brilho','Brilho',0,1,.05,'','força dos sons agudos do vidro'],
      ['volume','Volume',.2,2,.05,'',''],
    ],
    modelos:{'Padrão':{},'Copo fino':{tom:4200,quiques:4,intervalo:.09,queda:.55,tinido:.08,brilho:.7},'Copo grosso':{tom:2200,quiques:3,intervalo:.12,queda:.6,tinido:.16,brilho:.35},
      'Um toque só':{quiques:1,tinido:.15}}},
};
const casas=(passo)=>{const s=String(passo);return s.includes('.')?s.split('.')[1].length:0};
for(const [nome,som] of Object.entries(SONS)){
  const bloco=document.getElementById(som.bloco),chave='unotfm-sons-'+nome;
  let atual={...som.padrao};
  try{Object.assign(atual,JSON.parse(localStorage.getItem(chave)||'{}'))}catch(e){}
  const box=bloco.querySelector('[data-controles]');
  box.innerHTML=som.controles.map(([k,rotulo,min,max,passo,un,dica])=>`<div class="s-ctl"><label for="${nome}-${k}">${rotulo}</label><output id="${nome}-${k}-v"></output><input type="range" id="${nome}-${k}" data-k="${k}" min="${min}" max="${max}" step="${passo}">${dica?`<small>${dica}</small>`:''}</div>`).join('');
  const mostra=()=>{
    som.controles.forEach(([k,,, ,passo,un])=>{const i=document.getElementById(`${nome}-${k}`);i.value=atual[k];document.getElementById(`${nome}-${k}-v`).textContent=(+atual[k]).toFixed(casas(passo))+(un?' '+un:'')});
    const limpo=Object.fromEntries(som.controles.map(([k,,,,passo])=>[k,+(+atual[k]).toFixed(casas(passo))]));
    bloco.querySelector('[data-cfg]').value=`${nome==='sineta'?'Campainha':'Gelo'}: ${JSON.stringify(limpo)}`;
    try{localStorage.setItem(chave,JSON.stringify(limpo))}catch(e){}
  };
  box.addEventListener('input',e=>{const k=e.target.dataset.k;if(!k)return;atual[k]=+e.target.value;mostra()});
  box.addEventListener('change',()=>som.toca(atual,1));
  bloco.querySelector('[data-modelos]').innerHTML=Object.keys(som.modelos).map(m=>`<button type="button" data-m="${m}">${m}</button>`).join('');
  bloco.querySelector('[data-modelos]').addEventListener('click',e=>{const m=e.target.dataset.m;if(!m)return;atual={...som.padrao,...som.modelos[m]};mostra();som.toca(atual,1)});
  bloco.querySelectorAll('[data-tocar]').forEach(b=>b.addEventListener('click',()=>som.toca(atual,+b.dataset.tocar)));
  bloco.querySelector('[data-copiar]').addEventListener('click',async e=>{
    const t=bloco.querySelector('[data-cfg]');
    try{await navigator.clipboard.writeText(t.value)}catch(err){t.select();try{document.execCommand('copy')}catch(e2){}}
    e.target.textContent='Copiado!';setTimeout(()=>e.target.textContent='Copiar configuração',1500);
  });
  mostra();
}
