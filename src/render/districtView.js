import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial, standardMaterial, glowMaterial, additiveMaterial } from './retroMaterial.js';
import { makeRng } from './textures.js';
import { setUvRect } from './trackView.js';
import { SETBACK, STREET } from '../sim/city.js';

// A whole city district, built once and shared by every event held there:
// streets and sidewalks (closed ones stay visible behind the race barriers),
// lots, buildings in the district's style, special lots (construction sites,
// plazas, car parks, alleys, container yards), street lamps, and landmarks
// (waterfront cranes, neon arches, skybridges, the overhead deck, the Spire).
// Event routes draw their own road, barriers and start line on top.

const HW = STREET.halfWidth;
const DS = THREE.DoubleSide;
const UV_SCALE = { building: [48, 96], glass: [24, 48], corrugated: [8, 8] };

// Accumulates quads into one geometry.
class Surface {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.idx = [];
  }

  quad(a, b, c, d, ua, ub, uc, ud) {
    const k = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d);
    this.uv.push(...ua, ...ub, ...uc, ...ud);
    this.idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }

  mesh(material) {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return new THREE.Mesh(g, material);
  }
}

const box = (w, h, d, x, y, z, yaw = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (yaw) g.rotateY(yaw);
  g.translate(x, y, z);
  return g;
};
const colorBox = (w, h, d, x, y, z, color, yaw = 0) => {
  const g = box(w, h, d, x, y, z, yaw);
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let k = 0; k < colors.length; k += 3) colors.set([c.r, c.g, c.b], k);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
};
const mergedMesh = (list, material) => (list.length ? new THREE.Mesh(mergeGeometries(list), material) : null);

// Distance from point to rect [x0, x1, z0, z1].
const rectDist = (r, x, z) => Math.hypot(Math.max(r[0] - x, 0, x - r[1]), Math.max(r[2] - z, 0, z - r[3]));

function samplePath(points, step = 3) {
  const out = [];
  for (let k = 0; k + 1 < points.length; k++) {
    const [ax, az] = points[k];
    const [bx, bz] = points[k + 1];
    const d = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t < d; t += step) out.push([ax + ((bx - ax) * t) / d, az + ((bz - az) * t) / d, (bx - ax) / d, (bz - az) / d]);
  }
  return out;
}

export function buildDistrictView(map, tex) {
  const { style, heightAt, nodes } = map;
  const look = style.look;
  const rng = makeRng(style.seed * 7 + 11);
  const group = new THREE.Group();
  const add = (m) => m && group.add(m);
  const H = (x, z) => heightAt(x, z);

  const mats = {
    road: standardMaterial({ map: tex.road, roughnessMap: tex.roadRough ?? null, roughness: tex.roadRough ? 1 : 0.45, metalness: 0, envMap: tex.env, envMapIntensity: 0.5, side: DS }),
    asphalt: litMaterial({ map: tex.asphalt, side: DS }),
    sidewalk: litMaterial({ map: tex.sidewalk, side: DS }),
    lot: litMaterial({ map: tex.lot, color: look.lot, side: DS }),
    tiles: litMaterial({ map: tex.tiles, side: DS }),
    dirt: litMaterial({ map: tex.dirt, side: DS }),
    parking: litMaterial({ map: tex.parking, side: DS }),
    dark: litMaterial({ color: '#1c1a24' }),
    steel: litMaterial({ color: '#4a4858' }),
    barrier: litMaterial({ map: tex.wall, color: look.barrier }),
    painted: litMaterial({ vertexColors: true }),
    containers: litMaterial({ map: tex.container, vertexColors: true }),
    plant: litMaterial({ color: '#1f4a3a' }),
    cone: glowMaterial({ color: '#ff7a1a', intensity: 1.3 }),
    lampHead: glowMaterial({ color: look.lamp, intensity: 3 }),
    pool: additiveMaterial({ map: tex.glow, color: look.lamp, opacity: 0.4 }),
  };
  const buildingMat =
    look.buildingTex === 'glass'
      ? standardMaterial({ map: tex.glass, emissiveMap: tex.glassGlow, emissive: 0xffffff, emissiveIntensity: 0.8, color: look.building, metalness: 0.6, roughness: 0.25, envMap: tex.env })
      : look.buildingTex === 'corrugated'
        ? litMaterial({ map: tex.corrugated, color: look.building })
        : litMaterial({ map: tex.building, emissiveMap: tex.buildingGlow, emissive: 0xffffff, emissiveIntensity: 1.1, color: look.building });
  const uvScale = UV_SCALE[look.buildingTex] || UV_SCALE.building;
  const neon = (k) => glowMaterial({ color: look.neon[k % look.neon.length], intensity: 2.6 });

  // --- Streets and sidewalks ---
  const road = new Surface();
  const walk = new Surface();
  const junctionRoad = new Surface();
  const P = (A, ux, uz, t, lat, dy) => {
    const x = A.x + ux * t - uz * lat;
    const z = A.z + uz * t + ux * lat;
    return [x, H(x, z) + dy, z];
  };
  const strip = (surf, A, ux, uz, t0, t1, l0, l1, dy, vScale) => {
    const steps = Math.max(1, Math.ceil((t1 - t0) / 10));
    for (let s = 0; s < steps; s++) {
      const ta = t0 + ((t1 - t0) * s) / steps;
      const tb = t0 + ((t1 - t0) * (s + 1)) / steps;
      surf.quad(P(A, ux, uz, ta, l0, dy), P(A, ux, uz, ta, l1, dy), P(A, ux, uz, tb, l1, dy), P(A, ux, uz, tb, l0, dy), [0, ta / vScale], [1, ta / vScale], [1, tb / vScale], [0, tb / vScale]);
    }
  };
  const flat = (surf, x0, x1, z0, z1, dy, scale = 8) => {
    const nx = Math.max(1, Math.ceil((x1 - x0) / 20));
    const nz = Math.max(1, Math.ceil((z1 - z0) / 20));
    for (let a = 0; a < nx; a++) {
      for (let b = 0; b < nz; b++) {
        const xa = x0 + ((x1 - x0) * a) / nx;
        const xb = x0 + ((x1 - x0) * (a + 1)) / nx;
        const za = z0 + ((z1 - z0) * b) / nz;
        const zb = z0 + ((z1 - z0) * (b + 1)) / nz;
        const v = (x, z) => [x, H(x, z) + dy, z];
        surf.quad(v(xa, za), v(xb, za), v(xb, zb), v(xa, zb), [xa / scale, za / scale], [xb / scale, za / scale], [xb / scale, zb / scale], [xa / scale, zb / scale]);
      }
    }
  };
  const edgeList = [...map.edges.values()].map((e) => {
    const A = nodes[e.a];
    const B = nodes[e.b];
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    return { A, B, L, ux: (B.x - A.x) / L, uz: (B.z - A.z) / L };
  });
  for (const { A, L, ux, uz } of edgeList) {
    strip(road, A, ux, uz, HW, L - HW, -HW, HW, -0.03, 16);
    strip(walk, A, ux, uz, SETBACK, L - SETBACK, HW, SETBACK, -0.035, 4);
    strip(walk, A, ux, uz, SETBACK, L - SETBACK, -SETBACK, -HW, -0.035, 4);
  }
  for (const n of nodes) {
    if (!map.adj[n.id].length) continue;
    flat(junctionRoad, n.x - HW, n.x + HW, n.z - HW, n.z + HW, -0.03);
    flat(walk, n.x - SETBACK, n.x + SETBACK, n.z - SETBACK, n.z + SETBACK, -0.04, 4);
  }
  add(road.mesh(mats.road));
  add(walk.mesh(mats.sidewalk));
  add(junctionRoad.mesh(mats.asphalt));

  // --- Lots ---
  const lotSurf = { lot: new Surface(), tiles: new Surface(), dirt: new Surface(), parking: new Surface() };
  const surfFor = { buildings: 'lot', yard: 'lot', alley: 'lot', arena: 'lot', plaza: 'tiles', construction: 'dirt', parking: 'parking' };
  for (const c of map.cells) flat(lotSurf[surfFor[c.kind]], c.lot[0], c.lot[1], c.lot[2], c.lot[3], -0.06, c.kind === 'parking' ? 12 : 8);
  add(lotSurf.lot.mesh(mats.lot));
  add(lotSurf.tiles.mesh(mats.tiles));
  add(lotSurf.dirt.mesh(mats.dirt));
  add(lotSurf.parking.mesh(mats.parking));

  // --- Buildings ---
  const bGeos = [];
  const darkGeos = [];
  const signGeos = [];
  const addBuilding = (x0, x1, z0, z1, h) => {
    const base = Math.min(H(x0, z0), H(x1, z0), H(x0, z1), H(x1, z1)) - 2;
    const g = new THREE.BoxGeometry(x1 - x0, h + 2, z1 - z0);
    boxUvs(g, x1 - x0, h + 2, z1 - z0, uvScale, rng);
    g.translate((x0 + x1) / 2, base + (h + 2) / 2, (z0 + z1) / 2);
    bGeos.push(g);
    if (rng() < 0.5) {
      for (let k = 0; k < 1 + Math.floor(rng() * 2); k++) {
        const s = 2 + rng() * 3;
        darkGeos.push(box(s, 1.5 + rng(), s, x0 + s + rng() * Math.max(0, x1 - x0 - 2 * s), base + h + 2.7, z0 + s + rng() * Math.max(0, z1 - z0 - 2 * s)));
      }
    }
    return base + h + 2;
  };
  const addSign = (x, y, z, nx, nz, maxW, maxH) => {
    const vertical = rng() < 0.4;
    const rect = vertical ? tex.signs.vertical[Math.floor(rng() * tex.signs.vertical.length)] : tex.signs.rects[1 + Math.floor(rng() * (tex.signs.rects.length - 1))];
    let h = vertical ? Math.min(maxH, 8 + rng() * 8) : 2.5 + rng() * 3;
    let w = h * rect.aspect;
    if (w > maxW) {
      w = maxW;
      h = w / rect.aspect;
    }
    if (h < 1.5) return;
    const g = new THREE.PlaneGeometry(w, h);
    setUvRect(g, rect);
    g.rotateY(Math.atan2(nx, nz));
    g.translate(x + nx * 0.35, y, z + nz * 0.35);
    signGeos.push(g);
  };
  const corridorOf = new Map(map.corridors.map((c) => [c.cell, samplePath(c.points)]));
  const clearOf = (r, path, margin) => !path || path.every(([x, z]) => rectDist(r, x, z) > margin);

  // Splits a lot into building footprints in the district's style.
  const footprints = (rect) => {
    const [x0, x1, z0, z1] = rect;
    const W = x1 - x0;
    const D = z1 - z0;
    if (W < 10 || D < 10) return [];
    const alongX = W >= D;
    const U = alongX ? W : D;
    const V = alongX ? D : W;
    const toXZ = ([u0, u1, v0, v1, h]) => (alongX ? [x0 + u0, x0 + u1, z0 + v0, z0 + v1, h] : [x0 + v0, x0 + v1, z0 + u0, z0 + u1, h]);
    const [hmin, hmax] = style.heights;
    const height = () => hmin + (hmax - hmin) * Math.pow(rng(), 1.6);
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

  const fillBuildings = (c, margin) => {
    const rect = [c.lot[0] + 3, c.lot[1] - 3, c.lot[2] + 3, c.lot[3] - 3];
    const path = corridorOf.get(c);
    for (const fp of footprints(rect)) {
      const r = fp.slice(0, 4);
      if (!clearOf(r, path, margin)) continue;
      const top = addBuilding(r[0], r[1], r[2], r[3], fp[4]);
      if (rng() < look.signs) {
        // A sign on the face toward the nearest street.
        const sides = [];
        if (c.side.w) sides.push([r[0] - rect[0], -1, 0]);
        if (c.side.e) sides.push([rect[1] - r[1], 1, 0]);
        if (c.side.n) sides.push([r[2] - rect[2], 0, -1]);
        if (c.side.s) sides.push([rect[3] - r[3], 0, 1]);
        if (!sides.length) continue;
        const [, nx, nz] = sides.sort((a, b) => a[0] - b[0])[0];
        const cx = (r[0] + r[1]) / 2;
        const cz = (r[2] + r[3]) / 2;
        const fx = nx ? (nx < 0 ? r[0] : r[1]) : cx + (rng() - 0.5) * (r[1] - r[0]) * 0.5;
        const fz = nz ? (nz < 0 ? r[2] : r[3]) : cz + (rng() - 0.5) * (r[3] - r[2]) * 0.5;
        const faceW = nx ? r[3] - r[2] : r[1] - r[0];
        const ground = H(fx, fz);
        const y = Math.min(top - 3, ground + 6 + rng() * Math.min(16, Math.max(0, top - ground - 10)));
        if (y > ground + 4) addSign(fx, y, fz, nx, nz, faceW * 0.8, top - ground - 6);
      }
    }
  };

  // The Spire: the district's landmark tower takes the most central lot.
  let spireCell = null;
  if (style.features.includes('spire')) {
    spireCell = map.cells.filter((c) => c.kind === 'buildings').sort((a, b) => Math.hypot((a.lot[0] + a.lot[1]) / 2, (a.lot[2] + a.lot[3]) / 2) - Math.hypot((b.lot[0] + b.lot[1]) / 2, (b.lot[2] + b.lot[3]) / 2))[0];
  }

  const coneGeos = [];
  const steelGeos = [];
  const yellowGeos = [];
  const barrierGeos = [];
  const paintedGeos = [];
  const containerGeos = [];
  const plantGeos = [];
  const glowGeos = [];
  const carColors = ['#b8202c', '#1e4a8a', '#d8d0c0', '#1a1a1e', '#d8a000', '#2a6a3a', '#6a6a78', '#7a2ab0'];
  const containerColors = ['#b83a2a', '#2a6ab8', '#d8a020', '#3a8a4a', '#8a3ab0', '#c8c8c8', '#d86a1a'];

  for (const c of map.cells) {
    const [lx0, lx1, lz0, lz1] = c.lot;
    const path = corridorOf.get(c);
    const g0 = (x, z) => H(x, z) - 0.06;
    const clear = (x, z, m) => !path || path.every(([px, pz]) => Math.hypot(px - x, pz - z) > m);
    if (c === spireCell) {
      buildSpire(c, H, bGeos, glowGeos, rng, uvScale);
      continue;
    }
    if (c.kind === 'buildings') fillBuildings(c, 11);
    else if (c.kind === 'alley') {
      fillBuildings(c, 8.5);
      // "Through the building": a bridge block spans the alley mid-way.
      const mid = path[Math.floor(path.length / 2)];
      const yaw = Math.atan2(mid[2], mid[3]);
      const y = H(mid[0], mid[1]);
      const g = new THREE.BoxGeometry(24, 7, 9);
      boxUvs(g, 24, 7, 9, uvScale, rng);
      g.rotateY(yaw);
      g.translate(mid[0], y + 11, mid[1]);
      bGeos.push(g);
      for (const k of [3, path.length - 4]) {
        const p = path[Math.max(0, Math.min(path.length - 1, k))];
        paintedGeos.push(colorBox(1.6, 1.4, 2.4, p[0] - p[3] * 6, g0(p[0], p[1]) + 0.7, p[1] + p[2] * 6, '#2a5a3a', Math.atan2(p[2], p[3])));
      }
    } else if (c.kind === 'construction') {
      for (let k = 0; k < path.length; k += 3) {
        const [x, z, dx, dz] = path[k];
        for (const side of [-1, 1]) coneGeos.push(cone(x - dz * 7.5 * side, g0(x, z), z + dx * 7.5 * side));
      }
      // Tower crane in the corner furthest from the path.
      const corners = [[lx0 + 8, lz0 + 8], [lx1 - 8, lz0 + 8], [lx0 + 8, lz1 - 8], [lx1 - 8, lz1 - 8]];
      const [cx, cz] = corners.sort((a, b) => Math.min(...path.map(([x, z]) => Math.hypot(x - b[0], z - b[1]))) - Math.min(...path.map(([x, z]) => Math.hypot(x - a[0], z - a[1]))))[0];
      const base = g0(cx, cz);
      const yaw = rng() * Math.PI * 2;
      yellowGeos.push(box(2.4, 48, 2.4, cx, base + 24, cz));
      const jib = new THREE.BoxGeometry(46, 1.6, 1.6);
      jib.translate(12, 0, 0);
      jib.rotateY(yaw);
      jib.translate(cx, base + 48, cz);
      yellowGeos.push(jib);
      steelGeos.push(box(4, 3, 3, cx - Math.cos(yaw) * 9, base + 46.5, cz + Math.sin(yaw) * 9));
      glowGeos.push(box(0.6, 0.6, 0.6, cx, base + 49.5, cz));
      // Dirt piles and scaffolding away from the path.
      for (let k = 0; k < 6; k++) {
        const x = lx0 + 8 + rng() * (lx1 - lx0 - 16);
        const z = lz0 + 8 + rng() * (lz1 - lz0 - 16);
        if (!clear(x, z, 13)) continue;
        if (k % 2) {
          const pile = new THREE.ConeGeometry(4 + rng() * 3, 2 + rng() * 2, 7);
          pile.translate(x, g0(x, z) + 1.2, z);
          paintedGeos.push(tint(pile, '#5a4030'));
        } else {
          for (let py = 0; py < 3; py++) steelGeos.push(box(8, 0.2, 2, x, g0(x, z) + 3 + py * 3.5, z));
          for (const dx of [-4, 4]) for (const dz of [-1, 1]) steelGeos.push(box(0.2, 11, 0.2, x + dx, g0(x, z) + 5.5, z + dz));
        }
      }
      // Site fence of jersey barriers, open where the path runs through.
      for (const [ax, az, bx, bz] of [[lx0, lz0, lx1, lz0], [lx1, lz0, lx1, lz1], [lx1, lz1, lx0, lz1], [lx0, lz1, lx0, lz0]]) {
        const len = Math.hypot(bx - ax, bz - az);
        for (let t = 1; t < len; t += 2.2) {
          const x = ax + ((bx - ax) * t) / len;
          const z = az + ((bz - az) * t) / len;
          if (!clear(x, z, 12)) continue;
          barrierGeos.push(box(2, 0.9, 0.5, x, g0(x, z) + 0.45, z, Math.atan2(bx - ax, bz - az) + Math.PI / 2));
        }
      }
    } else if (c.kind === 'plaza') {
      for (let k = 0; k < 14; k++) {
        const x = lx0 + 6 + rng() * (lx1 - lx0 - 12);
        const z = lz0 + 6 + rng() * (lz1 - lz0 - 12);
        if (!clear(x, z, 11)) continue;
        const y = g0(x, z);
        steelGeos.push(box(3, 0.8, 3, x, y + 0.4, z));
        plantGeos.push(box(2.6, 0.2, 2.6, x, y + 0.9, z));
        if (rng() < 0.6) {
          const trunk = new THREE.CylinderGeometry(0.2, 0.25, 3, 5);
          trunk.translate(x, y + 2.3, z);
          paintedGeos.push(tint(trunk, '#3a2a20'));
          const crown = new THREE.ConeGeometry(1.8, 4.5, 6);
          crown.translate(x, y + 5.5, z);
          plantGeos.push(crown);
        }
      }
      const cx = (lx0 + lx1) / 2;
      const cz = (lz0 + lz1) / 2;
      if (clear(cx, cz, 15)) {
        const basin = new THREE.CylinderGeometry(5, 5.4, 0.8, 16);
        basin.translate(cx, g0(cx, cz) + 0.4, cz);
        steelGeos.push(basin);
        const water = new THREE.CylinderGeometry(4.6, 4.6, 0.1, 16);
        water.translate(cx, g0(cx, cz) + 0.82, cz);
        glowGeos.push(water);
      }
    } else if (c.kind === 'parking') {
      const alongX = lx1 - lx0 >= lz1 - lz0;
      for (const band of [0.25, 0.75]) {
        const len = alongX ? lx1 - lx0 : lz1 - lz0;
        for (let t = 4; t < len - 4; t += 3) {
          if (rng() < 0.3) continue;
          const x = alongX ? lx0 + t : lx0 + (lx1 - lx0) * band;
          const z = alongX ? lz0 + (lz1 - lz0) * band : lz0 + t;
          if (!clear(x, z, 8.5)) continue;
          const y = g0(x, z);
          const yaw = alongX ? 0 : Math.PI / 2;
          paintedGeos.push(colorBox(1.9, 1.1, 4.4, x, y + 0.75, z, carColors[Math.floor(rng() * carColors.length)], yaw));
          darkGeos.push(box(1.7, 0.55, 2.2, x, y + 1.55, z, yaw));
        }
      }
    } else if (c.kind === 'yard') {
      // Container stacks.
      const alongX = lx1 - lx0 >= lz1 - lz0;
      const len = alongX ? lx1 - lx0 : lz1 - lz0;
      const wid = alongX ? lz1 - lz0 : lx1 - lx0;
      for (let row = 4; row < wid - 4; row += 16) {
        for (let t = 8; t < len - 8; t += 2.9) {
          const stack = Math.floor(rng() * 4);
          const x = alongX ? lx0 + t : lx0 + row + 6;
          const z = alongX ? lz0 + row + 6 : lz0 + t;
          const y = g0(x, z);
          for (let s = 0; s < stack; s++) {
            containerGeos.push(colorBox(alongX ? 2.44 : 12.2, 2.6, alongX ? 12.2 : 2.44, x, y + 1.3 + s * 2.6, z, containerColors[Math.floor(rng() * containerColors.length)]));
          }
        }
      }
    }
  }

  // --- Street lamps along every street ---
  const lampGeos = [];
  const headGeos = [];
  const poolGeos = [];
  for (const { A, L, ux, uz } of edgeList) {
    for (let t = 20; t < L - 20; t += 38) {
      for (const side of [-1, 1]) {
        const lat = side * (SETBACK + 0.8);
        const [x, y, z] = P(A, ux, uz, t, lat, 0);
        const yaw = Math.atan2(-uz * side, ux * side); // local +Z toward the road
        const pole = new THREE.BoxGeometry(0.25, 7, 0.25);
        pole.translate(0, 3.5, 0);
        const arm = new THREE.BoxGeometry(0.2, 0.2, 3);
        arm.translate(0, 6.9, -1.5);
        const head = new THREE.BoxGeometry(0.5, 0.18, 0.9);
        head.translate(0, 6.75, -2.9);
        for (const g of [pole, arm, head]) {
          g.rotateY(yaw);
          g.translate(x, y, z);
        }
        lampGeos.push(pole, arm);
        headGeos.push(head);
        const [px, py, pz] = P(A, ux, uz, t, side * (HW - 2.5), 0.06);
        const pool = new THREE.PlaneGeometry(10, 10);
        pool.rotateX(-Math.PI / 2);
        pool.translate(px, py, pz);
        poolGeos.push(pool);
      }
    }
  }

  // --- Landmarks ---
  const f = style.features;
  const bounds = map.bounds;
  const minY = Math.min(...nodes.map((n) => n.y));
  if (f.includes('waterfront')) {
    const edge = bounds.maxZ + SETBACK + 30;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 1500).rotateX(-Math.PI / 2).translate(0, minY - 1.2, edge + 750),
      standardMaterial({ color: '#0a1420', roughness: 0.12, metalness: 0.6, envMap: tex.env, envMapIntensity: 1.2 }),
    );
    add(water);
    steelGeos.push(box(bounds.maxX - bounds.minX + 400, 2, 3, 0, minY - 0.3, edge));
    for (let x = bounds.minX; x <= bounds.maxX; x += 140) {
      const y = minY;
      for (const dz of [4, 20]) for (const dx of [-9, 9]) paintedGeos.push(colorBox(1.6, 32, 1.6, x + dx, y + 16, edge + dz, '#c83a2a'));
      paintedGeos.push(colorBox(22, 3, 3, x, y + 32, edge + 4, '#e0e0e8'), colorBox(22, 3, 3, x, y + 32, edge + 20, '#e0e0e8'));
      paintedGeos.push(colorBox(3, 2.5, 60, x, y + 34, edge + 30, '#c83a2a'));
      glowGeos.push(box(0.8, 0.8, 0.8, x, y + 36, edge + 58));
    }
  }
  if (f.includes('arches')) {
    const picks = edgeList.filter(() => rng() < 0.18);
    picks.forEach(({ A, L, ux, uz }, k) => {
      const t = L / 2;
      const [x, y, z] = P(A, ux, uz, t, 0, 0);
      const yaw = Math.atan2(ux, uz);
      const arch = [];
      for (const side of [-1, 1]) arch.push(box(0.8, 10, 0.8, x - uz * side * (SETBACK + 0.6), y + 5, z + ux * side * (SETBACK + 0.6)));
      arch.push(box(2 * SETBACK + 2, 0.8, 0.8, x, y + 10, z, yaw));
      steelGeos.push(...arch);
      const tube = new THREE.Mesh(mergeGeometries([box(2 * SETBACK, 0.25, 0.3, x, y + 9.4, z, yaw), box(2 * SETBACK * 0.8, 0.25, 0.3, x, y + 10.6, z, yaw)]), neon(k));
      add(tube);
    });
  }
  if (f.includes('skybridges')) {
    for (const { A, L, ux, uz } of edgeList.filter(() => rng() < 0.16)) {
      const [x, y, z] = P(A, ux, uz, L * (0.3 + rng() * 0.4), 0, 0);
      const h = 24 + rng() * 20;
      const yaw = Math.atan2(ux, uz);
      const g = new THREE.BoxGeometry(2 * SETBACK + 14, 3.5, 7);
      boxUvs(g, 2 * SETBACK + 14, 3.5, 7, uvScale, rng);
      g.rotateY(yaw);
      g.translate(x, y + h, z);
      bGeos.push(g);
      glowGeos.push(box(2 * SETBACK + 14, 0.2, 1, x, y + h - 1.85, z, yaw));
    }
  }
  if (f.includes('overpass')) {
    // The upper city's deck, on pillars above a few full streets.
    const lines = [];
    for (const j of [1, style.rows - 2]) {
      const row = [];
      for (let i = 0; i < style.cols; i++) row.push(nodes[map.nid(i, j)]);
      lines.push(row);
    }
    const col = [];
    for (let j = 0; j < style.rows; j++) col.push(nodes[map.nid(Math.floor(style.cols / 2), j)]);
    lines.push(col);
    for (const line of lines) {
      for (let k = 0; k + 1 < line.length; k++) {
        const A = line[k];
        const B = line[k + 1];
        const L = Math.hypot(B.x - A.x, B.z - A.z);
        const ux = (B.x - A.x) / L;
        const uz = (B.z - A.z) / L;
        const y = Math.max(A.y, B.y) + 16;
        const yaw = Math.atan2(ux, uz);
        darkGeos.push(box(2 * SETBACK + 6, 2, L + 2 * SETBACK + 6, (A.x + B.x) / 2, y + 1, (A.z + B.z) / 2, yaw));
        for (const side of [-1, 1]) {
          glowGeos.push(box(0.3, 0.2, L, (A.x + B.x) / 2 - uz * side * (SETBACK + 2.5), y - 0.1, (A.z + B.z) / 2 + ux * side * (SETBACK + 2.5), yaw));
          for (let t = 22; t < L - 10; t += 45) {
            const [px, py, pz] = P(A, ux, uz, t, side * (SETBACK + 1.8), 0);
            darkGeos.push(box(2, y - py, 2, px, (y + py) / 2, pz));
          }
        }
      }
    }
  }

  // Filler buildings beyond the district edge, so the city keeps going.
  const ring = [
    [bounds.minX - 80, bounds.maxX + 80, bounds.minZ - SETBACK - 50, bounds.minZ - SETBACK - 3],
    ...(f.includes('waterfront') ? [] : [[bounds.minX - 80, bounds.maxX + 80, bounds.maxZ + SETBACK + 3, bounds.maxZ + SETBACK + 50]]),
    [bounds.minX - SETBACK - 50, bounds.minX - SETBACK - 3, bounds.minZ - SETBACK, bounds.maxZ + SETBACK],
    [bounds.maxX + SETBACK + 3, bounds.maxX + SETBACK + 50, bounds.minZ - SETBACK, bounds.maxZ + SETBACK],
  ];
  const [hmin, hmax] = style.heights;
  for (const [x0, x1, z0, z1] of ring) {
    const alongX = x1 - x0 > z1 - z0;
    const len = alongX ? x1 - x0 : z1 - z0;
    for (let p = 0; p < len; ) {
      const s = 18 + rng() * 26;
      const a = Math.min(len, p + s);
      if (alongX) addBuilding(x0 + p, x0 + a, z0, z1, hmin + rng() * (hmax - hmin) * 1.2);
      else addBuilding(x0, x1, z0 + p, z0 + a, hmin + rng() * (hmax - hmin) * 1.2);
      p = a + 2;
    }
  }

  add(mergedMesh(bGeos, buildingMat));
  add(mergedMesh(darkGeos, mats.dark));
  add(mergedMesh(steelGeos, mats.steel));
  add(mergedMesh(yellowGeos, litMaterial({ color: '#e0b020' })));
  add(mergedMesh(coneGeos, mats.cone));
  add(mergedMesh(barrierGeos, mats.barrier));
  add(mergedMesh(paintedGeos, mats.painted));
  add(mergedMesh(containerGeos, mats.containers));
  add(mergedMesh(plantGeos, mats.plant));
  add(mergedMesh(glowGeos, neon(0)));
  add(mergedMesh(signGeos, glowMaterial({ map: tex.signs.texture, intensity: 2.4, side: DS })));
  add(mergedMesh(lampGeos, mats.steel));
  add(mergedMesh(headGeos, mats.lampHead));
  const pools = mergedMesh(poolGeos, mats.pool);
  if (pools) {
    pools.renderOrder = 1;
    add(pools);
  }

  // Ground far beyond the district and the distant skyline.
  tex.ground.repeat.set(500, 500);
  add(new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2).translate(0, minY - 2, 0), new THREE.MeshLambertMaterial({ map: tex.ground })));
  tex.skyline.repeat.set(6, 1);
  const sky = new THREE.Mesh(new THREE.CylinderGeometry(1500, 1500, 320, 48, 1, true), new THREE.MeshBasicMaterial({ map: tex.skyline, side: THREE.BackSide, alphaTest: 0.5, fog: false }));
  sky.position.set(0, minY + 130, 0);
  sky.renderOrder = -1;
  add(sky);
  return group;
}

function cone(x, y, z) {
  const g = new THREE.ConeGeometry(0.35, 0.9, 6);
  g.translate(x, y + 0.45, z);
  return g;
}

function tint(g, color) {
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let k = 0; k < colors.length; k += 3) colors.set([c.r, c.g, c.b], k);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

// Scales box UVs to world size so windows stay the same size everywhere.
function boxUvs(g, sx, sy, sz, [U, V], rng) {
  const uv = g.attributes.uv;
  const ou = Math.floor(rng() * 16) / 16;
  const ov = Math.floor(rng() * 32) / 32;
  const faceSize = [[sz, sy], [sz, sy], null, null, [sx, sy], [sx, sy]];
  for (let face = 0; face < 6; face++) {
    for (let k = face * 4; k < face * 4 + 4; k++) {
      const size = faceSize[face];
      if (!size) uv.setXY(k, 0.005, 0.995);
      else uv.setXY(k, ou + (uv.getX(k) * size[0]) / U, ov + (uv.getY(k) * size[1]) / V);
    }
  }
}

// The Spire: stacked, narrowing tiers with glowing bands and a beacon.
function buildSpire(c, H, bGeos, glowGeos, rng, uvScale) {
  const cx = (c.lot[0] + c.lot[1]) / 2;
  const cz = (c.lot[2] + c.lot[3]) / 2;
  let y = H(cx, cz) - 2;
  const size = Math.min(c.lot[1] - c.lot[0], c.lot[3] - c.lot[2]) * 0.7;
  const tiers = [[1, 70], [0.8, 90], [0.62, 90], [0.42, 70], [0.24, 50]];
  for (const [k, h] of tiers) {
    const s = size * k;
    const g = new THREE.BoxGeometry(s, h, s);
    boxUvs(g, s, h, s, uvScale, rng);
    g.translate(cx, y + h / 2, cz);
    bGeos.push(g);
    glowGeos.push(box(s + 0.4, 0.8, s + 0.4, cx, y + h - 0.4, cz));
    y += h;
  }
  glowGeos.push(box(1.2, 40, 1.2, cx, y + 20, cz), box(3, 3, 3, cx, y + 41, cz));
}
