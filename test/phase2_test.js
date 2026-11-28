// Phase 2: transition, immunity, shove, lance->sweep chain, slam waves (pure logic, Node)
const fs=require('fs');
const src=['config','mathx','gear','anim','rig','bossrig','logic'].map(f=>fs.readFileSync(`src/${f}.js`,'utf8')).join('\n');
const sounds=[]; const out={sfx:(n)=>sounds.push(n), haptic:()=>{}};
const run=new Function('out','sounds', src+`
const g=new Game(out); g.startFight(true); const P=g.player,B=g.boss, r={};
const ctl={moveDir:null,moveMag:0,sprint:false,aimDir:null,heavyHeld:-1};
function step(n){for(let i=0;i<n;i++) g.update(1/60, ctl);}
const ok=(c,m)=>{ if(!c) throw new Error('FAIL: '+m); };
// 1. crossing 50% triggers the transition, shoves a nearby player, boss is immune during it
B.idle_time=999; P.gx=0; P.gy=B.gy-140; B.hp=BOSS_MAX_HP*0.5+10;
g.hitBoss(40, 5, -Math.PI/2, false, false);
ok(B.state===S_PHASE && B.phase===2, 'phase state'); ok(sounds.includes('roar'), 'roar sound');
ok(P.state===S_HURT, 'player shoved'); ok(P.hp===PLAYER_MAX_HP, 'shove does no damage');
const hpAt=B.hp; step(30); ok(P.gy < B.gy-160, 'pushed away: '+(B.gy-P.gy).toFixed(0));
g.hitBoss(100, 50, 0, true, false); ok(B.hp===hpAt, 'immune during roar');
step(Math.ceil(PHASE_TIME*60)+5); ok(B.state!==S_PHASE, 'roar ends'); ok(g.phaseMix>0.99, 'runes fully crimson');
r.transition='ok';
// 2. phase-2 lance chains into a sweep with no recovery in between
g.resetRound(); g.startFight(true); B.phase=2; B.idle_time=999; P.gx=0; P.gy=-250;
B.chooseAttack(0); B.kind='lance'; B.atk=BOSS_ATTACKS.lance; B.beginAttack(P);
const seen=[]; for(let i=0;i<300;i++){ step(1); const s=B.state+':'+B.kind; if(seen[seen.length-1]!==s) seen.push(s); }
ok(seen.join(' ').includes('ACTIVE:lance WINDUP:sweep ACTIVE:sweep RECOVERY:sweep'), 'chain: '+seen.join(' '));
ok(!seen.join(' ').includes('RECOVERY:lance'), 'no lance recovery'); r.chain=seen.join(' > ');
// 3. phase-2 slam sends 3 waves outward; they hurt a player standing out of slam range
g.resetRound(); g.startFight(true); B.phase=2; B.idle_time=999; B.gx=0; B.gy=0; P.gx=0; P.gy=-560; P.hurt_iframes=0;
B.chooseAttack(0); B.kind='slam'; B.atk=Object.assign({}, BOSS_ATTACKS.slam, {hop:0}); B.beginAttack(P);
let maxLive=0, hits=0, hp=P.hp;
for(let i=0;i<60*5;i++){ step(1); maxLive=Math.max(maxLive, g.waves.filter(w=>w.live).length); if(P.hp<hp){hits++; hp=P.hp;} if(B.state===S_IDLE) B.idle_time=999; P.gx=0; P.gy=-560; }
ok(maxLive===SLAM_WAVES.count, 'wave count: '+maxLive); ok(hits>=1, 'wave hits a standing player');
r.waves={maxLive, hits, dmg:PLAYER_MAX_HP-P.hp};
// 4. phase 1 slam makes no waves
g.resetRound(); g.startFight(true); B.idle_time=999; B.gx=0; B.gy=0; P.gx=0; P.gy=-560;
B.chooseAttack(0); B.kind='slam'; B.atk=BOSS_ATTACKS.slam; B.beginAttack(P); step(200);
ok(!g.waves.some(w=>w.live) && P.hp===PLAYER_MAX_HP, 'no waves in phase 1'); r.phase1='ok';
// 5. dodging through a wave with i-frames avoids it
g.resetRound(); g.startFight(true); B.phase=2; B.idle_time=999; B.gx=0; B.gy=0; P.gx=0; P.gy=-400;
B.chooseAttack(0); B.kind='slam'; B.atk=Object.assign({}, BOSS_ATTACKS.slam, {hop:0}); B.beginAttack(P);
let rolled=false, hp5=P.hp;
for(let i=0;i<60*4;i++){
  const w=g.waves[0];
  if(!rolled && w.live && w.delay<=0 && w.r > 400-75){ P.stamina=STAM_MAX; g.press('dodge', Math.PI/2); rolled=true; }
  step(1); if(B.state===S_IDLE) B.idle_time=999;
  if (g.waves.filter(w=>w.live).length && !g.waves[0].live) break;
}
r.dodgeFirstWave = g.waves[0].hit ? 'hit' : 'avoided'; r.afterRollHitBy = g.waves.map(w=>w.hit);
// 5b. rolling into each wave in turn avoids all three
g.resetRound(); g.startFight(true); B.phase=2; B.idle_time=999; B.gx=0; B.gy=0; P.gx=0; P.gy=-400;
B.chooseAttack(0); B.kind='slam'; B.atk=Object.assign({}, BOSS_ATTACKS.slam, {hop:0}); B.beginAttack(P);
const hp5b=P.hp, rolledFor=new Set();
for(let i=0;i<60*6;i++){
  g.waves.forEach((w,k)=>{ if(!w.live||w.delay>0||rolledFor.has(k)) return;
    const d=hypot(P.gx-w.x,P.gy-w.y); if(w.r > d-60 && w.r < d && P.canAct() && k<2){ P.stamina=STAM_MAX; g.press('dodge', Math.atan2(w.y-P.gy, w.x-P.gx)); rolledFor.add(k);} });
  step(1); if(B.state===S_IDLE) B.idle_time=999;
}
ok(!g.waves[0].hit && !g.waves[1].hit, 'rolling in through both waves avoids them'); r.rollInward = 'ok';
// 6. retry resets to phase 1
g.resetRound(); g.startFight(true); ok(B.phase===1 && g.phaseMix===0 && !g.waves.some(w=>w.live), 'retry resets');
return r;`);
console.log(JSON.stringify(run(out,sounds),null,1));
