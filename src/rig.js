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

/** How far forward (+) or back (-) a char-frame point must move to sit outside his torso (coat + an arm's thickness). */
function torsoPush(J, s, f, z, margin) {
  if (J._cy) { const c = Math.cos(J._cy), sn = Math.sin(J._cy), ds = s - J.waist.s, df = f - J.waist.f;   // into the twisted chest
    s = J.waist.s + ds * c + df * sn; f = J.waist.f - ds * sn + df * c; }
  const zr = z - J.pelvis.z;
  if (zr < -12 || zr > 25) return 0;
  // coat profile: skirt / hips / belly / chest / shoulders (half width a, half depth b)
  const a = zr < -2 ? 9.2 : zr < 9 ? 8.4 : zr < 15 ? 9.6 : 11.2, b = zr < -2 ? 6.6 : zr < 9 ? 5.6 : zr < 15 ? 6.3 : 5.9;
  const k = clamp((z - J.waist.z) / (J.neck.z - J.waist.z), 0, 1), fc = J.waist.f + (J.neck.f - J.waist.f) * k;
  const A = a + margin, Bd = b + margin, u = s / A;
  if (Math.abs(u) >= 1) return 0;
  const edge = Bd * Math.sqrt(1 - u * u), d = f - fc;
  if (Math.abs(d) >= edge) return 0;
  return d >= -1.5 ? edge - d : -(edge + d);
}
/** Keep a point behind his back: (s, f, z) in the char frame; returns the f it may be at most (or f itself).
 *  Same coat profile as torsoPush, turned with the chest above the waist and with the hips below it. */
function torsoBackF(J, s, f, z, margin) {
  const zr = z - J.pelvis.z;
  if (zr < -14 || zr > 26) return f;
  const tw = z >= J.waist.z ? J._cy || 0 : J._py || 0, c = Math.cos(tw), sn = Math.sin(tw);
  const ds = s - J.waist.s, df = f - J.waist.f, ls = ds * c + df * sn, lf = -ds * sn + df * c;      // into the body's frame
  const a = zr < -2 ? 9.6 : zr < 9 ? 8.8 : zr < 15 ? 9.8 : 11.4, b = zr < -2 ? 7.0 : zr < 9 ? 6.0 : zr < 15 ? 6.6 : 6.2;
  const k = clamp((z - J.waist.z) / (J.neck.z - J.waist.z), 0, 1), fc = (J.neck.f - J.waist.f) * k;
  const A = a + margin, u = ls / A;
  if (Math.abs(u) >= 1) return f;
  const back = fc - (b + margin) * Math.sqrt(1 - u * u);
  if (lf <= back) return f;
  // pushed straight back in the body's frame, then turned back into the char frame
  const nf = back, ns = ls;
  return J.waist.f + ns * sn + nf * c + (s - (J.waist.s + ns * c - nf * sn)) * 0;   // f of the corrected point
}
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

/**
 * Gait: where one foot is in its cycle. phase (radians, 2 pi = one full cycle = two steps), duty = share of the cycle
 * the foot is planted. Planted, it sweeps back from +amp to -amp at exactly ground speed (no sliding): heel strike
 * with the toe up, foot flat, then the heel rises while the toe stays down. In the air it follows the human swing
 * path: it lifts BEHIND him first (knee folding, heel up), passes low under the hip, and the leg reaches forward
 * almost straight to land on the heel. A run folds the knee much more (the heel kicks back) and floats between steps.
 * duty < 0.5 = running. Writes [stride, lift, toe] (toe: how far the toe sits above its flat-foot height).
 */
const _gk = [0, 0.27, 0.52, 0.8, 1];
function _herm(k, ys) {                              // smooth curve through 5 knots (Catmull-Rom on uneven spacing)
  const X = _gk; let i = 0; while (i < 3 && k > X[i + 1]) i++;
  const h = X[i + 1] - X[i], u = (k - X[i]) / h;
  const m = (j) => j <= 0 ? (ys[1] - ys[0]) / (X[1] - X[0]) : j >= 4 ? (ys[4] - ys[3]) / (X[4] - X[3]) : (ys[j + 1] - ys[j - 1]) / (X[j + 1] - X[j - 1]);
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h * m(i) + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h * m(i + 1);
}
const _gf_s = [0, 0, 0, 0, 0], _gf_l = [0, 0, 0, 0, 0], _gf_t = [0, 0, 0, 0, 0];
function gaitFoot(phase, amp, duty, out) {
  const u = ((phase / TAU) % 1 + 1) % 1;
  if (!duty) { out[0] = Math.sin(phase) * amp; out[1] = Math.max(0, Math.cos(phase)) * (2 + amp * 0.45); out[2] = 0; return out; }
  const r = clamp((0.5 - duty) / 0.33, 0, 1), heel = 1.0 + 2.0 * r;
  if (u < duty) {
    const s = u / duty;
    out[0] = amp * (1 - 2 * s);
    out[1] = heel * Math.max(0, (s - 0.55) / 0.45) ** 2;                            // heel rises late in the stance
    out[2] = s < 0.18 ? (1 - s / 0.18) * 2.4 * (1 - 0.6 * r) : -out[1];             // toe up at the strike, then on the floor
    return out;
  }
  const k = (u - duty) / (1 - duty), H = (3.0 + 0.05 * amp) * (1 - r) + 0.66 * amp * r;
  // f (in units of amp) and lift along the swing; walk and run paths blended
  _gf_s[0] = -1; _gf_s[1] = -0.72 - 0.18 * r; _gf_s[2] = 0.02 + 0.04 * r; _gf_s[3] = 0.82 + 0.08 * r; _gf_s[4] = 1;
  _gf_l[0] = heel; _gf_l[1] = H; _gf_l[2] = 1.5 * (1 - r) + 0.72 * H * r; _gf_l[3] = 0.8 * (1 - r) + 0.28 * H * r; _gf_l[4] = 0;
  _gf_t[0] = -heel; _gf_t[1] = -1.8; _gf_t[2] = -0.4; _gf_t[3] = 1.0; _gf_t[4] = 2.4 * (1 - 0.6 * r);
  out[0] = amp * _herm(k, _gf_s); out[1] = Math.max(0, _herm(k, _gf_l)); out[2] = _herm(k, _gf_t);
  return out;
}
/** Vertical bob of the hips for a gait (left foot at `phase`): a walk is lowest just after each heel strike and
 *  highest as he passes over the planted leg; a run sinks into each landing and rises in the float. */
function gaitBob(phase, amp, duty) {
  const u = ((phase / TAU) % 1 + 1) % 1, r = clamp((0.5 - duty) / 0.33, 0, 1), h = (u % 0.5) / 0.5;   // half-cycle = one step
  const walk = -1.25 * amp / 15 * 0.5 * (1 + Math.cos(TAU * (h - 0.12)));
  const st = duty / 0.5;                                                                             // share of the step on the ground
  const run = h < st ? -2.2 * amp / 17 * Math.sin(Math.PI * h / st) : 1.4 * amp / 17 * Math.sin(Math.PI * (h - st) / (1 - st));
  return walk * (1 - r) + run * r;
}
const _gf = [0, 0, 0];

class Rig {
  constructor() {
    const J = this.j = {};
    for (const n of ['pelvis', 'waist', 'neck', 'head', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'toeL', 'toeR',
      'shL', 'shR', 'elL', 'elR', 'wrL', 'wrR', 'handL', 'handR', 'holster', 'flaskProp']) J[n] = V3();
    Object.defineProperty(J, '_cy', { value: 0, writable: true, enumerable: false });   // chest twist, for torsoPush
    Object.defineProperty(J, '_py', { value: 0, writable: true, enumerable: false });   // hip twist
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
    this._fore = { R: { s: 0, f: 0.3, z: -0.95 }, L: { s: 0, f: 0.3, z: -0.95 } };
    this._elPrev = { R: { s: 0, f: 0, z: 0, ok: false }, L: { s: 0, f: 0, z: 0, ok: false } };
    this._bPrev = { s: 1, f: 0, z: 0, ok: false }; this._bReq = { s: 1, f: 0, z: 0, ok: false };   // blade last frame (drawn / asked)
  }

  /** char frame -> world -> screen for one joint. */
  project(J) {
    const c = this._c, s = this._s;
    const X = J.s * s + J.f * c, Y = -J.s * c + J.f * s;        // right = (sin, -cos), forward = (cos, sin)
    J.x = X; J.y = Y * K + J.z; J.d = Y;
  }

  /** Leg IK in the char frame: hip -> knee -> ankle; the knee is a hinge that folds toward (ks, kf) (where the
   *  kneecap points: forward, turned with the hips and the foot). */
  leg(hip, knee, ankle, tS, tF, tZ, ks, kf) {
    const L1 = RIG.THIGH, L2 = RIG.SHIN;
    let ds = tS - hip.s, df = tF - hip.f, dz = tZ - hip.z, d = Math.hypot(ds, df, dz);
    const dd = clamp(d, 1, L1 + L2 - 0.05);
    const us = ds / d, uf = df / d, uz = dz / d;
    // knee direction made perpendicular to the leg line: that is where the knee goes
    if (ks === undefined) { ks = 0; kf = 1; }
    const kd = ks * us + kf * uf;
    let ps = ks - us * kd, pf = kf - uf * kd, pz = -uz * kd;
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
    // ---- legs + pelvis (3D). pelvisYaw turns the hips (+ = toward his left), chestYaw turns the ribcage and
    // shoulders on top of that, pitch leans the upper body forward from the waist.
    const py = o.pelvisYaw || 0, cyaw = o.chestYaw || 0, pitch = o.pitch || 0, pc = Math.cos(py), pyS = Math.sin(py);
    const bob = w.duty ? gaitBob(w.phase, w.amp, w.duty) : -1.6 * w.amp / 11 * Math.pow(Math.sin(w.phase), 2);
    let pz = RIG.HIP_Z - cr + bob;
    J.pelvis.s = o.sway || 0; J.pelvis.f = o.pelvisF || 0;
    J.hipL.s = J.pelvis.s - RIG.HIP_W * pc; J.hipL.f = J.pelvis.f - RIG.HIP_W * pyS;
    J.hipR.s = J.pelvis.s + RIG.HIP_W * pc; J.hipR.f = J.pelvis.f + RIG.HIP_W * pyS;
    const feet = o.feet, FL = o.feetLock, ft = this._ft;
    for (const side of [-1, 1]) {
      const ph = w.phase + (side < 0 ? 0 : Math.PI); gaitFoot(ph, w.amp, w.duty, _gf);
      const stride = _gf[0], lift = _gf[1];
      let tS = side * RIG.FOOT_W + w.ms * stride, tF = w.mf * stride, tZ = 3.5 + lift, toeOff = _gf[2], yawF = py * 0.5;
      if (feet) { tS += side * feet.spread; tF += feet.f * side + feet.fwd; tZ += feet.z; }
      if (FL && FL.w > 0) {                     // attack footwork: feet planted in the world or stepping (see poseRig)
        const L = side < 0 ? FL.L : FL.R, k = FL.w;
        tS += (L.s - tS) * k; tF += (L.f - tF) * k; tZ += (L.z - tZ) * k; toeOff += (L.toe - toeOff) * k; yawF += (L.yaw - yawF) * k;
      }
      const q = side < 0 ? ft.L : ft.R; q.s = tS; q.f = tF; q.z = tZ; q.toe = toeOff; q.yaw = yawF;
    }
    // the hips come down when a foot is planted further out than the straight leg reaches (long strides, lunges)
    for (const side of [-1, 1]) {
      const q = side < 0 ? ft.L : ft.R, hip = side < 0 ? J.hipL : J.hipR, dh = Math.hypot(q.s - hip.s, q.f - hip.f), LM = RIG.THIGH + RIG.SHIN - 0.6;
      pz = Math.min(pz, Math.max(q.z + Math.sqrt(Math.max(0, LM * LM - dh * dh)), RIG.HIP_Z - cr - 8));
    }
    J.pelvis.z = pz; J.hipL.z = J.hipR.z = pz;
    for (const side of [-1, 1]) {
      const q = side < 0 ? ft.L : ft.R;
      const hip = side < 0 ? J.hipL : J.hipR, knee = side < 0 ? J.kneeL : J.kneeR, ank = side < 0 ? J.ankleL : J.ankleR;
      const fy = q.yaw, ks = -Math.sin(fy), kf = Math.cos(fy);              // the knee tracks over the foot
      this.leg(hip, knee, ank, q.s, q.f, q.z, ks, kf);
      const toe = side < 0 ? J.toeL : J.toeR;
      toe.s = ank.s + side * 1.2 * kf + ks * RIG.FOOT; toe.f = ank.f + kf * RIG.FOOT - side * 1.2 * ks; toe.z = Math.max(0.5, ank.z - 2.5 + q.toe);
    }
    // ---- spine, all in the char frame; a little roll into the direction he is moving
    J.waist.s = 0; J.waist.f = 0.5 + (o.pelvisF || 0); J.waist.z = J.pelvis.z + (RIG.WAIST_Z - RIG.HIP_Z);
    J.neck.s = 0; J.neck.f = 1.0 + o.hunch; J.neck.z = J.pelvis.z + (RIG.NECK_Z - RIG.HIP_Z);
    J.head.s = 0; J.head.f = 1.5 + o.hunch; J.head.z = J.neck.z + 9;
    const br = o.breath || 0, sw = (o.sway || 0) * 0.55;                  // breathing lifts the chest; the torso rides the hip shift
    J.waist.s = sw; J.neck.s = sw * 0.6; J.head.s = sw * 0.5; J.neck.z += br * 0.7; J.head.z += br * 0.8;
    this.headYaw = o.headYaw || 0;
    for (const sh of [J.shL, J.shR]) { sh.f = 0.5 + o.hunch * 0.6; sh.z = J.pelvis.z + (RIG.SHOULDER_Z - RIG.HIP_Z) + br; sh.s = (sh === J.shL ? -RIG.SHOULDER_W : RIG.SHOULDER_W) + sw * 0.6; }
    J.holster.s = -8.4; J.holster.f = -0.8; J.holster.z = J.pelvis.z + 1.5;
    J.flaskProp.s = 7.9; J.flaskProp.f = 2.2; J.flaskProp.z = J.pelvis.z + 3;
    if (o.roll) {
      const rc = Math.cos(o.roll), rs = Math.sin(o.roll), wz = J.waist.z;
      for (const q of [J.neck, J.head, J.shL, J.shR]) { const ds = q.s, dz = q.z - wz; q.s = ds * rc + dz * rs; q.z = wz - ds * rs + dz * rc; }
    }
    // lean and twist the upper body around the waist (the chest frame)
    J._cy = cyaw; J._py = py; this._cyc = Math.cos(cyaw); this._cys = Math.sin(cyaw); this._pc = Math.cos(pitch); this._ps = Math.sin(pitch);
    if (pitch || cyaw) for (const q of [J.neck, J.head, J.shL, J.shR]) this.chestToChar(q, q, true);
    if (o.chestGrip) {                         // clip hand targets are given relative to the waist (char frame)
      const Wt = J.waist; o.grip.s += Wt.s; o.grip.f += Wt.f; o.grip.z += Wt.z;
      if (o.leftTarget) { o.leftTarget.s += Wt.s; o.leftTarget.f += Wt.f; o.leftTarget.z += Wt.z; }
    }
    // ---- arms: anatomical IK (see arm3). The fist sits on the grip with the handle across the palm.
    const G = o.grip, HG = RIG.HAND * 0.5, Bd = this.blade;
    { const l = Math.hypot(o.blade.s, o.blade.f, o.blade.z) || 1; Bd.s = o.blade.s / l; Bd.f = o.blade.f / l; Bd.z = o.blade.z / l; }
    const Q = this._bReq; const qAng = Q.ok ? Math.acos(clamp(Q.s * Bd.s + Q.f * Bd.f + Q.z * Bd.z, -1, 1)) : 0;   // how far the clip turned it
    Q.s = Bd.s; Q.f = Bd.f; Q.z = Bd.z; Q.ok = true;
    const fR = this._fore.R;
    this._w.s = G.s - fR.s * HG; this._w.f = G.f - fR.f * HG; this._w.z = G.z - fR.z * HG;
    this.arm3(J.shR, J.elR, J.wrR, J.handR, this._w, 1, Bd, 'R');
    // the weapon sits where the right fist actually got to
    this.grip.s = J.wrR.s + fR.s * HG; this.grip.f = J.wrR.f + fR.f * HG; this.grip.z = J.wrR.z + fR.z * HG;
    // the wrist only tilts the handle a little off square to the forearm: past that, the blade gives, not the wrist
    { const c = Bd.s * fR.s + Bd.f * fR.f + Bd.z * fR.z, lim = 0.37;
      if (Math.abs(c) > lim) {
        const k = c - Math.sign(c) * lim; Bd.s -= fR.s * k; Bd.f -= fR.f * k; Bd.z -= fR.z * k;
        const l = Math.hypot(Bd.s, Bd.f, Bd.z) || 1; Bd.s /= l; Bd.f /= l; Bd.z /= l;
      } }
    // no pops: the drawn blade may not turn much faster between two frames than the clip turned it (the wrist limit
    // above can flip when the arm swings through a pose where the handle lines up with the forearm)
    { const P = this._bPrev;
      if (P.ok && !o.snap) {
        const c = clamp(P.s * Bd.s + P.f * Bd.f + P.z * Bd.z, -1, 1), a = Math.acos(c), lim = qAng + 0.14;
        if (a > lim && a > 1e-4) {
          const k = lim / a, sa = Math.sin(a), w0 = Math.sin((1 - k) * a) / sa, w1 = Math.sin(k * a) / sa;   // slerp part way
          Bd.s = P.s * w0 + Bd.s * w1; Bd.f = P.f * w0 + Bd.f * w1; Bd.z = P.z * w0 + Bd.z * w1;
          const l = Math.hypot(Bd.s, Bd.f, Bd.z) || 1; Bd.s /= l; Bd.f /= l; Bd.z /= l;
        }
      } }
    // the blade stops at the floor: a strike that reaches it lands on it instead of going through
    if (o.bladeLen) { const L = o.bladeLen, tz = this.grip.z + Bd.z * L;
      if (tz < 0.8) { const z1 = (0.8 - this.grip.z) / L, h = Math.hypot(Bd.s, Bd.f) || 1, hh = Math.sqrt(Math.max(0, 1 - z1 * z1));
        Bd.s = Bd.s / h * hh; Bd.f = Bd.f / h * hh; Bd.z = z1; } }
    { const P = this._bPrev; P.s = Bd.s; P.f = Bd.f; P.z = Bd.z; P.ok = true; }
    if (o.twoHand) {
      const gap = o.twoHand.gap, fL = this._fore.L;
      this._w.s = this.grip.s - Bd.s * gap - fL.s * HG; this._w.f = this.grip.f - Bd.f * gap - fL.f * HG; this._w.z = this.grip.z - Bd.z * gap - fL.z * HG;
      this.arm3(J.shL, J.elL, J.wrL, J.handL, this._w, -1, Bd, 'L');
    } else this.arm3(J.shL, J.elL, J.wrL, J.handL, o.leftTarget || o.leftRest, -1, null, 'L');
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

  /** Inverse of chestToChar, with this frame's (or the last frame's) chest rotation. */
  charToChest(q, out, pos) {
    const W = this.j.waist;
    let s = q.s, f = q.f, z = q.z;
    if (pos) { s -= W.s; f -= W.f; z -= W.z; }
    const s1 = s * this._cyc + f * this._cys, f1 = -s * this._cys + f * this._cyc, pc = pos ? this._pc : 1, ps = pos ? this._ps : 0;
    out.s = s1; out.f = f1 * pc - z * ps; out.z = f1 * ps + z * pc;
  }
  /** A point or a direction in the chest frame -> the char frame. pos: true = a char-frame point turned with the
   *  chest around the waist, 2 = a point given relative to the waist, false = a direction. In place is fine. */
  chestToChar(q, out, pos) {
    const W = this.j.waist;
    let s = q.s, f = q.f, z = q.z;
    if (pos === true) { s -= W.s; f -= W.f; z -= W.z; }
    const pc = pos ? this._pc : 1, ps = pos ? this._ps : 0;                              // blades aim in the world: no lean
    const f1 = f * pc + z * ps, z1 = -f * ps + z * pc;                                   // lean forward
    const s2 = s * this._cyc - f1 * this._cys, f2 = s * this._cys + f1 * this._cyc;     // turn
    out.s = s2 + (pos ? W.s : 0); out.f = f2 + (pos ? W.f : 0); out.z = z1 + (pos ? W.z : 0);
  }

  /**
   * Anatomical two-bone arm IK in the char frame.
   * - elbow is a hinge: straight at full reach, folds one way only, at most ~145 degrees
   * - the elbow's position around the shoulder-wrist line is chosen by scoring candidates: elbows hang
   *   down and back (out a little, more when the hands are raised), the shoulder may not swing far behind
   *   the back or across the chest, the forearm should be square to a gripped handle (no bent wrists),
   *   the arm stays outside the torso, and the elbow does not jump between frames
   * - the fist continues along the forearm (wrists don't bend sideways)
   */
  arm3(sh, el, wr, hand, t0, side, blade, key) {
    const L1 = RIG.UPPER, L2 = RIG.FORE, J = this.j;
    const t = this._t3; t.s = t0.s; t.f = t0.f; t.z = t0.z;
    { const pu = torsoPush(J, t.s, t.f, t.z, 3.6); t.s -= pu * Math.sin(J._cy || 0); t.f += pu * Math.cos(J._cy || 0); }   // the hand can't be inside him
    let ds = t.s - sh.s, df = t.f - sh.f, dz = t.z - sh.z, d = Math.hypot(ds, df, dz) || 1e-4;
    const us = ds / d, uf = df / d, uz = dz / d;
    const dmin = Math.sqrt(L1 * L1 + L2 * L2 - 2 * L1 * L2 * Math.cos(35 * RAD));   // fullest fold
    const dd = clamp(d, dmin, L1 + L2 - 0.05);
    const a = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const Cs = sh.s + us * a, Cf = sh.f + uf * a, Cz = sh.z + uz * a;
    const Ws = sh.s + us * dd, Wf = sh.f + uf * dd, Wz = sh.z + uz * dd;
    // preferred elbow direction: down and back, a little out; out and forward when the hands go up high
    const raise = clamp((t.z - sh.z) / 12, 0, 1);
    let ps = side * (0.22 + 0.35 * raise), pf = -0.4 + 0.65 * raise, pz = -1 + 0.5 * raise;
    { const l = Math.hypot(ps, pf, pz); ps /= l; pf /= l; pz /= l; }
    // circle basis around the shoulder-wrist line
    let e1s = ps, e1f = pf, e1z = pz; { const k = e1s * us + e1f * uf + e1z * uz; e1s -= k * us; e1f -= k * uf; e1z -= k * uz; }
    let el1 = Math.hypot(e1s, e1f, e1z);
    if (el1 < 1e-3) { e1s = side; e1f = 0; e1z = 0; const k = e1s * us; e1s -= k * us; e1f -= k * uf; e1z -= k * uz; el1 = Math.hypot(e1s, e1f, e1z) || 1; }
    e1s /= el1; e1f /= el1; e1z /= el1;
    const e2s = uf * e1z - uz * e1f, e2f = uz * e1s - us * e1z, e2z = us * e1f - uf * e1s;
    const prev = this._elPrev[key];
    let best = 1e9, bs = 0, bf = 0, bz = 0;
    const N = 36;
    for (let i = 0; i < N; i++) {
      const th = i / N * TAU, c = Math.cos(th), sn = Math.sin(th);
      const ods = e1s * c + e2s * sn, odf = e1f * c + e2f * sn, odz = e1z * c + e2z * sn;   // elbow direction off the line
      const Es = Cs + h * ods, Ef = Cf + h * odf, Ez = Cz + h * odz;
      let cost = 1 - (ods * ps + odf * pf + odz * pz);
      const Us = (Es - sh.s) / L1, Uf = (Ef - sh.f) / L1;
      cost += 4 * Math.max(0, -0.45 - Uf) + 4 * Math.max(0, -0.35 - Us * side);        // shoulder range
      if (Ez > sh.z + 2) cost += 0.08 * (Ez - sh.z - 2) * (1 - raise);                    // elbows don't wing up
      if (blade) {                                                                         // forearm square to the handle
        const Fs = (Ws - Es) / L2, Ff = (Wf - Ef) / L2, Fz = (Wz - Ez) / L2, k = Fs * blade.s + Ff * blade.f + Fz * blade.z;
        cost += 2.2 * k * k;
      }
      for (const u of [0.5, 0.85]) cost += 0.25 * Math.abs(torsoPush(J, sh.s + (Es - sh.s) * u, sh.f + (Ef - sh.f) * u, sh.z + (Ez - sh.z) * u, 2.8));
      for (const u of [0.25, 0.6]) cost += 0.25 * Math.abs(torsoPush(J, Es + (Ws - Es) * u, Ef + (Wf - Ef) * u, Ez + (Wz - Ez) * u, 2.8));
      if (prev.ok) cost += 0.06 * Math.hypot(Es - prev.s, Ef - prev.f, Ez - prev.z);    // no popping
      if (cost < best) { best = cost; bs = Es; bf = Ef; bz = Ez; }
    }
    el.s = bs; el.f = bf; el.z = bz; prev.s = bs; prev.f = bf; prev.z = bz; prev.ok = true;
    wr.s = Ws; wr.f = Wf; wr.z = Wz;
    // fist along the forearm
    const F = this._fore[key];
    let Fs = wr.s - el.s, Ff = wr.f - el.f, Fz = wr.z - el.z; const fl = Math.hypot(Fs, Ff, Fz) || 1;
    F.s = Fs / fl; F.f = Ff / fl; F.z = Fz / fl;
    hand.s = wr.s + F.s * RIG.HAND; hand.f = wr.f + F.f * RIG.HAND; hand.z = wr.z + F.z * RIG.HAND;
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
Rig.prototype._ft = { L: { s: 0, f: 0, z: 0, toe: 0, yaw: 0 }, R: { s: 0, f: 0, z: 0, toe: 0, yaw: 0 } };
Rig.prototype._cyc = 1; Rig.prototype._cys = 0; Rig.prototype._pc = 1; Rig.prototype._ps = 0;
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
  // long strides: a walk (a foot always down), a run and a sprint with a flight phase. The cadence comes from the
  // stride, so each step carries him as far as it looks like it should (~2.5 steps/s walking and running, ~3 sprinting).
  const ratio = spd / PLAYER_SPEED, rk = clamp((spd - 100) / 140, 0, 1), run = rk * rk * (3 - 2 * rk), sprint = clamp((ratio - 1.1) / 0.5, 0, 1);
  const ampFull = 15.5 + 2 * run + 2.5 * sprint, duty = 0.5 - 0.335 * run - 0.015 * sprint;
  const ampT = loco ? ampFull * clamp(spd / 40, 0, 1) : (st === S_DODGE ? 0 : clamp(ratio, 0, 1) * 7);
  p.walkAmp = dt > 0 ? smooth(p.walkAmp, ampT, 10, dt) : ampT;
  p.walkDuty = dt > 0 ? smooth(p.walkDuty || duty, duty, 6, dt) : duty;
  if (spd > 12) {
    _walk.ms = (p.vx * sy - p.vy * cy) / spd; _walk.mf = (p.vx * cy + p.vy * sy) / spd;
    const stepLen = Math.max(10, p.walkAmp) / p.walkDuty;                 // distance per step = foot sweep / share planted
    p.walkPhase += dt * Math.PI * spd / stepLen;
  } else if (dt > 0) {                                     // settle to a planted stance
    const k = Math.round(p.walkPhase / Math.PI) * Math.PI; p.walkPhase = smooth(p.walkPhase, k, 8, dt);
  }
  _walk.amp = p.walkAmp; _walk.phase = p.walkPhase; _walk.ms = _walk.ms || 0; _walk.duty = loco ? p.walkDuty : 0;
  // ---- defaults: relaxed stance
  _feet.spread = 0.5; _feet.f = -1.5; _feet.fwd = 0; _feet.z = 0;
  let crouch = 0.6, hunch = 0, lean = p.bodyRot, tilt = 0, spin = 0;
  // ---- life: breathing, a slow weight shift when standing, settling after a dash
  const idle = loco ? clamp(1 - spd / 60, 0, 1) : 0;
  o.breath = Math.sin(t * 2.0) * 0.55 * (0.4 + 0.6 * idle) + (p.sprinting ? Math.sin(t * 5.5) * 0.4 : 0);
  p.swayAmt = dt > 0 ? smooth(p.swayAmt || 0, idle, 2, dt) : idle;
  o.sway = Math.sin(t * 0.55) * 1.2 * p.swayAmt;
  // walking hips: they turn forward with the swinging leg and shift over the planted foot; the chest counter-turns
  o.pelvisYaw = 0; o.chestYaw = 0; o.pitch = 0; o.pelvisF = 0; o.feetLock = null; o.chestGrip = false;
  if (loco && _walk.duty && p.walkAmp > 1) {
    const gr = clamp((0.5 - _walk.duty) / 0.33, 0, 1), sL = gaitFoot(p.walkPhase, p.walkAmp, _walk.duty, _gf)[0] / Math.max(1, p.walkAmp);
    const k = Math.min(1, p.walkAmp / 12);
    o.pelvisYaw = -(0.12 + 0.06 * gr) * sL * k; o.chestYaw = -(0.45 + 0.25 * gr) * o.pelvisYaw;
    o.sway += -1.1 * (1 - gr) * k * Math.cos(p.walkPhase - Math.PI * _walk.duty);
    o.pitch = (0.03 + 0.09 * gr + 0.05 * clamp((ratio - 1.1) / 0.5, 0, 1)) * k;          // a run leans into it
  }
  if (p._lastSt === S_DODGE && st !== S_DODGE) p.landT = 0;
  p._lastSt = st; p.landT = (p.landT === undefined ? 9 : p.landT) + dt;
  if (p.landT < 0.3 && st !== S_DODGE) { const k = Math.sin(Math.PI * p.landT / 0.3); crouch += 4.5 * k; hunch += 2 * k; }
  const swingL = -gaitFoot(p.walkPhase, p.walkAmp, _walk.duty, _gf)[0] * 0.5;      // arms swing against the legs
  _lr.s = -9; _lr.f = swingL + 1; _lr.z = 34;
  o.leftTarget = null; o.twoHand = null;
  const attacking = mv && (st === S_WINDUP || st === S_ACTIVE || st === S_RECOVERY);
  const tool = p.kind === 'shoot' || p.kind === 'item' || p.kind === 'flask';
  const heft = attacking ? mv.heft : 0;
  if (p.sprinting) { hunch = 3; crouch += 3; }
  else if (loco && run > 0.5) crouch += 1.5 * run;                         // a running stance sits a little lower
  // ---- pistol: gp 0 = holstered, 0.5 = hand on the holster, 1 = drawn and aimed down the arm
  let gp = p.gunReady, gunDir = p.facing;
  if (p.kind === 'shoot' && attacking) {
    gunDir = p.attack_dir;
    if (st === S_WINDUP) { const q = clamp(p.state_t / mv.windup, 0, 1); gp = mv.windup < 0.06 ? 1 : (q < 0.45 ? 0.5 * q / 0.45 : 0.5 + 0.5 * Math.sin(Math.PI / 2 * (q - 0.45) / 0.55)); }
    else if (st === S_ACTIVE) gp = 1;
    else { const q = clamp(p.state_t / Math.max(0.01, mv.recovery), 0, 1); gp = p.aimHold ? 1 : q < 0.35 ? 1 : q < 0.85 ? 1 - 0.5 * (q - 0.35) / 0.5 : 0.5 * (1 - (q - 0.85) / 0.15); }
  }
  // the pistol stays in the left hand (low ready) unless that hand is busy: a 2h grip, the flask, a throw
  const leftBusy = tool && attacking && p.kind !== 'shoot';
  const inHand = p.leftItem === 'pistol' && !leftBusy;
  if (inHand) gp = Math.max(0.5, gp);
  p.gunDrawn = inHand && gp >= 0.5;
  const bothHands = W.stance && W.stance.hands === 2;
  // one-handed weapons: the free arm swings out and back for balance, opposite the blade
  function offhand(k) {
    // out to the side and a little forward, so the pistol in that hand stays in sight; it rides opposite the blade
    const O = W.stance.offhand || { s: -14.5, f: 4, z: 41 }, kind = attacking && mv ? mv.motion[0] : null, sw = kind === 'swing' ? Math.sign(mv.motion[1]) : 0;
    const ts = O.s - 2 * sw, tf = O.f + 2.5 * sw + (kind === 'overhead' ? 5 : 0), tz = O.z + 2 * heft - (kind === 'overhead' ? 3 : 0);
    _lr.s += (ts - _lr.s) * k; _lr.f += (tf - _lr.f) * k; _lr.z += (tz - _lr.z) * k;
  }
  if (bothHands && gp < 0.05 && !(tool && attacking)) { o.twoHand = _two; _two.gap = W.handGap || 8; }  // 2h: both hands unless the left is busy
  // keyed full-body clips (anim.js): the attack itself, or holding a charged heavy (the clip's first pose)
  let clip = null, clipX = 0, clipKey = null, clipW = 1;
  if (attacking && !tool && mv.anim) { clip = ANIMS[mv.anim]; clipX = moveClock(st, p.state_t, mv); clipKey = 'm' + p.moveSerial; }
  else if (p.charging > 0 && loco && W.charged && W.charged.anim) {
    clip = ANIMS[W.charged.anim]; clipX = 0; clipKey = 'c' + (p.moveSerial || 0);
    clipW = clamp((p.charging - CHARGE_START) / (CHARGE_FULL - CHARGE_START), 0, 1) * 0.85 + 0.15;
  }
  if (clip && bothHands) { o.twoHand = _two; _two.gap = W.handGap || 8; }
  if (clip) { /* the clip block below poses the whole body */ }
  else if (attacking && !tool && p.kind !== 'visceral') {
    const ph = st === S_WINDUP ? clamp(p.state_t / mv.windup, 0, 1) : st === S_ACTIVE ? 1 : 1 - clamp(p.state_t / Math.max(0.01, mv.recovery), 0, 1);
    crouch += (2 + 5 * heft) * ph; hunch = 1.5 + 2.5 * heft * ph;
    _feet.f = -(3 + 3 * heft) * ph - 1.5; _feet.spread = 1.5 + 2 * ph;          // left foot forward, wider base
    if (bothHands) { o.twoHand = _two; _two.gap = W.handGap || 8; } else offhand(ph);
  } else if (p.kind === 'visceral' && attacking) {
    crouch += 4; hunch = 3; if (bothHands) { o.twoHand = _two; _two.gap = W.handGap || 8; } else offhand(1);
  } else if (p.charging > 0 && loco) {
    const c = clamp((p.charging - CHARGE_START) / (CHARGE_FULL - CHARGE_START), 0, 1);
    crouch += 2 + 5 * c; hunch = 2 + 2 * c; _feet.f = -3 - 2 * c; _feet.spread = 2 + c;
    if (bothHands) { o.twoHand = _two; _two.gap = W.handGap || 8; } else offhand(0.6 + 0.4 * c);
  }
  if (gp > 0.001) {
    // draw from the left hip, then up into the aim; recoil kicks the hand back and up and tips the muzzle
    const rel = gunDir - yaw, ds = -Math.sin(rel), df = Math.cos(rel), k = p.gunKick;
    const shZ = RIG.SHOULDER_Z - 0.6 * crouch;
    // where the hand starts from: low ready in front of the hip (pistol in hand), else the holster grip
    const Hs = inHand ? -11.6 : -8.8, Hf = inHand ? 10.5 + swingL * 0.35 : 1.6, Hz = RIG.HIP_Z - crouch + (inHand ? 6.5 : 4.5);
    const meleeBusy = attacking && !tool;
    const As = -RIG.SHOULDER_W + ds * 24 - ds * 2 * k, Af = 0.8 + df * 24 - df * 2 * k, Az = shZ - 1.5 + 1.2 * k;
    if (gp <= 0.5) { const u = gp / 0.5 * (meleeBusy || st === S_DODGE ? 0 : 1); _lr.s += (Hs - _lr.s) * u; _lr.f += (Hf - _lr.f) * u; _lr.z += (Hz - _lr.z) * u; }
    else { const u = (gp - 0.5) / 0.5, arc = Math.sin(Math.PI * u) * 4; _lr.s = Hs + (As - Hs) * u; _lr.f = Hf + (Af - Hf) * u; _lr.z = Hz + (Az - Hz) * u + arc; }
    _feet.f = Math.min(_feet.f, -2 * Math.max(0, gp - 0.5) * 2);
    const aimK = clamp((gp - 0.5) / 0.5, 0, 1);
    p.gunPitch = (inHand ? 0.3 * (1 - aimK) : 0) + 0.36 * k;                    // low ready: wrist extended so the muzzle points ahead-down; recoil flip
  } else p.gunPitch = 0;
  if (tool && attacking && p.kind !== 'shoot') {
    const ph = st === S_WINDUP ? clamp(p.state_t / mv.windup, 0, 1) : st === S_ACTIVE ? 1 : 1 - clamp(p.state_t / Math.max(0.01, mv.recovery), 0, 1);
    const rel = p.attack_dir - yaw, ds = -Math.sin(rel), df = Math.cos(rel);
    if (p.kind === 'flask') { _lr.s = -2 + 1 * (1 - ph); _lr.f = 4 + 3 * ph; _lr.z = 40 + 26 * ph; hunch = -1 * ph; }
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
  // ---- the head leads: into a turn while moving, otherwise toward the boss when he's in view (neck limit ~60 deg)
  let look = 0;
  if (loco && p.move_dir !== null && p.move_dir !== undefined && spd > 20) look = wrap(p.move_dir - p.facing);
  else if (loco && p.lookOn) { const rel = wrap(Math.atan2(p.lookY - p.gy, p.lookX - p.gx) - p.facing); if (Math.abs(rel) < 1.9) look = rel; }
  look = clamp(look, -1.05, 1.05);
  p.headYaw = dt > 0 ? smooth(p.headYaw || 0, look, 7, dt) : look;
  o.headYaw = st === S_DEAD ? 0 : p.headYaw;
  const CP = clipBody(p, R, o, clip, clipX, clipKey, clipW, mv, dt, yaw, bothHands);
  if (CP) { crouch += CP.cr; hunch = 0; }
  o.crouch = crouch; o.hunch = hunch; o.roll = roll - o.sway * 0.012; o.tilt = st === S_DEAD ? Math.abs(tilt) : 0; o.spin = 0; o.lean = 0;
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
  if (CP) clipArms(p, R, o, CP, bothHands);
  else if (p._outT > 0) clipOut(p, o, dt);
  o.grip = _grip; o.blade = _blade;
  o.capeLow = p.cloths.cape && p.cloths.cape.live ? p.cloths.cape.lowDepth() : undefined;
  o.tabardDepth = p.cloths.tabard && p.cloths.tabard.live ? p.cloths.tabard.lowDepth() : undefined;
  o.bladeLen = (W === WEAPONS.spear ? 150 : W === WEAPONS.greatsword ? 100 : 56) * (p.sword_scale || 1);
  R.pose(o);
  for (const name in p.cloths) p.cloths[name].step(p, dt);
  // the blade tip in the world (floor strikes) and the blade's trail through the strike
  { const G = R.grip, Bd = R.blade, L = o.bladeLen, ts = G.s + Bd.s * L, tf = G.f + Bd.f * L, tz = G.z + Bd.z * L;
    p.tipX = p.gx + ts * sy + tf * cy; p.tipY = p.gy - ts * cy + tf * sy; p.tipZ = tz;
    if (CP && clipKey[0] === 'm' && clipX >= 0.92 && clipX <= 2.3 && dt > 0) {
      const inner = W === WEAPONS.spear ? 0.74 : W === WEAPONS.greatsword ? 0.42 : 0.35;   // only the blade sweeps a trail, not a spear's shaft
      const ms = G.s + Bd.s * L * inner, mf = G.f + Bd.f * L * inner, mz = G.z + Bd.z * L * inner;
      p.trail.push({ t: p.g.t, x0: p.gx + ms * sy + mf * cy, y0: p.gy - ms * cy + mf * sy, z0: mz, x1: p.tipX, y1: p.tipY, z1: tz, heavy: mv.heft });
      if (p.trail.length > 16) p.trail.shift();
    } }
  // pistol muzzle (world) for the flash and the tracer: from the left fist along the forearm, tipped by recoil
  { const J = R.j; let fs = J.wrL.s - J.elL.s, ff = J.wrL.f - J.elL.f, fz = J.wrL.z - J.elL.z; const l = Math.hypot(fs, ff, fz) || 1;
    fs /= l; ff /= l; fz = fz / l + Math.tan(p.gunPitch); const ms = J.handL.s + fs * 19.6, mf = J.handL.f + ff * 19.6, mz = J.handL.z + fz * 19.6 + 1.8;
    p.muzzleX = p.gx + ms * sy + mf * cy; p.muzzleY = p.gy - ms * cy + mf * sy; p.muzzleZ = mz; }
  // visor: front of the head, fades as he turns away
  const H = R.j.head, hy = yaw + (o.headYaw || 0), hc = Math.cos(hy), hs = Math.sin(hy), fwd = -hs;
  p.visorX = H.x + hc * 5.6; p.visorY = H.y + hs * 5.6 * K - 0.5;
  p.visorSX = Math.max(0.25, Math.abs(fwd)); p.visorAlpha = st === S_DEAD ? 0 : clamp((fwd + 0.25) * 1.8, 0, 1);
}

// ---------------------------------------------------------------- clip posing
const _A = { g: [0, 0, 0], b: [0, 0, 0], l: [0, 0, 0] }, _CP = { cr: 0, g: [0, 0, 0], b: [0, 0, 0], l: [0, 0, 0], hasL: false };
const _lt3 = { s: 0, f: 0, z: 0 }, _feetLock = { w: 1, L: { s: 0, f: 0, z: 3.5, toe: 0, yaw: 0 }, R: { s: 0, f: 0, z: 3.5, toe: 0, yaw: 0 } };
const _lerp = (a, b, k) => a + (b - a) * k;
/**
 * Pose the body from a clip: chest turn, hips, lean, crouch, the feet (planted in the world or stepping), and the
 * hands' targets in the chest frame. The first moments blend from wherever the body was (a combo flows straight
 * out of the last swing's follow-through). Returns the crouch to add (and the hand targets), or null.
 */
function clipBody(p, R, o, clip, x, key, wgt, mv, dt, yaw, bothHands) {
  if (!clip) { if (p._clipKey) { p._clipKey = null; p._outT = 0.22; } return null; }
  const J = R.j, cy = Math.cos(yaw), sy = Math.sin(yaw);
  if (p._clipKey !== key) {                     // a new clip: remember where the body is, in the chest frame
    const F = p._from || (p._from = { g: [0, 0, 0], b: [0, 0, 0], tw: 0, hp: 0, ln: 0, cr: 0 }), c = p._cur || { tw: 0, hp: 0, ln: 0, cr: 0 };
    F.g[0] = R.grip.s - J.waist.s; F.g[1] = R.grip.f - J.waist.f; F.g[2] = R.grip.z - J.waist.z;
    F.b[0] = R.blade.s; F.b[1] = R.blade.f; F.b[2] = R.blade.z;
    F.tw = c.tw; F.hp = c.hp; F.ln = c.ln; F.cr = c.cr;
    // the feet, where they stand now (world)
    const fw = p._fw || (p._fw = { L: { x: 0, y: 0, seg: -9, fx: 0, fy: 0 }, R: { x: 0, y: 0, seg: -9, fx: 0, fy: 0 } });
    for (const side of ['L', 'R']) {
      const A = side === 'L' ? J.ankleL : J.ankleR, q = fw[side], ryc = Math.cos(R.yaw), rys = Math.sin(R.yaw);
      q.x = p.gx + A.s * rys + A.f * ryc; q.y = p.gy - A.s * ryc + A.f * rys; q.seg = -9;
    }
    p._clipKey = key; p._clipT = 0;
  }
  p._clipT += dt;
  sampleClip(clip, x, _A);
  const F = p._from, bl = (key[0] === 'm' ? Math.min(0.14, mv.windup * 0.6) : 0.16), w = EASE.io(clamp(p._clipT / bl, 0, 1)) * wgt;
  const cur = p._cur || (p._cur = { tw: 0, hp: 0, ln: 0, cr: 0 });
  cur.tw = _lerp(F.tw, _A.tw || 0, w); cur.hp = _lerp(F.hp, _A.hp || 0, w); cur.ln = _lerp(F.ln, _A.ln || 0, w); cur.cr = _lerp(F.cr, _A.cr || 0, w);
  const C = _CP;
  for (let d = 0; d < 3; d++) { C.g[d] = _lerp(F.g[d], _A.g[d], w); C.b[d] = _lerp(F.b[d], _A.b[d], w); }
  C.hasL = !bothHands && !!_A.l && !(p.gunReady > 0.5); if (C.hasL) for (let d = 0; d < 3; d++) C.l[d] = _A.l[d];
  C.lw = w; C.cr = cur.cr; C.hg = _A.hg;
  o.chestYaw = cur.tw * RAD; o.pelvisYaw = cur.hp * RAD; o.pitch = cur.ln * RAD;
  o.headYaw = o.chestYaw * 0.25;                     // the head turns a little with the chest; the eyes stay on the target
  // ---- footwork (attacks only: a charge keeps walking)
  if (key[0] === 'm') {
    o.feetLock = _feetLock; _feetLock.w = 1;
    const rm = clipRoot(clip, x);
    for (const side of ['L', 'R']) clipFoot(p, clip, side, x, rm, cy, sy, _feetLock[side]);
  }
  return C;
}
/** One foot during a clip: planted where it is in the world, or stepping to where the clip puts it. */
function clipFoot(p, clip, side, x, rmNow, cy, sy, out) {
  const ks = clip._feet[side], q = p._fw[side];
  let i = -1; for (let j = 0; j < ks.length; j++) if (ks[j].x <= x) i = j;
  // world position of a key's target: relative to where the root will be at that key
  const tgt = (kk) => { const ahead = clipRoot(clip, kk.x) - rmNow, rx = p.gx + Math.cos(p.attack_dir) * ahead, ry = p.gy + Math.sin(p.attack_dir) * ahead;
    return [rx + kk.s * sy + kk.f * cy, ry - kk.s * cy + kk.f * sy]; };
  let lift = 0, toe = 0;
  // settle into the clip's first stance in the opening moments if the foot was caught mid-stride
  const seg = i;
  if (seg !== q.seg) {
    if (q.stepping && q.seg !== -9 && p.g && p.g.onAttackStep) p.g.onAttackStep(p, q.x, q.y);   // the foot comes down
    q.fx = q.x; q.fy = q.y; q.seg = seg; q.stepping = false;
  }
  if (i >= 0 && i < ks.length - 1) {
    const a = ks[i], b = ks[i + 1];
    if (Math.hypot(b.s - a.s, b.f - a.f) > 0.8) {                       // a step
      q.stepping = true;
      const [tx, ty] = tgt(b), u = b.e(clamp((x - a.x) / (b.x - a.x), 0, 1)), dist = Math.hypot(tx - q.fx, ty - q.fy);
      q.x = q.fx + (tx - q.fx) * u; q.y = q.fy + (ty - q.fy) * u;
      lift = Math.sin(Math.PI * u) * Math.min(7, 1.2 + 0.22 * dist);
      toe = u > 0.65 ? 2.2 * (u - 0.65) / 0.35 * (1 - u) * 3 : -lift * 0.4;
    } else if (i === 0 && x < Math.min(0.5, b.x)) {                     // settle into the first stance
      const [tx, ty] = tgt(a), d0 = Math.hypot(tx - q.fx, ty - q.fy);
      if (d0 > 3) { const u = EASE.io(x / Math.min(0.5, b.x)); q.x = q.fx + (tx - q.fx) * u; q.y = q.fy + (ty - q.fy) * u; lift = Math.sin(Math.PI * u) * Math.min(5, 1 + 0.2 * d0); }
    }
  }
  // a planted foot can't be left further behind than the leg reaches: it gets dragged
  const dx = q.x - p.gx, dy = q.y - p.gy, d = Math.hypot(dx, dy), lim = 24;
  if (d > lim) { q.x = p.gx + dx / d * lim; q.y = p.gy + dy / d * lim; q.fx = q.x; q.fy = q.y; }
  const X = q.x - p.gx, Y = q.y - p.gy;
  out.s = X * sy - Y * cy; out.f = X * cy + Y * sy; out.z = 3.5 + lift; out.toe = toe;
  out.yaw = side === 'R' ? -0.45 : 0.12;               // rear foot turned out, front foot pointing at the target
}
/** Hands for a clip pose: the grip and the blade (and a free left hand) in the chest frame. */
function clipArms(p, R, o, C, bothHands) {
  _grip.s = C.g[0]; _grip.f = C.g[1]; _grip.z = C.g[2];
  _blade.s = C.b[0]; _blade.f = C.b[1]; _blade.z = C.b[2];
  o.chestGrip = true;
  if (bothHands && C.hg !== null && C.hg !== undefined) _two.gap = -C.hg;    // spear: the left hand ahead on the shaft
  if (C.hasL) { _lt3.s = C.l[0]; _lt3.f = C.l[1]; _lt3.z = C.l[2]; o.leftTarget = _lt3; }
  // remember the finished pose for the blend back out of the clip
  const Lp = p._last || (p._last = { g: [0, 0, 0], b: [0, 0, 0], tw: 0, hp: 0, ln: 0, cr: 0 });
  Lp.tw = p._cur.tw; Lp.hp = p._cur.hp; Lp.ln = p._cur.ln; Lp.cr = p._cur.cr;
}
/** Just out of a clip: ease the body from its last clip pose back to the normal carry. */
function clipOut(p, o, dt) {
  p._outT = Math.max(0, p._outT - dt);
  const w = EASE.io(p._outT / 0.22), Lp = p._last, R = p.rig;
  if (!Lp) return;
  if (!p._outInit) { p._outInit = true; }
  // grip and blade: from where the rig drew them last (char frame) toward the carry
  _grip.s = _lerp(_grip.s, R.grip.s, w); _grip.f = _lerp(_grip.f, R.grip.f, w); _grip.z = _lerp(_grip.z, R.grip.z, w);
  _blade.s = _lerp(_blade.s, R.blade.s, w); _blade.f = _lerp(_blade.f, R.blade.f, w); _blade.z = _lerp(_blade.z, R.blade.z, w);
  o.chestYaw += Lp.tw * RAD * w; o.pelvisYaw += Lp.hp * RAD * w; o.pitch += Lp.ln * RAD * w; o.crouch += Lp.cr * w;
  if (p._fw && o.feetLock === null) {
    o.feetLock = _feetLock; _feetLock.w = w;
    const cy = Math.cos(p.facing), sy = Math.sin(p.facing);
    for (const side of ['L', 'R']) { const q = p._fw[side], X = q.x - p.gx, Y = q.y - p.gy, out = _feetLock[side];
      out.s = X * sy - Y * cy; out.f = X * cy + Y * sy; out.z = 3.5; out.toe = 0; out.yaw = side === 'R' ? -0.45 : 0.12; }
  }
  if (p._outT <= 0) { p._last.tw = p._last.hp = p._last.ln = p._last.cr = 0; if (p._cur) p._cur.tw = p._cur.hp = p._cur.ln = p._cur.cr = 0; }
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
            if (Math.abs(S) < 14 && z > 8) {                                       // stay behind the torso and the hips
              const fb = torsoBackF(R.j, S, F, z, 2.8);
              if (fb < F) F = fb;
            }
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
