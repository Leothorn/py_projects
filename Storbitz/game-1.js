'use strict';
const C=document.getElementById('c'),X=C.getContext('2d'),$=id=>document.getElementById(id);
const ph=$('ph'),eh=$('eh'),pf=$('pf'),ef=$('ef'),pt=$('pt'),et=$('et'),pd=$('pd'),pa=$('pa'),ed=$('ed'),ea=$('ea'),msg=$('msg'),helpPanel=$('helpPanel'),helpBtn=$('helpBtn'),resetBtn=$('reset');
const W=1200,H=700,DT=1/120,MAX_SATELLITES=10,TAU=Math.PI*2;
const BOOSTER={duration:1.05,len:11,w:3.2};
const P=[
 {x:250,y:390,r:48,mu:1650000,h:100,col:'#58dcff',pad:0,spin:-1},
 {x:950,y:310,r:48,mu:1650000,h:100,col:'#ff6d91',pad:Math.PI,spin:-1}
];
let craft=[],debris=[],particles=[],beams=[],drag=false,orbitPick=false,dragPoint={x:0,y:0},selectedSat=null,last=performance.now(),acc=0,aiTimer=2.4,over=false,sc=1,ox=0,oy=0,stars=[];
for(let i=0;i<180;i++)stars.push([Math.random()*W,Math.random()*H,Math.random()*1.5+.25,Math.random()*.65+.18]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function resize(){const q=Math.min(devicePixelRatio||1,2);C.width=innerWidth*q;C.height=innerHeight*q;C.q=q;sc=Math.min(innerWidth/W,innerHeight/H);ox=(innerWidth-W*sc)/2;oy=(innerHeight-H*sc)/2}onresize=resize;resize();
function world(e){return{x:(e.clientX-ox)/sc,y:(e.clientY-oy)/sc}}function note(t){msg.textContent=t}function fleetCount(owner){return craft.filter(q=>!q.dead&&q.owner===owner).length}
function accelLocal(x,y,p){const dx=p.x-x,dy=p.y-y,r2=Math.max(dx*dx+dy*dy,(p.r*.55)**2),f=p.mu/Math.pow(r2,1.5);return[dx*f,dy*f]}
function accelFull(x,y){let ax=0,ay=0;for(const p of P){const a=accelLocal(x,y,p);ax+=a[0];ay+=a[1]}return[ax,ay]}
function integrateVerlet(b,dt,anchor=null){const fn=anchor===null?accelFull:(x,y)=>accelLocal(x,y,P[anchor]);let a=fn(b.x,b.y);b.vx+=a[0]*dt*.5;b.vy+=a[1]*dt*.5;b.x+=b.vx*dt;b.y+=b.vy*dt;a=fn(b.x,b.y);b.vx+=a[0]*dt*.5;b.vy+=a[1]*dt*.5}
function orbitInfo(b,p){const rx=b.x-p.x,ry=b.y-p.y,r=Math.hypot(rx,ry),v2=b.vx*b.vx+b.vy*b.vy,E=v2/2-p.mu/r,h=rx*b.vy-ry*b.vx;if(E>=0)return{bound:false,r,rp:Infinity,ra:Infinity,e:Infinity,h};const e=Math.sqrt(Math.max(0,1+2*E*h*h/(p.mu*p.mu))),a=-p.mu/(2*E),rp=a*(1-e),ra=a*(1+e);return{bound:rp>p.r+5&&ra<480,r,rp,ra,e,h,a}}
function radialVelocity(s,p){const rx=s.x-p.x,ry=s.y-p.y,r=Math.hypot(rx,ry);return(rx*s.vx+ry*s.vy)/r}
function tangentialFrame(s,p){const rx=s.x-p.x,ry=s.y-p.y,r=Math.hypot(rx,ry),h=rx*s.vy-ry*s.vx,dir=h>=0?1:-1;return{r,dir,tx:-ry/r*dir,ty:rx/r*dir}}
function sparks(x,y,col,n=12){for(let i=0;i<n;i++){const a=Math.random()*TAU,s=20+Math.random()*90;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.3+Math.random()*.5,r:.7+Math.random()*1.7,col})}}
function damage(i,n,t){P[i].h=Math.max(0,P[i].h-n);note(t);if(P[i].h<=0&&!over){over=true;setTimeout(()=>alert(i===1?'Victory!':'Defeat!'),40)}}
function spendPropellant(s,dv,label){if(dv<=0)return true;if(s.propellant+1e-6<dv){note(`${label} aborted: insufficient propellant`);s.state='drifting';s.anchor=null;return false}s.propellant-=dv;return true}

function launchPlan(owner,t){
 const p=P[owner],dx=t.x-p.x,dy=t.y-p.y,len=Math.hypot(dx,dy),R=clamp(94+len*.2,98,145);
 const tangentMagnitude=Math.abs(dy),radialMagnitude=Math.abs(dx),ratio=radialMagnitude/(tangentMagnitude+radialMagnitude+1e-6);
 const dir=dy===0?p.spin:(dy<0?-1:1),orientation=dir===p.spin?'prograde':'retrograde';
 let e=clamp(ratio*.68,0,.62),rp,ra,atPeriapsis=dx>=0;
 if(e<.035){e=0;rp=ra=R}
 else if(atPeriapsis){ra=Math.min(380,R*(1+e)/(1-e));e=(ra-R)/(ra+R);rp=R}
 else{const minRp=p.r+9,maxE=(R-minRp)/(R+minRp);e=Math.min(e,maxE);ra=R;rp=R*(1-e)/(1+e)}
 const a=(rp+ra)/2,v=Math.sqrt(p.mu*(2/R-1/a));
 return{R,dir,orientation,e,rp,ra,a,v,kind:e<.035?'circular':'elliptical',atPeriapsis};
}
function launchRocket(owner,plan,aiAttack=false){if(fleetCount(owner)>=MAX_SATELLITES){if(owner===0)note('Fleet limit reached: maximum 10 satellites');return false}const p=P[owner],start=p.pad;craft.push({type:'rocket',owner,x:p.x+Math.cos(start)*(p.r+4),y:p.y+Math.sin(start)*(p.r+4),vx:0,vy:0,age:0,burnT:0,plan,startAngle:start,trail:[],dead:false,aiAttack});note(owner===0?'Single-stage booster ignition':'Enemy booster launched');return true}
function discardBooster(r){const a=r.flightAngle+Math.PI;debris.push({x:r.x,y:r.y,vx:r.vx+Math.cos(a)*10,vy:r.vy+Math.sin(a)*10,life:1.8,ang:r.flightAngle,spin:(Math.random()-.5)*5,anchor:r.owner});sparks(r.x,r.y,r.owner?'#ff9ab4':'#8deaff',7)}
function updateRocket(r,dt){r.age+=dt;r.burnT+=dt;const p=P[r.owner],u=clamp(r.burnT/BOOSTER.duration,0,1),e=u*u*(3-2*u),angle=r.startAngle+r.plan.dir*(.1+1.0*e),radius=p.r+4+(r.plan.R-p.r-4)*e,px=r.x,py=r.y;r.x=p.x+Math.cos(angle)*radius;r.y=p.y+Math.sin(angle)*radius;r.vx=(r.x-px)/dt;r.vy=(r.y-py)/dt;r.flightAngle=Math.atan2(r.vy,r.vx);if(r.burnT>=BOOSTER.duration){discardBooster(r);deploy(r)}}
function deploy(r){const p=P[r.owner],rx=r.x-p.x,ry=r.y-p.y,R=Math.hypot(rx,ry),tx=-ry/R*r.plan.dir,ty=rx/R*r.plan.dir;r.type='sat';r.vx=tx*r.plan.v;r.vy=ty*r.plan.v;r.state='defense';r.anchor=r.owner;r.enemyStable=0;r.attackTick=0;r.defCd=.2;r.propellant=440;r.transferAge=0;r.burnFlash=.22;r.prevRadial=0;r.raisePlan=[];r.raiseIndex=0;r.burnCount=0;r.firstRaise=false;r.selected=false;if(r.aiAttack)r.armDelay=.9+Math.random()*1.2;note(`${r.plan.orientation} ${r.plan.kind} orbit established`)}
