// ============================================================ RENDER (canvas 2D)
// Reads Game state and draws it. HUD layout uses y-up "points" like the Pythonista build
// (origin bottom-left); everything is converted to canvas coordinates here.
class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.W = 852; this.H = 393; this.dpr = 1; this.vignette = null;
  }
  resize(W, H, dpr) {
    this.W = W; this.H = H; this.dpr = dpr;
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
    this.cv.style.width = W + 'px'; this.cv.style.height = H + 'px';
    this.ctx.imageSmoothingEnabled = true; this.ctx.imageSmoothingQuality = 'high';   // crisp downscaled art
    const v = newCanvas(256, 256), x = v.getContext('2d'), g = x.createRadialGradient(128, 128, 60, 128, 128, 182);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.55, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256); this.vignette = v;
    // the player is drawn into his own layer first, so fading / flashing him treats the body as one piece
    const s = dpr * CAMERA_ZOOM, L = PLAYER_LAYER;
    const mk = () => { const c = newCanvas(L.w * s, L.h * s); return { c, x: c.getContext('2d') }; };
    this.pl = mk(); this.plScale = s;
    if (this.gl3d === undefined) {                             // the 3D character renderer (falls back to 2D pictures)
      try { this.gl3d = new CharGL(newCanvas(L.w * s, L.h * s)); USE_3D = true; }
      catch (e) { this.gl3d = null; USE_3D = false; console.warn('3D character off:', e.message); }
    }
    if (this.gl3d && this.boss3d === undefined) {              // the boss in 3D too (2D pictures if it fails)
      try { this.boss3d = new BossGL(newCanvas(BOSS_LAYER.w * s, BOSS_LAYER.h * s)); }
      catch (e) { this.boss3d = null; console.warn('3D boss off:', e.message); }
    }
    this.ghosts = []; for (let i = 0; i < 6; i++) { const q = mk(); q.live = false; q.t0 = 0; q.gx = 0; q.gy = 0; this.ghosts.push(q); }
    this.ghostSeq = 0;
  }
  base() { this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.ctx.globalAlpha = 1; this.ctx.globalCompositeOperation = 'source-over'; }
  // world (x, y-screen-world) -> canvas css px
  sx(x) { return this.W / 2 + (x - this.g.cam_x) * CAMERA_ZOOM + this.g.ox; }
  sy(y) { return this.H / 2 - (y - this.g.cam_y * K) * CAMERA_ZOOM - this.g.oy; }

  /** Draw a texture centred/anchored at canvas (x, y) with rotation (CCW, y-up radians). */
  img(tex, x, y, w, h, o) {
    const c = this.ctx; o = o || {};
    const t = o.color ? tinted(tex, o.color) : tex;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.translate(x, y);
    if (o.rot) c.rotate(-o.rot);
    if (o.sx !== undefined || o.sy !== undefined) c.scale(o.sx === undefined ? 1 : o.sx, o.sy === undefined ? 1 : o.sy);
    c.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    c.globalCompositeOperation = o.blend === 'add' ? 'lighter' : 'source-over';
    const ax = o.ax === undefined ? 0.5 : o.ax, ay = o.ay === undefined ? 0.5 : o.ay;
    c.drawImage(t.c, -ax * w, -(1 - ay) * h, w, h);
  }
  /** Draw on the squashed floor plane at ground (gx, gy). */
  ground(tex, gx, gy, w, h, o) {
    const c = this.ctx; o = o || {};
    const t = o.color ? tinted(tex, o.color) : tex, Z = CAMERA_ZOOM, s = o.scale === undefined ? 1 : o.scale;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.translate(this.sx(gx), this.sy(gy * K));
    c.scale(Z, Z * K);
    if (o.rot) c.rotate(-o.rot);
    if (s !== 1) c.scale(s, s);
    c.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    c.globalCompositeOperation = o.blend === 'add' ? 'lighter' : 'source-over';
    const ax = o.ax === undefined ? 0.5 : o.ax, ay = o.ay === undefined ? 0.5 : o.ay;
    c.drawImage(t.c, -ax * w, -(1 - ay) * h, w, h);
  }
  /** Draw a sprite in the current (entity-local, y-up) transform. */
  local(tex, x, y, w, h, o) {
    const c = this.ctx; o = o || {};
    const t = o.color ? tinted(tex, o.color) : tex;
    c.save();
    c.translate(x, -y);
    if (o.rot) c.rotate(-o.rot);
    if (o.sx !== undefined || o.sy !== undefined) c.scale(o.sx === undefined ? 1 : o.sx, o.sy === undefined ? 1 : o.sy);
    c.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    c.globalCompositeOperation = o.blend === 'add' ? 'lighter' : 'source-over';
    const ax = o.ax === undefined ? 0.5 : o.ax, ay = o.ay === undefined ? 0.5 : o.ay;
    c.drawImage(t.c, -ax * w, -(1 - ay) * h, w, h);
    c.restore();
  }
  entityFrame(gx, gy, h) {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.translate(this.sx(gx), this.sy(gy * K + (h || 0)));
    c.scale(CAMERA_ZOOM, CAMERA_ZOOM);
  }

  draw(g, ui, t) {
    this.g = g;
    const c = this.ctx;
    this.base(); c.fillStyle = '#040406'; c.fillRect(0, 0, this.W, this.H);
    this.drawFloor(g, t);
    for (const p of g.fx.rings.active) this.ground(ART.ring, p.x, p.y, p.w, p.h, { color: p.color, alpha: p.alpha, blend: 'add', scale: p.scale });
    this.drawEntities(g, t);
    for (const p of g.fx.slashes.active) this.ground(artByKey(p.tex), p.x, p.y, p.w, p.h, { color: p.color, alpha: p.alpha, blend: 'add', scale: p.scale, rot: p.rot });
    for (const pool of [g.fx.sparks, g.fx.glows, g.fx.smoke, g.fx.embers, g.fx.rubble]) {
      const tex = ART[pool.tex], blend = pool.blend, tint = pool !== g.fx.rubble;
      for (const p of pool.active) {
        const Z = CAMERA_ZOOM * p.scale;
        this.img(tex, this.sx(p.x), this.sy(p.y), p.w * Z, p.h * Z, { color: tint ? p.color : null, alpha: p.alpha, blend, rot: p.rot });
      }
    }
    for (const sh of g.proj.shots) if (sh.live) {
      // tracer: a hot streak from behind the round (never past the muzzle) to the round itself
      const Z = CAMERA_ZOOM, h = sh.h, dx = sh.gx - sh.ox, dy = sh.gy - sh.oy, d = Math.hypot(dx, dy) || 1, tl = Math.min(d, 120);
      const tx = sh.gx - dx / d * tl, ty = sh.gy - dy / d * tl;
      const x = this.sx(sh.gx), y = this.sy(sh.gy * K + h), x0 = this.sx(tx), y0 = this.sy(ty * K + h + (1 - tl / Math.max(d, 1)) * 0);
      const c = this.ctx; c.save(); c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.globalCompositeOperation = 'lighter';
      c.lineCap = 'round';
      c.globalAlpha = 0.35; c.strokeStyle = CRIMSON; c.lineWidth = 5 * Z; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x, y); c.stroke();
      c.globalAlpha = 0.9; c.strokeStyle = '#ffd8b8'; c.lineWidth = 1.6 * Z; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x, y); c.stroke();
      c.restore();
      this.img(ART.glow, x, y, 22 * Z, 22 * Z, { color: '#ffb070', blend: 'add' });
    }
    this.drawHUD(g, ui, t);
    this.drawOverlay(g, ui);
  }

  drawFloor(g, t) {
    const n = Math.ceil(2 * ARENA_HALF / TILE), start = -n * TILE / 2 + TILE / 2;
    const m = g.phaseMix, Z = CAMERA_ZOOM;
    // phase 2: runes shift from dull gold to pulsing crimson
    const goldA = (0.3 + 0.08 * Math.sin(t * 1.3)) * (1 - m), redA = (0.34 + 0.2 * Math.sin(t * 4.2)) * m;
    this.floorA = [goldA, redA, 0.25 + 0.18 * Math.sin(t * 2) + 0.5 * g.ritualFlash];
    this.drawRoomFloor(g, ROOMS.shrine, t, true); this.drawRoomFloor(g, PATH_FLOOR, t, false);
    this.drawTiles(g, null);
    const c = this.ctx, A = ARENA_HALF, G = GATE, S = ROOMS.shrine, P = PATH_FLOOR;
    const line = (pts) => { c.beginPath(); c.moveTo(this.sx(pts[0][0]), this.sy(pts[0][1] * K)); for (let i = 1; i < pts.length; i++) c.lineTo(this.sx(pts[i][0]), this.sy(pts[i][1] * K)); c.stroke(); };
    this.base(); c.lineWidth = 3 * Z; c.strokeStyle = '#5a2430'; c.globalAlpha = 0.75;
    line([[G.x0, S[3]], [S[0], S[3]], [S[0], S[1]], [S[2], S[1]], [S[2], S[3]], [G.x1, S[3]]]);
    line([[P[0], P[1]], [P[0], P[3]]]); line([[P[2], P[1]], [P[2], P[3]]]);
    c.globalAlpha = 0.7 + 0.3 * m * (0.5 + 0.5 * Math.sin(t * 4.2)); c.strokeStyle = m > 0.5 ? CRIMSON : '#8A2432';
    line([[G.x0, -A], [-A, -A], [-A, A], [A, A], [A, -A], [G.x1, -A]]);
    this.drawWaves(g);
  }
  /** Floor of a room outside the arena (clipped to its rectangle); the shrine room gets dim gold runes and a sigil at the spawn. */
  drawRoomFloor(g, R, t, shrine) {
    const c = this.ctx, Z = CAMERA_ZOOM, halfW = this.W / 2 / Z + TILE, halfH = this.H / 2 / (Z * K) + TILE;
    if (R[2] < g.cam_x - halfW || R[0] > g.cam_x + halfW || R[3] < g.cam_y - halfH || R[1] > g.cam_y + halfH) return;
    this.base(); c.save(); c.beginPath();
    c.moveTo(this.sx(R[0]), this.sy(R[1] * K)); c.lineTo(this.sx(R[2]), this.sy(R[1] * K)); c.lineTo(this.sx(R[2]), this.sy(R[3] * K)); c.lineTo(this.sx(R[0]), this.sy(R[3] * K)); c.closePath(); c.clip();
    const i0 = Math.floor((R[0] + ARENA_HALF) / TILE), i1 = Math.ceil((R[2] + ARENA_HALF) / TILE), j0 = Math.floor((R[1] + ARENA_HALF) / TILE), j1 = Math.ceil((R[3] + ARENA_HALF) / TILE);
    const runeA = shrine ? 0.1 + 0.04 * Math.sin(t * 1.1) : 0;
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) {
      const x = -ARENA_HALF + TILE / 2 + i * TILE, y = -ARENA_HALF + TILE / 2 + j * TILE;
      if (Math.abs(x - g.cam_x) > halfW || Math.abs(y - g.cam_y) > halfH) continue;
      const v = (((i * 73856093) ^ (j * 19349663)) >>> 0) % 4;
      this.ground(ART.tiles[v], x, y, TILE + 0.8, TILE + 0.8);
      if (runeA > 0) this.ground(ART.runes[v], x, y, TILE, TILE, { color: RUNE_GOLD, alpha: runeA, blend: 'add' });
    }
    c.restore();
    if (shrine) {                                            // the sigil you wake on
      this.ground(ART.ritual, SPAWN[0], SPAWN[1], 230, 230, { alpha: 0.7 });
      this.ground(ART.ritual, SPAWN[0], SPAWN[1], 230, 230, { color: RUNE_GOLD, alpha: 0.18 + 0.08 * Math.sin(t * 1.6), blend: 'add' });
    }
  }
  /** Floor tiles + runes + ritual circle. ring = [cx, cy, rIn, rOut] limits it to tiles touching that annulus. */
  drawTiles(g, ring) {
    const n = Math.ceil(2 * ARENA_HALF / TILE), start = -n * TILE / 2 + TILE / 2, Z = CAMERA_ZOOM;
    const [goldA, redA, ritA] = this.floorA, reach = TILE * 0.71;
    const halfW = this.W / 2 / Z + TILE, halfH = this.H / 2 / (Z * K) + TILE;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = start + i * TILE, y = start + j * TILE;
      if (Math.abs(x - g.cam_x) > halfW || Math.abs(y - g.cam_y) > halfH) continue;
      if (ring) { const d = hypot(x - ring[0], y - ring[1]); if (d < ring[2] - reach || d > ring[3] + reach) continue; }
      const v = TILE_VARIANT[i * n + j];
      this.ground(ART.tiles[v], x, y, TILE + 0.8, TILE + 0.8);
      if (goldA > 0.01) this.ground(ART.runes[v], x, y, TILE, TILE, { color: RUNE_GOLD, alpha: goldA, blend: 'add' });
      if (redA > 0.01) this.ground(ART.runes[v], x, y, TILE, TILE, { color: RUNE_CRIMSON, alpha: redA, blend: 'add' });
    }
    if (!ring || hypot(ring[0], ring[1]) < ring[3] + 190) {
      this.ground(ART.ritual, 0, 0, 380, 380);
      this.ground(ART.ritual, 0, 0, 380, 380, { alpha: ritA, blend: 'add' });
    }
  }
  /** Phase-2 slam ripples: a band of the floor itself heaves up and rolls outward (no coloured line). */
  drawWaves(g) {
    const c = this.ctx, Z = CAMERA_ZOOM, S = SLAM_WAVES;
    for (const w of g.waves) {
      if (!w.live || w.delay > 0 || w.alpha <= 0.01) continue;
      const a = w.alpha, x = this.sx(w.x), y = this.sy(w.y * K), lift = S.lift * Z * a;
      const rIn = Math.max(1, w.r - S.band / 2), rOut = w.r + S.band / 2;
      // trough the crest leaves behind it, and the shadow under its leading edge
      this.base();
      c.globalAlpha = 0.32 * a; c.strokeStyle = '#000000';
      c.lineWidth = S.band * 0.7 * Z; c.beginPath(); c.ellipse(x, y, Math.max(1, rIn - S.band * 0.3) * Z, Math.max(1, rIn - S.band * 0.3) * Z * K, 0, 0, TAU); c.stroke();
      c.globalAlpha = 0.5 * a; c.lineWidth = 5 * Z; c.beginPath(); c.ellipse(x, y, rOut * Z, rOut * Z * K, 0, 0, TAU); c.stroke();
      // the lifted band: the same floor, redrawn a few pixels higher inside the annulus
      c.save();
      c.beginPath();
      c.ellipse(x, y - lift, rOut * Z, rOut * Z * K, 0, 0, TAU);
      c.ellipse(x, y - lift, rIn * Z, rIn * Z * K, 0, 0, TAU);
      c.clip('evenodd');
      const oy = g.oy; g.oy = oy + lift;
      this.drawTiles(g, [w.x, w.y, rIn, rOut]);
      g.oy = oy;
      this.base(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.06 * a; c.fillStyle = '#d8ccb8';
      c.fillRect(0, 0, this.W, this.H);                      // the crest catches a little light
      c.restore();
    }
    this.base();
  }

  drawEntities(g, t) {
    const list = [];
    for (const pil of g.pillars) list.push([-pil.gy, () => this.drawPillar(pil, t)]);
    for (const pk of g.pickups) if (!pk.taken) list.push([-pk.gy, () => this.drawPickup(pk, t)]);
    for (const ch of g.chests) list.push([-ch.gy, () => this.drawChest(ch, t)]);
    if (g.boss.present) list.push([-g.boss.gy, () => this.drawBoss(g.boss)]);
    list.push([-GATE.y - 0.1, () => this.drawGate(g, t)]);
    list.push([-g.player.gy, () => this.drawPlayer(g.player)]);
    for (const bm of g.proj.bombs) if (bm.live) list.push([-bm.gy + 0.5, () => this.drawBomb(bm, t)]);
    for (const q of this.ghosts) if (q.live) list.push([-q.gy - 0.5, () => this.drawGhost(q, g.t)]);
    list.sort((a, b) => a[0] - b[0]);
    for (const e of list) e[1]();
  }
  drawPillar(pil, t) {
    this.entityFrame(pil.gx, pil.gy);
    this.local(ART.shadow, 0, 0, 110, 66);
    this.local(ART.obelisk, 0, 0, 70, 157, { ax: 0.5, ay: 0.03 });
    const col = pil.shrine ? RUNE_GOLD : CRIMSON;
    this.local(ART.glow, 0, 95, pil.shrine ? 80 : 56, pil.shrine ? 80 : 56, { color: col, alpha: 0.45 + 0.2 * Math.sin(t * 2.2 + pil.phase), blend: 'add' });
  }
  /** The arena gate: obsidian bars that shoot up out of the floor when the fight starts, a crimson haze between them. */
  drawGate(g, t) {
    const k = g.gate_t; if (k <= 0.001) return;
    const c = this.ctx, e = 1 - Math.pow(1 - k, 3), Hb = 118, n = 7, G = GATE, w = G.x1 - G.x0;
    this.entityFrame(0, G.y);
    c.save(); c.beginPath(); c.rect(-400, -400, 800, 400); c.clip();            // only what is above the floor shows
    this.local(ART.glow, 0, 40, w * 1.5, 120, { color: CRIMSON, alpha: 0.4 * e * (0.8 + 0.2 * Math.sin(t * 3)), blend: 'add' });
    for (let i = 0; i < n; i++) {
      const x = G.x0 + w * (i + 0.5) / n, stagger = 1 - 0.18 * Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
      this.local(ART.gateBar, x, -(1 - e) * Hb * stagger - 4, 18, Hb * stagger + 6, { ax: 0.5, ay: 0 });
    }
    c.restore();
    if (k < 1) this.local(ART.shadow, 0, 0, w * 1.1, 30, { alpha: 0.5 * e });
  }
  /** Chest: body, then the lid swinging up on its back hinge (top face while closed, inner face once past upright). */
  drawChest(ch, t) {
    this.entityFrame(ch.gx, ch.gy);
    this.local(ART.shadow, 0, 0, 92, 40, { alpha: 0.8 });
    const s = 0.9, u = ch.open_t < 0 ? 0 : clamp(ch.open_t / CHEST_OPEN_TIME, 0, 1), a = 1.9 * (1 - Math.pow(1 - u, 3)) + (u >= 1 ? 0 : 0);
    const bounce = ch.open_t > CHEST_OPEN_TIME && ch.open_t < CHEST_OPEN_TIME + 0.25 ? -0.12 * Math.sin((ch.open_t - CHEST_OPEN_TIME) / 0.25 * Math.PI) : 0;
    const ang = a + bounce, hinge = 50 * s, free = hinge + (-Math.cos(ang) * 17.6 + Math.sin(ang) * 26) * s;
    this.local(ART.chestBody, 0, 0, 64 * s, 34 * s, { ax: 0.5, ay: 0 });
    if (ang > 0.05) {
      const fresh = ch.open_t < 50 ? clamp(1 - (ch.open_t - CHEST_OPEN_TIME) / 2.5, 0.25, 1) : 0.25;
      this.local(ART.chestInside, 0, 30 * s, 60 * s, 20 * s, { ax: 0.5, ay: 0, alpha: fresh });
      if (ch.open_t < 50) this.local(ART.glow, 0, 40 * s, 90, 90, { color: RUNE_GOLD, alpha: 0.35 * fresh, blend: 'add' });
    }
    if (free < hinge) this.local(ART.chestLid, 0, free, 64 * s, hinge - free, { ax: 0.5, ay: 0 });
    else this.local(ART.chestLidOpen, 0, hinge, 64 * s, free - hinge, { ax: 0.5, ay: 0 });
    if (ch.closed) this.local(ART.glow, 0, 22 * s, 30, 30, { color: CRIMSON, alpha: 0.25 + 0.12 * Math.sin(t * 2.4), blend: 'add' });
  }
  drawPickup(pk, t) {
    const k = 0.5 + 0.5 * Math.sin(t * 3 + pk.phase);
    this.entityFrame(pk.gx, pk.gy);
    this.local(ART.ring, 0, 0, 70, 42, { color: '#ffb070', alpha: 0.3 + 0.3 * k, blend: 'add' });
    this.local(ART.glow, 0, 18, 60, 60, { color: '#ff9a4a', alpha: 0.35 + 0.35 * k, blend: 'add' });
    this.local(ART.bomb, 0, 18 + 4 * k, 18, 20);
  }
  drawBomb(bm, t) {
    this.entityFrame(bm.gx, bm.gy);
    this.local(ART.shadow, 0, 0, 22, 13.2);
    this.local(ART.bomb, 0, bm.elev, 18, 20, { rot: bm.spin });
    this.local(ART.glow, Math.cos(bm.spin) * 6, bm.elev + 10, 16, 16, { color: '#ffb070', alpha: 0.6 + 0.4 * (((t * 20) | 0) % 2), blend: 'add' });
  }
  drawGhost(q, t) {
    const k = 1 - (t - q.t0) / 0.24;
    if (k <= 0) { q.live = false; return; }
    const c = this.ctx, L = PLAYER_LAYER;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.globalAlpha = 0.42 * k; c.globalCompositeOperation = 'lighter';
    c.drawImage(q.c, this.snap(this.sx(q.gx) - L.ox * CAMERA_ZOOM), this.snap(this.sy(q.gy * K) - L.oy * CAMERA_ZOOM), q.c.width / this.dpr, q.c.height / this.dpr);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  }
  drawPlayer(p) {
    const L = PLAYER_LAYER, s = this.plScale, main = this.ctx;
    const o = this.renderLayer(p);
    if (!this.gl3d && p.glowAlpha > 0.01) {                    // flash tint over the whole body at once (3D does it in the shader)
      o.x.setTransform(1, 0, 0, 1, 0, 0); o.x.globalCompositeOperation = 'source-atop'; o.x.globalAlpha = p.glowAlpha;
      o.x.fillStyle = p.glowColor; o.x.fillRect(0, 0, o.c.width, o.c.height);
      o.x.globalCompositeOperation = 'source-over'; o.x.globalAlpha = 1;
    }
    if ((p.ghostSeq || 0) !== this.ghostSeq) {                 // dash afterimage: snapshot this frame, tinted crimson
      this.ghostSeq = p.ghostSeq || 0;
      const q = this.ghosts.find(z => !z.live) || this.ghosts.reduce((a, z) => (z.t0 < a.t0 ? z : a));
      q.x.setTransform(1, 0, 0, 1, 0, 0); q.x.globalCompositeOperation = 'source-over'; q.x.globalAlpha = 1;
      q.x.clearRect(0, 0, q.c.width, q.c.height); q.x.drawImage(o.c, 0, 0, q.c.width, q.c.height);
      q.x.globalCompositeOperation = 'source-atop'; q.x.fillStyle = CRIMSON; q.x.fillRect(0, 0, q.c.width, q.c.height);
      q.x.globalCompositeOperation = 'source-over';
      q.live = true; q.t0 = this.g.t; q.gx = p.gx; q.gy = p.gy;
    }
    // shadow stays solid; the body fades as one piece
    this.entityFrame(p.gx, p.gy); this.contactShadow(p);
    main.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); main.globalAlpha = p.bodyAlpha; main.globalCompositeOperation = 'source-over';
    main.drawImage(o.c, this.snap(this.sx(p.gx) - L.ox * CAMERA_ZOOM), this.snap(this.sy(p.gy * K) - L.oy * CAMERA_ZOOM), o.c.width / this.dpr, o.c.height / this.dpr);
    main.globalAlpha = 1;
    if (this.gl3d) { this.entityFrame(p.gx, p.gy); this.drawPlayerGlows(p); }
  }
  /** Soft wide shadow, a darker core under him, and a small shadow under each foot that fades as it lifts. */
  contactShadow(p) {
    const J = p.rig.j;
    this.local(ART.shadow, 0, 0, 46, 27, { alpha: 0.75 });
    this.local(ART.shadow, J.pelvis.x * 0.6, 0, 26, 13, { alpha: 0.55 });
    for (const A of [J.ankleL, J.ankleR]) {
      const lift = clamp((A.z - 3.5) / 10, 0, 1);
      this.local(ART.shadow, A.x, A.y - A.z - 1, 13 * (1 - 0.3 * lift), 6 * (1 - 0.3 * lift), { alpha: 0.6 * (1 - lift) });
    }
  }
  snap(v) { return Math.round(v * this.dpr) / this.dpr; }       // to a whole device pixel
  /** Draw the player's body into his layer canvas (3D if available, else the 2D pictures). Returns {c}. */
  renderLayer(p) {
    const L = PLAYER_LAYER, s = this.plScale;
    if (this.gl3d) { this.gl3d.render(p, L, s); return this._glLayer || (this._glLayer = { c: this.gl3d.g.canvas, x: null }); }
    const o = this.pl, main = this.ctx;
    o.x.setTransform(1, 0, 0, 1, 0, 0); o.x.globalCompositeOperation = 'source-over'; o.x.globalAlpha = 1;
    o.x.clearRect(0, 0, o.c.width, o.c.height);
    o.x.setTransform(s, 0, 0, s, L.ox * s, L.oy * s);
    this.ctx = o.x; this.drawRigBody(p, true); this.ctx = main;
    return o;
  }
  /** The player at the current transform's origin (title screen, pose sheets). */
  drawRigImage(p) {
    const L = PLAYER_LAYER, o = this.renderLayer(p);
    this.contactShadow(p);
    this.ctx.drawImage(o.c, -L.ox, -L.oy, L.w, L.h);
    if (this.gl3d) this.drawPlayerGlows(p);
  }
  /** Soft halos over the 3D body: visor and blade. */
  drawPlayerGlows(p) {
    const R = p.rig, a = p.bodyAlpha;
    const hv = p.gear && p.gear.head && GEAR[p.gear.head] && GEAR[p.gear.head].visor;
    if (hv && p.visorAlpha > 0.01) this.local(ART.glow, p.visorX, p.visorY, 16, 16, { color: CRIMSON, alpha: p.visorGlow * p.visorAlpha * a * 0.8, blend: 'add' });
    // (no 2D blade halo: drawn over the finished body it would show through him; the blade glows in 3D)
  }
  /** The jointed player, drawn at the current transform's origin (his feet). */
  drawRigBody(p, layered) {
    const R = p.rig;
    if (!layered) this.local(ART.shadow, 0, 0, 50, 30);
    const a = layered ? 1 : p.bodyAlpha, glowA = layered ? 0 : p.glowAlpha, glowC = p.glowColor;
    // body parts and every cloth panel, sorted back to front together (so a leg can be inside the cloak)
    const list = this._dl || (this._dl = []);
    list.length = 0;
    for (const part of R.parts) {
      if (part.kind === 'cloth') { const cp = p.cloths[part.name]; if (cp && cp.live) for (const Q of cp.quads) list.push(Q); }
      else list.push(part);
    }
    list.sort((u, v) => v.key - u.key);
    for (const part of list) {
      if (part.quad) { this.drawClothQuad(part); continue; }
      if (part.kind === 'weapon') { this.drawWeapon(p, R); continue; }
      if (part.kind === 'offhand') {
        if (p.gunDrawn) {
          const J = R.j, a = Math.atan2(J.wrL.y - J.elL.y, J.wrL.x - J.elL.x);
          this.local(ART.rig.props.pistol, J.handL.x, J.handL.y, 15, 7, { ax: 0.2, ay: 0.35, rot: a, sy: Math.cos(a) < 0 ? -1 : 1 });
        }
        continue;
      }
      if (part.kind === 'prop') { this.drawProp(p, part); continue; }
      const layers = p.rigLayers[part.name];
      for (let i = 0; i < layers.length; i++) {
        const fam = ART.rig[layers[i][0]], v = fam && fam[layers[i][1]];
        if (!v) continue;
        this.rigPart(v, part, R, a, null);
        if (glowA > 0.01) this.rigPart(v, part, R, glowA, glowC);
      }
      if (part.name === 'head' && p.visorAlpha > 0.01) {
        this.local(ART.glow, p.visorX, p.visorY, 16, 16, { color: CRIMSON, alpha: p.visorGlow * p.visorAlpha * a, blend: 'add' });
        this.local(ART.visor, p.visorX, p.visorY, 10, 4.2, { sx: p.visorSX, alpha: p.visorAlpha * a, rot: R.bodyRot });
      }
    }
  }
  drawClothQuad(Q) {
    const c = this.ctx, cp = Q.cloth, cl = cp.cloth, X = cp.sx, Y = cp.sy, N = cp.cols, k = Q.i;
    const fade = Q.row / Math.max(1, cp.rows - 2);
    const col = Q.outer ? this.mixCol(cl.outer, cl.outerL, 0.75 * Q.light * (1 - 0.4 * fade))
                        : this.mixCol('#140609', cl.lining, 0.7 * (1 - 0.6 * fade));
    c.lineJoin = 'round'; c.lineWidth = 0.45; c.fillStyle = col; c.strokeStyle = col;
    c.beginPath(); c.moveTo(X[k], -Y[k]); c.lineTo(X[k + 1], -Y[k + 1]); c.lineTo(X[k + N + 1], -Y[k + N + 1]); c.lineTo(X[k + N], -Y[k + N]);
    c.closePath(); c.fill(); c.stroke();
    if (Q.row === cp.rows - 2) {                                   // hem along the bottom edge
      c.beginPath(); c.moveTo(X[k + N], -Y[k + N]); c.lineTo(X[k + N + 1], -Y[k + N + 1]);
      c.strokeStyle = 'rgba(242,31,56,0.22)'; if (cl.kind === 'front') c.strokeStyle = 'rgba(176,138,62,0.25)';
      c.lineWidth = 3.4; c.stroke(); c.strokeStyle = cl.hem; c.lineWidth = 1.1; c.stroke();
    }
  }
  drawCape(cp) {
    const c = this.ctx, cl = cp.cloth, X = cp.sx, Y = cp.sy, N = cp.cols;
    c.save(); c.lineJoin = 'round'; c.lineWidth = 0.45;
    for (const Q of cp.quads) {
      const k = Q.i, fade = Q.row / Math.max(1, cp.rows - 2);
      const col = Q.outer ? this.mixCol(cl.outer, cl.outerL, 0.75 * Q.light * (1 - 0.4 * fade))
                          : this.mixCol('#140609', cl.lining, 0.7 * (1 - 0.6 * fade));
      c.fillStyle = col; c.strokeStyle = col;
      c.beginPath(); c.moveTo(X[k], -Y[k]); c.lineTo(X[k + 1], -Y[k + 1]); c.lineTo(X[k + N + 1], -Y[k + N + 1]); c.lineTo(X[k + N], -Y[k + N]);
      c.closePath(); c.fill(); c.stroke();
    }
    // crimson hem
    const b = (cp.rows - 1) * N;
    c.beginPath(); c.moveTo(X[b], -Y[b]); for (let i = 1; i < N; i++) c.lineTo(X[b + i], -Y[b + i]);
    c.strokeStyle = 'rgba(242,31,56,0.22)'; c.lineWidth = 3.6; c.stroke();     // soft glow without shadowBlur (cheap)
    c.strokeStyle = cl.hem; c.lineWidth = 1.2; c.stroke(); c.restore();
  }
  drawProp(p, part) {
    const P = ART.rig.props, drawn = p.gunDrawn;
    if (part.name === 'holster') this.local(drawn ? P.holsterEmpty : P.holster, part.x, part.y, 7, 13, { ax: 0.5, ay: 0.75, rot: part.rot });
    else this.local(p.flasks > 0 ? P.flask : P.flaskEmpty, part.x, part.y, 5, 9, { ax: 0.5, ay: 0.9, rot: part.rot });
  }
  mixCol(a, b, t) {
    const m = this._mix || (this._mix = {}), key = a + b + Math.round(t * 32);
    return m[key] || (m[key] = mixHex(a, b, Math.round(t * 32) / 32));
  }
  rigPart(v, part, R, alpha, color) {
    const o = this._ro || (this._ro = {});
    o.color = color; o.alpha = alpha; o.blend = color ? 'add' : undefined;
    if (Array.isArray(v)) {
      const tex = v[R.dir];
      o.ax = tex.ax; o.ay = tex.ay; o.rot = part.rot; o.sx = undefined; o.sy = undefined;
      this.local(tex, part.x, part.y, tex.w, tex.h, o);
    } else {
      o.ax = v.pad / v.w; o.ay = 0.5; o.rot = part.rot; o.sx = part.len / v.L; o.sy = Math.cos(part.rot) < 0 ? -1 : 1;
      this.local(v, part.x, part.y, v.w, v.h, o);
    }
  }
  drawWeapon(p, R) {
    const c = this.ctx, w = p.weapon, tex = ART.weapon[w.tex];
    c.save(); c.translate(R.weaponX, -R.weaponY); c.rotate(-R.weaponRot); c.scale(p.sword_scale, p.sword_scale);
    this.local(tex, 0, 0, w.size[0], w.size[1], { ax: w.grip / w.size[0], ay: 0.5 });
    this.local(ART.spark, w.glow[0], 0, w.glow[1], w.glow[2], { color: CRIMSON, alpha: p.swordGlow, blend: 'add' });
    c.restore();
  }
  drawPlayerOld(p) {
    const c = this.ctx;
    this.entityFrame(p.gx, p.gy);
    this.local(ART.shadow, 0, 0, 56, 33.6);
    const sword = () => {
      const w = p.weapon, tex = ART.weapon[w.tex];
      c.save(); c.translate(p.swordX, -p.swordY); c.rotate(-p.sword_rot); c.scale(p.sword_scale, p.sword_scale);
      this.local(tex, 0, 0, w.size[0], w.size[1], { ax: w.grip / w.size[0], ay: 0.5 });
      this.local(ART.spark, w.glow[0], 0, w.glow[1], w.glow[2], { color: CRIMSON, alpha: p.swordGlow, blend: 'add' });
      c.restore();
    };
    if (p.swordZ < 0) sword();
    c.save(); c.rotate(-p.bodyRot); c.scale(p.bodySX, p.bodySY);
    const a = p.bodyAlpha;
    this.local(ART.knight[p.view], 0, 0, 64, 96, { ax: 0.5, ay: 0.04, alpha: a });
    if (p.glowAlpha > 0.01) this.local(ART.knightSil[p.view], 0, 0, 64, 96, { ax: 0.5, ay: 0.04, color: p.glowColor, alpha: p.glowAlpha, blend: 'add' });
    if (p.visorAlpha > 0) {
      this.local(ART.glow, p.visorX, p.visorY, 30, 30, { color: CRIMSON, alpha: p.visorGlow * a, blend: 'add' });
      this.local(ART.visor, p.visorX, p.visorY, 22, 10, { sx: p.visorSX, alpha: p.visorAlpha * a });
    }
    c.restore();
    if (p.swordZ >= 0) sword();
  }
  drawBoss(b) {
    if (this.boss3d) { this.drawBoss3D(b); return; }
    const c = this.ctx;
    this.entityFrame(b.gx, b.gy);
    this.local(ART.shadow, 0, 0, 170 * b.shadowScale, 102 * b.shadowScale);
    c.translate(0, -b.elev);
    const parts = [];
    for (const pl of b.plates) parts.push([pl.z, () => this.local(ART.plate, pl.x, pl.y, 46, 30, { rot: pl.rot, sx: pl.sx, alpha: pl.alpha })]);
    parts.push([0, () => {
      c.save(); c.rotate(-b.bodyRot); c.scale(b.bodySX, b.bodySY);
      const a = b.bodyAlpha;
      this.local(ART.sentinel[b.view], 0, 0, 132, 170, { ax: 0.5, ay: 0.03, alpha: a });
      this.local(ART.glow, b.coreX, b.coreY, 96 * b.coreGlowScale, 96 * b.coreGlowScale, { color: CRIMSON, alpha: b.coreGlow * a, blend: 'add' });
      if (b.visorGlowA > 0) this.local(ART.glow, b.visorPos[0], b.visorPos[1], 54, 54, { color: CRIMSON, alpha: b.visorGlowA, blend: 'add' });
      if (b.coreAlpha > 0) this.local(ART.core, b.coreX, b.coreY, 22, 30, { sx: b.coreSX, alpha: b.coreAlpha });
      if (b.flashAlpha > 0.01) this.local(ART.sentinelSil[b.view], 0, 0, 132, 170, { ax: 0.5, ay: 0.03, color: b.flashColor, alpha: b.flashAlpha });
      c.restore();
    }]);
    parts.push([b.halZ, () => this.local(ART.halberd, b.halX, b.halY, 230, 50, { ax: 50 / 230, ay: 0.5, rot: b.hal_rot, alpha: b.halAlpha })]);
    parts.sort((a, z) => a[0] - z[0]);
    for (const pt of parts) pt[1]();
  }

  /** The 3D sentinel: soft shadows, the GL body (only its bounding box is rendered and copied), glows on top. */
  drawBoss3D(b) {
    const c = this.ctx, L = BOSS_LAYER, s = this.plScale, R = b.rig, Z = CAMERA_ZOOM, a = b.bodyAlpha;
    this.entityFrame(b.gx, b.gy);
    this.local(ART.shadow, 0, 0, 170 * b.shadowScale, 102 * b.shadowScale, { alpha: 0.85 });
    const cy = Math.cos(R.yaw), sy = Math.sin(R.yaw), J = R.j;
    if (b.elev < 2) for (const A of [J.ankleL, J.ankleR]) {
      const X = A.s * sy + A.f * cy, Y = -A.s * cy + A.f * sy, lift = clamp((A.z - 5) / 16, 0, 1);
      this.local(ART.shadow, X, Y * K, 40 * (1 - 0.3 * lift), 18 * (1 - 0.3 * lift), { alpha: 0.6 * (1 - lift) });
    }
    const r = this.boss3d.render(b, L, s);
    if (r.w > 0 && r.h > 0) {
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.globalAlpha = a; c.globalCompositeOperation = 'source-over';
      const dx = this.sx(b.gx) + (r.x / s - L.ox) * Z, dy = this.sy(b.gy * K) - b.elev * Z + (r.y / s - L.oy) * Z;
      c.drawImage(this.boss3d.g.canvas, r.x, r.y, r.w, r.h, this.snap(dx), this.snap(dy), r.w / this.dpr, r.h / this.dpr);
      c.globalAlpha = 1;
    }
    this.entityFrame(b.gx, b.gy, b.elev);
    const cf = clamp(R.core.face * 2.5, 0, 1), vf = clamp(R.visor.face * 3, 0, 1);
    if (cf > 0.01) this.local(ART.glow, R.core.x, R.core.y, 70 * b.coreGlowScale, 70 * b.coreGlowScale, { color: CRIMSON, alpha: b.coreGlow * 0.55 * cf * a, blend: 'add' });
    if (vf > 0.01 && b.state !== S_DEAD) this.local(ART.glow, R.visor.x, R.visor.y, 40, 40, { color: CRIMSON, alpha: (0.4 + 0.15 * Math.sin(this.g.t * 3.1)) * vf * a, blend: 'add' });
  }

  // ------------------------------------------------------------ HUD (y-up layout)
  bar(x, y, w, h, frac, lagFrac, color, lagColor, frameDeny) {
    const c = this.ctx, Y = this.H - y;
    this.base();
    c.fillStyle = 'rgba(5,5,8,0.78)'; rrectPath(c, x + 2, Y - h / 2 - 3, w + 4, h + 6, 3); c.fill();
    c.strokeStyle = frameDeny || 'rgba(176,138,61,0.6)'; c.lineWidth = 1; rrectPath(c, x + 2.5, Y - h / 2 - 2.5, w + 3, h + 5, 3); c.stroke();
    c.fillStyle = '#8A2432';
    for (const ex of [x + 2, x + w + 6]) { c.beginPath(); c.moveTo(ex, Y - 4); c.lineTo(ex + 3, Y); c.lineTo(ex, Y + 4); c.lineTo(ex - 3, Y); c.closePath(); c.fill(); }
    if (lagFrac > 0) { c.globalAlpha = 0.75; c.fillStyle = lagColor; rrectPath(c, x + 4, Y - h / 2, Math.max(0.5, w * clamp(lagFrac, 0, 1)), h, Math.min(2.5, h / 2)); c.fill(); c.globalAlpha = 1; }
    if (frac > 0) { c.fillStyle = color; rrectPath(c, x + 4, Y - h / 2, Math.max(0.5, w * clamp(frac, 0, 1)), h, Math.min(2.5, h / 2)); c.fill(); }
  }
  text(s, x, y, size, color, align, _weight, alpha) {
    const c = this.ctx; this.base();
    c.globalAlpha = alpha === undefined ? 1 : alpha;
    c.font = `bold ${size}px Menlo, Consolas, 'Courier New', monospace`;
    c.fillStyle = color; c.textAlign = align || 'center'; c.textBaseline = 'middle';
    c.fillText(s, x, this.H - y);
  }
  serif(s, x, y, size, color, alpha, bold) {
    const c = this.ctx; this.base(); c.globalAlpha = alpha === undefined ? 1 : alpha;
    c.font = `${bold === false ? '' : 'bold '}${size}px Georgia, 'Times New Roman', serif`;
    c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s, x, this.H - y);
  }
  hudImg(tex, x, y, w, h, o) { this.img(tex, x, this.H - y, w, h, o); }

  drawHUD(g, ui, t) {
    const c = this.ctx, p = g.player, b = g.boss, W = this.W, H = this.H, SX = HUD.SAFE_X, top = H - HUD.TOP;
    this.base(); c.globalAlpha = 1; c.drawImage(this.vignette, 0, 0, W, H);
    // player bars
    const hw = Math.round(212 * p.maxHp / PLAYER_MAX_HP);
    this.bar(SX, top - 26, hw, 8, p.hp / p.maxHp, (p.hp + p.rally) / p.maxHp, '#c0283c', '#e8903a');
    const deny = g.stamDeny > 0;
    this.bar(SX, top - 45, 162, 6, p.stamina / STAM_MAX, p.stam_lag / STAM_MAX, deny ? CRIMSON : '#c9a24a', 'rgba(242,230,208,0.6)',
      deny && ((g.stamDeny * 20) | 0) % 2 === 0 ? CRIMSON : null);
    // weapon chip
    const cy = top - 66;
    this.base(); c.fillStyle = 'rgba(5,5,8,0.78)'; rrectPath(c, SX, H - cy - 11, 172, 22, 4); c.fill();
    c.strokeStyle = 'rgba(176,138,61,0.6)'; c.lineWidth = 1; rrectPath(c, SX + 0.5, H - cy - 10.5, 171, 21, 4); c.stroke();
    this.text(p.weapon.name, SX + 10, cy, 9, '#e8dcc4', 'left');
    this.text('GEAR', SX + 164, cy, 8, '#ff5a6a', 'right');
    if (ui.menu && ui.menu.hasUnseen()) { this.base(); c.fillStyle = CRIMSON; c.beginPath(); c.arc(SX + 170, H - cy - 9, 3.2, 0, TAU); c.fill(); }
    ui.chip = { x: SX, y: cy, w: 172 };
    if (SHOW_FPS) this.text('FPS ' + ui.fps, SX + 4, top - 88, 9, 'rgba(201,180,138,0.6)', 'left');
    // boss bar (only while the fight is on)
    const bx = W / 2, by = HUD.SAFE_BOTTOM - 6;
    if (g.fight === 'active' && b.present) {
    this.serif('THE OBSIDIAN SENTINEL', bx, by + 17, 11, '#d9c9a0');
    this.bar(bx - 156, by, 304, 8, b.hp / BOSS_MAX_HP, b.hp_lag / BOSS_MAX_HP, '#b3202f', 'rgba(242,230,208,0.55)');
    this.base(); c.fillStyle = '#1a1712'; c.fillRect(bx - 152, H - by + 9, 304, 3);
    const stag = b.state === S_STAGGERED;
    c.fillStyle = stag ? (((t * 10) | 0) % 2 === 0 ? '#ffffff' : '#d8a640') : '#d8a640';
    c.fillRect(bx - 152, H - by + 9, 304 * (stag ? 1 : clamp(b.poise / BOSS_POISE, 0, 1)), 3);
    }
    // controls
    const st = ui.stick;
    this.hudImg(ART.stickBase, st.cx_vis, st.cy_vis, 132, 132, { alpha: st.baseAlpha });
    this.hudImg(ART.stickKnob, st.kx, st.ky, 58, 58, { alpha: st.knobAlpha, color: st.sprinting ? '#ff8a96' : null });
    for (const e of ui.emptySlots) this.hudImg(ART.slotEmpty, e[0], e[1], 2 * SLOT_R + 12, 2 * SLOT_R + 12);
    for (const btn of ui.buttons) {
      const s = 2 * btn.r + 12;
      if (btn.glowA > 0.01) this.hudImg(ART.glow, btn.cx, btn.cy, btn.r * 3.4, btn.r * 3.4, { color: CRIMSON, alpha: btn.glowA, blend: 'add' });
      this.hudImg(btn.tex, btn.cx, btn.cy, s, s, { sx: btn.scale, sy: btn.scale, alpha: btn.dim });
      if (btn.knobA > 0.01) this.hudImg(ART.stickKnob, btn.cx + btn.kx, btn.cy + btn.ky, 26, 26, { alpha: btn.knobA });
    }
    const counts = { flask: p.flasks, item: p.items[p.item_key], shoot: p.bullets };
    for (const btn of ui.buttons) {
      if (!(btn.kind in counts)) continue;
      const n = counts[btn.kind], pos = btn.kind === 'shoot' ? [btn.cx, btn.cy + SLOT_R + 11] : [btn.cx, btn.cy + SMALL_R + 11];
      this.text(String(n), pos[0], pos[1], 12, '#c9b48a', 'center', 'bold', n > 0 ? 0.9 : 0.45);
    }
    if (g.toast_t > 0 && g.toast_key) this.serif(ITEMS[g.toast_key].name, W / 2, top - 42, 15, '#ffb070', clamp(g.toast_t / 0.4, 0, 1));
    // OPEN prompt beside a chest
    ui.prompt = null;
    if (g.chestNear) {
      const px = W / 2, py = HUD.SAFE_BOTTOM + 62, pw = 128, ph = 34;
      this.base(); c.fillStyle = 'rgba(8,8,11,0.88)'; rrectPath(c, px - pw / 2, H - py - ph / 2, pw, ph, 8); c.fill();
      c.strokeStyle = 'rgba(217,180,92,0.8)'; c.lineWidth = 1.2; rrectPath(c, px - pw / 2 + 0.5, H - py - ph / 2 + 0.5, pw - 1, ph - 1, 8); c.stroke();
      this.serif('OPEN', px, py, 15, '#e8dcc4');
      ui.prompt = { x: px - pw / 2, y: py - ph / 2, w: pw, h: ph };
    }
    if (g.loot) this.drawLoot(g.loot.items, W / 2, H / 2 + 70, clamp(g.loot.t / 0.5, 0, 1) * clamp((3.4 - g.loot.t) / 0.25, 0, 1));
    // victory: a banner over the fight, then you carry on (the gate opens behind it)
    if (g.fight === 'won' && g.victory_t < 7) {
      const vt = g.victory_t, a = clamp((vt - 1.2) / 0.7, 0, 1) * clamp((7 - vt) / 0.8, 0, 1);
      if (a > 0) {
        this.base(); c.globalAlpha = 0.6 * a; c.fillStyle = '#000'; c.fillRect(0, H / 2 - 75, W, 110); c.globalAlpha = 1;
        const loot = g.bossLoot && g.bossLoot.length, vx = loot ? W * 0.31 : W / 2;
        this.serif('VICTORY', vx, H / 2 + 30, 50, '#d9b45c', a); this.serif('THE OBSIDIAN SENTINEL HAS FALLEN', vx, H / 2 - 12, 13, '#d9c9a0', a, false);
        if (loot) this.drawLoot(g.bossLoot, W * 0.73, H / 2 + 58, a);
      }
    }
  }

  /** 'Obtained' banner with each item's icon and name (y-up centre). */
  drawLoot(items, cx, cy, a) {
    if (a <= 0 || !items.length) return;
    const c = this.ctx, H = this.H, rowH = 22, w = 300, h = 34 + items.length * rowH;
    this.base(); c.globalAlpha = a;
    c.fillStyle = 'rgba(8,7,10,0.9)'; rrectPath(c, cx - w / 2, H - cy - 14, w, h, 6); c.fill();
    c.strokeStyle = 'rgba(176,138,61,0.65)'; c.lineWidth = 1; rrectPath(c, cx - w / 2 + 0.5, H - cy - 13.5, w - 1, h - 1, 6); c.stroke();
    this.serif('OBTAINED', cx, cy - 2, 12, '#d9b45c', a);
    items.forEach((id, i) => {
      const y = H - cy + 20 + i * rowH; this.base(); c.globalAlpha = a;
      drawItemIcon(c, ITEM_DB[id].icon, cx - w / 2 + 28, y + 2, 16, '#e8dcc4', a);
      c.font = 'bold 10px Menlo, Consolas, monospace'; c.fillStyle = '#e8dcc4'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(ITEM_DB[id].name, cx - w / 2 + 46, y + 3);
    });
    c.globalAlpha = 1;
  }
  drawOverlay(g, ui) {
    const c = this.ctx, W = this.W, H = this.H, lvl = g.outcome === 'death' ? g.overlayLevel() : 0;
    if (lvl > 0) {
      this.base(); c.globalAlpha = 0.45 * lvl; c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      c.globalAlpha = 0.7 * lvl; c.fillRect(0, H / 2 - 20 - 55, W, 110);
      this.serif('YOU DIED', W / 2, H / 2 + 26, 50, '#b3202f', lvl);
      const k = clamp((g.outcome_t - (RESPAWN_AT - 0.7)) / 0.7, 0, 1);            // fade out before waking at the shrine
      if (k > 0) { this.base(); c.globalAlpha = k; c.fillStyle = '#000'; c.fillRect(0, 0, W, H); }
    }
    if (g.fade > 0) { this.base(); c.globalAlpha = g.fade; c.fillStyle = '#000'; c.fillRect(0, 0, W, H); }
    this.base();
  }

  drawTitle(t, player) {
    const c = this.ctx, W = this.W, H = this.H;
    this.base(); c.fillStyle = '#040406'; c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H * 0.45, W * 0.6);
    g.addColorStop(0, 'rgba(138,36,50,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const k = Math.min(1, H / 393);
    this.img(ART.shadow, W / 2 - 95, H * 0.74, 80 * k, 30 * k, {});
    this.img(ART.shadow, W / 2 + 95, H * 0.74, 170 * k, 60 * k, {});
    if (player) {
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.translate(W / 2 - 95, H * 0.745); c.scale(1.25 * k, 1.25 * k);
      this.drawRigImage(player);
    } else this.img(ART.knight.S, W / 2 - 95, H * 0.745, 64 * 1.3 * k, 96 * 1.3 * k, { ay: 0.04 });
    this.img(ART.sentinel.S, W / 2 + 95, H * 0.745, 132 * 0.95 * k, 170 * 0.95 * k, { ay: 0.03 });
    this.serif('NULLRITE', W / 2, H * 0.86, 34, '#e8dcc4');
    this.text('TAP TO BEGIN', W / 2, H * 0.12, 13, '#ff6a78', 'center', 'bold', 0.65 + 0.35 * Math.sin(t * 3));
    this.text('build ' + BUILD, W - Math.max(16, HUD.SAFE_X - 30), 14, 8, 'rgba(201,180,138,0.45)', 'right');
  }
  drawRotate() {
    const c = this.ctx, W = this.W, H = this.H;
    this.base(); c.fillStyle = '#040406'; c.fillRect(0, 0, W, H);
    this.serif('Rotate your phone', W / 2, H * 0.55, 22, '#e8dcc4');
    this.text('NULLRITE plays in landscape', W / 2, H * 0.45, 11, '#c9b48a');
  }
}
