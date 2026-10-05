import * as THREE from 'three';
import { litMaterial, standardMaterial, glowMaterial, additiveMaterial } from './retroMaterial.js';
import { box, obbBox, flatPoly, tint, tireGeometry } from './shapes.js';
import { floodAt } from '../sim/flood.js';
import { SIM_DT } from '../config.js';
import * as G from '../sim/geom2d.js';

// The Undercity's own kit (used by planView): its ground (one mesh over the
// streets' level, the sinkhole, the storm drain and the road cuts, finer
// wherever it isn't flat), the deck overhead with its lamps and light wells,
// the river and the bay, the Low Road's tunnel, and the district's things by
// kind (pillars, shacks and container homes, Old Town, the market, the
// scrapyard, the tank farm, the Sump, the drain's Culvert and Outfall, the
// sirens). The flood, when it comes, runs down the drain as water.

const DS = THREE.DoubleSide;
const COARSE = 8;
const FINE = 2;
const SHACK = ['#6a4a3a', '#5a6a70', '#7a6a4a', '#4a5a48', '#6a3a3a', '#58506a', '#80705a'];
const CONTAINER = ['#8a3a2a', '#2a5a7a', '#c8902a', '#3a6a3a', '#6a6a70', '#9a4a1a'];
const CARS = ['#6a3a2a', '#4a4a50', '#5a5a3a', '#3a4a5a', '#7a5a3a', '#505048'];

export function underView({ map, tex, H, group, items, text, clipToConvex, merged, guest = false }) {
  const P = map.style.plan;
  const U = P.under;
  const look = map.style.look;
  const add = (m) => m && group.add(m);
  const pit = P.pit || { c: [0, 0], rim: 0, floor: 0, depth: 0 };
  const drain = P.drain || { z: 0, x0: 0, x1: 0, bed: 0, depth: 0, walls: 45, trench: 0 };
  const run = drain.depth / Math.tan((drain.walls * Math.PI) / 180);
  const drainTop = drain.bed / 2 + run;

  const mats = {
    lot: litMaterial({ map: tex.lot, color: look.lot, side: DS }),
    dirt: litMaterial({ map: tex.dirt, color: '#6a5a4a', side: DS }),
    mud: litMaterial({ map: tex.dirt, color: '#4a4236', side: DS }),
    concrete: litMaterial({ map: tex.sidewalk, color: '#8a8698', side: DS }),
    road: standardMaterial({ map: tex.asphalt, color: look.road || '#ffffff', roughness: 0.4, metalness: 0.1, envMap: tex.env, envMapIntensity: 0.6, side: DS, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
    tiles: litMaterial({ map: tex.tiles, color: '#8a8070', side: DS, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    parking: litMaterial({ map: tex.parking, color: '#8a8490', side: DS, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    yard: litMaterial({ map: tex.dirt, color: '#5a4a3a', side: DS, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    deck: litMaterial({ map: tex.sidewalk, color: '#4a4652', side: DS }),
    water: standardMaterial({ color: '#0a1418', roughness: 0.3, metalness: 0.5, envMap: tex.env, envMapIntensity: 0.4 }),
    flood: standardMaterial({ color: '#3a4838', roughness: 0.2, metalness: 0.4, envMap: tex.env, envMapIntensity: 0.6, transparent: true, opacity: 0.88, side: DS }),
    corrugated: litMaterial({ map: tex.corrugated || tex.wall, vertexColors: true }),
    containers: litMaterial({ map: tex.container, vertexColors: true }),
    painted: litMaterial({ vertexColors: true }),
    rust: litMaterial({ color: '#6a3a24' }),
    concreteItem: litMaterial({ map: tex.wallConcrete || tex.wall, color: '#8a8698' }),
    dark: litMaterial({ color: '#16141c' }),
    steel: litMaterial({ color: '#4a4858' }),
    lamp: glowMaterial({ color: look.lamp, intensity: 3 }),
    window: glowMaterial({ color: '#ffb060', intensity: 2 }),
    hazard: glowMaterial({ color: '#e8b020', intensity: 1.2 }),
    fire: glowMaterial({ color: '#ff7a20', intensity: 3 }),
    pool: additiveMaterial({ map: tex.glow, color: look.lamp, opacity: 0.3 }),
    shaft: additiveMaterial({ map: tex.glow, color: '#c8d8ff', opacity: 0.12 }),
    siren: glowMaterial({ color: '#ff2020', intensity: 4 }),
    strobe: glowMaterial({ color: '#ffffff', intensity: 5 }),
    gush: additiveMaterial({ map: tex.glow, color: '#a8c8c0', opacity: 0.5 }),
  };
  const neon = look.neon.map((c) => glowMaterial({ color: c, intensity: 2.6 }));
  const B = { corrugated: [], containers: [], painted: [], rust: [], concreteItem: [], dark: [], steel: [], lamp: [], window: [], hazard: [], fire: [], pool: [], shaft: [], deck: [], water: [], road: [] };
  const N = look.neon.map(() => []);
  const sirens = [];
  const strobes = [];
  const gushes = [];

  // --- The ground ---
  function ground() {
    const bnd = G.polyBounds(P.boundary);
    const M = 24;
    const x0 = Math.floor((bnd.minX - M) / COARSE) * COARSE;
    const z0 = Math.floor((bnd.minZ - M) / COARSE) * COARSE;
    const nx = Math.ceil((bnd.maxX + M - x0) / COARSE);
    const nz = Math.ceil((bnd.maxZ + M - z0) / COARSE);
    const segs = P.boundary.map((a, k) => [a, P.boundary[(k + 1) % P.boundary.length]]);
    const shoreSeg = (a, b) => Object.values(U.shores || {}).some((line) => line.some((p, k) => k + 1 < line.length && ((G.len2(p, a) < 0.5 && G.len2(line[k + 1], b) < 0.5) || (G.len2(p, b) < 0.5 && G.len2(line[k + 1], a) < 0.5))));
    // Beyond a shore (outside the boundary, nearest one of the shore's runs): water.
    const wet = (x, z) => {
      if (G.pointInPoly(x, z, P.boundary)) return false;
      let best = null;
      for (const [a, b] of segs) {
        const d = G.segDist(x, z, a, b).d;
        if (!best || d < best.d) best = { d, a, b };
      }
      return shoreSeg(best.a, best.b);
    };
    const hCache = new Map();
    const fi = COARSE / FINE;
    const hAt = (i, j) => {
      const key = i * 100003 + j;
      let h = hCache.get(key);
      if (h === undefined) {
        h = H(x0 + i * FINE, z0 + j * FINE);
        hCache.set(key, h);
      }
      return h;
    };
    const kind = (x, z) => {
      const r = Math.hypot(x - pit.c[0], z - pit.c[1]);
      if (x >= drain.x0 - 1 && x <= drain.x1 + 1 && Math.abs(z - drain.z) < drainTop + 0.5) return 'concrete';
      if (r < pit.floor + 1) return 'mud';
      if (r < pit.rim + 2) return 'dirt';
      const q = map.cutAt(x, z);
      if (q && q.d > q.c.half - 0.5 && Math.abs(H(x, z) - q.y) > 0.3) return 'dirt';
      return 'lot';
    };
    const S = { lot: mesh(), dirt: mesh(), mud: mesh(), concrete: mesh() };
    const quad = (s, i, j, di, dj) => {
      const v = (a, b) => s.vert(a, b, x0 + a * FINE, hAt(a, b) - 0.12, z0 + b * FINE);
      const a = v(i, j);
      const b = v(i + di, j);
      const c = v(i + di, j + dj);
      const d = v(i, j + dj);
      s.idx.push(a, c, b, a, d, c);
    };
    for (let ci = 0; ci < nx; ci++) {
      for (let cj = 0; cj < nz; cj++) {
        const cx = x0 + (ci + 0.5) * COARSE;
        const cz = z0 + (cj + 0.5) * COARSE;
        if (wet(cx, cz)) continue;
        let flat = true;
        for (let a = 0; a <= fi && flat; a++) for (let b = 0; b <= fi && flat; b++) if (Math.abs(hAt(ci * fi + a, cj * fi + b)) > 1e-3) flat = false;
        if (flat && kind(cx, cz) === 'lot') {
          quad(S.lot, ci * fi, cj * fi, fi, fi);
          continue;
        }
        for (let a = 0; a < fi; a++) {
          for (let b = 0; b < fi; b++) {
            const i = ci * fi + a;
            const j = cj * fi + b;
            quad(S[kind(x0 + (i + 0.5) * FINE, z0 + (j + 0.5) * FINE)], i, j, 1, 1);
          }
        }
      }
    }
    for (const [k, s] of Object.entries(S)) add(s.build(mats[k]));
    // Far beyond: level ground, open on the water's sides.
    const far = 2600;
    const ring = [
      ['n', [[-far, -far], [far, -far], [far, z0], [-far, z0]], [0, bnd.minZ - M]],
      ['s', [[-far, z0 + nz * COARSE], [far, z0 + nz * COARSE], [far, far], [-far, far]], [0, bnd.maxZ + M]],
      ['w', [[-far, z0], [x0, z0], [x0, z0 + nz * COARSE], [-far, z0 + nz * COARSE]], [bnd.minX - M, 0]],
      ['e', [[x0 + nx * COARSE, z0], [far, z0], [far, z0 + nz * COARSE], [x0 + nx * COARSE, z0 + nz * COARSE]], [bnd.maxX + M, 0]],
    ];
    const cz = (bnd.minZ + bnd.maxZ) / 2;
    const cxm = (bnd.minX + bnd.maxX) / 2;
    for (const [side, poly] of ring) {
      const probe = side === 'n' ? [cxm, bnd.minZ - M] : side === 's' ? [cxm, bnd.maxZ + M] : side === 'w' ? [bnd.minX - M, cz] : [bnd.maxX + M, cz];
      if (wet(...probe)) continue;
      add(new THREE.Mesh(flatPoly(poly, () => -0.12), mats.lot));
    }
    // The flat sites' own surfaces.
    const siteMat = { market: 'tiles', yard: 'yard', tanks: 'parking', hall: 'parking' };
    const surf = { tiles: [], yard: [], parking: [] };
    for (const s of map.sites) {
      const m = siteMat[s.kind] || (s.name === 'Pillar Hall' ? 'parking' : null);
      if (!m || !s.poly || s.pit || s.poly.some(([x, z]) => Math.abs(H(x, z)) > 1e-3)) continue;
      for (const b of map.blocks) {
        const piece = clipToConvex(b.lot, s.poly);
        if (piece.length > 2 && Math.abs(G.polyArea(piece)) > 1) surf[m].push(flatPoly(piece, () => -0.06));
      }
    }
    for (const [k, list] of Object.entries(surf)) if (list.length) add(new THREE.Mesh(merged(list), mats[k]));
    // The Low Road: its own road all the way down (under the ground, and in the open).
    for (const st of map.streets.filter((q) => q.tunnel)) roadAlong(st.pts, st.heights, st.half);
  }

  // A mesh of shared vertices on the fine grid.
  function mesh() {
    const pos = [];
    const uv = [];
    const idx = [];
    const at = new Map();
    return {
      idx,
      vert(i, j, x, y, z) {
        const key = i * 100003 + j;
        let k = at.get(key);
        if (k === undefined) {
          k = pos.length / 3;
          pos.push(x, y, z);
          uv.push(x / 8, z / 8);
          at.set(key, k);
        }
        return k;
      },
      build(mat) {
        if (!idx.length) return null;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        return new THREE.Mesh(g, mat);
      },
    };
  }

  // A road along points at their own heights.
  function roadAlong(pts, hs, half, dy = 0.04) {
    const pos = [];
    const uv = [];
    const idx = [];
    let v = 0;
    pts.forEach((p, k) => {
      const a = pts[Math.max(0, k - 1)];
      const b = pts[Math.min(pts.length - 1, k + 1)];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
      if (k) v += G.len2(pts[k - 1], p);
      for (const s of [-1, 1]) {
        pos.push(p[0] + n[0] * half * s, hs[k] + dy, p[1] + n[1] * half * s);
        uv.push(s < 0 ? 0 : (half * 2) / 8, v / 8);
      }
      if (k) idx.push(2 * k - 2, 2 * k - 1, 2 * k + 1, 2 * k - 2, 2 * k + 1, 2 * k);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    B.road.push(g);
  }

  const at = (x, z) => H(x, z);
  const yawOf = (fx, fz) => Math.atan2(fx, fz);

  // A stack of storeys, each a little off the last (ramshackle), a lit window or two.
  function shack(it, container) {
    const o = it.obb;
    const storey = container ? 2.6 : 3.4;
    const n = Math.max(1, Math.round(it.h / storey));
    const hs = it.h / n;
    const [fx, fz] = it.front || [Math.sin(o.yaw), Math.cos(o.yaw)];
    for (let q = 0; q < n; q++) {
      const k = (it.cycle || 0) + q * 3;
      const shift = ((k % 3) - 1) * 0.35;
      const oo = { ...o, x: o.x + fz * shift, z: o.z - fx * shift, hw: o.hw - (q % 2) * 0.3, hd: o.hd - ((q + 1) % 2) * 0.2 };
      const y = it.y + q * hs;
      if (container) B.containers.push(tint(obbBox(oo, hs - 0.05, y), CONTAINER[k % CONTAINER.length]));
      else B.corrugated.push(tint(obbBox(oo, hs - 0.1, y), SHACK[k % SHACK.length]));
      // A lit window on the front, now and then.
      if ((k * 7) % 5 < 2) {
        const w = Math.min(1.6, oo.hw);
        const fd = frontDepth(oo, fx, fz);
        B.window.push(box(w, 1, 0.1, oo.x + fx * (fd + 0.05) + fz * ((k % 2) - 0.5) * oo.hw, y + hs * 0.55, oo.z + fz * (fd + 0.05) - fx * ((k % 2) - 0.5) * oo.hw, yawOf(fx, fz)));
      }
      B.dark.push(obbBox({ ...oo, hw: oo.hw + 0.3, hd: oo.hd + 0.3 }, 0.18, y + hs - 0.1));
    }
    // A neon scrap of a sign on some.
    if ((it.cycle || 0) % 7 === 3) {
      const fd = frontDepth(o, fx, fz);
      N[(it.cycle || 0) % N.length].push(box(Math.min(3, o.hw * 1.4), 0.5, 0.12, o.x + fx * (fd + 0.1), it.y + Math.min(3.2, it.h - 0.8), o.z + fz * (fd + 0.1), yawOf(fx, fz)));
    }
    if (it.terrace) {
      // Stilts down to the wall below.
      for (const [sx, sz] of G.obbCorners(o)) {
        const g = at(sx, sz);
        if (g > it.y + 0.3) continue;
        B.steel.push(box(0.2, it.y - g + 1, 0.2, sx, (it.y + g) / 2, sz));
      }
    }
  }
  // Half the building's depth along its front direction.
  const frontDepth = (o, fx, fz) => Math.abs(fx * Math.sin(o.yaw) + fz * Math.cos(o.yaw)) > 0.7 ? o.hd : o.hw;

  const buildings = {
    shack: (it) => shack(it, false),
    container: (it) => shack(it, true),
    oldtown(it) {
      // Old Town: brick blocks from before the deck, their ground floors lit.
      const o = it.obb;
      B.painted.push(tint(obbBox(o, it.h, it.y), ['#6a3a2e', '#5a4034', '#72483a', '#4e3a34'][it.cycle % 4]));
      B.dark.push(obbBox({ ...o, hw: o.hw + 0.3, hd: o.hd + 0.3 }, 0.5, it.y + it.h - 0.1));
      for (let y = it.y + 4; y < it.y + it.h - 2; y += 3.6) B.dark.push(obbBox({ ...o, hw: o.hw + 0.05, hd: o.hd + 0.05 }, 0.25, y));
      const [fx, fz] = it.front || [0, 1];
      const fd = frontDepth(o, fx, fz);
      B.window.push(box(Math.min(o.hw, o.hd) * 1.4, 1.6, 0.1, o.x + fx * (fd + 0.05), it.y + 1.6, o.z + fz * (fd + 0.05), yawOf(fx, fz)));
      if (it.cycle % 3 === 0) N[it.cycle % N.length].push(box(4, 0.8, 0.15, o.x + fx * (fd + 0.2), it.y + 4.4, o.z + fz * (fd + 0.2), yawOf(fx, fz)));
    },
    salvage(it) {
      // Low Road Salvage: a corrugated shed, its roller door lit, its name over it.
      const o = it.obb;
      B.corrugated.push(tint(obbBox(o, it.h, it.y), '#5a5e62'));
      B.dark.push(obbBox({ ...o, hw: o.hw + 0.4, hd: o.hd + 0.4 }, 0.4, it.y + it.h));
      const [fx, fz] = it.front;
      const fd = frontDepth(o, fx, fz);
      B.steel.push(box(8, 5, 0.2, o.x + fx * (fd + 0.1), it.y + 2.5, o.z + fz * (fd + 0.1), yawOf(fx, fz)));
      B.lamp.push(box(9, 0.3, 0.3, o.x + fx * (fd + 0.4), it.y + 5.4, o.z + fz * (fd + 0.4), yawOf(fx, fz)));
      text(it.name || 'SALVAGE', look.neon[0], o.x + fx * (fd + 0.3), it.y + 5.8, o.z + fz * (fd + 0.3), fx, fz, 16);
    },
  };

  const drawers = {
    bldg(it) {
      const d = buildings[it.kind];
      if (!d) return false;
      d(it);
    },
    pillar(it) {
      const o = it.obb;
      B.concreteItem.push(obbBox(o, it.h, it.y));
      // Hazard paint round its foot; a capital under the deck.
      B.hazard.push(obbBox({ ...o, hw: o.hw + 0.03, hd: o.hd + 0.03 }, 0.6, at(o.x, o.z) + 0.3));
      B.concreteItem.push(obbBox({ ...o, hw: o.hw + 0.8, hd: o.hd + 0.8 }, 1.2, it.y + it.h - 1.2));
      if (it.hall && it.cycle % 2) N[(Math.round(o.x + o.z) >>> 0) % N.length].push(obbBox({ ...o, hw: o.hw + 0.05, hd: 0.3 }, 3, at(o.x, o.z) + 2));
    },
    cabin(it) {
      // A container cabin (Pillar Hall): a dark roof, three lit windows a side.
      const o = it.obb;
      const y = at(o.x, o.z);
      B.painted.push(tint(obbBox(o, it.h, y), '#6a7a6a'));
      B.dark.push(obbBox({ ...o, hw: o.hw + 0.1, hd: o.hd + 0.1 }, 0.2, y + it.h));
      const dx = Math.sin(o.yaw);
      const dz = Math.cos(o.yaw);
      for (const f of [-0.5, 0, 0.5]) B.lamp.push(obbBox({ x: o.x + dx * f * o.hd * 2, z: o.z + dz * f * o.hd * 2, hw: o.hw + 0.02, hd: 0.6, yaw: o.yaw }, 0.8, y + it.h * 0.6 - 0.4));
    },
    generator(it) {
      const o = it.obb;
      const y = at(o.x, o.z);
      B.painted.push(tint(obbBox({ ...o, hw: o.hw - 0.3, hd: o.hd - 0.5 }, 1.4, y), '#8a8a3a'));
      B.dark.push(box(0.2, 1.2, 0.2, o.x, y + 2, o.z));
      B.lamp.push(box(0.4, 0.4, 0.4, o.x, y + 1.6, o.z));
    },
    cage(it) {
      // A steel cage: a floor plate, a post at each corner, bars all round,
      // rails at the middle and the top, a roof; what's kept in it inside.
      const o = it.obb;
      const y = at(o.x, o.z);
      B.dark.push(obbBox({ ...o, hw: o.hw - 0.4, hd: o.hd - 0.4 }, 1.2, y));
      B.steel.push(obbBox({ ...o, hw: o.hw - 0.05, hd: o.hd - 0.05 }, 0.06, y));
      const c = G.obbCorners({ ...o, hw: o.hw - 0.1, hd: o.hd - 0.1 });
      for (const [cx, cz] of c) B.steel.push(box(0.12, 1.85, 0.12, cx, y + 0.92, cz));
      c.forEach(([ax, az], k) => {
        const [bx, bz] = c[(k + 1) % 4];
        const L = Math.hypot(bx - ax, bz - az);
        const yaw = Math.atan2(bx - ax, bz - az);
        for (const h of [0.95, 1.75]) B.steel.push(box(0.06, 0.06, L, (ax + bx) / 2, y + h, (az + bz) / 2, yaw));
        const n = Math.max(2, Math.round(L / 0.35));
        for (let q = 1; q < n; q++) B.steel.push(box(0.035, 1.7, 0.035, ax + ((bx - ax) * q) / n, y + 0.9, az + ((bz - az) * q) / n));
      });
      B.steel.push(obbBox({ ...o, hw: o.hw - 0.1, hd: o.hd - 0.1 }, 0.05, y + 1.8));
    },
    marketGate(it) {
      // The Black Market's gate: two posts off Lip Road, a sign across.
      const lane = map.streets.find((q) => q.name === U.market.lane);
      const span = 2 * (lane.half + 1.5);
      const nx = -it.dz;
      const nz = it.dx;
      for (const s of [-1, 1]) B.steel.push(box(0.6, 7, 0.6, it.x + nx * s * span / 2, it.y + 3.5, it.z + nz * s * span / 2));
      B.dark.push(box(span + 1, 1.6, 0.6, it.x, it.y + 7.2, it.z, yawOf(nx, nz) + Math.PI / 2));
      text('BLACK MARKET', look.neon[0], it.x - it.dx * 0.4, it.y + 6.6, it.z - it.dz * 0.4, -it.dx, -it.dz, span - 1);
    },
    scrapStack(it) {
      // Crushed cars, stacked.
      const o = it.obb;
      let y = at(o.x, o.z);
      const n = Math.max(2, Math.round(it.h / 1.1));
      for (let q = 0; q < n; q++) {
        const k = it.cycle * 5 + q;
        B.painted.push(tint(obbBox({ ...o, yaw: o.yaw + ((k % 5) - 2) * 0.05, hw: o.hw - (k % 2) * 0.2, hd: o.hd - (k % 3) * 0.2 }, 1, y), CARS[k % CARS.length]));
        y += 1.05;
      }
    },
    scrapCrane(it) {
      const o = it.obb;
      const y = at(o.x, o.z);
      B.painted.push(tint(obbBox(o, 2.2, y), '#c89020'));
      B.painted.push(tint(obbBox({ ...o, hw: 1.2, hd: 1.4, x: o.x, z: o.z - 1 }, 2.2, y + 2.2), '#d8a020'));
      B.window.push(obbBox({ ...o, hw: 1.22, hd: 0.8, x: o.x, z: o.z - 1.4 }, 0.8, y + 3.2));
    },
    craneBoom(it) {
      // The boom, out over the stacks, the magnet on its cable.
      const a = 0.6;
      const tipX = it.x + Math.sin(a) * it.len;
      const tipZ = it.z + Math.cos(a) * it.len;
      const rise = 10;
      const L = Math.hypot(it.len, rise);
      const g = box(0.8, 0.8, L, 0, 0, 0);
      g.rotateX(-Math.atan2(rise, it.len));
      g.rotateY(a);
      g.translate((it.x + tipX) / 2, it.y + rise / 2, (it.z + tipZ) / 2);
      B.hazard.push(g);
      B.dark.push(box(0.08, 8, 0.08, tipX, it.y + rise - 4, tipZ));
      B.steel.push(new THREE.CylinderGeometry(1.4, 1.4, 0.5, 16).translate(tipX, it.y + rise - 8.2, tipZ));
    },
    tank(it) {
      const r = it.rad;
      B.rust.push(new THREE.CylinderGeometry(r, r, it.h, 20).translate(it.x, it.y + it.h / 2, it.z));
      B.dark.push(new THREE.CylinderGeometry(r * 0.96, r, 0.6, 20).translate(it.x, it.y + it.h + 0.3, it.z));
      B.steel.push(new THREE.CylinderGeometry(r + 0.08, r + 0.08, 0.3, 20).translate(it.x, it.y + it.h * 0.6, it.z));
      // A ladder up its side.
      B.steel.push(box(0.6, it.h, 0.1, it.x + r + 0.1, it.y + it.h / 2, it.z));
    },
    rackLeg(it) {
      B.steel.push(obbBox(it.obb, it.h, it.y));
    },
    pipes(it) {
      const L = G.len2(it.a, it.b);
      const yaw = Math.atan2(it.b[0] - it.a[0], it.b[1] - it.a[1]);
      for (const [off, r] of [[-0.4, 0.3], [0.4, 0.22]]) {
        const g = new THREE.CylinderGeometry(r, r, L, 8);
        g.rotateX(Math.PI / 2);
        g.rotateY(yaw);
        g.translate((it.a[0] + it.b[0]) / 2 + Math.cos(yaw) * off, it.y + 0.3, (it.a[1] + it.b[1]) / 2 - Math.sin(yaw) * off);
        B.rust.push(g);
      }
    },
    sunkBus(it) {
      // Half-sunk in the Sump's floor, nose down.
      const o = it.obb;
      const c = new THREE.BoxGeometry(o.hw * 2, 3.2, o.hd * 2);
      c.translate(0, 1.6, 0);
      c.rotateX(0.08);
      c.rotateY(o.yaw);
      c.translate(o.x, it.y, o.z);
      B.painted.push(tint(c, '#b89028'));
      const w = new THREE.BoxGeometry(o.hw * 2 + 0.05, 0.9, o.hd * 2 - 1.5);
      w.translate(0, 2.2, 0);
      w.rotateX(0.08);
      w.rotateY(o.yaw);
      w.translate(o.x, it.y, o.z);
      B.dark.push(w);
    },
    inlet(it) {
      // The inlet pipe, out of the pit's wall toward its middle.
      const L = Math.hypot(...it.toward) || 1;
      const yaw = Math.atan2(it.toward[0], it.toward[1]);
      const g = new THREE.CylinderGeometry(2.2, 2.2, 6, 16, 1, true);
      g.rotateX(Math.PI / 2);
      g.rotateY(yaw);
      g.translate(it.x, it.y, it.z);
      B.concreteItem.push(g);
      B.dark.push(new THREE.CylinderGeometry(2, 2, 0.2, 16).rotateX(Math.PI / 2).rotateY(yaw).translate(it.x - (it.toward[0] / L) * 1, it.y, it.z - (it.toward[1] / L) * 1));
      // Its collar at the mouth, two flanges along it, and bars across the mouth.
      const [ux, uz] = [it.toward[0] / L, it.toward[1] / L];
      const ring = (r0, r1, d, f) => B.concreteItem.push(tireGeometry(r0, r1, d, 16).rotateX(Math.PI / 2).rotateY(yaw).translate(it.x + ux * f, it.y, it.z + uz * f));
      ring(2.75, 2.15, 0.7, 2.75);
      ring(2.34, 2.18, 0.2, -1);
      ring(2.34, 2.18, 0.2, 1.2);
      for (let t = -1.8; t <= 1.81; t += 0.45) B.steel.push(box(0.1, 2 * Math.sqrt(Math.max(0, 2.2 * 2.2 - t * t)), 0.1, it.x + ux * 2.9 - uz * t, it.y, it.z + uz * 2.9 + ux * t));
      B.steel.push(box(0.1, 0.1, 4.3, it.x + ux * 2.9, it.y, it.z + uz * 2.9, yaw + Math.PI / 2));
      // The gush when the flood comes: a fall of water from its mouth to the floor.
      const tx = it.x + (it.toward[0] / L) * 3;
      const tz = it.z + (it.toward[1] / L) * 3;
      const fall = it.y + pit.depth;
      const w = new THREE.PlaneGeometry(4, fall);
      w.rotateY(yaw + Math.PI / 2);
      w.translate(tx + (it.toward[0] / L) * 2, it.y - fall / 2, tz + (it.toward[1] / L) * 2);
      gushes.push(w);
    },
    grate(it) {
      B.dark.push(box(2.4, 0.06, 2.4, it.x, it.y + 0.03, it.z));
      for (let q = -1; q <= 1; q += 0.4) B.steel.push(box(0.1, 0.08, 2.4, it.x + q, it.y + 0.05, it.z));
    },
    culvert(it) {
      B.concreteItem.push(obbBox(it.obb, it.h, it.y));
    },
    culvertMouth(it) {
      // The Culvert's mouth: black, a box tunnel on under the city; a concrete
      // headwall round it (hazard stripes on its face), wing walls, an apron,
      // and a rack of bars across its foot.
      // (Its dark a solid panel: seen from behind as well.)
      B.dark.push(box(0.2, it.h, it.w, it.x, it.y + it.h / 2, it.z));
      for (const s of [-1, 1]) {
        B.concreteItem.push(box(1, it.h + 1.4, 1, it.x - 0.5, it.y + (it.h + 1.4) / 2, it.z + s * (it.w / 2 + 0.5)));
        B.concreteItem.push(box(0.7, it.h * 0.6, 4, it.x - 2.1, it.y + it.h * 0.3, it.z + s * (it.w / 2 + 1.7), s * 0.5));
      }
      B.concreteItem.push(box(1, 1.4, it.w + 2, it.x - 0.5, it.y + it.h + 0.7, it.z));
      B.hazard.push(box(0.05, 0.4, it.w + 2, it.x - 1.03, it.y + it.h + 0.7, it.z));
      B.concreteItem.push(box(3, 0.2, it.w + 2, it.x - 1.5, it.y - 0.1, it.z));
      for (let t = -it.w / 2 + 0.4; t <= it.w / 2 - 0.4; t += 0.7) B.steel.push(box(0.1, it.h * 0.5, 0.1, it.x - 0.35, it.y + it.h * 0.25, it.z + t));
      B.steel.push(box(0.1, 0.12, it.w, it.x - 0.35, it.y + it.h * 0.5, it.z));
    },
    outfall(it) {
      // The Outfall's gates: a steel frame, bars, and a gap for the road.
      const o = it.obb;
      B.concreteItem.push(obbBox({ ...o, hd: 0.8 }, 1, it.y + it.h - 1));
      for (let t = -o.hw + 0.5; t <= o.hw - 0.5; t += 1.2) {
        B.steel.push(box(0.15, it.h - 1, 0.15, o.x + Math.cos(o.yaw) * t, it.y + (it.h - 1) / 2, o.z - Math.sin(o.yaw) * t));
      }
    },
    fence(it) {
      const o = it.obb;
      const y = at(o.x, o.z);
      B.dark.push(obbBox({ ...o, hw: 0.04 }, it.h, y));
      for (let t = -o.hd; t <= o.hd; t += 3) B.steel.push(box(0.12, it.h + 0.2, 0.12, o.x + Math.sin(o.yaw) * t, y + it.h / 2, o.z + Math.cos(o.yaw) * t));
    },
    siren(it) {
      // A post on the drain's wall: a base plate, a junction box, the siren
      // box with its louvres, a horn either side, and a strobe under a hood.
      B.steel.push(box(0.6, 0.08, 0.6, it.x, it.y + 0.04, it.z));
      B.steel.push(new THREE.CylinderGeometry(0.11, 0.13, 4, 8).translate(it.x, it.y + 2, it.z));
      B.dark.push(box(0.35, 0.5, 0.25, it.x, it.y + 1.4, it.z + 0.18));
      B.dark.push(box(0.9, 0.7, 0.9, it.x, it.y + 4.2, it.z));
      for (let k = 0; k < 3; k++) B.steel.push(box(0.93, 0.04, 0.93, it.x, it.y + 3.98 + k * 0.22, it.z));
      for (const s of [-1, 1]) B.dark.push(new THREE.CylinderGeometry(0.34, 0.1, 0.6, 10).rotateZ(-s * (Math.PI / 2)).translate(it.x + s * 0.75, it.y + 4.2, it.z));
      sirens.push(box(0.5, 0.5, 0.5, it.x, it.y + 4.8, it.z));
      B.dark.push(box(0.5, 0.06, 0.45, it.x, it.y + 3.7, it.z - it.side * 0.35));
      strobes.push(box(0.3, 0.3, 0.3, it.x, it.y + 3.5, it.z - it.side * 0.3));
    },
    portal(it) {
      // A concrete frame where the Low Road goes under.
      const nx = -it.dz;
      const nz = it.dx;
      for (const s of [-1, 1]) B.concreteItem.push(box(1, it.h, 1.2, it.x + nx * s * (it.half + 0.5), it.y + it.h / 2, it.z + nz * s * (it.half + 0.5), yawOf(it.dx, it.dz)));
      B.concreteItem.push(box(it.half * 2 + 2, 1.4, 1.2, it.x, it.y + it.h + 0.7, it.z, yawOf(it.dx, it.dz)));
      B.hazard.push(box(it.half * 2 + 2.02, 0.35, 1.22, it.x, it.y + it.h - 0.1, it.z, yawOf(it.dx, it.dz)));
    },
    tunnel(it) {
      // Under the ground: a roof, and strip lights along it.
      for (let k = 0; k + 1 < it.pts.length; k++) {
        const [ax, az] = it.pts[k];
        const [bx, bz] = it.pts[k + 1];
        const mx = (ax + bx) / 2;
        const mz = (az + bz) / 2;
        if (map.tunnelAt(mx, mz) === null) continue;
        const L = Math.hypot(bx - ax, bz - az);
        const y = (it.heights[k] + it.heights[k + 1]) / 2 + it.ceiling;
        const g = box(it.half * 2 + 1.6, 0.5, L + 0.3, 0, 0, 0);
        g.rotateX(-Math.atan2(it.heights[k + 1] - it.heights[k], L));
        g.rotateY(Math.atan2(bx - ax, bz - az));
        g.translate(mx, y + 0.25, mz);
        B.concreteItem.push(g);
        const lamp = box(0.5, 0.1, L * 0.7, 0, 0, 0);
        lamp.rotateX(-Math.atan2(it.heights[k + 1] - it.heights[k], L));
        lamp.rotateY(Math.atan2(bx - ax, bz - az));
        lamp.translate(mx, y - 0.05, mz);
        B.lamp.push(lamp);
      }
    },
    tunnelWall(it) {
      B.concreteItem.push(obbBox(it.obb, it.h + 0.3, it.y));
    },
    seaWall(it) {
      B.concreteItem.push(obbBox(it.obb, it.h + 0.4, at(it.x, it.z) - 0.4));
    },
    water(it) {
      // The river or the bay, out from the shore.
      const line = it.line;
      const far = 2600;
      const [a, b] = [line[0], line[line.length - 1]];
      const mz = (a[1] + b[1]) / 2;
      const out = G.polyCentroid(P.boundary)[1] > mz ? -far : far;
      const lo = a[0] < b[0] ? line : [...line].reverse();
      const poly = [[-far, lo[0][1]], ...lo, [far, lo[lo.length - 1][1]], [far, out], [-far, out]];
      B.water.push(flatPoly(poly, () => -1.2));
    },
    washing(it) {
      const L = Math.hypot(it.b[0] - it.a[0], it.b[2] - it.a[2]);
      if (L < 1 || L > 30) return;
      const yaw = Math.atan2(it.b[0] - it.a[0], it.b[2] - it.a[2]);
      for (let q = 1; q < L; q += 1.4) {
        const u = q / L;
        const x = it.a[0] + (it.b[0] - it.a[0]) * u;
        const z = it.a[2] + (it.b[2] - it.a[2]) * u;
        const y = it.a[1] + (it.b[1] - it.a[1]) * u - Math.sin(u * Math.PI) * 0.6;
        B.painted.push(tint(box(0.9, 0.8, 0.04, x, y - 0.45, z, yaw + Math.PI / 2), SHACK[Math.floor(q) % SHACK.length]));
      }
      // (A copy: a pole at each end of its line.)
      if (it.copy) {
        for (const p of [it.a, it.b]) {
          const g = at(p[0], p[2]);
          B.dark.push(box(0.12, p[1] + 0.2 - g, 0.12, p[0], (p[1] + 0.2 + g) / 2, p[2]));
        }
      }
    },
    deck(it) {
      deckSlab(it);
    },
  };

  // The deck: a slab 25 m up over everything north of its edge, open at the
  // light wells; sodium lamps under it, their pools on the ground below.
  function deckSlab(it) {
    const bnd = G.polyBounds(P.boundary);
    const e = it.edge;
    const x0 = bnd.minX - 60;
    const x1 = bnd.maxX + 60;
    const edge = [[x0, e[0][1]], ...e, [x1, e[e.length - 1][1]]];
    const top = bnd.minZ - 4;
    const shape = new THREE.Shape([...edge.map(([x, z]) => new THREE.Vector2(x, z)), new THREE.Vector2(x1, top), new THREE.Vector2(x0, top)]);
    for (const [wx, wz] of it.wells) {
      const w = 7;
      shape.holes.push(new THREE.Path([new THREE.Vector2(wx - w, wz - w), new THREE.Vector2(wx - w, wz + w), new THREE.Vector2(wx + w, wz + w), new THREE.Vector2(wx + w, wz - w)]));
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
    g.translate(0, it.height + 1.6, 0);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / 12, uv.getY(k) / 12);
    B.deck.push(g);
    // Beams under it, east-west.
    for (let z = Math.ceil(top / 45) * 45; z < Math.max(...e.map((p) => p[1])); z += 45) {
      const xs = [];
      for (let x = x0; x <= x1; x += 15) if (z < map.deckEdgeZ(x) - 2) xs.push(x);
      if (xs.length > 1) B.concreteItem.push(box(xs[xs.length - 1] - xs[0], 1.4, 1.6, (xs[0] + xs[xs.length - 1]) / 2, it.height - 0.7, z));
    }
    // Lamps and their pools.
    for (let x = Math.ceil(bnd.minX / 36) * 36 + 18; x < bnd.maxX; x += 36) {
      for (let z = Math.ceil(bnd.minZ / 36) * 36 + 18; z < bnd.maxZ; z += 36) {
        if (!map.underDeck(x, z) || z > map.deckEdgeZ(x) - 4 || !G.pointInPoly(x, z, P.boundary)) continue;
        if (it.wells.some(([wx, wz]) => Math.abs(wx - x) < 10 && Math.abs(wz - z) < 10)) continue;
        B.lamp.push(box(1.8, 0.3, 0.8, x, it.height - 0.2, z));
        const y = H(x, z);
        if ([[-6, -6], [6, -6], [6, 6], [-6, 6]].every(([dx, dz]) => Math.abs(H(x + dx, z + dz) - y) < 0.05)) B.pool.push(new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2).translate(x, y + 0.05, z));
      }
    }
    // The light wells: daylight (or moonlight) falling through.
    for (const [wx, wz] of it.wells) {
      const y = H(wx, wz);
      B.shaft.push(new THREE.CylinderGeometry(6, 7.5, it.height - y, 4, 1, true).rotateY(Math.PI / 4).translate(wx, (it.height + y) / 2, wz));
    }
  }

  function finish() {
    for (const [k, list] of Object.entries(B)) {
      if (!list.length) continue;
      const m = new THREE.Mesh(merged(list), mats[k === 'deck' ? 'deck' : k]);
      if (k === 'pool' || k === 'shaft') m.renderOrder = 1;
      add(m);
    }
    N.forEach((list, k) => list.length && add(new THREE.Mesh(merged(list), neon[k])));
    const sirenMesh = sirens.length ? new THREE.Mesh(merged(sirens), mats.siren) : null;
    const strobeMesh = strobes.length ? new THREE.Mesh(merged(strobes), mats.strobe) : null;
    const gushMesh = gushes.length ? new THREE.Mesh(merged(gushes), mats.gush) : null;
    for (const m of [sirenMesh, strobeMesh, gushMesh]) {
      if (!m) continue;
      m.visible = false;
      add(m);
    }
    // The surge down the drain, and the Sump's wet floor (not for its objects placed elsewhere).
    if (guest) return { animate() {} };
    const surge = new THREE.Mesh(new THREE.PlaneGeometry(1, drain.bed + 3).rotateX(-Math.PI / 2), mats.flood);
    surge.visible = false;
    add(surge);
    const foam = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, drain.bed + 3), additiveMaterial({ map: tex.glow, color: '#e0f0e8', opacity: 0.7 }));
    foam.visible = false;
    add(foam);
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(pit.floor + 4, 48).rotateX(-Math.PI / 2).translate(pit.c[0], -pit.depth + 0.12, pit.c[1]), mats.flood);
    puddle.visible = false;
    add(puddle);
    return {
      animate(t, real) {
        const f = map.flood;
        const a = f ? floodAt(f, Math.round(t / SIM_DT)) : null;
        const alarm = !!a && (a.warn || a.level > 0);
        if (sirenMesh) sirenMesh.visible = alarm && Math.floor(real * 3) % 2 === 0;
        if (strobeMesh) strobeMesh.visible = alarm && Math.floor(real * 8) % 3 === 0;
        const running = !!a && a.level > 0;
        surge.visible = running;
        foam.visible = running && a.front > drain.x0 + 1;
        if (running) {
          const len = drain.x1 - a.front;
          surge.scale.x = Math.max(0.1, len);
          surge.position.set((a.front + drain.x1) / 2, -drain.depth + 1.6 * a.level, drain.z);
          foam.position.set(a.front, -drain.depth + 0.7 * a.level, drain.z);
        }
        puddle.visible = !!a?.sumpWet;
        if (gushMesh) {
          gushMesh.visible = !!a?.sumpWet;
          gushMesh.material.opacity = 0.35 + Math.sin(real * 9) * 0.1;
        }
      },
    };
  }

  // What the drawers add to (for drawing edited items, render/itemCapture.js).
  const buckets = [B, ...N, sirens, strobes, gushes];
  return { ground, drawers, finish, buckets };
}
