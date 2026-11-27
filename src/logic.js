// ============================================================ LOGIC
// Pure game state + rules. No canvas, audio or DOM in this file: the platform layer
// passes an `out` object ({sfx(name, vol), haptic(style, intensity)}) and reads state to draw.

// ---------------------------------------------------------------- particles (pure data)
class Pool {
  constructor(n, opt) {
    this.layer = opt.layer;               // 'top' | 'ground' | 'slash' | 'world'
    this.tex = opt.tex;
    this.blend = opt.blend || 'add';
    this.anchor = opt.anchor || [0.5, 0.5];
    this.free = []; this.active = [];
    for (let i = 0; i < n; i++) this.free.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, g: 0, drag: 0,
      a0: 1, s0: 1, s1: 1, align: false, fade: 1, rot: 0, w: opt.size[0], h: opt.size[1], color: '#ffffff',
      tex: opt.tex, alpha: 0, scale: 1, z: 0, flip: 1 });
  }
  spawn(o) {
    const p = this.free.length ? this.free.pop() : this.active.shift();
    p.x = o.x; p.y = o.y; p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.life = p.max = o.life || 0.3; p.g = o.g || 0; p.drag = o.drag || 0;
    p.a0 = p.alpha = (o.alpha === undefined ? 1 : o.alpha);
    p.s0 = p.scale = (o.s0 === undefined ? 1 : o.s0); p.s1 = (o.s1 === undefined ? p.s0 : o.s1);
    p.align = !!o.align; p.fade = (o.fade === undefined ? 1 : o.fade);
    p.rot = o.rot || 0; p.color = o.color || '#ffffff'; p.tex = o.tex || this.tex;
    if (o.size) { p.w = o.size[0]; p.h = o.size[1]; }
    p.z = o.z || 0; p.flip = o.flip || 1;
    this.active.push(p);
    return p;
  }
  clear() { while (this.active.length) { const p = this.active.pop(); p.alpha = 0; this.free.push(p); } }
  update(dt) {
    const act = this.active;
    let i = 0;
    while (i < act.length) {
      const p = act[i];
      p.life -= dt;
      if (p.life <= 0) { p.alpha = 0; act[i] = act[act.length - 1]; act.pop(); this.free.push(p); continue; }
      const t = 1 - p.life / p.max;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.align && (p.vx || p.vy)) p.rot = Math.atan2(p.vy, p.vx);
      p.alpha = p.fade < 0 ? p.a0 * Math.sin(Math.PI * t) : p.a0 * Math.pow(1 - t, p.fade);
      p.scale = p.s0 + (p.s1 - p.s0) * t;
      i++;
    }
  }
}

function slashSpan(m) {
  if (!m.slash || m.slash[0] !== 'arc' || m.motion[0] !== 'swing') return null;
  const span = Math.abs(m.motion[2] - m.motion[1]) + 20;
  return Math.min(350, Math.round(span / 10) * 10);
}

class FX {
  constructor(game) {
    this.g = game;
    this.sparks = new Pool(220, { layer: 'top', tex: 'spark', size: [32, 6] });
    this.glows = new Pool(24, { layer: 'top', tex: 'glow', size: [100, 100] });
    this.smoke = new Pool(96, { layer: 'top', tex: 'glowSoft', size: [40, 40], blend: 'normal' });
    this.rings = new Pool(12, { layer: 'ground', tex: 'ring', size: [120, 120] });
    this.slashes = new Pool(4, { layer: 'slash', tex: 'slash:170', size: [256, 256] });
    this.ghosts = new Pool(14, { layer: 'world', tex: 'knightSil:S', size: [64, 96], anchor: [0.5, 0.04] });
    this.embers = new Pool(30, { layer: 'top', tex: 'glow', size: [8, 8] });
    this.pools = [this.sparks, this.glows, this.smoke, this.rings, this.slashes, this.ghosts, this.embers];
  }
  hitBurst(x, y, base, heavy, gx, gy, sparks, flash) {
    for (let i = 0; i < sparks; i++) {
      const a = base + uniform(-1.1, 1.1), sp = uniform(220, 650) * (heavy ? 1.3 : 1);
      this.sparks.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + uniform(40, 220), life: uniform(0.18, 0.45),
        size: [uniform(14, 30), uniform(3, 5)], color: choice(SPARK_COLORS), g: -1300, drag: 2.5, s0: 1, s1: 0.3, align: true });
    }
    this.glows.spawn({ x, y, life: 0.12, size: [flash, flash], color: '#ffe9d6', alpha: 0.95, s0: 0.6, s1: 1.3 });
    this.glows.spawn({ x, y, life: 0.22, size: [flash * 1.6, flash * 1.6], color: CRIMSON, alpha: 0.6, s0: 0.5, s1: 1.2 });
    this.rings.spawn({ x: gx, y: gy, life: 0.32, size: [140, 140], color: '#ff4058', alpha: 0.9, s0: 0.3, s1: heavy ? 2.3 : 1.6, fade: 1.4 });
    if (heavy) this.rings.spawn({ x: gx, y: gy, life: 0.45, size: [140, 140], color: RUNE_GOLD, alpha: 0.6, s0: 0.2, s1: 3.0, fade: 1.2 });
  }
  dashBurst(p) {
    const back = groundToScreenAngle(p.dodge_dir + Math.PI), x = p.gx, y = p.gy * K + 6;
    for (let i = 0; i < 6; i++) {
      const a = back + uniform(-0.8, 0.8), sp = uniform(60, 180);
      this.smoke.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 + 20, life: uniform(0.3, 0.5),
        size: [36, 36], color: '#5c5766', alpha: 0.35, drag: 4, s0: 0.6, s1: 1.8 });
    }
    for (let i = 0; i < 8; i++) {
      const a = back + uniform(-0.6, 0.6), sp = uniform(200, 420);
      this.sparks.spawn({ x, y: y + 20, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: uniform(0.12, 0.25),
        size: [uniform(10, 20), 3], color: CRIMSON, drag: 5, s0: 1, s1: 0.2, align: true });
    }
  }
  ghost(p) { p.ghostSeq = (p.ghostSeq || 0) + 1; }
  /** Pistol fired: flash at the real muzzle, a few sparks down the barrel line, a puff of smoke. */
  muzzle(p) {
    const a = p.attack_dir, x = p.muzzleX, y = p.muzzleY * K + p.muzzleZ;
    this.glows.spawn({ x, y, life: 0.07, size: [64, 64], color: '#ffe0b0', alpha: 1, s0: 0.7, s1: 1.3 });
    this.glows.spawn({ x, y, life: 0.14, size: [120, 120], color: CRIMSON, alpha: 0.55, s0: 0.5, s1: 1.4 });
    const sa = groundToScreenAngle(a);
    for (let i = 0; i < 6; i++) {
      const d = sa + uniform(-0.35, 0.35), sp = uniform(260, 620);
      this.sparks.spawn({ x, y, vx: Math.cos(d) * sp, vy: Math.sin(d) * sp, life: uniform(0.06, 0.16), size: [uniform(10, 18), 2.5],
        color: choice(['#ffe0b0', '#ffb070', CRIMSON]), drag: 4, s0: 1, s1: 0.3, align: true });
    }
    this.smoke.spawn({ x: x + Math.cos(sa) * 6, y: y + Math.sin(sa) * 6, vx: Math.cos(sa) * 40, vy: Math.sin(sa) * 20 + 22, life: 0.6,
      size: [26, 26], color: '#5c5766', alpha: 0.35, drag: 2.5, s0: 0.5, s1: 1.8 });
  }
  /** A shot that ends without hitting the boss: a spark and a little dust where it stops. */
  shotEnd(x, y) {
    for (let i = 0; i < 5; i++) {
      const d = uniform(0, TAU), sp = uniform(80, 220);
      this.sparks.spawn({ x, y, vx: Math.cos(d) * sp, vy: Math.sin(d) * sp, life: uniform(0.08, 0.2), size: [7, 2], color: '#ffb070', drag: 5, s0: 1, s1: 0.2, align: true });
    }
    this.smoke.spawn({ x, y, vx: 0, vy: 18, life: 0.45, size: [22, 22], color: '#524d5c', alpha: 0.3, drag: 2, s0: 0.4, s1: 1.5 });
  }          // the renderer snapshots the body as an afterimage
  slash(p) {
    const m = p.move, sl = m.slash;
    if (!sl) return;
    const style = sl[0], col = SLASH_COLORS[sl[1]], heavy = m.heft >= 0.6, life = heavy ? 0.28 : 0.2;
    const a = p.attack_dir, shape = m.hitbox;
    if (style === 'arc') {
      const reach = shape[1], span = slashSpan(m) || 170, sz = reach * 2;
      const mid = m.motion[0] === 'swing' ? a + (m.motion[1] + m.motion[2]) * 0.5 * RAD : a;
      this.slashes.spawn({ x: p.gx, y: p.gy + 24 / K, life, size: [sz, sz], color: col, alpha: 0.95, s0: 0.82, s1: 1.06,
        rot: mid, fade: 1.6, tex: 'slash:' + span });
    } else if (style === 'thrust') {
      const L = shape[1], cx = p.gx + Math.cos(a) * L * 0.5, cy = p.gy + Math.sin(a) * L * 0.5;
      this.slashes.spawn({ x: cx, y: cy + 24 / K, life, size: [L, heavy ? 26 : 18], color: col, alpha: 1, s0: 0.7, s1: 1.05,
        rot: a, fade: 1.4, tex: 'spark' });
      const tx = p.gx + Math.cos(a) * L, ty = p.gy + Math.sin(a) * L;
      this.glows.spawn({ x: tx, y: ty * K + 24, life: 0.14, size: [70, 70], color: col, alpha: 0.8, s0: 0.5, s1: 1.2 });
    } else {
      const L = shape[1] * 0.8, tx = p.gx + Math.cos(a) * L, ty = p.gy + Math.sin(a) * L;
      this.rings.spawn({ x: tx, y: ty, life: 0.35, size: [150, 150], color: col, alpha: 0.9, s0: 0.2, s1: 1.4 });
      for (let i = 0; i < 10; i++) {
        const ang = uniform(0.4, Math.PI - 0.4), sp = uniform(150, 380);
        this.sparks.spawn({ x: tx, y: ty * K + 6, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: uniform(0.2, 0.4),
          size: [uniform(10, 20), 3], color: col, g: -1300, drag: 2, s0: 1, s1: 0.3, align: true });
      }
    }
  }
  bossSlash(b) {
    const sz = BOSS_ATTACKS.sweep.range * 2;
    this.slashes.spawn({ x: b.gx, y: b.gy + 60 / K, life: 0.3, size: [sz, sz], color: CRIMSON, alpha: 1, s0: 0.85, s1: 1.05,
      rot: b.attack_dir, fade: 1.4, tex: 'slash:170' });
  }
  slamImpact(gx, gy, R) {
    const sz = 2 * R / 0.8;
    this.rings.spawn({ x: gx, y: gy, life: 0.4, size: [sz, sz], color: CRIMSON, alpha: 1, s0: 0.15, s1: 1.0, fade: 1.3 });
    this.rings.spawn({ x: gx, y: gy, life: 0.6, size: [sz, sz], color: RUNE_GOLD, alpha: 0.7, s0: 0.1, s1: 1.25, fade: 1.2 });
    const x = gx, y = gy * K;
    for (let i = 0; i < 18; i++) {
      const a = i * TAU / 18 + uniform(-0.1, 0.1), sp = uniform(200, 300);
      this.smoke.spawn({ x, y: y + 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * K, life: uniform(0.45, 0.7),
        size: [48, 48], color: '#524d5c', alpha: 0.4, drag: 3, s0: 0.7, s1: 2.0 });
    }
    for (let i = 0; i < 30; i++) {
      const a = uniform(0.3, Math.PI - 0.3), sp = uniform(250, 650);
      this.sparks.spawn({ x: x + uniform(-40, 40), y: y + 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: uniform(0.25, 0.6),
        size: [uniform(14, 28), 4], color: choice(SPARK_COLORS), g: -1400, drag: 1.5, s0: 1, s1: 0.3, align: true });
    }
    this.glows.spawn({ x, y: y + 20, life: 0.18, size: [280, 280], color: CRIMSON, alpha: 0.8, s0: 0.5, s1: 1.2 });
  }
  lanceTrail(b) {
    const x = b.gx, y = b.gy * K + 40, back = groundToScreenAngle(b.attack_dir + Math.PI);
    for (let i = 0; i < 3; i++) {
      const a = back + uniform(-0.6, 0.6), sp = uniform(40, 160);
      this.sparks.spawn({ x: x + uniform(-30, 30), y: y + uniform(-30, 40), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + uniform(20, 80),
        life: uniform(0.3, 0.6), size: [uniform(8, 16), 3], color: choice([CRIMSON, '#ffb070', '#ff5a6a']), drag: 2, s0: 1, s1: 0.2, align: true });
    }
    const s = uniform(6, 11);
    this.embers.spawn({ x: x + uniform(-20, 20), y: y + uniform(-20, 40), vx: uniform(-20, 20), vy: uniform(30, 70), life: uniform(0.6, 1.0),
      size: [s, s], color: CRIMSON, alpha: 0.8, fade: -1 });
  }
  hurtBurst(p, angle) {
    const x = p.gx, y = p.gy * K + 50, sa = groundToScreenAngle(angle);
    for (let i = 0; i < 14; i++) {
      const a = sa + uniform(-0.9, 0.9), sp = uniform(180, 480);
      this.sparks.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + uniform(30, 150), life: uniform(0.18, 0.4),
        size: [uniform(12, 24), 4], color: choice([CRIMSON, '#ff5a6a', '#ffffff']), g: -1200, drag: 2.5, s0: 1, s1: 0.3, align: true });
    }
    this.glows.spawn({ x, y, life: 0.2, size: [150, 150], color: CRIMSON, alpha: 0.75, s0: 0.5, s1: 1.3 });
  }
  heal(p) {
    const x = p.gx, y = p.gy * K;
    for (let i = 0; i < 16; i++) {
      const s = uniform(6, 12);
      this.embers.spawn({ x: x + uniform(-26, 26), y: y + uniform(0, 40), vx: uniform(-10, 10), vy: uniform(60, 130),
        life: uniform(0.6, 1.0), size: [s, s], color: choice([CRIMSON, '#ff8a96', RUNE_GOLD]), alpha: 0.9, fade: -1 });
    }
    this.rings.spawn({ x: p.gx, y: p.gy, life: 0.5, size: [110, 110], color: '#ff5a6a', alpha: 0.8, s0: 0.3, s1: 1.4 });
    this.glows.spawn({ x, y: y + 50, life: 0.4, size: [140, 140], color: CRIMSON, alpha: 0.6, s0: 0.6, s1: 1.2 });
  }
  staggerBurst(b) {
    const x = b.gx, y = b.gy * K + SENTINEL_CORE_Y;
    for (let i = 0; i < 28; i++) {
      const a = uniform(0, TAU), sp = uniform(200, 560);
      this.sparks.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: uniform(0.25, 0.6), size: [uniform(14, 30), 4],
        color: choice([RUNE_GOLD, '#ffe7c2', '#ffffff']), g: -900, drag: 2, s0: 1, s1: 0.3, align: true });
    }
    this.rings.spawn({ x: b.gx, y: b.gy, life: 0.6, size: [220, 220], color: RUNE_GOLD, alpha: 0.9, s0: 0.3, s1: 2.2 });
    this.glows.spawn({ x, y, life: 0.3, size: [220, 220], color: '#ffe9d6', alpha: 0.9, s0: 0.5, s1: 1.4 });
  }
  deathBurst(b) {
    const x = b.gx, y = b.gy * K + SENTINEL_CORE_Y;
    for (let i = 0; i < 60; i++) {
      const a = uniform(0, TAU), sp = uniform(150, 700);
      this.sparks.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: uniform(0.4, 0.9), size: [uniform(16, 34), 4],
        color: choice(SPARK_COLORS), g: -700, drag: 1.5, s0: 1, s1: 0.3, align: true });
    }
    const cols = [CRIMSON, RUNE_GOLD, '#ffffff'];
    for (let k = 0; k < 3; k++) this.rings.spawn({ x: b.gx, y: b.gy, life: 0.6 + 0.25 * k, size: [260, 260], color: cols[k], alpha: 0.9, s0: 0.2, s1: 2.5 + k });
    this.glows.spawn({ x, y, life: 0.5, size: [360, 360], color: '#ffe9d6', alpha: 1, s0: 0.4, s1: 1.5 });
    this.glows.spawn({ x, y, life: 0.9, size: [420, 420], color: CRIMSON, alpha: 0.7, s0: 0.5, s1: 1.6 });
  }
  sprintDust(p) {
    const back = groundToScreenAngle(p.facing + Math.PI);
    this.smoke.spawn({ x: p.gx + uniform(-8, 8), y: p.gy * K + 4, vx: Math.cos(back) * 60, vy: Math.sin(back) * 30 + 15,
      life: uniform(0.3, 0.45), size: [26, 26], color: '#575161', alpha: 0.3, drag: 3, s0: 0.5, s1: 1.4 });
  }
  rally(p, amount) {
    const x = p.gx, y = p.gy * K;
    for (let i = 0; i < 4 + amount * 0.3; i++) {
      const s = uniform(5, 9);
      this.embers.spawn({ x: x + uniform(-20, 20), y: y + uniform(10, 60), vx: uniform(-15, 15), vy: uniform(50, 110),
        life: uniform(0.4, 0.7), size: [s, s], color: choice(['#ff9a4a', '#ffb070', CRIMSON]), alpha: 0.9, fade: -1 });
    }
  }
  visceral(b, angle) {
    const x = b.gx, y = b.gy * K + SENTINEL_CORE_Y * 0.8, sa = groundToScreenAngle(angle);
    for (let i = 0; i < 60; i++) {
      const a = sa + uniform(-1, 1), sp = uniform(250, 900);
      this.sparks.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + uniform(0, 300), life: uniform(0.3, 0.8),
        size: [uniform(14, 34), uniform(4, 6)], color: choice([CRIMSON, '#b3202f', '#ff5a6a', '#ffffff']), g: -1400, drag: 1.8, s0: 1, s1: 0.35, align: true });
    }
    this.glows.spawn({ x, y, life: 0.35, size: [300, 300], color: CRIMSON, alpha: 1, s0: 0.4, s1: 1.4 });
    this.glows.spawn({ x, y, life: 0.15, size: [180, 180], color: '#ffffff', alpha: 0.9, s0: 0.5, s1: 1.2 });
    this.rings.spawn({ x: b.gx, y: b.gy, life: 0.6, size: [240, 240], color: CRIMSON, alpha: 1, s0: 0.3, s1: 2.4 });
  }
  clear() { for (const p of [this.sparks, this.glows, this.smoke, this.rings, this.slashes, this.ghosts]) p.clear(); }
  update(dt, camx, camy) {
    while (this.embers.active.length < 26) {
      const s = uniform(4, 9);
      this.embers.spawn({ x: camx + uniform(-620, 620), y: camy * K + uniform(-340, 280), vx: uniform(-12, 12), vy: uniform(14, 42),
        life: uniform(2, 4.5), size: [s, s], color: choice([CRIMSON, '#8A2432', RUNE_GOLD]), alpha: uniform(0.25, 0.6), fade: -1 });
    }
    for (const pool of this.pools) pool.update(dt);
  }
}

// ---------------------------------------------------------------- player
class Player {
  constructor(game) { this.g = game; this.setWeapon(WEAPON_ORDER[0]); this.reset(); }
  setWeapon(key) { this.weaponKey = key; this.weapon = WEAPONS[key]; this.combo = -1; this.combo_expire_t = -1; }
  reset() {
    [this.gx, this.gy] = PLAYER_START;
    this.vx = this.vy = 0; this.facing = Math.PI / 2; this.state = S_IDLE; this.state_t = 0;
    this.hp = PLAYER_MAX_HP; this.hp_lag = PLAYER_MAX_HP; this.hp_lag_hold = 0;
    this.stamina = STAM_MAX; this.stam_delay = 0; this.stam_lag = STAM_MAX; this.stam_lag_hold = 0;
    this.flasks = FLASK_CHARGES; this.bullets = BULLETS_MAX; this.item_key = 'firebomb';
    this.gunReady = 0; this.aimHold = false; this.gunKick = 0; this.gunDrawn = false; this.gunPitch = 0;
    this.items = {}; for (const k in ITEMS) this.items[k] = 0;
    this.kind = null; this.move = null; this.attack_dir = this.facing; this.combo = -1; this.combo_expire_t = -1;
    this.dodge_end_t = -10; this.hit_done = false; this.dodge_dir = 0; this.ghost_t = 0; this.invuln = false;
    this.hurt_iframes = 0; this.knock_dir = 0; this.aim_dir = null; this.move_dir = null; this.move_mag = 0;
    this.charging = 0; this.sprint_req = false; this.sprinting = false; this.sprint_block = false; this.sprint_t = -10;
    this.dust_t = 0; this.rally = 0; this.rally_hold = 0; this.dodge_prof = DODGE_ROLL;
    this.visc_from = [0, 0]; this.visc_to = [0, 0];
    this.octant = null; this.view = 'N'; this.flip = 1;
    if (!this.rig) this.rig = new Rig();
    this.rig._elPrev.R.ok = this.rig._elPrev.L.ok = false;
    this.rigDir = null; this.walkPhase = 0; this.walkAmp = 0;
    if (!this.gear) this.setGear(STARTER_GEAR);
    this.sword_angle = this.facing + 2.35 + Math.PI; this.sword_rot = Math.PI / 2; this.sword_r = 24;
    this.sword_elev = 36; this.sword_up = 1; this.sword_scale = 0.88; this.swordGlow = 0.25;
    // pose (read by the renderer)
    this.bodySX = 1; this.bodySY = 1; this.bodyRot = 0; this.bodyAlpha = 1; this.glowColor = CRIMSON; this.glowAlpha = 0;
    this.visorX = 0; this.visorY = 68; this.visorSX = 1; this.visorAlpha = 1; this.visorGlow = 0.6;
    this.swordX = 0; this.swordY = 0; this.swordZ = 1;
    this.animate(0, 0);
  }
  /** Equip a full loadout (slot -> id). Works out which pictures each rig part draws, back to front. */
  setGear(loadout) {
    this.gear = Object.assign({}, loadout);
    this.rigLayers = {};
    for (const part in PART_ART) {
      const fam = PART_ART[part], list = ['base'];
      for (const slot of GEAR_SLOTS) { const id = this.gear[slot]; if (id && GEAR[id] && GEAR[id].parts.indexOf(part) >= 0) list.push(id); }
      this.rigLayers[part] = list.map(src => [src, fam]);
    }
    // simulated cloth that the worn pieces bring (cape from the back slot, tabard from the chest, ...)
    this.cloths = {};
    for (const slot of GEAR_SLOTS) {
      const id = this.gear[slot], cl = id && GEAR[id] && GEAR[id].cloths;
      if (cl) for (const name in cl) this.cloths[name] = new Cloth(cl[name]);
    }
  }
  /** Snap to a new facing and carry the weapon round with him, so it never starts an attack behind his back. */
  turnTo(d) { this.facing = d; }                       // animateSword carries the weapon round with the turn
  get invulnerable() {
    if (this.kind === 'visceral' && (this.state === S_WINDUP || this.state === S_ACTIVE || this.state === S_RECOVERY)) return true;
    return this.invuln || this.hurt_iframes > 0 || this.state === S_DEAD;
  }
  get alive() { return this.state !== S_DEAD; }
  enter(s) { this.state = s; this.state_t = 0; }
  canAct() {
    if (this.state === S_IDLE || this.state === S_MOVE) return true;
    return this.state === S_RECOVERY && this.state_t >= this.move.cancel;
  }
  spent(cost) {
    this.stamina = Math.max(0, this.stamina - cost * STAMINA_COST_MULT);
    this.stam_delay = STAM_DELAY; this.stam_lag_hold = 0.45;
  }
  nextLight(t) {
    const w = this.weapon;
    if (t - this.dodge_end_t <= DODGE_ATTACK_WINDOW || t - this.sprint_t <= 0.12) return ['dodge', 0, w.dodge];
    const chain = w.light, idx = t <= this.combo_expire_t ? (this.combo + 1) % chain.length : 0;
    return ['light', idx, chain[idx]];
  }
  heavyMove(charged) { return this.weapon[charged ? 'charged' : 'heavy']; }
  startMove(kind, mv, d, comboIdx) {
    if (mv.stamina > 0) this.spent(mv.stamina);
    this.kind = kind; this.move = mv;
    if (comboIdx !== undefined && comboIdx !== null) this.combo = comboIdx;
    else if (kind === 'heavy' || kind === 'charged') this.combo = -1;
    if (kind !== 'flask') { this.attack_dir = d; this.turnTo(d); }
    this.hit_done = false; this.charging = 0; this.enter(S_WINDUP);
  }
  startDodge(d) {
    const prof = this.dodge_prof = DODGE_ROLL;
    this.spent(prof.stamina); this.dodge_dir = d; this.turnTo(d); this.ghost_t = 0; this.charging = 0;
    this.sprinting = false; this.enter(S_DODGE);
  }
  startVisceral(b) {
    const a = Math.atan2(b.gy - this.gy, b.gx - this.gx);
    this.startMove('visceral', VISCERAL_MOVE, a);
    const stand = b.RADIUS + PLAYER_RADIUS + 10;
    this.visc_from = [this.gx, this.gy];
    this.visc_to = [b.gx - Math.cos(a) * stand, b.gy - Math.sin(a) * stand];
  }
  regain(amount) {
    const g = Math.min(this.rally, amount, PLAYER_MAX_HP - this.hp);
    if (g > 0) { this.hp += g; this.rally -= g; return g; }
    return 0;
  }
  takeHit(dmg, angle, knock) {
    const lost = Math.min(this.hp, dmg);
    this.hp = Math.max(0, this.hp - dmg);
    this.rally = Math.min(PLAYER_MAX_HP - this.hp, this.rally + lost);
    this.rally_hold = RALLY_GRACE; this.sprinting = false; this.hp_lag_hold = 0.5;
    this.hurt_iframes = HURT_IFRAMES; this.invuln = false; this.charging = 0;
    const hyper = (this.state === S_WINDUP || this.state === S_ACTIVE) && this.move && this.move.hyper;
    if (hyper && this.hp > 0) return;                 // hyper armour: take the damage, keep swinging
    this.knock_dir = angle; this.vx = Math.cos(angle) * knock; this.vy = Math.sin(angle) * knock;
    this.turnTo(angle + Math.PI);
    if (this.hp <= 0) this.rally = 0;
    this.enter(this.hp <= 0 ? S_DEAD : S_HURT);
  }

  /** Pushed by a shockwave: no damage, but it interrupts whatever you were doing. */
  shove(angle, knock) {
    if (!this.alive) return;
    this.charging = 0; this.sprinting = false; this.invuln = false;
    this.knock_dir = angle; this.vx = Math.cos(angle) * knock; this.vy = Math.sin(angle) * knock;
    this.turnTo(angle + Math.PI);
    this.enter(S_HURT);
  }

  update(dt, t) {
    this.state_t += dt;
    if (this.hurt_iframes > 0) this.hurt_iframes -= dt;
    const st = this.state, mv = this.move;
    // holding the pistol button: draw and aim (left stick steers the aim while he walks slowly)
    const aiming = this.aimHold && this.bullets > 0 && (st === S_IDLE || st === S_MOVE || (this.kind === 'shoot' && st === S_RECOVERY));
    this.gunReady = aiming ? Math.min(1, this.gunReady + dt / GUN_AIM.draw) : Math.max(0, this.gunReady - dt / GUN_AIM.holster);
    this.gunKick *= Math.exp(-dt * 11);
    if (st === S_IDLE || st === S_MOVE) {
      if (this.sprint_block && this.stamina >= SPRINT_MIN) this.sprint_block = false;
      this.sprinting = this.sprint_req && this.move_dir !== null && this.charging <= 0 && !this.sprint_block && this.stamina > 0;
      if (this.move_dir !== null) {
        if (aiming) this.sprinting = false;
        let spd = PLAYER_SPEED * this.weapon.speed * this.move_mag * (aiming ? GUN_AIM.walk : 1);
        if (this.sprinting) spd = PLAYER_SPEED * this.weapon.speed * SPRINT_MULT;
        else if (this.charging > 0) spd *= CHARGE_WALK;
        this.vx = smooth(this.vx, Math.cos(this.move_dir) * spd, 18, dt);
        this.vy = smooth(this.vy, Math.sin(this.move_dir) * spd, 18, dt);
        if (st !== S_MOVE) this.enter(S_MOVE);
      } else {
        this.vx = smooth(this.vx, 0, 16, dt); this.vy = smooth(this.vy, 0, 16, dt);
        if (st !== S_IDLE) this.enter(S_IDLE);
      }
      if (this.sprinting) this.facing = approachAngle(this.facing, this.move_dir, 14 * dt);
      else if (this.aim_dir !== null) this.facing = approachAngle(this.facing, this.aim_dir, 18 * dt);
      else if (this.move_dir !== null) this.facing = approachAngle(this.facing, this.move_dir, 14 * dt);
      if (this.sprinting) {
        this.sprint_t = t;
        this.stamina = Math.max(0, this.stamina - SPRINT_DRAIN * dt);
        this.stam_delay = STAM_DELAY * 0.6; this.stam_lag_hold = 0.2;
        if (this.stamina <= 0) this.sprint_block = true;
        this.dust_t -= dt;
        if (this.dust_t <= 0) { this.dust_t = 0.11; this.g.fx.sprintDust(this); }
      } else if (this.stam_delay > 0) this.stam_delay -= dt;
      else this.stamina = Math.min(STAM_MAX, this.stamina + STAM_REGEN * (this.state === S_MOVE ? 0.9 : 1) * dt);
    } else if (st === S_WINDUP) {
      this.sprinting = false;
      if (this.kind === 'visceral') {
        const q = clamp(this.state_t / mv.windup, 0, 1), e = q * q * (3 - 2 * q);
        this.vx = this.vy = 0;
        this.gx = this.visc_from[0] + (this.visc_to[0] - this.visc_from[0]) * e;
        this.gy = this.visc_from[1] + (this.visc_to[1] - this.visc_from[1]) * e;
      } else { this.vx = smooth(this.vx, 0, 20, dt); this.vy = smooth(this.vy, 0, 20, dt); }
      if (this.state_t >= mv.windup) { this.enter(S_ACTIVE); this.g.onSwing(this); }
    } else if (st === S_ACTIVE) {
      const p = clamp(this.state_t / mv.active, 0, 1), spd = mv.lunge * (1 - p);
      this.vx = Math.cos(this.attack_dir) * spd; this.vy = Math.sin(this.attack_dir) * spd;
      if (this.state_t >= mv.active) {
        this.enter(S_RECOVERY);
        if (this.kind === 'light' || this.kind === 'dodge') this.combo_expire_t = t + mv.recovery + COMBO_WINDOW;
      }
    } else if (st === S_RECOVERY) {
      this.vx = smooth(this.vx, 0, 14, dt); this.vy = smooth(this.vy, 0, 14, dt);
      if (this.state_t >= mv.cancel && this.move_dir !== null) this.enter(S_MOVE);
      else if (this.state_t >= mv.recovery) this.enter(S_IDLE);
    } else if (st === S_DODGE) {
      const prof = this.dodge_prof, p = clamp(this.state_t / prof.time, 0, 1), spd = prof.speed * Math.pow(1 - p, 1.4);
      this.vx = Math.cos(this.dodge_dir) * spd; this.vy = Math.sin(this.dodge_dir) * spd;
      this.invuln = prof.iframes[0] <= this.state_t && this.state_t <= prof.iframes[1];
      this.ghost_t -= dt;
      if (this.ghost_t <= 0 && this.state_t < prof.time * 0.85) { this.ghost_t = prof.ghost; this.g.fx.ghost(this); }
      if (this.state_t >= prof.time) { this.invuln = false; this.dodge_end_t = t; this.enter(S_IDLE); }
    } else if (st === S_HURT) {
      this.vx = smooth(this.vx, 0, 7, dt); this.vy = smooth(this.vy, 0, 7, dt);
      if (this.state_t >= HURT_TIME) this.enter(S_IDLE);
    } else if (st === S_DEAD) {
      this.vx = smooth(this.vx, 0, 6, dt); this.vy = smooth(this.vy, 0, 6, dt);
    }
    this.gx += this.vx * dt; this.gy += this.vy * dt;
    [this.stam_lag, this.stam_lag_hold] = lagBar(this.stam_lag, this.stam_lag_hold, this.stamina, 70, dt);
    [this.hp_lag, this.hp_lag_hold] = lagBar(this.hp_lag, this.hp_lag_hold, this.hp, 45, dt);
    if (this.rally > 0) {
      if (this.rally_hold > 0) this.rally_hold -= dt;
      else this.rally = Math.max(0, this.rally - RALLY_DECAY * dt);
    }
    if (st !== S_IDLE && st !== S_MOVE) this.sprinting = false;
  }

  animate(dt, t) {
    const st = this.state, mv = this.move;
    const sr = Math.min(1, hypot(this.vx, this.vy) / PLAYER_SPEED);
    const bil = Math.sin(t * 7.5) * (0.02 + 0.045 * sr);
    let sx = 1 + bil, sy = 1 - bil * 0.5 + Math.sin(t * 2.2) * 0.012;
    let lean = clamp(-this.vx * 0.0007, -0.2, 0.2);
    const flask = this.kind === 'flask', tool = this.kind === 'shoot' || this.kind === 'item';
    const heft = (mv && (st === S_WINDUP || st === S_ACTIVE || st === S_RECOVERY)) ? mv.heft : 0;
    let glowCol = CRIMSON, glowA = 0, charge = 0;
    if (st === S_WINDUP) {
      const p = clamp(this.state_t / mv.windup, 0, 1);
      if (flask) { sy *= 1 + 0.03 * p; lean = 0.06 * Math.sin(p * Math.PI); glowA = 0.12 * p; }
      else if (tool) lean += Math.cos(this.attack_dir) * 0.1 * p;
      else { sy *= 1 - 0.07 * p * heft; sx *= 1 + 0.05 * p * heft; lean += Math.cos(this.attack_dir) * 0.12 * p; }
    } else if (st === S_ACTIVE) {
      if (flask) glowA = 0.22;
      else if (tool) lean += Math.cos(this.attack_dir) * (this.kind === 'shoot' ? 0.14 : -0.16);
      else { sy *= 1 + 0.05 * (0.5 + heft); lean -= Math.cos(this.attack_dir) * (0.14 + 0.08 * heft); }
    } else if (st === S_DODGE) { sy *= 0.86; sx *= 1.08; lean = -Math.cos(this.dodge_dir) * 0.35; }
    else if (st === S_HURT) {
      lean = -Math.cos(this.knock_dir) * 0.3; sy *= 0.94;
      if (this.state_t < 0.12) { glowCol = '#ffffff'; glowA = 0.7; }
    } else if (st === S_DEAD) {
      const k = Math.min(1, this.state_t / 0.8);
      lean = (Math.cos(this.knock_dir) < 0 ? 1.25 : -1.25) * k; sy *= 1 - 0.15 * k;
    }
    if (this.sprinting) { sy *= 0.96; lean = clamp(-this.vx * 0.0011, -0.3, 0.3); }
    if (this.charging > 0 && (st === S_IDLE || st === S_MOVE)) {
      const c = clamp((this.charging - CHARGE_START) / (CHARGE_FULL - CHARGE_START), 0, 1);
      sy *= 1 - 0.08 * c; sx *= 1 + 0.05 * c; lean += Math.cos(this.facing) * 0.1 * c; charge = c;
    }
    this.pickView();
    this.bodySX = sx * this.flip; this.bodySY = sy;
    this.bodyRot = dt > 0 ? smooth(this.bodyRot, lean, st === S_DEAD ? 6 : 18, dt) : lean;
    const vis = VISOR[this.view];
    if (!vis || st === S_DEAD) this.visorAlpha = 0;
    else { this.visorAlpha = 1; this.visorX = vis[0]; this.visorY = vis[1]; this.visorSX = vis[2]; }
    this.visorGlow = this.visorAlpha * (0.55 + 0.25 * Math.sin(t * 5));
    if (st === S_DEAD) { this.bodyAlpha = dt > 0 ? smooth(this.bodyAlpha, 0.55, 3, dt) : 0.55; this.glowAlpha = 0; }
    else if (this.invuln) { this.bodyAlpha = 0.5; this.glowColor = CRIMSON; this.glowAlpha = 0.45; }
    else {
      if (this.hurt_iframes > 0) this.bodyAlpha = ((t * 18) | 0) % 2 ? 0.45 : 0.95;
      else this.bodyAlpha = dt > 0 ? smooth(this.bodyAlpha, 1, 12, dt) : 1;
      this.glowColor = glowCol;
      this.glowAlpha = dt > 0 ? smooth(this.glowAlpha, glowA, 14, dt) : 0;
    }
    this.animateSword(dt, t, charge);
    poseRig(this, dt, t);
  }
  pickView() {
    const n = pickOctant(this.facing, this.octant);
    if (n !== this.octant) { this.octant = n; [this.view, this.flip] = OCTANTS[n]; }
  }
  animateSword(dt, t, charge) {
    const st = this.state, mv = this.move;
    // whatever turned him this frame (a snap into an attack, a hit, steering) turns the weapon with him,
    // so it is never left behind his back for the first frames of a move
    if (this._lastFacing !== undefined) {
      const turn = wrap(this.facing - this._lastFacing);
      this.sword_angle += turn; if (this.bladeH !== undefined) this.bladeH += turn;
    }
    this._lastFacing = this.facing;
    const side = -0.9 - Math.PI;                      // rest on his right-front side (right hand)
    const resting = st === S_IDLE || st === S_MOVE || st === S_HURT ||
      (mv && mv.motion[0] === 'rest' && (st === S_WINDUP || st === S_ACTIVE || st === S_RECOVERY));
    let direct = false, r_t, e_t, up_t, sc_t, glow_t, point = null;
    if (st === S_DEAD) {
      this.sword_angle = approachAngle(this.sword_angle, this.facing + side + Math.PI, 4 * dt);
      r_t = 34; e_t = 3; up_t = 0; sc_t = 0.9; glow_t = 0;
    } else if (resting) {
      let tgt, rate;
      if (this.aim_dir !== null && (st === S_IDLE || st === S_MOVE)) { tgt = this.aim_dir; r_t = 40; e_t = 30; up_t = 0; sc_t = 1; rate = 16; }
      else {
        // each weapon has its own carry: a standing guard, blending to a moving carry with speed
        const S = this.weapon.stance, A = S.rest, B = S.move, m = clamp(hypot(this.vx, this.vy) / PLAYER_SPEED, 0, 1);
        const mix = (u, v) => u + (v - u) * m;
        tgt = this.facing + mix(A.off, B.off); r_t = mix(A.r, B.r); e_t = mix(A.elev, B.elev) + Math.sin(t * 2.2) * A.sway * (1 - m);
        up_t = mix(A.up, B.up); sc_t = 0.9; rate = 8; point = this.facing + mix(A.point, B.point);
      }
      this.sword_angle = approachAngle(this.sword_angle, tgt, rate * dt);
      glow_t = 0.22 + 0.06 * Math.sin(t * 3);
      if (this.charging > 0) sc_t = 1 + 0.1 * charge;
    } else if (st === S_DODGE) {
      const D = this.weapon.stance.dash;
      this.sword_angle = approachAngle(this.sword_angle, this.dodge_dir + D.off, 18 * dt);
      r_t = D.r; e_t = D.elev; up_t = D.up; sc_t = 0.9; glow_t = 0.5; point = this.dodge_dir + D.point;
    } else {
      const kind = mv.motion[0], heft = mv.heft, reach = mv.reach, a = this.attack_dir;
      sc_t = 1 + 0.15 * heft;
      if (st === S_WINDUP) {
        const p = clamp(this.state_t / mv.windup, 0, 1);
        glow_t = 0.4 + 0.6 * p * Math.max(heft, 0.3);
        let tgt = a;
        if (kind === 'swing') { tgt = a + mv.motion[1] * RAD * 1.1; r_t = 32 - 6 * heft; e_t = 32 + 26 * heft * p; up_t = 0; }
        else if (kind === 'thrust') { r_t = 8; e_t = 30; up_t = 0; }
        else { r_t = 14; e_t = 62 + 14 * p; up_t = 1; }
        this.sword_angle = approachAngle(this.sword_angle, tgt, 26 * dt);
      } else if (st === S_ACTIVE) {
        direct = true;
        const p = clamp(this.state_t / mv.active, 0, 1), e = 1 - Math.pow(1 - p, 3);
        glow_t = 0.85 + 0.15 * heft;
        if (kind === 'swing') {
          const a0 = mv.motion[1] * RAD, a1 = mv.motion[2] * RAD;
          this.sword_angle = a + a0 + (a1 - a0) * e; r_t = reach; e_t = 26; up_t = 0;
        } else if (kind === 'thrust') { this.sword_angle = a; r_t = 8 + (reach - 8) * Math.min(1, p * 2.5); e_t = 28; up_t = 0; }
        else { this.sword_angle = a; r_t = 14 + (reach - 14) * e; e_t = 76 - 62 * e; up_t = 1 - e; }
      } else {
        glow_t = 0.3;
        let tgt = a;
        if (kind === 'swing') { tgt = a + mv.motion[2] * RAD; r_t = 34; e_t = 28; up_t = 0; }
        else if (kind === 'thrust') { r_t = 34; e_t = 30; up_t = 0; }
        else { r_t = reach * 0.8; e_t = 14; up_t = 0; }
        this.sword_angle = approachAngle(this.sword_angle, tgt, 6 * dt);
      }
    }
    if (dt > 0) {
      if (direct) { this.sword_r = r_t; this.sword_elev = e_t; this.sword_up = up_t; }
      else {
        this.sword_r = smooth(this.sword_r, r_t, 10, dt); this.sword_elev = smooth(this.sword_elev, e_t, 10, dt);
        this.sword_up = smooth(this.sword_up, up_t, 8, dt);
      }
      this.sword_scale = smooth(this.sword_scale, sc_t, 12, dt);
      this.swordGlow = smooth(this.swordGlow, glow_t, 14, dt);
    }
    const a = this.sword_angle;
    this.swordX = Math.cos(a) * this.sword_r;
    this.swordY = Math.sin(a) * this.sword_r * K + this.sword_elev;
    const radial = groundToScreenAngle(point === null ? a : point);       // stances aim the blade on their own
    // 3D blade direction for the jointed body: horizontal heading + elevation (up 1 = straight up, -1 = tip down)
    const bh_t = point === null ? a : point;
    this.bladeH = (direct || dt === 0 || this.bladeH === undefined) ? bh_t : approachAngle(this.bladeH, bh_t, 18 * dt);
    this.bladeE = this.sword_up * Math.PI / 2 * 0.95;
    const upright = Math.PI / 2 - 0.3 * (Math.cos(a) > 0 ? 1 : -1) + 0.1 * Math.sin(t * 1.7);
    const rot_t = this.sword_up >= 0 ? radial + wrap(upright - radial) * this.sword_up
      : radial + wrap(-Math.PI / 2 - radial) * -this.sword_up;          // negative tilt: tip toward the floor
    if (direct || dt === 0) this.sword_rot = rot_t;
    else this.sword_rot = approachAngle(this.sword_rot, rot_t, (st === S_WINDUP ? 30 : 14) * dt);
    this.swordZ = Math.sin(a) > 0.1 ? -1 : 1;
  }
}

// ---------------------------------------------------------------- boss
class Boss {
  constructor(game) { this.g = game; this.RADIUS = BOSS_RADIUS; this.reset(); }
  reset() {
    [this.gx, this.gy] = BOSS_START;
    this.vx = this.vy = 0; this.facing = -Math.PI / 2; this.state = S_IDLE; this.state_t = 0; this.idle_time = 1.4;
    this.hp = BOSS_MAX_HP; this.hp_lag = BOSS_MAX_HP; this.hp_lag_hold = 0; this.poise = BOSS_POISE; this.poise_delay = 0;
    this.kind = null; this.atk = null; this.want = 0; this.attack_dir = this.facing; this.hit_done = false;
    this.phase = 1; this.followed = false;
    this.slam_from = [this.gx, this.gy]; this.slam_to = [this.gx, this.gy]; this.elev = 0; this.dash_dist = 0; this.dash_time = 0;
    this.history = []; this.flash_t = 0; this.squash = 0; this.wob = 0; this.wob_v = 0; this.dead_t = 0;
    this.octant = null; this.view = 'S'; this.flip = 1;
    this.hal_angle = this.facing + 1.35; this.hal_r = 52; this.hal_elev = 70; this.hal_up = 1; this.hal_rot = Math.PI / 2;
    // pose
    this.bodySX = 1; this.bodySY = 1; this.bodyRot = 0; this.bodyAlpha = 1; this.flashColor = '#ffffff'; this.flashAlpha = 0;
    this.coreX = 0; this.coreY = SENTINEL_CORE_Y; this.coreSX = 1; this.coreAlpha = 1; this.coreGlow = 0.6; this.coreGlowScale = 1;
    this.visorGlowA = 0.5; this.visorPos = [0, 133]; this.shadowScale = 1;
    this.plates = [];
    for (const side of [-1, 1]) for (let k = 0; k < 2; k++) this.plates.push({ side, k, x: 0, y: 0, sx: 1, rot: 0, z: 4 - k, alpha: 1 });
    this.halX = 0; this.halY = 0; this.halZ = 5; this.halAlpha = 1;
    this.animate(0, 0);
  }
  get alive() { return this.state !== S_DEAD; }
  enter(s) { this.state = s; this.state_t = 0; }
  chooseAttack(dist) {
    let opts;
    if (dist > 380) opts = [['lance', 0.7], ['slam', 0.3]];
    else if (dist > 220) opts = [['lance', 0.35], ['slam', 0.45], ['sweep', 0.2]];
    else opts = [['sweep', 0.55], ['slam', 0.35], ['lance', 0.1]];
    const h = this.history;
    if (h.length >= 2 && h[h.length - 1] === h[h.length - 2]) {
      const f = opts.filter(o => o[0] !== h[h.length - 1]);
      if (f.length) opts = f;
    }
    let r = Math.random() * opts.reduce((s, o) => s + o[1], 0), pick = opts[opts.length - 1][0];
    for (const [k, w] of opts) { r -= w; if (r <= 0) { pick = k; break; } }
    this.kind = pick; this.atk = BOSS_ATTACKS[pick]; this.want = this.atk.want;
    h.push(pick); if (h.length > 4) h.shift();
  }
  beginAttack(player) {
    this.enter(S_WINDUP); this.hit_done = false; this.vx = this.vy = 0; this.followed = false;
    const dx = player.gx - this.gx, dy = player.gy - this.gy, to_p = Math.atan2(dy, dx);
    if (this.kind === 'sweep') this.attack_dir = this.facing;
    else if (this.kind === 'slam') {
      const hop = Math.min(hypot(dx, dy), this.atk.hop), lim = ARENA_HALF - this.RADIUS - 6;
      this.slam_from = [this.gx, this.gy];
      this.slam_to = [clamp(this.gx + Math.cos(to_p) * hop, -lim, lim), clamp(this.gy + Math.sin(to_p) * hop, -lim, lim)];
      this.facing = to_p;
    } else { this.attack_dir = to_p; this.facing = to_p; }
  }
  distToEdge(a) {
    const lim = ARENA_HALF - this.RADIUS - 4; let best = this.atk.max_dist;
    const c = Math.cos(a), s = Math.sin(a);
    if (c > 1e-6) best = Math.min(best, (lim - this.gx) / c); else if (c < -1e-6) best = Math.min(best, (-lim - this.gx) / c);
    if (s > 1e-6) best = Math.min(best, (lim - this.gy) / s); else if (s < -1e-6) best = Math.min(best, (-lim - this.gy) / s);
    return Math.max(0, best);
  }
  update(dt, t, player) {
    this.state_t += dt;
    const dx = player.gx - this.gx, dy = player.gy - this.gy, dist = hypot(dx, dy), to_p = Math.atan2(dy, dx);
    if (this.state !== S_STAGGERED && this.state !== S_DEAD && this.state !== S_PHASE) {
      if (this.poise_delay > 0) this.poise_delay -= dt; else this.poise = Math.min(BOSS_POISE, this.poise + POISE_REGEN * dt);
    }
    const st = this.state, T = this.state_t, atk = this.atk, g = this.g;
    if (st === S_IDLE) {
      this.vx = smooth(this.vx, 0, 8, dt); this.vy = smooth(this.vy, 0, 8, dt);
      this.facing = approachAngle(this.facing, to_p, 4 * dt);
      if (player.alive && T >= this.idle_time) { this.chooseAttack(dist); this.enter(S_STALK); }
    } else if (st === S_STALK) {
      this.facing = approachAngle(this.facing, to_p, 5 * dt);
      if (!player.alive) this.enter(S_IDLE);
      else if (dist > this.want && T < 2.4) {
        this.vx = smooth(this.vx, Math.cos(to_p) * BOSS_SPEED, 6, dt); this.vy = smooth(this.vy, Math.sin(to_p) * BOSS_SPEED, 6, dt);
      } else this.beginAttack(player);
    } else if (st === S_WINDUP) {
      this.vx = smooth(this.vx, 0, 10, dt); this.vy = smooth(this.vy, 0, 10, dt);
      if (this.kind === 'sweep') {
        if (T < atk.track) { this.attack_dir = approachAngle(this.attack_dir, to_p, 6 * dt); this.facing = this.attack_dir; }
        if (T >= atk.windup) { this.enter(S_ACTIVE); g.onBossSwing(this); }
      } else if (this.kind === 'slam') {
        if (T >= atk.crouch) {
          const q = clamp((T - atk.crouch) / (atk.windup - atk.crouch), 0, 1), e = q * q * (3 - 2 * q);
          this.gx = this.slam_from[0] + (this.slam_to[0] - this.slam_from[0]) * e;
          this.gy = this.slam_from[1] + (this.slam_to[1] - this.slam_from[1]) * e;
          this.elev = Math.sin(Math.PI * q) * 95;
        }
        if (T >= atk.windup) { this.elev = 0; [this.gx, this.gy] = this.slam_to; this.enter(S_ACTIVE); g.onBossSlam(this); }
      } else {
        if (T < atk.lock) { this.attack_dir = approachAngle(this.attack_dir, to_p, 9 * dt); this.facing = this.attack_dir; }
        this.dash_dist = this.distToEdge(this.attack_dir);
        if (T >= atk.windup) { this.dash_time = this.dash_dist / atk.speed; this.enter(S_ACTIVE); g.onBossLunge(this); }
      }
    } else if (st === S_ACTIVE) {
      if (this.kind === 'sweep') {
        if (!this.hit_done && g.bossSweepHits(this)) this.hit_done = g.damagePlayer(atk.damage, this.attack_dir, atk.knock);
        if (T >= atk.active) this.enter(S_RECOVERY);
      } else if (this.kind === 'slam') { if (T >= atk.active) this.enter(S_RECOVERY); }
      else {
        this.vx = Math.cos(this.attack_dir) * atk.speed; this.vy = Math.sin(this.attack_dir) * atk.speed;
        g.fx.lanceTrail(this);
        if (!this.hit_done && dist <= this.RADIUS + PLAYER_RADIUS + 6) this.hit_done = g.damagePlayer(atk.damage, this.attack_dir, atk.knock);
        if (T >= this.dash_time) {
          this.vx *= 0.3; this.vy *= 0.3;
          if (this.phase === 2 && !this.followed) {          // phase 2: straight into a sweep, no pause
            this.followed = true; this.kind = 'sweep'; this.atk = BOSS_ATTACKS.sweep_follow;
            this.attack_dir = to_p; this.facing = to_p; this.hit_done = false; this.enter(S_WINDUP);
          } else this.enter(S_RECOVERY);
        }
      }
    } else if (st === S_RECOVERY) {
      this.vx = smooth(this.vx, 0, 5, dt); this.vy = smooth(this.vy, 0, 5, dt);
      if (T >= atk.recovery) { this.enter(S_IDLE); this.idle_time = this.phase === 2 ? uniform(PHASE2_IDLE[0], PHASE2_IDLE[1]) : uniform(0.45, 0.95); }
    } else if (st === S_STAGGERED) {
      this.vx = smooth(this.vx, 0, 6, dt); this.vy = smooth(this.vy, 0, 6, dt);
      if (T >= STAGGER_TIME) { this.poise = BOSS_POISE; this.enter(S_IDLE); this.idle_time = 0.35; }
    } else if (st === S_PHASE) {
      this.vx = smooth(this.vx, 0, 6, dt); this.vy = smooth(this.vy, 0, 6, dt);
      this.facing = approachAngle(this.facing, to_p, 1.5 * dt);
      if (T >= PHASE_TIME) { this.enter(S_IDLE); this.idle_time = 0.35; }
    } else if (st === S_DEAD) {
      this.vx = smooth(this.vx, 0, 6, dt); this.vy = smooth(this.vy, 0, 6, dt);
      this.elev = smooth(this.elev, 0, 10, dt); this.dead_t += dt;
    }
    this.gx += this.vx * dt; this.gy += this.vy * dt;
    [this.hp_lag, this.hp_lag_hold] = lagBar(this.hp_lag, this.hp_lag_hold, this.hp, 260, dt);
  }
  takeHit(dmg, poiseDmg, angle, heavy, crit) {
    if (this.state === S_PHASE) return 'immune';
    const staggered = this.state === S_STAGGERED;
    const mult = crit ? 1 : (staggered ? STAGGER_DMG_MULT : 1);
    this.hp = Math.max(0, this.hp - dmg * mult); this.hp_lag_hold = 0.6;
    this.flash_t = 0.22; this.squash = heavy ? 0.07 : 0.035; this.wob_v += -Math.cos(angle) * (heavy ? 0.9 : 0.45);
    if (!staggered) { this.poise -= poiseDmg; this.poise_delay = POISE_DELAY; }
    if (this.hp <= 0) { this.enter(S_DEAD); this.dead_t = 0; return 'dead'; }
    if (this.phase === 1 && this.hp <= BOSS_MAX_HP * PHASE2_AT) {
      this.phase = 2; this.poise = BOSS_POISE; this.elev = 0; this.vx = this.vy = 0; this.enter(S_PHASE); return 'phase';
    }
    if (!staggered && this.poise <= 0) { this.poise = 0; this.elev = 0; this.enter(S_STAGGERED); return 'stagger'; }
    return 'hit';
  }
  animate(dt, t) {
    const st = this.state, T = this.state_t;
    this.shadowScale = Math.max(0.45, 1 - this.elev / 180);
    let sx = 1, sy = 1 + Math.sin(t * 1.6) * 0.012, rot = 0, coreA = 0.6 + 0.2 * Math.sin(t * 2.5), d = 0, q = 0;
    if (st === S_WINDUP) {                                  // the poses are the only warning
      q = clamp(T / this.atk.windup, 0, 1);
      if (this.kind === 'slam' && T < this.atk.crouch) { const c = T / this.atk.crouch; sy *= 1 - 0.15 * c; sx *= 1 + 0.07 * c; }
      else if (this.kind === 'sweep') { rot = Math.cos(this.attack_dir) * 0.15 * q; sy *= 1 - 0.05 * q; }
      else if (this.kind === 'lance') {
        if (T < this.atk.lock) rot = Math.cos(this.attack_dir) * 0.06 * q;
        else { rot = Math.cos(this.attack_dir) * 0.16; sy *= 0.92; sx *= 1.04; }
      }
    } else if (st === S_ACTIVE) {
      if (this.kind === 'slam') { sy *= 0.88; sx *= 1.08; }
      else if (this.kind === 'lance') rot = -Math.cos(this.attack_dir) * 0.18;
    } else if (st === S_STAGGERED) {
      const k = T / STAGGER_TIME; sy *= 0.86; sx *= 1.05; rot = Math.sin(T * 9) * 0.05 * (1 - k) + 0.1;
      coreA = 0.25 + 0.35 * (((t * 14) | 0) % 2);
    } else if (st === S_PHASE) {
      const k = T / PHASE_TIME, rise = Math.sin(Math.PI * Math.min(1, k * 1.25));
      sy *= 1 + 0.1 * rise; sx *= 1 - 0.03 * rise; rot = Math.sin(T * 30) * 0.025 * (1 - k);
      coreA = 0.8 + 0.2 * Math.sin(t * 20);
    } else if (st === S_DEAD) {
      d = Math.min(1, this.dead_t / 1.6); sy *= 1 - 0.38 * d; rot = 0.3 * d; coreA = Math.max(0, 1 - d * 1.5);
    }
    if (dt > 0) {
      const acc = -160 * this.wob - 11 * this.wob_v;
      this.wob_v += acc * dt; this.wob += this.wob_v * dt; this.squash = smooth(this.squash, 0, 10, dt);
    }
    this.pickView();
    this.bodySX = sx * (1 + this.squash * 0.6) * this.flip; this.bodySY = sy * (1 - this.squash);
    this.bodyRot = rot + this.wob; this.bodyAlpha = 1 - 0.55 * d;
    if (this.flash_t > 0) {
      this.flash_t -= dt;
      if (0.22 - this.flash_t < 0.06) { this.flashColor = '#ffffff'; this.flashAlpha = 0.9; }
      else { this.flashColor = CRIMSON; this.flashAlpha = 0.8 * Math.max(0, this.flash_t) / 0.16; }
    } else this.flashAlpha = 0;
    const core = SENTINEL_CORE[this.view];
    this.coreX = core[0]; this.coreY = core[1]; this.coreSX = core[2];
    this.coreGlow = coreA * (core[3] ? 1 : 0.65); this.coreGlowScale = this.phase === 2 ? 1.35 : 1; this.coreAlpha = core[3] ? 1 - d : 0;
    const vis = SENTINEL_VISOR[this.view];
    if (!vis) this.visorGlowA = 0; else { this.visorPos = vis; this.visorGlowA = (0.45 + 0.2 * Math.sin(t * 3.1)) * (1 - d); }
    const [spread, shift] = SENTINEL_PLATES[this.view];
    for (const pl of this.plates) {
      let bx = pl.k === 0 ? 46 : 50, by = pl.k === 0 ? 128 : 108;
      let bob = Math.sin(t * 2 + pl.k * 1.3 + pl.side) * 4, flare = 0;
      if (st === S_WINDUP && this.kind === 'sweep') flare = 10 * q;
      if (st === S_STAGGERED) { by -= 30; bob *= 0.3; }
      if (st === S_PHASE) { flare = 26 * Math.sin(Math.PI * Math.min(1, T / PHASE_TIME * 1.25)); by += 10; bob *= 2; }
      if (st === S_DEAD) { by = Math.max(8, by - 120 * d); pl.alpha = 1 - 0.6 * d; } else pl.alpha = 1;
      pl.x = this.flip * (pl.side * (bx + flare) * spread + shift); pl.y = by + bob;
      pl.sx = -pl.side * this.flip; pl.rot = pl.side * -0.15 + Math.sin(t * 1.5 + pl.k) * 0.05;
      pl.z = (this.view === 'E' && pl.side < 0) ? -1 - pl.k : 4 - pl.k;
    }
    this.animateHalberd(dt, t, d);
  }
  pickView() {
    const n = pickOctant(this.facing, this.octant);
    if (n !== this.octant) { this.octant = n; [this.view, this.flip] = OCTANTS[n]; }
  }
  animateHalberd(dt, t, d) {
    const st = this.state, T = this.state_t, rest = this.facing + 1.35;
    let direct = false, rate = 5, tgt, r_t, e_t, up_t;
    if (st === S_IDLE || st === S_STALK) { tgt = rest; r_t = 52; e_t = 70; up_t = 1; }
    else if (st === S_WINDUP) {
      if (this.kind === 'sweep') { tgt = this.attack_dir + this.atk.half * 1.05; r_t = 46; e_t = 80; up_t = 0; rate = 10; }
      else if (this.kind === 'slam') { tgt = this.facing; r_t = 20; e_t = 120; up_t = 1; rate = 8; }
      else { tgt = this.attack_dir; r_t = 26; e_t = 62; up_t = 0; rate = 12; }
    } else if (st === S_ACTIVE) {
      direct = true;
      if (this.kind === 'sweep') {
        const p = clamp(T / this.atk.active, 0, 1), e = 1 - Math.pow(1 - p, 2);
        tgt = this.attack_dir + this.atk.half * (1 - 2 * e); r_t = 76; e_t = 58; up_t = 0;
      } else if (this.kind === 'slam') { tgt = this.facing; r_t = 70; e_t = 16; up_t = 0; }
      else { tgt = this.attack_dir; r_t = 40; e_t = 60; up_t = 0; }
    } else if (st === S_RECOVERY) { tgt = rest; r_t = 52; e_t = 60; up_t = 0.5; rate = 3; }
    else if (st === S_STAGGERED) { tgt = this.facing + 0.9; r_t = 56; e_t = 18; up_t = 0; }
    else if (st === S_PHASE) { tgt = this.facing + 1.35; r_t = 40; e_t = 150; up_t = 1; rate = 6; }
    else { tgt = this.facing + 1.0; r_t = 60; e_t = 4; up_t = 0; rate = 3; }
    if (direct || dt === 0) this.hal_angle = tgt; else this.hal_angle = approachAngle(this.hal_angle, tgt, rate * dt);
    if (dt > 0) {
      const k = direct ? 30 : 8;
      this.hal_r = smooth(this.hal_r, r_t, k, dt); this.hal_elev = smooth(this.hal_elev, e_t, k, dt); this.hal_up = smooth(this.hal_up, up_t, 8, dt);
    }
    const a = this.hal_angle;
    this.halX = Math.cos(a) * this.hal_r; this.halY = Math.sin(a) * this.hal_r * K + this.hal_elev;
    const radial = groundToScreenAngle(a), upright = Math.PI / 2 - 0.25 * (Math.cos(a) > 0 ? 1 : -1);
    const rot_t = radial + wrap(upright - radial) * this.hal_up;
    if (direct || dt === 0) this.hal_rot = rot_t; else this.hal_rot = approachAngle(this.hal_rot, rot_t, 12 * dt);
    this.halZ = Math.sin(a) > 0.1 ? -1 : 5; this.halAlpha = 1 - 0.5 * d;
  }
}

// ---------------------------------------------------------------- world objects
class Pillar { constructor(gx, gy) { this.gx = gx; this.gy = gy; this.RADIUS = 34; this.phase = uniform(0, 6.28); } }

class Pickup {
  constructor(pos, key, count) { [this.gx, this.gy] = pos; this.item_key = key; this.count = count; this.phase = uniform(0, 6.28); this.reset(); }
  reset() { this.taken = false; }
}

class Projectiles {
  constructor(game) {
    this.g = game; this.SHOT_H = 42;
    this.shots = []; for (let i = 0; i < 6; i++) this.shots.push({ live: false, gx: 0, gy: 0, vx: 0, vy: 0, dist: 0, rot: 0 });
    this.bombs = []; for (let i = 0; i < 3; i++) this.bombs.push({ live: false, t: 0, item: null, x0: 0, y0: 0, x1: 0, y1: 0, gx: 0, gy: 0, elev: 0, spin: 0 });
  }
  fire(p) {
    for (const sh of this.shots) if (!sh.live) {
      const a = p.attack_dir;
      const mx = p.muzzleX === undefined ? p.gx : p.muzzleX, my = p.muzzleY === undefined ? p.gy : p.muzzleY;
      Object.assign(sh, { live: true, gx: p.gx + Math.cos(a) * 22, gy: p.gy + Math.sin(a) * 22,
        vx: Math.cos(a) * BULLET_SPEED, vy: Math.sin(a) * BULLET_SPEED, dist: 0, rot: groundToScreenAngle(a),
        ox: mx, oy: my, h: p.muzzleZ === undefined ? this.SHOT_H : p.muzzleZ });
      return;
    }
  }
  throwItem(p, item) {
    for (const bm of this.bombs) if (!bm.live) {
      const a = p.attack_dir, L = item.throw, lim = ARENA_HALF - 10;
      Object.assign(bm, { live: true, t: 0, item, x0: p.gx, y0: p.gy, gx: p.gx, gy: p.gy, elev: 30,
        x1: clamp(p.gx + Math.cos(a) * L, -lim, lim), y1: clamp(p.gy + Math.sin(a) * L, -lim, lim) });
      return;
    }
  }
  clear() { for (const s of this.shots) s.live = false; for (const b of this.bombs) b.live = false; }
  update(dt) {
    const g = this.g, b = g.boss;
    for (const sh of this.shots) {
      if (!sh.live) continue;
      sh.gx += sh.vx * dt; sh.gy += sh.vy * dt; sh.dist += BULLET_SPEED * dt;
      let gone = sh.dist >= BULLET_RANGE || Math.abs(sh.gx) > ARENA_HALF || Math.abs(sh.gy) > ARENA_HALF;
      for (const pil of g.pillars) if (hypot(sh.gx - pil.gx, sh.gy - pil.gy) <= pil.RADIUS) gone = true;
      if (!gone && b.alive && b.elev < 40 && hypot(sh.gx - b.gx, sh.gy - b.gy) <= b.RADIUS + 6) {
        g.onShotHit(Math.atan2(sh.vy, sh.vx), sh.gx, sh.gy); gone = true; sh.hit = true;
      }
      if (gone) { if (sh.live && !sh.hit) g.fx.shotEnd(sh.gx, sh.gy * K + sh.h); sh.live = false; sh.hit = false; }
    }
    for (const bm of this.bombs) {
      if (!bm.live) continue;
      bm.t += dt;
      const q = Math.min(1, bm.t / bm.item.flight);
      bm.gx = bm.x0 + (bm.x1 - bm.x0) * q; bm.gy = bm.y0 + (bm.y1 - bm.y0) * q;
      bm.elev = 30 + Math.sin(Math.PI * q) * 90 - 30 * q; bm.spin = bm.t * 9;
      if (q >= 1) { bm.live = false; g.onBombLand(bm.gx, bm.gy, bm.item); }
    }
  }
}

// ---------------------------------------------------------------- game
class Game {
  constructor(out) {
    this.out = out;                      // {sfx(name, vol), haptic(style, intensity)}
    this.t = 0;
    this.fx = new FX(this);
    this.pillars = [[-560, -560], [560, -560], [-560, 560], [560, 560]].map(p => new Pillar(p[0], p[1]));
    this.boss = new Boss(this);
    this.player = new Player(this);
    this.proj = new Projectiles(this);
    this.pickups = PICKUPS.map(p => new Pickup(p[0], p[1], p[2]));
    this.ritualFlash = 0;
    this.waves = [];                     // phase-2 slam shockwaves (fixed pool)
    for (let i = 0; i < 6; i++) this.waves.push({ live: false, x: 0, y: 0, r: 0, delay: 0, hit: false, alpha: 0, started: false, dust_t: 0 });
    this.resetRound();
  }
  resetRound() {
    this.player.reset(); this.boss.reset(); this.fx.clear(); this.proj.clear();
    for (const pk of this.pickups) pk.reset();
    this.buffer = null; this.hitstop = 0; this.shake_amp = 0; this.shake_t = 0; this.shake_dx = 1; this.shake_dy = 0;
    this.ox = 0; this.oy = 0; this.stamDeny = 0; this.toast_t = 0; this.toast_key = null;
    this.outcome = null; this.outcome_t = 0; this.hapticQueue = []; this.visceralReady = false;
    this.phaseMix = 0; for (const w of this.waves) w.live = false;
    [this.cam_x, this.cam_y] = this.cameraTarget();
  }
  sfx(n, v) { this.out.sfx(n, v); }
  haptic(s, i) { this.out.haptic(s, i); }

  // ---- input entry points (called by the platform layer)
  press(kind, dir, charged) {
    if (this.outcome !== null) return;
    this.buffer = [kind, dir, INPUT_BUFFER, !!charged];
  }
  setOutcome(o) { if (this.outcome === null) { this.outcome = o; this.outcome_t = 0; this.buffer = null; } }
  overlayLevel() {
    if (this.outcome === null) return 0;
    return clamp((this.outcome_t - (this.outcome === 'death' ? 1.2 : 1.9)) / 0.8, 0, 1);
  }
  defaultDir() { const p = this.player; return p.move_dir !== null ? p.move_dir : p.facing; }

  execute(kind, d, charged) {
    const p = this.player;
    if (kind === 'flask') {
      if (p.flasks <= 0) return this.deny();
      p.flasks -= 1; p.startMove('flask', FLASK_MOVE, p.facing); this.haptic('soft', 0.4); return;
    }
    if (kind === 'light' && this.visceralReady) {
      p.startVisceral(this.boss); this.sfx('charge', 0.6); this.haptic('rigid', 0.8); return;
    }
    if (p.stamina <= 0.5) return this.deny();
    if (d === null || d === undefined) d = this.defaultDir();
    if (kind === 'shoot') {
      if (p.bullets <= 0) return this.deny();
      p.bullets -= 1; p.startMove('shoot', p.gunReady > 0.8 ? GUN_MOVE_READY : GUN_MOVE, d); return;
    }
    if (kind === 'item') {
      if (p.items[p.item_key] <= 0) return this.deny();
      p.items[p.item_key] -= 1; p.startMove('item', THROW_MOVE, d); return;
    }
    if (kind === 'dodge') {
      p.startDodge(d); this.sfx('dash', 0.7); this.haptic('rigid', 0.6); this.fx.dashBurst(p); return;
    }
    if (kind === 'light') { const [cat, idx, mv] = p.nextLight(this.t); p.startMove(cat, mv, d, idx); }
    else {
      p.startMove(charged ? 'charged' : 'heavy', p.heavyMove(charged), d);
      if (!charged) { this.sfx('charge', 0.7); this.haptic('soft', 0.5); }
    }
  }
  deny() { this.stamDeny = 0.35; this.sfx('deny', 0.6); this.haptic('light', 0.4); }
  swapWeapon(attackHeld) {
    const p = this.player;
    if ((p.state !== S_IDLE && p.state !== S_MOVE) || attackHeld || this.outcome !== null) return this.deny();
    const i = WEAPON_ORDER.indexOf(p.weaponKey);
    p.setWeapon(WEAPON_ORDER[(i + 1) % WEAPON_ORDER.length]);
    this.sfx('thud', 0.45); this.sfx('ready', 0.4); this.haptic('medium', 0.6);
    this.fx.glows.spawn({ x: p.gx, y: p.gy * K + 40, life: 0.3, size: [120, 120], color: CRIMSON, alpha: 0.7, s0: 0.5, s1: 1.3 });
  }
  onSwing(p) {
    const mv = p.move;
    if (p.kind === 'shoot') {
      this.proj.fire(p); this.sfx('shot', 0.9); this.haptic('rigid', 0.5);
      p.gunKick = 1; this.addShake(p.attack_dir + Math.PI, 2.5);
      this.fx.muzzle(p);
      return;
    }
    if (p.kind === 'item') {
      this.proj.throwItem(p, ITEMS[p.item_key]); if (mv.sfx) this.sfx(mv.sfx[0], mv.sfx[1]); this.haptic('light', 0.5); return;
    }
    if (p.kind === 'flask') {
      p.hp = Math.min(PLAYER_MAX_HP, p.hp + FLASK_HEAL); p.rally = Math.min(p.rally, PLAYER_MAX_HP - p.hp);
      this.fx.heal(p); this.sfx('flask', 0.9); this.haptic('light', 0.5); return;
    }
    if (mv.sfx) this.sfx(mv.sfx[0], mv.sfx[1]);
    if (mv.thud) this.sfx('thud', 0.55);
    if (mv.haptic) this.haptic(mv.haptic[0], mv.haptic[1]);
    this.fx.slash(p);
  }
  attackHits(p, target) {
    const shape = p.move.hitbox, dx = target.gx - p.gx, dy = target.gy - p.gy, r = target.RADIUS;
    if (shape[0] === 'ring') return hypot(dx, dy) <= shape[1] + r;
    const a = p.attack_dir;
    if (shape[0] === 'thrust') {
      const along = dx * Math.cos(a) + dy * Math.sin(a), perp = -dx * Math.sin(a) + dy * Math.cos(a);
      return -r <= along && along <= shape[1] + r && Math.abs(perp) <= shape[2] * 0.5 + r;
    }
    const dist = hypot(dx, dy);
    if (dist - r > shape[1]) return false;
    if (dist < 1e-3) return true;
    const slack = Math.asin(Math.min(1, r / dist));
    return Math.abs(wrap(Math.atan2(dy, dx) - a)) <= shape[2] * RAD + slack;
  }
  hitBoss(dmg, poise, angle, heavy, crit) {
    const b = this.boss, hp0 = b.hp, result = b.takeHit(dmg, poise, angle, heavy, crit);
    const got = this.player.regain((hp0 - b.hp) * RALLY_RATIO);
    if (got >= 1) { this.fx.rally(this.player, got); this.haptic('soft', 0.5); }
    if (result === 'stagger') this.onBossStagger(b); else if (result === 'dead') this.onBossDeath(b);
    else if (result === 'phase') this.onBossPhase(b);
    return result;
  }
  onPlayerHitBoss(p) {
    const mv = p.move, heavy = mv.heft >= 0.6, b = this.boss, a = p.attack_dir, sa = groundToScreenAngle(a);
    this.hitstop = mv.hitstop; this.addShake(sa, mv.shake);
    const cx = b.gx - Math.cos(a) * b.RADIUS * 0.8, cy = b.gy - Math.sin(a) * b.RADIUS * 0.8;
    this.fx.hitBurst(cx, cy * K + 80 + b.elev, sa, heavy, b.gx, b.gy, mv.sparks, mv.flash);
    this.sfx('crunch', heavy ? 1.0 : 0.8); if (heavy) this.sfx('thud', 0.9);
    this.haptic(heavy ? 'heavy' : 'rigid', heavy ? 1.0 : 0.85);
    const crit = p.kind === 'visceral';
    const result = this.hitBoss(mv.damage, mv.poise, a, heavy, crit);
    if (crit) {
      this.fx.visceral(b, a); this.sfx('stagger', 0.6); this.hapticQueue.push([0.12, 'heavy', 1.0]);
      if (result === 'hit' && b.state === S_STAGGERED) {
        b.state_t = Math.min(b.state_t, STAGGER_TIME - 1.1); b.vx = Math.cos(a) * 320; b.vy = Math.sin(a) * 320;
      }
    }
  }
  onShotHit(angle, gx, gy) {
    const b = this.boss, atk = b.atk;
    if (b.state === S_WINDUP && atk && atk.parry && atk.windup - b.state_t <= PARRY_WINDOW) return this.onParry(b, angle);
    this.fx.hitBurst(gx, gy * K + this.proj.SHOT_H, groundToScreenAngle(angle), false, b.gx, b.gy, 6, 60);
    this.sfx('crunch', 0.4); this.haptic('light', 0.5);
    this.hitBoss(BULLET_DAMAGE, BULLET_POISE, angle, false, false);
  }
  onParry(b, angle) {
    b.poise = 0; b.elev = 0; b.vx = b.vy = 0; b.enter(S_STAGGERED); b.flash_t = 0.22;
    this.fx.staggerBurst(b); this.fx.visceral(b, angle);
    this.sfx('stagger', 1.0); this.sfx('crunch', 0.9); this.haptic('heavy', 1.0); this.hapticQueue.push([0.12, 'heavy', 1.0]);
    this.hitstop = 0.12; this.addShake(groundToScreenAngle(angle), 10);
  }
  onBombLand(gx, gy, item) {
    const R = item.radius, f = this.fx;
    f.rings.spawn({ x: gx, y: gy, life: 0.35, size: [2 * R / 0.8, 2 * R / 0.8], color: '#ff8a3a', alpha: 1, s0: 0.2, s1: 1.0, fade: 1.3 });
    for (let i = 0; i < 26; i++) {
      const a = uniform(0.2, Math.PI - 0.2), sp = uniform(150, 520);
      f.sparks.spawn({ x: gx + uniform(-20, 20), y: gy * K + 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: uniform(0.25, 0.6),
        size: [uniform(10, 22), 4], color: choice(['#ffb070', '#ff8a3a', '#ffe7c2', CRIMSON]), g: -1200, drag: 1.8, s0: 1, s1: 0.3, align: true });
    }
    for (let i = 0; i < 10; i++) {
      const a = i * TAU / 10;
      f.smoke.spawn({ x: gx, y: gy * K + 10, vx: Math.cos(a) * 120, vy: Math.sin(a) * 60 + 30, life: uniform(0.5, 0.8),
        size: [40, 40], color: '#4d4545', alpha: 0.45, drag: 2.5, s0: 0.6, s1: 1.8 });
    }
    f.glows.spawn({ x: gx, y: gy * K + 20, life: 0.25, size: [2.6 * R, 2.6 * R], color: '#ff8a3a', alpha: 0.9, s0: 0.4, s1: 1.1 });
    this.sfx('thud', 0.9); this.sfx('crunch', 0.7); this.addShake(Math.PI / 2, 7); this.haptic('medium', 0.8);
    const b = this.boss;
    if (b.alive && hypot(b.gx - gx, b.gy - gy) <= R + b.RADIUS && b.elev < 60)
      this.hitBoss(item.damage, item.poise, Math.atan2(b.gy - gy, b.gx - gx), true, false);
  }
  updatePickups(dt) {
    const p = this.player;
    for (const pk of this.pickups) {
      if (!pk.taken && p.alive && hypot(p.gx - pk.gx, p.gy - pk.gy) <= PICKUP_RADIUS && p.items[pk.item_key] < ITEM_STACK_MAX) {
        pk.taken = true;
        p.items[pk.item_key] = Math.min(ITEM_STACK_MAX, p.items[pk.item_key] + pk.count);
        p.item_key = pk.item_key; this.toast_key = pk.item_key; this.toast_t = 1.6;
        this.sfx('ready', 0.6); this.haptic('light', 0.6);
        this.fx.glows.spawn({ x: pk.gx, y: pk.gy * K + 18, life: 0.3, size: [90, 90], color: '#ffb070', alpha: 0.9, s0: 0.5, s1: 1.4 });
      }
    }
    if (this.toast_t > 0) this.toast_t -= dt;
  }
  // ---- boss events (no wind-up tells: poses only)
  onBossSwing(b) { this.sfx('whoosh_heavy', 1.0); this.fx.bossSlash(b); this.addShake(groundToScreenAngle(b.attack_dir), 4); }
  onBossSlam(b) {
    const R = b.atk.radius;
    this.fx.slamImpact(b.gx, b.gy, R); this.sfx('thud', 1.0); this.sfx('crunch', 0.8);
    this.addShake(Math.PI / 2, 16); this.haptic('heavy', 0.7); this.ritualFlash = 1;
    const p = this.player, dx = p.gx - b.gx, dy = p.gy - b.gy;
    if (hypot(dx, dy) <= R + PLAYER_RADIUS * 0.5) this.damagePlayer(b.atk.damage, Math.atan2(dy, dx), b.atk.knock);
    if (b.phase === 2) {
      let n = 0;
      for (const w of this.waves) {
        if (w.live || n >= SLAM_WAVES.count) continue;
        w.live = true; w.x = b.gx; w.y = b.gy; w.r = SLAM_WAVES.start; w.delay = n * SLAM_WAVES.gap; w.hit = false; w.alpha = 0; w.started = false; n++;
      }
    }
  }
  updateWaves(dt) {
    const p = this.player, S = SLAM_WAVES;
    for (const w of this.waves) {
      if (!w.live) continue;
      if (w.delay > 0) { w.delay -= dt; continue; }
      if (!w.started) { w.started = true; this.sfx('thud', 0.55); this.addShake(Math.PI / 2, 5); this.haptic('medium', 0.5); }
      w.r += S.speed * dt;
      w.dust_t -= dt;
      if (w.dust_t <= 0 && w.alpha > 0.2) {             // dust kicked up along the crest
        w.dust_t = 0.07;
        for (let k = 0; k < 2; k++) {
          const a = uniform(0, TAU), x = w.x + Math.cos(a) * w.r, y = w.y + Math.sin(a) * w.r;
          this.fx.smoke.spawn({ x, y: y * K + 6, vx: Math.cos(a) * 60, vy: Math.sin(a) * 30 + 40, life: uniform(0.35, 0.6),
            size: [34, 34], color: choice(['#575161', '#524d5c', '#5c5766']), alpha: 0.2 * w.alpha, drag: 3, s0: 0.4, s1: 1.1 });
        }
      }
      w.alpha = Math.min(1, w.alpha + dt * 8) * (w.r > S.max_r - 200 ? Math.max(0, (S.max_r - w.r) / 200) : 1);
      if (w.r >= S.max_r) { w.live = false; continue; }
      if (!w.hit && p.alive && this.outcome === null) {
        const dx = p.gx - w.x, dy = p.gy - w.y, d = hypot(dx, dy);
        if (Math.abs(d - w.r) <= S.hit + PLAYER_RADIUS * 0.5) w.hit = this.damagePlayer(S.damage, Math.atan2(dy, dx), S.knock);
      }
    }
  }
  onBossPhase(b) {
    const p = this.player, f = this.fx, x = b.gx, y = b.gy * K;
    this.hitstop = 0.2; this.addShake(Math.PI / 2, 24); this.ritualFlash = 1; this.buffer = null;
    this.sfx('roar', 1.0); this.sfx('thud', 1.0); this.haptic('heavy', 1.0);
    this.hapticQueue.push([0.2, 'heavy', 1.0]); this.hapticQueue.push([0.5, 'medium', 0.8]);
    const R = PHASE_PUSH.radius, sz = 2 * R / 0.8;
    f.rings.spawn({ x: b.gx, y: b.gy, life: 0.55, size: [sz, sz], color: CRIMSON, alpha: 1, s0: 0.08, s1: 1.0, fade: 1.2 });
    f.rings.spawn({ x: b.gx, y: b.gy, life: 0.8, size: [sz, sz], color: '#ff4058', alpha: 0.6, s0: 0.05, s1: 1.3, fade: 1.1 });
    f.glows.spawn({ x, y: y + 90, life: 0.5, size: [420, 420], color: CRIMSON, alpha: 0.9, s0: 0.3, s1: 1.4 });
    for (let i = 0; i < 40; i++) {
      const a = uniform(0, TAU), sp = uniform(300, 800);
      f.sparks.spawn({ x: x + Math.cos(a) * 30, y: y + 90 + Math.sin(a) * 30, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: uniform(0.3, 0.7),
        size: [uniform(16, 30), 4], color: choice([CRIMSON, '#ff4058', '#ffe2b0']), drag: 2.2, s0: 1, s1: 0.3, align: true });
    }
    const dx = p.gx - b.gx, dy = p.gy - b.gy, d = hypot(dx, dy);
    if (d <= R && p.alive) p.shove(Math.atan2(dy, dx), PHASE_PUSH.knock * (1 - 0.5 * d / R));
  }
  onBossLunge(b) { this.sfx('whoosh_heavy', 1.0); this.sfx('dash', 0.8); this.addShake(groundToScreenAngle(b.attack_dir), 5); }
  onBossStagger(b) {
    this.sfx('stagger', 1.0); this.haptic('heavy', 1.0); this.hapticQueue.push([0.14, 'heavy', 1.0]);
    this.fx.staggerBurst(b); this.addShake(Math.PI / 2, 10);
  }
  onBossDeath(b) {
    this.sfx('boss_die', 1.0); this.haptic('heavy', 1.0);
    this.hapticQueue.push([0.18, 'heavy', 1.0]); this.hapticQueue.push([0.45, 'medium', 0.8]);
    this.fx.deathBurst(b); this.addShake(Math.PI / 2, 20); this.hitstop = 0.12; this.setOutcome('victory');
    for (const w of this.waves) w.live = false;
  }
  bossSweepHits(b) {
    const p = this.player, dx = p.gx - b.gx, dy = p.gy - b.gy, dist = hypot(dx, dy);
    if (dist > b.atk.range + PLAYER_RADIUS) return false;
    if (dist < 1e-3) return true;
    const slack = Math.asin(Math.min(1, PLAYER_RADIUS / dist));
    return Math.abs(wrap(Math.atan2(dy, dx) - b.attack_dir)) <= b.atk.half + slack;
  }
  damagePlayer(dmg, angle, knock) {
    const p = this.player;
    if (p.invulnerable || this.outcome !== null) return false;
    p.takeHit(dmg, angle, knock);
    this.fx.hurtBurst(p, angle); this.hitstop = 0.06; this.addShake(groundToScreenAngle(angle), 9);
    this.sfx('hurt', 0.9); this.haptic('heavy', 1.0);
    if (!p.alive) { this.sfx('thud', 0.8); this.setOutcome('death'); }
    return true;
  }
  addShake(sa, amp) { this.shake_dx = Math.cos(sa); this.shake_dy = Math.sin(sa); this.shake_amp = Math.max(this.shake_amp, amp); this.shake_t = 0; }
  updateVisceral() {
    const p = this.player, b = this.boss;
    let ready = false;
    if (b.state === S_STAGGERED && p.alive) {
      const dx = p.gx - b.gx, dy = p.gy - b.gy;
      if (hypot(dx, dy) <= VISCERAL_RANGE) ready = Math.abs(wrap(Math.atan2(dy, dx) - b.facing)) <= VISCERAL_ARC;
    }
    this.visceralReady = ready;
  }
  pushOut(e, cx, cy, minD) {
    const dx = e.gx - cx, dy = e.gy - cy, d = hypot(dx, dy);
    if (d > 1e-4 && d < minD) { const k = (minD - d) / d; e.gx += dx * k; e.gy += dy * k; }
  }
  resolveCollisions() {
    const p = this.player, b = this.boss;
    if (b.alive && b.elev < 30) this.pushOut(p, b.gx, b.gy, PLAYER_RADIUS + b.RADIUS);
    for (const pil of this.pillars) {
      this.pushOut(p, pil.gx, pil.gy, PLAYER_RADIUS + pil.RADIUS);
      if (b.elev < 30) this.pushOut(b, pil.gx, pil.gy, b.RADIUS + pil.RADIUS);
    }
    let lim = ARENA_HALF - PLAYER_RADIUS - 6; p.gx = clamp(p.gx, -lim, lim); p.gy = clamp(p.gy, -lim, lim);
    lim = ARENA_HALF - b.RADIUS - 4; b.gx = clamp(b.gx, -lim, lim); b.gy = clamp(b.gy, -lim, lim);
  }
  cameraTarget() {
    const p = this.player, b = this.boss, lean = 0.38, cap = 200;
    let dx = (b.gx - p.gx) * lean, dy = (b.gy - p.gy) * lean;
    const m = hypot(dx, dy); if (m > cap) { dx *= cap / m; dy *= cap / m; }
    return [p.gx + dx, p.gy + dy];
  }
  updateCamera(dt) {
    const [tx, ty] = this.cameraTarget(), k = Math.min(1, dt * 5);
    this.cam_x += (tx - this.cam_x) * k; this.cam_y += (ty - this.cam_y) * k;
    this.shake_t += dt;
    const amp = this.shake_amp, main = Math.cos(this.shake_t * 62) * amp, perp = Math.sin(this.shake_t * 41) * amp * 0.35;
    this.ox = this.shake_dx * main - this.shake_dy * perp; this.oy = this.shake_dy * main + this.shake_dx * perp;
    this.shake_amp *= Math.exp(-dt * 13);
  }

  /** ctl: {moveDir, moveMag, sprint, aimDir, heavyHeld (seconds or -1)} from the input layer. */
  update(rawDt, ctl) {
    const dt = Math.min(rawDt, 1 / 30);
    this.t += rawDt;
    const t = this.t, p = this.player, b = this.boss;
    for (let i = this.hapticQueue.length - 1; i >= 0; i--) {
      const h = this.hapticQueue[i]; h[0] -= dt;
      if (h[0] <= 0) { this.haptic(h[1], h[2]); this.hapticQueue.splice(i, 1); }
    }
    p.move_dir = ctl.moveDir; p.move_mag = ctl.moveMag; p.sprint_req = ctl.sprint; p.aim_dir = ctl.aimDir;
    p.lookX = b.gx; p.lookY = b.gy; p.lookOn = b.state !== S_DEAD && this.outcome === null;   // his eyes follow the boss
    p.charging = (ctl.heavyHeld >= CHARGE_START && p.alive) ? ctl.heavyHeld : 0;
    if (this.stamDeny > 0) this.stamDeny -= dt;
    if (this.outcome !== null) this.outcome_t += dt;
    if (this.hitstop > 0) { this.hitstop -= dt; this.updateCamera(dt); return; }   // freeze-frame
    this.updateVisceral();
    this.proj.update(dt);
    this.updatePickups(dt);
    this.updateWaves(dt);
    if (b.phase === 2) this.phaseMix = Math.min(1, this.phaseMix + dt / 1.6);
    if (this.buffer) {
      if (p.canAct()) { const [k, d, , c] = this.buffer; this.buffer = null; this.execute(k, d, c); }
      else { this.buffer[2] -= dt; if (this.buffer[2] <= 0) this.buffer = null; }
    }
    p.update(dt, t);
    b.update(dt, t, p);
    this.resolveCollisions();
    if (p.state === S_ACTIVE && p.move.hitbox && !p.hit_done && b.alive && this.attackHits(p, b)) {
      p.hit_done = true; this.onPlayerHitBoss(p);
    }
    p.animate(dt, t); b.animate(dt, t);
    this.fx.update(dt, this.cam_x, this.cam_y);
    this.ritualFlash = smooth(this.ritualFlash, 0, 3, dt);
    this.updateCamera(dt);
  }
}
