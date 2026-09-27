import { drawText } from './bitmapFont.js';
import { SIM_HZ } from '../config.js';
import { PALETTE } from '../render/textures.js';

// Arcade-cabinet HUD drawn at the game's internal resolution, so its pixels match
// the 3D view exactly. The renderer composites this canvas in its post pass.

const SHADOW = '#0a0418';
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

  draw({ car, params, tick, fps, showFps, touchLayout }) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
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
    const speed = Math.round(Math.hypot(car.vel.x, car.vel.y, car.vel.z) * 3.6);
    const gear = car.reverse ? 'R' : String(car.gear);
    const blockW = 96;
    const blockH = 48;
    const bx = touchLayout ? Math.round(W / 2 - blockW / 2) : W - blockW - 6;
    const by = touchLayout ? 4 : H - blockH - 6;
    panel(bx, by, blockW, blockH);
    text(gear, bx + 6, by + 5, { scale: 3, color: car.reverse ? PALETTE.amber : PALETTE.pink });
    text(String(speed), bx + blockW - 6, by + 5, { scale: 3, color: '#ffffff', align: 'right' });
    text('GEAR', bx + 6, by + 29, { color: '#6a6090' });
    text('KM/H', bx + blockW - 6, by + 29, { color: PALETTE.cyan, align: 'right' });

    const segs = 12;
    const rpmFrac = Math.min(1, car.rpm / params.engine.redline);
    for (let i = 0; i < segs; i++) {
      const lit = i < Math.round(rpmFrac * segs);
      const color = i >= segs - 2 ? PALETTE.pink : i >= segs - 4 ? PALETTE.amber : PALETTE.cyan;
      ctx.fillStyle = lit ? color : '#241d3a';
      ctx.fillRect(bx + 6 + i * 7, by + 39, 5, 5);
    }

    // On touch the top-right corner belongs to the on-screen buttons.
    if (showFps) {
      const label = `${Math.round(fps)} FPS`;
      if (touchLayout) text(label, 8, 66, { color: '#6a6090' });
      else text(label, W - 32, 8, { color: '#6a6090', align: 'right' });
    }
  }
}
