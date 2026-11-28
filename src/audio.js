// ============================================================ AUDIO (WebAudio, synthesized at boot)
const SR = 22050;

function dspTime(d) { const n = Math.floor(SR * d), t = new Float32Array(n); for (let i = 0; i < n; i++) t[i] = i / SR; return t; }
function dspNoise(n, seed) { const r = mulberry32(seed), x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = r() * 2 - 1; return x; }
function dspBiquadBP(x, f0, Q) {
  const w0 = TAU * f0 / SR, alpha = Math.sin(w0) / (2 * Q), cs = Math.cos(w0);
  const b0 = alpha, b2 = -alpha, a0 = 1 + alpha, a1 = -2 * cs, a2 = 1 - alpha;
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
function dspPeak(x) { let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); return m; }
/** Band-pass noise between lo..hi Hz (two biquad passes), normalised to peak 1. */
function dspBand(x, lo, hi) {
  const f0 = Math.sqrt(lo * hi), Q = clamp(f0 / (hi - lo), 0.3, 4);
  const y = dspBiquadBP(dspBiquadBP(x, f0, Q), f0, Q), m = dspPeak(y);
  if (m > 0) for (let i = 0; i < y.length; i++) y[i] /= m;
  return y;
}
/** Gentle first-order low-pass (takes the edge off bright noise). */
function dspSoften(x, cutoff) {
  const a = Math.exp(-TAU * cutoff / SR), y = new Float32Array(x.length); let s = 0;
  for (let i = 0; i < x.length; i++) { s = (1 - a) * x[i] + a * s; y[i] = s; }
  return y;
}
function dspNorm(x, peak) { const m = dspPeak(x); if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m; return x; }
function dspFade(x, msIn, msOut) {
  const a = Math.floor(SR * (msIn === undefined ? 2 : msIn) / 1000), b = Math.floor(SR * (msOut === undefined ? 8 : msOut) / 1000);
  for (let i = 0; i < a && i < x.length; i++) x[i] *= i / a;
  for (let i = 0; i < b && i < x.length; i++) x[x.length - 1 - i] *= i / b;
  return x;
}
/** Sine sweeping f0 -> f1 with exponential curve; returns [signal, t]. */
function dspSweep(f0, f1, d, curve) {
  const t = dspTime(d), y = new Float32Array(t.length); let ph = 0;
  for (let i = 0; i < t.length; i++) { const f = f1 + (f0 - f1) * Math.exp(-t[i] * curve); ph += TAU * f / SR; y[i] = Math.sin(ph); }
  return [y, t];
}
function dspMap(n, fn) { const y = new Float32Array(n); for (let i = 0; i < n; i++) y[i] = fn(i); return y; }

const SYNTHS = {
  whoosh: () => sfxWhoosh(false), whoosh_heavy: () => sfxWhoosh(true),
  crunch() {
    const d = 0.42, t = dspTime(d), n = t.length, noise = dspNoise(n, 7), body0 = dspBand(noise, 250, 3200);
    const [th] = dspSweep(160, 42, d, 14);
    const x = dspMap(n, i => {
      const tt = t[i], hold = Math.floor(i / 3) * 3;
      const body = Math.round(body0[hold] * Math.exp(-t[hold] * 13) * 24) / 24;
      let clang = 0;
      for (const [f, k] of [[523, 7], [1187, 9], [1873, 11], [2711, 13], [3907, 16]]) clang += Math.sin(TAU * f * tt) * Math.exp(-tt * k);
      return Math.tanh((noise[i] * Math.exp(-tt * 70) * 0.5 + body * 0.55 + th[i] * Math.exp(-tt * 9) + clang * 0.16) * 1.4);
    });
    return dspFade(dspNorm(dspSoften(x, 3800), 0.85));
  },
  dash() {
    const d = 0.24, t = dspTime(d), n = t.length, noise = dspNoise(n, 3);
    const hi = dspBand(noise, 1100, 3600), mid = dspBand(noise, 450, 1400), lo = dspBand(noise, 120, 420);
    const x = dspMap(n, i => {
      const tt = t[i], w = Math.exp(-tt * 18), env = (1 - Math.exp(-tt * 120)) * Math.exp(-tt * 14);
      return (hi[i] * w * 0.6 + mid[i] * (1 - w * 0.6)) * env + lo[i] * Math.exp(-tt * 24) * 0.7;
    });
    return dspFade(dspNorm(dspSoften(x, 2600), 0.6), 3, 12);
  },
  thud() {
    const d = 0.36, [s, t] = dspSweep(95, 36, d, 9), click = dspBand(dspNoise(t.length, 9), 80, 900);
    const x = dspMap(t.length, i => Math.tanh((s[i] * Math.exp(-t[i] * 8) + Math.sin(TAU * 42 * t[i]) * Math.exp(-t[i] * 6) * 0.5
      + click[i] * Math.exp(-t[i] * 60) * 0.5) * 1.6));
    return dspFade(dspNorm(x, 0.95));
  },
  stomp() {                                  // a huge armoured foot on stone: sub thump, a scuff of grit
    const d = 0.34, [s, t] = dspSweep(72, 30, d, 10), n = t.length, lo = dspBand(dspNoise(n, 21), 40, 260), grit = dspBand(dspNoise(n, 22), 900, 3200);
    const x = dspMap(n, i => { const tt = t[i];
      return Math.tanh((s[i] * Math.exp(-tt * 9) + lo[i] * Math.exp(-tt * 22) * 0.7 + grit[i] * Math.exp(-tt * 45) * 0.12) * 1.8); });
    return dspFade(dspNorm(dspSoften(x, 1800), 0.9), 1, 20);
  },
  boom() {                                   // something enormous hits the floor: sub drop, crack, rumble, falling debris
    const d = 1.2, [s, t] = dspSweep(62, 22, d, 3.2), n = t.length, rum = dspBand(dspNoise(n, 31), 25, 180), crack = dspBand(dspNoise(n, 32), 380, 2600);
    const deb = dspBand(dspNoise(n, 33), 1200, 4200), gate = mulberry32(34); let g = 0;
    const x = dspMap(n, i => { const tt = t[i];
      if (i % 220 === 0) g = gate() < 0.35 ? gate() : 0;
      return Math.tanh((s[i] * Math.exp(-tt * 2.8) * 1.1 + rum[i] * Math.exp(-tt * 2.4) * 0.8 + crack[i] * Math.exp(-tt * 18) * 0.4
        + deb[i] * g * Math.exp(-tt * 3.5) * 0.18 * Math.min(1, tt * 8)) * 1.6); });
    return dspFade(dspNorm(dspSoften(x, 2600), 1.0), 1, 120);
  },
  clank() {                                  // a heavy armour plate hitting stone
    const d = 0.5, t = dspTime(d), n = t.length, click = dspBand(dspNoise(n, 41), 1500, 5000), [th] = dspSweep(130, 50, d, 18);
    const x = dspMap(n, i => { const tt = t[i]; let r = 0;
      for (const [f, k] of [[311, 7], [737, 9], [1183, 11], [1621, 14], [2389, 18]]) r += Math.sin(TAU * f * tt) * Math.exp(-tt * k);
      return Math.tanh((r * 0.28 + th[i] * Math.exp(-tt * 20) * 0.7 + click[i] * Math.exp(-tt * 90) * 0.45) * 1.3); });
    return dspFade(dspNorm(dspSoften(x, 4200), 0.75), 1, 30);
  },
  clang() {                                  // the halberd's iron head on stone, with one bounce
    const d = 1.0, t = dspTime(d), n = t.length, click = dspBand(dspNoise(n, 51), 1800, 6000);
    const hit = (tt) => { if (tt < 0) return 0; let r = 0;
      for (const [f, k] of [[523, 4], [1297, 5], [1979, 6.5], [2843, 8], [3511, 10]]) r += Math.sin(TAU * f * tt) * Math.exp(-tt * k);
      return r; };
    const x = dspMap(n, i => { const tt = t[i];
      return Math.tanh((hit(tt) * 0.3 + hit(tt - 0.19) * 0.12 + click[i] * (Math.exp(-tt * 80) + (tt > 0.19 ? 0.4 * Math.exp(-(tt - 0.19) * 80) : 0)) * 0.4) * 1.2); });
    return dspFade(dspNorm(dspSoften(x, 5000), 0.7), 1, 60);
  },
  skid() {                                   // armoured feet grinding to a halt on stone
    const d = 0.6, t = dspTime(d), n = t.length, nz = dspBand(dspNoise(n, 61), 160, 1100), r = mulberry32(62), [th] = dspSweep(70, 34, d, 12); let g = 1;
    const x = dspMap(n, i => { const tt = t[i];
      if (i % 480 === 0) g = 0.45 + 0.55 * r();
      return Math.tanh((nz[i] * g * Math.min(1, tt * 60) * Math.exp(-tt * 4.2) + th[i] * Math.exp(-tt * 10) * 0.6) * 1.5); });
    return dspFade(dspNorm(dspSoften(x, 2200), 0.8), 1, 40);
  },
  charge() {
    const d = 0.42, t = dspTime(d), grit = dspBand(dspNoise(t.length, 11), 300, 1400); let ph = 0;
    const x = dspMap(t.length, i => {
      const tt = t[i]; ph += TAU * (70 + 90 * Math.pow(tt / d, 1.5)) / SR;
      const tone = Math.sin(ph) + 0.5 * Math.sin(2 * ph + 0.3) + 0.25 * Math.sin(3.01 * ph);
      const env = Math.pow(tt / d, 1.2) * (1 - Math.exp(-(d - tt) * 60));
      return Math.tanh((tone + grit[i] * 0.25) * env * 1.5);
    });
    return dspFade(dspNorm(x, 0.6));
  },
  deny() {
    const t = dspTime(0.12);
    return dspFade(dspNorm(dspMap(t.length, i => (Math.sign(Math.sin(TAU * 130 * t[i])) * 0.45 + Math.sin(TAU * 65 * t[i]) * 0.55) * Math.exp(-t[i] * 25)), 0.5));
  },
  stagger() {
    const d = 0.95, t = dspTime(d), crunch = dspBand(dspNoise(t.length, 33), 200, 2400);
    const ph = [0, 0, 0, 0], fs = [[392, 3], [587, 4], [941, 5.5], [1477, 7]];
    const x = dspMap(t.length, i => {
      const tt = t[i], drop = Math.exp(-tt * 1.5); let s = 0;
      for (let k = 0; k < 4; k++) { ph[k] += TAU * fs[k][0] * (0.6 + 0.4 * drop) / SR; s += Math.sin(ph[k]) * Math.exp(-tt * fs[k][1]); }
      return Math.tanh((s * 0.4 + crunch[i] * Math.exp(-tt * 9) * 0.8) * 1.4);
    });
    return dspFade(dspNorm(dspSoften(x, 4000), 0.8));
  },
  flask() {
    const t = dspTime(0.9);
    const x = dspMap(t.length, i => {
      let s = 0;
      [587, 784, 1175].forEach((f, k) => {
        const tt = t[i] - k * 0.09;
        if (tt >= 0) s += (Math.sin(TAU * f * tt) + 0.3 * Math.sin(TAU * 2 * f * tt)) * Math.exp(-tt * 4.5);
      });
      return s;
    });
    return dspFade(dspNorm(dspSoften(x, 5000), 0.5));
  },
  hurt() {
    const d = 0.32, t = dspTime(d), body = dspBand(dspNoise(t.length, 41), 180, 1500), [th] = dspSweep(130, 55, d, 12);
    const x = dspMap(t.length, i => Math.tanh((body[i] * Math.exp(-t[i] * 16) * 0.8 + th[i] * Math.exp(-t[i] * 11)) * 1.5));
    return dspFade(dspNorm(dspSoften(x, 3000), 0.8));
  },
  roar() {                                   // phase-2 transition: grinding mechanical growl
    const d = 1.7, t = dspTime(d), n = t.length, grit = dspBand(dspNoise(n, 77), 180, 1400), low = dspBand(dspNoise(n, 78), 40, 260);
    let ph = 0;
    const x = dspMap(n, i => {
      const tt = t[i], u = tt / d;
      const f = 58 + 40 * Math.sin(Math.PI * Math.min(1, u * 1.6)) - 18 * Math.max(0, u - 0.6);
      ph += TAU * f / SR;
      let saw = 0; for (let k = 1; k <= 7; k++) saw += Math.sin(ph * k) / k;
      const growl = 0.6 + 0.4 * Math.sin(TAU * 27 * tt);
      const env = Math.min(1, tt * 9) * Math.pow(1 - u, 0.8);
      return Math.tanh((saw * growl * 0.9 + grit[i] * 0.55 * growl + low[i] * 0.6) * env * 1.8);
    });
    return dspFade(dspNorm(dspSoften(x, 2600), 0.9), 4, 80);
  },
  drone_air() {                              // loopable dark air under the drone
    const d = 4, n = Math.floor(SR * d), x = dspBand(dspNoise(n, 91), 90, 520);
    const fade = Math.floor(SR * 0.5);
    for (let i = 0; i < fade; i++) { const k = i / fade; x[i] = x[i] * k + x[n - fade + i] * (1 - k); }   // crossfade loop seam
    return dspNorm(dspSoften(x.subarray(0, n - fade).slice(), 900), 0.5);
  },
  boss_die() {
    const d = 2.0, t = dspTime(d), low = dspBand(dspNoise(t.length, 55), 30, 320), [s] = dspSweep(85, 24, d, 1.6);
    const x = dspMap(t.length, i => {
      const tt = t[i];
      const ring = Math.sin(TAU * 233 * tt) * Math.exp(-tt * 1.5) + Math.sin(TAU * 349 * tt) * Math.exp(-tt * 2.2) + Math.sin(TAU * 523 * tt) * Math.exp(-tt * 3);
      return Math.tanh((low[i] * Math.exp(-tt * 1.8) + s[i] * Math.exp(-tt * 1.2) + ring * 0.25) * 1.5);
    });
    return dspFade(dspNorm(dspSoften(x, 3000), 0.9), 2, 60);
  },
  // ---- muted interface sounds (low-passed, soft attacks; nothing bright)
  ui_tap() {                                 // a soft wooden 'tock'
    const d = 0.09, [s, t] = dspSweep(380, 240, d, 40), n = dspBand(dspNoise(t.length, 71), 180, 1100);
    const x = dspMap(t.length, i => (s[i] * Math.exp(-t[i] * 55) + n[i] * Math.exp(-t[i] * 90) * 0.35) * Math.min(1, t[i] * 900));
    return dspFade(dspNorm(dspSoften(x, 1300), 0.4), 1, 20);
  },
  ui_equip() {                               // a muffled clunk of leather and metal settling into place
    const d = 0.32, [th, t] = dspSweep(150, 70, d, 22), n = dspBand(dspNoise(t.length, 72), 150, 900);
    const x = dspMap(t.length, i => { const tt = t[i];
      const ring = Math.sin(TAU * 410 * tt) * Math.exp(-tt * 30) + 0.6 * Math.sin(TAU * 655 * tt) * Math.exp(-tt * 38) + 0.4 * Math.sin(TAU * 980 * tt) * Math.exp(-tt * 50);
      return (th[i] * Math.exp(-tt * 18) * 0.9 + ring * 0.22 + n[i] * Math.exp(-tt * 40) * 0.35) * Math.min(1, tt * 500); });
    return dspFade(dspNorm(dspSoften(x, 1700), 0.6), 1, 40);
  },
  ui_deny() {                                // a dull double thump
    const d = 0.22, t = dspTime(d);
    const x = dspMap(t.length, i => { const tt = t[i], a = Math.exp(-tt * 30), b = tt > 0.09 ? Math.exp(-(tt - 0.09) * 30) : 0;
      return Math.sin(TAU * 105 * tt) * (a + 0.7 * b) * Math.min(1, tt * 400); });
    return dspFade(dspNorm(dspSoften(x, 700), 0.45), 1, 30);
  },
  ui_loot() {                                // something worth keeping: a low, warm swell
    const d = 0.9, t = dspTime(d);
    const x = dspMap(t.length, i => { const tt = t[i], env = Math.min(1, tt * 14) * Math.exp(-tt * 3.2);
      return (Math.sin(TAU * 262 * tt) + 0.55 * Math.sin(TAU * 392 * tt + 0.3) + 0.35 * Math.sin(TAU * 131 * tt)) * env; });
    return dspFade(dspNorm(dspSoften(x, 1200), 0.5), 2, 120);
  },
  ready() {
    const t = dspTime(0.35);
    return dspFade(dspNorm(dspSoften(dspMap(t.length, i => (Math.sin(TAU * 1760 * t[i]) + 0.5 * Math.sin(TAU * 2640 * t[i] + 0.4)) * Math.exp(-t[i] * 14)), 6000), 0.45));
  },
  shot() {
    const d = 0.3, t = dspTime(d), n = dspNoise(t.length, 61), crack = dspBand(n, 1200, 5000), body = dspBand(n, 150, 900);
    const [th] = dspSweep(140, 50, d, 25);
    const x = dspMap(t.length, i => Math.tanh((crack[i] * Math.exp(-t[i] * 55) * 0.9 + body[i] * Math.exp(-t[i] * 18) * 0.7
      + th[i] * Math.exp(-t[i] * 20) * 0.6) * 1.6));
    return dspFade(dspNorm(dspSoften(x, 4200), 0.8));
  },
};
function sfxWhoosh(heavy) {
  const d = heavy ? 0.46 : 0.28, t = dspTime(d), n = t.length, noise = dspNoise(n, heavy ? 5 : 1);
  const bands = heavy ? [[180, 700], [350, 1300], [650, 2100]] : [[500, 1600], [900, 2800], [1600, 4400]];
  const low = dspBand(noise, bands[0][0], bands[0][1]), mid = dspBand(noise, bands[1][0], bands[1][1]), high = dspBand(noise, bands[2][0], bands[2][1]);
  const partials = heavy ? [1170, 1730, 2590] : [1760, 2610, 3690];
  const [sw] = heavy ? dspSweep(110, 50, d, 5) : [null];
  const x = dspMap(n, i => {
    const tt = t[i], u = tt / d;
    let out = low[i] * (0.5 + 0.5 * Math.abs(u - 0.45) * 2) + mid[i] * Math.exp(-Math.pow((u - 0.38) / 0.28, 2))
      + high[i] * Math.exp(-Math.pow((u - 0.42) / 0.16, 2)) * 0.9;
    const env = Math.pow(Math.sin(Math.PI * Math.pow(clamp(u, 0, 1), 0.7)), 2);
    out *= env;
    const ringEnv = (1 - Math.exp(-tt * 60)) * Math.exp(-tt * (heavy ? 9 : 14));
    let ring = 0; partials.forEach((f, k) => { ring += Math.sin(TAU * f * tt + k); });
    out += ring * ringEnv * 0.12;
    if (heavy) out += sw[i] * env * 0.45;
    return out;
  });
  return dspFade(dspNorm(dspSoften(x, heavy ? 3200 : 4200), 0.75));
}

class SoundBank {
  constructor() { this.ctx = null; this.buffers = {}; this.ready = false; }
  /** Create the context and synthesize every SFX (call from a tap handler on iOS). */
  init() {
    if (this.ctx) { if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') { const r = this.ctx.resume(); if (r && r.catch) r.catch(() => {}); } return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = MASTER_VOLUME; this.master.connect(this.ctx.destination);
    for (const name in SYNTHS) {
      if (name === 'drone_air') continue;
      const data = SYNTHS[name](), buf = this.ctx.createBuffer(1, data.length, SR);
      buf.getChannelData(0).set(data); this.buffers[name] = buf;
    }
    if (this.ctx.state !== 'running') { const r = this.ctx.resume(); if (r && r.catch) r.catch(() => {}); }
    // iOS: playing a buffer inside the gesture is what actually unlocks the output
    { const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0); }
    this.buildDrone();
    this.ready = true;
  }
  /** Low ambient synth drone, built once from live oscillators; setDrone() only moves its parameters. */
  buildDrone() {
    const c = this.ctx, now = c.currentTime;
    this.drone = { on: false, phase: 1 };
    const out = c.createGain(); out.gain.value = 0; out.connect(this.master);
    const trem = c.createGain(); trem.gain.value = 1; trem.connect(out);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 3; lp.connect(trem);
    const lfo = c.createOscillator(), lfoAmt = c.createGain(); lfo.frequency.value = 0.07; lfoAmt.gain.value = 160;
    lfo.connect(lfoAmt); lfoAmt.connect(lp.frequency); lfo.start(now);
    const pulse = c.createOscillator(), pulseAmt = c.createGain(); pulse.frequency.value = 1.6; pulseAmt.gain.value = 0;
    pulse.connect(pulseAmt); pulseAmt.connect(trem.gain); pulse.start(now);
    const voices = [['sawtooth', 55, 0.5], ['sawtooth', 55.35, 0.5], ['triangle', 82.4, 0.35], ['sawtooth', 77.8, 0]];   // last = tritone, phase 2
    this.drone.osc = voices.map(([type, f, v]) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; g.gain.value = v;
      o.connect(g); g.connect(lp); o.start(now); return { o, g, f };
    });
    const air = c.createBufferSource(), airG = c.createGain();
    air.buffer = (() => { const d = SYNTHS.drone_air(), b = c.createBuffer(1, d.length, SR); b.getChannelData(0).set(d); return b; })();
    air.loop = true; airG.gain.value = 0.45; air.connect(airG); airG.connect(out); air.start(now);
    Object.assign(this.drone, { out, lp, lfo, pulseAmt });
  }
  /** on: fight running. phase: 1 or 2 (2 drops the pitch, adds a tritone and a slow pulse). */
  setDrone(on, phase) {
    const D = this.drone;
    if (!this.ready || !D || (D.on === on && D.phase === phase && D.amb === SETTINGS.ambience)) return;
    const now = this.ctx.currentTime;
    if (D.on !== on || D.amb !== SETTINGS.ambience) D.out.gain.setTargetAtTime(on ? DRONE_VOLUME * SETTINGS.ambience : 0, now, on ? 1.2 : 0.6);
    D.amb = SETTINGS.ambience;
    if (D.phase !== phase) {
      const shift = phase === 2 ? Math.pow(2, -3 / 12) : 1, tau = phase === 2 ? 0.5 : 0.05;
      D.osc.forEach((v, i) => v.o.frequency.setTargetAtTime(v.f * shift, now, tau));
      D.osc[3].g.gain.setTargetAtTime(phase === 2 ? 0.32 : 0, now, tau);
      D.lp.frequency.setTargetAtTime(phase === 2 ? 520 : 380, now, tau);
      D.lfo.frequency.setTargetAtTime(phase === 2 ? 0.22 : 0.07, now, tau);
      D.pulseAmt.gain.setTargetAtTime(phase === 2 ? 0.35 : 0, now, tau);
    }
    D.on = on; D.phase = phase;
  }
  play(name, vol) {
    if (!this.ready || !this.buffers[name]) return;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = this.buffers[name]; g.gain.value = clamp(vol === undefined ? 1 : vol, 0, 1) * SETTINGS.sfx;
    src.connect(g); g.connect(this.master); src.start();
  }
}

const HAPTIC_MS = { light: 8, medium: 14, heavy: 24, rigid: 10, soft: 12 };
function haptic(style, intensity) {
  if (!SETTINGS.haptics) return;
  if (navigator.vibrate) { try { navigator.vibrate(Math.max(4, Math.round((HAPTIC_MS[style] || 10) * (intensity || 1)))); } catch (e) { /* ignore */ } }
}
