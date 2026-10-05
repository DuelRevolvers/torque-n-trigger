import { canvasTexture } from './textures.js';
import { drawText } from '../ui/bitmapFont.js';

// Billboard ads: pixel art, 192 × 64 (a billboard's face is three times as
// wide as it's tall). The T&T SDK's Billboard picks one (its Ad option).
export const ADS = {
  kessler: 'Kessler Motors',
  magcoil: 'Mag-Coil',
  volt: 'Volt energy drink',
  noodle: 'Neon Noodle',
  syncorp: 'Syncorp',
  salvage: 'Rustline Salvage',
  palace: 'The Glow Palace',
  skyline: 'Skyline Insurance',
};

const rect = (ctx, color, x, y, w, h) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};
// Words in the game's pixel font, centred on x in the space right of the picture.
const say = (ctx, text, x, y, color, scale = 1) => drawText(ctx, text, x, y, { color, scale, align: 'center' });

const DRAW = {
  kessler(ctx, w, h) {
    rect(ctx, '#0a1a3a', 0, 0, w, h);
    rect(ctx, '#0e2a4e', 0, 50, w, 14);
    // A Kessler coupe: body, cabin, its glass, wheels, a headlight.
    rect(ctx, '#c8ccd4', 12, 32, 66, 12);
    rect(ctx, '#c8ccd4', 26, 22, 34, 11);
    rect(ctx, '#0a1a3a', 29, 24, 13, 8);
    rect(ctx, '#0a1a3a', 45, 24, 12, 8);
    rect(ctx, '#101018', 20, 42, 12, 8);
    rect(ctx, '#101018', 58, 42, 12, 8);
    rect(ctx, '#fff4d0', 75, 35, 3, 3);
    rect(ctx, '#05d9e8', 12, 44, 66, 1);
    say(ctx, 'KESSLER', 136, 8, '#e8f4ff', 2);
    say(ctx, 'MOTORS', 136, 28, '#05d9e8');
    say(ctx, 'BUILT TOUGH', 136, 44, '#8ab4d8');
  },
  magcoil(ctx, w, h) {
    rect(ctx, '#1e0830', 0, 0, w, h);
    // The coil: turns of copper, lit; a bolt beside it.
    for (let i = 0; i < 6; i++) {
      rect(ctx, '#b44dff', 14 + i * 9, 16, 6, 32);
      rect(ctx, '#e8c8ff', 15 + i * 9, 18, 2, 28);
    }
    rect(ctx, '#5a2a7a', 10, 30, 60, 4);
    for (const [x, y] of [[80, 12], [77, 18], [74, 24], [78, 26], [75, 32], [72, 38], [69, 44]]) rect(ctx, '#ffd23a', x, y, 5, 6);
    say(ctx, 'MAG-COIL', 136, 12, '#e8d8ff', 2);
    say(ctx, 'SILENT POWER', 136, 38, '#b44dff');
  },
  volt(ctx, w, h) {
    rect(ctx, '#081408', 0, 0, w, h);
    // A can: its lid, its label.
    rect(ctx, '#39ff14', 28, 10, 26, 46);
    rect(ctx, '#c8c8c8', 28, 7, 26, 4);
    rect(ctx, '#081408', 28, 26, 26, 13);
    say(ctx, 'V', 41, 29, '#39ff14');
    rect(ctx, '#a0ff80', 30, 12, 3, 12);
    say(ctx, 'VOLT', 130, 6, '#39ff14', 3);
    say(ctx, 'STAY WIRED', 130, 40, '#e8ffe0');
  },
  noodle(ctx, w, h) {
    rect(ctx, '#2a0610', 0, 0, w, h);
    // A bowl of noodles, steaming, chopsticks in it.
    for (let i = 0; i < 4; i++) rect(ctx, '#e8e0d0', 30 + i * 6, 8 + (i % 2) * 3, 2, 9);
    rect(ctx, '#ffd9a0', 22, 28, 46, 5);
    for (let x = 24; x < 66; x += 5) rect(ctx, '#ffe8b8', x, 26 + ((x / 5) % 2) * 2, 3, 3);
    rect(ctx, '#ff2a6d', 18, 33, 54, 7);
    rect(ctx, '#ff2a6d', 23, 40, 44, 6);
    rect(ctx, '#c81e50', 30, 46, 30, 4);
    rect(ctx, '#8a5a2a', 60, 10, 2, 24);
    rect(ctx, '#8a5a2a', 64, 12, 2, 22);
    say(ctx, 'NEON', 134, 4, '#ff2a6d', 2);
    say(ctx, 'NOODLE', 134, 22, '#ffd9a0', 2);
    say(ctx, 'OPEN ALL NIGHT', 134, 46, '#ff8ab4');
  },
  syncorp(ctx, w, h) {
    rect(ctx, '#e8e8ec', 0, 0, w, h);
    // Its mark: a dark square, a cyan diamond in it.
    rect(ctx, '#1a1a2a', 18, 10, 44, 44);
    for (let i = 0; i < 9; i++) rect(ctx, '#05d9e8', 40 - i * 2, 16 + i * 2, i * 4 + 2, 2);
    for (let i = 0; i < 8; i++) rect(ctx, '#05d9e8', 26 + i * 2, 34 + i * 2, 28 - i * 4, 2);
    say(ctx, 'SYNCORP', 132, 14, '#1a1a2a', 2);
    say(ctx, 'TOMORROW TODAY', 132, 40, '#4a4a5a');
  },
  salvage(ctx, w, h) {
    rect(ctx, '#2a1408', 0, 0, w, h);
    // A wrench across a cog.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      rect(ctx, '#8a4a20', 40 + Math.cos(a) * 18 - 4, 32 + Math.sin(a) * 18 - 4, 8, 8);
    }
    rect(ctx, '#8a4a20', 26, 18, 28, 28);
    rect(ctx, '#2a1408', 34, 26, 12, 12);
    for (let i = 0; i < 10; i++) rect(ctx, '#d8d0c8', 16 + i * 5, 50 - i * 4, 7, 5);
    rect(ctx, '#d8d0c8', 64, 6, 10, 8);
    say(ctx, 'RUSTLINE', 136, 4, '#ff7a1a', 2);
    say(ctx, 'SALVAGE', 136, 22, '#ffb070', 2);
    say(ctx, 'PARTS FOR LESS', 136, 46, '#e8d0b8');
  },
  palace(ctx, w, h) {
    rect(ctx, '#0a0806', 0, 0, w, h);
    rect(ctx, '#ffc850', 0, 0, w, 2);
    rect(ctx, '#ffc850', 0, h - 2, w, 2);
    // A star, and lights round the frame.
    for (let i = 0; i < 9; i++) rect(ctx, '#ffc850', 40 - i, 12 + i * 2, i * 2 + 1, 2);
    rect(ctx, '#ffc850', 22, 30, 37, 5);
    for (let i = 0; i < 8; i++) rect(ctx, '#ffc850', 30 - i + i * 2, 35 + i * 2, 21 - i * 2 + i, 2);
    for (let x = 6; x < w; x += 12) rect(ctx, x % 24 ? '#ff2a6d' : '#ffffff', x, 4, 2, 2);
    say(ctx, 'GLOW', 134, 6, '#ffc850', 2);
    say(ctx, 'PALACE', 134, 24, '#ffc850', 2);
    say(ctx, 'JACKPOTS NIGHTLY', 134, 46, '#ff2a6d');
  },
  skyline(ctx, w, h) {
    const sky = ['#2a1a4a', '#4a2050', '#7a2a50', '#b04a4a', '#e07a3a', '#ffb04a', '#ffd27a', '#ffe8b0'];
    sky.forEach((c, i) => rect(ctx, c, 0, i * 8, w, 8));
    // The city against it, an umbrella over it.
    for (const [x, bh] of [[4, 22], [16, 34], [26, 18], [36, 40], [48, 26], [58, 30], [70, 20]]) rect(ctx, '#0a0a14', x, h - bh, 10, bh);
    for (let i = 0; i < 11; i++) rect(ctx, '#e8e8f0', 18 + i * 3, 12 - Math.abs(i - 5) + 5, 3, 2);
    rect(ctx, '#e8e8f0', 33, 16, 2, 12);
    say(ctx, 'SKYLINE', 136, 8, '#ffffff', 2);
    say(ctx, 'INSURANCE', 136, 28, '#1a1a2a');
    say(ctx, 'GOT YOU COVERED', 136, 44, '#1a1a2a');
  },
};

const cache = new Map();
export function adTexture(kind) {
  if (!cache.has(kind)) cache.set(kind, canvasTexture(192, 64, (ctx, w, h) => (DRAW[kind] || DRAW.kessler)(ctx, w, h), { repeat: false }));
  return cache.get(kind);
}
