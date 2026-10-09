import { drawText, textWidth } from './bitmapFont.js';
import { SIM_HZ } from '../config.js';
import { PALETTE } from '../render/textures.js';

// Arcade-cabinet HUD drawn at the game's internal resolution, so its pixels match
// the 3D view exactly. The renderer composites this canvas in its post pass.
// Styled after concept art/T&T HUD Concept Art 02.jpg: riveted metal panels, LED
// segment digits, a chrome-ringed speedometer. Position and lap top-left, timing
// top-right, the health / ammo / secondary panel bottom-left with a minimap
// above, the speedometer and boost meter bottom-right.

const SHADOW = '#0a0418';
const UTILITY_LABELS = { oil: 'OIL', smoke: 'SMOKE', shield: 'SHIELD', repair: 'REPAIR' };
const PLATE = 'rgba(20, 21, 26, 0.9)';
const BOX = 'rgba(10, 11, 14, 0.75)';
const WELL = '#08080b';
const METAL_HI = '#9a9ca8';
const METAL = '#5e606c';
const METAL_LO = '#2e2f38';
const LABEL = '#c4c4d0';
const UNLIT = '#1a1b20';
const AMBER = ['#ffa024', '#2e1c0c']; // LED lit, and its unlit ghost
const RED = ['#ff3428', '#30100c'];
const SEGMENTS = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g' };
// Warning triangle at the end of an overheated heat bar: r red, y yellow.
const WARN = ['....r....', '...rrr...', '...ryr...', '..rryrr..', '..r.y.r..', '.r.....r.', '.r..y..r.', 'rrrrrrrrr'];
// Speedometer sweep: zero just below left, the top of the scale just below right.
const DIAL_A0 = Math.PI * 0.85;
const DIAL_SWEEP = Math.PI * 1.3;

// Weapon icons cut from concept art/Ammo Icons Concept Art 02 No Special.jpg, one
// 64px cell each, in this order.
const ICONS = ['chaingun', 'scatter', 'plasma', 'flamethrower', 'railgun', 'turret', 'mines', 'rockets', 'tesla'];
const ICON_CELL = 64;
const iconSheet = typeof Image === 'undefined' ? null : Object.assign(new Image(), { src: new URL('./ammo-icons.png', import.meta.url).href });

export function formatTime(ticks) {
  if (ticks < 0) return '-:--.--';
  const total = ticks / SIM_HZ;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mapCache = null; // { track, pts, box }
    this.icons = new Map(); // `${type}:${pixels}` -> icon scaled to that size
    this.dials = new Map(); // speedometer faces, by radius and scale
  }

  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // viewport: a split-screen pane in canvas pixels ({ x, y, w, h }); keep: don't
  // clear the canvas first (the other panes are already drawn).
  draw(opts) {
    const { ctx, canvas } = this;
    const vp = opts.viewport || { x: 0, y: 0, w: canvas.width, h: canvas.height };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!opts.keep) ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(vp.x, vp.y, vp.w, vp.h);
    ctx.clip();
    this.drawPane(opts, vp);
    ctx.restore();
  }

  drawPane({ car, params, tick, fps, showFps, touchLayout, label, units = 'kmh', markers = [], position = null, eventInfo = null, minimap = null, hudScale = 1 }, vp) {
    const { ctx } = this;
    // Layout is in 270-line units, scaled to the pane and the HUD size setting;
    // a scale near a whole number snaps to it so the pixel font stays crisp.
    const raw = (vp.h / 270) * hudScale;
    const S = Math.abs(raw - Math.round(raw)) < 0.15 ? Math.max(1, Math.round(raw)) : Math.max(0.5, raw);
    ctx.setTransform(S, 0, 0, S, vp.x, vp.y);
    ctx.imageSmoothingEnabled = false;
    const W = Math.floor(vp.w / S);
    const H = Math.floor(vp.h / S);
    const blink = Math.floor(performance.now() / 250) % 2 === 0;
    const text = (t, x, y, opts = {}) => drawText(ctx, t, x, y, { shadow: SHADOW, ...opts });
    const rect = (x, y, w, h, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };
    const px = (x, y, c) => rect(Math.round(x), Math.round(y), 1, 1, c);
    // Fills and edges never overlap, so translucent fills don't double up.
    const chamfer = (x, y, w, h, c, k) => {
      for (let i = 0; i < k; i++) {
        rect(x + k - i, y + i, w - 2 * (k - i), 1, c);
        rect(x + k - i, y + h - 1 - i, w - 2 * (k - i), 1, c);
      }
      rect(x, y + k, w, h - 2 * k, c);
    };
    const outline = (x, y, w, h, hi, lo, k) => {
      rect(x + k, y, w - 2 * k, 1, hi);
      rect(x, y + k, 1, h - 2 * k, hi);
      rect(x + k, y + h - 1, w - 2 * k, 1, lo);
      rect(x + w - 1, y + k, 1, h - 2 * k, lo);
      for (let i = 1; i < k; i++) {
        px(x + i, y + k - i, hi);
        px(x + w - 1 - i, y + k - i, hi);
        px(x + i, y + h - 1 - k + i, lo);
        px(x + w - 1 - i, y + h - 1 - k + i, lo);
      }
    };
    const panel = (x, y, w, h, fill, hi, lo, k = 2) => {
      chamfer(x + 1, y + 1, w - 2, h - 2, fill, Math.max(0, k - 1));
      outline(x, y, w, h, hi, lo, k);
    };
    // The riveted outer plate, a labelled box inside it, and a sunken well.
    const plate = (x, y, w, h) => {
      panel(x, y, w, h, PLATE, METAL_HI, METAL_LO, 3);
      outline(x + 1, y + 1, w - 2, h - 2, METAL, METAL_LO, 2);
      for (const [rx, ry] of [[x + 3, y + 3], [x + w - 4, y + 3], [x + 3, y + h - 4], [x + w - 4, y + h - 4]]) px(rx, ry, METAL_HI);
    };
    const box = (x, y, w, h, tab) => {
      panel(x, y, w, h, BOX, '#626470', '#3a3b46', 2);
      if (tab) text(tab, x + 4, y + 3, { color: LABEL });
    };
    const well = (x, y, w, h) => panel(x, y, w, h, WELL, METAL_LO, '#4a4c58', 1);
    // LED segment digits, right-aligned in `slots` cells, unlit segments ghosted.
    const seg7 = (str, x, y, { w, h, t, gap, slots, color = AMBER, lit = true }) => {
      const [on, off] = color;
      const n = Math.max(slots, str.length);
      const m = Math.floor((h - t) / 2);
      for (let i = 0; i < n; i++) {
        const dx = x + i * (w + gap);
        const p = {
          a: [dx + 1, y, w - 2, t], g: [dx + 1, y + m, w - 2, t], d: [dx + 1, y + h - t, w - 2, t],
          f: [dx, y + 1, t, m], b: [dx + w - t, y + 1, t, m], e: [dx, y + m + 1, t, h - m - 2], c: [dx + w - t, y + m + 1, t, h - m - 2],
        };
        for (const k of 'abcdefg') rect(...p[k], off);
        const segs = lit ? SEGMENTS[str[i - (n - str.length)]] || '' : '';
        ctx.globalAlpha = 0.25;
        for (const k of segs) rect(p[k][0] - 1, p[k][1] - 1, p[k][2] + 2, p[k][3] + 2, on);
        ctx.globalAlpha = 1;
        for (const k of segs) rect(...p[k], on);
      }
    };
    const seg7Width = (slots, w, gap) => slots * w + (slots - 1) * gap;
    // Big white numerals with a dark outline, as for position and lap.
    const big = (t, x, y) => {
      for (const [ox, oy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [-1, 2], [0, 2], [1, 2]]) {
        drawText(ctx, t, x + ox, y + oy, { scale: 3, color: SHADOW });
      }
      drawText(ctx, t, x, y, { scale: 3, color: '#ffffff' });
    };
    // A weapon icon in a size x size square, drawn at full canvas resolution.
    const icon = (type, x, y, size) => {
      const cell = ICONS.indexOf(type);
      if (cell < 0 || !iconSheet?.complete || !iconSheet.naturalWidth) return;
      const ds = Math.max(1, Math.round(size * S));
      const key = `${type}:${ds}`;
      let c = this.icons.get(key);
      if (!c) {
        c = document.createElement('canvas');
        c.width = c.height = ds;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(iconSheet, cell * ICON_CELL, 0, ICON_CELL, ICON_CELL, 0, 0, ds, ds);
        this.icons.set(key, c);
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(c, Math.round(vp.x + x * S), Math.round(vp.y + y * S));
      ctx.restore();
    };

    // Position and lap, top-left, in big outlined numerals.
    let tx = 6;
    if (position) {
      const v = `${position.pos}/${position.total}`;
      text('POSITION', tx, 5, { color: LABEL });
      big(v, tx, 15);
      tx += Math.max(textWidth('POSITION'), textWidth(v, 3)) + 14;
    }
    const r = car.race;
    const current = r.lapStart >= 0 ? tick - r.lapStart : -1;
    const title = eventInfo?.title ?? `LAP ${Math.max(1, r.lap)}`;
    const lapMatch = /^LAP\s+(.*)$/.exec(title);
    if (lapMatch) {
      text('LAP', tx, 5, { color: LABEL });
      big(lapMatch[1], tx, 15);
    }
    text(`KO ${car.takedowns || 0}`, 6, position || lapMatch ? 41 : 5, { color: PALETTE.amber });

    // Event title and timing, top-right (below the pause button on touch).
    let ty = touchLayout ? 50 : 5;
    if (!lapMatch) {
      text(title, W - 6, ty, { scale: 2, color: '#ffffff', align: 'right' });
      ty += 18;
    }
    const warn = eventInfo?.clockWarn && Math.floor(performance.now() / 350) % 2 === 0; // (Rampage: the last 10 s)
    text(formatTime(eventInfo ? eventInfo.timeTicks : current), W - 6, ty, { color: warn ? PALETTE.pink : '#ffffff', align: 'right' });
    text(eventInfo?.sub ?? `BEST ${formatTime(r.bestLap)}`, W - 6, ty + 10, { color: eventInfo?.subWarn ? PALETTE.pink : PALETTE.amber, align: 'right' }); // (red: Last Lap Out's drop zone)
    if (eventInfo?.chassis != null) {
      // Rampage: the chassis meter (red once a wreck would total the car).
      text('CHASSIS', W - 6, ty + 20, { color: LABEL, align: 'right' });
      rect(W - 66, ty + 30, 60, 3, 'rgba(0, 0, 0, 0.5)');
      rect(W - 66, ty + 30, Math.round(60 * eventInfo.chassis), 3, eventInfo.chassisLow ? PALETTE.pink : PALETTE.cyan);
    }

    // Speedometer: chrome ring, red zone, needle and an LED readout, with the
    // boost meter beside it. Bottom-right on desktop, top-centre on touch.
    const kmh = Math.hypot(car.vel.x, car.vel.y, car.vel.z) * 3.6;
    const speed = Math.round(units === 'mph' ? kmh * 0.6214 : kmh);
    const dialMax = units === 'mph' ? 250 : 400;
    const R = touchLayout ? 26 : 40;
    const gx = touchLayout ? Math.round(W / 2) : W - R - 40;
    const gy = touchLayout ? R + 6 : H - R - 8;
    const face = this.dial(R, dialMax, !touchLayout);
    ctx.drawImage(face, gx - R - 4, gy - R - 4);
    const gearHot = car.rpm > params.engine.redline * 0.9;
    text(car.reverse ? 'R' : String(car.gear), gx + 0.5, gy - 15, { color: car.reverse ? PALETTE.amber : gearHot ? PALETTE.pink : '#a8a8b8', align: 'center' });
    const na = DIAL_A0 + (Math.min(speed, dialMax) / dialMax) * DIAL_SWEEP;
    const [ca, sa] = [Math.cos(na), Math.sin(na)];
    for (let i = 3; i <= R - 8; i++) px(gx + ca * i - sa, gy + sa * i + ca, '#b83800');
    for (let i = 3; i <= R - 6; i++) px(gx + ca * i, gy + sa * i, '#ffb040');
    rect(gx - 2, gy - 2, 5, 5, '#2a0606');
    rect(gx - 1, gy - 1, 3, 3, '#ff3428');
    px(gx - 1, gy - 1, '#ffb0a0');
    const ry = touchLayout ? gy + 8 : gy + 12;
    well(gx - 13, ry, 26, touchLayout ? 15 : 22);
    seg7(String(Math.min(999, speed)), gx - 11, ry + 2, { w: 7, h: 11, t: 2, gap: 1, slots: 3 });
    if (!touchLayout) text(units === 'mph' ? 'MPH' : 'KM/H', gx + 0.5, ry + 14, { color: AMBER[0], align: 'center', shadow: null });

    // Nitrous: a capsule of LED segments over a red reserve cell, draining while a
    // charge burns (its top segment flickers), and beside it a cell per charge.
    const n = car.nitro;
    const bw = 12;
    const bh = touchLayout ? 46 : 64;
    const bx = gx + R + 8;
    const by = gy + R - bh + 2;
    if (!touchLayout) text('NITROUS', bx + bw + 10, by - 10, { color: LABEL, align: 'right' });
    panel(bx, by, bw, bh, WELL, METAL_HI, METAL_LO, 3);
    outline(bx + 1, by + 1, bw - 2, bh - 2, METAL_LO, METAL, 2);
    const charges = params.nitro.charges;
    const fill = !charges ? 0 : n.active > 0 ? (n.charges + n.active / params.nitro.duration) / charges : (n.charges + (n.charges < charges ? n.recharge / params.nitro.rechargeTime : 0)) / charges;
    const cells = Math.floor((bh - 7) / 4) + 1;
    const lit = Math.round(Math.min(1, fill) * cells);
    for (let i = 0; i < cells; i++) {
      const y = by + bh - 5 - i * 4;
      const on = i < lit && !(n.active > 0 && i === lit - 1 && blink);
      const reserve = i === 0;
      rect(bx + 3, y, bw - 6, 3, on ? (reserve ? RED[0] : '#38c8ff') : reserve ? '#3a1010' : UNLIT);
      if (on) rect(bx + 3, y, bw - 6, 1, reserve ? '#ffa090' : '#b8f0ff');
    }
    // Charge cells, bottom up: lit when ready, flashing while burning, filling
    // while recharging, dark once used.
    if (charges > 0) {
      const cx = bx + bw + 1;
      const ch = charges * 9 + 2;
      const cy = by + bh - ch;
      well(cx, cy, 9, ch);
      for (let k = 0; k < charges; k++) {
        const y = cy + charges * 9 - 7 - k * 9;
        const ready = k < n.charges;
        const burning = n.active > 0 && k === n.charges;
        rect(cx + 2, y, 5, 7, UNLIT);
        if (ready || (burning && blink)) {
          rect(cx + 2, y, 5, 7, burning ? '#ffffff' : '#38c8ff');
          rect(cx + 2, y, 5, 1, '#b8f0ff');
        } else if (!burning && k === n.charges) {
          const f = Math.round(Math.min(1, n.recharge / params.nitro.rechargeTime) * 7);
          rect(cx + 2, y + 7 - f, 5, f, '#1c6a8a');
        }
      }
    }

    // The main panel, bottom-left (top-left on touch, clear of the steering pad):
    // health across the top; ammo with the weapon icon and heat, the secondary,
    // and the utility below it.
    const util = params.weapons?.utility;
    const AW = 88;
    const SW = 38;
    const UW = 44;
    const PW = 3 + AW + 2 + SW + (util ? 2 + UW : 0) + 3;
    const PH = 73;
    const PX = 4;
    const PY = touchLayout ? 54 : H - PH - 4;
    plate(PX, PY, PW, PH);

    const hx = PX + 3;
    const hy = PY + 3;
    const hw = PW - 6;
    box(hx, hy, hw, 22, 'HEALTH');
    well(hx + 3, hy + 11, hw - 6, 9);
    const hpFrac = Math.max(0, car.hp / car.maxHp);
    const [hpOn, hpHi] = hpFrac > 0.5 ? ['#3ce83c', '#b0ffa0'] : hpFrac > 0.25 ? [PALETTE.amber, '#ffe080'] : [RED[0], '#ffa090'];
    const hpCells = Math.floor((hw - 9) / 7);
    const hpX = hx + 5 + Math.floor((hw - 10 - (hpCells * 7 - 1)) / 2);
    for (let i = 0; i < hpCells; i++) {
      const on = i < Math.ceil(hpFrac * hpCells);
      rect(hpX + i * 7, hy + 13, 6, 5, on ? hpOn : UNLIT);
      if (on) rect(hpX + i * 7, hy + 13, 6, 1, hpHi);
    }

    // Ammo: LED count (red when low or empty, flashing while reloading), the
    // weapon's icon, and the heat bar.
    const ax = hx;
    const ay = hy + 24;
    box(ax, ay, AW, 43, 'AMMO');
    const primary = params.weapons?.primary;
    const pws = car.weapons?.primary;
    const iconX = ax + AW - 24;
    well(iconX, ay + 3, 21, 26);
    if (primary) icon(primary.type, iconX + 1, ay + 6, 19);
    const digitsRight = iconX - 3;
    const big7 = { w: 12, h: 18, t: 3, gap: 3, slots: 3 };
    let msg = null;
    let msgColor = AMBER[0];
    if (primary && pws) {
      if (car.condition?.primaryWeapon <= 0) [msg, msgColor] = ['BROKEN', RED[0]];
      else if (primary.ammo !== null) {
        const low = pws.ammo <= Math.floor(primary.ammo * 0.15);
        const str = String(pws.ammo).padStart(2, '0');
        const slots = Math.max(3, str.length);
        seg7(str, digitsRight - seg7Width(slots, big7.w, big7.gap), ay + 11, { ...big7, slots, color: low ? RED : AMBER, lit: !(pws.reload > 0 && blink) });
      } else if (car.overheated) [msg, msgColor] = ['HOT', RED[0]];
      else msg = 'INF';
    }
    if (!(primary && pws) || msg) seg7('', digitsRight - seg7Width(3, big7.w, big7.gap), ay + 11, big7);
    if (msg) {
      const scale = textWidth(msg, 2) <= digitsRight - ax - 6 ? 2 : 1;
      text(msg, (ax + 4 + digitsRight) / 2, ay + 20 - 3.5 * scale, { scale, color: msgColor, align: 'center' });
    }
    const heatCap = params.combat?.heatCapacity || 70;
    const heat = car.overheated ? 1 : Math.min(1, car.heat / heatCap);
    well(ax + 3, ay + 31, AW - 6, 9);
    text('HEAT', ax + 6, ay + 32, { color: car.overheated ? RED[0] : LABEL, shadow: null });
    const heatCells = Math.floor((AW - 45 + 1) / 4);
    const heatOn = car.overheated ? RED[0] : heat < 0.5 ? AMBER[0] : heat < 0.85 ? '#ff6a20' : RED[0];
    for (let i = 0; i < heatCells; i++) {
      const on = i < Math.max(1, Math.round(heat * heatCells));
      rect(ax + 30 + i * 4, ay + 33, 3, 5, on ? heatOn : UNLIT);
    }
    if (car.overheated && blink) {
      WARN.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && px(ax + AW - 15 + x, ay + 32 + y, ch === 'y' ? '#ffd020' : RED[0])));
    }

    // Secondary: icon and LED count.
    const sx = ax + AW + 2;
    box(sx, ay, SW, 43, 'SEC');
    const secondary = params.weapons?.secondary;
    const sws = car.weapons?.secondary;
    const small7 = { w: 7, h: 11, t: 2, gap: 2, slots: 2 };
    const sdx = sx + Math.floor((SW - seg7Width(2, small7.w, small7.gap)) / 2);
    if (secondary && sws) {
      icon(secondary.type, sx + 10, ay + 10, 19);
      if (car.condition?.secondaryWeapon <= 0) seg7('--', sdx, ay + 30, { ...small7, color: RED });
      else if (secondary.ammo === null) text('RDY', sx + SW / 2, ay + 32, { color: PALETTE.green, align: 'center' });
      else seg7(String(sws.ammo).padStart(2, '0'), sdx, ay + 30, { ...small7, color: sws.ammo > 0 ? AMBER : RED, lit: !(sws.reload > 0 && blink) });
    } else seg7('', sdx, ay + 30, small7);

    // Utility: its name, then READY or the seconds until it is.
    if (util) {
      const ux = sx + SW + 2;
      box(ux, ay, UW, 43, UTILITY_LABELS[util.type] || util.type);
      const cd = car.utility?.cooldown || 0;
      const mid7 = { w: 10, h: 17, t: 3, gap: 3, slots: 2 };
      if (cd > 0) seg7(String(Math.min(99, Math.ceil(cd))), ux + Math.floor((UW - seg7Width(2, mid7.w, mid7.gap)) / 2), ay + 16, mid7);
      else text('READY', ux + UW / 2, ay + 22, { color: PALETTE.green, align: 'center' });
    }

    // Minimap: the route (or arena outline), rivals and you, north up.
    if (minimap) this.drawMinimap(minimap, touchLayout ? W - 70 : 4, touchLayout ? 104 : PY - 70, 66, box, px);

    // Markers over other cars: health bars, and the lock-on reticle (corner
    // brackets around a ringed crosshair).
    for (const m of markers) {
      const x = Math.round(((m.x + 1) / 2) * W);
      const y = Math.round(((1 - m.y) / 2) * H);
      rect(x - 11, y - 1, 22, 4, SHADOW);
      rect(x - 10, y, Math.max(1, Math.round(20 * m.hp)), 2, m.hp > 0.5 ? PALETTE.green : m.hp > 0.25 ? PALETTE.amber : PALETTE.pink);
      if (m.name) text(m.name, x, y - 9, { color: '#e8e8ff', align: 'center' });
      if (m.lock) {
        const cy = y + 16;
        const reticle = (o, c) => {
          for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const kx = x + o + dx * 11;
            const ky = cy + o + dy * 11;
            rect(kx - (dx > 0 ? 4 : 0), ky, 5, 1, c);
            rect(kx, ky - (dy > 0 ? 4 : 0), 1, 5, c);
          }
          for (let a = 0; a < 24; a++) px(x + o + Math.cos((a / 24) * Math.PI * 2) * 4, cy + o + Math.sin((a / 24) * Math.PI * 2) * 4, c);
          rect(x + o - 9, cy + o, 5, 1, c);
          rect(x + o + 5, cy + o, 5, 1, c);
          rect(x + o, cy + o - 9, 1, 5, c);
          rect(x + o, cy + o + 5, 1, 5, c);
        };
        reticle(1, SHADOW);
        reticle(0, '#ff2a2a');
      }
    }

    // Event overlays: countdown, GO, popups, shift light, finish and pit.
    if (eventInfo) {
      if (eventInfo.countdown) text(String(eventInfo.countdown), W / 2, H / 2 - 50, { scale: 6, color: PALETTE.amber, align: 'center' });
      if (eventInfo.go) text('GO!', W / 2, H / 2 - 50, { scale: 6, color: PALETTE.green, align: 'center' });
      eventInfo.popups.forEach((p, k) => text(p.text, W / 2, Math.round(H * 0.6 - k * 12 - p.age * 12), { color: p.color, align: 'center' }));
      if (eventInfo.manual && gearHot && Math.floor(tick / 6) % 2 === 0) {
        text('SHIFT!', gx, touchLayout ? gy + R + 6 : gy - R - 18, { color: PALETTE.pink, align: 'center', scale: 2 });
      }
      if (eventInfo.finishedText) text(eventInfo.finishedText, W / 2, 64, { color: PALETTE.cyan, align: 'center', scale: 2 });
      if (eventInfo.inPit) text('PIT - REPAIRING', W / 2, 84, { color: PALETTE.cyan, align: 'center' });
      if (eventInfo.wrongWay && Math.floor(performance.now() / 350) % 2 === 0) text('WRONG WAY', W / 2, H / 2 - 50, { scale: 4, color: PALETTE.pink, align: 'center' });
    }
    if (car.shield > 0) text('SHIELD', W / 2, 60, { color: PALETTE.cyan, align: 'center', scale: 2 });
    if (car.wrecked) {
      const dr = eventInfo?.deathRoll;
      if (dr?.slow) rect(0, 0, W, H, 'rgba(90, 40, 150, 0.18)'); // slow motion
      // (While Death Rolling, up out of the way: the wreck is in the middle.)
      const y = dr ? Math.round(H * 0.14) : H / 2 - 20;
      text('WRECKED', W / 2, y, { color: PALETTE.pink, align: 'center', scale: dr ? 2 : 3 });
      text(eventInfo?.totaled ? 'TOTALED' : `RESPAWN IN ${Math.max(0, Math.ceil(car.wreckTimer))}`, W / 2, y + (dr ? 18 : 26), { color: '#ffffff', align: 'center' });
      if (dr) {
        // Death Roll: the prompt, and a bar for the time left to aim the wreck.
        text('DEATH ROLL', W / 2, y + 32, { color: PALETTE.amber, align: 'center', scale: 2 });
        text(dr.canSlow ? 'HOLD NITROUS TO SLOW TIME, STEER TO AIM' : 'STEER TO AIM YOUR WRECK', W / 2, y + 50, { color: '#ffffff', align: 'center' });
        rect(W / 2 - 40, y + 62, 80, 3, 'rgba(0, 0, 0, 0.5)');
        rect(W / 2 - 40, y + 62, Math.round(80 * dr.left), 3, PALETTE.amber);
        // (Detonating costs a nitrous charge: the prompt shows only with one left.)
        if (dr.blown) text(dr.canSlow ? 'DETONATED! KEEP HOLDING NITROUS' : 'DETONATED!', W / 2, y + 72, { color: PALETTE.pink, align: 'center' });
        else if (dr.canBlow) text(`${dr.button}: DETONATE`, W / 2, y + 72, { color: PALETTE.amber, align: 'center' });
      }
    }

    if (showFps) text(`${Math.round(fps)} FPS`, W / 2, touchLayout ? H - 10 : 5, { color: '#6a6090', align: 'center' });
    if (label) text(label, touchLayout ? W / 2 : W / 2, touchLayout ? H - 20 : H - 10, { color: '#8a86a8', align: 'center' });
  }

  // The speedometer's static parts, cached per radius and scale: a black face,
  // the chrome ring lit from the top-left, the red zone, ticks and numbers.
  // Drawn with its centre at (R + 4, R + 4).
  dial(R, dialMax, numbers) {
    const key = `${R}:${dialMax}:${numbers}`;
    let c = this.dials.get(key);
    if (c) return c;
    const o = R + 4;
    c = document.createElement('canvas');
    c.width = c.height = o * 2 + 1;
    const g = c.getContext('2d');
    const img = g.createImageData(c.width, c.height);
    const hi = [154, 156, 168];
    const lo = [46, 47, 56];
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const dx = x - o;
        const dy = y - o;
        const d = Math.hypot(dx, dy);
        let col = null;
        if (d <= R - 0.5) col = [12, 12, 16, 240];
        else if (d <= R + 0.5 || (d > R + 2.5 && d <= R + 3.5)) col = [6, 6, 8, 255];
        else if (d <= R + 2.5) {
          const k = ((-(dx + dy) / (d * Math.SQRT2) + 1) / 2) * (d > R + 1.5 ? 0.75 : 1);
          col = [...hi.map((h, i) => Math.round(lo[i] + (h - lo[i]) * k)), 255];
        }
        if (col) img.data.set(col, (y * c.width + x) * 4);
      }
    }
    g.putImageData(img, 0, 0);
    const px = (x, y, color) => {
      g.fillStyle = color;
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    };
    const at = (f, rad) => [o + Math.cos(DIAL_A0 + f * DIAL_SWEEP) * rad, o + Math.sin(DIAL_A0 + f * DIAL_SWEEP) * rad];
    for (let f = 0.8; f <= 1; f += 1 / (R * 6)) {
      px(...at(f, R - 1), '#c81818');
      px(...at(f, R - 2), '#801010');
    }
    for (let i = 0; i <= 25; i++) {
      const f = i / 25;
      const major = i % 5 === 0;
      const color = f >= 0.8 ? '#ff3a2a' : major ? '#f0e8d8' : '#9a9284';
      const len = major ? 5 : 2;
      for (let k = 0; k < len; k++) px(...at(f, R - 1 - k), color);
      if (major && numbers) {
        const [lx, ly] = at(f, R - 13);
        drawText(g, String((dialMax * i) / 25), lx + 0.5, ly - 3, { color: f >= 0.8 ? '#ff6a50' : '#f0d8a0', align: 'center' });
      }
    }
    this.dials.set(key, c);
    return c;
  }

  // Route outline (a track's centre line, or an arena's bounds) fitted to the box,
  // with the other cars as dots and the player as a bright marker.
  drawMinimap({ track, cars, player = 0 }, x, y, size, frame, px) {
    const { ctx } = this;
    frame(x, y, size, size);
    if (!track.bounds && !track.x?.length) return;
    if (!this.mapCache || this.mapCache.track !== track) {
      const b = track.bounds || { minX: Math.min(...track.x), maxX: Math.max(...track.x), minZ: Math.min(...track.z), maxZ: Math.max(...track.z) };
      const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) || 1;
      const k = (size - 10) / span;
      const ox = x + size / 2 - ((b.minX + b.maxX) / 2) * k;
      const oz = y + size / 2 - ((b.minZ + b.maxZ) / 2) * k;
      const pts = [];
      if (track.x?.length) {
        const step = Math.max(1, Math.floor(track.x.length / 400));
        for (let i = 0; i < track.x.length; i += step) pts.push([track.x[i], track.z[i]]);
      } else {
        pts.push([b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ], [b.minX, b.minZ]);
      }
      this.mapCache = { track, k, ox, oz, pts, x, y, closed: !!track.closed };
    }
    const m = this.mapCache;
    const map = (wx, wz) => [m.ox + (wx - 0) * m.k + (x - m.x), m.oz + wz * m.k + (y - m.y)];
    for (let i = 1; i < m.pts.length; i++) {
      const [x0, y0] = map(...m.pts[i - 1]);
      const [x1, y1] = map(...m.pts[i]);
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let j = 0; j <= n; j++) px(x0 + ((x1 - x0) * j) / n, y0 + ((y1 - y0) * j) / n, '#8a86a8');
    }
    if (m.pts.length > 1) {
      const [sx, sy] = map(...m.pts[0]);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 3, 3); // start
    }
    cars.forEach((c, i) => {
      if (i === player || c.wrecked) return;
      const [cx, cy] = map(c.pos.x, c.pos.z);
      ctx.fillStyle = '#ff3040';
      ctx.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, 2, 2);
    });
    const me = cars[player];
    if (me) {
      const [cx, cy] = map(me.pos.x, me.pos.z);
      ctx.fillStyle = SHADOW;
      ctx.fillRect(Math.round(cx) - 2, Math.round(cy) - 2, 5, 5);
      ctx.fillStyle = PALETTE.cyan;
      ctx.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, 3, 3);
    }
  }
}
