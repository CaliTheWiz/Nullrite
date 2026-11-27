"""Strips of the boss over time (death fall, slam landing, lance stop), rendered from a running game: test/boss_seq.png."""
import asyncio, base64
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parent.parent
JS = r"""
() => {
  const o = window.__nullrite, g = o.game, b = g.boss, P = g.player, C = o.C, S = C.S, A = C.BOSS_ATTACKS;
  const ROWS = [
    ['death', () => { P.gx = 0; P.gy = -700; b.takeHit(99999, 0, 0, false, false); g.onBossDeath(b); }, [0.15, 0.3, 0.42, 0.6, 0.85, 1.0, 1.1, 1.2, 1.3, 1.36, 1.42, 1.5, 1.7]],
    ['slam', () => { P.gx = 0; P.gy = -120; P.hp = 1e9; b.chooseAttack(0); b.kind = 'slam'; b.atk = A.slam; b.beginAttack(P); }, [0.2, 0.32, 0.55, 0.85, 1.0, 1.06, 1.1, 1.15, 1.22, 1.32, 1.5, 1.8, 2.2]],
    ['lance', () => { P.gx = 0; P.gy = -320; P.hp = 1e9; b.chooseAttack(0); b.kind = 'lance'; b.atk = A.lance; b.beginAttack(P); }, [0.3, 0.7, 1.0, 1.15, 1.25, 1.33, 1.38, 1.44, 1.5, 1.6, 1.8, 2.1, 2.5]],
  ];
  const K = 0.65;
  const cw = 230, ch = 330, W = cw * 13 + 60, H = ch * ROWS.length + 20, dpr = 1.5, Z = 0.8;
  const cv = document.createElement('canvas'); const r = new C.Renderer(cv); r.resize(W, H, dpr);
  const x = r.ctx; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#0D0E12'; x.fillRect(0, 0, W, H);
  x.font = 'bold 11px monospace'; x.fillStyle = '#c9b48a';
  const ctl = { moveDir: null, moveMag: 0, sprint: false, aimDir: null, heavyHeld: -1 };
  ROWS.forEach(([name, setup, times], j) => {
    g.resetRound(); b.gx = 0; b.gy = 0; setup(); b.facing = -Math.PI / 4; if (b.attack_dir !== undefined) b.attack_dir = b.facing;
    let t = 0;
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#c9b48a'; x.fillText(name, 6, 20 + j * ch + 12);
    times.forEach((tt, i) => {
      while (t < tt) { g.update(1 / 60, ctl); t += 1 / 60; if (name !== 'slam') { b.facing = -Math.PI / 4; b.attack_dir = b.facing; } }
      const cx = 60 + i * cw + cw / 2 - (b.gx) * Z * 0.0, cy = 20 + j * ch + ch - 60;
      r.g = g; const bx = b.gx, by = b.gy;
      r.sx = (X) => cx + (X - bx) * Z; r.sy = (Y) => cy - (Y - by * K) * Z - g.oy * 0;
      r.entityFrame = function (gx, gy, h) { this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.ctx.translate(cx + (gx - bx) * Z, cy - ((gy - by) * K + (h || 0)) * Z); this.ctx.scale(Z, Z); };
      r.drawBoss(b);
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#7d7468'; x.fillText(tt.toFixed(2) + 's  bump ' + g.bump_y.toFixed(1), 60 + i * cw + 30, 20 + j * ch + ch - 20);
    });
  });
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
        (ROOT / 'test' / 'boss_seq.png').write_bytes(base64.b64decode(data.split(',')[1]))
        print('\n'.join(errs) or 'no errors'); await br.close()
asyncio.run(main())
