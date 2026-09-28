import { drawText } from './bitmapFont.js';
import { SIM_HZ } from '../config.js';
import { PALETTE } from '../render/textures.js';

// Arcade-cabinet HUD drawn at the game's internal resolution, so its pixels match
// the 3D view exactly. The renderer composites this canvas in its post pass.
// Layout after the concept art: position top-left, lap top-right, framed health
// and ammo panels bottom-left with a minimap above, a dial speedometer and boost
// bar bottom-right.

const SHADOW = '#0a0418';
const WEAPON_LABELS = {
  chaingun: 'CHAIN GUN', scatter: 'SCATTER', plasma: 'PLASMA', flamethrower: 'FLAMER', railgun: 'RAIL GUN',
  mines: 'MINES', turret: 'TURRET', rockets: 'ROCKETS', tesla: 'TESLA',
};
const UTILITY_LABELS = { oil: 'OIL SLICK', smoke: 'SMOKE', shield: 'SHIELD', repair: 'REPAIR' };
const PANEL = 'rgba(8, 6, 16, 0.82)';
const EDGE = '#4a4868';
const DIM = '#8a86a8';
const GOLD = '#e8a020';

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
    const W = Math.floor(vp.w / S);
    const H = Math.floor(vp.h / S);
    const text = (t, x, y, opts = {}) => drawText(ctx, t, x, y, { shadow: SHADOW, ...opts });
    const px = (x, y, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    };
    // Framed panel with clipped corners and a label tab, as in the concept art.
    const frame = (x, y, w, h, tab) => {
      ctx.fillStyle = PANEL;
      ctx.fillRect(x + 2, y, w - 4, h);
      ctx.fillRect(x, y + 2, w, h - 4);
      ctx.fillStyle = EDGE;
      ctx.fillRect(x + 2, y, w - 4, 1);
      ctx.fillRect(x + 2, y + h - 1, w - 4, 1);
      ctx.fillRect(x, y + 2, 1, h - 4);
      ctx.fillRect(x + w - 1, y + 2, 1, h - 4);
      px(x + 1, y + 1, EDGE);
      px(x + w - 2, y + 1, EDGE);
      px(x + 1, y + h - 2, EDGE);
      px(x + w - 2, y + h - 2, EDGE);
      if (tab) text(tab, x + 4, y + 3, { color: DIM });
    };
    const line = (x0, y0, x1, y1, c) => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= n; i++) px(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
    };

    // Position, top-left.
    if (position) {
      text('POSITION', 6, 5, { color: DIM });
      text(`${position.pos}/${position.total}`, 6, 15, { scale: 3, color: '#ffffff' });
    }
    text(`KO ${car.takedowns || 0}`, 6, position ? 40 : 5, { color: PALETTE.amber });

    // Lap / event and timing, top-right (below the pause button on touch).
    const r = car.race;
    const current = r.lapStart >= 0 ? tick - r.lapStart : -1;
    const ty = touchLayout ? 50 : 5;
    const title = eventInfo?.title ?? `LAP ${Math.max(1, r.lap)}`;
    const lapMatch = /^LAP\s+(.*)$/.exec(title);
    if (lapMatch) {
      text('LAP', W - 6, ty, { color: DIM, align: 'right' });
      text(lapMatch[1], W - 6, ty + 10, { scale: 3, color: '#ffffff', align: 'right' });
    } else text(title, W - 6, ty, { scale: 2, color: '#ffffff', align: 'right' });
    text(formatTime(eventInfo ? eventInfo.timeTicks : current), W - 6, ty + 35, { color: '#ffffff', align: 'right' });
    text(eventInfo?.sub ?? `BEST ${formatTime(r.bestLap)}`, W - 6, ty + 45, { color: PALETTE.amber, align: 'right' });

    // Speedometer dial with needle, redline, gear and digital readout, plus the
    // boost bar beside it: bottom-right on desktop, top-centre on touch.
    const kmh = Math.hypot(car.vel.x, car.vel.y, car.vel.z) * 3.6;
    const speed = Math.round(units === 'mph' ? kmh * 0.6214 : kmh);
    const dialMax = units === 'mph' ? 250 : 400;
    const R = touchLayout ? 26 : 34;
    const gx = touchLayout ? Math.round(W / 2) : W - R - 36;
    const gy = touchLayout ? R + 6 : H - R - 8;
    ctx.fillStyle = PANEL;
    for (let y = -R - 2; y <= R + 2; y++) {
      const half = Math.floor(Math.sqrt(Math.max(0, (R + 2) ** 2 - y * y)));
      ctx.fillRect(gx - half, gy + y, half * 2 + 1, 1);
    }
    const A0 = Math.PI * 0.75; // 0 at bottom-left, sweeping 270 degrees clockwise
    const angleAt = (v) => A0 + (Math.min(v, dialMax) / dialMax) * Math.PI * 1.5;
    for (let a = 0; a <= 1; a += 1 / (R * 5)) {
      const ang = A0 + a * Math.PI * 1.5;
      px(gx + Math.cos(ang) * R, gy + Math.sin(ang) * R, a > 0.82 ? PALETTE.pink : '#d8d4c8');
    }
    const step = dialMax / 5;
    for (let v = 0; v <= dialMax; v += step / 2) {
      const ang = angleAt(v);
      const major = v % step === 0;
      line(gx + Math.cos(ang) * (R - (major ? 5 : 3)), gy + Math.sin(ang) * (R - (major ? 5 : 3)), gx + Math.cos(ang) * (R - 1), gy + Math.sin(ang) * (R - 1), '#d8d4c8');
      if (major && !touchLayout && v > 0 && v < dialMax) text(String(v), gx + Math.cos(ang) * (R - 13), gy + Math.sin(ang) * (R - 13) - 3, { color: '#b8b4a8', align: 'center' });
    }
    // Rev ring just inside the scale.
    const rpmFrac = Math.min(1, car.rpm / params.engine.redline);
    const segs = 16;
    for (let i = 0; i < Math.round(rpmFrac * segs); i++) {
      const ang = A0 + ((i + 0.5) / segs) * Math.PI * 1.5;
      px(gx + Math.cos(ang) * (R + 3), gy + Math.sin(ang) * (R + 3), i >= segs - 3 ? PALETTE.pink : i >= segs - 6 ? PALETTE.amber : PALETTE.cyan);
    }
    const na = angleAt(speed);
    line(gx, gy, gx + Math.cos(na) * (R - 4), gy + Math.sin(na) * (R - 4), '#ff7a1a');
    ctx.fillStyle = '#d8d4c8';
    ctx.fillRect(gx - 1, gy - 1, 3, 3);
    text(String(speed), gx + 4, gy + (touchLayout ? 6 : 9), { scale: 2, color: GOLD, align: 'center' });
    if (!touchLayout) text(units === 'mph' ? 'MPH' : 'KM/H', gx + 4, gy + 25, { color: GOLD, align: 'center' });
    const gear = car.reverse ? 'R' : String(car.gear);
    text(gear, gx, gy - 11, { color: car.reverse ? PALETTE.amber : PALETTE.pink, align: 'center' });

    // Boost: nitro charges as a vertical segmented bar, draining while active.
    const n = car.nitro;
    const bw = 10;
    const bh = touchLayout ? 44 : 60;
    const bx = gx + R + 8;
    const byy = gy + R - bh + 2;
    if (!touchLayout) text('BOOST', bx + bw + 8, byy - 20, { color: DIM, align: 'right' });
    frame(bx, byy, bw, bh);
    const charges = params.nitro.charges;
    const fill = n.active > 0 ? (n.charges + n.active / params.nitro.duration) / charges : (n.charges + (n.charges < charges ? n.recharge / params.nitro.rechargeTime : 0)) / charges;
    const bars = Math.floor((bh - 4) / 4);
    for (let i = 0; i < bars; i++) {
      const lit = i < Math.round(Math.min(1, fill) * bars);
      ctx.fillStyle = lit ? (n.active > 0 ? PALETTE.pink : i < bars * 0.15 ? '#ff3030' : '#2f7fff') : '#1c1a2c';
      ctx.fillRect(bx + 2, byy + bh - 4 - i * 4, bw - 4, 3);
    }
    // Uses left: a divider in the bar between charges, a pip per charge beside it
    // (pink for the one burning), and the count by the label.
    ctx.fillStyle = SHADOW;
    for (let k = 1; k < charges; k++) ctx.fillRect(bx + 1, Math.round(byy + bh - 2 - ((bh - 4) * k) / charges), bw - 2, 1);
    for (let k = 0; k < charges; k++) {
      const burning = n.active > 0 && k === n.charges;
      ctx.fillStyle = SHADOW;
      ctx.fillRect(bx + bw + 3, byy + bh - 7 - k * 8, 6, 6);
      ctx.fillStyle = burning ? PALETTE.pink : k < n.charges ? PALETTE.cyan : '#2a2340';
      ctx.fillRect(bx + bw + 2, byy + bh - 8 - k * 8, 6, 6);
    }
    text(`x${n.charges}`, bx + bw + 8, byy - 10, { color: n.charges ? PALETTE.cyan : DIM, align: 'right' });

    // Health and ammo panels, bottom-left (top-left on touch, where the steering
    // pad isn't), with the minimap above.
    const hx = 4;
    const hy = touchLayout ? 54 : H - 62;
    const hpFrac = Math.max(0, car.hp / car.maxHp);
    frame(hx, hy, 96, 22, 'HEALTH');
    for (let i = 0; i < 14; i++) {
      const lit = i < Math.ceil(hpFrac * 14);
      ctx.fillStyle = lit ? (hpFrac > 0.5 ? '#39d820' : hpFrac > 0.25 ? PALETTE.amber : PALETTE.pink) : '#1c1a2c';
      ctx.fillRect(hx + 4 + i * 6, hy + 12, 5, 6);
    }
    const ay = hy + 24;
    frame(hx, ay, 96, 34, 'AMMO');
    const primary = params.weapons?.primary;
    const pws = car.weapons?.primary;
    const primaryBroken = car.condition?.primaryWeapon <= 0;
    let ammoText = '--';
    let ammoColor = GOLD;
    if (primary && pws) {
      if (primaryBroken) [ammoText, ammoColor] = ['BROKEN', PALETTE.pink];
      else if (pws.reload > 0) [ammoText, ammoColor] = ['RELOAD', PALETTE.pink];
      else if (primary.ammo !== null) ammoText = String(pws.ammo);
      else if (car.overheated) [ammoText, ammoColor] = ['HOT', PALETTE.pink];
      else ammoText = 'INF';
    }
    text(ammoText, hx + 5, ay + 13, { scale: 2, color: ammoColor });
    // Cartridge icon.
    ctx.fillStyle = '#6a5018';
    ctx.fillRect(hx + 85, ay + 12, 5, 16);
    ctx.fillStyle = GOLD;
    ctx.fillRect(hx + 86, ay + 16, 3, 11);
    ctx.fillStyle = '#c8c8d0';
    ctx.fillRect(hx + 86, ay + 12, 3, 4);
    if (primary) text(WEAPON_LABELS[primary.type] || primary.type, hx + 92, ay + 3, { color: PALETTE.cyan, align: 'right' });

    // Secondary, utility and heat, a slim panel to the right of health and ammo.
    const sx = hx + 100;
    frame(sx, hy, 92, 58, 'SYSTEMS');
    let ly = hy + 14;
    const status = (name, value, bad) => {
      text(name, sx + 4, ly, { color: PALETTE.cyan });
      text(value, sx + 88, ly, { color: bad ? PALETTE.pink : '#ffffff', align: 'right' });
      ly += 10;
    };
    const secondary = params.weapons?.secondary;
    const sws = car.weapons?.secondary;
    if (secondary && sws) {
      const broken = car.condition?.secondaryWeapon <= 0;
      const value = broken ? 'BROKEN' : sws.reload > 0 ? 'RELOAD' : secondary.ammo !== null ? String(sws.ammo) : 'READY';
      status(WEAPON_LABELS[secondary.type] || secondary.type, value, broken || sws.reload > 0);
    }
    const u = params.weapons?.utility;
    if (u) {
      const cd = car.utility?.cooldown || 0;
      status(UTILITY_LABELS[u.type] || u.type, cd > 0 ? `${Math.ceil(cd)}S` : 'READY', cd > 0);
    }
    const heatCap = params.combat?.heatCapacity || 70;
    text('HEAT', sx + 4, hy + 46, { color: car.overheated ? PALETTE.pink : DIM });
    ctx.fillStyle = '#1c1a2c';
    ctx.fillRect(sx + 30, hy + 47, 56, 5);
    ctx.fillStyle = car.overheated ? PALETTE.pink : PALETTE.amber;
    ctx.fillRect(sx + 30, hy + 47, Math.round(Math.min(1, car.heat / heatCap) * 56), 5);

    // Minimap: the route (or arena outline), rivals and you, north up.
    if (minimap) this.drawMinimap(minimap, touchLayout ? W - 70 : 4, touchLayout ? 104 : hy - 70, 66, frame, px);

    // Markers over other cars: health bars, and the lock-on reticle.
    for (const m of markers) {
      const x = Math.round(((m.x + 1) / 2) * W);
      const y = Math.round(((1 - m.y) / 2) * H);
      ctx.fillStyle = SHADOW;
      ctx.fillRect(x - 11, y - 1, 22, 4);
      ctx.fillStyle = m.hp > 0.5 ? PALETTE.green : m.hp > 0.25 ? PALETTE.amber : PALETTE.pink;
      ctx.fillRect(x - 10, y, Math.max(1, Math.round(20 * m.hp)), 2);
      if (m.name) text(m.name, x, y - 9, { color: '#e8e8ff', align: 'center' });
      if (m.lock) {
        ctx.fillStyle = '#ff2030';
        const ry = y + 12;
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          ctx.fillRect(x + dx * 9 - (dx > 0 ? 4 : 0), ry + dy * 9, 5, 1);
          ctx.fillRect(x + dx * 9, ry + dy * 9 - (dy > 0 ? 4 : 0), 1, 5);
        }
        ctx.fillRect(x - 1, ry, 3, 1);
        ctx.fillRect(x, ry - 1, 1, 3);
      }
    }

    // Event overlays: countdown, GO, popups, shift light, finish and pit.
    if (eventInfo) {
      if (eventInfo.countdown) text(String(eventInfo.countdown), W / 2, H / 2 - 50, { scale: 6, color: PALETTE.amber, align: 'center' });
      if (eventInfo.go) text('GO!', W / 2, H / 2 - 50, { scale: 6, color: PALETTE.green, align: 'center' });
      eventInfo.popups.forEach((p, k) => text(p.text, W / 2, Math.round(H * 0.6 - k * 12 - p.age * 12), { color: p.color, align: 'center' }));
      if (eventInfo.manual && car.rpm > params.engine.redline * 0.9 && Math.floor(tick / 6) % 2 === 0) {
        text('SHIFT!', gx, touchLayout ? gy + R + 6 : gy - R - 18, { color: PALETTE.pink, align: 'center', scale: 2 });
      }
      if (eventInfo.finishedText) text(eventInfo.finishedText, W / 2, 64, { color: PALETTE.cyan, align: 'center', scale: 2 });
      if (eventInfo.inPit) text('PIT - REPAIRING', W / 2, 84, { color: PALETTE.cyan, align: 'center' });
      if (eventInfo.wrongWay && Math.floor(performance.now() / 350) % 2 === 0) text('WRONG WAY', W / 2, H / 2 - 50, { scale: 4, color: PALETTE.pink, align: 'center' });
    }
    if (car.shield > 0) text('SHIELD', W / 2, 60, { color: PALETTE.cyan, align: 'center', scale: 2 });
    if (car.wrecked) {
      text('WRECKED', W / 2, H / 2 - 20, { color: PALETTE.pink, align: 'center', scale: 3 });
      text(`RESPAWN IN ${Math.max(0, Math.ceil(car.wreckTimer))}`, W / 2, H / 2 + 6, { color: '#ffffff', align: 'center' });
    }

    if (showFps) text(`${Math.round(fps)} FPS`, W / 2, touchLayout ? H - 10 : 5, { color: '#6a6090', align: 'center' });
    if (label) text(label, touchLayout ? W / 2 : W / 2, touchLayout ? H - 20 : H - 10, { color: DIM, align: 'center' });
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
