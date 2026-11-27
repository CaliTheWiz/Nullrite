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
- Dodge is a low forward dash (was a roll; user changed it): same timing/i-frames, crimson afterimages snapshot the real body.
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
- Slam sends 2 floor ripples (1.0s apart, 260 u/s, 20 dmg each): a band of the floor heaves up with a trough + dust, no coloured line. Hit zone is the crest centre (±10 + half player radius). Dash in through them toward the boss; dashing outward or sideways just delays the hit.
- Shorter idle between attacks in phase 2 (0.3–0.7s).
- Tests: `node test/phase2_test.js`, `python3 test/phase2_shot.py`.

## Player look + gear plan (in progress, one step at a time)
Base player model + wearable gear. Slots: head, chest, legs, hands, feet, back (cape),
right hand (main weapon), left hand (off-hand: pistol now; blunderbuss/shield/catalyst later),
necklace + ring (invisible; build modifiers). Armor has defense, poise and weight; equip load
changes dash speed/distance and stamina regen (Souls-style). Gear is found in the world.
Steps (1 done):
1. DONE — `src/rig.js` (skeleton, IK, poseRig), `src/gear.js` (catalog, STARTER_GEAR, PART_ART), `src/gearart.js` (3D-described pictures baked for 16 directions; limbs are tapered segments). Pose sheet: `python3 tools/rig_sheet.py`.
   Jointed rig: base body (3D char-frame skeleton projected to 2.5D, legs IK, arms IK to the weapon grip),
   per-part textures in 5 views + mirrors, gear layers per part. Starter set recreates the hooded hunter.
2. DONE — Cloak: `Cape` in rig.js, 9x8 Verlet grid in world space pinned at the shoulders; soft pull to rest shape,
   stretch-only links, stays behind torso, drapes over legs, floor clamp. Gear `cloth` params (length, widths, colours,
   tatter). Drawn per frame as depth-sorted quads (outer face lit, crimson-black lining) + hem.
3. DONE — Fuller silhouette: crimson tabard (front Cloth from the coat), holstered pistol on the left hip (empties when
   drawn; pistol appears in the left hand while shooting), healing flask on the right hip (dims when out of charges).
   Per-weapon stances (WEAPONS[w].stance: rest / move / dash with off, r, elev, point, up); 2h weapons held in both hands.
   Cloth is general (`Cloth`, kinds back/front); every cloth panel is depth-sorted with the limbs individually, and air
   drag streams it out when running. `python3 tools/sprint_sheet.py` renders sprint frames.
4. Shading: crimson rim light, darker undersides, tighter contact shadow.  (Largely covered by the 3D renderer below.)
**3D character (current renderer):** `src/gl3d.js` (WebGL core: 2-bone skinning shader, 2.5D projection
x=X, y=Y*K+Z, depth=Y-K*Z; key light + hemisphere fill, crimson rim, plate specular, emissive, additive flash;
inside faces detected by normal vs view and shown in the back/lining colour) and `src/body3d.js` (bind-pose skeleton
BIND, boneFrames(), mesh builders tube/chainSamples/ellipsoid/loftZ/box, base body, GEAR3D hunter set, WEAPON3D
sword/spear/pistol, belt props, cloth meshes refreshed from the Cloth sim). The rig is fully 3D in the char frame
(3D arm IK with down/out/back elbow pole, 3D weapon grip + blade direction from animateSword's bladeH/bladeE,
continuous facing). Renderer draws the GL canvas into the player layer; the 2D picture path stays as a fallback
when WebGL is unavailable. Blade flat is turned toward the camera. Headless tests use software GL (slow) - judge
frame rate on the phone.
5. Life: idle breathing, weight shift, head leads turns, dash landing stagger.
Then: gear system (stats, weight, equip screen, pickups), pistol aims with the left stick (option 2),
shot feedback (muzzle flash + streak, option 4), player gun animation, more distinct boss wind-up poses.
Blunderbuss (spread shot) is a future off-hand weapon.
Weapon/hand rules (agreed):
- Every weapon has a grip: '1h' (either hand), '2h' (both hands, LEFT HAND LOCKED), 'shield' (left only).
- Families: melee, shield, gun, bow/crossbow, thrown, catalyst (orb/staff/book).
- Right hand -> light/heavy buttons. Left button -> the left-hand item: melee = off-hand attack chain (mirrored anims),
  shield = hold block + timed parry, gun = shoot/parry, catalyst = cast attuned spell.
- Same melee family in both hands -> dual-wield moveset on light/heavy.
- Bows are 2h (tap quick shot, hold heavy draw); a hand crossbow can be 1h.
- Open question for later: with a 2h weapon, left button = weapon guard, or nothing.
- 2h weapons are held with BOTH hands at all times (idle, walk, dash, attacks).
- Every weapon gets its OWN animation set: idle stance, walk/run carry, dash carry, every attack in its chains,
  heavy/charged, running/dash attacks, visceral, stagger/hurt recoil, death drop. No sharing or cycling the same
  motion between weapons (and avoid repeating the same motion inside one weapon's chain). Data lives per weapon
  (WEAPONS[w].stance + per-move poses), not as shared motion types.
- Consequence to decide in the gear phase: the starter greatsword is 2h, so with the left hand locked the pistol
  can't be used with it. Options: start with a 1h weapon + pistol, or let the player pick a starting kit.

## Next (planned)
- More weapons/items; maybe itch.io release.

## Arm anatomy rules (user requirement: keep real joint limits in every pose)
- Elbow = hinge: straight at full reach, folds one way, max ~145 deg. Wrist: fist continues along the forearm,
  handle across the palm; the handle may tilt at most ~22 deg off square to the forearm (no sideways wrists) -
  beyond that the BLADE direction is corrected, never the wrist. Shoulder: no swinging far behind the back or
  across the chest. Elbows hang down/back (slightly out), out+forward only when hands go above the shoulder.
- Implemented in Rig.arm3: candidate elbow positions around the shoulder-wrist line are scored (preferred elbow
  direction, shoulder range, elbows-not-winging, forearm square to the gripped handle, torso collision, continuity)
  and the best one is used. Hands are also kept out of the torso (torsoPush).

## Resolution
- Renders at full device pixel density (3x on iPhone Pro; was capped at 2.5x). If FPS stays under 52 for 2.5s
  during play, main.js steps the render scale down 0.25 at a time (floor 2x). Player layer and afterimages are
  drawn 1:1 snapped to whole device pixels; imageSmoothingQuality 'high'.

## Rendering notes (player)
- Player draws into an offscreen layer (PLAYER_LAYER box) then composites, so fading/flicker treats the body as one
  piece (no seeing limbs through the cloak) and hurt/glow flashes tint the whole silhouette (source-atop).
- Sword rests on his right side in every facing (he is right-handed; nothing is mirrored any more).
