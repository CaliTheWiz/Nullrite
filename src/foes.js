// ============================================================ FOES (regular enemies)
// A foe is built from the same parts as the player: the jointed body, the gear meshes, the weapon movesets and the
// keyed attack clips. Only the brain differs: instead of the touch controls, an AI state machine sets the same
// inputs (where to move, how fast, which attack to start). Every foe type is pure data (FOE_TYPES in config.js),
// placed by FOE_SPAWNS; the shared machinery here is what lets new types cost a table entry instead of a class.
//
// Brain states: idle (at its post) -> alert (spotted you: turns, a beat to react) -> engage (spacing, strafing,
// attacking) -> return (lost you: walks back to its post and recovers) ; dead. The body's own states (wind-up,
// strike, recovery, hurt) run underneath and the brain waits for them.
// Fairness: at most FOE_TOKENS foes may be winding up or striking at once (the others keep their distance), every
// foe commits to an attack once its wind-up is half through, and nothing attacks you from off screen.

const FOE_TOKENS = 2;

class Foe extends Player {
  constructor(game, spawn) { Foe._pending = spawn; super(game); this.spawn = spawn; Foe._pending = null; this.reset(); }
  get def() { return FOE_TYPES[(this.spawn || Foe._pending).type]; }
  /** Its gear and weapon come from its type, not from the inventory. */
  applyLoadout() {
    const D = this.def, eq = Object.assign({ right: D.weapon }, D.gear), st = this.stats = deriveStats(eq);
    this.maxHp = D.hp;
    if (D.weapon !== this.weaponKey) this.setWeapon(D.weapon);
    this.leftLocked = WEAPONS[D.weapon].stance.hands === 2; this.hasPistol = false; this.leftItem = null;
    const armor = {}; for (const s of ARMOR_SLOTS) armor[s] = eq[s] || null;
    const key = JSON.stringify(armor);
    if (key !== this._armorKey) { this._armorKey = key; this.setGear(armor); }
    this.dodgeBase = Object.assign({}, DODGE_ROLL);
  }
  reset() {
    super.reset();
    const S = this.spawn || Foe._pending, D = this.def;
    [this.gx, this.gy] = S.pos; this.facing = (S.face === undefined ? -90 : S.face) * RAD; this.attack_dir = this.facing;
    this.hp = this.hp_lag = D.hp; this.poiseCur = D.poise; this.poiseDelay = 0;
    this.flasks = 0; this.bullets = 0; this.noProps = true; this.speedMul = D.speed;
    this.brain = 'idle'; this.brain_t = 0; this.think_t = 0; this.cool = 0; this.strafe = Math.random() < 0.5 ? -1 : 1;
    this.strafe_t = 0; this.chain = null; this.hitPlayer = false; this.seen_t = -10; this.dead_t = 0; this.gone = false;
    this.faceDir = null; this.hurtShow = 0; this.RADIUS = D.radius || PLAYER_RADIUS + 2;
    { const v = parseInt(D.ember.slice(1), 16); this.emberRGB = [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; } this.glowAlpha = 0;
    this.animate(0, 0);
  }
  /** Damage from the player. Poise soaks hits until it breaks; then he staggers. Returns 'hit' | 'stagger' | 'dead'. */
  takeDamage(dmg, poiseDmg, angle) {
    if (!this.alive) return null;
    this.hp = Math.max(0, this.hp - dmg); this.hurtShow = 5; this.poiseDelay = 2.5; this.hp_lag_hold = 0.6; this.flash_t = 0.1;
    if (this.brain === 'idle' || this.brain === 'return' || this.brain === 'alert') this.engage();
    if (this.hp <= 0) {
      this.charging = 0; this.vx = Math.cos(angle) * 160; this.vy = Math.sin(angle) * 160;
      this.knock_dir = angle; this.turnTo(angle + Math.PI); this.enter(S_DEAD); this.brain = 'dead'; this.dead_t = 0;
      return 'dead';
    }
    this.poiseCur -= poiseDmg;
    if (this.poiseCur <= 0) {                     // poise broken: knocked out of whatever he was doing
      this.poiseCur = this.def.poise; this.chain = null;
      this.knock_dir = angle; this.vx = Math.cos(angle) * 220; this.vy = Math.sin(angle) * 220;
      this.turnTo(angle + Math.PI); this.enter(S_HURT); return 'stagger';
    }
    return 'hit';
  }
  engage() { this.brain = 'engage'; this.brain_t = 0; this.think_t = 0.15; this.cool = Math.max(this.cool, 0.35); }

  /** The brain: sets the same inputs the touch controls set for the player, then the shared body update runs. */
  update(dt, t) {
    const g = this.g, P = g.player, D = this.def;
    this.move_dir = null; this.move_mag = 0; this.sprint_req = false; this.aim_dir = null; this.faceDir = null;
    this.stamina = STAM_MAX;
    if (this.hurtShow > 0) this.hurtShow -= dt;
    if (this.poiseDelay > 0) this.poiseDelay -= dt; else this.poiseCur = Math.min(D.poise, this.poiseCur + D.poise * 0.5 * dt);
    if (this.state === S_DEAD) {
      this.dead_t += dt; if (this.dead_t > 3.0) this.gone = true;
      super.update(dt, t); return;
    }
    const dx = P.gx - this.gx, dy = P.gy - this.gy, d = hypot(dx, dy), toP = Math.atan2(dy, dx);
    const home = this.spawn.pos, dh = hypot(home[0] - this.gx, home[1] - this.gy), sees = P.alive && g.outcome === null && g.inFoeRooms(P);
    this.brain_t += dt;
    this.lookOn = this.brain === 'engage' || this.brain === 'alert'; this.lookX = P.gx; this.lookY = P.gy;   // his head follows you
    if (this.brain === 'idle') {
      this.faceDir = this.spawn.face === undefined ? -Math.PI / 2 : this.spawn.face * RAD;
      if (sees && d < D.aggro) { this.brain = 'alert'; this.brain_t = 0; g.onFoeAlert(this); }
    } else if (this.brain === 'alert') {
      this.faceDir = toP;
      if (this.brain_t > D.react) this.engage();
    } else if (this.brain === 'return') {
      if (sees && d < D.aggro * 0.8) this.engage();
      else if (dh < 12) { this.brain = 'idle'; this.hp = this.hp_lag = D.hp; this.poiseCur = D.poise; }
      else { this.move_dir = Math.atan2(home[1] - this.gy, home[0] - this.gx); this.move_mag = 0.3; }
    } else if (this.brain === 'engage') {
      if (!sees || d > D.leash || hypot(home[0] - P.gx, home[1] - P.gy) > D.leash) { this.brain = 'return'; this.brain_t = 0; }
      else this.fight(dt, d, toP);
    }
    // wind-ups track you for their first half, then he is committed
    if (this.state === S_WINDUP && this.move && this.state_t < this.move.windup * 0.5 && this.kind !== 'dodge') {
      this.attack_dir = approachAngle(this.attack_dir, toP, D.track * dt); this.facing = this.attack_dir;
    }
    super.update(dt, t);
    if (this.state !== S_ACTIVE) this.hitPlayer = false;
  }
  /** The shared body animation, plus a white flash when struck and the slow fade once he has fallen. */
  animate(dt, t) {
    super.animate(dt, t);
    if (this.flash_t > 0) { this.flash_t -= dt; this.glowColor = '#ffffff'; this.glowAlpha = 0.55; }
    if (this.state === S_DEAD) this.bodyAlpha = clamp(1 - (this.dead_t - 2.2) / 0.8, 0, 1);
  }
  /** Spacing, strafing and picking attacks. */
  fight(dt, d, toP) {
    const g = this.g, D = this.def, W = this.weapon;
    this.cool -= dt; this.think_t -= dt; this.strafe_t -= dt;
    if (this.strafe_t <= 0) { this.strafe_t = uniform(1.2, 2.8); if (Math.random() < 0.55) this.strafe = -this.strafe; }
    // carry on a chain: the next swing of a combo, started as soon as the last one's recovery allows
    if (this.chain && this.state === S_RECOVERY && this.state_t >= this.move.cancel) {
      const c = this.chain; this.chain = null;
      if (d < c.reach) { this.startMove('light', W.light[c.idx], toP, c.idx); this.chain = c.next || null; return; }
    }
    if (!this.canAct()) return;
    this.faceDir = toP; this.aim_dir = null;
    const lo = D.space[0], hi = D.space[1];
    // pick an attack when one fits the distance, the cooldown is over and a token is free
    if (this.cool <= 0 && this.think_t <= 0 && g.foeTokens < FOE_TOKENS) {
      this.think_t = uniform(D.think[0], D.think[1]);
      const fits = D.attacks.filter(a => d >= a.range[0] && d <= a.range[1]);
      if (fits.length && Math.random() < D.aggression) {
        let r = Math.random() * fits.reduce((s, a) => s + a.w, 0), a = fits[0];
        for (const f of fits) { r -= f.w; if (r <= 0) { a = f; break; } }
        const mv = a.kind === 'light' ? W.light[a.idx] : W[a.kind];
        this.startMove(a.kind === 'charged' ? 'charged' : a.kind, mv, toP, a.kind === 'light' ? a.idx : null);
        this.chain = a.chain && Math.random() < a.chain.p ? { idx: a.chain.idx, reach: a.chain.reach, next: a.chain.next } : null;
        this.cool = uniform(D.cooldown[0], D.cooldown[1]);
        return;
      }
    }
    // keep his distance band: close in, back off, or circle
    if (d > hi) { this.move_dir = toP; this.move_mag = d > hi + 160 ? 1 : 0.3; }
    else if (d < lo) { this.move_dir = toP + Math.PI; this.move_mag = 0.3; }
    else { this.move_dir = toP + this.strafe * 1.35; this.move_mag = 0.3; }
  }
}
Foe._pending = null;
