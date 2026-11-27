"""Render the home-screen icons from the game's own procedural art (no external assets)."""
import os, base64
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
js = '\n'.join(open(os.path.join(ROOT, 'src', n + '.js')).read() for n in ['config', 'mathx', 'logic', 'art'])
PAGE = """<html><body><script>
const DPR = 3;
%s
buildArt(4);
window.icon = (n) => {
  const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d');
  x.fillStyle = '#0D0E12'; x.fillRect(0, 0, n, n);
  const g = x.createRadialGradient(n/2, n*0.48, n*0.05, n/2, n*0.48, n*0.62);
  g.addColorStop(0, 'rgba(138,36,50,0.55)'); g.addColorStop(1, 'rgba(13,14,18,0)'); x.fillStyle = g; x.fillRect(0, 0, n, n);
  x.strokeStyle = '#8A2432'; x.lineWidth = n*0.018; x.shadowColor = 'rgba(230,31,51,0.9)'; x.shadowBlur = n*0.04;
  x.beginPath(); x.ellipse(n/2, n*0.74, n*0.30, n*0.30*0.65*0.5, 0, 0, Math.PI*2); x.stroke();
  x.shadowBlur = 0;
  const k = ART.knight.S, h = n*0.70, w = h * 64/96;
  x.drawImage(k.c, n/2 - w/2, n*0.76 - h, w, h);
  // glowing visor slit (in game it is its own layer)
  x.shadowColor = 'rgba(255,40,64,1)'; x.shadowBlur = n*0.035; x.fillStyle = '#ff3a50';
  x.beginPath(); x.ellipse(n/2, n*0.232, n*0.042, n*0.009, 0, 0, Math.PI*2); x.fill(); x.fill();
  x.shadowBlur = 0;
  return c.toDataURL('image/png');
};
</script></body></html>""" % js

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.set_content(PAGE)
    if errs: print(errs)
    for n in (180, 192, 512):
        data = pg.evaluate('n => window.icon(n)', n)
        open(os.path.join(ROOT, 'icon-%d.png' % n), 'wb').write(base64.b64decode(data.split(',')[1]))
        print('icon-%d.png' % n)
    b.close()
