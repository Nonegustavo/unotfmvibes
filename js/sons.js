/* unotfm: sons sintetizados com parâmetros (campainha de balcão e cubo de gelo), usados pelo jogo (effects.js) e pela
   página de testes (sons-teste.html), que mostra a configuração para copiar. Cada som recebe o AudioContext, o destino,
   os parâmetros e o instante (em segundos a partir de agora) */

// campainha de balcão de hotel: um toque metálico com parciais de cúpula, cada uma em dois osciladores levemente
// desafinados (o "brilho" que oscila), e o clique do botão no começo
const SOM_SINETA={tom:1460,duracao:2.1,brilho:.2,batimento:0,clique:.5,volume:.95,variacao:2,intervalo:.17};
// cubo de gelo caindo num copo seco: uns quiques cada vez mais curtos e fracos, cada um um tinido de vidro
const SOM_GELO={tom:3200,quiques:1,intervalo:.11,queda:.6,tinido:.15,brilho:.5,volume:1};

// Carta da Misericórdia: um dos modelos (coro, harpa, sinos ou martelo), com o tom em semitons e a velocidade das notas
// (2 = notas duas vezes mais rápidas, mais juntas)
const SOM_MISERICORDIA={modelo:'sinos',tom:1,volume:1,velocidade:1};

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
// um som que cresce devagar e some devagar (coro)
function somSuave(ctx,dest,f,vol,dur,t,ataque,tipo='sine',cents=0){
  const o=ctx.createOscillator(),g=ctx.createGain();
  o.type=tipo;o.frequency.setValueAtTime(f,t);if(cents)o.detune.setValueAtTime(cents,t);
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,vol),t+ataque);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g);g.connect(dest);o.start(t);o.stop(t+dur+.05);
}
function misericordia(ctx,dest,p,at=0){
  p={...SOM_MISERICORDIA,...p};
  const t=ctx.currentTime+at,k=Math.pow(2,p.tom/12),v=p.volume,e=1/p.velocidade; // e: espaço entre as notas
  if(p.modelo==='coro'){
    // acorde maior que cresce e se abre, com vozes levemente desafinadas
    [[261.6,.05,0],[329.6,.04,.08],[392,.04,.16],[523.3,.035,.24],[659.3,.02,.32]].forEach(([f,vol,d])=>{
      somSuave(ctx,dest,f*k,vol*v,1.5,t+d*e,.35,'triangle',-6);somSuave(ctx,dest,f*k,vol*v*.8,1.5,t+d*e,.35,'sine',7)});
  }else if(p.modelo==='harpa'){
    // harpa descendo uma escala pentatônica, cada corda some rápido
    [1046.5,880,784,659.3,587.3,523.3,440,392].forEach((f,i)=>{somParcial(ctx,dest,f*k,.09*v,.7,t+i*.055*e,0,'triangle');somParcial(ctx,dest,f*k*2,.025*v,.35,t+i*.055*e)});
  }else if(p.modelo==='sinos'){
    // sinos de vento: toques agudos e suaves, espalhados
    [2093,2637,2349,3136,2794,3520].forEach((f,i)=>{const at2=t+(i*.09+Math.random()*.04)*e;somParcial(ctx,dest,f*k,.05*v,.9,at2);somParcial(ctx,dest,f*k*2.76,.012*v,.4,at2)});
  }else{
    // martelo (o som de antes): duas batidas graves
    [0,.28].forEach((d,i)=>{somEstalo(ctx,dest,300,(.6-i*.1)*v,.08,t+d*e,1,'lowpass');somParcial(ctx,dest,90*k,(.25-i*.05)*v,.18,t+d*e)});
  }
}
