"""Attack sheet: every weapon's clips sampled through wind-up, strike and recovery -> test/attacks_<weapon>.png.
Runs the real player update (root motion, footwork) and draws with the game's 3D renderer.
usage: attack_sheet.py [weapon] [deg]"""
import asyncio, base64, sys
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parent.parent
WEAP = sys.argv[1] if len(sys.argv) > 1 else 'oathsword'
DEG = float(sys.argv[2]) if len(sys.argv) > 2 else -35
JS = r"""
([weap, deg]) => {
  const o = window.__nullrite, g = o.game, p = g.player, C = o.C, S = C.S;
  g.inv.items[weap] = 1; g.equip('right', weap);
  const W = p.weapon, MOVES = [['light', 0], ['light', 1], ['light', 2], ['heavy'], ['charged'], ['dodge']];
  const XS = [0.6, 0.95, 1.15, 1.35, 1.55, 1.8, 2.1, 2.5, 2.95];
  const cw = 300, ch = 300, Wd = cw * XS.length + 70, H = ch * MOVES.length + 30, dpr = 2;
  const cv = document.createElement('canvas'); const r = new C.Renderer(cv); r.resize(Wd, H, dpr);
  const x = r.ctx; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#0D0E12'; x.fillRect(0, 0, Wd, H);
  x.font = 'bold 11px monospace';
  XS.forEach((v, i) => { x.fillStyle = v < 1 ? '#8a9' : v < 2 ? '#e88' : '#99a'; x.fillText('x ' + v.toFixed(2), 70 + i * cw + cw / 2 - 20, 16); });
  const f = deg * Math.PI / 180;
  for (let j = 0; j < MOVES.length; j++) {
    const [kind, idx] = MOVES[j], mv = kind === 'light' ? W.light[idx] : W[kind];
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#c9b48a'; x.save(); x.translate(14, 30 + j * ch + ch / 2 + 40); x.rotate(-Math.PI / 2);
    x.fillText((mv.anim || kind) + '  ' + mv.dtype + '  ' + mv.damage, 0, 0); x.restore();
    for (let i = 0; i < XS.length; i++) {
      p.reset(); p.gx = 0; p.gy = -1500; p.facing = f; p.rigDir = null; p.state = S.S_IDLE; p.vx = p.vy = 0; p.stamina = 999;
      const dt = 1 / 120; let t = 1;
      for (let k = 0; k < 30; k++) { p.update(dt, t); p.animate(dt, t); t += dt; }
      if (kind === 'charged') { p.charging = 0.7; for (let k = 0; k < 30; k++) { p.animate(dt, t); t += dt; } p.charging = 0; }
      p.startMove(kind, mv, f, kind === 'light' ? idx : null);
      const clk = () => p.state === S.S_WINDUP ? p.state_t / mv.windup : p.state === S.S_ACTIVE ? 1 + p.state_t / mv.active : p.state === S.S_RECOVERY ? 2 + p.state_t / mv.recovery : 3;
      let guard = 0;
      while (clk() < XS[i] && guard++ < 2000 && (p.state === S.S_WINDUP || p.state === S.S_ACTIVE || p.state === S.S_RECOVERY)) {
        p.state_t += 0; p.update(dt, t); p.gx += 0; p.animate(dt, t); t += dt; p.stamina = 999; p.move_dir = null;
      }
      const cx = 70 + i * cw + cw / 2, cy = 30 + j * ch + ch - 70;
      r.g = { cam_x: 0, cam_y: 0, ox: 0, oy: 0 }; r.W = Wd; r.H = H;
      r.entityFrame = function () { this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.ctx.translate(cx, cy); this.ctx.scale(1.45, 1.45); };
      r.entityFrame(); r.drawRigImage(p);
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#555'; x.fillText('tip z ' + (p.tipZ || 0).toFixed(0), cx - 30, cy + 40);
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
        data = await page.evaluate(JS, [WEAP, DEG])
        out = ROOT / 'test' / f'attacks_{WEAP}.png'
        out.write_bytes(base64.b64decode(data.split(',')[1]))
        print('wrote', out); print('\n'.join(errs) or 'no errors')
        await b.close()
asyncio.run(main())
