import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial, standardMaterial, glowMaterial, additiveMaterial } from './retroMaterial.js';
import { PALETTE, makeRng, textTexture } from './textures.js';
import { lockdownAt } from '../sim/lockdown.js';
import { districtLayout } from '../sim/cityLayout.js';
import { SIM_DT } from '../config.js';
import * as G from '../sim/geom2d.js';
import { onFoot, END_RUN } from '../sim/track.js';

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

  // The barriers' look, if the event picks one (the T&T SDK: events.js BARRIER_STYLES).
  if (opts.barrierStyle === 'concrete') mats.barrier = litMaterial({ map: tex.wallConcrete || tex.wall, ...doubleSided });
  else if (opts.barrierStyle === 'chevrons') mats.barrier = litMaterial({ map: tex.wall, ...doubleSided });
  else if (opts.barrierStyle === 'steel') mats.barrier = litMaterial({ color: '#8a909c', ...doubleSided });

  // Where a shortcut meets the main road, neither road gets a wall in the way.
  const branches = track.branches || [];
  const inBranch = (x, z) => branches.some(({ track: b }) => {
    const g = b.queryMain(x, z, -1);
    return g.overrun < 1 && Math.abs(g.lateral) < b.wallDist + 1.5;
  });
  const inMain = (x, z) => Math.abs(track.queryMain(x, z, -1).lateral) < track.wallDist - 0.5;

  // A suburb's route is its own streets and lawns: no road laid over them, no
  // barriers (the property lines are the walls).
  // (The same on the rooftops: the decks, bridges and kickers are the district's.)
  // (And in the Undercity: its streets, cuts, tunnel and drain are the road.)
  const suburb = !!opts.look?.suburb || opts.look?.closures === 'transporters' || !!opts.look?.under || !!opts.look?.spire;
  if (!suburb) buildRoad(group, track, mats, groundY, { wallSkip: branches.length ? inBranch : null });
  group.add(endPens(track, mats.barrier));
  for (const br of branches) {
    if (!suburb) buildRoad(group, br.track, mats, groundY, { lift: 0.03, wallSkip: inMain, roadMat: branchMaterial(br.kind, tex, mats) });
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
    const watch = opts.look?.closures === 'watch';
    const wrecks = opts.look?.closures === 'wrecks';
    const suvs = opts.look?.closures === 'suvs';
    for (const [k, c] of (track.closures || []).entries()) {
      if (limos || watch || wrecks || suvs) {
        tops.push({ c, y: c.y + (wrecks ? 1.5 : c.bus ? 3.4 : 1.5), bus: c.bus });
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
    if (watch) group.add(watchCars(track.closures || [], track.watchCars || [], tex));
    if (wrecks) group.add(wreckClosures(track.closures || []));
    if (suvs) group.add(suvClosures(track.closures || []));
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
    if (opts.look?.startDressing === 'maple') {
      const dressing = mapleDressing(track, tex, at, opts);
      group.add(dressing);
      group.userData.animate = dressing.userData.animate;
    }
    if (opts.look?.startDressing === 'under') {
      const dressing = underDressing(track, tex, at, opts, tops);
      group.add(dressing);
      group.userData.animate = dressing.userData.animate;
    }
    if (opts.look?.startDressing === 'spire') {
      const dressing = spireDressing(track, tex, at, opts, tops);
      group.add(dressing);
      group.userData.animate = dressing.userData.animate;
    }
    if (opts.look?.startDressing === 'strip') {
      const dressing = stripDressing(track, tex, at, opts, tops);
      group.add(dressing);
      group.userData.animate = dressing.userData.animate;
    }
  }
  // The rooftops: Kessler car transporters across the links the route doesn't use; the start.
  if (opts.city && opts.look?.closures === 'transporters') {
    group.add(transporterClosures(track.closures || []));
    const dressing = chromeDressing(track, tex, at, opts);
    group.add(dressing);
    group.userData.animate = dressing.userData.animate;
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

// The Corporate Spire's closed streets: Syncorp security's black armoured SUVs
// nose to tail across them, behind a row of raised steel bollards.
function suvClosures(closures) {
  const body = [];
  const glass = [];
  const steel = [];
  const lit = [];
  for (const c of closures) {
    const across = [Math.cos(c.yaw), -Math.sin(c.yaw)];
    const back = [Math.sin(c.yaw), Math.cos(c.yaw)];
    const k = Math.max(1, Math.ceil(c.width / 5.4));
    for (let q = 0; q < k; q++) {
      const off = -c.width / 2 + (c.width * (q + 0.5)) / k;
      const x = c.x + across[0] * off + back[0] * 1.5;
      const z = c.z + across[1] * off + back[1] * 1.5;
      const yaw = c.yaw + Math.PI / 2;
      body.push(new THREE.BoxGeometry(2.1, 1.3, 5.1).rotateY(yaw).translate(x, c.y + 1.05, z));
      glass.push(new THREE.BoxGeometry(1.95, 0.55, 3).rotateY(yaw).translate(x, c.y + 1.95, z));
      lit.push(new THREE.BoxGeometry(2.14, 0.08, 5.14).rotateY(yaw).translate(x, c.y + 0.75, z));
    }
    for (let t = -c.width / 2; t <= c.width / 2; t += 1.4) steel.push(new THREE.CylinderGeometry(0.14, 0.14, 1, 8).translate(c.x + across[0] * t - back[0] * 1.4, c.y + 0.5, c.z + across[1] * t - back[1] * 1.4));
  }
  const group = new THREE.Group();
  if (!body.length) return group;
  group.add(new THREE.Mesh(mergeGeometries(body), litMaterial({ color: '#0e0e12' })));
  group.add(new THREE.Mesh(mergeGeometries(glass), litMaterial({ color: '#1a1a24' })));
  group.add(new THREE.Mesh(mergeGeometries(steel), litMaterial({ color: '#8a8a94' })));
  group.add(new THREE.Mesh(mergeGeometries(lit), glowMaterial({ color: '#ffc850', intensity: 2 })));
  return group;
}

// The Corporate Spire's race: its edges (a building's frontage behind the
// lot line; gold-trimmed concrete barriers where there's none; steel bollards
// where the wall crosses open road), temporary grandstands and Syncorp's
// banners on the lamp posts by the start, press drones over the grid,
// fireworks off the Spire for the championship, and the lockdown's bollards
// and amber lights at every junction it can close.
function spireDressing(track, tex, at, opts, tops) {
  const group = new THREE.Group();
  const map = opts.planMap;
  const items = map ? districtLayout(map).items : [];
  const barrier = [];
  const cap = [];
  const posts = [];
  const painted = [];
  const tinted = (g, color) => {
    const c = new THREE.Color(color);
    const cols = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < cols.length; k += 3) cols.set([c.r, c.g, c.b], k);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return g;
  };
  const medians = items.filter((it) => it.t === 'median');
  const onMedian = (x, z) => medians.some((m) => {
    const o = m.obb;
    const dx = Math.sin(o.yaw);
    const dz = Math.cos(o.yaw);
    const u = (x - o.x) * dz - (z - o.z) * dx;
    const v = (x - o.x) * dx + (z - o.z) * dz;
    return Math.abs(u) < o.hw + 0.4 && Math.abs(v) < o.hd + 0.4;
  });
  const onRoad = (x, z) => !!map && map.streets.some((st) => G.nearestOnLine(st.pts, x, z).d < st.half - 0.3) && !onMedian(x, z);
  const clear = opts.clear || (() => true);
  // The edges, both sides, every 3 m.
  const W = (s) => (track.localWall ? track.localWall(s) : track.wallDist);
  for (const side of [-1, 1]) {
    let run = null;
    const flush = (s1) => {
      if (!run) return;
      const a = at(track.indexAtDistance(run.s0), side * (run.w + 0.35));
      const b = at(track.indexAtDistance(s1), side * (run.w + 0.35));
      const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
      if (L > 1) {
        const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
        const y = Math.min(a[1], b[1]);
        barrier.push(new THREE.BoxGeometry(0.6, 1.1, L + 0.3).rotateY(yaw).translate((a[0] + b[0]) / 2, y + 0.55, (a[2] + b[2]) / 2));
        cap.push(new THREE.BoxGeometry(0.64, 0.1, L + 0.3).rotateY(yaw).translate((a[0] + b[0]) / 2, y + 1.12, (a[2] + b[2]) / 2));
      }
      run = null;
    };
    const end = track.closed ? track.length : track.length - 1;
    for (let s = 0; s <= end; s += 3) {
      const w = W(s);
      const i = track.indexAtDistance(s);
      const [x, y, z] = at(i, side * (w + 0.3));
      const road = onRoad(x, z);
      const far = at(i, side * (w + 12));
      const fronted = !clear(far[0], far[2]) || !clear(...(([p, , q]) => [p, q])(at(i, side * (w + 20))));
      const median = onMedian(x, z);
      if (road) for (let q = 0; q < 2; q++) posts.push(new THREE.CylinderGeometry(0.13, 0.13, 1, 8).translate(...(([p, py, pz]) => [p, py + 0.5, pz])(at(track.indexAtDistance(s + q * 1.5), side * (w + 0.3)))));
      if (road || median || fronted || (run && Math.abs(run.w - w) > 0.5)) flush(s);
      if (!road && !median && !fronted && !run) run = { s0: s, w };
      if (s + 3 > end) flush(s);
    }
  }
  const M = (list, mat) => list.length && group.add(new THREE.Mesh(mergeGeometries(list), mat));
  M(barrier, litMaterial({ map: tex.wallConcrete || tex.wall, color: '#f0e8d8' }));
  M(cap, glowMaterial({ color: '#ffc850', intensity: 1.6 }));
  M(posts, litMaterial({ color: '#9a9aa4' }));

  // Grandstands behind the wall near the start (by the finish for a drag, on the Circus).
  const stands = [];
  const standAt = opts.drag ? (track.finishS ?? track.length - 60) : 40;
  for (const side of [-1, 1]) {
    const s = standAt + side * 6;
    const w = W(s);
    const c = at(track.indexAtDistance(s), side * (w + 7));
    if (!clear(c[0], c[2])) continue;
    const a = at(track.indexAtDistance(s - 1), 0);
    const b = at(track.indexAtDistance(s + 1), 0);
    const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
    for (let r = 0; r < 6; r++) {
      const lat = w + 3 + r * 1.2;
      const [x, y, z] = at(track.indexAtDistance(s), side * lat);
      stands.push(tinted(new THREE.BoxGeometry(1.2, 0.5 + r * 0.6, 30).rotateY(yaw).translate(x, y + (0.5 + r * 0.6) / 2, z), r % 2 ? '#1a1a20' : '#2a2a30'));
      for (let q = -13; q <= 13; q += 1.6) {
        const col = ['#1a1a20', '#ffc850', '#e8e2d8', '#2a3a5a'][(r * 7 + Math.round(q * 3)) % 4];
        painted.push(tinted(new THREE.BoxGeometry(0.45, 0.9, 0.35).rotateY(yaw).translate(x + Math.sin(yaw) * q, y + 0.5 + r * 0.6 + 0.45, z + Math.cos(yaw) * q), col));
      }
    }
    stands.push(tinted(new THREE.BoxGeometry(0.3, 2.2, 30).rotateY(yaw).translate(...(([x, y, z]) => [x, y + 5.6, z])(at(track.indexAtDistance(s), side * (w + 10.5)))), '#ffc850'));
  }
  M(stands, litMaterial({ vertexColors: true }));
  M(painted, litMaterial({ vertexColors: true }));

  // Syncorp's banners on the lamp posts within 200 m of the start.
  const [sx, , sz] = at(0, 0);
  const banners = [];
  for (const it of items) {
    if (it.t !== 'lamp' || Math.hypot(it.x - sx, it.z - sz) > 200) continue;
    const [tx, tz] = it.toward || [0, 1];
    const y = it.y + (it.h || 7);
    banners.push(new THREE.PlaneGeometry(1.1, 2.6).rotateY(Math.atan2(tz, -tx)).translate(it.x - tx * 0.6, y - 2.6, it.z - tz * 0.6));
  }
  if (banners.length) group.add(new THREE.Mesh(mergeGeometries(banners), litMaterial({ map: textTexture('SYNCORP', '#ffc850', '#101014'), side: THREE.DoubleSide })));

  // Press drones over the grid.
  const drones = [];
  for (let q = 0; q < 3; q++) {
    const d = new THREE.Group();
    d.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.8), litMaterial({ color: '#1a1a20' })));
    d.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15).translate(0, -0.2, 0.3), glowMaterial({ color: q === 1 ? '#ff3030' : '#ffffff', intensity: 3 })));
    const [x, y, z] = at(track.indexAtDistance(10 + q * 14), (q - 1) * 5);
    d.userData.base = [x, y + 7 + q, z, q];
    group.add(d);
    drones.push(d);
  }

  // Fireworks off the Spire, for the championship.
  const bursts = [];
  if (opts.fireworks) {
    const colors = ['#ffc850', '#ffffff', '#ff5040', '#60c0ff'];
    for (let q = 0; q < 6; q++) {
      const g = new THREE.SphereGeometry(1, 10, 8);
      const m = new THREE.Mesh(g, additiveMaterial({ map: tex.glow, color: colors[q % 4], opacity: 0.8 }));
      m.material.fog = false;
      m.userData.q = q;
      group.add(m);
      bursts.push(m);
    }
  }

  // The lockdown: bollards in the road at each junction it can close, lane by
  // lane (the open lane's stay down), and amber lights across the road.
  const L = track.lockdown;
  const sets = [];
  for (const j of L?.junctions || []) {
    const lanes = [...Array(j.lanes + 1)].map(() => []);
    const width = (2 * j.half) / j.lanes;
    for (let lat = -j.wall; lat <= j.wall; lat += 1.2) {
      const lane = Math.abs(lat) < j.half ? Math.min(j.lanes - 1, Math.floor((lat + j.half) / width)) : j.lanes;
      lanes[lane].push(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 8).translate(j.x + j.rx * lat, j.y + 0.55, j.z + j.rz * lat));
    }
    const meshes = lanes.map((list) => {
      if (!list.length) return null;
      const m = new THREE.Mesh(mergeGeometries(list), litMaterial({ color: '#c8c8d0' }));
      m.visible = false;
      group.add(m);
      return m;
    });
    const amber = [];
    for (const off of [-4, 4]) {
      const a = [j.x - j.rz * off, j.z + j.rx * off];
      amber.push(new THREE.BoxGeometry(0.4, 0.06, 2 * j.wall).rotateY(Math.atan2(j.rx, j.rz)).translate(a[0], j.y + 0.04, a[1]));
    }
    const light = new THREE.Mesh(mergeGeometries(amber), glowMaterial({ color: '#ffa020', intensity: 3.5 }));
    light.visible = false;
    group.add(light);
    sets.push({ j, meshes, light, width });
  }

  group.userData.animate = (t, real = t) => {
    for (const d of drones) {
      const [x, y, z, q] = d.userData.base;
      d.position.set(x + Math.sin(real * 0.7 + q) * 2, y + Math.sin(real * 1.9 + q * 2) * 0.4, z + Math.cos(real * 0.5 + q) * 2);
    }
    for (const m of bursts) {
      const q = m.userData.q;
      const phase = (real * 0.45 + q / bursts.length) % 1;
      const a = q * 2.4;
      m.position.set(Math.cos(a) * 30, 440 + (q % 3) * 25, Math.sin(a) * 30);
      m.scale.setScalar(4 + phase * 40);
      m.material.opacity = Math.max(0, 0.9 * (1 - phase));
    }
    const on = L ? lockdownAt(L, Math.round(t / SIM_DT)) : null;
    sets.forEach(({ meshes, light }, k) => {
      const here = on && on.k === k;
      light.visible = here && Math.floor(real * 4) % 2 === 0;
      const gapLane = here ? Math.round((on.gap + on.j.half) / (2 * on.gapHalf) - 0.5) : -1;
      meshes.forEach((m, lane) => {
        if (!m) return;
        m.visible = here && on.rise > 0 && lane !== gapLane;
        m.position.y = here ? -1.1 * (1 - on.rise) : 0;
      });
    });
  };
  return group;
}

// The Undercity's closed streets: burnt-out wrecks nose to tail across them,
// a burning oil drum at each end.
function wreckClosures(closures) {
  const body = [];
  const drums = [];
  const fire = [];
  const COLS = ['#4a2a1e', '#3a3432', '#5a3a24', '#2e2a2c', '#6a4a2a'];
  const tinted = (g, color) => {
    const c = new THREE.Color(color);
    const cols = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < cols.length; k += 3) cols.set([c.r, c.g, c.b], k);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return g;
  };
  let n = 0;
  for (const c of closures) {
    const k = Math.max(1, Math.ceil(c.width / 4.8));
    const across = [Math.cos(c.yaw), -Math.sin(c.yaw)];
    for (let q = 0; q < k; q++) {
      const off = -c.width / 2 + (c.width * (q + 0.5)) / k;
      const x = c.x + across[0] * off;
      const z = c.z + across[1] * off;
      const yaw = c.yaw + Math.PI / 2 + ((n % 3) - 1) * 0.15;
      body.push(tinted(new THREE.BoxGeometry(1.9, 0.9, 4.5).rotateY(yaw).translate(x, c.y + 0.55, z), COLS[n % COLS.length]));
      body.push(tinted(new THREE.BoxGeometry(1.7, 0.5, 2.2).rotateY(yaw).translate(x, c.y + 1.25, z), '#1e1a1a'));
      n++;
    }
    for (const s of [-1, 1]) {
      const x = c.x + across[0] * s * (c.width / 2 + 0.8);
      const z = c.z + across[1] * s * (c.width / 2 + 0.8);
      drums.push(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10).translate(x, c.y + 0.45, z));
      fire.push(new THREE.ConeGeometry(0.25, 0.8, 6).translate(x, c.y + 1.3, z));
    }
  }
  const group = new THREE.Group();
  if (!body.length) return group;
  group.add(new THREE.Mesh(mergeGeometries(body), litMaterial({ vertexColors: true })));
  group.add(new THREE.Mesh(mergeGeometries(drums), litMaterial({ color: '#5a3a28' })));
  group.add(new THREE.Mesh(mergeGeometries(fire), glowMaterial({ color: '#ff7a20', intensity: 3 })));
  return group;
}

// The Undercity's start: the Crew up on the wrecks nearest the line, road
// flares down both sides of the grid, their sound-system truck behind the
// wall. Along the route: burning drums marking the open floor's edges (its
// walls), guard rails where a road on a ledge drops away. A drag down the
// drain: the crowd along both tops, behind the fence.
function underDressing(track, tex, at, opts, tops) {
  const group = new THREE.Group();
  const painted = [];
  const steel = [];
  const drums = [];
  const fire = [];
  const flares = [];
  const glows = [];
  const tinted = (g, color) => {
    const c = new THREE.Color(color);
    const cols = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < cols.length; k += 3) cols.set([c.r, c.g, c.b], k);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return g;
  };
  const CREW = ['#39ff14', '#2a2a30', '#8a8a90', '#05d9e8', '#5a4a3a'];
  const figure = (px, top, pz, yaw, color) => {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    painted.push(
      tinted(new THREE.BoxGeometry(0.42, 0.85, 0.25).rotateY(yaw).translate(px, top + 0.43, pz), '#1e1e24'),
      tinted(new THREE.BoxGeometry(0.5, 0.7, 0.3).rotateY(yaw).translate(px, top + 1.2, pz), color),
      tinted(new THREE.BoxGeometry(0.28, 0.3, 0.28).rotateY(yaw).translate(px, top + 1.72, pz), '#b88a68'),
      tinted(new THREE.BoxGeometry(0.14, 0.62, 0.14).translate(px + fz * 0.3, top + 1.85, pz - fx * 0.3), color),
    );
  };
  const P = (s, lat) => at(track.indexAtDistance(Math.max(0, Math.min(track.length, s))), lat);
  const yawAt = (s) => {
    const a = P(s - 1, 0);
    const b = P(s + 1, 0);
    return Math.atan2(b[0] - a[0], b[2] - a[2]);
  };
  const ground = opts.heightAt || null;
  // The Crew on the nearest wrecks.
  const [sx, , sz] = at(0, 0);
  (tops || [])
    .map((t) => ({ ...t, d: Math.hypot(t.c.x - sx, t.c.z - sz) }))
    .filter((t) => t.d < 250)
    .sort((p, q) => p.d - q.d)
    .slice(0, 2)
    .forEach(({ c, y: top }, k) => {
      [-3, 0.5, 3.5].forEach((lx, q) => figure(c.x + lx * Math.cos(c.yaw), top, c.z - lx * Math.sin(c.yaw), c.yaw + Math.PI / 2, CREW[(k * 3 + q) % CREW.length]));
    });
  // Flares down both sides of the grid.
  const half = track.localHalf ? track.localHalf(0) : track.halfWidth;
  for (let s = 0; s <= 60; s += 6) {
    for (const side of [-1, 1]) {
      const [x, y, z] = P(s, side * (half + 0.5));
      flares.push(new THREE.BoxGeometry(0.12, 0.35, 0.12).translate(x, y + 0.18, z));
      glows.push(new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2).translate(x, y + 0.06, z));
    }
  }
  // The sound-system truck, behind the wall on the first side with room.
  const W0 = track.localWall ? track.localWall(20) : track.wallDist;
  for (const side of [-1, 1]) {
    const [x, y, z] = P(20, side * (W0 + 4));
    if (opts.clear && !opts.clear(x, z)) continue;
    const yaw = yawAt(20);
    painted.push(tinted(new THREE.BoxGeometry(2.5, 3.2, 8).rotateY(yaw).translate(x, y + 1.9, z), '#2a2a34'));
    painted.push(tinted(new THREE.BoxGeometry(2.4, 2, 2.4).rotateY(yaw).translate(x + Math.sin(yaw) * 5, y + 1.3, z + Math.cos(yaw) * 5), '#3a3a44'));
    for (const q of [-2.5, 0, 2.5]) glows.push(new THREE.CircleGeometry(0.6, 12).rotateY(yaw - side * Math.PI / 2).translate(x - Math.cos(yaw) * side * 1.27 + Math.sin(yaw) * q, y + 2.2, z + Math.sin(yaw) * side * 1.27 + Math.cos(yaw) * q));
    break;
  }
  // Drums along the open floor's edges; guard rails along ledges.
  for (const sec of track.sections || []) {
    if (sec.open) {
      for (let s = sec.s0; s < Math.min(sec.s1, track.length); s += 7) {
        for (const side of [-1, 1]) {
          const [x, y, z] = P(s, side * (sec.wall + 0.6));
          drums.push(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10).translate(x, y + 0.45, z));
          fire.push(new THREE.ConeGeometry(0.25, 0.8, 6).translate(x, y + 1.3, z));
        }
      }
    }
    if (sec.cut && ground) {
      for (let s = sec.s0; s + 3 < Math.min(sec.s1, track.length); s += 3) {
        for (const side of [-1, 1]) {
          const a = P(s, side * (sec.wall + 0.15));
          const b = P(s + 3, side * (sec.wall + 0.15));
          if (ground(a[0], a[2]) > a[1] - 0.8 && ground(b[0], b[2]) > b[1] - 0.8) continue;
          steel.push(new THREE.BoxGeometry(0.12, 0.9, 0.12).translate(a[0], a[1] + 0.45, a[2]));
          const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
          const rail = new THREE.BoxGeometry(0.1, 0.25, L);
          rail.rotateX(-Math.atan2(b[1] - a[1], L));
          rail.rotateY(Math.atan2(b[0] - a[0], b[2] - a[2]));
          rail.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.8, (a[2] + b[2]) / 2);
          steel.push(rail);
        }
      }
    }
    // A drag down the drain: the crowd along both tops, behind the fence.
    if (sec.bank && !track.closed) {
      const b = sec.bank;
      const top = b.flat + b.rise / b.slope;
      for (let s = Math.max(sec.s0, 0); s < Math.min(sec.s1, 220); s += 4) {
        for (const side of [-1, 1]) {
          const lat = b.c + side * (top + 3);
          const [x, y0, z] = P(s, lat);
          const y = ground ? ground(x, z) : y0 + b.rise;
          const yaw = yawAt(s) - side * Math.PI / 2;
          for (const q of [0, 1.8]) figure(x + Math.sin(yaw) * -q, y, z + Math.cos(yaw) * -q, yaw, CREW[Math.floor(s / 4 + q + side) % CREW.length]);
        }
      }
    }
  }
  const add = (list, mat) => list.length && group.add(new THREE.Mesh(mergeGeometries(list), mat));
  add(painted, litMaterial({ vertexColors: true }));
  add(steel, litMaterial({ color: '#6a6878' }));
  add(drums, litMaterial({ color: '#5a3a28' }));
  const fireMat = glowMaterial({ color: '#ff7a20', intensity: 3 });
  add(fire, fireMat);
  add(flares, glowMaterial({ color: '#ff2a2a', intensity: 4 }));
  const glowMat = additiveMaterial({ map: tex.glow, color: '#ff3a2a', opacity: 0.45 });
  add(glows, glowMat);
  group.userData.animate = (t, real = t) => {
    glowMat.opacity = 0.38 + Math.sin(real * 11) * 0.06 + Math.sin(real * 17.3) * 0.04;
  };
  return group;
}

// The Neighbourhood Watch's cars: minivans and station wagons parked nose to
// tail across every closed street, roof spotlights on and turned on the route,
// and more of them lined up along the route wherever there's no property line
// to mark its edge (the park, the plaza car park).
const WATCH_COLORS = ['#e8e4dc', '#7a8a9a', '#8a2a2a', '#2a4a6a', '#c8b890', '#3a5a3a', '#5a5a64'];
function watchCars(closures, line, tex) {
  const body = [];
  const glass = [];
  const lamps = [];
  const beams = [];
  const tinted = (g, color) => {
    const c = new THREE.Color(color);
    const cols = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < cols.length; k += 3) cols.set([c.r, c.g, c.b], k);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return g;
  };
  let n = 0;
  // A minivan (or a wagon with a roof rack) at (x, y, z) along yaw; a spotlight
  // on its roof aimed along aim (a yaw), if given.
  const car = (x, y, z, yaw, aim) => {
    const van = n % 3 !== 1;
    const color = WATCH_COLORS[n % WATCH_COLORS.length];
    n++;
    body.push(tinted(new THREE.BoxGeometry(1.95, van ? 1.25 : 0.9, 4.9).rotateY(yaw).translate(x, y + (van ? 0.95 : 0.75), z), color));
    glass.push(new THREE.BoxGeometry(1.85, 0.5, van ? 3.6 : 2.6).rotateY(yaw).translate(x, y + (van ? 1.8 : 1.45), z));
    if (van) body.push(tinted(new THREE.BoxGeometry(1.9, 0.08, 3.7).rotateY(yaw).translate(x, y + 2.09, z), color));
    else body.push(tinted(new THREE.BoxGeometry(1.5, 0.1, 2.4).rotateY(yaw).translate(x, y + 1.75, z), '#2a2a30'));
    if (aim === undefined) return;
    const top = y + (van ? 2.2 : 1.85);
    lamps.push(new THREE.BoxGeometry(0.4, 0.3, 0.3).rotateY(aim).translate(x, top + 0.1, z));
    // Its light on the road ahead of it.
    beams.push(new THREE.PlaneGeometry(9, 14).rotateX(-Math.PI / 2).translate(0, 0, 10).rotateY(aim).translate(x, y + 0.12, z));
  };
  for (const c of closures) {
    const len = 5.2;
    const k = Math.max(1, Math.floor(c.width / len));
    const across = [Math.cos(c.yaw), -Math.sin(c.yaw)];
    for (let q = 0; q < k; q++) {
      const off = -c.width / 2 + (c.width * (q + 0.5)) / k;
      car(c.x + across[0] * off, c.y, c.z + across[1] * off, c.yaw + Math.PI / 2, q % 2 === 0 ? c.yaw + Math.PI : undefined);
    }
  }
  for (const w of line) car(w.x, w.y, w.z, w.yaw, w.k % 4 === 0 ? w.yaw + Math.PI / 2 : undefined);
  const group = new THREE.Group();
  if (!body.length) return group;
  group.add(new THREE.Mesh(mergeGeometries(body), litMaterial({ vertexColors: true })));
  group.add(new THREE.Mesh(mergeGeometries(glass), litMaterial({ color: '#1c1c28' })));
  if (lamps.length) group.add(new THREE.Mesh(mergeGeometries(lamps), glowMaterial({ color: '#fff8e0', intensity: 3 })));
  if (beams.length) {
    const b = new THREE.Mesh(mergeGeometries(beams), additiveMaterial({ map: tex.glow, color: '#fff4d8', opacity: 0.22 }));
    b.renderOrder = 2;
    group.add(b);
  }
  return group;
}

// Maple Hollow's start: the Watch captain with a megaphone, neighbours out on
// their porches in dressing gowns, lawn chairs and a barbecue on the lawns
// either side, spotlights on the grid. A drag: the start lights hung from a
// maple tree over the road, and crowds on the pond banks.
function mapleDressing(track, tex, at, opts) {
  const group = new THREE.Group();
  const clear = opts.clear || (() => true);
  const painted = [];
  const tinted = (g, color) => {
    const c = new THREE.Color(color);
    const cols = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < cols.length; k += 3) cols.set([c.r, c.g, c.b], k);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return g;
  };
  const GOWNS = ['#e8a0b8', '#6a7ab0', '#8a2a3a', '#c8c0a8', '#4a6a8a', '#b8a0d0'];
  const i0 = track.closed ? 0 : 0;
  const [sx, , sz] = at(i0, 0);
  const W = track.localWall ? track.localWall(track.s[i0]) : track.wallDist;
  // The captain, in hi-vis, with a megaphone, by the line.
  {
    const i = track.indexAtDistance(4);
    const [x, y, z] = at(i, W - 1.5);
    const yaw = Math.atan2(-track.rx[i], -track.rz[i]);
    figure(painted, tinted, x, y, z, yaw, '#c8f03a');
    painted.push(tinted(new THREE.ConeGeometry(0.18, 0.45, 8).rotateX(-Math.PI / 2).rotateY(yaw).translate(x + Math.sin(yaw) * 0.35, y + 1.72, z + Math.cos(yaw) * 0.35), '#e8e8e8'));
  }
  // Neighbours on the nearest porches.
  (opts.fronts || [])
    .map((q) => ({ ...q, d: Math.hypot(q.x - sx, q.z - sz) }))
    .filter((q) => q.d < 90)
    .sort((p, q) => p.d - q.d)
    .slice(0, 5)
    .forEach((f, k) => {
      for (let q = 0; q < 2; q++) figure(painted, tinted, f.x + f.fx * 1.2 + f.fz * (q - 0.5) * 1.4, f.y + 0.5, f.z + f.fz * 1.2 - f.fx * (q - 0.5) * 1.4, Math.atan2(f.fx, f.fz), GOWNS[(k * 2 + q) % GOWNS.length]);
    });
  // Lawn chairs and a barbecue on the lawns just past the line, where there's room.
  for (const [s, side] of [[14, -1], [22, 1], [34, -1]]) {
    const i = track.indexAtDistance(s);
    const lat = side * Math.max(6, W - 5);
    const [x, y, z] = at(i, lat);
    if (!clear(x, z)) continue;
    const yaw = Math.atan2(-track.rx[i] * side, -track.rz[i] * side);
    for (let q = -1; q <= 1; q++) {
      const cx = x + track.tx[i] * q * 1.3;
      const cz = z + track.tz[i] * q * 1.3;
      painted.push(tinted(new THREE.BoxGeometry(0.55, 0.08, 0.55).rotateY(yaw).translate(cx, y + 0.45, cz), '#3a8ac8'));
      painted.push(tinted(new THREE.BoxGeometry(0.55, 0.55, 0.08).rotateY(yaw).translate(cx - Math.sin(yaw) * 0.26, y + 0.72, cz - Math.cos(yaw) * 0.26), '#3a8ac8'));
      figure(painted, tinted, cx, y - 0.35, cz, yaw, GOWNS[(q + 4 + s) % GOWNS.length]);
    }
    if (side < 0) {
      const bx = x + track.tx[i] * 3.2;
      const bz = z + track.tz[i] * 3.2;
      painted.push(tinted(new THREE.SphereGeometry(0.4, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI).translate(bx, y + 0.95, bz), '#1c1c20'));
      for (let q = 0; q < 3; q++) painted.push(tinted(new THREE.BoxGeometry(0.05, 0.9, 0.05).translate(bx + Math.cos(q * 2.1) * 0.3, y + 0.45, bz + Math.sin(q * 2.1) * 0.3), '#1c1c20'));
      group.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5).translate(bx, y + 1, bz), glowMaterial({ color: '#ff6020', intensity: 2.4 })));
    }
  }
  // A drag: the start lights hung from the maple nearest the line, and crowds
  // on the pond banks.
  if (opts.drag) {
    const tree = (opts.trees || []).map((t) => ({ ...t, d: Math.hypot(t.x - sx, t.z - sz) })).sort((p, q) => p.d - q.d)[0];
    const i = track.indexAtDistance(12);
    const [lx, ly, lz] = at(i, 0);
    const hx = tree && tree.d < 30 ? tree.x + (lx - tree.x) * 0.35 : lx;
    const hz = tree && tree.d < 30 ? tree.z + (lz - tree.z) * 0.35 : lz;
    const hy = ly + 5.2;
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.4, 0.6).rotateY(Math.atan2(track.tx[i], track.tz[i])).translate(hx, hy, hz), litMaterial({ color: '#15121c' })));
    if (tree) group.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 3, 0.04).translate(hx, hy + 3.2, hz), litMaterial({ color: '#2a2a2a' })));
    [['#ff2020', 1.2], ['#ffb000', 0.4], ['#ffb000', -0.4], ['#20ff60', -1.2]].forEach(([color, dy]) => {
      group.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.7).translate(hx - track.tx[i] * 0.2, hy + dy, hz - track.tz[i] * 0.2), glowMaterial({ color, intensity: 2.6 })));
    });
    const pond = opts.pond;
    if (pond) {
      const cx = pond.reduce((s, p) => s + p[0], 0) / pond.length;
      const cz = pond.reduce((s, p) => s + p[1], 0) / pond.length;
      pond.forEach(([px, pz], k) => {
        if (Math.abs(px) < 18 || Math.abs(px) > 90) return;
        const d = Math.hypot(px - cx, pz - cz);
        for (let q = 0; q < 3; q++) {
          const out = 2.5 + q * 1.2;
          const x = px + ((px - cx) / d) * out + (q - 1) * 0.8;
          const z = pz + ((pz - cz) / d) * out;
          if (!clear(x, z)) continue;
          figure(painted, tinted, x, opts.heightAt ? opts.heightAt(x, z) : ly, z, Math.atan2(cx - x, cz - z), GOWNS[(k + q) % GOWNS.length]);
        }
      });
    }
  }
  if (painted.length) group.add(new THREE.Mesh(mergeGeometries(painted), litMaterial({ vertexColors: true })));
  // Spotlights on stands either side of the grid, their light swinging over the road.
  const pools = [];
  const poolMat = additiveMaterial({ map: tex.glow, color: '#fff0d0', opacity: 0.3 });
  for (const [k, side] of [[0, -1], [1, 1]]) {
    const i = track.indexAtDistance(track.closed ? 12 : 44 + k * 6);
    const [x, y, z] = at(i, side * (W - 2));
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), litMaterial({ color: '#2a2a30' }));
    stand.position.set(x, y + 2, z);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.5), glowMaterial({ color: '#fff4dc', intensity: 3 }));
    head.position.set(x, y + 4.2, z);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2), poolMat);
    pool.renderOrder = 2;
    group.add(stand, head, pool);
    pools.push({ pool, k, side, i, y });
  }
  group.userData.animate = (t, real = t) => {
    for (const { pool, k, side, i, y } of pools) {
      const a = side * (W - 2) * (0.55 + 0.35 * Math.sin(real * 0.6 + k * 2));
      pool.position.set(track.x[i] + track.rx[i] * a, y + 0.15, track.z[i] + track.rz[i] * a);
    }
  };
  group.userData.animate(0);
  return group;
}

// Kessler car transporters parked across the heads of the links a route doesn't
// use: a cab and a two-deck trailer loaded with new cars, amber beacons on.
function transporterClosures(closures) {
  const cab = [];
  const trailer = [];
  const cars = [];
  const lamps = [];
  const tinted = (g, color) => {
    const c = new THREE.Color(color);
    const cols = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < cols.length; k += 3) cols.set([c.r, c.g, c.b], k);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return g;
  };
  const COLORS = ['#c8ccd4', '#05d9e8', '#1a1a20', '#e8e8f0', '#ff2a6d'];
  closures.forEach((c, n) => {
    const yaw = c.yaw + Math.PI / 2;
    const ax = Math.sin(yaw);
    const az = Math.cos(yaw);
    const L = c.width;
    const at = (u, dy) => [c.x + ax * u, c.y + dy, c.z + az * u];
    const [cx, cy, cz] = at(-L / 2 + 1.5, 1.8);
    cab.push(new THREE.BoxGeometry(2.6, 3, 3).rotateY(yaw).translate(cx, cy, cz));
    lamps.push(new THREE.BoxGeometry(0.5, 0.3, 0.5).translate(cx, cy + 1.7, cz));
    const [tx, ty, tz] = at(1.5, 1.1);
    trailer.push(new THREE.BoxGeometry(2.7, 0.5, L - 3).rotateY(yaw).translate(tx, ty, tz));
    trailer.push(new THREE.BoxGeometry(2.8, 0.2, L - 3).rotateY(yaw).translate(tx, ty + 2.3, tz));
    for (const s of [-1, 1]) trailer.push(new THREE.BoxGeometry(0.15, 3, L - 3).rotateY(yaw).translate(tx - az * s * 1.35, ty + 1.5, tz + ax * s * 1.35));
    for (let q = 0; q < Math.floor((L - 3) / 4.6); q++) {
      for (const [dy, k] of [[0.9, 0], [3.1, 1]]) {
        const [x, y, z] = at(-L / 2 + 3.3 + q * 4.6, dy);
        cars.push(tinted(new THREE.BoxGeometry(1.8, 0.9, 4.1).rotateY(yaw).translate(x, y, z), COLORS[(n + q + k) % COLORS.length]));
      }
    }
  });
  const group = new THREE.Group();
  if (!cab.length) return group;
  group.add(new THREE.Mesh(mergeGeometries(cab), litMaterial({ color: '#e8e8f0' })));
  group.add(new THREE.Mesh(mergeGeometries(trailer), litMaterial({ color: '#5a6070' })));
  group.add(new THREE.Mesh(mergeGeometries(cars), litMaterial({ vertexColors: true })));
  group.add(new THREE.Mesh(mergeGeometries(lamps), glowMaterial({ color: '#ffb040', intensity: 2.6 })));
  return group;
}

// Chrome Heights' start: Kessler banners on poles either side, pit gazebos on
// the deck, a TV helicopter holding overhead. A drag: the crowd on the East
// Terrace bridge beside the start.
function chromeDressing(track, tex, at, opts) {
  const group = new THREE.Group();
  const painted = [];
  const tinted = (g, color) => {
    const c = new THREE.Color(color);
    const cols = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < cols.length; k += 3) cols.set([c.r, c.g, c.b], k);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return g;
  };
  const clear = opts.clear || (() => true);
  const s0 = track.closed ? 0 : 40;
  const half = track.localHalf ? track.localHalf(s0) : track.halfWidth;
  const banner = textTexture('KESSLER', '#05d9e8', '#06121c');
  const bannerMat = glowMaterial({ map: banner, intensity: 1.6, side: THREE.DoubleSide });
  for (const [ds, side] of [[-10, -1], [-10, 1], [14, -1], [14, 1]]) {
    const i = track.indexAtDistance(Math.max(0, s0 + ds));
    const [x, y, z] = at(i, side * (half + 3));
    painted.push(tinted(new THREE.BoxGeometry(0.25, 9, 0.25).translate(x, y + 4.5, z), '#8a8e98'));
    const g = new THREE.PlaneGeometry(1.4, 5).rotateY(Math.atan2(track.tx[i], track.tz[i]) + Math.PI / 2).translate(x, y + 5.8, z);
    group.add(new THREE.Mesh(g, bannerMat));
  }
  // Pit gazebos: white canopies on the deck either side, where there's room.
  for (const [ds, side] of [[-24, -1], [-24, 1], [-36, 1]]) {
    const i = track.indexAtDistance(Math.max(0, s0 + ds));
    const [x, y, z] = at(i, side * (half + 9));
    if (!clear(x, z)) continue;
    const yaw = Math.atan2(track.tx[i], track.tz[i]);
    painted.push(tinted(new THREE.BoxGeometry(6, 0.3, 6).rotateY(yaw).translate(x, y + 3, z), '#e8f4ff'));
    painted.push(tinted(new THREE.ConeGeometry(4.3, 1.2, 4).rotateY(yaw + Math.PI / 4).translate(x, y + 3.75, z), '#e8f4ff'));
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) painted.push(tinted(new THREE.BoxGeometry(0.12, 3, 0.12).translate(x + a * 2.8, y + 1.5, z + b * 2.8), '#8a8e98'));
    painted.push(tinted(new THREE.BoxGeometry(2, 1, 0.8).rotateY(yaw).translate(x, y + 0.5, z), '#2a2e38'));
  }
  // The drag's crowd on the bridge beside the start.
  const br = opts.crowdBridge;
  if (opts.drag && br) {
    const L = br.pts.reduce((s, p, k) => (k ? s + Math.hypot(p[0] - br.pts[k - 1][0], p[1] - br.pts[k - 1][1]) : 0), 0);
    let s = 0;
    br.pts.forEach((p, k) => {
      if (k) s += Math.hypot(p[0] - br.pts[k - 1][0], p[1] - br.pts[k - 1][1]);
      if (k % 1) return;
      const y = br.hA + ((br.hB - br.hA) * s) / (L || 1);
      const q = br.pts[Math.min(br.pts.length - 1, k + 1)];
      const dx = q[0] - p[0];
      const dz = q[1] - p[1];
      const len = Math.hypot(dx, dz) || 1;
      for (const sd of [-1, 1]) {
        const x = p[0] - (dz / len) * sd * (br.half + 0.4);
        const z = p[1] + (dx / len) * sd * (br.half + 0.4);
        figure(painted, tinted, x, y, z, Math.atan2((dz / len) * sd, (-dx / len) * sd), ['#05d9e8', '#e8e8f0', '#ff2a6d', '#3a4a6a'][(k + (sd > 0 ? 1 : 0)) % 4]);
      }
    });
  }
  if (painted.length) group.add(new THREE.Mesh(mergeGeometries(painted), litMaterial({ vertexColors: true })));
  // The TV helicopter, holding over the start (scenery), rotor turning.
  const heli = new THREE.Group();
  heli.add(new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(2.2, 2, 5), new THREE.BoxGeometry(0.5, 0.6, 5).translate(0, 0.4, -4.5)]), litMaterial({ color: '#1c2230' })));
  heli.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4).translate(0, -1.1, 2), glowMaterial({ color: '#ff2020', intensity: 3 })));
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.4), litMaterial({ color: '#3a3e48' }));
  rotor.position.y = 1.3;
  heli.add(rotor);
  const i0 = track.indexAtDistance(s0);
  heli.position.set(track.x[i0] + track.rx[i0] * 20, track.y[i0] + 45, track.z[i0] + track.rz[i0] * 20);
  heli.rotation.y = Math.atan2(-track.rx[i0], -track.rz[i0]);
  group.add(heli);
  const light = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 6, 45, 8, 1, true).translate(0, -22.5, 0), additiveMaterial({ map: tex.glow, color: '#e8f4ff', opacity: 0.08 }));
  light.renderOrder = 2;
  heli.add(light);
  group.userData.animate = (t, real = t) => {
    rotor.rotation.y = real * 30;
    heli.position.y = track.y[i0] + 45 + Math.sin(real * 0.7) * 0.8;
  };
  group.userData.animate(0);
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
// Past each open end (a sprint's start and finish), the barriers the sim
// has there (track.ends): on along both walls to one across the road.
function endPens(track, material) {
  const parts = [];
  for (const e of track.ends || []) {
    const yaw = Math.atan2(e.ox, e.oz);
    const y = e.y + BARRIER_HEIGHT / 2;
    parts.push(new THREE.BoxGeometry(2 * e.wall + 0.6, BARRIER_HEIGHT, 0.6).rotateY(yaw).translate(e.x, y, e.z));
    for (const side of [-1, 1]) {
      const x = track.x[e.k] + e.ox * (END_RUN / 2) + track.rx[e.k] * side * e.wall;
      const z = track.z[e.k] + e.oz * (END_RUN / 2) + track.rz[e.k] * side * e.wall;
      parts.push(new THREE.BoxGeometry(0.6, BARRIER_HEIGHT, END_RUN).rotateY(yaw).translate(x, y, z));
    }
  }
  return parts.length ? new THREE.Mesh(mergeGeometries(parts), material) : new THREE.Group();
}

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
  // Off the streets (a race placed in the T&T SDK): no road laid over the
  // ground there, just the barriers; and no barrier through what stands on
  // its line (that's the edge there: the barrier stops at it, either side).
  const free = freeSamples(track);
  const bare = inGap || free ? (i) => (inGap && inGap(i)) || (free && free[i] === 1) : null;
  const through = free ? thingsOnWalls(track, free, at, wallAt) : null;
  add(ribbon(track, (i) => at(i, -hwAt(i), lift), (i) => at(i, hwAt(i), lift), { vLength: 16, skip: bare }), roadMat || mats.road);
  add(ribbon(track, (i) => at(i, -curbAt(i), lift), (i) => at(i, -hwAt(i), lift), { vLength: 3, skip: bare }), mats.curb);
  add(ribbon(track, (i) => at(i, hwAt(i), lift), (i) => at(i, curbAt(i), lift), { vLength: 3, skip: bare }), mats.curb);
  const shoulderU = (wall - curbOuter) / 4;
  add(ribbon(track, (i) => at(i, -wallAt(i), lift), (i) => at(i, -curbAt(i), lift), { vLength: 4, uB: shoulderU, skip: bare }), mats.shoulder);
  add(ribbon(track, (i) => at(i, curbAt(i), lift), (i) => at(i, wallAt(i), lift), { vLength: 4, uB: shoulderU, skip: bare }), mats.shoulder);

  for (const side of [-1, 1]) {
    // (A stretch of barrier both ends inside something: left out.)
    const inThing = through?.[side > 0 ? 1 : 0];
    const skipQuad = inThing ? (a, b) => inThing[a] === 1 && inThing[b] === 1 : null;
    const skipWall = wallSkip ? (i) => { const p = at(i, side * wallAt(i)); return wallSkip(p[0], p[2]); } : null;
    // No barriers inside a container tunnel: its walls are the barriers.
    const inTunnel = track.narrows ? (i) => track.narrows.some((n) => track.s[i] > n.s0 && track.s[i] < n.s1) : null;
    const skip = inGap || skipWall || inTunnel ? (i) => (inGap && inGap(i)) || (skipWall && skipWall(i)) || (inTunnel && inTunnel(i)) : null;
    add(ribbon(track, (i) => at(i, side * wallAt(i), BARRIER_HEIGHT), (i) => at(i, side * wallAt(i)), { vLength: 3.4, swapUV: true, skip, skipQuad }), mats.barrier);
    // LED strip along the top of the barriers (the Neon Strip).
    if (mats.led) add(ribbon(track, (i) => at(i, side * wallAt(i), BARRIER_HEIGHT + 0.02), (i) => at(i, side * (wallAt(i) - 0.25), BARRIER_HEIGHT + 0.02), { vLength: 3, skip, skipQuad }), mats.led[side > 0 ? 1 : 0]);
    add(
      ribbon(track, (i) => at(i, side * wallAt(i)), (i) => {
        const p = at(i, side * (wallAt(i) + 0.01));
        return [p[0], groundY, p[2]];
      }, { vLength: 4, skip, skipQuad }),
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
// The samples off the streets (track.free: the T&T SDK's stretches there), 1s.
function freeSamples(track) {
  if (!track.free) return null;
  const out = new Uint8Array(track.count);
  for (let i = 0; i < track.count; i++) out[i] = track.free.some((line) => G.nearestOnLine(line, track.x[i], track.z[i]).d < 8) ? 1 : 0;
  return out;
}

// Off the streets, where each side's barrier line runs through something
// solid at barrier height (left side [0], right [1]; 1s, by sample).
function thingsOnWalls(track, free, at, wallAt) {
  const reach = track.wallDist + 4;
  const near = (track.obstacles || []).filter((o) => o.poly || track.free.some((line) => G.nearestOnLine(line, o.x, o.z).d < reach + Math.hypot(o.hw, o.hd)));
  return [-1, 1].map((side) => {
    const out = new Uint8Array(track.count);
    if (!near.length) return out;
    for (let i = 0; i < track.count; i++) {
      if (!free[i]) continue;
      const [x, y, z] = at(i, side * wallAt(i));
      out[i] = near.some((o) => (o.y ?? y) < y + BARRIER_HEIGHT && (o.y ?? y) + o.h > y + 0.2 && onFoot(o, x, z)) ? 1 : 0;
    }
    return out;
  });
}

// (skipQuad(a, b): leaves out the quad between samples a and b.)
function ribbon(track, pointA, pointB, { uA = 0, uB = 1, vLength = 8, swapUV = false, skip = null, skipQuad = null } = {}) {
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
    if (r > 0 && !(skip && (skip(i) || skip((r - 1) % n))) && !(skipQuad && skipQuad((r - 1) % n, i))) {
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
  // (Up on something, where the T&T SDK put it: on its top.)
  const top = track.closed ? track.startY : track.finishY;
  const lift = top !== null && top !== undefined ? Math.max(0, top - track.y[i0]) : 0;

  const positions = [...at(i0, -hw, lift + 0.03), ...at(i0, hw, lift + 0.03), ...at(i1, -hw, lift + 0.03), ...at(i1, hw, lift + 0.03)];
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
  gantry.position.set(track.x[i0], track.y[i0] + lift, track.z[i0]);
  // Face the sign toward cars approaching the line (they travel along +tangent).
  gantry.lookAt(track.x[i0] - track.tx[i0], track.y[i0] + lift, track.z[i0] - track.tz[i0]);
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
