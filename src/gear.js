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
};
const STARTER_GEAR = { head: 'hunter_hood', chest: 'hunter_coat', back: 'hunter_cloak', hands: 'hunter_gauntlets',
  legs: 'hunter_greaves', feet: 'hunter_boots', right: 'greatsword', left: 'pistol', necklace: null, ring: null };

// rig part -> which picture family it uses ('L'/'R' parts share one segment picture)
const PART_ART = { thighL: 'thigh', thighR: 'thigh', shinL: 'shin', shinR: 'shin', footL: 'foot', footR: 'foot',
  upperL: 'upper', upperR: 'upper', foreL: 'fore', foreR: 'fore', handL: 'hand', handR: 'hand',
  pelvis: 'pelvis', torso: 'torso', head: 'head', cape: 'cape', tabard: 'tabard' };
const RIG_DIRS = 16;                         // view pictures are baked for 16 facing directions
