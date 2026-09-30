import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial, standardMaterial, glowMaterial, additiveMaterial } from './retroMaterial.js';
import { PALETTE, textTexture } from './textures.js';
import { rampGeometry, box, tint, indexed, scaleUv } from './shapes.js';
import { deckLegs } from '../sim/city.js';
import { pathPose } from '../sim/arena.js';

// Arena venues. Indoors (the data centre): glossy floor, walls, server racks,
// ceiling light strips. Outdoors in a city district (opts.outdoor): a walled-off
// lot with jersey barriers and fencing, cover styled to the district, and
// floodlight towers. Either way: jump ramps and live floor plates.
export function buildArenaView(arena, tex, { outdoor = false, look = null } = {}) {
  const group = new THREE.Group();
  group.position.set(arena.cx, arena.y0, arena.cz);
  const { def, halfX, halfZ } = arena;
  if (def.authored) return authoredArenaView(group, def, tex, look);
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
    if (r.placed) continue; // (the T&T SDK's, drawn with the district: render/placedView.js)
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
  for (const hz of def.hazards.filter((q) => !q.gadget)) {
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
  const liftPads = def.lifts.filter((q) => !q.gadget).map((l) => {
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
  const bars = def.sweepers.filter((q) => !q.gadget).map((s) => {
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
      // (The sim's own height: a gate follows its trigger pad.)
      const top = l.gate ? arena.liftTop(l) : l.hMax * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / l.period + l.phase));
      pad.position.set(l.x, (l.base || 0) + top - 0.3, l.z);
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

// An authored district's arena structures, drawn with the district so they
// stand in every event (races pass them): container stacks, rubble, crane legs,
// the decks (gantry, catwalks, valet ramp) with their legs and ramps, lift pads
// and the cranes, which move with the simulation clock. Only the event's own
// pieces (barriers, limos, the shuttle bus) are drawn by the arena view.
// Everything drawn here is exactly what the car can hit. World coordinates.
const CONTAINER_COLORS = ['#b83a2a', '#2a6ab8', '#d8a020', '#3a8a4a', '#8a3ab0', '#c8c8c8', '#d86a1a'];
// Rubble blocks as fractions of the pile: [x, z, half-width, half-depth, height], all inside it.
const RUBBLE = [[-0.4, -0.3, 0.5, 0.5, 1], [0.35, 0.2, 0.5, 0.55, 0.8], [0.1, -0.4, 0.4, 0.3, 0.7]];

export function buildAuthoredStructures(style, tex, heightAt = null) {
  const group = new THREE.Group();
  const geos = { steel: [], yellow: [], dark: [], concrete: [], grating: [], containers: [], painted: [], lamps: [], mesh: [], fire: [], stone: [], gold: [], water: [] };
  const signs = [];
  const mesh = (list, mat) => list.length && group.add(new THREE.Mesh(mergeGeometries(list), mat));
  const liftPads = [];
  const movers = [];
  let k = 0;
  for (const spec of Object.values(style.arenas || {})) {
    const [x0, x1, z0, z1] = spec.bounds;
    const gy = heightAt ? heightAt((x0 + x1) / 2, (z0 + z1) / 2) : 0; // the arena's floor height
    for (const o of [...(spec.obstacles || []), ...(spec.platforms || []).filter((p) => p.under).flatMap(deckLegs)]) {
      if (o.kind === 'stack') {
        const n = Math.max(1, Math.round(o.h / 2.6));
        for (let s = 0; s < n; s++) geos.containers.push(tint(box(o.hw * 2, 2.56, o.hd * 2, o.x, gy + 1.3 + s * 2.6, o.z), CONTAINER_COLORS[k++ % CONTAINER_COLORS.length]));
      } else if (o.kind === 'rubble') {
        geos.concrete.push(box(o.hw * 2, o.h * 0.55, o.hd * 2, o.x, gy + o.h * 0.275, o.z));
        for (const [fx, fz, fw, fd, fh] of RUBBLE) geos.concrete.push(box(o.hw * 2 * fw, o.h * fh, o.hd * 2 * fd, o.x + o.hw * fx, gy + (o.h * fh) / 2, o.z + o.hd * fz));
      } else if (o.kind === 'craneLeg') {
        geos.yellow.push(box(o.hw * 2, o.h, o.hd * 2, o.x, gy + o.h / 2, o.z));
      } else if (stadiumPiece(o, gy, geos, signs) || underPiece(o, gy, geos) || spirePiece(o, gy, geos)) {
        // (Hollow High's stadium: drawn by stadiumPiece.)
      } else {
        geos.steel.push(box(o.hw * 2, o.h + 1, o.hd * 2, o.x, gy + (o.h - 1) / 2, o.z));
      }
    }
    // Decks: a steel girder under a grating, yellow lines along the edges (no
    // railings: nothing stops a car going over the side). The homecoming stage
    // is boards on a skirt, bunting along its front.
    for (const p of spec.platforms || []) {
      if (p.kind === 'colonnade') {
        // The Exchange's colonnade: a stone deck, gold along its front edge.
        geos.stone.push(box(p.hw * 2, p.h, p.hd * 2, p.x, gy + p.h / 2, p.z));
        geos.gold.push(box(p.hw * 2, 0.12, 0.3, p.x, gy + p.h + 0.02, p.z - p.hd + 0.2));
        continue;
      }
      if (p.kind === 'stage') {
        geos.painted.push(tint(box(p.hw * 2, p.h - 0.1, p.hd * 2, p.x, gy + (p.h - 0.1) / 2, p.z), '#6a1a2a'));
        geos.painted.push(tint(box(p.hw * 2 + 0.2, 0.1, p.hd * 2 + 0.2, p.x, gy + p.h - 0.05, p.z), '#a88860'));
        for (let x = p.x - p.hw + 1; x < p.x + p.hw; x += 2) geos.lamps.push(box(0.3, 0.3, 0.3, x, gy + p.h + 3.2, p.z - p.hd));
        for (const s of [-1, 1]) geos.steel.push(box(0.2, 4, 0.2, p.x + s * p.hw, gy + p.h + 2, p.z - p.hd));
        geos.steel.push(box(p.hw * 2, 0.1, 0.1, p.x, gy + p.h + 3.4, p.z - p.hd));
        signs.push(['HOMECOMING', '#ffd040', p.x, gy + p.h + 3.6, p.z - p.hd, 0, 1, 16]);
        continue;
      }
      const thick = p.under ? p.thick || 0.8 : p.h;
      geos.steel.push(box(p.hw * 2, thick - 0.05, p.hd * 2, p.x, gy + p.h - thick / 2 - 0.025, p.z));
      geos.grating.push(box(p.hw * 2, 0.05, p.hd * 2, p.x, gy + p.h - 0.025, p.z));
      const long = p.hw >= p.hd;
      for (const s of [-1, 1]) geos.yellow.push(long ? box(p.hw * 2, 0.04, 0.3, p.x, gy + p.h + 0.01, p.z + s * (p.hd - 0.3)) : box(0.3, 0.04, p.hd * 2, p.x + s * (p.hw - 0.3), gy + p.h + 0.01, p.z));
    }
    for (const r of spec.ramps || []) {
      if (r.kind === 'steps') {
        // The grand steps: stone treads (a car drives up them as a ramp).
        const n = Math.round(r.len / 1.6);
        for (let q = 0; q < n; q++) {
          const h = (r.height * (q + 1)) / n;
          const u = (r.len * (q + 0.5)) / n;
          geos.stone.push(box(Math.abs(r.dirZ) > 0.5 ? r.width : r.len / n, h, Math.abs(r.dirZ) > 0.5 ? r.len / n : r.width, r.x + r.dirX * u, gy + h / 2, r.z + r.dirZ * u));
        }
        continue;
      }
      geos.grating.push(indexed(rampGeometry(r, heightAt ? heightAt(r.x, r.z) : 0)));
      const yaw = Math.atan2(r.dirX, r.dirZ);
      geos.yellow.push(new THREE.BoxGeometry(r.width, 0.04, 0.5).rotateY(yaw).translate(r.x + r.dirX * (r.len - 0.4), gy + (r.base || 0) + r.height + 0.01, r.z + r.dirZ * (r.len - 0.4)));
    }
    // Lifts: a pad between four posts.
    for (const l of spec.lifts || []) {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) geos.steel.push(box(0.4, l.hMax + 2, 0.4, l.x + sx * (l.hw + 0.4), gy + (l.hMax + 2) / 2, l.z + sz * (l.hd + 0.4)));
      const pad = new THREE.Mesh(scaleUv(new THREE.BoxGeometry(l.hw * 2, 0.6, l.hd * 2), 3, 1), litMaterial({ map: tex.wall, color: '#ffe0a0' }));
      group.add(pad);
      liftPads.push({ l, pad, gy });
    }
    // Cranes (the event-only shuttle bus is the arena view's).
    for (const m of (spec.movers || []).filter((q) => !q.event)) movers.push(craneView(group, geos, m, gy));
  }
  mesh(geos.steel, STEEL());
  mesh(geos.yellow, YELLOW());
  mesh(geos.dark, DARK());
  mesh(geos.concrete, litMaterial({ map: tex.wallConcrete || tex.wall, color: '#8a8278' }));
  mesh(geos.grating, litMaterial({ map: tex.tiles || tex.lot, color: '#8a8a92', side: THREE.DoubleSide }));
  mesh(geos.containers, litMaterial({ map: tex.container, vertexColors: true }));
  mesh(geos.painted, litMaterial({ vertexColors: true }));
  mesh(geos.lamps, glowMaterial({ color: '#fff4dc', intensity: 3 }));
  mesh(geos.mesh, litMaterial({ color: '#3a3a44', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
  mesh(geos.fire, glowMaterial({ color: '#ff7a20', intensity: 3 }));
  mesh(geos.stone, litMaterial({ map: tex.wallConcrete || tex.wall, color: '#e8e0cc' }));
  mesh(geos.gold, glowMaterial({ color: '#ffc850', intensity: 2 }));
  mesh(geos.water, standardMaterial({ color: '#1a3a40', roughness: 0.15, metalness: 0.5 }));
  for (const [str, color, x, y, z, fx, fz, w] of signs) {
    const t = textTexture(str, color, '#141018');
    const h = (w * t.image.height) / t.image.width;
    const g = new THREE.PlaneGeometry(w, h).rotateY(Math.atan2(fx, fz)).translate(x + fx * 0.15, y + h / 2, z + fz * 0.15);
    group.add(new THREE.Mesh(g, glowMaterial({ map: t, intensity: 1.8, side: THREE.DoubleSide })));
  }
  // Moving parts follow the simulation clock (seconds), with the same motion as the sim.
  group.userData.animate = (t) => {
    for (const { l, pad, gy } of liftPads) pad.position.set(l.x, gy + l.hMax * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / l.period + l.phase)) - 0.3, l.z);
    for (const { m, bridge, trolley, gy } of movers) {
      const x = m.x + m.ax * Math.sin((2 * Math.PI * t) / m.px + m.phase);
      const z = m.z + m.az * Math.sin((2 * Math.PI * t) / m.pz + m.phase);
      bridge.position.set(x, gy, m.z);
      trolley.position.set(x, gy, z);
    }
  };
  group.userData.animate(0);
  return group;
}

// Hollow High's stadium pieces (Maple Hollow): stepped bleachers, the press
// box, floodlight towers, goalposts, the scoreboard, team benches, the
// water-cooler table, the chain-link fence. Returns false for anything else.
function stadiumPiece(o, gy, geos, signs) {
  const y = gy;
  if (o.kind === 'bleachers') {
    // Rows rising away from the field (face: the field's side, -1 west / +1 east).
    const rows = 8;
    const depth = (o.hw * 2) / rows;
    for (let r = 0; r < rows; r++) {
      const x = o.x - o.face * (-o.hw + depth * (r + 0.5));
      const h = ((r + 1) * o.h) / rows;
      geos.painted.push(tint(box(depth, 0.25, o.hd * 2, x, y + h - 0.12, o.z), r % 2 ? '#8a8a96' : '#9a9aa8'));
      geos.steel.push(box(depth, h - 0.25, 0.3, x, y + (h - 0.25) / 2, o.z - o.hd + 0.2), box(depth, h - 0.25, 0.3, x, y + (h - 0.25) / 2, o.z + o.hd - 0.2));
    }
    geos.dark.push(box(0.3, o.h, o.hd * 2, o.x + o.face * o.hw, y + o.h / 2, o.z));
    return true;
  }
  if (o.kind === 'pressbox') {
    for (const s of [-1, 1]) geos.steel.push(box(0.4, o.h - 3, 0.4, o.x, y + (o.h - 3) / 2, o.z + s * (o.hd - 0.5)));
    geos.painted.push(tint(box(o.hw * 2, 3, o.hd * 2, o.x, y + o.h - 1.5, o.z), '#6a1a2a'));
    geos.lamps.push(box(0.08, 1.2, o.hd * 2 - 1, o.x + o.hw + 0.02, y + o.h - 1.4, o.z));
    signs.push(['HOLLOW HIGH HAWKS', '#f0e0b0', o.x + o.hw + 0.05, y + o.h + 0.1, o.z, 1, 0, o.hd * 1.6]);
    return true;
  }
  if (o.kind === 'floodlight') {
    geos.steel.push(box(o.hw * 2, o.h, o.hd * 2, o.x, y + o.h / 2, o.z));
    geos.dark.push(box(5, 3, 0.6, o.x, y + o.h + 1, o.z));
    for (let a = -2; a <= 2; a += 1.25) for (const b of [-0.8, 0.6]) geos.lamps.push(box(0.9, 0.9, 0.2, o.x + a, y + o.h + 1 + b, o.z + (o.z < 195 ? 0.35 : -0.35)));
    return true;
  }
  if (o.kind === 'goalpost') {
    geos.yellow.push(box(0.3, o.h, 0.3, o.x, y + o.h / 2, o.z));
    geos.yellow.push(box(5.6, 0.25, 0.25, o.x, y + o.h, o.z + o.face * 0.8), box(0.25, 1, 0.25, o.x, y + o.h - 0.4, o.z + o.face * 0.4));
    for (const s of [-1, 1]) geos.yellow.push(box(0.2, 6, 0.2, o.x + s * 2.8, y + o.h + 3, o.z + o.face * 0.8));
    return true;
  }
  if (o.kind === 'scoreboard') {
    geos.steel.push(box(o.hw * 2, o.h, o.hd * 2, o.x, y + o.h / 2, o.z));
    if (o.x < -360) {
      geos.dark.push(box(20, 6, 0.8, -360, y + o.h + 2, o.z));
      signs.push(['HOME 21  VISITORS 17', '#ff5a3a', -360, y + o.h + 1.4, o.z - 0.45, 0, -1, 17]);
    }
    return true;
  }
  // (Tower Plaza's planters and pergola posts.)
  if (o.kind === 'planter') {
    geos.painted.push(tint(box(o.hw * 2, o.h, o.hd * 2, o.x, y + o.h / 2, o.z), '#c8c8d0'));
    geos.painted.push(tint(new THREE.IcosahedronGeometry(1.6, 0).translate(o.x, y + o.h + 2.6, o.z), '#3a7a4a'));
    geos.painted.push(tint(box(0.3, 2, 0.3, o.x, y + o.h + 1, o.z), '#4a3424'));
    return true;
  }
  if (o.kind === 'pergolaPost') {
    geos.painted.push(tint(box(o.hw * 2, o.h, o.hd * 2, o.x, y + o.h / 2, o.z), '#e8e8f0'));
    return true;
  }
  if (o.kind === 'bench' || o.kind === 'cooler') {
    geos.painted.push(tint(box(o.hw * 2, o.h, o.hd * 2, o.x, y + o.h / 2, o.z), o.kind === 'cooler' ? '#e8a020' : '#3a4a8a'));
    return true;
  }
  if (o.kind === 'fence') {
    const L = o.hd * 2;
    const dx = Math.sin(o.yaw);
    const dz = Math.cos(o.yaw);
    for (let t = -o.hd; t <= o.hd + 0.01; t += 3) geos.steel.push(box(0.1, o.h + 0.2, 0.1, o.x + dx * t, y + (o.h + 0.2) / 2, o.z + dz * t));
    geos.mesh.push(box(0.02, o.h, L, o.x, y + o.h / 2, o.z, o.yaw));
    geos.steel.push(box(0.06, 0.06, L, o.x, y + o.h, o.z, o.yaw));
    return true;
  }
  return false;
}

// The Corporate Spire's Forecourt: fountains, statues on plinths, flagpoles
// with Syncorp's flags. Returns false for anything else.
function spirePiece(o, gy, geos) {
  if (o.kind === 'fountain') {
    geos.stone.push(new THREE.CylinderGeometry(o.hw, o.hw + 0.3, o.h, 20).translate(o.x, gy + o.h / 2, o.z));
    geos.water.push(new THREE.CylinderGeometry(o.hw - 0.4, o.hw - 0.4, 0.1, 20).translate(o.x, gy + o.h - 0.1, o.z));
    geos.stone.push(new THREE.CylinderGeometry(0.6, 1, 2.4, 10).translate(o.x, gy + o.h + 1.2, o.z));
    geos.lamps.push(new THREE.CylinderGeometry(0.15, 0.4, 4, 8).translate(o.x, gy + o.h + 4, o.z));
    return true;
  }
  if (o.kind === 'statue') {
    geos.stone.push(box(o.hw * 2, o.h * 0.4, o.hd * 2, o.x, gy + o.h * 0.2, o.z));
    geos.gold.push(box(o.hw, o.h * 0.6, o.hd * 0.8, o.x, gy + o.h * 0.7, o.z), new THREE.SphereGeometry(o.hw * 0.4, 8, 6).translate(o.x, gy + o.h + 0.3, o.z));
    return true;
  }
  if (o.kind === 'flagpole') {
    geos.steel.push(new THREE.CylinderGeometry(0.12, 0.18, o.h, 8).translate(o.x, gy + o.h / 2, o.z));
    geos.painted.push(tint(box(0.06, 2, 3, o.x, gy + o.h - 1.2, o.z + 1.6), '#101014'), tint(box(0.07, 0.3, 3, o.x, gy + o.h - 1.2, o.z + 1.6), '#ffc850'));
    return true;
  }
  return false;
}

// The Undercity's pieces: oil drums with fires in them (Pillar Hall), site
// cabins. Returns false for anything else.
function underPiece(o, gy, geos) {
  if (o.kind === 'barrel') {
    geos.painted.push(tint(new THREE.CylinderGeometry(o.hw, o.hw, o.h, 12).translate(o.x, gy + o.h / 2, o.z), '#5a3a28'));
    geos.dark.push(new THREE.CylinderGeometry(o.hw + 0.03, o.hw + 0.03, 0.08, 12).translate(o.x, gy + o.h * 0.7, o.z));
    geos.fire.push(new THREE.ConeGeometry(o.hw * 0.8, 0.9, 6).translate(o.x, gy + o.h + 0.4, o.z));
    return true;
  }
  if (o.kind === 'cabin') {
    const yaw = o.yaw || 0;
    geos.painted.push(tint(box(o.hw * 2, o.h, o.hd * 2, o.x, gy + o.h / 2, o.z, yaw), '#6a7a6a'));
    geos.dark.push(box(o.hw * 2 + 0.2, 0.2, o.hd * 2 + 0.2, o.x, gy + o.h + 0.1, o.z, yaw));
    for (const f of [-0.5, 0, 0.5]) geos.lamps.push(box(o.hw * 2 + 0.04, 0.8, 1.2, o.x + Math.sin(yaw) * f * o.hd * 2, gy + o.h * 0.6, o.z + Math.cos(yaw) * f * o.hd * 2, yaw));
    return true;
  }
  return false;
}

// Cranes. The hook: a portal crane over the yard (its legs are obstacles),
// the trolley running along the girders with the hook hung at car height.
// The overhead crane: runways along the hall's long walls, the bridge
// rolling on them, the trolley running across the bridge with the load.
function craneView(group, geos, m, gy) {
  const box0 = (w, h, d, x, y, z) => box(w, h, d, x, y + gy, z);
  const parts = { bridge: { yellow: [], dark: [] }, trolley: { yellow: [], dark: [], steel: [], glow: [] } };
  const top = m.y0 + m.h;
  const T = parts.trolley;
  if (m.kind === 'hook') {
    const x0 = m.x - m.ax - 15;
    const x1 = m.x + m.ax + 15;
    for (const s of [-1, 1]) geos.yellow.push(box0(x1 - x0 + 2, 2, 1.6, (x0 + x1) / 2, m.beam + 1, m.z + s * 6));
    for (const x of [x0, x1]) geos.yellow.push(box0(2, 2, 14, x, m.beam + 1, m.z));
    T.dark.push(box(4, 2, 14, 0, m.beam + 3, 0));
    T.steel.push(box(0.2, m.beam + 2 - top, 0.2, 0, (m.beam + 2 + top) / 2, 0));
  } else {
    const x0 = m.x - m.ax - 22;
    const x1 = m.x + m.ax + 22;
    for (const s of [-1, 1]) {
      const z = m.z + s * m.span;
      geos.steel.push(box0(x1 - x0, 1.2, 1, (x0 + x1) / 2, m.beam - 0.6, z));
      for (let x = x0; x <= x1; x += 20) geos.steel.push(box0(0.8, 0.8, 1.4, x, m.beam - 1.6, z + s * 1.2));
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
  return { m, bridge: build(parts.bridge), trolley: build(parts.trolley), gy };
}

// An arena event in an authored district: the district view already draws the
// ground, every layout item and the arena structures; this adds the event's
// own pieces. Barriers along the arena edge where no fence or wall stands,
// limos parked across the entrances, and the event-only movers (the Glow
// Palace shuttle bus doing laps of the car park). Arena-local coordinates.
function authoredArenaView(group, def, tex, look) {
  const geos = { barrier: [], limo: [], chrome: [], glass: [], watch: [] };
  // (Maple Hollow closes its gates with the Watch's minivans instead of limos;
  // Chrome Heights with Kessler car transporters.)
  const watch = look?.closures === 'watch';
  const transporter = look?.closures === 'transporters';
  // (The Undercity: burnt-out wrecks; the Corporate Spire: Syncorp's armoured SUVs.)
  const wrecks = look?.closures === 'wrecks';
  const suvs = look?.closures === 'suvs';
  const WRECK = ['#4a2a1e', '#3a3432', '#5a3a24', '#2e2a2c', '#6a4a2a'];
  const WATCH = ['#e8e4dc', '#7a8a9a', '#8a2a2a', '#2a4a6a', '#c8b890'];
  const mesh = (list, mat) => list.length && group.add(new THREE.Mesh(mergeGeometries(list), mat));
  const floor = (x, z) => (def.heightAt ? def.heightAt(x + def.cx, z + def.cz) - def.y : 0);
  for (const [ax, az, bx, bz] of def.barriers || []) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 2.1));
    for (let q = 0; q < n; q++) {
      const t = (q + 0.5) / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      geos.barrier.push(new THREE.BoxGeometry(0.6, 0.9, len / n - 0.1).rotateY(Math.atan2(bx - ax, bz - az)).translate(x, floor(x, z) + 0.45, z));
    }
  }
  // Stretch limos nose to tail across each gap.
  for (const [ax, az, bx, bz] of def.limos || []) {
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / (watch ? 5 : suvs ? 5.4 : 7.2)));
    for (let q = 0; q < n; q++) {
      const t = (q + 0.5) / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const y = floor(x, z);
      if (transporter) {
        const along = [Math.sin(yaw), Math.cos(yaw)];
        const seg = len / n;
        geos.limo.push(box(2.6, 1.2, seg - 0.6, x, y + 1, z, yaw));
        for (const dy of [1.9, 4.1]) geos.chrome.push(box(2.7, 0.15, seg - 0.4, x, y + dy, z, yaw));
        for (const [q, dy] of [[-0.25, 2.5], [0.25, 2.5], [-0.25, 4.7], [0.25, 4.7]]) geos.watch.push(tint(box(1.8, 1, 4, x + along[0] * q * seg, y + dy, z + along[1] * q * seg, yaw), ['#c8ccd4', '#05d9e8', '#1a1a20', '#e8e8f0'][(q > 0 ? 1 : 0) + (dy > 3 ? 2 : 0)]));
        continue;
      }
      if (suvs) {
        geos.limo.push(box(2.1, 1.3, 5.1, x, y + 1.05, z, yaw));
        geos.glass.push(box(1.95, 0.55, 3, x, y + 1.95, z, yaw));
        continue;
      }
      if (wrecks) {
        const w = yaw + ((q % 3) - 1) * 0.15;
        geos.watch.push(tint(box(1.9, 0.9, 4.5, x, y + 0.55, z, w), WRECK[q % WRECK.length]));
        geos.watch.push(tint(box(1.7, 0.5, 2.2, x, y + 1.25, z, w), '#1e1a1a'));
        continue;
      }
      if (watch) {
        geos.watch.push(tint(box(1.95, 1.25, 4.8, x, y + 0.95, z, yaw), WATCH[q % WATCH.length]));
        geos.glass.push(box(1.85, 0.5, 3.6, x, y + 1.8, z, yaw));
        geos.chrome.push(box(0.4, 0.3, 0.3, x, y + 2.2, z, yaw));
        continue;
      }
      geos.limo.push(box(2, 1, 6.8, x, y + 0.75, z, yaw));
      geos.glass.push(box(1.8, 0.5, 4.8, x, y + 1.5, z, yaw));
      geos.chrome.push(box(2.05, 0.12, 6.9, x, y + 0.5, z, yaw));
    }
  }
  mesh(geos.barrier, litMaterial({ map: tex.wallConcrete || tex.wall, color: '#ffd0a0' }));
  mesh(geos.limo, litMaterial({ color: '#15121c' }));
  mesh(geos.watch, litMaterial({ vertexColors: true }));
  mesh(geos.glass, litMaterial({ color: '#2a2440' }));
  mesh(geos.chrome, glowMaterial({ color: '#d8d0ff', intensity: 1.2 }));
  // The shuttle bus (and any other event mover), moved along its path.
  const buses = (def.movers || []).filter((m) => m.event).map((m) => {
    const bus = new THREE.Group();
    if (m.kind === 'gantry') {
      // The window-cleaning gantry: a steel carriage on its rail, the boom and cradle out over the edge.
      const steel = [box(m.hw * 2, 1.2, m.hd * 2, 0, 0.9, 0), box(0.8, m.h, 0.8, 0, m.h / 2, 0), box(m.hw * 2 + 4, 0.6, 0.6, m.hw + 1, m.h, 0)];
      const lamps = [box(0.4, 0.3, 0.4, -m.hw, 1.6, m.hd), box(0.4, 0.3, 0.4, m.hw, 1.6, m.hd), box(0.4, 0.4, 0.4, 0, m.h + 0.5, 0)];
      bus.add(new THREE.Mesh(mergeGeometries(steel), litMaterial({ color: '#c8ccd4' })));
      bus.add(new THREE.Mesh(mergeGeometries(lamps), glowMaterial({ color: '#ffb040', intensity: 2.6 })));
      group.add(bus);
      return { m, bus };
    }
    if (m.kind === 'van') {
      // Syncorp security: a black van, a gold stripe, amber lights on the roof.
      bus.add(new THREE.Mesh(box(m.hw * 2, m.h - 0.4, m.hd * 2, 0, 0.4 + (m.h - 0.4) / 2, 0), litMaterial({ color: '#101014' })));
      bus.add(new THREE.Mesh(box(m.hw * 2 + 0.04, 0.2, m.hd * 2 + 0.04, 0, 1.2, 0), glowMaterial({ color: '#ffc850', intensity: 1.8 })));
      bus.add(new THREE.Mesh(box(m.hw * 1.4, 0.2, 0.4, 0, m.h + 0.1, 0.4), glowMaterial({ color: '#ffa020', intensity: 3 })));
      group.add(bus);
      return { m, bus };
    }
    if (m.kind === 'magnet') {
      // The scrap crane's magnet, swung out over the Sump on its cable (the crane
      // stands at the rim); its face glows when it's live.
      const steel = [new THREE.CylinderGeometry(m.hw, m.hw, m.h * 0.6, 20).translate(0, m.h * 0.7, 0), box(0.2, 44, 0.2, 0, m.h + 22, 0), box(3, 1.5, 3, 0, m.h + 44, 0)];
      const glow = [new THREE.CylinderGeometry(m.hw - 0.2, m.hw - 0.2, 0.1, 20).translate(0, m.h * 0.4, 0)];
      bus.add(new THREE.Mesh(mergeGeometries(steel), STEEL()));
      bus.add(new THREE.Mesh(mergeGeometries(glow), glowMaterial({ color: '#ff3a20', intensity: 2.6 })));
      group.add(bus);
      return { m, bus };
    }
    if (m.kind === 'float') {
      // The homecoming parade float: a flatbed skirted in the school's maroon,
      // a gold crown on a stepped stage, lights all round.
      const maroon = [box(m.hw * 2, 1.2, m.hd * 2, 0, 0.8, 0), box(m.hw * 1.4, 1, m.hd * 1.2, 0, 1.9, -0.4)];
      const gold = [box(m.hw * 2 + 0.05, 0.25, m.hd * 2 + 0.05, 0, 1.45, 0), box(m.hw, 0.9, m.hd * 0.6, 0, 2.85, -0.6), new THREE.ConeGeometry(0.9, 1.2, 5).translate(0, 3.9, -0.6)];
      const lights = [];
      for (let z = -m.hd + 0.4; z <= m.hd - 0.4; z += 0.8) for (const sx of [-1, 1]) lights.push(box(0.15, 0.15, 0.15, sx * (m.hw + 0.05), 1.3, z));
      bus.add(new THREE.Mesh(mergeGeometries(maroon), litMaterial({ color: '#6a1a2a' })));
      bus.add(new THREE.Mesh(mergeGeometries(gold), litMaterial({ color: '#e0b020' })));
      bus.add(new THREE.Mesh(mergeGeometries(lights), glowMaterial({ color: '#fff0c0', intensity: 2.4 })));
      group.add(bus);
      return { m, bus };
    }
    const body = [box(m.hw * 2, m.h - 0.5, m.hd * 2, 0, 0.5 + (m.h - 0.5) / 2, 0)];
    const dark = [box(m.hw * 2 - 0.2, 0.7, m.hd * 2 - 1, 0, 0.35, 0)];
    const glow = [box(m.hw * 2 + 0.04, 0.8, m.hd * 2 - 2.4, 0, m.h - 1.1, -0.4), box(m.hw * 2 - 0.4, 0.5, 0.08, 0, m.h - 0.6, m.hd + 0.02)];
    bus.add(new THREE.Mesh(mergeGeometries(body), litMaterial({ color: '#d8a020' })));
    bus.add(new THREE.Mesh(mergeGeometries(dark), DARK()));
    bus.add(new THREE.Mesh(mergeGeometries(glow), glowMaterial({ color: '#ff2a6d', intensity: 2.2 })));
    group.add(bus);
    return { m, bus };
  });
  group.userData.animate = (t) => {
    for (const { m, bus } of buses) {
      const p = pathPose(m, t);
      bus.position.set(p.x, floor(p.x, p.z), p.z);
      bus.rotation.y = p.yaw;
    }
  };
  group.userData.animate(0);
  return group;
}

const STEEL = () => litMaterial({ color: '#4a4858' });
const YELLOW = () => litMaterial({ color: '#e0b020' });
const DARK = () => litMaterial({ color: '#1c1a24' });

