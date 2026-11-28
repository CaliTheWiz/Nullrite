"""Icon + title-screen concept boards, rendered from the live game (3D models, world): test/icon_concepts.png, test/title_concepts.png."""
import asyncio, base64
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parent.parent
JS = r"""
() => {
  const o = window.__nullrite, g = o.game, p = g.player, b = g.boss, C = o.C, S = C.S, ART = C.ART, tinted = C.tinted, CRIMSON = C.CRIMSON, RUNE_GOLD = C.RUNE_GOLD;
  const R = new C.Renderer(document.createElement('canvas')); R.resize(852, 393, 2);
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  const poseP = (f, st) => { p.reset(); for (const k in p.cloths) p.cloths[k].live = false; for (let k = 0; k < 50; k++) { p.facing = f; p.state = S.S_IDLE; p.vx = p.vy = 0; p.lookOn = false; p.animate(1 / 60, 2 + k / 60); } };
  const poseB = (f, state, tt) => { b.reset(); for (let k = 0; k < 70; k++) { b.facing = f; b.state = state; b.state_t = tt; b.elev = 0; b.vx = b.vy = 0; b.animate(1 / 60, 2 + k / 60); } };
  // big 3D renders
  const bust = (scale) => { const L = { w: 340, h: 300, ox: 170, oy: 200 }; R.gl3d.render(p, L, scale); return R.gl3d.g.canvas; };
  const bossBig = (scale) => { const L = { w: 680, h: 600, ox: 340, oy: 400 }; const rc = R.boss3d.render(b, L, scale); return [R.boss3d.g.canvas, rc]; };
  const icons = [];
  const bg = (x, n, inner, outer) => { x.fillStyle = '#07070a'; x.fillRect(0, 0, n, n); const gr = x.createRadialGradient(n / 2, n * 0.45, n * 0.05, n / 2, n * 0.45, n * 0.7); gr.addColorStop(0, inner); gr.addColorStop(1, outer); x.fillStyle = gr; x.fillRect(0, 0, n, n); };
  const glow = (x, cx, cy, r, col, a) => { const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0)); x.globalCompositeOperation = 'lighter'; x.fillStyle = gr; x.fillRect(cx - r, cy - r, 2 * r, 2 * r); x.globalCompositeOperation = 'source-over'; };
  const N = 512;
  // A: the hunter's hood and visor, close
  { poseP(-Math.PI / 2); const cv = bust(9); const [c, x] = mk(N, N); bg(x, N, 'rgba(120,24,38,0.55)', 'rgba(7,7,10,1)');
    const hx = 170 * 9, hy = (200 - 66) * 9, crop = 70 * 9; x.drawImage(cv, hx - crop / 2, hy - crop * 0.42, crop, crop, 0, 0, N, N);
    glow(x, N * 0.5, N * 0.33, N * 0.16, 'rgba(255,40,64,A)', 0.55); icons.push(['A  The Visor', c]); }
  // B: the rite sigil with the oath sword through it
  { const [c, x] = mk(N, N); bg(x, N, 'rgba(70,14,22,0.7)', 'rgba(5,5,7,1)');
    x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.9; x.drawImage(tinted(ART.ritual, CRIMSON).c, N * 0.06, N * 0.06, N * 0.88, N * 0.88);
    x.globalAlpha = 0.35; x.drawImage(tinted(ART.ritual, RUNE_GOLD).c, N * 0.06, N * 0.06, N * 0.88, N * 0.88); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    glow(x, N / 2, N / 2, N * 0.3, 'rgba(255,48,72,A)', 0.5);
    x.save(); x.translate(N / 2, N * 0.5); x.rotate(-Math.PI / 2); const sw = ART.weapon.sword; x.drawImage(sw.c, -N * 0.42, -N * 0.06, N * 0.84, N * 0.12); x.restore();
    icons.push(['B  The Rite', c]); }
  // C: the Sentinel's horned helm
  { poseB(-Math.PI / 2, S.S_IDLE, 0.2); const [cv, rc] = bossBig(4.2); const [c, x] = mk(N, N); bg(x, N, 'rgba(110,20,32,0.6)', 'rgba(6,6,8,1)');
    const hx = 340 * 4.2 - 14 * 4.2, hy = (400 - 162) * 4.2, crop = 96 * 4.2; x.drawImage(cv, hx - crop / 2, hy - crop * 0.5, crop, crop, 0, 0, N, N);
    glow(x, N * 0.5, N * 0.55, N * 0.14, 'rgba(255,40,64,A)', 0.45); icons.push(['C  The Sentinel', c]); }
  // D: the hunter from behind, facing the giant
  { poseB(-Math.PI / 2, S.S_IDLE, 0.2); const [cv, rc] = bossBig(1.9); poseP(Math.PI / 2); const pv = bust(1.9);
    const [c, x] = mk(N, N); const gr = x.createLinearGradient(0, 0, 0, N); gr.addColorStop(0, '#2a070d'); gr.addColorStop(0.6, '#0b0609'); gr.addColorStop(1, '#040405'); x.fillStyle = gr; x.fillRect(0, 0, N, N);
    glow(x, N / 2, N * 0.3, N * 0.45, 'rgba(200,30,48,A)', 0.35);
    x.drawImage(cv, 340 * 1.9 - N * 0.5, (400 - 250) * 1.9 - N * 0.04, N, N, 0, 0, N, N);
    x.drawImage(pv, 170 * 1.9 - 110, (200 - 84) * 1.9 - 20, 220, 200, N / 2 - 230, N * 0.5, 460, 418);
    icons.push(['D  The Duel', c]); }
  // board: icons large, then a home-screen row at real size
  const [bd, bx] = mk(4 * 300 + 50, 560); bx.fillStyle = '#121216'; bx.fillRect(0, 0, bd.width, bd.height);
  const mask = (x, X, Y, s, src) => { x.save(); const r = s * 0.225; x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + s, Y, X + s, Y + s, r); x.arcTo(X + s, Y + s, X, Y + s, r); x.arcTo(X, Y + s, X, Y, r); x.arcTo(X, Y, X + s, Y, r); x.closePath(); x.clip(); x.drawImage(src, X, Y, s, s); x.restore(); };
  icons.forEach(([name, c], i) => {
    mask(bx, 25 + i * 300, 20, 270, c);
    bx.fillStyle = '#e8dcc4'; bx.font = 'bold 18px Georgia'; bx.textAlign = 'center'; bx.fillText(name, 25 + i * 300 + 135, 318);
  });
  const wall = bx.createLinearGradient(0, 350, 0, 560); wall.addColorStop(0, '#1d2433'); wall.addColorStop(1, '#3a2b40'); bx.fillStyle = wall; bx.fillRect(0, 350, bd.width, 210);
  icons.forEach(([name, c], i) => { mask(bx, 120 + i * 270, 395, 120, c); bx.fillStyle = '#fff'; bx.font = '20px -apple-system, Helvetica'; bx.fillText('Nullrite', 180 + i * 270, 545); });
  const out = { icons: bd.toDataURL('image/png') };
  // ---------------- title concepts (the real world, no HUD)
  const scene = (setup, cam) => {
    g.resetRound(); setup(); [g.cam_x, g.cam_y] = cam; g.ox = g.oy = 0;
    for (let k = 0; k < 120; k++) g.fx.update(1 / 60, g.cam_x, g.cam_y);
    R.drawScene(g, 3); const [c, x] = mk(852 * 2, 393 * 2); x.drawImage(R.cv, 0, 0); return [c, x];
  };
  const vign = (x, fx, fy) => { const w = 1704, h = 786; x.fillStyle = 'rgba(0,0,0,0.38)'; x.fillRect(0, 0, w, h); const gr = x.createRadialGradient(w * (fx || 0.5), h * (fy || 0.5), h * 0.12, w * (fx || 0.5), h * (fy || 0.5), w * 0.55); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.92)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); };
  const logo = (x, cx, cy, size, align) => {
    x.textAlign = align || 'center'; x.textBaseline = 'middle'; x.font = `bold ${size}px Georgia, serif`;
    x.shadowColor = 'rgba(230,31,51,0.6)'; x.shadowBlur = 24; x.fillStyle = '#e8dcc4'; x.fillText('NULLRITE', cx, cy); x.shadowBlur = 0;
    x.font = `italic ${size * 0.26}px Georgia, serif`; x.fillStyle = '#b3a68c'; x.fillText('an oath with nothing inside it', cx, cy + size * 0.62);
  };
  const menu = (x, items, X, Y, dy, align, sel) => { x.textAlign = align; x.font = 'bold 30px Georgia, serif';
    items.forEach((it, i) => { const on = i === sel; x.fillStyle = on ? '#d9b45c' : '#8f8574'; x.fillText(it, X, Y + i * dy); if (on) { x.fillStyle = '#ff3048'; x.fillRect(align === 'left' ? X - 26 : X - 120, Y + i * dy - 3, 12, 6); } }); };
  const items = ['CONTINUE', 'NEW GAME', 'OPTIONS'];
  const T = [];
  { const [c, x] = scene(() => { g.player.gx = -2000; b.gx = 0; b.gy = 0; poseB(-Math.PI / 2, 'ENTER', 1.2); b.gx = 0; b.gy = 0; }, [-220, 40]);
    vign(x, 0.66, 0.48); logo(x, 1704 * 0.28, 786 * 0.34, 92); menu(x, items, 1704 * 0.28, 786 * 0.62, 54, 'center', 0); T.push(['1  The Dormant Sentinel', c]); }
  { const [c, x] = scene(() => { poseB(-Math.PI / 2, 'ENTER', 1.2); b.gx = 110; b.gy = -470; poseP(Math.PI / 2); g.player.gx = 110; g.player.gy = -850; g.gate_t = 0; }, [-60, -585]);
    vign(x, 0.6, 0.45); logo(x, 1704 * 0.22, 786 * 0.3, 80); menu(x, items, 1704 * 0.22, 786 * 0.58, 54, 'center', 0); T.push(['2  The Threshold', c]); }
  { const [c, x] = scene(() => { poseB(-Math.PI / 2, S.S_IDLE, 0.3); b.gx = 0; b.gy = 40; poseP(Math.PI / 2); g.player.gx = 0; g.player.gy = -250; }, [0, -10]);
    vign(x, 0.5, 0.45); logo(x, 1704 * 0.17, 786 * 0.4, 72, 'left'); menu(x, items, 1704 * 0.17 + 6, 786 * 0.62, 50, 'left', 0); T.push(['3  The Face-off', c]); }
  const [tb, tx] = mk(1704, 3 * 786 + 3 * 60); tx.fillStyle = '#121216'; tx.fillRect(0, 0, tb.width, tb.height);
  T.forEach(([name, c], i) => { tx.fillStyle = '#e8dcc4'; tx.font = 'bold 30px Georgia'; tx.textAlign = 'left'; tx.fillText(name, 20, i * 846 + 42); tx.drawImage(c, 0, i * 846 + 60); });
  out.titles = tb.toDataURL('image/png');
  g.resetRound();
  return out;
}
"""
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        page = await br.new_page(viewport={'width': 852, 'height': 393}); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto((ROOT / 'index.html').as_uri()); await page.wait_for_timeout(900)
        d = await page.evaluate(JS)
        (ROOT / 'test' / 'icon_concepts.png').write_bytes(base64.b64decode(d['icons'].split(',')[1]))
        (ROOT / 'test' / 'title_concepts.png').write_bytes(base64.b64decode(d['titles'].split(',')[1]))
        print('\n'.join(errs) or 'no errors'); await br.close()
asyncio.run(main())
