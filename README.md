# Nullrite

A 2.5D top-down Souls-like boss fight for phones, in one HTML file. All art and sound are generated in code; there are no asset files.

**Play:** https://calithewiz.github.io/Nullrite/ — on iPhone, open in Safari, then Share → Add to Home Screen for full-screen landscape.

- `src/` — game source (config, math, logic, art, audio, render, input, main)
- `build.py` — joins `src/` into `index.html` (the file GitHub Pages serves)
- `tools/make_icon.py` — renders the home-screen icons from the game's own art
- `test/` — Node logic test and headless Chrome tests
- `DESIGN.md` — design rules, controls and tuning notes
