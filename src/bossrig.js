// ============================================================ BOSS RIG (the Obsidian Sentinel's 3D skeleton)
// Same conventions as the player rig: char frame s = his right, f = forward, z = up, turned by yaw = facing.
// Every state has its own full-body pose (no tells: the body is the only warning). The halberd is held
// left hand high on the shaft, right hand low; the hands slide along the shaft for reach.
// Anatomy: knees fold forward only, elbows are hinges (straight at full reach, ~145 deg max fold),
// shoulders have limited range, fists continue along the forearm.

const BRIG = {
  HIP_Z: 58, WAIST_Z: 76, SHOULDER_Z: 122, NECK_Z: 131, HEAD: 14,
  HIP_W: 14, SHOULDER_W: 38, FOOT_W: 14,
  THIGH: 27, SHIN: 27, FOOT: 15, UPPER: 30, FORE: 28, HAND: 8,
  HAL: 240, GAP: 46,
};
const BOSS_LAYER = { w: 680, h: 600, ox: 340, oy: 400 };   // offscreen box around the boss (points); origin = feet

function bv(s, f, z) { return [s || 0, f || 0, z || 0]; }
const BOSS_POSE_KEYS = ['crouch', 'lean', 'twist', 'roll', 'headPitch', 'headYaw', 'gu', 'freeR', 'freeL', 'spread', 'lift', 'tilt', 'gap'];
const BOSS_VEC_KEYS = ['fl', 'fr', 'H', 'D', 'E', 'R', 'Lr'];
function bossPose() {
  const o = {}; for (const k of BOSS_POSE_KEYS) o[k] = 0; for (const k of BOSS_VEC_KEYS) o[k] = bv();
  o.D[2] = 1; o.E[1] = 1; return o;
}

class BossRig {
  constructor() {
    const J = this.j = {};
    for (const n of ['pelvis', 'waist', 'neck', 'head', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'toeL', 'toeR',
      'shL', 'shR', 'elL', 'elR', 'wrL', 'wrR', 'handL', 'handR']) J[n] = V3();
    this.cur = bossPose(); this.tgt = bossPose(); this.fresh = true;
    this.yaw = 0; this.walkPhase = 0; this.walkAmp = 0;
    this.R = [1, 0, 0, 0, 1, 0, 0, 0, 1];               // torso basis columns: side, forward, up
    this.headF = bv(0, 1, 0); this.headU = bv(0, 0, 1);
    this.hal = { o: bv(), x: bv(1, 0, 0), y: bv(0, 1, 0) };   // halberd frame: butt, shaft dir, edge dir
    this.plates = []; for (let i = 0; i < 4; i++) this.plates.push({ o: bv(), x: bv(1, 0, 0), y: bv(0, 0, 1), side: i < 2 ? 1 : -1, k: i % 2 });
    this._fore = { R: bv(0, 0.3, -0.95), L: bv(0, 0.3, -0.95) };
    this._elPrev = { R: { s: 0, f: 0, z: 0, ok: false }, L: { s: 0, f: 0, z: 0, ok: false } };
    this.core = { x: 0, y: 0, face: 0 }; this.visor = { x: 0, y: 0, face: 0 };
    this.box = { x0: 0, y0: 0, x1: 0, y1: 0 };
    // weight: springs kicked by impacts (body sink, plates lagging behind, a forward lurch)
    this.sink = 0; this.sinkV = 0; this.plateOff = 0; this.plateV = 0; this.lurch = 0; this.lurchV = 0;
    this.dt = 0; this._ft = [[0, 0], [0, 0]]; this._fLift = [0, 0];
    this.contact = { L: { up: false, z: 5 }, R: { up: false, z: 5 }, kL: { up: true }, kR: { up: true } };
    this.events = []; this.prevState = null; this.prevKind = null;
  }
  resetWeight() {
    this.sink = this.sinkV = this.plateOff = this.plateV = this.lurch = this.lurchV = 0; this._fLift[0] = this._fLift[1] = 0;
    this.events.length = 0; this.prevState = null; this._death = null; this._halDrop = null;
    for (const k in this.contact) this.contact[k].up = k[0] === 'k';
  }
  /** Spring impulses (called on impacts). */
  kick(sink, plate, lurch) { this.sinkV += sink || 0; this.plateV += plate || 0; this.lurchV += lurch || 0; }
  /** torso-local -> char frame (relative to the waist) */
  tl(s, f, z, out) {
    const R = this.R, W = this.j.waist;
    out[0] = W.s + R[0] * s + R[3] * f + R[6] * z; out[1] = W.f + R[1] * s + R[4] * f + R[7] * z; out[2] = W.z + R[2] * s + R[5] * f + R[8] * z;
    return out;
  }
  /** How far along the torso's forward axis a char-frame point must move to sit outside his armour. */
  torsoPush(s, f, z, margin) {
    const R = this.R, W = this.j.waist, ds = s - W.s, df = f - W.f, dz = z - W.z;
    const ls = R[0] * ds + R[1] * df + R[2] * dz, lf = R[3] * ds + R[4] * df + R[5] * dz, lz = R[6] * ds + R[7] * df + R[8] * dz;
    if (lz < -40 || lz > 56) return 0;
    const a = lz < -12 ? 24 : lz < 14 ? 25 : lz < 36 ? 34 : 36, b = lz < -12 ? 18 : lz < 14 ? 16 : lz < 36 ? 21 : 19;
    const A = a + margin, Bd = b + margin, u = ls / A;
    if (Math.abs(u) >= 1) return 0;
    const edge = Bd * Math.sqrt(1 - u * u), d = lf - 3;
    if (Math.abs(d) >= edge) return 0;
    return d >= -0.6 * edge ? edge - d : -(edge + d);           // out the front unless it is well behind his middle
  }
  leg(hip, knee, ankle, tS, tF, tZ) {
    const L1 = BRIG.THIGH, L2 = BRIG.SHIN;
    let ds = tS - hip.s, df = tF - hip.f, dz = tZ - hip.z; const d = Math.hypot(ds, df, dz) || 1;
    const dd = clamp(d, 8, L1 + L2 - 0.1);
    const us = ds / d, uf = df / d, uz = dz / d;
    let ps = -us * uf, pf = 1 - uf * uf, pz = -uz * uf;
    const pl = Math.hypot(ps, pf, pz) || 1; ps /= pl; pf /= pl; pz /= pl;
    const a = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    knee.s = hip.s + us * a + ps * h; knee.f = hip.f + uf * a + pf * h; knee.z = hip.z + uz * a + pz * h;
    ankle.s = hip.s + us * dd; ankle.f = hip.f + uf * dd; ankle.z = hip.z + uz * dd;
  }
  /** Anatomical two-bone arm (see Rig.arm3), measured in the torso's own frame so it twists with him. */
  arm(sh, el, wr, hand, t0, side, shaft, key) {
    const L1 = BRIG.UPPER, L2 = BRIG.FORE, R = this.R;
    const t = this._t; t[0] = t0[0]; t[1] = t0[1]; t[2] = t0[2];
    const push = this.torsoPush(t[0], t[1], t[2], 7);
    t[0] += R[3] * push; t[1] += R[4] * push; t[2] += R[5] * push;
    const ds = t[0] - sh.s, df = t[1] - sh.f, dz = t[2] - sh.z, d = Math.hypot(ds, df, dz) || 1e-4;
    const us = ds / d, uf = df / d, uz = dz / d;
    const dmin = Math.sqrt(L1 * L1 + L2 * L2 - 2 * L1 * L2 * Math.cos(35 * RAD));
    const dd = clamp(d, dmin, L1 + L2 - 0.1);
    const a = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const Cs = sh.s + us * a, Cf = sh.f + uf * a, Cz = sh.z + uz * a;
    const Ws = sh.s + us * dd, Wf = sh.f + uf * dd, Wz = sh.z + uz * dd;
    // preferred elbow: down, back and out in the torso frame; out and forward when the hands go high
    const lzT = R[6] * (t[0] - sh.s) + R[7] * (t[1] - sh.f) + R[8] * (t[2] - sh.z);
    const raise = clamp(lzT / 24, 0, 1);
    const qs = side * (0.3 + 0.35 * raise), qf = -0.35 + 0.6 * raise, qz = -1 + 0.55 * raise;
    let ps = R[0] * qs + R[3] * qf + R[6] * qz, pf = R[1] * qs + R[4] * qf + R[7] * qz, pz = R[2] * qs + R[5] * qf + R[8] * qz;
    { const l = Math.hypot(ps, pf, pz); ps /= l; pf /= l; pz /= l; }
    let e1s = ps, e1f = pf, e1z = pz; { const k = e1s * us + e1f * uf + e1z * uz; e1s -= k * us; e1f -= k * uf; e1z -= k * uz; }
    let el1 = Math.hypot(e1s, e1f, e1z);
    if (el1 < 1e-3) { e1s = R[0] * side; e1f = R[1] * side; e1z = R[2] * side; const k = e1s * us + e1f * uf + e1z * uz; e1s -= k * us; e1f -= k * uf; e1z -= k * uz; el1 = Math.hypot(e1s, e1f, e1z) || 1; }
    e1s /= el1; e1f /= el1; e1z /= el1;
    const e2s = uf * e1z - uz * e1f, e2f = uz * e1s - us * e1z, e2z = us * e1f - uf * e1s;
    const prev = this._elPrev[key];
    let best = 1e9, bs = 0, bf = 0, bz = 0;
    for (let i = 0; i < 36; i++) {
      const th = i / 36 * TAU, c = Math.cos(th), sn = Math.sin(th);
      const ods = e1s * c + e2s * sn, odf = e1f * c + e2f * sn, odz = e1z * c + e2z * sn;
      const Es = Cs + h * ods, Ef = Cf + h * odf, Ez = Cz + h * odz;
      let cost = 1 - (ods * ps + odf * pf + odz * pz);
      const Ux = (Es - sh.s) / L1, Uy = (Ef - sh.f) / L1, Uz = (Ez - sh.z) / L1;
      const Us = R[0] * Ux + R[1] * Uy + R[2] * Uz, Uf = R[3] * Ux + R[4] * Uy + R[5] * Uz, Uu = R[6] * Ux + R[7] * Uy + R[8] * Uz;
      cost += 4 * Math.max(0, -0.45 - Uf) + 4 * Math.max(0, -0.35 - Us * side);        // shoulder range
      if (Uu > 0.1) cost += 1.2 * (Uu - 0.1) * (1 - raise);                               // elbows don't wing up
      if (shaft) {                                                                         // forearm square to the shaft
        const Fs = (Ws - Es) / L2, Ff = (Wf - Ef) / L2, Fz = (Wz - Ez) / L2, k = Fs * shaft[0] + Ff * shaft[1] + Fz * shaft[2];
        cost += 1.6 * k * k;
      }
      for (const u of [0.5, 0.9]) cost += 0.06 * Math.abs(this.torsoPush(sh.s + (Es - sh.s) * u, sh.f + (Ef - sh.f) * u, sh.z + (Ez - sh.z) * u, 6));
      for (const u of [0.3, 0.7]) cost += 0.06 * Math.abs(this.torsoPush(Es + (Ws - Es) * u, Ef + (Wf - Ef) * u, Ez + (Wz - Ez) * u, 6));
      if (prev.ok) cost += 0.004 * Math.hypot(Es - prev.s, Ef - prev.f, Ez - prev.z);
      if (cost < best) { best = cost; bs = Es; bf = Ef; bz = Ez; }
    }
    el.s = bs; el.f = bf; el.z = bz; prev.s = bs; prev.f = bf; prev.z = bz; prev.ok = true;
    wr.s = Ws; wr.f = Wf; wr.z = Wz;
    const F = this._fore[key];
    let Fs = wr.s - el.s, Ff = wr.f - el.f, Fz = wr.z - el.z; const fl = Math.hypot(Fs, Ff, Fz) || 1;
    F[0] = Fs / fl; F[1] = Ff / fl; F[2] = Fz / fl;
    hand.s = wr.s + F[0] * BRIG.HAND; hand.f = wr.f + F[1] * BRIG.HAND; hand.z = wr.z + F[2] * BRIG.HAND;
  }

  /** Build the skeleton from the current pose params (this.cur) and walk state. */
  build(b) {
    const J = this.j, P = this.cur, HG = BRIG.HAND * 0.5;
    const w = this.walkAmp, ph = this.walkPhase;
    // ---- pelvis + legs
    const bob = -2.2 * w / 16 * Math.pow(Math.sin(ph), 2);
    J.pelvis.s = 0; J.pelvis.f = 0; J.pelvis.z = BRIG.HIP_Z - P.crouch - this.sink + bob;
    J.hipL.s = -BRIG.HIP_W; J.hipR.s = BRIG.HIP_W;
    for (const hp of [J.hipL, J.hipR]) { hp.f = 0; hp.z = J.pelvis.z; }
    const tuck = b.elev * 0.2;
    for (const side of [-1, 1]) {
      const fo = side < 0 ? P.fl : P.fr, wp = ph + (side < 0 ? 0 : Math.PI), stride = Math.sin(wp) * w;
      const lift = Math.max(0, Math.cos(wp)) * (2 + w * 0.5);
      // a foot that is being moved to a new spot lifts off and comes down again (and lands with a thud)
      const si = side < 0 ? 0 : 1, ft = this._ft[si], bs = side * BRIG.FOOT_W + fo[0], bf = fo[1];
      if (this.dt > 0) {
        const spd = Math.hypot(bs - ft[0], bf - ft[1]) / this.dt;
        this._fLift[si] = smooth(this._fLift[si], clamp(spd * 0.06, 0, 13), spd * 0.06 > this._fLift[si] ? 24 : 9, this.dt);
      }
      ft[0] = bs; ft[1] = bf;
      const tS = bs + this.walkS * stride, tF = bf + this.walkF * stride - tuck * 0.6, tZ = 5 + fo[2] + lift + tuck + this._fLift[si];
      const hip = side < 0 ? J.hipL : J.hipR, knee = side < 0 ? J.kneeL : J.kneeR, ank = side < 0 ? J.ankleL : J.ankleR, toe = side < 0 ? J.toeL : J.toeR;
      this.leg(hip, knee, ank, tS, tF, tZ);
      const heel = clamp(-fo[1] / 40, 0, 1) * clamp(fo[2] / 6, 0, 1);       // back foot up on its toes in a lunge
      toe.s = ank.s + side * 1; toe.f = ank.f + BRIG.FOOT * (1 - 0.3 * heel); toe.z = Math.max(1, ank.z - 3 - 8 * heel);
    }
    // ---- torso basis: twist (yaw), then lean (pitch forward), then roll (side)
    const lean = P.lean + this.lurch;
    const ct = Math.cos(P.twist), st = Math.sin(P.twist), cl = Math.cos(lean), sl = Math.sin(lean), cr = Math.cos(P.roll), sr = Math.sin(P.roll);
    const rot = (v) => {                                  // apply to a local vector, in place
      let s = v[0] * ct - v[1] * st, f = v[0] * st + v[1] * ct, z = v[2];
      const f2 = f * cl + z * sl, z2 = -f * sl + z * cl; f = f2; z = z2;
      const s2 = s * cr + z * sr, z3 = -s * sr + z * cr; s = s2; z = z3;
      v[0] = s; v[1] = f; v[2] = z; return v;
    };
    const R = this.R, cs = rot([1, 0, 0]), cf = rot([0, 1, 0]), cu = rot([0, 0, 1]);
    R[0] = cs[0]; R[1] = cs[1]; R[2] = cs[2]; R[3] = cf[0]; R[4] = cf[1]; R[5] = cf[2]; R[6] = cu[0]; R[7] = cu[1]; R[8] = cu[2];
    J.waist.s = 0; J.waist.f = 1; J.waist.z = J.pelvis.z + (BRIG.WAIST_Z - BRIG.HIP_Z);
    const br = Math.sin(this.breath) * 0.9, tmp = this._v;
    const put = (q, s, f, z) => { this.tl(s, f, z, tmp); q.s = tmp[0]; q.f = tmp[1]; q.z = tmp[2]; };
    put(J.neck, 0, 1, BRIG.NECK_Z - BRIG.WAIST_Z + br);
    put(J.shR, BRIG.SHOULDER_W, 0, BRIG.SHOULDER_Z - BRIG.WAIST_Z + br);
    put(J.shL, -BRIG.SHOULDER_W, 0, BRIG.SHOULDER_Z - BRIG.WAIST_Z + br);
    // head: pitch (+ = nod down) and yaw relative to the torso
    const hp = P.headPitch, hy = P.headYaw;
    const hf = [-Math.sin(hy) * Math.cos(hp), Math.cos(hy) * Math.cos(hp), -Math.sin(hp)], hu = [Math.sin(hy) * Math.sin(hp) * 0, Math.sin(hp), Math.cos(hp)];
    const HF = this.headF, HU = this.headU;
    HF[0] = R[0] * hf[0] + R[3] * hf[1] + R[6] * hf[2]; HF[1] = R[1] * hf[0] + R[4] * hf[1] + R[7] * hf[2]; HF[2] = R[2] * hf[0] + R[5] * hf[1] + R[8] * hf[2];
    HU[0] = R[0] * hu[0] + R[3] * hu[1] + R[6] * hu[2]; HU[1] = R[1] * hu[0] + R[4] * hu[1] + R[7] * hu[2]; HU[2] = R[2] * hu[0] + R[5] * hu[1] + R[8] * hu[2];
    J.head.s = J.neck.s + HU[0] * BRIG.HEAD; J.head.f = J.neck.f + HU[1] * BRIG.HEAD; J.head.z = J.neck.z + HU[2] * BRIG.HEAD;
    // ---- arms + halberd. Left hand high on the shaft (H), right hand GAP lower along D.
    const D = this._d; { const l = Math.hypot(P.D[0], P.D[1], P.D[2]) || 1; D[0] = P.D[0] / l; D[1] = P.D[1] / l; D[2] = P.D[2] / l; }
    const fL = this._fore.L, fR = this._fore.R, wt = this._w;
    const freeL = P.freeL > 0.5, freeR = P.freeR > 0.5;
    if (freeL) { wt[0] = P.Lr[0]; wt[1] = P.Lr[1]; wt[2] = P.Lr[2]; this.arm(J.shL, J.elL, J.wrL, J.handL, wt, -1, null, 'L'); }
    else { wt[0] = P.H[0] - fL[0] * HG; wt[1] = P.H[1] - fL[1] * HG; wt[2] = P.H[2] - fL[2] * HG; this.arm(J.shL, J.elL, J.wrL, J.handL, wt, -1, D, 'L'); }
    const gU = this._gu; gU[0] = J.wrL.s + fL[0] * HG; gU[1] = J.wrL.f + fL[1] * HG; gU[2] = J.wrL.z + fL[2] * HG;
    if (freeR) { wt[0] = P.R[0]; wt[1] = P.R[1] + this.swing; wt[2] = P.R[2]; this.arm(J.shR, J.elR, J.wrR, J.handR, wt, 1, null, 'R'); }
    else {
      const Hl = freeL ? P.H : gU;
      wt[0] = Hl[0] - D[0] * P.gap - fR[0] * HG; wt[1] = Hl[1] - D[1] * P.gap - fR[1] * HG; wt[2] = Hl[2] - D[2] * P.gap - fR[2] * HG;
      this.arm(J.shR, J.elR, J.wrR, J.handR, wt, 1, D, 'R');
    }
    const gL = this._gl; gL[0] = J.wrR.s + fR[0] * HG; gL[1] = J.wrR.f + fR[1] * HG; gL[2] = J.wrR.z + fR[2] * HG;
    // the shaft runs through wherever the fists actually got to
    const hal = this.hal, X = hal.x, top = freeL ? (freeR ? P.H : gL) : gU;
    if (!freeL && !freeR) {
      const ds = gU[0] - gL[0], df = gU[1] - gL[1], dz = gU[2] - gL[2], l = Math.hypot(ds, df, dz);
      if (l > 12) { X[0] = ds / l; X[1] = df / l; X[2] = dz / l; } else { X[0] = D[0]; X[1] = D[1]; X[2] = D[2]; }
    } else { X[0] = D[0]; X[1] = D[1]; X[2] = D[2]; }
    const gu = freeL && !freeR ? P.gu - P.gap : P.gu;
    hal.o[0] = top[0] - X[0] * gu; hal.o[1] = top[1] - X[1] * gu; hal.o[2] = top[2] - X[2] * gu;
    { const E = P.E, Y = hal.y, k = E[0] * X[0] + E[1] * X[1] + E[2] * X[2];
      Y[0] = E[0] - X[0] * k; Y[1] = E[1] - X[1] * k; Y[2] = E[2] - X[2] * k;
      let l = Math.hypot(Y[0], Y[1], Y[2]);
      if (l < 1e-3) { Y[0] = -X[1]; Y[1] = X[0]; Y[2] = 0; l = Math.hypot(Y[0], Y[1]) || 1; }
      Y[0] /= l; Y[1] /= l; Y[2] /= l; }
    // ---- floating plates: beside the shoulders in the torso frame, bobbing
    const t = this.t;
    for (const pl of this.plates) {
      const S = pl.side, k = pl.k, bobz = Math.sin(t * 2 + k * 1.3 + S) * 3.2 * (1 - P.tilt);
      const out = (k === 0 ? 54 : 60) + P.spread * (k === 0 ? 1 : 0.8), z = (k === 0 ? 56 : 34) + P.lift * (k === 0 ? 1 : 0.8) + bobz + br + this.plateOff * (k === 0 ? 1 : 1.25) + this.sink * 0.6;
      this.tl(S * out, k === 0 ? 2 : -1, z, pl.o);
      const tilt = (k === 0 ? 0.55 : 0.2) + Math.sin(t * 1.5 + k) * 0.05 + P.spread * 0.008;
      const ox = S * Math.cos(tilt), oz = Math.sin(tilt);           // outward, tipped up
      pl.x[0] = R[0] * ox + R[6] * oz; pl.x[1] = R[1] * ox + R[7] * oz; pl.x[2] = R[2] * ox + R[8] * oz;
      pl.y[0] = R[6] * Math.cos(tilt) - R[0] * S * Math.sin(tilt); pl.y[1] = R[7] * Math.cos(tilt) - R[1] * S * Math.sin(tilt); pl.y[2] = R[8] * Math.cos(tilt) - R[2] * S * Math.sin(tilt);
    }
    // ---- death: topple forward around the feet; plates and the halberd fall on their own
    if (P.tilt > 0.001) {
      const a = P.tilt * 1.25, c = Math.cos(a), sn = Math.sin(a);
      for (const q of this._all) { if (q === J.ankleL || q === J.ankleR || q === J.toeL || q === J.toeR) continue; const f = q.f, z = q.z; q.f = f * c + z * sn; q.z = Math.max(4, -f * sn + z * c); }
      for (const v of [this.headF, this.headU]) { const f = v[1], z = v[2]; v[1] = f * c + z * sn; v[2] = -f * sn + z * c; }
      const Rm = this.R; for (const i of [0, 3, 6]) { const f = Rm[i + 1], z = Rm[i + 2]; Rm[i + 1] = f * c + z * sn; Rm[i + 2] = -f * sn + z * c; }
    }
  }
}
BossRig.prototype._t = bv(); BossRig.prototype._v = bv(); BossRig.prototype._d = bv(); BossRig.prototype._w = bv();
BossRig.prototype._gu = bv(); BossRig.prototype._gl = bv(); BossRig.prototype.walkS = 0; BossRig.prototype.walkF = 1;
BossRig.prototype.breath = 0; BossRig.prototype.t = 0; BossRig.prototype.swing = 0;
Object.defineProperty(BossRig.prototype, '_all', { get() { if (!this.__all) this.__all = Object.values(this.j); return this.__all; } });

// ---------------------------------------------------------------- state -> pose
const _bs = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function setv(v, s, f, z) { v[0] = s; v[1] = f; v[2] = z; return v; }
function normv(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; v[0] /= l; v[1] /= l; v[2] /= l; return v; }

/** Guard: upright halberd in the left hand at his side, right fist down. */
function bossIdle(T, b, t) {
  T.crouch = 3; T.lean = 0.05; T.twist = 0; T.roll = 0; T.headPitch = 0.06; T.headYaw = 0;
  setv(T.fl, -1, 5, 0); setv(T.fr, 2, -7, 0);
  setv(T.H, -50, 17, 100); setv(T.D, 0.03, 0.07, 1); setv(T.E, 0, 1, 0); T.gu = 99;
  T.freeR = 1; setv(T.R, 46, 7, 66); T.freeL = 0; setv(T.Lr, -46, 6, 66);
  T.spread = 0; T.lift = 0; T.tilt = 0; T.gap = BRIG.GAP;
}
/** The sweep from its local angle a (+ = his left): halberd held long, swung flat around him. */
function bossSweepAt(T, a, crouch) {
  const tw = a * 0.75;
  T.crouch = crouch; T.lean = 0.16; T.twist = tw; T.headYaw = -tw * 0.75; T.headPitch = 0.05; T.roll = -a * 0.05;
  setv(T.fl, -12, 14, 0); setv(T.fr, 9, -15, 0);
  const sx = -Math.sin(a), fx = Math.cos(a), cs = -Math.sin(tw) * 30, cf = Math.cos(tw) * 30 + 2;   // fists together in front of his chest
  T.gap = 22; setv(T.H, cs + sx * 11, cf + fx * 11, 92 - crouch); setv(T.D, sx, fx, 0.05); setv(T.E, fx, -sx, 0); T.gu = 36;
  T.freeR = 0; T.freeL = 0;
}
/** Overhead slam: phi = shaft angle in the sagittal plane (123 deg = raised over the back, -52 = chopped into the floor). */
function bossSlamAt(T, phi, crouch, lean) {
  T.crouch = crouch; T.lean = lean; T.twist = 0; T.headYaw = 0; T.headPitch = lean > 0.2 ? -0.1 : 0.05; T.roll = 0;
  setv(T.fl, -6, 6, 0); setv(T.fr, 6, -10, 0);
  const u = clamp((123 * RAD - phi) / (153 * RAD), 0, 1);                       // 0 raised .. 1 down
  setv(T.H, 2 - 8 * u, 4 + 54 * u, (158 - crouch) * (1 - u) + 66 * u);
  setv(T.D, 0.04, Math.cos(phi), Math.sin(phi)); setv(T.E, 0, Math.cos(phi - Math.PI / 2), Math.sin(phi - Math.PI / 2));
  T.gu = 70 + 46 * u; T.gap = 40 - 6 * u; T.freeR = 0; T.freeL = 0;
}
/** Lance: sideways spear stance, right fist at the right hip (placed in the torso's frame), left hand forward. */
function bossLanceAt(T, rh, crouch, lean, twist) {
  T.crouch = crouch; T.lean = lean; T.twist = twist; T.headYaw = -twist * 0.85; T.headPitch = 0.04 - lean * 0.6; T.roll = 0.05;
  setv(T.fl, -2, 22, 0); setv(T.fr, 8, -26, 0);
  const D = normv(setv(T.D, -0.12, 1, -0.02)), c = Math.cos(twist), s = Math.sin(twist);
  const ls = rh[0], lf = rh[1] + rh[2] * Math.sin(lean), lz = rh[2] * Math.cos(lean);     // torso-local -> char frame
  const Rs = ls * c - lf * s, Rf = ls * s + lf * c, Rz = BRIG.WAIST_Z - crouch + lz;
  setv(T.H, Rs + D[0] * BRIG.GAP, Rf + D[1] * BRIG.GAP, Rz + D[2] * BRIG.GAP);
  setv(T.E, 0, 0, -1); T.gu = 120; T.freeR = 0; T.freeL = 0;
}

const _bossTgt = bossPose();
/** Called from Boss.animate. Picks this frame's target pose, eases toward it, builds the skeleton. */
function poseBoss(b, dt, t) {
  const R = b.rig, T = R.tgt, C = R.cur, st = b.state, Tm = b.state_t, atk = b.atk;
  R.yaw = b.facing; R.t = t; R.breath = t * 1.6;
  let rate = 7, direct = false;
  bossIdle(T, b, t);
  const spd = hypot(b.vx, b.vy), cy = Math.cos(b.facing), sy = Math.sin(b.facing);
  let walkT = 0;
  if (st === S_IDLE || st === S_STALK) {
    walkT = clamp(spd / BOSS_SPEED, 0, 1.4) * 15;
    if (walkT > 2) { T.H[2] += 6; T.lean += 0.04; setv(T.fl, 0, 0, 0); setv(T.fr, 0, 0, 0); }
    if (st === S_IDLE && b.phase === 2) { T.crouch += 3; T.lean += 0.05; }
  } else if (st === S_WINDUP && b.kind === 'sweep') {
    const q = clamp(Tm / atk.windup, 0, 1);
    bossSweepAt(T, atk.half * 1.15, 12 + 6 * q); T.lean = 0.12 + 0.06 * q;
    setv(T.D, -0.8, -0.42, 0.2); setv(T.H, -30, 12, 90 - T.crouch); setv(T.E, 0.25, 1, 0); T.gu = 44;
    T.spread = 10 * q; rate = 11;
  } else if (st === S_ACTIVE && b.kind === 'sweep') {
    const p = clamp(Tm / atk.active, 0, 1), e = 1 - Math.pow(1 - p, 2);
    bossSweepAt(T, atk.half * (1 - 2 * e), 18); T.spread = 10 * (1 - p); direct = true;
  } else if (st === S_RECOVERY && b.kind === 'sweep') {
    const q = Tm / atk.recovery;
    if (q < 0.45) { bossSweepAt(T, -atk.half * 1.05, 18 - 6 * q); rate = 8; } else rate = 3;
  } else if (st === S_WINDUP && b.kind === 'slam') {
    if (Tm < atk.crouch) { const c = Tm / atk.crouch; bossSlamAt(T, 123 * RAD, 10 + 20 * c, 0.22); rate = 12; }
    else {
      const q = clamp((Tm - atk.crouch) / (atk.windup - atk.crouch), 0, 1), dn = _bs(0.72, 1, q);
      bossSlamAt(T, (123 - 60 * dn) * RAD, 6 + 14 * dn, -0.12 + 0.3 * dn); rate = 14;
    }
  } else if (st === S_ACTIVE && b.kind === 'slam') {
    bossSlamAt(T, -30 * RAD, 30, 0.32); setv(T.fl, -10, 12, 0); setv(T.fr, 10, -14, 0); direct = true;
  } else if (st === S_RECOVERY && b.kind === 'slam') {
    const q = Tm / atk.recovery;
    if (q < 0.4) { bossSlamAt(T, -30 * RAD, 30 - 8 * q, 0.42 - 0.2 * q); rate = 10; } else rate = 3;
  } else if (st === S_WINDUP && b.kind === 'lance') {
    if (Tm < atk.lock) { const q = Tm / atk.lock; bossLanceAt(T, [28, 2 - 4 * q, 10], 12 + 4 * q, 0.04, -0.72); rate = 9; }
    else { bossLanceAt(T, [29, -8, 9], 24, 0.2, -0.85); T.spread = 4; rate = 12; }
  } else if (st === S_ACTIVE && b.kind === 'lance') {
    bossLanceAt(T, [24, 8, 22], 18, 0.34, -0.55); setv(T.fl, -4, 30, 0); setv(T.fr, 6, -40, 7); direct = Tm < 0.05 ? false : true; rate = 30;
  } else if (st === S_RECOVERY && b.kind === 'lance') {
    const q = Tm / atk.recovery;
    if (q < 0.35) { bossLanceAt(T, [22, 26, 24], 18 - 6 * q, 0.3 - 0.4 * q, -0.45); rate = 9; } else rate = 3;
  } else if (st === S_STAGGERED) {
    const k = Tm / STAGGER_TIME;
    T.crouch = 25; T.lean = 0.32; T.twist = 0.1; T.headPitch = 0.4; T.roll = Math.sin(Tm * 9) * 0.05 * (1 - k) + 0.04;
    setv(T.fl, -4, 28, 0); setv(T.fr, 2, -28, 1);
    setv(T.H, -42, 34, 72); setv(T.D, 0.03, 0.12, 1); setv(T.E, 0, 1, 0); T.gu = 72;
    T.freeR = 1; setv(T.R, 24, 22, 42); T.lift = -30; rate = 9;
  } else if (st === S_PHASE) {
    const k = Tm / PHASE_TIME, rise = Math.sin(Math.PI * Math.min(1, k * 1.25));
    T.crouch = 3 - 6 * rise; T.lean = 0.05 - 0.24 * rise; T.headPitch = 0.05 - 0.45 * rise; T.roll = Math.sin(Tm * 30) * 0.02 * (1 - k);
    setv(T.fl, -6, 8, 0); setv(T.fr, 6, -8, 0);
    setv(T.H, -50, 12, 100 + 70 * rise); setv(T.D, -0.08, 0.05, 1); T.gu = 100;
    T.freeR = 1; setv(T.R, 46 + 40 * rise, 7 + 8 * rise, 66 + 62 * rise);
    T.spread = 26 * rise; T.lift = 10 * rise; rate = 6;
  } else if (st === S_DEAD) {
    // knees buckle -> kneels, sways -> topples forward (gravity: accelerating) -> hits the floor and settles
    T.crouch = 27; T.lean = 0.3; T.headPitch = 0.5; setv(T.fl, -4, 26, 0); setv(T.fr, 2, -28, 1);
    T.freeR = 1; T.freeL = 1; setv(T.R, 30, 26, 40); setv(T.Lr, -30, 26, 40); rate = 5;
  }
  // hit reactions on top: a shove of the torso and a little sink
  T.roll += b.wob * 0.55; T.lean -= Math.abs(b.wob) * 0.25; T.crouch += b.squash * 60;
  // ---- ease toward the target
  if (R.fresh || dt <= 0) { for (const k of BOSS_POSE_KEYS) C[k] = T[k]; for (const k of BOSS_VEC_KEYS) for (let i = 0; i < 3; i++) C[k][i] = T[k][i]; R.fresh = false; }
  else {
    const kk = direct ? 1 : 1 - Math.exp(-rate * dt);
    for (const k of BOSS_POSE_KEYS) C[k] += (T[k] - C[k]) * (k === 'freeR' || k === 'freeL' ? 1 : kk);
    for (const k of BOSS_VEC_KEYS) for (let i = 0; i < 3; i++) C[k][i] += (T[k][i] - C[k][i]) * kk;
  }
  // ---- walking
  R.walkAmp = dt > 0 ? smooth(R.walkAmp, walkT, 8, dt) : walkT;
  if (spd > 10 && (st === S_IDLE || st === S_STALK)) {
    R.walkS = (b.vx * sy - b.vy * cy) / spd; R.walkF = (b.vx * cy + b.vy * sy) / spd;
    R.walkPhase += dt * Math.PI * spd / (2 * Math.max(10, R.walkAmp + 10));
  } else if (dt > 0) { const k = Math.round(R.walkPhase / Math.PI) * Math.PI; R.walkPhase = smooth(R.walkPhase, k, 6, dt); }
  R.swing = Math.sin(R.walkPhase + Math.PI) * R.walkAmp * 0.55;             // the free fist swings with the stride
  // ---- weight: impulses when he lands, stops, swings or goes down; springs settle them
  const prevSt = R.prevState, prevK = R.prevKind;
  if (dt > 0 && prevSt !== null && (st !== prevSt || b.kind !== prevK)) {
    if (st === S_ACTIVE && b.kind === 'slam') R.kick(190, -190, 0.25);
    else if (st === S_ACTIVE && b.kind === 'sweep') R.kick(45, 30, 0);
    else if (st === S_ACTIVE && b.kind === 'lance') R.kick(30, 40, 0.9);
    else if (prevSt === S_ACTIVE && prevK === 'lance') R.kick(90, -110, 2.6);         // the charge slams to a stop
    else if (st === S_WINDUP && b.kind === 'slam') R.kick(0, 20, 0);
    else if (st === S_STAGGERED) R.kick(60, -120, 0.4);
    else if (st === S_PHASE) R.kick(70, 60, -0.3);
  }
  R.prevState = st; R.prevKind = b.kind; R.dt = dt;
  if (dt > 0) {
    const sp = (x, v, k, c) => v + (-k * x - c * v) * dt;
    R.sinkV = sp(R.sink, R.sinkV, 190, 16); R.sink += R.sinkV * dt;
    R.plateV = sp(R.plateOff, R.plateV, 55, 4.2); R.plateOff += R.plateV * dt;
    R.lurchV = sp(R.lurch, R.lurchV, 110, 11); R.lurch += R.lurchV * dt;
  }
  // ---- death timeline (seconds): exact, not eased, so it has weight
  let fallT = 0;
  if (st === S_DEAD) {
    const s = b.dead_t;
    if (!R._death) R._death = { c0: C.crouch, l0: C.lean, body: false, hal: false, plates: R.plates.map((pl, i) => ({ t0: 0.12 + 0.07 * i, z: 0, v: 0, on: false, hit: 0, out: 0 })) };
    const Dd = R._death, kq = clamp(s / 0.3, 0, 1);
    C.crouch = Dd.c0 + (27 - Dd.c0) * kq * kq;                                         // knees give: accelerating drop
    C.lean = Dd.l0 + (0.3 - Dd.l0) * kq + 0.05 * Math.sin(clamp((s - 0.3) / 0.5, 0, 1) * Math.PI);
    if (s < 0.8) fallT = 0;
    else if (s < 1.28) { const u = (s - 0.8) / 0.48; fallT = u * u; }
    else { const u = s - 1.28; fallT = 1 - 0.07 * Math.max(0, Math.sin(Math.min(1, u / 0.17) * Math.PI)) - 0.022 * Math.max(0, Math.sin(clamp((u - 0.17) / 0.12, 0, 1) * Math.PI)); }
    if (!Dd.body && s >= 1.28) { Dd.body = true; R.events.push({ type: 'body', s: 0, f: 60, str: 1 }); }
    C.tilt = fallT;
  } else R._death = null;
  R.build(b);
  if (st === S_DEAD) {
    const s = b.dead_t, Dd = R._death, H = R.hal;
    // the halberd tips over from his loosened grip: accelerating, then one bounce and a clang
    if (!R._halDrop) R._halDrop = { o: H.o.slice(), x: H.x.slice(), y: H.y.slice() };
    const u = clamp((s - 0.38) / 0.52, 0, 1), hf = u * u, bnc = s > 0.9 ? 5 * Math.max(0, Math.sin(clamp((s - 0.9) / 0.22, 0, 1) * Math.PI)) : 0;
    const A = R._halDrop, G = { o: [-80, -40, 3 + bnc], x: normv([0.35, 0.94, 0.0]), y: [0, 0, 1] };
    for (let i = 0; i < 3; i++) { H.o[i] = A.o[i] + (G.o[i] - A.o[i]) * hf; H.x[i] = A.x[i] + (G.x[i] - A.x[i]) * hf; H.y[i] = A.y[i] + (G.y[i] - A.y[i]) * hf; }
    normv(H.x); { const k = v3dot(H.y, H.x); for (let i = 0; i < 3; i++) H.y[i] -= H.x[i] * k; normv(H.y); }
    if (!Dd.hal && u >= 1) { Dd.hal = true; R.events.push({ type: 'halberd', s: H.o[0] + H.x[0] * 200, f: H.o[1] + H.x[1] * 200, str: 1 }); }
    // the floating plates lose their hold: fall, clank, bounce once
    R.plates.forEach((pl, i) => {
      const q = Dd.plates[i];
      if (s < q.t0) { q.z = pl.o[2]; return; }
      if (!q.on) { q.on = true; q.v = 0; }
      if (dt > 0 && q.hit < 2) { q.v -= 900 * dt; q.z += q.v * dt; q.out += 30 * dt; if (q.z <= 7) { q.z = 7; q.hit++; q.v = q.hit === 1 ? 140 : 0; R.events.push({ type: 'plate', s: pl.o[0], f: pl.o[1], str: q.hit === 1 ? 1 : 0.4 }); } }
      pl.o[2] = Math.max(7, q.z);
    });
  } else R._halDrop = null;
  bossContacts(R, b);
  bossProject(R);
}
/** Feet and knees meeting the floor -> 'foot' / 'knee' events (with how hard they came down). */
function bossContacts(R, b) {
  if (R.dt <= 0) return;
  const J = R.j, Cn = R.contact;
  for (const [key, A] of [['L', J.ankleL], ['R', J.ankleR]]) {
    const c = Cn[key], z = A.z + b.elev, vz = (c.z - z) / R.dt;
    if (z > 9.5) c.up = true;
    else if (c.up && z < 6.5) { c.up = false; R.events.push({ type: 'foot', s: A.s, f: A.f, str: clamp(0.35 + vz / 260, 0.35, 1) }); R.kick(28 * clamp(0.35 + vz / 260, 0.35, 1), -18, 0); }
    c.z = z;
  }
  const kneelOK = b.state === S_STAGGERED || (b.state === S_DEAD && b.dead_t < 0.8);       // only when he really goes down on a knee
  for (const [key, Kn] of [['kL', J.kneeL], ['kR', J.kneeR]]) {
    const c = Cn[key];
    if (!kneelOK) { c.up = Kn.z > 16 || c.up; continue; }
    if (Kn.z > 16) c.up = true;
    else if (c.up && Kn.z < 9) { c.up = false; R.events.push({ type: 'knee', s: Kn.s, f: Kn.f, str: 1 }); R.kick(50, -60, 0.15); }
  }
}
function v3dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

/** Screen positions (layer points, y up) for the 2D glows, and a bounding box for the GL scissor. */
function bossProject(R) {
  const c = Math.cos(R.yaw), s = Math.sin(R.yaw), bx = R.box;
  bx.x0 = 1e9; bx.y0 = 1e9; bx.x1 = -1e9; bx.y1 = -1e9;
  const P = (S, F, Z, pad) => {
    const X = S * s + F * c, Y = -S * c + F * s, x = X, y = Y * K + Z;
    if (x - pad < bx.x0) bx.x0 = x - pad; if (x + pad > bx.x1) bx.x1 = x + pad;
    if (y - pad < bx.y0) bx.y0 = y - pad; if (y + pad > bx.y1) bx.y1 = y + pad;
    return [x, y, Y];
  };
  for (const q of R._all) P(q.s, q.f, q.z, 30);
  const H = R.hal, L = BRIG.HAL;
  for (const u of [0, 0.5, 0.82, 1]) P(H.o[0] + H.x[0] * L * u, H.o[1] + H.x[1] * L * u, H.o[2] + H.x[2] * L * u, u > 0.7 ? 46 : 10);
  for (const pl of R.plates) P(pl.o[0], pl.o[1], pl.o[2], 30);
  // chest core and visor: where they are, and how much they face the camera (view = -Y, up a little)
  const Rm = R.R, toW = (v) => [v[0] * s + v[1] * c, -v[0] * c + v[1] * s, v[2]];
  const vw = [0, -1, K], vl = Math.hypot(vw[0], vw[1], vw[2]);
  const face = (v) => { const w = toW(v); return (w[0] * vw[0] + w[1] * vw[1] + w[2] * vw[2]) / vl; };
  const cp = R.tl(0, 27, 104 - BRIG.WAIST_Z, [0, 0, 0]); const pc = P(cp[0], cp[1], cp[2], 0);
  R.core.x = pc[0]; R.core.y = pc[1]; R.core.face = face([Rm[3], Rm[4], Rm[5]]);
  const J = R.j, HF = R.headF, HU = R.headU, vp = [J.head.s + HF[0] * 11 + HU[0] * 2, J.head.f + HF[1] * 11 + HU[1] * 2, J.head.z + HF[2] * 11 + HU[2] * 2];
  const pv = P(vp[0], vp[1], vp[2], 0); R.visor.x = pv[0]; R.visor.y = pv[1]; R.visor.face = face(HF);
}
