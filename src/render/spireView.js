import * as THREE from 'three';
import { litMaterial, standardMaterial, glowMaterial, additiveMaterial } from './retroMaterial.js';
import { box, obbBox, flatPoly, scaleUv, indexed, tint } from './shapes.js';
import * as G from '../sim/geom2d.js';

// The Corporate Spire's own kit (used by planView): its ground draped over the
// gentle rise to the Spire (sidewalk, lots, Central Park's lawns, the
// Forecourt and the gate plazas' paving), Spire Plaza up on its plinth with its
// ramps, the Spire itself (420 m, stepped, gold-banded, its crowned beacon),
// the stone towers with arcaded ground floors, the banks' colonnades, the
// Exchange and Motorworks, Central Park (the lake, big trees, the bandstand,
// stone gates), the triumphal arches, and trees along the avenues and down
// their medians.

const DS = THREE.DoubleSide;
const CELL = 16;
const [U, V] = [48, 96]; // metres of facade per texture repeat

// Pale stone facades: a 3 m by 4 m grid of windows, about a third of them lit
// warm gold (a fixed pattern). Map and glow map, one repeat each.
function stoneFacade() {
  const cols = 16;
  const rows = 24;
  const [cw, rh] = [8, 10];
  const make = (glow) => {
    const c = document.createElement('canvas');
    c.width = cols * cw;
    c.height = rows * rh;
    const g = c.getContext('2d');
    g.fillStyle = glow ? '#000000' : '#d8d0c0';
    g.fillRect(0, 0, c.width, c.height);
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        const lit = (r * 7 + q * 13 + ((r * q) % 5)) % 3 === 0;
        g.fillStyle = glow ? (lit ? '#ffd890' : '#000000') : lit ? '#f0d8a0' : '#4a4c58';
        g.fillRect(q * cw + 2, r * rh + 2, cw - 3, rh - 4);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: make(false), glow: make(true) };
}

export function spireView({ map, tex, H, group, items, text, clipToConvex, merged }) {
  const P = map.style.plan;
  const look = map.style.look;
  const add = (m) => m && group.add(m);
  const base = map.terrain.baseAt || H;
  const draw = map.terrain.drawAt || H;
  const stone = stoneFacade();

  const mats = {
    walk: litMaterial({ map: tex.sidewalk, color: look.walk, side: DS }),
    lot: litMaterial({ map: tex.lot, color: look.lot, side: DS, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    grass: litMaterial({ map: tex.grass || tex.dirt, color: '#5a9a58', side: DS, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    tiles: litMaterial({ map: tex.tiles, color: '#e8e0d0', side: DS, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    plaza: litMaterial({ map: tex.tiles, color: '#f0e8d8', side: DS }),
    building: litMaterial({ map: stone.map, emissiveMap: stone.glow, emissive: 0xffffff, emissiveIntensity: 1, color: '#ffffff' }),
    glass: standardMaterial({ map: tex.glass, emissiveMap: tex.glassGlow, emissive: 0xffffff, emissiveIntensity: 0.9, color: '#e0c890', metalness: 0.6, roughness: 0.25, envMap: tex.env }),
    stone: litMaterial({ map: tex.sidewalk, color: '#f4ecdc' }),
    dark: litMaterial({ color: '#221e1a' }),
    gold: glowMaterial({ color: '#ffc850', intensity: 2.2 }),
    goldLit: litMaterial({ color: '#c8a040' }),
    lamp: glowMaterial({ color: look.lamp, intensity: 3 }),
    white: glowMaterial({ color: '#fff4dc', intensity: 2 }),
    painted: litMaterial({ vertexColors: true }),
    plant: litMaterial({ color: '#2e6a3a' }),
    trunk: litMaterial({ color: '#4a3626' }),
    water: standardMaterial({ color: '#16302e', roughness: 0.2, metalness: 0.5, envMap: tex.env, envMapIntensity: 0.6 }),
    beacon: glowMaterial({ color: '#fff0c0', intensity: 5 }),
    flood: additiveMaterial({ map: tex.glow, color: '#ffe0a0', opacity: 0.22 }),
  };
  const B = { building: [], glass: [], stone: [], dark: [], gold: [], goldLit: [], lamp: [], white: [], painted: [], plant: [], trunk: [], water: [], plaza: [], flood: [] };
  const beacons = [];

  // A polygon's ground, draped over the terrain in pieces a cell or less across.
  function drape(poly, dy, list, at = base) {
    const b = G.polyBounds(poly);
    for (let x = Math.floor(b.minX / CELL) * CELL; x < b.maxX; x += CELL) {
      for (let z = Math.floor(b.minZ / CELL) * CELL; z < b.maxZ; z += CELL) {
        const piece = clipToConvex(poly, [[x, z], [x + CELL, z], [x + CELL, z + CELL], [x, z + CELL]]);
        if (piece.length > 2 && Math.abs(G.polyArea(piece)) > 0.01) list.push(flatPoly(piece, (px, pz) => at(px, pz) + dy));
      }
    }
  }

  // --- The ground ---
  function ground() {
    const L = { walk: [], lot: [], grass: [], tiles: [] };
    drape(P.boundary, -0.16, L.walk);
    for (const b of map.blocks) drape(b.lot, -0.12, L.lot);
    for (const s of map.sites) {
      if (s.kind === 'park' || s.kind === 'arena') {
        for (const b of map.blocks) {
          const piece = clipToConvex(b.lot, s.poly);
          if (piece.length > 2 && Math.abs(G.polyArea(piece)) > 1) drape(piece, -0.08, s.kind === 'park' ? L.grass : L.tiles);
        }
      }
    }
    for (const it of items) if (it.t === 'gatePlaza') drape(it.poly, -0.07, L.tiles);
    for (const [k, list] of Object.entries(L)) if (list.length) add(new THREE.Mesh(merged(list), mats[k]));
    tex.ground.repeat.set(500, 500);
    add(new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2).translate(0, -0.6, 0), new THREE.MeshLambertMaterial({ map: tex.ground })));
  }

  // World-size UVs on a box (faces +x, -x, +y, -y, +z, -z), so windows stay one size.
  function boxUvs(g, sx, sy, sz, seed) {
    const uv = g.attributes.uv;
    const ou = (Math.floor(seed * 16) % 16) / 16;
    const faceSize = [[sz, sy], [sz, sy], null, null, [sx, sy], [sx, sy]];
    for (let face = 0; face < 6; face++) {
      for (let k = face * 4; k < face * 4 + 4; k++) {
        const size = faceSize[face];
        if (!size) uv.setXY(k, 0.005, 0.995);
        else uv.setXY(k, ou + (uv.getX(k) * size[0]) / U, (uv.getY(k) * size[1]) / V);
      }
    }
    return g;
  }
  const facade = (it, list, o = it.obb, y = it.y, h = it.h) => list.push(boxUvs(obbBox(o, h, y), o.hw * 2, h, o.hd * 2, (it.cycle || 0) * 0.37));
  const bands = (o, y0, y1, step, list = B.gold) => {
    for (let y = y0; y < y1 - 2; y += step) list.push(obbBox({ ...o, hw: o.hw + 0.15, hd: o.hd + 0.15 }, 0.4, y));
  };
  // The front of a building: its middle at ground level, and the directions out of it and along it.
  const frontOf = (it) => {
    const o = it.obb;
    const [fx, fz] = it.front || [Math.sin(o.yaw + Math.PI), Math.cos(o.yaw + Math.PI)];
    const deep = Math.abs(fx * Math.sin(o.yaw) + fz * Math.cos(o.yaw)) > 0.7;
    const d = deep ? o.hd : o.hw;
    const w = deep ? o.hw : o.hd;
    return { x: o.x + fx * d, z: o.z + fz * d, fx, fz, ax: fz, az: -fx, w: w * 2, y: H(o.x, o.z) };
  };
  // An arcade along a building's front: its ground floor set back behind columns.
  const arcade = (it, f, h = 7, pitch = 5) => {
    B.dark.push(box(f.w - 1, h, 2.2, f.x - f.fx * 1.2, f.y + h / 2, f.z - f.fz * 1.2, Math.atan2(f.fx, f.fz)));
    for (let a = -f.w / 2 + pitch / 2; a < f.w / 2; a += pitch) B.stone.push(box(1, h, 1, f.x + f.ax * a + f.fx * 0.4, f.y + h / 2, f.z + f.az * a + f.fz * 0.4));
    B.lamp.push(box(f.w - 2, 0.2, 0.3, f.x - f.fx * 0.2, f.y + h - 0.4, f.z - f.fz * 0.2, Math.atan2(f.fx, f.fz)));
  };
  // Columns across a front (a bank, the Exchange), a cornice over them.
  // (off: how far out from the wall the columns stand.)
  const colonnade = (f, h, pitch, r = 0.8, off = 2.5) => {
    for (let a = -f.w / 2 + pitch / 2; a < f.w / 2; a += pitch) B.stone.push(new THREE.CylinderGeometry(r, r * 1.1, h, 10).translate(f.x + f.ax * a + f.fx * off, f.y + h / 2, f.z + f.az * a + f.fz * off));
    B.stone.push(box(f.w, 1.6, 2 * off, f.x + f.fx * off, f.y + h + 0.8, f.z + f.fz * off, Math.atan2(f.fx, f.fz)));
    B.gold.push(box(f.w + 0.2, 0.3, 2 * off + 0.2, f.x + f.fx * off, f.y + h + 1.7, f.z + f.fz * off, Math.atan2(f.fx, f.fz)));
  };

  const buildings = {
    // Pale stone monoliths, gold bands every storey block, lit crowns.
    monolith(it) {
      facade(it, B.building);
      bands(it.obb, it.y + 24, it.y + it.h, 30);
      const top = it.y + it.h;
      B.stone.push(obbBox({ ...it.obb, hw: it.obb.hw * 0.7, hd: it.obb.hd * 0.7 }, 8, top));
      B.gold.push(obbBox({ ...it.obb, hw: it.obb.hw * 0.72, hd: it.obb.hd * 0.72 }, 0.6, top + 8));
      arcade(it, frontOf(it), 8);
    },
    office(it) {
      if (it.cycle % 3 === 0) facade(it, B.glass);
      else facade(it, B.building);
      bands(it.obb, it.y + 18, it.y + it.h, it.cycle % 3 === 0 ? 12 : 24);
      B.dark.push(obbBox({ ...it.obb, hw: it.obb.hw + 0.3, hd: it.obb.hd + 0.3 }, 0.5, it.y + it.h));
      arcade(it, frontOf(it));
    },
    bank(it) {
      facade(it, B.building);
      const f = frontOf(it);
      colonnade(f, 12, 4.5);
      bands(it.obb, it.y + 16, it.y + it.h, 16);
      B.stone.push(obbBox({ ...it.obb, hw: it.obb.hw + 0.4, hd: it.obb.hd + 0.4 }, 1.2, it.y + it.h));
    },
    // (The city beyond the edge: the same towers.)
    filler(it) {
      buildings.office(it);
    },
    motorworks(it) {
      // A glass showroom with gold trim and Syncorp's name over it.
      facade(it, B.glass);
      const f = frontOf(it);
      B.gold.push(box(f.w + 0.4, 0.5, 0.4, f.x + f.fx * 0.2, f.y + it.h - 0.4, f.z + f.fz * 0.2, Math.atan2(f.fx, f.fz)));
      B.white.push(box(f.w - 4, 3, 0.2, f.x + f.fx * 0.15, f.y + 2.5, f.z + f.fz * 0.15, Math.atan2(f.fx, f.fz)));
      text(it.name, '#ffc850', f.x, f.y + it.h + 0.4, f.z, f.fx, f.fz, Math.min(f.w - 4, 40));
    },
    exchange(it) {
      // The Syncorp Exchange: stone, a colonnade across its front, its name on the frieze.
      facade(it, B.building);
      const f = frontOf(it);
      // (Its columns against its front: the colonnade you drive onto is the arena's deck.)
      colonnade(f, it.h - 6, 6, 1.1, 1.3);
      text(it.name, '#ffc850', f.x + f.fx * 2.7, f.y + it.h - 5.8, f.z + f.fz * 5.1, f.fx, f.fz, Math.min(f.w - 20, 80));
    },
  };

  const drawers = {
    bldg(it) {
      const d = buildings[it.kind];
      if (!d) return false;
      d(it);
    },
    spire(it) {
      // Stepped octagonal tiers, gold bands at every step, the crown and its beacon.
      const tiers = [[0, 0.3, 1], [0.3, 0.55, 0.84], [0.55, 0.76, 0.68], [0.76, 0.9, 0.52], [0.9, 0.975, 0.36]];
      const R = it.apothem / Math.cos(Math.PI / 8);
      for (const [a, b, s] of tiers) {
        const h = (b - a) * it.h;
        const g = new THREE.CylinderGeometry(R * s, R * s, h, 8, 1, false, Math.PI / 8).translate(it.x, it.y + a * it.h + h / 2, it.z);
        B.building.push(scaleUv(g, (8 * 2 * R * s * Math.tan(Math.PI / 8)) / U, h / V));
        B.gold.push(new THREE.CylinderGeometry(R * s + 0.3, R * s + 0.3, 1.2, 8, 1, false, Math.PI / 8).translate(it.x, it.y + b * it.h - 0.6, it.z));
      }
      const top = it.y + it.h * 0.975;
      for (let k = 0; k < 8; k++) {
        const a = ((k + 0.5) * Math.PI) / 4;
        B.gold.push(new THREE.ConeGeometry(0.8, 14, 4).translate(it.x + Math.sin(a) * R * 0.3, top + 7, it.z - Math.cos(a) * R * 0.3));
      }
      B.gold.push(new THREE.CylinderGeometry(0.6, 1.2, 30, 8).translate(it.x, top + 15, it.z));
      beacons.push(new THREE.OctahedronGeometry(3, 0).translate(it.x, top + 32, it.z));
      // Floodlight washes up its foot.
      B.flood.push(new THREE.CylinderGeometry(R * 1.05, R * 1.25, 60, 8, 1, true, Math.PI / 8).translate(it.x, it.y + 30, it.z));
      arcade(null, { x: it.x, z: it.z + it.apothem, fx: 0, fz: 1, ax: 1, az: 0, w: 18, y: it.y }, 8, 4.5);
    },
    plaza(it) {
      // The plaza's top, and its stone plinth down to the street.
      const poly = [...Array(8).keys()].map((k) => [Math.sin(((k + 0.5) * Math.PI) / 4) * (it.apothem / Math.cos(Math.PI / 8)), -Math.cos(((k + 0.5) * Math.PI) / 4) * (it.apothem / Math.cos(Math.PI / 8))]);
      drape(poly, -0.02, B.plaza, H);
      for (let k = 0; k < 8; k++) {
        const a = poly[k];
        const b = poly[(k + 1) % 8];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const y0 = Math.min(base(...a), base(...b)) - 0.3;
        const y1 = H((a[0] + b[0]) / 2 * 0.99, (a[1] + b[1]) / 2 * 0.99);
        B.stone.push(box(0.6, y1 - y0, L, (a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2, Math.atan2(b[0] - a[0], b[1] - a[1])));
      }
    },
    plazaRamp(it) {
      // A ramp down from the plaza to the Circus, its sides faced in stone.
      const [nx, nz] = it.n;
      const t = [-nz, nx];
      const c = (p, q) => [nx * p + t[0] * q, nz * p + t[1] * q];
      const rect = [c(it.from, -it.half), c(it.from + it.len, -it.half), c(it.from + it.len, it.half), c(it.from, it.half)];
      drape(rect, 0.01, B.plaza, draw);
      for (const sd of [-1, 1]) {
        const p0 = c(it.from, sd * (it.half + 0.3));
        const p1 = c(it.from + it.len, sd * (it.half + 0.3));
        const g = new THREE.BufferGeometry();
        const y0 = base(...p0) - 0.2;
        const y1 = base(...p1) - 0.2;
        g.setAttribute('position', new THREE.Float32BufferAttribute([p0[0], y0, p0[1], p1[0], y1, p1[1], p0[0], it.y0 + 0.02, p0[1]], 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
        g.setIndex([0, 1, 2]);
        g.computeVertexNormals();
        B.stone.push(g);
        const rail = new THREE.BoxGeometry(0.35, 0.2, it.len);
        rail.rotateX(Math.atan2(it.y0 - it.y1, it.len));
        rail.rotateY(Math.atan2(nx, nz));
        rail.translate((p0[0] + p1[0]) / 2, (it.y0 + it.y1) / 2 + 0.15, (p0[1] + p1[1]) / 2);
        B.gold.push(rail);
      }
    },
    balustrade(it) {
      B.stone.push(obbBox(it.obb, it.h - 0.15, it.y));
      B.gold.push(obbBox({ ...it.obb, hw: it.obb.hw + 0.05 }, 0.15, it.y + it.h - 0.15));
    },
    pond(it) {
      B.water.push(flatPoly(it.poly, () => it.y));
    },
    parkTree(it) {
      const s = it.s || 1;
      const y = H(it.x, it.z);
      B.trunk.push(box(0.9 * s, 6 * s, 0.9 * s, it.x, y + 3 * s, it.z));
      const leaves = (g) => (it.set?.leaves ? B.painted.push(tint(g, it.set.leaves)) : B.plant.push(g));
      for (const [dx, dy, dz, r] of [[0, 9, 0, 4.6], [2.4, 7.6, 1.2, 3.4], [-2.2, 8, -1.4, 3.6], [0.6, 11.4, -0.8, 3.2]]) leaves(new THREE.IcosahedronGeometry(r * s, 0).translate(it.x + dx * s, y + dy * s, it.z + dz * s));
    },
    streetTree(it) {
      const y = H(it.x, it.z);
      B.trunk.push(box(0.5, 4, 0.5, it.x, y + 2, it.z));
      const crowns = [new THREE.IcosahedronGeometry(2.8, 0).translate(it.x, y + 6, it.z), new THREE.IcosahedronGeometry(2, 0).translate(it.x + 0.8, y + 7.8, it.z - 0.4)];
      if (it.set?.leaves) B.painted.push(...crowns.map((g) => tint(g, it.set.leaves)));
      else B.plant.push(...crowns);
    },
    medianTree(it) {
      B.trunk.push(box(0.35, 3, 0.35, it.x, it.y + 1.5, it.z));
      B.plant.push(new THREE.IcosahedronGeometry(1.7, 0).translate(it.x, it.y + 4.2, it.z));
    },
    bandstand(it) {
      const y = H(it.x, it.z);
      const r = it.rad;
      B.stone.push(new THREE.CylinderGeometry(r, r + 0.3, 1.2, 8).translate(it.x, y + 0.6, it.z));
      for (let k = 0; k < 8; k++) {
        const a = ((k + 0.5) * Math.PI) / 4;
        B.white.push(box(0.3, 4.5, 0.3, it.x + Math.cos(a) * (r - 0.5), y + 3.4, it.z + Math.sin(a) * (r - 0.5)));
      }
      B.goldLit.push(new THREE.ConeGeometry(r + 1, 3, 8).translate(it.x, y + 7.2, it.z));
      B.gold.push(new THREE.SphereGeometry(0.5, 8, 6).translate(it.x, y + 9, it.z));
    },
    parkWall(it) {
      // A stretch of the park's stone wall, a pillar at each end (one a hair
      // bigger, where two stretches meet).
      const o = it.obb;
      const y = H(o.x, o.z);
      B.stone.push(obbBox({ ...o, hw: 0.3 }, 1.8, y - 0.4), obbBox({ ...o, hw: 0.38, hd: o.hd - 0.3 }, 0.12, y + 1.4));
      for (const s of [-1, 1]) {
        const [px, pz] = [o.x + Math.sin(o.yaw) * s * (o.hd - 0.45), o.z + Math.cos(o.yaw) * s * (o.hd - 0.45)];
        const r = s < 0 ? 0.45 : 0.46;
        B.stone.push(obbBox({ x: px, z: pz, hw: r, hd: r, yaw: o.yaw }, 2.8, y - 0.4), obbBox({ x: px, z: pz, hw: r + 0.14, hd: r + 0.14, yaw: o.yaw }, 0.22, y + 2.4));
      }
    },
    parkGate(it) {
      B.stone.push(obbBox(it.obb, it.h, it.y));
      B.stone.push(obbBox({ ...it.obb, hw: it.obb.hw + 0.3, hd: it.obb.hd + 0.3 }, 0.6, it.y + it.h));
      B.lamp.push(new THREE.SphereGeometry(0.5, 8, 6).translate(it.x, it.y + it.h + 1.1, it.z));
    },
    archPier() {
      // (Drawn with its arch.)
    },
    triumph(it) {
      // A triumphal arch: one stone mass from pier to pier, the vault through it,
      // the attic over it with the gate's name in gold on both faces.
      const W = it.span + it.pier;
      const spring = 8;
      const top = it.h;
      const shape = new THREE.Shape();
      shape.moveTo(-W, 0);
      shape.lineTo(-it.span, 0);
      shape.lineTo(-it.span, spring);
      shape.absarc(0, spring, it.span, Math.PI, 0, true);
      shape.lineTo(it.span, 0);
      shape.lineTo(W, 0);
      shape.lineTo(W, top);
      shape.lineTo(-W, top);
      shape.lineTo(-W, 0);
      const g = new THREE.ExtrudeGeometry(shape, { depth: it.depth, bevelEnabled: false, curveSegments: 24 });
      g.translate(0, 0, -it.depth / 2);
      g.rotateY(Math.atan2(it.dx, it.dz));
      g.translate(it.x, it.y - 0.2, it.z);
      B.stone.push(indexed(scaleUv(g, 1 / 24, 1 / 24)));
      for (const sd of [-1, 1]) {
        const fx = it.dx * sd;
        const fz = it.dz * sd;
        const cx = it.x + fx * (it.depth / 2 + 0.05);
        const cz = it.z + fz * (it.depth / 2 + 0.05);
        text(it.name, '#ffc850', cx, it.y + top - 6.5, cz, fx, fz, Math.min(2 * it.span - 6, 30));
        B.gold.push(box(2 * W, 0.4, 0.3, cx, it.y + top - 1, cz, Math.atan2(it.dx, it.dz)));
      }
    },
    gatePlaza() {
      // (Paving: drawn with the ground.)
    },
  };

  function finish() {
    for (const [k, list] of Object.entries(B)) {
      if (!list.length) continue;
      const m = new THREE.Mesh(merged(list), mats[k]);
      if (k === 'flood') m.renderOrder = 1;
      add(m);
    }
    const beacon = beacons.length ? new THREE.Mesh(merged(beacons), mats.beacon) : null;
    add(beacon);
    return {
      animate(t, real) {
        if (beacon) beacon.material.color.setScalar(0.75 + 0.25 * Math.sin(real * 2.2));
      },
    };
  }

  // What the drawers add to (for drawing edited items, render/itemCapture.js).
  const buckets = [B, beacons];
  return { ground, drawers, finish, buckets };
}
