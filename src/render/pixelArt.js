import * as THREE from 'three';
import { drawText, textWidth, GLYPH_H } from '../ui/bitmapFont.js';

// Pixel-art drawing for generated textures: canvas textures, a wrapping pixel
// buffer, tileable noise, and lettering in the game's bitmap font.

export function canvasTexture(w, h, draw, { repeat = true, color = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export const scale = (c, k) => c.map((v) => v * k);
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// A wrapping pixel buffer: writes outside the edges land on the other side, so
// everything drawn through it tiles seamlessly.
export class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Float32Array(w * h * 3);
  }
  i(x, y) {
    x = ((Math.round(x) % this.w) + this.w) % this.w;
    y = ((Math.round(y) % this.h) + this.h) % this.h;
    return (y * this.w + x) * 3;
  }
  get(x, y) {
    const i = this.i(x, y);
    return [this.d[i], this.d[i + 1], this.d[i + 2]];
  }
  set(x, y, c) {
    const i = this.i(x, y);
    this.d[i] = c[0];
    this.d[i + 1] = c[1];
    this.d[i + 2] = c[2];
  }
  blend(x, y, c, t) {
    this.set(x, y, mix(this.get(x, y), c, t));
  }
  mul(x, y, k) {
    this.set(x, y, scale(this.get(x, y), k));
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  fill(fn) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, fn(x, y));
  }
  flush(ctx) {
    const img = ctx.createImageData(this.w, this.h);
    for (let k = 0, n = this.w * this.h; k < n; k++) {
      img.data[k * 4] = clamp(this.d[k * 3], 0, 255);
      img.data[k * 4 + 1] = clamp(this.d[k * 3 + 1], 0, 255);
      img.data[k * 4 + 2] = clamp(this.d[k * 3 + 2], 0, 255);
      img.data[k * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
}

// Tileable smooth value noise in 0..1; `cell` must divide w and h.
export function valueNoise(w, h, rng, cell) {
  const gw = w / cell;
  const gh = h / cell;
  const grid = Array.from({ length: gw * gh }, rng);
  const at = (gx, gy) => grid[(gy % gh) * gw + (gx % gw)];
  const s = (t) => t * t * (3 - 2 * t);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      const tx = s(x / cell - gx);
      const ty = s(y / cell - gy);
      const top = at(gx, gy) + (at(gx + 1, gy) - at(gx, gy)) * tx;
      const bot = at(gx, gy + 1) + (at(gx + 1, gy + 1) - at(gx, gy + 1)) * tx;
      out[y * w + x] = top + (bot - top) * ty;
    }
  return out;
}
export function fbm(w, h, rng, cells) {
  const out = new Float32Array(w * h);
  let total = 0;
  cells.forEach((cell, k) => {
    const amp = 1 / (k + 1);
    const n = valueNoise(w, h, rng, cell);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp;
  });
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

// Blob mask made from overlapping ellipses with ragged edges; wraps at the edges.
export function blobs(w, h, rng, count, rMin, rMax, stretch = 1) {
  const mask = new Float32Array(w * h);
  for (let b = 0; b < count; b++) {
    const cx = rng() * w;
    const cy = rng() * h;
    const lobes = 2 + Math.floor(rng() * 3);
    for (let l = 0; l < lobes; l++) {
      const lx = cx + (rng() - 0.5) * rMax;
      const ly = cy + (rng() - 0.5) * rMax * stretch;
      const rx = rMin + rng() * (rMax - rMin);
      const ry = rx * stretch * (0.7 + rng() * 0.6);
      for (let y = Math.floor(-ry - 1); y <= ry + 1; y++)
        for (let x = Math.floor(-rx - 1); x <= rx + 1; x++) {
          const d = (x / rx) ** 2 + (y / ry) ** 2;
          if (d > 1) continue;
          const px = (((Math.round(lx + x) % w) + w) % w);
          const py = (((Math.round(ly + y) % h) + h) % h);
          mask[py * w + px] = Math.max(mask[py * w + px], 1 - d);
        }
    }
  }
  return mask;
}

// Lit pixels of a string in the game's 5x7 font, for custom text styles.
export function textMask(text) {
  const w = Math.max(1, textWidth(text, 1));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = GLYPH_H;
  const x = c.getContext('2d');
  drawText(x, text, 0, 0, { scale: 1, color: '#fff' });
  const d = x.getImageData(0, 0, w, GLYPH_H).data;
  return { w, h: GLYPH_H, on: (i, j) => i >= 0 && j >= 0 && i < w && j < GLYPH_H && d[(j * w + i) * 4 + 3] > 128 };
}

// Neon tube lettering: dim halo, saturated tube, pale hot core.
export function neonText(ctx, text, x, y, s, color) {
  const m = textMask(text);
  const c = rgb(color);
  const css = (v) => `rgb(${v.map(Math.round).join(',')})`;
  ctx.fillStyle = css(scale(c, 0.28));
  for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) if (m.on(i, j)) ctx.fillRect(x + i * s - 1, y + j * s - 1, s + 2, s + 2);
  ctx.fillStyle = color;
  for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) if (m.on(i, j)) ctx.fillRect(x + i * s, y + j * s, s, s);
  if (s >= 3) {
    ctx.fillStyle = css(mix(c, [255, 255, 255], 0.65));
    // A 1 px core down the middle of each stroke, joined to lit neighbours.
    const mid = Math.floor(s / 2);
    for (let j = 0; j < m.h; j++)
      for (let i = 0; i < m.w; i++) {
        if (!m.on(i, j)) continue;
        const px = x + i * s;
        const py = y + j * s;
        const l = m.on(i - 1, j) ? 0 : mid;
        const r = m.on(i + 1, j) ? s : mid + 1;
        const t = m.on(i, j - 1) ? 0 : mid;
        const b = m.on(i, j + 1) ? s : mid + 1;
        ctx.fillRect(px + l, py + mid, r - l, 1);
        ctx.fillRect(px + mid, py + t, 1, b - t);
      }
  }
}

// LED screen look: every third row and column of pixels is a dark gap.
export function ledGrid(ctx, x0, y0, w, h, dim = 0.35) {
  const img = ctx.getImageData(x0, y0, w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (x % 3 !== 2 && y % 3 !== 2) continue;
      const i = (y * w + x) * 4;
      img.data[i] *= dim;
      img.data[i + 1] *= dim;
      img.data[i + 2] *= dim;
    }
  ctx.putImageData(img, x0, y0);
}
