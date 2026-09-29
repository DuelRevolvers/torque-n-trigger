import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial, standardMaterial, glowMaterial, additiveMaterial } from './retroMaterial.js';
import { box, obbBox, flatPoly, rampGeometry, tint } from './shapes.js';
import { textTexture } from './textures.js';
import { sprinklerOn } from '../sim/sprinklers.js';
import * as G from '../sim/geom2d.js';

// A suburb's view (Maple Hollow), for the plan district view: lawns that follow
// the ground (the bowl, the hill), sidewalks and verges, the house kit (houses,
// porches, garages, hedges, garden walls, gates, hoops, minivans), maple
// trees, the breakable props (picket fences, mailboxes, bins, garden
// furniture, trampolines, flags) that go down when hit, pools, the pond and
// its mist, the river, sprinklers, and the set pieces: the water tower, the
// golf course, Phase 2, the park, Hollow High and the plaza.
// Night: warm porch lights, amber lamps, blue TV glow in some windows.

const DS = THREE.DoubleSide;
const HOUSE_COLORS = ['#d8cdb4', '#b8c8d0', '#e0d8c0', '#c8d4b8', '#d8c0b0', '#c0c0cc', '#e4e0d4', '#b4bca8'];
const ROOF_COLORS = ['#3a3440', '#4a3a36', '#34383e', '#44403a'];
const CAR_COLORS = ['#b83a3a', '#3a6ab8', '#c8c8c8', '#2a2a30', '#d8c8a0', '#3a8a5a', '#6a5a8a'];
const MAPLE_LEAVES = ['#c8401e', '#e0701e', '#b82a22', '#e8a030', '#a8321a'];
const OAK_LEAVES = ['#3a6a2a', '#2e5a26', '#4a7a30', '#56702c'];
// Breakable props: colour, and whether it's a panel stretched to its footprint.
const PROP = {
  picket: { color: '#ecead8', panel: true }, wood: { color: '#8a6a44', panel: true }, mailbox: { color: '#3a4a6a' }, bin: { color: '#2a5a3a' },
  table: { color: '#c8c0a8' }, chair: { color: '#d8d0b8' }, trampoline: { color: '#1c1c24' }, flag: { color: '#e8e0d0' },
};

export function suburbView({ map, tex, H, group, items, text, clipToConvex, merged }) {
  const style = map.style;
  const P = style.plan;
  const S = P.suburb;
  const add = (m) => m && group.add(m);
  const walk = P.walk ?? 3;

  const mats = {
    grass: litMaterial({ map: tex.grass || tex.dirt, color: style.look.lot, side: DS }),
    // (Layers over the lawns sit well above them and are pulled forward a few
    // pixels' worth of depth: vertex snapping shifts each mesh differently.)
    fairway: litMaterial({ map: tex.grass || tex.dirt, color: '#5a9a48', side: DS, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
    walk: litMaterial({ map: tex.sidewalk, color: style.look.walk, side: DS, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
    paved: litMaterial({ map: tex.sidewalk, color: '#8a8690', side: DS, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
    parking: litMaterial({ map: tex.parking, color: '#b8b0c0', side: DS, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
    sand: litMaterial({ map: tex.dirt, color: '#e8d098', side: DS, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -10 }),
    dirt: litMaterial({ map: tex.dirt, color: '#b09070', side: DS, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
    court: litMaterial({ color: '#2a5a52', side: DS, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
    lines: litMaterial({ color: '#e8e8e0', side: DS, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -14 }),
    track: litMaterial({ color: '#9a4a3a', side: DS, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
    endZone: litMaterial({ color: '#6a1a2a', side: DS, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -10 }),
    water: standardMaterial({ color: '#0a1822', roughness: 0.3, metalness: 0.4, envMap: tex.env, envMapIntensity: 0.25, side: DS }),
    pool: glowMaterial({ color: '#2a8ac0', intensity: 0.9, side: DS }),
    painted: litMaterial({ vertexColors: true }),
    warm: glowMaterial({ color: '#ffc870', intensity: 1.6 }),
    tv: glowMaterial({ color: '#6aa0ff', intensity: 1.8 }),
    beacon: glowMaterial({ color: '#ff2020', intensity: 3 }),
    floods: glowMaterial({ color: '#fff4dc', intensity: 3 }),
    porchPool: additiveMaterial({ map: tex.glow, color: '#ffb060', opacity: 0.35 }),
    spray: additiveMaterial({ map: tex.glow, color: '#c8e8ff', opacity: 0.4 }),
    mist: additiveMaterial({ map: tex.glow, color: '#9ab0c8', opacity: 0.12, fog: true }),
  };
  // Buckets, merged into one mesh each.
  const B = { fairway: [], walk: [], paved: [], parking: [], sand: [], dirt: [], court: [], lines: [], track: [], endZone: [], water: [], pool: [], painted: [], warm: [], tv: [], porchPool: [] };
  const trees = []; // { x, y, z, s, kind, cycle }
  const props = Object.fromEntries(Object.keys(PROP).map((k) => [k, []])); // kind -> [{ it }]
  const sprinklers = [];
  const P4 = (o, u, v) => [o.x + Math.cos(o.yaw) * u + Math.sin(o.yaw) * v, o.z - Math.sin(o.yaw) * u + Math.cos(o.yaw) * v]; // obb-local (across, along) to world
  const paint = (g, color) => B.painted.push(tint(g, color));

  // ---------------------------------------------------------------------------
  // The ground

  // A grid following the ground, dy below it, over a rectangle (cells where
  // skip(x, z) is true left out).
  function terrainGrid(x0, x1, z0, z1, cell, dy, skip) {
    const nx = Math.ceil((x1 - x0) / cell);
    const nz = Math.ceil((z1 - z0) / cell);
    const pos = [];
    const uv = [];
    const idx = [];
    for (let k = 0; k <= nz; k++) {
      for (let i = 0; i <= nx; i++) {
        const x = x0 + i * cell;
        const z = z0 + k * cell;
        pos.push(x, H(x, z) + dy, z);
        uv.push(x / 8, z / 8);
      }
    }
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        if (skip && skip(x0 + (i + 0.5) * cell, z0 + (k + 0.5) * cell)) continue;
        const a = k * (nx + 1) + i;
        idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // A polygon filled on the ground, dy above it, cut into cells so it follows
  // the slope.
  function fill(list, poly, dy, cell = 8) {
    const b = G.polyBounds(poly);
    for (let z = Math.floor(b.minZ / cell) * cell; z < b.maxZ; z += cell) {
      for (let x = Math.floor(b.minX / cell) * cell; x < b.maxX; x += cell) {
        const sq = [[x, z], [x + cell, z], [x + cell, z + cell], [x, z + cell]];
        const piece = clipToConvex(poly, sq);
        if (piece.length > 2 && Math.abs(G.polyArea(piece)) > 0.05) list.push(flatPoly(piece, (px, pz) => H(px, pz) + dy));
      }
    }
  }

  // A strip along a polyline from lateral l0 to l1, dy above the ground.
  function strip(list, pts, l0, l1, dy) {
    const pos = [];
    const uv = [];
    const idx = [];
    let v = 0;
    pts.forEach((p, k) => {
      const a = pts[Math.max(0, k - 1)];
      const b = pts[Math.min(pts.length - 1, k + 1)];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
      if (k) v += Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]);
      for (const l of [l0, l1]) {
        const x = p[0] + n[0] * l;
        const z = p[1] + n[1] * l;
        pos.push(x, H(x, z) + dy, z);
        uv.push(l / 4, v / 4);
      }
      if (k) {
        const q = (k - 1) * 2;
        idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    list.push(g);
  }

  function ground() {
    // Lawns everywhere (the verges, the lots, and on beyond the edge), not
    // over the river.
    const river = P.river ? riverPoly() : null;
    const pad = 400;
    const bb = map.bounds;
    const snap8 = (v) => Math.floor(v / 8) * 8;
    add(new THREE.Mesh(terrainGrid(snap8(bb.minX - pad), snap8(bb.maxX + pad), snap8(bb.minZ - pad), snap8(bb.maxZ + pad), 8, -0.25, river ? (x, z) => G.pointInPoly(x, z, river) : null), mats.grass));
    // Sidewalks along every paved street (not round a turning circle's island).
    for (const e of map.edgeList) {
      const st = e.street;
      if (!st.sidewalk) continue;
      for (const sd of [-1, 1]) {
        if (st.ring && !st.ring.green) {
          const p = e.pts[1];
          const d = [e.pts[1][0] - e.pts[0][0], e.pts[1][1] - e.pts[0][1]];
          const L = Math.hypot(d[0], d[1]) || 1;
          const out = [p[0] - (d[1] / L) * sd * 3, p[1] + (d[0] / L) * sd * 3];
          if (Math.hypot(out[0] - st.ring.c[0], out[1] - st.ring.c[1]) < Math.hypot(p[0] - st.ring.c[0], p[1] - st.ring.c[1])) continue;
        }
        strip(B.walk, e.pts, sd * (st.half + 0.2), sd * (st.half + walk), -0.1);
      }
    }
    // The sidewalk round each junction's corners.
    for (const n of map.nodes) {
      if (!n.name && !n.ring) continue;
      const pts = [[n.x, n.z]];
      for (const e of map.edgeList) {
        if ((e.a !== n.id && e.b !== n.id) || !e.street.sidewalk) continue;
        const line = e.a === n.id ? e.pts : [...e.pts].reverse();
        const p = G.pointAlong(line, Math.min(e.len * 0.45, e.street.half + walk + 4));
        for (const s of [-1, 1]) pts.push([p.x - p.dz * s * (e.street.half + walk), p.z + p.dx * s * (e.street.half + walk)]);
      }
      if (pts.length > 5) B.walk.push(flatPoly(hull(pts), (x, z) => H(x, z) - 0.1));
    }
    // Sites' ground: sand, dirt, paving; the golf course's fairways and greens.
    for (const it of districtItems) {
      if (it.t === 'patch') {
        if (it.kind === 'sand') B.sand.push(flatPoly(it.poly, (x, z) => H(x, z) - 0.06));
        else if (it.kind === 'dirt') fill(B.dirt, it.poly, -0.08);
        else if (it.kind === 'paved') fill(it.court ? B.court : it.carPark ? B.parking : B.paved, it.poly, -0.08);
      } else if (it.t === 'fairway') {
        fill(B.fairway, it.poly, -0.1);
        B.fairway.push(flatPoly(ellipsePts(it.green[0], it.green[1], 8, 7), (x, z) => H(x, z) - 0.05));
        B.fairway.push(flatPoly(ellipsePts(it.tee[0], it.tee[1], 3, 3), (x, z) => H(x, z) - 0.05));
      } else if (it.t === 'driveway') B.paved.push(flatPoly(it.poly, (x, z) => H(x, z) - 0.07));
      else if (it.t === 'footpath') strip(B.paved, it.pts, -it.width / 2, it.width / 2, -0.07);
    }
    // The stadium: the running track round the field, the yard lines.
    for (const spec of Object.values(style.arenas || {})) {
      const T = spec.track;
      if (!T) continue;
      const y = H(T.cx, T.cz);
      const inner = ovalPts(T.cx, T.cz, T.r, T.half);
      const outer = ovalPts(T.cx, T.cz, T.r + T.lanes, T.half);
      const pos = [];
      const idx = [];
      inner.forEach((p, k) => {
        pos.push(p[0], y - 0.02, p[1], outer[k][0], y - 0.02, outer[k][1]);
        if (k) idx.push((k - 1) * 2, k * 2, (k - 1) * 2 + 1, (k - 1) * 2 + 1, k * 2, k * 2 + 1);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      B.track.push(g);
      // Lane lines, the field's yard lines and end zones.
      for (let l = 1; l < T.lanes; l += 1.2) B.lines.push(ringLine(ovalPts(T.cx, T.cz, T.r + l, T.half), y + 0.01, 0.06));
      const fw = 24.4;
      for (let z = 150; z <= 240; z += 9.14) B.lines.push(box(fw * 2, 0.02, 0.2, T.cx, y + 0.01, z));
      for (const x of [-fw, fw]) B.lines.push(box(0.2, 0.02, 110, T.cx + x, y + 0.01, 195));
      for (const z of [145, 245]) B.endZone.push(box(fw * 2, 0.02, 9.6, T.cx, y - 0.01, z));
    }
    // Hollow Pond, the golf hazard and the river.
    const pond = districtItems.find((it) => it.t === 'pondWater');
    if (pond) B.water.push(flatPoly(pond.poly, () => pond.level));
    for (const it of districtItems) if (it.t === 'hazard') B.water.push(flatPoly(it.poly, () => it.y));
    if (river) {
      const level = Math.min(...P.river.bank.map(([x, z]) => H(x, z))) - 1.6;
      B.water.push(flatPoly(river, () => level));
      riverLevel = level;
    }
  }
  let riverLevel = 0;

  // The river: from the bank out `width`, carried on past both ends.
  function riverPoly() {
    const bank = P.river.bank;
    const w = P.river.width;
    const outward = (k) => {
      const a = bank[Math.max(0, k - 1)];
      const b = bank[Math.min(bank.length - 1, k + 1)];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
      if (G.pointInPoly(bank[k][0] + n[0] * 5, bank[k][1] + n[1] * 5, P.boundary)) n = [-n[0], -n[1]];
      return n;
    };
    const ends = (k, dir) => {
      const a = bank[k];
      const b = bank[k - dir];
      const L = Math.hypot(a[0] - b[0], a[1] - b[1]);
      return [a[0] + ((a[0] - b[0]) / L) * 300, a[1] + ((a[1] - b[1]) / L) * 300];
    };
    const near = [ends(0, -1), ...bank, ends(bank.length - 1, 1)];
    const far = near.map((p, k) => {
      const n = outward(Math.min(bank.length - 1, Math.max(0, k - 1)));
      return [p[0] + n[0] * w, p[1] + n[1] * w];
    });
    return [...near, ...far.reverse()];
  }

  // ---------------------------------------------------------------------------
  // The things in the layout

  const districtItems = [];
  const frontOf = (it) => {
    const o = it.obb;
    const [fx, fz] = it.front;
    return { x: o.x + fx * o.hd, z: o.z + fz * o.hd, fx, fz, ax: fz, az: -fx };
  };

  // A gable roof over a rotated box: the ridge across it (along its width),
  // from its eaves at y0 up to y1, overhanging by `over`.
  function gable(o, y0, y1, color, over = 0.5) {
    const w = o.hw + over;
    const d = o.hd + over;
    const pos = [
      -w, y0, -d, w, y0, -d, w, y1, 0, -w, y1, 0, // front slope
      w, y0, d, -w, y0, d, -w, y1, 0, w, y1, 0, // back slope
      -w, y0, -d, -w, y1, 0, -w, y0, d, // side
      w, y0, d, w, y1, 0, w, y0, -d, // side
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
    g.setIndex([0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6, 8, 10, 9, 11, 13, 12]);
    g.computeVertexNormals();
    g.rotateY(o.yaw);
    g.translate(o.x, 0, o.z);
    paint(g, color);
  }

  // Windows along a face (dist out from the middle, facing (fx, fz)), a storey
  // at a time; lit warm, TV blue or dark, by a fixed cycle.
  function windows(o, fx, fz, dist, width, y0, storeys, k, skipMiddle) {
    const ax = fz;
    const az = -fx;
    const n = Math.max(1, Math.floor((width - 1.5) / 3));
    for (let s = 0; s < storeys; s++) {
      for (let q = 0; q < n; q++) {
        const a = -width / 2 + ((q + 0.5) * width) / n;
        if (skipMiddle && s === 0 && Math.abs(a) < 1.4) continue;
        const x = o.x + fx * (dist + 0.03) + ax * a;
        const z = o.z + fz * (dist + 0.03) + az * a;
        const g = box(1.2, 1.3, 0.06, x, y0 + 1.5 + s * 2.9, z, Math.atan2(fx, fz));
        const c = (k * 7 + q * 3 + s * 5) % 11;
        if (c < 5) B.warm.push(g);
        else if (c === 5 || c === 8) B.tv.push(g);
        else paint(g, '#1c1c28');
      }
    }
  }

  const buildings = {
    house(it, big) {
      const o = it.obb;
      const f = frontOf(it);
      const g0 = H(o.x, o.z);
      const top = it.y + it.h;
      const eave = top - (big ? 3.4 : 3);
      paint(obbBox(o, eave - it.y, it.y), HOUSE_COLORS[it.cycle % HOUSE_COLORS.length]);
      gable(o, eave, top, ROOF_COLORS[it.cycle % ROOF_COLORS.length]);
      windows(o, f.fx, f.fz, o.hd, o.hw * 2, g0, 2, it.cycle, true);
      windows(o, -f.fx, -f.fz, o.hd, o.hw * 2, g0, 2, it.cycle + 3, false);
      // The front door, and a chimney on some.
      paint(box(1.1, 2.2, 0.08, f.x + f.fx * 0.04, g0 + 1.1, f.z + f.fz * 0.04, Math.atan2(f.fx, f.fz)), ['#6a2a2a', '#2a3a5a', '#3a4a3a', '#5a4a3a'][it.cycle % 4]);
      if (it.cycle % 3 === 0) {
        const [cx, cz] = P4(o, o.hw * 0.6, o.hd * 0.3);
        paint(box(0.9, 3, 0.9, cx, top - 1, cz, o.yaw), '#7a4a3a');
      }
    },
    bighouse(it) {
      buildings.house(it, true);
    },
    clubhouse(it) {
      const o = it.obb;
      const f = frontOf(it);
      const g0 = H(o.x, o.z);
      const top = it.y + it.h;
      paint(obbBox(o, top - 2.5 - it.y, it.y), '#e8e4d8');
      gable(o, top - 2.5, top + 1, '#2e4a36');
      windows(o, f.fx, f.fz, o.hd, o.hw * 2, g0, 1, 2, true);
      text(it.name, '#e8d8a0', f.x, g0 + 4, f.z, f.fx, f.fz, 9);
    },
    school(it) {
      const o = it.obb;
      const f = frontOf(it);
      const g0 = H(o.x, o.z);
      const top = it.y + it.h;
      paint(obbBox(o, it.h, it.y), '#8a4a3a');
      paint(obbBox({ ...o, hw: o.hw + 0.3, hd: o.hd + 0.3 }, 0.5, top - 0.2), '#c8c0b0');
      windows(o, f.fx, f.fz, o.hd, o.hw * 2, g0, 3, 1, true);
      windows(o, -f.fx, -f.fz, o.hd, o.hw * 2, g0, 3, 4, false);
      paint(box(8, 3.2, 0.2, f.x + f.fx * 0.1, g0 + 1.6, f.z + f.fz * 0.1, Math.atan2(f.fx, f.fz)), '#3a2a26');
      text(it.name, '#f0e0b0', f.x, g0 + 7.4, f.z, f.fx, f.fz, 14);
    },
    gym(it) {
      const o = it.obb;
      paint(obbBox(o, it.h, it.y), '#9a5a44');
      paint(obbBox({ ...o, hw: o.hw + 0.3, hd: o.hd + 0.3 }, 0.6, it.y + it.h - 0.2), '#c8c0b0');
    },
    shop(it) {
      store(it, '#d8d0c0', '#ffc850');
    },
    supermarket(it) {
      store(it, '#e0dcd0', '#ff5a3a');
    },
    laundromat(it) {
      store(it, '#c8d8e0', '#40c0ff');
    },
    pizza(it) {
      store(it, '#e8d8b8', '#ff8a2a');
    },
    video(it) {
      store(it, '#d0c8e0', '#ffe040');
    },
  };

  // A unit of the strip mall: glass front lit inside, a canopy, its sign.
  function store(it, wall, neonColor) {
    const o = it.obb;
    const f = frontOf(it);
    const g0 = H(o.x, o.z);
    const top = it.y + it.h;
    paint(obbBox(o, it.h, it.y), wall);
    const yaw = Math.atan2(f.fx, f.fz);
    const w = o.hw * 2;
    B.warm.push(box(w - 2, 2.6, 0.08, f.x + f.fx * 0.05, g0 + 1.5, f.z + f.fz * 0.05, yaw));
    paint(box(w, 0.5, 3, f.x + f.fx * 1.5, g0 + 3.4, f.z + f.fz * 1.5, yaw), '#3a3440');
    text(it.name, neonColor, f.x, top - 3.2, f.z, f.fx, f.fz, Math.min(w - 2, it.name.length * 1.3));
  }

  const drawers = {
    bldg(it) {
      const draw = buildings[it.kind];
      if (!draw) return false;
      draw(it);
      return true;
    },
    porch(it) {
      const o = it.obb;
      const f = frontOf(it);
      const g0 = H(o.x, o.z);
      paint(obbBox(o, 0.5, it.y), '#b8a890');
      for (const s of [-1, 1]) {
        const [x, z] = P4(o, s * (o.hw - 0.2), -o.hd + 0.2);
        paint(box(0.2, 2.6, 0.2, x, g0 + 1.5, z), '#e8e4d8');
      }
      paint(obbBox({ ...o, hw: o.hw + 0.2, hd: o.hd + 0.2 }, 0.2, g0 + 2.8), '#4a4048');
      // The porch light, and its pool of light.
      const [lx, lz] = P4(o, 1.2, o.hd - 0.1);
      B.warm.push(box(0.25, 0.35, 0.25, lx, g0 + 2.3, lz));
      B.porchPool.push(new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2).translate(f.x + f.fx * 1.5, H(f.x + f.fx * 1.5, f.z + f.fz * 1.5) + 0.08, f.z + f.fz * 1.5));
    },
    garage(it) {
      const o = it.obb;
      const f = frontOf(it);
      const g0 = H(o.x, o.z);
      paint(obbBox(o, it.h, it.y), HOUSE_COLORS[it.cycle % HOUSE_COLORS.length]);
      paint(obbBox({ ...o, hw: o.hw + 0.2, hd: o.hd + 0.2 }, 0.25, it.y + it.h), ROOF_COLORS[it.cycle % ROOF_COLORS.length]);
      paint(box(o.hw * 2 - 0.8, 2.3, 0.08, f.x + f.fx * 0.04, g0 + 1.15, f.z + f.fz * 0.04, Math.atan2(f.fx, f.fz)), '#e8e4dc');
    },
    hedge(it) {
      paint(obbBox(it.obb, it.h, it.y), '#2a4a24');
      paint(obbBox({ ...it.obb, hw: it.obb.hw + 0.05, hd: it.obb.hd + 0.05 }, 0.25, it.y + it.h - 0.15), '#345a2c');
    },
    wall(it) {
      paint(obbBox(it.obb, it.h, it.y), '#9a5a48');
      paint(obbBox({ ...it.obb, hw: it.obb.hw + 0.06, hd: it.obb.hd + 0.06 }, 0.12, it.y + it.h), '#c8c0b0');
    },
    gate(it) {
      const o = it.obb;
      const y = H(o.x, o.z);
      if (!it.front) {
        // A road closed at the district's edge: a striped barrier.
        paint(obbBox(o, 1.1, y), '#e8e4dc');
        for (let t = -o.hw + 1; t < o.hw; t += 2) {
          const [x, z] = P4(o, t, 0);
          paint(box(1, 0.4, o.hd * 2 + 0.04, x, y + 0.7, z, o.yaw), '#c82a2a');
        }
        return;
      }
      // A driveway gate: white boards between two posts.
      paint(obbBox({ ...o, hd: 0.04 }, 1.1, y + 0.1), '#e8e6dc');
      for (const s of [-1, 1]) {
        const [x, z] = P4(o, s * o.hw, 0);
        paint(box(0.18, 1.3, 0.18, x, y + 0.65, z), '#e8e6dc');
      }
    },
    hoop(it) {
      const o = it.obb;
      const y = H(o.x, o.z);
      const [fx, fz] = it.front;
      paint(box(0.12, 3.2, 0.12, o.x, y + 1.6, o.z), '#6a6a74');
      paint(box(1.6, 1, 0.06, o.x - fx * 0.5, y + 3.3, o.z - fz * 0.5, Math.atan2(fx, fz)), '#f0f0f0');
      paint(new THREE.TorusGeometry(0.23, 0.02, 4, 10).rotateX(Math.PI / 2).translate(o.x - fx * 0.8, y + 3.05, o.z - fz * 0.8), '#e86a1a');
    },
    car(it) {
      const o = it.obb;
      const y = H(o.x, o.z);
      const color = CAR_COLORS[it.color % CAR_COLORS.length];
      if (it.minivan) {
        paint(obbBox({ ...o, hw: 0.98, hd: 2.4 }, 1.25, y + 0.3), color);
        paint(obbBox({ ...o, hw: 0.9, hd: 1.7 }, 0.5, y + 1.55), '#1c1c28');
        paint(obbBox({ ...o, hw: 0.92, hd: 1.75 }, 0.08, y + 2.05), color);
      } else {
        paint(obbBox({ ...o, hw: 0.95, hd: 2.2 }, 0.9, y + 0.3), color);
        paint(obbBox({ ...o, hw: 0.85, hd: 1.1 }, 0.5, y + 1.2), '#1c1c28');
      }
    },
    tree(it) {
      const o = it.obb;
      trees.push({ x: o.x, z: o.z, y: H(o.x, o.z), s: it.s || 1, kind: it.kind, cycle: it.cycle || 0 });
    },
    brk(it) {
      const kind = it.kind === 'fence' ? (it.h > 1.2 ? 'wood' : 'picket') : it.kind;
      if (props[kind]) props[kind].push(it);
    },
    sprinkler(it) {
      sprinklers.push({ id: it.id, x: it.x, z: it.z, y: H(it.x, it.z) });
    },
    pool(it) {
      B.pool.push(flatPoly(it.poly, () => it.y + 0.15));
      // The coping round the edge.
      for (let k = 0; k < it.poly.length; k++) {
        const [ax, az] = it.poly[k];
        const [bx, bz] = it.poly[(k + 1) % it.poly.length];
        const L = Math.hypot(bx - ax, bz - az);
        paint(box(0.5, 0.25, L + 0.5, (ax + bx) / 2, H((ax + bx) / 2, (az + bz) / 2) - 0.05, (az + bz) / 2, Math.atan2(bx - ax, bz - az)), '#d8d4cc');
      }
    },
    hazard() {},
    pond() {},
    patch() {},
    fairway(it) {
      // (The fairway is ground; the flag is a breakable prop.) The tee markers.
      paint(box(0.3, 0.3, 0.3, it.tee[0] - 1, H(...it.tee) + 0.1, it.tee[1]), '#e8e8e8');
      paint(box(0.3, 0.3, 0.3, it.tee[0] + 1, H(...it.tee) + 0.1, it.tee[1]), '#e8e8e8');
    },
    driveway() {},
    footpath() {},
    pondWater(it) {
      mist(it);
    },
    towerLeg() {},
    waterTower(it) {
      const y = it.y;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        paint(box(1, it.tank + 0.5, 1, it.x + sx * it.leg, y + it.tank / 2 - 0.2, it.z + sz * it.leg), '#8a9098');
      }
      // Cross braces between the legs, two levels.
      for (const h of [it.tank * 0.35, it.tank * 0.7]) {
        for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
          const x = it.x + ((a[0] + b[0]) / 2) * it.leg;
          const z = it.z + ((a[1] + b[1]) / 2) * it.leg;
          const alongX = a[1] === b[1];
          paint(box(alongX ? it.leg * 2 : 0.3, 0.3, alongX ? 0.3 : it.leg * 2, x, y + h, z), '#7a8088');
        }
      }
      const r = it.leg + 3;
      paint(new THREE.CylinderGeometry(r, r, it.top - it.tank, 16).translate(it.x, y + (it.tank + it.top) / 2, it.z), '#b8c8d0');
      paint(new THREE.ConeGeometry(r + 0.4, 4, 16).translate(it.x, y + it.top + 2, it.z), '#8a9aa4');
      paint(new THREE.CylinderGeometry(r + 0.5, r + 0.5, 0.5, 16).translate(it.x, y + it.tank + 0.25, it.z), '#6a7078');
      // MAPLE HOLLOW round the tank, and the red beacon on top.
      for (const [fx, fz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) paintedText('MAPLE HOLLOW', '#24345e', '#b8c8d0', it.x + fx * (r + 0.1), y + (it.tank + it.top) / 2 - 1.2, it.z + fz * (r + 0.1), fx, fz, r * 1.3);
      beacons.push(box(0.8, 0.8, 0.8, it.x, y + it.top + 4.4, it.z));
    },
    cart(it) {
      const o = it.obb;
      const y = H(o.x, o.z);
      paint(obbBox(o, 0.7, y + 0.3), '#e8e8e0');
      paint(obbBox(o, 0.08, y + 1.8), '#2a6a3a');
      for (const s of [-1, 1]) {
        const [x, z] = P4(o, 0, s * (o.hd - 0.15));
        paint(box(0.08, 0.8, 0.08, x, y + 1.4, z), '#c8c8c8');
      }
    },
    frame(it) {
      // A timber frame: posts, plates and the rafters of a roof to come.
      const o = it.obb;
      const y = H(o.x, o.z);
      const wood = '#b89060';
      for (const u of [-o.hw, -o.hw / 3, o.hw / 3, o.hw]) {
        for (const v of [-o.hd, o.hd]) {
          const [x, z] = P4(o, u, v);
          paint(box(0.2, 5.2, 0.2, x, y + 2.6, z), wood);
        }
      }
      for (const v of [-o.hd, o.hd]) {
        const [x, z] = P4(o, 0, v);
        paint(box(o.hw * 2, 0.2, 0.2, x, y + 5.2, z, o.yaw), wood);
        paint(box(o.hw * 2, 0.2, 0.2, x, y + 2.7, z, o.yaw), wood);
      }
      for (const u of [-o.hw, o.hw]) {
        const [x, z] = P4(o, u, 0);
        paint(box(0.2, 0.2, o.hd * 2, x, y + 5.2, z, o.yaw), wood);
      }
      paint(obbBox(o, 0.3, y), '#8a8680');
      for (let u = -o.hw; u <= o.hw + 0.01; u += (o.hw * 2) / 4) {
        for (const s of [-1, 1]) {
          const [x, z] = P4(o, u, (s * o.hd) / 2);
          const L = Math.hypot(o.hd, 2);
          const g = new THREE.BoxGeometry(0.15, 0.15, L);
          g.rotateX(s * Math.atan2(2, o.hd));
          g.rotateY(o.yaw);
          g.translate(x, y + 6.2, z);
          paint(g, wood);
        }
      }
    },
    mound(it) {
      paint(rampGeometry(it.ramp, it.y), '#6a4a2a');
    },
    jump(it) {
      paint(rampGeometry(it.ramp, it.y), '#5a3e22');
    },
    dozer(it) {
      const o = it.obb;
      const y = H(o.x, o.z);
      paint(obbBox({ ...o, hd: o.hd - 0.6 }, 1.6, y + 0.8), '#e0a820');
      paint(obbBox({ ...o, hw: o.hw * 0.6, hd: o.hd * 0.4 }, 1.4, y + 2.3), '#1c1c24');
      const [bx, bz] = P4(o, 0, o.hd - 0.2);
      paint(box(o.hw * 2 + 0.6, 1.2, 0.3, bx, y + 0.6, bz, o.yaw), '#5a5a60');
      for (const s of [-1, 1]) {
        const [tx, tz] = P4(o, s * (o.hw - 0.3), -0.6);
        paint(box(0.6, 0.9, o.hd * 1.6, tx, y + 0.45, tz, o.yaw), '#2a2a30');
      }
    },
    digger(it) {
      const o = it.obb;
      const y = H(o.x, o.z);
      paint(obbBox({ ...o, hd: o.hd * 0.55 }, 1.8, y + 1), '#e0a820');
      for (const s of [-1, 1]) {
        const [tx, tz] = P4(o, s * (o.hw - 0.3), 0);
        paint(box(0.6, 0.9, o.hd * 2, tx, y + 0.45, tz, o.yaw), '#2a2a30');
      }
      const [ax, az] = P4(o, 0.6, o.hd * 0.9);
      const arm = new THREE.BoxGeometry(0.5, 0.5, 5);
      arm.rotateX(-0.6);
      arm.rotateY(o.yaw);
      arm.translate(ax, y + 3.6, az);
      paint(arm, '#e0a820');
      const [kx, kz] = P4(o, 0.6, o.hd + 2);
      paint(box(1.2, 1, 1, kx, y + 1.1, kz, o.yaw), '#3a3a40');
    },
    lumber(it) {
      const o = it.obb;
      const y = H(o.x, o.z);
      for (let q = 0; q < 4; q++) paint(obbBox({ ...o, hw: o.hw - q * 0.1 }, 0.35, y + q * 0.38), q % 2 ? '#c8a070' : '#b89060');
    },
    pipes(it) {
      const o = it.obb;
      const y = H(o.x, o.z);
      for (const u of [-o.hw + 0.5, 0, o.hw - 0.5]) {
        const [x, z] = P4(o, u, 0);
        paint(new THREE.CylinderGeometry(0.5, 0.5, o.hd * 2, 10).rotateX(Math.PI / 2).rotateY(o.yaw).translate(x, y + 0.5, z), '#9a9690');
      }
    },
    toilet(it) {
      const o = it.obb;
      const y = H(o.x, o.z);
      paint(obbBox(o, 2.2, y), '#2a5ab0');
      paint(obbBox({ ...o, hw: o.hw + 0.05, hd: o.hd + 0.05 }, 0.2, y + 2.2), '#e8e8e8');
    },
    railing(it) {
      const o = it.obb;
      for (let t = -o.hd; t <= o.hd; t += 2.5) {
        const [x, z] = P4(o, 0, t);
        paint(box(0.12, 1.1, 0.12, x, it.y + 0.55, z), '#c8c8d0');
      }
      paint(obbBox({ ...o, hw: 0.08 }, 0.1, it.y + 1.05), '#e8e8f0');
      paint(obbBox({ ...o, hw: 0.06 }, 0.06, it.y + 0.55), '#c8c8d0');
    },
    gazebo(it) {
      const o = it.obb;
      const y = H(o.x, o.z);
      paint(new THREE.CylinderGeometry(o.hw, o.hw, 0.5, 8).translate(o.x, y + 0.25, o.z), '#c8c0b0');
      for (let q = 0; q < 8; q++) {
        const a = (q / 8) * Math.PI * 2;
        paint(box(0.2, 3, 0.2, o.x + Math.cos(a) * (o.hw - 0.3), y + 2, o.z + Math.sin(a) * (o.hw - 0.3)), '#f0ece0');
      }
      paint(new THREE.ConeGeometry(o.hw + 0.6, 2.2, 8).translate(o.x, y + 4.6, o.z), '#4a5a6a');
      B.warm.push(box(0.4, 0.4, 0.4, o.x, y + 3.3, o.z));
    },
    play(it) {
      const o = it.obb;
      const y = H(o.x, o.z);
      if (it.kind === 'swings') {
        for (const s of [-1, 1]) {
          const [x, z] = P4(o, s * o.hw, 0);
          paint(box(0.12, it.h, o.hd * 2, x, y + it.h / 2, z, o.yaw), '#c83a3a');
        }
        paint(box(o.hw * 2, 0.12, 0.12, o.x, y + it.h, o.z, o.yaw), '#c83a3a');
        for (const u of [-1.5, 0, 1.5]) {
          const [x, z] = P4(o, u, 0);
          paint(box(0.5, 0.06, 0.25, x, y + 0.5, z, o.yaw), '#3a3a40');
        }
      } else if (it.kind === 'slide') {
        const g = new THREE.BoxGeometry(0.8, 0.1, o.hd * 2.2);
        g.rotateX(0.7);
        g.rotateY(o.yaw);
        g.translate(o.x, y + it.h / 2, o.z);
        paint(g, '#e8c020');
        const [lx, lz] = P4(o, 0, -o.hd);
        paint(box(0.8, it.h, 0.2, lx, y + it.h / 2, lz, o.yaw), '#3a6ab8');
      } else {
        for (const u of [-o.hw, o.hw]) for (const v of [-o.hd, o.hd]) {
          const [x, z] = P4(o, u, v);
          paint(box(0.12, it.h, 0.12, x, y + it.h / 2, z), '#3a8a5a');
        }
        paint(obbBox(o, 0.1, y + it.h), '#3a8a5a');
      }
    },
    bench(it) {
      const o = it.obb;
      const y = H(o.x, o.z);
      paint(obbBox(o, 0.1, y + 0.45), '#8a6a44');
      paint(obbBox({ ...o, hw: o.hw * 0.9, hd: o.hd * 0.9 }, 0.45, y), '#3a3a40');
    },
    shed(it) {
      const o = it.obb;
      const y = H(o.x, o.z);
      paint(obbBox(o, 2, y), '#8a6a4a');
      gable(o, y + 2, y + 2.8, '#4a3a30', 0.2);
    },
    schoolGate(it) {
      const dx = Math.sin(it.yaw);
      const dz = Math.cos(it.yaw);
      for (const s of [-1, 1]) paint(box(1, 3, 1, it.x + dx * s * (it.span / 2), it.y + 1.5, it.z + dz * s * (it.span / 2)), '#8a4a3a');
      paint(box(0.4, 0.6, it.span, it.x, it.y + 3.6, it.z, it.yaw), '#3a2a26');
      text('HOLLOW HIGH', '#f0e0b0', it.x, it.y + 3.35, it.z, dz, -dx, it.span - 2);
    },
    schoolSign(it) {
      const o = it.obb;
      const y = H(o.x, o.z);
      paint(obbBox(o, 1.8, y), '#8a4a3a');
      text('GO HAWKS! HOMECOMING FRIDAY', '#ffd060', o.x, y + 0.6, o.z, Math.cos(o.yaw), -Math.sin(o.yaw), o.hd * 1.8);
    },
    diamond(it) {
      const dx = Math.sin(it.yaw);
      const dz = Math.cos(it.yaw);
      const home = [it.x - dx * 18.4, it.z - dz * 18.4];
      const at = (u, v) => [home[0] + dx * v + dz * u, home[1] + dz * v - dx * u];
      // The infield skin, the bases, the mound, the foul lines.
      const skin = [at(0, -3), at(21, 18), at(0, 40), at(-21, 18)];
      B.dirt.push(flatPoly(skin, (x, z) => H(x, z) - 0.06));
      for (const [u, v] of [[0, 0], [19.4, 19.4], [0, 38.8], [-19.4, 19.4]]) {
        const [x, z] = at(u * 0.73, v * 0.73);
        paint(box(0.45, 0.08, 0.45, x, H(x, z) - 0.02, z, it.yaw + Math.PI / 4), '#f0f0f0');
      }
      paint(new THREE.CylinderGeometry(2.7, 2.9, 0.25, 12).translate(it.x, it.y - 0.05, it.z), '#9a7050');
      for (const s of [-1, 1]) {
        const [x, z] = at(s * 21, 21);
        B.lines.push(box(0.12, 0.02, 60, (home[0] + x) / 2 + (x - home[0]) * 0.2, H(x, z) - 0.04, (home[1] + z) / 2 + (z - home[1]) * 0.2, Math.atan2(x - home[0], z - home[1])));
      }
    },
    court(it) {
      const y = it.y;
      for (const s of [-1, 1]) {
        B.lines.push(box(0.1, 0.02, it.hd * 2, it.x + s * it.hw, y - 0.04, it.z));
        B.lines.push(box(it.hw * 2, 0.02, 0.1, it.x, y - 0.04, it.z + s * it.hd));
        B.lines.push(box(it.hw * 2 * 0.75, 0.02, 0.1, it.x, y - 0.04, it.z + s * 6.4));
      }
      B.lines.push(box(0.1, 0.02, 12.8, it.x, y - 0.04, it.z));
    },
    net(it) {
      const o = it.obb;
      paint(obbBox(o, 0.9, H(o.x, o.z)), '#1c1c24');
      paint(obbBox({ ...o, hd: 0.08 }, 0.08, H(o.x, o.z) + 0.9), '#f0f0f0');
    },
    pylon(it) {
      const o = it.obb;
      const y = H(o.x, o.z);
      paint(obbBox({ ...o, hw: 0.5, hd: 0.5 }, it.h - 4, y), '#6a6a74');
      paint(box(1, 3.6, 8, o.x, y + it.h - 2, o.z, o.yaw), '#2a2a34');
      for (const s of [-1, 1]) text(it.name, '#ffc850', o.x + s * 0.52, y + it.h - 3.6, o.z, s, 0, 7.4);
    },
    riverWall(it) {
      const o = it.obb;
      const top = H(o.x, o.z) + it.h;
      paint(obbBox(o, top - (riverLevel - 1), riverLevel - 1), '#8a8680');
    },
    river() {},
    backyardWay() {},
    mast: null, // the plan view's own
  };

  const beacons = []; // the water tower's red beacon
  // Lettering painted on (lit by the scene, not glowing).
  function paintedText(str, color, bg, x, y, z, fx, fz, w) {
    const t = textTexture(str, color, bg);
    const h = (w * t.image.height) / t.image.width;
    add(new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateY(Math.atan2(fx, fz)).translate(x, y + h / 2, z), litMaterial({ map: t })));
  }

  // Mist lying over the pond: soft layers drifting slowly.
  const mistMeshes = [];
  function mist(it) {
    const c = G.polyCentroid(it.poly);
    const b = G.polyBounds(it.poly);
    for (let q = 0; q < 5; q++) {
      const w = (b.maxX - b.minX) * (0.5 + 0.1 * q);
      const d = (b.maxZ - b.minZ) * (0.4 + 0.08 * q);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mats.mist);
      m.position.set(c[0] + (q - 2) * 12, it.level + 0.8 + q * 0.5, c[1] + ((q * 7) % 5) * 6 - 12);
      m.renderOrder = 3;
      m.userData.base = [m.position.x, m.position.z, q];
      mistMeshes.push(m);
    }
  }

  // ---------------------------------------------------------------------------
  // Instanced things: trees, breakable props, sprinkler sprays

  function treeMeshes() {
    if (!trees.length) return;
    const trunk = new THREE.CylinderGeometry(0.22, 0.32, 1, 6).translate(0, 0.5, 0);
    const crown = new THREE.IcosahedronGeometry(1, 0);
    const tm = new THREE.InstancedMesh(trunk, litMaterial({ color: '#4a3424' }), trees.length);
    const cm = new THREE.InstancedMesh(crown, litMaterial({ color: '#ffffff' }), trees.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    trees.forEach((t, k) => {
      const s = t.s;
      const h = 9 * s;
      m.compose(new THREE.Vector3(t.x, t.y - 0.3, t.z), q, new THREE.Vector3(s, h * 0.45, s));
      tm.setMatrixAt(k, m);
      const r = 2.6 * s * (1 + (t.cycle % 3) * 0.08);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.cycle * 1.3);
      m.compose(new THREE.Vector3(t.x, t.y + h * 0.62, t.z), q, new THREE.Vector3(r, r * 0.9, r));
      cm.setMatrixAt(k, m);
      q.identity();
      col.set(t.kind === 'oak' ? OAK_LEAVES[t.cycle % OAK_LEAVES.length] : MAPLE_LEAVES[t.cycle % MAPLE_LEAVES.length]);
      cm.setColorAt(k, col);
    });
    tm.frustumCulled = false;
    cm.frustumCulled = false;
    add(tm);
    add(cm);
  }

  // The breakable props, one instanced mesh a kind; knocked flat when broken.
  const propMeshes = new Map(); // id -> { mesh, k, it }
  function propGeometry(kind) {
    const parts = [];
    if (kind === 'picket') {
      for (let x = -0.47; x <= 0.47; x += 0.0625) parts.push(box(0.035, 1, 0.03, x, 0.5, 0));
      parts.push(box(1, 0.06, 0.03, 0, 0.3, -0.02), box(1, 0.06, 0.03, 0, 0.75, -0.02));
    } else if (kind === 'wood') {
      parts.push(box(1, 1.6, 0.04, 0, 0.8, 0));
      for (let x = -0.45; x <= 0.45; x += 0.15) parts.push(box(0.02, 1.6, 0.06, x, 0.8, 0));
    } else if (kind === 'mailbox') {
      parts.push(box(0.1, 1, 0.1, 0, 0.5, 0), box(0.25, 0.25, 0.45, 0, 1.1, 0));
    } else if (kind === 'bin') {
      parts.push(box(0.6, 1, 0.65, 0, 0.5, 0), box(0.66, 0.08, 0.7, 0, 1.04, 0));
    } else if (kind === 'table') {
      parts.push(box(1.3, 0.06, 1.3, 0, 0.75, 0));
      for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) parts.push(box(0.06, 0.75, 0.06, x, 0.37, z));
    } else if (kind === 'chair') {
      parts.push(box(0.5, 0.06, 0.5, 0, 0.45, 0), box(0.5, 0.5, 0.06, 0, 0.7, -0.22));
      for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) parts.push(box(0.05, 0.45, 0.05, x, 0.22, z));
    } else if (kind === 'trampoline') {
      parts.push(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16).translate(0, 0.9, 0), new THREE.TorusGeometry(0.5, 0.03, 4, 16).rotateX(Math.PI / 2).translate(0, 0.9, 0));
      for (let q = 0; q < 4; q++) parts.push(box(0.04, 0.9, 0.04, Math.cos(q * 1.57) * 0.45, 0.45, Math.sin(q * 1.57) * 0.45));
    } else if (kind === 'flag') {
      parts.push(box(0.05, 2.4, 0.05, 0, 1.2, 0), box(0.6, 0.4, 0.02, 0.32, 2.15, 0));
    }
    return mergeGeometries(parts);
  }
  const propMatrix = (it, down, dir = [0, 1]) => {
    const o = it.obb;
    const panel = PROP[propKind(it)].panel;
    const yaw = panel && o.hd > o.hw ? o.yaw + Math.PI / 2 : o.yaw;
    const scale = panel ? new THREE.Vector3(2 * Math.max(o.hw, o.hd), 1, 1) : it.kind === 'trampoline' ? new THREE.Vector3(o.hw * 2, 1, o.hd * 2) : new THREE.Vector3(1, 1, 1);
    const e = new THREE.Euler(0, yaw, 0, 'YXZ');
    let pos = new THREE.Vector3(o.x, it.y + 0.1, o.z);
    if (down) {
      // Knocked flat, falling away from the car that hit it.
      const side = Math.sin(yaw) * dir[0] + Math.cos(yaw) * dir[1] >= 0 ? 1 : -1;
      e.set(side * (Math.PI / 2 - 0.08), yaw, 0, 'YXZ');
      pos = new THREE.Vector3(o.x + dir[0] * 0.5, it.y + 0.14, o.z + dir[1] * 0.5);
    }
    return new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(e), scale);
  };
  const propKind = (it) => (it.kind === 'fence' ? (it.h > 1.2 ? 'wood' : 'picket') : it.kind);
  function propMeshesBuild() {
    for (const [kind, list] of Object.entries(props)) {
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(propGeometry(kind), litMaterial({ color: PROP[kind].color }), list.length);
      list.forEach((it, k) => {
        mesh.setMatrixAt(k, propMatrix(it, false));
        propMeshes.set(it.id, { mesh, k, it });
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      add(mesh);
    }
  }
  // Which props are down: state.broken ({ id: tick }); a new event starts
  // with them all standing again. dirs: { id: [dx, dz] } from 'break' events.
  let shownDown = new Set();
  const dirs = new Map();
  function setBroken(broken = {}) {
    const ids = Object.keys(broken);
    if (ids.length < shownDown.size) {
      for (const id of shownDown) {
        const p = propMeshes.get(+id);
        if (p) {
          p.mesh.setMatrixAt(p.k, propMatrix(p.it, false));
          p.mesh.instanceMatrix.needsUpdate = true;
        }
      }
      shownDown = new Set();
      dirs.clear();
    }
    for (const id of ids) {
      if (shownDown.has(id)) continue;
      shownDown.add(id);
      const p = propMeshes.get(+id);
      if (!p) continue;
      p.mesh.setMatrixAt(p.k, propMatrix(p.it, true, dirs.get(+id) || [0, 1]));
      p.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  function breakEvent(e) {
    const L = Math.hypot(e.vx, e.vz) || 1;
    dirs.set(e.id, [e.vx / L, e.vz / L]);
  }

  // Sprinkler sprays, on in the windows the simulation says.
  let sprayMesh = null;
  let sprayWindow = -1;
  function sprayMeshBuild() {
    if (!sprinklers.length) return;
    const g = mergeGeometries([new THREE.PlaneGeometry(6, 1.6).translate(0, 0.8, 0), new THREE.PlaneGeometry(6, 1.6).rotateY(Math.PI / 2).translate(0, 0.8, 0)]);
    sprayMesh = new THREE.InstancedMesh(g, mats.spray, sprinklers.length);
    sprayMesh.renderOrder = 2;
    sprayMesh.frustumCulled = false;
    add(sprayMesh);
    updateSprays(0);
  }
  function updateSprays(t) {
    if (!sprayMesh) return;
    const w = Math.floor(t / 20);
    const m = new THREE.Matrix4();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    sprinklers.forEach((p, k) => {
      if (!sprinklerOn(p, t)) {
        if (w !== sprayWindow) sprayMesh.setMatrixAt(k, zero);
        return;
      }
      m.makeRotationY(t * 1.2 + p.id);
      m.setPosition(p.x, p.y, p.z);
      sprayMesh.setMatrixAt(k, m);
    });
    sprayWindow = w;
    sprayMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------

  function finish() {
    for (const [k, list] of Object.entries(B)) if (list.length) add(new THREE.Mesh(merged(list), mats[k]));
    treeMeshes();
    propMeshesBuild();
    sprayMeshBuild();
    for (const m of mistMeshes) add(m);
    const beaconMesh = beacons.length ? new THREE.Mesh(merged(beacons), mats.beacon) : null;
    add(beaconMesh);
    return {
      animate(t, real) {
        updateSprays(t);
        if (beaconMesh) beaconMesh.visible = Math.floor(real * 1.2) % 2 === 0;
        for (const m of mistMeshes) {
          const [x, z, q] = m.userData.base;
          m.position.x = x + Math.sin(real * 0.05 + q) * 10;
          m.position.z = z + Math.cos(real * 0.04 + q * 2) * 6;
        }
      },
      setBroken,
      breakEvent,
    };
  }

  // Items the ground needs (patches, driveways, fairways, paths, the pond).
  for (const it of items) if (['patch', 'fairway', 'driveway', 'footpath', 'pondWater', 'hazard'].includes(it.t)) districtItems.push(it);
  // What the drawers add to (for drawing edited items, render/itemCapture.js).
  const buckets = [B, trees, props, sprinklers, mistMeshes, beacons];
  return { ground, drawers, finish, buckets };
}

function ellipsePts(cx, cz, rx, rz, n = 16) {
  return [...Array(n).keys()].map((k) => [cx + Math.cos((k / n) * Math.PI * 2) * rx, cz + Math.sin((k / n) * Math.PI * 2) * rz]);
}

// A running-track oval (as the district data draws it).
function ovalPts(cx, cz, r, half, n = 24) {
  const pts = [];
  for (let q = 0; q <= n; q++) pts.push([cx + r * Math.cos(Math.PI - (Math.PI * q) / n), cz - half - r * Math.sin((Math.PI * q) / n)]);
  for (let q = 0; q <= n; q++) pts.push([cx + r * Math.cos((Math.PI * q) / n), cz + half + r * Math.sin((Math.PI * q) / n)]);
  pts.push(pts[0]);
  return pts;
}

// A thin line round a closed polyline at height y.
function ringLine(pts, y, w) {
  const parts = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, az] = pts[k];
    const [bx, bz] = pts[k + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.01) continue;
    parts.push(box(w, 0.02, L, (ax + bx) / 2, y, (az + bz) / 2, Math.atan2(bx - ax, bz - az)));
  }
  return mergeGeometries(parts);
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
