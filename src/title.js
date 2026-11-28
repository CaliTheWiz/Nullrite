// ============================================================ TITLE SCREEN + MAIN MENU
// Nothing from the game is shown: a dark void, fog drifting, embers rising, ash falling, a faint sigil turning
// slowly behind the name, a thin crimson light. Touch to begin -> CONTINUE / NEW GAME / OPTIONS.
// Drawn in CSS pixels, origin top-left.

class TitleScreen {
  constructor() {
    this.t = 0; this.stage = 'press'; this.stage_t = 0; this.sel = -1; this.rects = []; this.confirm = false; this.leave = null; this.leave_t = 0;
    const r = mulberry32(7);
    this.embers = []; for (let i = 0; i < 46; i++) this.embers.push(this.ember(r, true));
    this.ash = []; for (let i = 0; i < 34; i++) this.ash.push({ x: r(), y: r(), s: 0.6 + r() * 1.4, v: 0.012 + r() * 0.02, w: r() * TAU });
    this.fog = []; for (let i = 0; i < 9; i++) this.fog.push({ x: r() * 1.4 - 0.2, y: 0.45 + r() * 0.55, s: 0.5 + r() * 0.7, v: (r() - 0.5) * 0.012, a: 0.05 + r() * 0.07 });
    this.rng = r;
  }
  ember(r, anyY) { return { x: 0.3 + r() * 0.4 + (r() - 0.5) * 0.5, y: anyY ? r() : 1.05, v: 0.03 + r() * 0.06, s: 2 + r() * 3.5, w: r() * TAU, gold: r() < 0.25, life: r() }; }
  /** Back to the title (from the game). */
  reset(stage) { this.stage = stage || 'press'; this.stage_t = 0; this.sel = -1; this.confirm = false; this.leave = null; this.leave_t = 0; }
  update(dt) {
    this.t += dt; this.stage_t += dt;
    for (const e of this.embers) {
      e.y -= e.v * dt; e.w += dt * 1.3; e.life += dt * 0.25;
      if (e.y < -0.05) Object.assign(e, this.ember(this.rng, false));
    }
    for (const a of this.ash) { a.y += a.v * dt; a.w += dt * 0.7; if (a.y > 1.05) { a.y = -0.05; a.x = this.rng(); } }
    for (const f of this.fog) { f.x += f.v * dt; if (f.x > 1.4) f.x = -0.4; if (f.x < -0.4) f.x = 1.4; }
    if (this.leave) { this.leave_t += dt; if (this.leave_t >= 0.7) { const a = this.leave; this.leave = null; return a; } }
    return null;
  }
  go(action) { if (!this.leave) { this.leave = action; this.leave_t = 0; } }
  /** Touch at CSS pixels from the top-left. */
  touch(x, y, sound) {
    if (this.leave) return;
    if (this.stage === 'press') { this.stage = 'menu'; this.stage_t = 0; sound.play('ui_tap', 0.55); return; }
    for (const r of this.rects) {
      if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h || r.off) continue;
      this.sel = r.i; sound.play('ui_tap', 0.5);
      const a = r.act;
      if (a === 'continue') this.go('continue');
      else if (a === 'new') { if (hasSaveGame()) { this.stage = 'confirm'; this.stage_t = 0; } else this.go('new'); }
      else if (a === 'yes') this.go('new');
      else if (a === 'no' || a === 'back') { this.stage = 'menu'; this.stage_t = 0; this.sel = -1; saveSettings(); }
      else if (a === 'options') { this.stage = 'options'; this.stage_t = 0; this.sel = -1; }
      else if (a === 'sfx' || a === 'ambience') {
        const v = clamp(Math.round((SETTINGS[a] + (r.dir || 0) * 0.1) * 10) / 10, 0, 1); SETTINGS[a] = v; saveSettings();
        if (a === 'sfx') sound.play('ui_equip', 0.7);
      }
      else if (a === 'haptics') { SETTINGS.haptics = !SETTINGS.haptics; saveSettings(); if (SETTINGS.haptics) haptic('medium', 0.8); }
      else if (a === 'fps') { SETTINGS.fps = !SETTINGS.fps; saveSettings(); }
      return;
    }
  }

  draw(R) {
    const c = R.ctx, W = R.W, H = R.H, t = this.t;
    R.base(); c.fillStyle = '#030304'; c.fillRect(0, 0, W, H);
    // a low crimson glow on an unseen horizon
    let g = c.createRadialGradient(W / 2, H * 0.78, 10, W / 2, H * 0.78, W * 0.62);
    g.addColorStop(0, 'rgba(120,20,34,0.42)'); g.addColorStop(0.5, 'rgba(60,10,18,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // the sigil, barely there, turning
    const sz = H * 1.05, cx = W / 2, cy = H * 0.42;
    for (const [col, a, dir] of [[CRIMSON, 0.11, 1], [RUNE_GOLD, 0.05, -0.6]]) {
      c.save(); c.translate(cx, cy); c.rotate(t * 0.025 * dir); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * (0.85 + 0.15 * Math.sin(t * 0.7));
      c.drawImage(tinted(ART.ritual, col).c, -sz / 2, -sz / 2, sz, sz); c.restore();
    }
    // a thin shaft of light falling through it
    const fl = 0.8 + 0.2 * Math.sin(t * 1.7) * Math.sin(t * 0.43);
    g = c.createLinearGradient(cx - W * 0.05, 0, cx + W * 0.05, 0);
    g.addColorStop(0, 'rgba(255,60,80,0)'); g.addColorStop(0.5, `rgba(255,70,90,${0.09 * fl})`); g.addColorStop(1, 'rgba(255,60,80,0)');
    c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(cx - W * 0.05, 0, W * 0.1, H);
    g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(0.35, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
    c.globalCompositeOperation = 'source-over'; c.fillStyle = g; c.fillRect(0, 0, W, H);
    // fog
    for (const f of this.fog) R.img(ART.glowSoft, f.x * W, f.y * H, W * f.s, H * f.s * 0.55, { color: '#5c5766', alpha: f.a });
    // embers rising, ash falling
    for (const e of this.embers) {
      const x = e.x * W + Math.sin(e.w) * 10, y = e.y * H, a = 0.35 + 0.45 * Math.abs(Math.sin(e.life * 3)) * Math.min(1, e.y * 2);
      R.img(ART.glow, x, y, e.s * 3, e.s * 3, { color: e.gold ? RUNE_GOLD : CRIMSON, alpha: a, blend: 'add' });
    }
    R.base(); c.fillStyle = 'rgba(150,140,150,0.35)';
    for (const a of this.ash) { c.globalAlpha = 0.25 + 0.2 * Math.sin(a.w); c.fillRect(a.x * W + Math.sin(a.w) * 6, a.y * H, a.s, a.s); }
    c.globalAlpha = 1;
    // vignette
    g = c.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, W * 0.62); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // the name
    const ly = H * 0.36, intro = clamp(this.t / 2.2, 0, 1);
    this.logo(c, cx, ly, Math.min(52, H * 0.13), intro);
    // prompt / menu
    this.rects = [];
    const k = clamp(this.stage_t / 0.5, 0, 1);
    if (this.stage === 'press') this.label(c, 'TOUCH TO BEGIN', cx, H * 0.7, 12, '#c9b48a', intro * (0.45 + 0.4 * Math.sin(t * 2.4)), 4);
    else if (this.stage === 'menu') {
      const can = hasSaveGame();
      this.items(c, [['CONTINUE', 'continue', !can], ['NEW GAME', 'new'], ['OPTIONS', 'options']], cx, H * 0.6, 34, k);
    } else if (this.stage === 'confirm') {
      this.label(c, 'Begin anew? Everything you carry will be lost.', cx, H * 0.58, 11, '#b3a68c', k, 0.5);
      this.items(c, [['NO', 'no'], ['YES', 'yes']], cx, H * 0.68, 32, k);
    } else if (this.stage === 'options') this.options(c, cx, H * 0.55, k);
    R.text('build ' + BUILD, W - Math.max(16, HUD.SAFE_X - 30), 14, 8, 'rgba(201,180,138,0.35)', 'right');
    if (this.leave) { R.base(); c.globalAlpha = clamp(this.leave_t / 0.7, 0, 1); c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
  }
  logo(c, cx, cy, size, a) {
    R0(c); c.globalAlpha = a; c.textBaseline = 'middle'; c.font = `bold ${size}px Georgia, 'Times New Roman', serif`;
    const word = 'NULLRITE', sp = size * 0.22;
    let w = 0; const ws = [...word].map(ch => { const m = c.measureText(ch).width; w += m + sp; return m; }); w -= sp;
    let x = cx - w / 2;
    c.shadowColor = 'rgba(230,31,51,0.55)'; c.shadowBlur = size * 0.5; c.fillStyle = '#e8dcc4'; c.textAlign = 'left';
    [...word].forEach((ch, i) => { c.fillText(ch, x, cy); x += ws[i] + sp; });
    c.shadowBlur = 0;
    // thin lines either side, ending in small diamonds
    c.strokeStyle = 'rgba(176,138,61,0.6)'; c.lineWidth = 1; c.fillStyle = 'rgba(176,138,61,0.8)';
    for (const s of [-1, 1]) {
      const x0 = cx + s * (w / 2 + size * 0.45), x1 = cx + s * (w / 2 + size * 2.1);
      c.beginPath(); c.moveTo(x0, cy); c.lineTo(x1, cy); c.stroke();
      c.beginPath(); c.moveTo(x1 + s * 4, cy); c.lineTo(x1, cy - 3); c.lineTo(x1 - s * 4, cy); c.lineTo(x1, cy + 3); c.closePath(); c.fill();
    }
    c.globalAlpha = 1;
  }
  label(c, s, x, y, size, col, a, spacing) {
    R0(c); c.globalAlpha = clamp(a, 0, 1); c.font = `bold ${size}px Georgia, serif`; c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (spacing) { const ch = [...s], gap = size * 0.08 * spacing; let w = ch.reduce((m, q) => m + c.measureText(q).width + gap, -gap), xx = x - w / 2; c.textAlign = 'left'; for (const q of ch) { c.fillText(q, xx, y); xx += c.measureText(q).width + gap; } }
    else c.fillText(s, x, y);
    c.globalAlpha = 1;
  }
  items(c, list, cx, y0, dy, a) {
    list.forEach(([label, act, off], i) => {
      const y = y0 + i * dy, on = this.sel === i && !off;
      this.label(c, label, cx, y, 17, off ? '#3f3a34' : on ? '#d9b45c' : '#b3a68c', a, 1.2);
      if (on) { c.globalAlpha = a; c.fillStyle = CRIMSON; c.fillRect(cx - 96, y - 2, 10, 4); c.fillRect(cx + 86, y - 2, 10, 4); c.globalAlpha = 1; }
      this.rects.push({ x: cx - 130, y: y - dy / 2, w: 260, h: dy, act, i, off });
    });
  }
  options(c, cx, y0, a) {
    const rows = [['SOUND EFFECTS', 'sfx'], ['MUSIC', 'ambience'], ['VIBRATION', 'haptics'], ['FPS COUNTER', 'fps']], dy = 30, lx = cx - 150, rx = cx + 150;
    rows.forEach(([label, key], i) => {
      const y = y0 + i * dy, v = SETTINGS[key];
      this.label(c, label, lx + 70, y, 12, '#b3a68c', a, 1);
      if (typeof v === 'number') {
        const bx = cx + 30, bw = 110;
        c.globalAlpha = a; c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(bx, y - 2, bw, 4); c.fillStyle = '#d9b45c'; c.fillRect(bx, y - 2, bw * v, 4);
        this.label(c, '‹', bx - 18, y, 16, '#d9b45c', a); this.label(c, '›', bx + bw + 18, y, 16, '#d9b45c', a);
        this.rects.push({ x: bx - 40, y: y - dy / 2, w: 40 + bw / 2, h: dy, act: key, dir: -1, i: 10 + i });
        this.rects.push({ x: bx + bw / 2, y: y - dy / 2, w: bw / 2 + 40, h: dy, act: key, dir: 1, i: 10 + i });
      } else {
        this.label(c, v ? 'ON' : 'OFF', cx + 85, y, 13, v ? '#d9b45c' : '#6f665a', a, 1);
        this.rects.push({ x: cx + 20, y: y - dy / 2, w: rx - cx, h: dy, act: key, i: 10 + i });
      }
    });
    this.items(c, [['BACK', 'back']], cx, y0 + rows.length * dy + 18, 30, a);
  }
}
function R0(c) { c.shadowBlur = 0; c.globalCompositeOperation = 'source-over'; }
