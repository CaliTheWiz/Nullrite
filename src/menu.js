// ============================================================ EQUIPMENT SCREEN (Souls-style, touch)
// Three columns: the ten equipment slots, the owned items that fit the selected slot, and a detail panel
// (stats, comparison with what is worn, lore, and the totals: HP, damage taken, poise, equip load).
// Tapping an item equips it. The fight does not pause. Drawn in CSS pixels, origin top-left.

const MENU_SLOTS = [
  ['right', 'R. HAND', 'sword'], ['left', 'L. HAND', 'pistol'], ['head', 'HEAD', 'head'], ['chest', 'CHEST', 'chest'],
  ['hands', 'HANDS', 'hands'], ['legs', 'LEGS', 'legs'], ['feet', 'FEET', 'feet'], ['back', 'BACK', 'back'],
  ['necklace', 'AMULET', 'necklace'], ['ring', 'RING', 'ring'],
];
const SLOT_TITLE = { right: 'RIGHT HAND', left: 'LEFT HAND', head: 'HEAD', chest: 'CHEST', hands: 'HANDS', legs: 'LEGS', feet: 'FEET',
  back: 'BACK', necklace: 'AMULET', ring: 'RING' };
const WEAPON_KIND = { oathsword: 'Straight Sword', greatsword: 'Greatsword', spear: 'Spear', pistol: 'Firearm' };
const MENU_COL = { gold: '#d9b45c', goldD: 'rgba(176,138,61,0.55)', text: '#e8dcc4', dim: '#8f8574', lore: '#b3a68c',
  panel: 'rgba(10,9,13,0.9)', up: '#8fd07a', down: '#e0606a', crimson: '#ff3048' };

/** Item and slot icons, drawn as simple vector shapes in a 2x2 box around (cx, cy). */
function drawItemIcon(c, name, cx, cy, size, col, alpha) {
  c.save(); c.translate(cx, cy); const k = size / 2; c.scale(k, k);
  c.globalAlpha = alpha === undefined ? 1 : alpha; c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1.6 / k * 1.2;
  c.lineJoin = 'round'; c.lineCap = 'round';
  const P = (pts, fill) => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); fill ? c.fill() : c.stroke(); };
  const L = (pts) => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.stroke(); };
  switch (name) {
    case 'head': P([[-0.55, 0.75], [-0.62, -0.1], [-0.3, -0.7], [0, -0.85], [0.3, -0.7], [0.62, -0.1], [0.55, 0.75]]);
      c.fillRect(-0.4, -0.12, 0.8, 0.14); break;
    case 'chest': P([[-0.8, -0.65], [-0.3, -0.75], [0, -0.55], [0.3, -0.75], [0.8, -0.65], [0.62, 0.05], [0.5, 0.8], [-0.5, 0.8], [-0.62, 0.05]]);
      P([[0, -0.15], [0.14, 0.05], [0, 0.25], [-0.14, 0.05]], true); break;
    case 'hands': P([[-0.45, 0.85], [-0.5, -0.1], [-0.35, -0.75], [0.1, -0.8], [0.45, -0.45], [0.55, 0.1], [0.4, 0.85]]);
      L([[-0.5, 0.35], [0.5, 0.35]]); break;
    case 'legs': P([[-0.55, -0.8], [0.55, -0.8], [0.5, 0.85], [0.12, 0.85], [0, -0.1], [-0.12, 0.85], [-0.5, 0.85]]); break;
    case 'feet': P([[-0.35, -0.85], [0.15, -0.85], [0.15, 0.2], [0.8, 0.45], [0.8, 0.8], [-0.4, 0.8]]); break;
    case 'back': P([[-0.3, -0.85], [0.3, -0.85], [0.75, 0.85], [0.35, 0.65], [0, 0.85], [-0.35, 0.65], [-0.75, 0.85]]); break;
    case 'sword': L([[-0.6, 0.6], [0.7, -0.7]]); L([[-0.62, 0.22], [-0.22, 0.62]]); L([[-0.6, 0.6], [-0.8, 0.8]]); break;
    case 'greatsword': c.lineWidth *= 1.9; L([[-0.5, 0.5], [0.75, -0.75]]); c.lineWidth /= 1.9; L([[-0.72, 0.12], [-0.12, 0.72]]); L([[-0.5, 0.5], [-0.82, 0.82]]); break;
    case 'spear': L([[-0.85, 0.85], [0.55, -0.55]]); P([[0.45, -0.75], [0.85, -0.85], [0.75, -0.45]], true); break;
    case 'pistol': P([[-0.8, -0.35], [0.8, -0.35], [0.8, -0.05], [-0.2, -0.05], [-0.35, 0.75], [-0.75, 0.75], [-0.55, -0.05], [-0.8, -0.05]]); break;
    case 'ring': c.beginPath(); c.ellipse(0, 0.15, 0.55, 0.55, 0, 0, TAU); c.stroke(); P([[0, -0.75], [0.25, -0.45], [0, -0.2], [-0.25, -0.45]], true); break;
    case 'necklace': c.beginPath(); c.ellipse(0, -0.25, 0.7, 0.55, 0, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
      P([[0, 0.25], [0.28, 0.55], [0, 0.88], [-0.28, 0.55]], true); break;
    case 'lock': c.beginPath(); c.arc(0, -0.15, 0.38, Math.PI, 0); c.stroke(); c.fillRect(-0.55, -0.15, 1.1, 0.9); break;
  }
  c.restore();
}

class EquipMenu {
  constructor(game) { this.g = game; this.open = false; this.tab = 'equip'; this.slot = 'right'; this.focus = null; this.msg = ''; this.msg_t = 0; this.hold = null; this.rects = []; this.confirm = 0; }
  toggle() { if (this.open) this.close(); else this.show(); }
  show() { this.open = true; this.confirm = 0; this.pick(this.slot); }
  close() { this.open = false; this.hold = null; }
  pick(slot) {
    const inv = this.g.inv; this.slot = slot; this.focus = inv.eq[slot] || null;
    let changed = false; for (const id of inv.candidates(slot)) if (!inv.seen[id]) { inv.seen[id] = 1; changed = true; }
    if (changed) inv.save();
  }
  hasUnseen() { const inv = this.g.inv; return Object.keys(inv.items).some(id => inv.has(id) && !inv.seen[id] && STARTER_ITEMS.indexOf(id) < 0); }
  unseenIn(slot) { const inv = this.g.inv; return inv.candidates(slot).some(id => !inv.seen[id] && STARTER_ITEMS.indexOf(id) < 0); }
  say(m) { this.msg = m; this.msg_t = 1.6; }
  update(dt) {
    if (this.msg_t > 0) this.msg_t -= dt;
    if (this.confirm > 0) this.confirm -= dt;
    if (this.hold && this.g.t - this.hold.t0 >= 1.2) {                  // reset progress (held)
      const inv = this.g.inv; inv.reset(); inv.flags = {}; inv.save(); this.g.player.applyLoadout(); this.hold = null; this.pick('right');
      this.say('PROGRESS RESET'); this.g.sfx('thud', 0.6);
    }
  }
  /** Touch down at CSS pixel (x, y) from the top-left. */
  touchStart(id, x, y) {
    for (const r of this.rects) {
      if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
      if (r.kind === 'close') { this.close(); this.g.sfx('ready', 0.25); return; }
      if (r.kind === 'tab') { this.tab = r.tab; this.confirm = 0; this.g.sfx('ready', 0.2); return; }
      if (r.kind === 'retry') {
        if (this.confirm <= 0) { this.confirm = 3; this.g.sfx('ready', 0.2); return; }      // tap twice: it ends the current fight
        this.confirm = 0; this.close(); this.g.retryBoss(); return;
      }
      if (r.kind === 'slot') { this.pick(r.slot); this.g.sfx('ready', 0.2); return; }
      if (r.kind === 'reset') { this.hold = { id, t0: this.g.t }; return; }
      if (r.kind === 'quit') { if (this.onQuit) this.onQuit(); return; }
      if (r.kind === 'item') {
        const inv = this.g.inv;
        if (this.focus !== r.id) { this.focus = r.id; this.g.sfx('ready', 0.15); return; }     // first tap: preview + compare
        if (inv.eq[this.slot] === r.id) return;                                                   // second tap: equip
        if (this.slot === 'left' && inv.leftLocked() && r.id !== null) { this.say('LEFT HAND HELD BY A TWO-HANDED WEAPON'); }
        if (!this.g.equip(this.slot, r.id)) this.say(this.g.player.state === S_IDLE || this.g.player.state === S_MOVE ? "CAN'T EQUIP THAT HERE" : "CAN'T CHANGE EQUIPMENT NOW");
        return;
      }
    }
  }
  touchEnd(id) { if (this.hold && this.hold.id === id) this.hold = null; }

  // ------------------------------------------------------------ drawing
  draw(R) {
    const c = R.ctx, W = R.W, H = R.H, inv = this.g.inv, p = this.g.player;
    R.base(); this.rects = [];
    c.fillStyle = 'rgba(3,3,5,0.9)'; c.fillRect(0, 0, W, H);
    const sx = HUD.SAFE_X, top = HUD.TOP + 10, bot = H - 12;
    // header: tabs + close
    let tx = sx;
    for (const [tab, label] of [['equip', 'EQUIPMENT'], ['system', 'SYSTEM']]) {
      const on = this.tab === tab; c.font = `bold ${on ? 17 : 13}px Georgia, serif`; const tw = c.measureText(label).width;
      this.serif(c, label, tx, top + 14, on ? 17 : 13, on ? MENU_COL.gold : MENU_COL.dim, 'left');
      if (on) { c.fillStyle = MENU_COL.goldD; c.fillRect(tx, top + 26, tw, 1.2); }
      this.rects.push({ kind: 'tab', tab, x: tx - 6, y: top - 6, w: tw + 12, h: 36 }); tx += tw + 26;
    }
    const cx = W - sx - 18, cy = top + 14;
    c.strokeStyle = MENU_COL.goldD; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, 15, 0, TAU); c.stroke();
    c.strokeStyle = MENU_COL.text; c.lineWidth = 1.6; c.beginPath(); c.moveTo(cx - 5, cy - 5); c.lineTo(cx + 5, cy + 5); c.moveTo(cx + 5, cy - 5); c.lineTo(cx - 5, cy + 5); c.stroke();
    this.rects.push({ kind: 'close', x: cx - 24, y: cy - 22, w: 48, h: 44 });
    const y0 = top + 34;
    if (this.tab === 'system') { this.drawSystem(c, sx, y0, W - 2 * sx, bot); return; }
    const ts = Math.min(52, Math.floor((bot - y0 - 4 * 5) / 5)), gap = 5;
    // ---- column A: slots (2 x 5)
    MENU_SLOTS.forEach(([slot, label, glyph], i) => {
      const col = i % 2, row = (i / 2) | 0, x = sx + col * (ts + gap), y = y0 + row * (ts + gap), sel = slot === this.slot;
      this.panel(c, x, y, ts, ts, sel);
      const id = inv.eq[slot], locked = slot === 'left' && inv.leftLocked();
      if (locked) drawItemIcon(c, 'lock', x + ts / 2, y + ts / 2 - 5, ts * 0.42, MENU_COL.dim, 0.9);
      else if (id) drawItemIcon(c, ITEM_DB[id].icon, x + ts / 2, y + ts / 2 - 5, ts * 0.5, sel ? MENU_COL.gold : MENU_COL.text, 0.95);
      else drawItemIcon(c, glyph, x + ts / 2, y + ts / 2 - 5, ts * 0.46, MENU_COL.dim, 0.35);
      this.text(c, label, x + ts / 2, y + ts - 7, 7, sel ? MENU_COL.gold : MENU_COL.dim, 'center');
      if (this.unseenIn(slot)) { c.fillStyle = MENU_COL.crimson; c.beginPath(); c.arc(x + ts - 6, y + 6, 3, 0, TAU); c.fill(); }
      this.rects.push({ kind: 'slot', slot, x, y, w: ts, h: ts });
    });
    // ---- column B: items for this slot
    const bx = sx + 2 * ts + gap + 14, bw = Math.min(230, (W - 2 * sx) * 0.32), by = y0;
    this.text(c, SLOT_TITLE[this.slot], bx, by + 6, 9, MENU_COL.gold, 'left');
    const list = inv.candidates(this.slot);
    list.sort((a, b) => (ITEM_DB[a].name < ITEM_DB[b].name ? -1 : 1));
    if (this.slot !== 'right') list.push(null);
    const rh = 34;
    list.forEach((id, i) => {
      const y = by + 16 + i * (rh + 4), worn = inv.eq[this.slot] === id, foc = this.focus === id;
      if (y + rh > bot) return;
      this.panel(c, bx, y, bw, rh, foc, worn);
      if (id) {
        drawItemIcon(c, ITEM_DB[id].icon, bx + 18, y + rh / 2, 22, worn ? MENU_COL.gold : MENU_COL.text, 0.95);
        this.text(c, ITEM_DB[id].name, bx + 36, y + rh / 2 + 1, 9, worn ? MENU_COL.gold : MENU_COL.text, 'left');
        if (!inv.seen[id] && STARTER_ITEMS.indexOf(id) < 0) { c.fillStyle = MENU_COL.crimson; c.beginPath(); c.arc(bx + bw - 22, y + rh / 2, 3, 0, TAU); c.fill(); }
      } else this.text(c, '— NOTHING —', bx + 36, y + rh / 2 + 1, 9, MENU_COL.dim, 'left');
      if (worn) { c.fillStyle = MENU_COL.gold; c.font = 'bold 9px Menlo, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('E', bx + bw - 10, y + rh / 2 + 1); }
      this.rects.push({ kind: 'item', id, x: bx, y, w: bw, h: rh });
    });
    if (this.slot === 'left' && inv.leftLocked()) this.text(c, 'Held by your two-handed weapon', bx, by + 16 + list.length * (rh + 4) + 8, 8, MENU_COL.dim, 'left');
    // ---- column C: detail + totals
    const dx = bx + bw + 14, dw = W - sx - dx, totH = 74, dy = y0, dh = bot - y0 - totH - 8;
    this.panel(c, dx, dy, dw, dh, false);
    this.detail(c, dx + 12, dy + 14, dw - 24, dh - 20);
    this.totals(c, dx, bot - totH, dw, totH, p.stats);
    if (this.msg_t > 0) {
      c.globalAlpha = clamp(this.msg_t / 0.3, 0, 1);
      this.serif(c, this.msg, W / 2, bot - totH - 16, 12, '#ffb070', 'center'); c.globalAlpha = 1;
    }
  }
  /** SYSTEM tab: retry the boss (back to the shrine, boss revived), reset progress (held). */
  drawSystem(c, x, y, w, bot) {
    const g = this.g, bw = Math.min(380, w * 0.55), bh = 58, bx = x;
    const state = g.fight === 'won' ? 'DEFEATED' : g.fight === 'active' ? 'FIGHTING' : 'AWAITS YOU';
    this.text(c, 'THE OBSIDIAN SENTINEL', bx, y + 8, 9, MENU_COL.dim, 'left');
    this.text(c, state, bx + bw, y + 8, 9, g.fight === 'won' ? MENU_COL.up : MENU_COL.gold, 'right');
    let yy = y + 22;
    this.panel(c, bx, yy, bw, bh, this.confirm > 0);
    this.serif(c, this.confirm > 0 ? 'TAP AGAIN TO RETRY' : 'RETRY THE SENTINEL', bx + 14, yy + 20, 14, this.confirm > 0 ? MENU_COL.gold : MENU_COL.text, 'left');
    this.text(c, 'Revive the boss and wake at the shrine.', bx + 14, yy + 40, 8, MENU_COL.dim, 'left');
    this.rects.push({ kind: 'retry', x: bx, y: yy, w: bw, h: bh });
    yy += bh + 12;
    const hk = this.hold ? clamp((g.t - this.hold.t0) / 1.2, 0, 1) : 0;
    this.panel(c, bx, yy, bw, bh, false);
    c.fillStyle = 'rgba(90,24,34,0.55)'; c.fillRect(bx + 1, yy + 1, (bw - 2) * hk, bh - 2);
    this.serif(c, this.hold ? 'KEEP HOLDING...' : 'RESET PROGRESS', bx + 14, yy + 20, 14, this.hold ? MENU_COL.crimson : MENU_COL.text, 'left');
    this.text(c, 'Hold to wipe your items and start over.', bx + 14, yy + 40, 8, MENU_COL.dim, 'left');
    this.rects.push({ kind: 'reset', x: bx, y: yy, w: bw, h: bh });
    yy += bh + 12;
    const qh = Math.min(bh, bot - yy - 6);
    if (qh > 30) {
      this.panel(c, bx, yy, bw, qh, false);
      this.serif(c, 'QUIT TO TITLE', bx + 14, yy + qh / 2, 14, MENU_COL.text, 'left');
      this.rects.push({ kind: 'quit', x: bx, y: yy, w: bw, h: qh });
    }
    // stats beside it
    const st = g.player.stats, sx2 = bx + bw + 18, sw = x + w - sx2;
    if (sw > 150) this.totals(c, sx2, y + 22, sw, 74, st);
    if (this.msg_t > 0) { c.globalAlpha = clamp(this.msg_t / 0.3, 0, 1); this.serif(c, this.msg, x + w / 2, bot - 10, 12, '#ffb070', 'center'); c.globalAlpha = 1; }
  }
  detail(c, x, y, w, h) {
    const id = this.focus, inv = this.g.inv, d = id && ITEM_DB[id];
    if (!d) { this.text(c, 'Nothing equipped', x, y + 4, 10, MENU_COL.dim, 'left'); return; }
    this.serif(c, d.name, x, y + 4, 14, MENU_COL.text, 'left');
    let type = '';
    if (d.cat === 'weapon') type = (WEAPON_KIND[id] || 'Weapon') + ' · ' + (d.hands === '2h' ? 'Two-handed, locks the left hand' : d.hands === 'shield' ? 'Shield, left hand' : 'One-handed, ' + d.allowed.map(s => s === 'right' ? 'right' : 'left').join(' / ') + ' hand');
    else if (d.cat === 'armor') type = SLOT_TITLE[d.slot].charAt(0) + SLOT_TITLE[d.slot].slice(1).toLowerCase() + ' armour';
    else type = d.slot === 'ring' ? 'Ring' : 'Amulet';
    this.text(c, type, x, y + 22, 8, MENU_COL.dim, 'left');
    // stats with a comparison against what is worn in this slot
    const worn = inv.eq[this.slot] === id, cur = !worn && inv.eq[this.slot] ? ITEM_DB[inv.eq[this.slot]] : null;
    const rows = [];
    const num = (label, v, cv, better) => rows.push([label, v, worn || cv === null || cv === undefined ? null : v - cv, better]);
    if (d.cat === 'weapon' && d.weapon) {
      const W = WEAPONS[d.weapon], cw = cur && cur.weapon && WEAPONS[cur.weapon];
      num('Attack', W.light[0].damage, cw ? cw.light[0].damage : null, 1);
      num('Heavy', W.heavy.damage, cw ? cw.heavy.damage : null, 1);
      num('Charged', W.charged.damage, cw ? cw.charged.damage : null, 1);
    } else if (id === 'pistol') { num('Shot damage', BULLET_DAMAGE, null, 1); num('Ammunition', BULLETS_MAX, null, 1); }
    else if (d.cat === 'armor') { num('Defence', d.defense, cur ? cur.defense : 0, 1); num('Poise', d.poise, cur ? cur.poise : 0, 1); }
    if (d.cat === 'talisman') rows.push([d.effect, null, null, 0]);
    num('Weight', d.weight, cur ? cur.weight : (d.cat === 'armor' || d.cat === 'talisman' ? 0 : null), -1);
    let ry = y + 40;
    for (const [label, v, dv, better] of rows) {
      this.text(c, label, x, ry, 9, MENU_COL.text, 'left');
      if (v !== null) this.text(c, String(+v.toFixed(1)), x + w - 34, ry, 9, MENU_COL.text, 'right');
      if (dv) this.text(c, (dv > 0 ? '+' : '') + (+dv.toFixed(1)), x + w, ry, 8, dv * better > 0 ? MENU_COL.up : MENU_COL.down, 'right');
      ry += 15;
    }
    // lore
    ry += 4; c.strokeStyle = MENU_COL.goldD; c.lineWidth = 0.6; c.beginPath(); c.moveTo(x, ry - 6); c.lineTo(x + w, ry - 6); c.stroke();
    c.font = 'italic 9px Georgia, serif'; c.fillStyle = MENU_COL.lore; c.textAlign = 'left'; c.textBaseline = 'middle';
    for (const line of this.wrap(c, d.lore || '', w)) { if (ry > y + h - 16) break; c.fillText(line, x, ry + 2); ry += 12; }
    if (!worn) this.text(c, 'TAP AGAIN TO EQUIP', x + w / 2, y + h - 4, 8, MENU_COL.gold, 'center');
    else this.text(c, 'EQUIPPED', x + w / 2, y + h - 4, 8, MENU_COL.dim, 'center');
  }
  totals(c, x, y, w, h, st) {
    this.panel(c, x, y, w, h, false);
    const l = x + 12, r = x + w - 12, col = MENU_COL.text;
    const row = (label, val, yy, cc) => { this.text(c, label, l, yy, 8.5, MENU_COL.dim, 'left'); this.text(c, val, r, yy, 9, cc || col, 'right'); };
    row('HP', String(st.maxHp), y + 12);
    row('Damage taken', Math.round(st.dmgTaken * 100) + '%', y + 25);
    row('Poise', String(st.poise), y + 38);
    const tc = st.tier.name === 'LIGHT' ? MENU_COL.up : st.tier.name === 'MEDIUM' ? MENU_COL.text : st.tier.name === 'HEAVY' ? '#ffb070' : MENU_COL.down;
    row('Equip load', st.weight.toFixed(1) + ' / ' + st.maxLoad + '  ' + st.tier.name, y + 51, tc);
    const bw = w - 24, by = y + 61;
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(l, by, bw, 4);
    c.fillStyle = tc; c.fillRect(l, by, bw * clamp(st.ratio, 0, 1), 4);
    c.fillStyle = 'rgba(0,0,0,0.9)'; for (const m of [0.3, 0.7]) c.fillRect(l + bw * m - 0.5, by - 1, 1.2, 6);
  }
  panel(c, x, y, w, h, sel, worn) {
    c.fillStyle = sel ? 'rgba(40,30,18,0.92)' : worn ? 'rgba(24,20,16,0.92)' : MENU_COL.panel; rrectPath(c, x, y, w, h, 4); c.fill();
    c.strokeStyle = sel ? MENU_COL.gold : MENU_COL.goldD; c.lineWidth = sel ? 1.4 : 0.8; rrectPath(c, x + 0.5, y + 0.5, w - 1, h - 1, 4); c.stroke();
  }
  text(c, s, x, y, size, col, align) {
    c.font = `bold ${size}px Menlo, Consolas, monospace`; c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'middle'; c.fillText(s, x, y);
  }
  serif(c, s, x, y, size, col, align) {
    c.font = `bold ${size}px Georgia, 'Times New Roman', serif`; c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'middle'; c.fillText(s, x, y);
  }
  wrap(c, text, w) {
    const out = []; let line = '';
    for (const word of text.split(' ')) { const t = line ? line + ' ' + word : word; if (c.measureText(t).width > w && line) { out.push(line); line = word; } else line = t; }
    if (line) out.push(line); return out;
  }
}
