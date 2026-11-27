// ============================================================ MATH
const TAU = Math.PI * 2;
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function wrap(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
function approachAngle(cur, target, k) { return cur + wrap(target - cur) * clamp(k, 0, 1); }
function smooth(cur, target, rate, dt) { return cur + (target - cur) * Math.min(1, rate * dt); }
function screenToGroundAngle(dx, dy) { return Math.atan2(dy / K, dx); }   // thumb dir -> ground dir that LOOKS like it
function groundToScreenAngle(a) { return Math.atan2(Math.sin(a) * K, Math.cos(a)); }
function uniform(a, b) { return a + Math.random() * (b - a); }
function choice(arr) { return arr[(Math.random() * arr.length) | 0]; }
function hypot(x, y) { return Math.sqrt(x * x + y * y); }

/** Screen octant (0 = east, CCW) for a ground facing; sticks to `current` near borders. */
function pickOctant(facing, current, hysteresis) {
  if (hysteresis === undefined) hysteresis = 7 * RAD;
  const sa = groundToScreenAngle(facing), step = Math.PI / 4;
  if (current !== null && Math.abs(wrap(sa - current * step)) <= step / 2 + hysteresis) return current;
  return ((Math.round(sa / step) % 8) + 8) % 8;
}

/** Souls-style 'recent loss' bar trailing the real value. Returns [lag, hold]. */
function lagBar(lag, hold, value, rate, dt) {
  if (lag > value) {
    if (hold > 0) return [lag, hold - dt];
    return [Math.max(value, lag - rate * dt), 0];
  }
  return [value, 0];
}

/** Deterministic PRNG for baked art. */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
