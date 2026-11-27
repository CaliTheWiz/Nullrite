"""Render a pose sheet of the jointed player (8 facings x several poses) to test/rig_sheet.png."""
import asyncio, base64, sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'test' / (sys.argv[1] if len(sys.argv) > 1 else 'gun_sheet.png')
JS = r"""
() => {
  const o = window.__nullrite, g = o.game, p = g.player, C = o.C, S = C.S;
  const DIRS = [['S', -90], ['SE', -45], ['E', 0], ['NE', 45], ['N', 90], ['W', 180]];
  const PH = [['rest', null], ['draw 35%', 0.35], ['draw 70%', 0.7], ['fire', 'active'], ['recoil', 'kick'], ['holster 70%', 'rec0.7'], ['aim held', 'hold']];
  const cw = 200, ch = 230, W = cw * PH.length + 60, H = ch * DIRS.length + 30, dpr = 2;
  const cv = document.createElement('canvas'); const r = new C.Renderer(cv); r.resize(W, H, dpr);
  const x = r.ctx; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#0D0E12'; x.fillRect(0, 0, W, H);
  x.font = 'bold 10px monospace'; x.fillStyle = '#c9b48a';
  PH.forEach((ph, i) => x.fillText(ph[0], 60 + i * cw + 40, 16));
  DIRS.forEach((d, j) => x.fillText(d[0], 8, 30 + j * ch + ch / 2));
  for (let j = 0; j < DIRS.length; j++) for (let i = 0; i < PH.length; i++) {
    const f = DIRS[j][1] * Math.PI / 180, ph = PH[i][1];
    p.reset(); for (const k in p.cloths) p.cloths[k].live = false; p.facing = f; p.attack_dir = f; p.rigDir = null; p.lookOn = false;
    const setup = () => {
      p.vx = p.vy = 0; p.move_dir = null; p.aimHold = false; p.gunKick = 0; p.state = S.S_IDLE; p.kind = null; p.move = null; p.gunReady = 0;
      if (typeof ph === 'number') { p.state = S.S_WINDUP; p.kind = 'shoot'; p.move = C.GUN_MOVE; p.state_t = C.GUN_MOVE.windup * ph; }
      if (ph === 'active') { p.state = S.S_ACTIVE; p.kind = 'shoot'; p.move = C.GUN_MOVE; p.state_t = 0.01; }
      if (ph === 'kick') { p.state = S.S_ACTIVE; p.kind = 'shoot'; p.move = C.GUN_MOVE; p.state_t = 0.02; p.gunKick = 1; }
      if (ph === 'rec0.7') { p.state = S.S_RECOVERY; p.kind = 'shoot'; p.move = C.GUN_MOVE; p.state_t = C.GUN_MOVE.recovery * 0.7; }
      if (ph === 'hold') { p.gunReady = 1; p.aimHold = true; }
    };
    for (let k = 0; k < 40; k++) { setup(); p.animate(1 / 60, 1 + k / 60); }
    const cx = 60 + i * cw + cw / 2, cy = 30 + j * ch + ch - 40;
    r.g = { cam_x: 0, cam_y: 0, ox: 0, oy: 0, t: 0 };
    r.entityFrame = function () { this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.ctx.translate(cx, cy); this.ctx.scale(1.5, 1.5); };
    r.entityFrame(); r.drawRigImage(p);
    // mark the computed muzzle
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#00ff88';
    if (p.gunDrawn) { const mx = cx + (p.muzzleX - p.gx) * 1.5, my = cy - ((p.muzzleY - p.gy) * 0.65 + p.muzzleZ) * 1.5; x.fillRect(mx - 1.5, my - 1.5, 3, 3); }
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
