"""Gait sheet: walk / run / sprint at 8 points of a stride, side view and 3/4 view -> test/gait_sheet.png."""
import asyncio, base64, sys
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'test' / (sys.argv[1] if len(sys.argv) > 1 else 'gait_sheet.png')
JS = r"""
() => {
  const o = window.__nullrite, g = o.game, p = g.player, C = o.C, S = C.S;
  const ROWS = [['walk', 0.28, 0, -90 + 90], ['run', 1, 0, 0], ['sprint', 1.55, 1, 0], ['walk 3/4', 0.28, 0, -45], ['run 3/4', 1, 0, -45]];
  const N = 8, cw = 210, ch = 230, W = cw * N + 40, H = ch * ROWS.length + 20, dpr = 2;
  const cv = document.createElement('canvas'); const r = new C.Renderer(cv); r.resize(W, H, dpr);
  const x = r.ctx; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#0D0E12'; x.fillRect(0, 0, W, H);
  x.font = 'bold 11px monospace'; x.fillStyle = '#c9b48a';
  for (let j = 0; j < ROWS.length; j++) {
    const [name, mult, spr, deg] = ROWS[j], f = deg * Math.PI / 180, spd = 255 * p.weapon.speed * mult;
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#c9b48a'; x.fillText(name, 6, 20 + j * ch);
    p.reset(); p.facing = f; p.rigDir = null; p.state = S.S_MOVE; p.sprinting = !!spr;
    p.vx = Math.cos(f) * spd; p.vy = Math.sin(f) * spd;
    for (let k = 0; k < 90; k++) { p.gx += p.vx / 60; p.gy += p.vy / 60; p.animate(1 / 60, k / 60); }
    const ph0 = Math.ceil(p.walkPhase / (2 * Math.PI)) * 2 * Math.PI;
    for (let i = 0; i < N; i++) {
      // step the gait to an exact phase
      let guard = 0; while (p.walkPhase < ph0 + i * Math.PI / 4 && guard++ < 400) { p.gx += p.vx / 240; p.gy += p.vy / 240; p.animate(1 / 240, 2 + guard / 240); }
      const cx = 40 + i * cw + cw / 2, cy = 20 + j * ch + ch - 50;
      r.g = { cam_x: 0, cam_y: 0, ox: 0, oy: 0 }; r.W = W; r.H = H;
      r.entityFrame = function () { this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.ctx.translate(cx, cy); this.ctx.scale(1.25, 1.25); };
      r.entityFrame(); r.drawRigImage(p);
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.strokeStyle = '#333'; x.beginPath(); x.moveTo(cx - 90, cy + 2); x.lineTo(cx + 90, cy + 2); x.stroke();
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
