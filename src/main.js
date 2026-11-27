// ============================================================ MAIN (boot, loop, screens)
const TILE_VARIANT = (() => {
  const r = mulberry32(42), n = Math.ceil(2 * ARENA_HALF / TILE), out = [];
  for (let i = 0; i < n * n; i++) out.push(Math.floor(r() * 4));
  return out;
})();

const canvas = document.getElementById('game');
const probe = document.getElementById('safe');
const DPR = Math.min(window.devicePixelRatio || 1, 3);
buildArt(Math.min(3, Math.max(2, DPR)));

const sound = new SoundBank();
const game = new Game({ sfx: (n, v) => sound.play(n, v), haptic: (s, i) => haptic(s, i) });
const renderer = new Renderer(canvas);
const controls = new Controls(game);
const menu = new EquipMenu(game); controls.menu = menu; controls.ui.menu = menu;
let screen = 'title';           // 'title' | 'play'
let W = 0, H = 0;

function readSafeArea() {
  const cs = getComputedStyle(probe), px = v => parseFloat(v) || 0;
  const l = px(cs.paddingLeft), r = px(cs.paddingRight), b = px(cs.paddingBottom), t = px(cs.paddingTop);
  HUD.SAFE_X = Math.max(60, Math.max(l, r) + 16);
  HUD.SAFE_BOTTOM = Math.max(34, b + 12);
  HUD.TOP = t;
}
// Render at the screen's full pixel density (3x on iPhone Pro). If the phone can't hold the frame rate,
// step the resolution down a little at a time (never below 2x) rather than dropping frames.
let renderScale = DPR, slowFor = 0;
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  readSafeArea();
  renderer.resize(W, H, renderScale);
  controls.layout(W, H);
}
function adaptResolution(fps, dt) {
  if (screen !== 'play') return;
  slowFor = fps < 52 ? slowFor + dt : 0;
  if (slowFor > 2.5 && renderScale > 2) { renderScale = Math.max(2, renderScale - 0.25); slowFor = 0; resize(); }
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
resize();

// ---- touch (y flipped to the y-up HUD space)
function onStart(e) {
  e.preventDefault();
  sound.init();                                  // iOS: audio may only start from a gesture
  if (H > W) return;
  if (screen === 'title') { screen = 'play'; game.resetRound(); controls.releaseAll(); return; }
  for (const tch of e.changedTouches) controls.touchStart(tch.identifier, tch.clientX, H - tch.clientY);
}
function onMove(e) { e.preventDefault(); if (screen !== 'play') return; for (const tch of e.changedTouches) controls.touchMove(tch.identifier, tch.clientX, H - tch.clientY); }
function onEnd(e) { e.preventDefault(); sound.init(); if (screen !== 'play') return; for (const tch of e.changedTouches) controls.touchEnd(tch.identifier); }
canvas.addEventListener('touchstart', onStart, { passive: false });
canvas.addEventListener('touchmove', onMove, { passive: false });
canvas.addEventListener('touchend', onEnd, { passive: false });
canvas.addEventListener('touchcancel', onEnd, { passive: false });
// mouse = one finger (desktop testing)
let mouseDown = false;
canvas.addEventListener('mousedown', e => onStart({ preventDefault() {}, changedTouches: [{ identifier: 'm', clientX: e.clientX, clientY: e.clientY }] }) || (mouseDown = true));
window.addEventListener('mousemove', e => { if (mouseDown) onMove({ preventDefault() {}, changedTouches: [{ identifier: 'm', clientX: e.clientX, clientY: e.clientY }] }); });
window.addEventListener('mouseup', () => { if (mouseDown) { mouseDown = false; onEnd({ preventDefault() {}, changedTouches: [{ identifier: 'm' }] }); } });
document.addEventListener('gesturestart', e => e.preventDefault());

// ---- loop
let last = performance.now(), fpsFrames = 0, fpsClock = 0;
function frame(now) {
  const raw = Math.min(0.1, (now - last) / 1000); last = now;
  fpsFrames++; fpsClock += raw;
  if (fpsClock >= 0.5) { controls.ui.fps = Math.round(fpsFrames / fpsClock); adaptResolution(controls.ui.fps, fpsClock); fpsFrames = 0; fpsClock = 0; }
  if (H > W) renderer.drawRotate();
  else if (screen === 'title') {
    game.t += raw; const p = game.player; p.facing = -1.25; p.animate(raw, game.t);
    renderer.drawTitle(game.t, p); sound.setDrone(false, 1);
  }
  else {
    const ctl = controls.frame(Math.min(raw, 1 / 30));
    game.update(raw, ctl);
    if (game.outcome !== null && controls.owner.size) controls.releaseAll();
    renderer.draw(game, controls.ui, game.t);
    if (game.outcome !== null && menu.open) menu.close();
    if (menu.open) { menu.update(raw); menu.draw(renderer); }
    sound.setDrone(game.outcome === null, game.boss.phase);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__nullrite = { game, controls, renderer, sound, menu, C: { BOSS_ATTACKS, BOSS_MAX_HP, PLAYER_MAX_HP, Renderer, FLASK_MOVE, GUN_MOVE, GUN_MOVE_READY, THROW_MOVE, STAGGER_TIME, PHASE_TIME, S: { S_IDLE, S_MOVE, S_WINDUP, S_ACTIVE, S_RECOVERY, S_DODGE, S_HURT, S_DEAD, S_STALK, S_STAGGERED, S_PHASE } }, start() { screen = 'play'; game.resetRound(); } };
