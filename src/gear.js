// ============================================================ GEAR (wearable pieces, data only)
// Slots: head, chest, legs, hands, feet, back (cape), right (main weapon), left (off-hand),
// necklace + ring (not drawn; build modifiers). Visible pieces name the rig parts they draw on;
// their pictures are baked in gearart.js. Stats are used by the gear system (later step).
const GEAR_SLOTS = ['legs', 'feet', 'chest', 'hands', 'head', 'back'];      // also the draw order on a shared part

const GEAR = {
  hunter_hood:      { slot: 'head',  name: 'HUNTER HOOD',      defense: 3, poise: 1, weight: 1.5, parts: ['head'], visor: true },
  hunter_coat:      { slot: 'chest', name: 'HUNTER COAT',      defense: 9, poise: 5, weight: 6.0, parts: ['torso', 'pelvis', 'upperL', 'upperR'],
    cloths: { tabard: { kind: 'front', cols: 4, rows: 6, top: 5.5, length: 27, topA: 3.4, botA: 4.3, topB: 6.4, botB: 7.2,
              outer: '#3d0f18', outerL: '#7a2232', lining: '#12060a', hem: 'rgba(176,138,62,1)', tatter: [1.6, 0, 1.0], weight: 1.1, stiff: 0.02 } } },
  hunter_cloak:     { slot: 'back',  name: 'TATTERED CLOAK',   defense: 1, poise: 0, weight: 1.0, parts: ['cape'],
    cloths: { cape: { kind: 'back', length: 47, topA: 12.8, topB: 6.2, botA: 16, botB: 9, outer: '#0b0a0f', outerL: '#26222f', lining: '#2a0d14',
             hem: '#8A2432', tatter: [3.5, 0, 1.8], weight: 1.0 } } },
  hunter_gauntlets: { slot: 'hands', name: 'HUNTER GAUNTLETS', defense: 3, poise: 1, weight: 1.5, parts: ['foreL', 'foreR', 'handL', 'handR'] },
  hunter_greaves:   { slot: 'legs',  name: 'HUNTER GREAVES',   defense: 5, poise: 3, weight: 3.5, parts: ['thighL', 'thighR', 'shinL', 'shinR'] },
  hunter_boots:     { slot: 'feet',  name: 'HUNTER BOOTS',     defense: 2, poise: 1, weight: 1.5, parts: ['footL', 'footR', 'shinL', 'shinR'] },
  // dropped by the Obsidian Sentinel
  sentinel_helm:    { slot: 'head',  name: 'SENTINEL HELM',    defense: 8, poise: 5, weight: 7.0, parts: ['head'], visor: true },
  sentinel_plate:   { slot: 'chest', name: 'SENTINEL PLATE',   defense: 17, poise: 14, weight: 18.0, parts: ['torso', 'pelvis', 'upperL', 'upperR'] },
};
const GEAR_LORE = {
  hunter_hood: 'A hood of waxed cloth over a mask of black iron. The slit lets through only what must be seen.',
  hunter_coat: 'Long coat of the oathbound hunters, plated at the chest. The crimson tabard marks one who has not yet broken faith.',
  hunter_cloak: 'Worn to rags on the long road. It has outlasted every hunter who wore it before.',
  hunter_gauntlets: 'Leather and iron, stiff with old blood. Steady enough for a blade, light enough for a pistol.',
  hunter_greaves: 'Iron over the shins, cloth above. Made for long marches more than long fights.',
  hunter_boots: 'Hobnailed boots that bite into stone. Quiet, as hunters must be.',
  sentinel_helm: 'The horned helm of the Obsidian Sentinel. Its visor still burns faintly, as though it remembers the oath it was forged to keep.',
  sentinel_plate: 'Obsidian plate grown, not forged. The cold core in its chest beats once, slowly, when danger is near.',
};

// rig part -> which picture family it uses ('L'/'R' parts share one segment picture)
const PART_ART = { thighL: 'thigh', thighR: 'thigh', shinL: 'shin', shinR: 'shin', footL: 'foot', footR: 'foot',
  upperL: 'upper', upperR: 'upper', foreL: 'fore', foreR: 'fore', handL: 'hand', handR: 'hand',
  pelvis: 'pelvis', torso: 'torso', head: 'head', cape: 'cape', tabard: 'tabard' };
const RIG_DIRS = 16;                         // view pictures are baked for 16 facing directions

// ============================================================ ITEMS, INVENTORY, EQUIP RULES
// Everything the player can own. Armour comes from GEAR (above); weapons and talismans are listed here.
// Hand rules: any weapon may go in either hand, except shields (left only) and two-handed weapons, which
// lock the left hand (held with both hands). `allowed` lists the hands a weapon has animations for so far.
const EQUIP_SLOTS = ['right', 'left', 'head', 'chest', 'hands', 'legs', 'feet', 'back', 'necklace', 'ring'];
const ARMOR_SLOTS = ['head', 'chest', 'hands', 'legs', 'feet', 'back'];
const WEAPON_ITEMS = {
  oathsword:  { name: 'OATHBOUND SWORD', weapon: 'oathsword', hands: '1h', family: 'melee', allowed: ['right'], weight: 3.5, icon: 'sword',
    lore: 'A plain straight sword given to every hunter who swears the oath. Quick in the hand; it asks for nerve, not strength.' },
  greatsword: { name: 'OBSIDIAN GREATSWORD', weapon: 'greatsword', hands: '2h', family: 'melee', allowed: ['right'], weight: 14, icon: 'greatsword',
    lore: 'A slab of obsidian with a crimson vein along its fuller. Too heavy for one hand; every swing commits the whole body.' },
  spear:      { name: 'HOLLOW SPEAR', weapon: 'spear', hands: '2h', family: 'melee', allowed: ['right'], weight: 9, icon: 'spear',
    lore: 'Its shaft is hollow, its point is not. Keeps the danger at arm and a half.' },
  pistol:     { name: 'EMBER PISTOL', weapon: null, hands: '1h', family: 'gun', allowed: ['left'], weight: 2.5, icon: 'pistol',
    lore: 'Obsidian flintlock loaded with ember shot. Weak against flesh, but a shot timed to the swing can break a stance.' },
};
const TALISMANS = {
  ember_ring:     { slot: 'ring', name: 'EMBER RING', mods: { regen: 0.15 }, effect: 'Stamina recovers 15% faster', icon: 'ring',
    lore: 'A band of black iron set with a coal that never cools. The wearer breathes easier in the heat of a fight.' },
  oath_ring:      { slot: 'ring', name: 'RING OF THE HOLLOW OATH', mods: { load: 15 }, effect: 'Equip load +15', icon: 'ring',
    lore: 'Taken from the Sentinel. An oath with nothing left inside it weighs nothing at all.' },
  crimson_locket: { slot: 'necklace', name: 'CRIMSON LOCKET', mods: { hp: 15 }, effect: 'Max HP +15', icon: 'necklace',
    lore: 'A locket holding a dried crimson petal. Its owner swore to come home; the locket did.' },
  sentinel_sigil: { slot: 'necklace', name: "SENTINEL'S SIGIL", mods: { poise: 10 }, effect: 'Poise +10', icon: 'necklace',
    lore: 'The Sentinel wore this beneath its plate. Whoever carries it stands a little more like a wall.' },
};
const ITEM_DB = {};
for (const id in GEAR) ITEM_DB[id] = Object.assign({ cat: 'armor', icon: GEAR[id].slot, lore: GEAR_LORE[id] || '' }, GEAR[id]);
for (const id in WEAPON_ITEMS) ITEM_DB[id] = Object.assign({ cat: 'weapon' }, WEAPON_ITEMS[id]);
for (const id in TALISMANS) ITEM_DB[id] = Object.assign({ cat: 'talisman', weight: 0.5 }, TALISMANS[id]);

const STARTER_ITEMS = ['hunter_hood', 'hunter_coat', 'hunter_cloak', 'hunter_gauntlets', 'hunter_greaves', 'hunter_boots', 'oathsword', 'pistol'];
const STARTER_EQUIP = { right: 'oathsword', left: 'pistol', head: 'hunter_hood', chest: 'hunter_coat', hands: 'hunter_gauntlets',
  legs: 'hunter_greaves', feet: 'hunter_boots', back: 'hunter_cloak', necklace: null, ring: null };

// equip load: total weight / max load picks a tier; heavier = slower, shorter dash and slower stamina
const LOAD_BASE = 72;
const LOAD_TIERS = [
  { max: 0.30, name: 'LIGHT',      dashSpeed: 1.00, dashTime: 1.00, regen: 1.00, walk: 1.00 },
  { max: 0.70, name: 'MEDIUM',     dashSpeed: 0.92, dashTime: 1.00, regen: 0.92, walk: 1.00 },
  { max: 1.00, name: 'HEAVY',      dashSpeed: 0.80, dashTime: 1.06, regen: 0.80, walk: 0.94 },
  { max: 1e9,  name: 'OVERLOADED', dashSpeed: 0.58, dashTime: 1.15, regen: 0.65, walk: 0.80 },
];
const DEF_REF = 23, DEF_K = 60;          // damage taken x1 at the hunter set's defence; more defence = less damage

/** Stats from an equipment map (slot -> id). */
function deriveStats(eq) {
  let defense = 0, poise = 0, weight = 0;
  const mods = { regen: 0, load: 0, hp: 0, poise: 0 };
  for (const slot of EQUIP_SLOTS) {
    const d = eq[slot] && ITEM_DB[eq[slot]];
    if (!d) continue;
    weight += d.weight || 0;
    if (d.cat === 'armor') { defense += d.defense; poise += d.poise; }
    if (d.mods) for (const k in d.mods) mods[k] += d.mods[k];
  }
  poise += mods.poise;
  const maxLoad = LOAD_BASE + mods.load, ratio = weight / maxLoad;
  const tier = LOAD_TIERS.find(t => ratio <= t.max);
  return { defense, poise, weight, maxLoad, ratio, tier, dmgTaken: (DEF_REF + DEF_K) / (defense + DEF_K),
    maxHp: PLAYER_MAX_HP + mods.hp, regen: tier.regen * (1 + mods.regen) };
}

class Inventory {
  constructor() { this.items = {}; this.eq = {}; this.seen = {}; this.flags = {}; this.reset(); }
  reset() {
    this.items = {}; for (const id of STARTER_ITEMS) this.items[id] = 1;
    this.eq = Object.assign({}, STARTER_EQUIP); this.seen = {}; this.flags = {};
  }
  static load() {
    const inv = new Inventory();
    try {
      const raw = typeof localStorage !== 'undefined' && localStorage.getItem(INV_SAVE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        inv.items = {}; for (const id in d.items) if (ITEM_DB[id]) inv.items[id] = d.items[id];
        for (const slot of EQUIP_SLOTS) inv.eq[slot] = d.eq && ITEM_DB[d.eq[slot]] ? d.eq[slot] : (slot === 'right' ? 'oathsword' : null);
        inv.seen = d.seen || {}; inv.flags = d.flags || {};
        if (!inv.items.oathsword) inv.items.oathsword = 1;
      }
    } catch (e) { /* storage unavailable: play without saving */ }
    return inv;
  }
  save() {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(INV_SAVE_KEY, JSON.stringify({ items: this.items, eq: this.eq, seen: this.seen, flags: this.flags })); }
    catch (e) { /* ignore */ }
  }
  has(id) { return (this.items[id] || 0) > 0; }
  add(id, n) { if (!ITEM_DB[id]) return false; this.items[id] = (this.items[id] || 0) + (n || 1); this.save(); return true; }
  /** Can this item go in this slot at all? (hand rules for weapons) */
  fits(id, slot) {
    const d = ITEM_DB[id]; if (!d) return false;
    if (d.cat === 'weapon') {
      if (slot !== 'right' && slot !== 'left') return false;
      if (d.hands === '2h' && slot !== 'right') return false;
      if (d.hands === 'shield' && slot !== 'left') return false;
      return d.allowed.indexOf(slot) >= 0;
    }
    return d.slot === slot;
  }
  /** Owned copies not already equipped in another slot. */
  free(id, slot) { let n = this.items[id] || 0; for (const s of EQUIP_SLOTS) if (s !== slot && this.eq[s] === id) n--; return n; }
  candidates(slot) { return Object.keys(this.items).filter(id => this.has(id) && this.fits(id, slot)); }
  leftLocked() { const r = ITEM_DB[this.eq.right]; return !!r && r.hands === '2h'; }
  /** Equip (or empty with id = null). The right hand can't be empty yet (no unarmed moveset). */
  equip(slot, id) {
    if (EQUIP_SLOTS.indexOf(slot) < 0) return false;
    if (id === null) { if (slot === 'right') return false; this.eq[slot] = null; this.save(); return true; }
    if (!this.fits(id, slot) || this.free(id, slot) <= 0) return false;
    this.eq[slot] = id; this.save(); return true;
  }
}
