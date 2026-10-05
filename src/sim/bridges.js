// The T&T SDK's bridges (the Roads tab's Bridge tool; edits.bridges:
// { id, pts: [[x, z], ...], width, height, style, ramps }): a road deck
// along a path, level from end to end at its ends' ground plus its height,
// so between two rooftops (height 0) it carries straight across the gap.
// Ramps down from both ends when it's up off the ground; piers where
// there's ground under it to stand on; cars drive on it and under it.
import * as G from './geom2d.js';

export const BRIDGE_STYLES = { concrete: 'Concrete', skybridge: 'Skybridge (lit underneath)' };
export const BRIDGE_DEFAULTS = { width: 10, height: 6, style: 'concrete', ramps: true };
const THICK = 0.9; // the deck, top to underside

// A polyline with each corner turned along an arc of radius r (as far as
// its legs allow), so a deck that wide doesn't pinch or cross itself there.
export function roundCorners(pts, r) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let k = 1; k < pts.length - 1; k++) {
    const [a, p, b] = [pts[k - 1], pts[k], pts[k + 1]];
    const la = Math.hypot(p[0] - a[0], p[1] - a[1]) || 1;
    const lb = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
    const u = [(p[0] - a[0]) / la, (p[1] - a[1]) / la];
    const v = [(b[0] - p[0]) / lb, (b[1] - p[1]) / lb];
    const turn = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])));
    if (turn < 0.15) {
      out.push(p);
      continue;
    }
    const d = Math.min(r * Math.tan(turn / 2), la / 2, lb / 2);
    const p0 = [p[0] - u[0] * d, p[1] - u[1] * d];
    const p1 = [p[0] + v[0] * d, p[1] + v[1] * d];
    const n = Math.max(2, Math.ceil(turn / 0.15));
    for (let q = 0; q <= n; q++) {
      const t = q / n;
      const [w0, w1, w2] = [(1 - t) * (1 - t), 2 * (1 - t) * t, t * t];
      out.push([w0 * p0[0] + w1 * p[0] + w2 * p1[0], w0 * p0[1] + w1 * p[1] + w2 * p1[1]]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Its path (corners rounded), length, and the deck's top s metres along it.
export function bridgeLine(b, heightAt) {
  const pts = roundCorners(b.pts, b.width / 2 + 2);
  const L = Math.max(1, G.lineLength(pts));
  const [a, z] = [b.pts[0], b.pts[b.pts.length - 1]];
  const h0 = heightAt(a[0], a[1]) + b.height;
  const h1 = heightAt(z[0], z[1]) + b.height;
  return { pts, L, h0, h1, h: (s) => h0 + ((h1 - h0) * Math.max(0, Math.min(L, s))) / L };
}

// What's solid (hidden items, the layout's; render/bridgeView.js draws them):
// the deck in short flat pieces (drivable on top, and under), its piers,
// and a ramp down from each end.
export function bridgeItems(bridges, heightAt) {
  const out = [];
  for (const b of bridges || []) {
    if (!b.pts || b.pts.length < 2) continue;
    const { pts, L, h } = bridgeLine(b, heightAt);
    const hw = b.width / 2;
    let s = 0;
    pts.forEach((p, k) => {
      if (!k) return;
      const q = pts[k - 1];
      const len = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (len < 0.05) return;
      const top = h(s + len / 2);
      s += len;
      const obb = { x: (p[0] + q[0]) / 2, z: (p[1] + q[1]) / 2, hw, hd: len / 2 + 0.25, yaw: Math.atan2(p[0] - q[0], p[1] - q[1]) };
      out.push({ t: 'bridgeDeck', key: `bridgeDeck@${b.id}:${k}`, obb, r: G.aabbOf(G.obbCorners(obb)), y: top - THICK, h: top, deck: true, under: true, thick: THICK, solid: false, hidden: true, bridge: b.id });
    });
    for (let t = 10; t < L - 5; t += 20) {
      const p = G.pointAlong(pts, t);
      const g = heightAt(p.x, p.z);
      const top = h(t) - THICK;
      if (top - g < 1.5 || top - g > 40) continue;
      for (const sg of [-1, 1]) {
        const [x, z] = [p.x - p.dz * sg * (hw - 0.8), p.z + p.dx * sg * (hw - 0.8)];
        out.push({ t: 'bridgePier', key: `bridgePier@${b.id}:${t}:${sg}`, r: [x - 0.4, x + 0.4, z - 0.4, z + 0.4], y: g, h: top - g, solid: true, hidden: true, bridge: b.id });
      }
    }
    if (b.ramps !== false && b.height > 0.4) {
      for (const [end, at, out_] of [[pts[0], 0.01, -1], [pts[pts.length - 1], L - 0.01, 1]]) {
        const p = G.pointAlong(pts, at);
        const [ox, oz] = [p.dx * out_, p.dz * out_];
        const top = h(at);
        const rise = top - heightAt(end[0] + ox * 3, end[1] + oz * 3);
        if (rise < 0.4) continue;
        const len = Math.max(6, rise * 5);
        const foot = [end[0] + ox * len, end[1] + oz * len];
        const base = heightAt(foot[0], foot[1]);
        out.push({ t: 'bridgeRamp', key: `bridgeRamp@${b.id}:${out_}`, ramp: { x: foot[0], z: foot[1], dirX: -ox, dirZ: -oz, len, width: b.width, height: top - base, abs: base }, solid: false, hidden: true, bridge: b.id });
      }
    }
  }
  return out;
}
