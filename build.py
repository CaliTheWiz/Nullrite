"""Inline src/*.js into one self-contained index.html (one <script>, wrapped in a block)."""
import os, hashlib

ORDER = ['config', 'mathx', 'gear', 'rig', 'bossrig', 'logic', 'art', 'gearart', 'gl3d', 'body3d', 'boss3d', 'audio', 'render', 'menu', 'input', 'main']
HERE = os.path.dirname(os.path.abspath(__file__))

TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#040406">
<meta name="apple-mobile-web-app-title" content="Nullrite">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" type="image/png" href="icon-192.png">
<link rel="manifest" href="manifest.webmanifest">
<title>Nullrite</title>
<style>
/* VOICE: grim, quiet, heavy. IDEA: a cathedral-machine arena seen from above.
   PICTURE: the canvas is the whole page. COLOUR and TYPE: obsidian black, crimson, dull gold; Georgia + Menlo.
   LAYOUT: one full-screen canvas; HUD drawn inside safe-area insets read from env(). */
html, body { margin: 0; height: 100%; overflow: hidden; background: #040406; overscroll-behavior: none;
  touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent; }
canvas { position: fixed; inset: 0; display: block; touch-action: none; }
#safe { position: fixed; inset: 0; pointer-events: none; visibility: hidden;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
</style>
</head>
<body>
<canvas id="game"></canvas>
<div id="safe"></div>
<script>
'use strict';
{
__JS__
}
</script>
<script>
// Always fetch the newest version when online (falls back to the last copy offline).
if ('serviceWorker' in navigator && location.protocol === 'https:' && window.top === window.self)
  navigator.serviceWorker.register('sw.js').catch(function () {});
</script>
</body>
</html>
"""


def build():
    parts = []
    for name in ORDER:
        with open(os.path.join(HERE, 'src', name + '.js')) as f:
            parts.append(f.read())
    js = '\n'.join(parts)
    build_id = hashlib.sha1(js.encode()).hexdigest()[:6]     # changes whenever the game code changes
    html = TEMPLATE.replace('__JS__', "const BUILD = '%s';\n" % build_id + js)
    out = os.path.join(HERE, 'index.html')
    with open(out, 'w') as f:
        f.write(html)
    return out, len(html)


if __name__ == '__main__':
    path, n = build()
    print('built %s (%d KB)' % (path, n // 1024))
