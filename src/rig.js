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

const RIG_LIGHT = [-0.45, -0.35, 0.8];
let USE_3D = false;                                  // set true when the WebGL character renderer is running          // light from the camera side, upper left (art + cloth shading)
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
      'shL', 'shR', 'elL', 'elR', 'wrL', 'wrR', 'handL', 'handR', 'holster', 'flaskProp']) J[n] = V3();
    // parts: what to draw. kind 'seg' = limb between two joints, 'view' = per-view picture at a joint.
    const P = (name, kind, a, b, bias) => ({ name, kind, a, b, bias, key: 0, x: 0, y: 0, rot: 0, len: 0, side: 0 });
    this.parts = [
      P('thighL', 'seg', 'hipL', 'kneeL', 0), P('shinL', 'seg', 'kneeL', 'ankleL', 0), P('footL', 'seg', 'ankleL', 'toeL', -0.2),
      P('thighR', 'seg', 'hipR', 'kneeR', 0), P('shinR', 'seg', 'kneeR', 'ankleR', 0), P('footR', 'seg', 'ankleR', 'toeR', -0.2),
      P('pelvis', 'view', 'pelvis', null, -0.4),
      P('torso', 'view', 'waist', null, 0.6),
      P('cape', 'cloth', 'neck', null, 0),
      P('tabard', 'cloth', 'pelvis', null, -0.6),
      P('holster', 'prop', 'holster', null, -0.15), P('flaskProp', 'prop', 'flaskProp', null, -0.15),
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
    this.grip = { s: 0, f: 0, z: 0 }; this.blade = { s: 1, f: 0, z: 0 };
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
    // ---- spine, all in the char frame; a little roll into the direction he is moving
    J.waist.s = 0; J.waist.f = 0.5; J.waist.z = J.pelvis.z + (RIG.WAIST_Z - RIG.HIP_Z);
    J.neck.s = 0; J.neck.f = 1.0 + o.hunch; J.neck.z = J.pelvis.z + (RIG.NECK_Z - RIG.HIP_Z);
    J.head.s = 0; J.head.f = 1.5 + o.hunch; J.head.z = J.neck.z + 9;
    J.shL.s = -RIG.SHOULDER_W; J.shR.s = RIG.SHOULDER_W;
    for (const sh of [J.shL, J.shR]) { sh.f = 0.5 + o.hunch * 0.6; sh.z = J.pelvis.z + (RIG.SHOULDER_Z - RIG.HIP_Z); }
    J.holster.s = -8.4; J.holster.f = -0.8; J.holster.z = J.pelvis.z + 1.5;
    J.flaskProp.s = 7.9; J.flaskProp.f = 2.2; J.flaskProp.z = J.pelvis.z + 3;
    if (o.roll) {
      const rc = Math.cos(o.roll), rs = Math.sin(o.roll), wz = J.waist.z;
      for (const q of [J.neck, J.head, J.shL, J.shR]) { const ds = q.s, dz = q.z - wz; q.s = ds * rc + dz * rs; q.z = wz - ds * rs + dz * rc; }
    }
    // ---- arms (3D IK, elbows fold down / out / back)
    const G = o.grip, B = o.blade, HG = RIG.HAND * 0.5;
    this._w.s = G.s - B.s * HG; this._w.f = G.f - B.f * HG; this._w.z = G.z - B.z * HG;
    this.arm3(J.shR, J.elR, J.wrR, J.handR, this._w, 1, B);
    // the weapon sits where the right hand actually got to
    this.grip.s = J.wrR.s + B.s * HG; this.grip.f = J.wrR.f + B.f * HG; this.grip.z = J.wrR.z + B.z * HG;
    this.blade.s = B.s; this.blade.f = B.f; this.blade.z = B.z;
    if (o.twoHand) {
      const gap = o.twoHand.gap;
      this._w.s = this.grip.s - B.s * (gap + HG); this._w.f = this.grip.f - B.f * (gap + HG); this._w.z = this.grip.z - B.z * (gap + HG);
      this.arm3(J.shL, J.elL, J.wrL, J.handL, this._w, -1, B);
    } else this.arm3(J.shL, J.elL, J.wrL, J.handL, o.leftTarget || o.leftRest, -1, null);
    // ---- death: fall backward around the feet
    if (o.tilt) {
      const c = Math.cos(o.tilt), sn = Math.sin(o.tilt);
      for (const q of this._all) { const f = q.f, z = q.z; q.f = f * c - z * sn; q.z = f * sn + z * c; }
      for (const q of [this.grip, this.blade]) { const f = q.f, z = q.z; q.f = f * c - z * sn; q.z = f * sn + z * c; }
    }
    // ---- screen projection (2D fallback renderer, visor glow, props)
    for (const q of this._all) this.project(q);
    const gq = this._tmp; gq.s = this.grip.s; gq.f = this.grip.f; gq.z = this.grip.z; this.project(gq);
    const tx = gq.x, ty = gq.y, td = gq.d;
    gq.s += this.blade.s * 20; gq.f += this.blade.f * 20; gq.z += this.blade.z * 20; this.project(gq);
    this.weaponX = tx; this.weaponY = ty; this.weaponRot = Math.atan2(gq.y - ty, gq.x - tx);
    this.weaponRot0 = this.weaponRot; this.leanNow = 0;
    this.bodyRot = 0;
    o.weaponDepth = td;
    this.place(o);
  }

  /** Two-bone arm IK in the char frame. side +1 right / -1 left; handDir: where the hand points (or along the forearm). */
  arm3(sh, el, wr, hand, t0, side, handDir) {
    const L1 = RIG.UPPER, L2 = RIG.FORE, J = this.j;
    // keep the hand out of his torso: a target inside the body is pushed out to the front (or the back)
    const t = this._t3; t.s = t0.s; t.f = t0.f; t.z = t0.z;
    const pelZ = J.pelvis.z, zr = t.z - pelZ;
    if (zr > -10 && zr < 27) {
      const a = (zr < 6 ? 8.2 : 10.2) + 4, b = (zr < 6 ? 5.6 : 6.0) + 4, fc = 0.6 + (J.neck.f - 1.0) * clamp(zr / 24, 0, 1);
      const u = t.s / a, v = (t.f - fc) / b, r = u * u + v * v;
      if (r < 1) { const dir = t.f >= fc - 2 ? 1 : -1; t.f = fc + dir * b * Math.sqrt(Math.max(0, 1 - u * u)); }
    }
    // an arm reaching across his body folds its elbow forward instead of out and back
    const cross = clamp((-t.s * side) / 8, 0, 1);
    const ds = t.s - sh.s, df = t.f - sh.f, dz = t.z - sh.z, d = Math.hypot(ds, df, dz) || 1e-4;
    const dd = clamp(d, Math.abs(L1 - L2) + 0.5, L1 + L2 - 0.05);
    const us = ds / d, uf = df / d, uz = dz / d;
    // pole: out to his side, a little back, and down
    let ps = side * (0.6 - 0.4 * cross), pf = -0.35 + 1.35 * cross, pz = -1 + 0.4 * cross;
    const k = ps * us + pf * uf + pz * uz; ps -= k * us; pf -= k * uf; pz -= k * uz;
    let pl = Math.hypot(ps, pf, pz);
    if (pl < 1e-3) { ps = side; pf = 0; pz = 0; pl = 1; }
    ps /= pl; pf /= pl; pz /= pl;
    const a = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    el.s = sh.s + us * a + ps * h; el.f = sh.f + uf * a + pf * h; el.z = sh.z + uz * a + pz * h;
    wr.s = sh.s + us * dd; wr.f = sh.f + uf * dd; wr.z = sh.z + uz * dd;
    let hs, hf, hz;
    if (handDir) { hs = handDir.s; hf = handDir.f; hz = handDir.z; }
    else { hs = wr.s - el.s; hf = wr.f - el.f; hz = wr.z - el.z; const hl = Math.hypot(hs, hf, hz) || 1; hs /= hl; hf /= hl; hz /= hl; }
    hand.s = wr.s + hs * RIG.HAND; hand.f = wr.f + hf * RIG.HAND; hand.z = wr.z + hz * RIG.HAND;
  }

  /** Fill each part's screen placement + sort key (bigger key = drawn first = further back). */
  place(o) {
    const J = this.j;
    for (const p of this.parts) {
      if (p.kind === 'seg') {
        const A = J[p.a], B = J[p.b];
        p.x = A.x; p.y = A.y; p.rot = Math.atan2(B.y - A.y, B.x - A.x); p.len = Math.hypot(B.x - A.x, B.y - A.y);
        p.key = (A.d + B.d) / 2 + p.bias;
      } else if (p.kind === 'view' || p.kind === 'prop' || p.kind === 'cloth') {
        const A = J[p.a]; p.x = A.x; p.y = A.y; p.rot = this.bodyRot; p.key = A.d + p.bias;
      } else {
        const A = J[p.a]; p.x = A.x; p.y = A.y; p.key = A.d + p.bias;
      }
    }
    const P = this.byName;
    // the cape hangs behind the back; the head turns its depth with the body
    P.cape.key = J.neck.d - 8 * this._s + 0.8;          // a point 8 behind the neck (along -forward)
    if (o.capeLow !== undefined) P.cape.key = Math.min(P.cape.key, o.capeLow + 1);
    if (o.tabardDepth !== undefined) P.tabard.key = o.tabardDepth - 0.6;
    P.pelvis.rot = this.bodyRot - this.leanNow;
    P.holster.rot = P.flaskProp.rot = P.pelvis.rot;
    P.pelvis.rot = this.bodyRot - this.leanNow;
    P.weapon.key = o.weaponDepth;
    P.handR.key = Math.min(P.handR.key, o.weaponDepth - 0.05);
    if (o.twoHand) P.handL.key = Math.min(P.handL.key, o.weaponDepth - 0.05);
    P.offhand.key = P.handL.key + 0.05;
    this.order.sort((a, b) => b.key - a.key);
  }
}
// scratch objects (allocated once)
Rig.prototype._tmp = V3(); Rig.prototype._w = V3(); Rig.prototype._t3 = V3();
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
const _grip = { s: 0, f: 0, z: 0 }, _blade = { s: 1, f: 0, z: 0 };
const _feet = { spread: 0, f: 0, fwd: 0, z: 0 }, _walk = { ms: 0, mf: 1, amp: 0, phase: 0 }, _two = { gap: 8 };
const _pose = { yaw: 0, view: 'S', flip: 1, walk: _walk, feet: _feet, crouch: 0, lean: 0, hunch: 0, tilt: 0, spin: 0,
  rightTarget: _rt, leftTarget: null, leftRest: _lr, rightRest: _rr, weaponRot: 0, weaponDepth: 0, twoHand: null };

function poseRig(p, dt, t) {
  const R = p.rig, st = p.state, mv = p.move, o = _pose, W = p.weapon;
  p.rigDir = pickDir16(p.facing, p.rigDir);
  const yaw = USE_3D ? p.facing : p.rigDir * TAU / RIG_DIRS, cy = Math.cos(yaw), sy = Math.sin(yaw);
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
  const bothHands = W.stance && W.stance.hands === 2;
  if (bothHands && !(tool && attacking)) { o.twoHand = _two; _two.gap = W.handGap || 8; }      // 2h: both hands, always
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
  // lean into the direction of travel (a roll toward the side he is moving to)
  const roll = loco || st === S_DODGE ? clamp(_walk.ms * Math.min(1.4, spd / PLAYER_SPEED), -1.4, 1.4) * 0.1 : 0;
  o.crouch = crouch; o.hunch = hunch; o.roll = roll; o.tilt = st === S_DEAD ? Math.abs(tilt) : 0; o.spin = 0; o.lean = 0;
  void lean; void spin;
  // ---- the weapon in 3D: grip position and blade direction from the weapon animation, in the char frame
  const ga = p.sword_angle, gr = p.sword_r, gX = Math.cos(ga) * gr, gY = Math.sin(ga) * gr;
  _grip.s = gX * sy - gY * cy; _grip.f = gX * cy + gY * sy; _grip.z = p.sword_elev;
  // attacks work in front of the chest: the arc is centred ahead of him, wind-ups chamber close to the body
  if (attacking && !tool) {
    const ph = st === S_WINDUP ? 1 : st === S_ACTIVE ? 0.7 : 0.85;
    _grip.f += 8 * ph;
    if (st === S_WINDUP) { _grip.s *= 0.72; }
  } else if (p.charging > 0) _grip.f += 6;
  const bh = p.bladeH, be = p.bladeE, bX = Math.cos(be) * Math.cos(bh), bY = Math.cos(be) * Math.sin(bh);
  _blade.s = bX * sy - bY * cy; _blade.f = bX * cy + bY * sy; _blade.z = Math.sin(be);
  o.grip = _grip; o.blade = _blade;
  o.capeLow = p.cloths.cape && p.cloths.cape.live ? p.cloths.cape.lowDepth() : undefined;
  o.tabardDepth = p.cloths.tabard && p.cloths.tabard.live ? p.cloths.tabard.lowDepth() : undefined;
  R.pose(o);
  for (const name in p.cloths) p.cloths[name].step(p, dt);
  // visor: front of the head, fades as he turns away
  const H = R.j.head, fwd = -sy;
  p.visorX = H.x + cy * 5.6; p.visorY = H.y + sy * 5.6 * K - 0.5;
  p.visorSX = Math.max(0.25, Math.abs(fwd)); p.visorAlpha = st === S_DEAD ? 0 : clamp((fwd + 0.25) * 1.8, 0, 1);
}

// ---------------------------------------------------------------- cloth (cloak, tabard, sashes)
// A small grid of points hanging from the body, simulated in world space with Verlet integration:
// it trails when he runs or dashes, swings on turns and settles when he stops.
// The top row is pinned to a joint. kind 'back' hangs from the shoulders behind him; kind 'front'
// hangs from the belt in front of him. Each keeps to its side of the body and drapes over the legs.
class Cloth {
  constructor(cl) {
    this.cols = cl.cols || 9; this.rows = cl.rows || 8;
    const n = this.cols * this.rows;
    const F = () => new Float64Array(n);
    this.x = F(); this.y = F(); this.z = F(); this.px = F(); this.py = F(); this.pz = F();
    this.rx = F(); this.ry = F(); this.rz = F(); this.lenV = F(); this.lenH = F();
    this.sx = F(); this.sy = F(); this.sd = F(); this._cs = new Float32Array(n * 3);   // char-frame copy for the 3D renderer
    this.live = false; this.cloth = cl; this.t = 0; this.joint = cl.kind === 'front' ? 'pelvis' : 'neck';
    this.quads = []; for (let i = 0; i < (this.cols - 1) * (this.rows - 1); i++) this.quads.push({ i: 0, d: 0, key: 0, outer: true, light: 0, row: 0, quad: true, cloth: this });
    this.shape(cl);
  }
  /** Rest shape in the char frame, relative to the anchor joint. */
  shape(cl) {
    const C = this.cols, Rw = this.rows;
    for (let j = 0; j < Rw; j++) for (let i = 0; i < C; i++) {
      const k = j * C + i, u = j / (Rw - 1), v = i / (C - 1);
      const tat = j === Rw - 1 ? cl.tatter[i % cl.tatter.length] : 0;
      if (cl.kind === 'front') {
        // a flat panel across the front of the hips, slightly wider at the bottom
        const w = cl.topA + (cl.botA - cl.topA) * u;
        this.rx[k] = (v - 0.5) * 2 * w; this.ry[k] = cl.topB + (cl.botB - cl.topB) * u - Math.abs(v - 0.5) * 2.5;
        this.rz[k] = cl.top - cl.length * u - tat;
      } else {
        const t0 = Math.PI / 2 - 0.08, t1 = Math.PI * 1.5 + 0.08, th = t0 + (t1 - t0) * v;
        const A = cl.topA + (cl.botA - cl.topA) * u, B = cl.topB + (cl.botB - cl.topB) * u;
        this.rx[k] = A * Math.sin(th); this.ry[k] = -0.6 - 4.9 * u + B * Math.cos(th);
        this.rz[k] = -2.5 - cl.length * u - tat;
      }
    }
    for (let k = 0; k < C * Rw; k++) {
      if (k >= C) { const q = k - C; this.lenV[k] = Math.hypot(this.rx[k] - this.rx[q], this.ry[k] - this.ry[q], this.rz[k] - this.rz[q]); }
      if (k % C) { const q = k - 1; this.lenH[k] = Math.hypot(this.rx[k] - this.rx[q], this.ry[k] - this.ry[q], this.rz[k] - this.rz[q]); }
    }
  }
  anchor(k, gx, gy, J, c, s, out) {
    const S = this.rx[k], F = this.ry[k] + J.f, Z = this.rz[k] + J.z;
    out[0] = gx + S * s + F * c; out[1] = gy - S * c + F * s; out[2] = Z;
  }
  reset(p) {
    const R = p.rig, c = Math.cos(R.yaw), s = Math.sin(R.yaw), J = R.j[this.joint], q = this._q;
    for (let k = 0; k < this.x.length; k++) {
      this.anchor(k, p.gx, p.gy, J, c, s, q);
      this.x[k] = this.px[k] = q[0]; this.y[k] = this.py[k] = q[1]; this.z[k] = this.pz[k] = q[2];
    }
    this.live = true; this.lgx = p.gx; this.lgy = p.gy;
  }
  step(p, dt) {
    if (!this.live || Math.hypot(p.gx - this.lgx, p.gy - this.lgy) > 120) this.reset(p);
    this.lgx = p.gx; this.lgy = p.gy;
    if (dt <= 0) { this.project(p); return; }
    const cl = this.cloth, C = this.cols, R = p.rig, c = Math.cos(R.yaw), s = Math.sin(R.yaw), J = R.j[this.joint], q = this._q, n = this.x.length;
    const front = cl.kind === 'front', side = front ? 1 : -1;
    this.t += dt;
    const spd = Math.hypot(p.vx, p.vy), loose = 1 - 0.75 * Math.min(1, spd / 400);
    const sub = 2, h = Math.min(dt, 1 / 30) / sub, damp = 0.965, grav = 900 * cl.weight * h * h;
    for (let it = 0; it < sub; it++) {
      for (let k = C; k < n; k++) {
        const vx = (this.x[k] - this.px[k]) * damp, vy = (this.y[k] - this.py[k]) * damp, vz = (this.z[k] - this.pz[k]) * damp;
        this.px[k] = this.x[k]; this.py[k] = this.y[k]; this.pz[k] = this.z[k];
        const row = Math.floor(k / C) / (this.rows - 1);
        const wind = Math.sin(this.t * 1.7 + k * 0.7) * 6 * row * h * h * 60;      // a faint living sway
        const air = (cl.drag || 1) * 0.03 * row * h;                               // air pushes the cloth back as he moves
        this.x[k] += vx + wind - p.vx * air; this.y[k] += vy + wind * 0.5 - p.vy * air; this.z[k] += vz - grav + air * spd * 0.12;
      }
      for (let i = 0; i < C; i++) {                                                // pin the top row
        this.anchor(i, p.gx, p.gy, J, c, s, q);
        this.x[i] = this.px[i] = q[0]; this.y[i] = this.py[i] = q[1]; this.z[i] = this.pz[i] = q[2];
      }
      for (let k = C; k < n; k++) {                                                // soft pull toward the rest shape
        this.anchor(k, p.gx, p.gy, J, c, s, q);
        const w = (cl.stiff || 0.012) * loose;            // looser while moving fast so it can stream out
        this.x[k] += (q[0] - this.x[k]) * w; this.y[k] += (q[1] - this.y[k]) * w; this.z[k] += (q[2] - this.z[k]) * w;
      }
      for (let pass = 0; pass < 3; pass++) {
        for (let k = C; k < n; k++) {
          this.link(k, k - C, this.lenV[k], Math.floor(k / C) === 1);
          if (k % C) this.link(k, k - 1, this.lenH[k], false);
        }
        for (let k = C; k < n; k++) {
          const dx = this.x[k] - p.gx, dy = this.y[k] - p.gy;
          let S = dx * s - dy * c, F = dx * c + dy * s;
          const z = this.z[k];
          if (front) { if (Math.abs(S) < 9 && F < 5.5 && z > 18) F = 5.5; }        // stay in front of the hips
          else {
            const back = z > 30 ? -5.5 : -4.5;
            if (Math.abs(S) < 12 && F > back && z > 8) F = back;                   // stay behind the torso
            const r = Math.hypot(S, F); if (r < 7) { const m = 7 / (r || 1); S *= m; F *= m; }
          }
          const Jj = R.j;
          for (const [A, B] of this._legs(Jj)) {                                   // drape over the legs
            const ex = B.s - A.s, ef = B.f - A.f, ez = B.z - A.z, L2 = ex * ex + ef * ef + ez * ez || 1;
            const u = clamp(((S - A.s) * ex + (F - A.f) * ef + (z - A.z) * ez) / L2, 0, 1);
            const qs = A.s + ex * u, qf = A.f + ef * u, qz = A.z + ez * u;
            let ds = S - qs, df = F - qf; const dz = z - qz, dd = Math.hypot(ds, df, dz), rad = 5.5;
            if (dd < rad && Math.abs(dz) < rad) {
              if (df * side < 0.5) { df = 0.5 * side; ds *= 0.5; }               // settle on this cloth's side of the leg
              const hl = Math.hypot(ds, df) || 1; S = qs + ds / hl * rad; F = qf + df / hl * rad;
            }
          }
          this.x[k] = p.gx + S * s + F * c; this.y[k] = p.gy - S * c + F * s;
          if (this.z[k] < 1.5) this.z[k] = 1.5;
        }
      }
    }
    this.project(p);
  }
  link(a, b, L, pinnedB) {
    const dx = this.x[a] - this.x[b], dy = this.y[a] - this.y[b], dz = this.z[a] - this.z[b], d = Math.hypot(dx, dy, dz) || 1e-6;
    if (d < L * 0.85 && !pinnedB) return;                       // cloth can bunch freely; only stretching is resisted
    const e = (d - L) / d, wa = pinnedB ? 1 : 0.5, wb = pinnedB ? 0 : 0.5;
    this.x[a] -= dx * e * wa; this.y[a] -= dy * e * wa; this.z[a] -= dz * e * wa;
    this.x[b] += dx * e * wb; this.y[b] += dy * e * wb; this.z[b] += dz * e * wb;
  }
  /** Project into the player's layer space (origin at his feet, y up) and prepare the sorted quads. */
  project(p) {
    const n = this.x.length, C = this.cols, front = this.cloth.kind === 'front', R = p.rig;
    const fx = Math.cos(R.yaw), fy = Math.sin(R.yaw);
    for (let k = 0; k < n; k++) {
      const X = this.x[k] - p.gx, Y = this.y[k] - p.gy;
      this.sx[k] = X; this.sy[k] = Y * K + this.z[k]; this.sd[k] = Y;
      this._cs[k * 3] = X * fy - Y * fx; this._cs[k * 3 + 1] = X * fx + Y * fy; this._cs[k * 3 + 2] = this.z[k];
    }
    let qi = 0;
    for (let j = 0; j < this.rows - 1; j++) for (let i = 0; i < C - 1; i++) {
      const k = j * C + i, Q = this.quads[qi++];
      Q.i = k; Q.row = j; Q.d = (this.sd[k] + this.sd[k + 1] + this.sd[k + C] + this.sd[k + C + 1]) / 4;
      Q.key = Q.d + (front ? -0.3 : 0.5);              // each panel sorts against the limbs on its own
      const ax = this.x[k + 1] - this.x[k], ay = this.y[k + 1] - this.y[k], az = this.z[k + 1] - this.z[k];
      const bx = this.x[k + C] - this.x[k], by = this.y[k + C] - this.y[k], bz = this.z[k + C] - this.z[k];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      // orient the normal to the outer face: away from the body axis (cape) or forward (tabard)
      const ox = front ? fx : (this.x[k] + this.x[k + 1]) / 2 - p.gx, oy = front ? fy : (this.y[k] + this.y[k + 1]) / 2 - p.gy;
      if (nx * ox + ny * oy < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      Q.outer = ny - K * nz < 0;
      const L = RIG_LIGHT, ll = Math.hypot(L[0], L[1], L[2]), sg = Q.outer ? 1 : -1;
      Q.light = clamp(sg * (nx * L[0] + ny * L[1] + nz * L[2]) / ll, 0, 1);
    }
    this.quads.sort((a, b) => b.d - a.d);
  }
  /** Mean depth of the lower half (for sorting the cloth against the legs). */
  lowDepth() {
    let sum = 0, m = 0;
    for (let k = Math.floor(this.rows / 2) * this.cols; k < this.sd.length; k++) { sum += this.sd[k]; m++; }
    return sum / m;
  }
}
Cloth.prototype._q = [0, 0, 0];
Cloth.prototype._legs = function (J) {
  const L = this.__legs || (this.__legs = [[null, null], [null, null], [null, null], [null, null]]);
  L[0][0] = J.hipL; L[0][1] = J.kneeL; L[1][0] = J.kneeL; L[1][1] = J.ankleL;
  L[2][0] = J.hipR; L[2][1] = J.kneeR; L[3][0] = J.kneeR; L[3][1] = J.ankleR;
  return L;
};
