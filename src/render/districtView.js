import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial, standardMaterial, glowMaterial, additiveMaterial } from './retroMaterial.js';
import { makeRng, textTexture } from './textures.js';
import { setUvRect, streetRoadMaterial } from './trackView.js';
import { SETBACK, STREET, edgeSpans, TUNNEL_HALF, districtMap } from '../sim/city.js';
import { districtLayout, archEdge, samplePath } from '../sim/cityLayout.js';
import { CRANE_LEGS } from '../sim/authoredLayout.js';
import { rampGeometry, tireGeometry } from './shapes.js';
import { buildAuthoredStructures } from './arenaView.js';
import { buildPlanDistrictView } from './planView.js';
import { distantSpire } from './spireLandmark.js';
import { itemDrawer } from './itemCapture.js';
import { objectLights } from './objectLights.js';
import { textWidth } from '../ui/bitmapFont.js';
import { npcCar } from './npcCars.js';
import { paintView } from './groundPaint.js';
import { extraStreetsView } from './extraStreets.js';

// A whole city district, built once and shared by every event held there:
// streets and sidewalks in the district's own surface (roof decks with gaps to
// jump in a rooftop district), lots, and everything on them. Everything solid
// (buildings, houses, tanks, containers, wagons, stalls, parked cars, planters,
// trees, hedges, barriers, fences, posts) comes from the simulation's district
// layout (sim/cityLayout.js), so free roam collides with exactly what's drawn;
// this adds signs, rooftop junk, lights, rails, canopies, walkways, street
// lamps, tunnels, cables and the landmarks (piers and cranes, neon arches,
// skybridges, the overhead deck, the Spire).
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
const colorBox = (w, h, d, x, y, z, color, yaw = 0) => tint(box(w, h, d, x, y, z, yaw), color);
const mergedMesh = (list, material) => (list.length ? new THREE.Mesh(mergeGeometries(list), material) : null);

const CAR_COLORS = ['#b83a3a', '#3a6ab8', '#c8c8c8', '#2a2a30', '#d8a020', '#3a8a5a', '#6a3a8a'];
const CONTAINER_COLORS = ['#b83a2a', '#2a6ab8', '#d8a020', '#3a8a4a', '#8a3ab0', '#c8c8c8', '#d86a1a'];
const WAGON_COLORS = ['#8a3a2a', '#2a4a7a', '#4a5a3a', '#6a6a70', '#9a6a2a', '#3a3a44'];
const AWNINGS = ['#c83a4a', '#3a8ac8', '#e0b020', '#3aa05a', '#b04dff', '#e06a2a'];
const HOUSE_COLORS = ['#c8b8a0', '#a8b8c8', '#b8a8c0', '#d0c0a8', '#a0b0a0', '#c0a898'];
const SHACK_COLORS = ['#6a5a48', '#4a6a6a', '#7a4a3a', '#5a5a62', '#6a6a3a', '#3a4a5a', '#5a3a4a'];

// A district, and the Spire on its skyline (every district but the Spire's own).
// Where the official districts' styles come from (set by the game and the
// T&T SDK: career/districts.js), for drawing objects placed from one district
// in another.
let styleOf = () => null;
export function setDistrictStyles(fn) {
  styleOf = fn;
}

export function buildDistrictView(map, tex) {
  const group = districtViewOf(map, tex);
  const guests = guestViews(map, tex);
  if (guests) group.add(guests);
  const paint = paintView(map, tex); // ground painted in the T&T SDK
  if (paint) group.add(paint);
  const extra = extraStreetsView(map, tex); // streets drawn off a grid district's grid
  if (extra) group.add(extra);
  const far = distantSpire(map.style);
  if (far) {
    group.add(far);
    const inner = group.userData.animate;
    group.userData.animate = (t, real = t) => {
      inner?.(t, real);
      far.userData.animate(real);
    };
  }
  if (guests) {
    const inner = group.userData.animate;
    group.userData.animate = (t, real = t) => {
      inner?.(t, real);
      guests.userData.animate(t, real);
    };
    for (const k of ['setBroken', 'breakEvent', 'knock']) {
      const own = group.userData[k];
      group.userData[k] = (...a) => {
        own?.(...a);
        guests.userData[k](...a);
      };
    }
  }
  return group;
}

// Just some of a district's objects (draw entries), drawn by its own view:
// none of the district itself.
export const buildObjectsView = (map, tex, only) => districtViewOf(map, tex, { only });

// Objects placed here from other districts (sim/layoutEdits.js: guest), each
// district's drawn by its own view with only those objects: its look, its
// materials, its moving and breaking parts. Null if there are none.
function guestViews(map, tex) {
  const by = new Map();
  for (const it of districtLayout(map).draw) {
    if (!it.guest || it.hidden) continue;
    if (!by.has(it.guest)) by.set(it.guest, []);
    by.get(it.guest).push(it);
  }
  const views = [];
  for (const [id, list] of by) {
    const style = styleOf(id);
    if (!style) continue;
    views.push(districtViewOf(districtMap(style), tex, { only: list }));
  }
  if (!views.length) return null;
  const group = new THREE.Group();
  group.name = 'guests';
  group.add(...views);
  const each = (k) => (...a) => views.forEach((v) => v.userData[k]?.(...a));
  Object.assign(group.userData, { animate: each('animate'), setBroken: each('setBroken'), breakEvent: each('breakEvent'), knock: each('knock') });
  return group;
}

// only: just these objects (draw entries), none of the district itself (see buildPlanDistrictView).
export function districtViewOf(map, tex, { only = null } = {}) {
  if (map.plan) return buildPlanDistrictView(map, tex, { only });
  const { style, heightAt, nodes } = map;
  const look = style.look;
  const roof = style.rooftop || 0;
  const rng = makeRng(style.seed * 7 + 11);
  const group = new THREE.Group();
  const add = (m) => m && group.add(m);
  const H = (x, z) => heightAt(x, z);
  const g0 = (x, z) => H(x, z) - 0.06;
  const layout = districtLayout(map);

  const mats = {
    road: streetRoadMaterial(tex, look),
    junction: roof ? streetRoadMaterial(tex, look) : litMaterial({ map: tex.asphalt, color: look.road || '#ffffff', side: DS }),
    sidewalk: litMaterial({ map: roof ? tex.lot : tex.sidewalk, color: look.walk || '#ffffff', side: DS }),
    lot: litMaterial({ map: tex.lot, color: look.lot, side: DS }),
    tiles: litMaterial({ map: tex.tiles, side: DS }),
    dirt: litMaterial({ map: tex.dirt, side: DS }),
    parking: litMaterial({ map: tex.parking, side: DS }),
    grass: litMaterial({ map: tex.dirt, color: '#5a9a50', side: DS }),
    water: standardMaterial({ color: '#0a1420', roughness: 0.1, metalness: 0.6, envMap: tex.env, envMapIntensity: 1.2 }),
    dark: litMaterial({ color: '#1c1a24' }),
    steel: litMaterial({ color: '#4a4858' }),
    barrier: litMaterial({ map: tex.wallConcrete || tex.wall, color: look.barrier }),
    painted: litMaterial({ vertexColors: true }),
    containers: litMaterial({ map: tex.container, vertexColors: true }),
    shack: litMaterial({ map: tex.corrugated, vertexColors: true }),
    plant: litMaterial({ color: '#1f4a3a' }),
    cone: glowMaterial({ color: '#ff7a1a', intensity: 1.3 }),
    lampHead: glowMaterial({ color: look.lamp, intensity: 3 }),
    windows: glowMaterial({ color: '#ffd9a0', intensity: 1.4 }),
    beacon: glowMaterial({ color: '#ff3030', intensity: 2.6 }),
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

  // Geometry buckets, merged into one mesh per material at the end.
  const bGeos = [];
  const darkGeos = [];
  const signGeos = [];
  const steelGeos = [];
  const yellowGeos = [];
  const coneGeos = [];
  const barrierGeos = [];
  const paintedGeos = [];
  const containerGeos = [];
  const plantGeos = [];
  const glowGeos = [];
  const itemPoolGeos = []; // (light on the ground under what's placed: masts)
  const waterGeos = [];
  const windowGeos = [];
  const shackGeos = [];
  const beaconGeos = [];
  const shutterGeos = []; // Warehouse Row's doorways, shown shut for the boss fight
  const crossingGeos = []; // level crossing lamps, lit while a train is coming
  const quayCranes = [];
  const walkways = new Surface();

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
    if (t1 - t0 < 0.1) return;
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
    return { A, B, L, ux: (B.x - A.x) / L, uz: (B.z - A.z) / L, spans: edgeSpans(map, A, B, L) };
  });
  for (const { A, L, ux, uz, spans } of only ? [] : edgeList) {
    for (const [t0, t1] of spans) {
      strip(road, A, ux, uz, Math.max(HW, t0), Math.min(L - HW, t1), -HW, HW, -0.03, 16);
      strip(walk, A, ux, uz, Math.max(SETBACK, t0), Math.min(L - SETBACK, t1), HW, SETBACK, -0.035, 4);
      strip(walk, A, ux, uz, Math.max(SETBACK, t0), Math.min(L - SETBACK, t1), -SETBACK, -HW, -0.035, 4);
    }
  }
  for (const n of only ? [] : nodes) {
    if (!map.adj[n.id].length) continue;
    flat(junctionRoad, n.x - HW, n.x + HW, n.z - HW, n.z + HW, -0.03);
    flat(walk, n.x - SETBACK, n.x + SETBACK, n.z - SETBACK, n.z + SETBACK, -0.04, 4);
  }

  if (roof && !only) {
    // Rooftops: every deck and lot is the top of a building standing on the
    // ground far below, so the gaps between them are real drops.
    const mass = (x0, x1, z0, z1) => {
      if (x1 - x0 < 0.5 || z1 - z0 < 0.5) return;
      const top = Math.min(H(x0, z0), H(x1, z0), H(x0, z1), H(x1, z1)) - 0.12;
      const hgt = roof + 6;
      const g = new THREE.BoxGeometry(x1 - x0, hgt, z1 - z0);
      boxUvs(g, x1 - x0, hgt, z1 - z0, uvScale, rng);
      g.translate((x0 + x1) / 2, top - hgt / 2, (z0 + z1) / 2);
      bGeos.push(g);
    };
    for (const c of map.cells) mass(...c.lot);
    for (const n of nodes) if (map.adj[n.id].length) mass(n.x - SETBACK, n.x + SETBACK, n.z - SETBACK, n.z + SETBACK);
    for (const { A, L, ux, uz, spans } of edgeList) {
      for (const [t0, t1] of spans) {
        const a = Math.max(SETBACK, t0);
        const b = Math.min(L - SETBACK, t1);
        if (b - a < 0.5) continue;
        const [x0, , z0] = P(A, ux, uz, a, -SETBACK, 0);
        const [x1, , z1] = P(A, ux, uz, b, SETBACK, 0);
        mass(Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1));
      }
    }
    // Launch and landing ramps at every gap, with a warning stripe on the lip.
    for (const gap of map.gaps || []) {
      for (const { x, z, dirX, dirZ, len, width, height } of gap.ramps) {
        const hw = width / 2;
        const pt = (u, v, dy) => {
          const X = x + dirX * u - dirZ * v;
          const Z = z + dirZ * u + dirX * v;
          return [X, H(X, Z) + dy, Z];
        };
        for (let k = 0; k < 4; k++) {
          const u0 = (len * k) / 4;
          const u1 = (len * (k + 1)) / 4;
          const y0 = (height * u0) / len - 0.02;
          const y1 = (height * u1) / len - 0.02;
          road.quad(pt(u0, -hw, y0), pt(u0, hw, y0), pt(u1, hw, y1), pt(u1, -hw, y1), [0, u0 / 16], [1, u0 / 16], [1, u1 / 16], [0, u1 / 16]);
        }
        walk.quad(pt(len, -hw, height), pt(len, hw, height), pt(len, hw, -0.5), pt(len, -hw, -0.5), [0, 0], [1, 0], [1, 1], [0, 1]);
        const [sx, sy, sz] = pt(len - 0.4, 0, height + 0.02);
        yellowGeos.push(box(width, 0.08, 0.8, sx, sy, sz, Math.atan2(dirX, dirZ)));
      }
    }
  }
  add(road.mesh(mats.road));
  add(walk.mesh(mats.sidewalk));
  add(junctionRoad.mesh(mats.junction));

  // --- Lots ---
  const lotSurf = { lot: new Surface(), tiles: new Surface(), dirt: new Surface(), parking: new Surface(), grass: new Surface() };
  const surfFor = {
    buildings: 'lot', warehouses: 'lot', fish: 'lot', shop: 'lot', yard: 'lot', terminal: 'lot', alley: 'lot', arena: 'lot', tanks: 'lot', plaza: 'tiles', quad: 'tiles', market: 'tiles', casino: 'tiles',
    construction: 'dirt', railyard: 'dirt', parking: 'parking', park: 'grass', housing: 'grass',
  };
  for (const c of only ? [] : map.cells) flat(lotSurf[surfFor[c.kind]], c.lot[0], c.lot[1], c.lot[2], c.lot[3], -0.06, c.kind === 'parking' ? 12 : 8);
  add(lotSurf.lot.mesh(mats.lot));
  add(lotSurf.tiles.mesh(mats.tiles));
  add(lotSurf.dirt.mesh(mats.dirt));
  add(lotSurf.parking.mesh(mats.parking));
  add(lotSurf.grass.mesh(mats.grass));

  // --- Buildings ---
  // In a rooftop district every building also runs down to the ground below.
  const addBuilding = (x0, x1, z0, z1, h) => {
    const base = Math.min(H(x0, z0), H(x1, z0), H(x0, z1), H(x1, z1)) - 2 - roof;
    const tall = h + 2 + roof;
    const g = new THREE.BoxGeometry(x1 - x0, tall, z1 - z0);
    boxUvs(g, x1 - x0, tall, z1 - z0, uvScale, rng);
    g.translate((x0 + x1) / 2, base + tall / 2, (z0 + z1) / 2);
    bGeos.push(g);
    const top = base + tall;
    if (!map.authored && rng() < 0.5 && !style.ramshackle) {
      for (let k = 0; k < 1 + Math.floor(rng() * 2); k++) {
        const s = 2 + rng() * 3;
        darkGeos.push(box(s, 1.5 + rng(), s, x0 + s + rng() * Math.max(0, x1 - x0 - 2 * s), top + 0.7, z0 + s + rng() * Math.max(0, z1 - z0 - 2 * s)));
      }
    }
    return top;
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
  // A sign on the face toward the nearest street.
  const buildingSign = (c, r, top) => {
    const rect = [c.lot[0] + 3, c.lot[1] - 3, c.lot[2] + 3, c.lot[3] - 3];
    const sides = [];
    if (c.side.w) sides.push([r[0] - rect[0], -1, 0]);
    if (c.side.e) sides.push([rect[1] - r[1], 1, 0]);
    if (c.side.n) sides.push([r[2] - rect[2], 0, -1]);
    if (c.side.s) sides.push([rect[3] - r[3], 0, 1]);
    if (!sides.length) return;
    const [, nx, nz] = sides.sort((a, b) => a[0] - b[0])[0];
    const cx = (r[0] + r[1]) / 2;
    const cz = (r[2] + r[3]) / 2;
    const fx = nx ? (nx < 0 ? r[0] : r[1]) : cx + (rng() - 0.5) * (r[1] - r[0]) * 0.5;
    const fz = nz ? (nz < 0 ? r[2] : r[3]) : cz + (rng() - 0.5) * (r[3] - r[2]) * 0.5;
    const faceW = nx ? r[3] - r[2] : r[1] - r[0];
    const ground = H(fx, fz);
    const y = Math.min(top - 3, ground + 6 + rng() * Math.min(16, Math.max(0, top - ground - 10)));
    if (y > ground + 4) addSign(fx, y, fz, nx, nz, faceW * 0.8, top - ground - 6);
  };
  // Undercity: shacks and extra floors piled on the roofs (overhanging the
  // edges), tin roof lips, balconies, A/C boxes and neon on the facades.
  const ramshackle = (x0, x1, z0, z1, gMin, top) => {
    const w = x1 - x0;
    const d = z1 - z0;
    let y = top;
    for (let k = 0, n = 1 + Math.floor(rng() * 3); k < n; k++) {
      const sw = Math.max(3, w * (0.3 + rng() * 0.5));
      const sd = Math.max(3, d * (0.3 + rng() * 0.5));
      const sh = 2.6 + rng() * 3.4;
      const cx = x0 - 1.5 + sw / 2 + rng() * Math.max(0, w + 3 - sw);
      const cz = z0 - 1.5 + sd / 2 + rng() * Math.max(0, d + 3 - sd);
      shackGeos.push(colorBox(sw, sh, sd, cx, y + sh / 2, cz, SHACK_COLORS[Math.floor(rng() * SHACK_COLORS.length)]));
      darkGeos.push(box(sw + 0.8, 0.2, sd + 0.8, cx, y + sh + 0.1, cz));
      if (rng() < 0.5) glowGeos.push(box(sw * 0.7, 0.14, 0.14, cx, y + sh - 0.5, cz + sd / 2 + 0.08));
      if (rng() < 0.45) y += sh;
    }
    for (let f = 0; f < 4; f++) {
      if (rng() < 0.4) continue;
      const alongX = f < 2;
      const face = [z0, z1, x0, x1][f];
      const out = f % 2 ? 1 : -1;
      const span = alongX ? w : d;
      for (let fy = 4; fy < top - gMin - 3; fy += 3.2 + rng() * 1.5) {
        const r = rng();
        const a = (alongX ? x0 : z0) + 2 + rng() * Math.max(0, span - 6);
        const at = (off, along = 0) => (alongX ? [a + along, face + out * off] : [face + out * off, a + along]);
        if (r < 0.3) {
          const bw = 2.5 + rng() * 3;
          const [px, pz] = at(0.7, bw / 2);
          darkGeos.push(alongX ? box(bw, 0.2, 1.4, px, gMin + fy, pz) : box(1.4, 0.2, bw, px, gMin + fy, pz));
          const [qx, qz] = at(1.35, bw / 2);
          steelGeos.push(alongX ? box(bw, 1, 0.08, qx, gMin + fy + 0.55, qz) : box(0.08, 1, bw, qx, gMin + fy + 0.55, qz));
        } else if (r < 0.55) {
          const [px, pz] = at(0.35);
          steelGeos.push(box(0.9, 0.7, 0.9, px, gMin + fy, pz));
        } else if (r < 0.62) {
          const [px, pz] = at(0.3);
          const len = Math.min(8, top - gMin - fy);
          glowGeos.push(box(0.2, len, 0.2, px, gMin + fy + len / 2, pz));
        }
      }
    }
  };
  // The casino: a stepped crown with glowing bands, big signs facing the Strip.
  const casinoCrown = (c, x0, x1, z0, z1, top) => {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const w = (x1 - x0) * 0.6;
    const d = (z1 - z0) * 0.6;
    const h = 10 + rng() * 12;
    const g = new THREE.BoxGeometry(w, h, d);
    boxUvs(g, w, h, d, uvScale, rng);
    g.translate(cx, top + h / 2, cz);
    bGeos.push(g);
    glowGeos.push(box(x1 - x0 + 0.4, 0.8, z1 - z0 + 0.4, cx, top - 0.4, cz), box(w + 0.4, 0.8, d + 0.4, cx, top + h - 0.4, cz));
    const faceZ = map.zs[map.avenue] < (c.lot[2] + c.lot[3]) / 2 ? -1 : 1;
    const fz = faceZ < 0 ? z0 : z1;
    const ground = H(cx, fz);
    addSign(cx, ground + 12, fz, 0, faceZ, (x1 - x0) * 0.8, top - ground - 16);
    addSign(cx, ground + 26, fz, 0, faceZ, (x1 - x0) * 0.8, top - ground - 30);
  };
  const drawBuilding = (it) => {
    const [x0, x1, z0, z1] = it.r;
    const gMin = Math.min(H(x0, z0), H(x1, z0), H(x0, z1), H(x1, z1));
    let top;
    if (it.lift) {
      const g = new THREE.BoxGeometry(x1 - x0, it.h, z1 - z0);
      boxUvs(g, x1 - x0, it.h, z1 - z0, uvScale, rng);
      g.translate((x0 + x1) / 2, gMin + it.lift + it.h / 2, (z0 + z1) / 2);
      bGeos.push(g);
      top = gMin + it.lift + it.h;
    } else {
      top = addBuilding(x0, x1, z0, z1, it.h);
    }
    if (style.buildings === 'monolith') glowGeos.push(box(x1 - x0 + 0.3, 0.5, z1 - z0 + 0.3, (x0 + x1) / 2, top - 0.25, (z0 + z1) / 2));
    if (it.lift) return;
    if (style.ramshackle) ramshackle(x0, x1, z0, z1, gMin, top);
    if (it.casino) casinoCrown(it.unit, x0, x1, z0, z1, top);
    else if (it.unit && !map.authored && rng() < look.signs) buildingSign(it.unit, it.r, top);
  };
  const tree = (x, z, s = 1) => {
    const y = H(x, z);
    const trunk = new THREE.CylinderGeometry(0.18 * s, 0.26 * s, 3 * s, 5);
    trunk.translate(x, y + 1.5 * s, z);
    paintedGeos.push(tint(trunk, '#3a2a20'));
    const crown = rng() < 0.5 ? new THREE.ConeGeometry(2.2 * s, 5.5 * s, 6) : new THREE.SphereGeometry(2.5 * s, 6, 4);
    crown.translate(x, y + 5.2 * s, z);
    plantGeos.push(crown);
  };

  // --- Everything in the layout ---
  const OL = objectLights(tex); // (lights with settings of their own)
  const signalA = []; // signal lamps, flashing in turn
  const signalB = [];
  const drawItem = itemDrawer(signalA, signalB, bGeos, darkGeos, signGeos, steelGeos, yellowGeos, coneGeos, barrierGeos, paintedGeos, containerGeos, plantGeos, glowGeos, waterGeos, windowGeos, shackGeos, beaconGeos, shutterGeos, crossingGeos, itemPoolGeos, quayCranes, group, ...OL.buckets);
  // (Another district's objects placed here are drawn by its own view: buildDistrictView.)
  for (const it of only || layout.draw) if (!it.hidden && (only || !it.guest)) drawItem(it, drawLayoutItem);
  function drawLayoutItem(it) {
    const { x, z } = it;
    switch (it.t) {
      case 'bldg':
        drawBuilding(it);
        break;
      case 'spire':
        buildSpire(x, z, it.size, H, bGeos, glowGeos, rng, uvScale);
        break;
      case 'arch': {
        // The block over a courtyard's way through.
        const [x0, x1, z0, z1] = it.r;
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const base = Math.max(H(x0, z0), H(x1, z1), H(cx, cz)) + 9;
        const top = Math.min(H(x0, z0), H(x1, z1)) + it.h;
        if (top - base < 3) break;
        const g = new THREE.BoxGeometry(x1 - x0, top - base, z1 - z0);
        boxUvs(g, x1 - x0, top - base, z1 - z0, uvScale, rng);
        g.translate(cx, (base + top) / 2, cz);
        bGeos.push(g);
        glowGeos.push(box(x1 - x0 - 1, 0.15, z1 - z0 - 1, cx, base - 0.1, cz));
        break;
      }
      case 'bridge': {
        const y = H(x, z);
        const g = new THREE.BoxGeometry(24, 7, 9);
        boxUvs(g, 24, 7, 9, uvScale, rng);
        g.rotateY(it.yaw);
        g.translate(x, y + 11, z);
        bGeos.push(g);
        break;
      }
      case 'dumpster':
        paintedGeos.push(colorBox(1.6, 1.4, 2.4, x, g0(x, z) + 0.7, z, '#2a5a3a', it.yaw));
        break;
      case 'house': {
        const { sx, sz, hgt, axis, edge, dir } = it;
        const y = Math.min(H(x - sx / 2, z - sz / 2), H(x + sx / 2, z + sz / 2)) - 1;
        paintedGeos.push(colorBox(sx, hgt + 1, sz, x, y + (hgt + 1) / 2, z, HOUSE_COLORS[Math.floor(rng() * HOUSE_COLORS.length)]));
        darkGeos.push(box(sx + 0.6, 0.6, sz + 0.6, x, y + hgt + 1.3, z));
        const [fx, fz] = axis === 'x' ? [x, edge - dir * 0.05] : [edge - dir * 0.05, z];
        for (const off of [-2, 2]) {
          for (const fl of [3, 6.5]) {
            if (fl + 1 < hgt && rng() < 0.7) windowGeos.push(axis === 'x' ? box(1.4, 1.3, 0.1, fx + off, y + fl, fz) : box(0.1, 1.3, 1.4, fx, y + fl, fz + off));
          }
        }
        break;
      }
      case 'tank': {
        const { rad, hgt } = it;
        const y = g0(x, z);
        const g = new THREE.CylinderGeometry(rad, rad, hgt, 16);
        g.translate(x, y + hgt / 2, z);
        const rust = it.rust ?? rng() < 0.5;
        paintedGeos.push(tint(g, rust ? '#8a6a50' : '#c8c2b8'));
        const cap = new THREE.CylinderGeometry(rad * 0.6, rad, 1.5, 16);
        cap.translate(x, y + hgt + 0.75, z);
        paintedGeos.push(tint(cap, '#6a6660'));
        glowGeos.push(box(0.5, 0.5, 0.5, x, y + hgt + 1.8, z));
        steelGeos.push(box(0.2, hgt, 0.6, x + rad + 0.2, y + hgt / 2, z));
        break;
      }
      case 'stack': {
        const y = g0(x, z);
        for (let s = 0; s < it.n; s++) {
          containerGeos.push(colorBox(it.alongX ? 2.44 : 12.2, 2.6, it.alongX ? 12.2 : 2.44, x, y + 1.3 + s * 2.6, z, CONTAINER_COLORS[Math.floor(rng() * CONTAINER_COLORS.length)]));
        }
        break;
      }
      case 'wagon': {
        const [x0, x1, z0, z1] = it.r;
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const y = g0(cx, cz);
        if (it.set?.shape ? it.set.shape === 'round' : it.tank) {
          const g = new THREE.CylinderGeometry(1.5, 1.5, Math.max(x1 - x0, z1 - z0) - 0.6, 10);
          g.rotateX(Math.PI / 2);
          if (x1 - x0 > z1 - z0) g.rotateY(Math.PI / 2);
          g.translate(cx, y + 2.6, cz);
          paintedGeos.push(tint(g, WAGON_COLORS[it.color]));
        } else {
          paintedGeos.push(colorBox(x1 - x0 - 0.4, 3.2, z1 - z0 - 0.4, cx, y + 2.7, cz, WAGON_COLORS[it.color]));
        }
        darkGeos.push(box(x1 - x0 - 1, 1, z1 - z0 - 1, cx, y + 0.6, cz));
        break;
      }
      case 'stall': {
        const [x0, x1, z0, z1] = it.r;
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const y = g0(cx, cz);
        paintedGeos.push(colorBox(x1 - x0 - 0.5, 1.1, z1 - z0 - 0.5, cx, y + 0.55, cz, '#3a3040'));
        paintedGeos.push(colorBox(x1 - x0 + 0.3, 0.15, z1 - z0 + 0.3, cx, y + 2.8, cz, AWNINGS[Math.floor(rng() * AWNINGS.length)]));
        steelGeos.push(box(0.12, 2.8, 0.12, x0 + 0.2, y + 1.4, z0 + 0.2), box(0.12, 2.8, 0.12, x1 - 0.2, y + 1.4, z1 - 0.2));
        if (rng() < 0.35) glowGeos.push(box(x1 - x0, 0.12, 0.12, cx, y + 2.6, z0));
        break;
      }
      case 'car': {
        const y = g0(x, z);
        paintedGeos.push(npcCar(Math.floor(rng() * 1000), { x, y: y + 0.06, z, yaw: it.yaw || 0 }));
        break;
      }
      case 'planter': {
        const y = g0(x, z);
        steelGeos.push(box(3, 0.8, 3, x, y + 0.4, z));
        plantGeos.push(box(2.6, 0.2, 2.6, x, y + 0.9, z));
        if (it.tree) {
          const trunk = new THREE.CylinderGeometry(0.2, 0.25, 3, 5);
          trunk.translate(x, y + 2.3, z);
          paintedGeos.push(tint(trunk, '#3a2a20'));
          const crown = new THREE.ConeGeometry(1.8, 4.5, 6);
          crown.translate(x, y + 5.5, z);
          plantGeos.push(crown);
        }
        break;
      }
      case 'basin': {
        const y = g0(x, z);
        const basin = new THREE.CylinderGeometry(5, 5.4, 0.8, 16);
        basin.translate(x, y + 0.4, z);
        steelGeos.push(basin);
        const water = new THREE.CylinderGeometry(4.6, 4.6, 0.1, 16);
        water.translate(x, y + 0.82, z);
        glowGeos.push(water);
        break;
      }
      case 'pond': {
        const y = g0(x, z);
        const rim = new THREE.CylinderGeometry(it.rad + 1, it.rad + 1.4, 0.6, 20);
        rim.translate(x, y + 0.15, z);
        paintedGeos.push(tint(rim, '#6a665e'));
        const water = new THREE.CylinderGeometry(it.rad, it.rad, 0.1, 20);
        water.translate(x, y + 0.42, z);
        waterGeos.push(water);
        break;
      }
      case 'tree':
        tree(x, z, it.s);
        break;
      case 'hedge':
        plantGeos.push(box(it.alongX ? 2.4 : 0.9, 1.1, it.alongX ? 0.9 : 2.4, x, H(x, z) + 0.5, z));
        break;
      case 'jersey':
        barrierGeos.push(box(it.alongX ? 2 : 0.5, 0.9, it.alongX ? 0.5 : 2, x, g0(x, z) + 0.45, z));
        break;
      case 'cone':
        coneGeos.push(cone(x, g0(x, z), z));
        break;
      case 'pile': {
        const pile = new THREE.ConeGeometry(it.rad, it.hgt, 7);
        pile.translate(x, g0(x, z) + it.hgt / 2 - 0.2, z);
        paintedGeos.push(tint(pile, '#5a4030'));
        break;
      }
      case 'scaffold': {
        const y = g0(x, z);
        for (let py = 0; py < 3; py++) steelGeos.push(box(8, 0.2, 2, x, y + 3 + py * 3.5, z));
        for (const dx of [-4, 4]) for (const dz of [-1, 1]) steelGeos.push(box(0.2, 11, 0.2, x + dx, y + 5.5, z + dz));
        break;
      }
      case 'crane': {
        const base = g0(x, z);
        yellowGeos.push(box(2.4, 48, 2.4, x, base + 24, z));
        const jib = new THREE.BoxGeometry(46, 1.6, 1.6);
        jib.translate(12, 0, 0);
        jib.rotateY(it.yaw);
        jib.translate(x, base + 48, z);
        yellowGeos.push(jib);
        steelGeos.push(box(4, 3, 3, x - Math.cos(it.yaw) * 9, base + 46.5, z + Math.sin(it.yaw) * 9));
        glowGeos.push(box(0.6, 0.6, 0.6, x, base + 49.5, z));
        break;
      }
      case 'skeleton': {
        const base = H(x, z) - 1;
        const s = it.s;
        const top = it.floors * 4 + 6;
        for (let fl = 1; fl <= it.floors; fl++) darkGeos.push(box(s, 0.5, s, x, base + fl * 4, z));
        for (let a = -s / 2; a <= s / 2; a += 8) for (let b = -s / 2; b <= s / 2; b += 8) steelGeos.push(box(0.5, top, 0.5, x + a, base + top / 2, z + b));
        glowGeos.push(box(0.6, 0.6, 0.6, x, base + top + 1, z));
        break;
      }
      case 'fence': {
        const [x0, x1, z0, z1] = it.r;
        const len = it.alongX ? x1 - x0 : z1 - z0;
        const xc = (x0 + x1) / 2;
        const zc = (z0 + z1) / 2;
        for (let t = 0; t <= len; t += 3) {
          const px = it.alongX ? x0 + t : xc;
          const pz = it.alongX ? zc : z0 + t;
          const y = g0(px, pz);
          steelGeos.push(box(0.15, 3.2, 0.15, px, y + 1.6, pz));
          if (t + 3 <= len + 0.01) darkGeos.push(it.alongX ? box(3, 2.6, 0.06, px + 1.5, y + 1.7, pz) : box(0.06, 2.6, 3, px, y + 1.7, pz + 1.5));
        }
        break;
      }
      case 'mast': {
        const y = g0(x, z);
        steelGeos.push(box(0.7, 22, 0.7, x, y + 11, z));
        OL.head(it, glowGeos, box(3.2, 1.2, 1.2, x, y + 22.5, z));
        OL.pool(it, itemPoolGeos, 30, (S) => new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2).translate(x, y + 0.08, z));
        break;
      }
      case 'ctunnel': {
        // Three containers wide, three long, inner walls cut out; a second layer on top.
        const h = it.len / 2;
        const y = g0(x, z);
        const W = 2 * TUNNEL_HALF + 0.32;
        const along = (w, hgt, l, ox, oy) => (it.alongX ? [l, hgt, w, x, y + oy, z + ox] : [w, hgt, l, x + ox, y + oy, z]);
        const pick = () => CONTAINER_COLORS[Math.floor(rng() * CONTAINER_COLORS.length)];
        for (let k = 0; k < 3; k++) {
          const off = -h + it.len / 6 + (k * it.len) / 3;
          const seg = (w, hgt, ox, oy) => {
            const [a, b, c, px, py, pz] = along(w, hgt, it.len / 3 - 0.2, ox, oy);
            return it.alongX ? colorBox(a, b, c, px + off, py, pz, pick()) : colorBox(a, b, c, px, py, pz + off, pick());
          };
          containerGeos.push(seg(0.16, 2.6, -TUNNEL_HALF - 0.08, 1.3), seg(0.16, 2.6, TUNNEL_HALF + 0.08, 1.3), seg(W, 0.16, 0, 2.6));
          for (let c = -1; c <= 1; c++) containerGeos.push(seg(2.4, 2.6, c * 2.44, 2.6 + 1.3 + 0.08));
          const [lw, lh, ll, lx, ly, lz] = along(0.3, 0.1, it.len / 3 - 3, 0, 2.45);
          glowGeos.push(it.alongX ? box(lw, lh, ll, lx + off, ly, lz) : box(lw, lh, ll, lx, ly, lz + off));
        }
        break;
      }
      case 'signal': {
        const y = g0(x, z);
        steelGeos.push(box(0.3, 4, 0.3, x, y + 2, z), box(1.6, 0.5, 0.2, x, y + 3.6, z));
        const lamps = (s) => [-0.5, 0.5].map((dx) => box(0.4 * s, 0.4 * s, 0.3 * s, x + dx, y + 3.6, z));
        darkGeos.push(...lamps(1));
        // Its two lamps flashing in turn, as a crossing's do (Animation off: dark).
        if (!it.set?.still) {
          const [a, b] = lamps(1.05);
          signalA.push(a);
          signalB.push(b);
        }
        // (And lit ones over them that the race screen flashes when a train comes.)
        if (map.authored) crossingGeos.push(...lamps(1.1));
        break;
      }
      case 'gantry': {
        const [ax, az] = it.a;
        const [bx, bz] = it.b;
        const ya = g0(ax, az);
        steelGeos.push(box(1.6, 24, 1.6, ax, ya + 12, az), box(1.6, 24, 1.6, bx, g0(bx, bz) + 12, bz));
        const len = Math.hypot(bx - ax, bz - az);
        yellowGeos.push(box(2.2, 2.2, len + 2, (ax + bx) / 2, ya + 24, (az + bz) / 2, Math.atan2(bx - ax, bz - az)));
        darkGeos.push(box(4, 2.5, 5, (ax + bx) / 2, ya + 22, az + (bz - az) * 0.35 + (bx - ax) * 0));
        break;
      }
      case 'post':
        steelGeos.push(box(0.6, it.hgt, 0.6, x, g0(x, z) + it.hgt / 2, z));
        break;
      case 'hvac': {
        const y = g0(x, z);
        steelGeos.push(box(2.6, 1.6, 2.6, x, y + 0.8, z));
        darkGeos.push(box(1.6, 0.25, 1.6, x, y + 1.7, z));
        break;
      }
      case 'watertank': {
        const y = g0(x, z);
        for (const dx of [-1, 1]) for (const dz of [-1, 1]) steelGeos.push(box(0.2, 2.5, 0.2, x + dx, y + 1.25, z + dz));
        const g = new THREE.CylinderGeometry(1.5, 1.5, 3, 12);
        g.translate(x, y + 4, z);
        paintedGeos.push(tint(g, '#6a4a30'));
        const lid = new THREE.ConeGeometry(1.6, 1, 12);
        lid.translate(x, y + 6, z);
        paintedGeos.push(tint(lid, '#3a3a40'));
        break;
      }
      case 'antenna': {
        const y = g0(x, z);
        steelGeos.push(box(0.25, 10, 0.25, x, y + 5, z));
        beaconGeos.push(box(0.5, 0.5, 0.5, x, y + 10.2, z));
        break;
      }
      case 'through': {
        // A tower straddling the deck, with a lit tunnel straight through it.
        const { ux, uz, h } = it;
        const y = H(x, z);
        const yaw = Math.atan2(ux, uz);
        const W = 2 * SETBACK + 24;
        const D = 34;
        const g = new THREE.BoxGeometry(W, h, D);
        boxUvs(g, W, h, D, uvScale, rng);
        g.rotateY(yaw);
        g.translate(x, y + 9 + h / 2, z);
        bGeos.push(g);
        for (const s of [-1, 1]) {
          const w = new THREE.BoxGeometry(12, 9.2, D);
          boxUvs(w, 12, 9.2, D, uvScale, rng);
          w.rotateY(yaw);
          w.translate(x - uz * s * (SETBACK + 6), y + 4.5, z + ux * s * (SETBACK + 6));
          bGeos.push(w);
        }
        glowGeos.push(box(2 * SETBACK - 2, 0.2, D - 2, x, y + 8.8, z, yaw));
        for (const e of [-1, 1]) glowGeos.push(box(2 * SETBACK + 1, 0.6, 0.6, x + ux * e * (D / 2), y + 9.2, z + uz * e * (D / 2), yaw));
        break;
      }
      // --- Authored districts (sim/authoredLayout.js) ---
      case 'dock': {
        // A concrete loading dock, a yellow line along its drop to the street.
        const [x0, x1, z0, z1] = it.r;
        paintedGeos.push(colorBox(x1 - x0, it.h, z1 - z0, (x0 + x1) / 2, it.h / 2, (z0 + z1) / 2, '#8a8680'));
        const ez = it.face === 'n' ? z0 + 0.2 : z1 - 0.2;
        yellowGeos.push(box(x1 - x0, 0.06, 0.4, (x0 + x1) / 2, it.h + 0.03, ez));
        break;
      }
      case 'dockRamp':
      case 'platformRamp':
        paintedGeos.push(tint(rampGeometry(it.ramp), '#7a7670'));
        break;
      case 'wall': {
        // Brick walls closing the alley between warehouses.
        const [x0, x1, z0, z1] = it.r;
        paintedGeos.push(colorBox(x1 - x0, it.h, z1 - z0, (x0 + x1) / 2, it.h / 2, (z0 + z1) / 2, '#6a4238'));
        darkGeos.push(box(x1 - x0 + 0.1, 0.2, z1 - z0 + 0.2, (x0 + x1) / 2, it.h + 0.1, (z0 + z1) / 2));
        break;
      }
      case 'shellWall': {
        const [x0, x1, z0, z1] = it.r;
        const g = new THREE.BoxGeometry(x1 - x0, it.h, z1 - z0);
        boxUvs(g, x1 - x0, it.h, z1 - z0, uvScale, rng);
        g.translate((x0 + x1) / 2, it.h / 2, (z0 + z1) / 2);
        bGeos.push(g);
        break;
      }
      case 'shell': {
        // Warehouse Row: trusses across the hall, roof panels left at the ends
        // and the middle open to the sky; walls over the doorways, and the
        // shutters that come down for the boss fight.
        const [x0, x1, z0, z1] = it.r;
        for (let tx = x0 + 10; tx < x1; tx += 20) steelGeos.push(box(0.6, 0.8, z1 - z0, tx, it.h - 0.6, (z0 + z1) / 2));
        for (const [a, b] of [[x0, x0 + 120], [x1 - 80, x1]]) {
          const g = new THREE.BoxGeometry(b - a, 0.3, z1 - z0 + 2);
          boxUvs(g, b - a, 0.3, z1 - z0, uvScale, rng);
          g.translate((a + b) / 2, it.h, (z0 + z1) / 2);
          bGeos.push(g);
        }
        for (const [wz, list] of [[z0 - 0.5, it.doors.n], [z1 + 0.5, it.doors.s]]) {
          for (const [a, b] of list) {
            const g = new THREE.BoxGeometry(b - a, it.h - 6, 1);
            boxUvs(g, b - a, it.h - 6, 1, uvScale, rng);
            g.translate((a + b) / 2, 6 + (it.h - 6) / 2, wz);
            bGeos.push(g);
            shutterGeos.push(box(b - a, 6, 0.3, (a + b) / 2, 3, wz));
          }
        }
        break;
      }
      case 'shed': {
        // Fish and ice sheds: painted, low, two doors on the street face.
        const [x0, x1, z0, z1] = it.r;
        paintedGeos.push(colorBox(x1 - x0, it.h, z1 - z0, (x0 + x1) / 2, it.h / 2, (z0 + z1) / 2, ['#d8dce0', '#b8c8d8', '#c8c0b0'][it.tone || 0]));
        paintedGeos.push(colorBox(x1 - x0 + 0.6, 0.4, z1 - z0 + 0.6, (x0 + x1) / 2, it.h + 0.2, (z0 + z1) / 2, '#6a7480'));
        const fz = it.face === 'n' ? z0 - 0.06 : z1 + 0.06;
        for (const f of [0.3, 0.7]) darkGeos.push(box(5, 4, 0.1, x0 + (x1 - x0) * f, 2, fz));
        break;
      }
      case 'iceplant': {
        const [x0, x1, z0, z1] = it.r;
        paintedGeos.push(colorBox(x1 - x0, it.h, z1 - z0, x, it.h / 2, z, '#e8eef2'));
        for (const dx of [-5, 0, 5]) steelGeos.push(box(3, 1.6, 3, x + dx, it.h + 0.8, z));
        glowGeos.push(box(x1 - x0 + 0.2, 0.3, z1 - z0 + 0.2, x, it.h - 0.4, z));
        break;
      }
      case 'crates':
        for (let k = 0; k < it.n; k++) paintedGeos.push(colorBox(2.4, 1.15, 2.4, x, 0.6 + k * 1.2, z, k % 2 ? '#7a5a3a' : '#8a6a44'));
        break;
      case 'tyres':
        for (let k = 0; k < 4; k++) {
          const g = tireGeometry(1.2, 0.55, 0.42); // (a hole down the middle)
          g.translate(x, 0.22 + k * 0.44, z);
          darkGeos.push(g);
        }
        break;
      case 'trailer': {
        // A box trailer on its wheels; every third has its cab on, all inside the bay.
        // (Set in the T&T SDK: the whole truck, the trailer only, or the cab only.)
        const part = it.set?.part || (it.cab ? 'whole' : 'trailer');
        const cab = part !== 'trailer';
        const len = cab ? 12 : 15.6;
        const tz = cab ? z + 1.9 : z;
        const color = CONTAINER_COLORS[(((Math.round(x) + Math.round(z)) % 7) + 7) % 7];
        if (part !== 'cab') {
          paintedGeos.push(colorBox(2.5, 2.8, len, x, 2.6, tz, color));
          for (const dz of [-len / 2 + 1.5, len / 2 - 2.5, len / 2 - 1.2]) darkGeos.push(box(2.4, 1, 1, x, 0.5, tz + dz));
        }
        if (cab) {
          paintedGeos.push(colorBox(2.5, 3, 3.4, x, 1.8, z - 6.2, '#c83a2a'));
          darkGeos.push(box(2.3, 0.9, 0.1, x, 2.6, z - 7.95), box(2.4, 1, 1, x, 0.5, z - 6.2));
        }
        break;
      }
      case 'goodsShed': {
        // The old goods shed across the yard's corner, a canopy over its platform.
        const o = it.obb;
        const g = obbBox(o, it.h, 0);
        boxUvs(g, o.hw * 2, it.h, o.hd * 2, uvScale, rng);
        bGeos.push(g);
        paintedGeos.push(tint(obbBox({ ...o, hw: o.hw + 0.6, hd: o.hd + 0.6 }, 0.5, it.h), '#6a4a3a'));
        const dx = Math.sin(o.yaw);
        const dz = Math.cos(o.yaw);
        darkGeos.push(obbBox({ ...o, x: o.x - dz * (o.hw + 5), z: o.z + dx * (o.hw + 5), hw: 5, hd: o.hd - 4 }, 0.4, 6.5));
        break;
      }
      case 'loadPlatform': {
        const o = it.obb;
        paintedGeos.push(tint(obbBox(o, it.h, 0), '#8a8680'));
        const dx = Math.sin(o.yaw);
        const dz = Math.cos(o.yaw);
        for (const s of [-1, 1]) yellowGeos.push(obbBox({ ...o, x: o.x + dz * s * (o.hw - 0.2), z: o.z - dx * s * (o.hw - 0.2), hw: 0.2 }, 0.06, it.h));
        break;
      }
      case 'drydock': {
        // The dry dock: sunken floor, walls up to quay level (you can drive on
        // their tops), keel blocks, and the caisson gate against the bay.
        const { x0, x1, z0, z1, depth, wall } = it;
        paintedGeos.push(colorBox(x1 - x0, 0.4, z1 - z0, (x0 + x1) / 2, -depth - 0.2, (z0 + z1) / 2, '#4a4844'));
        paintedGeos.push(colorBox(x1 - x0 + 2 * wall, depth, wall, (x0 + x1) / 2, -depth / 2, z0 - wall / 2, '#6a6660'));
        for (const sx of [x0 - wall / 2, x1 + wall / 2]) paintedGeos.push(colorBox(wall, depth, z1 - z0 + wall, sx, -depth / 2, (z0 + z1 + wall) / 2, '#6a6660'));
        paintedGeos.push(colorBox(x1 - x0, depth, wall, (x0 + x1) / 2, -depth / 2, z1 + wall / 2, '#3a3a40'));
        yellowGeos.push(box(x1 - x0, 0.06, 0.5, (x0 + x1) / 2, 0.03, z0 - 0.3));
        for (const sx of [x0 + 0.3, x1 - 0.3]) yellowGeos.push(box(0.5, 0.06, z1 - z0, sx, 0.03, (z0 + z1) / 2));
        for (let k = 0; k < 3; k++) steelGeos.push(box(x1 - x0, 0.3, 0.3, (x0 + x1) / 2, -depth + 3 + k * 3, z0 + 0.3));
        const hl = it.hull;
        for (let kx = hl.x - hl.hw + 8; kx < hl.x + hl.hw - 4; kx += 8) darkGeos.push(box(2, 1.5, hl.hd * 1.4, kx, -depth + 0.75, hl.z));
        break;
      }
      case 'hull': {
        // A rusting freighter on the keel blocks: hull, hatches, the bridge at the stern.
        const { hw, hd } = it;
        const base = it.y;
        const shape = new THREE.Shape([new THREE.Vector2(-hw, -hd), new THREE.Vector2(hw - 22, -hd), new THREE.Vector2(hw, 0), new THREE.Vector2(hw - 22, hd), new THREE.Vector2(-hw, hd)]);
        for (const [y0, hgt, col] of [[base, 8, '#7a3a24'], [base + 8, it.h - 8, '#2a2a30']]) {
          const g = new THREE.ExtrudeGeometry(shape, { depth: hgt, bevelEnabled: false });
          g.rotateX(-Math.PI / 2);
          g.translate(x, y0, z);
          paintedGeos.push(tint(g, col));
        }
        const top = base + it.h;
        for (let k = 0; k < 6; k++) paintedGeos.push(colorBox(18, 1.2, hd * 1.3, x - hw + 60 + k * 26, top + 0.6, z, '#5a3a2a'));
        paintedGeos.push(colorBox(20, 12, hd * 1.6, x - hw + 18, top + 6, z, '#d8d0c0'));
        darkGeos.push(box(20.4, 1.2, hd * 1.6 + 0.4, x - hw + 18, top + 9, z));
        paintedGeos.push(colorBox(4, 8, 4, x - hw + 12, top + 16, z, '#2a2a30'));
        glowGeos.push(box(0.6, 0.6, 0.6, x - hw + 18, top + 13, z));
        break;
      }
      case 'gate': {
        // Where a road leaves the district: barriers across it and a boom.
        const [, , z0, z1] = it.r;
        for (let bz = z0 + 1; bz < z1; bz += 2.1) barrierGeos.push(box(0.5, 0.9, 2, x, 0.45, bz));
        paintedGeos.push(colorBox(0.3, 1.4, 0.3, x, 0.7, z0 + 0.5, '#c83a2a'));
        paintedGeos.push(colorBox(0.2, 0.2, z1 - z0, x, 1.3, (z0 + z1) / 2, it.set?.top || '#e8e0d0'));
        break;
      }
      case 'quayCrane': {
        // On its rails (z: the quay edge): legs on the apron, the boom out over
        // the bay. Drawn here, so a copy moves and turns with its item.
        const edge = z;
        const [la, lb] = CRANE_LEGS;
        for (const lz of CRANE_LEGS) {
          for (const dx of [-9, 9]) paintedGeos.push(colorBox(1.6, 32, 1.6, x + dx, 16, edge + lz, '#c83a2a'));
          paintedGeos.push(colorBox(22, 3, 3, x, 32, edge + lz, '#e0e0e8'));
          darkGeos.push(box(3, 1.4, 4, x - 9, 0.7, edge + lz), box(3, 1.4, 4, x + 9, 0.7, edge + lz));
        }
        for (const dx of [-9, 9]) paintedGeos.push(colorBox(1.2, 1.2, lb - la, x + dx, 14, edge + (la + lb) / 2, '#c83a2a'));
        paintedGeos.push(colorBox(3, 2.5, 84, x, 34.8, edge + 8, '#c83a2a'));
        paintedGeos.push(colorBox(9, 5, 9, x, 38.5, edge + la - 6, '#e0e0e8'));
        darkGeos.push(box(4, 2, 5, x, 32.6, edge + 22), box(12.2, 0.6, 2.6, x, 16, edge + 22));
        steelGeos.push(box(0.15, 15.6, 0.15, x - 1.2, 23.8, edge + 22), box(0.15, 15.6, 0.15, x + 1.2, 23.8, edge + 22));
        glowGeos.push(box(0.8, 0.8, 0.8, x, 36.6, edge + 49));
        break;
      }
      case 'yardGantry': {
        // (From end to end, a and b: they move and turn with it.)
        const [ax, az] = it.a;
        const [bx, bz] = it.b;
        const len = Math.hypot(bx - ax, bz - az);
        const yaw = Math.atan2(bx - ax, bz - az);
        const y = g0((ax + bx) / 2, (az + bz) / 2);
        steelGeos.push(box(0.8, 0.8, len + 0.6, (ax + bx) / 2, y + 8, (az + bz) / 2, yaw));
        for (let t = 4; t < len; t += 6) glowGeos.push(box(0.5, 0.5, 0.5, ax + ((bx - ax) * t) / len, y + 7.3, az + ((bz - az) * t) / len, yaw));
        break;
      }
      case 'pipes': {
        for (const py of [3.4, 4.1]) {
          const g = new THREE.CylinderGeometry(0.3, 0.3, it.x1 - it.x0, 6);
          g.rotateZ(Math.PI / 2);
          g.translate((it.x0 + it.x1) / 2, py, it.z);
          steelGeos.push(g);
        }
        for (let px = it.x0; px <= it.x1; px += 12) steelGeos.push(box(0.4, 4.2, 0.4, px, 2.1, it.z));
        break;
      }
      case 'shopSign': {
        const t = textTexture(it.set?.text || 'WRENCH & RUST', it.set?.color || '#ff7a1a');
        // (Its letters as tall as WRENCH & RUST's always were: other words make it wider or narrower.)
        const per = it.w / (textWidth('WRENCH & RUST') + 6);
        const w = t.image.width * per;
        const h = t.image.height * per;
        const g = new THREE.PlaneGeometry(w, h);
        g.translate(x, 7.6 - h / 2 + 1.2, z + 0.25);
        add(new THREE.Mesh(g, glowMaterial({ map: t, intensity: 2 })));
        // (A board behind its letters: not see-through from the back.)
        darkGeos.push(box(w + 0.2, h + 0.2, 0.12, x, 7.6 - h / 2 + 1.2, z + 0.17));
        // (A copy, off its wall: two posts.)
        if (it.copy) for (const s of [-1, 1]) steelGeos.push(box(0.3, 8.8 - h, 0.3, x + s * w * 0.4, (8.8 - h) / 2, z + 0.1));
        break;
      }
      default:
        break;
    }
    if (it.t === 'bldg' && it.warehouse) {
      // Roller doors on a warehouse's street face.
      const [x0, x1, z0, z1] = it.r;
      const fz = it.face === 'n' ? z0 - 0.06 : z1 + 0.06;
      for (const f of [0.3, 0.7]) darkGeos.push(box(6, 5, 0.1, x0 + (x1 - x0) * f, 2.5, fz));
    }
  }

  // --- Decoration on sites and special lots (nothing here is solid) ---
  const pathOf = new Map(map.corridors.map((c) => [c.cell, samplePath(c.points)]));
  for (const c of only ? [] : [...map.cells.filter((q) => !q.site), ...map.sites]) {
    const [lx0, lx1, lz0, lz1] = c.lot;
    const path = pathOf.get(c);
    const clear = (x, z, m) => !path || path.every(([px, pz]) => Math.hypot(px - x, pz - z) > m);
    if (c.kind === 'park' && path) {
      // A lit walkway through the park.
      for (let k = 0; k + 1 < path.length; k++) {
        const [ax, az, dx, dz] = path[k];
        const [bx, bz] = path[k + 1];
        const v = (px, pz, l) => [px - dz * l, H(px - dz * l, pz + dx * l) - 0.045, pz + dx * l];
        walkways.quad(v(ax, az, -4), v(ax, az, 4), v(bx, bz, 4), v(bx, bz, -4), [0, k * 0.4], [1, k * 0.4], [1, (k + 1) * 0.4], [0, (k + 1) * 0.4]);
      }
      for (let k = 2; k < path.length; k += 5) {
        const [x, z, dx, dz] = path[k];
        for (const s of [-1, 1]) glowGeos.push(box(0.3, 0.9, 0.3, x + dz * s * 5.5, g0(x, z) + 0.45, z - dx * s * 5.5));
      }
    } else if (c.kind === 'railyard' && c.tracksZ) {
      // Authored yard: ballast and rails on every track, clear of the goods
      // shed and its platform (the yard's gantries are layout items).
      const gs = map.goodsShed;
      const yaw = gs ? Math.atan2(gs.platform.dirX, gs.platform.dirZ) : 0;
      const inside = (px, pz, o, hw, hd) => {
        const dx = Math.sin(yaw);
        const dz = Math.cos(yaw);
        const across = (px - o.x) * dz - (pz - o.z) * dx;
        const along = (px - o.x) * dx + (pz - o.z) * dz;
        return Math.abs(across) < hw && Math.abs(along) < hd;
      };
      const blocked = (px, pz) => gs && (inside(px, pz, gs.shed, gs.shed.wid / 2 + 2, gs.shed.len / 2 + 2) || inside(px, pz, gs.platform, gs.platform.wid / 2 + 2, gs.platform.len / 2 + 8));
      for (const z of c.tracksZ) {
        for (let x = lx0; x < lx1; x += 10) {
          const seg = Math.min(10, lx1 - x);
          if (blocked(x + seg / 2, z)) continue;
          darkGeos.push(box(seg, 0.12, 3, x + seg / 2, 0.0, z));
          for (const o of [-0.72, 0.72]) steelGeos.push(box(seg, 0.16, 0.12, x + seg / 2, 0.14, z + o));
        }
      }
    } else if (c.kind === 'railyard') {
      // Ballast and rails along the yard, gantry beams with signal lights.
      const alongX = lx1 - lx0 >= lz1 - lz0;
      const U = alongX ? lx1 - lx0 : lz1 - lz0;
      const V = alongX ? lz1 - lz0 : lx1 - lx0;
      for (let v = 6; v < V - 4; v += 6) {
        for (let u = 0; u < U; u += 20) {
          const seg = Math.min(20, U - u);
          const [x, z] = alongX ? [lx0 + u + seg / 2, lz0 + v] : [lx0 + v, lz0 + u + seg / 2];
          if (!clear(x, z, 9)) continue;
          const y = g0(x, z);
          darkGeos.push(alongX ? box(seg, 0.12, 3, x, y + 0.06, z) : box(3, 0.12, seg, x, y + 0.06, z));
          for (const o of [-0.72, 0.72]) steelGeos.push(alongX ? box(seg, 0.16, 0.12, x, y + 0.2, z + o) : box(0.12, 0.16, seg, x + o, y + 0.2, z));
        }
      }
      for (const u of [12, U - 12]) {
        const [ax, az, bx, bz] = alongX ? [lx0 + u, lz0 + 2, lx0 + u, lz1 - 2] : [lx0 + 2, lz0 + u, lx1 - 2, lz0 + u];
        const y = g0((ax + bx) / 2, (az + bz) / 2);
        steelGeos.push(box(Math.abs(bx - ax) + 0.6, 0.8, Math.abs(bz - az) + 0.6, (ax + bx) / 2, y + 8, (az + bz) / 2));
        for (let v = 6; v < V - 4; v += 6) {
          const [x, z] = alongX ? [lx0 + u, lz0 + v] : [lx0 + v, lz0 + u];
          glowGeos.push(box(0.5, 0.5, 0.5, x, y + 7.3, z));
        }
      }
    } else if (c.kind === 'market' && path) {
      // Strings of lights over the walkway and neon gates at each end.
      for (let k = 3; k < path.length - 3; k += 4) {
        const [x, z, dx, dz] = path[k];
        glowGeos.push(box(0.1, 0.1, 15, x, g0(x, z) + 5.5, z, Math.atan2(dx, dz) + Math.PI / 2));
      }
      for (const k of [2, path.length - 3]) {
        const [x, z, dx, dz] = path[Math.max(0, Math.min(path.length - 1, k))];
        glowGeos.push(box(15, 1.2, 0.4, x, g0(x, z) + 7.2, z, Math.atan2(dx, dz)));
      }
    } else if (c.kind === 'casino' && path) {
      // A glowing canopy over the drive-through.
      const [mx, mz, dx, dz] = path[Math.floor(path.length / 2)];
      const yaw = Math.atan2(dx, dz);
      const y = g0(mx, mz);
      darkGeos.push(box(20, 1.2, 34, mx, y + 8.6, mz, yaw));
      glowGeos.push(box(18, 0.2, 32, mx, y + 7.9, mz, yaw));
    } else if (c.kind === 'tanks' && !map.authored) {
      for (const z of [lz0 + 3, lz1 - 3]) steelGeos.push(box(lx1 - lx0 - 6, 0.7, 0.7, (lx0 + lx1) / 2, g0((lx0 + lx1) / 2, z) + 3.4, z));
    }
  }

  // --- Street lamps along every street (not up on the rooftops) ---
  const lampGeos = [];
  const headGeos = [];
  const poolGeos = [];
  // (Only where the layout still has the post: a race clears the ones on its route.)
  const lampAt = new Set(layout.items.filter((it) => it.lamp).map((it) => `${Math.round((it.r[0] + it.r[1]) / 2)},${Math.round((it.r[2] + it.r[3]) / 2)}`));
  if (!roof && !only) {
    for (const { A, L, ux, uz } of edgeList) {
      for (let t = 20; t < L - 20; t += 38) {
        for (const side of [-1, 1]) {
          const lat = side * (SETBACK + 0.8);
          const [x, y, z] = P(A, ux, uz, t, lat, 0);
          if (!lampAt.has(`${Math.round(x)},${Math.round(z)}`)) continue;
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
  }

  // --- Undercity: cables and lanterns strung across the streets ---
  if (style.ramshackle && !only) {
    for (const { A, L, ux, uz } of edgeList) {
      for (let k = 0, n = Math.floor(rng() * 4); k < n; k++) {
        const t = SETBACK + rng() * Math.max(1, L - 2 * SETBACK);
        const [x, y, z] = P(A, ux, uz, t, 0, 0);
        const hgt = 8 + rng() * 7;
        darkGeos.push(box(0.08, 0.08, 2 * SETBACK + 6, x, y + hgt, z, Math.atan2(ux, uz) + Math.PI / 2));
        if (rng() < 0.6) for (let q = -2; q <= 2; q++) glowGeos.push(box(0.3, 0.3, 0.3, x - uz * q * 4, y + hgt - 0.4, z + ux * q * 4));
      }
    }
  }

  // --- Tunnels: covered stretches of street under the upper city ---
  for (const [a, b] of only ? [] : map.tunnels || []) {
    const A = nodes[a];
    const B = nodes[b];
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    const ux = (B.x - A.x) / L;
    const uz = (B.z - A.z) / L;
    const yaw = Math.atan2(ux, uz);
    for (let t = SETBACK; t < L - SETBACK; t += 10) {
      const [x, y, z] = P(A, ux, uz, t + 5, 0, 0);
      darkGeos.push(box(2 * SETBACK + 4, 1.4, 10.2, x, y + 9.2, z, yaw));
      glowGeos.push(box(0.4, 0.15, 6, x, y + 8.4, z, yaw));
      for (const s of [-1, 1]) darkGeos.push(box(1.2, 9, 1.2, x - uz * s * (SETBACK + 1.2), y + 4.5, z + ux * s * (SETBACK + 1.2)));
    }
  }

  // --- The freight line: rails on their own right of way, a buffer stop on the quay ---
  if (map.freight && !only) {
    const { x, z0, z1 } = map.freight;
    for (let z = z0; z < z1; z += 10) {
      const len = Math.min(10, z1 - z);
      const y = g0(x, z + len / 2);
      darkGeos.push(box(3, 0.12, len, x, y + 0.06, z + len / 2));
      for (const o of [-0.72, 0.72]) steelGeos.push(box(0.12, 0.16, len, x + o, y + 0.2, z + len / 2));
    }
    yellowGeos.push(box(3.4, 1.2, 1, x, g0(x, z1) + 0.6, z1 + 0.5));
  }

  // --- Landmarks ---
  const f = only ? [] : style.features;
  const bounds = map.bounds;
  const minY = Math.min(...nodes.map((n) => n.y));
  if (f.includes('waterfront')) {
    const edge = bounds.maxZ + SETBACK + 30;
    const b = map.authored ? map.basin : null;
    // Stretches of [x0, x1] left once the piers (and the dry dock) are cut out.
    const cuts = [...map.piers.map((p) => [p.x - SETBACK - 1, p.x + SETBACK + 1]), ...(b ? [[b.x0 - b.wall, b.x1 + b.wall]] : [])].sort((p, q) => p[0] - q[0]);
    const between = (x0, x1) => {
      const out = [];
      let x = x0;
      for (const [c0, c1] of cuts) {
        if (c0 > x) out.push([x, Math.min(c0, x1)]);
        x = Math.max(x, c1);
      }
      if (x1 > x) out.push([x, x1]);
      return out.filter(([a, c]) => c > a);
    };
    if (map.authored) {
      // The quay apron between Quay Road and the water, open where the dry dock
      // cuts into it; the bay at the district's water level.
      const apron = new Surface();
      const ax0 = bounds.minX - SETBACK - 50;
      const ax1 = bounds.maxX + SETBACK + 50;
      const bx = b ? [b.x0 - b.wall, b.x1 + b.wall] : null;
      for (const [x0, x1] of bx ? [[ax0, bx[0]], [bx[1], ax1]] : [[ax0, ax1]]) flat(apron, x0, x1, bounds.maxZ + SETBACK, edge, -0.06, 8);
      if (bx) flat(apron, bx[0], bx[1], bounds.maxZ + SETBACK, b.z0 - b.wall, -0.06, 8);
      add(apron.mesh(mats.lot));
      const wy = style.waterY ?? -0.5;
      const far = edge + 1500;
      const water = (x0, x1, z0) => add(new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, far - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, wy, (z0 + far) / 2), mats.water));
      if (bx) {
        water(-2500, bx[0], edge);
        water(bx[1], 2500, edge);
        water(bx[0], bx[1], b.z1 + b.wall);
      } else water(-2500, 2500, edge);
      // The quay wall face down to the water, a yellow line along the top.
      for (const [x0, x1] of between(ax0, ax1)) {
        steelGeos.push(box(x1 - x0, 2.5, 3, (x0 + x1) / 2, -1.33, edge - 1.5));
        yellowGeos.push(box(x1 - x0, 0.06, 0.4, (x0 + x1) / 2, -0.03, edge - 0.6));
      }
      // Quay cranes on their rails: legs on the apron, the boom out over the bay.
      for (const lz of CRANE_LEGS) for (const [x0, x1] of between(ax0, ax1)) steelGeos.push(box(x1 - x0, 0.1, 0.3, (x0 + x1) / 2, -0.01, edge + lz));
    } else {
      // Concrete quay apron between the last street and the water.
      const apron = new Surface();
      flat(apron, bounds.minX - SETBACK - 3, bounds.maxX + SETBACK + 3, bounds.maxZ + SETBACK, edge, -0.06, 8);
      add(apron.mesh(mats.lot));
      add(new THREE.Mesh(new THREE.PlaneGeometry(4000, 1500).rotateX(-Math.PI / 2).translate(0, minY - 1.2, edge + 750), mats.water));
      // Quay edge, broken where the piers run out over the water.
      for (const [x0, x1] of between(bounds.minX - 200, bounds.maxX + 200)) steelGeos.push(box(x1 - x0, 2, 3, (x0 + x1) / 2, minY - 0.3, edge));
      for (let x = bounds.minX; x <= bounds.maxX; x += 140) {
        const y = minY;
        if (map.piers.some((p) => Math.abs(p.x - x) < 32)) continue;
        for (const dz of [4, 20]) for (const dx of [-9, 9]) paintedGeos.push(colorBox(1.6, 32, 1.6, x + dx, y + 16, edge + dz, '#c83a2a'));
        paintedGeos.push(colorBox(22, 3, 3, x, y + 32, edge + 4, '#e0e0e8'), colorBox(22, 3, 3, x, y + 32, edge + 20, '#e0e0e8'));
        paintedGeos.push(colorBox(3, 2.5, 60, x, y + 34, edge + 30, '#c83a2a'));
        glowGeos.push(box(0.8, 0.8, 0.8, x, y + 36, edge + 58));
      }
    }
    // Piers: concrete decks on pilings, bollards and fenders along the edges.
    for (const p of map.piers) {
      const len = p.z1 - p.z0 + 12;
      const zc = p.z0 + len / 2;
      let top = Infinity;
      for (let z = p.z0; z <= p.z1 + 12; z += 5) top = Math.min(top, H(p.x, z));
      top -= 0.12;
      const depth = top - (minY - 4);
      paintedGeos.push(colorBox(2 * SETBACK + 2, depth, len, p.x, top - depth / 2, zc, '#5a5650'));
      yellowGeos.push(box(0.4, 0.3, len, p.x - SETBACK - 0.8, top + 0.15, zc), box(0.4, 0.3, len, p.x + SETBACK + 0.8, top + 0.15, zc));
      for (let z = p.z0 + 4; z < p.z1 + 10; z += 9) for (const s of [-1, 1]) darkGeos.push(box(0.6, 0.8, 0.6, p.x + s * (SETBACK + 0.5), top + 0.4, z));
      for (let z = p.z0 + 36; z < p.z1 + 10; z += 12) for (const s of [-1, 1]) darkGeos.push(box(0.8, 6, 0.8, p.x + s * SETBACK, minY - 3, z));
    }
  }
  if (f.includes('arches')) {
    edgeList.filter(({ A, B }) => archEdge(A, B)).forEach(({ A, L, ux, uz }, k) => {
      const [x, y, z] = P(A, ux, uz, L / 2, 0, 0);
      const yaw = Math.atan2(ux, uz);
      for (const side of [-1, 1]) steelGeos.push(box(0.8, 10, 0.8, x - uz * side * (SETBACK + 0.6), y + 5, z + ux * side * (SETBACK + 0.6)));
      steelGeos.push(box(2 * SETBACK + 2, 0.8, 0.8, x, y + 10, z, yaw));
      add(new THREE.Mesh(mergeGeometries([box(2 * SETBACK, 0.25, 0.3, x, y + 9.4, z, yaw), box(2 * SETBACK * 0.8, 0.25, 0.3, x, y + 10.6, z, yaw)]), neon(k)));
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
  // Authored districts use a fixed run of widths and heights, with gaps where
  // the roads out of the district pass through.
  const RING_W = [30, 22, 40, 26, 34, 18, 28];
  const RING_H = [0.2, 0.7, 0.4, 0.9, 0.1, 0.6, 0.3, 0.8, 0.5];
  const exits = (map.stubs || []).map((st) => nodes[st.a].z);
  let ringK = 0;
  for (const [x0, x1, z0, z1] of only ? [] : ring) {
    const alongX = x1 - x0 > z1 - z0;
    const len = alongX ? x1 - x0 : z1 - z0;
    for (let p = 0; p < len; ) {
      const s = map.authored ? RING_W[ringK % RING_W.length] : 18 + rng() * 26;
      const a = Math.min(len, p + s);
      const h = hmin + (map.authored ? RING_H[ringK % RING_H.length] : rng()) * (hmax - hmin) * 1.2;
      ringK++;
      const open = !alongX && exits.some((ez) => z0 + a > ez - SETBACK - 2 && z0 + p < ez + SETBACK + 2);
      if (open) {
        p = a + 2;
        continue;
      }
      if (alongX) addBuilding(x0 + p, x0 + a, z0, z1, h);
      else addBuilding(x0, x1, z0 + p, z0 + a, h);
      p = a + 2;
    }
  }

  add(walkways.mesh(mats.tiles));
  add(mergedMesh(bGeos, buildingMat));
  add(mergedMesh(darkGeos, mats.dark));
  add(mergedMesh(steelGeos, mats.steel));
  add(mergedMesh(yellowGeos, litMaterial({ color: '#e0b020' })));
  add(mergedMesh(coneGeos, mats.cone));
  add(mergedMesh(barrierGeos, mats.barrier));
  add(mergedMesh(paintedGeos, mats.painted));
  add(mergedMesh(containerGeos, mats.containers));
  add(mergedMesh(shackGeos, mats.shack));
  add(mergedMesh(plantGeos, mats.plant));
  add(mergedMesh(waterGeos, mats.water));
  add(mergedMesh(windowGeos, mats.windows));
  add(mergedMesh(beaconGeos, mats.beacon));
  // Hidden until the race screen needs them.
  const shutters = mergedMesh(shutterGeos, litMaterial({ map: tex.corrugated, color: '#8a8478' }));
  if (shutters) {
    shutters.name = 'shutters';
    shutters.visible = false;
    add(shutters);
  }
  const crossing = mergedMesh(crossingGeos, mats.beacon);
  if (crossing) {
    crossing.name = 'crossingLights';
    crossing.visible = false;
    add(crossing);
  }
  add(mergedMesh(glowGeos, neon(0)));
  add(mergedMesh(signGeos, glowMaterial({ map: tex.signs.texture, intensity: 2.4, side: DS })));
  add(mergedMesh(lampGeos, mats.steel));
  add(mergedMesh(headGeos, mats.lampHead));
  const pools = mergedMesh([...poolGeos, ...itemPoolGeos], mats.pool);
  if (pools) {
    pools.renderOrder = 1;
    add(pools);
  }

  // Ground far beyond (and, up on the rooftops, far below) the district, and the skyline.
  if (!only) {
    tex.ground.repeat.set(500, 500);
    add(new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2).translate(0, minY - 2 - roof, 0), new THREE.MeshLambertMaterial({ map: tex.ground })));
    tex.skyline.repeat.set(6, 1);
    const sky = new THREE.Mesh(new THREE.CylinderGeometry(1500, 1500, 320, 48, 1, true), new THREE.MeshBasicMaterial({ map: tex.skyline, side: THREE.BackSide, alphaTest: 0.5, fog: false }));
    sky.position.set(0, minY + 130, 0);
    sky.renderOrder = -1;
    add(sky);
  }
  // An authored district's arena structures stand in every event.
  if (map.authored && !only) {
    const structures = buildAuthoredStructures(style, tex);
    add(structures);
    group.userData.animate = structures.userData.animate;
  }
  const lightsAnimate = OL.build(add, look.lamp || '#ffd9a0');
  const flashA = signalA.length ? new THREE.Mesh(mergeGeometries(signalA), glowMaterial({ color: '#ff2a2a', intensity: 2.6 })) : null;
  const flashB = signalB.length ? new THREE.Mesh(mergeGeometries(signalB), glowMaterial({ color: '#ff2a2a', intensity: 2.6 })) : null;
  add(flashA);
  add(flashB);
  if (lightsAnimate || flashA || flashB) {
    const inner = group.userData.animate;
    group.userData.animate = (t, real = t) => {
      inner?.(t, real);
      lightsAnimate?.(real);
      const on = Math.floor(real / 0.6) % 2 === 0;
      if (flashA) flashA.visible = on;
      if (flashB) flashB.visible = !on;
    };
  }
  return group;
}

// Whether (x, z) is open ground in a district: not inside anything in its
// layout, not in the bay or the dry dock. Race dressing uses it to stand
// things only where there's room.
export function districtClear(map) {
  const items = districtLayout(map).items.filter((it) => it.r);
  const edge = map.bounds.maxZ + SETBACK + 30;
  const water = map.style.features.includes('waterfront');
  const b = map.basin;
  return (x, z) => {
    if (items.some(({ r }) => x > r[0] - 0.5 && x < r[1] + 0.5 && z > r[2] - 0.5 && z < r[3] + 0.5)) return false;
    if (b && x > b.x0 - b.wall && x < b.x1 + b.wall && z > b.z0 - b.wall) return false;
    if (water && z > edge - 1) return map.piers.some((p) => Math.abs(x - p.x) < SETBACK && z < p.z1 + 11);
    return true;
  };
}

// A rotated box: hw across, hd along the yaw direction, from y0 up h.
const obbBox = (o, h, y0) => {
  const g = new THREE.BoxGeometry(o.hw * 2, h, o.hd * 2);
  g.rotateY(o.yaw);
  g.translate(o.x, y0 + h / 2, o.z);
  return g;
};

function cone(x, y, z) {
  const g = new THREE.ConeGeometry(0.35, 0.9, 6);
  g.translate(x, y + 0.45, z);
  return g;
}

function tint(g, color) {
  // Non-indexed shapes (ramps, extrusions) get an index so they merge with boxes.
  if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
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
function buildSpire(cx, cz, size, H, bGeos, glowGeos, rng, uvScale) {
  let y = H(cx, cz) - 2;
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
