// ============================================================ BODY 3D (meshes + skeleton for the WebGL character)
// Everything is modelled once at boot in a bind pose (standing, arms down) in the char frame
// (s = his right, f = forward, z = up). Each vertex is skinned to two bones, so elbows and knees bend
// smoothly. Armor pieces are their own meshes worn over the body; cloth is rebuilt from the simulation.

const B = { pelvis: 0, spine: 1, neck: 2, head: 3, upperR: 4, foreR: 5, handR: 6, upperL: 7, foreL: 8, handL: 9,
  thighR: 10, shinR: 11, footR: 12, thighL: 13, shinL: 14, footL: 15, weapon: 16, offhand: 17, world: 18 };

// bind pose joints (char frame)
const BIND = {
  pelvis: [0, 0, 40], waist: [0, 0.5, 47], neck: [0, 1, 64], head: [0, 1.5, 73],
  shR: [10.5, 0.5, 60], elR: [11.4, 0.2, 46.2], wrR: [12, 0.8, 32.8], handR: [12, 1.0, 28.3],
  shL: [-10.5, 0.5, 60], elL: [-11.4, 0.2, 46.2], wrL: [-12, 0.8, 32.8], handL: [-12, 1.0, 28.3],
  hipR: [5, 0, 40], kneeR: [5, 0.6, 21.5], ankleR: [5, 0, 3.5], toeR: [6.2, 7.5, 1],
  hipL: [-5, 0, 40], kneeL: [-5, 0.6, 21.5], ankleL: [-5, 0, 3.5], toeL: [-6.2, 7.5, 1],
};
const FWD = [0, 1, 0], UP = [0, 0, 1];
/** Bone frames from a joint set (bind arrays or the rig's {s,f,z} joints). */
function boneFrames(J, out, headYaw) {
  const hy = headYaw || 0, headFwd = [-Math.sin(hy), Math.cos(hy), 0], neckFwd = [-Math.sin(hy * 0.45), Math.cos(hy * 0.45), 0];
  const g = (n) => { const q = J[n]; return Array.isArray(q) ? q : [q.s, q.f, q.z]; };
  const F = (i, o, a, ref) => frameFrom(out[i], g(o), v3.sub(g(a), g(o)), ref);
  F(B.pelvis, 'pelvis', 'waist', FWD); F(B.spine, 'waist', 'neck', FWD);
  frameFrom(out[B.neck], g('neck'), v3.sub(g('head'), g('neck')), neckFwd);
  frameFrom(out[B.head], g('head'), v3.sub(g('head'), g('neck')), headFwd);
  for (const [sd, S] of [['R', 1], ['L', -1]]) {
    const side = [S, 0, 0];
    F(B['upper' + sd], 'sh' + sd, 'el' + sd, side); F(B['fore' + sd], 'el' + sd, 'wr' + sd, side); F(B['hand' + sd], 'wr' + sd, 'hand' + sd, side);
    F(B['thigh' + sd], 'hip' + sd, 'knee' + sd, FWD); F(B['shin' + sd], 'knee' + sd, 'ankle' + sd, FWD); F(B['foot' + sd], 'ankle' + sd, 'toe' + sd, UP);
  }
  return out;
}

// ---------------------------------------------------------------- mesh helpers (bind space)
const C3 = (h) => hexRGB(h);
const MAT = {
  suit: C3('#18161f'), cloth: C3('#1d1a25'), clothD: C3('#121019'), plate: C3('#3a3c4a'), plateD: C3('#24252f'),
  leather: C3('#1c140f'), leatherL: C3('#3a2a1c'), gold: C3('#a8823c'), crimson: C3('#ff2a45'), crimsonD: C3('#8A2432'),
  black: C3('#050407'), steel: C3('#3a3b48'), steelD: C3('#1c1d25'), iron: C3('#7a7e90'), wood: C3('#3a2a1c'), glass: C3('#3a0b12'), skin: C3('#1a1820'),
};
/** Ring-based tube along a list of samples { p, r:[ru, rv], bones:[b0, b1, w], col | colFn(theta) , emit, spec }. */
function tube(mb, S, refFn, n, capStart, capEnd, skip) {
  n = n || 12;
  const rings = [];
  for (let k = 0; k < S.length; k++) {
    const q = S[k], prev = S[Math.max(0, k - 1)].p, next = S[Math.min(S.length - 1, k + 1)].p;
    const t = v3.norm(v3.sub(next, prev));
    let u = refFn(q, t); u = v3.norm(v3.sub(u, v3.mul(t, v3.dot(u, t)))); const v = v3.cross(t, u);
    const ring = [];
    for (let i = 0; i < n; i++) {
      const th = i / n * TAU, cu = Math.cos(th), sv = Math.sin(th);
      const p = v3.add(q.p, v3.add(v3.mul(u, cu * q.r[0]), v3.mul(v, sv * q.r[1])));
      const nr = v3.norm(v3.add(v3.mul(u, cu / q.r[0]), v3.mul(v, sv / q.r[1])));
      const m = q.colFn ? q.colFn(th, k) : [q.col, q.emit || 0, q.spec || 0];
      ring.push(mb.vert(p, nr, m[0], q.bones[0], q.bones[1], q.bones[2], m[1], m[2]));
    }
    rings.push(ring);
  }
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < n; i++) {
    if (skip && skip(k, i)) continue;
    const a = rings[k][i], b = rings[k][(i + 1) % n], c = rings[k + 1][(i + 1) % n], d = rings[k + 1][i];
    mb.quad(a, b, c, d);
  }
  const cap = (k, dir) => {
    const q = S[k], r = rings[k], t = v3.norm(v3.sub(S[Math.min(S.length - 1, k + 1)].p, S[Math.max(0, k - 1)].p));
    const m = q.colFn ? q.colFn(0, k) : [q.col, q.emit || 0, q.spec || 0];
    const tip = mb.vert(v3.add(q.p, v3.mul(t, dir * Math.min(q.r[0], q.r[1]) * 0.6)), v3.mul(t, dir), m[0], q.bones[0], q.bones[1], q.bones[2], m[1], m[2]);
    for (let i = 0; i < r.length; i++) mb.tri(r[i], r[(i + 1) % r.length], tip);
  };
  if (capStart) cap(0, -1); if (capEnd) cap(S.length - 1, 1);
  return rings;
}
/** Samples along a joint chain with smooth two-bone weights at the inner joints. */
function chainSamples(J, bones, count, radius, col, blend, extra) {
  const segL = []; let total = 0;
  for (let i = 0; i < J.length - 1; i++) { const l = v3.len(v3.sub(J[i + 1], J[i])); segL.push(l); total += l; }
  const out = [];
  for (let k = 0; k <= count; k++) {
    const d = total * k / count; let acc = 0, i = 0;
    while (i < segL.length - 1 && d > acc + segL[i]) { acc += segL[i]; i++; }
    const t = (d - acc) / segL[i], p = v3.lerp(J[i], J[i + 1], t);
    // weights: blend across each inner joint over +/- blend units
    let b0 = bones[i], b1 = bones[i], w = 1;
    const toEnd = (1 - t) * segL[i], toStart = t * segL[i];
    if (i < segL.length - 1 && toEnd < blend) { b1 = bones[i + 1]; w = 0.5 + 0.5 * toEnd / blend; }
    else if (i > 0 && toStart < blend) { b1 = bones[i - 1]; w = 0.5 + 0.5 * toStart / blend; }
    const r = radius(d / total, i, t);
    out.push(Object.assign({ p, r, bones: [b0, b1, w], col }, extra ? extra(d / total, i, t) : {}));
  }
  return out;
}
/** Ellipsoid (optionally a patch: theta 0 = front/+f, psi up). Returns nothing; colFn(th, ps) -> [col, emit, spec]. */
function ellipsoid(mb, c, R, bones, colFn, nLon, nLat, opts) {
  opts = opts || {}; nLon = nLon || 16; nLat = nLat || 10;
  const th0 = opts.th0 === undefined ? -Math.PI : opts.th0, th1 = opts.th1 === undefined ? Math.PI : opts.th1;
  const ps0 = opts.ps0 === undefined ? -Math.PI / 2 : opts.ps0, ps1 = opts.ps1 === undefined ? Math.PI / 2 : opts.ps1;
  const grid = [];
  for (let j = 0; j <= nLat; j++) {
    const row = [], ps = ps0 + (ps1 - ps0) * j / nLat;
    for (let i = 0; i <= nLon; i++) {
      const th = th0 + (th1 - th0) * i / nLon;
      let p = [R[0] * Math.cos(ps) * Math.sin(th), R[1] * Math.cos(ps) * Math.cos(th), R[2] * Math.sin(ps)];
      let nr = v3.norm([p[0] / (R[0] * R[0]), p[1] / (R[1] * R[1]), p[2] / (R[2] * R[2])]);
      if (opts.deform) { const q = opts.deform(p, th, ps); p = q[0]; nr = q[1] || nr; }
      const m = colFn(th, ps), bw = typeof bones === 'function' ? bones(p) : bones;
      row.push(mb.vert(v3.add(c, p), nr, m[0], bw[0], bw[1], bw[2], m[1], m[2]));
    }
    grid.push(row);
  }
  for (let j = 0; j < nLat; j++) for (let i = 0; i < nLon; i++) {
    if (opts.skip && opts.skip(th0 + (th1 - th0) * (i + 0.5) / nLon, ps0 + (ps1 - ps0) * (j + 0.5) / nLat)) continue;
    mb.quad(grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]);
  }
}
/** Vertical loft through horizontal ellipse sections [{z, a, b, f}], theta 0 = front. */
function loftZ(mb, secs, z0, z1, nz, nt, bonesAt, colFn, skip, grow) {
  grow = grow || [0, 0];
  const rows = [];
  for (let j = 0; j <= nz; j++) {
    const z = z0 + (z1 - z0) * j / nz, q = sectionAt(secs, z), a = q.a + grow[0], b = q.b + grow[1], f = q.f || 0;
    const dz = 0.6, qa = sectionAt(secs, z - dz), qb = sectionAt(secs, z + dz), slopeA = (qb.a - qa.a) / (2 * dz), slopeB = (qb.b - qa.b) / (2 * dz);
    const row = [];
    for (let i = 0; i <= nt; i++) {
      const th = -Math.PI + TAU * i / nt, s = Math.sin(th), c = Math.cos(th);
      const p = [a * s, f + b * c, z];
      const nr = v3.norm([s / a, c / b, -(slopeA * s * s / a + slopeB * c * c / b)]);
      const m = colFn(th, z), bw = bonesAt(z, th);
      row.push(mb.vert(p, nr, m[0], bw[0], bw[1], bw[2], m[1], m[2]));
    }
    rows.push(row);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nt; i++) {
    if (skip && skip(-Math.PI + TAU * (i + 0.5) / nt, z0 + (z1 - z0) * (j + 0.5) / nz)) continue;
    mb.quad(rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]);
  }
}
/** Box from 8 corners helper (centre, half sizes, local axes). */
function box(mb, c, hx, hy, hz, ax, ay, az, col, bone, emit, spec) {
  const faces = [[ax, ay, az, hx, hy, hz], [v3.mul(ax, -1), ay, v3.mul(az, -1), hx, hy, hz], [ay, v3.mul(ax, -1), az, hy, hx, hz],
                 [v3.mul(ay, -1), ax, az, hy, hx, hz], [az, ay, v3.mul(ax, -1), hz, hy, hx], [v3.mul(az, -1), ay, ax, hz, hy, hx]];
  for (const [n, u, w, hn, hu, hw] of faces) {
    const o = v3.add(c, v3.mul(n, hn)), P = (a, b) => v3.add(o, v3.add(v3.mul(u, a * hu), v3.mul(w, b * hw)));
    const i0 = mb.vert(P(-1, -1), n, col, bone, bone, 1, emit, spec), i1 = mb.vert(P(1, -1), n, col, bone, bone, 1, emit, spec);
    const i2 = mb.vert(P(1, 1), n, col, bone, bone, 1, emit, spec), i3 = mb.vert(P(-1, 1), n, col, bone, bone, 1, emit, spec);
    mb.quad(i0, i1, i2, i3);
  }
}
const sideRef = (S) => () => [S, 0, 0];
const fwdRef = () => FWD;
const upRef = () => UP;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- the base body (under-suit)
const BODY_TORSO = [
  { z: 31.5, a: 5.6, b: 4.0 }, { z: 36, a: 7.6, b: 5.2 }, { z: 41, a: 7.7, b: 5.2 }, { z: 46.5, a: 6.8, b: 4.5, f: 0.3 },
  { z: 51, a: 8.0, b: 5.0, f: 0.5 }, { z: 55, a: 9.4, b: 5.5, f: 0.7 }, { z: 59.5, a: 11.0, b: 5.1, f: 0.3 },
  { z: 62.5, a: 7.4, b: 4.3 }, { z: 65, a: 3.4, b: 3.1, f: 0.6 },
];
function torsoBones(z) {
  if (z < 43) return [B.pelvis, B.pelvis, 1];
  if (z < 49) { const w = smoothstep(43, 49, z); return [B.spine, B.pelvis, w]; }
  if (z > 63.5) return [B.spine, B.neck, 0.6];
  return [B.spine, B.spine, 1];
}
function buildBase(mb) {
  const suit = (th, z) => [MAT.suit, 0, 0.05];
  loftZ(mb, BODY_TORSO, 31.5, 65, 22, 20, torsoBones, suit);
  // neck + skull
  tube(mb, chainSamples([BIND.neck, BIND.head], [B.neck], 3, () => [3.0, 3.0], MAT.suit, 1), fwdRef, 10, false, false);
  ellipsoid(mb, v3.add(BIND.head, [0, 1, 0]), [5.2, 5.8, 7.0], [B.head, B.head, 1], (th, ps) =>
    [Math.abs(th) < 0.7 && ps > -0.45 && ps < 0.35 ? C3('#22202a') : MAT.suit, 0, 0.1], 16, 10);
  for (const [sd, S] of [['R', 1], ['L', -1]]) {
    // legs: one smooth tube hip -> knee -> ankle, flat foot
    const leg = chainSamples([BIND['hip' + sd], BIND['knee' + sd], BIND['ankle' + sd]], [B['thigh' + sd], B['shin' + sd]], 16,
      (u, i, t) => i === 0 ? [5.2 - 1.4 * t, 5.4 - 1.6 * t] : [3.8 - 1.4 * t + 0.6 * Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t), 3.6 - 1.4 * t + 0.7 * Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t)], MAT.suit, 3.5);
    tube(mb, leg, fwdRef, 12, true, false);
    const foot = chainSamples([BIND['ankle' + sd], BIND['toe' + sd]], [B['foot' + sd]], 5, (u) => [2.5 - 0.3 * u, 1.7 - 0.6 * u], MAT.suit, 1);
    foot[0].bones = [B['foot' + sd], B['shin' + sd], 0.5];
    tube(mb, foot, upRef, 10, true, true);
    // arms: shoulder -> elbow -> wrist, then a fist
    const arm = chainSamples([BIND['sh' + sd], BIND['el' + sd], BIND['wr' + sd]], [B['upper' + sd], B['fore' + sd]], 14,
      (u, i, t) => i === 0 ? [3.5 - 0.8 * t, 3.4 - 0.8 * t] : [2.7 + 0.4 * Math.sin(Math.PI * Math.min(1, t * 1.8)) * (1 - t) - 0.6 * t, 2.6 + 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.8)) * (1 - t) - 0.6 * t], MAT.suit, 3);
    tube(mb, arm, sideRef(S), 12, true, false);
    const fist = chainSamples([BIND['wr' + sd], BIND['hand' + sd]], [B['hand' + sd]], 4, (u) => [2.2 + 0.3 * Math.sin(Math.PI * u), 1.7 + 0.2 * Math.sin(Math.PI * u)], MAT.suit, 1);
    fist[0].bones = [B['hand' + sd], B['fore' + sd], 0.5];
    tube(mb, fist, sideRef(S), 10, false, true);
  }
}

// ---------------------------------------------------------------- starter set: the hooded hunter
const GEAR3D = {
  hunter_hood(mb) {
    // hood shell with a peak, a real face opening (the dark mask and visor slit show through), and a mantle
    const c = v3.add(BIND.head, [0, 0.2, 0.6]);
    ellipsoid(mb, c, [7.0, 7.6, 8.6], [B.head, B.head, 1], (th, ps) => [MAT.cloth, 0, 0.08], 20, 14, {
      deform: (p, th, ps) => {
        const back = Math.max(0, -Math.cos(th)), top = Math.max(0, Math.sin(ps));
        return [[p[0], p[1] - 3.5 * back * top * top, p[2] + 3.2 * Math.pow(top, 3) * back], null];
      },
      skip: (th, ps) => Math.abs(th) < 0.72 && ps > -0.5 && ps < 0.42,
    });
    // the visor: a glowing slit across the mask
    ellipsoid(mb, v3.add(BIND.head, [0, 1, 0]), [5.35, 5.95, 7.1], [B.head, B.head, 1], () => [MAT.crimson, 1, 0], 10, 2,
      { th0: -0.55, th1: 0.55, ps0: 0.02, ps1: 0.16 });
    // mantle: a short cowl over the shoulders
    loftZ(mb, [{ z: 55.5, a: 13.2, b: 7.4, f: -0.3 }, { z: 60, a: 11.8, b: 6.6 }, { z: 63.5, a: 7.6, b: 5.4, f: 0.3 }, { z: 66, a: 5.8, b: 4.8, f: 0.4 }],
      55.5, 66, 6, 22, (z) => z > 62 ? [B.spine, B.neck, 0.7] : [B.spine, B.spine, 1],
      (th, z) => [z < 56.5 ? MAT.crimsonD : MAT.cloth, z < 56.5 ? 0.35 : 0, 0.06], (th) => Math.abs(th) < 0.45);
  },
  hunter_coat(mb) {
    const col = (th, z) => {
      if (z > 47.6 && z < 49.6) return [Math.abs(th) < 0.16 ? C3('#d6b46a') : MAT.gold, 0, 0.6];         // belt + buckle
      if (Math.abs(th) < 0.95 && z > 51 && z < 59.5) return [MAT.plate, 0, 0.55];                         // chest plate
      if (z > 63) return [MAT.clothD, 0, 0.05];                                                              // collar
      return [MAT.cloth, 0, 0.06];
    };
    loftZ(mb, BODY_TORSO, 36, 65.2, 20, 22, torsoBones, col, null, [0.8, 0.7]);
    // chest core
    const cz = 55.5, q = sectionAt(BODY_TORSO, cz), cf = (q.f || 0) + q.b + 0.45;
    const P = [[0, cf + 0.6, cz + 3.2], [1.9, cf + 0.3, cz], [0, cf + 0.6, cz - 3.2], [-1.9, cf + 0.3, cz]], ctr = [0, cf + 1.4, cz];
    const ids = P.map(p => mb.vert(p, v3.norm(v3.sub(p, [0, cf - 3, cz])), MAT.crimson, B.spine, B.spine, 1, 1, 0));
    const ic = mb.vert(ctr, [0, 1, 0], MAT.crimson, B.spine, B.spine, 1, 1, 0);
    for (let i = 0; i < 4; i++) mb.tri(ids[i], ids[(i + 1) % 4], ic);
    // coat skirt: split at the front (the tabard hangs there), flaps follow the thighs
    const SK = [{ z: 24.5, a: 10.2, b: 7.6 }, { z: 36, a: 9.0, b: 6.4 }, { z: 47.5, a: 7.8, b: 5.4, f: 0.3 }];
    loftZ(mb, SK, 25, 47.5, 8, 24, (z, th) => {
      const drop = smoothstep(42, 27, z);
      if (Math.abs(th) > 2.2) return [B.pelvis, B.pelvis, 1];
      return [B.pelvis, th > 0 ? B.thighR : B.thighL, 1 - 0.6 * drop];
    }, (th, z) => [z < 26.3 ? MAT.crimsonD : MAT.cloth, z < 26.3 ? 0.4 : 0, 0.05], (th) => Math.abs(th) < 0.28);
    // pauldrons: three stacked lames over each shoulder
    for (const [sd, S] of [['R', 1], ['L', -1]]) {
      const sh = BIND['sh' + sd];
      [[[1.2, 0, 1.6], [6.6, 6.8, 4.6]], [[2.0, 0, -1.4], [6.0, 6.3, 3.6]], [[2.6, 0, -4.0], [5.2, 5.6, 3.0]]].forEach(([off, R], k) => {
        const c = v3.add(sh, [off[0] * S, off[1], off[2]]);
        ellipsoid(mb, c, R, (p) => (p[2] > 0 && k === 0 ? [B['upper' + sd], B.spine, 0.55] : [B['upper' + sd], B.spine, 0.85]),
          (th, ps) => [ps > 1.0 && Math.abs(th - S * Math.PI / 2) < 0.4 && k === 0 ? MAT.crimsonD : MAT.plate, 0, 0.6], 14, 6,
          { ps0: -0.2, ps1: Math.PI / 2, th0: S > 0 ? -0.25 : -Math.PI + 0.25 - 0.0, th1: S > 0 ? Math.PI + 0.25 : 0.25 });
      });
    }
  },
  // ---- the Obsidian Sentinel's helm and plate, cut down to a hunter's frame
  sentinel_helm(mb) {
    const c = v3.add(BIND.head, [0, 0.5, 1.0]), R = [6.5, 6.9, 8.4], ob = C3('#373845'), obS = C3('#2b2c37');
    const deform = (k) => (p, th, ps) => {
      const lo = ps < 0 ? 1 + 0.45 * Math.sin(ps) : 1, zs = ps > 0 ? 0.86 : 1.05, front = Math.max(0, Math.cos(th)) * Math.max(0, Math.cos(ps));
      return [[p[0] * lo * k, (p[1] * (ps < 0 ? 1 + 0.2 * Math.sin(ps) : 1) - 0.8 * front * front) * k, p[2] * zs * k], null];
    };
    ellipsoid(mb, c, R, [B.head, B.head, 1], (th) => [Math.abs(th) < 1.0 ? ob : obS, 0, 0.6], 20, 14, { deform: deform(1) });
    ellipsoid(mb, c, R, [B.head, B.head, 1], () => [MAT.crimson, 1, 0], 10, 2, { th0: -0.64, th1: 0.64, ps0: 0.06, ps1: 0.21, deform: deform(1.04) });
    box(mb, v3.add(c, [0, 6.9, 2.8]), 4.6, 0.6, 0.55, [1, 0, 0], [0, 1, 0], [0, 0, 1], C3('#4a4d5c'), B.head, 0, 0.8);        // brow
    box(mb, v3.add(c, [0, -0.6, 6.9]), 0.7, 5.6, 0.9, [1, 0, 0], [0, 1, 0], [0, 0, 1], MAT.gold, B.head, 0, 0.75);           // gold crest
    for (const S of [1, -1]) {
      const h = [[S * 5, 0.2, 4.2], [S * 7.5, -1, 7.8], [S * 10.2, -2.8, 12.6], [S * 12, -5.2, 18.4], [S * 12.6, -7.6, 23]].map(q => v3.add(c, q));
      tube(mb, chainSamples(h, [B.head, B.head, B.head, B.head], 9, (u) => [2.0 * (1 - u) + 0.2, 1.7 * (1 - u) + 0.2], C3('#2e2f39'), 1,
        (u) => ({ spec: 0.5, col: u > 0.8 ? C3('#4a4d5c') : C3('#2e2f39') })), () => [0, 1, 0], 8, true, true);
    }
    tube(mb, chainSamples([[0, 0.8, 61.5], [0, 1.0, 65.5]], [B.spine, B.neck], 2, () => [4.6, 4.2], C3('#17181e'), 2, () => ({ spec: 0.35 })), fwdRef, 14, false, false);  // gorget
  },
  sentinel_plate(mb) {
    const ob = C3('#2b2c37'), ob2 = C3('#373845'), obD = C3('#17181e');
    loftZ(mb, BODY_TORSO, 37, 65.2, 22, 24, torsoBones, (th, z) => {
      if ((z > 59.4 && z < 60.6) || (z > 47.4 && z < 48.8)) return [MAT.gold, 0, 0.7];
      if (z > 63) return [obD, 0, 0.3];
      if (Math.abs(th) < 1.0 && z > 48.8 && z < 59.4) return [ob2, 0, 0.65];
      if (Math.abs(th) > 2.3 && z > 49 && z < 58) return [ob2, 0, 0.5];
      return [ob, 0, 0.45];
    }, null, [1.25, 1.05]);
    // chest core: dark disc, glowing ring, crystal
    const cz = 54.6, q = sectionAt(BODY_TORSO, cz), cf = (q.f || 0) + q.b + 1.1;
    ellipsoid(mb, [0, cf - 0.3, cz], [2.9, 0.8, 2.9], [B.spine, B.spine, 1], () => [MAT.black, 0, 0.3], 12, 6);
    const ring = []; for (let i = 0; i <= 18; i++) { const a = i / 18 * TAU; ring.push({ p: [Math.cos(a) * 2.6, cf + 0.35, cz + Math.sin(a) * 2.6], r: [0.42, 0.42], bones: [B.spine, B.spine, 1], col: MAT.crimson, emit: 1, spec: 0 }); }
    tube(mb, ring, () => [0, 1, 0], 6, false, false);
    const P = [[0, cf + 0.7, cz + 1.9], [1.2, cf + 0.6, cz], [0, cf + 0.7, cz - 1.9], [-1.2, cf + 0.6, cz]], ctr = [0, cf + 1.5, cz];
    const ids = P.map(p => mb.vert(p, v3.norm(v3.sub(p, [0, cf - 3, cz])), [1, 0.78, 0.82], B.spine, B.spine, 1, 1, 0));
    const ic = mb.vert(ctr, [0, 1, 0], [1, 0.78, 0.82], B.spine, B.spine, 1, 1, 0);
    for (let i = 0; i < 4; i++) mb.tri(ids[i], ids[(i + 1) % 4], ic);
    // circuit lines out from the core
    for (const S of [1, -1]) for (const [th0, z0, th1, z1] of [[0.32, 56, 0.6, 58.6], [0.32, 53.2, 0.55, 50]]) {
      const pt = (th, z) => { const s = sectionAt(BODY_TORSO, z), a = s.a + 1.25, b = s.b + 1.05; return [S * a * Math.sin(th), (s.f || 0) + b * Math.cos(th) + 0.15, z]; };
      strip(mb, pt(th0, z0), pt(th1, z1), [S * 0.5, 0.85, 0], 0.18, 0.12, MAT.crimson, [B.spine, B.spine, 1], 1, 0);
    }
    // back vents
    for (const [i, z] of [[0, 57], [1, 54.4], [2, 51.8]].map(v => v)) {
      const s = sectionAt(BODY_TORSO, z); box(mb, [0, (s.f || 0) - s.b - 1.15, z], 1.9, 0.2, 0.5, [1, 0, 0], [0, -1, 0], [0, 0, 1], i % 2 ? MAT.crimsonD : MAT.crimson, B.spine, 1, 0);
    }
    // tassets: split lames over the hips that follow the thighs
    const SK = [{ z: 27, a: 10.6, b: 8.0 }, { z: 37, a: 9.4, b: 6.8 }, { z: 47.6, a: 8.2, b: 5.8, f: 0.3 }];
    const gaps = [0, 1.2, -1.2, 2.3, -2.3, Math.PI, -Math.PI];
    loftZ(mb, SK, 28, 47.6, 7, 36, (z, th) => {
      const drop = smoothstep(43, 29, z);
      if (Math.abs(th) > 2.3) return [B.pelvis, B.pelvis, 1];
      return [B.pelvis, th > 0 ? B.thighR : B.thighL, 1 - 0.65 * drop];
    }, (th, z) => [z < 29.6 ? MAT.gold : ob, 0, z < 29.6 ? 0.7 : 0.45], (th) => gaps.some(g => Math.abs(th - g) < 0.07));
    // pauldrons: a black joint under three obsidian lames rimmed in gold
    for (const [sd, S] of [['R', 1], ['L', -1]]) {
      const sh = BIND['sh' + sd];
      ellipsoid(mb, v3.add(sh, [S * 0.6, 0, 0.3]), [4.4, 4.4, 4.4], [B['upper' + sd], B.spine, 0.6], () => [MAT.black, 0, 0.35], 12, 8);
      [[[1.6, 0, 2.6], [8.0, 7.6, 5.0]], [[2.6, 0, -0.8], [7.2, 7.0, 4.0]], [[3.2, 0, -3.8], [6.2, 6.2, 3.2]]].forEach(([off, R], k) => {
        const c = v3.add(sh, [off[0] * S, off[1], off[2]]);
        ellipsoid(mb, c, R, (p) => (p[2] > 0 && k === 0 ? [B['upper' + sd], B.spine, 0.5] : [B['upper' + sd], B.spine, 0.85]),
          (th, ps) => [ps < 0.12 ? MAT.gold : (k === 0 && Math.abs(th - S * Math.PI / 2) < 0.3 && ps > 0.9 ? MAT.crimson : ob2), k === 0 && ps > 0.9 && Math.abs(th - S * Math.PI / 2) < 0.3 ? 1 : 0, 0.65], 14, 6,
          { ps0: 0, ps1: Math.PI / 2, th0: S > 0 ? -0.3 : -Math.PI + 0.3, th1: S > 0 ? Math.PI + 0.3 : 0.3 });
      });
    }
  },
  hunter_gauntlets(mb) {
    for (const [sd, S] of [['R', 1], ['L', -1]]) {
      const el = BIND['el' + sd], wr = BIND['wr' + sd];
      const a = v3.lerp(el, wr, 0.32);
      const s = chainSamples([a, wr], [B['fore' + sd]], 6, (u) => [3.6 - 0.9 * u, 3.4 - 0.9 * u], MAT.plate, 1,
        (u) => ({ colFn: (th) => [u < 0.08 ? MAT.crimsonD : MAT.plate, u < 0.08 ? 0.3 : 0, 0.6] }));
      s[s.length - 1].bones = [B['fore' + sd], B['hand' + sd], 0.6];
      tube(mb, s, sideRef(S), 12, false, false);
      const f = chainSamples([wr, BIND['hand' + sd]], [B['hand' + sd]], 4, (u) => [2.6 + 0.4 * Math.sin(Math.PI * u), 2.0 + 0.3 * Math.sin(Math.PI * u)], MAT.plateD, 1, () => ({ spec: 0.5 }));
      f[0].bones = [B['hand' + sd], B['fore' + sd], 0.6];
      tube(mb, f, sideRef(S), 10, false, true);
    }
  },
  hunter_greaves(mb) {
    for (const [sd, S] of [['R', 1], ['L', -1]]) {
      const hip = BIND['hip' + sd], kn = BIND['knee' + sd], an = BIND['ankle' + sd];
      // cloth over the thigh, plate cuisse on its lower half
      tube(mb, chainSamples([hip, kn], [B['thigh' + sd]], 7, (u) => [5.9 - 1.5 * u, 6.0 - 1.6 * u], MAT.cloth, 1,
        (u) => ({ colFn: () => u > 0.45 ? [MAT.plate, 0, 0.55] : [MAT.cloth, 0, 0.05] })), fwdRef, 12, false, false);
      // greave with a calf swell
      const g = chainSamples([v3.lerp(kn, an, 0.06), v3.lerp(kn, an, 0.88)], [B['shin' + sd]], 8,
        (u) => [4.3 - 1.5 * u + 0.6 * Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u), 4.2 - 1.5 * u + 0.7 * Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u)], MAT.plate, 1, () => ({ spec: 0.6 }));
      tube(mb, g, fwdRef, 12, false, false);
      // knee cop: a low plate dome on the front of the knee
      ellipsoid(mb, v3.add(kn, [0, 2.6, 0.4]), [3.9, 2.4, 3.9], [B['shin' + sd], B['thigh' + sd], 0.5],
        (th, ps) => [Math.abs(ps) < 0.25 && Math.abs(th) < 0.3 ? MAT.crimsonD : MAT.plate, 0, 0.7], 12, 8, { th0: -1.6, th1: 1.6 });
    }
  },
  hunter_boots(mb) {
    for (const [sd, S] of [['R', 1], ['L', -1]]) {
      const kn = BIND['knee' + sd], an = BIND['ankle' + sd], toe = BIND['toe' + sd];
      const shaft = chainSamples([v3.lerp(kn, an, 0.6), an], [B['shin' + sd]], 4, (u) => [3.6 - 0.6 * u, 3.6 - 0.4 * u], MAT.leather, 1,
        (u) => ({ colFn: () => u < 0.12 ? [MAT.gold, 0, 0.5] : [MAT.leather, 0, 0.15] }));
      shaft[shaft.length - 1].bones = [B['shin' + sd], B['foot' + sd], 0.6];
      tube(mb, shaft, fwdRef, 12, false, false);
      const f = chainSamples([v3.add(an, [0, -1.6, 0]), toe], [B['foot' + sd]], 6, (u) => [3.1 - 0.4 * u, 2.3 - 0.8 * u], MAT.leather, 1,
        (u) => ({ colFn: () => u > 0.7 ? [MAT.plateD, 0, 0.6] : [MAT.leather, 0, 0.15] }));
      f[0].bones = [B['foot' + sd], B['shin' + sd], 0.6];
      tube(mb, f, upRef, 12, true, true);
    }
  },
};

// ---------------------------------------------------------------- weapons, props (local space: x along the blade, grip at 0)
function bladeMesh(mb, x0, x1, w0, wTip, thick, guard, emitCol) {
  // diamond cross-section blade with a glowing fuller down the middle
  const n = 10;
  for (let k = 0; k < n; k++) {
    const ua = k / n, ub = (k + 1) / n, xa = x0 + (x1 - x0) * ua, xb = x0 + (x1 - x0) * ub;
    const wa = w0 + (wTip - w0) * Math.pow(ua, 1.6), wb = k === n - 1 ? 0 : w0 + (wTip - w0) * Math.pow(ub, 1.6);
    for (const sz of [1, -1]) {
      for (const sy of [1, -1]) {
        const nr = v3.norm([0, sy * thick, sz * 1]);
        const a = mb.vert([xa, 0, sz * thick], nr, MAT.steel, B.weapon, B.weapon, 1, 0, 0.9);
        const b = mb.vert([xb, 0, sz * thick * (k === n - 1 ? 0.2 : 1)], nr, MAT.steel, B.weapon, B.weapon, 1, 0, 0.9);
        const c = mb.vert([xb, sy * wb, 0], nr, MAT.steelD, B.weapon, B.weapon, 1, 0, 0.9);
        const d = mb.vert([xa, sy * wa, 0], nr, MAT.steelD, B.weapon, B.weapon, 1, 0, 0.9);
        mb.quad(a, b, c, d);
      }
      // fuller: an emissive strip just above the steel on both faces
      if (k < n - 1) {
        const fw = 0.9 * (1 - ua * 0.6), z = sz * (thick + 0.05);
        const a = mb.vert([xa, fw, z], [0, 0, sz], emitCol, B.weapon, B.weapon, 1, 1, 0), b = mb.vert([xb, fw, z], [0, 0, sz], emitCol, B.weapon, B.weapon, 1, 1, 0);
        const c = mb.vert([xb, -fw, z], [0, 0, sz], emitCol, B.weapon, B.weapon, 1, 1, 0), d = mb.vert([xa, -fw, z], [0, 0, sz], emitCol, B.weapon, B.weapon, 1, 1, 0);
        mb.quad(a, b, c, d);
      }
    }
  }
}
const WEAPON3D = {
  sword(mb) {
    bladeMesh(mb, 8, 100, 6.6, 1.2, 1.3, true, MAT.crimson);
    box(mb, [7, 0, 0], 1.2, 11.5, 1.6, [1, 0, 0], [0, 1, 0], [0, 0, 1], MAT.plateD, B.weapon, 0, 0.7);          // crossguard
    for (const y of [-11.5, 11.5]) box(mb, [7, y, 0], 1.6, 1.4, 1.9, [1, 0, 0], [0, 1, 0], [0, 0, 1], MAT.crimsonD, B.weapon, 0.3, 0.4);
    tube(mb, chainSamples([[-10, 0, 0], [6, 0, 0]], [B.weapon], 4, () => [1.5, 1.5], MAT.leather, 1), upRef, 8, false, false);   // grip
    ellipsoid(mb, [-11, 0, 0], [2.2, 2.2, 2.2], [B.weapon, B.weapon, 1], () => [MAT.plateD, 0, 0.7], 8, 6);                   // pommel
  },
  oathsword(mb) {                                    // straight one-handed blade, short guard, wrapped grip
    bladeMesh(mb, 5, 56, 3.8, 0.9, 1.0, true, MAT.crimson);
    box(mb, [4.5, 0, 0], 1.0, 6.8, 1.3, [1, 0, 0], [0, 1, 0], [0, 0, 1], MAT.plateD, B.weapon, 0, 0.75);           // crossguard
    for (const y of [-6.8, 6.8]) box(mb, [4.5, y, 0], 1.2, 1.0, 1.5, [1, 0, 0], [0, 1, 0], [0, 0, 1], MAT.gold, B.weapon, 0, 0.7);
    tube(mb, chainSamples([[-6.5, 0, 0], [3.8, 0, 0]], [B.weapon], 4, () => [1.3, 1.3], MAT.leather, 1), upRef, 8, false, false);
    for (const x of [-4.5, -1.5, 1.5]) tube(mb, chainSamples([[x, 0, 0], [x + 0.5, 0, 0]], [B.weapon], 1, () => [1.45, 1.45], MAT.leatherL, 1), upRef, 8, false, false);
    ellipsoid(mb, [-7.6, 0, 0], [1.8, 1.8, 1.8], [B.weapon, B.weapon, 1], () => [MAT.plateD, 0, 0.7], 8, 6);
    ellipsoid(mb, [-8.8, 0, 0], [0.7, 0.7, 0.7], [B.weapon, B.weapon, 1], () => [MAT.crimson, 1, 0], 6, 4);
  },
  spear(mb) {
    tube(mb, chainSamples([[-44, 0, 0], [108, 0, 0]], [B.weapon], 6, () => [1.25, 1.25], MAT.wood, 1, () => ({ spec: 0.2 })), upRef, 8, true, false);
    box(mb, [108, 0, 0], 2.2, 2.0, 2.0, [1, 0, 0], [0, 1, 0], [0, 0, 1], MAT.plateD, B.weapon, 0, 0.6);
    bladeMesh(mb, 110, 150, 4.2, 0.6, 1.1, false, MAT.crimson);
    for (const x of [-20, 30]) tube(mb, chainSamples([[x, 0, 0], [x + 3, 0, 0]], [B.weapon], 1, () => [1.6, 1.6], MAT.gold, 1, () => ({ spec: 0.6 })), upRef, 8, false, false);
  },
  flaskHand(mb) {                                    // the flask in his left fist while he drinks
    const bo = B.offhand;
    ellipsoid(mb, [2.2, 0, 0], [2.0, 2.0, 2.9], [bo, bo, 1], () => [MAT.crimson, 0.75, 0.9], 10, 8);
    tube(mb, chainSamples([[2.2, 0, 2.6], [2.2, 0, 4.6]], [bo], 1, () => [0.9, 0.9], MAT.wood, 1), fwdRef, 8, false, true);
  },
  pistol(mb) {                                       // obsidian flintlock: black steel, crimson fuller + muzzle, dark-gold trim
    const bo = B.offhand, X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1], k = 1.3;
    const P = (x, y, z) => [x * k, y * k, z * k];
    const ob = MAT.steel, obD = MAT.steelD, gripC = C3('#141219'), trim = C3('#8a6a30');
    // octagonal barrel, slightly flared at the muzzle
    tube(mb, chainSamples([P(0.5, 0, 1.4), P(13.5, 0, 1.4), P(15, 0, 1.4)], [bo, bo], 4,
      (u) => { const r = (u > 0.9 ? 1.25 : 1.05) * k; return [r, r]; }, ob, 1, () => ({ spec: 1.0 })), upRef, 8, false, false);
    tube(mb, chainSamples([P(14.6, 0, 1.4), P(15.05, 0, 1.4)], [bo], 1, () => [1.0 * k, 1.0 * k], MAT.crimson, 1, () => ({ emit: 1 })), upRef, 8, false, true);  // glowing bore
    box(mb, P(7.5, 0, 2.55), 6.0 * k, 0.16 * k, 0.12 * k, X, Y, Z, MAT.crimson, bo, 1, 0);                              // fuller along the top
    for (const x of [4.5, 13.2]) box(mb, P(x, 0, 1.4), 0.45 * k, 1.2 * k, 1.2 * k, X, Y, Z, trim, bo, 0, 0.8);          // bands
    box(mb, P(2.6, 0, 0.5), 3.2 * k, 1.0 * k, 1.05 * k, X, Y, Z, obD, bo, 0, 0.6);                                       // lock body
    box(mb, P(2.6, 1.02, 0.5), 2.2 * k, 0.05 * k, 0.6 * k, X, Y, Z, MAT.plate, bo, 0, 0.9);                              // lock plates (both sides)
    box(mb, P(2.6, -1.02, 0.5), 2.2 * k, 0.05 * k, 0.6 * k, X, Y, Z, MAT.plate, bo, 0, 0.9);
    box(mb, P(-0.3, 0, -1.7), 1.45 * k, 0.95 * k, 2.9 * k, X, Y, v3.norm([0.3, 0, 1]), gripC, bo, 0, 0.2);             // grip
    for (const zz of [-0.6, -1.8, -3.0]) box(mb, P(-0.3 - 0.3 * (zz + 0.6) * -0.3, 0, zz), 1.5 * k, 1.0 * k, 0.12 * k, X, Y, Z, obD, bo, 0, 0.4);  // wraps
    box(mb, P(-1.15, 0, -4.4), 1.35 * k, 1.1 * k, 0.65 * k, X, Y, Z, obD, bo, 0, 0.8);                                   // pommel
    box(mb, P(-1.15, 0, -4.4), 0.5 * k, 1.12 * k, 0.3 * k, X, Y, Z, MAT.crimson, bo, 1, 0);                              // pommel gem
    box(mb, P(1.0, 0, 2.6), 1.0 * k, 0.45 * k, 1.0 * k, X, Y, v3.norm([-0.4, 0, 1]), MAT.plate, bo, 0, 0.9);           // hammer
    box(mb, P(2.0, 0, -1.0), 1.0 * k, 0.3 * k, 0.75 * k, X, Y, Z, trim, bo, 0, 0.7);                                     // trigger guard
  },


};
function propsMesh(mb, which) {
  if (which === 'holster' || which === 'holsterEmpty') {
    const c = [-8.6, -0.8, 37.5];
    box(mb, c, 1.4, 2.4, 4.0, [1, 0, 0], [0, 1, 0], [0, 0, 1], MAT.leather, B.pelvis, 0, 0.15);
    box(mb, v3.add(c, [0, 0, 3.6]), 1.5, 2.5, 0.5, [1, 0, 0], [0, 1, 0], [0, 0, 1], MAT.leatherL, B.pelvis, 0, 0.2);
    if (which === 'holster') {                                                       // pistol grip sticking out
      box(mb, v3.add(c, [0, -0.6, 6.0]), 1.15, 1.35, 3.0, [1, 0, 0], v3.norm([0, 1, 0.35]), v3.norm([0, -0.35, 1]), C3('#141219'), B.pelvis, 0, 0.2);
      box(mb, v3.add(c, [0, -1.6, 8.9]), 1.3, 1.1, 0.6, [1, 0, 0], v3.norm([0, 1, 0.35]), v3.norm([0, -0.35, 1]), MAT.crimson, B.pelvis, 1, 0);
      box(mb, v3.add(c, [0, 0.9, 4.8]), 0.8, 1.2, 0.8, [1, 0, 0], [0, 1, 0], [0, 0, 1], MAT.steelD, B.pelvis, 0, 0.7);
    }
  } else {
    const c = [8.2, 2.0, 40.5], full = which === 'flask';
    ellipsoid(mb, c, [1.9, 1.9, 2.8], [B.pelvis, B.pelvis, 1], () => [full ? MAT.crimson : MAT.glass, full ? 0.75 : 0, 0.9], 10, 8);
    tube(mb, chainSamples([v3.add(c, [0, 0, 2.5]), v3.add(c, [0, 0, 4.4])], [B.pelvis], 1, () => [0.9, 0.9], MAT.wood, 1), fwdRef, 8, false, true);
  }
}

// ---------------------------------------------------------------- cloth mesh (positions refreshed every frame)
function clothMeshFor(cp) {
  const mb = new MeshBuilder(), C = cp.cols, R = cp.rows, cl = cp.cloth, out = hexRGB(cl.outer), hem = hexRGB(cl.hem.startsWith('#') ? cl.hem : '#8A2432');
  for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) {
    const bottom = j === R - 1, col = bottom ? hem : v3.lerp(out, hexRGB(cl.outerL), 0.25 * (1 - j / R));
    mb.vert([0, 0, 0], [0, 1, 0], col, B.world, B.world, 1, bottom ? 0.4 : 0, 0.04);
  }
  for (let j = 0; j < R - 1; j++) for (let i = 0; i < C - 1; i++) { const k = j * C + i; mb.quad(k, k + 1, k + C + 1, k + C); }
  return mb;
}

/** The whole character on the GL side: meshes per gear piece, bone matrices, per-frame render. */
class CharGL {
  constructor(canvas) {
    this.g = new GLChar(canvas);
    const mk = (fn) => { const mb = new MeshBuilder(); fn(mb); return this.g.upload(mb); };
    this.base = mk(buildBase);
    this.gear = {}; for (const id in GEAR3D) this.gear[id] = mk(GEAR3D[id]);
    this.weapons = {}; for (const id in WEAPON3D) this.weapons[id] = mk(WEAPON3D[id]);
    this.props = {}; for (const w of ['holster', 'holsterEmpty', 'flask', 'flaskEmpty']) this.props[w] = mk((mb) => propsMesh(mb, w));
    this.cloth = new Map();
    // bind frames -> inverses
    this.bind = []; this.bindInv = []; this.cur = []; this.skin = new Float32Array(GL_BONES * 16);
    for (let i = 0; i < GL_BONES; i++) { this.bind.push(new Float32Array(16)); this.bindInv.push(new Float32Array(16)); this.cur.push(new Float32Array(16)); }
    boneFrames(BIND, this.bind);
    for (let i = 0; i < GL_BONES; i++) {
      if (i <= B.footL) mat4InvRigid(this.bindInv[i], this.bind[i]);
      else { const m = this.bindInv[i]; m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; }
    }
    this._tmp = new Float32Array(16);
  }
  clothMesh(cp) {
    let m = this.cloth.get(cp);
    if (!m) { m = this.g.upload(clothMeshFor(cp), true); this.cloth.set(cp, m); }
    const d = m.data, R = cp.rows * cp.cols, C = cp.cols, rows = cp.rows;
    for (let k = 0; k < R; k++) {                                         // world -> char frame, normals from the grid
      d[k * GL_STRIDE] = cp._cs[k * 3]; d[k * GL_STRIDE + 1] = cp._cs[k * 3 + 1]; d[k * GL_STRIDE + 2] = cp._cs[k * 3 + 2];
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < C; i++) {
      const k = j * C + i, P = (q) => [d[q * GL_STRIDE], d[q * GL_STRIDE + 1], d[q * GL_STRIDE + 2]];
      const a = P(j * C + Math.min(C - 1, i + 1)), b = P(j * C + Math.max(0, i - 1));
      const c = P(Math.min(rows - 1, j + 1) * C + i), e = P(Math.max(0, j - 1) * C + i);
      const n = v3.norm(v3.cross(v3.sub(a, b), v3.sub(c, e)));
      d[k * GL_STRIDE + 3] = n[0]; d[k * GL_STRIDE + 4] = n[1]; d[k * GL_STRIDE + 5] = n[2];
    }
    this.g.updateDynamic(m);
    return m;
  }
  /** Render player p into the GL canvas (layer box in points, s = pixels per point). */
  render(p, L, s) {
    const g = this.g, gl = g.gl, R = p.rig, J = R.j;
    g.begin(Math.round(L.w * s), Math.round(L.h * s), [L.ox, L.oy, L.w, L.h]);
    gl.uniform2f(g.u.yaw, Math.cos(R.yaw), Math.sin(R.yaw));
    boneFrames(J, this.cur, R.headYaw);
    // weapon: grip at the right hand, x along the blade
    const G = R.grip, Bd = R.blade, wsc = p.sword_scale || 1;
    // keep the flat of the blade turned toward the camera so it always reads at full width
    const cyw = Math.cos(R.yaw), syw = Math.sin(R.yaw), Vc = [cyw, -syw, K];
    let ref = v3.cross([Bd.s, Bd.f, Bd.z], Vc); if (v3.len(ref) < 1e-3) ref = [0, 0, 1];
    frameFrom(this.cur[B.weapon], [G.s, G.f, G.z], [Bd.s, Bd.f, Bd.z], ref);
    for (let k = 0; k < 12; k++) if (k % 4 !== 3) this.cur[B.weapon][k] *= wsc;
    // off-hand item: at the left fist, pointing along the forearm
    { const fl = Math.hypot(J.wrL.s - J.elL.s, J.wrL.f - J.elL.f, J.wrL.z - J.elL.z) || 1, tp = Math.tan(p.gunPitch || 0);
      frameFrom(this.cur[B.offhand], [J.handL.s, J.handL.f, J.handL.z],
        [(J.wrL.s - J.elL.s) / fl, (J.wrL.f - J.elL.f) / fl, (J.wrL.z - J.elL.z) / fl + tp], [0, 0, 1]); }
    const I = this.cur[B.world]; I.fill(0); I[0] = I[5] = I[10] = I[15] = 1;
    for (let i = 0; i < GL_BONES; i++) {
      mat4Mul(this._tmp, this.cur[i], this.bindInv[i]);
      this.skin.set(this._tmp, i * 16);
    }
    gl.uniformMatrix4fv(g.u.bones, false, this.skin);
    const fa = p.glowAlpha > 0.01 ? p.glowAlpha : 0, fc = hexRGB(p.glowColor && p.glowColor[0] === '#' ? p.glowColor : '#ff3048');
    gl.uniform4f(g.u.flash, fc[0], fc[1], fc[2], fa * 0.4);
    gl.uniform3f(g.u.back, 0.05, 0.04, 0.06); gl.uniform1f(g.u.backMix, 0.6); gl.uniform1f(g.u.emitGain, 1.5);
    g.draw(this.base);
    for (const slot of GEAR_SLOTS) { const id = p.gear[slot]; if (id && this.gear[id]) g.draw(this.gear[id]); }
    const drawn = p.gunDrawn;
    const drinking = p.kind === 'flask' && (p.state === S_WINDUP || p.state === S_ACTIVE || p.state === S_RECOVERY);
    if (p.hasPistol) g.draw(this.props[drawn ? 'holsterEmpty' : 'holster']);
    if (!drinking) g.draw(this.props[p.flasks > 0 ? 'flask' : 'flaskEmpty']);
    if (drawn) g.draw(this.weapons.pistol);
    if (drinking) g.draw(this.weapons.flaskHand);
    gl.uniform1f(g.u.emitGain, 1.1 + 1.6 * (p.swordGlow || 0));
    const wm = this.weapons[p.weapon.tex]; if (wm) g.draw(wm);
    // cloth: back faces show the lining colour
    for (const name in p.cloths) {
      const cp = p.cloths[name]; if (!cp.live) continue;
      const lin = hexRGB(cp.cloth.lining); gl.uniform3f(g.u.back, lin[0], lin[1], lin[2]); gl.uniform1f(g.u.backMix, 0.85);
      gl.uniform1f(g.u.emitGain, 1.4);
      g.draw(this.clothMesh(cp));
    }
  }
}
