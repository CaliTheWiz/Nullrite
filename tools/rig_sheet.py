"""Render a pose sheet of the jointed player (8 facings x several poses) to test/rig_sheet.png."""
import asyncio, base64, sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'test' / (sys.argv[1] if len(sys.argv) > 1 else 'rig_sheet.png')
JS = r"""
() => {
  const TAU0 = Math.PI * 2; const o = window.__nullrite, g = o.game, p = g.player, C = o.C, S = C.S;
  const DIRS = [['S', -90], ['SE', -45], ['E', 0], ['NE', 45], ['N', 90], ['NW', 135], ['W', 180], ['SW', -135]];
  const POSES = ['idle', 'walk A', 'walk B', 'sprint', 'swing wind-up', 'swing', 'heavy wind-up', 'dash', 'pistol', 'flask'];
  const cw = 250, ch = 250, W = cw * DIRS.length + 60, H = ch * POSES.length + 30, dpr = 2;
  const cv = document.createElement('canvas'); const r = new C.Renderer(cv); r.resize(W, H, dpr);
  const x = r.ctx; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#0D0E12'; x.fillRect(0, 0, W, H);
  x.font = 'bold 10px monospace'; x.fillStyle = '#c9b48a';
  DIRS.forEach((d, i) => x.fillText(d[0], 60 + i * cw + cw / 2 - 6, 16));
  POSES.forEach((n, j) => { x.save(); x.translate(12, 30 + j * ch + ch / 2 + 30); x.rotate(-Math.PI / 2); x.fillText(n, 0, 0); x.restore(); });
  const ZOOM = 1.2;
  for (let j = 0; j < POSES.length; j++) for (let i = 0; i < DIRS.length; i++) {
    const pose = POSES[j], f = DIRS[i][1] * Math.PI / 180;
    p.reset(); if (p.cape) p.cape.live = false; p.facing = f; p.attack_dir = f; p.rigDir = null; p.state = S.S_IDLE; p.kind = null; p.move = null; p.vx = p.vy = 0;
    let settle = 40, setup = () => {};
    if (pose === 'sprint') { setup = () => { p.state = S.S_MOVE; p.sprinting = true; p.vx = Math.cos(f) * 395; p.vy = Math.sin(f) * 395; }; }
    if (pose.startsWith('walk')) { setup = () => { p.state = S.S_MOVE; p.vx = Math.cos(f) * 255; p.vy = Math.sin(f) * 255; }; }
    if (pose === 'swing wind-up') setup = () => { p.state = S.S_WINDUP; p.kind = 'light'; p.move = p.weapon.light[0]; p.state_t = p.move.windup * 0.95; };
    if (pose === 'swing') setup = () => { p.state = S.S_ACTIVE; p.kind = 'light'; p.move = p.weapon.light[0]; p.state_t = p.move.active * 0.5; };
    if (pose === 'heavy wind-up') setup = () => { p.state = S.S_WINDUP; p.kind = 'heavy'; p.move = p.weapon.heavy; p.state_t = p.move.windup * 0.9; };
    if (pose === 'dash') setup = () => { p.state = S.S_DODGE; p.dodge_dir = f; p.state_t = 0.12; p.vx = Math.cos(f) * 600; p.vy = Math.sin(f) * 600; };
    if (pose === 'pistol') setup = () => { p.state = S.S_ACTIVE; p.kind = 'shoot'; p.move = C.GUN_MOVE; p.state_t = 0.02; };
    if (pose === 'flask') setup = () => { p.state = S.S_ACTIVE; p.kind = 'flask'; p.move = C.FLASK_MOVE; p.state_t = 0.1; };
    for (let k = 0; k < settle; k++) { setup(); p.gx += p.vx / 60; p.gy += p.vy / 60; p.animate(1 / 60, 1 + k / 60); }
    if (pose === 'walk A' || pose === 'sprint') { p.walkPhase = Math.PI / 2 + Math.round(p.walkPhase / TAU0) * TAU0; } if (pose === 'walk B') { p.walkPhase = 0; }
    setup(); p.animate(0.0001, 2); if (p.cape) p.cape.project(p);
    // place the player in this cell
    const cx = 60 + i * cw + cw / 2, cy = 30 + j * ch + ch - 70;
    r.g = { cam_x: 0, cam_y: 0, ox: 0, oy: 0 };
    r.W = W; r.H = H;
    r.entityFrame = function () { this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.ctx.translate(cx, cy); this.ctx.scale(ZOOM, ZOOM); };
    r.entityFrame(); r.drawRigImage(p);
  }
  return cv.toDataURL('image/png');
}
"""

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        page = await b.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await page.goto((ROOT / 'index.html').as_uri()); await page.wait_for_timeout(800)
        data = await page.evaluate(JS)
        OUT.write_bytes(base64.b64decode(data.split(',')[1]))
        print('wrote', OUT); print('\n'.join(errs) or 'no errors')
        await b.close()
asyncio.run(main())
