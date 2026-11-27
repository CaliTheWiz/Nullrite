"""Render a pose sheet of the jointed player (8 facings x several poses) to test/rig_sheet.png."""
import asyncio, base64, sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'test' / (sys.argv[1] if len(sys.argv) > 1 else 'sprint_sheet.png')
JS = r"""
() => {
  const o = window.__nullrite, g = o.game, p = g.player, C = o.C, S = C.S;
  const DIRS = [['E', 0], ['NE', 45], ['N', 90], ['NW', 135], ['SE', -45]];
  const FR = 8, cw = 110, ch = 150, W = cw * FR + 40, H = ch * DIRS.length + 20, dpr = 2;
  const cv = document.createElement('canvas'); const r = new C.Renderer(cv); r.resize(W, H, dpr);
  const x = r.ctx; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#0D0E12'; x.fillRect(0, 0, W, H);
  x.font = 'bold 10px monospace'; x.fillStyle = '#c9b48a';
  for (let j = 0; j < DIRS.length; j++) {
    const f = DIRS[j][1] * Math.PI / 180; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#c9b48a'; x.fillText(DIRS[j][0], 6, 20 + j * ch + 70);
    p.reset(); for (const k in p.cloths) p.cloths[k].live = false; p.facing = f; p.rigDir = null;
    const run = () => { p.state = S.S_MOVE; p.sprinting = true; p.vx = Math.cos(f) * 395; p.vy = Math.sin(f) * 395; };
    for (let k = 0; k < 90; k++) { run(); p.gx += p.vx / 60; p.gy += p.vy / 60; p.animate(1 / 60, k / 60); }
    for (let i = 0; i < FR; i++) {
      for (let k = 0; k < 3; k++) { run(); p.gx += p.vx / 60; p.gy += p.vy / 60; p.animate(1 / 60, 2 + (i * 3 + k) / 60); }
      const cx = 40 + i * cw + cw / 2, cy = 20 + j * ch + ch - 18;
      r.g = { cam_x: 0, cam_y: 0, ox: 0, oy: 0, t: 0 };
      r.entityFrame = function () { this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.ctx.translate(cx, cy); this.ctx.scale(1.5, 1.5); };
      r.entityFrame(); r.drawRigBody(p);
    }
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
