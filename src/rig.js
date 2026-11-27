// ============================================================ RIG (jointed player body)
// The body is a small 3D skeleton in the character's own frame (s = to his right, f = forward, z = up),
// turned to the facing direction and projected with the same 2.5D rule as the world:
//   screen x = ground x, screen y (up) = ground y * K + z, depth = ground y (bigger = further away).
// Legs are solved in 3D (feet stay planted), arms in screen space so the hands land on the weapon grip.
// No allocation per frame: every joint and part is created once and reused.

const RIG = {
  HIP_Z: 40, WAIST_Z: 47, CHEST_Z: 54, SHOULDER_Z: 60, NECK_Z: 64,
  HIP_W: 5, SHOULDER_W: 10.5, FOOT_W: 4,
  THIGH: 18.5, SHIN: 18.5, UPPER: 14, FORE: 13.5, FOOT: 7.5, HAND: 4.5,
};

function V3() { return { s: 0, f: 0, z: 0, x: 0, y: 0, d: 0 }; }   // char frame + projected screen + depth

/** Two-bone IK in screen space. Writes the elbow into `mid` and the reached end into `end`.
 *  bend: +1 / -1 picks which side the joint folds to. Returns false if the target was out of reach. */
function ik2(ax, ay, tx, ty, L1, L2, bend, mid, end) {
  let dx = tx - ax, dy = ty - ay, d = Math.hypot(dx, dy);
  const reach = L1 + L2 - 0.01, ok = d <= reach;
  if (d < 1e-4) { dx = 0; dy = -1; d = 1e-4; }
  const dd = clamp(d, Math.abs(L1 - L2) + 0.01, reach), ux = dx / d, uy = dy / d;
  const a = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  mid.x = ax + ux * a - uy * h * bend; mid.y = ay + uy * a + ux * h * bend;
  end.x = ax + ux * dd; end.y = ay + uy * dd;
  return ok;
}

class Rig {
  constructor() {
    const J = this.j = {};
    for (const n of ['pelvis', 'waist', 'neck', 'head', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'toeL', 'toeR',
      'shL', 'shR', 'elL', 'elR', 'wrL', 'wrR', 'handL', 'handR']) J[n] = V3();
    // parts: what to draw. kind 'seg' = limb between two joints, 'view' = per-view picture at a joint.
    const P = (name, kind, a, b, bias) => ({ name, kind, a, b, bias, key: 0, x: 0, y: 0, rot: 0, len: 0, side: 0 });
    this.parts = [
      P('thighL', 'seg', 'hipL', 'kneeL', 0), P('shinL', 'seg', 'kneeL', 'ankleL', 0), P('footL', 'seg', 'ankleL', 'toeL', -0.2),
      P('thighR', 'seg', 'hipR', 'kneeR', 0), P('shinR', 'seg', 'kneeR', 'ankleR', 0), P('footR', 'seg', 'ankleR', 'toeR', -0.2),
      P('pelvis', 'view', 'pelvis', null, -0.4),
      P('torso', 'view', 'waist', null, 0.6),
      P('cape', 'view', 'neck', null, 0),
      P('head', 'view', 'neck', null, -0.3),
      P('upperL', 'seg', 'shL', 'elL', -0.1), P('foreL', 'seg', 'elL', 'wrL', -0.15), P('handL', 'seg', 'wrL', 'handL', -0.2),
      P('upperR', 'seg', 'shR', 'elR', -0.1), P('foreR', 'seg', 'elR', 'wrR', -0.15), P('handR', 'seg', 'wrR', 'handR', -0.2),
      P('weapon', 'weapon', 'handR', null, 0),
      P('offhand', 'offhand', 'handL', null, 0),
    ];
    this.byName = {}; for (const p of this.parts) this.byName[p.name] = p;
    this.order = this.parts.slice();
    this.yaw = 0; this.view = 'S'; this.flip = 1; this.dir = 12;
    this.lean = 0; this.tilt = 0; this.spin = 0; this.crouch = 0;
    this.phase = 0; this.weaponRot = 0; this.weaponX = 0; this.weaponY = 0; this.weaponKey = 0;
  }

  /** char frame -> world -> screen for one joint. */
  project(J) {
    const c = this._c, s = this._s;
    const X = J.s * s + J.f * c, Y = -J.s * c + J.f * s;        // right = (sin, -cos), forward = (cos, sin)
    J.x = X; J.y = Y * K + J.z; J.d = Y;
  }

  /** Leg IK in the char frame: hip -> knee -> ankle, knee folds forward along `kf` (forward-ish unit vector). */
  leg(hip, knee, ankle, tS, tF, tZ) {
    const L1 = RIG.THIGH, L2 = RIG.SHIN;
    let ds = tS - hip.s, df = tF - hip.f, dz = tZ - hip.z, d = Math.hypot(ds, df, dz);
    const dd = clamp(d, 1, L1 + L2 - 0.05);
    const us = ds / d, uf = df / d, uz = dz / d;
    // forward vector made perpendicular to the leg line: that is where the knee goes
    let ps = -us * uf, pf = 1 - uf * uf, pz = -uz * uf;
    const pl = Math.hypot(ps, pf, pz) || 1; ps /= pl; pf /= pl; pz /= pl;
    const a = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    knee.s = hip.s + us * a + ps * h; knee.f = hip.f + uf * a + pf * h; knee.z = hip.z + uz * a + pz * h;
    ankle.s = hip.s + us * dd; ankle.f = hip.f + uf * dd; ankle.z = hip.z + uz * dd;
  }

  /**
   * Build this frame's pose.
   * o: { yaw, view, flip, walk:{ms, mf, amp, phase}, crouch, lean, tilt, spin, rightTarget:{x,y} | null,
   *      leftTarget:{x,y} | null (screen), leftRest:{s,f,z} (char frame, used when leftTarget is null),
   *      rightRest:{s,f,z}, weaponRot, twoHand:{gap} | null }
   */
  pose(o) {
    const J = this.j;
    this.yaw = o.yaw; this.dir = ((Math.round(o.yaw / (TAU / RIG_DIRS)) % RIG_DIRS) + RIG_DIRS) % RIG_DIRS;
    this._c = Math.cos(o.yaw); this._s = Math.sin(o.yaw);
    const w = o.walk, cr = o.crouch;
    // ---- legs + pelvis (3D)
    const bob = -1.6 * w.amp / 11 * Math.pow(Math.sin(w.phase), 2);
    J.pelvis.s = 0; J.pelvis.f = 0; J.pelvis.z = RIG.HIP_Z - cr + bob;
    J.hipL.s = -RIG.HIP_W; J.hipR.s = RIG.HIP_W;
    for (const h of [J.hipL, J.hipR]) { h.f = 0; h.z = J.pelvis.z; }
    const feet = o.feet;
    for (const side of [-1, 1]) {
      const ph = w.phase + (side < 0 ? 0 : Math.PI), stride = Math.sin(ph) * w.amp;
      const lift = Math.max(0, Math.cos(ph)) * (2 + w.amp * 0.45);
      let tS = side * RIG.FOOT_W + w.ms * stride, tF = w.mf * stride, tZ = 3.5 + lift;
      if (feet) { tS += side * feet.spread; tF += feet.f * side + feet.fwd; tZ += feet.z; }
      const hip = side < 0 ? J.hipL : J.hipR, knee = side < 0 ? J.kneeL : J.kneeR, ank = side < 0 ? J.ankleL : J.ankleR;
      this.leg(hip, knee, ank, tS, tF, tZ);
      const toe = side < 0 ? J.toeL : J.toeR;
      toe.s = ank.s + side * 1.2; toe.f = ank.f + RIG.FOOT; toe.z = Math.max(0.5, ank.z - 2.5);
    }
    // ---- spine (3D), then upper body lean in screen space around the waist
    J.waist.s = 0; J.waist.f = 0.5; J.waist.z = J.pelvis.z + (RIG.WAIST_Z - RIG.HIP_Z);
    J.neck.s = 0; J.neck.f = 1.0 + o.hunch; J.neck.z = J.pelvis.z + (RIG.NECK_Z - RIG.HIP_Z);
    J.head.s = 0; J.head.f = 1.5 + o.hunch; J.head.z = J.neck.z + 9;
    J.shL.s = -RIG.SHOULDER_W; J.shR.s = RIG.SHOULDER_W;
    for (const sh of [J.shL, J.shR]) { sh.f = 0.5 + o.hunch * 0.6; sh.z = J.pelvis.z + (RIG.SHOULDER_Z - RIG.HIP_Z); }
    for (const n of ['pelvis', 'waist', 'neck', 'head', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'toeL', 'toeR', 'shL', 'shR']) this.project(J[n]);
    const lc = Math.cos(o.lean), ls = Math.sin(o.lean), px = J.waist.x, py = J.waist.y;
    for (const n of ['neck', 'head', 'shL', 'shR']) {
      const q = J[n], dx = q.x - px, dy = q.y - py;
      q.x = px + dx * lc - dy * ls; q.y = py + dx * ls + dy * lc;
    }
    // ---- arms
    this.weaponRot0 = o.weaponRot; this.leanNow = o.lean;
    this.arm(J.shR, J.elR, J.wrR, J.handR, o.rightTarget, o.rightRest, 1);
    if (o.twoHand && o.rightTarget) {
      const gx = J.handR.x - Math.cos(o.weaponRot) * o.twoHand.gap, gy = J.handR.y - Math.sin(o.weaponRot) * o.twoHand.gap;
      this._t2.x = gx; this._t2.y = gy;
      this.arm(J.shL, J.elL, J.wrL, J.handL, this._t2, null, -1);
    } else this.arm(J.shL, J.elL, J.wrL, J.handL, o.leftTarget, o.leftRest, -1);
    // ---- whole-figure tilt (around the feet) and roll spin (around the pelvis)
    if (o.tilt || o.spin) {
      const all = this._all;
      if (o.spin) { const c = Math.cos(o.spin), s = Math.sin(o.spin), cx = J.pelvis.x, cy = J.pelvis.y + 6;
        for (const q of all) { const dx = q.x - cx, dy = q.y - cy; q.x = cx + dx * c - dy * s; q.y = cy + dx * s + dy * c; } }
      if (o.tilt) { const c = Math.cos(o.tilt), s = Math.sin(o.tilt);
        for (const q of all) { const dx = q.x, dy = q.y; q.x = dx * c - dy * s; q.y = dx * s + dy * c; } }
    }
    this.weaponRot = o.weaponRot + (o.spin || 0) + (o.tilt || 0);
    this.weaponX = J.handR.x; this.weaponY = J.handR.y;
    this.bodyRot = o.lean + (o.spin || 0) + (o.tilt || 0);
    this.place(o);
  }

  /** One arm. target (screen) -> IK; otherwise rest (char frame) -> project -> IK. */
  arm(sh, el, wr, hand, target, rest, side) {
    let tx, ty;
    if (target) { tx = target.x; ty = target.y; }
    else { const q = this._tmp; q.s = rest.s; q.f = rest.f; q.z = rest.z; this.project(q); tx = q.x; ty = q.y; }
    // elbow folds outward (away from the body centre on screen) and down: try both folds, keep the better one
    const ox = sh.x - this.j.waist.x;
    const out = Math.abs(ox) > 3 ? Math.sign(ox) : -(Math.sign(this._c) || 1);   // side views: elbow folds back
    ik2(sh.x, sh.y, tx, ty, RIG.UPPER, RIG.FORE, 1, this._m1, this._e1);
    ik2(sh.x, sh.y, tx, ty, RIG.UPPER, RIG.FORE, -1, this._m2, this._e2);
    const score = (m) => (m.x - sh.x) * out - (m.y - sh.y) * 0.6;
    const m = score(this._m1) >= score(this._m2) ? this._m1 : this._m2, e = this._e1;
    el.x = m.x; el.y = m.y; wr.x = e.x; wr.y = e.y;
    // depth: blend shoulder depth toward the target's depth
    el.d = sh.d + (this._tdepth(target, rest, sh) - sh.d) * 0.5; wr.d = this._tdepth(target, rest, sh);
    const ang = target ? this.weaponRot0 : Math.atan2(wr.y - el.y, wr.x - el.x);
    hand.x = wr.x + Math.cos(ang) * RIG.HAND; hand.y = wr.y + Math.sin(ang) * RIG.HAND; hand.d = wr.d;
  }
  _tdepth(target, rest, sh) {
    if (target) return target.d === undefined ? sh.d : target.d;
    return -rest.s * this._c + rest.f * this._s;
  }

  /** Fill each part's screen placement + sort key (bigger key = drawn first = further back). */
  place(o) {
    const J = this.j;
    for (const p of this.parts) {
      if (p.kind === 'seg') {
        const A = J[p.a], B = J[p.b];
        p.x = A.x; p.y = A.y; p.rot = Math.atan2(B.y - A.y, B.x - A.x); p.len = Math.hypot(B.x - A.x, B.y - A.y);
        p.key = (A.d + B.d) / 2 + p.bias;
      } else if (p.kind === 'view') {
        const A = J[p.a]; p.x = A.x; p.y = A.y; p.rot = this.bodyRot; p.key = A.d + p.bias;
      } else {
        const A = J[p.a]; p.x = A.x; p.y = A.y; p.key = A.d + p.bias;
      }
    }
    const P = this.byName;
    // the cape hangs behind the back; the head turns its depth with the body
    P.cape.key = J.neck.d - 8 * this._s + 0.8;          // a point 8 behind the neck (along -forward)
    P.pelvis.rot = this.bodyRot - this.leanNow;
    P.weapon.key = o.weaponDepth;
    P.handR.key = Math.min(P.handR.key, o.weaponDepth - 0.05);
    if (o.twoHand && o.rightTarget) P.handL.key = Math.min(P.handL.key, o.weaponDepth - 0.05);
    P.offhand.key = P.handL.key + 0.05;
    this.order.sort((a, b) => b.key - a.key);
  }
}
// scratch objects (allocated once)
Rig.prototype._tmp = V3(); Rig.prototype._t2 = { x: 0, y: 0, d: undefined };
Rig.prototype._m1 = { x: 0, y: 0 }; Rig.prototype._m2 = { x: 0, y: 0 }; Rig.prototype._e1 = { x: 0, y: 0 }; Rig.prototype._e2 = { x: 0, y: 0 };
Object.defineProperty(Rig.prototype, '_all', { get() { if (!this.__all) this.__all = Object.values(this.j); return this.__all; } });
Rig.prototype.weaponRot0 = 0;

// ---------------------------------------------------------------- player pose (state -> rig)
function pickDir16(facing, cur) {
  const step = TAU / RIG_DIRS, n = ((Math.round(facing / step) % RIG_DIRS) + RIG_DIRS) % RIG_DIRS;
  if (cur === null || cur === undefined) return n;
  return Math.abs(wrap(facing - cur * step)) <= step / 2 + 6 * RAD ? cur : n;     // hysteresis
}
const _rt = { x: 0, y: 0, d: 0 }, _lt = { x: 0, y: 0, d: 0 }, _lr = { s: 0, f: 0, z: 0 }, _rr = { s: 0, f: 0, z: 0 };
const _feet = { spread: 0, f: 0, fwd: 0, z: 0 }, _walk = { ms: 0, mf: 1, amp: 0, phase: 0 }, _two = { gap: 8 };
const _pose = { yaw: 0, view: 'S', flip: 1, walk: _walk, feet: _feet, crouch: 0, lean: 0, hunch: 0, tilt: 0, spin: 0,
  rightTarget: _rt, leftTarget: null, leftRest: _lr, rightRest: _rr, weaponRot: 0, weaponDepth: 0, twoHand: null };

function poseRig(p, dt, t) {
  const R = p.rig, st = p.state, mv = p.move, o = _pose, W = p.weapon;
  p.rigDir = pickDir16(p.facing, p.rigDir);
  const yaw = p.rigDir * TAU / RIG_DIRS, cy = Math.cos(yaw), sy = Math.sin(yaw);
  o.yaw = yaw;
  // ---- walking
  const spd = hypot(p.vx, p.vy), loco = st === S_IDLE || st === S_MOVE;
  const ampT = loco ? clamp(spd / PLAYER_SPEED, 0, 1.6) * 12 : (st === S_DODGE ? 0 : clamp(spd / PLAYER_SPEED, 0, 1) * 7);
  p.walkAmp = dt > 0 ? smooth(p.walkAmp, ampT, 10, dt) : ampT;
  if (spd > 12) {
    _walk.ms = (p.vx * sy - p.vy * cy) / spd; _walk.mf = (p.vx * cy + p.vy * sy) / spd;
    p.walkPhase += dt * Math.PI * spd / (2 * Math.max(6, p.walkAmp + 6));
  } else if (dt > 0) {                                     // settle to a planted stance
    const k = Math.round(p.walkPhase / Math.PI) * Math.PI; p.walkPhase = smooth(p.walkPhase, k, 8, dt);
  }
  _walk.amp = p.walkAmp; _walk.phase = p.walkPhase; _walk.ms = _walk.ms || 0;
  // ---- defaults: relaxed stance
  _feet.spread = 0.5; _feet.f = -1.5; _feet.fwd = 0; _feet.z = 0;
  let crouch = 0.6 + 0.4 * Math.sin(t * 2.2), hunch = 0, lean = p.bodyRot, tilt = 0, spin = 0;
  const swingL = -Math.sin(p.walkPhase) * p.walkAmp * 0.75;
  _lr.s = -9; _lr.f = swingL + 1; _lr.z = 34;
  o.leftTarget = null; o.twoHand = null;
  const attacking = mv && (st === S_WINDUP || st === S_ACTIVE || st === S_RECOVERY);
  const tool = p.kind === 'shoot' || p.kind === 'item' || p.kind === 'flask';
  const heft = attacking ? mv.heft : 0;
  if (p.sprinting) { hunch = 3; crouch += 1.5; }
  if (attacking && !tool && p.kind !== 'visceral') {
    const ph = st === S_WINDUP ? clamp(p.state_t / mv.windup, 0, 1) : st === S_ACTIVE ? 1 : 1 - clamp(p.state_t / Math.max(0.01, mv.recovery), 0, 1);
    crouch += (2 + 5 * heft) * ph; hunch = 1.5 + 2.5 * heft * ph;
    _feet.f = -(3 + 3 * heft) * ph - 1.5; _feet.spread = 1.5 + 2 * ph;          // left foot forward, wider base
    o.twoHand = _two; _two.gap = W.handGap || 8;
  } else if (p.kind === 'visceral' && attacking) {
    crouch += 4; hunch = 3; o.twoHand = _two; _two.gap = W.handGap || 8;
  } else if (p.charging > 0 && loco) {
    const c = clamp((p.charging - CHARGE_START) / (CHARGE_FULL - CHARGE_START), 0, 1);
    crouch += 2 + 5 * c; hunch = 2 + 2 * c; _feet.f = -3 - 2 * c; _feet.spread = 2 + c; o.twoHand = _two; _two.gap = W.handGap || 8;
  }
  if (tool && attacking) {
    const ph = st === S_WINDUP ? clamp(p.state_t / mv.windup, 0, 1) : st === S_ACTIVE ? 1 : 1 - clamp(p.state_t / Math.max(0.01, mv.recovery), 0, 1);
    const rel = p.attack_dir - yaw, ds = -Math.sin(rel), df = Math.cos(rel);
    if (p.kind === 'flask') { _lr.s = -2 + 1 * (1 - ph); _lr.f = 4 + 3 * ph; _lr.z = 40 + 26 * ph; hunch = -1 * ph; }
    else if (p.kind === 'shoot') { _lr.s = -RIG.SHOULDER_W * 0.6 + ds * 24 * ph; _lr.f = 1 + df * 24 * ph; _lr.z = 34 + 22 * ph; _feet.f = -2 * ph; }
    else { // thrown item: up and back, then forward
      const back = st === S_WINDUP ? ph : 0, fwd = st === S_WINDUP ? 0 : ph;
      _lr.s = -6 + ds * 18 * fwd; _lr.f = -6 * back + df * 20 * fwd; _lr.z = 34 + 36 * back + 18 * fwd; hunch = 2 * fwd;
    }
  }
  if (st === S_DODGE) {
    // dash: low and long, leading foot planted ahead, back foot trailing, free arm swept back
    const q = clamp(p.state_t / p.dodge_prof.time, 0, 1), arc = Math.sin(Math.PI * Math.min(1, q * 1.4));
    crouch = 2 + 8 * arc; hunch = 6 * arc;
    _walk.ms = 0; _walk.mf = 1; _walk.amp = 13 * arc; _walk.phase = Math.PI / 2;
    _feet.spread = 0.5; _feet.f = 0; _feet.z = 0;
    _lr.s = -8; _lr.f = -10 * arc; _lr.z = 38;
    lean = -Math.cos(p.dodge_dir) * 0.28 * arc;
  } else if (st === S_HURT) { crouch += 3; hunch = -1.5; }
  else if (st === S_DEAD) {
    const k = Math.min(1, p.state_t / 0.8);
    crouch = 6 + 12 * Math.min(1, p.state_t / 0.35); tilt = p.bodyRot; lean = 0;
    void k;
  }
  o.crouch = crouch; o.hunch = hunch; o.lean = lean * 0.8; o.tilt = tilt; o.spin = spin;
  // ---- right hand holds the weapon where the weapon animation puts its grip
  _rt.x = p.swordX; _rt.y = p.swordY; _rt.d = Math.sin(p.sword_angle) * p.sword_r * 0.6;
  o.weaponRot = p.sword_rot; o.weaponDepth = _rt.d;
  o.rightTarget = _rt;
  R.pose(o);
  // visor: front of the head, fades as he turns away
  const H = R.j.head, fwd = -sy;
  p.visorX = H.x + cy * 5.6; p.visorY = H.y + sy * 5.6 * K - 0.5;
  p.visorSX = Math.max(0.25, Math.abs(fwd)); p.visorAlpha = st === S_DEAD ? 0 : clamp((fwd + 0.25) * 1.8, 0, 1);
}
