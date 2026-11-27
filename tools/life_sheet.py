"""Render a pose sheet of the jointed player (8 facings x several poses) to test/rig_sheet.png."""
import asyncio, base64, sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'test' / (sys.argv[1] if len(sys.argv) > 1 else 'life_sheet.png')
JS = r"""
() => {
  const o = window.__nullrite, g = o.game, p = g.player, C = o.C, S = C.S;
  const cases = [
    ['look L', () => { p.lookOn = true; p.lookX = p.gx - 300; p.lookY = p.gy - 120; }],
    ['look R', () => { p.lookOn = true; p.lookX = p.gx + 300; p.lookY = p.gy - 120; }],
    ['look fwd', () => { p.lookOn = true; p.lookX = p.gx; p.lookY = p.gy - 300; }],
    ['turning L', () => { p.state = S.S_MOVE; p.move_dir = -Math.PI / 2 + 0.9; p.vx = Math.cos(-Math.PI/2) * 200; p.vy = Math.sin(-Math.PI/2) * 200; }],
    ['idle t=0', null, 0], ['idle t=2.8', null, 2.8], ['idle t=5.7', null, 5.7],
    ['dash land', () => {}, 0, true],
  ];
  const cw = 230, ch = 260, W = cw * cases.length + 20, H = ch + 20, dpr = 2;
  const cv = document.createElement('canvas'); const r = new C.Renderer(cv); r.resize(W, H, dpr);
  const x = r.ctx; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#0D0E12'; x.fillRect(0, 0, W, H);
  cases.forEach((cs, i) => {
    p.reset(); for (const k in p.cloths) p.cloths[k].live = false; p.facing = -Math.PI / 2; p.rigDir = null; p.lookOn = false;
    const t0 = cs[2] || 0;
    if (cs[3]) { // dash then land
      for (let k = 0; k < 30; k++) { p.state = S.S_DODGE; p.dodge_dir = -Math.PI/2; p.state_t = 0.1; p.animate(1/60, t0 + k/60); }
      for (let k = 0; k < 7; k++) { p.state = S.S_IDLE; p.vx = p.vy = 0; p.animate(1/60, t0 + 1 + k/60); }
    } else {
      for (let k = 0; k < 60; k++) { p.state = S.S_IDLE; p.vx = p.vy = 0; p.move_dir = null; if (cs[1]) cs[1](); p.animate(1 / 60, t0 + k / 60); }
    }
    const cx = 10 + i * cw + cw / 2, cy = 10 + ch - 50;
    r.g = { cam_x: 0, cam_y: 0, ox: 0, oy: 0, t: 0 };
    r.entityFrame = function () { this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.ctx.translate(cx, cy); this.ctx.scale(1.8, 1.8); };
    r.entityFrame(); r.drawRigImage(p);
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#c9b48a'; x.font = 'bold 11px monospace'; x.fillText(cs[0], 10 + i * cw + 8, 22);
  });
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
