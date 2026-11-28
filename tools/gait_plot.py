"""Side-view stick plot of the legs (and spine/arms) through one stride for walk / run / sprint -> test/gait_plot.png.
Pure joint data from the rig, so the leg motion is easy to read without the cape and armour in the way."""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parent.parent
JS = r"""
() => {
  const o = window.__nullrite, p = o.game.player, S = o.C.S, out = {};
  for (const [name, mult, spr] of [['walk', 0.28, 0], ['run', 1, 0], ['sprint', 1.55, 1]]) {
    p.reset(); p.facing = 0; p.rigDir = null; p.state = S.S_MOVE; p.sprinting = !!spr;
    const spd = 255 * p.weapon.speed * mult; p.vx = spd; p.vy = 0;
    for (let k = 0; k < 120; k++) { p.gx += p.vx / 60; p.animate(1 / 60, k / 60); }
    const ph0 = Math.ceil(p.walkPhase / (2 * Math.PI)) * 2 * Math.PI, fr = [];
    for (let i = 0; i < 12; i++) {
      let guard = 0; while (p.walkPhase < ph0 + i * Math.PI / 6 && guard++ < 999) { p.gx += p.vx / 480; p.animate(1 / 480, 3 + guard / 480); }
      const J = p.rig.j, q = (n) => [J[n].f, J[n].z, J[n].s];
      const r = {}; for (const n of ['pelvis', 'waist', 'neck', 'head', 'hipL', 'kneeL', 'ankleL', 'toeL', 'hipR', 'kneeR', 'ankleR', 'toeR', 'shL', 'elL', 'wrL', 'shR', 'elR', 'wrR']) r[n] = q(n);
      fr.push(r);
    }
    out[name] = fr;
  }
  return JSON.stringify(out);
}
"""
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        page = await b.new_page()
        await page.goto((ROOT / 'index.html').as_uri()); await page.wait_for_timeout(800)
        data = json.loads(await page.evaluate(JS)); await b.close()
    S, cw, ch = 3.0, 150, 260
    im = Image.new('RGB', (cw * 12 + 20, ch * 3 + 20), (14, 15, 19)); d = ImageDraw.Draw(im)
    for j, name in enumerate(['walk', 'run', 'sprint']):
        d.text((4, 4 + j * ch), name, fill=(200, 180, 140))
        for i, r in enumerate(data[name]):
            ox, oy = 20 + i * cw + cw // 2, 10 + j * ch + ch - 20
            P = lambda n: (ox + r[n][0] * S, oy - r[n][1] * S)
            d.line([(ox - 70, oy), (ox + 70, oy)], fill=(60, 60, 60))
            for side, col in (('L', (90, 160, 255)), ('R', (255, 120, 90))):
                d.line([P('hip' + side), P('knee' + side), P('ankle' + side), P('toe' + side)], fill=col, width=3)
                d.line([P('sh' + side), P('el' + side), P('wr' + side)], fill=tuple(c // 2 for c in col), width=2)
            d.line([P('pelvis'), P('waist'), P('neck'), P('head')], fill=(220, 220, 220), width=3)
    im.save(ROOT / 'test' / 'gait_plot.png'); print('ok')
asyncio.run(main())
