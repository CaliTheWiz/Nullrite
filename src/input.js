// ============================================================ INPUT (multitouch)
// Layout in y-up points (origin bottom-left), matching the Pythonista build.
class Joystick {
  constructor() { this.R = 56; this.DEAD = 0.14; this.id = null; this.home = [150, 105]; this.cx = 0; this.cy = 0; this.vx = 0; this.vy = 0; this.raw = 0; }
  setHome(p) { this.home = p; }
  begin(id, x, y) { this.id = id; this.cx = x; this.cy = y; this.vx = this.vy = 0; this.raw = 0; }
  move(x, y) {
    let dx = x - this.cx, dy = y - this.cy, m = hypot(dx, dy);
    const lim = this.R * 1.35;
    if (m > lim) {                                   // base follows an over-dragging thumb
      const ex = m - lim; this.cx += dx / m * ex; this.cy += dy / m * ex;
      dx = x - this.cx; dy = y - this.cy; m = hypot(dx, dy);
    }
    this.raw = m / this.R;
    if (m > this.R) { dx *= this.R / m; dy *= this.R / m; }
    this.vx = dx / this.R; this.vy = dy / this.R;
  }
  end() { this.id = null; this.vx = this.vy = 0; this.raw = 0; }
  output() {
    const m = hypot(this.vx, this.vy);
    if (m < this.DEAD) return [null, 0, false];
    return [screenToGroundAngle(this.vx, this.vy), Math.min(1, (m - this.DEAD) / (1 - this.DEAD)), this.raw >= SPRINT_EDGE];
  }
  visual() {
    const active = this.id !== null, bx = active ? this.cx : this.home[0], by = active ? this.cy : this.home[1];
    return { cx_vis: bx, cy_vis: by, kx: bx + this.vx * this.R, ky: by + this.vy * this.R,
             baseAlpha: active ? 0.95 : 0.28, knobAlpha: active ? 1 : 0.3, sprinting: active && this.raw >= SPRINT_EDGE };
  }
}

class ActionButton {
  constructor(kind, tex, r, instant) {
    this.kind = kind; this.tex = tex; this.r = r; this.instant = !!instant;
    this.cx = 0; this.cy = 0; this.sx = 0; this.sy = 0; this.id = null; this.start_t = 0;
    this.dx = 0; this.dy = 0; this.aiming = false; this.press = 0; this.dim = 1;
    this.glowA = 0; this.scale = 1; this.knobA = 0; this.kx = 0; this.ky = 0;
  }
  layout(x, y) { this.cx = x; this.cy = y; }
  dist(x, y) { return hypot(x - this.cx, y - this.cy); }
  begin(id, x, y, t) { this.id = id; this.start_t = t; this.sx = x; this.sy = y; this.dx = this.dy = 0; this.aiming = false; }
  move(x, y) {
    if (this.instant) return;
    this.dx = x - this.sx; this.dy = y - this.sy;
    if (hypot(this.dx, this.dy) >= AIM_THRESHOLD) this.aiming = true;
  }
  groundDir() { return screenToGroundAngle(this.dx, this.dy); }
  end() { const r = [this.kind, this.aiming ? this.groundDir() : null]; this.cancel(); return r; }
  cancel() { this.id = null; this.aiming = false; this.dx = this.dy = 0; }
  updateVisual(dt) {
    this.press = smooth(this.press, this.id !== null ? 1 : 0, 22, dt);
    this.scale = 1 - 0.08 * this.press; this.glowA = 0.55 * this.press;
    if (this.aiming) {
      const m = hypot(this.dx, this.dy), lim = this.r * 1.1, k = m > 0 ? Math.min(1, lim / m) : 0;
      this.kx = this.dx * k; this.ky = this.dy * k; this.knobA = 0.95;
    } else this.knobA = smooth(this.knobA, 0, 20, dt);
  }
}

class Controls {
  constructor(game) {
    this.g = game; this.stick = new Joystick(); this.owner = new Map();
    this.light = new ActionButton('light', ART.btn.light, PRIMARY_R);
    this.dodge = new ActionButton('dodge', ART.btn.dodge, SLOT_R, true);
    this.heavy = new ActionButton('heavy', ART.btn.heavy, SLOT_R);
    this.shoot = new ActionButton('shoot', ART.btn.shoot, SLOT_R);
    this.flask = new ActionButton('flask', ART.btn.flask, SMALL_R, true);
    this.item = new ActionButton('item', ART.btn.item, SMALL_R, true);
    this.buttons = [this.light, this.heavy, this.dodge, this.shoot, this.flask, this.item];
    this.slotButtons = [this.dodge, this.heavy, this.shoot, null];
    this.ui = { buttons: this.buttons, emptySlots: [], stick: null, fps: 60, chip: null, retry: null };
    this.W = 852; this.H = 393;
  }
  layout(W, H) {
    this.W = W; this.H = H;
    this.stick.setHome([HUD.SAFE_X + 92, HUD.SAFE_BOTTOM + 72]);
    const lx = W - HUD.SAFE_X - PRIMARY_R, ly = HUD.SAFE_BOTTOM + PRIMARY_R;
    this.light.layout(lx, ly);
    const sx = W - HUD.SAFE_X - SMALL_R - 2;
    // side by side, low enough to stay clear of the app's top bar
    const ry = ly + ARC_R + 58;
    this.flask.layout(sx, ry);
    this.item.layout(sx - 50, ry);
    this.ui.emptySlots = [];
    this.slotButtons.forEach((b, i) => {
      const a = SLOT_ANGLES[i] * RAD, x = lx + Math.cos(a) * ARC_R, y = ly + Math.sin(a) * ARC_R;
      if (b) b.layout(x, y); else this.ui.emptySlots.push([x, y]);
    });
  }
  releaseAll() { this.owner.clear(); this.stick.end(); for (const b of this.buttons) b.cancel(); }
  touchStart(id, x, y) {
    const g = this.g;
    if (g.outcome !== null) {
      const r = this.ui.retry;
      if (r && g.overlayLevel() >= 0.6 && Math.abs(x - r.x) < 140 && Math.abs(y - r.y) < 50) { g.resetRound(); this.releaseAll(); }
      return;
    }
    let best = null, bd = 1e9;
    for (const b of this.buttons) { const d = b.dist(x, y); if (b.id === null && d <= b.r * 1.3 && d < bd) { best = b; bd = d; } }
    if (best) {
      best.begin(id, x, y, g.t); this.owner.set(id, best);
      if (best.instant) g.press(best.kind, null, false);
      return;
    }
    const c = this.ui.chip;
    if (c && x >= c.x - 6 && x <= c.x + c.w + 4 && Math.abs(y - c.y) <= 16) {
      g.swapWeapon(this.light.id !== null || this.heavy.id !== null); return;
    }
    if (x < this.W * 0.5 && this.stick.id === null) { this.stick.begin(id, x, y); this.owner.set(id, this.stick); }
  }
  touchMove(id, x, y) { const o = this.owner.get(id); if (o) o.move(x, y); }
  touchEnd(id) {
    const o = this.owner.get(id);
    if (!o) return;
    this.owner.delete(id);
    if (o === this.stick) { o.end(); return; }
    const instant = o.instant, held = this.g.t - o.start_t, [kind, d] = o.end();
    if (!instant) this.g.press(kind, d, kind === 'heavy' && held >= CHARGE_FULL);
  }
  /** Per-frame control state for Game.update, plus HUD visuals. */
  frame(dt) {
    const g = this.g, p = g.player;
    // thrown items aim like the pistol; other consumables fire the moment you touch
    if (this.item.id === null) this.item.instant = !(ITEMS[p.item_key] && ITEMS[p.item_key].thrown);
    const [moveDir, moveMag, sprint] = this.stick.output();
    let aimDir = null;
    for (const b of [this.heavy, this.light, this.shoot, this.item]) if (b.id !== null && b.aiming) { aimDir = b.groundDir(); break; }
    this.flask.dim = p.flasks > 0 ? 1 : 0.4;
    this.item.dim = p.items[p.item_key] > 0 ? 1 : 0.4;
    this.shoot.dim = p.bullets > 0 ? 1 : 0.4;
    for (const b of this.buttons) b.updateVisual(dt);
    this.ui.stick = this.stick.visual();
    return { moveDir, moveMag, sprint, aimDir, heavyHeld: this.heavy.id !== null ? g.t - this.heavy.start_t : -1 };
  }
}
