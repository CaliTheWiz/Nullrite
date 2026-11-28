// ============================================================ CONFIG (pure data)
// Nullrite - all tuning lives here. Behaviour mirrors the Pythonista build.
const K = 0.65;                 // 2.5D ground squash: screen_y = ground_y * K
const CAMERA_ZOOM = 0.8;        // < 1 zooms out; HUD unaffected
const ARENA_HALF = 768;
const TILE = 192;
const HUD = { SAFE_X: 60, SAFE_BOTTOM: 34, TOP: 0 };   // updated from CSS safe-area insets

const PLAYER_SPEED = 255.0;
const PLAYER_RADIUS = 20.0;
const STAM_MAX = 100.0;
const STAM_REGEN = 75.0;
const STAM_DELAY = 0.3;
const STAMINA_COST_MULT = 0.6;

const INPUT_BUFFER = 0.12;
const HITSTOP = 0.05;
const SHOW_FPS = true;
const MASTER_VOLUME = 0.6;

// right-hand crescent
const PRIMARY_R = 42, SLOT_R = 30, ARC_R = 118, SMALL_R = 22;
const SLOT_ANGLES = [186, 152, 118, 84];   // DODGE, HEAVY, PISTOL, spare
const AIM_THRESHOLD = 18.0;

// ---------------------------------------------------------------- moves
// hitbox : ['arc', range, half_deg] | ['thrust', length, width] | ['ring', radius] | null
// motion : ['swing', from_deg, to_deg] | ['thrust'] | ['overhead'] | ['rest']
// slash  : ['arc'|'thrust'|'slam', colour] | null
const MOVE_DEFAULTS = {
  windup: 0.12, active: 0.10, recovery: 0.25, cancel: 0.08, stamina: 14, damage: 35, poise: 7,
  lunge: 300, hitbox: ['arc', 140, 55], motion: ['swing', 75, -75], reach: 46, heft: 0, hyper: false,
  slash: ['arc', 'gold'], sfx: ['whoosh', 0.85], haptic: ['light', 0.6], shake: 6, sparks: 14,
  flash: 120, hitstop: HITSTOP, thud: false, anim: null, dtype: 'slash',
};
// damage types: what an attack does, what armour stops and what an enemy is weak to
const DAMAGE_TYPES = ['slash', 'stab', 'crush', 'ranged', 'magic'];
const DTYPE_NAME = { slash: 'SLASH', stab: 'STAB', crush: 'CRUSH', ranged: 'RANGED', magic: 'MAGIC' };
function move(kw) { return Object.assign({}, MOVE_DEFAULTS, kw); }

const SLASH_COLORS = { gold: '#ffe2b0', crimson: '#ff3048', white: '#fff4f0' };
const COMBO_WINDOW = 0.35;
const DODGE_ATTACK_WINDOW = 0.30;
const CHARGE_START = 0.20, CHARGE_FULL = 0.65, CHARGE_WALK = 0.45;

// Each weapon: its own clips (anim.js), its own speed, damage and damage type. Light chains are committed: long
// recoveries, late cancels. dtype: 'slash' | 'stab' | 'crush' | 'ranged' | 'magic' (see DAMAGE_TYPES).
const WEAPONS = {
  // one-handed: quick, a mix of cuts and thrusts; the left hand free (pistol at low ready) and swung for balance
  oathsword: {
    name: 'OATHBOUND SWORD', tex: 'oathsword', size: [70, 16], grip: 8, handGap: 0, glow: [30, 62, 10], speed: 1.06,
    stance: { hands: 1, offhand: { s: -14.5, f: 4, z: 41 },
              rest: { off: -0.5, r: 16, elev: 34, point: -0.2, up: 0.15, sway: 2.0 },       // point forward, a little raised
              move: { off: -1.3, r: 13, elev: 30, point: -0.85, up: -0.5 },                    // low at his side, tip forward-down
              dash: { off: -(Math.PI - 0.9), r: 16, elev: 28, point: -(Math.PI - 0.35), up: -0.3 } },   // trailing behind
    light: [
      move({ anim: 'os_l1', dtype: 'slash', windup: 0.14, active: 0.10, recovery: 0.34, cancel: 0.22, stamina: 11, damage: 26, poise: 6,
             hitbox: ['arc', 120, 55], motion: ['swing', 70, -62], reach: 40, hitstop: 0.045, shake: 5 }),
      move({ anim: 'os_l2', dtype: 'slash', windup: 0.13, active: 0.10, recovery: 0.34, cancel: 0.22, stamina: 11, damage: 27, poise: 6,
             hitbox: ['arc', 122, 55], motion: ['swing', -72, 64], reach: 42, hitstop: 0.045, shake: 5 }),
      move({ anim: 'os_l3', dtype: 'stab', windup: 0.18, active: 0.10, recovery: 0.40, cancel: 0.28, stamina: 13, damage: 31, poise: 9,
             hitbox: ['thrust', 150, 30], motion: ['thrust'], reach: 62, hitstop: 0.05, shake: 6 }),
    ],
    heavy: move({ anim: 'os_heavy', dtype: 'stab', windup: 0.42, active: 0.12, recovery: 0.55, cancel: 0.36, stamina: 22, damage: 58, poise: 22,
                  hitbox: ['thrust', 175, 34], motion: ['thrust'], reach: 64, heft: 0.6,
                  sfx: ['whoosh_heavy', 0.85], haptic: ['medium', 0.8], shake: 10, sparks: 22, flash: 150, hitstop: 0.07 }),
    charged: move({ anim: 'os_charged', dtype: 'slash', windup: 0.14, active: 0.18, recovery: 0.6, cancel: 0.4, stamina: 30, damage: 84, poise: 34,
                    hitbox: ['arc', 160, 85], motion: ['swing', 150, -150], reach: 50, heft: 0.8,
                    hyper: true, sfx: ['whoosh_heavy', 1.0], haptic: ['heavy', 1.0],
                    shake: 14, sparks: 32, flash: 210, hitstop: 0.09, thud: true }),
    dodge: move({ anim: 'os_dodge', dtype: 'slash', windup: 0.08, active: 0.12, recovery: 0.40, cancel: 0.26, stamina: 12, damage: 29, poise: 7,
                  hitbox: ['arc', 135, 70], motion: ['swing', 80, -80], reach: 48, sparks: 12, hitstop: 0.05 }),
  },
  greatsword: {
    name: 'OBSIDIAN GREATSWORD', tex: 'sword', size: [112, 28], grip: 12, handGap: 8, glow: [50, 96, 16], speed: 0.92,
    // stance: how this weapon is carried (angle offset from facing, distance, height, blade tilt: 1 upright, <0 tip down)
    // off = where the hands are (angle from facing), point = where the blade points (angle from facing)
    stance: { hands: 2, rest: { off: -0.55, r: 15, elev: 32, point: -0.35, up: -0.35, sway: 2.5 },  // low guard, tip forward-down
              move: { off: -0.9, r: 13, elev: 36, point: -1.2, up: 0.55 },                            // carried angled up across the body
              dash: { off: -(Math.PI - 0.6), r: 18, elev: 26, point: -(Math.PI - 0.25), up: -0.35 } },   // dragged low behind, right side
    // slow and heavy: big wind-ups, long follow-through; every hit lands like it means it
    light: [
      move({ anim: 'gs_l1', dtype: 'slash', windup: 0.32, active: 0.14, recovery: 0.52, cancel: 0.36, stamina: 20, damage: 52, poise: 14,
             hitbox: ['arc', 170, 62], motion: ['swing', 75, -75], reach: 50, heft: 0.6, sfx: ['whoosh_heavy', 0.7],
             haptic: ['medium', 0.7], shake: 9, sparks: 20, flash: 150, hitstop: 0.09 }),
      move({ anim: 'gs_l2', dtype: 'slash', windup: 0.28, active: 0.14, recovery: 0.54, cancel: 0.38, stamina: 20, damage: 54, poise: 14,
             hitbox: ['arc', 172, 64], motion: ['swing', -80, 80], reach: 50, heft: 0.6, sfx: ['whoosh_heavy', 0.7],
             haptic: ['medium', 0.7], shake: 9, sparks: 20, flash: 150, hitstop: 0.09 }),
      move({ anim: 'gs_l3', dtype: 'slash', windup: 0.40, active: 0.14, recovery: 0.66, cancel: 0.46, stamina: 24, damage: 66, poise: 20,
             hitbox: ['thrust', 175, 60], motion: ['overhead'], reach: 60, heft: 0.8, sfx: ['whoosh_heavy', 0.85],
             haptic: ['medium', 0.8], shake: 11, sparks: 24, flash: 160, hitstop: 0.11 }),
    ],
    heavy: move({ anim: 'gs_heavy', dtype: 'slash', windup: 0.62, active: 0.16, recovery: 0.78, cancel: 0.55, stamina: 34, damage: 100, poise: 36,
                  hitbox: ['thrust', 190, 70], motion: ['overhead'], reach: 60, heft: 1.0, hyper: true,
                  sfx: ['whoosh_heavy', 1.0], haptic: ['heavy', 0.9], shake: 16, sparks: 30, flash: 200, hitstop: 0.13, thud: true }),
    charged: move({ anim: 'gs_charged', dtype: 'slash', windup: 0.18, active: 0.22, recovery: 0.8, cancel: 0.56, stamina: 42, damage: 140, poise: 54,
                    hitbox: ['arc', 230, 95], motion: ['swing', 120, -120], reach: 60, heft: 1.0,
                    hyper: true, sfx: ['whoosh_heavy', 1.0], haptic: ['heavy', 1.0],
                    shake: 18, sparks: 40, flash: 240, hitstop: 0.15, thud: true }),
    dodge: move({ anim: 'gs_dodge', dtype: 'slash', windup: 0.12, active: 0.14, recovery: 0.55, cancel: 0.40, stamina: 18, damage: 56, poise: 14,
                  hitbox: ['arc', 165, 50], motion: ['swing', 20, -20], reach: 50, heft: 0.6, sparks: 16, hitstop: 0.09, shake: 9 }),
  },
  spear: {
    // right hand on the butt end by the hip, left hand ahead on the shaft (handGap < 0: the left hand is in front)
    name: 'HOLLOW SPEAR', tex: 'spear', size: [150, 18], grip: 44, handGap: -16, glow: [70, 110, 12], speed: 1.0,
    stance: { hands: 2, rest: { off: -1.2, r: 9, elev: 44, point: 0.25, up: 0.05, sway: 1.5 },     // couched low, point forward
              move: { off: -1.3, r: 8, elev: 46, point: 0.55, up: 0.5 },                               // shaft carried high across the body
              dash: { off: -1.0, r: 10, elev: 40, point: 0.15, up: -0.1 } },                           // point leads the dash
    // reach and the point: fast, narrow, piercing; one sweeping cut with the shaft
    light: [
      move({ anim: 'sp_l1', dtype: 'stab', windup: 0.13, active: 0.08, recovery: 0.32, cancel: 0.20, stamina: 12, damage: 28, poise: 6,
             hitbox: ['thrust', 190, 30], motion: ['thrust'], reach: 78, shake: 5, sparks: 10, flash: 100, hitstop: 0.05 }),
      move({ anim: 'sp_l2', dtype: 'stab', windup: 0.12, active: 0.08, recovery: 0.34, cancel: 0.22, stamina: 12, damage: 30, poise: 6,
             hitbox: ['thrust', 205, 30], motion: ['thrust'], reach: 82, shake: 5, sparks: 10, flash: 100, hitstop: 0.05 }),
      move({ anim: 'sp_l3', dtype: 'slash', windup: 0.20, active: 0.16, recovery: 0.40, cancel: 0.28, stamina: 15, damage: 34, poise: 10,
             hitbox: ['arc', 180, 62], motion: ['swing', -70, 70], reach: 64, hitstop: 0.06, shake: 6 }),
    ],
    heavy: move({ anim: 'sp_heavy', dtype: 'stab', windup: 0.42, active: 0.14, recovery: 0.56, cancel: 0.38, stamina: 26, damage: 70, poise: 24,
                  hitbox: ['thrust', 265, 36], motion: ['thrust'], reach: 96, heft: 0.7,
                  sfx: ['whoosh_heavy', 1.0], haptic: ['medium', 0.9], shake: 11, sparks: 24, flash: 170, hitstop: 0.08 }),
    charged: move({ anim: 'sp_charged', dtype: 'stab', windup: 0.20, active: 0.16, recovery: 0.62, cancel: 0.44, stamina: 34, damage: 96, poise: 36,
                    hitbox: ['thrust', 220, 44], motion: ['thrust'], reach: 104, heft: 0.8,
                    hyper: true, sfx: ['whoosh_heavy', 1.0], haptic: ['heavy', 1.0],
                    shake: 15, sparks: 34, flash: 220, hitstop: 0.1, thud: true }),
    dodge: move({ anim: 'sp_dodge', dtype: 'stab', windup: 0.08, active: 0.10, recovery: 0.42, cancel: 0.28, stamina: 13, damage: 33, poise: 7,
                  hitbox: ['thrust', 215, 32], motion: ['thrust'], reach: 84, sparks: 12, hitstop: 0.05 }),
  },
};
const WEAPON_ORDER = ['oathsword', 'greatsword', 'spear'];
function weaponMoves(w) { return w.light.concat([w.heavy, w.charged, w.dodge]); }

const FLASK_MOVE = move({ windup: 0.62, active: 0.05, recovery: 0.32, cancel: 0.18, stamina: 0, damage: 0,
                          poise: 0, lunge: 0, hitbox: null, motion: ['rest'], slash: null, sfx: null, haptic: null });

// ---- build slot: Ember Pistol
const BULLETS_MAX = 10, BULLET_SPEED = 1100, BULLET_RANGE = 560, BULLET_DAMAGE = 18, BULLET_POISE = 3;
const PARRY_WINDOW = 0.35;
// tap: draw from the hip and fire (the draw is the wind-up); holding the button draws and aims first,
// so the release fires almost at once (GUN_MOVE_READY)
const GUN_MOVE = move({ windup: 0.15, active: 0.05, recovery: 0.28, cancel: 0.12, stamina: 8, damage: 0, poise: 0,
                        lunge: -160, hitbox: null, motion: ['rest'], slash: null, sfx: null, haptic: ['rigid', 0.5] });
const GUN_MOVE_READY = Object.assign({}, GUN_MOVE, { windup: 0.03 });
const GUN_AIM = { draw: 0.2, holster: 0.25, walk: 0.5 };      // seconds to draw / put away while held, walk speed while aiming

// ---- item slot
const ITEMS = {
  firebomb: { name: 'FIREBOMB', radius: 95, damage: 60, poise: 16, throw: 260, flight: 0.5, thrown: true },
};
const ITEM_STACK_MAX = 6;
const PICKUPS = [[[-430, -150], 'firebomb', 3], [[440, 330], 'firebomb', 3]];
const PICKUP_RADIUS = 38;
// chests (test room) and boss drops; each gives its items once per save
const CHESTS = [
  { id: 'chest_west', pos: [-400, -1470], items: ['greatsword', 'ember_ring'] },
  { id: 'chest_east', pos: [400, -1470], items: ['spear', 'crimson_locket'] },
];
const CHEST_REACH = 82, CHEST_RADIUS = 26, CHEST_OPEN_TIME = 0.5;
const BOSS_DROPS = { id: 'boss_sentinel', items: ['sentinel_helm', 'sentinel_plate', 'sentinel_sigil', 'oath_ring'] };
const THROW_MOVE = move({ windup: 0.18, active: 0.05, recovery: 0.30, cancel: 0.14, stamina: 8, damage: 0, poise: 0,
                          lunge: 0, hitbox: null, motion: ['rest'], slash: null, sfx: ['whoosh', 0.5],
                          haptic: ['light', 0.5] });

const INV_SAVE_KEY = 'nullrite.inventory.v1';
const PLAYER_MAX_HP = 100, HURT_TIME = 0.32, HURT_IFRAMES = 0.65, FLASK_CHARGES = 3, FLASK_HEAL = 45;

// ---- boss
const BOSS_MAX_HP = 1400, BOSS_POISE = 100, BOSS_RADIUS = 52, BOSS_SPEED = 105;
const POISE_REGEN = 14, POISE_DELAY = 3.0, STAGGER_TIME = 2.5, STAGGER_DMG_MULT = 1.5;
const BOSS_START = [0, 170], PLAYER_START = [0, -300];      // PLAYER_START: where a fight begins (tests / startFight(true))
// ---- the world: a shrine room (spawn) south, a path north, the boss arena (centred on 0,0)
const ROOMS = { arena: [-768, -768, 768, 768], path: [-130, -1200, 130, -720], shrine: [-576, -1920, 576, -1152] };   // walkable (x0, y0, x1, y1)
const PATH_FLOOR = [-130, -1152, 130, -768];                // the path's visible floor
const SPAWN = [0, -1690], SHRINE = [0, -1480];          // the shrine stands north of the sigil, between the chests
const BOSS_LAND = [0, -300];                             // where he comes down: close enough to see from the gate
const GATE = { x0: -130, x1: 130, y: -768, close: 0.55, open: 1.6 };
const FIGHT_TRIGGER_Y = -630;                              // walk this far into the arena and the gate seals
const BOSS_ENTER = { fall: 0.75, kneel: 1.6, rise: 3.0, height: 760 };
const RESPAWN_AT = 3.4;                                    // seconds after YOU DIED
const RAD = Math.PI / 180;
const BOSS_ATTACKS = {
  sweep: { windup: 0.85, track: 0.4, active: 0.22, recovery: 0.9, range: 250, half: 80 * RAD,
           damage: 28, knock: 260, want: 205, parry: true, impact: 18, dtype: 'slash' },
  slam:  { windup: 1.05, crouch: 0.3, active: 0.12, recovery: 1.1, radius: 230, hop: 170,
           damage: 36, knock: 360, want: 330, parry: false, impact: 32, dtype: 'crush' },
  lance: { windup: 1.12, lock: 0.8, recovery: 1.0, speed: 1500, max_dist: 680,
           damage: 32, knock: 320, want: 9999, parry: true, impact: 24, dtype: 'stab' },
};
// the Sentinel: plate over stone. Blades skate off it, a point finds the gaps, weight breaks it.
const BOSS_RESIST = { slash: 0.85, stab: 1.2, crush: 1.15, ranged: 0.8, magic: 1.1 };
// Phase 2 (below half HP): lance chains straight into a quicker sweep; slam sends out radial waves
BOSS_ATTACKS.sweep_follow = Object.assign({}, BOSS_ATTACKS.sweep, { windup: 0.52, track: 0.26, recovery: 1.05 });
const PHASE2_AT = 0.5;                       // fraction of boss HP
const PHASE_TIME = 2.0;                      // transition roar (boss can't be hurt)
const PHASE_PUSH = { radius: 560, knock: 640 };
// floor ripples: band = visible crest width, hit = how close to the crest centre you must be to get hit
const SLAM_WAVES = { count: 2, gap: 1.0, speed: 260, band: 34, hit: 10, lift: 13, start: 60, max_r: 1150, damage: 20, knock: 240 };
const PHASE2_IDLE = [0.3, 0.7];
const PLAYER_LAYER = { w: 340, h: 300, ox: 170, oy: 200 };   // offscreen box around the player (points); origin = feet
const DRONE_VOLUME = 0.22;

const DODGE_ROLL = { time: 0.32, speed: 1350, iframes: [0.03, 0.27], stamina: 22, ghost: 0.028 };
const SPRINT_EDGE = 1.2, SPRINT_MULT = 1.55, SPRINT_DRAIN = 10, SPRINT_MIN = 20;
// only three speeds: a light push on the stick walks, a full push runs, past the ring sprints (hysteresis on the edge)
const WALK_MULT = 0.28, RUN_EDGE = [0.5, 0.6];
const RALLY_GRACE = 1.0, RALLY_DECAY = 14, RALLY_RATIO = 0.35;
const VISCERAL_RANGE = 125, VISCERAL_ARC = 75 * RAD, VISCERAL_DAMAGE = 240;
const VISCERAL_MOVE = move({ windup: 0.22, active: 0.10, recovery: 0.55, cancel: 0.40, stamina: 0,
                             damage: VISCERAL_DAMAGE, poise: 0, lunge: 0, hitbox: ['thrust', 150, 80],
                             motion: ['thrust'], reach: 60, heft: 1.0, hyper: true, slash: ['thrust', 'crimson'],
                             sfx: ['whoosh_heavy', 1.0], haptic: ['heavy', 1.0], shake: 18, sparks: 50,
                             flash: 260, hitstop: 0.16, thud: true });

const CRIMSON = '#ff3048', RUNE_GOLD = '#b08a3e', RUNE_CRIMSON = '#d8243a';
const SPARK_COLORS = ['#ffffff', '#ffe7c2', '#ffb070', '#ff3048', '#ff5a6a'];

const S_IDLE = 'IDLE', S_MOVE = 'MOVE', S_WINDUP = 'WINDUP', S_ACTIVE = 'ACTIVE', S_RECOVERY = 'RECOVERY',
      S_DODGE = 'DODGE', S_HURT = 'HURT', S_DEAD = 'DEAD', S_STALK = 'STALK', S_STAGGERED = 'STAGGERED', S_PHASE = 'PHASE',
      S_ABSENT = 'ABSENT', S_ENTER = 'ENTER';

// 8-direction sprite views: five drawn, three mirrored
const VIEWS = ['S', 'SE', 'E', 'NE', 'N'];
const OCTANTS = [['E', 1], ['NE', 1], ['N', 1], ['NE', -1], ['E', -1], ['SE', -1], ['S', 1], ['SE', 1]];
const VISOR = { S: [0, 68, 1.0], SE: [5, 68.5, 0.72], E: [9, 69, 0.42], NE: null, N: null };
const SENTINEL_CORE_Y = 89;
const SENTINEL_CORE = { S: [0, 89, 1.0, true], SE: [6, 89, 0.85, true], E: [25, 92, 0.4, true],
                        NE: [-6, 89, 1.0, false], N: [0, 89, 1.0, false] };
const SENTINEL_VISOR = { S: [0, 133], SE: [7, 133], E: [16, 134], NE: null, N: null };
const SENTINEL_PLATES = { S: [1.0, 0], SE: [0.8, 6], E: [0.3, 0], NE: [0.8, -6], N: [1.0, 0] };
