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
  flash: 120, hitstop: HITSTOP, thud: false,
};
function move(kw) { return Object.assign({}, MOVE_DEFAULTS, kw); }

const SLASH_COLORS = { gold: '#ffe2b0', crimson: '#ff3048', white: '#fff4f0' };
const COMBO_WINDOW = 0.35;
const DODGE_ATTACK_WINDOW = 0.30;
const CHARGE_START = 0.20, CHARGE_FULL = 0.65, CHARGE_WALK = 0.45;

const WEAPONS = {
  greatsword: {
    name: 'OBSIDIAN GREATSWORD', tex: 'sword', size: [112, 28], grip: 12, handGap: 8, glow: [50, 96, 16], speed: 0.95,
    // stance: how this weapon is carried (angle offset from facing, distance, height, blade tilt: 1 upright, <0 tip down)
    // off = where the hands are (angle from facing), point = where the blade points (angle from facing)
    stance: { hands: 2, rest: { off: -0.55, r: 15, elev: 32, point: -0.35, up: -0.35, sway: 2.5 },  // low guard, tip forward-down
              move: { off: -0.9, r: 13, elev: 36, point: -1.2, up: 0.55 },                            // carried angled up across the body
              dash: { off: -(Math.PI - 0.6), r: 18, elev: 26, point: -(Math.PI - 0.25), up: -0.35 } },   // dragged low behind, right side
    light: [
      move({ windup: 0.11, active: 0.10, recovery: 0.24, damage: 38, poise: 7, lunge: 340,
             hitbox: ['arc', 140, 55], motion: ['swing', 75, -75] }),
      move({ windup: 0.10, active: 0.10, recovery: 0.26, damage: 40, poise: 8, lunge: 320,
             hitbox: ['arc', 145, 58], motion: ['swing', -80, 80], reach: 48 }),
      move({ windup: 0.20, active: 0.12, recovery: 0.38, cancel: 0.16, stamina: 18, damage: 58, poise: 16,
             lunge: 420, hitbox: ['thrust', 175, 74], motion: ['overhead'], reach: 60, heft: 0.6,
             slash: ['slam', 'gold'], sfx: ['whoosh_heavy', 0.8], haptic: ['medium', 0.8], shake: 9,
             sparks: 20, flash: 150 }),
    ],
    heavy: move({ windup: 0.40, active: 0.14, recovery: 0.46, cancel: 0.20, stamina: 32, damage: 92, poise: 34,
                  lunge: 540, hitbox: ['arc', 215, 70], motion: ['swing', 100, -100], reach: 54, heft: 1.0,
                  slash: ['arc', 'crimson'], sfx: ['whoosh_heavy', 1.0], haptic: ['medium', 0.9], shake: 14,
                  sparks: 30, flash: 200, thud: true }),
    charged: move({ windup: 0.16, active: 0.16, recovery: 0.50, cancel: 0.24, stamina: 40, damage: 135, poise: 52,
                    lunge: 620, hitbox: ['arc', 240, 90], motion: ['swing', 120, -120], reach: 60, heft: 1.0,
                    hyper: true, slash: ['arc', 'white'], sfx: ['whoosh_heavy', 1.0], haptic: ['heavy', 1.0],
                    shake: 18, sparks: 40, flash: 240, hitstop: 0.08, thud: true }),
    dodge: move({ windup: 0.06, active: 0.14, recovery: 0.26, cancel: 0.10, stamina: 16, damage: 34, poise: 8,
                  lunge: 220, hitbox: ['ring', 125], motion: ['swing', 170, -170], reach: 50, sparks: 16 }),
  },
  spear: {
    name: 'HOLLOW SPEAR', tex: 'spear', size: [150, 18], grip: 44, handGap: 22, glow: [70, 110, 12], speed: 1.05,
    stance: { hands: 2, rest: { off: -0.35, r: 14, elev: 42, point: -0.05, up: -0.05, sway: 1.5 },   // couched at the chest, point forward
              move: { off: -0.8, r: 12, elev: 46, point: -0.6, up: 0.7 },                              // shaft high and diagonal
              dash: { off: -0.2, r: 16, elev: 38, point: 0, up: -0.12 } },                             // point leads the dash
    light: [
      move({ windup: 0.09, active: 0.08, recovery: 0.20, cancel: 0.07, stamina: 11, damage: 30, poise: 5,
             lunge: 380, hitbox: ['thrust', 190, 34], motion: ['thrust'], reach: 78, slash: ['thrust', 'gold'],
             shake: 5, sparks: 10, flash: 100 }),
      move({ windup: 0.08, active: 0.08, recovery: 0.20, cancel: 0.07, stamina: 11, damage: 31, poise: 5,
             lunge: 400, hitbox: ['thrust', 200, 34], motion: ['thrust'], reach: 82, slash: ['thrust', 'gold'],
             shake: 5, sparks: 10, flash: 100 }),
      move({ windup: 0.12, active: 0.12, recovery: 0.30, cancel: 0.12, stamina: 15, damage: 36, poise: 9,
             lunge: 260, hitbox: ['arc', 175, 60], motion: ['swing', -70, 70], reach: 64 }),
    ],
    heavy: move({ windup: 0.32, active: 0.16, recovery: 0.42, cancel: 0.18, stamina: 28, damage: 72, poise: 22,
                  lunge: 900, hitbox: ['thrust', 260, 40], motion: ['thrust'], reach: 96, heft: 0.7,
                  slash: ['thrust', 'crimson'], sfx: ['whoosh_heavy', 1.0], haptic: ['medium', 0.9], shake: 11,
                  sparks: 24, flash: 170 }),
    charged: move({ windup: 0.12, active: 0.18, recovery: 0.46, cancel: 0.22, stamina: 36, damage: 108, poise: 36,
                    lunge: 1150, hitbox: ['thrust', 310, 46], motion: ['thrust'], reach: 104, heft: 0.8,
                    hyper: true, slash: ['thrust', 'white'], sfx: ['whoosh_heavy', 1.0], haptic: ['heavy', 1.0],
                    shake: 16, sparks: 34, flash: 220, hitstop: 0.08, thud: true }),
    dodge: move({ windup: 0.05, active: 0.10, recovery: 0.22, cancel: 0.08, stamina: 13, damage: 33, poise: 6,
                  lunge: 760, hitbox: ['thrust', 210, 36], motion: ['thrust'], reach: 84,
                  slash: ['thrust', 'gold'], sparks: 12 }),
  },
};
const WEAPON_ORDER = ['greatsword', 'spear'];
function weaponMoves(w) { return w.light.concat([w.heavy, w.charged, w.dodge]); }

const FLASK_MOVE = move({ windup: 0.62, active: 0.05, recovery: 0.32, cancel: 0.18, stamina: 0, damage: 0,
                          poise: 0, lunge: 0, hitbox: null, motion: ['rest'], slash: null, sfx: null, haptic: null });

// ---- build slot: Ember Pistol
const BULLETS_MAX = 10, BULLET_SPEED = 1100, BULLET_RANGE = 560, BULLET_DAMAGE = 18, BULLET_POISE = 3;
const PARRY_WINDOW = 0.35;
const GUN_MOVE = move({ windup: 0.07, active: 0.05, recovery: 0.24, cancel: 0.12, stamina: 8, damage: 0, poise: 0,
                        lunge: -160, hitbox: null, motion: ['rest'], slash: null, sfx: null, haptic: ['rigid', 0.5] });

// ---- item slot
const ITEMS = {
  firebomb: { name: 'FIREBOMB', radius: 95, damage: 60, poise: 16, throw: 260, flight: 0.5, thrown: true },
};
const ITEM_STACK_MAX = 6;
const PICKUPS = [[[-430, -150], 'firebomb', 3], [[440, 330], 'firebomb', 3]];
const PICKUP_RADIUS = 38;
const THROW_MOVE = move({ windup: 0.18, active: 0.05, recovery: 0.30, cancel: 0.14, stamina: 8, damage: 0, poise: 0,
                          lunge: 0, hitbox: null, motion: ['rest'], slash: null, sfx: ['whoosh', 0.5],
                          haptic: ['light', 0.5] });

const PLAYER_MAX_HP = 100, HURT_TIME = 0.32, HURT_IFRAMES = 0.65, FLASK_CHARGES = 3, FLASK_HEAL = 45;

// ---- boss
const BOSS_MAX_HP = 1400, BOSS_POISE = 100, BOSS_RADIUS = 52, BOSS_SPEED = 105;
const POISE_REGEN = 14, POISE_DELAY = 3.0, STAGGER_TIME = 2.5, STAGGER_DMG_MULT = 1.5;
const BOSS_START = [0, 170], PLAYER_START = [0, -300];
const RAD = Math.PI / 180;
const BOSS_ATTACKS = {
  sweep: { windup: 0.85, track: 0.4, active: 0.22, recovery: 0.9, range: 250, half: 80 * RAD,
           damage: 28, knock: 260, want: 205, parry: true },
  slam:  { windup: 1.05, crouch: 0.3, active: 0.12, recovery: 1.1, radius: 230, hop: 170,
           damage: 36, knock: 360, want: 330, parry: false },
  lance: { windup: 1.12, lock: 0.8, recovery: 1.0, speed: 1500, max_dist: 680,
           damage: 32, knock: 320, want: 9999, parry: true },
};
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
      S_DODGE = 'DODGE', S_HURT = 'HURT', S_DEAD = 'DEAD', S_STALK = 'STALK', S_STAGGERED = 'STAGGERED', S_PHASE = 'PHASE';

// 8-direction sprite views: five drawn, three mirrored
const VIEWS = ['S', 'SE', 'E', 'NE', 'N'];
const OCTANTS = [['E', 1], ['NE', 1], ['N', 1], ['NE', -1], ['E', -1], ['SE', -1], ['S', 1], ['SE', 1]];
const VISOR = { S: [0, 68, 1.0], SE: [5, 68.5, 0.72], E: [9, 69, 0.42], NE: null, N: null };
const SENTINEL_CORE_Y = 89;
const SENTINEL_CORE = { S: [0, 89, 1.0, true], SE: [6, 89, 0.85, true], E: [25, 92, 0.4, true],
                        NE: [-6, 89, 1.0, false], N: [0, 89, 1.0, false] };
const SENTINEL_VISOR = { S: [0, 133], SE: [7, 133], E: [16, 134], NE: null, N: null };
const SENTINEL_PLATES = { S: [1.0, 0], SE: [0.8, 6], E: [0.3, 0], NE: [0.8, -6], N: [1.0, 0] };
