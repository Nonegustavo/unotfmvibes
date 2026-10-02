/* unotfm solo: efeitos 3D (three.js) e sons sintetizados */
/* ---------- 3D effects (three.js, hybrid layer) ---------- */
const FX3D=(()=>{
  let ok=false,failed=false,renderer,scene,camera,W=0,H=0,visH=1,systems=[],wsys=null,wkind=null,raf=0,last=0;
  const T=()=>window.THREE;
  const on=()=>!!T()&&CFG.fx3d!==false&&!RM&&!failed;
  const css=v=>{const m=/var\((--[\w-]+)\)/.exec(v||'');return m?getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim():v};
  function init(){
    if(ok)return true;if(!on())return false;
    try{
      const THREE=T();
      renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
      renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));renderer.setClearColor(0x000000,0);
      const c=renderer.domElement;c.id='fx3d';document.body.appendChild(c);
      scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(35,1,.1,100);camera.position.set(0,0,20);
      scene.add(new THREE.AmbientLight(0xffffff,.85));const dl=new THREE.DirectionalLight(0xffffff,.55);dl.position.set(4,6,12);scene.add(dl);
      ok=true;resize();addEventListener('resize',resize);document.addEventListener('fullscreenchange',()=>setTimeout(resize,60));document.documentElement.classList.add('fx3d-on');
      return true;
    }catch(e){failed=true;return false}
  }
  function resize(){
    if(!ok)return;W=innerWidth;H=innerHeight;
    const gl=renderer.getContext(),mx=Math.min(4096,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)||4096);
    let pr=Math.min(2,window.devicePixelRatio||1,mx/W,mx/H);
    renderer.setPixelRatio(pr);renderer.setSize(W,H);
    if(gl.drawingBufferWidth<Math.floor(W*pr)-2||gl.drawingBufferHeight<Math.floor(H*pr)-2){pr=Math.min(gl.drawingBufferWidth/W,gl.drawingBufferHeight/H);renderer.setPixelRatio(pr);renderer.setSize(W,H)}
    camera.aspect=W/H;camera.updateProjectionMatrix();
    visH=2*Math.tan(17.5*Math.PI/180)*20;
    if(wkind){const k=wkind;clearWeather(true);setWeather(k,true)}
  }
  const wx=x=>(x-W/2)/H*visH,wy=y=>-(y-H/2)/H*visH,ws=p=>p/H*visH;
  function loop(t){
    const dt=Math.min(.05,Math.max(0,(t-last)/1000));last=t;
    systems=systems.filter(s=>s.update(dt)!==false);if(wsys)wsys.update(dt);
    dying=dying.filter(d=>{d.alpha-=dt*.9;d.mats.forEach(m=>m.opacity=m.userData.base*Math.max(0,d.alpha));if(d.alpha<=0){d.dispose();return false}return true});
    renderer.render(scene,camera);
    if(systems.length||wsys||dying.length)raf=requestAnimationFrame(loop);else{raf=0;renderer.clear()}
  }
  function run(){if(!raf){last=performance.now();raf=requestAnimationFrame(loop)}}
  function add(s){systems.push(s);run()}
  const tex={};
  function canvasTex(key,size,draw){if(tex[key])return tex[key];const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d'),size);return tex[key]=new (T().CanvasTexture)(c)}
  const dotTex=()=>canvasTex('dot',64,(g,s)=>{const r=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.35,'rgba(255,255,255,.85)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,s,s)});
  const smokeTex=()=>canvasTex('smoke',128,(g,s)=>{for(let i=0;i<7;i++){const x=s*(.3+Math.random()*.4),y=s*(.3+Math.random()*.4),rr=s*(.18+Math.random()*.18);const r=g.createRadialGradient(x,y,0,x,y,rr);r.addColorStop(0,'rgba(255,255,255,.55)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,s,s)}});
  const rayTex=()=>canvasTex('ray',256,(g,s)=>{g.translate(s/2,s/2);for(let i=0;i<14;i++){g.rotate(Math.PI*2/14);const r=g.createLinearGradient(0,0,s/2,0);r.addColorStop(0,'rgba(255,230,150,.9)');r.addColorStop(1,'rgba(255,230,150,0)');g.fillStyle=r;g.beginPath();g.moveTo(0,0);g.lineTo(s/2,-s*.035);g.lineTo(s/2,s*.035);g.closePath();g.fill()}const c=g.createRadialGradient(0,0,0,0,0,s*.18);c.addColorStop(0,'rgba(255,240,180,1)');c.addColorStop(1,'rgba(255,220,120,0)');g.fillStyle=c;g.beginPath();g.arc(0,0,s*.18,0,Math.PI*2);g.fill()});
  function faceTex(n){
    return canvasTex('die'+n,128,(g,s)=>{
      g.fillStyle='#ffffff';g.fillRect(0,0,s,s);
      g.strokeStyle=css('var(--accent)')||'#6a47cf';g.lineWidth=10;g.strokeRect(5,5,s-10,s-10);
      const P={1:[[.5,.5]],2:[[.28,.28],[.72,.72]],3:[[.26,.26],[.5,.5],[.74,.74]],4:[[.28,.28],[.72,.28],[.28,.72],[.72,.72]],5:[[.26,.26],[.74,.26],[.5,.5],[.26,.74],[.74,.74]],6:[[.28,.24],[.72,.24],[.28,.5],[.72,.5],[.28,.76],[.72,.76]]}[n];
      g.fillStyle=n===1?'#e0433a':'#241c3a';P.forEach(([x,y])=>{g.beginPath();g.arc(x*s,y*s,s*.09,0,Math.PI*2);g.fill()});
    });
  }
  const center=r=>({x:wx(r.left+r.width/2),y:wy(r.top+r.height/2)});
  const arenaRect=()=>document.querySelector('.arena').getBoundingClientRect();

  /* generic particle burst */
  function burst(o){
    if(!init())return;const THREE=T();const n=o.count||40;
    const pos=new Float32Array(n*3),col=new Float32Array(n*3),vel=[];
    const cols=(o.colors||['#ffffff']).map(c=>new THREE.Color(css(c)));
    for(let i=0;i<n;i++){
      let x=o.x,y=o.y;
      if(o.ring){const a=Math.random()*Math.PI*2;x+=Math.cos(a)*o.ring;y+=Math.sin(a)*o.ring}
      x+=(Math.random()-.5)*(o.jx||0);y+=(Math.random()-.5)*(o.jy||0);
      pos[i*3]=x;pos[i*3+1]=y;pos[i*3+2]=0;
      const a=(o.dir??Math.PI/2)+(Math.random()-.5)*(o.spread??Math.PI*2);
      const sp=o.speed[0]+Math.random()*(o.speed[1]-o.speed[0]);
      vel.push([Math.cos(a)*sp,Math.sin(a)*sp]);
      const c=cols[i%cols.length];col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));
    const size=o.size||.3;
    const mat=new THREE.PointsMaterial({size,map:o.tex||dotTex(),vertexColors:true,transparent:true,depthWrite:false,blending:o.add?THREE.AdditiveBlending:THREE.NormalBlending,opacity:o.opacity??1});
    const pts=new THREE.Points(geo,mat);pts.frustumCulled=false;scene.add(pts);
    let age=0;const life=o.life||1.2,g=o.gravity??-3,drag=o.drag??.98,op=o.opacity??1;
    add({update(dt){
      age+=dt;const a=geo.attributes.position.array;
      for(let i=0;i<n;i++){vel[i][1]+=g*dt;vel[i][0]*=drag;vel[i][1]*=drag;a[i*3]+=vel[i][0]*dt;a[i*3+1]+=vel[i][1]*dt}
      geo.attributes.position.needsUpdate=true;
      mat.opacity=op*Math.max(0,1-age/life);if(o.grow)mat.size=size*(1+age*o.grow);
      if(age>=life){scene.remove(pts);geo.dispose();mat.dispose();return false}
    }});
  }

  /* dice */
  function easeBounce(t){const n=7.5625,d=2.75;if(t<1/d)return n*t*t;if(t<2/d)return n*(t-=1.5/d)*t+.75;if(t<2.5/d)return n*(t-=2.25/d)*t+.9375;return n*(t-=2.625/d)*t+.984375}
  function rollDie(n,hold=1.6){
    if(!init())return false;const THREE=T();const r=arenaRect();
    const s=ws(Math.min(r.width,r.height)*.34);
    const order=[3,4,2,5,1,6];
    const mats=order.map(v=>new THREE.MeshStandardMaterial({map:faceTex(v),roughness:.35,metalness:0,transparent:true}));
    const geo=new THREE.BoxGeometry(s,s,s);const m=new THREE.Mesh(geo,mats);scene.add(m);
    const E={1:[0,0,0],6:[0,Math.PI,0],3:[0,-Math.PI/2,0],4:[0,Math.PI/2,0],2:[Math.PI/2,0,0],5:[-Math.PI/2,0,0]}[n];
    const qT=new THREE.Quaternion().setFromEuler(new THREE.Euler(E[0],E[1],E[2]));
    const qF=new THREE.Quaternion().setFromEuler(new THREE.Euler(.34,-.4,.08)).multiply(qT);
    const axis=new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize();
    const spin=Math.PI*(5+Math.random()*2);
    const c=center(r),sx=c.x-ws(r.width*.4),sy=c.y+ws(r.height*.55);
    const dur=1.4,fade=.4;let age=0;const aa=new THREE.Quaternion();
    // shadow
    const sh=new THREE.Mesh(new THREE.CircleGeometry(s*.5,24),new THREE.MeshBasicMaterial({color:0x1d1035,transparent:true,opacity:0}));
    sh.scale.y=.32;sh.position.set(c.x,c.y-s*.62,-1);scene.add(sh);
    add({update(dt){
      age+=dt;const t=Math.min(1,age/dur),e=1-Math.pow(1-t,3);
      m.position.set(sx+(c.x-sx)*e,sy+(c.y-sy)*easeBounce(t),Math.sin(Math.min(1,t*1.15)*Math.PI)*2.2);
      aa.setFromAxisAngle(axis,spin*(1-e));m.quaternion.copy(qF).multiply(aa);
      const land=age-dur;m.scale.setScalar(land>0&&land<.3?1+.12*Math.sin(land/.3*Math.PI):1);
      sh.position.x=m.position.x;sh.material.opacity=.22*e;
      if(age>dur+hold){const o=Math.max(0,1-(age-dur-hold)/fade);mats.forEach(mt=>mt.opacity=o);sh.material.opacity=.22*o;
        if(o<=0){scene.remove(m);scene.remove(sh);geo.dispose();mats.forEach(mt=>mt.dispose());sh.geometry.dispose();sh.material.dispose();return false}}
    }});
    return true;
  }

  /* instanced flying cards / confetti */
  function instanced(n,w,h,colors,setup,step,life){
    if(!init())return;const THREE=T();
    const geo=new THREE.PlaneGeometry(w,h);const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide,transparent:true});
    const mesh=new THREE.InstancedMesh(geo,mat,n);mesh.frustumCulled=false;const d=new THREE.Object3D();const cl=new THREE.Color();
    const st=[];for(let i=0;i<n;i++){st.push(setup(i));cl.set(css(colors[i%colors.length]));mesh.setColorAt(i,cl)}
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    scene.add(mesh);let age=0;
    add({update(dt){
      age+=dt;for(let i=0;i<n;i++){step(st[i],d,age,dt);d.updateMatrix();mesh.setMatrixAt(i,d.matrix)}
      mesh.instanceMatrix.needsUpdate=true;
      mat.opacity=Math.min(1,age/.15)*Math.max(0,Math.min(1,(life-age)/.5));
      if(age>=life){scene.remove(mesh);geo.dispose();mat.dispose();mesh.dispose&&mesh.dispose();return false}
    }});
  }
  const CC=['var(--cr)','var(--cy)','var(--cg)','var(--cb)'];
  function confetti(){
    if(!init())return;const worldW=visH*W/H,topCard=visH/2;
    instanced(160,ws(11),ws(6),[...CC,'var(--accent)','#ffffff'],
      i=>({x:(Math.random()-.5)*worldW,y:topCard+Math.random()*visH*.6,vy:-(2+Math.random()*2.5),vx:(Math.random()-.5)*1.2,ph:Math.random()*6,rs:2+Math.random()*6,ax:Math.random()*Math.PI}),
      (p,d,age,dt)=>{p.y+=p.vy*dt;p.x+=(p.vx+Math.sin(age*3+p.ph)*.8)*dt;d.position.set(p.x,p.y,1);d.rotation.set(p.ax+age*p.rs,age*p.rs*.7,age*p.rs*.4)},4.2);
  }
  function swirl(mode,dir=1){
    if(!init())return;const r=arenaRect(),c=center(r),R0=ws(r.width*.42);
    const n=mode==='tornado'?18:12,life=mode==='tornado'?1.6:1.5;
    instanced(n,ws(r.width*.12),ws(r.width*.18),CC,
      i=>({a:i/n*Math.PI*2,rr:mode==='tornado'?R0*(.55+Math.random()*.45):R0,h:(Math.random()-.5)*R0*1.2,sp:Math.random()*4}),
      (p,d,age)=>{
        const t=age/life;
        if(mode==='tornado'){const a=p.a+age*7;const rr=p.rr*(1-.7*t);d.position.set(c.x+Math.cos(a)*rr,c.y+p.h*(1-t)+t*R0*.6,Math.sin(a)*rr*.5);d.rotation.set(.4,a,age*p.sp)}
        else{const a=p.a+dir*-age*(Math.PI*2*1.1/life);d.position.set(c.x+Math.cos(a)*p.rr,c.y+Math.sin(a)*p.rr*.92,.5);d.rotation.set(0,0,a+Math.PI/2)}
      },life);
  }
  function explode(r){
    if(!r||!init())return;const c=center(r);
    burst({x:c.x,y:c.y,count:90,colors:['#fff3b0','#ffb347','#ff6a2b','#e0433a'],speed:[3,10],life:.9,size:.38,gravity:-2,add:true});
    burst({x:c.x,y:c.y,count:16,colors:['#6b6470','#8d8696','#4b4552'],speed:[.4,2.2],life:2,size:1.5,gravity:1.1,grow:1.4,tex:smokeTex(),opacity:.85,drag:.96});
    burst({x:c.x,y:c.y,count:1,colors:['#ffffff'],speed:[0,0],life:.25,size:5,gravity:0,add:true});
  }
  const sparks=(r,color)=>{if(!r||!init())return;const c=center(r);burst({x:c.x,y:c.y,count:40,colors:[color,'#ffffff'],speed:[2,7],life:.8,size:.26,gravity:-2.5,add:true})};
  const smoke=r=>{if(!r||!init())return;const c=center(r);burst({x:c.x,y:c.y,count:10,colors:['#8d8696','#b5afbd'],speed:[.3,1.4],life:1.6,size:1.1,gravity:1,grow:1.2,tex:smokeTex(),opacity:.7,jx:ws(r.width*.4)})};
  const steam=r=>{if(!r||!init())return;const c=center(r);burst({x:c.x,y:c.y+ws(r.height*.3),count:14,colors:['#ffffff','#f3efe6'],speed:[.6,1.6],dir:Math.PI/2,spread:.8,life:1.8,size:.9,gravity:.6,grow:1.3,tex:smokeTex(),opacity:.8,jx:ws(r.width*.3)})};
  const aura=color=>{if(!init())return;const r=arenaRect(),c=center(r);burst({x:c.x,y:c.y,ring:ws(r.width*.42),count:70,colors:[color,'#d6b3ff'],speed:[.3,1.2],dir:Math.PI/2,spread:1,life:1.6,size:.32,gravity:.8,add:true})};

  /* weather */
  let dying=[];
  function clearWeather(now){if(now){if(wsys)wsys.dispose();dying.forEach(d=>d.dispose());dying=[]}else if(wsys)dying.push(wsys);wsys=null;wkind=null}
  let wRect='';
  // instant: troca sem transição (usado ao atravessar o Portal)
  function setWeather(k,instant){
    if(!k||!on()){if(wkind||(instant&&dying.length))clearWeather(instant);return}
    const tb=document.querySelector('.table').getBoundingClientRect(),key=[tb.left,tb.top,tb.width,tb.height,innerWidth,innerHeight].map(Math.round).join();
    if(k===wkind&&key===wRect)return;wRect=key;
    if(ok&&(W!==innerWidth||H!==innerHeight))resize();
    if(!init())return;
    clearWeather(instant);wkind=k;const THREE=T();
    const tr=document.querySelector('.table').getBoundingClientRect();
    const L=wx(tr.left),Rr=wx(tr.right),Tp=wy(tr.top),B=wy(tr.bottom),Wd=Rr-L,Ht=Tp-B;
    const objs=[];let tt=0;let upd=()=>{};
    const rx=()=>L+Math.random()*Wd,ry=()=>B+Math.random()*Ht;
    if(k==='blizzard'||k==='sun'){
      const n=k==='blizzard'?150:45;const pos=new Float32Array(n*3),v=[];
      const enter=k==='blizzard'&&!instant;
      for(let i=0;i<n;i++){pos[i*3]=enter?1e5:rx();pos[i*3+1]=ry();pos[i*3+2]=0;v.push({vy:k==='blizzard'?-(.5+Math.random()*.9):(.25+Math.random()*.45),ph:Math.random()*6,f:.6+Math.random(),wait:enter?Math.random()*2.5:0})}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
      const mat=new THREE.PointsMaterial({size:k==='blizzard'?.27:.22,map:dotTex(),color:k==='blizzard'?0xbcd8f7:0xffd36b,transparent:true,depthWrite:false,opacity:k==='blizzard'?.95:.8,blending:k==='sun'?THREE.AdditiveBlending:THREE.NormalBlending});
      const p=new THREE.Points(geo,mat);p.frustumCulled=false;scene.add(p);objs.push(p);
      upd=dt=>{const a=geo.attributes.position.array;for(let i=0;i<n;i++){if(v[i].wait>0){v[i].wait-=dt;if(v[i].wait<=0){a[i*3]=rx();a[i*3+1]=Tp}continue}a[i*3+1]+=v[i].vy*dt;a[i*3]+=Math.sin(tt*v[i].f+v[i].ph)*.35*dt;
        if(v[i].vy<0&&a[i*3+1]<B){a[i*3+1]=Tp;a[i*3]=rx()}else if(v[i].vy>0&&a[i*3+1]>Tp){a[i*3+1]=B;a[i*3]=rx()}
        if(a[i*3]<L)a[i*3]=Rr;else if(a[i*3]>Rr)a[i*3]=L}geo.attributes.position.needsUpdate=true;
        if(k==='sun')mat.userData.base=.55+.25*Math.sin(tt*2)};

    }else if(k==='storm'){
      const n=100;const pos=new Float32Array(n*6),sp=[];
      const dx=-.12,dy=-.5;
      const drift=Ht*.24,pRight=drift/(Wd+drift);
      const spawn=()=>Math.random()<pRight?[Rr,B+Math.random()*Ht]:[rx(),Tp];
      for(let i=0;i<n;i++){const x=rx(),y=ry();pos.set([x,y,0,x+dx,y+dy,0],i*6);sp.push(7+Math.random()*5)}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
      const mat=new THREE.LineBasicMaterial({color:0xb7ccff,transparent:true,opacity:.6});
      const ls=new THREE.LineSegments(geo,mat);ls.frustumCulled=false;scene.add(ls);objs.push(ls);
      upd=dt=>{const a=geo.attributes.position.array;for(let i=0;i<n;i++){const vy=-sp[i]*dt,vx=vy*.24;
        for(const o of [0,3]){a[i*6+o]+=vx;a[i*6+o+1]+=vy}
        if(a[i*6+4]<B||a[i*6+3]<L){const [x,y]=spawn();a.set([x,y,0,x+dx,y+dy,0],i*6)}}geo.attributes.position.needsUpdate=true};
    }
    if(!objs.length){wkind=k;return}
    const mats=objs.map(o=>o.material);mats.forEach(m=>{if(m.userData.base==null)m.userData.base=m.opacity;m.opacity=0});
    const fade=k==='blizzard'?.4:.8;
    if(instant)mats.forEach(m=>m.opacity=m.userData.base);
    wsys={alpha:instant?1:0,mats,update(dt){tt+=dt;upd(dt);this.alpha=Math.min(1,this.alpha+dt*fade);mats.forEach(m=>m.opacity=m.userData.base*this.alpha)},dispose(){objs.forEach(o=>{scene.remove(o);o.geometry&&o.geometry.dispose();o.material&&o.material.dispose()})}};
    run();
  }
  function reset(){systems.forEach(()=>{});clearWeather();dying.forEach(d=>d.dispose());dying=[];if(ok){scene.children.filter(o=>!o.isLight).forEach(o=>scene.remove(o));systems=[]}}
  return {available:()=>on()&&init(),rollDie,confetti,swirl,explode,sparks,smoke,steam,aura,setWeather,reset};
})();

/* ---------- sound ---------- */
let AC=null,MASTER=null,MUTED=load('unotfm-solo-mute',false),lastDrawSnd=0;
function audio(){
  if(MUTED)return null;
  try{
    if(!AC){AC=new (window.AudioContext||window.webkitAudioContext)();MASTER=AC.createGain();MASTER.gain.value=.5;MASTER.connect(AC.destination)}
    if(AC.state==='suspended')AC.resume();
  }catch(e){return null}
  return AC;
}
function tone(f,d,o={}){
  const a=audio();if(!a)return;const t=a.currentTime+(o.at||0);
  const osc=a.createOscillator(),g=a.createGain();
  osc.type=o.type||'sine';osc.frequency.setValueAtTime(f,t);
  if(o.to)osc.frequency.exponentialRampToValueAtTime(o.to,t+d);
  if(o.detune)osc.detune.value=o.detune;
  const v=o.vol??.25;
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(v,t+Math.min(.02,d/4));g.gain.exponentialRampToValueAtTime(0.0001,t+d);
  osc.connect(g);g.connect(MASTER);osc.start(t);osc.stop(t+d+.05);
}
function noise(d,o={}){
  const a=audio();if(!a)return;const t=a.currentTime+(o.at||0);
  const len=Math.max(1,Math.floor(a.sampleRate*d)),buf=a.createBuffer(1,len,a.sampleRate),ch=buf.getChannelData(0);
  for(let i=0;i<len;i++)ch[i]=Math.random()*2-1;
  const src=a.createBufferSource();src.buffer=buf;
  const flt=a.createBiquadFilter();flt.type=o.filter||'bandpass';flt.frequency.setValueAtTime(o.f||1500,t);
  if(o.fTo)flt.frequency.exponentialRampToValueAtTime(o.fTo,t+d);flt.Q.value=o.q??1;
  const g=a.createGain();const v=o.vol??.2;
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(v,t+Math.min(.03,d/3));g.gain.exponentialRampToValueAtTime(0.0001,t+d);
  src.connect(flt);flt.connect(g);g.connect(MASTER);src.start(t);src.stop(t+d+.05);
}
const arp=(notes,step,o={})=>notes.forEach((n,i)=>tone(n,o.d||.18,{...o,at:(o.at||0)+i*step}));
const SND={
  play:()=>{noise(.06,{f:2500,vol:.12});tone(520,.08,{type:'triangle',to:720,vol:.14})},
  draw:()=>{noise(.1,{f:3000,fTo:1200,vol:.1,filter:'highpass'})},
  turn:()=>arp([660,880],.09,{type:'sine',vol:.16,d:.22}),
  uno:()=>arp([523,659,784,1046],.06,{type:'square',vol:.08,d:.14}),
  caught:()=>{tone(320,.35,{type:'sawtooth',to:140,vol:.14})},
  skip:()=>{tone(240,.09,{type:'square',vol:.12});tone(180,.14,{type:'square',vol:.12,at:.11})},
  rev:()=>{tone(300,.22,{to:900,vol:.16});tone(900,.22,{to:300,vol:.12,at:.2});noise(.4,{f:800,fTo:3000,vol:.08})},
  plus:()=>{tone(200,.12,{type:'sawtooth',vol:.14});tone(300,.18,{type:'sawtooth',vol:.14,at:.12});noise(.15,{f:400,vol:.1,at:.12,filter:'lowpass'})},
  wild:()=>arp([523,659,784,988],.05,{type:'triangle',vol:.14,d:.25}),
  sun:()=>arp([523,659,784,1046,1318],.07,{type:'triangle',vol:.13,d:.4}),
  fog:()=>{tone(180,1.1,{vol:.14,detune:-8});tone(182,1.1,{vol:.12,detune:9});tone(270,1,{vol:.06,at:.1})},
  storm:()=>{noise(1.2,{f:300,filter:'lowpass',vol:.35});noise(.25,{f:4000,filter:'highpass',vol:.18});tone(55,1,{type:'sawtooth',vol:.08,to:40})},
  blizzard:()=>{noise(1,{f:6000,filter:'highpass',vol:.1});arp([1568,1318,1175,1046],.1,{vol:.08,d:.3})},
  boom:()=>{noise(1,{f:180,filter:'lowpass',vol:.5});tone(90,.8,{to:30,vol:.3})},
  out:()=>arp([440,349,262],.14,{type:'triangle',vol:.16,d:.3}),
  win:()=>{arp([523,659,784,1046],.12,{type:'triangle',vol:.16,d:.3});[523,659,784].forEach(n=>tone(n,.9,{type:'triangle',vol:.1,at:.5}))},
  lose:()=>arp([392,330,262,196],.2,{type:'sine',vol:.16,d:.45}),
  dice:()=>{for(let i=0;i<7;i++)noise(.03,{f:2000+Math.random()*2000,vol:.15,at:i*.06});tone(700,.12,{type:'triangle',vol:.12,at:.46})},
  curse:()=>{tone(233,.8,{type:'sawtooth',vol:.08});tone(330,.8,{type:'sawtooth',vol:.07});tone(110,.9,{vol:.12,to:80})},
  chest:()=>{for(let i=0;i<6;i++)tone(i%2?1568:1318,.12,{type:'triangle',vol:.1,at:i*.07})},
  rule:()=>{noise(.18,{f:1800,fTo:900,vol:.12});arp([784,988],.1,{vol:.12,at:.12})},
  chal:()=>arp([440,554],.12,{type:'square',vol:.08,d:.2}),
  death:()=>{tone(110,.9,{type:'sawtooth',vol:.12,to:70});tone(116,.9,{type:'sawtooth',vol:.08})},
  jump:()=>{noise(.04,{f:5000,vol:.18});noise(.04,{f:5000,vol:.18,at:.07})},
  swoosh:()=>noise(.45,{f:400,fTo:4000,vol:.16,q:2}),
  bonus:()=>arp([784,1046,1318],.07,{type:'triangle',vol:.12,d:.2}),
  special:()=>arp([784,988],.08,{vol:.12,d:.22}),
  error:()=>tone(150,.12,{type:'square',vol:.1}),
  tick:()=>tone(1200,.04,{type:'square',vol:.06}),
  pop:()=>{tone(400,.08,{to:800,vol:.14});noise(.05,{f:1500,vol:.1})},
  peace:()=>arp([523,784,1046],.12,{vol:.1,d:.5}),
  gift:()=>{arp([880,1175,1568],.06,{type:'triangle',vol:.1,d:.25});noise(.15,{f:6000,filter:'highpass',vol:.05,at:.1})},
  web:()=>{tone(180,.5,{type:'sawtooth',to:120,vol:.07});tone(240,.5,{type:'triangle',to:200,vol:.06,at:.05})},
  wish:()=>{noise(.5,{f:600,fTo:5000,vol:.1,q:3});arp([1046,1318,1568,2093],.07,{vol:.08,d:.3,at:.25})},
  equal:()=>{tone(440,.2,{type:'triangle',vol:.12});tone(440,.25,{type:'triangle',vol:.12,at:.22})},
  justice:()=>{noise(.08,{f:300,filter:'lowpass',vol:.35});tone(90,.18,{vol:.25});noise(.08,{f:300,filter:'lowpass',vol:.3,at:.28});tone(90,.18,{vol:.2,at:.28})},
  magnet:()=>{tone(120,.7,{type:'square',vol:.04,to:240});tone(240,.7,{vol:.06,to:480})},
  recycle:()=>{tone(400,.18,{to:700,vol:.1});tone(700,.18,{to:400,vol:.1,at:.18});tone(400,.2,{to:800,vol:.1,at:.36})},
  luck:()=>arp([1318,1568,2093,1568,2093],.06,{type:'sine',vol:.08,d:.2}),
  mystery:()=>{tone(300,.25,{to:500,vol:.1});tone(500,.3,{to:900,vol:.1,at:.25,type:'triangle'})},
  clone:()=>{tone(660,.15,{type:'triangle',vol:.12});tone(660,.15,{type:'triangle',vol:.07,at:.16});tone(660,.15,{type:'triangle',vol:.04,at:.32})},
  beep:()=>{tone(880,.1,{type:'square',vol:.07});tone(880,.1,{type:'square',vol:.07,at:.18});tone(660,.18,{type:'square',vol:.07,at:.36})},
  copy:()=>{for(let i=0;i<5;i++)tone(600+i*80,.06,{type:'square',vol:.05,at:i*.06})},
  simon:()=>arp([392,523,659,784],.12,{type:'triangle',vol:.1,d:.18}),
  chairs:()=>arp([523,587,659,698,784,698,659,587],.07,{type:'square',vol:.05,d:.1}),
  view:()=>{tone(700,.8,{vol:.06,detune:12});tone(1050,.8,{vol:.04,detune:-12,at:.05})},
  compass:()=>{tone(1568,.15,{vol:.1});tone(2093,.3,{vol:.08,at:.12})},
  lock:()=>{noise(.06,{f:2500,vol:.2});tone(200,.12,{type:'square',vol:.1,at:.04})},
  sneak:()=>{tone(500,.35,{to:150,vol:.1,type:'triangle'});noise(.25,{f:1500,fTo:400,vol:.06})},
  ban:()=>{tone(110,.45,{type:'sawtooth',vol:.12});tone(116,.45,{type:'sawtooth',vol:.08})},
  box:()=>{tone(300,.08,{to:600,vol:.14});arp([784,988,1175],.07,{type:'triangle',vol:.09,d:.25,at:.1})},
  dizzy:()=>{tone(400,.9,{vol:.08,detune:30});tone(420,.9,{vol:.08,detune:-30})},
  splat:()=>{noise(.25,{f:500,filter:'lowpass',vol:.3});tone(180,.15,{to:90,vol:.12})},
  paradox:()=>{noise(.5,{f:4000,fTo:300,vol:.1,q:3});tone(800,.5,{to:200,vol:.06})},
  zip:()=>{noise(.12,{f:1500,fTo:5000,vol:.12,q:2})},
  thud:()=>{tone(70,.35,{vol:.3,to:45});noise(.1,{f:200,filter:'lowpass',vol:.2})},
  thaw:()=>arp([784,988,1175,1568],.1,{type:'triangle',vol:.1,d:.4}),
  rain:()=>{for(let i=0;i<10;i++)noise(.04,{f:3000+Math.random()*2000,vol:.06,at:Math.random()*.6})},
  thunder:()=>{noise(.9,{f:250,filter:'lowpass',vol:.35});noise(.1,{f:5000,filter:'highpass',vol:.15})},
  portalCharge:()=>{noise(1.3,{f:150,fTo:2500,vol:.12,q:6});tone(80,1.3,{to:320,vol:.1,type:'sawtooth'});tone(160,1.3,{to:640,vol:.05})},
  portal:()=>{noise(.9,{f:200,fTo:3000,vol:.14,q:4});arp([392,523,659,880,1175],.08,{type:'sine',vol:.09,d:.35,at:.15});tone(110,.9,{to:55,vol:.12})},
  siren:()=>{tone(700,.25,{type:'square',vol:.08,to:1000});tone(1000,.25,{type:'square',vol:.08,to:700,at:.25})},
};
function sfx(k){if(MUTED||!SND[k])return;try{SND[k]()}catch(e){}}
function sfxGlyph(g){
  const s=String(g);
  if(s===ARROWS)return sfx('rev');
  if(s.startsWith('<svg'))return sfx('dice');
  const map=[['⊘+2','plus'],['⊘','skip'],['💣','boom'],['💥','boom'],['☀️','sun'],['☁️','fog'],['⛈️','storm'],['❄️','blizzard'],['⚀','dice'],['⚁','dice'],['⚂','dice'],['⚃','dice'],['⚄','dice'],['⚅','dice'],
    ['💰','chest'],['📜','rule'],['⚔️','chal'],['☠️','death'],['✂','jump'],['★','bonus'],['⇆','swoosh'],['🔀','swoosh'],['🎠','swoosh'],['🌪️','swoosh'],['✋','swoosh'],['🥔','pop'],['🌼','peace'],['🕊️','peace'],
    ['⚒️','curse'],['🧊','curse'],['👢','curse'],['🌵','curse'],['⏱️','curse'],['🧪','curse'],['😈','curse'],['⚡','thunder'],['💧','rain'],
    ['❤️‍🔥','gift'],['🕸️','web'],['☄️','wish'],['⚖️','equal'],['🙏','justice'],['🧲','magnet'],['♻️','recycle'],['🍀','luck'],['❓','mystery'],['🧬','clone'],['🚦','beep'],
    ['🤲','copy'],['🧠','simon'],['🪑','chairs'],['👁️','view'],['🧭','compass'],['🔒','lock'],['🧤','sneak'],['✖️','ban'],['📦','box'],['🍄','dizzy'],['🖌️','splat'],['⏳','paradox'],
    ['⏩','zip'],['🌀','portal'],['🌤️','thaw'],['🚨','siren'],['#0d0a14','thud'],['wheel','wild'],['+','plus']];
  const hit=map.find(([m])=>s.includes(m));sfx(hit?hit[1]:'special');
}
function fx(glyph,cap,color,kind,dur){
  hold(dur?dur+200:950);sfxGlyph(glyph);
  $('fx').innerHTML=`<div class="fxin" style="--fxc:${color}${dur?`;animation-duration:${dur}ms`:''}"><div class="fxg k-${kind}" style="color:${color}">${glyph}</div>${cap?`<div class="fxcap">${cap}</div>`:''}</div>`;
}
function burst(color){
  if(RM)return;
  const b=document.createElement('div');b.className='burst';b.style.setProperty('--fxc',color);
  document.querySelector('.arena').appendChild(b);b.addEventListener('animationend',()=>b.remove());
}
function targetRect(pi){
  if(pi===0)return $('hand').getBoundingClientRect();
  const el=document.querySelector(`[data-seat="${pi}"]`);return el?el.getBoundingClientRect():null;
}
function stampOn(pi,glyph,color){
  const r=targetRect(pi);if(!r)return;
  const d=document.createElement('div');d.className='stamp';d.textContent=glyph;d.style.setProperty('--fxc',color);
  const h=pi===0?Math.min(r.height,110):r.height,w=pi===0?h:r.width;
  d.style.left=(r.left+r.width/2-w/2)+'px';d.style.top=(r.top+r.height/2-h/2)+'px';d.style.width=w+'px';d.style.height=h+'px';
  d.style.fontSize=(h*.62)+'px';if(pi===0)d.style.borderRadius='50%';
  document.body.appendChild(d);d.addEventListener('animationend',()=>d.remove());
}
function floatOn(pi,text,color){
  const r=targetRect(pi);if(!r)return;
  const d=document.createElement('div');d.className='floatx';d.textContent=text;d.style.setProperty('--fxc',color);
  d.style.left=(r.left+r.width/2)+'px';d.style.top=(r.top+(pi===0?4:r.height*.25))+'px';
  document.body.appendChild(d);d.addEventListener('animationend',()=>d.remove());
}
