"""Render the home-screen icons (concept B, 'The Rite') from the game's own art: icon-180/192/512.png."""
import asyncio, base64
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parent.parent
JS = r"""
(n) => {
  const C = window.__nullrite.C, ART = C.ART, tinted = C.tinted, CRIMSON = C.CRIMSON, GOLD = C.RUNE_GOLD;
  const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d');
  x.fillStyle = '#050507'; x.fillRect(0, 0, n, n);
  let g = x.createRadialGradient(n / 2, n / 2, n * 0.04, n / 2, n / 2, n * 0.72);
  g.addColorStop(0, 'rgba(96,16,28,0.85)'); g.addColorStop(0.55, 'rgba(40,8,14,0.6)'); g.addColorStop(1, 'rgba(5,5,7,1)');
  x.fillStyle = g; x.fillRect(0, 0, n, n);
  // the sigil, drawn twice so its lines hold up at small sizes
  x.globalCompositeOperation = 'lighter';
  const s = n * 0.9, o = (n - s) / 2;
  x.globalAlpha = 0.95; x.drawImage(tinted(ART.ritual, CRIMSON).c, o, o, s, s);
  x.globalAlpha = n < 256 ? 0.7 : 0.45; x.drawImage(tinted(ART.ritual, CRIMSON).c, o, o, s, s);
  x.globalAlpha = 0.35; x.drawImage(tinted(ART.ritual, GOLD).c, o, o, s, s);
  g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n * 0.3); g.addColorStop(0, 'rgba(255,48,72,0.55)'); g.addColorStop(1, 'rgba(255,48,72,0)');
  x.globalAlpha = 1; x.fillStyle = g; x.fillRect(0, 0, n, n);
  x.globalCompositeOperation = 'source-over';
  // the oath sword, point down through the centre
  x.save(); x.translate(n / 2, n * 0.5); x.rotate(Math.PI / 2);
  x.shadowColor = 'rgba(255,40,64,0.9)'; x.shadowBlur = n * 0.03;
  const sw = ART.weapon.sword; x.drawImage(sw.c, -n * 0.43, -n * 0.065, n * 0.86, n * 0.13); x.restore();
  return c.toDataURL('image/png');
}
"""
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        page = await br.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto((ROOT / 'index.html').as_uri()); await page.wait_for_timeout(800)
        for n in (180, 192, 512):
            d = await page.evaluate('(n) => (' + JS + ')(n)', n)
            (ROOT / f'icon-{n}.png').write_bytes(base64.b64decode(d.split(',')[1])); print(f'icon-{n}.png')
        print('\n'.join(errs) or 'no errors'); await br.close()
asyncio.run(main())
