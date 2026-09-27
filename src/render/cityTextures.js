import * as THREE from 'three';
import { canvasTexture, speckle, makeRng } from './textures.js';

// Textures for city districts: sidewalks, plain asphalt, lots, plaza tiles,
// dirt, car parks, corrugated metal, glass curtain walls, containers, and the
// irregular wet-patch shapes used for puddle decals.
export function createCityTextures() {
  const rng = makeRng(313);

  const sidewalk = canvasTexture(32, 32, (ctx, w, h) => {
    ctx.fillStyle = '#4a4652';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rng, ['#55505e', '#3e3a46', '#504b58'], 0.4);
    ctx.fillStyle = '#2e2a36';
    for (let k = 0; k < w; k += 16) {
      ctx.fillRect(k, 0, 1, h);
      ctx.fillRect(0, k, w, 1);
    }
  });

  const asphalt = canvasTexture(32, 32, (ctx, w, h) => {
    ctx.fillStyle = '#17161f';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rng, ['#1e1c28', '#121118', '#24222e'], 0.5);
  });

  const lot = canvasTexture(32, 32, (ctx, w, h) => {
    ctx.fillStyle = '#3a3642';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rng, ['#423e4a', '#302c38', '#46424e'], 0.45);
    ctx.fillStyle = '#2a2632';
    ctx.fillRect(0, 0, w, 1);
    ctx.fillRect(0, 0, 1, h);
  });

  const tiles = canvasTexture(32, 32, (ctx, w, h) => {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#4e4a5c' : '#5a5668';
        ctx.fillRect(x * 8, y * 8, 8, 8);
      }
    ctx.fillStyle = '#2e2a38';
    for (let k = 0; k < w; k += 8) {
      ctx.fillRect(k, 0, 1, h);
      ctx.fillRect(0, k, w, 1);
    }
    speckle(ctx, w, h, rng, ['rgba(0,0,0,0.25)'], 0.2);
  });

  const dirt = canvasTexture(32, 32, (ctx, w, h) => {
    ctx.fillStyle = '#4a3624';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rng, ['#5a4430', '#3a2a1c', '#624a34', '#2e2216'], 0.6);
  });

  const parking = canvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#1c1a24';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rng, ['#24222e', '#141219'], 0.4);
    ctx.fillStyle = '#b8b8c8';
    for (let x = 0; x < w; x += 12) ctx.fillRect(x, 4, 1, 22);
    for (let x = 0; x < w; x += 12) ctx.fillRect(x, 38, 1, 22);
  });

  const corrugated = canvasTexture(32, 32, (ctx, w, h) => {
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = x % 4 < 2 ? '#8a8a90' : '#6a6a72';
      ctx.fillRect(x, 0, 1, h);
    }
    speckle(ctx, w, h, rng, ['rgba(90,50,30,0.6)', 'rgba(40,30,30,0.5)'], 0.12);
    ctx.fillStyle = '#3a3a40';
    ctx.fillRect(0, h - 2, w, 2);
  });

  // Glass curtain wall with lit floors (and its emissive map).
  const glassLit = [];
  for (let y = 0; y < 32; y++) glassLit.push(rng() < 0.45 ? (rng() < 0.8 ? '#bfe8ff' : '#ffe0a8') : null);
  const glass = canvasTexture(32, 64, (ctx, w, h) => {
    ctx.fillStyle = '#1a2a3e';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < 32; y++) {
      ctx.fillStyle = y % 2 ? '#22364e' : '#1c2e44';
      ctx.fillRect(0, y * 2, w, 1);
    }
    ctx.fillStyle = '#0e1622';
    for (let x = 0; x < w; x += 4) ctx.fillRect(x, 0, 1, h);
  });
  const glassGlow = canvasTexture(32, 64, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    glassLit.forEach((c, y) => {
      if (!c) return;
      ctx.fillStyle = c;
      for (let x = 0; x < w; x += 4) if (rng() < 0.8) ctx.fillRect(x + 1, y * 2, 3, 1);
    });
  });

  const container = canvasTexture(32, 16, (ctx, w, h) => {
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = x % 3 === 0 ? '#a8a8b0' : '#e0e0e8';
      ctx.fillRect(x, 0, 1, h);
    }
    ctx.fillStyle = '#707078';
    ctx.fillRect(0, 0, w, 1);
    ctx.fillRect(0, h - 1, w, 1);
    speckle(ctx, w, h, rng, ['rgba(80,40,20,0.5)'], 0.1);
  });

  // Four irregular blob shapes (2x2 atlas) for wet patches: white = wet.
  const puddles = canvasTexture(
    128,
    128,
    (ctx) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 128, 128);
      for (let q = 0; q < 4; q++) {
        const ox = (q % 2) * 64;
        const oy = Math.floor(q / 2) * 64;
        const blobs = [];
        for (let k = 0; k < 5 + Math.floor(rng() * 6); k++) blobs.push([ox + 16 + rng() * 32, oy + 16 + rng() * 32, 5 + rng() * 12]);
        for (let y = 0; y < 64; y++)
          for (let x = 0; x < 64; x++) {
            let field = 0;
            for (const [bx, by, r] of blobs) field += (r * r) / ((ox + x - bx) ** 2 + (oy + y - by) ** 2 + 1);
            const edge = Math.min(1, Math.max(0, (field - 1) * 1.5 + (rng() - 0.5) * 0.3));
            const v = Math.round(edge * 255);
            ctx.fillStyle = `rgb(${v},${v},${v})`;
            ctx.fillRect(ox + x, oy + y, 1, 1);
          }
      }
    },
    { repeat: false, filter: THREE.LinearFilter },
  );

  return { sidewalk, asphalt, lot, tiles, dirt, parking, corrugated, glass, glassGlow, container, puddles };
}
