import * as THREE from 'three';
import { drawText, textWidth, GLYPH_H } from '../ui/bitmapFont.js';

// All textures are canvases generated at startup: detailed pixel art sampled with
// nearest-neighbour filtering, so texels stay crisp at the higher render resolution.

export const PALETTE = {
  night: '#0b0818',
  haze: '#161030', // horizon and fog colour
  skyTop: '#030208',
  asphalt: '#17161f',
  line: '#d8d8e8',
  pink: '#ff2a6d',
  cyan: '#05d9e8',
  amber: '#ffb000',
  green: '#39ff14',
  violet: '#b04dff',
  orange: '#ff7a1a',
  wall: '#23202c',
  wallDark: '#0e0c14',
  building: '#1c1a28',
  chevron: '#f2c200',
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

export function canvasTexture(w, h, draw, { repeat = true, filter = THREE.NearestFilter } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = filter;
  tex.minFilter = filter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function speckle(ctx, w, h, rng, colors, density) {
  for (let i = 0; i < w * h * density; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.fillRect(Math.floor(rng() * w), Math.floor(rng() * h), 1, 1);
  }
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];

export function createTextures() {
  const rng = makeRng(7);

  // Road: u spans the full road width, v runs along the track (one repeat = 16 m).
  const road = canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = PALETTE.asphalt;
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rng, ['#1e1c28', '#121118', '#24222e', '#1a1a26'], 0.5);
    // Wet patches are separate decals (see trackView buildPuddles) so they don't
    // repeat with the texture; here only faint, small oil stains.
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = 'rgba(8,8,14,0.35)';
      ctx.beginPath();
      ctx.ellipse(rng() * w, rng() * h, 2 + rng() * 5, 3 + rng() * 8, rng() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Cracks.
    ctx.fillStyle = '#0b0a10';
    for (let i = 0; i < 40; i++) {
      let x = Math.floor(rng() * w);
      let y = Math.floor(rng() * h);
      for (let k = 0; k < 6; k++) {
        ctx.fillRect(x, y, 1, 1);
        x += Math.round(rng() * 2 - 1);
        y += 1;
      }
    }
    // Lane markings, slightly worn.
    ctx.fillStyle = PALETTE.line;
    ctx.fillRect(3, 0, 2, h);
    ctx.fillRect(w - 5, 0, 2, h);
    for (const lx of [Math.round(w / 3), Math.round((2 * w) / 3)]) ctx.fillRect(lx - 1, 0, 2, h / 2);
    speckle(ctx, w, h, rng, ['rgba(20,18,28,0.9)'], 0.06);
  });

  const curb = canvasTexture(8, 16, (ctx) => {
    ctx.fillStyle = '#c8203c';
    ctx.fillRect(0, 0, 8, 8);
    ctx.fillStyle = '#e0e0ec';
    ctx.fillRect(0, 8, 8, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 7, 8, 1);
    ctx.fillRect(0, 15, 8, 1);
  });

  const shoulder = canvasTexture(32, 32, (ctx, w, h) => {
    ctx.fillStyle = '#18161f';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rng, ['#201d2a', '#100e16', '#26232f'], 0.5);
  });

  // Barrier: black panel with yellow chevrons and a steel rail on top.
  const wall = canvasTexture(64, 32, (ctx, w, h) => {
    ctx.fillStyle = PALETTE.wallDark;
    ctx.fillRect(0, 0, w, h);
    for (let y = 7; y < h - 3; y++)
      for (let x = 0; x < w; x++) {
        const d = (x + Math.abs(y - 17.5)) % 16;
        if (d < 6) {
          ctx.fillStyle = d < 1 ? '#8a6e00' : PALETTE.chevron;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    ctx.fillStyle = '#4a4858';
    ctx.fillRect(0, 0, w, 4);
    ctx.fillStyle = '#7a7890';
    ctx.fillRect(0, 1, w, 1);
    ctx.fillStyle = '#05040a';
    ctx.fillRect(0, h - 3, w, 3);
    speckle(ctx, w, h, rng, ['rgba(0,0,0,0.5)', 'rgba(90,70,40,0.5)'], 0.08);
  });

  const ground = canvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#0c0a14';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rng, ['#13101c', '#08070e'], 0.4);
    ctx.fillStyle = '#1a1628';
    ctx.fillRect(0, 0, w, 1);
    ctx.fillRect(0, 0, 1, h);
  });

  // Building walls and their lit windows (emissive map). 16 x 32 window cells of
  // 4 px. Texel (0,0) is plain wall, which roofs sample.
  const windowRng = makeRng(11);
  const warm = ['#ffcf8a', '#ffd9a0', '#ffb860', '#fff0c8'];
  const neon = [PALETTE.cyan, PALETTE.pink, PALETTE.violet];
  const lit = [];
  for (let y = 0; y < 32; y++) {
    const floorLit = windowRng() < 0.04; // occasional fully lit floor
    for (let x = 0; x < 16; x++) {
      const on = floorLit || windowRng() < 0.14;
      lit.push(on && !(x === 0 && y === 0) ? (windowRng() < 0.85 ? pick(windowRng, warm) : pick(windowRng, neon)) : null);
    }
  }
  const building = canvasTexture(64, 128, (ctx, w, h) => {
    ctx.fillStyle = PALETTE.building;
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, windowRng, ['#16141f', '#242132', '#1f1c2b'], 0.3);
    for (let y = 0; y < 32; y++) {
      ctx.fillStyle = '#2a2738';
      ctx.fillRect(0, y * 4 + 3, w, 1); // floor ledge
      for (let x = 0; x < 16; x++) {
        ctx.fillStyle = '#0b0a12';
        ctx.fillRect(x * 4 + 1, y * 4, 2, 3);
      }
    }
  });
  const buildingGlow = canvasTexture(64, 128, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 16; x++) {
        const c = lit[y * 16 + x];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x * 4 + 1, y * 4, 2, 3);
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
  const skyline = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    let x = 0;
    while (x < w) {
      const bw = 8 + Math.floor(skyRng() * 22);
      const bh = 24 + Math.floor(skyRng() * 96);
      ctx.fillStyle = skyRng() < 0.5 ? '#0e0a1c' : '#120d22';
      ctx.fillRect(x, h - bh, bw, bh);
      for (let wy = h - bh + 3; wy < h - 1; wy += 3)
        for (let wx = x + 1; wx < x + bw - 1; wx += 2)
          if (skyRng() < 0.09) {
            ctx.fillStyle = skyRng() < 0.8 ? pick(skyRng, warm) : pick(skyRng, neon);
            ctx.fillRect(wx, wy, 1, 1);
          }
      if (skyRng() < 0.2) {
        ctx.fillStyle = pick(skyRng, [PALETTE.pink, PALETTE.cyan, '#ff3030']);
        ctx.fillRect(x + Math.floor(bw / 2), h - bh - 6, 1, 6);
      }
      x += bw;
    }
  });
  skyline.wrapT = THREE.ClampToEdgeWrapping;

  const radial = (inner, outer) =>
    canvasTexture(
      32,
      32,
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

  // Screen-space sky: near-black overhead fading to the horizon haze.
  const sky = canvasTexture(
    2,
    128,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, PALETTE.skyTop);
      g.addColorStop(0.35, '#0a0718');
      g.addColorStop(0.5, PALETTE.haze);
      g.addColorStop(1, PALETTE.haze);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    { repeat: false, filter: THREE.LinearFilter },
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

// Glossy surfaces (wet road, car paint) reflect this: a dark night panorama with a
// band of neon around the horizon, prefiltered for roughness.
export function createEnvMap(renderer) {
  const envRng = makeRng(99);
  const tex = canvasTexture(
    512,
    256,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#020106');
      g.addColorStop(0.45, '#1a1236');
      g.addColorStop(0.5, '#2a1840');
      g.addColorStop(0.55, '#0a0810');
      g.addColorStop(1, '#050408');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const bw = 3 + envRng() * 14;
        const bh = 4 + envRng() * 34;
        ctx.fillStyle = pick(envRng, [PALETTE.pink, PALETTE.cyan, PALETTE.amber, PALETTE.violet, '#ffd9a0', '#ffffff']);
        ctx.fillRect(envRng() * w, h * 0.5 - bh - envRng() * 20, bw, bh);
      }
    },
    { filter: THREE.LinearFilter },
  );
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

// Neon signs packed into one atlas: horizontal boards, vertical boards and a skull
// billboard. Each rect gives UVs plus width/height aspect.
const HORIZONTAL_SIGNS = [
  ['TORQUE & TRIGGER', PALETTE.pink],
  ['NEON SPRAWL', PALETTE.cyan],
  ['KESSLER V8', PALETTE.amber],
  ['MAG-COIL', PALETTE.cyan],
  ['HELLCAR', PALETTE.orange],
  ['CYBERNET', PALETTE.cyan],
  ['NOODLES 24H', PALETTE.pink],
  ['NO LIMITS', PALETTE.amber],
];
const VERTICAL_SIGNS = [
  ['HOTEL', PALETTE.pink],
  ['SYNCORP', PALETTE.violet],
  ['BE FAST', PALETTE.cyan],
  ['RUST', PALETTE.orange],
  ['CLUB', PALETTE.pink],
  ['OPEN', PALETTE.green],
];
const SKULL = [
  '..#######..',
  '.#########.',
  '###########',
  '##...#...##',
  '##...#...##',
  '###########',
  '.####.####.',
  '..#######..',
  '..#.#.#.#..',
  '..#######..',
];

function createSignAtlas() {
  const S = 3; // font scale inside the atlas
  const W = 512;
  const H = 512;
  const rects = [];
  const vertical = [];
  let skull = null;
  const rect = (x, y, w, h) => ({ u0: x / W, u1: (x + w) / W, v0: 1 - (y + h) / H, v1: 1 - y / H, aspect: w / h });
  const frame = (ctx, x, y, w, h, color) => {
    ctx.fillStyle = '#07040f';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, 2);
    ctx.fillRect(x, y + h - 2, w, 2);
    ctx.fillRect(x, y, 2, h);
    ctx.fillRect(x + w - 2, y, 2, h);
  };

  const texture = canvasTexture(
    W,
    H,
    (ctx) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      const rowH = GLYPH_H * S + 14;
      HORIZONTAL_SIGNS.forEach(([text, color], i) => {
        const w = textWidth(text, S) + 16;
        const y = i * (rowH + 4);
        frame(ctx, 0, y, w, rowH, color);
        drawText(ctx, text, 8, y + 7, { scale: S, color });
        rects.push(rect(0, y, w, rowH));
      });
      const colW = 5 * S + 14;
      VERTICAL_SIGNS.forEach(([text, color], i) => {
        const x = 320 + i * (colW + 3);
        const h = text.length * (GLYPH_H * S + 3) + 12;
        frame(ctx, x, 0, colW, h, color);
        [...text].forEach((ch, k) => drawText(ctx, ch, x + 7, 7 + k * (GLYPH_H * S + 3), { scale: S, color }));
        vertical.push(rect(x, 0, colW, h));
      });
      // Skull billboard: "DIE" / skull / "FAST".
      const sx = 330;
      const sy = 250;
      const sw = 120;
      const sh = 170;
      frame(ctx, sx, sy, sw, sh, PALETTE.pink);
      drawText(ctx, 'DIE', sx + sw / 2, sy + 10, { scale: 4, color: PALETTE.pink, align: 'center' });
      ctx.fillStyle = '#ff6aa0';
      SKULL.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) if (row[rx] === '#') ctx.fillRect(sx + 27 + rx * 6, sy + 50 + ry * 6, 6, 6);
      });
      drawText(ctx, 'FAST', sx + sw / 2, sy + 122, { scale: 4, color: PALETTE.pink, align: 'center' });
      skull = rect(sx, sy, sw, sh);
    },
    { repeat: false },
  );
  return { texture, rects, vertical, skull };
}
