/* unotfm: sons sintetizados com parâmetros (campainha de balcão e cubo de gelo), usados pelo jogo (effects.js) e pela
   página de testes (sons-teste.html), que mostra a configuração para copiar. Cada som recebe o AudioContext, o destino,
   os parâmetros e o instante (em segundos a partir de agora) */

// campainha de balcão de hotel: um toque metálico com parciais de cúpula, cada uma em dois osciladores levemente
// desafinados (o "brilho" que oscila), e o clique do botão no começo
const SOM_SINETA={tom:2720,duracao:1.6,brilho:1,batimento:0,clique:.75,volume:1.1,variacao:.5,intervalo:.2};
// cubo de gelo caindo num copo seco: uns quiques cada vez mais curtos e fracos, cada um um tinido de vidro
const SOM_GELO={tom:3200,quiques:1,intervalo:.11,queda:.6,tinido:.15,brilho:.5,volume:1};

// um oscilador com ataque quase instantâneo e decaimento exponencial
function somParcial(ctx,dest,f,vol,dur,t,cents=0,tipo='sine'){
  const o=ctx.createOscillator(),g=ctx.createGain();
  o.type=tipo;o.frequency.setValueAtTime(f,t);if(cents)o.detune.setValueAtTime(cents,t);
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,vol),t+.003);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g);g.connect(dest);o.start(t);o.stop(t+dur+.05);
}
// um estalo curto de ruído filtrado
function somEstalo(ctx,dest,f,vol,dur,t,q=1.5,filtro='bandpass'){
  const len=Math.max(1,Math.floor(ctx.sampleRate*dur)),buf=ctx.createBuffer(1,len,ctx.sampleRate),ch=buf.getChannelData(0);
  for(let i=0;i<len;i++)ch[i]=(Math.random()*2-1)*(1-i/len);
  const s=ctx.createBufferSource();s.buffer=buf;const fl=ctx.createBiquadFilter();fl.type=filtro;fl.frequency.value=f;fl.Q.value=q;
  const g=ctx.createGain();g.gain.value=vol;s.connect(fl);fl.connect(g);g.connect(dest);s.start(t);s.stop(t+dur+.02);
}
// toques: quantos toques (2 com a regra Duas!), cada um no mesmo tom
function campainha(ctx,dest,p,at=0,toques=1){
  p={...SOM_SINETA,...p};
  const r=(a,b)=>a+Math.random()*(b-a),varia=1+r(-p.variacao,p.variacao)/100,f=p.tom*varia;
  let t=ctx.currentTime+at;
  for(let k=0;k<toques;k++){
    const v=.16*p.volume*(k?r(.8,.92):1);
    // parciais de uma cúpula fina de metal (inarmônicas), as agudas somem antes
    [[1,1,1],[2.71,.5,.62],[5.15,.28,.36],[8.3,.14,.2]].forEach(([razao,forca,dura],i)=>{
      const vol=v*(i?forca*p.brilho*2:forca),d=p.duracao*dura;
      somParcial(ctx,dest,f*razao,vol*.55,d,t,-p.batimento/2);somParcial(ctx,dest,f*razao,vol*.55,d,t,p.batimento/2);
    });
    // o clique do botão: um estalo agudo e um toque surdo curtinho
    if(p.clique>0){somEstalo(ctx,dest,f*3.5,.5*p.clique*p.volume,.018,t,1.2);somParcial(ctx,dest,170,.12*p.clique*p.volume,.05,t,0,'triangle')}
    t+=p.intervalo*r(.92,1.08);
  }
}
function cuboGelo(ctx,dest,p,at=0){
  p={...SOM_GELO,...p};
  const r=(a,b)=>a+Math.random()*(b-a);
  let t=ctx.currentTime+at,gap=p.intervalo,forca=1;
  for(let k=0;k<p.quiques;k++){
    const f=p.tom*r(.96,1.04),v=.14*p.volume*forca;
    // tinido de vidro: parciais inarmônicas curtas
    [[1,1,1],[1.58,.6,.75],[2.37,.4,.55],[3.6,.22,.4]].forEach(([razao,fz,dura],i)=>somParcial(ctx,dest,f*razao,v*(i?fz*p.brilho*2:fz),p.tinido*dura*(1-k*.12),t));
    // o toque do gelo no vidro
    somEstalo(ctx,dest,5200,.35*v/.14,.008,t,1,'highpass');
    if(k===0)somParcial(ctx,dest,900,v*.5,.035,t,0,'triangle');
    t+=gap*r(.9,1.1);gap*=p.queda;forca*=p.queda*1.15;
  }
}
