// ============================================================ BOSS 3D (the Obsidian Sentinel's meshes + WebGL renderer)
// Modelled once in a bind pose in the char frame, skinned two bones per vertex like the player.
// Obsidian plate with gold trim and crimson circuit lines, a horned helm with a visor slit, a glowing
// chest core, four floating shoulder plates and a long halberd. Same shader as the player.

const BB = { pelvis: 0, spine: 1, neck: 2, head: 3, upperR: 4, foreR: 5, handR: 6, upperL: 7, foreL: 8, handL: 9,
  thighR: 10, shinR: 11, footR: 12, thighL: 13, shinL: 14, footL: 15, halberd: 16, plate: 17, world: 18 };
const BBIND = {
  pelvis: [0, 0, 58], waist: [0, 1, 76], neck: [0, 1, 131], head: [0, 1, 145],
  shR: [38, 0, 122], elR: [41, -1, 92.2], wrR: [43, 1, 64.3], handR: [43.5, 1.5, 56.3],
  shL: [-38, 0, 122], elL: [-41, -1, 92.2], wrL: [-43, 1, 64.3], handL: [-43.5, 1.5, 56.3],
  hipR: [14, 0, 58], kneeR: [14, 1.5, 31.05], ankleR: [14, 0, 4.1], toeR: [15, 15, 2],
  hipL: [-14, 0, 58], kneeL: [-14, 1.5, 31.05], ankleL: [-14, 0, 4.1], toeL: [-15, 15, 2],
};
/** Bone frames from boss joints (bind arrays or rig joints), the torso basis and the head axes. */
function bossBoneFrames(J, Rm, HF, HU, out) {
  const g = (n) => { const q = J[n]; return Array.isArray(q) ? q : [q.s, q.f, q.z]; };
  const F = (i, o, a, ref) => frameFrom(out[i], g(o), v3.sub(g(a), g(o)), ref);
  const tf = [Rm[3], Rm[4], Rm[5]], tu = [Rm[6], Rm[7], Rm[8]];
  F(BB.pelvis, 'pelvis', 'waist', FWD);
  frameFrom(out[BB.spine], g('waist'), tu, tf);
  frameFrom(out[BB.neck], g('neck'), HU, HF); frameFrom(out[BB.head], g('head'), HU, HF);
  for (const [sd, S] of [['R', 1], ['L', -1]]) {
    const side = [Rm[0] * S, Rm[1] * S, Rm[2] * S];
    F(BB['upper' + sd], 'sh' + sd, 'el' + sd, side); F(BB['fore' + sd], 'el' + sd, 'wr' + sd, side); F(BB['hand' + sd], 'wr' + sd, 'hand' + sd, side);
    F(BB['thigh' + sd], 'hip' + sd, 'knee' + sd, FWD); F(BB['shin' + sd], 'knee' + sd, 'ankle' + sd, FWD); F(BB['foot' + sd], 'ankle' + sd, 'toe' + sd, UP);
  }
  return out;
}

// ---------------------------------------------------------------- palette
const BM = {
  ob: C3('#2b2c37'), ob2: C3('#373845'), obD: C3('#17181e'), jnt: C3('#0b0b0f'), gold: C3('#a8823c'), goldL: C3('#c9a24a'),
  crim: C3('#ff2a45'), line: C3('#d42c44'), vent: C3('#c22a40'), horn: C3('#2e2f39'), edge: C3('#a0a6b6'), steel: C3('#3d404c'),
  shaft: C3('#25262e'), gem: [1, 0.78, 0.82],
};

/** Convex polygon (x, y) extruded from z0 to z1, optional axis map. Outward normals. */
function prism(mb, pts, z0, z1, col, bone, emit, spec, map) {
  map = map || ((x, y, z) => [x, y, z]);
  const n = pts.length; let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const ccw = area > 0;
  const top = pts.map(p => mb.vert(map(p[0], p[1], z1), map(0, 0, 1), col, bone, bone, 1, emit, spec));
  const bot = pts.map(p => mb.vert(map(p[0], p[1], z0), map(0, 0, -1), col, bone, bone, 1, emit, spec));
  for (let i = 1; i < n - 1; i++) { mb.tri(top[0], top[i], top[i + 1]); mb.tri(bot[0], bot[i + 1], bot[i]); }
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nr = ccw ? map(dy / l, -dx / l, 0) : map(-dy / l, dx / l, 0);
    const q = [mb.vert(map(a[0], a[1], z0), nr, col, bone, bone, 1, emit, spec), mb.vert(map(b[0], b[1], z0), nr, col, bone, bone, 1, emit, spec),
      mb.vert(map(b[0], b[1], z1), nr, col, bone, bone, 1, emit, spec), mb.vert(map(a[0], a[1], z1), nr, col, bone, bone, 1, emit, spec)];
    mb.quad(q[0], q[1], q[2], q[3]);
  }
}
/** Thin strip (emissive line, trim) between two points, lying on a surface with normal nr. */
function strip(mb, a, b, nr, w, h, col, bones, emit, spec) {
  const ax = v3.norm(v3.sub(b, a)), az = v3.norm(v3.cross(ax, nr)), ay = v3.cross(az, ax), c = v3.lerp(a, b, 0.5);
  const hl = v3.len(v3.sub(b, a)) / 2 + w * 0.5;
  // top face + the two long sides are enough (it sits on the surface)
  const corners = (n, o, u, v) => {
    const ids = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => {
      const p = v3.add(o, v3.add(v3.mul(u[0], i * u[1]), v3.mul(v[0], j * v[1])));
      return mb.vert(p, n, col, bones[0], bones[1], bones[2], emit, spec);
    });
    mb.quad(ids[0], ids[1], ids[2], ids[3]);
  };
  corners(ay, v3.add(c, v3.mul(ay, h)), [ax, hl], [az, w]);
  corners(az, v3.add(c, v3.add(v3.mul(az, w), v3.mul(ay, h * 0.5))), [ax, hl], [ay, h * 0.5]);
  corners(v3.mul(az, -1), v3.add(c, v3.add(v3.mul(az, -w), v3.mul(ay, h * 0.5))), [ax, hl], [ay, h * 0.5]);
}

// ---------------------------------------------------------------- body
const BOSS_TORSO = [
  { z: 60, a: 21, b: 15 }, { z: 68, a: 20, b: 14, f: 1 }, { z: 78, a: 22.5, b: 15, f: 2 }, { z: 92, a: 29, b: 19, f: 3 },
  { z: 106, a: 34, b: 22, f: 4 }, { z: 117, a: 37, b: 20, f: 3 }, { z: 125, a: 31, b: 16, f: 2 }, { z: 132, a: 14, b: 11, f: 2 },
];
function bossTorsoBones(z) {
  if (z < 70) return [BB.pelvis, BB.pelvis, 1];
  if (z < 84) { const w = smoothstep(70, 84, z); return [BB.spine, BB.pelvis, w]; }
  if (z > 128) return [BB.spine, BB.neck, 0.6];
  return [BB.spine, BB.spine, 1];
}
/** A point on the torso surface (theta 0 = front, + = his right), lifted along the normal. */
function bossSurf(th, z, lift) {
  const q = sectionAt(BOSS_TORSO, z), s = Math.sin(th), c = Math.cos(th);
  const n = v3.norm([s / q.a, c / q.b, 0]);
  return { p: v3.add([q.a * s, (q.f || 0) + q.b * c, z], v3.mul(n, lift || 0)), n };
}
function bossLine(mb, pts, w, col, emit) {             // a polyline of (theta, z) drawn as glowing strips on the armour
  for (let i = 0; i < pts.length - 1; i++) {
    const A = bossSurf(pts[i][0], pts[i][1], 0.2), Bq = bossSurf(pts[i + 1][0], pts[i + 1][1], 0.2);
    strip(mb, A.p, Bq.p, v3.norm(v3.add(A.n, Bq.n)), w, 0.5, col, bossTorsoBones((pts[i][1] + pts[i + 1][1]) / 2), emit, 0.2);
  }
}
function buildBossBody(mb) {
  // torso: front plastron, dark flanks, gold trim along the shoulders and the belt
  loftZ(mb, BOSS_TORSO, 60, 132, 30, 32, bossTorsoBones, (th, z) => {
    if (z > 123 && z < 125.6 && Math.abs(th) < 2.2) return [BM.gold, 0, 0.7];
    if (z > 76.5 && z < 78.4) return [BM.gold, 0, 0.7];
    if (Math.abs(th) < 0.95 && z > 79 && z < 123) return [BM.ob2, 0, 0.55];
    if (Math.abs(th) > 2.25) return [BM.ob, 0, 0.45];
    return [BM.obD, 0, 0.3];
  });
  // circuit lines from the core ring out across the chest (both sides)
  for (const S of [1, -1]) {
    bossLine(mb, [[-0.42 * S, 109], [-0.74 * S, 116], [-0.74 * S, 122]], 0.55, BM.line, 1);
    bossLine(mb, [[-0.42 * S, 99], [-0.68 * S, 90], [-0.68 * S, 81]], 0.55, BM.line, 1);
    bossLine(mb, [[-1.25 * S, 84], [-1.25 * S, 118]], 0.45, BM.line, 0.8);
  }
  // back: two dark ports with chevrons, a column of glowing vents
  for (const S of [1, -1]) {
    const c = bossSurf(Math.PI - 0.42 * S, 112, -1.2);
    ellipsoid(mb, c.p, [6.5, 2.6, 6.5], [BB.spine, BB.spine, 1], () => [BM.jnt, 0, 0.2], 12, 6);
    bossLine(mb, [[Math.PI - 0.66 * S, 117], [Math.PI - 0.42 * S, 123], [Math.PI - 0.18 * S, 117]], 0.5, BM.line, 1);
  }
  [100, 91, 82, 73].forEach((z, i) => {
    const q = bossSurf(Math.PI, z, 0.3);
    box(mb, q.p, 6.5, 0.6, 1.9, [1, 0, 0], q.n, [0, 0, 1], i % 2 ? BM.vent : BM.crim, BB.spine, 1, 0);
  });
  // belt and the tassets (split skirt; front and side lames follow the thighs)
  loftZ(mb, [{ z: 63, a: 23.6, b: 16.6 }, { z: 71, a: 22.8, b: 16 }], 63, 71, 3, 32, () => [BB.pelvis, BB.pelvis, 1],
    (th, z) => (Math.abs(th) < 0.22 ? [BM.goldL, 0, 0.8] : [BM.obD, 0, 0.3]));
  const gaps = [0, 1.15, -1.15, 2.25, -2.25, Math.PI, -Math.PI];
  loftZ(mb, [{ z: 33, a: 27, b: 22 }, { z: 48, a: 25, b: 19 }, { z: 64, a: 22.6, b: 15.6 }], 33, 64, 8, 42, (z, th) => {
    const drop = smoothstep(60, 36, z);
    if (Math.abs(th) > 2.25) return [BB.pelvis, BB.pelvis, 1];
    return [BB.pelvis, th > 0 ? BB.thighR : BB.thighL, 1 - 0.7 * drop];
  }, (th, z) => (z < 35.5 ? [BM.gold, 0, 0.7] : [BM.ob, 0, 0.45]), (th) => gaps.some(g => Math.abs(th - g) < 0.06));
  // gorget
  tube(mb, chainSamples([[0, 1, 125], [0, 1, 131], [0, 1, 139]], [BB.spine, BB.neck], 4, (u) => [11 - 2 * u, 9.5 - 1.5 * u], BM.obD, 3,
    () => ({ spec: 0.3 })), fwdRef, 14, false, false);
  // ---- helm: narrowing to a chin point, flat crown, a visor slit, brow, crest and two swept horns
  const hc = [0, 3.5, 149], HR = [12.5, 13, 16];
  const helmDeform = (k) => (p, th, ps) => {
    const lo = ps < 0 ? 1 + 0.5 * Math.sin(ps) : 1, zs = ps > 0 ? 0.84 : 1.05;
    const front = Math.max(0, Math.cos(th)) * Math.max(0, Math.cos(ps));
    return [[p[0] * lo * k, (p[1] * (ps < 0 ? 1 + 0.2 * Math.sin(ps) : 1) - 1.6 * front * front) * k, p[2] * zs * k], null];
  };
  ellipsoid(mb, hc, HR, [BB.head, BB.head, 1], (th, ps) => [Math.abs(th) < 1.0 ? BM.ob2 : BM.ob, 0, 0.6], 22, 14, { deform: helmDeform(1) });
  ellipsoid(mb, hc, HR, [BB.head, BB.head, 1], () => [BM.crim, 1, 0], 12, 2, { th0: -0.66, th1: 0.66, ps0: 0.07, ps1: 0.22, deform: helmDeform(1.035) });
  box(mb, [0, 14.4, 154.6], 8.5, 1.1, 1.1, [1, 0, 0], [0, 1, 0], [0, 0, 1], C3('#4a4d5c'), BB.head, 0, 0.8);          // brow
  box(mb, [0, 2.5, 161.6], 1.3, 11, 1.8, [1, 0, 0], [0, 1, 0], [0, 0, 1], BM.steel, BB.head, 0, 0.8);                 // crest
  for (const S of [1, -1]) {
    const horn = [[S * 9.5, 1, 157], [S * 14.5, -1.5, 164], [S * 20, -5, 174], [S * 23.5, -10, 186], [S * 25, -15, 197]];
    tube(mb, chainSamples(horn, [BB.head, BB.head, BB.head, BB.head], 10, (u) => [3.8 * (1 - u) + 0.3, 3.2 * (1 - u) + 0.3], BM.horn, 1,
      (u) => ({ spec: 0.5, col: u > 0.8 ? BM.steel : BM.horn })), () => [0, 1, 0], 9, true, true);
  }
  // ---- arms
  for (const [sd, S] of [['R', 1], ['L', -1]]) {
    const sh = BBIND['sh' + sd], el = BBIND['el' + sd], wr = BBIND['wr' + sd], hd = BBIND['hand' + sd];
    ellipsoid(mb, v3.add(sh, [S * 2, 0, 1]), [13.5, 13, 13], [BB['upper' + sd], BB.spine, 0.6], () => [BM.jnt, 0, 0.35], 16, 10);
    const arm = chainSamples([sh, el, wr], [BB['upper' + sd], BB['fore' + sd]], 16,
      (u, i, t) => i === 0 ? [9.5 - 1.6 * t, 9.5 - 1.6 * t] : [8 + 2.4 * Math.sin(Math.PI * Math.min(1, t * 1.3)) * (1 - 0.3 * t), 7.8 + 2.2 * Math.sin(Math.PI * Math.min(1, t * 1.3)) * (1 - 0.3 * t)],
      BM.obD, 4, (u, i) => ({ col: i === 0 ? BM.obD : BM.ob2, spec: i === 0 ? 0.3 : 0.55 }));
    tube(mb, arm, sideRef(S), 14, true, false);
    ellipsoid(mb, v3.add(el, [S * 1.5, -3.5, 0]), [7, 6, 7.5], [BB['upper' + sd], BB['fore' + sd], 0.5], () => [BM.ob2, 0, 0.6], 12, 8);
    const fd = v3.norm(v3.sub(wr, el));
    tube(mb, chainSamples([v3.sub(wr, v3.mul(fd, 4)), v3.sub(wr, v3.mul(fd, 1.5))], [BB['fore' + sd]], 1, () => [9.4, 9.2], BM.gold, 1, () => ({ spec: 0.7 })), sideRef(S), 14, false, false);
    ellipsoid(mb, v3.add(wr, v3.mul(fd, 4.6)), [7.2, 7.8, 7.6], [BB['hand' + sd], BB['fore' + sd], 0.85], (th, ps) => [ps < -0.2 ? BM.obD : BM.ob, 0, 0.5], 12, 9);
    void hd;
  }
  // ---- legs
  for (const [sd, S] of [['R', 1], ['L', -1]]) {
    const hip = BBIND['hip' + sd], kn = BBIND['knee' + sd], an = BBIND['ankle' + sd], toe = BBIND['toe' + sd];
    const leg = chainSamples([hip, kn, an], [BB['thigh' + sd], BB['shin' + sd]], 18,
      (u, i, t) => i === 0 ? [12.5 - 2.5 * t, 13 - 3 * t] : [9.2 + 1.6 * Math.sin(Math.PI * Math.min(1, t * 1.5)) * (1 - t) - 1.6 * t, 9.4 + 1.8 * Math.sin(Math.PI * Math.min(1, t * 1.5)) * (1 - t) - 1.6 * t],
      BM.obD, 4, (u, i) => ({ col: i === 0 ? BM.obD : BM.ob2, spec: i === 0 ? 0.3 : 0.5 }));
    tube(mb, leg, fwdRef, 14, true, false);
    ellipsoid(mb, v3.add(kn, [0, 6.8, 0.5]), [9, 5, 9], [BB['thigh' + sd], BB['shin' + sd], 0.5], (th, ps) => {
      const c = Math.cos(ps) * Math.cos(th);
      return c > 0.22 && c < 0.4 ? [BM.line, 0.9, 0.2] : [BM.ob2, 0, 0.65];
    }, 14, 10);
    const ax = v3.norm(v3.sub(toe, an)), c = v3.add(v3.lerp(an, toe, 0.42), [0, 0, 1.5]);
    box(mb, c, 11.5, 8.5, 4.6, ax, [1, 0, 0], v3.norm(v3.cross([1, 0, 0], ax)), BM.ob, BB['foot' + sd], 0, 0.5);
    box(mb, v3.add(c, v3.mul(ax, 11.6)), 0.8, 8.6, 3.6, ax, [1, 0, 0], v3.norm(v3.cross([1, 0, 0], ax)), BM.gold, BB['foot' + sd], 0, 0.7);
    tube(mb, chainSamples([v3.add(an, [0, 0, 8]), an], [BB['shin' + sd]], 1, () => [8.4, 8.6], BM.jnt, 1), fwdRef, 12, false, false);
  }
}
/** Chest core: recessed black disc, glowing ring, crystal. Its own mesh so it can pulse. */
function buildBossCore(mb) {
  const cz = 104, f0 = 25.6, bo = [BB.spine, BB.spine, 1];
  ellipsoid(mb, [0, f0 - 0.6, cz], [11.5, 2.6, 11.5], bo, () => [BM.jnt, 0, 0.3], 16, 8);
  const ring = [];
  for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU; ring.push({ p: [Math.cos(a) * 10, f0 + 1.6, cz + Math.sin(a) * 10], r: [1.5, 1.5], bones: bo, col: BM.crim, emit: 1, spec: 0 }); }
  tube(mb, ring, () => [0, 1, 0], 8, false, false);
  const top = [0, f0 + 2, cz + 7.5], bot = [0, f0 + 2, cz - 7.5], lt = [-4.8, f0 + 2, cz], rt = [4.8, f0 + 2, cz], fr = [0, f0 + 5.5, cz], bk = [0, f0, cz];
  const tri = (a, b, c, col) => { const n = v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a))); const i = [a, b, c].map(p => mb.vert(p, n, col, bo[0], bo[1], 1, 1, 0)); mb.tri(i[0], i[1], i[2]); };
  for (const [a, b] of [[top, rt], [rt, bot], [bot, lt], [lt, top]]) { tri(a, b, fr, BM.gem); tri(b, a, bk, BM.crim); }
}
/** Halberd in its own frame: x along the shaft (butt 0 -> spear tip 240), y = the axe edge side, z = flat. */
function buildHalberd(mb) {
  const bo = BB.halberd, one = [bo, bo];
  tube(mb, chainSamples([[0, 0, 0], [11, 0, 0]], one, 3, (u) => [0.4 + 3 * u, 0.4 + 3 * u], BM.steel, 1, () => ({ spec: 0.8 })), upRef, 8, true, false);
  tube(mb, chainSamples([[10, 0, 0], [206, 0, 0]], one, 6, () => [2.8, 2.8], BM.shaft, 1, () => ({ spec: 0.35 })), upRef, 10, false, false);
  for (const x of [42, 65, 157]) tube(mb, chainSamples([[x, 0, 0], [x + 4.2, 0, 0]], one, 1, () => [3.5, 3.5], BM.gold, 1, () => ({ spec: 0.8 })), upRef, 10, false, false);
  for (const z of [2.75, -2.75]) box(mb, [111, 0, z], 45, 0.55, 0.12, [1, 0, 0], [0, 1, 0], [0, 0, 1], BM.line, bo, 1, 0);
  box(mb, [184, 0, 0], 14, 3.8, 3.6, [1, 0, 0], [0, 1, 0], [0, 0, 1], BM.steel, bo, 0, 0.7);                         // socket
  prism(mb, [[167, 2.5], [184, 28], [215, 31], [232, 16], [219, 2.5]], -1.6, 1.6, C3('#2c2e38'), bo, 0, 0.35);                // axe blade
  const edge = [[184, 28], [215, 31], [232, 16]], glow = [[187, 23.5], [213, 26], [226, 15]];
  for (let i = 0; i < 2; i++) {
    strip(mb, [edge[i][0], edge[i][1], 0], [edge[i + 1][0], edge[i + 1][1], 0], [0, 0, 1], 1.9, 0.6, BM.edge, [bo, bo, 1], 0, 1);
    for (const z of [1.75, -1.75]) strip(mb, [glow[i][0], glow[i][1], z], [glow[i + 1][0], glow[i + 1][1], z], [0, 0, Math.sign(z)], 0.7, 0.15, BM.crim, [bo, bo, 1], 1, 0);
  }
  prism(mb, [[175, -2.5], [186, -20], [198, -3.8]], -1.4, 1.4, C3('#30323c'), bo, 0, 0.7);                               // back hook
  prism(mb, [[205, 5.5], [240, 0], [205, -5.5]], -1.5, 1.5, BM.steel, bo, 0, 0.45);                                      // spear point (cross)
  prism(mb, [[205, 5.5], [240, 0], [205, -5.5]], -1.5, 1.5, BM.steel, bo, 0, 0.9, (x, y, z) => [x, z, y]);
}
/** One floating plate in its own frame: x = outward, y = up, z = along his side. A curved shell. */
function buildBossPlate(mb) {
  const bo = [BB.plate, BB.plate, 1];
  ellipsoid(mb, [-9, 0, 0], [10, 16, 26], bo, (th, ps) => {
    const dth = th - Math.PI / 2;
    if (Math.abs(dth) > 0.84 || Math.abs(ps) > 0.8) return [BM.gold, 0, 0.75];
    if (Math.abs(dth + 0.12) < 0.07 && Math.abs(ps) < 0.62) return [BM.crim, 1, 0];
    return [BM.ob2, 0, 0.65];
  }, 14, 12, { th0: Math.PI / 2 - 1, th1: Math.PI / 2 + 1, ps0: -0.92, ps1: 0.92,
    deform: (p) => [[p[0], p[1], p[2] * (1 + 0.3 * clamp(p[1] / 13.5, -1, 1))], null] });
}

class BossGL {
  constructor(canvas) {
    this.g = new GLChar(canvas);
    const mk = (fn) => { const mb = new MeshBuilder(); fn(mb); return this.g.upload(mb); };
    this.body = mk(buildBossBody); this.coreM = mk(buildBossCore); this.halM = mk(buildHalberd); this.plateM = mk(buildBossPlate);
    this.bind = []; this.bindInv = []; this.cur = []; this.skin = new Float32Array(GL_BONES * 16); this._tmp = new Float32Array(16);
    for (let i = 0; i < GL_BONES; i++) { this.bind.push(new Float32Array(16)); this.bindInv.push(new Float32Array(16)); this.cur.push(new Float32Array(16)); }
    bossBoneFrames(BBIND, [1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 1, 0], [0, 0, 1], this.bind);
    for (let i = 0; i < GL_BONES; i++) {
      if (i <= BB.footL) mat4InvRigid(this.bindInv[i], this.bind[i]);
      else { const m = this.bindInv[i]; m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; }
    }
    this.rect = { x: 0, y: 0, w: 0, h: 0 };
  }
  setBone(i) { mat4Mul(this._tmp, this.cur[i], this.bindInv[i]); this.skin.set(this._tmp, i * 16); }
  /** Render boss b into the GL canvas, only inside his bounding box. Returns that box in canvas pixels. */
  render(b, L, s) {
    const g = this.g, gl = g.gl, R = b.rig, W = Math.round(L.w * s), H = Math.round(L.h * s);
    if (g.canvas.width !== W || g.canvas.height !== H) { g.canvas.width = W; g.canvas.height = H; }
    const bx = R.box, rc = this.rect;
    const x0 = clamp(Math.floor((L.ox + bx.x0) * s), 0, W), x1 = clamp(Math.ceil((L.ox + bx.x1) * s), 0, W);
    const y0 = clamp(Math.floor((L.oy - bx.y1) * s), 0, H), y1 = clamp(Math.ceil((L.oy - bx.y0) * s), 0, H);
    rc.x = x0; rc.y = y0; rc.w = x1 - x0; rc.h = y1 - y0;
    if (rc.w <= 0 || rc.h <= 0) return rc;
    gl.viewport(0, 0, W, H); gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, H - y1, rc.w, rc.h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform4f(g.u.box, L.ox, L.oy, L.w, L.h); gl.uniform1f(g.u.depth, 900); gl.uniform1f(g.u.detail, 0.55);   // he is twice the size: coarser surface detail
    gl.uniform2f(g.u.yaw, Math.cos(R.yaw), Math.sin(R.yaw));
    bossBoneFrames(R.j, R.R, R.headF, R.headU, this.cur);
    const Hl = R.hal; frameFrom(this.cur[BB.halberd], Hl.o, Hl.x, Hl.y);
    const I = this.cur[BB.world]; I.fill(0); I[0] = I[5] = I[10] = I[15] = 1;
    for (let i = 0; i < GL_BONES; i++) this.setBone(i);
    gl.uniformMatrix4fv(g.u.bones, false, this.skin);
    const fc = hexRGB(b.flashColor && b.flashColor[0] === '#' ? b.flashColor : '#ff3048');
    gl.uniform4f(g.u.flash, fc[0], fc[1], fc[2], b.flashAlpha > 0.01 ? b.flashAlpha * 0.42 : 0);
    gl.uniform3f(g.u.back, 0.04, 0.03, 0.05); gl.uniform1f(g.u.backMix, 0.7);
    const p2 = b.phase === 2 ? 1 : 0, dead = b.state === S_DEAD ? clamp(b.dead_t / 1.6, 0, 1) : 0;
    gl.uniform1f(g.u.emitGain, (1.45 + 0.45 * p2) * (1 - 0.7 * dead));
    g.draw(this.body);
    g.draw(this.halM);
    gl.uniform1f(g.u.emitGain, (0.9 + 1.5 * b.coreGlow) * (1 + 0.15 * p2) * (1 - 0.8 * dead));
    g.draw(this.coreM);
    gl.uniform1f(g.u.emitGain, (1.4 + 0.5 * p2) * (1 - 0.7 * dead));
    for (const pl of R.plates) {
      frameFrom(this.cur[BB.plate], pl.o, pl.x, pl.y); this.setBone(BB.plate);
      gl.uniformMatrix4fv(g.u.bones, false, this.skin); g.draw(this.plateM);
    }
    gl.disable(gl.SCISSOR_TEST);
    return rc;
  }
}
