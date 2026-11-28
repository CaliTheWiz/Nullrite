// ============================================================ MUSIC (procedural, rendered once into seamless loops)
// Each track is written as a schedule of synthesized notes, rendered by an OfflineAudioContext (native, fast, off the
// main thread) for one cycle plus the reverb tail; the tail is folded back onto the start so the loop is seamless.
// Tracks crossfade by screen / room / fight state. Nothing is loaded: every sound is made here.

const MUSIC_VOLUME = 0.5, MUSIC_SR = 24000;
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Instruments for one offline render. */
function musicKit(ctx, out) {
  const sr = ctx.sampleRate, K = {};
  const noise = ctx.createBuffer(1, sr * 2, sr); { const d = noise.getChannelData(0), r = mulberry32(5); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; }
  K.reverb = (sec, wet) => {
    const n = Math.floor(sec * sr), ir = ctx.createBuffer(2, n, sr), r = mulberry32(9);
    for (let c = 0; c < 1; c++) { const d = ir.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / n, 2.2) * (i < sr * 0.01 ? i / (sr * 0.01) : 1); }
    const cv = ctx.createConvolver(); cv.buffer = ir; const g = ctx.createGain(); g.gain.value = wet; cv.connect(g); g.connect(out); return cv;
  };
  const env = (g, t, atk, hold, rel, peak) => {
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.setValueAtTime(peak, t + atk + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + atk + hold + rel);
  };
  const send = (node, dry, wetBus, wet) => {
    const d = ctx.createGain(); d.gain.value = dry; node.connect(d); d.connect(out);
    if (wetBus && wet) { const w = ctx.createGain(); w.gain.value = wet; node.connect(w); w.connect(wetBus); }
  };
  /** Sustained pad: detuned saws + a triangle through a low-pass that breathes. */
  K.pad = (notes, t, dur, o) => {
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.cut || 800; lp.Q.value = 0.6;
    lp.frequency.setValueAtTime((o.cut || 800) * 0.6, t); lp.frequency.linearRampToValueAtTime(o.cut || 800, t + dur * 0.5); lp.frequency.linearRampToValueAtTime((o.cut || 800) * 0.7, t + dur);
    lp.connect(g); env(g, t, o.atk || 3, Math.max(0, dur - (o.atk || 3)), o.rel || 4, o.vol || 0.05);
    for (const m of notes) for (const [type, det] of [['sawtooth', -7], ['sawtooth', 6], ['triangle', 0]]) {
      const os = ctx.createOscillator(); os.type = type; os.frequency.value = midi(m); os.detune.value = det; os.connect(lp); os.start(t); os.stop(t + dur + (o.rel || 4) + 0.1);
    }
    send(g, o.dry === undefined ? 0.8 : o.dry, o.bus, o.wet || 0.6);
  };
  /** Choir 'ah': saws through two vowel formants. */
  K.choir = (notes, t, dur, o) => {
    const g = ctx.createGain(); env(g, t, o.atk || 1, Math.max(0, dur - (o.atk || 1)), o.rel || 1.5, o.vol || 0.05);
    for (const [f, q, gn] of [[700, 6, 1], [1150, 7, 0.6], [2600, 8, 0.15]]) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; const bg = ctx.createGain(); bg.gain.value = gn; bp.connect(bg); bg.connect(g);
      for (const m of notes) for (const det of [-9, 0, 8]) {
        const os = ctx.createOscillator(); os.type = 'sawtooth'; os.frequency.value = midi(m); os.detune.value = det; os.connect(bp); os.start(t); os.stop(t + dur + (o.rel || 1.5) + 0.1);
      }
    }
    send(g, 0.5, o.bus, o.wet || 0.9);
  };
  /** A distant bell: sine with inharmonic partials, long decay. */
  K.bell = (m, t, o) => {
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.vol || 0.05, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dec || 5));
    for (const [k, a] of [[1, 1], [2.76, 0.35], [5.4, 0.12], [0.5, 0.25]]) {
      const os = ctx.createOscillator(); os.frequency.value = midi(m) * k; const pg = ctx.createGain(); pg.gain.value = a; os.connect(pg); pg.connect(g); os.start(t); os.stop(t + (o.dec || 5) + 0.1);
    }
    send(g, o.dry === undefined ? 0.25 : o.dry, o.bus, o.wet || 1);
  };
  /** Plucked string (lyre): triangle + octave sine, fast decay, darkening filter. */
  K.pluck = (m, t, o) => {
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(o.cut || 2600, t); lp.frequency.exponentialRampToValueAtTime(500, t + 1.2);
    lp.connect(g); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.vol || 0.08, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dec || 1.6));
    for (const [type, k, a] of [['triangle', 1, 1], ['sine', 2, 0.35], ['sine', 3, 0.1]]) {
      const os = ctx.createOscillator(); os.type = type; os.frequency.value = midi(m) * k; const pg = ctx.createGain(); pg.gain.value = a; os.connect(pg); pg.connect(lp); os.start(t); os.stop(t + (o.dec || 1.6) + 0.1);
    }
    send(g, 0.8, o.bus, o.wet || 0.5);
  };
  /** Bowed low string or staccato string: saws through a low-pass with a short envelope. */
  const strBus = {};                                   // one filter per string section (cutoff + reverb send), shared by its notes
  K.string = (m, t, dur, o) => {
    const key = (o.cut || 1100) + ':' + (o.wet || 0.35);
    let lp = strBus[key];
    if (!lp) { lp = strBus[key] = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.cut || 1100; lp.Q.value = 1.2; send(lp, 0.85, o.bus, o.wet || 0.35); }
    const g = ctx.createGain(); g.connect(lp); env(g, t, o.atk || 0.02, Math.max(0, dur - (o.atk || 0.02)), o.rel || 0.12, o.vol || 0.06);
    for (const det of [-8, 7]) { const os = ctx.createOscillator(); os.type = 'sawtooth'; os.frequency.value = midi(m); os.detune.value = det; os.connect(g); os.start(t); os.stop(t + dur + (o.rel || 0.12) + 0.2); }
  };
  /** Brass stab: a saw chord with a filter that opens on the attack and closes. */
  K.brass = (notes, t, o) => {
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(o.cut || 1900, t + 0.06); lp.frequency.exponentialRampToValueAtTime(450, t + 0.9);
    lp.connect(g); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.vol || 0.07, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dec || 1.3));
    for (const m of notes) for (const det of [-6, 5]) { const os = ctx.createOscillator(); os.type = 'sawtooth'; os.frequency.value = midi(m); os.detune.value = det; os.connect(lp); os.start(t); os.stop(t + (o.dec || 1.3) + 0.1); }
    send(g, 0.8, o.bus, o.wet || 0.5);
  };
  /** Big drum: pitched-down sine body + a muffled noise slap. */
  K.drum = (t, o) => {
    const g = ctx.createGain(), os = ctx.createOscillator(); os.frequency.setValueAtTime(o.f0 || 130, t); os.frequency.exponentialRampToValueAtTime(o.f1 || 45, t + 0.35);
    g.gain.setValueAtTime(o.vol || 0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dec || 0.9)); os.connect(g); os.start(t); os.stop(t + (o.dec || 0.9) + 0.1);
    const ns = ctx.createBufferSource(); ns.buffer = noise; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.slap || 900;
    const ng = ctx.createGain(); ng.gain.setValueAtTime((o.vol || 0.3) * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    ns.connect(lp); lp.connect(ng); ng.connect(g); ns.start(t, Math.random() * 1.5, 0.2);
    send(g, 0.9, o.bus, o.wet || 0.25);
  };
  /** Metallic tick (phase-2 hats). */
  K.tick = (t, o) => {
    const ns = ctx.createBufferSource(); ns.buffer = noise; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5500;
    const g = ctx.createGain(); g.gain.setValueAtTime(o.vol || 0.03, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dec || 0.07));
    ns.connect(hp); hp.connect(g); ns.start(t, (t * 7.31) % 1.5, 0.1); send(g, 0.7, o.bus, 0.2);
  };
  /** Filtered noise bed (wind, room tone) with slow swells. */
  K.wind = (t, dur, o) => {
    const ns = ctx.createBufferSource(); ns.buffer = noise; ns.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = o.f || 600; bp.Q.value = o.q || 0.7;
    const g = ctx.createGain(), sw = ctx.createGain(); g.gain.setValueAtTime(0, t);
    const r = mulberry32(o.seed || 3), steps = Math.floor(dur / 4);
    for (let i = 1; i <= steps; i++) { g.gain.linearRampToValueAtTime((o.vol || 0.03) * (0.4 + 0.6 * r()), t + i * 4); bp.frequency.linearRampToValueAtTime((o.f || 600) * (0.7 + 0.6 * r()), t + i * 4); }
    sw.gain.setValueAtTime(0, t); sw.gain.linearRampToValueAtTime(1, t + 2); sw.gain.setValueAtTime(1, t + dur); sw.gain.linearRampToValueAtTime(0, t + dur + 2);
    ns.connect(bp); bp.connect(g); g.connect(sw); ns.start(t); ns.stop(t + dur + 2.1); send(sw, 0.8, o.bus, 0.5);
  };
  /** Fire crackle: sparse tiny pops. */
  K.crackle = (t, dur, o) => {
    const r = mulberry32(o.seed || 17), ns = ctx.createBufferSource(); ns.buffer = noise; ns.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2800; bp.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    for (let x = t + 0.05; x < t + dur - 0.1; x += 0.06 + r() * 0.35) {
      g.gain.setValueAtTime(0.0001, x); g.gain.linearRampToValueAtTime((o.vol || 0.02) * (0.3 + r()), x + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, x + 0.02 + r() * 0.03);
    }
    ns.connect(bp); bp.connect(g); g.connect(out); ns.start(t); ns.stop(t + dur);
  };
  /** Sub drone that swells slowly. */
  K.sub = (m, t, dur, o) => {
    const os = ctx.createOscillator(); os.frequency.value = midi(m); const g = ctx.createGain(), sw = ctx.createGain(); g.gain.setValueAtTime((o.vol || 0.1) * 0.6, t);
    const steps = Math.floor(dur / 6); for (let i = 1; i <= steps; i++) g.gain.linearRampToValueAtTime((o.vol || 0.1) * (i % 2 ? 1 : 0.6), t + i * 6);
    sw.gain.setValueAtTime(0, t); sw.gain.linearRampToValueAtTime(1, t + 2); sw.gain.setValueAtTime(1, t + dur); sw.gain.linearRampToValueAtTime(0, t + dur + 2);
    os.connect(g); g.connect(sw); sw.connect(out); os.start(t); os.stop(t + dur + 2.1);
  };
  return K;
}

// ---------------------------------------------------------------- the tracks (each fills two cycles of `len` seconds)
const TRACKS = {
  // Title: dark ambient in D, modal and slow. A drone, blooming pads, bells far away, wind.
  title: { len: 48, build(K, L, bus) {
    const chords = [[50, 53, 57, 64], [46, 50, 53, 57], [43, 46, 50, 53], [45, 52, 55, 60]];
    const bells = [[5, 74], [13.5, 69], [19, 77], [26, 72], [31.5, 76], [38, 74], [44.2, 67]];
    for (let c = 0; c < 1; c++) {
      const o = c * L;
      chords.forEach((ch, i) => K.pad(ch, o + i * 12, 12.5, { atk: 4, rel: 5, vol: 0.022, cut: 700, bus, wet: 0.7 }));
      chords.forEach((ch, i) => K.pad([ch[0] - 12], o + i * 12, 12.5, { atk: 3, rel: 4, vol: 0.03, cut: 260, bus, wet: 0.3 }));
      for (const [t, m] of bells) K.bell(m, o + t, { vol: 0.03, dec: 6, bus });
      K.sub(26, o, L, { vol: 0.12 });
      K.wind(o, L, { f: 650, vol: 0.05, bus, seed: 3 + c * 0 });
    }
  }},
  // Shrine: the one safe place. A slow lyre, a cello, a warm pad, the fire.
  shrine: { len: 40, gain: 1.9, build(K, L, bus) {
    const prog = [[45, [57, 64, 67, 71, 72]], [41, [57, 60, 64, 65, 69]], [48, [55, 60, 64, 67, 72]], [43, [55, 59, 62, 67, 71]]];
    const r = mulberry32(21);
    for (let c = 0; c < 1; c++) {
      const o = c * L;
      prog.forEach(([root, arp], i) => {
        const t0 = o + i * 10;
        K.pad(arp.slice(0, 3), t0, 10.5, { atk: 3, rel: 4, vol: 0.012, cut: 900, bus, wet: 0.6 });
        K.string(root - 12, t0 + 0.2, 9.4, { atk: 1.8, rel: 2.5, vol: 0.035, cut: 500, bus, wet: 0.4 });
        const pat = [0, 2, 1, 3, 2, 4, 3, 1, 2, 0, 1, 2, 4, 3];
        pat.forEach((k, j) => { const jit = (r() - 0.5) * 0.04; K.pluck(arp[k], t0 + 0.4 + j * 0.68 + jit, { vol: 0.05 * (j % 4 === 0 ? 1.2 : 0.8), dec: 2.2, bus, wet: 0.55 }); });
      });
      K.crackle(o, L, { vol: 0.015, seed: 17 });
      K.wind(o, L, { f: 400, vol: 0.015, bus, seed: 8 });
    }
  }},
  // Boss: 88 bpm, D minor. Drums, a low string ostinato, brass stabs, a choir. Eight bars.
  boss: { len: 8 * 4 * 60 / 88, build(K, L, bus) { bossTrack(K, L, bus, false); } },
  // Phase 2: the same bars, harder: high tremolo strings, ticking metal, a drum on every beat, more choir.
  boss2: { len: 8 * 4 * 60 / 88, build(K, L, bus) { bossTrack(K, L, bus, true); } },
};
function bossTrack(K, L, bus, two) {
  const beat = 60 / 88, bar = beat * 4;
  const harm = [[38, 0], [38, 0], [34, 1], [36, 2], [38, 0], [38, 0], [43, 0], [45, 3]];         // root, chord quality
  const triad = (r, q) => q === 3 ? [r + 12, r + 16, r + 19] : q === 1 || q === 2 ? [r + 12, r + 16, r + 19] : [r + 12, r + 15, r + 19];
  for (let c = 0; c < 1; c++) {
    const o = c * L;
    harm.forEach(([root, q], b) => {
      const t0 = o + b * bar, ch = triad(root, q);
      // low string ostinato: eighths, accented, rising on the last bar
      const pat = [0, 0, 12, 0, 0, 12, 0, 7];
      for (let i = 0; i < 8; i++) K.string(root + pat[i] + (b === 7 && i > 3 ? 2 : 0), t0 + i * beat / 2, beat * 0.32, { vol: i % 3 === 0 ? 0.075 : 0.05, cut: 1100, bus, wet: 0.3 });
      K.string(root - 12, t0, bar * 0.95, { atk: 0.05, rel: 0.4, vol: 0.05, cut: 300, bus, wet: 0.2 });
      // drums
      const hits = two ? [0, 1, 2, 2.5, 3] : [0, 1.5, 2];
      for (const h of hits) K.drum(t0 + h * beat, { vol: h === 0 ? 0.42 : 0.28, f0: h === 0 ? 120 : 150, dec: h === 0 ? 1.1 : 0.7, bus, wet: 0.35 });
      if (b === 7) for (let i = 0; i < (two ? 8 : 4); i++) K.drum(t0 + 2 * beat + i * beat / (two ? 4 : 2), { vol: 0.16 + 0.03 * i, f0: 170, dec: 0.4, bus });
      // brass stabs and the choir
      if (b !== 1 && b !== 5) K.brass(ch, t0, { vol: two ? 0.075 : 0.06, cut: two ? 2300 : 1800, bus, wet: 0.5 });
      K.choir(ch.map(m => m + (b % 2 ? 12 : 0)), t0, bar, { atk: 0.7, rel: 1.2, vol: two ? 0.035 : 0.024, bus, wet: 0.9 });
      if (two) {
        for (let i = 0; i < 16; i++) K.string(ch[i % 2 ? 2 : 0] + 12, t0 + i * beat / 4, beat * 0.18, { vol: 0.022, cut: 3000, bus, wet: 0.4 });
        for (let i = 0; i < 8; i++) K.tick(t0 + i * beat / 2 + beat / 4, { vol: i % 2 ? 0.02 : 0.035, bus });
      }
    });
  }
}

class MusicBank {
  constructor() { this.ctx = null; this.buf = {}; this.cur = null; this.voices = {}; this.out = null; this.vol = -1; this.rendering = false; }
  /** Render every track (no user gesture needed for offline rendering), title first. */
  prepare() {
    if (this.rendering) return; this.rendering = true;
    const order = ['title', 'shrine', 'boss', 'boss2'];
    const next = () => { const n = order.shift(); if (n) this.render(n).then(next, next); };
    next();
  }
  /** Call with the live AudioContext once the player has touched the screen (iOS). */
  init(ctx) {
    if (this.ctx || !ctx) return;
    this.ctx = ctx; this.out = ctx.createGain(); this.out.gain.value = MUSIC_VOLUME * SETTINGS.ambience;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; this.out.connect(comp); comp.connect(ctx.destination);
    this.prepare();
  }
  render(name) {
    const T = TRACKS[name], OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return Promise.reject(new Error('no offline audio'));
    const rev = name === 'title' ? 5 : name === 'shrine' ? 3 : 2.2, L = T.len, tail = rev + 2.5;
    const n = Math.ceil((L + tail) * MUSIC_SR), oc = new OAC(2, n, MUSIC_SR);
    const mix = oc.createGain(); mix.gain.value = T.gain || 1; mix.connect(oc.destination);
    const K = musicKit(oc, mix), bus = K.reverb(rev, name === 'title' ? 0.7 : 0.5);
    T.build(K, L, bus);
    const done = (full) => {                          // fold everything past the loop point back onto its start
      const len = Math.floor(L * MUSIC_SR), b = oc.createBuffer(2, len, MUSIC_SR);
      for (let c = 0; c < 2; c++) {
        const src = full.getChannelData(c), dst = b.getChannelData(c); dst.set(src.subarray(0, len));
        for (let i = len; i < src.length && i - len < len; i++) dst[i - len] += src[i];
      }
      this.buf[name] = b;
    };
    return new Promise((res, rej) => {
      oc.oncomplete = (e) => { done(e.renderedBuffer); res(); };
      try { const p = oc.startRendering(); if (p && p.then) p.then(() => {}, rej); } catch (e) { rej(e); }
    });
  }
  /** Each frame: which track should be playing (null = silence). Crossfades; phase 2 keeps the beat. */
  set(name) {
    if (!this.ctx) return;
    // iOS hands out the context suspended (or "interrupted") until a touch really unlocks it: schedule nothing on a
    // clock that isn't running, or the fades are lost and the track stays silent
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime, v = MUSIC_VOLUME * SETTINGS.ambience, gn = this.out.gain;
    if (v !== this.vol) {
      gn.cancelScheduledValues(now); gn.setValueAtTime(this.vol < 0 ? v : gn.value, now); gn.linearRampToValueAtTime(v, now + 0.2); this.vol = v;
    }
    if (name === this.cur) { if (name && !this.voices[name] && this.buf[name]) this.start(name, 0, 1.5); return; }
    const prev = this.cur; this.cur = name;
    if (prev && this.voices[prev]) this.fadeOut(prev, prev.startsWith('boss') && name && name.startsWith('boss') ? 1.2 : 2.2);
    if (!name || !this.buf[name]) return;
    let offset = 0;
    if (prev && name.startsWith('boss') && prev.startsWith('boss') && this.voices[prev]) {       // boss -> boss2 on the same beat
      offset = (now - this.voices[prev].t0) % TRACKS[prev].len;
    }
    this.start(name, offset, name.startsWith('boss') ? 0.6 : 2.5);
  }
  start(name, offset, fade) {
    const now = this.ctx.currentTime, src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = this.buf[name]; src.loop = true; g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(1, now + fade);
    src.connect(g); g.connect(this.out); src.start(now, offset);
    this.voices[name] = { src, g, t0: now - offset };
  }
  fadeOut(name, sec) {
    const v = this.voices[name]; if (!v) return; delete this.voices[name];
    const now = this.ctx.currentTime; v.g.gain.cancelScheduledValues(now); v.g.gain.setValueAtTime(Math.max(0.0001, v.g.gain.value), now);
    v.g.gain.exponentialRampToValueAtTime(0.0001, now + sec); v.src.stop(now + sec + 0.1);
  }
}
