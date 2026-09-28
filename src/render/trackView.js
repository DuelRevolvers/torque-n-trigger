import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial, standardMaterial, glowMaterial, additiveMaterial } from './retroMaterial.js';
import { PALETTE, makeRng, textTexture } from './textures.js';

const BARRIER_HEIGHT = 1.1;
const LAMP_SPACING = 36;

// Builds the road, curbs, shoulders, barriers, ground, start/finish gantry,
// street lamps, jump kickers and shortcut branches from the simulation's track
// data, so what you see is what you drive on.
// opts.city: the route runs through a district (districtView draws the ground,
// buildings and lamps) and looks like its streets: the district's road surface
// (opts.look), sidewalk kerbs and concrete barriers (opts.barrierColor).
export function buildTrackView(track, tex, opts = {}) {
  const group = new THREE.Group();
  const groundY = track.minY - 0.6;
  const doubleSided = { side: THREE.DoubleSide };
  const mats = {
    road: standardMaterial({ map: tex.road, roughnessMap: tex.roadRough ?? null, roughness: tex.roadRough ? 1 : 0.45, metalness: 0.0, envMap: tex.env, envMapIntensity: 0.5, ...doubleSided }),
    curb: litMaterial({ map: tex.curb, ...doubleSided }),
    shoulder: litMaterial({ map: opts.sidewalk || tex.shoulder, ...doubleSided }),
    barrier: litMaterial({ map: tex.wall, color: opts.barrierColor || '#ffffff', ...doubleSided }),
    skirt: litMaterial({ color: PALETTE.wallDark, ...doubleSided }),
    chevron: litMaterial({ map: tex.wall, ...doubleSided, polygonOffset: true, polygonOffsetFactor: -2 }),
  };
  if (opts.city) {
    mats.road = streetRoadMaterial(tex, opts.look);
    mats.curb = mats.shoulder;
    mats.barrier = litMaterial({ map: tex.wallConcrete || tex.wall, color: opts.barrierColor || '#ffffff', ...doubleSided });
    if (opts.look?.ledBarriers) mats.led = opts.look.neon.slice(0, 2).map((color) => glowMaterial({ color, intensity: 2.4, ...doubleSided }));
  }

  // Where a shortcut meets the main road, neither road gets a wall in the way.
  const branches = track.branches || [];
  const inBranch = (x, z) => branches.some(({ track: b }) => {
    const g = b.queryMain(x, z, -1);
    return g.overrun < 1 && Math.abs(g.lateral) < b.wallDist + 1.5;
  });
  const inMain = (x, z) => Math.abs(track.queryMain(x, z, -1).lateral) < track.wallDist - 0.5;

  buildRoad(group, track, mats, groundY, { wallSkip: branches.length ? inBranch : null });
  for (const br of branches) {
    buildRoad(group, br.track, mats, groundY, { lift: 0.03, wallSkip: inMain, roadMat: branchMaterial(br.kind, tex, mats) });
    group.add(beacons(br.track));
  }

  const groundSize = 3000;
  const ground = new THREE.PlaneGeometry(groundSize, groundSize);
  ground.rotateX(-Math.PI / 2);
  ground.translate((track.bounds.minX + track.bounds.maxX) / 2, groundY, (track.bounds.minZ + track.bounds.maxZ) / 2);
  tex.ground.repeat.set(groundSize / 8, groundSize / 8);
  if (!opts.city) group.add(new THREE.Mesh(ground, new THREE.MeshLambertMaterial({ map: tex.ground }))); // no vertex snap: see retroMaterial.js

  const at = pointAt(track);
  if (opts.city && !opts.look?.roof) {
    // Closed side streets: containers stacked across them. Floodlights at the start.
    const colors = ['#b83a2a', '#2a6ab8', '#d8a020', '#3a8a4a', '#8a3ab0', '#c8c8c8', '#d86a1a'];
    const rng = makeRng(track.count * 7 + 3);
    const stacks = [];
    const tops = []; // closure stack tops, for the start crowd
    // (Authored districts: a fixed pattern of heights and colours, nothing random.)
    let n = 0;
    const limos = opts.look?.closures === 'limos';
    for (const [k, c] of (track.closures || []).entries()) {
      if (limos) {
        tops.push({ c, y: c.y + (c.bus ? 3.4 : 1.5), bus: c.bus });
        continue;
      }
      const layers = track.authored ? 1 + (k % 3 === 1 ? 1 : 0) : 1 + (rng() < 0.5 ? 1 : 0);
      tops.push({ c, y: c.y - 0.05 + layers * 2.6 });
      for (let l = 0; l < layers; l++) {
        for (const side of [-1, 1]) {
          const g = new THREE.BoxGeometry(12.2, 2.6, 2.44);
          g.translate(side * 6.3, 1.3 + l * 2.6, 0);
          g.rotateY(c.yaw);
          g.translate(c.x, c.y - 0.05, c.z);
          const col = new THREE.Color(colors[track.authored ? n++ % colors.length : Math.floor(rng() * colors.length)]);
          const cols = new Float32Array(g.attributes.position.count * 3);
          for (let k = 0; k < cols.length; k += 3) cols.set([col.r, col.g, col.b], k);
          g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
          stacks.push(g);
        }
      }
    }
    if (stacks.length) group.add(new THREE.Mesh(mergeGeometries(stacks), litMaterial({ map: tex.container, vertexColors: true })));
    if (limos) group.add(limoClosures(track.closures || []));
    const i0 = track.closed ? 0 : 0;
    const masts = [];
    const heads = [];
    for (const side of [-1, 1]) {
      // Just behind the barrier where there's no open ground further back (a pier, a building).
      const wl = track.localWall ? track.localWall(track.s[track.wrap(i0 + 6)]) : track.wallDist;
      const far = at(track.wrap(i0 + 6), side * (wl + 3));
      const [x, y, z] = !opts.clear || opts.clear(far[0], far[2]) ? far : at(track.wrap(i0 + 6), side * (wl + 0.6));
      masts.push(new THREE.BoxGeometry(0.6, 16, 0.6).translate(x, y + 8, z));
      heads.push(new THREE.BoxGeometry(3.4, 1.4, 1.4).translate(x, y + 16.4, z));
    }
    group.add(new THREE.Mesh(mergeGeometries(masts), litMaterial({ color: '#4a4858' })), new THREE.Mesh(mergeGeometries(heads), glowMaterial({ color: '#fff4d0', intensity: 3 })));
    if (opts.look?.startDressing === 'docks') group.add(docksDressing(track, tex, at, opts.clear || (() => true), tops));
    if (opts.look?.startDressing === 'strip') {
      const dressing = stripDressing(track, tex, at, opts, tops);
      group.add(dressing);
      group.userData.animate = dressing.userData.animate;
    }
  }
  group.add(buildStartLine(track, tex, at, track.closed ? 0 : track.indexAtDistance(track.finishS ?? track.length - 25)));
  if (!opts.city) group.add(buildLamps(track, tex, at));
  if (tex.puddles) {
    group.add(buildPuddles(track, tex, 0));
    for (const br of branches) if (br.kind === 'street' || br.kind === 'alley' || br.kind === 'parking') group.add(buildPuddles(br.track, tex, 0.03));
  }
  return group;
}

// Rustline's start: a banner slung from a portal crane over the road just past
// the line, and Dock Rats standing on container tops: on the closed side
// streets' stacks nearest the start, and on containers behind the barriers
// where there's open ground for them (clear(x, z)). None of it is in a car's way.
function docksDressing(track, tex, at, clear, tops) {
  const group = new THREE.Group();
  const W = track.wallDist;
  const yellow = [];
  const painted = [];
  const tinted = (g, color) => {
    const c = new THREE.Color(color);
    const cols = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < cols.length; k += 3) cols.set([c.r, c.g, c.b], k);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return g;
  };
  const i = track.indexAtDistance(24);
  const pl = at(i, -(W + 0.6));
  const pr = at(i, W + 0.6);
  const ux = (pr[0] - pl[0]) / Math.hypot(pr[0] - pl[0], pr[2] - pl[2]);
  const uz = (pr[2] - pl[2]) / Math.hypot(pr[0] - pl[0], pr[2] - pl[2]);
  const span = Math.hypot(pr[0] - pl[0], pr[2] - pl[2]);
  const y = Math.max(pl[1], pr[1]);
  for (const [x, , z] of [pl, pr]) yellow.push(new THREE.BoxGeometry(0.8, 14, 0.8).rotateY(Math.atan2(ux, uz)).translate(x, y + 7, z));
  yellow.push(new THREE.BoxGeometry(1.2, 1.4, span + 1).rotateY(Math.atan2(ux, uz)).translate((pl[0] + pr[0]) / 2, y + 14.3, (pl[2] + pr[2]) / 2));
  for (const s of [-1, 1]) painted.push(tinted(new THREE.BoxGeometry(0.08, 2.4, 0.08).translate((pl[0] + pr[0]) / 2 + ux * s * (span / 2 - 4), y + 12.4, (pl[2] + pr[2]) / 2 + uz * s * (span / 2 - 4)), '#2a2a30'));
  const banner = textTexture('RUSTLINE DOCKS', '#ffb000', '#3a1a10');
  const bw = span - 6;
  const bh = Math.min(3, (bw * banner.image.height) / banner.image.width);
  const bannerMesh = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh).rotateY(Math.atan2(-uz, ux)).translate((pl[0] + pr[0]) / 2, y + 11.2 - bh / 2 + 1.5, (pl[2] + pr[2]) / 2), glowMaterial({ map: banner, intensity: 1.6, side: THREE.DoubleSide }));
  group.add(bannerMesh);

  // Dock Rats on container tops: the first two clear spots near the start.
  const CREW = ['#ff7a1a', '#e0b020', '#d8d0c0', '#c83a2a'];
  const CONTAINERS = ['#b83a2a', '#2a6ab8', '#3a8a4a'];
  const spots = [];
  for (let s = 0; s <= 80 && spots.length < 2; s += 6) {
    for (const side of [-1, 1]) {
      if (spots.length >= 2 || spots.some((q) => q.side === side && Math.abs(q.s - s) < 16)) continue;
      const pts = [];
      for (const ds of [-6.3, 0, 6.3]) for (const lat of [W + 0.3, W + 2.8]) pts.push(at(track.indexAtDistance(Math.max(0, s + ds)), side * lat));
      if (pts.every(([x, , z]) => clear(x, z))) spots.push({ s, side });
    }
  }
  // A figure standing at (px, top, pz), facing yaw.
  const figure = (px, top, pz, yaw, color) => {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    painted.push(
      tinted(new THREE.BoxGeometry(0.42, 0.85, 0.25).rotateY(yaw).translate(px, top + 0.43, pz), '#2a2a34'),
      tinted(new THREE.BoxGeometry(0.5, 0.7, 0.3).rotateY(yaw).translate(px, top + 1.2, pz), color),
      tinted(new THREE.BoxGeometry(0.28, 0.3, 0.28).rotateY(yaw).translate(px, top + 1.72, pz), '#c89a78'),
      tinted(new THREE.BoxGeometry(0.14, 0.62, 0.14).translate(px + fz * 0.3, top + 1.85, pz - fx * 0.3), color),
    );
  };
  // On the nearest closures (within 250 m of the start line).
  const [sx, , sz] = at(0, 0);
  const near = (tops || []).map((t) => ({ ...t, d: Math.hypot(t.c.x - sx, t.c.z - sz) })).filter((t) => t.d < 250).sort((p, q) => p.d - q.d).slice(0, 2);
  near.forEach(({ c, y: top }, k) => {
    [-9, -4, 3.5, 8].forEach((lx, q) => {
      const px = c.x + lx * Math.cos(c.yaw);
      const pz = c.z - lx * Math.sin(c.yaw);
      figure(px, top, pz, c.yaw + Math.PI / 2, CREW[(k * 4 + q) % CREW.length]);
    });
  });
  spots.forEach(({ s, side }, k) => {
    const a = at(track.indexAtDistance(Math.max(0, s - 1)), side * (W + 1.55));
    const b = at(track.indexAtDistance(s + 1), side * (W + 1.55));
    const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
    const [x, cy, z] = at(track.indexAtDistance(s), side * (W + 1.55));
    painted.push(tinted(new THREE.BoxGeometry(2.44, 2.6, 12.2).rotateY(yaw).translate(x, cy + 1.3, z), CONTAINERS[k % CONTAINERS.length]));
    [-3.5, -0.5, 2.5].forEach((along, q) => {
      figure(x + Math.sin(yaw) * along, cy + 2.6, z + Math.cos(yaw) * along, yaw + (side * Math.PI) / 2, CREW[(k * 3 + q + 2) % CREW.length]);
    });
  });
  group.add(new THREE.Mesh(mergeGeometries(yellow), litMaterial({ color: '#e0b020' })));
  group.add(new THREE.Mesh(mergeGeometries(painted), litMaterial({ map: tex.container, vertexColors: true })));
  return group;
}

// Closed side streets in a plan district: stretch limos parked nose to tail
// across them (tour buses across the wide ones), lit so they read from far off.
function limoClosures(closures) {
  const body = [];
  const glass = [];
  const lit = [];
  for (const c of closures) {
    const len = c.bus ? 12.4 : 7.2;
    const n = Math.max(1, Math.ceil(c.width / len));
    const across = Math.cos(c.yaw);
    const acrossZ = -Math.sin(c.yaw);
    for (let q = 0; q < n; q++) {
      const off = -c.width / 2 + (c.width * (q + 0.5)) / n;
      const x = c.x + across * off;
      const z = c.z + acrossZ * off;
      const yaw = c.yaw + Math.PI / 2;
      if (c.bus) {
        body.push(new THREE.BoxGeometry(2.6, 3, 12).rotateY(yaw).translate(x, c.y + 1.9, z));
        glass.push(new THREE.BoxGeometry(2.64, 0.9, 10.4).rotateY(yaw).translate(x, c.y + 2.5, z));
        lit.push(new THREE.BoxGeometry(2.66, 0.1, 11.6).rotateY(yaw).translate(x, c.y + 1.7, z));
      } else {
        body.push(new THREE.BoxGeometry(2, 1, 6.8).rotateY(yaw).translate(x, c.y + 0.75, z));
        glass.push(new THREE.BoxGeometry(1.8, 0.5, 4.8).rotateY(yaw).translate(x, c.y + 1.5, z));
        lit.push(new THREE.BoxGeometry(2.05, 0.12, 6.9).rotateY(yaw).translate(x, c.y + 0.5, z));
      }
    }
  }
  const group = new THREE.Group();
  if (!body.length) return group;
  group.add(new THREE.Mesh(mergeGeometries(body), litMaterial({ color: '#15121c' })));
  group.add(new THREE.Mesh(mergeGeometries(glass), litMaterial({ color: '#2a2440' })));
  group.add(new THREE.Mesh(mergeGeometries(lit), glowMaterial({ color: '#ff5ab8', intensity: 2.2 })));
  return group;
}

// A spectator standing at (px, top, pz) facing yaw, in the given colour.
function figure(list, tinted, px, top, pz, yaw, color, skin = '#c89a78') {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  list.push(
    tinted(new THREE.BoxGeometry(0.42, 0.85, 0.25).rotateY(yaw).translate(px, top + 0.43, pz), '#2a2a34'),
    tinted(new THREE.BoxGeometry(0.5, 0.7, 0.3).rotateY(yaw).translate(px, top + 1.2, pz), color),
    tinted(new THREE.BoxGeometry(0.28, 0.3, 0.28).rotateY(yaw).translate(px, top + 1.72, pz), skin),
    tinted(new THREE.BoxGeometry(0.14, 0.62, 0.14).translate(px + fz * 0.3, top + 1.85, pz - fx * 0.3), color),
  );
}

// The Neon Strip's start: sweeping searchlights, a banner on the nearest arch
// over the Strip (or a truss over the road, away from the Strip), and Glow
// Syndicate crews standing on the limos nearest the start.
function stripDressing(track, tex, at, opts, tops) {
  const group = new THREE.Group();
  const W = track.localWall ? track.localWall(0) : track.wallDist;
  const painted = [];
  const tinted = (g, color) => {
    const c = new THREE.Color(color);
    const cols = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < cols.length; k += 3) cols.set([c.r, c.g, c.b], k);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return g;
  };
  const [sx, sy, sz] = at(0, 0);
  // The banner: on the nearest arch if there's one close to the start line.
  const arch = (opts.arches || []).map((a) => ({ ...a, d: Math.hypot(a.x - sx, a.z - sz) })).sort((p, q) => p.d - q.d)[0];
  const banner = textTexture('NEON STRIP', '#ff2a6d', '#140820');
  let bx;
  let by;
  let bz;
  let rx;
  let rz;
  let bw;
  if (arch && arch.d < 150) {
    [bx, by, bz, rx, rz, bw] = [arch.x, arch.y + 11.4, arch.z, -arch.dz, arch.dx, Math.min(24, arch.span - 8)];
  } else {
    const i = track.indexAtDistance(24);
    const [px, py, pz] = at(i, 0);
    [bx, by, bz, rx, rz, bw] = [px, py + 10, pz, track.rx[i], track.rz[i], 2 * W - 6];
    const truss = [];
    for (const s of [-1, 1]) truss.push(new THREE.BoxGeometry(0.7, 12, 0.7).translate(px + rx * s * (W + 0.6), py + 6, pz + rz * s * (W + 0.6)));
    truss.push(new THREE.BoxGeometry(0.9, 0.9, 2 * W + 2).rotateY(Math.atan2(rx, rz)).translate(px, py + 12, pz));
    group.add(new THREE.Mesh(mergeGeometries(truss), litMaterial({ color: '#2b2445' })));
  }
  const bh = Math.min(3, (bw * banner.image.height) / banner.image.width);
  group.add(new THREE.Mesh(new THREE.PlaneGeometry(bw, bh).rotateY(Math.atan2(-rz, rx)).translate(bx, by - bh / 2, bz), glowMaterial({ map: banner, intensity: 1.8, side: THREE.DoubleSide })));
  // Crews on the limo roofs nearest the start.
  const CREW = ['#ff2a6d', '#b04dff', '#f0f0ff', '#05d9e8'];
  tops
    .map((t) => ({ ...t, d: Math.hypot(t.c.x - sx, t.c.z - sz) }))
    .filter((t) => t.d < 250)
    .sort((p, q) => p.d - q.d)
    .slice(0, 3)
    .forEach(({ c, y }, k) => {
      for (let q = 0; q < 4; q++) {
        const off = -c.width / 2 + ((q + 0.5) * c.width) / 4;
        figure(painted, tinted, c.x + Math.cos(c.yaw) * off, y, c.z - Math.sin(c.yaw) * off, c.yaw + Math.PI, CREW[(k + q) % CREW.length]);
      }
    });
  // More of them on the steps of the nearest hotel or casino.
  const front = (opts.fronts || []).map((q) => ({ ...q, d: Math.hypot(q.x - sx, q.z - sz) })).filter((q) => q.d < 160).sort((p, q) => p.d - q.d)[0];
  if (front) {
    for (let q = 0; q < 6; q++) {
      const a = -front.w * 0.3 + (q * front.w * 0.6) / 5;
      figure(painted, tinted, front.x + front.fz * a + front.fx * 1.6, front.y, front.z - front.fx * a + front.fz * 1.6, Math.atan2(front.fx, front.fz), CREW[q % CREW.length]);
    }
  }
  // A drag: crowds along the barriers, and the start lights hung from the arch.
  if (opts.drag) {
    const clear = opts.clear || (() => true);
    const Lg = Math.min(track.length, (track.finishS ?? track.length) + 20);
    for (let s = 0, k = 0; s < Lg; s += 2.2, k++) {
      const i = track.indexAtDistance(s);
      for (const side of [-1, 1]) {
        if ((k + (side > 0 ? 3 : 0)) % 5 === 4) continue;
        const [x, y, z] = at(i, side * (track.localWall(track.s[i]) + 1.2 + (k % 2) * 1.1));
        if (!clear(x, z)) continue;
        figure(painted, tinted, x, y, z, Math.atan2(-track.rx[i] * side, -track.rz[i] * side), CREW[(k + (side > 0 ? 1 : 0)) % CREW.length]);
      }
    }
    if (arch && arch.d < 40) {
      const lamps = [];
      const bulbs = [['#ff2020', 0], ['#ffb000', 1], ['#ffb000', 2], ['#20ff60', 3]];
      for (const [color, q] of bulbs) {
        for (const s of [-1, 1]) lamps.push({ color, x: arch.x - arch.dz * s * 1.2, y: arch.y + 7.3 - q * 0.9, z: arch.z + arch.dx * s * 1.2 });
      }
      const housing = [new THREE.BoxGeometry(3.4, 4, 0.8).translate(arch.x, arch.y + 6, arch.z)];
      group.add(new THREE.Mesh(mergeGeometries(housing), litMaterial({ color: '#15121c' })));
      for (const l of lamps) group.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 1).rotateY(Math.atan2(arch.dx, arch.dz)).translate(l.x, l.y, l.z), glowMaterial({ color: l.color, intensity: 2.6 })));
    }
  }
  if (painted.length) group.add(new THREE.Mesh(mergeGeometries(painted), litMaterial({ vertexColors: true })));
  // Searchlights either side of the start, sweeping the sky.
  const beams = [];
  const beamGeo = new THREE.CylinderGeometry(3.5, 0.4, 140, 10, 1, true).translate(0, 70, 0);
  const beamMat = additiveMaterial({ map: tex.glow, color: '#d8e0ff', opacity: 0.16 });
  for (const [k, side] of [[0, -1], [1, 1], [2, -1], [3, 1]]) {
    const i = track.indexAtDistance(10 + k * 18);
    const [x, y, z] = at(i, side * (W + 5));
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), litMaterial({ color: '#2b2445' }));
    base.position.set(x, y + 0.6, z);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(x, y + 1.2, z);
    beam.renderOrder = 2;
    group.add(base, beam);
    beams.push({ beam, k });
  }
  group.userData.animate = (t, real = t) => {
    for (const { beam, k } of beams) {
      beam.rotation.set(0.35 + 0.15 * Math.sin(real * 0.7 + k), real * (0.4 + k * 0.07) + k * 1.6, 0.25 * Math.sin(real * 0.5 + k * 2), 'YXZ');
    }
  };
  group.userData.animate(0);
  return group;
}

// A point on the road at sample i, lateral metres off the centreline (pulled in
// to the walls of a narrow section).
const pointAt = (track) => (i, lateral, dy = 0) => {
  const lw = track.narrows || track.sections ? track.localWall(track.s[i]) : track.wallDist;
  const l = lw < track.wallDist ? Math.sign(lateral) * Math.min(Math.abs(lateral), lw) : lateral;
  return [track.x[i] + track.rx[i] * l, track.y[i] + dy, track.z[i] + track.rz[i] * l];
};

// One road: surface, curbs, shoulders, barriers (with optional gaps), skirts
// down to the ground, and chevrons on its jump kickers.
function buildRoad(group, track, mats, groundY, { lift = 0, wallSkip = null, roadMat = null } = {}) {
  const hw = track.halfWidth;
  const curbOuter = hw + track.curbWidth;
  const wall = track.wallDist;
  const at = pointAt(track);
  // The road, kerb and wall where each sample is (streets differ in width).
  const varied = !!(track.sections || track.narrows);
  const hwAt = (i) => (varied ? track.localHalf(track.s[i]) : hw);
  const wallAt = (i) => (varied ? track.localWall(track.s[i]) : wall);
  const curbAt = (i) => Math.min(hwAt(i) + track.curbWidth, wallAt(i));
  const add = (geometry, material) => group.add(new THREE.Mesh(geometry, material));

  // Nothing is drawn over a gap between rooftops.
  const gaps = track.gaps || [];
  const inGap = gaps.length ? (i) => gaps.some((g) => track.s[i] > g.s0 && track.s[i] < g.s1) : null;
  add(ribbon(track, (i) => at(i, -hwAt(i), lift), (i) => at(i, hwAt(i), lift), { vLength: 16, skip: inGap }), roadMat || mats.road);
  add(ribbon(track, (i) => at(i, -curbAt(i), lift), (i) => at(i, -hwAt(i), lift), { vLength: 3, skip: inGap }), mats.curb);
  add(ribbon(track, (i) => at(i, hwAt(i), lift), (i) => at(i, curbAt(i), lift), { vLength: 3, skip: inGap }), mats.curb);
  const shoulderU = (wall - curbOuter) / 4;
  add(ribbon(track, (i) => at(i, -wallAt(i), lift), (i) => at(i, -curbAt(i), lift), { vLength: 4, uB: shoulderU, skip: inGap }), mats.shoulder);
  add(ribbon(track, (i) => at(i, curbAt(i), lift), (i) => at(i, wallAt(i), lift), { vLength: 4, uB: shoulderU, skip: inGap }), mats.shoulder);

  for (const side of [-1, 1]) {
    const skipWall = wallSkip ? (i) => { const p = at(i, side * wallAt(i)); return wallSkip(p[0], p[2]); } : null;
    // No barriers inside a container tunnel: its walls are the barriers.
    const inTunnel = track.narrows ? (i) => track.narrows.some((n) => track.s[i] > n.s0 && track.s[i] < n.s1) : null;
    const skip = inGap || skipWall || inTunnel ? (i) => (inGap && inGap(i)) || (skipWall && skipWall(i)) || (inTunnel && inTunnel(i)) : null;
    add(ribbon(track, (i) => at(i, side * wallAt(i), BARRIER_HEIGHT), (i) => at(i, side * wallAt(i)), { vLength: 3.4, swapUV: true, skip }), mats.barrier);
    // LED strip along the top of the barriers (the Neon Strip).
    if (mats.led) add(ribbon(track, (i) => at(i, side * wallAt(i), BARRIER_HEIGHT + 0.02), (i) => at(i, side * (wallAt(i) - 0.25), BARRIER_HEIGHT + 0.02), { vLength: 3, skip }), mats.led[side > 0 ? 1 : 0]);
    add(
      ribbon(track, (i) => at(i, side * wallAt(i)), (i) => {
        const p = at(i, side * (wallAt(i) + 0.01));
        return [p[0], groundY, p[2]];
      }, { vLength: 4, skip }),
      mats.skirt,
    );
  }

  // Yellow chevrons on each kicker so jumps read from a distance.
  for (const j of [...(track.jumps || []).filter((jj) => !jj.bump), ...gaps.flatMap((g) => [{ s: g.s0 - g.len, len: g.len }, { s: g.s1, len: g.len }])]) {
    const i0 = track.indexAtDistance(j.s);
    const i1 = track.indexAtDistance(j.s + j.len);
    const skip = (i) => (i0 <= i1 ? i < i0 || i > i1 : i < i0 && i > i1);
    add(ribbon(track, (i) => at(i, -hwAt(i) + 0.5, lift + 0.04), (i) => at(i, hwAt(i) - 0.5, lift + 0.04), { vLength: 3.4, swapUV: true, skip }), mats.chevron);
  }
}

// A strip of quads following the track. pointA/pointB give the two edge points
// for sample i; u runs A->B and v runs along the track. skip(i) leaves out the
// quads touching sample i.
function ribbon(track, pointA, pointB, { uA = 0, uB = 1, vLength = 8, swapUV = false, skip = null } = {}) {
  const n = track.count;
  const rows = track.closed ? n + 1 : n;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let r = 0; r < rows; r++) {
    const i = r % n;
    const v = (r * track.step) / vLength;
    positions.push(...pointA(i), ...pointB(i));
    if (swapUV) uvs.push(v, 1 - uA, v, 1 - uB);
    else uvs.push(uA, v, uB, v);
    if (r > 0 && !(skip && (skip(i) || skip((r - 1) % n)))) {
      const a = (r - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function buildStartLine(track, tex, at, i0 = 0) {
  const i1 = track.wrap(i0 + 1);
  const group = new THREE.Group();
  const hw = track.localHalf ? track.localHalf(track.s[i0]) : track.halfWidth;

  const positions = [...at(i0, -hw, 0.03), ...at(i0, hw, 0.03), ...at(i1, -hw, 0.03), ...at(i1, hw, 0.03)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, (hw * 2) / 8, 0, 0, 1, (hw * 2) / 8, 1], 2));
  g.setIndex([0, 1, 2, 1, 3, 2]);
  g.computeVertexNormals();
  tex.checker.repeat.set(1, 1);
  group.add(new THREE.Mesh(g, litMaterial({ map: tex.checker, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })));

  // Gantry over the line with the game's name in neon.
  const span = (track.localWall ? track.localWall(track.s[i0]) : track.wallDist) + 0.6;
  const height = 7.5;
  const frameMat = litMaterial({ color: '#2b2445' });
  const parts = [];
  for (const side of [-1, 1]) {
    const pillar = new THREE.BoxGeometry(0.8, height, 0.8);
    pillar.translate(side * span, height / 2 - 0.5, 0);
    parts.push(pillar);
  }
  const beam = new THREE.BoxGeometry(span * 2 + 0.8, 1.6, 0.8);
  beam.translate(0, height, 0);
  parts.push(beam);
  const frame = new THREE.Mesh(mergeGeometries(parts), frameMat);

  const rect = tex.signs.rects[0];
  const signH = 1.3;
  const sign = new THREE.PlaneGeometry(signH * rect.aspect, signH);
  setUvRect(sign, rect);
  const signMesh = new THREE.Mesh(sign, glowMaterial({ map: tex.signs.texture, intensity: 2.4, side: THREE.DoubleSide }));
  signMesh.position.set(0, height, 0.45);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 0.8, 0.12, 0.9), glowMaterial({ color: PALETTE.cyan, intensity: 2.5 }));
  strip.position.set(0, height - 0.86, 0);

  const gantry = new THREE.Group();
  gantry.add(frame, signMesh, strip);
  gantry.position.set(track.x[i0], track.y[i0], track.z[i0]);
  // Face the sign toward cars approaching the line (they travel along +tangent).
  gantry.lookAt(track.x[i0] - track.tx[i0], track.y[i0], track.z[i0] - track.tz[i0]);
  group.add(gantry);
  return group;
}

// A district's street surface (shared with districtView): its road texture
// tinted to the district, or a concrete deck up on the rooftops.
export function streetRoadMaterial(tex, look = {}) {
  if (look.roof) return litMaterial({ map: tex.lot, color: look.roof, side: THREE.DoubleSide });
  return standardMaterial({
    map: tex.road, roughnessMap: tex.roadRough ?? null, roughness: tex.roadRough ? 1 : 0.45, metalness: 0,
    color: look.road || '#ffffff', envMap: tex.env, envMapIntensity: look.roadGloss ?? 0.5, side: THREE.DoubleSide,
  });
}

// Shortcut surfaces: dirt through construction sites, tiles across plazas,
// painted tarmac through car parks, plain road down side streets and alleys.
function branchMaterial(kind, tex, mats) {
  if ((kind === 'construction' || kind === 'railyard') && tex.dirt) return litMaterial({ map: tex.dirt, side: THREE.DoubleSide });
  if ((kind === 'plaza' || kind === 'park' || kind === 'quad' || kind === 'market') && tex.tiles) return litMaterial({ map: tex.tiles, side: THREE.DoubleSide });
  if (kind === 'parking' && tex.parking) return litMaterial({ map: tex.parking, side: THREE.DoubleSide });
  return mats.road;
}

// Flashing amber beacons either side of a shortcut's entrance and exit.
function beacons(track) {
  const geos = [];
  const at = pointAt(track);
  for (const i of [Math.min(4, track.count - 1), Math.max(0, track.count - 5)]) {
    for (const side of [-1, 1]) {
      const p = at(i, side * (track.halfWidth + 1.2), 0);
      geos.push(new THREE.BoxGeometry(0.2, 1.4, 0.2).translate(p[0], p[1] + 0.7, p[2]));
      geos.push(new THREE.BoxGeometry(0.45, 0.35, 0.45).translate(p[0], p[1] + 1.55, p[2]));
    }
  }
  return new THREE.Mesh(mergeGeometries(geos), glowMaterial({ color: '#ffb000', intensity: 3 }));
}

// Wet patches: irregular shapes scattered at random - lots of small ones, a
// few big ones, some in clusters - each following the road surface.
function buildPuddles(track, tex, lift) {
  const rng = makeRng(Math.round(track.length * 97 + track.x[0] * 13));
  const pos = [];
  const uv = [];
  const idx = [];
  const hw = track.halfWidth - 0.6;
  const count = Math.round((track.length / 18) * (0.6 + rng() * 0.8));
  let s = rng() * 20;
  for (let k = 0; k < count; k++) {
    s += rng() < 0.3 ? rng() * 6 : 4 + rng() * 60; // sometimes clustered
    if (s > track.length) s -= track.length;
    const i = track.indexAtDistance(s);
    const big = rng() < 0.12;
    const len = big ? 8 + rng() * 10 : 1.2 + Math.pow(rng(), 2) * 6;
    const wid = len * (0.25 + rng() * 0.6);
    const lat = (rng() * 2 - 1) * Math.max(0, hw - wid / 2);
    const cx = track.x[i] + track.rx[i] * lat;
    const cz = track.z[i] + track.rz[i] * lat;
    const yaw = Math.atan2(track.tx[i], track.tz[i]) + (rng() - 0.5) * 1.2;
    const q = Math.floor(rng() * 4);
    const u0 = (q % 2) * 0.5;
    const v0 = Math.floor(q / 2) * 0.5;
    const flip = rng() < 0.5;
    const base = pos.length / 3;
    for (const [a, b, u, v] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      const lx = (a * wid) / 2;
      const lz = (b * len) / 2;
      const x = cx + lx * Math.cos(yaw) + lz * Math.sin(yaw);
      const z = cz - lx * Math.sin(yaw) + lz * Math.cos(yaw);
      pos.push(x, track.queryMain(x, z, i).height + lift + 0.035, z);
      uv.push(u0 + (flip ? 1 - u : u) * 0.5, v0 + v * 0.5);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = standardMaterial({
    color: '#05050a', roughness: 0.1, metalness: 0.3, envMap: tex.env, envMapIntensity: 0.55,
    alphaMap: tex.puddles, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 1;
  return m;
}

export function setUvRect(geometry, rect) {
  const uv = geometry.attributes.uv;
  for (let k = 0; k < uv.count; k++) {
    uv.setXY(k, rect.u0 + uv.getX(k) * (rect.u1 - rect.u0), rect.v0 + uv.getY(k) * (rect.v1 - rect.v0));
  }
  uv.needsUpdate = true;
}

function buildLamps(track, tex, at) {
  const poles = [];
  const heads = [];
  const pools = [];
  const every = Math.max(1, Math.round(LAMP_SPACING / track.step));
  let side = 1;
  for (let i = 0; i < track.count; i += every) {
    side = -side;
    const yaw = Math.atan2(track.rx[i], track.rz[i]); // local +Z points across the road
    const base = at(i, side * (track.wallDist + 0.5));
    const pole = new THREE.BoxGeometry(0.25, 6.5, 0.25);
    pole.translate(0, 3.25, 0);
    const arm = new THREE.BoxGeometry(0.2, 0.2, 2.6);
    arm.translate(0, 6.4, -side * 1.3);
    const head = new THREE.BoxGeometry(0.5, 0.18, 0.9);
    head.translate(0, 6.25, -side * 2.4);
    for (const g of [pole, arm, head]) {
      g.rotateY(yaw);
      g.translate(base[0], base[1], base[2]);
    }
    poles.push(pole, arm);
    heads.push(head);

    const poolPos = at(i, side * (track.wallDist - 2.9), 0.04);
    const pool = new THREE.PlaneGeometry(11, 11);
    pool.rotateX(-Math.PI / 2);
    pool.translate(poolPos[0], poolPos[1], poolPos[2]);
    pools.push(pool);
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(mergeGeometries(poles), litMaterial({ color: '#2b2445' })));
  group.add(new THREE.Mesh(mergeGeometries(heads), glowMaterial({ color: '#ffd9a0', intensity: 3 })));
  const poolMesh = new THREE.Mesh(mergeGeometries(pools), additiveMaterial({ map: tex.glow, color: '#b86a2a', opacity: 0.55 }));
  poolMesh.renderOrder = 1;
  group.add(poolMesh);
  return group;
}
