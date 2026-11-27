// ============================================================ GEAR ART (baked at boot)
// Body and gear pictures come from small 3D descriptions projected with the world's 2.5D rule,
// so every one of the 16 facing directions lines up with the rig's joints automatically.
// Limbs are view-independent tapered segments (a sleeve looks the same from any side).

// ---------------------------------------------------------------- 3D helpers
function rigProj(yaw, ox, oy) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return (S, F, Z) => { const X = S * s + F * c, Y = -S * c + F * s; return [ox + X, oy - (Y * K + Z), Y]; };
}
/** Is a surface with char-frame normal (ns, nf, nz) facing the camera at this yaw? */
function rigVisible(yaw, ns, nf, nz, slack) {
  const c = Math.cos(yaw), s = Math.sin(yaw), nY = -ns * c + nf * s;
  return nY - K * nz < (slack || 0);
}
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
// light comes from the camera side, upper left: brightens surfaces that face it
const RIG_LIGHT = [-0.45, -0.35, 0.8];
function lit(yaw, ns, nf, nz) {
  const c = Math.cos(yaw), s = Math.sin(yaw), X = ns * s + nf * c, Y = -ns * c + nf * s;
  const L = RIG_LIGHT, d = (X * L[0] + Y * L[1] + nz * L[2]) / (Math.hypot(X, Y, nz) * Math.hypot(L[0], L[1], L[2]) || 1);
  return clamp(d, 0, 1);
}

/** A body section: list of horizontal ellipses { z, a (half width), b (half depth), f (forward offset) }. */
function sectionPts(P, secs, n) {
  const out = [];
  for (const q of secs) for (let i = 0; i < n; i++) { const th = i / n * TAU; out.push(P(q.a * Math.sin(th), (q.f || 0) + q.b * Math.cos(th), q.z)); }
  return out;
}
/** Section value at height z (linear between listed sections). */
function sectionAt(secs, z) {
  if (z <= secs[0].z) return secs[0];
  for (let i = 1; i < secs.length; i++) if (z <= secs[i].z) {
    const A = secs[i - 1], B = secs[i], u = (z - A.z) / (B.z - A.z);
    return { z, a: A.a + (B.a - A.a) * u, b: A.b + (B.b - A.b) * u, f: (A.f || 0) + ((B.f || 0) - (A.f || 0)) * u };
  }
  return secs[secs.length - 1];
}
/** Paint a patch of a sectioned surface (theta 0 = front, +pi/2 = his right) with a colour, culling back faces. */
function surfPatch(x, yaw, P, secs, th0, th1, z0, z1, col, o) {
  o = o || {}; const nt = o.nt || 8, nz = o.nz || 4, grow = o.grow || 0;
  for (let i = 0; i < nt; i++) for (let j = 0; j < nz; j++) {
    const ta = th0 + (th1 - th0) * i / nt, tb = th0 + (th1 - th0) * (i + 1) / nt, za = z0 + (z1 - z0) * j / nz, zb = z0 + (z1 - z0) * (j + 1) / nz;
    const tm = (ta + tb) / 2;
    if (!rigVisible(yaw, Math.sin(tm), Math.cos(tm), 0, 0.05)) continue;
    const pt = (t, z) => { const q = sectionAt(secs, z); return P((q.a + grow) * Math.sin(t), q.f + (q.b + grow) * Math.cos(t), z); };
    const c = typeof col === 'function' ? col(tm, (za + zb) / 2) : col;
    x.fillStyle = c; x.strokeStyle = c; x.lineWidth = 0.35;
    polyPath(x, [pt(ta, za), pt(tb, za), pt(tb, zb), pt(ta, zb)]); x.fill(); x.stroke();
  }
}
/** Shaded fill of a whole sectioned body: silhouette, then lit vertical bands. */
function solidBody(x, yaw, P, secs, dark, light) {
  fillP(x, hull(sectionPts(P, secs, 28)), dark);
  surfPatch(x, yaw, P, secs, -Math.PI, Math.PI, secs[0].z, secs[secs.length - 1].z,
    (t) => mixHex(dark, light, 0.55 * lit(yaw, Math.sin(t), Math.cos(t), 0.15)), { nt: 20, nz: 3 });
}
/** Ellipsoid point at (theta around, psi up). */
function ellPt(P, E, th, ps) {
  return P(E.a * Math.cos(ps) * Math.sin(th), (E.f || 0) + E.b * Math.cos(ps) * Math.cos(th), E.z + E.c * Math.sin(ps));
}
function ellVisible(yaw, E, th, ps) {
  return rigVisible(yaw, Math.cos(ps) * Math.sin(th) / E.a, Math.cos(ps) * Math.cos(th) / E.b, Math.sin(ps) / E.c, 0.02);
}
function ellPatch(x, yaw, P, E, th0, th1, ps0, ps1, col, n) {
  n = n || 6;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const ta = th0 + (th1 - th0) * i / n, tb = th0 + (th1 - th0) * (i + 1) / n, pa = ps0 + (ps1 - ps0) * j / n, pb = ps0 + (ps1 - ps0) * (j + 1) / n;
    const tm = (ta + tb) / 2, pm = (pa + pb) / 2;
    if (!ellVisible(yaw, E, tm, pm)) continue;
    const c = typeof col === 'function' ? col(tm, pm) : col;
    x.fillStyle = c; x.strokeStyle = c; x.lineWidth = 0.35;
    polyPath(x, [ellPt(P, E, ta, pa), ellPt(P, E, tb, pa), ellPt(P, E, tb, pb), ellPt(P, E, ta, pb)]); x.fill(); x.stroke();
  }
}
function ellSolid(x, yaw, P, E, dark, light, extra) {
  const pts = [];
  for (let i = 0; i < 16; i++) for (let j = -3; j <= 3; j++) pts.push(ellPt(P, E, i / 16 * TAU, j / 3 * Math.PI / 2 * 0.98));
  fillP(x, hull(extra ? pts.concat(extra) : pts), dark);
  ellPatch(x, yaw, P, E, -Math.PI, Math.PI, -Math.PI / 2, Math.PI / 2,
    (t, p) => mixHex(dark, light, 0.6 * lit(yaw, Math.cos(p) * Math.sin(t), Math.cos(p) * Math.cos(t), Math.sin(p))), 10);
}

// ---------------------------------------------------------------- view boxes (canvas size + where the joint sits)
const RIG_BOX = {
  torso:  { w: 46, h: 36, ox: 23, oy: 31 },        // origin = waist joint
  pelvis: { w: 36, h: 40, ox: 18, oy: 18 },        // origin = pelvis joint
  head:   { w: 34, h: 38, ox: 17, oy: 33 },        // origin = neck joint
  cape:   { w: 64, h: 76, ox: 32, oy: 14 },        // origin = neck joint
};
function viewTexFor(part, yaw, paint) {
  const B = RIG_BOX[part];
  const t = makeTex(B.w, B.h, (x) => paint(x, rigProj(yaw, B.ox, B.oy), yaw));
  t.ax = B.ox / B.w; t.ay = 1 - B.oy / B.h; return t;
}
/** Tapered limb picture: joint A at (pad, cy), joint B at (pad + L, cy). */
function segTex(L, w0, w1, paint) {
  const pad = Math.max(w0, w1) / 2 + 2.5, H = Math.max(w0, w1) + 6, W = L + 2 * pad;
  const t = makeTex(W, H, (x) => paint(x, { L, w0, w1, H, pad, cy: H / 2, A: pad, B: pad + L }));
  t.pad = pad; t.L = L; return t;
}
/** Limb outline: flattened end caps and an optional bulge (muscle / plate) peaking at `at` along it. */
function capsulePath(x, g, r0, r1, a, b, bulge, at) {
  a = a === undefined ? g.A : a; b = b === undefined ? g.B : b; bulge = bulge || 1; at = at === undefined ? 0.5 : at;
  const m = a + (b - a) * at, rm = (r0 + (r1 - r0) * at) * bulge, cy = g.cy;
  x.beginPath();
  x.ellipse(a, cy, r0 * 0.55, r0, 0, Math.PI / 2, Math.PI * 1.5);
  x.quadraticCurveTo(m, cy - rm * 2 + (r0 + r1) / 2, b, cy - r1);
  x.ellipse(b, cy, r1 * 0.55, r1, 0, -Math.PI / 2, Math.PI / 2);
  x.quadraticCurveTo(m, cy + rm * 2 - (r0 + r1) / 2, a, cy + r0);
  x.closePath();
}
/** Limb with a soft top-light band. */
function limb(x, g, dark, light, r0, r1, a, b, bulge, at) {
  r0 = r0 || g.w0 / 2; r1 = r1 || g.w1 / 2;
  capsulePath(x, g, r0, r1, a, b, bulge, at); x.fillStyle = dark; x.fill();
  x.save(); capsulePath(x, g, r0, r1, a, b, bulge, at); x.clip();
  const R = Math.max(r0, r1) * (bulge || 1);
  const gr = x.createLinearGradient(0, g.cy - R, 0, g.cy + R);
  gr.addColorStop(0, light); gr.addColorStop(0.42, dark); gr.addColorStop(1, '#060508');
  x.globalAlpha = 0.85; x.fillStyle = gr; x.fillRect(0, 0, g.L + 2 * g.pad, g.H); x.restore();
}
/** A plate: a bulging shape along the limb from u0 to u1, with a lit top edge and a dark seam. */
function plateOn(x, g, u0, u1, r0, r1, bulge, at) {
  const a = g.A + g.L * u0, b = g.A + g.L * u1;
  limb(x, g, RC.plate, RC.plateL, r0, r1, a, b, bulge, at);
  capsulePath(x, g, r0, r1, a, b, bulge, at); x.strokeStyle = '#07070b'; x.lineWidth = 0.6; x.stroke();
}

// ---------------------------------------------------------------- palette
const RC = {
  suit: '#121118', suitL: '#2a2733', cloth: '#15131b', clothL: '#2f2a3a', cloak: '#0b0a0f', cloakL: '#1d1a24', lining: '#2a0d14',
  plate: '#23242e', plateL: '#5a5d6e', plateD: '#101016', crimson: '#8A2432', hot: '#ff2a45', gold: 'rgba(150,118,56,0.95)', black: '#030304',
};

// ---------------------------------------------------------------- the 3D shapes
const TORSO = [{ z: 0, a: 6.8, b: 4.4, f: 0 }, { z: 7.5, a: 9.2, b: 5.4, f: 0.6 }, { z: 12.5, a: 11.2, b: 5.0, f: 0.2 }, { z: 15.5, a: 7.5, b: 4.2 }, { z: 17.5, a: 3.6, b: 3.2, f: 0.4 }];
const HIPS = [{ z: -8, a: 6.6, b: 4.6 }, { z: -2, a: 7.6, b: 5.2 }, { z: 6.5, a: 6.9, b: 4.5, f: 0.4 }];
const SKULL = { z: 9, a: 5.2, b: 5.8, c: 7.0, f: 1.0 };
const HOOD = { z: 9.5, a: 7.0, b: 7.6, c: 8.6, f: 0.2 };

// ---------------------------------------------------------------- base body (the under-suit)
const BASE_ART = {
  torso(x, P, yaw) { solidBody(x, yaw, P, TORSO, RC.suit, RC.suitL); },
  pelvis(x, P, yaw) { solidBody(x, yaw, P, HIPS, RC.suit, RC.suitL); },
  head(x, P, yaw) {
    solidBody(x, yaw, P, [{ z: -1, a: 3, b: 3 }, { z: 3, a: 3.2, b: 3.2, f: 0.6 }], RC.suit, RC.suitL);   // neck
    ellSolid(x, yaw, P, SKULL, RC.suit, RC.suitL);
    ellPatch(x, yaw, P, SKULL, -0.75, 0.75, -0.45, 0.35, '#1c1b23', 5);                                   // face plate
  },
  cape() {},
  thigh: [18.5, 10.5, 7.4, (x, g) => limb(x, g, RC.suit, RC.suitL, 0, 0, undefined, undefined, 1.06, 0.3)],
  shin: [18.5, 7.0, 4.8, (x, g) => limb(x, g, RC.suit, RC.suitL, 0, 0, undefined, undefined, 1.16, 0.3)],
  foot: [7.5, 5.6, 4.8, (x, g) => limb(x, g, RC.suit, RC.suitL)],
  upper: [14, 7.0, 5.6, (x, g) => limb(x, g, RC.suit, RC.suitL, 0, 0, undefined, undefined, 1.08, 0.35)],
  fore: [13.5, 6.0, 4.4, (x, g) => limb(x, g, RC.suit, RC.suitL, 0, 0, undefined, undefined, 1.1, 0.3)],
  hand: [4.5, 4.8, 4.8, (x, g) => limb(x, g, RC.suit, RC.suitL)],
};

// ---------------------------------------------------------------- starter set: the hooded hunter
const GEAR_ART = {
  hunter_hood: {
    head(x, P, yaw) {
      // hood shell: an ellipsoid with a peak and a drape that falls onto the shoulders at the back
      const extra = [P(0, -3.5, 19.5), P(-6.5, -5.5, 0), P(6.5, -5.5, 0), P(-7.5, -2, 2), P(7.5, -2, 2)];
      ellSolid(x, yaw, P, HOOD, RC.cloth, RC.clothL, extra);
      // face opening: deep shadow
      ellPatch(x, yaw, P, HOOD, -0.72, 0.72, -0.55, 0.42, RC.black, 7);
      // opening rim + centre seam
      const rim = [], seam = [];
      for (let i = 0; i <= 14; i++) { const t = -0.72 + 1.44 * i / 14; if (ellVisible(yaw, HOOD, t, 0.44)) rim.push(ellPt(P, HOOD, t, 0.44)); }
      if (rim.length > 1) lineP(x, rim, 1.0, '#3a3446');
      for (let i = 0; i <= 12; i++) { const ps = 0.5 + (Math.PI / 2 - 0.5) * i / 12; if (ellVisible(yaw, HOOD, 0, ps)) seam.push(ellPt(P, HOOD, 0, ps)); }
      for (let i = 0; i <= 12; i++) { const ps = Math.PI / 2 - Math.PI / 2 * i / 12; if (ellVisible(yaw, HOOD, Math.PI, ps)) seam.push(ellPt(P, HOOD, Math.PI, ps)); }
      if (seam.length > 1) lineP(x, seam, 0.8, 'rgba(70,62,86,0.9)');
    },
  },
  hunter_coat: {
    torso(x, P, yaw) {
      const C = TORSO.map(q => ({ z: q.z, a: q.a + 0.7, b: q.b + 0.6, f: q.f }));
      solidBody(x, yaw, P, C, RC.cloth, RC.clothL);
      // chest plate, belt, core, collar, back sigil
      surfPatch(x, yaw, P, C, -0.95, 0.95, 3.8, 12.2, (t) => mixHex('#1b1c25', '#4a4c5c', 0.6 * lit(yaw, Math.sin(t), Math.cos(t), 0.1)), { nt: 10, nz: 4, grow: 0.5 });
      surfPatch(x, yaw, P, C, -Math.PI, Math.PI, 0.6, 2.6, RC.gold, { nt: 24, nz: 1, grow: 0.7 });
      surfPatch(x, yaw, P, C, -0.12, 0.12, 0.4, 2.8, '#d6b46a', { nt: 1, nz: 1, grow: 0.9 });   // buckle
      surfPatch(x, yaw, P, C, -Math.PI, Math.PI, 15.2, 18.2, '#0d0c12', { nt: 20, nz: 2, grow: 0.8 });
      if (rigVisible(yaw, 0, 1, 0, -0.05)) {
        const q = sectionAt(C, 8.5), c0 = P(0, q.f + q.b + 1.0, 8.5), w = 2.6 * Math.max(0.2, -Math.sin(yaw));
        withGlow(x, GLOW_RED, 4, () => fillP(x, [[c0[0], c0[1] - 4], [c0[0] + w, c0[1]], [c0[0], c0[1] + 4], [c0[0] - w, c0[1]]], RC.hot));
      }
      if (rigVisible(yaw, 0, -1, 0, -0.05)) {
        const q = sectionAt(C, 9), b0 = P(0, q.f - q.b - 0.6, 11.5), b1 = P(0, q.f - q.b - 0.6, 6.5);
        const w = 4.5 * Math.max(0.2, Math.sin(yaw));
        withGlow(x, GLOW_RED, 3, () => lineP(x, [[b0[0] - w, b0[1]], [b0[0] + w, b0[1]], [b1[0], b1[1]], [b0[0] - w, b0[1]]], 1.1, RC.crimson));
      }
    },
    pelvis(x, P, yaw) {
      // coat skirt: split at the front so the legs read, longer at the back
      const S = (z) => ({ z, a: 8.4 + (6 - z) * 0.11, b: 5.8 + (6 - z) * 0.08, f: 0 });
      const SK = [S(-16), S(-8), S(0), S(6)];
      const hem = (t, z) => mixHex(RC.cloth, RC.clothL, 0.5 * lit(yaw, Math.sin(t), Math.cos(t), 0));
      surfPatch(x, yaw, P, SK, 1.1, TAU - 1.1, -16, 6, hem, { nt: 12, nz: 4 });       // back and sides
      surfPatch(x, yaw, P, SK, 0.2, 1.15, -12, 6, hem, { nt: 5, nz: 4 });             // front right flap
      surfPatch(x, yaw, P, SK, -1.15, -0.2, -12, 6, hem, { nt: 5, nz: 4 });           // front left flap
      // crimson hem trim along the visible bottom edges
      const edge = (t0, t1, z) => {
        let run = [];
        for (let i = 0; i <= 10; i++) {
          const t = t0 + (t1 - t0) * i / 10, q = sectionAt(SK, z);
          if (rigVisible(yaw, Math.sin(t), Math.cos(t), 0, 0.05)) run.push(P(q.a * Math.sin(t), q.b * Math.cos(t), z));
          else { if (run.length > 1) withGlow(x, GLOW_RED, 2.5, () => lineP(x, run, 1.1, RC.crimson)); run = []; }
        }
        if (run.length > 1) withGlow(x, GLOW_RED, 2.5, () => lineP(x, run, 1.1, RC.crimson));
      };
      edge(1.1, TAU - 1.1, -16); edge(0.2, 1.15, -12); edge(-1.15, -0.2, -12);
    },
    upper: [14, 7.8, 6.0, (x, g) => {
      limb(x, g, RC.cloth, RC.clothL, 3.9, 3.0, undefined, undefined, 1.08, 0.35);
      // pauldron: three overlapping lames running down from the shoulder
      for (const [u0, u1, r] of [[0.32, 0.62, 4.6], [0.12, 0.44, 5.4], [-0.16, 0.26, 6.2]]) plateOn(x, g, u0, u1, r * 0.92, r, 1.05, 0.6);
      fillOval(x, g.A - 1.1, g.cy - 3.9, 2.2, 2.2, RC.crimson);
    }],
  },
  hunter_cloak: {
    cape(x, P, yaw) {
      // a sheet from the back half of the shoulders down to the calves; outer face dark, lining crimson-black
      const top = { z: -4.5, a: 11.8, b: 5.4, f: -0.5 }, bot = { z: -50, a: 15.5, b: 8.5, f: -5.5 };
      const nt = 16, nz = 10, t0 = Math.PI / 2 + 0.12, t1 = Math.PI * 1.5 - 0.12;
      const tat = (i) => (i % 3 === 0 ? 3.5 : i % 3 === 1 ? 0 : 1.8);              // tattered hem
      const pt = (i, j) => {
        const th = t0 + (t1 - t0) * i / nt, u = j / nz, a = top.a + (bot.a - top.a) * u, b = top.b + (bot.b - top.b) * u;
        const f = top.f + (bot.f - top.f) * u, z = top.z + (bot.z - top.z) * u + (j === nz ? tat(i) : 0);
        return P(a * Math.sin(th), f + b * Math.cos(th), z);
      };
      const quads = [];
      for (let i = 0; i < nt; i++) for (let j = 0; j < nz; j++) {
        const th = t0 + (t1 - t0) * (i + 0.5) / nt, pts = [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)];
        const outer = rigVisible(yaw, Math.sin(th), Math.cos(th), 0.2, 0.02);
        const L = lit(yaw, Math.sin(th), Math.cos(th), 0.2) * (1 - j / nz * 0.45);
        const col = outer ? mixHex(RC.cloak, RC.cloakL, 0.7 * L) : mixHex('#14070b', RC.lining, 0.6 * (1 - j / nz));
        quads.push([(pts[0][2] + pts[2][2]) / 2, pts, col]);
      }
      quads.sort((a, b) => b[0] - a[0]);
      for (const q of quads) { x.fillStyle = q[2]; x.strokeStyle = q[2]; x.lineWidth = 0.35; polyPath(x, q[1]); x.fill(); x.stroke(); }
      const hemPts = []; for (let i = 0; i <= nt; i++) hemPts.push(pt(i, nz));
      withGlow(x, GLOW_RED, 3, () => lineP(x, hemPts, 1.2, RC.crimson));
    },
  },
  hunter_gauntlets: {
    fore: [13.5, 6.8, 5.4, (x, g) => {
      plateOn(x, g, 0.32, 1.0, 3.6, 2.7, 1.08, 0.25);                       // flared bracer
      x.fillStyle = RC.crimson; x.fillRect(g.A + g.L * 0.34, g.cy - 3.4, 0.9, 6.8);
      lineP(x, [[g.A + g.L * 0.5, g.cy - 1.4], [g.B - 1.5, g.cy - 1.1]], 0.6, 'rgba(140,144,166,0.55)');
    }],
    hand: [4.5, 5.4, 5.2, (x, g) => {
      limb(x, g, RC.plate, RC.plateL);
      lineP(x, [[g.B - 0.2, g.cy - 2.2], [g.B - 0.2, g.cy + 2.2]], 0.7, '#08080c');
    }],
  },
  hunter_greaves: {
    thigh: [18.5, 11.0, 7.8, (x, g) => {
      limb(x, g, RC.cloth, RC.clothL, 0, 0, undefined, undefined, 1.06, 0.3);
      plateOn(x, g, 0.45, 1.0, 3.4, 3.6, 1.05, 0.6);                        // cuisse over the lower thigh
      lineP(x, [[g.A + 3, g.cy + 2.2], [g.A + g.L * 0.45, g.cy + 2.0]], 0.6, 'rgba(8,8,12,0.8)');
    }],
    shin: [18.5, 7.6, 5.2, (x, g) => {
      plateOn(x, g, 0.08, 0.9, 3.6, 2.6, 1.16, 0.3);                        // greave with a calf swell
      lineP(x, [[g.A + 3, g.cy - 2.6], [g.B - 4, g.cy - 1.6]], 0.6, 'rgba(140,144,166,0.55)');
      // knee cop: a low, wide plate over the joint rather than a ball
      x.save(); x.beginPath(); x.ellipse(g.A + 0.5, g.cy, 3.0, 4.4, 0, 0, TAU); x.fillStyle = RC.plate; x.fill(); x.clip();
      const gr = x.createLinearGradient(0, g.cy - 4.4, 0, g.cy + 4.4); gr.addColorStop(0, RC.plateL); gr.addColorStop(1, RC.plateD);
      x.fillStyle = gr; x.fillRect(0, 0, 40, 40); x.restore();
      x.beginPath(); x.ellipse(g.A + 0.5, g.cy, 3.0, 4.4, 0, 0, TAU); x.strokeStyle = '#08080c'; x.lineWidth = 0.6; x.stroke();
    }],
  },
  hunter_boots: {
    shin: [18.5, 7.6, 7.0, (x, g) => {                                // boot shaft over the lower shin
      limb(x, g, '#0e0d12', '#26232d', 3.4, 3.6, g.B - 7.5, g.B + 0.5);
      lineP(x, [[g.B - 7.1, g.cy - 3.3], [g.B - 7.1, g.cy + 3.3]], 0.8, RC.gold);
    }],
    foot: [7.5, 7.0, 5.6, (x, g) => {
      limb(x, g, '#0e0d12', '#26232d', 0, 0, undefined, undefined, 1.05, 0.4);
      x.save(); capsulePath(x, g, g.w0 / 2, g.w1 / 2); x.clip();
      x.fillStyle = RC.plate; x.fillRect(g.B - 2.5, 0, 6, g.H);                      // toe cap
      x.restore();
    }],
  },
};

/** Bake base + every gear piece: ART.rig[source][part] = texture (segments) or [16 views]. */
function buildRigArt(A) {
  A.rig = {};
  const bake = (src, art) => {
    const out = {};
    for (const part in art) {
      const v = art[part];
      if (Array.isArray(v)) out[part] = segTex(v[0], v[1], v[2], v[3]);
      else if (RIG_BOX[part]) {
        out[part] = [];
        for (let i = 0; i < RIG_DIRS; i++) out[part].push(viewTexFor(part, i / RIG_DIRS * TAU, v));
      }
    }
    A.rig[src] = out;
  };
  bake('base', BASE_ART);
  for (const id in GEAR_ART) bake(id, GEAR_ART[id]);
}
