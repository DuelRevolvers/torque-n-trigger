// Rooftop plan districts (Chrome Heights): decks (tower roofs) at set heights,
// and the crossings the roof roads make between them. Where a road leaves one
// deck for another it's a skybridge if the heights match, a ramp bridge if they
// differ, a gap jump if the pair is listed in the street's `gaps` (one way if it
// drops), or a spiral ramp tower (`spiral: true`). Everything else at roof
// level is a drop to the streets below. Used by planMap.

import * as G from './geom2d.js';

const CELL = 24;

// The decks and the ground: height at a point (a deck, a bridge's deck, a
// kicker's cantilever, else the street far below), and the height a route line
// takes (across a gap's air too).
export function roofTerrain(P) {
  const R = P.roof || {};
  const decks = P.decks.map((d) => {
    const box = G.polyBounds(d.poly);
    const hAt = Array.isArray(d.h) ? (z) => d.h[0] + ((d.h[1] - d.h[0]) * Math.min(1, Math.max(0, (z - box.minZ) / (box.maxZ - box.minZ)))) : () => d.h;
    return { ...d, box, hAt };
  });
  const deckAt = (x, z) => decks.find((d) => x >= d.box.minX && x <= d.box.maxX && z >= d.box.minZ && z <= d.box.maxZ && G.pointInPoly(x, z, d.poly)) || null;
  const grid = new Map();
  const strips = [];
  const addStrip = (s) => {
    s.len = G.lineLength(s.pts);
    const b = G.polyBounds(s.pts);
    strips.push(s);
    for (let a = Math.floor((b.minX - s.half) / CELL); a <= Math.floor((b.maxX + s.half) / CELL); a++) {
      for (let c = Math.floor((b.minZ - s.half) / CELL); c <= Math.floor((b.maxZ + s.half) / CELL); c++) {
        const k = a * 100003 + c;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(s);
      }
    }
  };
  const stripAt = (x, z, air) => {
    for (const s of grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)) || []) {
      if (s.air && !air) continue;
      const q = G.nearestOnLine(s.pts, x, z);
      if (q.d <= s.half) return s.h(q.s);
    }
    return null;
  };
  const street = R.street ?? 0;
  const heightAt = (x, z) => {
    const d = deckAt(x, z);
    if (d) return d.hAt(z);
    return stripAt(x, z, false) ?? street;
  };
  const lineHeightAt = (x, z) => {
    const d = deckAt(x, z);
    if (d) return d.hAt(z);
    return stripAt(x, z, true) ?? stripAt(x, z, false) ?? street;
  };
  return { roof: true, decks, deckAt, heightAt, lineHeightAt, addStrip, strips, flats: [] };
}

// Points every `step` metres along a street, keeping its node marks.
export function densify(st, step = 4) {
  const out = [];
  const at = [];
  st.pts.forEach((p, k) => {
    at[k] = out.length;
    out.push([...p]);
    const q = st.pts[k + 1];
    if (!q) return;
    const L = G.len2(p, q);
    const n = Math.floor(L / step);
    for (let i = 1; i < n; i++) out.push([p[0] + ((q[0] - p[0]) * i) / n, p[1] + ((q[1] - p[1]) * i) / n]);
  });
  st.pts = out;
  st.marks = st.marks.map((m) => ({ ...m, k: at[m.k] }));
}

// A spiral ramp tower where the street leaves its deck: the road runs out to a
// tangent point, loops round (descending) and carries on to the far deck (or,
// on a road out, down to the bridge below).
export function helix(st, terrain, R) {
  const { deckAt } = terrain;
  const cfg = R.spirals?.[st.name] || { r: 16 };
  const L = G.lineLength(st.pts);
  let sa = null;
  let sb = null;
  let from = null;
  let to = null;
  let prev = null;
  for (let s = 0; s <= L; s += 1) {
    const p = G.pointAlong(st.pts, s);
    const d = deckAt(p.x, p.z);
    if (sa === null && prev && !d) {
      sa = s;
      from = prev;
    } else if (sa !== null && d) {
      sb = s;
      to = d;
      break;
    }
    if (d) prev = d;
  }
  if (sa === null) throw new Error(`${st.name}: a spiral that never leaves its deck`);
  if (sb === null) sb = L;
  const r = cfg.r;
  const sT = to ? (sa + sb) / 2 : sa + r + st.half + 8;
  const T = G.pointAlong(st.pts, sT);
  const n = [-T.dz, T.dx]; // the centre is to the right of travel
  const c = [T.x + n[0] * r, T.z + n[1] * r];
  const a0 = Math.atan2(T.z - c[1], T.x - c[0]);
  const dir = Math.sign(-Math.sin(a0) * T.dx + Math.cos(a0) * T.dz) || 1;
  const pA = G.pointAlong(st.pts, sa - 1);
  const yTop = from.hAt(pA.z);
  const yBot = to ? to.hAt(G.pointAlong(st.pts, sb + 1).z) : cfg.bottom;
  const turns = to ? 1 : Math.max(1, Math.round((yTop - yBot) / (2 * Math.PI * r * (cfg.grade || 0.08))));
  const m = Math.ceil((2 * Math.PI * r * turns) / 3);
  const loop = [];
  for (let q = 1; q <= m; q++) {
    const a = a0 + (dir * 2 * Math.PI * turns * q) / m;
    loop.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
  }
  loop[loop.length - 1] = [T.x, T.z];
  const before = G.subLine(st.pts, 0, sT);
  const after = G.subLine(st.pts, sT, L);
  st.pts = [...before, ...loop, ...after.slice(1)];
  st.marks = [st.marks[0], { ...st.marks[st.marks.length - 1], k: st.pts.length - 1 }];
  const loopLen = 2 * Math.PI * r * turns;
  st.helix = { cx: c[0], cz: c[1], r, a0, dir, turns, yTop, yBot, half: st.half, s0: sT, s1: sT + loopLen, from: from.name, to: to?.name || null };
  return st.helix;
}

// The crossings along each edge: runs off the decks, with the kind of
// crossing and its heights; their decks (and kickers' cantilevers) are added
// to the terrain.
export function roofCrossings(edgeList, terrain, P, byName) {
  const R = P.roof || {};
  const K = R.kicker || { rise: 1.8, len: 12, air: 25 };
  const walk = R.walk ?? 1;
  const { deckAt, addStrip } = terrain;
  const out = [];
  for (const e of edgeList) {
    const st = e.street;
    const L = e.len;
    const samples = [];
    for (let s = 0; s < L; s += 1) samples.push(s);
    samples.push(L);
    let run = null;
    let prev = null;
    const close = (sEnd, next) => {
      run.sb = sEnd;
      run.deckB = next;
      out.push(run);
      run = null;
    };
    for (const s of samples) {
      const p = G.pointAlong(e.pts, s);
      const d = deckAt(p.x, p.z);
      if (!d && !run) run = { e, st, sa: s, deckA: prev };
      else if (d && run) close(s, d);
      if (d) prev = d;
    }
    if (run) close(L, null);
  }
  const names = (e) => [e.a, e.b];
  for (const c of out) {
    const { e, st } = c;
    c.pts = G.subLine(e.pts, c.sa, c.sb);
    c.len = c.sb - c.sa;
    c.headA = c.pts[0];
    c.headB = c.pts[c.pts.length - 1];
    c.half = st.half;
    c.walk = walk;
    const pa = G.pointAlong(e.pts, Math.max(0, c.sa - 1));
    const pb = G.pointAlong(e.pts, Math.min(e.len, c.sb + 1));
    const ends = names(e);
    const pair = (st.gaps || []).some(([a, b]) => ends.includes(byName.get(a)?.id) && ends.includes(byName.get(b)?.id));
    if (st.helix && c.sa <= st.helix.s0 && c.sb >= st.helix.s1) c.kind = 'spiral';
    else if (pair) c.kind = 'gap';
    else if (!c.deckA || !c.deckB) c.kind = 'exit';
    else c.kind = null;
    c.hA = c.deckA ? c.deckA.hAt(pa.z) : null;
    c.hB = c.deckB ? c.deckB.hAt(pb.z) : null;
    if (c.kind === 'spiral') {
      c.hA ??= st.helix.yTop;
      c.hB ??= st.helix.yBot;
    }
    if (c.kind === 'exit') {
      // A road out: level with its deck inside the district (the Skyway), or down the spiral.
      c.hA ??= R.skyway ?? c.hB;
      c.hB ??= R.skyway ?? c.hA;
    }
    if (!c.kind) c.kind = Math.abs(c.hA - c.hB) < 0.5 ? 'bridge' : 'ramp';
    c.oneWay = c.kind === 'gap' && Math.abs(c.hA - c.hB) > 0.5;
    const half = st.half + walk;
    const lin = (h0, h1, len) => (s) => h0 + ((h1 - h0) * Math.min(len, Math.max(0, s))) / (len || 1);
    if (c.kind === 'bridge' || c.kind === 'ramp' || c.kind === 'exit') addStrip({ pts: c.pts, half, h: lin(c.hA, c.hB, c.len), crossing: c });
    else if (c.kind === 'gap') {
      // Kickers cantilevered out from both decks, leaving `air` metres between their lips.
      const k = Math.max(0, (c.len - K.air) / 2);
      c.cant = k;
      c.lipA = G.pointAlong(c.pts, k);
      c.lipB = G.pointAlong(c.pts, c.len - k);
      if (k > 0.5) {
        addStrip({ pts: G.subLine(c.pts, 0, k), half, h: () => c.hA, crossing: c });
        addStrip({ pts: G.subLine(c.pts, c.len - k, c.len), half, h: () => c.hB, crossing: c });
      }
      addStrip({ pts: c.pts, half: st.half, air: true, h: (s) => (s < k ? c.hA : s > c.len - k ? c.hB : c.hA + ((c.hB - c.hA) * (s - k)) / Math.max(1, c.len - 2 * k)), crossing: c });
    } else if (c.kind === 'spiral') {
      // The straight approaches either side of the loop.
      const hx = st.helix;
      const a = hx.s0 - c.sa;
      const b = hx.s1 - c.sa;
      if (a > 0.5) addStrip({ pts: G.subLine(c.pts, 0, a), half, h: () => hx.yTop, crossing: c });
      if (c.len - b > 0.5) addStrip({ pts: G.subLine(c.pts, b, c.len), half, h: () => hx.yBot, crossing: c });
    }
    c.K = K;
  }
  return out;
}
