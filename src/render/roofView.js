import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial, standardMaterial, glowMaterial, additiveMaterial } from './retroMaterial.js';
import { textTexture } from './textures.js';
import { box, obbBox, prism, flatPoly, rampGeometry, tint, scaleUv } from './shapes.js';
import { districtLayout } from '../sim/cityLayout.js';
import { buildAuthoredStructures } from './arenaView.js';
import { gustAt } from '../sim/gusts.js';
import * as G from '../sim/geom2d.js';

// A rooftop district (Chrome Heights): the city far below (its streets,
// lamps, traffic and the river), the glass towers up to their decks, the roof
// roads, parapets, skybridges and ramp bridges with lit glass balustrades,
// the gap jumps' kickers, the spiral ramp towers, Kessler HQ and its sky lobby,
// and every deck's props. Cool white and cyan, red on the mast and crane.
// Everything solid comes from the layout (sim/planLayout.js).

const DS = THREE.DoubleSide;
const CAR_COLORS = ['#c8ccd4', '#2a2a30', '#3a6ab8', '#b83a3a', '#e8e8f0', '#3a8a8a', '#6a6a78'];

export function buildRoofDistrictView(map, tex) {
  const style = map.style;
  const P = style.plan;
  const R = P.roof;
  const H = map.heightAt;
  const street = R.street ?? 0;
  const group = new THREE.Group();
  const add = (m) => m && group.add(m);
  const items = districtLayout(map).items;
  const flags = []; // flag mounts (lamp masts), windsocks, crane jibs: gathered as the items are drawn
  const socks = [];
  const jibList = [];

  const mats = {
    ground: litMaterial({ map: tex.asphalt, color: '#6a6878', side: DS }),
    walkway: litMaterial({ map: tex.sidewalk, color: '#8a8a98', side: DS, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    water: standardMaterial({ color: '#081420', roughness: 0.2, metalness: 0.6, envMap: tex.env, envMapIntensity: 0.5, side: DS }),
    tower: litMaterial({ map: tex.glass, emissiveMap: tex.glassGlow, emissive: 0xffffff, emissiveIntensity: 0.9, color: style.look.building }),
    low: litMaterial({ map: tex.building, emissiveMap: tex.buildingGlow, emissive: 0xffffff, emissiveIntensity: 0.8, color: '#7a8698' }),
    deck: litMaterial({ map: tex.sidewalk, color: '#b8bcc8', side: DS }),
    road: standardMaterial({ map: tex.asphalt, color: style.look.road, roughness: 0.4, metalness: 0.1, envMap: tex.env, envMapIntensity: 0.4, side: DS, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    lines: litMaterial({ color: '#e8eef4', side: DS, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
    patch: litMaterial({ vertexColors: true, side: DS, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
    concrete: litMaterial({ map: tex.wallConcrete || tex.wall, color: '#a8aab4' }),
    painted: litMaterial({ vertexColors: true }),
    steel: litMaterial({ color: '#5a6070' }),
    glass: additiveMaterial({ color: '#4ab8d8', opacity: 0.22 }),
    cyan: glowMaterial({ color: '#05d9e8', intensity: 2.2 }),
    white: glowMaterial({ color: '#e8f4ff', intensity: 2.6 }),
    red: glowMaterial({ color: '#ff2020', intensity: 3 }),
    amber: glowMaterial({ color: '#ffb040', intensity: 2.2 }),
    pool: additiveMaterial({ map: tex.glow, color: '#d8f0ff', opacity: 0.25 }),
    poolWater: glowMaterial({ color: '#1a8ab8', intensity: 0.9, side: DS }),
  };
  const B = Object.fromEntries(['walkway', 'deck', 'road', 'lines', 'patch', 'concrete', 'painted', 'steel', 'glass', 'cyan', 'white', 'amber', 'tower', 'low', 'pool', 'poolWater', 'water', 'ground'].map((k) => [k, []]));
  const paint = (g, c) => B.painted.push(tint(g, c));
  const blink = []; // red beacons: blink together
  const texts = new Map();
  const text = (str, color, x, y, z, fx, fz, w, bg) => {
    const t = textTexture(str, color, bg);
    const h = (w * t.image.height) / t.image.width;
    const g = new THREE.PlaneGeometry(w, h).rotateY(Math.atan2(fx, fz)).translate(x + fx * 0.15, y + h / 2, z + fz * 0.15);
    const key = `${str}|${color}|${bg || ''}`;
    if (!texts.has(key)) texts.set(key, { list: [], t });
    texts.get(key).list.push(g);
  };

  // A strip along a polyline, lateral l0..l1, at heights h(s) + dy.
  const strip = (list, pts, l0, l1, h, dy = 0) => {
    const pos = [];
    const uv = [];
    const idx = [];
    let s = 0;
    pts.forEach((p, k) => {
      const a = pts[Math.max(0, k - 1)];
      const b = pts[Math.min(pts.length - 1, k + 1)];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
      if (k) s += Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]);
      const y = h(s, p) + dy;
      for (const l of [l0, l1]) {
        pos.push(p[0] + n[0] * l, y, p[1] + n[1] * l);
        uv.push(l / 8, s / 8);
      }
      if (k) {
        const q = (k - 1) * 2;
        idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
      }
    });
    if (pts.length < 2) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    list.push(g);
  };
  // A vertical band along a polyline at lateral l, from h(s)+y0 to h(s)+y1.
  const wallStrip = (list, pts, l, h, y0, y1) => {
    const pos = [];
    const idx = [];
    pts.forEach((p, k) => {
      const a = pts[Math.max(0, k - 1)];
      const b = pts[Math.min(pts.length - 1, k + 1)];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
      const s = k ? G.lineLength(pts.slice(0, k + 1)) : 0;
      const x = p[0] + n[0] * l;
      const z = p[1] + n[1] * l;
      pos.push(x, h(s, p) + y0, z, x, h(s, p) + y1, z);
      if (k) {
        const q = (k - 1) * 2;
        idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    list.push(g);
  };

  cityBelow();
  towers();
  roofRoads();
  for (const it of items) draw(it);
  const props = breakables();
  const traffic = trafficMeshes();
  const gustFx = gustEffects();

  // Merge.
  for (const [k, list] of Object.entries(B)) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list), mats[k] || mats.painted);
    if (k === 'glass' || k === 'pool') m.renderOrder = 2;
    add(m);
  }
  for (const { list, t } of texts.values()) add(new THREE.Mesh(mergeGeometries(list), glowMaterial({ map: t, intensity: 1.8, side: DS })));
  const beacons = blink.length ? new THREE.Mesh(mergeGeometries(blink), mats.red) : null;
  add(beacons);
  const jibs = craneJibs();
  const structures = buildAuthoredStructures(style, tex, H);
  add(structures);
  const sky = new THREE.Mesh(new THREE.CylinderGeometry(1700, 1700, 360, 48, 1, true), new THREE.MeshBasicMaterial({ map: tex.skyline, side: THREE.BackSide, alphaTest: 0.5, fog: false }));
  tex.skyline.repeat.set(6, 1);
  sky.position.set(0, 60, 0);
  sky.renderOrder = -1;
  add(sky);

  group.userData.animate = (t, real = t) => {
    structures.userData.animate(t);
    if (beacons) beacons.visible = Math.floor(real * 1.1) % 2 === 0;
    for (const j of jibs) j.mesh.rotation.y = j.a0 + Math.sin(t * 0.05 + j.k) * 1.3;
    traffic?.(real);
    gustFx?.(t, real);
  };
  group.userData.setBroken = props.setBroken;
  group.userData.breakEvent = props.breakEvent;
  group.userData.animate(0, 0);
  return group;

  // ---------------------------------------------------------------------------

  // The streets far below: the canyon floors, the named streets with their
  // lamps and traffic lights, low buildings round the edges, the river beyond.
  function cityBelow() {
    const land = [[-2600, -2600], [2600, -2600], [2600, 2600], [760, 2600], [760, 560], [680, -223], [570, -600], [337, -760], [156, -630], [-78, -820], [-311, -600], [-492, -740], [-690, -575], [-2600, -575]];
    B.ground.push(flatPoly(P.boundary, () => street));
    B.ground.push(flatPoly(land, () => street));
    B.water.push(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2).translate(0, R.river ?? -6, 0));
    const bb = map.bounds;
    for (const spec of P.ground?.streets || []) {
      const [, axis, v] = spec.match(/(x|z) (-?\d+)$/);
      const val = Number(v);
      const pts = axis === 'z' ? [[bb.minX - 120, val], [bb.maxX + 120, val]] : [[val, bb.minZ - 120], [val, bb.maxZ + 120]];
      strip(B.walkway, pts, -16, 16, () => street, 0.02);
      strip(B.road, pts, -10, 10, () => street, 0.05);
      for (const sg of [-1, 1]) strip(B.lines, pts, sg * 0.1 - 0.08, sg * 0.1 + 0.08, () => street, 0.07);
      const L = G.lineLength(pts);
      for (let s = 20; s < L; s += 32) {
        const p = G.pointAlong(pts, s);
        for (const sd of [-1, 1]) {
          const x = p.x - p.dz * sd * 12;
          const z = p.z + p.dx * sd * 12;
          if (map.deckAt(x, z)) continue;
          B.steel.push(box(0.25, 8, 0.25, x, street + 4, z));
          B.white.push(box(0.8, 0.25, 0.4, x, street + 8, z));
        }
      }
    }
    // Low buildings round the edges, well under the roofs (a lattice of lots).
    let k = 0;
    for (let x = bb.minX - 200; x < bb.maxX + 200; x += 64) {
      for (let z = bb.minZ - 200; z < bb.maxZ + 200; z += 64) {
        const cx = x + 32;
        const cz = z + 32;
        if (map.decks.some((d) => G.pointInPoly(cx, cz, d.poly) || d.poly.some(([px, pz]) => Math.hypot(px - cx, pz - cz) < 45))) continue;
        if (map.decks.some((d) => cx > d.box.minX - 60 && cx < d.box.maxX + 60 && cz > d.box.minZ - 60 && cz < d.box.maxZ + 60)) continue;
        const inside = G.pointInPoly(cx, cz, P.boundary);
        if (!inside && !G.pointInPoly(cx, cz, land)) continue;
        const h = inside ? 16 + (k % 4) * 3 : 40 + (k % 5) * 9;
        const g = new THREE.BoxGeometry(46, h, 46).translate(cx, street + h / 2, cz);
        scaleUvBox(g, 46, h);
        B.low.push(g);
        k++;
      }
    }
  }

  // The towers under the decks, the decks' tops. The Straight is five towers
  // under one sloping deck.
  function towers() {
    for (const d of map.decks) {
      const top = Array.isArray(d.h) ? Math.min(...d.h) : d.h;
      if (Array.isArray(d.h)) {
        const n = 5;
        for (let q = 0; q < n; q++) {
          const z0 = d.box.minZ + ((d.box.maxZ - d.box.minZ) * q) / n + 4;
          const z1 = d.box.minZ + ((d.box.maxZ - d.box.minZ) * (q + 1)) / n - 4;
          const h = d.hAt(z1) - 1.2;
          const g = scaleUv(prism([[d.box.minX + 3, z0], [d.box.maxX - 3, z0], [d.box.maxX - 3, z1], [d.box.minX + 3, z1]], street, h - street), 1 / 32, 1 / 64);
          B.tower.push(g);
        }
        // The deck itself, a sloping slab.
        B.deck.push(flatPoly(d.poly, (x, z) => d.hAt(z)));
        B.concrete.push(slabSides(d.poly, (x, z) => d.hAt(z), 1.2));
      } else {
        B.tower.push(scaleUv(prism(d.poly, street, top - street - 0.02), 1 / 32, 1 / 64));
        B.deck.push(flatPoly(d.poly, () => top));
      }
    }
  }

  // The skirt round a sloping slab (its edge, thickness t below the top).
  function slabSides(poly, h, t) {
    const parts = [];
    poly.forEach((a, k) => {
      const b = poly[(k + 1) % poly.length];
      const pos = [a[0], h(...a), a[1], b[0], h(...b), b[1], b[0], h(...b) - t, b[1], a[0], h(...a) - t, a[1]];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      g.computeVertexNormals();
      parts.push(g);
    });
    return mergeGeometries(parts);
  }

  // The roof roads across the decks: asphalt, edge lines, a dashed centre line.
  function roofRoads() {
    for (const st of map.streets) {
      if (st.helix) {
        // Only the parts on decks here; the tower draws its own.
      }
      // Runs on decks.
      let run = [];
      const flush = () => {
        if (run.length > 1) {
          const h = (s, p) => map.deckAt(p[0], p[1])?.hAt(p[1]) ?? H(p[0], p[1]);
          strip(B.road, run, -st.half, st.half, h, 0.03);
          for (const sg of [-1, 1]) strip(B.lines, run, sg * (st.half - 0.45), sg * (st.half - 0.25), h, 0.05);
          const L = G.lineLength(run);
          for (let s = 3; s + 4 < L; s += 12) strip(B.lines, G.subLine(run, s, s + 4), -0.12, 0.12, h, 0.05);
        }
        run = [];
      };
      for (const p of st.pts) {
        if (map.deckAt(p[0], p[1])) run.push(p);
        else flush();
      }
      flush();
    }
  }

  // A drawer per layout item type.
  function draw(it) {
    const o = it.obb;
    switch (it.t) {
      case 'parapet':
        B.concrete.push(obbBox(o, it.h, it.y));
        return B.cyan.push(obbBox({ ...o, hw: o.hw + 0.02, hd: o.hd }, 0.06, it.y + it.h));
      case 'balustrade':
      case 'spiralWall':
        B.glass.push(obbBox({ ...o, hw: 0.04 }, it.h - 0.1, it.y + 0.1));
        B.cyan.push(obbBox({ ...o, hw: 0.07 }, 0.08, it.y + it.h));
        return B.steel.push(obbBox({ ...o, hw: 0.1 }, 0.12, it.y));
      case 'bridge': {
        const h = (s) => it.h0 + ((it.h1 - it.h0) * s) / Math.max(1, G.lineLength(it.pts));
        strip(B.deck, it.pts, -it.half, it.half, h, 0);
        strip(B.concrete, it.pts, -it.half, it.half, h, -1.4);
        for (const sg of [-1, 1]) wallStrip(B.concrete, it.pts, sg * it.half, h, -1.4, 0);
        strip(B.road, it.pts, -it.half + 1, it.half - 1, h, 0.03);
        for (const sg of [-1, 1]) strip(B.lines, it.pts, sg * (it.half - 1.45), sg * (it.half - 1.25), h, 0.05);
        // A skybridge's underside is lit; a ramp bridge's is plain.
        if (it.kind !== 'ramp') strip(B.cyan, it.pts, -0.3, 0.3, h, -1.45);
        return;
      }
      case 'cantilever': {
        const h = () => it.h;
        strip(B.steel, it.pts, -it.half, it.half, h, 0);
        strip(B.steel, it.pts, -it.half, it.half, h, -0.8);
        for (const sg of [-1, 1]) wallStrip(B.steel, it.pts, sg * it.half, h, -0.8, 0);
        return;
      }
      case 'kicker': {
        const r = it.ramp;
        paint(indexedRamp(rampGeometry(r, r.abs)), '#6a7080');
        // Lit edges, and chevrons across the lip so the landing reads from the far side.
        const nx = -r.dirZ;
        const nz = r.dirX;
        for (const sg of [-1, 1]) {
          const g = new THREE.BoxGeometry(0.2, 0.15, r.len);
          g.rotateX(-Math.atan2(r.height, r.len));
          g.rotateY(Math.atan2(r.dirX, r.dirZ));
          g.translate(r.x + r.dirX * r.len * 0.5 + nx * sg * (r.width / 2), r.abs + r.height / 2 + 0.1, r.z + r.dirZ * r.len * 0.5 + nz * sg * (r.width / 2));
          B.cyan.push(g);
        }
        for (let q = -r.width / 2 + 1.5; q < r.width / 2 - 1; q += 3) {
          const cx = r.x + r.dirX * (r.len - 0.4) + nx * q;
          const cz = r.z + r.dirZ * (r.len - 0.4) + nz * q;
          B.amber.push(new THREE.BoxGeometry(1.4, 0.12, 0.35).rotateY(Math.atan2(r.dirX, r.dirZ) + (q > 0 ? 0.6 : -0.6)).translate(cx, r.abs + r.height + 0.08, cz));
        }
        return;
      }
      case 'helix': return helixTower(it);
      case 'spiralCore':
        return B.concrete.push(prism(it.poly, it.y, it.h));
      case 'lobbyWall':
        B.glass.push(obbBox(o, it.h, it.y));
        return B.steel.push(obbBox({ ...o, hw: o.hw + 0.05, hd: o.hd + 0.05 }, 0.4, it.y + it.h - 0.4));
      case 'hqTower': {
        const g = scaleUv(prism(it.poly, it.y, it.h), 1 / 24, 1 / 48);
        B.tower.push(g);
        const b = G.polyBounds(it.poly);
        const top = it.y + it.h;
        const cx = (b.minX + b.maxX) / 2;
        const cz = (b.minZ + b.maxZ) / 2;
        for (const [fx, fz, hw] of [[0, 1, (b.maxX - b.minX) / 2], [0, -1, (b.maxX - b.minX) / 2], [1, 0, (b.maxZ - b.minZ) / 2], [-1, 0, (b.maxZ - b.minZ) / 2]]) {
          text('KESSLER', '#05d9e8', cx + fx * ((b.maxX - b.minX) / 2 + 0.2), top - 14, cz + fz * ((b.maxZ - b.minZ) / 2 + 0.2), fx, fz, hw * 1.4, '#06121c');
        }
        B.cyan.push(new THREE.BoxGeometry(b.maxX - b.minX + 0.6, 0.6, b.maxZ - b.minZ + 0.6).translate(cx, top, cz));
        blink.push(box(1.2, 1.2, 1.2, cx, top + 6, cz));
        B.steel.push(box(0.6, 12, 0.6, cx, top + 6, cz));
        return;
      }
      case 'lobby': {
        // The glass floor lit from below, the ceiling lights, Kessler Performance.
        B.cyan.push(new THREE.PlaneGeometry(it.w - 2, it.d - 2).rotateX(-Math.PI / 2).translate(it.x, it.y + 0.02, it.z));
        for (let x = it.x - it.w / 2 + 5; x < it.x + it.w / 2; x += 10) B.white.push(box(4, 0.15, 0.8, x, it.y + it.ceiling - 0.2, it.z));
        text('KESSLER PERFORMANCE', '#e8f4ff', it.x, it.y + 5.5, it.z - it.d / 2 + 1, 0, 1, 14, '#06121c');
        text('KESSLER PERFORMANCE', '#e8f4ff', it.x, it.y + 5.5, it.z + it.d / 2 - 1, 0, -1, 14, '#06121c');
        return;
      }
      case 'plinth': {
        paint(obbBox({ ...o }, 0.6, it.y), '#e8e8f0');
        B.cyan.push(obbBox({ ...o, hw: o.hw + 0.02, hd: o.hd + 0.02 }, 0.06, it.y + 0.6));
        const c = ['#c8ccd4', '#ff2a6d', '#05d9e8', '#1a1a20'][it.cycle % 4];
        paint(obbBox({ ...o, hw: 1, hd: 2.3, yaw: Math.PI / 2 }, 0.8, it.y + 0.7), c);
        return paint(obbBox({ ...o, hw: 0.8, hd: 1.2, yaw: Math.PI / 2 }, 0.45, it.y + 1.5), '#1c2230');
      }
      case 'flood':
        B.steel.push(obbBox(o, it.h, it.y));
        B.white.push(box(2.2, 0.8, 0.8, o.x, it.y + it.h, o.z));
        return B.pool.push(new THREE.PlaneGeometry(22, 22).rotateX(-Math.PI / 2).translate(o.x, it.y + 0.1, o.z));
      case 'lampMast': {
        const [tx] = it.toward;
        B.steel.push(obbBox(o, it.h, it.y), box(3, 0.2, 0.2, o.x + tx * 1.5, it.y + it.h, o.z));
        B.white.push(box(1.2, 0.2, 0.6, o.x + tx * 3, it.y + it.h - 0.1, o.z));
        flags.push({ x: o.x, y: it.y + it.h - 3, z: o.z });
        return B.pool.push(new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2).translate(o.x + tx * 6, it.y + 0.1, o.z));
      }
      case 'mast': {
        // The Heights radio mast: a lattice tower, red beacons up it.
        const y = it.y;
        for (let q = 0; q < 4; q++) {
          const a = (q / 4) * Math.PI * 2 + Math.PI / 4;
          B.steel.push(new THREE.CylinderGeometry(0.25, 0.4, it.h, 4).translate(o.x + Math.cos(a) * 2.5, y + it.h / 2, o.z + Math.sin(a) * 2.5));
        }
        for (let h = 8; h < it.h; h += 8) B.steel.push(box(5.4, 0.25, 5.4, o.x, y + h, o.z));
        for (const h of [it.h * 0.33, it.h * 0.66, it.h]) blink.push(box(1, 1, 1, o.x, y + h + 0.5, o.z));
        return B.concrete.push(obbBox(o, 1.5, y));
      }
      case 'dish':
        B.steel.push(new THREE.CylinderGeometry(0.3, 0.5, 2, 6).translate(o.x, it.y + 1, o.z));
        return paint(new THREE.SphereGeometry(o.hw, 10, 6, 0, Math.PI * 2, 0, Math.PI / 3).rotateX(-0.9).translate(o.x, it.y + 2.6, o.z), '#e8e8f0');
      case 'tank':
        B.steel.push(new THREE.CylinderGeometry(o.hw, o.hw, it.h, 14).translate(o.x, it.y + it.h / 2, o.z));
        return paint(new THREE.ConeGeometry(o.hw + 0.3, 1.4, 14).translate(o.x, it.y + it.h + 0.7, o.z), '#8a90a0');
      case 'hvac':
        paint(obbBox(o, it.h, it.y), '#8a9098');
        for (const s of [-1, 1]) B.painted.push(tint(new THREE.CylinderGeometry(1.4, 1.4, 0.3, 10).translate(o.x + s * o.hw * 0.5, it.y + it.h + 0.15, o.z), '#3a3e48'));
        return;
      case 'planter':
        paint(obbBox(o, it.h, it.y), '#c8c8d0');
        paint(obbBox({ ...o, hw: o.hw - 0.2, hd: o.hd - 0.2 }, 0.05, it.y + it.h), '#3a5a2a');
        if (it.tree) {
          B.painted.push(tint(new THREE.CylinderGeometry(0.15, 0.2, 3, 5).translate(o.x, it.y + it.h + 1.5, o.z), '#4a3424'));
          paint(new THREE.IcosahedronGeometry(Math.max(1.6, o.hw * 0.9), 0).translate(o.x, it.y + it.h + 3.8, o.z), '#3a7a4a');
        }
        return;
      case 'dome':
        B.concrete.push(prism(it.poly, it.y, it.h * 0.45));
        paint(new THREE.SphereGeometry(G.polyBounds(it.poly).maxX - it.x, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(it.x, it.y + it.h * 0.45, it.z), '#d8dce4');
        text('HEIGHTS OBSERVATORY', '#e8f4ff', it.x, it.y + 2, it.z + (G.polyBounds(it.poly).maxZ - it.z) + 0.3, 0, 1, 14, '#06121c');
        return;
      case 'telescope':
        return paint(obbBox(o, it.h, it.y), '#2a2e38');
      case 'pad': {
        const top = it.h;
        paint(obbBox(o, top - it.y, it.y), '#4a4e58');
        B.lines.push(obbBox({ ...o, hw: 0.8, hd: 5 }, 0.03, top), obbBox({ ...o, x: o.x - 3, hw: 0.8, hd: 0.8 }, 0.03, top));
        B.lines.push(obbBox({ ...o, x: o.x - 3, hw: 0.8, hd: 5 }, 0.03, top), obbBox({ ...o, x: o.x + 3, hw: 0.8, hd: 5 }, 0.03, top), obbBox({ ...o, hw: 3, hd: 0.6 }, 0.03, top));
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) B.amber.push(box(0.4, 0.2, 0.4, o.x + Math.cos(a) * (o.hw - 1), top + 0.1, o.z + Math.sin(a) * (o.hd - 1)));
        return;
      }
      case 'padRamp':
        return paint(indexedRamp(rampGeometry(it.ramp, it.ramp.abs)), '#4a4e58');
      case 'windsock':
        B.steel.push(obbBox(o, it.h, it.y));
        socks.push({ x: o.x, y: it.y + it.h - 0.5, z: o.z });
        return;
      case 'bowser':
        paint(obbBox(o, 1.8, it.y + 0.6), '#e0b020');
        return paint(obbBox({ ...o, hd: 1 }, 1, it.y + 2.4), '#2a2e38');
      case 'bandstand':
        B.concrete.push(prism(it.poly, it.y, 0.8));
        for (const [x, z] of it.poly) B.painted.push(tint(new THREE.CylinderGeometry(0.2, 0.2, 3.5, 6).translate(x * 0.9 + it.x * 0.1, it.y + 2.5, z * 0.9 + it.z * 0.1), '#f0f0f4'));
        paint(new THREE.ConeGeometry(G.polyBounds(it.poly).maxX - it.x + 0.6, 2.4, 8).translate(it.x, it.y + 5.4, it.z), '#3a6a5a');
        B.white.push(box(0.5, 0.5, 0.5, it.x, it.y + 4, it.z));
        return;
      case 'pergolaPost':
        return paint(obbBox(o, it.h, it.y), '#e8e8f0');
      case 'pergola':
        for (let z = it.z - it.hd; z <= it.z + it.hd; z += 1.2) paint(box(it.hw * 2 + 0.6, 0.15, 0.2, it.x, it.y + it.h + 0.1, z), '#e8e8f0');
        return;
      case 'patch': {
        const color = it.kind === 'lawn' ? '#3a7a3a' : null;
        if (color) B.patch.push(tint(flatPoly(it.poly, () => it.y + 0.02), color));
        else {
          B.poolWater.push(flatPoly(it.poly, () => it.y + 0.03));
          const b = G.polyBounds(it.poly);
          paint(box(b.maxX - b.minX + 1, 0.15, 0.5, (b.minX + b.maxX) / 2, it.y + 0.07, b.minZ - 0.25), '#e8e8f0');
          paint(box(b.maxX - b.minX + 1, 0.15, 0.5, (b.minX + b.maxX) / 2, it.y + 0.07, b.maxZ + 0.25), '#e8e8f0');
        }
        return;
      }
      case 'bar':
        paint(obbBox(o, 1.1, it.y), '#2a2e38');
        B.cyan.push(obbBox({ ...o, hw: o.hw + 0.05, hd: o.hd + 0.05 }, 0.08, it.y + 1.1));
        for (const s of [-1, 1]) paint(obbBox({ ...o, x: o.x + s * (o.hw - 0.3), hw: 0.2, hd: 0.2 }, it.h, it.y), '#8a8a98');
        paint(obbBox({ ...o, hw: o.hw + 1, hd: o.hd + 1 }, 0.3, it.y + it.h), '#e8e8f0');
        text('SKYBAR', '#05d9e8', o.x, it.y + it.h + 0.3, o.z + o.hd + 1.1, 0, 1, 8, '#06121c');
        return;
      case 'billboardLeg':
        return B.steel.push(obbBox(o, it.h, it.y));
      case 'billboard': {
        const ads = ['KESSLER MOTORS', 'MAG-COIL: SILENT POWER', 'KESSLER: BUILT FOR THE HEIGHTS'];
        B.steel.push(box(it.hw * 2 + 0.6, 7.6, 0.4, it.x, it.y + it.h - 3.5, it.z));
        text(ads[it.k % ads.length], '#e8f4ff', it.x, it.y + it.h - 6.6, it.z + 0.25, 0, 1, it.hw * 1.9, '#0a2a4a');
        return;
      }
      case 'gantryLeg':
        return B.steel.push(obbBox(o, it.h, it.y));
      case 'timingGantry':
        B.steel.push(box(it.hw * 2 + 1, 1.2, 1.2, it.x, it.y + it.h, it.z));
        for (const fz of [-1, 1]) text(`${it.label}  00:00.000`, '#05d9e8', it.x, it.y + it.h - 0.5, it.z + fz * 0.65, 0, fz, 24, '#06121c');
        return;
      case 'court':
        B.patch.push(tint(obbBox({ ...it, hw: it.hw, hd: it.hd, yaw: 0 }, 0.02, it.y), '#2a4a7a'));
        for (const [w, d, dz] of [[it.hw * 2, 0.12, -it.hd], [it.hw * 2, 0.12, it.hd], [it.hw * 2, 0.12, 0]]) B.lines.push(box(w, 0.03, d, it.x, it.y + 0.04, it.z + dz));
        for (const s of [-1, 1]) B.lines.push(box(0.12, 0.03, it.hd * 2, it.x + s * it.hw, it.y + 0.04, it.z));
        return;
      case 'hoop':
        B.steel.push(obbBox(o, it.h, it.y));
        return paint(box(1.6, 1, 0.06, o.x, it.y + it.h, o.z + (o.z < 45 ? 0.4 : -0.4) * Math.sign(o.z - 20 || 1)), '#f0f0f0');
      case 'runTrack': {
        const oval = (r) => {
          const pts = [];
          for (let q = 0; q <= 16; q++) pts.push([it.x + r * Math.cos(Math.PI - (Math.PI * q) / 16), it.z - it.half - r * Math.sin((Math.PI * q) / 16)]);
          for (let q = 0; q <= 16; q++) pts.push([it.x + r * Math.cos((Math.PI * q) / 16), it.z + it.half + r * Math.sin((Math.PI * q) / 16)]);
          pts.push(pts[0]);
          return pts;
        };
        const inner = oval(it.rad);
        const outer = oval(it.rad + it.lanes);
        const pos = [];
        const idx = [];
        inner.forEach((p, k) => {
          pos.push(p[0], it.y + 0.03, p[1], outer[k][0], it.y + 0.03, outer[k][1]);
          if (k) idx.push((k - 1) * 2, k * 2, (k - 1) * 2 + 1, (k - 1) * 2 + 1, k * 2, k * 2 + 1);
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        return B.patch.push(tint(g, '#9a4a3a'));
      }
      case 'craneMast': {
        for (let h = 0; h < it.h; h += 3) B.painted.push(tint(box(o.hw * 2, 0.2, o.hd * 2, o.x, it.y + h, o.z), '#e0b020'));
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) paint(box(0.25, it.h, 0.25, o.x + sx * o.hw, it.y + it.h / 2, o.z + sz * o.hd), '#e0b020');
        paint(box(3, 3, 3, o.x, it.y + it.h - 1, o.z), '#2a2e38');
        return;
      }
      case 'craneJib':
        jibList.push(it);
        return;
      case 'column':
        return B.concrete.push(obbBox(o, it.h + 0.2, it.y));
      case 'slab':
        B.concrete.push(prism(it.poly, it.y, it.h));
        return;
      case 'hut':
        paint(obbBox(o, it.h, it.y), '#d8c020');
        return B.white.push(obbBox({ ...o, hw: o.hw + 0.02, hd: o.hd * 0.3 }, 0.5, it.y + 1.3));
      case 'beams':
        for (let q = 0; q < 3; q++) paint(obbBox({ ...o, hw: o.hw * 0.9 }, 0.4, it.y + q * 0.45), '#8a5a3a');
        return;
      case 'rebar':
        return paint(obbBox(o, it.h, it.y), '#6a4030');
      case 'panel': {
        const g = new THREE.BoxGeometry(o.hw * 2, 0.1, o.hd * 2);
        g.rotateX(-0.35);
        g.translate(o.x, it.y + 0.6, o.z);
        B.painted.push(tint(g, '#1a2a5a'));
        return paint(obbBox({ ...o, hd: 0.2 }, 0.5, it.y), '#5a6070');
      }
      case 'car':
        paint(obbBox({ ...o, hw: 0.95, hd: 2.2 }, 0.9, it.y + 0.3), CAR_COLORS[(it.color || 0) % CAR_COLORS.length]);
        return paint(obbBox({ ...o, hw: 0.85, hd: 1.1 }, 0.5, it.y + 1.2), '#1c2230');
      case 'gate':
        paint(obbBox(o, 1.1, it.y), '#e8e8f0');
        return B.cyan.push(obbBox({ ...o, hd: o.hd + 0.02 }, 0.12, it.y + 1.1));
      case 'gapJump':
        return;
      default:
        if (it.solid && o) paint(obbBox(o, it.h, it.y), '#8a8e98');
    }
  }

  // A spiral ramp tower: the helix slab level by level, its parapet lit cyan,
  // a frame of columns round it, lights under each level.
  function helixTower(it) {
    const total = it.turns * Math.PI * 2;
    const m = Math.ceil((total * it.r) / 3);
    const pts = [];
    for (let q = 0; q <= m; q++) {
      const a = it.a0 + (it.dir * total * q) / m;
      pts.push([it.cx + Math.cos(a) * it.r, it.cz + Math.sin(a) * it.r]);
    }
    const h = (s) => it.yTop + ((it.yBot - it.yTop) * s) / (total * it.r);
    const half = it.outer - it.r;
    strip(B.deck, pts, -half, half, h, 0);
    strip(B.concrete, pts, -half, half, h, -0.8);
    strip(B.road, pts, -it.half, it.half, h, 0.03);
    for (let q = 0; q < 12; q++) {
      const a = (q / 12) * Math.PI * 2;
      B.concrete.push(box(0.8, it.yTop + 2 - it.street, 0.8, it.cx + Math.cos(a) * (it.outer + 0.6), (it.yTop + 2 + it.street) / 2, it.cz + Math.sin(a) * (it.outer + 0.6)));
    }
    for (let s = 6; s < total * it.r; s += 12) {
      const a = it.a0 + (it.dir * s) / it.r;
      B.white.push(box(0.6, 0.15, 0.6, it.cx + Math.cos(a) * it.r, h(s) - 0.9, it.cz + Math.sin(a) * it.r));
    }
  }

  // Crane jibs: they swing slowly with the simulation clock.
  function craneJibs() {
    return jibList.map((j, k) => {
      const g = new THREE.Group();
      const parts = [box(j.jib, 2, 2, j.jib / 2, 0, 0), box(j.counter, 2, 2, -j.counter / 2, 0, 0), box(4, 3, 3, -j.counter + 2, -1, 0), box(1, 8, 1, 0, 4, 0)];
      g.add(new THREE.Mesh(mergeGeometries(parts), litMaterial({ color: '#e0b020' })));
      const lights = new THREE.Mesh(mergeGeometries([box(0.8, 0.8, 0.8, j.jib, 0.6, 0), box(0.8, 0.8, 0.8, 0, 8.6, 0)]), mats.red);
      g.add(lights);
      g.position.set(j.x, j.y + 1, j.z);
      add(g);
      return { mesh: g, a0: Math.atan2(j.z - 180, 60 - j.x), k }; // at rest, over the Tower Run's finish
    });
  }

  // Breakable props (Tower Plaza's glass, loungers, umbrellas, tables):
  // instanced, knocked flat when the simulation says so.
  function breakables() {
    const kinds = {
      glass: { geo: () => mergeGeometries([box(1, 1, 0.05, 0, 0.55, 0)]), mat: mats.glass },
      lounger: { geo: () => mergeGeometries([box(0.8, 0.25, 1.9, 0, 0.35, 0), box(0.8, 0.5, 0.1, 0, 0.6, -0.9)]), mat: litMaterial({ color: '#e8e8f0' }) },
      umbrella: { geo: () => mergeGeometries([box(0.08, 2.4, 0.08, 0, 1.2, 0), new THREE.ConeGeometry(1.6, 0.6, 8).translate(0, 2.5, 0)]), mat: litMaterial({ color: '#e8f4ff' }) },
      table: { geo: () => mergeGeometries([box(1.3, 0.06, 1.3, 0, 0.75, 0), box(0.1, 0.75, 0.1, 0, 0.37, 0)]), mat: litMaterial({ color: '#c8ccd4' }) },
    };
    const byId = new Map();
    const lists = {};
    for (const it of items) if (it.t === 'brk') (lists[it.kind] ??= []).push(it);
    const matrix = (it, down, dir = [0, 1]) => {
      const o = it.obb;
      const glass = it.kind === 'glass';
      const yaw = glass ? o.yaw + Math.PI / 2 : o.yaw;
      const e = new THREE.Euler(0, yaw, 0, 'YXZ');
      let pos = new THREE.Vector3(o.x, it.y + 0.05, o.z);
      if (down) {
        const side = Math.sin(yaw) * dir[0] + Math.cos(yaw) * dir[1] >= 0 ? 1 : -1;
        e.set(side * (Math.PI / 2 - 0.1), yaw, 0, 'YXZ');
        pos = new THREE.Vector3(o.x + dir[0] * 0.5, it.y + 0.1, o.z + dir[1] * 0.5);
      }
      const scale = glass ? new THREE.Vector3(o.hd * 2, it.h, 1) : new THREE.Vector3(1, 1, 1);
      return new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(e), scale);
    };
    for (const [kind, list] of Object.entries(lists)) {
      const K = kinds[kind];
      if (!K) continue;
      const mesh = new THREE.InstancedMesh(K.geo(), K.mat, list.length);
      list.forEach((it, k) => {
        mesh.setMatrixAt(k, matrix(it, false));
        byId.set(it.id, { mesh, k, it });
      });
      mesh.frustumCulled = false;
      if (kind === 'glass') mesh.renderOrder = 2;
      add(mesh);
    }
    let shown = new Set();
    const dirs = new Map();
    return {
      setBroken(broken = {}) {
        const ids = Object.keys(broken);
        if (ids.length < shown.size) {
          for (const id of shown) {
            const p = byId.get(+id);
            if (p) {
              p.mesh.setMatrixAt(p.k, matrix(p.it, false));
              p.mesh.instanceMatrix.needsUpdate = true;
            }
          }
          shown = new Set();
          dirs.clear();
        }
        for (const id of ids) {
          if (shown.has(id)) continue;
          shown.add(id);
          const p = byId.get(+id);
          if (!p) continue;
          p.mesh.setMatrixAt(p.k, matrix(p.it, true, dirs.get(+id)));
          p.mesh.instanceMatrix.needsUpdate = true;
        }
      },
      breakEvent(e) {
        const L = Math.hypot(e.vx, e.vz) || 1;
        dirs.set(e.id, [e.vx / L, e.vz / L]);
      },
    };
  }

  // Slow traffic on the streets below, headlights and tail lights.
  function trafficMeshes() {
    const cars = [];
    const bb = map.bounds;
    for (const spec of P.ground?.streets || []) {
      const [, axis, v] = spec.match(/(x|z) (-?\d+)$/);
      const val = Number(v);
      const L = axis === 'z' ? bb.maxX - bb.minX + 240 : bb.maxZ - bb.minZ + 240;
      const from = axis === 'z' ? bb.minX - 120 : bb.minZ - 120;
      for (let q = 0; q < 10; q++) cars.push({ axis, val, L, from, off: (q * 0.137 + val * 0.001) % 1, lane: q % 2 ? 4 : -4, speed: q % 2 ? 9 : -8 });
    }
    if (!cars.length) return null;
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 1.3, 4.4).translate(0, 0.8, 0), litMaterial({ color: '#8a8e98' }), cars.length);
    const lights = new THREE.InstancedMesh(mergeGeometries([box(1.6, 0.25, 0.1, 0, 0.8, 2.25)]), glowMaterial({ color: '#fff4d0', intensity: 2.4 }), cars.length);
    body.frustumCulled = false;
    lights.frustumCulled = false;
    add(body);
    add(lights);
    const m = new THREE.Matrix4();
    return (t) => {
      cars.forEach((c, k) => {
        const u = (((c.off * c.L + c.speed * t) % c.L) + c.L) % c.L;
        const along = c.from + u;
        const [x, z] = c.axis === 'z' ? [along, c.val + c.lane] : [c.val + c.lane, along];
        const yaw = c.axis === 'z' ? (c.speed > 0 ? Math.PI / 2 : -Math.PI / 2) : c.speed > 0 ? 0 : Math.PI;
        m.makeRotationY(yaw);
        m.setPosition(x, street, z);
        body.setMatrixAt(k, m);
        lights.setMatrixAt(k, m);
      });
      body.instanceMatrix.needsUpdate = true;
      lights.instanceMatrix.needsUpdate = true;
    };
  }

  // The gusts: flags on the lamp masts snap, windsocks stand out, and debris
  // blows east across the decks, from the warning until the gust passes.
  function gustEffects() {
    const g = map.gusts;
    if (!g) return null;
    const flagGeo = new THREE.PlaneGeometry(1.8, 1.1).translate(0.9, 0, 0);
    const flagMesh = new THREE.InstancedMesh(flagGeo, litMaterial({ color: '#05d9e8', side: DS }), Math.max(1, flags.length + socks.length));
    flagMesh.frustumCulled = false;
    add(flagMesh);
    const bits = [];
    for (const d of map.decks) {
      for (let q = 0; q < 24; q++) bits.push({ d, u: (q * 0.618) % 1, v: (q * 0.377 + 0.13) % 1, k: q });
    }
    const debris = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.4, 0.3), litMaterial({ color: '#c8b890', side: DS }), bits.length);
    debris.frustumCulled = false;
    add(debris);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    return (t, real) => {
      const at = gustAt(g, t * 60);
      const s = at ? (at.warn ? 0.6 : 0.6 + at.strength) : 0;
      [...flags, ...socks].forEach((f, k) => {
        const flap = Math.sin(real * (3 + s * 9) + k) * (0.6 - s * 0.35);
        q.setFromEuler(new THREE.Euler(0, Math.atan2(g.dirZ, g.dirX) * -1 + flap, 0));
        m.compose(new THREE.Vector3(f.x, f.y, f.z), q, new THREE.Vector3(1, 1 - s * 0.2, 1));
        flagMesh.setMatrixAt(k, m);
      });
      flagMesh.instanceMatrix.needsUpdate = true;
      debris.visible = s > 0;
      if (!debris.visible) return;
      bits.forEach((b, k) => {
        const w = b.d.box.maxX - b.d.box.minX;
        const x = b.d.box.minX + ((((b.u * w + real * 14 * g.dirX) % w) + w) % w);
        const z = b.d.box.minZ + b.v * (b.d.box.maxZ - b.d.box.minZ);
        q.setFromEuler(new THREE.Euler(real * 5 + k, real * 3 + k, 0));
        m.compose(new THREE.Vector3(x, b.d.hAt(z) + 0.4 + Math.abs(Math.sin(real * 4 + k)) * 1.5, z), q, new THREE.Vector3(1, 1, 1));
        debris.setMatrixAt(k, m);
      });
      debris.instanceMatrix.needsUpdate = true;
    };
  }
}

function indexedRamp(g) {
  if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
  return g;
}

function scaleUvBox(g, w, h) {
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) * w) / 32, (uv.getY(k) * h) / 64);
}
