# Nullrite — design notes (source of truth if chat context is summarized)

## Platform
- HTML5 single page (canvas 2D + WebAudio), built from `src/*.js` into `index.html` by `build.py`.
- Tested in headless Chrome here; user plays on iPhone via GitHub Pages (home screen shortcut, full-screen).
- Source layout:
  - `config.js` tuning + weapon/boss/item data (pure data)
  - `mathx.js` helpers
  - `logic.js` Player, Boss, Projectiles, Pickups, FX particle data, Game — NO canvas/audio/DOM
  - `art.js` procedural textures (all art drawn in code), tint cache
  - `audio.js` WebAudio synthesized SFX
  - `render.js` canvas renderer (world + HUD + overlays)
  - `input.js` multitouch joystick + buttons
  - `main.js` boot, loop, title/rotate screens, safe areas
- Python/Pythonista version (`/home/claude/m2/main.py`, not in repo) is the reference for behaviour/tuning.

## Published
- Repo: github.com/CaliTheWiz/Nullrite (public), Pages serves root `index.html` from `main`:
  https://calithewiz.github.io/Nullrite/ . Workflow: edit src → `python3 build.py` → tests → commit + push.
  Icons: `python3 tools/make_icon.py` (rendered from the game's own art). `manifest.webmanifest` for home screen.
- Updates: `sw.js` is network-first, so the home-screen app fetches the newest build on every launch. Title screen shows `build <hash>` (sha1 of the JS) to confirm which version is running.
- Older private Claude artifact (frame-limited, optional to update):
- Artifact slug 27a93ff8-c8d7-4c91-a812-334b1d0b6e7e (title "Obsidian Oath", old name); republish with
  publish_files(slug, base_version=<last>, files=[index.html]) after `python3 build.py`.
- Tests: `node test/logic_test.js` + `node test/phase2_test.js` (pure logic), `python3 test/controls.py` / `test/fight.py` (headless Chrome).

## Hard design rules (user decisions)
- NO tells or previews of any kind: no floor telegraphs (player or boss), no wind-up sounds,
  no glints, no core flare, no visceral prompt, no charge-ready ping. Only animation poses.
- NO lock-on, NO soft-lock/auto-aim. Fully manual aim (move direction / drag on buttons).
- Dodge is always a roll (no quickstep).
- Zero external assets: all art + audio generated in code.
- Difficult & realistic; boss "test boss" is fine being easy for now.

## Controls / layout (landscape, 60pt side safe padding)
- Left half: floating stick; push to outer edge = sprint (stamina drain).
- Right crescent around LIGHT (corner, r42): slots at 186/152/118/84 deg, ARC_R 118, r30:
  DODGE (instant), HEAVY (tap/drag; hold >=0.65s release = charged, hyper armour),
  PISTOL (tap/drag-aim, fires on release, parry), empty socket (future skill/magic).
- Small pair (r22) side by side above crescent: ITEM inner-left, HEAL (flask) outer-right, counts above each. Kept low so the app top bar never covers them. Thrown items = hold/drag aim.
- Top-left: HP (orange = Rally), stamina, weapon chip (tap to swap greatsword/spear), FPS.
- Bottom-centre: boss name, HP, poise bar.

## Combat systems
- Weapons are data: light chain (3), heavy, charged, dodge/running attack; hitbox arc/thrust/ring;
  motion swing/thrust/overhead. 120ms input buffer. Recovery cancel windows.
- Stamina: costs x0.6 (STAMINA_COST_MULT), regen 75/s (90% while walking) after 0.3s, sprint 10/s.
- Rally: lost HP -> orange; hits regain 35% of damage dealt; 1s grace then drains 14/s.
- Visceral: boss staggered + player within 125 in front (75 deg) + LIGHT = 240 dmg, invulnerable.
- Pistol: 10 rounds, 18 dmg; shot landing in last 0.35s of sweep/lance wind-up = parry (stagger).
- Firebombs: pickups on floor (2 x 3), thrown 260 units, r95 AoE 60 dmg.
- Boss: Sentinel 1400 HP, poise 100 (heavies break in 3), stagger 2.5s (+50% dmg).
  Attacks sweep / slam / lance, distance-aware choice; 8-direction views.
- Camera zoom 0.8, leans 0.38 toward boss (cap 200).

## Phase 2 (boss below 50% HP) — done
- Transition (PHASE state, 2.0s, boss immune, poise refilled): hitstop 0.2, big shake, 'roar' SFX,
  shockwave ring that shoves the player away (no damage) within 560 units.
- Floor runes cross-fade dull gold -> pulsing crimson (g.phaseMix), arena border pulses; boss core glow larger.
- Ambient drone (live WebAudio oscillators + looped dark air, built once at first tap): on during the fight,
  fades on death/victory; phase 2 drops pitch 3 semitones, adds a tritone voice, faster filter sweep + slow pulse.
- Lance chains straight into a quicker sweep (sweep_follow: windup 0.52). Parryable like a normal sweep.
- Slam sends 2 floor ripples (1.0s apart, 260 u/s, 20 dmg each): a band of the floor heaves up with a trough + dust, no coloured line. Hit zone is the crest centre (±10 + half player radius). Roll in through them toward the boss; rolling outward or sideways just delays the hit.
- Shorter idle between attacks in phase 2 (0.3–0.7s).
- Tests: `node test/phase2_test.js`, `python3 test/phase2_shot.py`.

## Next (planned)
- More weapons/items; maybe itch.io release.
