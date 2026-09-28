import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial, standardMaterial, glowMaterial, additiveMaterial } from './retroMaterial.js';
import { PALETTE } from './textures.js';
import { rampGeometry } from './districtView.js';

// Arena venues. Indoors (the data centre): glossy floor, walls, server racks,
// ceiling light strips. Outdoors in a city district (opts.outdoor): a walled-off
// lot with jersey barriers and fencing, cover styled to the district, and
// floodlight towers. Either way: jump ramps and live floor plates.
export function buildArenaView(arena, tex, { outdoor = false, look = null } = {}) {
  const group = new THREE.Group();
  group.position.set(arena.cx, arena.y0, arena.cz);
  const { def, halfX, halfZ } = arena;
  if (def.authored) return authoredArenaView(group, def, tex);
  const sx = halfX * 2;
  const sz = halfZ * 2;

  // Floor.
  const floorTex = outdoor && tex.parking ? tex.parking.clone() : tex.ground.clone();
  floorTex.needsUpdate = true;
  floorTex.repeat.set(sx / (outdoor ? 12 : 6), sz / (outdoor ? 12 : 6));
  group.add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(sx + 4, sz + 4).rotateX(-Math.PI / 2).translate(0, 0.01, 0),
      standardMaterial({ map: floorTex, roughness: outdoor ? 0.4 : 0.3, metalness: 0.3, envMap: tex.env, envMapIntensity: outdoor ? 0.6 : 0.35, color: outdoor ? '#ffffff' : '#5a5a70' }),
    ),
  );

  // Walls: chevron barriers at car height all round.
  const walls = [];
  const uppers = [];
  for (const [x, z, len, ry] of [[0, -halfZ, sx, 0], [0, halfZ, sx, 0], [-halfX, 0, sz, Math.PI / 2], [halfX, 0, sz, Math.PI / 2]]) {
    walls.push(new THREE.BoxGeometry(len + 1, 1.4, 0.6).rotateY(ry).translate(x, 0.7, z));
    if (outdoor) {
      // Fence above the barrier: posts and two rails.
      for (let t = -len / 2; t <= len / 2; t += 4) {
        const px = ry ? x : x + t;
        const pz = ry ? z + t : z;
        uppers.push(new THREE.BoxGeometry(0.15, 3.2, 0.15).translate(px, 3, pz));
      }
      for (const y of [2.6, 4.4]) uppers.push(new THREE.BoxGeometry(len, 0.08, 0.08).rotateY(ry).translate(x, y, z));
    } else {
      uppers.push(new THREE.BoxGeometry(len + 1, 8, 0.8).rotateY(ry).translate(x * 1.01, 5.4, z * 1.01));
    }
  }
  const wallTex = tex.wall.clone();
  wallTex.needsUpdate = true;
  wallTex.repeat.set(Math.max(sx, sz) / 3.4, 1);
  group.add(new THREE.Mesh(mergeGeometries(walls), litMaterial({ map: wallTex, color: look?.barrier || '#ffffff' })));
  group.add(new THREE.Mesh(mergeGeometries(uppers), litMaterial({ color: outdoor ? '#4a4858' : '#15121e' })));

  // Cover: server racks indoors; in the city, containers (docks) or buildings'
  // look for everything else.
  const coverTex = outdoor && look?.buildingTex === 'corrugated' ? tex.container : tex.building;
  const racks = def.obstacles.map((o) => {
    const b = new THREE.BoxGeometry(o.hw * 2, o.h, o.hd * 2);
    const uv = b.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (o.hw + o.hd) * 0.12, uv.getY(k) * o.h * 0.12);
    return b.translate(o.x, o.h / 2, o.z);
  });
  group.add(
    new THREE.Mesh(
      mergeGeometries(racks),
      coverTex === tex.container
        ? litMaterial({ map: tex.container, color: '#c86a3a' })
        : litMaterial({ map: tex.building, emissiveMap: tex.buildingGlow, emissive: 0xffffff, emissiveIntensity: 1.4, color: look?.building || '#ffffff' }),
    ),
  );
  const accent = look?.neon?.[0] || PALETTE.cyan;
  for (const o of def.obstacles) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(o.hw * 2 + 0.1, 0.08, o.hd * 2 + 0.1), glowMaterial({ color: accent, intensity: 2.4 }));
    strip.position.set(o.x, o.h, o.z);
    group.add(strip);
  }

  // Ramps: wedges with chevrons.
  const rampMat = litMaterial({ map: tex.wall, side: THREE.DoubleSide });
  for (const r of def.ramps) {
    const g = new THREE.BufferGeometry();
    const w = r.width / 2;
    const L = r.len;
    const h = r.height;
    const P = [[-w, 0, 0], [w, 0, 0], [w, h, L], [-w, h, L], [-w, 0, L], [w, 0, L]];
    const faces = [[0, 1, 2], [0, 2, 3], [1, 5, 2], [0, 3, 4], [3, 2, 5], [3, 5, 4]];
    const pos = [];
    const uvs = [];
    for (const f of faces) {
      for (const k of f) {
        pos.push(...P[k]);
        uvs.push(P[k][0] / 2, P[k][2] / 3);
      }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, rampMat);
    m.position.set(r.x, r.base || 0, r.z);
    m.rotation.y = Math.atan2(r.dirX, r.dirZ);
    group.add(m);
  }

  // Live power couplings on the floor.
  for (const hz of def.hazards) {
    const plate = new THREE.Mesh(new THREE.CircleGeometry(hz.r, 24).rotateX(-Math.PI / 2), additiveMaterial({ map: tex.glow, color: '#ffd000', opacity: 0.9 }));
    plate.position.set(hz.x, 0.03, hz.z);
    group.add(plate);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(hz.r, 0.08, 4, 32).rotateX(Math.PI / 2), glowMaterial({ color: '#ffd000', intensity: 2.5 }));
    ring.position.set(hz.x, 0.05, hz.z);
    group.add(ring);
  }

  // Raised decks and bridges: concrete sides, paved tops, glowing edges.
  const sides = [];
  const tops = [];
  const edges = [];
  for (const p of def.platforms) {
    const bottom = p.under ? p.h - (p.thick || 0.8) : 0;
    const hgt = p.h - bottom;
    sides.push(scaleUv(new THREE.BoxGeometry(p.hw * 2, hgt, p.hd * 2), (p.hw + p.hd) / 4, hgt / 4).translate(p.x, bottom + hgt / 2, p.z));
    tops.push(scaleUv(new THREE.PlaneGeometry(p.hw * 2, p.hd * 2), p.hw / 3, p.hd / 3).rotateX(-Math.PI / 2).translate(p.x, p.h + 0.02, p.z));
    for (const [w, d, ox, oz] of [[p.hw * 2, 0.25, 0, p.hd], [p.hw * 2, 0.25, 0, -p.hd], [0.25, p.hd * 2, p.hw, 0], [0.25, p.hd * 2, -p.hw, 0]]) {
      edges.push(new THREE.BoxGeometry(w, 0.15, d).translate(p.x + ox, p.h + 0.08, p.z + oz));
    }
    if (p.under) {
      // Bridge railings along the long sides, and pillars underneath.
      const long = p.hw > p.hd;
      for (const s of [-1, 1]) {
        sides.push(new THREE.BoxGeometry(long ? p.hw * 2 : 0.3, 0.9, long ? 0.3 : p.hd * 2).translate(p.x + (long ? 0 : s * p.hw), p.h + 0.45, p.z + (long ? s * p.hd : 0)));
      }
    }
  }
  for (const o of def.obstacles.filter((ob) => ob.hw <= 0.5 && ob.hd <= 0.5)) {
    sides.push(new THREE.BoxGeometry(1, o.h, 1).translate(o.x, o.h / 2, o.z));
  }
  const concrete = litMaterial({ map: tex.lot || tex.shoulder, color: '#9a96a8' });
  if (sides.length) group.add(new THREE.Mesh(mergeGeometries(sides), concrete));
  if (tops.length) group.add(new THREE.Mesh(mergeGeometries(tops), litMaterial({ map: tex.tiles || tex.shoulder, side: THREE.DoubleSide })));
  if (edges.length) group.add(new THREE.Mesh(mergeGeometries(edges), glowMaterial({ color: accent, intensity: 2.6 })));

  // Lift pads that rise and fall, with warning lights on their posts.
  const liftPads = def.lifts.map((l) => {
    const posts = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) posts.push(new THREE.BoxGeometry(0.4, l.hMax + 2, 0.4).translate(l.x + sx * (l.hw + 0.4), (l.hMax + 2) / 2, l.z + sz * (l.hd + 0.4)));
    group.add(new THREE.Mesh(mergeGeometries(posts), litMaterial({ color: '#4a4858' })));
    for (const [sx, sz] of [[-1, -1], [1, 1]]) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), glowMaterial({ color: '#ffb000', intensity: 3 }));
      light.position.set(l.x + sx * (l.hw + 0.4), l.hMax + 2.2, l.z + sz * (l.hd + 0.4));
      group.add(light);
    }
    const pad = new THREE.Group();
    pad.add(new THREE.Mesh(scaleUv(new THREE.BoxGeometry(l.hw * 2, 0.6, l.hd * 2), 3, 1), litMaterial({ map: tex.wall, color: '#ffe0a0' })));
    group.add(pad);
    return { l, pad };
  });

  // Sweepers: a pivot with an electrified bar that rotates at car height.
  const bars = def.sweepers.map((s) => {
    const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.4, 10), litMaterial({ color: '#3a3848' }));
    pivot.position.set(s.x, 1.2, s.z);
    group.add(pivot);
    const bar = new THREE.Group();
    bar.position.set(s.x, 0, s.z);
    bar.add(new THREE.Mesh(scaleUv(new THREE.BoxGeometry(s.len * 2, 0.8, s.width), s.len / 2, 1).translate(0, s.height - 0.4, 0), litMaterial({ map: tex.wall })));
    bar.add(new THREE.Mesh(new THREE.BoxGeometry(s.len * 2, 0.12, s.width + 0.1).translate(0, s.height + 0.02, 0), glowMaterial({ color: '#40f0ff', intensity: 3 })));
    group.add(bar);
    return { s, bar };
  });

  // Moving parts follow the simulation clock (seconds).
  group.userData.animate = (t) => {
    for (const { l, pad } of liftPads) {
      const top = l.hMax * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / l.period + l.phase));
      pad.position.set(l.x, top - 0.3, l.z);
    }
    for (const { s, bar } of bars) bar.rotation.y = -(s.phase + s.speed * t);
  };
  group.userData.animate(0);

  if (outdoor) {
    // Floodlight towers at the corners.
    const poles = [];
    const heads = [];
    for (const [x, z] of [[-halfX + 2, -halfZ + 2], [halfX - 2, -halfZ + 2], [-halfX + 2, halfZ - 2], [halfX - 2, halfZ - 2]]) {
      poles.push(new THREE.BoxGeometry(0.6, 18, 0.6).translate(x, 9, z));
      heads.push(new THREE.BoxGeometry(3, 1.2, 1).translate(x, 18, z));
      const l = new THREE.PointLight('#e8f0ff', 60, 90, 1.4);
      l.position.set(x * 0.9, 16, z * 0.9);
      group.add(l);
    }
    group.add(new THREE.Mesh(mergeGeometries(poles), litMaterial({ color: '#3a3848' })));
    group.add(new THREE.Mesh(mergeGeometries(heads), glowMaterial({ color: '#f0f4ff', intensity: 3 })));
  } else {
    // Ceiling light strips and coloured fill lights.
    for (let k = -2; k <= 2; k++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.9, 0.12, 0.4), glowMaterial({ color: k % 2 ? PALETTE.pink : '#e0e8ff', intensity: 2.5 }));
      strip.position.set(0, 12, k * sz * 0.2);
      group.add(strip);
    }
    for (const [x, z, c] of [[-0.3, -0.3, PALETTE.pink], [0.3, 0.3, PALETTE.cyan], [0.3, -0.3, PALETTE.violet], [-0.3, 0.3, PALETTE.amber]]) {
      const l = new THREE.PointLight(c, 40, 60, 1.4);
      l.position.set(x * sx, 8, z * sz);
      group.add(l);
    }
  }
  return group;
}

// An arena (or free roam) in an authored district. The district view already
// draws the ground, fences, walls and every layout item; this adds only what
// the arena's data adds, drawn by kind: container stacks, rubble, the gantry
// deck and catwalks with their legs and ramps, the lifts, event barriers, and
// the moving cranes. Everything drawn here is exactly what the car can hit.
const CONTAINER_COLORS = ['#b83a2a', '#2a6ab8', '#d8a020', '#3a8a4a', '#8a3ab0', '#c8c8c8', '#d86a1a'];
// Rubble blocks as fractions of the pile: [x, z, half-width, half-depth, height], all inside it.
const RUBBLE = [[-0.4, -0.3, 0.5, 0.5, 1], [0.35, 0.2, 0.5, 0.55, 0.8], [0.1, -0.4, 0.4, 0.3, 0.7]];

function authoredArenaView(group, def, tex) {
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const geos = { steel: [], yellow: [], dark: [], concrete: [], grating: [], containers: [], barrier: [] };
  const mesh = (list, mat) => list.length && group.add(new THREE.Mesh(mergeGeometries(list), mat));
  let k = 0;
  for (const o of def.obstacles) {
    if (!o.render) continue;
    if (o.kind === 'stack') {
      const n = Math.max(1, Math.round(o.h / 2.6));
      for (let s = 0; s < n; s++) geos.containers.push(tint(box(o.hw * 2, 2.56, o.hd * 2, o.x, 1.3 + s * 2.6, o.z), CONTAINER_COLORS[k++ % CONTAINER_COLORS.length]));
    } else if (o.kind === 'rubble') {
      geos.concrete.push(box(o.hw * 2, o.h * 0.55, o.hd * 2, o.x, o.h * 0.275, o.z));
      for (const [fx, fz, fw, fd, fh] of RUBBLE) geos.concrete.push(box(o.hw * 2 * fw, o.h * fh, o.hd * 2 * fd, o.x + o.hw * fx, (o.h * fh) / 2, o.z + o.hd * fz));
    } else if (o.kind === 'craneLeg') {
      geos.yellow.push(box(o.hw * 2, o.h, o.hd * 2, o.x, o.h / 2, o.z));
    } else {
      geos.steel.push(box(o.hw * 2, o.h, o.hd * 2, o.x, o.h / 2, o.z));
    }
  }
  // Decks: a steel girder under a grating, yellow lines along the edges (no
  // railings: nothing stops a car going over the side).
  for (const p of def.platforms) {
    if (!p.render) continue;
    const thick = p.under ? p.thick || 0.8 : p.h;
    geos.steel.push(box(p.hw * 2, thick - 0.05, p.hd * 2, p.x, p.h - thick / 2 - 0.025, p.z));
    geos.grating.push(box(p.hw * 2, 0.05, p.hd * 2, p.x, p.h - 0.025, p.z));
    const long = p.hw >= p.hd;
    for (const s of [-1, 1]) geos.yellow.push(long ? box(p.hw * 2, 0.04, 0.3, p.x, p.h + 0.01, p.z + s * (p.hd - 0.3)) : box(0.3, 0.04, p.hd * 2, p.x + s * (p.hw - 0.3), p.h + 0.01, p.z));
  }
  for (const r of def.ramps) {
    if (!r.render) continue;
    geos.grating.push(indexed(rampGeometry(r)));
    const yaw = Math.atan2(r.dirX, r.dirZ);
    geos.yellow.push(new THREE.BoxGeometry(r.width, 0.04, 0.5).rotateY(yaw).translate(r.x + r.dirX * (r.len - 0.4), (r.base || 0) + r.height + 0.01, r.z + r.dirZ * (r.len - 0.4)));
  }
  // Event barriers along the arena's edge where no fence or wall stands.
  for (const [ax, az, bx, bz] of def.barriers || []) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 2.1));
    for (let q = 0; q < n; q++) {
      const t = (q + 0.5) / n;
      geos.barrier.push(new THREE.BoxGeometry(0.6, 0.9, len / n - 0.1).rotateY(Math.atan2(bx - ax, bz - az)).translate(ax + (bx - ax) * t, 0.45, az + (bz - az) * t));
    }
  }

  // Lifts: a pad between four posts with warning lights.
  const liftPads = def.lifts.map((l) => {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) geos.steel.push(box(0.4, l.hMax + 2, 0.4, l.x + sx * (l.hw + 0.4), (l.hMax + 2) / 2, l.z + sz * (l.hd + 0.4)));
    const pad = new THREE.Mesh(scaleUv(new THREE.BoxGeometry(l.hw * 2, 0.6, l.hd * 2), 3, 1), litMaterial({ map: tex.wall, color: '#ffe0a0' }));
    group.add(pad);
    return { l, pad };
  });

  // Cranes. The hook: a portal crane over the yard (its legs are obstacles),
  // the trolley running along the girders with the hook hung at car height.
  // The overhead crane: runways along the hall's long walls, the bridge
  // rolling on them, the trolley running across the bridge with the load.
  const movers = def.movers.map((m) => {
    const parts = { bridge: { yellow: [], dark: [] }, trolley: { yellow: [], dark: [], steel: [], glow: [] } };
    const top = m.y0 + m.h;
    const T = parts.trolley;
    if (m.kind === 'hook') {
      const x0 = m.x - m.ax - 15;
      const x1 = m.x + m.ax + 15;
      for (const s of [-1, 1]) geos.yellow.push(box(x1 - x0 + 2, 2, 1.6, (x0 + x1) / 2, m.beam + 1, m.z + s * 6));
      for (const x of [x0, x1]) geos.yellow.push(box(2, 2, 14, x, m.beam + 1, m.z));
      T.dark.push(box(4, 2, 14, 0, m.beam + 3, 0));
      T.steel.push(box(0.2, m.beam + 2 - top, 0.2, 0, (m.beam + 2 + top) / 2, 0));
    } else {
      const x0 = m.x - m.ax - 22;
      const x1 = m.x + m.ax + 22;
      for (const s of [-1, 1]) {
        const z = m.z + s * m.span;
        geos.steel.push(box(x1 - x0, 1.2, 1, (x0 + x1) / 2, m.beam - 0.6, z));
        for (let x = x0; x <= x1; x += 20) geos.steel.push(box(0.8, 0.8, 1.4, x, m.beam - 1.6, z + s * 1.2));
        parts.bridge.dark.push(box(5, 1.2, 2, 0, m.beam + 0.6, s * m.span));
      }
      parts.bridge.yellow.push(box(3, 2, 2 * m.span, 0, m.beam + 1.2, 0));
      T.dark.push(box(4, 1.6, 4, 0, m.beam + 3, 0));
      T.steel.push(box(0.2, m.beam + 2.2 - top, 0.2, 0, (m.beam + 2.2 + top) / 2, 0));
    }
    T.yellow.push(box(m.hw * 2, m.h, m.hd * 2, 0, m.y0 + m.h / 2, 0));
    for (const f of [0.35, 0.75]) T.dark.push(box(m.hw * 2 + 0.05, 0.4, m.hd * 2 + 0.05, 0, m.y0 + m.h * f, 0));
    T.glow.push(box(0.4, 0.4, 0.4, 0, top + 0.3, 0));
    const build = (set) => {
      const g = new THREE.Group();
      const mats = { yellow: YELLOW, dark: DARK, steel: STEEL, glow: () => glowMaterial({ color: '#ff3030', intensity: 3 }) };
      for (const [name, list] of Object.entries(set)) if (list.length) g.add(new THREE.Mesh(mergeGeometries(list), mats[name]()));
      group.add(g);
      return g;
    };
    return { m, bridge: build(parts.bridge), trolley: build(parts.trolley) };
  });

  mesh(geos.steel, STEEL());
  mesh(geos.yellow, YELLOW());
  mesh(geos.dark, DARK());
  mesh(geos.concrete, litMaterial({ map: tex.wallConcrete || tex.wall, color: '#8a8278' }));
  mesh(geos.grating, litMaterial({ map: tex.tiles || tex.lot, color: '#8a8a92', side: THREE.DoubleSide }));
  mesh(geos.containers, litMaterial({ map: tex.container, vertexColors: true }));
  mesh(geos.barrier, litMaterial({ map: tex.wallConcrete || tex.wall, color: '#ffd0a0' }));

  // Moving parts follow the simulation clock (seconds), with the same motion as the sim.
  group.userData.animate = (t) => {
    for (const { l, pad } of liftPads) {
      const top = l.hMax * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / l.period + l.phase));
      pad.position.set(l.x, top - 0.3, l.z);
    }
    for (const { m, bridge, trolley } of movers) {
      const x = m.x + m.ax * Math.sin((2 * Math.PI * t) / m.px + m.phase);
      const z = m.z + m.az * Math.sin((2 * Math.PI * t) / m.pz + m.phase);
      bridge.position.set(x, 0, m.z);
      trolley.position.set(x, 0, z);
    }
  };
  group.userData.animate(0);
  return group;
}

const STEEL = () => litMaterial({ color: '#4a4858' });
const YELLOW = () => litMaterial({ color: '#e0b020' });
const DARK = () => litMaterial({ color: '#1c1a24' });

function tint(g, color) {
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let k = 0; k < colors.length; k += 3) colors.set([c.r, c.g, c.b], k);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function indexed(g) {
  if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
  return g;
}

function scaleUv(g, su, sv) {
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * su, uv.getY(k) * sv);
  return g;
}
