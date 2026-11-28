// Feasibility check for the attack clips: for every clip, sample the clock and compare what the clip asks for
// (grip position, blade direction, after the chest turn/lean) with what the anatomical arm IK could reach.
// usage: node tools/clip_check.js [weapon] [-v]
const fs = require('fs');
const src = ['config', 'mathx', 'gear', 'anim', 'rig', 'bossrig', 'logic'].map(f => fs.readFileSync(`src/${f}.js`, 'utf8')).join('\n');
const run = new Function('args', src + `
const g = new Game({ sfx: () => {}, haptic: () => {} }), p = g.player;
const weaps = args[0] ? [args[0]] : ['oathsword', 'greatsword', 'spear'], verbose = args[1] === '-v';
for (const wid of weaps) {
  g.inv.items[wid] = 1; g.equip('right', wid); const W = p.weapon;
  const moves = [['light', 0], ['light', 1], ['light', 2], ['heavy'], ['charged'], ['dodge']];
  for (const [kind, idx] of moves) {
    const mv = kind === 'light' ? W.light[idx] : W[kind];
    p.reset(); p.gx = 0; p.gy = -1500; p.facing = 0; p.state = S_IDLE; p.vx = p.vy = 0; p.stamina = 999;
    const dt = 1 / 120; let t = 1;
    for (let k = 0; k < 20; k++) { p.update(dt, t); p.animate(dt, t); t += dt; }
    p.startMove(kind, mv, 0, kind === 'light' ? idx : null);
    let worstG = [0, 0], worstB = [0, 0], rows = [], x0 = p.gx;
    while (p.state === S_WINDUP || p.state === S_ACTIVE || p.state === S_RECOVERY) {
      p.update(dt, t); p.move_dir = null; p.stamina = 999; p.animate(dt, t); t += dt;
      const x = moveClock(p.state, p.state_t, mv), R = p.rig, o = _pose;
      const ge = Math.hypot(o.grip.s - R.grip.s, o.grip.f - R.grip.f, o.grip.z - R.grip.z);
      const bl = Math.hypot(o.blade.s, o.blade.f, o.blade.z) || 1;
      const be = Math.acos(Math.max(-1, Math.min(1, (o.blade.s * R.blade.s + o.blade.f * R.blade.f + o.blade.z * R.blade.z) / bl))) / RAD;
      if (ge > worstG[0]) worstG = [ge, x]; if (be > worstB[0]) worstB = [be, x];
      if (verbose && rows.length < 400) rows.push(x.toFixed(2) + ' gripErr ' + ge.toFixed(1) + ' bladeErr ' + be.toFixed(0) + ' tipZ ' + (p.tipZ || 0).toFixed(0));
    }
    console.log((mv.anim || kind).padEnd(11), 'grip err max', worstG[0].toFixed(1).padStart(5), '@', worstG[1].toFixed(2), ' blade err max', worstB[0].toFixed(0).padStart(3), '@', worstB[1].toFixed(2), ' travel', (p.gx - x0).toFixed(0));
    if (verbose) console.log(rows.filter((_, i) => i % 6 === 0).join('\\n'));
  }
}`);
run(process.argv.slice(2));
