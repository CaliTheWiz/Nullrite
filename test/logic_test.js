const fs=require('fs');
const src=['config','mathx','gear','rig','bossrig','logic'].map(f=>fs.readFileSync(`src/${f}.js`,'utf8')).join('\n');
const out={sfx:()=>{}, haptic:()=>{}};
const run=new Function('out', src+`
const g=new Game(out); const P=g.player,B=g.boss;
const ctl={moveDir:null,moveMag:0,sprint:false,aimDir:null,heavyHeld:-1};
function step(n){for(let i=0;i<n;i++) g.update(1/60, ctl);}
B.idle_time=999; P.gx=0; P.gy=B.gy-100; P.facing=Math.PI/2;
g.press('light', Math.PI/2); step(40);
const r={lightDmg: BOSS_MAX_HP-B.hp, combo:P.combo};
// boss attacks hit a stationary player
for (const k of ['sweep','slam','lance']) {
  g.resetRound(); P.gx=0; P.gy=(k==='lance'?-200:20); B.chooseAttack(0); B.kind=k; B.atk=BOSS_ATTACKS[k]; B.beginAttack(P);
  const hp0=P.hp; step(200); r[k]=hp0-P.hp;
}
// random soak
g.resetRound(); let deaths=0;
const kinds=['light','heavy','dodge','shoot','flask','item'];
for(let f=0;f<60*180;f++){
  if(f%7===0){ ctl.moveDir=Math.random()<0.7?Math.random()*6.28:null; ctl.moveMag=1; ctl.sprint=Math.random()<0.2; }
  if(f%11===0) g.press(kinds[(Math.random()*kinds.length)|0], Math.random()<0.5?null:Math.random()*6.28, Math.random()<0.3);
  ctl.heavyHeld = (f%90<50)? (f%90)/60 : -1;
  step(1);
  if(g.outcome && g.overlayLevel()>=0.6){ if(g.outcome==='death') deaths++; g.resetRound(); }
  for(const v of [P.gx,P.gy,B.gx,B.gy,P.hp,B.hp,P.swordX,P.sword_rot,B.halX]) if(!isFinite(v)) throw new Error('NaN at frame '+f);
}
r.soakDeaths=deaths;
return r;`);
console.log(run(out));
