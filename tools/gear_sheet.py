"""Player in several loadouts x 6 facings (idle + an attack) to test/gear_sheet.png."""
import asyncio, base64
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parent.parent
JS = r"""
() => {
  const o = window.__nullrite, g = o.game, p = g.player, C = o.C, S = C.S, inv = g.inv;
  for (const id of ['greatsword', 'spear', 'sentinel_helm', 'sentinel_plate', 'ember_ring', 'crimson_locket', 'sentinel_sigil', 'oath_ring']) inv.add(id);
  const LOADS = [
    ['starter', {}],
    ['sentinel + greatsword', { head: 'sentinel_helm', chest: 'sentinel_plate', right: 'greatsword' }],
    ['sentinel, no cloak + spear', { head: 'sentinel_helm', chest: 'sentinel_plate', back: null, right: 'spear' }],
    ['bare (no armour)', { head: null, chest: null, hands: null, legs: null, feet: null, back: null }],
  ];
  const DIRS = [['S', -90], ['SE', -45], ['E', 0], ['NE', 45], ['N', 90], ['W', 180]];
  const cw = 190, ch = 230, W = cw * DIRS.length + 160, H = ch * LOADS.length + 20, dpr = 2;
  const cv = document.createElement('canvas'); const r = new C.Renderer(cv); r.resize(W, H, dpr);
  const x = r.ctx; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#0D0E12'; x.fillRect(0, 0, W, H);
  x.font = 'bold 11px monospace';
  LOADS.forEach(([name, eq], j) => {
    inv.reset(); for (const id of ['greatsword', 'spear', 'sentinel_helm', 'sentinel_plate']) inv.add(id);
    for (const s in eq) inv.equip(s, eq[s]);
    p.reset(); for (const k in p.cloths) p.cloths[k].live = false;
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#c9b48a'; x.fillText(name, 8, 20 + j * ch + 20);
    x.fillStyle = '#7d7468'; x.fillText(p.stats.tier.name + ' ' + p.stats.weight.toFixed(1), 8, 20 + j * ch + 36);
    DIRS.forEach((d, i) => {
      const f = d[1] * Math.PI / 180;
      p.facing = f; p.rigDir = null; p.lookOn = false; p.state = S.S_IDLE; p.vx = p.vy = 0;
      for (let k = 0; k < 30; k++) { p.facing = f; p.animate(1 / 60, 1 + k / 60); }
      const cx = 160 + i * cw + cw / 2, cy = 20 + j * ch + ch - 40;
      r.g = { cam_x: 0, cam_y: 0, ox: 0, oy: 0, t: 0 };
      r.entityFrame = function () { this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.ctx.translate(cx, cy); this.ctx.scale(1.6, 1.6); };
      r.entityFrame(); r.drawRigImage(p);
    });
  });
  inv.reset();
  return cv.toDataURL('image/png');
}
"""
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        page = await br.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto((ROOT / 'index.html').as_uri()); await page.wait_for_timeout(800)
        data = await page.evaluate(JS)
        (ROOT / 'test' / 'gear_sheet.png').write_bytes(base64.b64decode(data.split(',')[1]))
        print('\n'.join(errs) or 'no errors'); await br.close()
asyncio.run(main())
