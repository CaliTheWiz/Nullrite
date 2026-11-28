"""Record the real game (renderer + logic, stepped at a fixed 60 fps) performing each weapon's moveset next to an
idle Sentinel, to test/moves_<weapon>.mp4. usage: record.py [weapon ...]"""
import asyncio, base64, subprocess, sys, tempfile, shutil
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parent.parent
WEAPS = sys.argv[1:] or ['oathsword', 'greatsword', 'spear']
SETUP = r"""
(weap) => {
  const o = window.__nullrite, g = o.game; o.start();
  g.inv.items[weap] = 1; g.equip('right', weap);
  const b = g.boss; b.idle_time = 1e9;
  window.__rec = { t: 0, ctl: { moveDir: null, moveMag: 0, sprint: false, aimDir: null, heavyHeld: -1 } };
  return true;
}
"""
STEP = r"""
([n, act]) => {
  const o = window.__nullrite, g = o.game, R = window.__rec, p = g.player, b = g.boss;
  if (act) {
    const d = Math.atan2(b.gy - p.gy, b.gx - p.gx);
    if (act === 'hold') R.ctl.heavyHeld = 0; else if (act === 'release') { g.press('heavy', d, R.ctl.heavyHeld >= 0.65); R.ctl.heavyHeld = -1; }
    else if (act === 'place') { b.state = 'IDLE'; b.idle_time = 1e9; b.hp = 99999; b.poise = 1e9; p.gx = b.gx - 165; p.gy = b.gy; p.facing = 0; p.vx = p.vy = 0; p.state = 'IDLE'; }
    else g.press(act, d);
  }
  const frames = [];
  for (let i = 0; i < n; i++) {
    if (R.ctl.heavyHeld >= 0) R.ctl.heavyHeld += 1 / 60;
    b.idle_time = 1e9; if (b.state === 'STALK') b.state = 'IDLE'; b.hp = Math.max(b.hp, 5000); p.stamina = 100;
    o.controls.frame(1 / 60); g.update(1 / 60, R.ctl); o.renderer.draw(g, o.controls.ui, g.t);
    if (i % 2 === 0) frames.push(o.renderer.cv.toDataURL('image/jpeg', 0.85));
  }
  window.__scr = [o.renderer.sx(p.gx), o.renderer.sy(p.gy * 0.65)];
  return frames;
}
"""
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'])
        ctx = await br.new_context(viewport={'width': 852, 'height': 393}, device_scale_factor=1)
        await ctx.add_init_script("window.__rafHold = true; const _r = window.requestAnimationFrame.bind(window); let _n = 0; window.requestAnimationFrame = (f) => (_n++ < 2 ? _r(f) : 0);")
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto((ROOT / 'index.html').as_uri()); await page.wait_for_timeout(1200)
        for w in WEAPS:
            await page.evaluate(SETUP, w)
            tmp = Path(tempfile.mkdtemp()); k = 0
            script = [(30, 'place'), (20, None)]
            script += [(1, 'light'), (50, 'light'), (50, 'light'), (80, None), (1, 'place'), (20, None)]
            script += [(1, 'hold'), (6, 'release'), (110, None), (1, 'place'), (20, None)]
            script += [(1, 'hold'), (60, 'release'), (120, None), (1, 'place'), (20, None)]
            script += [(1, 'dodge'), (20, 'light'), (90, None)]
            for n, act in script:
                if act in ('release',):
                    fr = await page.evaluate(STEP, [n, None]); fr += await page.evaluate(STEP, [1, act])
                else: fr = await page.evaluate(STEP, [n, act])
                for d in fr:
                    (tmp / f'f{k:05d}.jpg').write_bytes(base64.b64decode(d.split(',')[1])); k += 1
            print('player on screen', await page.evaluate('window.__scr'))
            out = ROOT / 'test' / f'moves_{w}.mp4'
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-framerate', '30', '-i', str(tmp / 'f%05d.jpg'), '-vf', 'scale=852:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', str(out)], check=True)
            shutil.rmtree(tmp); print('wrote', out, k, 'frames')
        print('\n'.join(errs) or 'no errors'); await br.close()
asyncio.run(main())
