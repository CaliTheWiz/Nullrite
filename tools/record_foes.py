"""Record the player walking into the foes in the shrine room and fighting (AI-driven player) -> test/foes.mp4."""
import asyncio, base64, subprocess, tempfile, shutil
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parent.parent
STEP = r"""
(n) => {
  const o = window.__nullrite, g = o.game, p = g.player, R = window.__rec || (window.__rec = { ctl: { moveDir: null, moveMag: 0, sprint: false, aimDir: null, heavyHeld: -1 } });
  const frames = [];
  for (let i = 0; i < n; i++) {
    const live = g.foes.filter(f => f.alive && !f.gone && f.brain === 'engage');
    if (live.length) { const f = live[0], d = Math.atan2(f.gy - p.gy, f.gx - p.gx), dist = Math.hypot(f.gx - p.gx, f.gy - p.gy);
      if (dist > 115) { R.ctl.moveDir = d; R.ctl.moveMag = 0.3; } else { R.ctl.moveDir = null; if (p.canAct() && Math.random() < 0.08) g.press('light', d); } }
    else { R.ctl.moveDir = Math.PI / 2; R.ctl.moveMag = 0.3; }
    p.hp = p.maxHp;
    o.controls.frame(1 / 60); g.update(1 / 60, R.ctl); o.renderer.draw(g, o.controls.ui, g.t);
    if (i % 2 === 0) frames.push(o.renderer.cv.toDataURL('image/jpeg', 0.85));
  }
  return frames;
}
"""
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await br.new_context(viewport={'width': 852, 'height': 393}, device_scale_factor=1)
        await ctx.add_init_script("const _r = window.requestAnimationFrame.bind(window); let _n = 0; window.requestAnimationFrame = (f) => (_n++ < 2 ? _r(f) : 0);")
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto((ROOT / 'index.html').as_uri()); await page.wait_for_timeout(1200)
        await page.evaluate("() => { const o = window.__nullrite; o.start(); o.game.resetRound(); o.game.fade = 0; o.game.player.gy = -1480; }")
        tmp = Path(tempfile.mkdtemp()); k = 0
        for _ in range(8):
            for d in await page.evaluate(STEP, 60):
                (tmp / f'f{k:05d}.jpg').write_bytes(base64.b64decode(d.split(',')[1])); k += 1
        out = ROOT / 'test' / 'foes.mp4'
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-framerate', '30', '-i', str(tmp / 'f%05d.jpg'), '-vf', 'scale=852:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', str(out)], check=True)
        shutil.rmtree(tmp); print('wrote', out, k); print('\n'.join(errs) or 'no errors'); await br.close()
asyncio.run(main())
