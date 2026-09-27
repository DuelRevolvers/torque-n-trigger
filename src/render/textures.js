import * as THREE from 'three';
import { drawText, textWidth } from '../ui/bitmapFont.js';

// All textures are tiny canvases generated at startup and sampled with
// nearest-neighbour filtering, so every texel reads as a chunky pixel.

export const PALETTE = {
  night: '#160a2b',
  haze: '#2b0e48', // horizon and fog colour
  skyTop: '#06020e',
  asphalt: '#1d1a2e',
  asphaltLight: '#27233b',
  line: '#c8c8e8',
  pink: '#ff2a6d',
  cyan: '#05d9e8',
  amber: '#ffb000',
  green: '#39ff14',
  violet: '#8a2be2',
  wall: '#2a2340',
  wallDark: '#15112a',
  building: '#221b3d',
};

// Small deterministic RNG so the city looks the same every load.
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(w, h, draw, { repeat = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function speckle(ctx, w, h, rng, colors, density) {
  for (let i = 0; i < w * h * density; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.fillRect(Math.floor(rng() * w), Math.floor(rng() * h), 1, 1);
  }
}

export function createTextures() {
  const rng = makeRng(7);

  // Road: u spans the full road width, v runs along the track.
  const road = canvasTexture(64, 32, (ctx, w, h) => {
    ctx.fillStyle = PALETTE.asphalt;
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rng, [PALETTE.asphaltLight, '#141122', '#2e2944'], 0.25);
    ctx.fillStyle = PALETTE.line;
    ctx.fillRect(2, 0, 1, h);
    ctx.fillRect(w - 3, 0, 1, h);
    ctx.fillStyle = '#9a9ac0';
    ctx.fillRect(Math.round(w / 3), 0, 1, h / 2);
    ctx.fillRect(Math.round((2 * w) / 3), 0, 1, h / 2);
  });

  const curb = canvasTexture(4, 8, (ctx) => {
    ctx.fillStyle = PALETTE.pink;
    ctx.fillRect(0, 0, 4, 4);
    ctx.fillStyle = '#e8e8ff';
    ctx.fillRect(0, 4, 4, 4);
  });

  const shoulder = canvasTexture(16, 16, (ctx, w, h) => {
    ctx.fillStyle = '#1a1628';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rng, ['#231e36', '#110e1c', '#2b2540'], 0.4);
  });

  // Barrier: dark panels with a neon cyan strip along the top.
  const wall = canvasTexture(16, 16, (ctx, w, h) => {
    ctx.fillStyle = PALETTE.wall;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = PALETTE.wallDark;
    ctx.fillRect(0, 0, 1, h);
    ctx.fillRect(8, 0, 1, h);
    ctx.fillStyle = '#3a3158';
    ctx.fillRect(0, 6, w, 1);
    ctx.fillStyle = PALETTE.cyan;
    ctx.fillRect(0, 13, w, 2);
  });

  const ground = canvasTexture(32, 32, (ctx, w, h) => {
    ctx.fillStyle = '#0d0818';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rng, ['#140d24', '#0a0614'], 0.3);
    ctx.fillStyle = '#2a1a4a';
    ctx.fillRect(0, 0, w, 1);
    ctx.fillRect(0, 0, 1, h);
  });

  // Building walls and their lit windows (emissive map). Texel (0,0) is plain wall,
  // which roofs sample.
  const windowRng = makeRng(11);
  const litColors = [PALETTE.amber, PALETTE.cyan, PALETTE.pink, '#ffe8b0', '#b0f0ff'];
  const litMap = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) litMap.push(windowRng() < 0.3 ? litColors[Math.floor(windowRng() * litColors.length)] : null);
  const building = canvasTexture(32, 64, (ctx, w, h) => {
    ctx.fillStyle = PALETTE.building;
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, windowRng, ['#1d1734', '#282046'], 0.15);
    for (let y = 0; y < 16; y++) {
      ctx.fillStyle = '#2e2650';
      ctx.fillRect(0, y * 4, w, 1); // floor line
      for (let x = 0; x < 8; x++) {
        ctx.fillStyle = '#120e24';
        ctx.fillRect(x * 4 + 1, y * 4 + 1, 2, 2);
      }
    }
  });
  const buildingGlow = canvasTexture(32, 64, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 8; x++) {
        const c = litMap[y * 8 + x];
        if (!c || (x === 0 && y === 0)) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x * 4 + 1, y * 4 + 1, 2, 2);
      }
  });

  const checker = canvasTexture(8, 2, (ctx) => {
    for (let x = 0; x < 8; x++)
      for (let y = 0; y < 2; y++) {
        ctx.fillStyle = (x + y) % 2 ? '#101010' : '#f0f0f0';
        ctx.fillRect(x, y, 1, 1);
      }
  });

  // Distant skyline silhouettes; transparent above the buildings.
  const skyRng = makeRng(23);
  const skyline = canvasTexture(256, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    let x = 0;
    while (x < w) {
      const bw = 6 + Math.floor(skyRng() * 14);
      const bh = 12 + Math.floor(skyRng() * 44);
      ctx.fillStyle = skyRng() < 0.5 ? '#1a0930' : '#1f0b38';
      ctx.fillRect(x, h - bh, bw, bh);
      for (let wy = h - bh + 2; wy < h - 1; wy += 3)
        for (let wx = x + 1; wx < x + bw - 1; wx += 2)
          if (skyRng() < 0.1) {
            ctx.fillStyle = litColors[Math.floor(skyRng() * litColors.length)];
            ctx.fillRect(wx, wy, 1, 1);
          }
      if (skyRng() < 0.15) {
        ctx.fillStyle = skyRng() < 0.5 ? PALETTE.pink : PALETTE.cyan;
        ctx.fillRect(x + Math.floor(bw / 2), h - bh - 4, 1, 4);
      }
      x += bw;
    }
  });
  skyline.wrapT = THREE.ClampToEdgeWrapping;

  const radial = (inner, outer) =>
    canvasTexture(
      16,
      16,
      (ctx, w, h) => {
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const d = Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2) / (w / 2);
            const a = Math.max(0, 1 - d);
            ctx.fillStyle = `rgba(${inner},${Math.round(a * a * outer * 1000) / 1000})`;
            ctx.fillRect(x, y, 1, 1);
          }
      },
      { repeat: false },
    );

  // Screen-space sky: near-black overhead fading to the magenta horizon haze.
  const sky = canvasTexture(
    2,
    64,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, PALETTE.skyTop);
      g.addColorStop(0.3, '#140630');
      g.addColorStop(0.5, PALETTE.haze);
      g.addColorStop(1, PALETTE.haze);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    { repeat: false },
  );

  return {
    sky,
    road,
    curb,
    shoulder,
    wall,
    ground,
    building,
    buildingGlow,
    checker,
    skyline,
    shadow: radial('0,0,0', 0.85),
    glow: radial('255,255,255', 1),
    signs: createSignAtlas(),
  };
}

// Neon sign texts packed into one atlas. Returns the texture and the UV rect of
// each sign.
export const SIGN_TEXTS = [
  ['TORQUE & TRIGGER', PALETTE.pink],
  ['NEON SPRAWL', PALETTE.cyan],
  ['KESSLER V8', PALETTE.amber],
  ['MAG-COIL', PALETTE.cyan],
  ['RUSTLINE', PALETTE.green],
  ['NOODLES 24H', PALETTE.pink],
  ['CHROME HEIGHTS', PALETTE.violet],
  ['NO LIMITS', PALETTE.amber],
];

function createSignAtlas() {
  const rowH = 11;
  const w = 128;
  const h = 128;
  const rects = [];
  const texture = canvasTexture(
    w,
    h,
    (ctx) => {
      ctx.fillStyle = '#07040f';
      ctx.fillRect(0, 0, w, h);
      SIGN_TEXTS.forEach(([text, color], i) => {
        const tw = textWidth(text) + 6;
        const y = i * (rowH + 4) + 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, y + 0.5, tw - 1, rowH - 1);
        drawText(ctx, text, 3, y + 2, { color });
        rects.push({ u0: 0, u1: tw / w, v0: 1 - (y + rowH) / h, v1: 1 - y / h, aspect: tw / rowH });
      });
    },
    { repeat: false },
  );
  return { texture, rects };
}
