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
- NO visual tells/indicators: no floor telegraphs (player or boss), no parry glints, no red glows for
  unparryable attacks, no core flare, no visceral prompt, no charge-ready ping.
  Organic cues ARE fine (user clarified, like Souls games): body language and poses, and the natural
  sounds of the body and weapon (footfalls into a stance, armour, grunts, whooshes, attack-specific sounds).
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
4. DONE — Shading (3D renderer below) + contact shadow (step 5).
**3D character (current renderer):** `src/gl3d.js` (WebGL core: 2-bone skinning shader, 2.5D projection
x=X, y=Y*K+Z, depth=Y-K*Z; key light + hemisphere fill, crimson rim, plate specular, emissive, additive flash;
inside faces detected by normal vs view and shown in the back/lining colour) and `src/body3d.js` (bind-pose skeleton
BIND, boneFrames(), mesh builders tube/chainSamples/ellipsoid/loftZ/box, base body, GEAR3D hunter set, WEAPON3D
sword/spear/pistol, belt props, cloth meshes refreshed from the Cloth sim). The rig is fully 3D in the char frame
(3D arm IK with down/out/back elbow pole, 3D weapon grip + blade direction from animateSword's bladeH/bladeE,
continuous facing). Renderer draws the GL canvas into the player layer; the 2D picture path stays as a fallback
when WebGL is unavailable. Blade flat is turned toward the camera. Headless tests use software GL (slow) - judge
frame rate on the phone.
5. DONE — Life: breathing (chest/shoulders/head; faster after sprinting), slow hip weight shift when standing (feet
   planted, torso rides it), head yaw (neck limit ~60 deg) leads into turns and otherwise follows the boss when in
   view, dip-and-settle for 0.3s after a dash. Contact shadow: soft wide + darker core + a shadow per foot that
   fades as the foot lifts. `python3 tools/life_sheet.py`.
Pistol (DONE): tap = draw from the left-hip holster and fire (GUN_MOVE windup 0.15 is the draw); HOLD the button =
draw and aim (gunReady over 0.2s, walk at 50%, no sprint, left stick steers the aim), release fires almost at once
(GUN_MOVE_READY windup 0.03). Drag on the button still aims directly. Recoil: hand back/up a little, muzzle flips
~20 deg (wrist extension). Muzzle point from the rig (p.muzzleX/Y/Z) drives the flash (warm + crimson glow, sparks,
smoke) and the tracer (hot streak behind the round); misses spark + dust where they stop. Flintlock mesh.
`python3 tools/gun_sheet.py`. Note: 2h weapons will lock the left hand in the gear phase (pistol unusable then).
Pistol restyled (obsidian steel, crimson fuller + glowing muzzle + pommel gem, dark-gold bands), 1.3x size.

Boss in 3D (DONE): src/bossrig.js (skeleton + every state's pose) and src/boss3d.js (meshes + BossGL, its own WebGL
canvas). Same shader as the player (uDepth uniform: player 420, boss 900). Only the boss's projected bounding box is
rendered (GL scissor) and copied, so the big layer (BOSS_LAYER 680x600 pt) stays cheap. Slam elevation is applied
when compositing. Poses (all from the body, no tells): guard = upright halberd in the left hand, right fist down;
sweep = coils left, fists together in front, swings flat around him (blade reach ~240, matches the hit range);
slam = halberd raised over his back, leap with knees tucked, chop into the floor; lance = sideways spear stance,
right fist at the hip (placed in the torso frame), coils lower after the lock, lunge on the charge; stagger = drops
low leaning on the planted halberd; phase roar = halberd thrust up, arm flung out, plates flare; death = kneels,
topples forward, halberd and plates fall. Left hand high on the shaft, right hand low; the shaft always runs through
where the fists actually are. Arms use the same anatomical scored IK as the player, measured in the twisted torso
frame. 2D sentinel pictures remain as the fallback. `python3 tools/boss_sheet.py` (6 facings x 16 poses).
Boss weight (DONE): every heavy contact is detected from the rig, not scripted: a foot coming down from a lift
(walking, or any stance change - a foot moved to a new spot lifts and lands), a knee hitting the floor (stagger,
death only), the body, the halberd and each plate in the death fall. Each sends an event -> Game.onBossContact:
synthesized sound (stomp / boom / clank / clang / skid), a camera drop that springs back (addBump; a thud, not the
rattle of addShake), floor dust, stone chips (rubble pool, untinted texture), haptics. Springs in the rig give the
body weight: sink (knees give on landing), plates lag and bounce, a forward lurch when the lance charge stops.
Slam: push-off stomp at the leap, boom + big drop + rubble at the landing and where the blade bites. Lance:
push-off, floor dust through the charge, grinding skid + dust spray at the stop. Death runs on an exact timeline
(not eased): knees give (0-0.3s, knee thud), plates drop and clank (~0.6-0.9), halberd tips over and clangs (~0.9),
he topples with accelerating speed and hits the floor at 1.28s (boom, biggest drop), one small settle bounce.
`python3 tools/boss_seq.py` renders these as time strips.
Gear system (DONE, first pass): src/gear.js holds the item catalog (ITEM_DB = armour from GEAR + WEAPON_ITEMS +
TALISMANS, each with lore), Inventory (owned items, equipped slots, seen/new flags, looted-source flags; saved to
localStorage 'nullrite.inventory.v1') and deriveStats(). Slots: right, left, head, chest, hands, legs, feet, back,
necklace (shown as AMULET), ring. Hand rules in Inventory.fits(): 2h = right only and locks the left hand (the left item
stays equipped but inactive, shown LOCKED); shields left only; `allowed` lists the hands a weapon has animations for
(pistol: left; swords: right) until per-weapon left-hand movesets exist. Right hand can't be empty (no unarmed set).
Stats: defence -> damage taken x (23+60)/(def+60) (x1 in the hunter set); poise >= an attack's impact (sweep 18,
lance 24, slam 32, waves 14) = take the damage but keep your footing; weight / max load (72 + rings) picks a tier:
LIGHT <=30%, MEDIUM <=70%, HEAVY <=100%, OVERLOADED: dash speed/length, stamina regen and walk speed drop per tier.
Talismans: Ember Ring (regen +15%), Ring of the Hollow Oath (load +15), Crimson Locket (HP +15), Sentinel's Sigil
(poise +10). Starter kit: Oathbound Sword (1h, new, own stance + moveset; the free arm swings out for balance) +
Ember Pistol + hunter set. Sources: chests (test room: west = greatsword + Ember Ring, east = spear + Crimson
Locket; OPEN prompt, lid animation, OBTAINED banner) and boss drops (Sentinel Helm, Sentinel Plate, Sentinel's Sigil,
Ring of the Hollow Oath on victory, listed on the victory screen). Each source gives once per save. Enemy drops later.
Equipment screen (src/menu.js): opened from the HUD weapon chip (GEAR, red dot = new items). Slots | items that fit |
detail (stats with +/- against what is worn, lore) + totals (HP, damage taken, poise, load bar with tier marks).
First tap previews, second tap equips. The fight does not pause (Souls). Changing gear only when not mid-action.
Hold "RESET PROGRESS" 1.2 s to wipe the save. `python3 tools/gear_sheet.py` renders loadouts in 3D.
Next: per-weapon unique animation sets (incl. left-hand / dual-wield movesets), shields, catalysts, enemy drops.
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
