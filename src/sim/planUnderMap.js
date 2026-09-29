// The Undercity's ground (used by planMap): streets at 0, the sinkhole (a pit
// with a flat floor and bowl walls), the storm drain (a sunken channel with a
// low-flow trench and 45° walls), and the roads cut into them: a street that
// `descends` does so over its last stretch (from its last junction), cut into
// the ground (or built up on a ledge); a `tunnel` street runs underground,
// open to the sky only where its cover is thin (its portal and its mouth).
// The deck overhead (25 m up) covers everything north of its edge.

import * as G from './geom2d.js';

const CELL = 24;
const smooth = (u) => u * u * (3 - 2 * u);

export function underTerrain(P) {
  const pit = P.pit;
  const drain = P.drain;
  const under = P.under || {};
  const natural = (x, z) => {
    let h = 0;
    if (pit) {
      const r = Math.hypot(x - pit.c[0], z - pit.c[1]);
      if (r <= pit.floor) h = -pit.depth;
      else if (r < pit.rim) h = (-pit.depth * (1 + Math.cos((Math.PI * (r - pit.floor)) / (pit.rim - pit.floor)))) / 2;
    }
    if (drain && x >= drain.x0 && x <= drain.x1) {
      const d = Math.abs(z - drain.z);
      const half = drain.bed / 2;
      const run = drain.depth / Math.tan((drain.walls * Math.PI) / 180);
      let hd = 0;
      if (d <= half) hd = -drain.depth - (d < (drain.trench || 0) / 2 ? 0.6 : 0);
      else if (d < half + run) hd = -drain.depth + ((d - half) * drain.depth) / run;
      h = Math.min(h, hd);
    }
    return h;
  };
  // Road cuts: strips along the descending streets, the road's height along them.
  const cuts = [];
  const grid = new Map();
  const addCut = (c) => {
    c.len = G.lineLength(c.pts);
    const b = G.polyBounds(c.pts);
    const m = c.half + c.blend;
    cuts.push(c);
    for (let a = Math.floor((b.minX - m) / CELL); a <= Math.floor((b.maxX + m) / CELL); a++) {
      for (let k = Math.floor((b.minZ - m) / CELL); k <= Math.floor((b.maxZ + m) / CELL); k++) {
        const key = a * 100003 + k;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(c);
      }
    }
  };
  // The cut (or tunnel) at a point: { c, s, d, y } or null.
  const cutAt = (x, z) => {
    let best = null;
    for (const c of grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)) || []) {
      const q = G.nearestOnLine(c.pts, x, z);
      if (q.d > c.half + c.blend) continue;
      if (!best || q.d - c.half < best.d - best.c.half) best = { c, s: q.s, d: q.d, y: c.h(q.s) };
    }
    return best;
  };
  const ceiling = under.ceiling ?? 5;
  const heightAt = (x, z) => {
    const h = natural(x, z);
    const q = cutAt(x, z);
    if (!q) return h;
    // A tunnel is open only where its cover is thin.
    if (q.c.tunnel && h - q.y > ceiling + 0.5) return h;
    if (q.d <= q.c.half) return q.y;
    const w = smooth(1 - (q.d - q.c.half) / q.c.blend);
    return h + (q.y - h) * w;
  };
  // Where a tunnel runs under the ground: its road height, or null.
  const tunnelAt = (x, z) => {
    const q = cutAt(x, z);
    if (!q || !q.c.tunnel || q.d > q.c.half) return null;
    return natural(x, z) - q.y > ceiling + 0.5 ? q.y : null;
  };
  // The deck's edge: its z at x (the deck covers everything north of it).
  const edge = P.deck?.edge || null;
  const deckEdgeZ = (x) => {
    if (!edge) return -Infinity;
    for (let k = 0; k + 1 < edge.length; k++) {
      const [ax, az] = edge[k];
      const [bx, bz] = edge[k + 1];
      if (x >= ax && x <= bx) return az + ((bz - az) * (x - ax)) / (bx - ax);
    }
    return x < edge[0][0] ? edge[0][1] : edge[edge.length - 1][1];
  };
  const underDeck = (x, z) => !!edge && z < deckEdgeZ(x);
  // What's overhead (for the chase camera): the deck's underside, or a tunnel's roof.
  const ceilingAt = (x, z, y) => {
    const t = tunnelAt(x, z);
    if (t !== null && y < natural(x, z) - 1) return t + ceiling;
    if (underDeck(x, z) && y < P.deck.height) return P.deck.height;
    return null;
  };
  return { under: true, natural, heightAt, addCut, cutAt, tunnelAt, deckEdgeZ, underDeck, ceilingAt, flats: [] };
}

// A street's heights along its points: the ground's, except the descending
// stretch (from its last junction to its end: straight down the grade) and the
// drain's bed.
export function underStreets(streets, terrain, P) {
  const blendCut = 2.5;
  for (const st of streets) {
    if (!st.pts) continue;
    const cum = [0];
    for (let k = 1; k < st.pts.length; k++) cum.push(cum[k - 1] + G.len2(st.pts[k - 1], st.pts[k]));
    st.cum = cum;
    if (st.drain) st.heights = st.pts.map(() => -P.drain.depth);
    else st.heights = st.pts.map(([x, z]) => terrain.natural(x, z));
    if (st.descends) {
      const m = st.marks[st.marks.length - 2];
      const k0 = m.k;
      const k1 = st.pts.length - 1;
      const h0 = st.heights[k0];
      const end = st.pts[k1];
      // (Ending on the drain's bed, it meets the bed, not the trench.)
      const onBed = P.drain && end[0] >= P.drain.x0 && end[0] <= P.drain.x1 && Math.abs(end[1] - P.drain.z) <= P.drain.bed / 2;
      const h1 = onBed ? -P.drain.depth : terrain.natural(...end);
      const L = cum[k1] - cum[k0];
      for (let k = k0; k <= k1; k++) st.heights[k] = h0 + ((h1 - h0) * (cum[k] - cum[k0])) / L;
      const pts = st.pts.slice(k0, k1 + 1);
      const hs = st.heights.slice(k0, k1 + 1);
      const c0 = cum[k0];
      terrain.addCut({ pts, half: st.half + 1, blend: st.tunnel ? 0.5 : blendCut, tunnel: !!st.tunnel, street: st.name, h: (s) => interp(cum.slice(k0, k1 + 1).map((v) => v - c0), hs, s) });
      st.descent = { k0, k1, h0, h1 };
    }
    st.hAt = (s) => interp(cum, st.heights, s);
  }
}

function interp(cum, hs, s) {
  if (s <= 0) return hs[0];
  for (let k = 1; k < cum.length; k++) {
    if (cum[k] >= s) {
      const u = (s - cum[k - 1]) / (cum[k] - cum[k - 1] || 1);
      return hs[k - 1] + (hs[k] - hs[k - 1]) * u;
    }
  }
  return hs[hs.length - 1];
}
