// Foes: they notice you, close in, take turns attacking, hurt you, die to your blade, drop loot, and stand again
// when you respawn. Run: node test/foes_test.js
const fs = require('fs');
const src = ['config', 'mathx', 'gear', 'anim', 'rig', 'bossrig', 'logic', 'foes'].map(f => fs.readFileSync(`src/${f}.js`, 'utf8')).join('\n');
const out = new Function(src + `
const sounds = []; const g = new Game({ sfx: (n) => sounds.push(n), haptic: () => {} }), p = g.player;
const ctl = { moveDir: null, moveMag: 0, sprint: false, aimDir: null, heavyHeld: -1 };
const r = { brains: {}, maxTokens: 0, playerHurt: 0, kills: 0, deadAll: false, respawned: false, inArena: 0 };
function step(n) { for (let i = 0; i < n; i++) { g.update(1 / 60, ctl); r.maxTokens = Math.max(r.maxTokens, g.foeTokens);
  for (const f of g.foes) if (f.gy > ROOMS.arena[1] + 1 && !f.gone) r.inArena++; } }
// walk north toward the hollows
p.gx = 0; p.gy = -1500; ctl.moveDir = Math.PI / 2; ctl.moveMag = 0.3; step(60);
for (const f of g.foes) r.brains[f.spawn.id] = f.brain;
// stand and fight: face the nearest foe and swing whenever possible, keep healthy
ctl.moveDir = null; ctl.moveMag = 0; const hp0 = p.hp;
for (let k = 0; k < 60 * 40; k++) {
  const live = g.foes.filter(f => f.alive && !f.gone && f.brain === 'engage');
  if (live.length) { const f = live.reduce((a, b) => Math.hypot(a.gx - p.gx, a.gy - p.gy) < Math.hypot(b.gx - p.gx, b.gy - p.gy) ? a : b);
    const d = Math.atan2(f.gy - p.gy, f.gx - p.gx), dist = Math.hypot(f.gx - p.gx, f.gy - p.gy);
    if (dist > 110) { ctl.moveDir = d; ctl.moveMag = 1; } else { ctl.moveDir = null; if (p.canAct()) g.press('light', d); } }
  else { ctl.moveDir = Math.PI / 2; ctl.moveMag = 1; }
  if (p.hp < hp0) r.playerHurt = 1;
  p.hp = p.maxHp; p.stamina = 100;
  step(1);
  if (g.foes.every(f => !f.alive)) { r.deadAll = true; break; }
}
r.kills = g.foes.filter(f => !f.alive).length;
r.loot = Object.keys(g.inv.flags).filter(k => k.startsWith('foe_'));
r.pickups = g.pickups.filter(pk => pk.temp).length;
r.sawCrunch = sounds.includes('crunch');
g.respawn(false); r.respawned = g.foes.every(f => f.alive && f.brain === 'idle' && !f.gone);
return r;`)();
console.log(JSON.stringify(out));
const ok = out.brains.hollow_w === 'engage' || out.brains.hollow_w === 'alert';
if (!ok || !out.playerHurt || out.kills < 4 || !out.respawned || out.maxTokens > 2 || out.inArena) { console.log('FAIL'); process.exit(1); }
console.log('ok');
