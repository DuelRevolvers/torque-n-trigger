import { drawText } from './bitmapFont.js';
import { SIM_HZ } from '../config.js';
import { PALETTE } from '../render/textures.js';

// Arcade-cabinet HUD drawn at the game's internal resolution, so its pixels match
// the 3D view exactly. The renderer composites this canvas in its post pass.

const SHADOW = '#0a0418';
const WEAPON_LABELS = {
  chaingun: 'CHAIN GUN', scatter: 'SCATTER', plasma: 'PLASMA', flamethrower: 'FLAMER', railgun: 'RAIL GUN',
  mines: 'MINES', turret: 'TURRET', rockets: 'ROCKETS', tesla: 'TESLA',
};
const UTILITY_LABELS = { oil: 'OIL SLICK', smoke: 'SMOKE', shield: 'SHIELD', repair: 'REPAIR' };
const PANEL = 'rgba(10, 4, 26, 0.72)';

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
  }

  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  draw({ car, params, tick, fps, showFps, touchLayout, label, units = 'kmh', markers = [] }) {
    const { ctx, canvas } = this;
    // Layout is in 270-line units, scaled up by an integer so the pixel font stays
    // crisp and readable at any internal resolution.
    const S = Math.max(1, Math.round(canvas.height / 270));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(S, 0, 0, S, 0, 0);
    const W = Math.floor(canvas.width / S);
    const H = Math.floor(canvas.height / S);
    const text = (t, x, y, opts = {}) => drawText(ctx, t, x, y, { shadow: SHADOW, ...opts });
    const panel = (x, y, w, h) => {
      ctx.fillStyle = PANEL;
      ctx.fillRect(x, y, w, h);
    };

    // Lap timing, top-left.
    const r = car.race;
    const current = r.lapStart >= 0 ? tick - r.lapStart : -1;
    panel(4, 4, 92, 38);
    text(`LAP ${Math.max(1, r.lap)}`, 8, 8, { color: PALETTE.cyan });
    text(formatTime(current), 8, 18, { color: '#ffffff' });
    text(`BEST ${formatTime(r.bestLap)}`, 8, 30, { color: PALETTE.amber });

    // Nitro charges under the lap panel.
    const n = car.nitro;
    text('N2O', 8, 48, { color: PALETTE.cyan });
    for (let i = 0; i < params.nitro.charges; i++) {
      ctx.fillStyle = SHADOW;
      ctx.fillRect(30 + i * 9, 48, 7, 7);
      ctx.fillStyle = i < n.charges ? PALETTE.cyan : '#2a2340';
      ctx.fillRect(29 + i * 9, 47, 7, 7);
    }
    if (n.active > 0) {
      const w = Math.round((n.active / params.nitro.duration) * 60);
      ctx.fillStyle = PALETTE.pink;
      ctx.fillRect(8, 58, w, 3);
    } else if (n.charges < params.nitro.charges) {
      const w = Math.round((n.recharge / params.nitro.rechargeTime) * 60);
      ctx.fillStyle = '#3a3158';
      ctx.fillRect(8, 58, w, 2);
    }

    // Speed, gear and rev bar: bottom-right on desktop, top-centre on touch.
    const kmh = Math.hypot(car.vel.x, car.vel.y, car.vel.z) * 3.6;
    const speed = Math.round(units === 'mph' ? kmh * 0.6214 : kmh);
    const gear = car.reverse ? 'R' : String(car.gear);
    const blockW = 96;
    const blockH = 48;
    const bx = touchLayout ? Math.round(W / 2 - blockW / 2) : W - blockW - 6;
    const by = touchLayout ? 4 : H - blockH - 6;
    panel(bx, by, blockW, blockH);
    text(gear, bx + 6, by + 5, { scale: 3, color: car.reverse ? PALETTE.amber : PALETTE.pink });
    text(String(speed), bx + blockW - 6, by + 5, { scale: 3, color: '#ffffff', align: 'right' });
    text('GEAR', bx + 6, by + 29, { color: '#6a6090' });
    text(units === 'mph' ? 'MPH' : 'KM/H', bx + blockW - 6, by + 29, { color: PALETTE.cyan, align: 'right' });

    const segs = 12;
    const rpmFrac = Math.min(1, car.rpm / params.engine.redline);
    for (let i = 0; i < segs; i++) {
      const lit = i < Math.round(rpmFrac * segs);
      const color = i >= segs - 2 ? PALETTE.pink : i >= segs - 4 ? PALETTE.amber : PALETTE.cyan;
      ctx.fillStyle = lit ? color : '#241d3a';
      ctx.fillRect(bx + 6 + i * 7, by + 39, 5, 5);
    }

    // Markers over other cars: health bars, and the lock-on reticle.
    for (const m of markers) {
      const x = Math.round(((m.x + 1) / 2) * W);
      const y = Math.round(((1 - m.y) / 2) * H);
      ctx.fillStyle = SHADOW;
      ctx.fillRect(x - 11, y - 1, 22, 4);
      ctx.fillStyle = m.hp > 0.5 ? PALETTE.green : m.hp > 0.25 ? PALETTE.amber : PALETTE.pink;
      ctx.fillRect(x - 10, y, Math.max(1, Math.round(20 * m.hp)), 2);
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

    // Combat panel: health, heat, weapons and utility.
    const cx = 8;
    const cy = touchLayout ? 88 : H - 84;
    panel(4, cy - 4, 128, 62);
    const hpFrac = Math.max(0, car.hp / car.maxHp);
    text('HEALTH', cx, cy, { color: '#a89fd0' });
    for (let i = 0; i < 12; i++) {
      const lit = i < Math.ceil(hpFrac * 12);
      ctx.fillStyle = lit ? (hpFrac > 0.5 ? PALETTE.green : hpFrac > 0.25 ? PALETTE.amber : PALETTE.pink) : '#241d3a';
      ctx.fillRect(cx + 42 + i * 6, cy, 5, 7);
    }
    const heatCap = params.combat?.heatCapacity || 70;
    text('HEAT', cx, cy + 11, { color: car.overheated ? PALETTE.pink : '#a89fd0' });
    ctx.fillStyle = '#241d3a';
    ctx.fillRect(cx + 42, cy + 12, 71, 5);
    ctx.fillStyle = car.overheated ? PALETTE.pink : PALETTE.amber;
    ctx.fillRect(cx + 42, cy + 12, Math.round(Math.min(1, car.heat / heatCap) * 71), 5);
    const line = (name, status, y, bad) => {
      text(name, cx, y, { color: PALETTE.cyan });
      text(status, cx + 116, y, { color: bad ? PALETTE.pink : '#ffffff', align: 'right' });
    };
    let ly = cy + 22;
    for (const slot of ['primary', 'secondary']) {
      const w = params.weapons?.[slot];
      const ws = car.weapons?.[slot];
      if (!w || !ws) continue;
      const broken = car.condition?.[slot === 'primary' ? 'primaryWeapon' : 'secondaryWeapon'] <= 0;
      const status = broken ? 'BROKEN' : ws.reload > 0 ? 'RELOAD' : w.ammo !== null ? String(ws.ammo) : car.overheated ? 'HOT' : 'READY';
      line(WEAPON_LABELS[w.type] || w.type, status, ly, broken || ws.reload > 0 || status === 'HOT');
      ly += 10;
    }
    const u = params.weapons?.utility;
    if (u) {
      const cd = car.utility?.cooldown || 0;
      line(UTILITY_LABELS[u.type] || u.type, cd > 0 ? `${Math.ceil(cd)}S` : 'READY', ly, cd > 0);
    }
    text(`KO ${car.takedowns || 0}`, 70, 48, { color: PALETTE.amber });
    if (car.shield > 0) text('SHIELD', W / 2, 60, { color: PALETTE.cyan, align: 'center', scale: 2 });
    if (car.wrecked) {
      text('WRECKED', W / 2, H / 2 - 20, { color: PALETTE.pink, align: 'center', scale: 3 });
      text(`RESPAWN IN ${Math.max(0, Math.ceil(car.wreckTimer))}`, W / 2, H / 2 + 6, { color: '#ffffff', align: 'center' });
    }

    // On touch the top-right corner belongs to the on-screen buttons.
    if (showFps) {
      const label = `${Math.round(fps)} FPS`;
      if (touchLayout) text(label, 8, 66, { color: '#6a6090' });
      else text(label, W - 32, 8, { color: '#6a6090', align: 'right' });
    }
    if (label) text(label, 8, touchLayout ? 76 : H - 14, { color: '#a89fd0' });
  }
}
