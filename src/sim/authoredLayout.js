// Everything solid in an authored district, placed once by fixed rules from the
// district's data (no randomness): what each lot holds is set in the district
// file, and these rules fill it the same way every time. The renderer draws
// exactly these items and free roam collides with exactly these.
//
// Item: { t, r: [x0, x1, z0, z1] footprint, h, solid, ... }. Rotated items also
// carry { obb: { x, z, hw, hd, yaw } }. Drivable decks carry deck: true and
// ramps carry ramp: { x, z, dirX, dirZ, len, width, height }.

import { SETBACK, TUNNEL_HALF } from './city.js';

const around = (x, z, hw, hd = hw) => [x - hw, x + hw, z - hd, z + hd];
const DOCK = 8; // loading dock depth in front of a warehouse
const DOCK_H = 1.2;
const WAREHOUSE_H = [12, 16, 10, 20, 14, 8, 18, 11, 15, 9, 13, 17];
const SHED_H = [6, 7, 6, 8, 7];
const TANK_H = [14, 18, 12, 16, 15, 11];
const STACK_N = [3, 4, 2, 3, 1, 4, 2, 3, 4, 1, 3, 2];
const CRATE_N = [1, 2, 3, 2];
export const CRANE_LEGS = [-24, -8]; // quay crane legs, metres from the quay edge

// Points every `step` metres along a polyline of [x, z].
const sample = (points, step = 3) => {
  const out = [];
  for (let k = 0; k + 1 < points.length; k++) {
    const [ax, az] = points[k];
    const [bx, bz] = points[k + 1];
    const d = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t < d; t += step) out.push([ax + ((bx - ax) * t) / d, az + ((bz - az) * t) / d]);
  }
  return out;
};

export function authoredLayout(map) {
  const { style, nodes } = map;
  const items = [];
  const add = (t, r, h, extra = {}) => items.push({ t, r, h, solid: true, ...extra });
  const deco = (t, extra = {}) => items.push({ t, solid: false, ...extra });
  const hide = (r, h) => items.push({ t: 'solid', r, h, solid: true, hidden: true });
  const fx = map.freight?.x;
  let wh = 0;
  const corridor = (id) => map.corridors.find((c) => c.id === id);

  // A fence along a lot edge from a to b (one axis), with gaps [g0, g1] left open.
  const fence = (alongX, at, a, b, gaps = []) => {
    let p = a;
    for (const [g0, g1] of [...gaps].sort((u, v) => u[0] - v[0])) {
      if (g0 > p) add('fence', alongX ? [p, g0, at - 0.15, at + 0.15] : [at - 0.15, at + 0.15, p, g0], 3.2, { alongX });
      p = Math.max(p, g1);
    }
    if (b > p) add('fence', alongX ? [p, b, at - 0.15, at + 0.15] : [at - 0.15, at + 0.15, p, b], 3.2, { alongX });
  };

  // Splits [a0, a1] into n equal buildings with a gap between: [[x0, x1], ...].
  const slices = (a0, a1, target, gap) => {
    const n = Math.max(1, Math.round((a1 - a0) / target));
    const len = (a1 - a0 - gap * (n - 1)) / n;
    return [...Array(n).keys()].map((k) => [a0 + k * (len + gap), a0 + k * (len + gap) + len]);
  };

  for (const c of map.cells) {
    if (c.site) continue;
    const [lx0, lx1, lz0, lz1] = c.lot;
    if (c.kind === 'warehouses') {
      // Two rows of corrugated warehouses, one facing each long street, each
      // with a loading dock in front (a ramp at its east end). An alley runs
      // between the rows; otherwise a service yard does. The freight line
      // splits the block where it passes through.
      const parts = fx !== undefined && fx > lx0 && fx < lx1 ? [[lx0, fx - 6], [fx + 6, lx1]] : [[lx0, lx1]];
      const mid = c.alley ? map.alleyZ : (lz0 + lz1) / 2;
      const back = c.alley ? map.alleyHalf : 10;
      const rowsZ = [
        { z0: lz0 + DOCK, z1: mid - back, face: 'n' },
        { z0: mid + back, z1: lz1 - DOCK, face: 's' },
      ];
      for (const row of rowsZ) {
        for (const [a0, a1] of parts) {
          const blds = slices(a0 + 2, a1 - 2, 64, 6);
          for (const [x0, x1] of blds) {
            add('bldg', [x0, x1, row.z0, row.z1], WAREHOUSE_H[wh++ % WAREHOUSE_H.length], { lift: 0, unit: c, face: row.face, warehouse: true });
            // Loading dock along the street face, with a ramp up at its east end.
            const [dz0, dz1] = row.face === 'n' ? [lz0 + 0.6, row.z0] : [row.z1, lz1 - 0.6];
            items.push({ t: 'dock', r: [x0 + 1, x1 - 9, dz0, dz1], h: DOCK_H, solid: false, deck: true, face: row.face });
            items.push({ t: 'dockRamp', solid: false, ramp: { x: x1 - 1, z: (dz0 + dz1) / 2, dirX: -1, dirZ: 0, len: 8, width: dz1 - dz0, height: DOCK_H } });
          }
          // Brick walls fill the gaps between warehouses along the alley, so
          // the alley's walls run unbroken from street to street.
          if (c.alley) {
            const zb = row.face === 'n' ? row.z1 + 0.2 : row.z0 - 0.2;
            const edgesX = [a0, ...blds.flat(), a1];
            for (let k = 0; k + 1 < edgesX.length; k += 2) {
              if (edgesX[k + 1] - edgesX[k] > 0.3) add('wall', [edgesX[k], edgesX[k + 1], zb - 0.2, zb + 0.2], 3.2, { alongX: true });
            }
          }
        }
      }
    } else if (c.kind === 'fish') {
      // Fish and ice sheds: a row facing each street, the ice plant and crate
      // stacks in the yard between.
      const blds = slices(lx0 + 3, lx1 - 3, 40, 6);
      blds.forEach(([x0, x1], k) => {
        add('shed', [x0, x1, lz0 + DOCK, lz0 + DOCK + 36], SHED_H[k % SHED_H.length], { tone: k % 3, face: 'n' });
        add('shed', [x0, x1, lz1 - DOCK - 36, lz1 - DOCK], SHED_H[(k + 2) % SHED_H.length], { tone: (k + 1) % 3, face: 's' });
      });
      const cx = (lx0 + lx1) / 2;
      const cz = (lz0 + lz1) / 2;
      add('iceplant', around(cx, cz, 9, 6), 7, { x: cx, z: cz });
      let k = 0;
      for (const z of [cz - 20, cz + 20]) {
        for (let x = lx0 + 10; x <= lx1 - 10; x += 12) {
          if (Math.abs(x - cx) < 16) continue;
          const n = CRATE_N[k++ % CRATE_N.length];
          add('crates', around(x, z, 1.3), n * 1.2, { x, z, n });
        }
      }
    } else if (c.kind === 'tanks') {
      // Fuel tanks on a 4 x 3 grid, white and rusted in turn, behind a fence.
      const W = lx1 - lx0 - 10;
      const D = lz1 - lz0 - 10;
      const rad = Math.min(W / 4, D / 3) * 0.36;
      let k = 0;
      for (let b = 0; b < 3; b++) {
        for (let a = 0; a < 4; a++) {
          const x = lx0 + 5 + (W / 4) * (a + 0.5);
          const z = lz0 + 5 + (D / 3) * (b + 0.5);
          const hgt = TANK_H[k++ % TANK_H.length];
          add('tank', around(x, z, rad * 0.85), hgt + 1.5, { x, z, rad, hgt, rust: (a + b) % 2 === 1 });
        }
      }
      // Pipe runs overhead between the rows, on posts every 12 m.
      for (const z of [lz0 + (lz1 - lz0) / 3, lz0 + (2 * (lz1 - lz0)) / 3]) {
        deco('pipes', { x0: lx0 + 4, x1: lx1 - 4, z });
        for (let px = lx0 + 4; px <= lx1 - 4; px += 12) hide(around(px, z, 0.2), 4.2);
      }
      const gx = (lx0 + lx1) / 2;
      fence(true, lz0 + 1, lx0 + 1, lx1 - 1, [[gx - 8, gx + 8]]);
      fence(true, lz1 - 1, lx0 + 1, lx1 - 1);
      fence(false, lx0 + 1, lz0 + 1, lz1 - 1);
      fence(false, lx1 - 1, lz0 + 1, lz1 - 1);
    } else if (c.kind === 'shop') {
      // Wrench & Rust: the workshop, its forecourt on Dock Road with project cars, a store behind.
      const x0 = lx0 + 26;
      const x1 = lx1 - 26;
      add('bldg', [x0, x1, lz1 - 107, lz1 - 57], 10, { lift: 0, unit: c, face: 's', shop: true });
      deco('shopSign', { x: (x0 + x1) / 2, z: lz1 - 57, w: 36 });
      add('bldg', [lx0 + 16, lx0 + 96, lz0 + 12, lz0 + 52], 7, { lift: 0, unit: c, face: 'n' });
      for (const [x, z, yaw] of [[lx0 + 40, lz1 - 30, 0.3], [lx0 + 66, lz1 - 24, -0.2], [lx1 - 64, lz1 - 32, 0], [lx1 - 38, lz1 - 22, 0.5]]) add('car', around(x, z, 2.1), 1.6, { x, z, yaw });
      for (const x of [x0 + 4, x1 - 4]) add('tyres', around(x, lz1 - 50, 1.4), 1.8, { x, z: lz1 - 50 });
    }
  }

  // --- Sites ---
  for (const s of map.sites) {
    const [lx0, lx1, lz0, lz1] = s.lot;
    if (s.kind === 'railyard') {
      for (const w of s.wagons || []) add('wagon', w.r, 4.5, { tank: w.tank, color: w.color });
      // Signal gantries across the tracks at both ends.
      for (const x of [lx0 + 12, -120]) {
        for (const z of [lz0 + 2, lz1 - 2]) add('post', around(x, z, 0.3), 8, { x, z, hgt: 8 });
        deco('yardGantry', { x, z0: lz0 + 2, z1: lz1 - 2 });
      }
      // The goods shed and its loading platform across the north-east corner.
      const gs = map.goodsShed;
      if (gs) {
        const yaw = Math.atan2(gs.platform.dirX, gs.platform.dirZ);
        const obb = (o, len, wid) => ({ x: o.x, z: o.z, hw: wid / 2, hd: len / 2, yaw });
        const aabb = (b) => {
          const c = Math.abs(Math.cos(b.yaw));
          const sn = Math.abs(Math.sin(b.yaw));
          const ex = b.hw * c + b.hd * sn;
          const ez = b.hw * sn + b.hd * c;
          return around(b.x, b.z, ex, ez);
        };
        const shed = obb(gs.shed, gs.shed.len, gs.shed.wid);
        add('goodsShed', aabb(shed), gs.shed.h, { obb: shed });
        const plat = obb(gs.platform, gs.platform.len, gs.platform.wid);
        items.push({ t: 'loadPlatform', r: aabb(plat), h: gs.platform.h, solid: false, deck: true, obb: plat });
        items.push({ t: 'platformRamp', solid: false, ramp: { ...gs.ramp } });
      }
      // The yard fence, with gaps for the fence-gap crossing, the freight line and the goods platform.
      const gap = corridor('fence-gap');
      const gx = gap ? gap.points[0][0] : null;
      const plat = corridor('goods-platform');
      const pExit = plat ? plat.points[plat.points.length - 1][0] : null;
      fence(true, lz0, lx0, lx1, [...(gx !== null ? [[gx - 9, gx + 9]] : []), ...(pExit !== null ? [[pExit - 14, pExit + 22]] : [])]);
      fence(true, lz1, lx0, lx1, [...(gx !== null ? [[gx - 9, gx + 9]] : []), ...(fx !== undefined ? [[fx - 5, fx + 5]] : [])]);
      fence(false, lx0, lz0, lz1);
      const ramp = map.goodsShed?.ramp;
      fence(false, lx1, lz0, lz1, ramp ? [[ramp.z - 9, ramp.z + 9]] : []);
    } else if (s.kind === 'terminal') {
      // Stack blocks with lanes between, clear of the haul road; the two
      // container tunnels; two gantry cranes over the stacks.
      const haul = corridor('terminal');
      const path = haul ? sample(haul.points) : [];
      const clear = (x, z, m) => path.every(([px, pz]) => Math.hypot(px - x, pz - z) > m);
      const U = lx1 - lx0;
      const V = lz1 - lz0;
      let row = 0;
      for (let v = 8; v < V - 8; v += 16, row++) {
        let col = 0;
        for (let t = 8; t < U - 8; t += 2.9, col++) {
          if (Math.floor(t / 40) % 4 === 3) continue; // cross lanes
          const x = lx0 + t;
          const z = lz0 + v;
          if (!clear(x, z, 14.5)) continue;
          const n = STACK_N[(row * 5 + col) % STACK_N.length];
          add('stack', around(x, z, 1.22, 6.1), n * 2.6, { x, z, alongX: true, n });
        }
      }
      for (const t of s.tunnels || []) {
        const h = t.len / 2;
        const layers = 2;
        for (const side of [-1, 1]) {
          const r = t.alongX ? [t.x - h, t.x + h, t.z + side * (TUNNEL_HALF + 0.08) - 0.12, t.z + side * (TUNNEL_HALF + 0.08) + 0.12] : [t.x + side * (TUNNEL_HALF + 0.08) - 0.12, t.x + side * (TUNNEL_HALF + 0.08) + 0.12, t.z - h, t.z + h];
          add('solid', r, 2.6 * layers, { hidden: true });
        }
        deco('ctunnel', { ...t, layers });
      }
      for (const f of [0.3, 0.7]) {
        const x = lx0 + U * f;
        const ends = [[x, lz0 + 3], [x, lz1 - 3]];
        for (const [px, pz] of ends) hide(around(px, pz, 0.8), 24);
        deco('gantry', { a: ends[0], b: ends[1] });
      }
      // Fence: gates where the haul road comes in and goes out; a fence between terminal and truck park.
      const [inX, outX] = haul ? [haul.points[0][0], haul.points[haul.points.length - 1][0]] : [0, 0];
      fence(true, lz0, lx0, lx1, [[inX - 16, inX + 16]]);
      fence(true, lz1, lx0, lx1, [[outX - 16, outX + 16]]);
      fence(false, lx0 + 0.2, lz0, lz1);
      fence(false, lx1, lz0, lz1);
    } else if (s.kind === 'parking') {
      // The truck park: trailers in rows, an aisle across the middle.
      const rowsX = [];
      for (let x = lx0 + 22; x < lx1 - 10; x += 25) rowsX.push(x);
      rowsX.forEach((x, ri) => {
        for (let k = 0, z = lz0 + 12; z < lz1 - 12; k++, z += 19) {
          if (Math.abs(z - (lz0 + lz1) / 2) < 14 || (k + ri) % 5 === 4) continue;
          add('trailer', around(x, z, 1.3, 8), 4, { x, z, alongX: false, cab: (k + ri) % 3 === 0 });
        }
      });
      const gx = (lx0 + lx1) / 2;
      fence(true, lz0, lx0, lx1, [[gx - 10, gx + 10]]);
      fence(true, lz1, lx0, lx1, [[gx - 10, gx + 10]]);
      fence(false, lx0, lz0, lz1, [[(lz0 + lz1) / 2 - 10, (lz0 + lz1) / 2 + 10]]);
    } else if (s.kind === 'arena') {
      const spec = style.arenas?.[s.name];
      if (spec?.shell) {
        // Warehouse Row: the half-demolished warehouse's walls, with doorways
        // (shuttered during the boss fight) onto Dock Road and Cannery Row.
        const t = 1;
        const doors = { n: [[-100, -80], [80, 100]], s: [[30, 50]] };
        const wall = (alongX, at, a, b, gaps) => {
          let p = a;
          for (const [g0, g1] of gaps) {
            if (g0 > p) add('shellWall', alongX ? [p, g0, at - t / 2, at + t / 2] : [at - t / 2, at + t / 2, p, g0], 14, { alongX });
            p = g1;
          }
          if (b > p) add('shellWall', alongX ? [p, b, at - t / 2, at + t / 2] : [at - t / 2, at + t / 2, p, b], 14, { alongX });
        };
        wall(true, lz0 - t / 2, lx0 - t, lx1 + t, doors.n);
        wall(true, lz1 + t / 2, lx0 - t, lx1 + t, doors.s);
        wall(false, lx0 - t / 2, lz0, lz1, []);
        wall(false, lx1 + t / 2, lz0, lz1, []);
        deco('shell', { r: [lx0, lx1, lz0, lz1], doors, h: 14 });
      } else {
        // An event ground: fenced on the sides the district file names.
        const sides = spec?.fence || ['n', 's', 'e', 'w'];
        if (sides.includes('n')) fence(true, lz0, lx0, lx1);
        if (sides.includes('s')) fence(true, lz1, lx0, lx1);
        if (sides.includes('w')) fence(false, lx0, lz0, lz1);
        if (sides.includes('e')) fence(false, lx1, lz0, lz1);
        for (const [x, z] of [[lx0 + 2, lz0 + 2], [lx1 - 2, lz0 + 2]]) add('mast', around(x, z, 0.4), 22, { x, z });
      }
    }
  }

  // --- The dry dock basin and the freighter in it ---
  const b = map.basin;
  if (b) {
    deco('drydock', { ...b });
    const hl = b.hull;
    add('hull', around(hl.x, hl.z, hl.hw, hl.hd), hl.h, { y: -b.depth + 1.5, x: hl.x, z: hl.z, hw: hl.hw, hd: hl.hd });
  }

  // --- Along the streets ---
  const edgeList = [...map.edges.values()].map((e) => {
    const A = nodes[e.a];
    const B = nodes[e.b];
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    return { A, B, L, ux: (B.x - A.x) / L, uz: (B.z - A.z) / L };
  });
  const P = (A, ux, uz, t, lat) => [A.x + ux * t - uz * lat, A.z + uz * t + ux * lat];
  for (const { A, L, ux, uz } of edgeList) {
    // Lamp posts (drawn by the renderer's lamp pass).
    for (let t = 20; t < L - 20; t += 38) {
      for (const side of [-1, 1]) {
        const [x, z] = P(A, ux, uz, t, side * (SETBACK + 0.8));
        hide(around(x, z, 0.2), 7);
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
  // Quay cranes between the piers (none over the dry dock), legs on the apron
  // either side of the crane rail, the boom out over the water; pier bollards.
  if (style.features.includes('waterfront')) {
    const edge = map.bounds.maxZ + SETBACK + 30;
    for (let x = map.bounds.minX; x <= map.bounds.maxX; x += 140) {
      if (map.piers.some((p) => Math.abs(p.x - x) < 32)) continue;
      if (b && x > b.x0 - 12 && x < b.x1 + 12) continue;
      deco('quayCrane', { x, z: edge });
      for (const dz of CRANE_LEGS) for (const dx of [-9, 9]) hide(around(x + dx, edge + dz, 1.5, 2), 32); // leg and its bogie
    }
    for (const p of map.piers) {
      for (let z = p.z0 + 4; z < p.z1 + 10; z += 9) for (const s of [-1, 1]) hide(around(p.x + s * (SETBACK + 0.5), z, 0.3), 0.8);
    }
  }
  // Barrier gates where the roads out of the district leave it.
  for (const st of map.stubs || []) {
    const A = nodes[st.a];
    const B = nodes[st.b];
    const x = A.x + Math.sign(B.x - A.x) * 12;
    add('gate', [x - 0.6, x + 0.6, A.z - SETBACK, A.z + SETBACK], 1.2, { x, z: A.z });
  }
  return { items };
}
