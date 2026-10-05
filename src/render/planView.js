import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial, standardMaterial, glowMaterial, additiveMaterial } from './retroMaterial.js';
import { textTexture } from './textures.js';
import { setUvRect } from './trackView.js';
import { box, obbBox, prism, flatPoly, drapePoly, densified, rampGeometry, tint, scaleUv, tireGeometry } from './shapes.js';
// (scaleUv: a barrier's concrete repeats along it, however wide it's made.)
import { districtLayout } from '../sim/cityLayout.js';
import { buildAuthoredStructures } from './arenaView.js';
import { deadSignShape } from './deadSigns.js';
import * as G from '../sim/geom2d.js';
import { suburbView } from './suburbView.js';
import { buildRoofDistrictView } from './roofView.js';
import { underView } from './underView.js';
import { spireView } from './spireView.js';
import { itemDrawer } from './itemCapture.js';
import { objectLights } from './objectLights.js';
import { npcCar } from './npcCars.js';

// A plan district (the Neon Strip on): its ground in layers (sidewalk
// everywhere, the lots on top, then the site surfaces, the roads along their
// curves and diagonals, junctions of any angle and the lane markings), the bay
// beyond the seawall, and every item in the district's layout drawn by kind.
// Everything solid comes from the layout (sim/planLayout.js), so free roam
// collides with exactly what's drawn. Event routes draw their own road on top.

const DS = THREE.DoubleSide;
const UV_SCALE = [48, 96];

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

  geometry() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

// only: just these objects (draw entries), none of the district itself: this
// district's objects placed in another district (render/districtView.js).
export function buildPlanDistrictView(map, tex, { only = null } = {}) {
  if (map.roof) return buildRoofDistrictView(map, tex, { only }); // the rooftops (Chrome Heights)
  const { style, heightAt: H } = map;
  // (Ground sculpted in the SDK: the flat layers are draped over it, the roads cut finer.)
  const bumpy = !!map.sculpted;
  const fine = map.sculptAt?.fine || null;
  const surface = (poly, dy) => (bumpy ? drapePoly(poly, (x, z) => H(x, z) + dy, 16, 8, fine) : flatPoly(poly, (x, z) => H(x, z) + dy));
  const look = style.look;
  const P = style.plan;
  const group = new THREE.Group();
  const add = (m) => m && group.add(m);
  const layout = only ? { draw: only, items: only } : districtLayout(map);
  const neonN = look.neon.length;

  const mats = {
    walk: litMaterial({ map: tex.sidewalk, color: look.walk || '#ffffff', side: DS }),
    walkTop: litMaterial({ map: tex.sidewalk, color: look.walk || '#ffffff', side: DS, polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -3 }),
    lot: litMaterial({ map: tex.lot, color: look.lot, side: DS, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    road: standardMaterial({ map: tex.asphalt, color: look.road || '#ffffff', roughness: 0.35, metalness: 0.1, envMap: tex.env, envMapIntensity: look.roadGloss ?? 0.8, side: DS, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
    junction: standardMaterial({ map: tex.asphalt, color: look.road || '#ffffff', roughness: 0.35, metalness: 0.1, envMap: tex.env, envMapIntensity: look.roadGloss ?? 0.8, side: DS, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
    marking: litMaterial({ color: '#d8d4e0', side: DS, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 }),
    kerb: litMaterial({ color: '#8a8698', side: DS, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -10 }),
    tiles: litMaterial({ map: tex.tiles, side: DS, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    parking: litMaterial({ map: tex.parking, color: '#b8b0c0', side: DS, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    dirt: litMaterial({ map: tex.dirt, color: '#9a8878', side: DS, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    grass: litMaterial({ map: tex.dirt, color: '#4a8a58', side: DS, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    water: standardMaterial({ color: '#0a1420', roughness: 0.25, metalness: 0.5, envMap: tex.env, envMapIntensity: 0.45 }),
    building: litMaterial({ map: tex.building, emissiveMap: tex.buildingGlow, emissive: 0xffffff, emissiveIntensity: 1.1, color: look.building }),
    glass: standardMaterial({ map: tex.glass, emissiveMap: tex.glassGlow, emissive: 0xffffff, emissiveIntensity: 0.9, color: '#e0c890', metalness: 0.6, roughness: 0.25, envMap: tex.env }),
    painted: litMaterial({ vertexColors: true }),
    dark: litMaterial({ color: '#1c1a24' }),
    steel: litMaterial({ color: '#4a4858' }),
    concrete: litMaterial({ map: tex.wallConcrete || tex.wall, color: '#9a94a8' }),
    containers: litMaterial({ map: tex.container, vertexColors: true }),
    lampHead: glowMaterial({ color: look.lamp, intensity: 3 }),
    pool: additiveMaterial({ map: tex.glow, color: look.lamp, opacity: 0.32 }),
    gold: glowMaterial({ color: '#ffc850', intensity: 2.4 }),
    white: glowMaterial({ color: '#f4f0ff', intensity: 2 }),
    screen: glowMaterial({ color: '#c8d8ff', intensity: 1.3, side: DS }),
    plant: litMaterial({ color: '#2a6a44' }),
    trunk: litMaterial({ color: '#5a4030' }),
  };
  const neonMat = [...Array(neonN).keys()].map((k) => glowMaterial({ color: look.neon[k], intensity: 2.6 }));
  // The junctions: each one's outline, kerbs and sidewalk corners (the ground's sidewalks follow them).
  const junctions = junctionShapes();
  const outlines = new Map(); // node id -> junctionOutline
  for (const n of only ? [] : map.nodes) {
    if (!n.name || map.edgeList.some((e) => (e.a === n.id || e.b === n.id) && e.street.drain)) continue;
    const o = junctionOutline(n);
    if (o) outlines.set(n.id, o);
  }
  // A suburb (Maple Hollow) has its own ground and house kit; so has the Undercity.
  const kitArgs = { map, tex, H, group, items: layout.items, text, clipToConvex, merged, walkBands, junctionAt: (id) => outlines.has(id), guest: !!only };
  const kit = look.suburb ? suburbView(kitArgs) : look.under ? underView(kitArgs) : look.spire ? spireView(kitArgs) : null;

  // Buckets, merged into one mesh per material at the end.
  const B = { building: [], glass: [], painted: [], dark: [], steel: [], concrete: [], containers: [], gold: [], white: [], lamp: [], pool: [], screen: [], plant: [], trunk: [], signs: [], water: [] };
  const neon = [...Array(neonN)].map(() => []);
  const texts = new Map(); // text|color -> geometries
  const flicker = []; // [{ geos, k }]: dead neon that still flickers

  // --- The ground, in layers ---
  // (Layers a few centimetres apart, and pulled forward in depth, so they never fight.)
  if (only);
  else if (kit) kit.ground();
  else cityGround();
  // (Round the junctions' corners, the sidewalk over the lots: where a kerb
  // curves, a lot's sharp corner doesn't cut across the sidewalk.)
  if (!only && (!kit || look.spire)) {
    const bands = walkBands(-0.1);
    if (bands.length) add(new THREE.Mesh(merged(bands), mats.walkTop));
    const patches = lotPatches(-0.11);
    if (patches.length) add(new THREE.Mesh(merged(patches), mats.lot));
  }
  function cityGround() {
  add(new THREE.Mesh(surface(P.boundary, -0.16), mats.walk));
  const lotGeos = map.blocks.map((b) => surface(b.lot, -0.12));
  add(new THREE.Mesh(merged(lotGeos), mats.lot));
  const siteSurface = { arena: 'parking', market: 'tiles', drivein: 'road', boneyard: 'dirt', depot: 'parking', casino: 'tiles' };
  const surf = { parking: [], tiles: [], road: [], dirt: [], grass: [] };
  for (const s of map.sites) {
    for (const b of map.blocks) {
      const piece = clipToConvex(b.lot, s.poly);
      if (piece.length > 2 && Math.abs(G.polyArea(piece)) > 1) surf[siteSurface[s.kind] || 'tiles'].push(surface(piece, -0.08));
    }
  }
  for (const L of P.lots || []) {
    if (L.kind !== 'promenade') continue;
    surf.grass.push(surface(L.poly, -0.08));
    // A tiled walk along the seawall.
    const S = P.seawall.pts;
    for (let k = 0; k + 1 < S.length; k++) {
      const a = S[k];
      const b = S[k + 1];
      const walk = [a, b, ...[b, a].map((p) => inland(p, a, b, 12))];
      surf.tiles.push(surface(walk, -0.07));
    }
  }
  // The service alleys' asphalt.
  for (const [a, b] of P.alleys?.runs || []) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = [(-(b[1] - a[1]) / L) * (P.alleys.width / 2), ((b[0] - a[0]) / L) * (P.alleys.width / 2)];
    surf.road.push(surface([[a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]], [b[0] - n[0], b[1] - n[1]], [a[0] - n[0], a[1] - n[1]]], -0.08));
  }
  for (const [k, list] of Object.entries(surf)) if (list.length) add(new THREE.Mesh(merged(list), mats[k]));
  }

  // --- Streets: roads along their curves, junctions, markings, kerbs ---
  const road = new Surface();
  const dirtRoad = new Surface(); // a dirt road (Maple Hollow's Foundation Road)
  const kerb = new Surface();
  const marks = new Surface();
  const junctionGeos = [];
  for (const e of only ? [] : map.edgeList) {
    const st = e.street;
    // (The Undercity's drain is its ground; the Low Road draws its own road.)
    if (st.drain || st.tunnel) continue;
    const c0 = junctions.clear(e, 'a');
    const c1 = junctions.clear(e, 'b');
    if (e.len - c0 - c1 < 0.05) continue;
    const pts = G.subLine(e.pts, c0, e.len - c1);
    // (Its ends square across it exactly where the junctions start.)
    const ends = [junctions.normal(e, 'a'), junctions.normal(e, 'b')];
    ribbon(st.surface === 'dirt' ? dirtRoad : road, pts, -st.half, st.half, -0.045, 8, 8, ends);
    if (st.surface === 'dirt') continue;
    if (st.sidewalk) for (const s of [-1, 1]) ribbon(kerb, pts, s * st.half, s * (st.half + 0.3), -0.04, 4, 0, ends);
    markings(marks, pts, st);
  }
  const junctionFallbacks = [];
  const p3 = (x, z) => [x, H(x, z) - 0.04, z];
  for (const [id, o] of outlines) {
    if (o.fallback) junctionFallbacks.push(map.nodes[id].name);
    junctionGeos.push(drapePoly(o.poly, (x, z) => H(x, z) - 0.035, 6, 16, fine));
    // Kerbs round the corners, out from the road.
    for (const { pts: run } of o.runs) {
      for (let q = 0; q + 1 < run.length; q++) {
        const [a, b] = [run[q], run[q + 1]];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 0.02) continue;
        const [ox, oz] = [((b[1] - a[1]) / L) * 0.3 * o.sg, (-(b[0] - a[0]) / L) * 0.3 * o.sg];
        kerb.quad(p3(a[0], a[1]), p3(b[0], b[1]), p3(b[0] + ox, b[1] + oz), p3(a[0] + ox, a[1] + oz), [0, 0], [1, 0], [1, 1], [0, 1]);
      }
    }
    if (o.bend) markings(marks, o.bend.pts, o.bend.st);
  }
  group.userData.junctionFallbacks = junctionFallbacks; // (junctions whose outline crossed itself, drawn as a hull)
  // The roads out of the district carry on beyond its edge.
  for (const n of only ? [] : map.nodes.filter((q) => q.exit)) {
    const e = map.edgeList.find((q) => q.a === n.id || q.b === n.id);
    const pts = e.a === n.id ? e.pts : [...e.pts].reverse();
    const d = [pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]];
    const L = Math.hypot(d[0], d[1]);
    const out = [[n.x, n.z], [n.x + (d[0] / L) * 160, n.z + (d[1] / L) * 160]];
    ribbon(road, out, -e.street.half, e.street.half, -0.045, 8, 8);
    for (const s of [-1, 1]) ribbon(kerb, out, s * e.street.half, s * e.street.edge, -0.05, 4);
  }
  if (road.geometry()) {
    const roads = new THREE.Mesh(road.geometry(), mats.road);
    roads.name = 'roads';
    add(roads);
  }
  add(dirtRoad.geometry() && new THREE.Mesh(dirtRoad.geometry(), mats.dirt));
  if (junctionGeos.length) {
    const cross = new THREE.Mesh(merged(junctionGeos), mats.junction);
    cross.name = 'junctions';
    add(cross);
  }
  add(kerb.geometry() && new THREE.Mesh(kerb.geometry(), mats.kerb));
  add(marks.geometry() && new THREE.Mesh(marks.geometry(), mats.marking));

  // --- The bay beyond the seawall ---
  if (P.seawall && !only) {
    const S = P.seawall.pts;
    const wy = Math.min(...S.map(([x, z]) => H(x, z))) - 1.4;
    const far = 2000;
    const bay = [[far, S[0][1]], ...S, [-far, S[S.length - 1][1]], [-far, far], [far, far]];
    add(new THREE.Mesh(flatPoly(bay, () => wy), mats.water));
    // The seawall's face, down to the water.
    for (let k = 0; k + 1 < S.length; k++) {
      const [ax, az] = S[k];
      const [bx, bz] = S[k + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const top = Math.min(H(ax, az), H(bx, bz));
      B.concrete.push(box(0.9, top - wy + 1, L, (ax + bx) / 2, (top + wy - 1) / 2, (az + bz) / 2, Math.atan2(bx - ax, bz - az)));
    }
  }

  // --- Everything in the layout ---
  const speakers = [];
  const sprays = [];
  const OL = objectLights(tex); // (lights with settings of their own)
  const jets = []; // a fountain's jets: { x, y, z, h, r, ph, still }
  const DRAW = makeDrawers({ B, neon, flicker, speakers, sprays, text, sign, frontOf, buildingBox, H, look, OL, jets });
  const drawItem = itemDrawer(B, ...neon, texts, flicker, speakers, sprays, jets, group, ...(kit?.buckets || []), ...OL.buckets);
  const drawOne = (it) => {
    const own = kit?.drawers[it.t];
    if (own && own(it) !== false) return;
    DRAW[it.t]?.(it);
  };
  // (Another district's objects placed here are drawn by its own view: districtView.js.)
  for (const it of layout.draw) if (!it.hidden && (only || !it.guest)) drawItem(it, drawOne);
  const sub = kit?.finish();
  const lightsAnimate = OL.build(add, look.lamp);
  const waterAnimate = fountainWater(jets, add);

  // --- Merge ---
  const mesh = (list, mat) => list.length && add(new THREE.Mesh(merged(list), mat));
  mesh(B.building, mats.building);
  mesh(B.glass, mats.glass);
  mesh(B.painted, mats.painted);
  mesh(B.dark, mats.dark);
  mesh(B.steel, mats.steel);
  mesh(B.concrete, mats.concrete);
  mesh(B.containers, mats.containers);
  mesh(B.gold, mats.gold);
  mesh(B.white, mats.white);
  mesh(B.lamp, mats.lampHead);
  mesh(B.screen, mats.screen);
  mesh(B.plant, mats.plant);
  mesh(B.trunk, mats.trunk);
  neon.forEach((list, k) => mesh(list, neonMat[k]));
  if (B.signs.length) add(new THREE.Mesh(merged(B.signs), glowMaterial({ map: tex.signs.texture, intensity: 2.2, side: DS })));
  if (B.pool.length) {
    const pools = new THREE.Mesh(merged(B.pool), mats.pool);
    pools.renderOrder = 1;
    add(pools);
  }
  for (const [key, list] of texts) {
    const [text, color] = key.split('|');
    add(new THREE.Mesh(merged(list), glowMaterial({ map: textTexture(text, color), intensity: 2, side: DS })));
  }
  const flickerMeshes = flicker.map(({ geos, k }) => {
    const m = new THREE.Mesh(merged(geos), neonMat[k % neonN]);
    add(m);
    return m;
  });
  // Speaker posts at the drive-in: knocked flat by a car driving through them.
  const speakerMesh = speakerPosts(speakers);
  add(speakerMesh);
  // Spray over the seawall.
  const sprayMesh = sprays.length ? new THREE.Mesh(merged(sprays.map((s) => s.geo)), additiveMaterial({ map: tex.glow, color: '#c8e0ff', opacity: 0.5 })) : null;
  if (sprayMesh) {
    sprayMesh.renderOrder = 2;
    add(sprayMesh);
  }

  // Ground far beyond the district, and the skyline.
  const minY = Math.min(...P.boundary.map(([x, z]) => H(x, z)));
  tex.ground.repeat.set(500, 500);
  // (A suburb's own ground runs on well beyond its edge, round its hills.)
  if (!kit && !only) add(new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2).translate(0, minY - 3, 0), new THREE.MeshLambertMaterial({ map: tex.ground })));
  tex.skyline.repeat.set(6, 1);
  const sky = new THREE.Mesh(new THREE.CylinderGeometry(1500, 1500, 320, 48, 1, true), new THREE.MeshBasicMaterial({ map: tex.skyline, side: THREE.BackSide, alphaTest: 0.5, fog: false }));
  sky.position.set(0, minY + 130, 0);
  sky.renderOrder = -1;
  if (!only) add(sky);

  // The arena structures (the valet ramp) stand in every event.
  const structures = only ? null : buildAuthoredStructures(style, tex, H);
  add(structures);

  // Sim time t (seconds) drives the structures; real time drives the neon.
  group.userData.animate = (t, real = t) => {
    structures?.userData.animate(t);
    sub?.animate(t, real);
    lightsAnimate?.(real);
    waterAnimate?.(real);
    flickerMeshes.forEach((m, k) => {
      const f = Math.sin(real * (7 + k * 3.1)) + Math.sin(real * (13.7 + k)) * 0.8;
      m.visible = f > -0.6;
    });
    if (sprayMesh) {
      const phase = (real * 0.45) % 1;
      sprayMesh.material.opacity = Math.max(0, Math.sin(phase * Math.PI)) * 0.55;
      sprayMesh.position.y = phase * 3;
    }
  };
  // Breakable props (a suburb): which are down (world state), and which way they fell.
  if (sub) {
    group.userData.setBroken = sub.setBroken;
    group.userData.breakEvent = sub.breakEvent;
  }
  group.userData.knock = (cars) => {
    if (!speakerMesh) return;
    let changed = false;
    speakers.forEach((s, k) => {
      if (s.down) return;
      for (const c of cars) {
        if (Math.abs(c.x - s.x) < 1.5 && Math.abs(c.z - s.z) < 1.5 && Math.abs(c.y - s.y) < 3) {
          s.down = true;
          const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.PI / 2.2, Math.atan2(c.vx || 0, c.vz || 1), 0, 'YXZ'));
          m.setPosition(s.x, s.y + 0.2, s.z);
          speakerMesh.setMatrixAt(k, m);
          changed = true;
        }
      }
    });
    if (changed) speakerMesh.instanceMatrix.needsUpdate = true;
  };
  return group;

  // ---------------------------------------------------------------------------

  // Point p moved `d` metres inland from the seawall run a-b.
  function inland(p, a, b, d) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / L;
    const nz = (b[0] - a[0]) / L;
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    const sg = G.pointInPoly(mx + nx * 3, mz + nz * 3, P.boundary) ? 1 : -1;
    return [p[0] + nx * sg * d, p[1] + nz * sg * d];
  }

  // A strip along a polyline between lateral offsets l0 and l1 (right-hand
  // side positive), dy above the ground, mitred at the bends.
  // (ends: its first and last points' normals, where they're given.)
  function ribbon(surf, pts, l0, l1, dy, vScale, uScale = 0, ends = null) {
    // (On sculpted ground: a point every few metres along it, and strips a few metres wide across.)
    const across = bumpy ? Math.max(1, Math.ceil(Math.abs(l1 - l0) / (fine?.cell || 4))) : 1;
    if (across > 1) {
      for (let i = 0; i < across; i++) {
        const [a, b] = [l0 + ((l1 - l0) * i) / across, l0 + ((l1 - l0) * (i + 1)) / across];
        ribbonStrip(surf, pts, a, b, dy, vScale, uScale ? a / uScale : i / across, uScale ? b / uScale : (i + 1) / across, ends);
      }
      return;
    }
    ribbonStrip(surf, pts, l0, l1, dy, vScale, uScale ? l0 / uScale : 0, uScale ? l1 / uScale : 1, ends);
  }

  function ribbonStrip(surf, line, l0, l1, dy, vScale, u0, u1, ends) {
    const pts = bumpy ? densified(line, fine?.cell || 4) : line;
    const n = pts.length;
    const nrm = pts.map((p, k) => {
      if (k === 0 && ends?.[0]) return ends[0];
      if (k === n - 1 && ends?.[1]) return ends[1];
      const a = pts[Math.max(0, k - 1)];
      const b = pts[Math.min(n - 1, k + 1)];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const L = Math.hypot(dx, dz) || 1;
      return [-dz / L, dx / L];
    });
    let v = 0;
    for (let k = 0; k + 1 < n; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const at = (p, m, l) => {
        const x = p[0] + m[0] * l;
        const z = p[1] + m[1] * l;
        return [x, H(x, z) + dy, z];
      };
      surf.quad(at(a, nrm[k], l0), at(a, nrm[k], l1), at(b, nrm[k + 1], l1), at(b, nrm[k + 1], l0), [u0, v / vScale], [u1, v / vScale], [u1, (v + L) / vScale], [u0, (v + L) / vScale]);
      v += L;
    }
  }

  // Lane markings: the Strip's lane lines either side of the median, an
  // avenue's centre lines and lanes, a street's dashed centre line.
  function markings(surf, pts, st) {
    const L = G.lineLength(pts);
    const dashes = (lat, w = 0.15) => {
      for (let s = 2; s + 3 < L; s += 9) ribbon(surf, G.subLine(pts, s, s + 3), lat - w / 2, lat + w / 2, -0.02, 3);
    };
    const solid = (lat, w = 0.15) => ribbon(surf, pts, lat - w / 2, lat + w / 2, -0.02, 3);
    if (st.median) {
      const lane = (st.half - st.median / 2) / 3;
      for (const sg of [-1, 1]) {
        for (const q of [1, 2]) dashes(sg * (st.median / 2 + lane * q));
        solid(sg * (st.half - 0.5), 0.2);
      }
    } else if (st.width >= 20) {
      solid(-0.2);
      solid(0.2);
      for (const sg of [-1, 1]) dashes(sg * st.half * 0.5);
    } else if (st.width >= 12) dashes(0);
  }

  // Junctions like real ones. Round a junction, each pair of neighbouring
  // roads has a corner: their kerbs (as the roads draw them, along their
  // curves) meet, and are joined by a curve (a kerb radius: a road bending
  // on its own gets a wide one; a tight angle a small nose, not a long cut).
  // Each road stops where its corners start, square across; the junction's
  // own surface covers the rest, round the outside of a bend too. A road
  // straight on through carries on. A street drawn in the SDK that ends on
  // its own gets a rounded end.
  // Returns { clear(e, 'a'|'b'): how far back from that end its road stops,
  // normal(e, end): the road's normal there (or null), shapes: node -> shape }.
  function junctionShapes() {
    const ends = new Map(); // 'edge:a|b' -> { c, n (the road's normal, a to b) }
    const shapes = new Map();
    const setEnd = (A, c, nrm) => ends.set(`${A.e.id}:${A.end}`, { c, n: A.end === 'a' ? nrm : [-nrm[0], -nrm[1]] });
    const armsAt = new Map(); // node id -> the roads into it
    for (const e of map.edgeList) {
      if (e.street.drain || e.street.tunnel) continue;
      for (const end of ['a', 'b']) {
        if (!map.nodes[e[end]].name) continue;
        if (!armsAt.has(e[end])) armsAt.set(e[end], []);
        armsAt.get(e[end]).push(armOf(e, end));
      }
    }
    for (const [id, arms] of armsAt) {
      const J = shapeOf(map.nodes[id], arms);
      if (J) shapes.set(id, J);
    }
    // (A junction with no room for a corner in its share of a road takes
    // what the junction at the road's other end leaves it.)
    const other = (A) => {
      const J = shapes.get(A.e[A.end === 'a' ? 'b' : 'a']);
      const B = J?.cap || J?.arms?.find((X) => X.e === A.e && X.end !== A.end);
      return { c: B?.c || 0, cramped: !!J?.cramped };
    };
    for (const [id, J] of shapes) {
      if (!J.cramped) continue;
      const arms = armsAt.get(id).map((A) => {
        const o = other(A);
        return armOf(A.e, A.end, o.cramped ? 0 : A.e.len - o.c - 1);
      });
      shapes.set(id, shapeOf(map.nodes[id], arms));
    }
    for (const J of shapes.values()) {
      if (J.straight) {
        // Straight on: the two roads meet square across the node, mitred.
        const [A, B] = J.arms;
        const u = [A.d[0] - B.d[0], A.d[1] - B.d[1]];
        const L = Math.hypot(u[0], u[1]) || 1;
        setEnd(A, 0, [-u[1] / L, u[0] / L]);
        setEnd(B, 0, [u[1] / L, -u[0] / L]);
      } else for (const A of J.cap ? [J.cap] : J.arms) setEnd(A, A.c, sideAt(A, A.c, 1));
    }
    return {
      clear: (e, end) => ends.get(`${e.id}:${end}`)?.c || 0,
      normal: (e, end) => ends.get(`${e.id}:${end}`)?.n || null,
      shapes,
    };
  }

  // A junction's shape from the roads into it: a dead end's rounded end
  // ({ cap }), straight on ({ straight }), or its corners ({ arms, corners }),
  // cramped where a corner had no room in the roads' share.
  function shapeOf(n, arms) {
    arms.sort((p, q) => p.a - q.a);
    if (arms.length === 1) {
      // A dead end (of a street drawn in the SDK): rounded.
      const A = arms[0];
      if (n.exit || !A.e.street.sdk) return null;
      A.c = Math.min(A.h, A.max);
      return { cap: A };
    }
    if (arms.length < 2) return null;
    const two = arms.length === 2;
    let cramped = false;
    const corners = arms.map((A, i) => {
      const B = arms[(i + 1) % arms.length];
      let phi = B.a - A.a;
      if (phi <= 0) phi += Math.PI * 2;
      if (phi >= Math.PI - 0.02) return { A, B, open: true }; // the outside of a bend, or a straight side
      const P = crossing(kerbOf(A, 1), kerbOf(B, -1));
      if (!P) {
        // (Kerbs that never meet: roads side by side, as far as they go.)
        A.need = A.max;
        B.need = B.max;
        cramped = true;
        return { A, B, open: true, apart: true };
      }
      // The curve round the corner, where the kerbs meet at angle psi.
      const fa = G.pointAlong(A.pts, Math.max(P.sA, 0));
      const fb = G.pointAlong(B.pts, Math.max(P.sB, 0));
      let psi = Math.atan2(fa.dx * fb.dz - fa.dz * fb.dx, fa.dx * fb.dx + fa.dz * fb.dz);
      if (psi <= 0) psi += Math.PI * 2;
      const R = 4 + Math.min(A.h, B.h) * (two ? 0.8 : 0.4);
      const want = psi < Math.PI - 0.01 ? Math.min(R / Math.tan(psi / 2), R * (two ? 2.5 : 1.3)) : 0;
      const T = Math.max(0, Math.min(want, A.max - P.sA, B.max - P.sB));
      if (T < want - 0.5) cramped = true;
      if (P.sA + T < 0 || P.sB + T < 0) return { A, B, open: true };
      A.need = Math.max(A.need, P.sA + T);
      B.need = Math.max(B.need, P.sB + T);
      return { A, B, P, sA: P.sA + T, sB: P.sB + T };
    });
    if (two && corners.every((k) => k.open)) return { straight: true, arms };
    for (const A of arms) A.c = Math.max(0, Math.min(A.need, A.max));
    return { arms, corners, two, cramped };
  }

  // A road as it leaves a junction (from its a or b end): its centreline out
  // from the junction, and how far along it the junction may reach.
  // (room: more of the road than its usual share, where it's free.)
  function armOf(e, end, room = 0) {
    const pts = end === 'a' ? e.pts : [...e.pts].reverse();
    const f = frame(pts, 0);
    return { e, end, pts, h: e.street.half, d: [f.dx, f.dz], a: Math.atan2(f.dz, f.dx), max: Math.min(Math.max(e.len * 0.45, room), 60), need: 0, walk: !!e.street.sidewalk, kerbs: {} };
  }

  // Where a polyline is at arc length s, and its heading: where s is on a
  // corner, the run after it (as a road's strip starting there has it); s < 0
  // runs straight on back from its start.
  function frame(pts, s) {
    let run = 0;
    let last = null;
    for (let k = 0; k + 1 < pts.length; k++) {
      const L = G.len2(pts[k], pts[k + 1]);
      if (L < 1e-6) continue;
      const dx = (pts[k + 1][0] - pts[k][0]) / L;
      const dz = (pts[k + 1][1] - pts[k][1]) / L;
      if (s < run + L - 1e-6) return { x: pts[k][0] + dx * (s - run), z: pts[k][1] + dz * (s - run), dx, dz };
      last = { x: pts[k + 1][0], z: pts[k + 1][1], dx, dz };
      run += L;
    }
    return last || { x: pts[0][0], z: pts[0][1], dx: 1, dz: 0 };
  }

  // The unit normal on one side of a road (+1: to the left of the way it leaves the junction).
  function sideAt(A, s, side) {
    const f = frame(A.pts, s);
    return [-f.dz * side, f.dx * side];
  }

  // A road's centre, or its edge on one side, at s along it from the junction.
  function roadPoint(A, s, side = 0) {
    const f = frame(A.pts, s);
    return [f.x - f.dz * side * A.h, f.z + f.dx * side * A.h];
  }

  // A road's kerb on one side, as its strip draws it (mitred at each point),
  // from a way back behind the junction out to as far as the junction may
  // reach: [{ s, x, z }].
  function kerbOf(A, side) {
    if (A.kerbs[side]) return A.kerbs[side];
    const P = A.pts;
    const back = A.h * 2 + 12;
    const out = [];
    const f0 = frame(P, 0);
    out.push({ s: -back, x: f0.x - f0.dx * back - f0.dz * side * A.h, z: f0.z - f0.dz * back + f0.dx * side * A.h });
    let run = 0;
    for (let k = 0; k < P.length; k++) {
      if (k) run += G.len2(P[k - 1], P[k]);
      if (run >= A.max) break;
      if (k && run - out[out.length - 1].s < 1e-3) continue;
      const a = P[Math.max(0, k - 1)];
      const b = P[Math.min(P.length - 1, k + 1)];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      out.push({ s: run, x: P[k][0] - ((b[1] - a[1]) / L) * side * A.h, z: P[k][1] + ((b[0] - a[0]) / L) * side * A.h });
    }
    const [x, z] = roadPoint(A, A.max, side);
    out.push({ s: A.max, x, z });
    return (A.kerbs[side] = out);
  }

  // A point on a kerb (kerbOf) at s.
  function kerbAt(K, s) {
    for (let k = 0; k + 1 < K.length; k++) {
      if (s > K[k + 1].s && k + 2 < K.length) continue;
      const t = Math.max(0, Math.min(1, (s - K[k].s) / (K[k + 1].s - K[k].s || 1)));
      return [K[k].x + (K[k + 1].x - K[k].x) * t, K[k].z + (K[k + 1].z - K[k].z) * t];
    }
    return [K[0].x, K[0].z];
  }

  // Where two kerbs meet (nearest the junction): { sA, sB, x, z }, or null.
  function crossing(KA, KB) {
    let best = null;
    for (let i = 0; i + 1 < KA.length; i++) {
      const [a, b] = [KA[i], KA[i + 1]];
      for (let j = 0; j + 1 < KB.length; j++) {
        const [c, d] = [KB[j], KB[j + 1]];
        const rx = b.x - a.x;
        const rz = b.z - a.z;
        const qx = d.x - c.x;
        const qz = d.z - c.z;
        const den = rx * qz - rz * qx;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((c.x - a.x) * qz - (c.z - a.z) * qx) / den;
        const u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const sA = a.s + (b.s - a.s) * t;
        const sB = c.s + (d.s - c.s) * u;
        if (!best || Math.abs(sA) + Math.abs(sB) < Math.abs(best.sA) + Math.abs(best.sB)) best = { sA, sB, x: a.x + rx * t, z: a.z + rz * t };
      }
    }
    return best;
  }

  // A curve from p0 (heading u0) to p2 (heading u2 there): a circle's arc
  // where it can be one (a conic through the point their headings meet), or
  // null where there's no curve to be had (straight on, or heading apart).
  function curveBetween(p0, u0, p2, u2, reach = 200) {
    const q = meet(p0, u0, p2, u2, reach);
    if (!q) return null;
    const cosT = u0[0] * u2[0] + u0[1] * u2[1];
    const turn = Math.acos(Math.max(-1, Math.min(1, cosT)));
    const w = Math.cos(turn / 2);
    const steps = Math.max(3, Math.ceil(turn / 0.12));
    return [...Array(steps + 1).keys()].map((i) => {
      const t = i / steps;
      const [a, b, c] = [(1 - t) ** 2, 2 * t * (1 - t) * w, t * t];
      const sum = a + b + c;
      return [(a * p0[0] + b * q[0] + c * p2[0]) / sum, (a * p0[1] + b * q[1] + c * p2[1]) / sum];
    });
  }

  // Where a line from p0 (heading u0) meets one arriving at p2 (heading u2),
  // ahead of the one and behind the other (within reach), or null.
  function meet(p0, u0, p2, u2, reach = 200) {
    const den = u0[0] * u2[1] - u0[1] * u2[0];
    const cosT = u0[0] * u2[0] + u0[1] * u2[1];
    if (Math.abs(den) < 0.02 && cosT > 0) return null;
    if (Math.abs(den) < 1e-6) return null;
    const wx = p2[0] - p0[0];
    const wz = p2[1] - p0[1];
    const l0 = (wx * u2[1] - wz * u2[0]) / den;
    const l2 = (wx * u0[1] - wz * u0[0]) / -den;
    if (l0 < 0.05 || l2 < 0.05 || l0 > reach || l2 > reach) return null;
    return [p0[0] + u0[0] * l0, p0[1] + u0[1] * l0];
  }

  // A corner's edge, from road A's end (its left side) round to road B's end
  // (its right): along A's kerb, the curve, along B's kerb.
  function cornerRun(k) {
    const { A, B } = k;
    const e0 = roadPoint(A, A.c, 1);
    const e2 = roadPoint(B, B.c, -1);
    const back = (X, s) => {
      const f = frame(X.pts, s);
      return [-f.dx, -f.dz];
    };
    const out = (X, s) => {
      const f = frame(X.pts, s);
      return [f.dx, f.dz];
    };
    if (k.open) return (!k.apart && curveBetween(e0, back(A, A.c), e2, out(B, B.c))) || [e0, e2];
    const KA = kerbOf(A, 1);
    const KB = kerbOf(B, -1);
    const ta = A.c - k.sA < 0.05 ? e0 : kerbAt(KA, k.sA);
    const tb = B.c - k.sB < 0.05 ? e2 : kerbAt(KB, k.sB);
    const run = [e0];
    for (let q = KA.length - 1; q >= 0; q--) if (KA[q].s < A.c - 0.05 && KA[q].s > k.sA + 0.05) run.push([KA[q].x, KA[q].z]);
    run.push(...(curveBetween(ta, back(A, k.sA), tb, out(B, k.sB), 80) || [ta, tb]));
    for (const p of KB) if (p.s > k.sB + 0.05 && p.s < B.c - 0.05) run.push([p.x, p.z]);
    run.push(e2);
    return run;
  }

  // A junction's outline: round it, each road's end, then the corner to the
  // next road. { poly, runs (the corners' kerbs, where both roads have
  // sidewalks: { pts, w0, w1 (the sidewalk's width at each end) }), sg (+1:
  // the outline runs anticlockwise), bend (a road bending on its own: the
  // line its markings follow round), fallback (an outline that crossed itself,
  // drawn as a hull) }.
  function junctionOutline(n) {
    const J = junctions.shapes.get(n.id);
    if (!J || J.straight) return null;
    let pts = [];
    const runs = [];
    if (J.cap) {
      const A = J.cap;
      const [cx, cz] = roadPoint(A, A.c);
      const [nx, nz] = sideAt(A, A.c, 1);
      const a0 = Math.atan2(nz, nx);
      const arc = [...Array(13).keys()].map((q) => [cx + Math.cos(a0 + (Math.PI * q) / 12) * A.h, cz + Math.sin(a0 + (Math.PI * q) / 12) * A.h]);
      pts.push(roadPoint(A, A.c, -1), ...arc.slice(0, -1));
      // (The lot's notch round a dead end is square, out to the sidewalk's edge: lot under all of it, the rounded sidewalk over.)
      const [f0, f1] = [frame(A.pts, 0), frame(A.pts, A.c)];
      const e = A.h + A.e.street.sidewalk;
      const rect = [[f0.x - f0.dz * e, f0.z + f0.dx * e], [f1.x - f1.dz * e, f1.z + f1.dx * e], [f1.x + f1.dz * e, f1.z - f1.dx * e], [f0.x + f0.dz * e, f0.z - f0.dx * e]];
      if (A.walk) runs.push({ pts: arc, w0: A.e.street.sidewalk, w1: A.e.street.sidewalk, rect, u0: [-f1.dx, -f1.dz], u1: [f1.dx, f1.dz] });
    } else {
      J.arms.forEach((A, i) => {
        pts.push(roadPoint(A, A.c, -1));
        const run = bumpy ? densified(cornerRun(J.corners[i]), 3) : cornerRun(J.corners[i]);
        pts.push(...run.slice(0, -1));
        const B = J.corners[i].B;
        const [fa, fb] = [frame(A.pts, A.c), frame(B.pts, B.c)];
        if (A.walk && B.walk) runs.push({ pts: run, w0: A.e.street.sidewalk, w1: B.e.street.sidewalk, u0: [-fa.dx, -fa.dz], u1: [fb.dx, fb.dz] });
      });
    }
    pts = pts.filter((p, q) => Math.hypot(p[0] - pts[(q + pts.length - 1) % pts.length][0], p[1] - pts[(q + pts.length - 1) % pts.length][1]) > 0.02);
    if (pts.length < 3) return null;
    if (!simplePoly(pts)) return { poly: hull(pts), runs: [], sg: 1, fallback: true };
    let area = 0;
    pts.forEach(([x, z], q) => (area += x * pts[(q + 1) % pts.length][1] - pts[(q + 1) % pts.length][0] * z));
    let bend = null;
    if (J.two) {
      const [A, B] = J.arms;
      const st = A.e.street;
      if (st.width === B.e.street.width && !st.median && st.surface !== 'dirt' && B.e.street.surface !== 'dirt') {
        const fa = frame(A.pts, A.c);
        const fb = frame(B.pts, B.c);
        const mid = curveBetween(roadPoint(A, A.c), [-fa.dx, -fa.dz], roadPoint(B, B.c), [fb.dx, fb.dz]);
        if (mid) bend = { pts: mid, st };
      }
    }
    return { poly: pts, runs, sg: area > 0 ? 1 : -1, bend };
  }

  // The sidewalk round each junction's corners (and round a dead end): a
  // band out from the kerb as wide as the sidewalk (or width), dy above the
  // ground, its texture lined up with the sidewalk under it. Geometries.
  function walkBands(dy, width = null) {
    const out = [];
    for (const o of outlines.values()) {
      for (const r of o.runs) {
        const P = r.pts;
        const Q = bandEdge(r, o.sg, width);
        const pos = [];
        const uv = [];
        const idx = [];
        P.forEach((p, k) => {
          for (const [x, z] of [p, Q[k]]) {
            pos.push(x, H(x, z) + dy, z);
            uv.push(x / 8, z / 8);
          }
          if (k) idx.push(2 * k - 2, 2 * k - 1, 2 * k + 1, 2 * k - 2, 2 * k + 1, 2 * k);
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        out.push(g);
      }
    }
    return out;
  }

  // A sidewalk band's far edge: each kerb point moved out by the sidewalk's width.
  function bandEdge(r, sg, width = null) {
    const P = r.pts;
    const n = P.length;
    const total = G.lineLength(P) || 1;
    let s = 0;
    const Q = P.map((p, k) => {
      if (k) s += G.len2(P[k - 1], p);
      const a = P[Math.max(0, k - 1)];
      const b = P[Math.min(n - 1, k + 1)];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      // (Its ends square across the roads, meeting the sidewalk beside the road there.)
      const [dx, dz] = k === 0 && r.u0 ? r.u0 : k === n - 1 && r.u1 ? r.u1 : [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const w = width ?? r.w0 + ((r.w1 - r.w0) * s) / total;
      return [p[0] + dz * sg * w, p[1] - dx * sg * w];
    });
    // (Round a curve tighter than the sidewalk is wide the far edge loops over
    // itself: the loop is pinched to where it crosses.)
    for (let i = 0; i + 1 < Q.length; i++) {
      for (let j = Q.length - 2; j > i + 1; j--) {
        const x = segCross(Q[i], Q[i + 1], Q[j], Q[j + 1]);
        if (!x) continue;
        for (let k = i + 1; k <= j; k++) Q[k] = x;
        i = j;
        break;
      }
    }
    return Q;
  }

  // Where segments a-b and c-d cross, or null.
  function segCross(a, b, c, d) {
    const rx = b[0] - a[0];
    const rz = b[1] - a[1];
    const qx = d[0] - c[0];
    const qz = d[1] - c[1];
    const den = rx * qz - rz * qx;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0] - a[0]) * qz - (c[1] - a[1]) * qx) / den;
    const u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
    return t > 0 && t < 1 && u > 0 && u < 1 ? [a[0] + rx * t, a[1] + rz * t] : null;
  }

  // Lot, from a corner's sidewalk out to where the lot's own edges meet: its
  // sharp corner (a block's, a wedge's tip, the outside of a bend) would leave
  // bare pavement past the curve of the sidewalk. (Not where a site has the
  // corner: its own surface stays as it is.)
  function lotPatches(dy) {
    const out = [];
    for (const o of outlines.values()) {
      for (const r of o.runs) {
        const inSite = (poly) => {
          const [cx, cz] = G.polyCentroid(poly);
          return map.sites.some((st) => G.pointInPoly(cx, cz, st.poly));
        };
        if (r.rect && !inSite(r.rect)) out.push(surface(r.rect, dy));
        if (!r.u0) continue;
        const Q = bandEdge(r, o.sg);
        const corner = meet(Q[0], r.u0, Q[Q.length - 1], r.u1, 80);
        if (!corner) continue;
        // (Only past the sidewalk: a lot corner cutting into it is covered by it.)
        const mid = Math.floor(Q.length / 2);
        const kerbMid = r.pts[mid];
        if (G.len2(corner, kerbMid) <= G.len2(Q[mid], kerbMid) + 0.05) continue;
        const poly = [...Q, corner];
        const [cx, cz] = G.polyCentroid(poly);
        if (map.sites.some((st) => G.pointInPoly(cx, cz, st.poly) || G.pointInPoly(corner[0], corner[1], st.poly))) continue;
        if (Math.abs(G.polyArea(poly)) > 0.05) out.push(surface(poly, dy));
      }
    }
    return out;
  }

  // No two of a polygon's edges cross?
  function simplePoly(p) {
    const n = p.length;
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    for (let i = 0; i < n; i++) {
      const [a, b] = [p[i], p[(i + 1) % n]];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const [c, d] = [p[j], p[(j + 1) % n]];
        if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) continue;
        const d1 = cross(a, b, c);
        const d2 = cross(a, b, d);
        const d3 = cross(c, d, a);
        const d4 = cross(c, d, b);
        if (((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))) return false;
      }
    }
    return true;
  }

  function hull(points) {
    const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const q of p) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
      lower.push(q);
    }
    const upper = [];
    for (const q of [...p].reverse()) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
      upper.push(q);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
  }

  // Text on a sign panel, facing (fx, fz), its bottom at y.
  function text(str, color, x, y, z, fx, fz, w) {
    const t = textTexture(str, color);
    const h = (w * t.image.height) / t.image.width;
    const g = new THREE.PlaneGeometry(w, h);
    g.rotateY(Math.atan2(fx, fz));
    g.translate(x + fx * 0.3, y + h / 2, z + fz * 0.3);
    const key = `${str}|${color}`;
    if (!texts.has(key)) texts.set(key, []);
    texts.get(key).push(g);
    return h;
  }

  // A neon sign from the shared sign sheet, facing (fx, fz).
  function sign(k, x, y, z, fx, fz, maxW, maxH) {
    const vertical = k % 3 === 1;
    const rects = vertical ? tex.signs.vertical : tex.signs.rects.slice(1);
    const rect = rects[k % rects.length];
    let h = vertical ? Math.min(maxH, 12) : Math.min(maxH, 4.5);
    let w = h * rect.aspect;
    if (w > maxW) {
      w = maxW;
      h = w / rect.aspect;
    }
    if (h < 1.5) return;
    const g = new THREE.PlaneGeometry(w, h);
    setUvRect(g, rect);
    g.rotateY(Math.atan2(fx, fz));
    g.translate(x + fx * 0.4, y + h / 2, z + fz * 0.4);
    B.signs.push(g);
  }

  // The front face of a building item: its middle at ground level, and the
  // directions out of it and along it.
  function frontOf(it) {
    const o = it.obb;
    const [fx, fz] = it.front;
    return { x: o.x + fx * o.hd, z: o.z + fz * o.hd, fx, fz, ax: fz, az: -fx, w: o.hw * 2, y: H(o.x, o.z) };
  }

  function buildingBox(it, list, color) {
    const g = obbBox(it.obb, it.h, it.y);
    if (list === B.building || list === B.glass) {
      boxUvs(g, it.obb.hw * 2, it.h, it.obb.hd * 2, (it.cycle || 0) * 0.37);
      list.push(g);
    } else list.push(color ? tint(g, color) : g);
    // A dark roof with a lip.
    B.dark.push(obbBox({ ...it.obb, hw: it.obb.hw + 0.25, hd: it.obb.hd + 0.25 }, 0.35, it.y + it.h - 0.05));
    return it.y + it.h;
  }

  function speakerPosts(list) {
    if (!list.length) return null;
    const post = mergeGeometries([box(0.12, 1.3, 0.12, 0, 0.65, 0), box(0.4, 0.3, 0.2, 0, 1.3, 0)]);
    const m = new THREE.InstancedMesh(post, mats.steel, list.length);
    list.forEach((s, k) => m.setMatrixAt(k, new THREE.Matrix4().makeTranslation(s.x, s.y, s.z)));
    return m;
  }
}

// Scales box UVs to world size so windows stay the same size everywhere.
// The part of polygon p inside the convex polygon c.
function clipToConvex(p, c) {
  const sg = G.polyArea(c) > 0 ? 1 : -1;
  let out = p;
  for (let k = 0; k < c.length && out.length > 2; k++) {
    const [ax, az] = c[k];
    const [bx, bz] = c[(k + 1) % c.length];
    const n = [-(bz - az) * sg, (bx - ax) * sg];
    out = G.clipHalf(out, n, n[0] * ax + n[1] * az);
  }
  return out;
}

// Merges geometries, saying which kinds didn't match if they can't be.
function merged(list) {
  const g = mergeGeometries(list);
  if (!g) throw new Error('plan view: cannot merge ' + [...new Set(list.map((q) => Object.keys(q.attributes).sort().join(',') + (q.index ? ' indexed' : '') + ' ' + q.type))].join(' | '));
  return g;
}

function boxUvs(g, sx, sy, sz, seed) {
  const [U, V] = UV_SCALE;
  const uv = g.attributes.uv;
  const ou = (Math.floor(seed * 16) % 16) / 16;
  const ov = (Math.floor(seed * 32) % 32) / 32;
  const faceSize = [[sz, sy], [sz, sy], null, null, [sx, sy], [sx, sy]];
  for (let face = 0; face < 6; face++) {
    for (let k = face * 4; k < face * 4 + 4; k++) {
      const size = faceSize[face];
      if (!size) uv.setXY(k, 0.005, 0.995);
      else uv.setXY(k, ou + (uv.getX(k) * size[0]) / U, ov + (uv.getY(k) * size[1]) / V);
    }
  }
}

// The item drawers for a plan district view: one per layout item type, each
// adding geometry to the view's buckets (ctx).
// A fountain's water: each jet a column rising and falling, drops arcing out
// from its top down to the basin. (still: the jets stand, no drops.)
function fountainWater(jets, add) {
  if (!jets.length) return null;
  const mat = glowMaterial({ color: '#d8f4ff', intensity: 1.4 });
  const column = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 1, 1, 8).translate(0, 0.5, 0), mat, jets.length);
  const DROPS = 10;
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 5, 4), mat, jets.length * DROPS);
  column.frustumCulled = drops.frustumCulled = false;
  add(column);
  add(drops);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const P = new THREE.Vector3();
  const S = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const update = (real) => {
    jets.forEach((j, k) => {
      const f = j.still ? 1 : 0.82 + 0.18 * Math.sin(real * 2.6 + j.ph * 1.3);
      m.compose(P.set(j.x, j.y, j.z), q, S.set(j.r, j.h * f, j.r));
      column.setMatrixAt(k, m);
      for (let d = 0; d < DROPS; d++) {
        if (j.still) {
          drops.setMatrixAt(k * DROPS + d, zero);
          continue;
        }
        const p = (real * 0.7 + d / DROPS + j.ph * 0.17) % 1;
        const a = d * 2.4 + j.ph;
        const out = j.fall * p;
        const top = j.y + j.h * f;
        m.compose(P.set(j.x + Math.cos(a) * out, top + 0.8 * p - (top - j.y) * p * p, j.z + Math.sin(a) * out), q, S.set(1, 1, 1));
        drops.setMatrixAt(k * DROPS + d, m);
      }
    });
    column.instanceMatrix.needsUpdate = true;
    drops.instanceMatrix.needsUpdate = true;
  };
  update(0); // (where they stand from the start)
  return update;
}

function makeDrawers(ctx) {
  const { B, neon, flicker, speakers, sprays, text, sign, frontOf, buildingBox, H, look, OL, jets } = ctx;
  const neonN = neon.length;
  const N = (k) => neon[((k % neonN) + neonN) % neonN];
  const at = (x, z) => H(x, z);
  // A point on a building's front: `a` metres along it, `out` metres out from it.
  const onFront = (f, a, out = 0) => [f.x + f.ax * a + f.fx * out, f.z + f.az * a + f.fz * out];
  const yawOf = (fx, fz) => Math.atan2(fx, fz);
  const neonBand = (it, y, k) => {
    // A glowing band round a building's top.
    const o = it.obb;
    N(k).push(obbBox({ ...o, hw: o.hw + 0.12, hd: o.hd + 0.12 }, 0.4, y - 0.4));
  };

  const buildings = {
    casino(it, f, top) {
      buildingBox(it, B.building);
      neonBand(it, top, it.cycle);
      // A marquee canopy over the doors, lit underneath, and big signs up the front.
      const [cx, cz] = onFront(f, 0, 2.5);
      B.dark.push(box(f.w * 0.7, 0.6, 5, cx, f.y + 6.2, cz, yawOf(f.fx, f.fz)));
      N(it.cycle + 1).push(box(f.w * 0.7, 0.15, 4.8, cx, f.y + 5.85, cz, yawOf(f.fx, f.fz)));
      sign(it.cycle, f.x, f.y + 8.5, f.z, f.fx, f.fz, f.w * 0.8, top - f.y - 12);
      if (it.h > 30) {
        const [sx, sz] = onFront(f, f.w * 0.3);
        sign(it.cycle + 1, sx, f.y + 22, sz, f.fx, f.fz, f.w * 0.35, top - f.y - 26);
      }
    },
    club(it, f, top) {
      buildingBox(it, B.building);
      neonBand(it, top, it.cycle + 2);
      const [dx, dz] = onFront(f, -f.w * 0.25, 1.2);
      B.dark.push(box(4.5, 0.3, 2.4, dx, f.y + 3.4, dz, yawOf(f.fx, f.fz)));
      N(it.cycle).push(box(4.6, 0.1, 2.5, dx, f.y + 3.2, dz, yawOf(f.fx, f.fz)));
      sign(it.cycle * 7 + 1, f.x, f.y + 5, f.z, f.fx, f.fz, f.w * 0.6, top - f.y - 6);
    },
    hotel(it, f, top) {
      buildingBox(it, B.building);
      neonBand(it, top, it.cycle);
      neonBand(it, it.y + 16, it.cycle + 1);
      // The hotel's name along its top.
      const name = ['MOONGLOW', 'GOLDEN SPUR', 'VELVET SANDS', 'SILVER SEVEN', 'NEON ROYALE', 'ORBIT', 'LUCKY STAR', 'CROWN JEWEL'][it.cycle % 8];
      text(name, look.neon[it.cycle % neonN], f.x, top - 6, f.z, f.fx, f.fz, Math.min(f.w * 0.8, 30));
      const [cx, cz] = onFront(f, 0, 3);
      B.gold.push(box(Math.min(f.w * 0.5, 20), 0.3, 6, cx, f.y + 4.5, cz, yawOf(f.fx, f.fz)));
    },
    motel(it, f) {
      // Two storeys, pastel, a walkway along the upper floor, doors all along.
      buildingBox(it, B.painted, ['#e8b8c8', '#b8d8e8', '#e8e0b0', '#c8e8c0', '#d8c0e8', '#f0c8a8'][it.cycle % 6]);
      const yaw = yawOf(f.fx, f.fz);
      const [wx, wz] = onFront(f, 0, 0.8);
      B.dark.push(box(f.w - 1, 0.3, 1.6, wx, f.y + 3.6, wz, yaw));
      const [rx, rz] = onFront(f, 0, 1.6);
      B.steel.push(box(f.w - 1, 1, 0.08, rx, f.y + 4.3, rz, yaw));
      for (let a = -f.w / 2 + 3; a < f.w / 2 - 2; a += 4) {
        for (const fl of [1.2, 4.9]) {
          const [x, z] = onFront(f, a, 0.05);
          B.dark.push(box(1.1, 2.1, 0.1, x, f.y + fl, z, yaw));
        }
      }
      const [nx, nz] = onFront(f, 0, 0.2);
      N(it.cycle).push(box(f.w - 1, 0.15, 0.15, nx, it.y + it.h - 0.3, nz, yaw));
    },
    chapel(it, f, top) {
      buildingBox(it, B.painted, '#f0ecf4');
      const o = it.obb;
      // The steeple, and a neon heart over the door.
      B.painted.push(tint(new THREE.ConeGeometry(Math.min(o.hw, o.hd) * 0.6, 9, 4).rotateY(Math.PI / 4 + o.yaw).translate(o.x, top + 4.5, o.z), '#e8e0f0'));
      B.gold.push(box(0.3, 3, 0.3, o.x, top + 10, o.z));
      const [hx, hz] = onFront(f, 0, 0.2);
      N(0).push(box(2.4, 2, 0.2, hx, f.y + 5.2, hz, yawOf(f.fx, f.fz)));
      if (it.drive) {
        // The drive-through: a canopy out over its side lane.
        const [cx, cz] = onFront(f, f.w / 2 + 3.5, -o.hd);
        B.painted.push(tint(box(6, 0.4, o.hd * 1.4, cx, f.y + 4.4, cz, o.yaw), '#f0ecf4'));
        N(0).push(box(6.1, 0.12, o.hd * 1.4 + 0.1, cx, f.y + 4.15, cz, o.yaw));
        const [tx, tz] = onFront(f, f.w / 2 + 3.5, 0.5);
        text('DRIVE THRU WEDDINGS', look.neon[0], tx, f.y + 5, tz, f.fx, f.fz, 7);
      }
    },
    pawn(it, f) {
      buildingBox(it, B.painted, ['#a89878', '#8a9aa8', '#b0a090', '#98a088'][it.cycle % 4]);
      const yaw = yawOf(f.fx, f.fz);
      const [sx, sz] = onFront(f, 0, 0.1);
      B.dark.push(box(f.w - 1.5, 2.6, 0.12, sx, f.y + 1.5, sz, yaw));
      text(['PAWN', 'BAIL BONDS', 'GOLD BUYER', 'CHECKS CASHED', 'PAWN', 'LOANS'][it.cycle % 6], ['#ffd040', '#ff4060', '#40e0ff'][it.cycle % 3], sx, f.y + 3.3, sz, f.fx, f.fz, Math.min(f.w - 2, 10));
    },
    flats(it, f, top) {
      buildingBox(it, B.building);
      const yaw = yawOf(f.fx, f.fz);
      for (let fl = 3.2; fl < top - it.y - 2; fl += 3.2) {
        const [x, z] = onFront(f, 0, 0.6);
        B.steel.push(box(f.w - 2, 0.15, 1.2, x, it.y + 1 + fl, z, yaw));
      }
    },
    shop(it, f, top) {
      // Candy Chrome: candy-striped walls, the name in chrome and pink, big garage doors.
      const o = it.obb;
      const n = Math.max(3, Math.round(o.hw / 3));
      for (let q = 0; q < n; q++) {
        const a = -o.hw + ((q + 0.5) * 2 * o.hw) / n;
        const piece = { ...o, x: o.x + f.ax * a, z: o.z + f.az * a, hw: o.hw / n };
        B.painted.push(tint(obbBox(piece, it.h, it.y), q % 2 ? '#ffffff' : '#ff6ab4'));
      }
      const yaw = yawOf(f.fx, f.fz);
      for (const a of [-o.hw * 0.5, 0, o.hw * 0.5]) {
        const [x, z] = onFront(f, a, 0.08);
        B.dark.push(box(7, 4.6, 0.12, x, f.y + 2.3, z, yaw));
      }
      text('CANDY CHROME', '#ff6ab4', f.x, top - 3.6, f.z, f.fx, f.fz, Math.min(f.w * 0.8, 26));
      N(0).push(obbBox({ ...o, hw: o.hw + 0.1, hd: o.hd + 0.1 }, 0.3, top - 0.3));
    },
    pinkroom(it, f, top) {
      buildingBox(it, B.painted, '#e070b0');
      neonBand(it, top, 0);
      const [cx, cz] = onFront(f, 0, 2);
      B.dark.push(box(8, 0.4, 4, cx, f.y + 3.6, cz, yawOf(f.fx, f.fz)));
      B.gold.push(box(8.1, 0.12, 4.1, cx, f.y + 3.35, cz, yawOf(f.fx, f.fz)));
      text('THE PINK ROOM', '#ff80c8', f.x, f.y + 6, f.z, f.fx, f.fz, Math.min(f.w * 0.85, 26));
    },
    arcade(it, f, top) {
      // The Hi-Score: Googie, a swooping roof out over the front, neon everywhere.
      buildingBox(it, B.painted, '#3ab8b0');
      const o = it.obb;
      const [rx, rz] = onFront(f, 0, 6);
      const roof = box(f.w + 8, 0.8, o.hd * 2 + 14, 0, 0, 0);
      roof.rotateX(-0.12);
      roof.rotateY(yawOf(f.fx, f.fz));
      roof.translate((rx + o.x) / 2, top + 2, (rz + o.z) / 2);
      B.painted.push(tint(roof, '#f0f0f0'));
      neonBand(it, top, 1);
      text('HI-SCORE ARCADE & BOWL', '#40f0ff', f.x, f.y + 5, f.z, f.fx, f.fz, Math.min(f.w * 0.7, 40));
    },
    counting(it, f) {
      // The counting house: a concrete strongroom, the cash truck's door on the street.
      buildingBox(it, B.concrete);
      const [dx, dz] = onFront(f, 0, 0.08);
      B.steel.push(box(6, 4.2, 0.2, dx, f.y + 2.1, dz, yawOf(f.fx, f.fz)));
      B.gold.push(box(6.4, 0.2, 0.25, dx, f.y + 4.4, dz, yawOf(f.fx, f.fz)));
    },
    depot(it, f, top) {
      buildingBox(it, B.building);
      text('TOUR DEPOT', '#ffd040', f.x, top - 3, f.z, f.fx, f.fz, 12);
    },
  };

  return {
    bldg(it) {
      const f = frontOf(it);
      const top = it.y + it.h;
      (buildings[it.kind] || ((q) => buildingBox(q, B.building)))(it, f, top);
    },
    podium(it) {
      // (Extruded shapes have UVs in metres: scale them to the facade texture.)
      B.building.push(scaleUv(prism(it.poly, it.y, it.h), 1 / 48, 1 / 96));
      if (!it.roof) B.dark.push(flatPoly(it.poly, () => it.y + it.h + 0.03));
      if (!it.roof) {
        // Gold neon along the podium's top edges.
        for (let k = 0; k < it.poly.length; k++) {
          const [ax, az] = it.poly[k];
          const [bx, bz] = it.poly[(k + 1) % it.poly.length];
          const L = Math.hypot(bx - ax, bz - az);
          B.gold.push(box(0.3, 0.4, L, (ax + bx) / 2, it.y + it.h - 0.3, (az + bz) / 2, Math.atan2(bx - ax, bz - az)));
        }
      }
    },
    tower(it) {
      const top = it.y + it.h;
      const g = obbBox(it.obb, it.h, it.y);
      boxUvs(g, it.obb.hw * 2, it.h, it.obb.hd * 2, 0.3);
      B.glass.push(g);
      for (let y = it.y + 12; y < top - 4; y += 12) B.gold.push(obbBox({ ...it.obb, hw: it.obb.hw + 0.15, hd: it.obb.hd + 0.15 }, 0.35, y));
    },
    crown(it) {
      // The neon crown: stepped rings, spikes, a beacon.
      let y = it.y;
      for (const [s, k] of [[1, 0], [0.8, 2], [0.6, 1]]) {
        N(k).push(box(it.hw * 2 * s + 0.4, 0.5, it.hd * 2 * s + 0.4, it.x, y + 0.25, it.z));
        B.dark.push(box(it.hw * 2 * s, 3.5, it.hd * 2 * s, it.x, y + 1.75, it.z));
        y += 3.5;
      }
      for (let q = 0; q < 10; q++) {
        const a = (q / 10) * Math.PI * 2;
        B.gold.push(box(0.5, 6, 0.5, it.x + Math.cos(a) * it.hw * 0.6, y + 3, it.z + Math.sin(a) * it.hd * 0.6));
      }
      B.gold.push(box(1.6, 14, 1.6, it.x, y + 7, it.z), box(3, 3, 3, it.x, y + 15, it.z));
    },
    porteCochere(it) {
      // A gold-lit canopy over the underpass mouth, out over Marquee St's sidewalk.
      const zc = (it.z0 + it.z1) / 2;
      B.dark.push(box(it.hw * 2, 1, it.z1 - it.z0, it.x, it.y + 0.5, zc));
      B.gold.push(box(it.hw * 2 - 1, 0.1, it.z1 - it.z0 - 0.6, it.x, it.y - 0.05, zc));
      B.gold.push(box(it.hw * 2 + 0.3, 0.3, 0.3, it.x, it.y + 1, it.z0));
      text('THE GLOW PALACE', '#ffc850', it.x, it.y + 1.4, it.z0, 0, -1, 26);
      B.dark.push(box(26.4, 3.8, 0.12, it.x, it.y + 1.4 + 1.75, it.z0 + 0.02)); // (a board behind the name)
      // (A copy: columns under its corners.)
      if (it.copy) {
        for (const sx of [-1, 1]) {
          for (const z of [it.z0 + 0.4, it.z1 - 0.4]) {
            const x = it.x + sx * (it.hw - 0.4);
            const g = at(x, z);
            B.dark.push(box(0.5, it.y - g, 0.5, x, (it.y + g) / 2, z));
          }
        }
      }
    },
    palaceFront(it) {
      text('CASINO', look.neon[0], 0, it.y + 9.5, it.top - 0.1, 0, -1, 16);
      // The same over the car park side.
      text('THE GLOW PALACE', '#ffc850', 0, it.y + 8.5, it.back + 0.1, 0, 1, 34);
    },
    underpass(it) {
      // Gold light strips down the ceiling and along both walls.
      const L = it.z1 - it.z0;
      const zc = (it.z0 + it.z1) / 2;
      for (const x of [-2.5, 2.5]) B.gold.push(box(0.5, 0.1, L, x, it.y + it.ceiling - 0.08, zc));
      for (const s of [-1, 1]) B.gold.push(box(0.1, 0.25, L, s * (it.half - 0.06), it.y + 2.6, zc));
    },
    cashDock(it) {
      // A steel roller door at the back of the bay, hazard stripes on its floor.
      const zc = (it.z0 + it.z1) / 2;
      B.steel.push(box(0.2, 5, it.z1 - it.z0 - 2, -it.x + 0.12, it.y + 2.5, zc));
      for (let z = it.z0 + 1; z < it.z1 - 1; z += 2) B.gold.push(box(it.x - 5.2, 0.03, 0.8, -(it.x + 5) / 2, it.y + 0.02, z));
    },
    fountain(it) {
      const y = at(it.x, it.z);
      B.concrete.push(new THREE.CylinderGeometry(it.rad, it.rad + 0.4, 0.8, 24).translate(it.x, y + 0.4, it.z));
      B.screen.push(new THREE.CylinderGeometry(it.rad - 0.5, it.rad - 0.5, 0.1, 24).translate(it.x, y + 0.72, it.z));
      // Its jets: rising and falling, water dropping from them (fountainWater).
      const still = !!it.set?.still;
      jets.push({ x: it.x, y: y + 0.75, z: it.z, h: 6.5, r: 0.6, ph: 0, fall: it.rad * 0.55, still });
      for (let q = 0; q < 6; q++) {
        const a = (q / 6) * Math.PI * 2;
        jets.push({ x: it.x + Math.cos(a) * it.rad * 0.6, y: y + 0.75, z: it.z + Math.sin(a) * it.rad * 0.6, h: 3, r: 0.25, ph: q + 1, fall: 0.9, still });
      }
    },
    lowWall(it) {
      B.concrete.push(obbBox(it.obb, it.h, it.y));
    },
    car(it) {
      const o = it.obb;
      const y = at(o.x, o.z);
      B.painted.push(npcCar(it.color, { x: o.x, y, z: o.z, yaw: o.yaw }));
    },
    mast(it) {
      const y = at(it.x, it.z);
      B.steel.push(box(0.5, it.h, 0.5, it.x, y + it.h / 2 - 1, it.z));
      OL.head(it, B.lamp, box(3, 0.6, 1.2, it.x, y + it.h - 1, it.z), box(1.2, 0.6, 3, it.x, y + it.h - 1, it.z));
      // (Its light on the ground round it, wider the higher it is.)
      OL.pool(it, B.pool, Math.min(34, Math.max(12, it.h * 1.4)), (S) => new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2).translate(it.x, y + 0.05, it.z));
    },
    booth(it) {
      const y = at(it.x, it.z);
      B.painted.push(tint(obbBox(it.obb, 2.6, y), '#f0e8f8'));
      B.dark.push(obbBox({ ...it.obb, hw: it.obb.hw + 0.4, hd: it.obb.hd + 0.4 }, 0.25, y + 2.6));
      B.white.push(obbBox({ ...it.obb, hw: it.obb.hw + 0.02, hd: it.obb.hd * 0.6 }, 1, y + 1.2));
    },
    shelter(it) {
      const y = at(it.x, it.z);
      const o = it.obb;
      B.dark.push(obbBox({ ...o, hw: o.hw + 0.6 }, 0.2, y + 2.8));
      N(0).push(obbBox({ ...o, hw: o.hw + 0.62, hd: o.hd + 0.02 }, 0.08, y + 2.72));
      B.steel.push(obbBox({ ...o, hw: 0.1, hd: o.hd }, 2.8, y), obbBox({ ...o, hw: o.hw * 0.4 }, 0.5, y + 0.4));
    },
    stall(it) {
      const o = it.obb;
      const y = at(o.x, o.z);
      B.dark.push(obbBox({ ...o, hw: o.hw - 0.2, hd: o.hd - 0.2 }, 1.1, y));
      B.painted.push(tint(obbBox({ ...o, hw: o.hw + 0.2, hd: o.hd + 0.2 }, 0.15, y + 2.7), it.set?.roof || ['#c83a4a', '#3a8ac8', '#e0b020', '#3aa05a', '#b04dff', '#e06a2a'][it.cycle % 6]));
      B.steel.push(obbBox({ ...o, hw: 0.08, hd: o.hd }, 2.7, y));
      if (it.set?.light || it.cycle % 3 === 0) OL.colored(it.set?.light, N(it.cycle), obbBox({ ...o, hw: o.hw + 0.22, hd: 0.06 }, 0.1, y + 2.6));
    },
    foodTruck(it) {
      const o = it.obb;
      const y = at(o.x, o.z);
      B.painted.push(tint(obbBox(o, 2.8, y + 0.4), ['#e8e0d0', '#ff6ab4', '#40c0e0'][it.cycle % 3]));
      B.dark.push(obbBox({ ...o, hw: o.hw - 0.1, hd: o.hd - 0.4 }, 0.6, y));
      N(it.cycle).push(obbBox({ ...o, hw: o.hw + 0.05, hd: o.hd * 0.5 }, 0.9, y + 1.6));
    },
    lights(it) {
      // A string of bulbs across the market lane.
      for (let q = -it.span / 2; q <= it.span / 2; q += 1.6) OL.head(it, B.white, box(0.22, 0.22, 0.22, it.x - it.dz * q, it.y - Math.cos((q / it.span) * Math.PI) * 0.4, it.z + it.dx * q));
      // (Their light on the lane under them, along the string.)
      OL.pool(it, B.pool, 7, (S) => new THREE.PlaneGeometry(it.span + 4, S).rotateX(-Math.PI / 2).rotateY(Math.atan2(-it.dx, -it.dz)).translate(it.x, at(it.x, it.z) + 0.05, it.z));
      // (A copy: a pole at each end to hang from.)
      if (it.copy) {
        for (const s of [-1, 1]) {
          const [ex, ez] = [it.x - it.dz * s * (it.span / 2), it.z + it.dx * s * (it.span / 2)];
          const g = at(ex, ez);
          B.steel.push(box(0.15, it.y + 0.3 - g, 0.15, ex, (it.y + 0.3 + g) / 2, ez));
        }
      }
    },
    marketGate(it) {
      const y = it.y;
      for (const s of [-1, 1]) B.steel.push(box(0.6, 7, 0.6, it.x + s * (it.span / 2), y + 3.5, it.z));
      B.dark.push(box(it.span + 1, 1.6, 0.6, it.x, y + 7.2, it.z));
      text('NIGHT MARKET', look.neon[1], it.x, y + 6.6, it.z - 0.3, 0, -1, it.span - 1);
    },
    fence(it) {
      const o = it.obb;
      const y = at(o.x, o.z);
      B.dark.push(obbBox({ ...o, hw: 0.04 }, 2.4, y));
      for (let t = -o.hd; t <= o.hd; t += 3) B.steel.push(box(0.12, 2.6, 0.12, o.x + Math.sin(o.yaw) * t, y + 1.3, o.z + Math.cos(o.yaw) * t));
    },
    screen(it) {
      const o = it.obb;
      const y = at(o.x, o.z);
      B.steel.push(obbBox({ ...o, hd: 0.6 }, it.h, y));
      // The lit screen, facing the lot (north), up on its frame.
      const g = new THREE.PlaneGeometry(o.hw * 2 - 2, it.h - 8);
      g.rotateY(Math.PI);
      g.translate(o.x, y + 4 + (it.h - 8) / 2, o.z - o.hd - 0.05);
      B.screen.push(g);
      N(1).push(box(o.hw * 2, 0.3, 0.3, o.x, y + it.h, o.z - o.hd - 0.1));
    },
    snackBar(it) {
      const o = it.obb;
      const y = at(o.x, o.z);
      B.painted.push(tint(obbBox(o, 4.6, y), '#f0e0c0'));
      B.dark.push(obbBox({ ...o, hw: o.hw + 1, hd: o.hd + 1 }, 0.3, y + 4.6));
      N(0).push(obbBox({ ...o, hw: o.hw + 1.02, hd: o.hd + 1.02 }, 0.1, y + 4.5));
      text('SNACK BAR', '#ffd040', o.x, y + 5, o.z - o.hd - 1, 0, -1, 9);
      B.white.push(box(3, 1, 0.1, o.x, y + 3.6, o.z + o.hd + 0.06)); // the projector window
    },
    hump(it) {
      B.painted.push(tint(rampGeometry(it.ramp, it.y), '#3a3848'));
    },
    speaker(it) {
      speakers.push({ x: it.x, y: it.y, z: it.z });
    },
    driveinGate(it) {
      const y = it.y;
      for (const s of [-1, 1]) B.steel.push(box(0.6, 8, 0.6, it.x + s * (it.span / 2), y + 4, it.z));
      B.dark.push(box(it.span + 2, 2, 0.6, it.x, y + 8.4, it.z));
      text('STARLITE DRIVE-IN', '#40f0ff', it.x, y + 7.6, it.z - 0.3, 0, -1, it.span);
      N(2).push(new THREE.ConeGeometry(1.4, 2.4, 5).translate(it.x, y + 10.8, it.z));
    },
    deadSign(it) {
      // A dead sign of the Strip, faded, its neon tubes dark (a few still flicker).
      const o = it.obb;
      const y = at(o.x, o.z);
      const faded = ['#8a6a5a', '#6a7a8a', '#8a8060', '#7a6a8a'][it.cycle % 4];
      const place = (g) => {
        if (it.lying) g.rotateX(-Math.PI / 2).translate(0, 0, o.hd);
        return g.rotateY(o.yaw).translate(o.x, y, o.z);
      };
      const shape = it.lying ? deadSignShape(it.shape, o.hw * 2, it.h - 1, o.hd * 2) : deadSignShape(it.shape, o.hw * 2, o.hd * 2, it.h - 1);
      for (const g of shape.body) B.painted.push(tint(place(g), faded));
      const tubes = shape.tube.map(place);
      if (it.flicker && !it.set?.still) flicker.push({ geos: tubes, k: it.cycle });
      else B.dark.push(...tubes);
    },
    bus(it) {
      const o = it.obb;
      const y = at(o.x, o.z);
      B.painted.push(tint(obbBox(o, 3, y + 0.4), ['#d8d0c0', '#3a6ab8', '#c83a4a', '#2a8a7a'][it.color % 4]));
      B.dark.push(obbBox({ ...o, hw: o.hw + 0.03, hd: o.hd - 1 }, 0.9, y + 2), obbBox({ ...o, hw: o.hw - 0.2, hd: o.hd - 0.6 }, 0.6, y));
    },
    pylon(it) {
      const o = it.obb;
      const y = at(o.x, o.z);
      B.steel.push(obbBox({ ...o, hw: 0.4, hd: 0.4 }, it.h - 5, y));
      const words = it.set?.text || it.sign;
      B.dark.push(box(words.length * 0.9 + 2, 3.4, 1, o.x, y + it.h - 2.5, o.z));
      for (const fz of [-1, 1]) text(words, it.set?.color || look.neon[fz > 0 ? 1 : 0], o.x, y + it.h - 3.6, o.z + fz * 0.5, 0, fz, words.length * 0.9);
    },
    tyres(it) {
      const o = it.obb;
      const y = at(o.x, o.z);
      for (let k = 0; k < 4; k++) B.dark.push(tireGeometry(1.2, 0.55, 0.42).translate(o.x, y + 0.22 + k * 0.44, o.z));
    },
    pole(it) {
      // A motel's pole sign: MOTEL down a tall board, a neon arrow, VACANCY under it.
      const o = it.obb;
      const y = at(o.x, o.z);
      B.steel.push(box(0.5, it.h, 0.5, o.x, y + it.h / 2 - 1, o.z));
      const [fx, fz] = it.front;
      const ax = fz;
      const az = -fx;
      B.dark.push(box(1.2, 5, 5, o.x + ax * 0, y + it.h - 3, o.z, Math.atan2(fx, fz) + Math.PI / 2));
      // (On the board's two faces, which face its front and back.)
      for (const s of [-1, 1]) text(it.set?.text || 'MOTEL', it.set?.color || look.neon[it.cycle % neonN], o.x + fx * s * 0.61, y + it.h - 4.2, o.z + fz * s * 0.61, fx * s, fz * s, 4.4);
      N(it.cycle + 1).push(box(0.3, 0.3, 4, o.x, y + it.h - 6.2, o.z, Math.atan2(ax, az)));
    },
    lamp(it) {
      const o = it.obb;
      const y = at(o.x, o.z);
      const [tx, tz] = it.toward;
      B.steel.push(box(0.25, 7, 0.25, o.x, y + 3.5, o.z), box(0.2, 0.2, 2.6, o.x + tx * 1.3, y + 6.9, o.z + tz * 1.3, Math.atan2(tx, tz)));
      OL.head(it, B.lamp, box(0.8, 0.18, 0.5, o.x + tx * 2.6, y + 6.75, o.z + tz * 2.6, Math.atan2(tx, tz)));
      OL.pool(it, B.pool, 9, (S) => new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2).translate(o.x + tx * 4, at(o.x + tx * 4, o.z + tz * 4) + 0.05, o.z + tz * 4));
    },
    median(it) {
      B.concrete.push(obbBox(it.obb, it.h, it.y));
      for (const s of [-1, 1]) {
        const o = it.obb;
        const off = o.hw - 0.08;
        N(1).push(obbBox({ ...o, x: o.x + Math.cos(o.yaw) * s * off, z: o.z - Math.sin(o.yaw) * s * off, hw: 0.06 }, 0.08, it.y + it.h));
      }
    },
    palm(it) {
      // A palm on the median: a trunk in rings, curving a little its own way,
      // fronds rising then drooping all round, coconuts under them, a neon
      // ring round the trunk.
      const lean = ((((Math.round(it.x) * 7 + Math.round(it.z) * 13) % 12) + 12) % 12) * (Math.PI / 6);
      const [lx, lz] = [Math.sin(lean), Math.cos(lean)];
      for (let k = 0; k < 7; k++) {
        const off = ((k + 0.5) / 7) ** 2 * 0.6;
        B.trunk.push(new THREE.CylinderGeometry(0.27 - k * 0.012, 0.3 - k * 0.012, 0.96, 7).translate(it.x + lx * off, it.y + k + 0.5, it.z + lz * off));
      }
      const [tx, ty, tz] = [it.x + lx * 0.6, it.y + 7, it.z + lz * 0.6];
      const leaf = (g) => (it.set?.leaves ? B.painted.push(tint(g, it.set.leaves)) : B.plant.push(g));
      for (let q = 0; q < 9; q++) {
        const a = (q / 9) * Math.PI * 2 + lean;
        const up = 0.25 + (q % 3) * 0.1;
        const [ex, ey] = [1.9 * Math.cos(up), 1.9 * Math.sin(up)];
        leaf(new THREE.BoxGeometry(0.55, 0.06, 1.9).translate(0, 0, 0.95).rotateX(-up).rotateY(a).translate(tx, ty, tz));
        leaf(new THREE.BoxGeometry(0.45, 0.06, 1.9).translate(0, 0, 0.95).rotateX(0.55).rotateY(a).translate(tx + Math.sin(a) * ex, ty + ey, tz + Math.cos(a) * ex));
      }
      for (let q = 0; q < 3; q++) {
        const a = (q / 3) * Math.PI * 2 + 0.4;
        B.trunk.push(new THREE.SphereGeometry(0.17, 6, 4).translate(tx + Math.sin(a) * 0.3, ty - 0.25, tz + Math.cos(a) * 0.3));
      }
      N(it.neon).push(new THREE.TorusGeometry(0.4, 0.07, 4, 10).rotateX(Math.PI / 2).translate(it.x, it.y + 2.6, it.z));
    },
    archLeg() {},
    arch(it) {
      // A neon arch over the Strip: steel legs, a curved beam lit in a band of colour.
      const y = it.y;
      const rx = -it.dz;
      const rz = it.dx;
      const h = it.span / 2;
      for (const s of [-1, 1]) B.steel.push(box(1, 11, 1, it.x + rx * s * h, y + 5.5, it.z + rz * s * h));
      const n = 12;
      for (let q = 0; q < n; q++) {
        const a0 = -1 + (2 * q) / n;
        const a1 = -1 + (2 * (q + 1)) / n;
        const p0 = [it.x + rx * a0 * h, y + 11 + (1 - a0 * a0) * 4, it.z + rz * a0 * h];
        const p1 = [it.x + rx * a1 * h, y + 11 + (1 - a1 * a1) * 4, it.z + rz * a1 * h];
        const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
        const seg = new THREE.BoxGeometry(0.7, 0.7, L);
        seg.lookAt(new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]));
        seg.translate((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
        N(it.k).push(seg);
      }
    },
    seawall(it) {
      B.concrete.push(obbBox(it.obb, it.h, it.y));
      const o = it.obb;
      for (let t = -o.hd; t <= o.hd; t += 2.5) B.steel.push(box(0.1, 1, 0.1, o.x + Math.sin(o.yaw) * t, it.y + it.h + 0.5, o.z + Math.cos(o.yaw) * t));
      B.steel.push(obbBox({ ...o, hw: 0.06 }, 0.08, it.y + it.h + 1));
    },
    seawallLine(it) {
      // Spray thrown over the wall, every so often along it.
      for (let k = 0; k + 1 < it.pts.length; k++) {
        const [ax, az] = it.pts[k];
        const [bx, bz] = it.pts[k + 1];
        const L = Math.hypot(bx - ax, bz - az);
        for (let t = 20; t < L; t += 55) {
          const x = ax + ((bx - ax) * t) / L;
          const z = az + ((bz - az) * t) / L;
          const g = new THREE.PlaneGeometry(14, 6).rotateY(Math.atan2(bx - ax, bz - az) + Math.PI / 2).translate(x, at(x, z) + 2, z);
          sprays.push({ geo: g });
        }
      }
    },
    palmTree(it) {
      const o = it.obb;
      const y = at(o.x, o.z);
      B.trunk.push(new THREE.CylinderGeometry(0.22, 0.35, it.h - 1, 6).translate(o.x, y + (it.h - 1) / 2, o.z));
      for (let q = 0; q < 7; q++) {
        const a = (q / 7) * Math.PI * 2;
        B.plant.push(box(0.7, 0.2, 4.2, o.x + Math.sin(a) * 1.9, y + it.h - 1.3, o.z + Math.cos(a) * 1.9, a));
      }
    },
    wall(it) {
      B.painted.push(tint(obbBox(it.obb, it.h, it.y), '#6a4a52'));
      B.dark.push(obbBox({ ...it.obb, hw: it.obb.hw + 0.05 }, 0.2, it.y + it.h));
    },
    alley(it) {
      // The lane between the walls, and a lamp over it now and then.
      const L = Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1]);
      const dx = (it.b[0] - it.a[0]) / L;
      const dz = (it.b[1] - it.a[1]) / L;
      for (let t = 20; t < L - 10; t += 40) N(Math.round(t / 40)).push(box(0.4, 0.4, 0.4, it.a[0] + dx * t, it.y + 4.5, it.a[1] + dz * t));
    },
    gate(it) {
      const o = it.obb;
      const y = at(o.x, o.z);
      B.concrete.push(scaleUv(obbBox(o, 1.1, y), Math.max(1, (Math.max(o.hw, o.hd) * 2) / 4), 1));
      OL.colored(it.set?.top, N(0), obbBox({ ...o, hd: o.hd + 0.02 }, 0.12, y + 1.1));
    },
  };
}
