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
    const v = newCanvas(256, 256), x = v.getContext('2d'), g = x.createRadialGradient(128, 128, 60, 128, 128, 182);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.55, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256); this.vignette = v;
    // the player is drawn into his own layer first, so fading / flashing him treats the body as one piece
    const s = dpr * CAMERA_ZOOM, L = PLAYER_LAYER;
    const mk = () => { const c = newCanvas(L.w * s, L.h * s); return { c, x: c.getContext('2d') }; };
    this.pl = mk(); this.plScale = s;
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
    for (const pool of [g.fx.sparks, g.fx.glows, g.fx.smoke, g.fx.embers]) {
      const tex = ART[pool.tex], blend = pool.blend;
      for (const p of pool.active) {
        const Z = CAMERA_ZOOM * p.scale;
        this.img(tex, this.sx(p.x), this.sy(p.y), p.w * Z, p.h * Z, { color: p.color, alpha: p.alpha, blend, rot: p.rot });
      }
    }
    for (const sh of g.proj.shots) if (sh.live) {
      const x = this.sx(sh.gx), y = this.sy(sh.gy * K + g.proj.SHOT_H), Z = CAMERA_ZOOM;
      this.img(ART.glow, x, y, 26 * Z, 26 * Z, { color: CRIMSON, blend: 'add' });
      this.img(ART.spark, x, y, 38 * Z, 7 * Z, { color: '#ffd0c0', blend: 'add', rot: sh.rot });
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
    this.drawTiles(g, null);
    const c = this.ctx, A = ARENA_HALF;
    this.base(); c.globalAlpha = 0.7 + 0.3 * m * (0.5 + 0.5 * Math.sin(t * 4.2)); c.strokeStyle = m > 0.5 ? CRIMSON : '#8A2432'; c.lineWidth = 3 * Z;
    c.beginPath();
    c.moveTo(this.sx(-A), this.sy(-A * K)); c.lineTo(this.sx(A), this.sy(-A * K));
    c.lineTo(this.sx(A), this.sy(A * K)); c.lineTo(this.sx(-A), this.sy(A * K)); c.closePath(); c.stroke();
    this.drawWaves(g);
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
    list.push([-g.boss.gy, () => this.drawBoss(g.boss)]);
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
    this.local(ART.glow, 0, 95, 56, 56, { color: CRIMSON, alpha: 0.45 + 0.2 * Math.sin(t * 2.2 + pil.phase), blend: 'add' });
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
    c.drawImage(q.c, this.sx(q.gx) - L.ox * CAMERA_ZOOM, this.sy(q.gy * K) - L.oy * CAMERA_ZOOM, L.w * CAMERA_ZOOM, L.h * CAMERA_ZOOM);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  }
  drawPlayer(p) {
    const L = PLAYER_LAYER, s = this.plScale, o = this.pl, main = this.ctx;
    o.x.setTransform(1, 0, 0, 1, 0, 0); o.x.globalCompositeOperation = 'source-over'; o.x.globalAlpha = 1;
    o.x.clearRect(0, 0, o.c.width, o.c.height);
    o.x.setTransform(s, 0, 0, s, L.ox * s, L.oy * s);
    this.ctx = o.x; this.drawRigBody(p, true); this.ctx = main;
    if (p.glowAlpha > 0.01) {                                  // flash tint over the whole body at once
      o.x.setTransform(1, 0, 0, 1, 0, 0); o.x.globalCompositeOperation = 'source-atop'; o.x.globalAlpha = p.glowAlpha;
      o.x.fillStyle = p.glowColor; o.x.fillRect(0, 0, o.c.width, o.c.height);
      o.x.globalCompositeOperation = 'source-over'; o.x.globalAlpha = 1;
    }
    if ((p.ghostSeq || 0) !== this.ghostSeq) {                 // dash afterimage: snapshot this frame, tinted crimson
      this.ghostSeq = p.ghostSeq || 0;
      const q = this.ghosts.find(z => !z.live) || this.ghosts.reduce((a, z) => (z.t0 < a.t0 ? z : a));
      q.x.setTransform(1, 0, 0, 1, 0, 0); q.x.globalCompositeOperation = 'source-over'; q.x.globalAlpha = 1;
      q.x.clearRect(0, 0, q.c.width, q.c.height); q.x.drawImage(o.c, 0, 0);
      q.x.globalCompositeOperation = 'source-atop'; q.x.fillStyle = CRIMSON; q.x.fillRect(0, 0, q.c.width, q.c.height);
      q.x.globalCompositeOperation = 'source-over';
      q.live = true; q.t0 = this.g.t; q.gx = p.gx; q.gy = p.gy;
    }
    // shadow stays solid; the body fades as one piece
    this.entityFrame(p.gx, p.gy); this.local(ART.shadow, 0, 0, 50, 30);
    main.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); main.globalAlpha = p.bodyAlpha; main.globalCompositeOperation = 'source-over';
    main.drawImage(o.c, this.sx(p.gx) - L.ox * CAMERA_ZOOM, this.sy(p.gy * K) - L.oy * CAMERA_ZOOM, L.w * CAMERA_ZOOM, L.h * CAMERA_ZOOM);
    main.globalAlpha = 1;
  }
  /** The jointed player, drawn at the current transform's origin (his feet). */
  drawRigBody(p, layered) {
    const R = p.rig;
    if (!layered) this.local(ART.shadow, 0, 0, 50, 30);
    const a = layered ? 1 : p.bodyAlpha, glowA = layered ? 0 : p.glowAlpha, glowC = p.glowColor;
    for (const part of R.order) {
      if (part.kind === 'weapon') { this.drawWeapon(p, R); continue; }
      if (part.kind === 'offhand') continue;
      const layers = p.rigLayers[part.name];
      for (let i = 0; i < layers.length; i++) {
        const v = ART.rig[layers[i][0]][layers[i][1]];
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
    this.bar(SX, top - 26, 212, 8, p.hp / PLAYER_MAX_HP, (p.hp + p.rally) / PLAYER_MAX_HP, '#c0283c', '#e8903a');
    const deny = g.stamDeny > 0;
    this.bar(SX, top - 45, 162, 6, p.stamina / STAM_MAX, p.stam_lag / STAM_MAX, deny ? CRIMSON : '#c9a24a', 'rgba(242,230,208,0.6)',
      deny && ((g.stamDeny * 20) | 0) % 2 === 0 ? CRIMSON : null);
    // weapon chip
    const cy = top - 66;
    this.base(); c.fillStyle = 'rgba(5,5,8,0.78)'; rrectPath(c, SX, H - cy - 11, 172, 22, 4); c.fill();
    c.strokeStyle = 'rgba(176,138,61,0.6)'; c.lineWidth = 1; rrectPath(c, SX + 0.5, H - cy - 10.5, 171, 21, 4); c.stroke();
    this.text(p.weapon.name, SX + 10, cy, 9, '#e8dcc4', 'left');
    this.text('SWAP', SX + 164, cy, 8, '#ff5a6a', 'right');
    ui.chip = { x: SX, y: cy, w: 172 };
    if (SHOW_FPS) this.text('FPS ' + ui.fps, SX + 4, top - 88, 9, 'rgba(201,180,138,0.6)', 'left');
    // boss bar
    const bx = W / 2, by = HUD.SAFE_BOTTOM - 6;
    this.serif('THE OBSIDIAN SENTINEL', bx, by + 17, 11, '#d9c9a0');
    this.bar(bx - 156, by, 304, 8, b.hp / BOSS_MAX_HP, b.hp_lag / BOSS_MAX_HP, '#b3202f', 'rgba(242,230,208,0.55)');
    this.base(); c.fillStyle = '#1a1712'; c.fillRect(bx - 152, H - by + 9, 304, 3);
    const stag = b.state === S_STAGGERED;
    c.fillStyle = stag ? (((t * 10) | 0) % 2 === 0 ? '#ffffff' : '#d8a640') : '#d8a640';
    c.fillRect(bx - 152, H - by + 9, 304 * (stag ? 1 : clamp(b.poise / BOSS_POISE, 0, 1)), 3);
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
  }

  drawOverlay(g, ui) {
    const lvl = g.overlayLevel();
    if (lvl <= 0) return;
    const c = this.ctx, W = this.W, H = this.H, died = g.outcome === 'death';
    this.base(); c.globalAlpha = 0.45 * lvl; c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.7 * lvl; c.fillRect(0, H / 2 - 20 - 55, W, 110);
    if (died) this.serif('YOU DIED', W / 2, H / 2 + 26, 50, '#b3202f', lvl);
    else { this.serif('VICTORY', W / 2, H / 2 + 30, 50, '#d9b45c', lvl); this.serif('THE OBSIDIAN SENTINEL HAS FALLEN', W / 2, H / 2 - 12, 13, '#d9c9a0', lvl, false); }
    const ra = clamp((lvl - 0.5) * 2, 0, 1);
    if (ra > 0) {
      const rx = W / 2, ry = H / 2 - 78;
      this.base(); c.globalAlpha = ra;
      c.fillStyle = 'rgba(8,8,11,0.9)'; rrectPath(c, rx - 93, H - ry - 21, 186, 42, 8); c.fill();
      c.save(); c.shadowColor = 'rgba(230,31,51,0.8)'; c.shadowBlur = 8; c.strokeStyle = '#8A2432'; c.lineWidth = 2;
      rrectPath(c, rx - 92, H - ry - 20, 184, 40, 8); c.stroke(); c.restore();
      this.text('TAP TO RETRY', rx, ry, 13, '#f2e6d0', 'center', 'bold', ra);
      ui.retry = { x: rx, y: ry };
    }
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
      this.drawRigBody(player);
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
