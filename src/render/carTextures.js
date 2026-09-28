import * as THREE from 'three';
import { makeRng, PALETTE } from './textures.js';
import { textWidth } from '../ui/bitmapFont.js';
import { QUALITIES } from '../parts/catalog.js';
import { canvasTexture, rgb, mix, scale, clamp, Pix, fbm, textMask } from './pixelArt.js';

// Quality sets for cars and parts, all drawn at one pixel density: 64 px per
// metre. carView.js gives every car surface UVs in metres, so a w x h tile
// repeats every w/64 x h/64 metres: nothing looks stretched, or sharper than
// its neighbour. The body livery is one 320 x 240 sheet at the same density.
// Each quality has its own look, not just a tint: livery, part tiles (plus
// detail per kind of part), trim, steel, tyres, glass and plates. Textures
// bake in the material's own colour, so its colour is set to white.
// ------------------------------------------------------------------------
const PPM = 64;
const TAU = Math.PI * 2;
const Q = QUALITIES.map((q) => q.id);
const texCache = new Map();
const cached = (key, make) => {
  if (!texCache.has(key)) texCache.set(key, make());
  return texCache.get(key);
};
const lum = (c) => (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
const contrast = (c) => rgb(lum(c) > 0.5 ? '#16141c' : '#eeeef4');
const GOLD = rgb('#d8a838');
const px = (m) => Math.max(1, Math.round(m * PPM)); // metres to pixels
// A tiling texture at PPM (UVs are in metres).
const tiled = (w, h, draw) => {
  const tex = canvasTexture(w, h, draw);
  tex.repeat.set(PPM / w, PPM / h);
  return tex;
};

// Drawing on the livery sheet, clipped to it.
function painter(p) {
  const put = (x, y, c, t = 1) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < p.w && y < p.h) p.blend(x, y, c, t);
  };
  const rect = (x0, y0, w, h, c, t = 1) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(x, y, c, t);
  };
  const hline = (x0, x1, y, c, t = 1) => {
    for (let x = x0; x <= x1; x++) put(x, y, c, t);
  };
  const disc = (cx, cy, r, c, t = 1) => {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r) put(cx + x, cy + y, c, t);
  };
  const text = (str, x, y, c, s = 1) => {
    const m = textMask(str);
    for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) if (m.on(i, j)) rect(x + i * s, y + j * s, s, s, c);
  };
  return { put, rect, hline, disc, text };
}
// Drawing on a tile: Pix wraps, so shapes carry over the edges seamlessly.
function tilePainter(p) {
  const dot = (x, y, c, t = 1) => p.blend(Math.round(x), Math.round(y), c, t);
  const rect = (x0, y0, w, h, c, t = 1) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) dot(x0 + x, y0 + y, c, t);
  };
  const disc = (cx, cy, r, c, t = 1) => {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r) dot(cx + x, cy + y, c, t);
  };
  const text = (str, x, y, c) => {
    const m = textMask(str);
    for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) if (m.on(i, j)) dot(x + i, y + j, c);
  };
  const bolt = (x, y, c = rgb('#c8c8d0')) => {
    dot(x, y, c);
    dot(x + 1, y, scale(c, 0.7));
    dot(x, y + 1, scale(c, 0.6));
    dot(x + 1, y + 1, rgb('#101014'));
  };
  const scratch = (rng, len, c) => {
    let x = rng() * p.w;
    let y = rng() * p.h;
    const a = rng() * TAU;
    for (let i = 0; i < len; i++) {
      dot(x, y, c, 0.8);
      dot(x, y + 1, [0, 0, 0], 0.25);
      x += Math.cos(a);
      y += Math.sin(a) * 0.4;
    }
  };
  return { dot, rect, disc, text, bolt, scratch };
}

// Livery sheet coordinates, matching liverySide / liveryPlan in carView.js:
// left flank rows 0-95 (y 1.05 down to -0.45), right flank rows 96-191,
// plan view from row 192. Designs draw the side view in the left rows; it is
// copied to the right flank before damage goes on.
const PLAN0 = 192;
const lvCol = (z) => Math.round((z + 2.5) * PPM);
const lvSide = (y) => Math.max(0, Math.min(95, Math.round((1.05 - y) * PPM)));
const lvPlan = (x) => Math.max(PLAN0, Math.min(335, Math.round(PLAN0 + (1.1 - x) * PPM)));

// Damage over a livery. With `marks` (where CarView crushed, dented, holed or
// tore the shell) the paint is damaged right there: cracked along the folds
// of a crush and scraped bare towards its impact, crazed round a dent,
// stripped and scorched round a hole, ragged round a lost door skin, and
// burnt under a buckled bonnet from critical on. Without marks (the gallery)
// a generic spread is drawn. Wrecked chars the lot either way.
function damageLivery(p, stage, rng, marks) {
  const { put, rect, hline } = painter(p);
  const w = p.w;
  const bare = rgb('#b4b4bc');
  const primer = rgb('#8a8a92');
  const dark = rgb('#0a0a0e');
  const soot = rgb('#0a0806');
  const rust = rgb('#6a3418');
  const patch = fbm(w, p.h, rng, [16, 8, 4]);
  const sill = lvSide(-0.42);
  // Texel of a body point on its flank, or on the plan view.
  const sideCR = (x, y, z) => [Math.round((x > 0 ? 2.5 - z : z + 2.5) * PPM), Math.round((x > 0 ? 96 : 0) + (1.05 - y) * PPM)];
  const planCR = (x, z) => [Math.round((z + 2.5) * PPM), Math.round(PLAN0 + (1.1 - x) * PPM)];
  // Visits texels within `reach` of a mark on the views it shows on, with the
  // body point each texel paints and a falloff of 1 at the centre.
  const around = (m, reach, views, fn) => {
    const [cx, cy, cz] = m.center;
    const R = Math.ceil(reach * PPM);
    const off = cx > 0 ? 96 : 0;
    for (const v of views) {
      const [c0, r0] = v === 'side' ? sideCR(cx, cy, cz) : planCR(cx, cz);
      for (let row = r0 - R; row <= r0 + R; row++)
        for (let col = c0 - R; col <= c0 + R; col++) {
          if (col < 0 || col >= w) continue;
          let pos;
          if (v === 'side') {
            if (row < off || row >= off + 96) continue;
            pos = [cx, 1.05 - (row - off) / PPM, cx > 0 ? 2.5 - col / PPM : col / PPM - 2.5];
          } else {
            if (row < PLAN0 || row >= p.h) continue;
            pos = [1.1 - (row - PLAN0) / PPM, cy, col / PPM - 2.5];
          }
          const d = Math.hypot(pos[0] - cx, pos[1] - cy, pos[2] - cz) / reach;
          if (d < 1) fn(col, row, pos, 1 - d);
        }
    }
  };
  const centres = (m, views) => views.map((v) => (v === 'side' ? sideCR(...m.center) : planCR(m.center[0], m.center[2])));
  // Flank marks show on their side view; crushes and top hits on the plan view.
  const viewsFor = (m) => [...(Math.abs(m.center[0]) > 0.3 ? ['side'] : []), ...(m.type === 'crush' || Math.abs(m.dir?.[1] ?? 0) > 0.5 ? ['plan'] : [])];
  // Patchy bare metal with a primer rim, more of it where f is higher.
  const scraped = (col, row, f, amount) => {
    const k = patch[row * w + col];
    if (k < f * amount) put(col, row, bare);
    else if (k < f * amount + 0.05) put(col, row, primer);
  };
  const streak = (col, row, len) => {
    for (let i = 0; i < len; i++) {
      put(col + i, row, bare, 0.9);
      put(col + i, row + 1, dark, 0.35);
    }
  };
  const crack = (col, row, len) => {
    let a = rng() * TAU;
    let [x, y] = [col, row];
    for (let s = 0; s < len; s++) {
      put(x, y, dark, 0.55);
      a += (rng() - 0.5) * 0.5;
      x += Math.cos(a);
      y += Math.sin(a);
    }
  };
  if (marks) {
    for (const m of marks) {
      const views = viewsFor(m);
      if (m.type === 'crush') {
        const mag = Math.hypot(...m.push) || 1;
        const dir = m.push.map((v) => v / mag);
        around(m, m.radius, views, (col, row, pos, f) => {
          // The shell folds with sin(along * 38): crack the paint on its ridges and valleys.
          const s = Math.sin(((pos[0] - m.center[0]) * dir[0] + (pos[1] - m.center[1]) * dir[1] + (pos[2] - m.center[2]) * dir[2]) * 38);
          if (f > 0.15 && s > 0.94) put(col, row, [255, 255, 255], 0.35 * f);
          else if (f > 0.15 && s < -0.94) put(col, row, dark, 0.7 * f);
          scraped(col, row, f, 0.75);
        });
        for (const [c0, r0] of centres(m, views))
          for (let i = 0; i < Math.round(m.radius * 24); i++) {
            const a = rng() * TAU;
            const d = Math.sqrt(rng()) * m.radius * PPM * 0.7;
            streak(Math.round(c0 + Math.cos(a) * d), Math.round(r0 + Math.sin(a) * d * 0.6), px(0.08 + rng() * 0.25));
          }
        if (stage >= 3 && m.push[1] > 0.05) around(m, m.radius * 0.8, ['plan'], (col, row, pos, f) => put(col, row, soot, f * 0.8)); // engine fire under the bonnet
      } else if (m.type === 'dent') {
        around(m, m.radius, views, (col, row, pos, f) => {
          if (f > 0.25 && ((1 - f) * 5) % 1 < 0.14) put(col, row, dark, 0.45 * f);
          scraped(col, row, Math.max(0, f - 0.4), 1.2);
        });
        for (const [c0, r0] of centres(m, views)) for (let k = 0; k < 5; k++) crack(c0, r0, m.radius * PPM * 0.8);
      } else if (m.type === 'hole') {
        around(m, m.radius * 2.6, views, (col, row, pos, f) => {
          const d = (1 - f) * 2.6; // in hole radii
          if (d < 1.45) put(col, row, d < 1.05 ? dark : bare);
          else put(col, row, soot, Math.max(0, (2.6 - d) / 1.15) * 0.75);
        });
      } else if (m.type === 'tear') {
        around(m, m.radius * 1.3, views, (col, row, pos) => {
          const edge = Math.max(Math.abs(pos[1] - m.center[1]) - 0.13, Math.abs(pos[2] - m.center[2]) - 0.23);
          if (edge > -0.01 && edge < 0.03 + patch[row * w + col] * 0.04) put(col, row, bare);
        });
      }
    }
  } else {
    // Generic spread, for previews without a car.
    const between = (a, b) => a + Math.floor(rng() * Math.max(1, b - a));
    const sideSpot = (hi = 0.22) => [between(lvCol(-2.2), lvCol(2.2)), between(lvSide(hi), sill - 2)];
    const cornerSpot = () => [rng() < 0.5 ? between(lvCol(-2.3), lvCol(-1.5)) : between(lvCol(1.5), lvCol(2.3)), between(lvSide(0.15), sill - 2)];
    const planSpot = () => [between(lvCol(-2.2), lvCol(2.2)), between(lvPlan(0.8), lvPlan(-0.8))];
    const chip = ([x, y]) => {
      const [cw, ch] = [3 + Math.floor(rng() * 4), 2 + Math.floor(rng() * 3)];
      rect(x, y, cw, ch, primer);
      rect(x + 1, y + 1, Math.max(1, cw - 2), Math.max(1, ch - 2), bare);
      hline(x, x + cw - 1, y - 1, dark, 0.4);
    };
    const holes = ([cx, cy], count) => {
      for (let k = 0; k < count; k++) {
        const x = cx + Math.round((rng() - 0.5) * 18);
        const y = cy + Math.round((rng() - 0.5) * 10);
        rect(x - 2, y - 2, 5, 5, bare);
        rect(x - 1, y - 1, 3, 3, dark);
      }
    };
    const scorch = ([cx, cy], r) => {
      for (let y = -r; y <= r; y++)
        for (let x = -2 * r; x <= 2 * r; x++) {
          const d = Math.hypot(x / 2, y) / r;
          if (d < 1) put(cx + x, cy + y, d > 0.8 ? rgb('#3a2010') : soot, (1 - d) * 0.85 + 0.1);
        }
    };
    if (stage >= 1) {
      for (let i = 0; i < 14; i++) streak(...cornerSpot(), px(0.12 + rng() * 0.3));
      for (let i = 0; i < 8; i++) chip(sideSpot());
    }
    if (stage >= 2) {
      for (let i = 0; i < 2; i++) holes(sideSpot(), 6);
      holes(planSpot(), 5);
      for (let i = 0; i < 10; i++) chip(planSpot());
      for (let i = 0; i < 6; i++) crack(...sideSpot(), px(0.2));
    }
    if (stage >= 3) for (const spot of [cornerSpot(), cornerSpot(), [lvCol(-2.0), lvPlan(0.3)], [lvCol(-1.8), lvPlan(-0.2)]]) scorch(spot, 7 + Math.floor(rng() * 5));
  }
  if (stage >= 4) {
    // Charred: burnt browns and blacks with a little paint left where the
    // fire didn't reach, ash streaks, a few ember cracks.
    const n = fbm(w, p.h, rng, [16, 8]);
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < w; x++) {
        const k = n[y * w + x];
        if (k > 0.72) continue;
        p.set(x, y, mix(p.get(x, y), mix(rgb('#1a1412'), rgb('#3a2418'), clamp(k * 1.6)), 0.85));
      }
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(rng() * w);
      hline(x, x + px(0.2 + rng() * 0.3), Math.floor(rng() * p.h), rgb('#5a5650'), 0.5); // ash streaks
    }
    for (let k = 0; k < 8; k++) {
      let [x, y] = [Math.floor(rng() * w), Math.floor(rng() * 190)];
      for (let s = 0; s < 14; s++) {
        put(x, y, rgb('#ff7a1a'), 0.9);
        x += 1;
        y += Math.round(rng() * 2 - 1);
      }
    }
  }
}

// Body livery. Both flanks get the same design (the right one mirrored in
// UV so both read left to right), so side features are placed symmetrically
// along the car. `marks` (from CarView) put damage where the shell was hit.
function liveryTex(q, baseHex, stage = 0, marks = null) {
  const markKey = marks ? marks.map((m) => [m.type, ...m.center, m.radius].map((v) => (typeof v === 'number' ? v.toFixed(2) : v)).join(',')).join(';') : '';
  return cached(`livery|${q}|${baseHex}|${stage}|${markKey}`, () =>
    canvasTexture(
      320,
      336,
      (ctx, w, h) => {
        const rng = makeRng(1400 + Q.indexOf(q));
        const base = rgb(baseHex);
        const p = new Pix(w, h);
        const { put, rect, hline, disc, text } = painter(p);
        const n = fbm(w, h, rng, [16, 8, 4]); // noise cells must divide 320 x 336
        p.fill((x, y) => scale(base, 0.93 + n[y * w + x] * 0.12));
        const sc = contrast(base);
        const sill = lvSide(-0.42);
        const mid = lvPlan(0);
        const both = (z, fn) => {
          fn(lvCol(z));
          fn(lvCol(-z));
        };
        switch (q) {
          case 'junk': {
            // Rust eating up from the sills and round the arches, primer and
            // odd-colour panels, tape, dents, holes and scratches.
            const rust = fbm(w, h, rng, [16, 8, 4]);
            const arches = [lvCol(-1.4), lvCol(1.4)];
            for (let y = 0; y < h; y++)
              for (let x = 0; x < w; x++) {
                let k = rust[y * w + x];
                if (y < 96) {
                  const low = clamp((y - lvSide(0.1)) / (sill - lvSide(0.1)));
                  const arch = Math.max(0, 1 - Math.min(...arches.map((c) => Math.abs(x - c))) / px(0.5));
                  k += low * 0.3 + arch * low * 0.25;
                }
                if (k > 0.8) p.set(x, y, mix(rgb('#7a3c1a'), rgb('#3a1a0c'), clamp((k - 0.8) * 4)));
                else if (k > 0.76) p.set(x, y, rgb(rng() < 0.5 ? '#9a5a28' : '#c8c0b0'));
              }
            ['#6a6a70', '#7a3a2a', '#8a8a80', '#4a5a4a', '#5a5a64', '#8a6a3a'].forEach((c, i) => {
              const pw = px(0.35 + rng() * 0.6);
              const ph = px(0.15 + rng() * 0.2);
              const x0 = Math.floor(rng() * (w - pw));
              const y0 = i < 3 ? lvSide(0.25) + Math.floor(rng() * Math.max(1, sill - lvSide(0.25) - ph)) : PLAN0 + 2 + Math.floor(rng() * (136 - ph));
              for (let y = y0; y < y0 + ph; y++) for (let x = x0; x < x0 + pw; x++) put(x, y, scale(rgb(c), 0.85 + rng() * 0.2));
              hline(x0, x0 + pw - 1, y0, rgb('#1a1612'));
              hline(x0, x0 + pw - 1, y0 + ph - 1, rgb('#1a1612'));
            });
            for (let i = 0; i < 5; i++) {
              const x0 = Math.floor(rng() * (w - 34));
              const y0 = i < 2 ? lvSide(0.2) + Math.floor(rng() * 20) : PLAN0 + 4 + Math.floor(rng() * 120);
              for (let k = 0; k < 32; k++) for (let t = 0; t < 3; t++) put(x0 + k, y0 + t + (k >> 3), rgb(t === 1 ? '#b0b0ac' : '#8a8a86'));
            }
            for (let i = 0; i < 60; i++) {
              const x = rng() * w;
              const y = rng() * h;
              put(x, y, [0, 0, 0], 0.4);
              put(x + 1, y, [0, 0, 0], 0.3);
              put(x - 1, y - 1, [255, 255, 255], 0.3);
            }
            for (let i = 0; i < 14; i++) {
              const x = Math.floor(rng() * w);
              const y = Math.floor(rng() * h);
              rect(x - 2, y - 2, 7, 7, rgb('#6a3418'), 0.8);
              rect(x, y, 3, 3, rgb('#080604'));
            }
            for (let i = 0; i < 40; i++) {
              let x = rng() * w;
              let y = rng() * h;
              const a = rng() * TAU;
              for (let k = 0; k < 6 + rng() * 20; k++) {
                put(x, y, [220, 220, 220], 0.7);
                x += Math.cos(a);
                y += Math.sin(a) * 0.3;
              }
            }
            break;
          }
          case 'stock': {
            // Factory plain: door shut lines and handles, bonnet and boot lines,
            // a badge, road dust along the sills.
            const top = lvSide(0.26);
            const shut = (x) => {
              for (let y = top; y <= sill - 3; y++) {
                put(x, y, [0, 0, 0], 0.5);
                put(x + 1, y, [255, 255, 255], 0.12);
              }
            };
            both(1.0, shut);
            shut(lvCol(0));
            both(0.2, (x) => {
              rect(x - 4, lvSide(0.12), 8, 2, rgb('#d0d0d8'), 0.85);
              hline(x - 4, x + 3, lvSide(0.12) + 2, [0, 0, 0], 0.4);
            });
            for (const z of [-1.0, 1.6]) for (let y = PLAN0 + 3; y < PLAN0 + 140; y++) put(lvCol(z), y, [0, 0, 0], 0.45);
            rect(lvCol(-2.15) - 2, mid - 2, 5, 5, rgb('#c8c8d0'));
            for (let i = 0; i < 1800; i++) put(rng() * w, sill - Math.abs(rng() - rng()) * px(0.3), rgb('#a09880'), 0.35);
            break;
          }
          case 'street': {
            // Street tuner: smooth gloss with a soft sheen, two-tone with a
            // darker lower body under a neon keyline, angular slashes rising
            // from both arches, bonnet chevrons, neon roof-edge keylines.
            const neon = rgb(lum(base) > 0.6 ? '#1a7ac8' : PALETTE.cyan);
            const belt = lvSide(0.02);
            p.fill((x, y) => mix(base, [255, 255, 255], y < 96 ? (1 - y / 96) * 0.1 : 0.04));
            for (let y = belt + 2; y < 96; y++) hline(0, w - 1, y, scale(base, 0.55));
            hline(0, w - 1, belt, neon);
            hline(0, w - 1, belt + 1, rgb('#0c0b10'), 0.6);
            const top = lvSide(0.24);
            for (const s of [-1, 1]) {
              const arch = lvCol(s * 1.4);
              for (let y = top; y < belt; y++)
                for (let x = 0; x < w; x++) {
                  const d = (x - arch) * -s - (belt - y) * 1.5; // in from the arch, leaning towards the doors
                  if (d >= 8 && d < 22) put(x, y, sc);
                  else if (d >= 22 && d < 24) put(x, y, neon);
                  else if (d >= 30 && d < 34) put(x, y, sc, 0.8);
                }
            }
            for (let k = 0; k < 3; k++) {
              const apex = lvCol(-2.15) + k * 12;
              for (let r = mid - 24; r <= mid + 24; r++) {
                const c = Math.round(apex + Math.abs(r - mid) * 0.7);
                rect(c, r, 4, 1, sc);
                put(c + 4, r, neon);
              }
            }
            for (const x0 of [0.62, -0.62]) hline(lvCol(-2.2), lvCol(2.2), lvPlan(x0), neon, 0.9);
            break;
          }
          case 'sport': {
            // Twin racing stripes with keylines over bonnet, roof and boot; a
            // halftone fade along the sills; bonnet vent slats.
            for (const [a, b] of [[-0.32, -0.12], [0.12, 0.32]]) for (let r = lvPlan(b); r <= lvPlan(a); r++) hline(0, w - 1, r, sc);
            for (const x0 of [-0.36, -0.08, 0.08, 0.36]) hline(0, w - 1, lvPlan(x0), sc, 0.8);
            const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
            for (let y = lvSide(-0.05); y <= sill - 2; y++)
              for (let x = 0; x < w; x++) {
                const t = clamp((Math.abs(x / PPM - 2.5) - 0.2) / 2) * clamp((y - lvSide(-0.05)) / px(0.2) + 0.3);
                if (t * 16 > bayer[(y % 4) * 4 + (x % 4)]) put(x, y, sc);
              }
            for (const s of [-1, 1]) for (let k = 0; k < 5; k++) hline(lvCol(-1.8), lvCol(-1.5), lvPlan(s * 0.5) + k * 3 - 6, rgb('#0c0b10'));
            break;
          }
          case 'race': {
            // Race livery: accent centre stripe, number roundels on the doors and
            // roof, sponsor panels, checkered tail.
            const accent = rgb(Math.abs(base[0] - 242) + Math.abs(base[1] - 194) + base[2] < 160 ? PALETTE.pink : '#f2c200');
            for (let r = lvPlan(0.2); r <= lvPlan(-0.2); r++) hline(0, w - 1, r, r <= lvPlan(0.2) + 1 || r >= lvPlan(-0.2) - 1 ? rgb('#101014') : accent);
            const num = String(1 + Math.floor(rng() * 9));
            const cy = lvSide(0.0);
            disc(lvCol(0), cy, px(0.3), rgb('#101014'));
            disc(lvCol(0), cy, px(0.3) - 2, rgb('#f4f4f4'));
            text(num, lvCol(0) - 7, cy - 10, rgb('#101014'), 3);
            both(1.05, (x) => {
              const y0 = lvSide(0.16);
              rect(x - px(0.2), y0, px(0.4), px(0.14), rgb('#f4f4f4'));
              for (let i = 2; i < px(0.4) - 2; i++) if (rng() < 0.7) rect(x - px(0.2) + i, y0 + 3 + (i % 3 === 0 ? 1 : 0), 1, 3, rgb('#202028'));
              rect(x - px(0.2), lvSide(-0.06), px(0.4), 5, accent);
            });
            disc(lvCol(0.35), mid, px(0.2), rgb('#101014'));
            disc(lvCol(0.35), mid, px(0.2) - 2, rgb('#f4f4f4'));
            text(num, lvCol(0.35) - 5, mid - 7, rgb('#101014'), 2);
            for (let x = lvCol(1.95); x < w; x++) for (let y = PLAN0 + 2; y < PLAN0 + 142; y++) p.set(x, y, ((x >> 2) + (y >> 2)) % 2 ? rgb('#101014') : rgb('#f4f4f4'));
            break;
          }
          case 'elite': {
            // Pearl drifting in hue along the car, chrome double pinstripe, neon
            // circuit inlays along the sills, gold rocker lines, bonnet crest.
            const shifted = [base[2], base[0], base[1]];
            for (let y = 0; y < h; y++)
              for (let x = 0; x < w; x++) {
                const t = 0.18 + 0.14 * Math.sin((x / w) * TAU + (y < 96 ? 0 : 1.5));
                p.set(x, y, mix(mix(p.get(x, y), shifted, t), [255, 255, 255], y < 96 ? (1 - y / 96) * 0.12 : 0.06));
              }
            for (const yy of [0.18, 0.14]) for (let x = lvCol(-2.1); x <= lvCol(2.1); x++) put(x, lvSide(yy), x % 9 ? rgb('#d8dce8') : [255, 255, 255]);
            hline(lvCol(-2.2), lvCol(2.2), sill - 1, GOLD);
            hline(lvCol(-2.2), lvCol(2.2), sill - 2, GOLD, 0.5);
            const sym = (x, y, c) => {
              put(x, y, c);
              put(w - 1 - x, y, c);
            };
            const [b0, b1] = [lvSide(-0.12), sill - 5];
            for (let k = 0; k < 9; k++) {
              let x = 10 + Math.floor(rng() * 140);
              let y = b0 + Math.floor(rng() * (b1 - b0));
              const col = rgb(k % 3 ? PALETTE.cyan : PALETTE.pink);
              for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sym(x + dx, y + dy, col);
              for (let s = 0; s < 4; s++) {
                const len = 5 + Math.floor(rng() * 12);
                for (let i = 0; i < len; i++) sym(x++, y, col);
                const dy = (rng() < 0.5 ? -1 : 1) * (2 + Math.floor(rng() * 3));
                for (let i = 0; i < Math.abs(dy); i++) {
                  y = Math.max(b0, Math.min(b1, y + Math.sign(dy)));
                  sym(x, y, col);
                }
              }
              sym(x, y, [255, 255, 255]);
              sym(x + 1, y, [255, 255, 255]);
            }
            for (const x0 of [0.7, -0.7]) for (let x = lvCol(-2.2); x <= lvCol(2.2); x++) if ((x >> 4) % 3 !== 2) put(x, lvPlan(x0), rgb(PALETTE.cyan), 0.8);
            const cx = lvCol(-1.95);
            for (let d = 0; d < 8; d++) {
              hline(cx - (7 - d), cx + (7 - d), mid - d, GOLD);
              hline(cx - (7 - d), cx + (7 - d), mid + d, GOLD);
            }
            disc(cx, mid, 2, rgb('#fff0b0'));
            break;
          }
        }
        for (let y = 0; y < 96; y++) for (let x = 0; x < w; x++) p.set(x, y + 96, p.get(x, y)); // right flank
        if (stage) damageLivery(p, stage, makeRng(2100 + Q.indexOf(q)), marks);
        p.flush(ctx);
      },
      { repeat: false },
    ),
  );
}

// Part surfaces, 64 x 64 tiles (one metre). Layers: the finish by quality,
// how the kind of part is built (fins, seams, rivets, welds), then wear.
// Construction lines sit 16 px in from the tile's corner and every 32 px
// after: each face's UVs start at its corner, so small faces stay clean and
// bigger ones get panelled a quarter metre in, not framed at every edge.
// Markings are real pieces on the models (hazardTex, stencilTex, labelTex),
// exhaust heat and contact shading come from CarView's vertex colours.
const PART_KIND = {
  primaryWeapon: 'weapon', secondaryWeapon: 'weapon', engine: 'engine', turbo: 'engine', cooling: 'engine', transmission: 'engine',
  suspension: 'engine', armor: 'armor', bodyKit: 'armor', exhaust: 'exhaust', fuelTank: 'tank', nitrous: 'tank', utility: 'tank',
  wheels: 'wheel', spoiler: 'aero',
};
const LINES = [16, 48];
// The earlier panel-style part tiles (framed panels with bolts, stickers,
// hazard bands, stencils, fins, labels), kept for weapons, engines and utility gear.
const TANK_LABEL = { fuelTank: 'FUEL', nitrous: 'NOS', utility: 'AUX' };
function partTexClassic(q, slot, baseHex, face = 'side') {
  const kind = PART_KIND[slot] || 'plain';
  return cached(`classic|${q}|${slot}|${baseHex}|${face}`, () =>
    canvasTexture(64, 64, (ctx) => {
      const rng = makeRng(1500 + Q.indexOf(q) * 31 + kind.length);
      const base = rgb(baseHex);
      const p = new Pix(64, 64);
      const { dot, rect, disc, text, bolt, scratch } = tilePainter(p);
      const n = fbm(64, 64, rng, [32, 16, 8, 4]);
      p.fill((x, y) => scale(base, 0.9 + n[y * 64 + x] * 0.18));
      const light = mix(base, [255, 255, 255], 0.45);
      const dark = scale(base, 0.45);
      // Panel seams every half metre: dark gap, lit lip below and to the right.
      const seams = (c1, c2) => {
        for (let i = 0; i < 64; i++)
          for (const s of [0, 32]) {
            p.set(i, s, c1);
            p.blend(i, s + 1, c2, 0.5);
            p.set(s, i, c1);
            p.blend(s + 1, i, c2, 0.5);
          }
      };
      switch (q) {
        case 'junk': {
          // Rusted through: scabby rust, a welded-on patch, a hole, tape, scratches.
          const rust = fbm(64, 64, rng, [16, 8, 4]);
          for (let i = 0; i < 4096; i++) {
            const k = rust[i] + n[i] * 0.2;
            if (k > 0.7) p.set(i % 64, i >> 6, mix(rgb('#8a4a20'), rgb('#3a1a0c'), clamp((k - 0.7) * 3)));
            else if (k > 0.66) p.set(i % 64, i >> 6, rgb('#b06a30'));
          }
          const [px0, py0] = [Math.floor(rng() * 64), Math.floor(rng() * 64)];
          rect(px0, py0, 18, 12, rgb('#6a6a70'));
          for (let i = 0; i < 18; i++) for (const y of [py0, py0 + 11]) dot(px0 + i, y, (i + y) % 2 ? rgb('#c8c0a8') : rgb('#5a5040'));
          for (let i = 0; i < 12; i++) for (const x of [px0, px0 + 17]) dot(x, py0 + i, (i + x) % 2 ? rgb('#c8c0a8') : rgb('#5a5040'));
          const [hx, hy] = [Math.floor(rng() * 64), Math.floor(rng() * 64)];
          rect(hx - 1, hy - 1, 5, 5, rgb('#6a3418'), 0.7);
          rect(hx, hy, 3, 3, rgb('#080604'));
          const [tx, ty] = [Math.floor(rng() * 64), Math.floor(rng() * 64)];
          for (let k = 0; k < 20; k++) for (let t = 0; t < 3; t++) dot(tx + k, ty + t + (k >> 2), rgb(t === 1 ? '#b0b0ac' : '#8a8a86'));
          for (let i = 0; i < 8; i++) scratch(rng, 6 + rng() * 10, rgb('#d8d0c0'));
          break;
        }
        case 'stock':
          // Factory stamping: panel seams, a part-number plate, a film of dust.
          seams(dark, light);
          rect(4, 42, 14, 6, rgb('#d8d4c8'));
          for (let x = 5; x < 17; x += 2) dot(x, 45, rgb('#3a3830'));
          for (let i = 0; i < 200; i++) dot(rng() * 64, 64 - Math.abs(rng() - rng()) * 20, rgb('#b0a890'), 0.3);
          break;
        case 'street':
          // Clean smooth paint, seams with hex bolts at the corners, a sticker.
          p.fill(() => base); // no flake
          seams(scale(base, 0.5), light);
          for (const [cx, cy] of [[0, 0], [32, 0], [0, 32], [32, 32]]) for (const [ox, oy] of [[3, 3], [-4, 3], [3, -4], [-4, -4]]) bolt(cx + ox, cy + oy);
          rect(40, 44, 9, 6, rgb(PALETTE.cyan));
          rect(41, 45, 7, 1, [255, 255, 255]);
          break;
        case 'sport': {
          // Drilled for lightness in staggered rows, anodised red seams, bolts.
          const ano = rgb('#d02030');
          seams(ano, scale(ano, 0.6));
          for (let gy = 8; gy < 64; gy += 16)
            for (let gx = (gy / 16) % 2 ? 16 : 8; gx < 64; gx += 16) {
              disc(gx, gy, 3, light);
              disc(gx, gy, 2, rgb('#0a0a0e'));
            }
          for (const [x, y] of [[3, 29], [35, 29], [3, 61], [35, 61]]) bolt(x, y);
          break;
        }
        case 'race':
          // Carbon-fibre twill, quick-release fasteners, safety wire, a tech sticker.
          for (let y = 0; y < 64; y++)
            for (let x = 0; x < 64; x++) {
              const weave = ((x + (y >> 1)) >> 1) % 2;
              p.set(x, y, mix(rgb(weave ? '#2c2c34' : '#141418'), base, 0.3));
              if (weave && (x + y) % 4 === 0) p.blend(x, y, [255, 255, 255], 0.12);
            }
          for (const [cx, cy] of [[8, 8], [40, 40]]) {
            disc(cx, cy, 2, rgb('#d8d8e0'));
            dot(cx, cy, rgb('#202028'));
          }
          for (let i = 11; i < 38; i += 2) dot(i, i, rgb('#b8b8c0'));
          rect(44, 6, 12, 7, rgb('#f2c200'));
          rect(45, 9, 10, 1, rgb('#202028'));
          break;
        case 'elite':
          // Polished, engraved brick-hex pattern, gold seams, neon inlays, crests.
          for (let y = 0; y < 64; y++)
            for (let x = 0; x < 64; x++) {
              p.blend(x, y, [255, 255, 255], 0.1 + n[y * 64 + x] * 0.12);
              const hx = (x + (Math.floor(y / 8) % 2) * 8) % 16;
              if (y % 8 === 0 || hx === 0) p.blend(x, y, scale(base, 0.55), 0.35);
            }
          for (let i = 0; i < 64; i++)
            for (const s of [0, 32]) {
              p.set(i, s, GOLD);
              p.set(s, i, GOLD);
            }
          for (const [cx, cy] of [[0, 0], [32, 0], [0, 32], [32, 32]]) {
            rect(cx - 1, cy - 1, 3, 3, rgb(PALETTE.cyan));
            dot(cx, cy, [255, 255, 255]);
          }
          for (const [cx, cy] of [[16, 16], [48, 48]])
            for (let d = 0; d < 4; d++) {
              rect(cx - (3 - d), cy - d, 2 * (3 - d) + 1, 1, GOLD);
              rect(cx - (3 - d), cy + d, 2 * (3 - d) + 1, 1, GOLD);
            }
          break;
      }
      // Detail for the kind of part, on top of the quality look.
      const worn = q === 'junk';
      // Faces other than the sides get detail that belongs there: tops, front and
      // back ends (and cylinder caps, centred on the tile), undersides.
      const faceDetail = () => {
        if (face === 'bottom') {
          for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) p.set(x, y, scale(p.get(x, y), 0.7 + n[y * 64 + x] * 0.1));
          return;
        }
        if (kind === 'weapon') {
          if (face === 'top') {
            // Accessory rail along the top, cooling slots either side.
            rect(0, 28, 64, 8, rgb('#1a1a20'));
            for (let x = 1; x < 64; x += 4) rect(x, 29, 2, 6, rgb('#4a4a54'));
            for (const y of [12, 16, 20, 44, 48, 52]) {
              rect(14, y, 36, 1, rgb('#0a0a0e'));
              rect(14, y + 1, 36, 1, light, 0.5);
            }
          } else {
            // Muzzle or breech end: a dark port in a bolted collar.
            disc(32, 32, 12, light);
            disc(32, 32, 10, rgb('#141418'));
            disc(32, 32, 5, rgb('#050506'));
            for (let a = 0; a < 6; a++) bolt(32 + Math.cos((a * TAU) / 6) * 16, 32 + Math.sin((a * TAU) / 6) * 16);
          }
        } else if (kind === 'engine') {
          if (face === 'top') {
            // Cam cover: ribs along it, a filler cap.
            for (let x = 6; x < 58; x += 6) {
              rect(x, 8, 1, 48, light, 0.6);
              rect(x + 1, 8, 1, 48, dark, 0.5);
            }
            disc(50, 14, 5, rgb('#c8c8d0'));
            disc(50, 14, 3, rgb('#2a2a30'));
          } else {
            // Front and back: cooling louvres in a frame.
            rect(8, 10, 48, 44, dark);
            for (let y = 12; y < 52; y += 5) {
              rect(10, y, 44, 2, rgb('#08080a'));
              rect(10, y + 2, 44, 1, light, 0.6);
            }
          }
        } else if (face === 'top') {
          // Utility gear: a filler cap and lid hinges on top.
          disc(32, 32, 8, rgb('#c8c8d0'));
          disc(32, 32, 6, rgb('#3a3a40'));
          rect(28, 31, 9, 2, rgb('#c8c8d0'));
          rect(10, 6, 10, 4, dark);
          rect(44, 6, 10, 4, dark);
        } else for (let a = 0; a < 12; a++) bolt(32 + Math.cos((a * TAU) / 12) * 22, 32 + Math.sin((a * TAU) / 12) * 22); // riveted end plate
      };
      if (face !== 'side') faceDetail();
      else switch (kind) {
        case 'weapon': {
          // Hazard band along the base, mark stencil above it (MK1 junk .. MK6
          // elite), vent slots higher up.
          const c1 = q === 'elite' ? GOLD : rgb('#f2c200');
          for (let y = 59; y < 64; y++) for (let x = 0; x < 64; x++) if (!worn || rng() > 0.35) p.blend(x, y, (x + y) % 8 < 4 ? c1 : rgb('#141418'), worn ? 0.6 : 1);
          text(`MK${Q.indexOf(q) + 1}`, 3, 51, worn ? rgb('#c8c0a8') : contrast(base));
          for (let y = 36; y < 46; y += 3) {
            rect(24, y, 20, 1, rgb('#0a0a0e'));
            rect(24, y + 1, 20, 1, light, 0.5);
          }
          break;
        }
        case 'engine':
          // Cooling fins over the whole casting; oil weeping on the cheap ones.
          for (let y = 0; y < 64; y += 4) {
            rect(0, y, 64, 1, light, 0.6);
            rect(0, y + 1, 64, 1, dark, 0.5);
          }
          if (worn || q === 'stock') for (let i = 0; i < 30; i++) dot(36 + rng() * 12, 50 + rng() * 12, rgb('#08080a'), 0.6);
          break;
        case 'armor':
          // Rivet rows along the seams.
          for (let x = 4; x < 64; x += 8) {
            bolt(x, 3);
            bolt(x, 35);
          }
          break;
        case 'exhaust':
          // Heat bluing cycling along the pipe; junk is just sooted.
          for (let y = 0; y < 64; y++)
            for (let x = 0; x < 64; x++) {
              if (worn) {
                if (n[y * 64 + x] > 0.45) p.blend(x, y, rgb('#0a0806'), 0.6);
                continue;
              }
              const t = (Math.sin((y / 64) * TAU) + 1) / 2;
              const heat = t < 0.5 ? mix(rgb('#c8a050'), rgb('#3050a0'), t * 2) : mix(rgb('#3050a0'), rgb('#7a3a9a'), (t - 0.5) * 2);
              p.blend(x, y, heat, 0.35);
            }
          break;
        case 'tank': {
          // Contents label band near the base.
          const label = TANK_LABEL[slot] || 'AUX';
          rect(0, 48, 64, 11, rgb(worn ? '#b8b0a0' : '#ecece4'));
          rect(0, 48, 64, 1, rgb('#c82020'));
          rect(0, 58, 64, 1, rgb('#c82020'));
          text(label, 4, 50, rgb('#18181c'));
          text(label, 36, 50, rgb('#18181c'));
          break;
        }
        case 'wheel':
          // Lathe rings round the hub (cap UVs are centred on the axle).
          for (let y = 0; y < 64; y++)
            for (let x = 0; x < 64; x++) {
              const d = Math.hypot(Math.min(x, 64 - x), Math.min(64 - y, y));
              if (Math.round(d) % 3 === 0) p.blend(x, y, light, 0.35);
            }
          break;
        case 'aero':
          rect(0, 50, 64, 1, contrast(base));
          rect(0, 53, 64, 1, contrast(base));
          break;
      }
      p.flush(ctx);
    }),
  );
}

// These panels are drawn to sit whole on a face: each face of a part using
// them shows the panel fitted to its shorter side, centred, and repeated
// along the longer one, so bands, text and bolts are never cut off.
const isClassic = (u) => u?.kind === 'part' && (u.slot === 'utility' || PART_KIND[u.slot] === 'weapon' || PART_KIND[u.slot] === 'engine');
function fitShortSide(g) {
  if (g.userData.fitted) return;
  const uv = g.attributes.uv;
  const prm = g.parameters || {};
  const fit = (k, w, h, un, vn) => {
    const s = Math.min(w, h) || 1;
    uv.setXY(k, ((un - 0.5) * w) / s + 0.5, ((vn - 0.5) * h) / s + 0.5);
  };
  if (g.type === 'BoxGeometry') {
    const { width: w, height: h, depth: d } = prm;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x -x +y -y +z -z
    for (let f = 0; f < 6; f++)
      for (let k = f * 4; k < f * 4 + 4; k++) {
        const [fw, fh] = dims[f];
        fit(k, fw, fh, uv.getX(k) / fw, uv.getY(k) / fh); // metric back to 0..1, then fitted
      }
  } else if (g.type === 'CylinderGeometry') {
    const { radiusTop: rt, radiusBottom: rb, height, radialSegments: rs, heightSegments: hs, thetaLength: tl, openEnded } = prm;
    const torso = (rs + 1) * (hs + 1);
    const round = tl * ((rt + rb) / 2);
    for (let k = 0; k < torso; k++) fit(k, round, height, uv.getX(k) / round, uv.getY(k) / height);
    let k = torso;
    for (const r of [rt, rb]) {
      if (openEnded || r <= 0) continue;
      for (let i = 0; i < 2 * rs + 1; i++, k++) uv.setXY(k, uv.getX(k) / (2 * r) + 0.5, uv.getY(k) / (2 * r) + 0.5);
    }
  } else return;
  uv.needsUpdate = true;
  g.userData.fitted = true;
}
function partTex(q, slot, baseHex, face = 'side') {
  const kind = PART_KIND[slot] || 'plain';
  if (kind === 'weapon' || kind === 'engine' || slot === 'utility') return partTexClassic(q, slot, baseHex, face);
  return cached(`part|${q}|${slot}|${baseHex}|${face}`, () =>
    tiled(64, 64, (ctx) => {
      const rng = makeRng(1500 + Q.indexOf(q) * 31 + kind.length);
      const base = rgb(baseHex);
      const p = new Pix(64, 64);
      const { dot, rect, disc, bolt, scratch } = tilePainter(p);
      const n = fbm(64, 64, rng, [32, 16, 8]);
      const each = (fn) => {
        for (let i = 0; i < 4096; i++) p.set(i % 64, i >> 6, fn(p.get(i % 64, i >> 6), i));
      };
      p.fill((x, y) => scale(base, 0.93 + n[y * 64 + x] * 0.12));

      // Finish.
      switch (q) {
        case 'street': // clean, smooth paint
          each((c) => mix(c, base, 0.6));
          break;
        case 'sport': // anodised: a cool sheen over a brushed grain
          each((c, i) => scale(mix(c, mix(base, [200, 220, 255], 0.25), 0.3 + n[i] * 0.2), 0.97 + ((i >> 6) % 3) * 0.02));
          break;
        case 'race': // carbon-fibre twill
          each((c, i) => mix(rgb((((i % 64) + ((i >> 6) >> 1)) >> 1) % 2 ? '#2c2c34' : '#141418'), base, 0.3));
          break;
        case 'elite': // polished, with an engraved brick-hex pattern
          each((c, i) => {
            const [x, y] = [i % 64, i >> 6];
            const lit = mix(c, [255, 255, 255], 0.1 + n[i] * 0.12);
            return y % 8 === 0 || (x + (Math.floor(y / 8) % 2) * 8) % 16 === 0 ? mix(lit, scale(base, 0.55), 0.35) : lit;
          });
          break;
      }

      // Construction, by kind. Seams and fixings take the quality's style:
      // gold on elite, quick-release fasteners on race, steel bolts otherwise.
      const seam = (horizontal, at) => {
        for (let i = 0; i < 64; i++) {
          const [x, y] = horizontal ? [i, at] : [at, i];
          if (q === 'elite') p.set(x, y, GOLD);
          else {
            p.blend(x, y, [0, 0, 0], 0.5);
            p.blend(horizontal ? x : x + 1, horizontal ? y + 1 : y, [255, 255, 255], 0.22);
          }
        }
      };
      const fixing = (x, y) => {
        if (q === 'race') {
          disc(x, y, 1, rgb('#d8d8e0'));
          dot(x, y, rgb('#202028'));
        } else bolt(x, y, q === 'elite' ? GOLD : q === 'junk' ? rgb('#8a6a4a') : rgb('#c8c8d0'));
      };
      const weld = (row) => {
        for (let x = 0; x < 64; x++) {
          p.blend(x, row, (x >> 1) % 2 ? [255, 255, 255] : [0, 0, 0], 0.3);
          p.blend(x, row + 1, [0, 0, 0], 0.25);
        }
      };
      // Faces other than the sides, where they differ: armour tops are tread
      // plate and its edges laminated; pipe outlets sooted and tank ends capped
      // (cylinder caps centre on the tile corner); wheel rims plain round the band.
      const faceVariant = () => {
        if (kind === 'armor' && face === 'top') {
          for (let y = 0; y < 64; y += 8)
            for (let x = (y / 8) % 2 ? 4 : 0; x < 64; x += 8) {
              dot(x, y + 1, [255, 255, 255], 0.4);
              dot(x + 1, y, [255, 255, 255], 0.4);
              dot(x + 1, y + 2, [0, 0, 0], 0.4);
              dot(x + 2, y + 1, [0, 0, 0], 0.4);
            }
          for (const at of LINES) seam(true, at);
          return true;
        }
        if (kind === 'armor' && face === 'end') {
          for (let y = 0; y < 64; y += 3) rect(0, y, 64, 1, [0, 0, 0], 0.35);
          return true;
        }
        if ((kind === 'exhaust' || kind === 'tank') && face === 'end') {
          for (let y = 0; y < 64; y++)
            for (let x = 0; x < 64; x++) {
              const d = Math.hypot(Math.min(x, 64 - x), Math.min(y, 64 - y));
              if (kind === 'exhaust') {
                if (d < 6) p.blend(x, y, rgb('#0a0806'), 0.9 - d * 0.1);
              } else if (Math.abs(d - 9) < 0.8) p.blend(x, y, [255, 255, 255], 0.35);
              else if (d < 3) p.blend(x, y, rgb('#2a2a30'), 0.9);
            }
          return true;
        }
        return kind === 'wheel' && face !== 'end';
      };
      if (!faceVariant()) switch (kind) {
        case 'engine': {
          // Cast metal with cooling fins, split by bolted casting seams.
          const cast = fbm(64, 64, rng, [8, 4]);
          each((c, i) => {
            const y = i >> 6;
            const fin = y % 4 === 0 ? 1.12 : y % 4 === 1 ? 0.88 : 1;
            return scale(c, (0.92 + cast[i] * 0.14) * fin);
          });
          for (const at of LINES) {
            seam(false, at);
            for (let y = 4; y < 64; y += 8) fixing(at - 3, y);
          }
          break;
        }
        case 'weapon':
          // Machined gunmetal: fine grain, panel lines, screws where they cross.
          for (let y = 0; y < 64; y++) {
            const k = 0.95 + rng() * 0.08;
            for (let x = 0; x < 64; x++) p.set(x, y, scale(p.get(x, y), k));
          }
          for (const at of LINES) {
            seam(true, at);
            seam(false, at);
          }
          for (const x of LINES) for (const y of LINES) for (const [ox, oy] of [[3, 3], [-4, 3], [3, -4], [-4, -4]]) fixing(x + ox, y + oy);
          break;
        case 'armor':
          // Hammered plate with riveted seams.
          for (let k = 0; k < 40; k++) {
            const [cx, cy, r] = [rng() * 64, rng() * 64, 3 + rng() * 3];
            for (let y = -r; y <= r; y++)
              for (let x = -r; x <= r; x++) {
                const d = Math.hypot(x, y) / r;
                if (d < 1) dot(cx + x, cy + y, y < 0 ? [0, 0, 0] : [255, 255, 255], (1 - d) * 0.12);
              }
          }
          for (const at of LINES) {
            seam(true, at);
            seam(false, at);
            for (let i = 4; i < 64; i += 8) {
              fixing(i, at + 3);
              fixing(at + 3, i);
            }
          }
          break;
        case 'exhaust':
          // Brushed pipe with weld beads at its joints (rings round a pipe).
          for (let y = 0; y < 64; y++) {
            const k = 0.95 + rng() * 0.08;
            for (let x = 0; x < 64; x++) p.set(x, y, scale(p.get(x, y), k));
          }
          for (const at of LINES) weld(at);
          break;
        case 'tank':
          // Rolled and welded: weld rings and a seam along the tank.
          for (const at of LINES) weld(at);
          seam(false, 16);
          break;
        case 'aero':
          // Panel lines along the wing's chord.
          for (const at of LINES) seam(true, at);
          break;
        case 'wheel':
          // Lathe rings round the axle (wheel faces map outwards from it).
          for (let y = 0; y < 64; y++)
            for (let x = 0; x < 64; x++) if (Math.round(Math.hypot(Math.min(x, 64 - x), Math.min(y, 64 - y))) % 3 === 0) p.blend(x, y, mix(base, [255, 255, 255], 0.45), 0.3);
          break;
        default:
          for (const at of LINES) {
            seam(true, at);
            seam(false, at);
          }
          for (const x of LINES) for (const y of LINES) fixing(x + 3, y + 3);
      }

      if (face === 'bottom') each((c, i) => scale(c, 0.7 + n[i] * 0.1)); // undersides: shadowed and grimy

      // Wear.
      if (q === 'junk') {
        const rust = fbm(64, 64, rng, [16, 8, 4]);
        each((c, i) => {
          const k = rust[i] + n[i] * 0.2;
          return k > 0.7 ? mix(rgb('#8a4a20'), rgb('#3a1a0c'), clamp((k - 0.7) * 3)) : k > 0.66 ? rgb('#b06a30') : c;
        });
        // A welded-on repair patch.
        const [px0, py0] = [Math.floor(rng() * 64), Math.floor(rng() * 64)];
        rect(px0, py0, 18, 12, rgb('#6a6a70'));
        for (let i = 0; i < 18; i++) for (const y of [py0, py0 + 11]) dot(px0 + i, y, (i + y) % 2 ? rgb('#c8c0a8') : rgb('#5a5040'));
        for (let i = 0; i < 12; i++) for (const x of [px0, px0 + 17]) dot(x, py0 + i, (i + x) % 2 ? rgb('#c8c0a8') : rgb('#5a5040'));
        for (let k = 0; k < 3; k++) {
          // Dents.
          const [cx, cy] = [rng() * 64, rng() * 64];
          for (let y = -4; y <= 4; y++)
            for (let x = -6; x <= 6; x++) {
              const e = (x * x) / 36 + (y * y) / 16;
              if (e <= 1) dot(cx + x, cy + y, y < 0 ? [0, 0, 0] : [255, 255, 255], (1 - e) * 0.3);
            }
        }
        for (let i = 0; i < 6; i++) scratch(rng, 6 + rng() * 10, rgb('#d8d0c0'));
      } else if (q === 'stock') {
        for (let i = 0; i < 3; i++) scratch(rng, 5 + rng() * 8, mix(base, [255, 255, 255], 0.5));
        // Road dust settling along the bottom of each face.
        for (let y = 50; y < 64; y++) for (let x = 0; x < 64; x++) p.blend(x, y, rgb('#a09880'), ((y - 50) / 14) * 0.18 * (0.6 + n[y * 64 + x] * 0.8));
      }
      p.flush(ctx);
    }),
  );
}

// Markings, for the decal pieces CarView puts where they belong.
// Hazard stripes (turret rings, rocket-pod bands), a 16 x 8 tile.
const hazardTex = (q) =>
  cached(`hazard|${q}`, () =>
    tiled(16, 8, (ctx) => {
      const p = new Pix(16, 8);
      const wear = fbm(16, 8, makeRng(2200), [8, 4]);
      const c1 = q === 'elite' ? GOLD : rgb('#f2c200');
      p.fill((x, y) => {
        const c = (x + y) % 8 < 4 ? c1 : rgb('#141418');
        return q === 'junk' ? mix(c, rgb('#5a4a3a'), clamp(wear[y * 16 + x] * 1.2 - 0.3)) : c;
      });
      p.flush(ctx);
    }),
  );
// Stencilled mark plate, 19 x 9 px: MK1 (junk) to MK6 (elite).
const stencilTex = (q) =>
  cached(`stencil|${q}`, () =>
    canvasTexture(19, 9, (ctx) => {
      const p = new Pix(19, 9);
      const [bg, fg] = q === 'elite' ? [rgb('#101014'), GOLD] : q === 'junk' ? [rgb('#3a3430'), rgb('#a89878')] : [rgb('#1e1e24'), rgb('#e8e8e0')];
      p.fill(() => bg);
      const m = textMask(`MK${Q.indexOf(q) + 1}`);
      for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) if (m.on(i, j)) p.set(1 + i, 1 + j, fg);
      p.flush(ctx);
    }),
  );
// Wrap-around label band: text and a gap, 9 px tall; CarView wraps it round
// a tank a whole number of times.
const LABELS = { FUEL: ['#c82020', '#f4f4f0'], NOS: ['#2050c8', '#f4f4f0'], OIL: ['#141418', '#f2c200'], SMK: ['#6a6a70', '#f4f4f0'], FIRE: ['#ff7a1a', '#141418'] };
const labelTex = (text, q) =>
  cached(`label|${text}|${q}`, () => {
    const m = textMask(text);
    const w = m.w + 3;
    return canvasTexture(w, 9, (ctx) => {
      const rng = makeRng(2300 + Q.indexOf(q));
      const p = new Pix(w, 9);
      let [bg, fg] = (LABELS[text] || ['#6a6a70', '#f4f4f0']).map(rgb);
      if (q === 'elite') [bg, fg] = [rgb('#101014'), GOLD];
      p.fill((x, y) => (y === 0 || y === 8 ? scale(bg, 0.6) : bg));
      for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) if (m.on(i, j)) p.set(1 + i, 1 + j, fg);
      if (q === 'junk') {
        // Faded and torn.
        for (let x = 0; x < w; x++) for (let y = 0; y < 9; y++) p.set(x, y, mix(p.get(x, y), rgb('#6a5a48'), 0.35));
        for (let k = 0; k < 3; k++) {
          const [cx, cy] = [Math.floor(rng() * w), Math.floor(rng() * 9)];
          for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) p.set(cx + x, cy + y, rgb('#3a2a1c'));
        }
      }
      p.flush(ctx);
    });
  });

// Black trim (bumpers, sills, wells, arches), 64 x 64: cracked, sun-bleached
// plastic up to carbon with gold thread.
function trimTex(q, baseHex) {
  return cached(`trim|${q}|${baseHex}`, () =>
    tiled(64, 64, (ctx) => {
      const rng = makeRng(1600 + Q.indexOf(q));
      const base = rgb(baseHex);
      const p = new Pix(64, 64);
      const { dot } = tilePainter(p);
      switch (q) {
        case 'junk': {
          const n = fbm(64, 64, rng, [16, 8, 4]);
          p.fill((x, y) => mix(base, rgb('#5a5860'), clamp(n[y * 64 + x] * 1.4 - 0.3)));
          for (let k = 0; k < 10; k++) {
            let x = rng() * 64;
            let y = rng() * 64;
            for (let s = 0; s < 16; s++) {
              dot(x, y, rgb('#050506'));
              x += rng() * 2 - 0.5;
              y += rng() * 2 - 1;
            }
          }
          break;
        }
        case 'stock': // stippled plastic
          p.fill(() => scale(base, 0.85 + rng() * 0.35));
          break;
        case 'street': // satin with soft sheen bands
          p.fill((x, y) => mix(base, [255, 255, 255], 0.06 + 0.05 * Math.sin((y / 64) * TAU * 2)));
          break;
        case 'sport': // honeycomb mesh
          p.fill((x, y) => ((x + (Math.floor(y / 4) % 2) * 2) % 4 === 0 || y % 4 === 0 ? mix(base, [255, 255, 255], 0.18) : scale(base, 0.5)));
          break;
        default: // race / elite: carbon twill, elite with gold thread
          p.fill((x, y) => rgb(((x + (y >> 1)) >> 1) % 2 ? '#2a2a32' : '#121216'));
          if (q === 'elite')
            for (let i = 0; i < 64; i++) {
              dot(i, i * 2, GOLD);
              dot(i, i * 2 + 32, GOLD);
            }
      }
      p.flush(ctx);
    }),
  );
}

// Bare steel (cages, bumpers, barrels, spikes), 64 x 64: rusty, pitted,
// brushed, then polished bands.
function steelTex(q, baseHex) {
  return cached(`steel|${q}|${baseHex}`, () =>
    tiled(64, 64, (ctx) => {
      const rng = makeRng(1700 + Q.indexOf(q));
      const base = rgb(baseHex);
      const p = new Pix(64, 64);
      const rows = Array.from({ length: 64 }, () => 0.85 + rng() * 0.3);
      const polish = Q.indexOf(q) / 5;
      p.fill((x, y) => {
        const band = Math.abs(y - 20) < 3 || Math.abs(y - 44) < 2 ? polish * 0.5 : 0;
        return mix(scale(base, rows[y]), [255, 255, 255], band);
      });
      if (q === 'junk') {
        const n = fbm(64, 64, rng, [16, 8, 4]);
        for (let i = 0; i < 4096; i++) if (n[i] > 0.6) p.set(i % 64, i >> 6, mix(rgb('#7a3c1a'), rgb('#3a1a0c'), clamp((n[i] - 0.6) * 4)));
      }
      if (q === 'stock') for (let i = 0; i < 90; i++) p.blend(Math.floor(rng() * 64), Math.floor(rng() * 64), rgb('#2a2a30'), 0.4);
      p.flush(ctx);
    }),
  );
}

// Tyres, 32 x 16 (half a metre round the tread, a quarter across): bald junk,
// stock tread, sport and elite deep tread, race slicks. Plain rubber, no
// coloured marks.
function tyreTex(q) {
  return cached(`tyre|${q}`, () =>
    tiled(32, 16, (ctx) => {
      const rng = makeRng(1800 + Q.indexOf(q));
      const p = new Pix(32, 16);
      p.fill((x, y) => {
        const chevron = (x + Math.abs((y % 16) - 7.5) * 0.8) % 8;
        if (q === 'junk') return chevron < 0.8 ? rgb('#0c0c0e') : rgb(rng() < 0.1 ? '#2e2e34' : '#1e1e24');
        if (q === 'race') return rgb(rng() < 0.06 ? '#222228' : '#16161a');
        const deep = q === 'sport' || q === 'elite' ? 2.4 : 1.6;
        if (chevron < deep) return rgb('#060608');
        return rgb('#18181e');
      });
      p.flush(ctx);
    }),
  );
}

// Window glass, 128 x 64 (2 x 1 m): diagonal reflection streaks. Level 1 has
// a bullet hole with a spider-web of cracks; level 2 is shattered, with more
// impacts and chunks missing.
function glassTex(level) {
  return cached(`glass|${level}`, () =>
    tiled(128, 64, (ctx) => {
      const rng = makeRng(707);
      const p = new Pix(128, 64);
      const { dot } = tilePainter(p);
      const n = fbm(128, 64, rng, [32, 16]);
      p.fill((x, y) => mix(rgb('#0a0d18'), rgb('#141a2c'), n[y * 128 + x]));
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 128; x++) {
          const d = (x + y) % 64;
          if (d >= 10 && d < 18) p.blend(x, y, rgb('#34405e'), 0.55);
          else if (d >= 30 && d < 33) p.blend(x, y, rgb('#2a3450'), 0.45);
        }
      const crack = rgb('#b8c4dc');
      const web = (cx, cy, reach) => {
        for (let k = 0; k < 13; k++) {
          let a = (k / 13) * TAU + (rng() - 0.5) * 0.4;
          let [x, y] = [cx, cy];
          const len = reach * (0.4 + rng() * 0.6);
          for (let s = 0; s < len; s++) {
            dot(x, y, rng() < 0.15 ? [255, 255, 255] : crack);
            a += (rng() - 0.5) * 0.3;
            x += Math.cos(a);
            y += Math.sin(a) * 0.8;
          }
        }
        for (const r of [reach * 0.17, reach * 0.37, reach * 0.6])
          for (let a = 0; a < TAU; a += 0.05) if (Math.sin(a * 3 + r) <= 0.35) dot(cx + Math.cos(a) * r * 1.25, cy + Math.sin(a) * r, crack);
        for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) dot(cx + x, cy + y, rgb('#dfe6f5'));
        for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) dot(cx + x, cy + y, [0, 0, 0]);
      };
      // A missing chunk: jagged dark hole with a bright broken edge.
      const chunk = (cx, cy, r) => {
        for (let y = -r - 2; y <= r + 2; y++)
          for (let x = -2 * r; x <= 2 * r; x++) {
            const edge = r * (1 + 0.25 * Math.sin(Math.atan2(y, x) * 5 + cx));
            const d = Math.hypot(x / 1.4, y);
            if (d < edge * 0.8) dot(cx + x, cy + y, rgb('#020308'));
            else if (d < edge * 0.8 + 1) dot(cx + x, cy + y, crack);
          }
      };
      if (level >= 1) web(84, 30, 30);
      if (level >= 2) {
        web(28, 16, 22);
        web(112, 50, 20);
        chunk(84, 30, 7);
        chunk(30, 15, 5);
      }
      p.flush(ctx);
    }),
  );
}

// Lamps (emissive maps): tail lights as 4 px LED cells, headlights as one
// reflector bowl per 14 x 7 px (a 0.42 m lamp shows two).
const tailTex = () =>
  cached('tail', () =>
    tiled(4, 4, (ctx) => {
      const p = new Pix(4, 4);
      p.fill((x, y) => rgb(x === 0 || y === 0 ? '#4a040c' : x === 2 && y === 2 ? '#ff8090' : '#ff2a3a'));
      p.flush(ctx);
    }),
  );
const headTex = () =>
  cached('head', () =>
    tiled(14, 7, (ctx) => {
      const p = new Pix(14, 7);
      p.fill((x, y) => {
        const d = Math.hypot(x + 0.5 - 7, y + 0.5 - 3.5);
        return rgb(d < 1.5 ? '#fffaf0' : d < 2.6 ? '#b8d4ff' : d < 3.4 ? '#4a5a78' : '#10121a');
      });
      p.flush(ctx);
    }),
  );

// Number plate, 34 x 9 px: exactly the 0.53 x 0.14 m plate at 64 px/m.
const PLATE_TEXT = { junk: 'RUST0', stock: 'TNT01', street: 'STR33', sport: 'SPD77', race: 'R4Z0R', elite: 'ELITE' };
function plateTex(q) {
  return cached(`plate|${q}`, () =>
    tiled(34, 9, (ctx) => {
      const rng = makeRng(1900 + Q.indexOf(q));
      const p = new Pix(34, 9);
      const [bg, fg] = q === 'elite' ? [rgb('#101014'), GOLD] : q === 'junk' ? [rgb('#a89878'), rgb('#2a2018')] : [rgb('#dcdcd0'), rgb('#141418')];
      p.fill(() => bg);
      for (let x = 0; x < 34; x++) {
        p.set(x, 0, fg);
        p.set(x, 8, fg);
      }
      for (let y = 0; y < 9; y++) {
        p.set(0, y, fg);
        p.set(33, y, fg);
      }
      const m = textMask(PLATE_TEXT[q]);
      for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) if (m.on(i, j)) p.set(2 + i, 1 + j, fg);
      if (q === 'junk') for (let i = 0; i < 25; i++) p.blend(Math.floor(rng() * 34), Math.floor(rng() * 9), rgb('#6a3418'), 0.7);
      p.flush(ctx);
    }),
  );
}

// Textures a CarView, picked by each material's tag (kind
// and quality, set in carView.js). Colour is baked into the texture.
// Which way a box face points on the car: top, bottom, end (front or back) or side.
const BOX_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]; // BoxGeometry face order
const _fn = new THREE.Vector3();
function faceOf(mesh, local) {
  _fn.set(...local).applyQuaternion(mesh.quaternion);
  if (_fn.y > 0.7) return 'top';
  if (_fn.y < -0.7) return 'bottom';
  return Math.abs(_fn.z) > Math.abs(_fn.x) ? 'end' : 'side';
}
// Gives a part mesh one material per face kind (boxes: sides, top, bottom, ends;
// cylinders: the wrap and the end caps), each a clone of its original material
// shared between meshes, so every face can take its own texture.
const faceMats = new WeakMap();
function splitFaces(mesh) {
  const base = (mesh.userData.baseMaterial ??= mesh.material);
  const g = mesh.geometry;
  const faces = g.type === 'BoxGeometry' ? BOX_NORMALS.map((n) => faceOf(mesh, n)) : g.type === 'CylinderGeometry' ? ['side', 'end', 'end'] : null;
  if (!faces) return;
  if (!faceMats.has(base)) faceMats.set(base, {});
  const cache = faceMats.get(base);
  mesh.material = faces.map((face) => {
    if (!cache[face]) {
      cache[face] = base.clone();
      cache[face].userData = { ...base.userData, face };
    }
    return cache[face];
  });
}

export function applyCarTextures(car, { crackedGlass = false } = {}) {
  const seen = new Set();
  const stage = car.stage ?? 0;
  car.group.traverse((o) => {
    if (!o.isMesh) return;
    const baseMat = o.userData.baseMaterial ?? o.material;
    if (isClassic(baseMat?.userData)) fitShortSide(o.geometry);
    if (baseMat?.userData?.kind === 'part') splitFaces(o);
    for (const mt of Array.isArray(o.material) ? o.material : [o.material]) {
      if (seen.has(mt)) continue;
      seen.add(mt);
      const { kind, quality, slot } = mt.userData;
      const base = (mt.userData.base ??= `#${mt.color.getHexString()}`);
      let map = null;
      if (mt === car.tailMat) {
        mt.map = tailTex();
        if (stage < 4) mt.color.set('#ffffff').multiplyScalar(1.5);
      } else if (!kind && car.headlights.some((h) => h.material === mt)) mt.map = headTex();
      else if (kind === 'paint') map = liveryTex(quality, base, stage, stage ? car.damageMarks : null);
      else if (kind === 'part') map = partTex(quality, slot, base, mt.userData.face || 'side');
      else if (kind === 'trim') map = trimTex(quality, base);
      else if (kind === 'steel') map = steelTex(quality, base);
      else if (kind === 'glass') map = glassTex(stage >= 3 ? 2 : stage >= 1 || quality === 'junk' || crackedGlass ? 1 : 0);
      else if (kind === 'tire') map = tyreTex(quality);
      else if (kind === 'plate') map = plateTex(quality);
      else if (kind === 'decal') map = mt.userData.decal === 'hazard' ? hazardTex(quality) : mt.userData.decal === 'stencil' ? stencilTex(quality) : labelTex(mt.userData.text, quality);
      if (map) {
        mt.map = map;
        mt.color.set(stage >= 4 && kind !== 'paint' ? '#5a4c46' : '#ffffff'); // wrecks: sooted parts, charred livery
      }
      mt.needsUpdate = true;
    }
  });
}

export { Q, liveryTex, partTex, trimTex, steelTex, tyreTex, glassTex, plateTex, hazardTex, stencilTex, labelTex, tailTex, headTex };
