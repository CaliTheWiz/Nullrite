// ============================================================ ANIM (keyed full-body attack clips)
// Every player attack is a clip of key poses for the whole body, so each weapon and each attack moves differently.
// The clip runs on one clock x: 0..1 = wind-up (anticipation), 1..2 = strike (the hit frames), 2..3 = recovery
// (follow-through, a held pose, then back to guard). The move's windup / active / recovery times stretch each part.
//
// Key fields (any can be left out; a channel is interpolated across keys that don't set it):
//   g  [s, f, z]  right-hand grip, relative to the waist, in his own frame (s = his right, f = forward, z = up)
//   b  [s, f, z]  blade direction (from the grip toward the tip): where the weapon aims in his frame
//   l  [s, f, z]  left hand (one-handed weapons only), relative to the waist
//   hg   spear: how far ahead of the right hand the left hand holds the shaft
//   tw   chest turn, degrees (+ = toward his left). The hips follow on their own, leading it a little in time
//        ("the hips lead the chest, the chest leads the arms").
//   ln   lean forward from the waist, degrees     cr  crouch (hip drop)      rm  forward travel since the start
//   L, R [s, f]   left / right foot, relative to where his root is at that key. A foot stays planted on the
//        ground until a key moves it; between two keys with different targets it takes a step.
//   e    how the motion eases into this key: 'io' (default, slow-fast-slow), 'out' (explodes from the last key:
//        a strike), 'in' (slow start: the moment the weight turns over), 'lin' (keeps the momentum through).
// Events: [x, kind, power] fired when the clock passes x: 'ground' = the weapon hits the floor at the blade tip.

const ANIM_CH = ['g', 'b', 'l', 'tw', 'ln', 'cr', 'rm', 'hg'];
const EASE = {
  io: (u) => u * u * (3 - 2 * u), out: (u) => 1 - Math.pow(1 - u, 2.6), in: (u) => u * u * (1.6 - 0.6 * u), lin: (u) => u,
};

/** Precompute per-channel key lists (and per-foot step lists) for a clip. */
function compileClip(c) {
  if (c._ch) return c;
  c._ch = {};
  for (const n of ANIM_CH) {
    const ks = c.keys.filter((k) => k[n] !== undefined).map((k) => ({ x: k.x, v: Array.isArray(k[n]) ? k[n].slice() : [k[n]], e: EASE[k.e || 'io'] }));
    if (ks.length) c._ch[n] = ks;
  }
  c._feet = {};
  for (const side of ['L', 'R']) c._feet[side] = c.keys.filter((k) => k[side]).map((k) => ({ x: k.x, s: k[side][0], f: k[side][1], e: EASE[k.e || 'io'] }));
  c.ev = c.ev || [];
  return c;
}

/** Catmull-Rom through the channel's keys, with the segment's own easing on the local time. */
function sampleChannel(ks, x, out) {
  const n = ks.length, dim = ks[0].v.length;
  if (n === 1 || x <= ks[0].x) { for (let d = 0; d < dim; d++) out[d] = ks[0].v[d]; return out; }
  if (x >= ks[n - 1].x) { for (let d = 0; d < dim; d++) out[d] = ks[n - 1].v[d]; return out; }
  let i = 0; while (i < n - 2 && x >= ks[i + 1].x) i++;
  const a = ks[i], b = ks[i + 1], p0 = ks[Math.max(0, i - 1)], p3 = ks[Math.min(n - 1, i + 2)];
  const u = b.e((x - a.x) / (b.x - a.x)), u2 = u * u, u3 = u2 * u;
  for (let d = 0; d < dim; d++) {
    // tangents scaled for uneven key spacing so fast segments don't overshoot their neighbours
    const h = b.x - a.x;
    const m1 = i > 0 ? (b.v[d] - p0.v[d]) / (b.x - p0.x) * h : (b.v[d] - a.v[d]);
    const m2 = i + 2 < n ? (p3.v[d] - a.v[d]) / (p3.x - a.x) * h : (b.v[d] - a.v[d]);
    out[d] = (2 * u3 - 3 * u2 + 1) * a.v[d] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * b.v[d] + (u3 - u2) * m2;
  }
  return out;
}

/** The whole pose at clock x into `o` ({g, b, l, tw, ln, cr, rm, hp}). */
function sampleClip(c, x, o) {
  compileClip(c);
  for (const n of ANIM_CH) {
    const ks = c._ch[n];
    if (!ks) { o[n] = null; continue; }
    if (ks[0].v.length === 1) { sampleChannel(ks, x, _sc1); o[n] = _sc1[0]; }
    else { o[n] = o[n] && o[n].length ? o[n] : [0, 0, 0]; sampleChannel(ks, x, o[n]); }
  }
  // hips: about 55% of the chest turn, a little ahead of it in time
  if (c._ch.tw) { sampleChannel(c._ch.tw, Math.min(3, x + 0.1), _sc1); o.hp = _sc1[0] * 0.55; } else o.hp = 0;
  return o;
}
const _sc1 = [0];

/** Forward travel (root motion) of a clip at clock x. */
function clipRoot(c, x) { compileClip(c); const ks = c._ch.rm; if (!ks) return 0; sampleChannel(ks, x, _sc1); return _sc1[0]; }

/** Where a move's clock is: 0..1 wind-up, 1..2 strike, 2..3 recovery. */
function moveClock(st, t, mv) {
  if (st === S_WINDUP) return clamp(t / Math.max(0.01, mv.windup), 0, 1);
  if (st === S_ACTIVE) return 1 + clamp(t / Math.max(0.01, mv.active), 0, 1);
  if (st === S_RECOVERY) return 2 + clamp(t / Math.max(0.01, mv.recovery), 0, 1);
  return 3;
}

// ---------------------------------------------------------------- the clips
// Shared guard poses (chest frame). Feet: left foot a little forward, right foot back.
const GUARD_1H = { g: [8, 12, 0], b: [0.2, 0.7, 0.6], l: [-13, 6, -4] };
const GUARD_2H = { g: [5, 11, -1], b: [0.15, 0.85, 0.5] };
const GUARD_SP = { g: [7, 3, -1], b: [-0.22, 0.97, 0.08], hg: 16 };
const ST = { L: [-5, 1], R: [5, -3] };
const k = (x, o, base) => Object.assign({ x }, base || {}, o);

const ANIMS = {
  // ======== one-handed sword: quick, a mix of cuts and thrusts; the free arm swings out for balance
  os_l1: { keys: [            // forehand diagonal: cocked over the right shoulder, cuts down through to low left
    k(0, { tw: -10, ln: 0, cr: 1, rm: 0, L: ST.L, R: ST.R }, GUARD_1H),
    k(0.85, { g: [13, 0, 16], b: [0.55, -0.45, 0.7], l: [-14, 10, -2], tw: -38, ln: -5, cr: 2.5, rm: 1, L: ST.L }),
    k(1.0, { g: [12, 4, 15], b: [0.35, 0.15, 0.92], tw: -32, ln: -3, cr: 3, rm: 2, e: 'in' }),
    k(1.35, { g: [5, 23, 6], b: [-0.45, 0.85, 0.2], l: [-13, -2, -2], tw: 6, ln: 8, cr: 4.5, rm: 8, L: [-5.5, 8], e: 'lin' }),
    k(1.75, { g: [-6, 18, -3], b: [-0.95, 0.2, -0.25], tw: 32, ln: 12, cr: 5, rm: 11, e: 'out' }),
    k(2.0, { g: [-7, 15, -5], b: [-0.9, -0.2, -0.4], l: [-12, -8, 0], tw: 36, ln: 12, cr: 5, rm: 12 }),
    k(2.5, { g: [-6, 15, -4], b: [-0.85, 0, -0.5], tw: 33, ln: 10, cr: 4.5, rm: 12.5, R: ST.R }),
    k(3.0, { tw: 0, ln: 2, cr: 1, rm: 13, R: [5, -2] }, GUARD_1H),
  ] },
  os_l2: { keys: [            // backhand rising cut, the right foot passing forward
    k(0, { g: [-6, 14, -3], b: [-0.85, 0.1, -0.5], l: [-12, -6, 0], tw: 30, ln: 8, cr: 3, rm: 0, L: ST.L, R: ST.R }),
    k(0.8, { g: [-8, 10, -6], b: [-0.8, -0.35, -0.45], tw: 42, ln: 6, cr: 4, rm: 1, R: ST.R }),
    k(1.0, { g: [-5, 15, -5], b: [-0.6, 0.5, -0.6], tw: 30, ln: 6, cr: 4, rm: 2, e: 'in' }),
    k(1.4, { g: [6, 22, 7], b: [0.5, 0.75, 0.45], l: [-14, 8, -3], tw: -4, ln: 2, cr: 3, rm: 8, R: [6, 7], e: 'lin' }),
    k(1.8, { g: [12, 12, 17], b: [0.6, -0.1, 0.8], tw: -30, ln: -4, cr: 2, rm: 11, e: 'out' }),
    k(2.1, { g: [13, 8, 19], b: [0.5, -0.4, 0.77], l: [-14, 12, -2], tw: -34, ln: -5, cr: 2, rm: 12 }),
    k(2.5, { g: [12, 9, 18], b: [0.5, -0.3, 0.8], tw: -32, ln: -4, cr: 2, rm: 12, L: ST.L }),
    k(3.0, { tw: 0, ln: 1, cr: 1, rm: 12, L: [-5, 1] }, GUARD_1H),
  ] },
  os_l3: { keys: [            // drawn back to the hip, then a stepping thrust
    k(0, { tw: -5, cr: 1.5, rm: 0, L: ST.L, R: ST.R }, GUARD_1H),
    k(0.85, { g: [9, -2, 5], b: [0.05, 1, 0.05], l: [-13, 12, 0], tw: -35, ln: -4, cr: 5, rm: -2, L: ST.L, R: ST.R }),
    k(1.0, { g: [9, 2, 5], b: [0, 1, 0], tw: -30, ln: -1, cr: 5, rm: -1, e: 'in' }),
    k(1.45, { g: [4, 29, 7], b: [-0.05, 1, -0.05], l: [-12, -10, -2], tw: 12, ln: 14, cr: 7, rm: 9, L: [-6, 13], R: [5, -9], e: 'out' }),
    k(2.0, { g: [4, 29, 6], b: [0, 1, -0.08], tw: 14, ln: 14, cr: 7, rm: 10 }),
    k(2.4, { g: [6, 23, 4], b: [0.05, 1, 0.1], tw: 8, ln: 10, cr: 6, rm: 10 }),
    k(3.0, { tw: 0, ln: 2, cr: 1, rm: 8, L: [-5, 2], R: [5, -3] }, GUARD_1H),
  ] },
  os_heavy: { keys: [         // a deep coil, then an explosive lunging thrust; the left arm flung back for balance
    k(0, { tw: -5, cr: 1.5, rm: 0, L: ST.L, R: ST.R }, GUARD_1H),
    k(0.9, { g: [10, -6, 2], b: [0.05, 0.97, 0.2], l: [-12, 16, 4], tw: -50, ln: -4, cr: 10, rm: -3, L: ST.L, R: ST.R }),
    k(1.0, { g: [10, -3, 2], b: [0.03, 0.97, 0.22], tw: -46, ln: -3, cr: 10, rm: -2, e: 'in' }),
    k(1.5, { g: [3, 29, 9], b: [-0.05, 0.94, 0.33], l: [-12, -12, -2], tw: 22, ln: 16, cr: 12, rm: 14, L: [-7, 20], R: [5, -11], e: 'out' }),
    k(2.1, { g: [3, 29, 10], b: [-0.03, 0.93, 0.36], tw: 22, ln: 16, cr: 12, rm: 15 }),
    k(2.6, { g: [6, 24, 3], b: [0.05, 1, 0], l: [-13, -4, -3], tw: 10, ln: 12, cr: 8, rm: 15 }),
    k(3.0, { tw: 0, ln: 2, cr: 1, rm: 11, L: [-5, 3], R: [5, -3] }, GUARD_1H),
  ] },
  os_charged: { keys: [       // released from a deep wind: a wide horizontal cleave, the whole body turning through
    k(0, { g: [13, -4, 8], b: [0.3, -0.92, 0.1], l: [-13, 14, 2], tw: -62, ln: -2, cr: 6, rm: 0, L: [-6, 4], R: [6, -6] }),
    k(1.0, { g: [14, 4, 7], b: [0.75, 0.65, 0.05], tw: -46, ln: 2, cr: 6, rm: 2, e: 'in' }),
    k(1.3, { g: [6, 24, 6], b: [-0.2, 1, 0], l: [-13, 2, 0], tw: 0, ln: 8, cr: 7, rm: 9, R: [6, 8], e: 'lin' }),
    k(1.65, { g: [-12, 14, 6], b: [-1, 0.1, 0], tw: 50, ln: 8, cr: 7, rm: 13, e: 'lin' }),
    k(2.0, { g: [-12, 4, 4], b: [-0.8, -0.6, -0.1], l: [-10, -10, 2], tw: 75, ln: 6, cr: 7, rm: 15, e: 'out' }),
    k(2.5, { g: [-12, 5, 4], b: [-0.8, -0.55, -0.15], tw: 72, ln: 6, cr: 6.5, rm: 15, L: [-6, 4] }),
    k(3.0, { tw: 0, ln: 2, cr: 1, rm: 15, L: [-5, 1] }, GUARD_1H),
  ] },
  os_dodge: { keys: [         // out of a dash or a sprint: a low sweeping cut from the right, carried by the run
    k(0, { g: [12, 2, 2], b: [0.6, -0.7, -0.3], l: [-13, 12, 2], tw: -40, ln: 10, cr: 7, rm: 0, L: ST.L, R: ST.R }),
    k(1.0, { g: [13, 8, 0], b: [0.85, 0.4, -0.3], tw: -34, ln: 12, cr: 8, rm: 6, e: 'in' }),
    k(1.35, { g: [4, 24, -2], b: [-0.2, 0.95, -0.2], l: [-13, -4, 0], tw: 8, ln: 14, cr: 9, rm: 18, L: [-6, 13], e: 'lin' }),
    k(1.8, { g: [-9, 14, -4], b: [-0.95, 0.15, -0.25], tw: 42, ln: 12, cr: 8, rm: 24, e: 'out' }),
    k(2.4, { g: [-9, 12, -3], b: [-0.9, -0.2, -0.3], l: [-11, -10, 2], tw: 40, ln: 10, cr: 7, rm: 26, R: ST.R }),
    k(3.0, { tw: 0, ln: 2, cr: 1, rm: 27, R: [5, -2] }, GUARD_1H),
  ] },

  // ======== greatsword: slow, huge wind-ups, the blade's momentum dragging the body through and past the cut
  gs_l1: { keys: [            // diagonal cleave from over the right shoulder down to low left
    k(0, { tw: -10, cr: 2, rm: 0, L: ST.L, R: ST.R }, GUARD_2H),
    k(0.9, { g: [10, -2, 18], b: [0.25, -0.75, 0.6], tw: -55, ln: -8, cr: 4, rm: -1, L: ST.L, R: ST.R }),
    k(1.0, { g: [10, 0, 18], b: [0.2, -0.5, 0.85], tw: -52, ln: -7, cr: 4, rm: 0, e: 'in' }),
    k(1.35, { g: [4, 22, 8], b: [-0.35, 0.93, 0.05], tw: -5, ln: 10, cr: 7, rm: 8, L: [-6, 11], e: 'lin' }),
    k(1.75, { g: [-8, 16, -6], b: [-0.92, 0.2, -0.3], tw: 40, ln: 16, cr: 9, rm: 12, e: 'out' }),
    k(2.1, { g: [-10, 10, -8], b: [-0.8, -0.45, -0.38], tw: 56, ln: 16, cr: 9, rm: 14 }),
    k(2.6, { g: [-9, 11, -7], b: [-0.8, -0.4, -0.4], tw: 50, ln: 14, cr: 8, rm: 14.5, R: ST.R }),
    k(3.0, { tw: -5, ln: 2, cr: 2, rm: 15, R: [5, -1] }, GUARD_2H),
  ] },
  gs_l2: { keys: [            // reverse rising cut, left-low to right-high; the right foot passes through with it
    k(0, { g: [-9, 11, -7], b: [-0.75, -0.3, -0.55], tw: 50, ln: 12, cr: 7, rm: 0, L: ST.L, R: ST.R }),
    k(0.85, { g: [-11, 4, -8], b: [-0.6, -0.7, -0.35], tw: 62, ln: 10, cr: 8, rm: 1, R: ST.R }),
    k(1.0, { g: [-10, 8, -8], b: [-0.6, -0.55, -0.55], tw: 58, ln: 10, cr: 8, rm: 2, e: 'in' }),
    k(1.4, { g: [2, 22, 2], b: [0.3, 0.9, 0.3], tw: 10, ln: 6, cr: 6, rm: 9, R: [6, 8], e: 'lin' }),
    k(1.8, { g: [10, 12, 16], b: [0.6, 0.1, 0.8], tw: -35, ln: -2, cr: 4, rm: 13, e: 'out' }),
    k(2.1, { g: [11, 6, 19], b: [0.4, -0.4, 0.82], tw: -48, ln: -5, cr: 4, rm: 14 }),
    k(2.6, { g: [11, 7, 18], b: [0.4, -0.35, 0.85], tw: -45, ln: -4, cr: 4, rm: 14, L: ST.L }),
    k(3.0, { tw: -5, ln: 2, cr: 2, rm: 14, L: [-5, 1] }, GUARD_2H),
  ] },
  gs_l3: { keys: [            // overhead vertical chop, driven down into the floor
    k(0, { tw: -8, cr: 2, rm: 0, L: ST.L, R: ST.R }, GUARD_2H),
    k(0.9, { g: [3, 2, 26], b: [0.05, -0.6, 0.8], tw: -15, ln: -10, cr: 2, rm: -1, L: ST.L, R: ST.R }),
    k(1.0, { g: [3, 4, 26], b: [0.05, -0.3, 0.95], tw: -12, ln: -9, cr: 2, rm: 0, e: 'in' }),
    k(1.3, { g: [2, 24, 14], b: [0, 0.95, 0.3], tw: 0, ln: 8, cr: 6, rm: 7, L: [-6, 11], e: 'lin' }),
    k(1.6, { g: [1, 24, -10], b: [0, 0.88, -0.48], tw: 4, ln: 24, cr: 12, rm: 10, e: 'out' }),
    k(2.15, { g: [1, 24, -11], b: [0, 0.88, -0.48], tw: 4, ln: 25, cr: 12, rm: 10 }),
    k(2.6, { g: [3, 20, -5], b: [0.05, 0.9, -0.2], tw: 2, ln: 16, cr: 10, rm: 10, R: ST.R }),
    k(3.0, { tw: -5, ln: 2, cr: 2, rm: 10, R: [5, -1] }, GUARD_2H),
  ], ev: [[1.6, 'ground', 0.7]] },
  gs_heavy: { keys: [         // the big one: wound back and down, rises and steps in, then slams the floor
    k(0, { tw: -8, cr: 2, rm: 0, L: ST.L, R: ST.R }, GUARD_2H),
    k(0.55, { g: [8, -6, 20], b: [0.3, -0.85, 0.42], tw: -42, ln: -12, cr: 6, rm: -2, L: ST.L, R: ST.R }),
    k(0.9, { g: [4, -4, 29], b: [0.1, -0.7, 0.7], tw: -25, ln: -14, cr: 3, rm: 5, L: [-6, 8], e: 'io' }),
    k(1.0, { g: [3, 0, 29], b: [0.05, -0.3, 0.95], tw: -18, ln: -12, cr: 2, rm: 8, e: 'in' }),
    k(1.35, { g: [2, 26, 12], b: [0, 0.95, 0.2], tw: -2, ln: 10, cr: 8, rm: 15, R: [6, 5], e: 'lin' }),
    k(1.6, { g: [1, 25, -12], b: [0, 0.86, -0.5], tw: 2, ln: 28, cr: 14, rm: 18, e: 'out' }),
    k(2.3, { g: [1, 25, -13], b: [0, 0.86, -0.5], tw: 2, ln: 28, cr: 14, rm: 18 }),
    k(2.75, { g: [3, 20, -6], b: [0.05, 0.92, -0.2], tw: 0, ln: 18, cr: 10, rm: 18, L: [-6, 8] }),
    k(3.0, { tw: -5, ln: 3, cr: 2, rm: 18, L: [-5, 2] }, GUARD_2H),
  ], ev: [[1.6, 'ground', 1.0]] },
  gs_charged: { keys: [       // let go from the full wind: a sweeping cleave that turns his whole body round
    k(0, { g: [10, -6, 6], b: [0.4, -0.9, 0.05], tw: -70, ln: -2, cr: 8, rm: 0, L: [-6, 5], R: [6, -7] }),
    k(1.0, { g: [11, 2, 6], b: [0.8, 0.55, 0], tw: -55, ln: 2, cr: 8, rm: 3, e: 'in' }),
    k(1.3, { g: [4, 24, 4], b: [-0.1, 1, -0.05], tw: -5, ln: 10, cr: 9, rm: 11, R: [6, 9], e: 'lin' }),
    k(1.65, { g: [-10, 14, 2], b: [-1, 0.05, -0.05], tw: 50, ln: 12, cr: 9, rm: 16, e: 'lin' }),
    k(2.0, { g: [-10, 2, 0], b: [-0.75, -0.65, -0.1], tw: 85, ln: 10, cr: 9, rm: 18, e: 'out' }),
    k(2.55, { g: [-10, 3, 0], b: [-0.75, -0.62, -0.12], tw: 82, ln: 9, cr: 8.5, rm: 18, L: [-6, 4] }),
    k(3.0, { tw: -5, ln: 2, cr: 2, rm: 19, L: [-5, 1] }, GUARD_2H),
  ] },
  gs_dodge: { keys: [         // from a run: blade dragged low, then a rising cleave
    k(0, { g: [6, 6, -6], b: [0.3, 0.6, -0.7], tw: -20, ln: 10, cr: 7, rm: 0, L: ST.L, R: ST.R }),
    k(1.0, { g: [5, 12, -8], b: [0.15, 0.7, -0.7], tw: -15, ln: 12, cr: 8, rm: 6, e: 'in' }),
    k(1.45, { g: [2, 22, 8], b: [0, 0.8, 0.6], tw: 0, ln: 2, cr: 4, rm: 17, L: [-6, 11], e: 'out' }),
    k(2.0, { g: [3, 10, 24], b: [0.05, -0.3, 0.95], tw: 5, ln: -8, cr: 2, rm: 21 }),
    k(2.5, { g: [3, 10, 23], b: [0.05, -0.3, 0.95], tw: 4, ln: -7, cr: 2, rm: 21, R: ST.R }),
    k(3.0, { tw: -5, ln: 2, cr: 2, rm: 22, R: [5, -1] }, GUARD_2H),
  ] },

  // ======== spear: right hand on the butt end at the hip, left hand forward guiding the shaft. The rear hand drives
  // the shaft through the front hand (hg = how far ahead the left hand is: it closes as the point goes out).
  sp_l1: { keys: [            // quick jab
    k(0, { tw: -25, cr: 2, rm: 0, L: ST.L, R: ST.R }, GUARD_SP),
    k(0.85, { g: [8, -2, 0], b: [-0.2, 0.97, 0.08], hg: 20, tw: -30, ln: -3, cr: 3, rm: -1, L: ST.L, R: ST.R }),
    k(1.0, { g: [8, -1, 0], hg: 19, tw: -29, ln: -2, cr: 3, rm: -0.5, e: 'in' }),
    k(1.35, { g: [4, 17, 2], b: [-0.12, 0.99, 0.03], hg: 5, tw: 0, ln: 9, cr: 4.5, rm: 6, L: [-5, 8], e: 'out' }),
    k(2.0, { g: [4, 17, 2], hg: 5, tw: 1, ln: 9, cr: 4.5, rm: 7 }),
    k(2.4, { g: [6, 8, 0], b: [-0.18, 0.98, 0.06], hg: 12, tw: -14, ln: 5, cr: 3, rm: 6 }),
    k(3.0, { tw: -25, ln: 0, cr: 2, rm: 4, L: [-5, 2] }, GUARD_SP),
  ] },
  sp_l2: { keys: [            // stepping second jab, aimed higher
    k(0, { tw: -25, cr: 2, rm: 0, L: ST.L, R: ST.R }, GUARD_SP),
    k(0.8, { g: [8, -3, 2], b: [-0.2, 0.96, 0.18], hg: 20, tw: -32, ln: -3, cr: 3, rm: -1, L: ST.L, R: ST.R }),
    k(1.0, { g: [8, -2, 2], hg: 19, tw: -31, ln: -2, cr: 3, rm: 0, e: 'in' }),
    k(1.35, { g: [4, 18, 7], b: [-0.12, 0.98, 0.16], hg: 5, tw: 4, ln: 10, cr: 5, rm: 9, L: [-5, 11], R: [5, -7], e: 'out' }),
    k(2.0, { g: [4, 18, 7], hg: 5, tw: 5, ln: 10, cr: 5, rm: 10 }),
    k(2.4, { g: [6, 8, 1], b: [-0.18, 0.98, 0.08], hg: 12, tw: -14, ln: 5, cr: 3, rm: 9 }),
    k(3.0, { tw: -25, ln: 0, cr: 2, rm: 7, R: [5, -2], L: [-5, 2] }, GUARD_SP),
  ] },
  sp_l3: { keys: [            // the shaft swung round: the spear's one cut
    k(0, { tw: -25, cr: 2, rm: 0, L: ST.L, R: ST.R }, GUARD_SP),
    k(0.85, { g: [6, -2, 2], b: [0.6, 0.8, 0.05], hg: 16, tw: -45, ln: -2, cr: 4, rm: 0, L: ST.L, R: ST.R }),
    k(1.0, { g: [6, -1, 2], b: [0.52, 0.85, 0.05], tw: -40, ln: 0, cr: 4, rm: 1, e: 'in' }),
    k(1.5, { g: [3, 6, 2], b: [-0.3, 0.95, 0.05], tw: 5, ln: 6, cr: 5, rm: 7, R: [6, 6], e: 'lin' }),
    k(2.0, { g: [-2, 6, 2], b: [-0.85, 0.52, 0.05], tw: 35, ln: 6, cr: 5, rm: 9, e: 'lin' }),
    k(2.5, { g: [-2, 6, 2], b: [-0.85, 0.5, 0.05], tw: 34, ln: 5, cr: 5, rm: 9, L: ST.L }),
    k(3.0, { tw: -25, ln: 0, cr: 2, rm: 9, L: [-5, 1] }, GUARD_SP),
  ] },
  sp_heavy: { keys: [         // coiled far back over the rear leg, then the full lunge, the shaft driven all the way through
    k(0, { tw: -25, cr: 2, rm: 0, L: ST.L, R: ST.R }, GUARD_SP),
    k(0.9, { g: [9, -8, 0], b: [-0.2, 0.97, 0.08], hg: 22, tw: -50, ln: -8, cr: 7, rm: -3, L: ST.L, R: ST.R }),
    k(1.0, { g: [9, -7, 0], hg: 21, tw: -48, ln: -7, cr: 7, rm: -2, e: 'in' }),
    k(1.45, { g: [3, 20, 3], b: [-0.08, 1, 0], hg: 4, tw: 10, ln: 16, cr: 10, rm: 14, L: [-7, 20], R: [5, -11], e: 'out' }),
    k(2.1, { g: [3, 20, 3], hg: 4, tw: 10, ln: 16, cr: 10, rm: 15 }),
    k(2.6, { g: [6, 8, 1], b: [-0.18, 0.98, 0.06], hg: 12, tw: -15, ln: 8, cr: 7, rm: 13 }),
    k(3.0, { tw: -25, ln: 0, cr: 2, rm: 10, L: [-5, 3], R: [5, -3] }, GUARD_SP),
  ] },
  sp_charged: { keys: [       // raised high, then the point driven down into the ground ahead
    k(0, { g: [6, -2, 14], b: [-0.1, 0.9, 0.42], hg: 18, tw: -20, ln: -10, cr: 3, rm: 0, L: ST.L, R: ST.R }),
    k(1.0, { g: [6, -3, 16], b: [-0.1, 0.85, 0.52], hg: 18, tw: -18, ln: -12, cr: 3, rm: 2, e: 'in' }),
    k(1.35, { g: [3, 14, 4], b: [-0.05, 0.97, -0.22], hg: 8, tw: 0, ln: 16, cr: 10, rm: 12, L: [-6, 14], e: 'out' }),
    k(1.55, { g: [2, 16, -2], b: [0, 0.93, -0.36], hg: 6, tw: 2, ln: 20, cr: 12, rm: 14 }),
    k(2.3, { g: [2, 16, -3], b: [0, 0.93, -0.36], hg: 6, tw: 2, ln: 20, cr: 12, rm: 14 }),
    k(2.8, { g: [5, 8, 1], b: [-0.15, 0.95, -0.1], hg: 12, tw: -15, ln: 10, cr: 6, rm: 14, R: ST.R }),
    k(3.0, { tw: -25, ln: 0, cr: 2, rm: 14, R: [5, -1] }, GUARD_SP),
  ], ev: [[1.5, 'ground', 0.6]] },
  sp_dodge: { keys: [         // running thrust
    k(0, { g: [7, 0, 0], b: [-0.15, 0.99, 0.05], hg: 18, tw: -30, ln: 6, cr: 5, rm: 0, L: ST.L, R: ST.R }),
    k(1.0, { g: [7, 2, 0], hg: 17, tw: -28, ln: 8, cr: 5, rm: 5, e: 'in' }),
    k(1.4, { g: [3, 20, 3], b: [-0.05, 1, 0], hg: 4, tw: 8, ln: 16, cr: 8, rm: 22, L: [-6, 14], R: [5, -6], e: 'out' }),
    k(2.2, { g: [3, 20, 3], hg: 4, tw: 8, ln: 14, cr: 8, rm: 26 }),
    k(3.0, { tw: -25, ln: 0, cr: 2, rm: 27, L: [-5, 2], R: [5, -3] }, GUARD_SP),
  ] },
};
for (const n in ANIMS) { ANIMS[n].name = n; compileClip(ANIMS[n]); }
