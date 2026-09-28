// Everything solid in a district, placed once in the simulation so the renderer
// draws exactly what free roam collides with: building footprints (plus stacked
// tiers higher up, which don't collide), houses, tanks, container stacks,
// wagons, market stalls, parked cars, planters, trees, hedges, barriers,
// fences, posts, pillars and rooftop clutter.
//
// Item: { t: type, r: [x0, x1, z0, z1] footprint, h: height above the ground,
// solid, hidden (collision only: the renderer draws it its own way), ...data }.

import { makeRng } from '../parts/generate.js';
import { SETBACK, quadRing, splitLot, nearPath, edgeSpans, TUNNEL_HALF } from './city.js';

const cache = new WeakMap();

export function districtLayout(map) {
  if (!cache.has(map)) cache.set(map, buildLayout(map));
  return cache.get(map);
}

// Neon arches span these streets (fixed per street, shared with the renderer).
export const archEdge = (A, B) => (A.id * 73 + B.id * 151) % 100 < 18;

// Points every `step` metres along a polyline, as [x, z, dirX, dirZ].
export function samplePath(points, step = 3) {
  const out = [];
  for (let k = 0; k + 1 < points.length; k++) {
    const [ax, az] = points[k];
    const [bx, bz] = points[k + 1];
    const d = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t < d; t += step) out.push([ax + ((bx - ax) * t) / d, az + ((bz - az) * t) / d, (bx - ax) / d, (bz - az) / d]);
  }
  return out;
}

const around = (x, z, hw, hd = hw) => [x - hw, x + hw, z - hd, z + hd];

function buildLayout(map) {
  const { style, nodes } = map;
  const rng = makeRng(style.seed * 31 + 7);
  const items = [];
  const add = (t, r, h, extra = {}) => items.push({ t, r, h, solid: true, ...extra });
  const deco = (t, extra = {}) => items.push({ t, solid: false, ...extra });
  const hide = (r, h) => items.push({ t: 'solid', r, h, solid: true, hidden: true });
  const [hmin, hmax] = style.heights;
  const height = () => hmin + (hmax - hmin) * Math.pow(rng(), 1.6);

  // Splits a lot into building footprints in the district's style:
  // [x0, x1, z0, z1, h, lift] (lift: stacked tier starting that high up).
  const footprints = (rect) => {
    const [x0, x1, z0, z1] = rect;
    const W = x1 - x0;
    const D = z1 - z0;
    if (W < 10 || D < 10) return [];
    const alongX = W >= D;
    const U = alongX ? W : D;
    const V = alongX ? D : W;
    const toXZ = ([u0, u1, v0, v1, h, lift]) => (alongX ? [x0 + u0, x0 + u1, z0 + v0, z0 + v1, h, lift] : [x0 + v0, x0 + v1, z0 + u0, z0 + u1, h, lift]);
    const slices = (min, max) => {
      const out = [];
      let p = 0;
      while (p < U - min * 0.6) {
        const s = Math.min(U - p, min + rng() * (max - min));
        out.push([p, p + s]);
        p += s + 1 + rng() * 3;
      }
      return out;
    };
    const out = [];
    const kind = style.buildings;
    if (kind === 'warehouse') {
      for (const [a, b] of slices(30, 70)) {
        const depth = V * (0.55 + rng() * 0.45);
        const v0 = rng() < 0.5 ? 0 : V - depth;
        out.push([a, b, v0, v0 + depth, height()]);
      }
    } else if (kind === 'dense' || kind === 'block') {
      const rows = V > 55 ? 2 : 1;
      for (let r = 0; r < rows; r++) {
        const v0 = (V / rows) * r + (r ? 1.5 : 0);
        const v1 = (V / rows) * (r + 1) - (r + 1 < rows ? 1.5 : 0);
        for (const [a, b] of slices(kind === 'dense' ? 14 : 16, kind === 'dense' ? 26 : 30)) out.push([a, b, v0, v1, height()]);
      }
    } else if (kind === 'monolith') {
      // Stone podium, then one slab stepping back in tiers.
      out.push([2, U - 2, 2, V - 2, 8 + rng() * 6]);
      const cu = U * (0.4 + rng() * 0.2);
      const cv = V * (0.4 + rng() * 0.2);
      let hu = U * (0.24 + rng() * 0.08);
      let hv = V * (0.16 + rng() * 0.08);
      const tiers = 2 + Math.floor(rng() * 2);
      const total = height();
      let lift = 0;
      for (let t = 0; t < tiers; t++) {
        const h = (total / tiers) * (t === 0 ? 1.3 : 0.85);
        out.push([cu - hu, cu + hu, cv - hv, cv + hv, h, lift]);
        lift += h;
        hu *= 0.78;
        hv *= 0.78;
      }
    } else {
      out.push([2, U - 2, 2, V - 2, 5 + rng() * 5]); // podium
      const towers = kind === 'mega' ? 1 : 1 + Math.floor(rng() * 2);
      for (let t = 0; t < towers; t++) {
        const s = Math.min(U, V) * (kind === 'mega' ? 0.6 + rng() * 0.15 : 0.4 + rng() * 0.25);
        const cu = s / 2 + 4 + rng() * Math.max(0, U - s - 8);
        const cv = s / 2 + 4 + rng() * Math.max(0, V - s - 8);
        out.push([cu - s / 2, cu + s / 2, cv - s / 2, cv + s / 2, height()]);
      }
    }
    return out.map(toXZ);
  };

  const pathOf = new Map(map.corridors.map((c) => [c.cell, c.points]));
  const freight = map.freight ? [[map.freight.x, map.freight.z0], [map.freight.x, map.freight.z1]] : null;
  const units = [...map.cells.filter((c) => !c.site), ...map.sites];
  const spireCell = style.features.includes('spire')
    ? map.cells.filter((c) => c.kind === 'buildings').sort((a, b) => Math.hypot((a.lot[0] + a.lot[1]) / 2, (a.lot[2] + a.lot[3]) / 2) - Math.hypot((b.lot[0] + b.lot[1]) / 2, (b.lot[2] + b.lot[3]) / 2))[0]
    : null;

  for (const c of units) {
    const [lx0, lx1, lz0, lz1] = c.lot;
    const raw = pathOf.get(c);
    const path = raw ? samplePath(raw) : null;
    const clear = (x, z, m) => !path || path.every(([px, pz]) => Math.hypot(px - x, pz - z) > m);
    const edges4 = [[lx0, lz0, lx1, lz0], [lx1, lz0, lx1, lz1], [lx1, lz1, lx0, lz1], [lx0, lz1, lx0, lz0]];
    const fill = (margin) => {
      for (const f of footprints([lx0 + 3, lx1 - 3, lz0 + 3, lz1 - 3])) {
        const r = f.slice(0, 4);
        if ((raw && nearPath(raw, r, margin)) || (freight && nearPath(freight, r, 6))) continue;
        add('bldg', r, f[4], { lift: f[5] || 0, solid: !f[5], unit: c });
      }
    };
    const tree = (x, z, s) => add('tree', around(x, z, 0.3 * s), 6 * s, { x, z, s });

    if (c === spireCell) {
      const x = (lx0 + lx1) / 2;
      const z = (lz0 + lz1) / 2;
      const size = Math.min(lx1 - lx0, lz1 - lz0) * 0.7;
      add('spire', around(x, z, size / 2), 370, { x, z, size });
    } else if (c.kind === 'buildings') {
      fill(11);
    } else if (c.kind === 'alley') {
      fill(8.5);
      if (path) {
        const mid = path[Math.floor(path.length / 2)];
        deco('bridge', { x: mid[0], z: mid[1], yaw: Math.atan2(mid[2], mid[3]) });
        for (const k of [3, path.length - 4]) {
          const p = path[Math.max(0, Math.min(path.length - 1, k))];
          const x = p[0] - p[3] * 6;
          const z = p[1] + p[2] * 6;
          add('dumpster', around(x, z, 1.2), 1.4, { x, z, yaw: Math.atan2(p[2], p[3]) });
        }
      }
    } else if (c.kind === 'construction') {
      if (path) {
        for (let k = 0; k < path.length; k += 3) {
          const [x, z, dx, dz] = path[k];
          for (const side of [-1, 1]) deco('cone', { x: x - dz * 7.5 * side, z: z + dx * 7.5 * side });
        }
      }
      const corners = [[lx0 + 8, lz0 + 8], [lx1 - 8, lz0 + 8], [lx0 + 8, lz1 - 8], [lx1 - 8, lz1 - 8]];
      const far = (p) => (path ? Math.min(...path.map(([x, z]) => Math.hypot(x - p[0], z - p[1]))) : 0);
      const [cx, cz] = corners.sort((a, b) => far(b) - far(a))[0];
      add('crane', around(cx, cz, 1.2), 48, { x: cx, z: cz, yaw: rng() * Math.PI * 2 });
      for (let k = 0; k < 6; k++) {
        const x = lx0 + 8 + rng() * (lx1 - lx0 - 16);
        const z = lz0 + 8 + rng() * (lz1 - lz0 - 16);
        if (!clear(x, z, 13)) continue;
        if (k % 2) {
          const rad = 4 + rng() * 3;
          add('pile', around(x, z, rad * 0.6), 2, { x, z, rad, hgt: 2 + rng() * 2 });
        } else {
          add('scaffold', around(x, z, 4.2, 1.2), 11, { x, z });
        }
      }
      for (const [ax, az, bx, bz] of edges4) {
        const len = Math.hypot(bx - ax, bz - az);
        const alongX = az === bz;
        for (let t = 1; t < len; t += 2.2) {
          const x = ax + ((bx - ax) * t) / len;
          const z = az + ((bz - az) * t) / len;
          if (clear(x, z, 12)) add('jersey', alongX ? around(x, z, 1, 0.25) : around(x, z, 0.25, 1), 0.9, { x, z, alongX });
        }
      }
      if (c.w) {
        // A tower going up: a steel frame with floor slabs.
        const s = 24;
        for (let tries = 0; tries < 12; tries++) {
          const x = lx0 + s / 2 + 8 + rng() * Math.max(0, lx1 - lx0 - s - 16);
          const z = lz0 + s / 2 + 8 + rng() * Math.max(0, lz1 - lz0 - s - 16);
          if (![[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].every(([a, b]) => clear(x + (a * s) / 2, z + (b * s) / 2, 12))) continue;
          const floors = 8 + Math.floor(rng() * 8);
          deco('skeleton', { x, z, s, floors });
          for (let a = -s / 2; a <= s / 2; a += 8) for (let b = -s / 2; b <= s / 2; b += 8) hide(around(x + a, z + b, 0.25), floors * 4 + 6);
          break;
        }
      }
    } else if (c.kind === 'plaza') {
      for (let k = 0; k < Math.max(14, ((lx1 - lx0) * (lz1 - lz0)) / 500); k++) {
        const x = lx0 + 6 + rng() * (lx1 - lx0 - 12);
        const z = lz0 + 6 + rng() * (lz1 - lz0 - 12);
        if (clear(x, z, 11)) add('planter', around(x, z, 1.5), 0.9, { x, z, tree: rng() < 0.6 });
      }
      const cx = (lx0 + lx1) / 2;
      const cz = (lz0 + lz1) / 2;
      if (clear(cx, cz, 15)) add('basin', around(cx, cz, 5), 0.8, { x: cx, z: cz });
    } else if (c.kind === 'parking') {
      const alongX = lx1 - lx0 >= lz1 - lz0;
      for (const band of [0.25, 0.75]) {
        const len = alongX ? lx1 - lx0 : lz1 - lz0;
        for (let t = 4; t < len - 4; t += 3) {
          if (rng() < 0.3) continue;
          const x = alongX ? lx0 + t : lx0 + (lx1 - lx0) * band;
          const z = alongX ? lz0 + (lz1 - lz0) * band : lz0 + t;
          if (clear(x, z, 8.5)) add('car', alongX ? around(x, z, 0.95, 2.2) : around(x, z, 2.2, 0.95), 1.6, { x, z, yaw: alongX ? 0 : Math.PI / 2 });
        }
      }
    } else if (c.kind === 'yard') {
      const alongX = lx1 - lx0 >= lz1 - lz0;
      const len = alongX ? lx1 - lx0 : lz1 - lz0;
      const wid = alongX ? lz1 - lz0 : lx1 - lx0;
      for (let row = 4; row < wid - 4; row += 16) {
        for (let t = 8; t < len - 8; t += 2.9) {
          const n = Math.floor(rng() * 4);
          if (!n) continue;
          const x = alongX ? lx0 + t : lx0 + row + 6;
          const z = alongX ? lz0 + row + 6 : lz0 + t;
          add('stack', alongX ? around(x, z, 1.22, 6.1) : around(x, z, 6.1, 1.22), n * 2.6, { x, z, alongX, n });
        }
      }
    } else if (c.kind === 'park') {
      const r = Math.min(24, (lx1 - lx0) * 0.18, (lz1 - lz0) * 0.18);
      const pond = r > 6 && [[lx0 + r + 8, lz0 + r + 8], [lx1 - r - 8, lz0 + r + 8], [lx0 + r + 8, lz1 - r - 8], [lx1 - r - 8, lz1 - r - 8]].find(([x, z]) => clear(x, z, r + 10));
      if (pond) add('pond', around(pond[0], pond[1], r * 0.95), 0.6, { x: pond[0], z: pond[1], rad: r });
      for (const [ax, az, bx, bz] of edges4) {
        const len = Math.hypot(bx - ax, bz - az);
        const alongX = az === bz;
        for (let t = 1.2; t < len; t += 2.4) {
          const x = ax + ((bx - ax) * t) / len + (alongX ? 0 : bx > lx0 + 1 ? -1.5 : 1.5);
          const z = az + ((bz - az) * t) / len + (alongX ? (az > lz0 + 1 ? -1.5 : 1.5) : 0);
          if (clear(x, z, 9)) add('hedge', alongX ? around(x, z, 1.2, 0.45) : around(x, z, 0.45, 1.2), 1.1, { x, z, alongX });
        }
      }
      for (let k = 0; k < ((lx1 - lx0) * (lz1 - lz0)) / 140; k++) {
        const x = lx0 + 5 + rng() * (lx1 - lx0 - 10);
        const z = lz0 + 5 + rng() * (lz1 - lz0 - 10);
        if (!clear(x, z, 8) || (pond && Math.hypot(x - pond[0], z - pond[1]) < r + 3)) continue;
        tree(x, z, 0.8 + rng() * 0.8);
      }
    } else if (c.kind === 'quad') {
      for (const [x0, x1, z0, z1, arch] of quadRing(c.lot, raw)) {
        const h = Math.max(16, hmin * (0.5 + rng() * 0.5) + 8);
        if (arch) deco('arch', { r: [x0, x1, z0, z1], h });
        else add('bldg', [x0, x1, z0, z1], h, { lift: 0 });
      }
      const inner = [lx0 + 22, lx1 - 22, lz0 + 22, lz1 - 22];
      if (inner[1] > inner[0] && inner[3] > inner[2]) {
        for (let k = 0; k < 6; k++) {
          const x = inner[0] + rng() * (inner[1] - inner[0]);
          const z = inner[2] + rng() * (inner[3] - inner[2]);
          if (clear(x, z, 8)) tree(x, z, 0.8);
        }
      }
    } else if (c.kind === 'railyard') {
      for (const w of c.wagons || []) add('wagon', w.r, 4.5, { tank: w.tank, color: w.color });
      const alongX = lx1 - lx0 >= lz1 - lz0;
      const U = alongX ? lx1 - lx0 : lz1 - lz0;
      for (const u of [12, U - 12]) {
        const ends = alongX ? [[lx0 + u, lz0 + 2], [lx0 + u, lz1 - 2]] : [[lx0 + 2, lz0 + u], [lx1 - 2, lz0 + u]];
        for (const [x, z] of ends) add('post', around(x, z, 0.3), 8, { x, z, hgt: 8 });
      }
    } else if (c.kind === 'market') {
      for (const r of c.stalls || []) add('stall', r, 3);
      if (path) {
        for (const k of [2, path.length - 3]) {
          const [x, z, dx, dz] = path[Math.max(0, Math.min(path.length - 1, k))];
          for (const s of [-1, 1]) add('post', around(x + dz * s * 7, z - dx * s * 7, 0.3), 7, { x: x + dz * s * 7, z: z - dx * s * 7, hgt: 7 });
        }
      }
    } else if (c.kind === 'casino') {
      for (const r of splitLot([lx0 + 3, lx1 - 3, lz0 + 3, lz1 - 3], raw, 9)) {
        if (r[1] - r[0] >= 8 && r[3] - r[2] >= 8) add('bldg', r, hmax * (0.7 + rng() * 0.3), { lift: 0, casino: true, unit: c });
      }
      if (path) {
        const [mx, mz, dx, dz] = path[Math.floor(path.length / 2)];
        for (const s of [-1, 1]) {
          for (const f of [-1, 1]) {
            const x = mx + dz * s * 9 + dx * f * 15;
            const z = mz - dx * s * 9 + dz * f * 15;
            add('post', around(x, z, 0.4), 8, { x, z, hgt: 8 });
          }
        }
      }
    } else if (c.kind === 'tanks') {
      const W = lx1 - lx0 - 10;
      const D = lz1 - lz0 - 10;
      const n = Math.max(1, Math.floor(W / 28));
      const m = Math.max(1, Math.floor(D / 28));
      const rad = Math.min(W / n, D / m) * 0.36;
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < m; b++) {
          const x = lx0 + 5 + (W / n) * (a + 0.5);
          const z = lz0 + 5 + (D / m) * (b + 0.5);
          const hgt = 9 + rng() * 9;
          add('tank', around(x, z, rad * 0.85), hgt + 1.5, { x, z, rad, hgt });
        }
      }
    } else if (c.kind === 'housing') {
      const runs = [];
      if (c.side.n) runs.push(['x', lx0 + 4, lx1 - 4, lz0 + 4, 1]);
      if (c.side.s) runs.push(['x', lx0 + 4, lx1 - 4, lz1 - 4, -1]);
      if (c.side.w) runs.push(['z', lz0 + 17, lz1 - 17, lx0 + 4, 1]);
      if (c.side.e) runs.push(['z', lz0 + 17, lz1 - 17, lx1 - 4, -1]);
      for (const [axis, a0, a1, edge, dir] of runs) {
        for (let a = a0; a + 8.5 <= a1; a += 9.5) {
          const along = a + 4.25;
          const across = edge + dir * 5.5;
          const [x, z, sx, sz] = axis === 'x' ? [along, across, 8.5, 11] : [across, along, 11, 8.5];
          const hgt = 7 + rng() * 5;
          add('house', around(x, z, sx / 2, sz / 2), hgt + 1, { x, z, sx, sz, hgt, axis, edge, dir });
        }
      }
      const inner = [lx0 + 20, lx1 - 20, lz0 + 20, lz1 - 20];
      if (inner[1] > inner[0] && inner[3] > inner[2]) {
        for (let k = 0; k < ((inner[1] - inner[0]) * (inner[3] - inner[2])) / 220; k++) tree(inner[0] + rng() * (inner[1] - inner[0]), inner[2] + rng() * (inner[3] - inner[2]), 0.7 + rng() * 0.5);
      }
    } else if (c.kind === 'terminal') {
      // Container terminal: blocks of stacks with lanes between, the haul road
      // winding through, and two gantry cranes straddling the stacks.
      const alongX = lx1 - lx0 >= lz1 - lz0;
      const U = alongX ? lx1 - lx0 : lz1 - lz0;
      const V = alongX ? lz1 - lz0 : lx1 - lx0;
      for (let row = 8; row < V - 8; row += 16) {
        for (let t = 8; t < U - 8; t += 2.9) {
          if (Math.floor(t / 40) % 4 === 3) continue; // cross lanes
          const x = alongX ? lx0 + t : lx0 + row;
          const z = alongX ? lz0 + row : lz0 + t;
          if (!clear(x, z, 14.5)) continue; // races run the haul road: stacks stay behind the barriers
          const n = 1 + Math.floor(rng() * 4);
          add('stack', alongX ? around(x, z, 1.22, 6.1) : around(x, z, 6.1, 1.22), n * 2.6, { x, z, alongX, n });
        }
      }
      for (const t of c.tunnels || []) {
        // Opened containers: two side walls and a roof, more boxes stacked on top.
        const h = t.len / 2;
        const layers = 2;
        for (const s of [-1, 1]) {
          const r = t.alongX ? [t.x - h, t.x + h, t.z + s * (TUNNEL_HALF + 0.08) - 0.12, t.z + s * (TUNNEL_HALF + 0.08) + 0.12] : [t.x + s * (TUNNEL_HALF + 0.08) - 0.12, t.x + s * (TUNNEL_HALF + 0.08) + 0.12, t.z - h, t.z + h];
          add('solid', r, 2.6 * layers, { hidden: true });
        }
        deco('ctunnel', { ...t, layers });
      }
      for (const f of [0.3, 0.7]) {
        const u = (alongX ? lx0 : lz0) + U * f;
        const ends = alongX ? [[u, lz0 + 3], [u, lz1 - 3]] : [[lx0 + 3, u], [lx1 - 3, u]];
        for (const [x, z] of ends) hide(around(x, z, 0.8), 24);
        deco('gantry', { a: ends[0], b: ends[1] });
      }
    } else if (c.kind === 'arena') {
      // Event ground fence, with a gate in the middle of each side.
      for (const [ax, az, bx, bz] of edges4) {
        const alongX = az === bz;
        const [p0, p1] = alongX ? [Math.min(ax, bx), Math.max(ax, bx)] : [Math.min(az, bz), Math.max(az, bz)];
        const mid = (p0 + p1) / 2;
        for (const [q0, q1] of [[p0, mid - 9], [mid + 9, p1]]) {
          add('fence', alongX ? [q0, q1, az - 0.15, az + 0.15] : [ax - 0.15, ax + 0.15, q0, q1], 3.2, { alongX });
        }
      }
      for (const [x, z] of [[lx0 + 2, lz0 + 2], [lx1 - 2, lz0 + 2], [lx0 + 2, lz1 - 2], [lx1 - 2, lz1 - 2]]) add('mast', around(x, z, 0.4), 22, { x, z });
    }
  }

  // --- Along the streets ---
  const roof = style.rooftop || 0;
  const edgeList = [...map.edges.values()].map((e) => {
    const A = nodes[e.a];
    const B = nodes[e.b];
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    return { A, B, L, ux: (B.x - A.x) / L, uz: (B.z - A.z) / L };
  });
  const P = (A, ux, uz, t, lat) => [A.x + ux * t - uz * lat, A.z + uz * t + ux * lat];
  for (const { A, B, L, ux, uz } of edgeList) {
    if (!roof) {
      // Lamp posts (drawn by the renderer's lamp pass).
      for (let t = 20; t < L - 20; t += 38) {
        for (const side of [-1, 1]) {
          const [x, z] = P(A, ux, uz, t, side * (SETBACK + 0.8));
          hide(around(x, z, 0.2), 7);
        }
      }
    }
    if (style.streetTrees && !roof) {
      for (let t = SETBACK + 9; t < L - SETBACK - 4; t += 17) {
        for (const side of [-1, 1]) {
          const [x, z] = P(A, ux, uz, t, side * (SETBACK - 1.8));
          add('tree', around(x, z, 0.21), 4.2, { x, z, s: 0.7 });
        }
      }
    }
    if (archEdge(A, B)) {
      for (const side of [-1, 1]) {
        const [x, z] = P(A, ux, uz, L / 2, side * (SETBACK + 0.6));
        hide(around(x, z, 0.4), 10);
      }
    }
    if (roof) {
      // Rooftop clutter along the deck edges: A/C units, water tanks, antennas.
      for (const [s0, s1] of edgeSpans(map, A, B, L)) {
        for (let t = Math.max(s0 + 16, SETBACK + 8); t < Math.min(s1 - 16, L - SETBACK - 8); t += 22 + rng() * 20) {
          const side = rng() < 0.5 ? -1 : 1;
          const [x, z] = P(A, ux, uz, t, side * (SETBACK - 2.2));
          const kind = rng();
          if (kind < 0.5) add('hvac', around(x, z, 1.3), 1.8, { x, z });
          else if (kind < 0.8) add('watertank', around(x, z, 1.6), 5.5, { x, z });
          else add('antenna', around(x, z, 0.3), 10, { x, z });
        }
      }
    }
  }
  // Through-buildings: a tower straddling the deck, with a tunnel through it.
  for (const th of map.throughs || []) {
    const A = nodes[th.a];
    const B = nodes[th.b];
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    const ux = (B.x - A.x) / L;
    const uz = (B.z - A.z) / L;
    const [x, z] = P(A, ux, uz, th.t, 0);
    deco('through', { x, z, ux, uz, h: 60 + rng() * 60 });
    for (const s of [-1, 1]) {
      const [wx, wz] = P(A, ux, uz, th.t, s * (SETBACK + 6));
      hide(Math.abs(ux) > 0.5 ? around(wx, wz, 17, 6) : around(wx, wz, 6, 17), 9);
    }
  }
  // Pillars under the upper deck and in the tunnels (drawn with the landmarks).
  if (style.features.includes('overpass')) {
    const lines = [];
    for (const j of [1, style.rows - 2]) lines.push([...Array(style.cols).keys()].map((i) => nodes[map.nid(i, j)]));
    lines.push([...Array(style.rows).keys()].map((j) => nodes[map.nid(Math.floor(style.cols / 2), j)]));
    for (const line of lines) {
      for (let k = 0; k + 1 < line.length; k++) {
        const A = line[k];
        const B = line[k + 1];
        const L = Math.hypot(B.x - A.x, B.z - A.z);
        for (let t = 22; t < L - 10; t += 45) {
          for (const side of [-1, 1]) {
            const [x, z] = P(A, (B.x - A.x) / L, (B.z - A.z) / L, t, side * (SETBACK + 1.8));
            hide(around(x, z, 1), 30);
          }
        }
      }
    }
  }
  for (const [a, b] of map.tunnels || []) {
    const A = nodes[a];
    const B = nodes[b];
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    const ux = (B.x - A.x) / L;
    const uz = (B.z - A.z) / L;
    for (let t = SETBACK; t < L - SETBACK; t += 10) {
      for (const s of [-1, 1]) {
        const [x, z] = P(A, ux, uz, t + 5, s * (SETBACK + 1.2));
        hide(around(x, z, 0.6), 9);
      }
    }
  }
  // Signal posts at the freight line's level crossings.
  if (map.freight) {
    const { x, z0, z1 } = map.freight;
    for (const z of map.zs) {
      if (z <= z0 || z >= z1) continue;
      for (const s of [-1, 1]) add('signal', around(x + s * 4.5, z - s * (SETBACK - 1), 0.25), 4, { x: x + s * 4.5, z: z - s * (SETBACK - 1) });
    }
  }
  // Waterfront cranes' legs and pier bollards.
  if (style.features.includes('waterfront')) {
    const edge = map.bounds.maxZ + SETBACK + 30;
    for (let x = map.bounds.minX; x <= map.bounds.maxX; x += 140) {
      if (map.piers.some((p) => Math.abs(p.x - x) < 32)) continue;
      for (const dz of [4, 20]) for (const dx of [-9, 9]) hide(around(x + dx, edge + dz, 0.8), 32);
    }
    for (const p of map.piers) {
      for (let z = p.z0 + 4; z < p.z1 + 10; z += 9) for (const s of [-1, 1]) hide(around(p.x + s * (SETBACK + 0.5), z, 0.3), 0.8);
    }
  }
  return { items };
}
