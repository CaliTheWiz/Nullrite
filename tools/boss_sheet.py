"""Render pose sheets of the 3D boss (6 facings x 8 poses each) to test/boss_sheet_a.png and _b.png."""
import asyncio, base64, sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
SHEETS = {
  'a': "[['idle', 'idle'], ['walk', 'walk'], ['sweep wind 40%', 'sw:0.4'], ['sweep wind 100%', 'sw:1'], ['sweep 50%', 'sa:0.5'], ['sweep end', 'sr:0.2'], ['slam crouch', 'lc:0.9'], ['slam air', 'la:0.5']]",
  'b': "[['slam hit', 'lh'], ['lance aim', 'na:0.6'], ['lance coiled', 'nc'], ['lance charge', 'nh'], ['stagger', 'st'], ['phase roar', 'ph'], ['dying', 'd:0.45'], ['dead', 'd:1']]",
}
JS = r"""
(poses) => {
  const o = window.__nullrite, g = o.game, b = g.boss, C = o.C, S = C.S, A = C.BOSS_ATTACKS;
  const DIRS = [['S', -90], ['SE', -45], ['E', 0], ['NE', 45], ['N', 90], ['W', 180]];
  const cw = 300, ch = 330, W = cw * poses.length + 50, H = ch * DIRS.length + 30, dpr = 1.5, Z = 0.8;
  const cv = document.createElement('canvas'); const r = new C.Renderer(cv); r.resize(W, H, dpr);
  const x = r.ctx; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#0D0E12'; x.fillRect(0, 0, W, H);
  x.font = 'bold 12px monospace'; x.fillStyle = '#c9b48a';
  poses.forEach((p, i) => x.fillText(p[0], 50 + i * cw + 80, 18));
  DIRS.forEach((d, j) => x.fillText(d[0], 8, 30 + j * ch + ch / 2));
  for (let j = 0; j < DIRS.length; j++) for (let i = 0; i < poses.length; i++) {
    const f = DIRS[j][1] * Math.PI / 180, ps = poses[i][1], [key, arg] = ps.split(':'), q = +arg;
    b.reset(); b.gx = 0; b.gy = 0;
    const set = (k) => {
      b.facing = f; b.attack_dir = f; b.vx = b.vy = 0; b.elev = 0; b.wob = 0; b.wob_v = 0; b.squash = 0; b.flash_t = 0;
      const at = (st, kind, tt) => { b.state = st; b.kind = kind; b.atk = A[kind]; b.state_t = tt; };
      if (key === 'idle') at(S.S_IDLE, null, 0.2);
      if (key === 'walk') { at(S.S_STALK, 'sweep', 0.2); b.vx = Math.cos(f) * 105; b.vy = Math.sin(f) * 105; }
      if (key === 'sw') at(S.S_WINDUP, 'sweep', A.sweep.windup * q);
      if (key === 'sa') at(S.S_ACTIVE, 'sweep', A.sweep.active * q);
      if (key === 'sr') at(S.S_RECOVERY, 'sweep', A.sweep.recovery * q);
      if (key === 'lc') at(S.S_WINDUP, 'slam', A.slam.crouch * q);
      if (key === 'la') { at(S.S_WINDUP, 'slam', A.slam.crouch + (A.slam.windup - A.slam.crouch) * q); b.elev = Math.sin(Math.PI * q) * 95; }
      if (key === 'lh') at(S.S_ACTIVE, 'slam', 0.05);
      if (key === 'na') at(S.S_WINDUP, 'lance', A.lance.lock * q);
      if (key === 'nc') at(S.S_WINDUP, 'lance', A.lance.windup - 0.05);
      if (key === 'nh') at(S.S_ACTIVE, 'lance', 0.1);
      if (key === 'st') at(S.S_STAGGERED, null, 1.0);
      if (key === 'ph') { at(S.S_PHASE, null, C.PHASE_TIME * 0.4); b.phase = 2; }
      if (key === 'd') { at(S.S_DEAD, null, 0); b.dead_t = 1.6 * q; }
      if (key === 'walk') { b.gx += b.vx / 60; b.gy += b.vy / 60; }
    };
    for (let k = 0; k < 60; k++) { set(k); b.animate(1 / 60, 1 + k / 60); }
    const cx = 50 + i * cw + cw / 2, cy = 30 + j * ch + ch - 70;
    r.g = { cam_x: 0, cam_y: 0, ox: 0, oy: 0, t: 1 };
    r.sx = () => cx; r.sy = () => cy;
    r.entityFrame = function (gx, gy, h) { this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.ctx.translate(cx, cy - (h || 0) * Z); this.ctx.scale(Z, Z); };
    b.gx = 0; b.gy = 0; r.drawBoss(b);
  }
  return [cv.toDataURL('image/png'), !!r.boss3d];
}
"""

async def main():
    which = sys.argv[1:] or ['a', 'b']
    async with async_playwright() as pw:
        br = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        page = await br.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
        await page.goto((ROOT / 'index.html').as_uri()); await page.wait_for_timeout(800)
        for w in which:
            data, ok = await page.evaluate('(p) => (' + JS + ')(p)', eval(SHEETS[w]))
            out = ROOT / 'test' / f'boss_sheet_{w}.png'; out.write_bytes(base64.b64decode(data.split(',')[1]))
            print('wrote', out, '3d' if ok else '2D FALLBACK')
        print('\n'.join(errs) or 'no errors')
        await br.close()
asyncio.run(main())
