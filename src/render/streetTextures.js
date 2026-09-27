import { makeRng, PALETTE } from './textures.js';
import { drawText, textWidth } from '../ui/bitmapFont.js';
import { canvasTexture, rgb, mix, scale, clamp, Pix, fbm, blobs, textMask, neonText, ledGrid } from './pixelArt.js';

// Street textures at the look of the concept art: wet asphalt with a roughness map
// (puddles gloss), chevron and concrete barriers, apartment and glass-tower
// facades with lit windows, LED and neon signs, glass, lamps and tyres.

export function createStreetTextures() {
  const T = {};

  // Wet asphalt, same 128x256 layout as the current road: edge lines, two dashed
  // lane dividers. Adds tyre-polished wheel paths, repair patches, a manhole,
  // oil stains and puddles, plus a roughness map so wet parts reflect.
  {
    const rng = makeRng(301);
    const w = 128;
    const h = 256;
    const p = new Pix(w, h);
    const rough = new Float32Array(w * h).fill(0.62);
    const n = fbm(w, h, rng, [64, 32, 16, 8]);
    const dark = rgb('#0f0e15');
    const light = rgb('#211f2b');
    p.fill((x, y) => mix(dark, light, clamp((n[y * w + x] - 0.3) * 1.8)));
    // Aggregate: scattered light and dark stones.
    for (let i = 0; i < w * h * 0.16; i++) {
      const x = Math.floor(rng() * w);
      const y = Math.floor(rng() * h);
      const r = rng();
      if (r < 0.45) p.blend(x, y, rgb('#2c2a36'), 0.8);
      else if (r < 0.8) p.blend(x, y, rgb('#09080d'), 0.8);
      else p.blend(x, y, rgb('#3a3746'), 0.6);
    }
    // Tyre-polished wheel paths: two per lane, darker and glossier.
    const lane = w / 3;
    for (let l = 0; l < 3; l++)
      for (const off of [0.27, 0.73]) {
        const cx = l * lane + off * lane;
        for (let x = Math.floor(cx - 5); x <= cx + 5; x++) {
          const t = 1 - Math.abs(x - cx) / 5.5;
          for (let y = 0; y < h; y++) {
            p.blend(x, y, rgb('#0d0c12'), 0.35 * t);
            rough[((x + w) % w) + y * w] -= 0.22 * t;
          }
        }
      }
    // Repair patches: flatter tone, dark tar seams.
    for (let k = 0; k < 4; k++) {
      const pw = 10 + Math.floor(rng() * 24);
      const ph = 14 + Math.floor(rng() * 40);
      const px = Math.floor(8 + rng() * (w - pw - 16));
      const py = Math.floor(rng() * h);
      const tone = rgb(rng() < 0.5 ? '#1b1a23' : '#141319');
      for (let y = 0; y < ph; y++)
        for (let x = 0; x < pw; x++) {
          const edge = x === 0 || y === 0 || x === pw - 1 || y === ph - 1;
          p.set(px + x, py + y, edge ? rgb('#08070b') : mix(tone, p.get(px + x, py + y), 0.3));
        }
    }
    // Manhole cover in the middle lane.
    {
      const cx = Math.round(w / 2 + 6);
      const cy = 190;
      for (let y = -7; y <= 7; y++)
        for (let x = -7; x <= 7; x++) {
          const d = Math.hypot(x, y);
          if (d > 7.2) continue;
          let c = rgb('#23222b');
          if (d > 6.2) c = rgb('#08070b');
          else if (d > 5.2) c = rgb('#3a3844');
          else if ((x + y + 20) % 3 === 0 || (x - y + 20) % 3 === 0) c = rgb('#17161d');
          p.set(cx + x, cy + y, c);
          rough[(cy + y) * w + cx + x] = 0.35;
        }
    }
    // Cracks: branching random walks.
    for (let k = 0; k < 28; k++) {
      let x = rng() * w;
      let y = rng() * h;
      let dir = rng() * Math.PI * 2;
      const len = 6 + rng() * 22;
      for (let s = 0; s < len; s++) {
        p.set(x, y, rgb('#060509'));
        if (rng() < 0.3) p.set(x + 1, y, rgb('#0a090e'));
        dir += (rng() - 0.5) * 0.9;
        x += Math.cos(dir);
        y += Math.sin(dir);
      }
    }
    // Oil stains in lane centres.
    const oil = blobs(w, h, rng, 5, 2, 5, 1.4);
    for (let i = 0; i < w * h; i++) {
      if (oil[i] <= 0) continue;
      const x = i % w;
      const y = (i / w) | 0;
      const lc = Math.abs(((x % lane) / lane) - 0.5);
      if (lc > 0.2) continue;
      p.blend(x, y, rgb('#07060a'), 0.6 * Math.min(1, oil[i] * 2));
      if (rng() < 0.05) p.set(x, y, rgb('#2a1a3a')); // faint rainbow sheen
      rough[i] = Math.min(rough[i], 0.3);
    }
    // Lane lines: worn white paint, same positions as the current road.
    const lineAt = (x0, len) => {
      for (let y = 0; y < len; y++)
        for (let x = x0; x < x0 + 2; x++) {
          const r = rng();
          if (r < 0.05) continue; // chipped away
          p.set(x, y, r < 0.18 ? rgb('#8e8e9c') : r < 0.3 ? rgb('#b8b8c6') : rgb(PALETTE.line));
          rough[y * w + x] = 0.55;
        }
    };
    lineAt(3, h);
    lineAt(w - 5, h);
    for (const lx of [Math.round(w / 3), Math.round((2 * w) / 3)]) lineAt(lx - 1, h / 2);
    // Puddles last so they cover lines too: flat, deep blue-black, near mirror.
    const pud = blobs(w, h, rng, 6, 2, 7, 2);
    for (let i = 0; i < w * h; i++) {
      const m = pud[i];
      if (m <= 0.02) continue;
      const x = i % w;
      const y = (i / w) | 0;
      const edge = m < 0.14;
      p.set(x, y, edge ? mix(p.get(x, y), rgb('#1b1e33'), 0.7) : mix(p.get(x, y), rgb('#0a0c1a'), 0.82));
      rough[i] = edge ? 0.25 : 0.04;
    }
    T.road = canvasTexture(w, h, (ctx) => p.flush(ctx));
    T.roadRough = canvasTexture(
      w,
      h,
      (ctx) => {
        const r = new Pix(w, h);
        r.fill((x, y) => {
          const v = clamp(rough[y * w + x]) * 255;
          return [v, v, v];
        });
        r.flush(ctx);
      },
      { color: false },
    );
  }

  // Chevron barrier, current 64x32 layout: steel rail with bolts, chevron panel
  // with road grime rising from the bottom, scrape marks and rust weeping from bolts.
  {
    const rng = makeRng(402);
    const w = 64;
    const h = 32;
    const p = new Pix(w, h);
    const n = fbm(w, h, rng, [16, 8, 4]);
    p.fill(() => rgb('#0e0c14'));
    for (let y = 7; y < h - 3; y++)
      for (let x = 0; x < w; x++) {
        const d = (x + Math.abs(y - 17.5)) % 16;
        if (d < 6) p.set(x, y, d < 1 ? rgb('#8a6e00') : d > 5 ? rgb('#c49a00') : rgb(PALETTE.chevron));
        else p.set(x, y, mix(rgb('#0e0c14'), rgb('#1a1822'), n[y * w + x]));
      }
    // Grime: heavier toward the road.
    for (let y = 4; y < h; y++)
      for (let x = 0; x < w; x++) {
        const g = clamp(((y - 8) / (h - 8)) * 0.8 + (n[y * w + x] - 0.5) * 0.9);
        p.mul(x, y, 1 - 0.55 * g);
        if (rng() < 0.05 * g) p.set(x, y, rgb('#2a2016'));
      }
    // Chipped paint.
    for (let i = 0; i < 60; i++) p.set(rng() * w, 7 + rng() * (h - 10), rgb('#16141c'));
    // Scrapes from cars: long horizontal marks at wheel-hub height.
    for (let k = 0; k < 5; k++) {
      const y = 13 + Math.floor(rng() * 10);
      const x = Math.floor(rng() * w);
      const len = 6 + Math.floor(rng() * 22);
      for (let i = 0; i < len; i++) p.blend(x + i, y, rgb('#8c8a98'), 0.55 + rng() * 0.3);
      if (rng() < 0.6) for (let i = 2; i < len - 2; i++) p.blend(x + i, y + 1, rgb('#4a4855'), 0.4);
    }
    // Steel rail with highlight, bolts and rust drips.
    for (let x = 0; x < w; x++) {
      p.set(x, 0, rgb('#2e2c38'));
      p.set(x, 1, rgb('#8a889c'));
      p.set(x, 2, rgb('#5a5868'));
      p.set(x, 3, rgb('#3a3846'));
      p.set(x, 4, rgb('#121019'));
    }
    for (let bx = 4; bx < w; bx += 16) {
      p.set(bx, 2, rgb('#c8c6d8'));
      p.set(bx + 1, 3, rgb('#1a1822'));
      const len = 2 + Math.floor(rng() * 6);
      for (let j = 0; j < len; j++) p.blend(bx, 4 + j, rgb('#6a3418'), 0.8 - j * 0.1);
    }
    // Amber reflector.
    p.set(24, 6, rgb('#ffcc40'));
    p.set(25, 6, rgb('#c08010'));
    for (let x = 0; x < w; x++) for (let y = h - 3; y < h; y++) p.set(x, y, rgb('#05040a'));
    T.wallChevron = canvasTexture(w, h, (ctx) => p.flush(ctx));
  }

  // Concrete jersey barrier (concept 2), 64x32: cast segments with a joint,
  // bevel line, rain streaks and a reflective strip.
  {
    const rng = makeRng(417);
    const w = 64;
    const h = 32;
    const p = new Pix(w, h);
    const n = fbm(w, h, rng, [32, 16, 8, 4]);
    p.fill((x, y) => mix(rgb('#34323c'), rgb('#4c4a56'), n[y * w + x]));
    for (let i = 0; i < w * h * 0.25; i++) p.blend(rng() * w, rng() * h, rgb(rng() < 0.5 ? '#26242e' : '#5a5866'), 0.7);
    // Top cap and the bevel where the profile widens.
    for (let x = 0; x < w; x++) {
      p.set(x, 0, rgb('#6a6876'));
      p.set(x, 1, rgb('#56545f'));
      p.set(x, 11, rgb('#62606c'));
      p.set(x, 12, rgb('#24222b'));
    }
    // Segment joint.
    for (let y = 0; y < h; y++) {
      p.set(0, y, rgb('#0e0d12'));
      p.set(1, y, rgb('#1e1c24'));
      p.set(63, y, rgb('#5c5a66'));
    }
    // Rain streaks from the top.
    for (let k = 0; k < 14; k++) {
      const x = Math.floor(rng() * w);
      const len = 4 + Math.floor(rng() * 20);
      for (let y = 1; y < len; y++) p.mul(x, y, 0.72 + (y / len) * 0.25);
    }
    // Grime up from the road.
    for (let y = 18; y < h; y++) for (let x = 0; x < w; x++) p.mul(x, y, 1 - ((y - 18) / 14) * 0.55 * (0.6 + n[y * w + x] * 0.8));
    // Reflective strip, worn.
    for (let x = 2; x < w - 1; x++) {
      if (rng() < 0.12) continue;
      p.set(x, 24, rgb(rng() < 0.2 ? '#8a6e00' : '#e8b800'));
    }
    for (let x = 0; x < w; x++) for (let y = h - 2; y < h; y++) p.set(x, y, rgb('#0a090e'));
    T.wallConcrete = canvasTexture(w, h, (ctx) => p.flush(ctx));
  }

  // Armour plating for car bodies, 64x64, greyscale so it multiplies the paint:
  // offset plates, rivets, welds, scratches, dents and a few bullet hits.
  const armorLayout = (p, rng, base) => {
    const w = 64;
    const n = fbm(w, w, rng, [32, 16, 8]);
    const rows = [0, 22, 43];
    const cuts = [[0, 36], [18, 50], [8, 30]];
    const tone = rows.map(() => cuts[0].map(() => 1 + (rng() - 0.5) * 0.12));
    p.fill((x, y) => {
      const r = y < 22 ? 0 : y < 43 ? 1 : 2;
      const c = cuts[r];
      const col = x >= c[0] && x < c[1] ? 0 : 1;
      const g = base * tone[r][col] * (0.8 + n[y * w + x] * 0.25);
      return [g, g, g];
    });
    // Seams: dark gap, lit lower/right lip, shaded upper/left lip.
    const seamH = (y, x0, x1) => {
      for (let x = x0; x < x1; x++) {
        p.set(x, y, [60, 60, 60]);
        p.mul(x, y - 1, 0.78);
        p.set(x, y + 1, [255, 255, 255]);
      }
    };
    const seamV = (x, y0, y1) => {
      for (let y = y0; y < y1; y++) {
        p.set(x, y, [60, 60, 60]);
        p.mul(x - 1, y, 0.8);
        p.set(x + 1, y, [250, 250, 250]);
      }
    };
    rows.forEach((y, r) => seamH(y, 0, w));
    rows.forEach((y0, r) => {
      const y1 = rows[r + 1] ?? w;
      for (const x of cuts[r]) seamV(x, y0 + 1, y1);
    });
    // Rivets along the seams.
    const rivet = (x, y) => {
      p.set(x, y, [255, 255, 255]);
      p.set(x + 1, y + 1, [80, 80, 80]);
      p.set(x + 1, y, [190, 190, 190]);
    };
    rows.forEach((y) => {
      for (let x = 3; x < w; x += 6) {
        rivet(x, y + 3);
        rivet(x, y - 3);
      }
    });
    rows.forEach((y0, r) => {
      const y1 = rows[r + 1] ?? w;
      for (const x of cuts[r]) for (let y = y0 + 6; y < y1 - 2; y += 6) rivet(x + 3, y);
    });
    return n;
  };
  const wear = (p, rng) => {
    // Weld bead across one plate.
    for (let x = 40; x < 60; x++) {
      p.set(x, 33 + (x % 2), x % 2 ? [200, 200, 200] : [150, 150, 150]);
      p.set(x, 34 - (x % 2), [120, 120, 120]);
    }
    // Scratches: bright line with a dark shadow under it.
    for (let k = 0; k < 22; k++) {
      let x = rng() * 64;
      let y = rng() * 64;
      const a = (rng() - 0.5) * 1.2 + (rng() < 0.5 ? 0 : Math.PI);
      const len = 3 + rng() * 10;
      for (let i = 0; i < len; i++) {
        p.set(x, y, [255, 255, 255]);
        p.mul(x, y + 1, 0.7);
        x += Math.cos(a);
        y += Math.sin(a) * 0.5;
      }
    }
    // Dents.
    for (let k = 0; k < 4; k++) {
      const cx = rng() * 64;
      const cy = rng() * 64;
      for (let y = -2; y <= 2; y++) for (let x = -3; x <= 3; x++) if (x * x / 9 + y * y / 4 <= 1) p.mul(cx + x, cy + y, 0.75 + (y + 2) * 0.05);
      p.set(cx - 1, cy - 2, [255, 255, 255]);
    }
    // Bullet hits.
    for (let k = 0; k < 4; k++) {
      const cx = Math.floor(rng() * 64);
      const cy = Math.floor(rng() * 64);
      for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [2, 0], [-1, 1], [2, 1], [0, 2], [1, 2]]) p.set(cx + dx, cy + dy, [175, 175, 175]);
      p.set(cx - 1, cy - 1, [255, 255, 255]);
      p.rect(cx, cy, 2, 2, [30, 30, 30]);
    }
  };
  T.armor = canvasTexture(64, 64, (ctx) => {
    const rng = makeRng(503);
    const p = new Pix(64, 64);
    armorLayout(p, rng, 232);
    wear(p, rng);
    p.flush(ctx);
  });

  // Junk finish: the same plates, eaten by rust with flaking paint round the edges.
  T.rust = canvasTexture(64, 64, (ctx) => {
    const rng = makeRng(503);
    const p = new Pix(64, 64);
    armorLayout(p, rng, 232);
    wear(p, rng);
    const r2 = makeRng(611);
    const n = fbm(64, 64, r2, [32, 16, 8, 4]);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const v = n[y * 64 + x] + (y / 64) * 0.18; // rust collects low on panels
        if (v > 0.6) {
          const t = clamp((v - 0.6) * 4);
          const c = mix(rgb('#8a4a20'), rgb('#3a1a0c'), t);
          const s = r2();
          p.set(x, y, s < 0.12 ? rgb('#b06a30') : s < 0.2 ? rgb('#2a1208') : c);
        } else if (v > 0.55) {
          p.set(x, y, r2() < 0.5 ? [255, 255, 255] : rgb('#6a3418')); // flaking edge
        }
      }
    p.flush(ctx);
  });

  // Window glass: dark with two reflection streaks. The cracked version adds a
  // bullet hole with a spider-web of radial and ring cracks.
  const glass = (cracked) =>
    canvasTexture(
      64,
      32,
      (ctx) => {
        const rng = makeRng(707);
        const p = new Pix(64, 32);
        p.fill((x, y) => mix(rgb('#0a0d18'), rgb('#141a2c'), y / 32));
        for (let y = 0; y < 32; y++)
          for (let x = 0; x < 64; x++) {
            const d1 = x + y * 0.9 - 14;
            const d2 = x + y * 0.9 - 30;
            if (d1 >= 0 && d1 < 5) p.blend(x, y, rgb('#34405e'), 0.6);
            if (d2 >= 0 && d2 < 2) p.blend(x, y, rgb('#2a3450'), 0.5);
          }
        for (let x = 0; x < 64; x++) {
          p.set(x, 0, rgb('#05060c'));
          p.set(x, 31, rgb('#05060c'));
        }
        if (cracked) {
          const cx = 40;
          const cy = 13;
          const crack = rgb('#b8c4dc');
          const plot = (x, y, bright) => {
            if (x < 1 || y < 1 || x > 62 || y > 30) return;
            p.set(x, y, bright ? [255, 255, 255] : crack);
          };
          const ends = [];
          for (let k = 0; k < 11; k++) {
            let a = (k / 11) * Math.PI * 2 + (rng() - 0.5) * 0.4;
            let x = cx;
            let y = cy;
            const len = 9 + rng() * 26;
            for (let s = 0; s < len; s++) {
              plot(Math.round(x), Math.round(y), rng() < 0.15);
              a += (rng() - 0.5) * 0.35;
              x += Math.cos(a);
              y += Math.sin(a) * 0.8;
            }
            ends.push(a);
          }
          for (const r of [3.5, 7.5, 13]) {
            for (let a = 0; a < Math.PI * 2; a += 0.08) {
              if (Math.sin(a * 3 + r) > 0.35) continue; // broken rings
              plot(Math.round(cx + Math.cos(a) * r * 1.25), Math.round(cy + Math.sin(a) * r), false);
            }
          }
          p.rect(cx - 1, cy - 1, 3, 3, rgb('#dfe6f5'));
          p.set(cx, cy, rgb('#000000'));
          p.set(cx + 1, cy, rgb('#05060c'));
        }
        p.flush(ctx);
      },
      { repeat: false },
    );
  T.glass = glass(false);
  T.glassCracked = glass(true);

  // Tail light, 16x8: segmented LED cells in a dark housing (emissive map).
  T.tail = canvasTexture(
    16,
    8,
    (ctx) => {
      const p = new Pix(16, 8);
      p.fill(() => rgb('#1a0206'));
      for (let y = 1; y < 7; y++)
        for (let x = 1; x < 15; x++) {
          const cell = x % 2 === 1 && y % 2 === 1;
          const mid = Math.abs(y - 3.5) < 1.5;
          p.set(x, y, cell ? rgb(mid ? '#ff7080' : '#ff2a3a') : rgb('#7a0814'));
        }
      p.flush(ctx);
    },
    { repeat: false },
  );
  // Headlight, 16x8: twin reflector bowls.
  T.head = canvasTexture(
    16,
    8,
    (ctx) => {
      const p = new Pix(16, 8);
      p.fill(() => rgb('#10121a'));
      for (const cx of [4, 11.5])
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 16; x++) {
            const d = Math.hypot(x + 0.5 - cx, y + 0.5 - 4);
            if (d < 1.4) p.set(x, y, rgb('#fffaf0'));
            else if (d < 2.6) p.set(x, y, rgb('#b8d4ff'));
            else if (d < 3.4) p.set(x, y, rgb('#4a5a78'));
          }
      p.flush(ctx);
    },
    { repeat: false },
  );

  // Tyre tread, 32x16: u runs round the tyre, v across it. Chevron blocks.
  T.tread = canvasTexture(32, 16, (ctx) => {
    const rng = makeRng(808);
    const p = new Pix(32, 16);
    p.fill((x, y) => {
      if (y === 0 || y === 15) return rgb('#26262e');
      const groove = (x + Math.abs(y - 7.5) * 0.8) % 8 < 1.6;
      const centre = y === 7 || y === 8;
      return groove || centre ? rgb('#070709') : rgb('#18181e');
    });
    for (let i = 0; i < 40; i++) p.blend(rng() * 32, 1 + rng() * 14, rgb('#2a2a32'), 0.6);
    p.flush(ctx);
  });
  // Wheel face (cylinder cap UVs are a disc in 0..1): sidewall, spoked rim, hub.
  T.rim = canvasTexture(
    32,
    32,
    (ctx) => {
      const p = new Pix(32, 32);
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) {
          const dx = x + 0.5 - 16;
          const dy = y + 0.5 - 16;
          const d = Math.hypot(dx, dy);
          const a = Math.atan2(dy, dx);
          let c;
          if (d > 15) c = rgb('#0c0c10');
          else if (d > 11) c = Math.abs(d - 13) < 0.5 && Math.sin(a * 18) > 0.3 ? rgb('#34343e') : rgb('#16161b'); // sidewall lettering
          else if (d > 10) c = rgb('#9a9aa8'); // rim lip
          else if (d > 3.5) {
            const spoke = Math.cos(a * 5) > 0.55;
            c = spoke ? (dx - dy > 0 ? rgb('#6a6a78') : rgb('#8e8e9c')) : rgb('#101014');
          } else if (d > 2.5) c = rgb('#b8b8c6');
          else c = rgb('#2a2a32');
          p.set(x, y, c);
        }
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + 0.6;
        p.set(16 + Math.cos(a) * 4.5, 16 + Math.sin(a) * 4.5, rgb('#e0e0ea'));
      }
      p.flush(ctx);
    },
    { repeat: false },
  );

  // Apartment facade, same 64x128 / 4 px window cells as the current building:
  // pilasters, ledges, grime runs, blinds, A/C units, and a glow map with varied
  // warm/cool rooms, blinds half-drawn, TV flicker and people in windows.
  {
    const rng = makeRng(911);
    const w = 64;
    const h = 128;
    const n = fbm(w, h, rng, [32, 16, 8]);
    const wall = new Pix(w, h);
    const glow = new Pix(w, h);
    glow.fill(() => [0, 0, 0]);
    wall.fill((x, y) => mix(rgb('#15131e'), rgb('#26233a'), n[y * w + x]));
    for (let i = 0; i < w * h * 0.2; i++) wall.blend(rng() * w, rng() * h, rgb(rng() < 0.5 ? '#100e18' : '#2c2940'), 0.6);
    for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y++) {
      wall.set(x, y, rgb('#2e2b42'));
      wall.set(x + 1, y, rgb('#1a1826'));
    }
    const warm = ['#ffcf8a', '#ffd9a0', '#ffb860', '#fff0c8', '#ffe2b0'];
    const cool = ['#cfe8ff', '#a8d8ff', '#e8f4ff'];
    const neon = [PALETTE.cyan, PALETTE.pink, PALETTE.violet];
    for (let fy = 0; fy < 32; fy++) {
      const y = fy * 4;
      for (let x = 0; x < w; x++) wall.set(x, y + 3, rgb('#34304a')); // floor ledge
      const floorLit = rng() < 0.05;
      for (let fx = 0; fx < 16; fx++) {
        if (fx === 0 && fy === 0) continue; // texel (0,0) stays plain wall for roofs
        const x = fx * 4 + 1;
        const kind = rng();
        // Dark glass, faint sky reflection on top.
        wall.set(x, y, rgb('#161a2c'));
        wall.set(x + 1, y, rgb('#10131f'));
        wall.rect(x, y + 1, 2, 2, rgb('#0a0a12'));
        wall.set(x + 2, y, rgb('#0c0b13')); // frame shadow
        if (kind < 0.15) for (let j = 0; j < 3; j++) wall.set(x + (j % 2), y + j, rgb('#1c1a26')); // blinds
        if (rng() < 0.08) wall.rect(x, y + 3, 2, 1, rgb('#4a4658')); // A/C unit
        if (rng() < 0.18) for (let j = 4; j < 4 + Math.floor(rng() * 8); j++) wall.mul(x + Math.floor(rng() * 2), y + j, 0.8); // grime run
        const on = floorLit || rng() < 0.16;
        if (!on) continue;
        const r = rng();
        const c = rgb(r < 0.7 ? warm[Math.floor(rng() * warm.length)] : r < 0.9 ? cool[Math.floor(rng() * cool.length)] : neon[Math.floor(rng() * neon.length)]);
        const style = rng();
        for (let j = 0; j < 3; j++)
          for (let i = 0; i < 2; i++) {
            let k = 1;
            if (style < 0.25 && j === 0) k = 0.35; // blind half down
            if (style > 0.9) k = 0.6 + 0.4 * ((i + j) % 2); // TV flicker
            glow.set(x + i, y + j, scale(style > 0.9 ? rgb('#7090ff') : c, k));
          }
        if (style > 0.75 && style <= 0.9) glow.set(x + (rng() < 0.5 ? 0 : 1), y + 2, rgb('#140e10')); // someone at the window
      }
    }
    // Neon strip up one pilaster.
    for (let y = 60; y < 100; y++) glow.set(32, y, rgb(PALETTE.pink));
    T.building = canvasTexture(w, h, (ctx) => wall.flush(ctx));
    T.buildingGlow = canvasTexture(w, h, (ctx) => glow.flush(ctx));
  }

  // Glass office tower facade, 64x128: blue glass bands with mullions, a neon
  // reflection sweep, and whole runs of office floors lit in cool white.
  {
    const rng = makeRng(1013);
    const w = 64;
    const h = 128;
    const wall = new Pix(w, h);
    const glow = new Pix(w, h);
    glow.fill(() => [0, 0, 0]);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const band = y % 4 === 3;
        const mull = x % 4 === 0;
        let c = band ? rgb('#231f33') : mull ? rgb('#1c2236') : rgb('#0c1224');
        const sweep = (x * 0.6 + y) % 128;
        if (!band && !mull && sweep > 40 && sweep < 52) c = mix(c, rgb('#3a2050'), 0.55);
        if (!band && !mull && y % 4 === 0) c = mix(c, rgb('#1e2a44'), 0.6);
        wall.set(x, y, c);
      }
    wall.set(0, 0, rgb('#231f33'));
    for (let fy = 0; fy < 32; fy++) {
      let x = 0;
      while (x < 16) {
        const run = 2 + Math.floor(rng() * 6);
        if (rng() < 0.16 && !(fy === 0 && x === 0)) {
          const c = rgb(rng() < 0.75 ? '#9ab8d8' : '#6ac8d8');
          for (let k = x; k < Math.min(16, x + run); k++)
            for (let j = 0; j < 3; j++) for (let i = 1; i < 4; i++) glow.set(k * 4 + i, fy * 4 + j, scale(c, j === 2 ? 0.7 : 1));
        }
        x += run;
      }
    }
    T.tower = canvasTexture(w, h, (ctx) => wall.flush(ctx));
    T.towerGlow = canvasTexture(w, h, (ctx) => glow.flush(ctx));
  }

  // --- Signs (emissive, not tiled) ---

  // Skull billboard on an LED screen.
  // Everything sits on a 3 px grid so the LED gaps fall between "pixels".
  T.skull = canvasTexture(
    150,
    174,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#2a0418');
      g.addColorStop(1, '#0a0210');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      drawText(ctx, 'DIE', 24, 9, { scale: 6, color: PALETTE.pink });
      drawText(ctx, 'FAST', 6, 123, { scale: 6, color: PALETTE.pink });
      const skull = ['..#######..', '.#########.', '###########', '##...#...##', '##...#...##', '###########', '.####.####.', '..#######..', '..#.#.#.#..', '..#######..'];
      skull.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
          if (row[rx] !== '#') continue;
          ctx.fillStyle = ry < 3 ? '#ffb0d0' : '#ff6aa0';
          ctx.fillRect(42 + rx * 6, 57 + ry * 6, 6, 6);
        }
      });
      ledGrid(ctx, 0, 0, w, h);
      ctx.fillStyle = '#2a2838';
      ctx.fillRect(0, 0, w, 2);
      ctx.fillRect(0, h - 2, w, 2);
      ctx.fillRect(0, 0, 2, h);
      ctx.fillRect(w - 2, 0, 2, h);
    },
    { repeat: false },
  );

  // Orange stacked ad (concept 2): dark text on a bright LED panel.
  T.ad = canvasTexture(
    120,
    180,
    (ctx, w, h) => {
      ctx.fillStyle = '#ff7a1a';
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,220,120,0.35)');
      g.addColorStop(1, 'rgba(120,20,0,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ['ARMOR', 'FUEL', 'AMMO', 'BIGGER', 'BOLDER', 'FASTER'].forEach((word, i) => {
        drawText(ctx, word, 6, 9 + i * 27, { scale: 3, color: '#2a0800' });
      });
      ledGrid(ctx, 0, 0, w, h, 0.55);
      ctx.fillStyle = '#1a1420';
      ctx.fillRect(0, 0, w, 3);
      ctx.fillRect(0, h - 3, w, 3);
      ctx.fillRect(0, 0, 3, h);
      ctx.fillRect(w - 3, 0, 3, h);
    },
    { repeat: false },
  );

  // Neon tube lettering on a dark backing board.
  T.neonCity = canvasTexture(
    130,
    72,
    (ctx, w, h) => {
      ctx.fillStyle = '#07040f';
      ctx.fillRect(0, 0, w, h);
      neonText(ctx, 'NEON', Math.round((w - textWidth('NEON', 4)) / 2), 8, 4, PALETTE.pink);
      neonText(ctx, 'SPRAWL', Math.round((w - textWidth('SPRAWL', 3)) / 2), 45, 3, PALETTE.cyan);
    },
    { repeat: false },
  );
  T.hotel = canvasTexture(
    30,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#07040f';
      ctx.fillRect(0, 0, w, h);
      [...'HOTEL'].forEach((ch, k) => neonText(ctx, ch, 8, 6 + k * 24, 3, k % 2 ? '#ff5a8a' : PALETTE.pink));
      ctx.fillStyle = PALETTE.violet;
      ctx.fillRect(1, 1, w - 2, 1);
      ctx.fillRect(1, h - 2, w - 2, 1);
      ctx.fillRect(1, 1, 1, h - 2);
      ctx.fillRect(w - 2, 1, 1, h - 2);
    },
    { repeat: false },
  );

  // Green highway signs (concept 2), two panels on one gantry.
  T.highway = canvasTexture(
    160,
    48,
    (ctx, w, h) => {
      const rng = makeRng(1201);
      ctx.fillStyle = '#16141c';
      ctx.fillRect(0, 0, w, h);
      const panel = (x0, lines) => {
        const pw = 76;
        ctx.fillStyle = '#0f5a38';
        ctx.fillRect(x0, 2, pw, h - 4);
        ctx.fillStyle = '#e8ece8';
        ctx.fillRect(x0 + 2, 4, pw - 4, 1);
        ctx.fillRect(x0 + 2, h - 5, pw - 4, 1);
        ctx.fillRect(x0 + 2, 4, 1, h - 8);
        ctx.fillRect(x0 + pw - 3, 4, 1, h - 8);
        lines.forEach((t, i) => drawText(ctx, t, x0 + pw / 2, 9 + i * 10 + (lines.length === 1 ? 5 : 0), { scale: 1, color: '#f0f4f0', align: 'center' }));
        // Up arrow.
        const ax = x0 + pw / 2;
        ctx.fillStyle = '#f0f4f0';
        ctx.fillRect(ax - 1, 33, 2, 8);
        for (let k = 0; k < 4; k++) ctx.fillRect(ax - 1 - k, 32 + k, 2 + k * 2, 1);
        // Weathering: dark streaks down from the top, rust by the bolts.
        for (let k = 0; k < 18; k++) {
          const x = x0 + 3 + Math.floor(rng() * (pw - 6));
          const len = 2 + Math.floor(rng() * 14);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(x, 5, 1, len);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x0, h - 12, pw, 10);
        ctx.fillStyle = '#6a3418';
        for (const bx of [x0 + 6, x0 + pw - 7]) ctx.fillRect(bx, 6, 1, 3 + Math.floor(rng() * 4));
      };
      panel(2, ['DOWNTOWN']);
      panel(82, ['INDUSTRIAL', 'DISTRICT']);
    },
    { repeat: false },
  );

  // Overhead direction sign (concept 1): cyan LED chevrons.
  T.arrows = canvasTexture(
    66,
    18,
    (ctx, w, h) => {
      ctx.fillStyle = '#070a14';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = PALETTE.cyan;
      for (let k = 0; k < 3; k++) {
        const x0 = 9 + k * 18;
        for (let j = 0; j < 12; j++) {
          const off = 6 - Math.abs(j - 5.5);
          ctx.fillRect(x0 + Math.round(off * 1.5), 3 + j, 4, 1);
        }
      }
      ledGrid(ctx, 0, 0, w, h, 0.3);
      ctx.fillStyle = '#3a4a6a';
      ctx.fillRect(0, 0, w, 1);
      ctx.fillRect(0, h - 1, w, 1);
    },
    { repeat: false },
  );

  return T;
}
