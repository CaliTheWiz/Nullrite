// ============================================================ ART (procedural textures)
// Everything is drawn in code at boot into offscreen canvases. Coordinates are in points
// (y down, like Pythonista's ui drawing) and the canvas is pre-scaled by ART_S.
let ART_S = 2;
let TEX_ID = 0;

function rgba(r, g, b, a) { return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a === undefined ? 1 : a})`; }
const GLOW_RED = rgba(0.95, 0.12, 0.22, 0.85);
const HOT_RED = rgba(1, 0.15, 0.25, 1);
const GOLD_A = (a) => rgba(0.55, 0.43, 0.2, a);

function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
function makeTex(w, h, fn) {
  const c = newCanvas(w * ART_S, h * ART_S), x = c.getContext('2d');
  x.scale(ART_S, ART_S); fn(x, w, h);
  return { c, w, h, id: ++TEX_ID };
}
function polyPath(x, pts, close) {
  x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
  if (close !== false) x.closePath();
}
function fillP(x, pts, col) { x.fillStyle = col; polyPath(x, pts); x.fill(); }
function lineP(x, pts, w, col) {
  x.strokeStyle = col; x.lineWidth = w; x.lineJoin = 'round'; x.lineCap = 'round'; polyPath(x, pts, false); x.stroke();
}
function withGlow(x, col, blur, fn) { x.save(); x.shadowColor = col; x.shadowBlur = blur * ART_S; x.shadowOffsetX = 0; x.shadowOffsetY = 0; fn(); x.restore(); }
function ovalPath(x, X, Y, W, H) { x.beginPath(); x.ellipse(X + W / 2, Y + H / 2, Math.abs(W / 2), Math.abs(H / 2), 0, 0, TAU); }
function fillOval(x, X, Y, W, H, col) { x.fillStyle = col; ovalPath(x, X, Y, W, H); x.fill(); }
function strokeOval(x, X, Y, W, H, lw, col) { x.strokeStyle = col; x.lineWidth = lw; ovalPath(x, X, Y, W, H); x.stroke(); }
function rectF(x, X, Y, W, H, col) { x.fillStyle = col; x.fillRect(X, Y, W, H); }
function rrectPath(x, X, Y, W, H, r) {
  x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r);
  x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath();
}
function arcPts(cx, cy, r, a0, a1, n) {
  n = n || 24; const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + r * Math.cos(a), cy - r * Math.sin(a)]); }
  return out;
}
function crescentPts(cx, cy, rOut, rIn, a0, a1, n) {
  n = n || 28; const outer = arcPts(cx, cy, rOut, a0, a1, n), inner = [];
  for (let i = n; i >= 0; i--) {
    const u = i / n, a = a0 + (a1 - a0) * u, rr = rOut - (rOut - rIn) * Math.sin(Math.PI * u);
    inner.push([cx + rr * Math.cos(a), cy - rr * Math.sin(a)]);
  }
  return outer.concat(inner);
}

/** Per-pixel texture: fn(x, y) in points (origin top-left, y down) -> [alpha 0..1, r, g, b 0..255]. */
function fieldTex(w, h, fn) {
  const c = newCanvas(w * ART_S, h * ART_S), x = c.getContext('2d'), W = c.width, H = c.height;
  const img = x.createImageData(W, H), d = img.data;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const v = fn((i + 0.5) / ART_S, (j + 0.5) / ART_S), o = (j * W + i) * 4;
    d[o] = v[1]; d[o + 1] = v[2]; d[o + 2] = v[3]; d[o + 3] = Math.max(0, Math.min(255, v[0] * 255));
  }
  x.putImageData(img, 0, 0);
  return { c, w, h, id: ++TEX_ID };
}
function texGlow(r, power) {
  return fieldTex(2 * r, 2 * r, (x, y) => { const d = hypot(x - r, y - r) / r; return [Math.pow(clamp(1 - d, 0, 1), power), 255, 255, 255]; });
}
function texShadow(r) {
  return fieldTex(2 * r, 2 * r, (x, y) => { const d = hypot(x - r, y - r) / r; return [Math.pow(clamp((1 - d) * 1.7, 0, 1), 1.2) * 0.62, 0, 0, 0]; });
}
function texStreak(L, W) {
  return fieldTex(L, W, (x, y) => {
    const X = x - L / 2, Y = y - W / 2;
    return [Math.exp(-Math.pow(X / (L * 0.5), 2) * 2.6 - Math.pow(Y / (W * 0.5), 2) * 3.2), 255, 255, 255];
  });
}
function texRing(r, thick) {
  return fieldTex(2 * r, 2 * r, (x, y) => { const d = hypot(x - r, y - r); return [d < r ? Math.exp(-Math.pow((d - r * 0.8) / thick, 2)) : 0, 255, 255, 255]; });
}
function texSlash(R, spanDeg) {
  const half = spanDeg / 2 * RAD;
  return fieldTex(2 * R, 2 * R, (x, y) => {
    const X = x - R, Y = R - y, r = hypot(X, Y), th = Math.atan2(Y, X);
    if (Math.abs(th) > half) return [0, 255, 255, 255];
    const u = clamp((th + half) / (2 * half), 0, 1), f = Math.pow(clamp(Math.sin(Math.PI * u), 0, 1), 0.7);
    const rc = R * 0.84, hw = R * 0.15 * f + 0.6, dd = (r - rc) / hw;
    const a = Math.pow(clamp(1 - Math.abs(dd), 0, 1), 1.3), k = clamp(dd * 0.5 + 0.5, 0, 1), c = 180 + 75 * k;
    return [a, c, c, c];
  });
}

// ---------------------------------------------------------------- knight (5 views)
const HEM_S = [[54, 86], [48, 93], [41, 88], [32, 95], [23, 88], [16, 93], [10, 86], [3, 90]];
function drawKnight(view, sil) {
  const C = sil ? (() => '#ffffff') : (c => c);
  const cloak = (x, outline, hem, folds) => {
    fillP(x, outline.concat(hem), C('#0b0a0f'));
    if (sil) return;
    for (const tri of folds) fillP(x, tri, rgba(0.10, 0.095, 0.125, 1));
    withGlow(x, GLOW_RED, 3, () => lineP(x, [outline[outline.length - 1]].concat(hem.slice(0, -1)), 1.4, '#8A2432'));
  };
  const pauldron = (x, pts, rivet) => {
    fillP(x, pts, C('#24252f'));
    if (!sil) { lineP(x, [pts[0], pts[1]], 1.2, '#4c4f5e'); fillOval(x, rivet[0] - 1.2, rivet[1] - 1.2, 2.4, 2.4, '#8A2432'); }
  };
  const chest = (x, pts, belt, core, cw) => {
    cw = cw || 3; fillP(x, pts, C('#1a1b23'));
    if (sil) return;
    lineP(x, pts.concat([pts[0]]), 1.0, '#30323e');
    rectF(x, belt[0], belt[1], belt[2], 1.6, GOLD_A(0.85));
    const [cx, cy] = core;
    withGlow(x, GLOW_RED, 4, () => fillP(x, [[cx, cy - 4.5], [cx + cw, cy], [cx, cy + 4.5], [cx - cw, cy]], '#ff2a45'));
  };
  const backPanel = (x, panel, seamX, sigX, sigW) => {
    sigW = sigW || 5; fillP(x, panel, C('#0e0d13'));
    if (sil) return;
    lineP(x, [[seamX, 44], [seamX, 94]], 1.0, rgba(0.16, 0.15, 0.2, 1));
    withGlow(x, GLOW_RED, 3, () => {
      lineP(x, [[sigX - sigW, 54], [sigX + sigW, 54], [sigX, 63], [sigX - sigW, 54]], 1.2, '#8A2432');
      lineP(x, [[sigX, 47], [sigX, 51]], 1.2, '#8A2432');
    });
  };
  const hood = (x, pts, face, cowl, seam) => {
    fillP(x, pts, C('#15131b'));
    if (cowl) fillP(x, cowl, C('#15131b'));
    if (sil) return;
    lineP(x, pts.concat([pts[0]]), 1.2, '#2f2a3a');
    if (seam) lineP(x, seam, 1.0, rgba(0.22, 0.2, 0.27, 1));
    if (face) fillOval(x, face[0], face[1], face[2], face[3], '#030304');
  };
  return (x) => {
    if (view === 'S') {
      cloak(x, [[19, 30], [45, 30], [54, 62], [61, 90]], HEM_S.concat([[10, 62]]),
        [[[24, 36], [17, 88], [25, 88]], [[40, 36], [47, 88], [39, 88]], [[32, 40], [29, 94], [35, 94]]]);
      chest(x, [[24, 34], [40, 34], [38, 56], [32, 62], [26, 56]], [25, 54.5, 14], [32, 45.5]);
      pauldron(x, [[12, 33], [25, 29], [27, 37], [21, 45], [10, 42]], [18, 37]);
      pauldron(x, [[52, 33], [39, 29], [37, 37], [43, 45], [54, 42]], [46, 37]);
      hood(x, [[32, 2], [43, 12], [47, 26], [42, 35], [22, 35], [17, 26], [21, 12]], [23.5, 16, 17, 15], null, [[32, 3], [32, 14]]);
    } else if (view === 'SE') {
      const hem = [[53, 87], [47, 93], [40, 88], [31, 95], [22, 88], [15, 93], [8, 86], [2, 89]];
      cloak(x, [[18, 31], [44, 30], [53, 62], [60, 90]], hem.concat([[7, 62]]),
        [[[22, 37], [14, 88], [22, 88]], [[42, 37], [49, 88], [42, 88]], [[33, 41], [31, 94], [37, 94]]]);
      pauldron(x, [[16, 34], [25, 31], [26, 37], [22, 42], [15, 40]], [20, 37]);
      chest(x, [[30, 34], [44, 35], [43, 56], [38, 62], [31, 56]], [31, 54.5, 12], [38.5, 45.5], 2.3);
      pauldron(x, [[56, 33], [42, 29], [40, 38], [47, 46], [58, 42]], [50, 37]);
      hood(x, [[37, 2], [46, 13], [48, 27], [44, 35], [24, 35], [19, 25], [24, 11]], [30.5, 16, 12.5, 15], null, [[37, 3], [35, 14]]);
    } else if (view === 'E') {
      const hem = [[44, 86], [37, 92], [30, 87], [23, 93], [16, 86], [9, 90], [6, 82]];
      cloak(x, [[22, 31], [39, 31], [45, 60], [50, 90]], hem.concat([[12, 60]]),
        [[[27, 37], [17, 88], [23, 88]], [[34, 39], [36, 92], [41, 90]]]);
      chest(x, [[33, 34], [42, 37], [41, 56], [36, 61], [31, 56]], [32, 54.5, 10], [39.5, 45.5], 1.6);
      pauldron(x, [[23, 32], [36, 29], [40, 37], [34, 46], [22, 42]], [31, 37]);
      hood(x, [[26, 3], [36, 8], [44, 18], [45, 28], [39, 35], [22, 35], [18, 25], [20, 12]], [37, 16, 8, 14], null, [[27, 4], [24, 20], [22, 33]]);
    } else if (view === 'NE') {
      const hem = [[53, 86], [47, 93], [40, 88], [31, 95], [22, 88], [15, 93], [9, 86], [2, 90]];
      cloak(x, [[20, 31], [45, 30], [54, 62], [61, 90]], hem.concat([[9, 62]]),
        [[[23, 37], [16, 88], [24, 88]], [[41, 37], [48, 88], [40, 88]]]);
      backPanel(x, [[23, 31], [46, 31], [49, 70], [37, 76], [20, 70]], 37, 37, 3.5);
      pauldron(x, [[8, 33], [23, 29], [26, 37], [20, 46], [7, 42]], [16, 37]);
      pauldron(x, [[52, 34], [43, 31], [42, 37], [46, 42], [53, 40]], [48, 37]);
      hood(x, [[37, 2], [46, 13], [48, 27], [44, 35], [22, 35], [18, 25], [25, 11]], null,
        [[24, 30], [45, 30], [43, 42], [37, 47], [29, 42]], [[37, 3], [37, 46]]);
      if (!sil) fillP(x, [[45, 15], [47.5, 22], [46, 31], [44.5, 23]], '#030304');
    } else {
      cloak(x, [[19, 30], [45, 30], [54, 62], [61, 90]], HEM_S.concat([[10, 62]]),
        [[[24, 36], [17, 88], [25, 88]], [[40, 36], [47, 88], [39, 88]]]);
      backPanel(x, [[20, 31], [44, 31], [47, 70], [32, 76], [17, 70]], 32, 32);
      pauldron(x, [[12, 33], [25, 29], [27, 37], [21, 45], [10, 42]], [18, 37]);
      pauldron(x, [[52, 33], [39, 29], [37, 37], [43, 45], [54, 42]], [46, 37]);
      hood(x, [[32, 2], [43, 12], [47, 26], [42, 35], [22, 35], [17, 26], [21, 12]], null,
        [[21, 30], [43, 30], [39, 42], [32, 47], [25, 42]], [[32, 3], [32, 46]]);
    }
  };
}
function drawVisor(x) {
  withGlow(x, HOT_RED, 3, () => fillP(x, [[1, 2], [11, 6.5], [21, 2], [21, 4.8], [11, 9], [1, 4.8]], '#ff2a45'));
  lineP(x, [[3.5, 3.8], [11, 7.3], [18.5, 3.8]], 0.7, rgba(1, 0.86, 0.88, 1));
}
function drawSword(x) {
  withGlow(x, GLOW_RED, 4, () => fillP(x, [[1, 14], [5, 10], [9, 14], [5, 18]], '#ff2a45'));
  rectF(x, 8, 12, 9, 4, '#1a1a20');
  for (const X of [10, 13]) lineP(x, [[X, 12], [X + 1.5, 16]], 0.6, '#30303a');
  fillP(x, [[16, 4], [22, 7], [22, 21], [16, 24], [18, 14]], '#2c2d37');
  fillOval(x, 15.5, 3, 3, 3, '#8A2432'); fillOval(x, 15.5, 22, 3, 3, '#8A2432');
  fillP(x, [[22, 8], [94, 9.5], [111, 14], [94, 18.5], [22, 20]], '#2e313b');
  fillP(x, [[22, 8], [94, 9.5], [111, 14], [22, 14]], '#555a68');
  lineP(x, [[22, 8], [94, 9.5], [111, 14]], 0.8, '#a0a6b6');
  withGlow(x, HOT_RED, 4, () => lineP(x, [[27, 14], [90, 14]], 1.8, '#ff3048'));
  for (const X of [42, 60, 78]) fillP(x, [[X, 11.2], [X + 2.5, 14], [X, 16.8], [X - 2.5, 14]], '#0c0c10');
}
function drawSpear(x, w, h) {
  const cy = h / 2;
  fillP(x, [[0, cy], [6, cy - 3], [6, cy + 3]], '#3a3d48');
  rectF(x, 5, cy - 1.8, 112, 3.6, '#26272f');
  for (const X of [34, 54, 108]) rectF(x, X, cy - 2.6, 3, 5.2, GOLD_A(0.9));
  fillP(x, [[114, cy], [118, cy - 5], [122, cy], [118, cy + 5]], '#2c2d37');
  fillP(x, [[120, cy - 3], [138, cy - 6.5], [150, cy], [138, cy + 6.5], [120, cy + 3]], '#3a3d48');
  fillP(x, [[120, cy - 3], [138, cy - 6.5], [150, cy], [120, cy]], '#5a5e6c');
  lineP(x, [[120, cy - 3], [138, cy - 6.5], [150, cy]], 0.8, '#a0a6b6');
  withGlow(x, HOT_RED, 4, () => {
    lineP(x, [[124, cy], [144, cy]], 1.4, '#ff3048');
    fillP(x, [[116, cy - 1.5], [118, cy - 3], [120, cy - 1.5], [118, cy]], '#ff2a45');
  });
}
function drawObelisk(x) {
  rectF(x, 4, 176, 80, 20, '#17171d'); rectF(x, 12, 164, 64, 14, '#1f2027');
  fillP(x, [[20, 164], [44, 164], [44, 34], [27, 34]], '#23242d');
  fillP(x, [[44, 164], [68, 164], [61, 34], [44, 34]], '#111117');
  fillP(x, [[27, 34], [44, 34], [44, 4]], '#2e2f3a');
  fillP(x, [[44, 34], [61, 34], [44, 4]], '#16161d');
  rectF(x, 4, 176, 80, 1.5, GOLD_A(0.75)); rectF(x, 12, 164, 64, 1.2, GOLD_A(0.75));
  lineP(x, [[20, 164], [27, 34], [44, 4]], 1.0, '#3a3c48');
  lineP(x, [[44, 4], [44, 164]], 0.8, '#2c2d38');
  withGlow(x, GLOW_RED, 3, () => {
    for (let i = 0; i < 7; i++) {
      const y = 92 + i * 10, k = i % 3;
      if (k === 0) { lineP(x, [[29, y], [39, y]], 1.2, '#8A2432'); lineP(x, [[34, y - 3], [34, y + 3]], 1.2, '#8A2432'); }
      else if (k === 1) lineP(x, [[30, y - 3], [34, y + 2], [38, y - 3]], 1.2, '#8A2432');
      else lineP(x, [[34, y - 3], [37, y], [34, y + 3], [31, y], [34, y - 3]], 1.0, '#8A2432');
    }
    lineP(x, [[44, 84], [44, 160]], 1.2, rgba(0.8, 0.15, 0.22, 0.7));
  });
  withGlow(x, HOT_RED, 8, () => fillP(x, [[44, 60], [51, 72], [44, 84], [37, 72]], '#ff2a45'));
  fillP(x, [[44, 64], [47, 72], [44, 80], [41, 72]], rgba(1, 0.75, 0.8, 1));
}

// ---------------------------------------------------------------- sentinel (5 views)
function drawSentinel(view, sil) {
  const C = sil ? (() => '#ffffff') : (c => c);
  const M = pts => pts.map(p => [132 - p[0], p[1]]);
  const gold = GOLD_A(0.85);
  const glowLines = (x, lines) => withGlow(x, GLOW_RED, 4, () => { for (const p of lines) lineP(x, p, 1.2, '#8A2432'); });
  const vents = (x, cx, top, n) => withGlow(x, HOT_RED, 5, () => {
    for (let i = 0; i < (n || 4); i++) rectF(x, cx - 6, top + i * 12, 12, 4, i % 2 === 0 ? '#ff2a45' : '#c22a40');
  });
  const coreRing = (x, X, Y, W, H) => {
    fillOval(x, X, Y, W, H, '#060608');
    withGlow(x, GLOW_RED, 4, () => strokeOval(x, X, Y, W, H, 1.6, '#8A2432'));
  };
  return (x) => {
    if (view === 'S' || view === 'N') {
      const back = view === 'N';
      const leg = [[36, 118], [58, 118], [61, 164], [29, 164]], foot = [[24, 160], [64, 160], [66, 170], [22, 170]];
      for (const p of [leg, M(leg)]) fillP(x, p, C(back ? '#131318' : '#16161c'));
      for (const p of [foot, M(foot)]) fillP(x, p, C('#101015'));
      if (!sil) {
        const knee = [[34, 128], [60, 128], [56, 138], [38, 138]];
        for (const q of [knee, M(knee)]) { fillP(x, q, back ? '#24252e' : '#2a2b35'); if (!back) lineP(x, q.concat([q[0]]), 1.0, '#8A2432'); }
      }
      fillP(x, [[38, 106], [94, 106], [88, 124], [44, 124]], C('#1b1b22'));
      fillP(x, [[12, 58], [27, 56], [31, 104], [17, 108]], C('#18181e'));
      fillP(x, [[13, 104], [31, 102], [32, 118], [14, 120]], C('#22232b'));
      fillP(x, M([[12, 58], [27, 56], [29, 94], [17, 96]]), C('#18181e'));
      fillP(x, [[22, 44], [110, 44], [98, 110], [34, 110]], C('#1d1e26'));
      if (!sil) {
        fillP(x, [[22, 44], [40, 44], [44, 110], [34, 110]], '#121217');
        fillP(x, M([[22, 44], [40, 44], [44, 110], [34, 110]]), '#121217');
        rectF(x, 22, 44, 88, 1.8, gold); rectF(x, 40, 106, 52, 1.4, gold);
        if (back) {
          fillP(x, [[38, 50], [94, 50], [88, 104], [44, 104]], '#18181e');
          for (const cx of [48, 84]) fillOval(x, cx - 7, 56, 14, 14, '#060608');
          glowLines(x, [[[41, 63], [48, 56], [55, 63]], [[77, 63], [84, 56], [91, 63]]]);
          vents(x, 66, 64);
        } else {
          coreRing(x, 48, 58, 36, 36);
          glowLines(x, [[[50, 70], [38, 62], [38, 50]], [[50, 86], [40, 96], [40, 104]],
            M([[50, 70], [38, 62], [38, 50]]), M([[50, 86], [40, 96], [40, 104]])]);
        }
      }
      for (const cx of [24, 108]) fillOval(x, cx - 10, 42, 20, 20, C('#0b0b0f'));
      fillP(x, [[54, 16], [78, 16], [83, 40], [66, 50], [49, 40]], C(back ? '#1d1e26' : '#22232c'));
      fillP(x, [[55, 22], [38, 2], [51, 26]], C('#2c2d37'));
      fillP(x, M([[55, 22], [38, 2], [51, 26]]), C('#2c2d37'));
      if (!sil) {
        lineP(x, [[54, 16], [78, 16]], 1.0, '#4a4d5c');
        if (back) lineP(x, [[66, 18], [66, 48]], 1.0, '#33343f');
        else withGlow(x, HOT_RED, 5, () => fillP(x, [[55, 29], [77, 29], [74, 34], [58, 34]], '#ff2a45'));
      }
    } else if (view === 'SE') {
      fillP(x, [[40, 118], [58, 118], [60, 164], [34, 164]], C('#121217'));
      fillP(x, [[72, 118], [98, 118], [102, 164], [70, 164]], C('#16161c'));
      fillP(x, [[30, 160], [62, 160], [63, 170], [28, 170]], C('#0e0e12'));
      fillP(x, [[66, 160], [106, 160], [108, 170], [64, 170]], C('#101015'));
      if (!sil) {
        fillP(x, [[74, 122], [88, 122], [89, 160], [72, 160]], '#20212a');
        for (const q of [[[70, 128], [98, 128], [94, 138], [74, 138]], [[40, 128], [58, 128], [55, 136], [42, 136]]]) {
          fillP(x, q, '#2a2b35'); lineP(x, q.concat([q[0]]), 1.0, '#8A2432');
        }
      }
      fillP(x, [[42, 106], [98, 106], [92, 124], [48, 124]], C('#1b1b22'));
      fillP(x, [[18, 58], [30, 56], [32, 100], [22, 104]], C('#141419'));
      fillP(x, [[19, 100], [32, 99], [33, 112], [20, 114]], C('#1c1d24'));
      fillP(x, [[104, 56], [122, 60], [118, 96], [104, 98]], C('#18181e'));
      fillP(x, [[26, 44], [114, 44], [104, 110], [40, 110]], C('#1d1e26'));
      if (!sil) {
        fillP(x, [[26, 44], [37, 44], [42, 110], [40, 110]], '#121217');
        fillP(x, [[98, 44], [114, 44], [104, 110], [92, 110]], '#111116');
        rectF(x, 26, 44, 88, 1.8, gold); rectF(x, 46, 106, 50, 1.4, gold);
        coreRing(x, 56, 59, 32, 34);
        glowLines(x, [[[57, 70], [46, 62], [46, 50]], [[57, 86], [48, 96], [48, 104]], [[87, 70], [95, 62], [95, 50]]]);
      }
      fillOval(x, 22, 43, 16, 18, C('#0b0b0f')); fillOval(x, 100, 42, 22, 20, C('#0b0b0f'));
      fillP(x, [[60, 16], [84, 16], [89, 40], [72, 50], [55, 40]], C('#22232c'));
      fillP(x, [[61, 22], [46, 3], [57, 26]], C('#272832'));
      fillP(x, [[83, 22], [98, 3], [87, 27]], C('#2c2d37'));
      if (!sil) {
        lineP(x, [[60, 16], [84, 16]], 1.0, '#4a4d5c');
        withGlow(x, HOT_RED, 5, () => fillP(x, [[63, 29], [85, 29], [82, 34], [66, 34]], '#ff2a45'));
      }
    } else if (view === 'E') {
      fillP(x, [[46, 118], [64, 118], [62, 164], [42, 164]], C('#101015'));
      fillP(x, [[36, 160], [70, 160], [70, 170], [34, 170]], C('#0c0c10'));
      fillP(x, [[60, 118], [82, 118], [86, 164], [58, 164]], C('#16161c'));
      fillP(x, [[54, 160], [96, 160], [98, 170], [52, 170]], C('#101015'));
      if (!sil) { const q = [[60, 128], [86, 128], [84, 138], [62, 138]]; fillP(x, q, '#2a2b35'); lineP(x, q.concat([q[0]]), 1.0, '#8A2432'); }
      fillP(x, [[46, 106], [86, 106], [84, 124], [50, 124]], C('#1b1b22'));
      fillP(x, [[40, 46], [86, 44], [96, 64], [92, 96], [80, 110], [48, 110], [42, 80]], C('#1d1e26'));
      if (!sil) {
        fillP(x, [[40, 46], [52, 46], [54, 110], [48, 110], [42, 80]], '#121217');
        rectF(x, 42, 44, 44, 1.8, gold);
        fillOval(x, 85, 66, 11, 24, '#060608');
        glowLines(x, [[[86, 70], [74, 62], [66, 62]], [[86, 86], [76, 96], [66, 98]]]);
        vents(x, 46, 58, 3);
      }
      fillOval(x, 54, 42, 18, 20, C('#0b0b0f'));
      fillP(x, [[58, 16], [80, 18], [88, 32], [84, 42], [66, 48], [56, 38]], C('#22232c'));
      fillP(x, [[62, 22], [34, 6], [58, 30]], C('#2c2d37'));
      fillP(x, [[58, 56], [74, 54], [78, 96], [62, 98]], C('#1a1a21'));
      fillP(x, [[60, 96], [78, 95], [79, 108], [61, 110]], C('#22232b'));
      if (!sil) {
        lineP(x, [[58, 16], [80, 18], [88, 32]], 1.0, '#4a4d5c');
        withGlow(x, HOT_RED, 5, () => fillP(x, [[78, 28], [88, 30], [86, 34], [76, 33]], '#ff2a45'));
      }
    } else {
      fillP(x, [[36, 118], [58, 118], [60, 164], [30, 164]], C('#141419'));
      fillP(x, [[76, 118], [94, 118], [96, 164], [72, 164]], C('#101015'));
      fillP(x, [[24, 160], [64, 160], [66, 170], [22, 170]], C('#0e0e12'));
      fillP(x, [[70, 160], [100, 160], [101, 170], [69, 170]], C('#0c0c10'));
      fillP(x, [[36, 106], [92, 106], [86, 124], [42, 124]], C('#1b1b22'));
      fillP(x, [[8, 58], [23, 56], [27, 104], [13, 108]], C('#18181e'));
      fillP(x, [[9, 104], [27, 102], [28, 118], [10, 120]], C('#22232b'));
      fillP(x, [[100, 58], [112, 60], [108, 94], [98, 96]], C('#141419'));
      fillP(x, [[18, 44], [106, 44], [92, 110], [28, 110]], C('#1d1e26'));
      if (!sil) {
        fillP(x, [[34, 50], [90, 50], [84, 104], [40, 104]], '#18181e');
        fillP(x, [[18, 44], [32, 44], [38, 110], [28, 110]], '#121217');
        rectF(x, 18, 44, 88, 1.8, gold);
        for (const cx of [44, 76]) fillOval(x, cx - 6, 56, 12, 13, '#060608');
        vents(x, 60, 64);
      }
      fillOval(x, 10, 42, 22, 20, C('#0b0b0f')); fillOval(x, 94, 43, 16, 18, C('#0b0b0f'));
      fillP(x, [[50, 16], [74, 16], [79, 40], [62, 48], [45, 40]], C('#1d1e26'));
      fillP(x, [[51, 22], [34, 2], [47, 26]], C('#2c2d37'));
      fillP(x, [[73, 22], [86, 5], [77, 26]], C('#272832'));
      if (!sil) { lineP(x, [[50, 16], [74, 16]], 1.0, '#4a4d5c'); lineP(x, [[62, 18], [62, 46]], 1.0, '#33343f'); }
    }
  };
}
function drawCore(x, w, h) {
  withGlow(x, HOT_RED, 6, () => fillP(x, [[w / 2, 2], [w - 3, h / 2], [w / 2, h - 2], [3, h / 2]], '#ff2a45'));
  fillP(x, [[w / 2, 7], [w / 2 + 4, h / 2], [w / 2, h - 7], [w / 2 - 4, h / 2]], rgba(1, 0.78, 0.82, 1));
}
function drawPlate(x) {
  fillP(x, [[2, 12], [30, 2], [45, 9], [41, 23], [12, 29]], '#23242d');
  fillP(x, [[2, 12], [30, 2], [45, 9], [24, 13]], '#30313c');
  lineP(x, [[2, 12], [30, 2], [45, 9]], 1.0, '#5a5e6c');
  withGlow(x, GLOW_RED, 3, () => lineP(x, [[12, 20], [24, 16], [34, 18]], 1.2, '#8A2432'));
}
function drawHalberd(x) {
  const cy = 25;
  fillP(x, [[0, cy], [10, cy - 4], [10, cy + 4]], '#3a3d48');
  rectF(x, 8, cy - 3, 196, 6, '#24252d');
  for (const X of [40, 62, 150]) rectF(x, X, cy - 4, 4, 8, GOLD_A(0.9));
  fillP(x, [[160, cy - 2], [176, 3], [206, 1], [222, 12], [210, cy - 2]], '#3a3d48');
  fillP(x, [[176, 3], [206, 1], [222, 12], [196, 10]], '#5a5e6c');
  fillP(x, [[168, cy + 2], [178, cy + 16], [190, cy + 3]], '#30323c');
  fillP(x, [[200, cy - 4], [230, cy], [200, cy + 4]], '#5a5e6c');
  lineP(x, [[176, 3], [206, 1], [222, 12]], 1.0, '#a0a6b6');
  withGlow(x, HOT_RED, 4, () => {
    lineP(x, [[178, 8], [204, 6], [216, 14]], 1.6, '#ff3048');
    lineP(x, [[60, cy], [150, cy]], 1.0, rgba(1, 0.2, 0.3, 0.8));
  });
}

// ---------------------------------------------------------------- arena
function drawTileBase(seed) {
  return (x, w, h) => {
    const R = mulberry32(seed), U = (a, b) => a + R() * (b - a), RI = (a, b) => a + Math.floor(R() * (b - a + 1));
    rectF(x, 0, 0, w, h, '#0D0E12');
    for (let i = 0; i < 70; i++) { const s = U(6, 34); rectF(x, U(-10, w), U(-10, h), s, s * U(0.4, 1.2), rgba(1, 1, 1, U(0.004, 0.018))); }
    for (let i = 0; i < 40; i++) { const s = U(4, 22); rectF(x, U(-10, w), U(-10, h), s, s * U(0.4, 1.2), rgba(0, 0, 0, U(0.05, 0.12))); }
    for (let n = RI(1, 3); n > 0; n--) {
      let X = U(10, w - 10), Y = U(10, h - 10); const pts = [[X, Y]];
      for (let k = RI(3, 6); k > 0; k--) { X += U(-22, 22); Y += U(-22, 22); pts.push([X, Y]); }
      lineP(x, pts, 0.8, rgba(0, 0, 0, 0.5));
    }
    const step = 16, dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]], cells = Math.floor(w / step);
    for (let n = RI(3, 5); n > 0; n--) {
      let X = RI(2, cells - 2) * step, Y = RI(2, cells - 2) * step; const pts = [[X, Y]];
      let d = dirs[Math.floor(R() * 8)];
      for (let k = RI(2, 5); k > 0; k--) {
        if (R() < 0.5) d = dirs[Math.floor(R() * 8)];
        const L = RI(1, 3) * step;
        X = clamp(X + d[0] * L, step, w - step); Y = clamp(Y + d[1] * L, step, h - step); pts.push([X, Y]);
      }
      lineP(x, pts, 2.0, '#2A1E24');
      withGlow(x, rgba(0.8, 0.12, 0.2, 0.6), 4, () => {
        for (const e of [pts[0], pts[pts.length - 1]]) fillOval(x, e[0] - 2.5, e[1] - 2.5, 5, 5, '#8A2432');
      });
    }
    x.strokeStyle = '#050507'; x.lineWidth = 3; x.strokeRect(0, 0, w, h);
    lineP(x, [[2.5, h - 2.5], [2.5, 2.5], [w - 2.5, 2.5]], 1.0, rgba(1, 1, 1, 0.035));
  };
}
function drawTileRunes(seed) {
  return (x, w, h) => {
    const R = mulberry32(seed * 7 + 3), U = (a, b) => a + R() * (b - a), RI = (a, b) => a + Math.floor(R() * (b - a + 1));
    const col = rgba(1, 1, 1, 0.55), faint = rgba(1, 1, 1, 0.35);
    for (const [cx, cy, sx, sy] of [[10, 10, 1, 1], [w - 10, 10, -1, 1], [10, h - 10, 1, -1], [w - 10, h - 10, -1, -1]])
      lineP(x, [[cx, cy + sy * 12], [cx, cy], [cx + sx * 12, cy]], 1.0, col);
    if (R() < 0.65) {
      const cx = w / 2 + (RI(0, 2) - 1) * 32, cy = h / 2 + (RI(0, 2) - 1) * 32, s = U(10, 18);
      lineP(x, [[cx, cy - s], [cx + s, cy], [cx, cy + s], [cx - s, cy], [cx, cy - s]], 1.2, col);
      const kind = RI(0, 2);
      if (kind === 0) { lineP(x, [[cx - s * 0.5, cy], [cx + s * 0.5, cy]], 1, col); lineP(x, [[cx, cy - s * 0.5], [cx, cy + s * 0.5]], 1, col); }
      else if (kind === 1) strokeOval(x, cx - s * 0.35, cy - s * 0.35, s * 0.7, s * 0.7, 1, col);
      else {
        const t = s * 0.45;
        lineP(x, [[cx, cy - t], [cx + t, cy], [cx, cy + t], [cx - t, cy], [cx, cy - t]], 1, col);
        for (let a = 0; a < 4; a++) {
          const ang = a * Math.PI / 2;
          lineP(x, [[cx + Math.cos(ang) * s, cy + Math.sin(ang) * s], [cx + Math.cos(ang) * (s + 6), cy + Math.sin(ang) * (s + 6)]], 1, col);
        }
      }
    }
    for (let n = RI(2, 4); n > 0; n--) {
      const horiz = R() < 0.5, a = RI(2, 10) * 16, b0 = RI(1, 5) * 16, b1 = Math.min(b0 + RI(2, 5) * 16, w - 16);
      if (horiz) { lineP(x, [[b0, a], [b1, a]], 0.8, faint); for (let tx = b0; tx < b1; tx += 16) lineP(x, [[tx, a - 3], [tx, a + 3]], 0.8, faint); }
      else { lineP(x, [[a, b0], [a, b1]], 0.8, faint); for (let ty = b0; ty < b1; ty += 16) lineP(x, [[a - 3, ty], [a + 3, ty]], 0.8, faint); }
    }
  };
}
function drawRitual(x, w) {
  const c = w / 2, circ = (r, lw, col) => strokeOval(x, c - r, c - r, 2 * r, 2 * r, lw, col);
  const crim = rgba(0.54, 0.14, 0.2, 0.8), gold = rgba(0.69, 0.54, 0.24, 0.45);
  withGlow(x, rgba(0.9, 0.1, 0.2, 0.7), 6, () => {
    circ(178, 2.2, crim); circ(126, 1.4, rgba(0.54, 0.14, 0.2, 0.6));
    for (const off of [Math.PI / 2, -Math.PI / 2]) {
      const pts = [0, 1, 2].map(k => [c + 126 * Math.cos(off + k * TAU / 3), c - 126 * Math.sin(off + k * TAU / 3)]);
      lineP(x, pts.concat([pts[0]]), 1.2, rgba(0.54, 0.14, 0.2, 0.5));
    }
    circ(52, 2.0, rgba(0.54, 0.14, 0.2, 0.65));
  });
  circ(168, 1.0, gold); circ(60, 1.0, gold);
  for (let i = 0; i < 72; i++) {
    const a = i * TAU / 72, r1 = i % 6 === 0 ? 178 : 173;
    lineP(x, [[c + 168 * Math.cos(a), c - 168 * Math.sin(a)], [c + r1 * Math.cos(a), c - r1 * Math.sin(a)]], 1.0, gold);
  }
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + Math.PI / 8, X = c + 148 * Math.cos(a), Y = c - 148 * Math.sin(a);
    lineP(x, [[X, Y - 7], [X + 5, Y], [X, Y + 7], [X - 5, Y], [X, Y - 7]], 1.0, gold);
  }
}

// ---------------------------------------------------------------- HUD pieces
function drawStickBase(x, w, h) {
  const c = w / 2;
  fillOval(x, 4, 4, w - 8, h - 8, rgba(0.03, 0.03, 0.05, 0.45));
  withGlow(x, rgba(0.9, 0.12, 0.2, 0.6), 5, () => strokeOval(x, 5, 5, w - 10, h - 10, 2, rgba(0.54, 0.14, 0.2, 0.9)));
  strokeOval(x, 22, 22, w - 44, h - 44, 1, rgba(0.7, 0.55, 0.25, 0.25));
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    fillP(x, [[c + 56 * Math.cos(a), c - 56 * Math.sin(a)], [c + 49 * Math.cos(a + 0.12), c - 49 * Math.sin(a + 0.12)],
      [c + 49 * Math.cos(a - 0.12), c - 49 * Math.sin(a - 0.12)]], rgba(0.75, 0.2, 0.28, 0.7));
  }
}
function drawStickKnob(x, w, h) {
  fillOval(x, 5, 5, w - 10, h - 10, rgba(0.09, 0.085, 0.11, 0.95));
  withGlow(x, rgba(1, 0.15, 0.25, 0.9), 6, () => strokeOval(x, 5, 5, w - 10, h - 10, 3, '#c22a40'));
  fillOval(x, 12, 10, w - 24, (h - 20) * 0.5, rgba(1, 1, 1, 0.06));
  fillOval(x, w / 2 - 3, h / 2 - 3, 6, 6, '#ff3048');
}
function iconLight(x, c, r) {
  withGlow(x, rgba(1, 0.15, 0.25, 0.9), 5, () => fillP(x, crescentPts(c, c, r * 0.66, r * 0.48, -25 * RAD, 115 * RAD), rgba(1, 0.2, 0.3, 0.95)));
  lineP(x, [[c - 0.42 * r, c + 0.42 * r], [c + 0.36 * r, c - 0.36 * r]], 3.4, '#ece5d6');
  const gx = c - 0.2 * r, gy = c + 0.2 * r;
  lineP(x, [[gx - 0.13 * r, gy - 0.13 * r], [gx + 0.13 * r, gy + 0.13 * r]], 2.6, '#9a9fae');
}
function iconHeavy(x, c, r) {
  withGlow(x, HOT_RED, 7, () => fillP(x, crescentPts(c, c, r * 0.7, r * 0.42, 165 * RAD, 15 * RAD), rgba(1, 0.16, 0.26, 1)));
  fillP(x, [[c - 0.14 * r, c - 0.42 * r], [c + 0.14 * r, c - 0.42 * r], [c + 0.16 * r, c + 0.28 * r], [c, c + 0.56 * r], [c - 0.16 * r, c + 0.28 * r]], '#ece5d6');
  lineP(x, [[c, c - 0.36 * r], [c, c + 0.36 * r]], 1.2, '#ff3048');
  lineP(x, [[c - 0.3 * r, c - 0.42 * r], [c + 0.3 * r, c - 0.42 * r]], 3.0, '#9a9fae');
}
function iconDodge(x, c, r) {
  for (let i = 0; i < 3; i++) {
    const X = c - 0.36 * r + i * 0.26 * r;
    lineP(x, [[X, c - 0.3 * r], [X + 0.22 * r, c], [X, c + 0.3 * r]], 3.4, rgba(0.93, 0.9, 0.84, 0.35 + 0.3 * i));
  }
  withGlow(x, rgba(1, 0.15, 0.25, 0.9), 4, () => {
    for (const dy of [-0.16, 0.16]) lineP(x, [[c - 0.6 * r, c + dy * r], [c - 0.42 * r, c + dy * r]], 2.0, rgba(1, 0.2, 0.3, 0.9));
  });
}
function iconFlask(x, c, r) {
  withGlow(x, HOT_RED, 6, () => fillOval(x, c - 0.42 * r, c - 0.18 * r, 0.84 * r, 0.8 * r, '#c22a40'));
  rectF(x, c - 0.12 * r, c - 0.5 * r, 0.24 * r, 0.36 * r, '#ece5d6');
  rectF(x, c - 0.18 * r, c - 0.58 * r, 0.36 * r, 0.1 * r, '#9a9fae');
  fillOval(x, c - 0.26 * r, c - 0.06 * r, 0.18 * r, 0.24 * r, rgba(1, 1, 1, 0.35));
}
function iconGun(x, c, r) {
  withGlow(x, HOT_RED, 6, () => fillP(x, [[c + 0.42 * r, c - 0.2 * r], [c + 0.62 * r, c - 0.1 * r], [c + 0.42 * r, c]], '#ff3048'));
  fillP(x, [[c - 0.42 * r, c - 0.2 * r], [c + 0.44 * r, c - 0.2 * r], [c + 0.44 * r, c - 0.02 * r], [c - 0.42 * r, c - 0.02 * r]], '#ece5d6');
  fillP(x, [[c - 0.4 * r, c - 0.04 * r], [c - 0.08 * r, c - 0.04 * r], [c - 0.18 * r, c + 0.46 * r], [c - 0.46 * r, c + 0.42 * r]], '#9a9fae');
  lineP(x, [[c - 0.1 * r, c + 0.02 * r], [c - 0.02 * r, c + 0.2 * r]], 1.4, '#9a9fae');
  rectF(x, c - 0.2 * r, c - 0.24 * r, 0.1 * r, 0.26 * r, GOLD_A(0.9));
}
function iconBomb(x, c, r) {
  fillOval(x, c - 0.42 * r, c - 0.3 * r, 0.84 * r, 0.84 * r, '#2a2b33');
  fillOval(x, c - 0.28 * r, c - 0.2 * r, 0.26 * r, 0.22 * r, '#4a4d5c');
  lineP(x, [[c + 0.18 * r, c - 0.26 * r], [c + 0.32 * r, c - 0.5 * r]], 1.6, '#9a9fae');
  withGlow(x, rgba(1, 0.5, 0.2, 1), 6, () => fillP(x, [[c + 0.34 * r, c - 0.66 * r], [c + 0.44 * r, c - 0.52 * r], [c + 0.34 * r, c - 0.4 * r], [c + 0.24 * r, c - 0.52 * r]], '#ffb070'));
}
function buttonTex(r, icon) {
  const s = 2 * r + 12;
  return makeTex(s, s, (x) => {
    const c = s / 2;
    fillOval(x, c - r, c - r, 2 * r, 2 * r, rgba(0.03, 0.03, 0.045, 0.82));
    withGlow(x, rgba(0.9, 0.12, 0.2, 0.8), 6, () => strokeOval(x, c - r + 1.5, c - r + 1.5, 2 * r - 3, 2 * r - 3, 3, '#8A2432'));
    strokeOval(x, c - r + 7, c - r + 7, 2 * r - 14, 2 * r - 14, 1, rgba(0.72, 0.56, 0.26, 0.28));
    for (let i = 0; i < 24; i++) {
      const a = i * TAU / 24, L = i % 6 === 0 ? 4 : 2, r0 = r - 10;
      lineP(x, [[c + r0 * Math.cos(a), c - r0 * Math.sin(a)], [c + (r0 - L) * Math.cos(a), c - (r0 - L) * Math.sin(a)]], 1, rgba(0.72, 0.56, 0.26, 0.35));
    }
    icon(x, c, r);
  });
}
function drawSlot(x, w) {
  const c = w / 2, r = c - 6;
  fillOval(x, c - r, c - r, 2 * r, 2 * r, rgba(0.03, 0.03, 0.045, 0.45));
  strokeOval(x, c - r + 1, c - r + 1, 2 * r - 2, 2 * r - 2, 1.5, rgba(0.54, 0.14, 0.2, 0.45));
  lineP(x, [[c - 4, c - 4], [c + 4, c + 4]], 1, rgba(0.72, 0.56, 0.26, 0.35));
  lineP(x, [[c + 4, c - 4], [c - 4, c + 4]], 1, rgba(0.72, 0.56, 0.26, 0.35));
}

// ---------------------------------------------------------------- tint cache + assets
const TINT_CACHE = new Map();
/** Multiply-tint a white/grey texture (Pythonista's SpriteNode.color). Cached per texture+colour. */
function tinted(tex, color) {
  if (!color || color === '#ffffff') return tex;
  const key = tex.id + color;
  let t = TINT_CACHE.get(key);
  if (!t) {
    const c = newCanvas(tex.c.width, tex.c.height), x = c.getContext('2d');
    x.drawImage(tex.c, 0, 0);
    x.globalCompositeOperation = 'multiply'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(tex.c, 0, 0);
    t = { c, w: tex.w, h: tex.h, id: -1 };
    TINT_CACHE.set(key, t);
  }
  return t;
}

const ART = {};
function buildArt(scale) {
  ART_S = scale;
  const A = ART;
  A.glow = texGlow(64, 1.8); A.glowSoft = texGlow(48, 1.0); A.shadow = texShadow(64);
  A.spark = texStreak(48, 10); A.ring = texRing(64, 5);
  A.slash = {};
  const spans = new Set([170]);
  for (const k of WEAPON_ORDER) for (const m of weaponMoves(WEAPONS[k])) { const s = slashSpan(m); if (s) spans.add(s); }
  for (const s of spans) A.slash[s] = texSlash(128, s);
  A.knight = {}; A.knightSil = {}; A.sentinel = {}; A.sentinelSil = {};
  for (const v of VIEWS) {
    A.knight[v] = makeTex(64, 96, drawKnight(v, false)); A.knightSil[v] = makeTex(64, 96, drawKnight(v, true));
    A.sentinel[v] = makeTex(132, 170, drawSentinel(v, false)); A.sentinelSil[v] = makeTex(132, 170, drawSentinel(v, true));
  }
  A.visor = makeTex(22, 10, drawVisor);
  A.weapon = { sword: makeTex(112, 28, drawSword), spear: makeTex(150, 18, drawSpear) };
  A.obelisk = makeTex(88, 196, drawObelisk);
  A.core = makeTex(22, 30, drawCore); A.plate = makeTex(46, 30, drawPlate); A.halberd = makeTex(230, 50, drawHalberd);
  A.tiles = [11, 23, 37, 51].map(s => makeTex(TILE, TILE, drawTileBase(s)));
  A.runes = [11, 23, 37, 51].map(s => makeTex(TILE, TILE, drawTileRunes(s)));
  A.ritual = makeTex(380, 380, drawRitual);
  A.stickBase = makeTex(132, 132, drawStickBase); A.stickKnob = makeTex(58, 58, drawStickKnob);
  A.btn = { light: buttonTex(PRIMARY_R, iconLight), heavy: buttonTex(SLOT_R, iconHeavy), dodge: buttonTex(SLOT_R, iconDodge),
            shoot: buttonTex(SLOT_R, iconGun), flask: buttonTex(SMALL_R, iconFlask), item: buttonTex(SMALL_R, iconBomb) };
  A.slotEmpty = makeTex(2 * SLOT_R + 12, 2 * SLOT_R + 12, drawSlot);
  A.bomb = makeTex(18, 20, (x, w) => iconBomb(x, w / 2, w / 2 + 1));
  // pre-tint everything the game tints at runtime, so no canvas is created mid-fight
  const tints = SPARK_COLORS.concat([CRIMSON, RUNE_GOLD, '#8A2432', '#b3202f', '#ffb070', '#ff8a3a', '#ff9a4a', '#ff8a96',
    '#ffe9d6', '#ffd0a0', '#ff4058', '#ffe2b0', '#fff4f0', '#ffe7c2', '#ff5a6a', '#ffd0c0']);
  for (const col of tints) { tinted(A.glow, col); tinted(A.spark, col); tinted(A.ring, col); }
  for (const s of spans) for (const col of [CRIMSON, '#ffe2b0', '#fff4f0']) tinted(A.slash[s], col);
  for (const col of ['#5c5766', '#524d5c', '#575161', '#4d4545']) tinted(A.glowSoft, col);
  for (const v of VIEWS) { tinted(A.knightSil[v], CRIMSON); tinted(A.sentinelSil[v], CRIMSON); }
  for (const r of A.runes) { tinted(r, RUNE_GOLD); tinted(r, RUNE_CRIMSON); }
  buildRigArt(A);
}
/** Particle texture lookup by key ('spark', 'slash:170', 'knightSil:S', ...). */
function artByKey(key) {
  const i = key.indexOf(':');
  if (i < 0) return ART[key];
  const base = key.slice(0, i), sub = key.slice(i + 1);
  return base === 'slash' ? ART.slash[+sub] : ART[base][sub];
}
