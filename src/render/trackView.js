import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial, standardMaterial, glowMaterial, additiveMaterial } from './retroMaterial.js';
import { PALETTE } from './textures.js';

const BARRIER_HEIGHT = 1.1;
const LAMP_SPACING = 36;

// Builds the road, curbs, shoulders, barriers, ground, start/finish gantry,
// street lamps, jump kickers and shortcut branches from the simulation's track
// data, so what you see is what you drive on.
export function buildTrackView(track, tex) {
  const group = new THREE.Group();
  const groundY = track.minY - 0.6;
  const doubleSided = { side: THREE.DoubleSide };
  const mats = {
    road: standardMaterial({ map: tex.road, roughness: 0.45, metalness: 0.0, envMap: tex.env, envMapIntensity: 0.5, ...doubleSided }),
    curb: litMaterial({ map: tex.curb, ...doubleSided }),
    shoulder: litMaterial({ map: tex.shoulder, ...doubleSided }),
    barrier: litMaterial({ map: tex.wall, ...doubleSided }),
    skirt: litMaterial({ color: PALETTE.wallDark, ...doubleSided }),
    chevron: litMaterial({ map: tex.wall, ...doubleSided, polygonOffset: true, polygonOffsetFactor: -2 }),
  };

  // Where a shortcut meets the main road, neither road gets a wall in the way.
  const branches = track.branches || [];
  const inBranch = (x, z) => branches.some(({ track: b }) => {
    const g = b.queryMain(x, z, -1);
    return g.overrun < 1 && Math.abs(g.lateral) < b.wallDist + 1.5;
  });
  const inMain = (x, z) => Math.abs(track.queryMain(x, z, -1).lateral) < track.wallDist - 0.5;

  buildRoad(group, track, mats, groundY, { wallSkip: branches.length ? inBranch : null });
  for (const { track: b } of branches) buildRoad(group, b, mats, groundY, { lift: 0.03, wallSkip: inMain });

  const groundSize = 3000;
  const ground = new THREE.PlaneGeometry(groundSize, groundSize);
  ground.rotateX(-Math.PI / 2);
  ground.translate((track.bounds.minX + track.bounds.maxX) / 2, groundY, (track.bounds.minZ + track.bounds.maxZ) / 2);
  tex.ground.repeat.set(groundSize / 8, groundSize / 8);
  group.add(new THREE.Mesh(ground, new THREE.MeshLambertMaterial({ map: tex.ground }))); // no vertex snap: see retroMaterial.js

  const at = pointAt(track);
  group.add(buildStartLine(track, tex, at, track.closed ? 0 : track.indexAtDistance(track.finishS ?? track.length - 25)));
  group.add(buildLamps(track, tex, at));
  return group;
}

const pointAt = (track) => (i, lateral, dy = 0) => [
  track.x[i] + track.rx[i] * lateral,
  track.y[i] + dy,
  track.z[i] + track.rz[i] * lateral,
];

// One road: surface, curbs, shoulders, barriers (with optional gaps), skirts
// down to the ground, and chevrons on its jump kickers.
function buildRoad(group, track, mats, groundY, { lift = 0, wallSkip = null } = {}) {
  const hw = track.halfWidth;
  const curbOuter = hw + track.curbWidth;
  const wall = track.wallDist;
  const at = pointAt(track);
  const add = (geometry, material) => group.add(new THREE.Mesh(geometry, material));

  add(ribbon(track, (i) => at(i, -hw, lift), (i) => at(i, hw, lift), { vLength: 16 }), mats.road);
  add(ribbon(track, (i) => at(i, -curbOuter, lift), (i) => at(i, -hw, lift), { vLength: 3 }), mats.curb);
  add(ribbon(track, (i) => at(i, hw, lift), (i) => at(i, curbOuter, lift), { vLength: 3 }), mats.curb);
  const shoulderU = (wall - curbOuter) / 4;
  add(ribbon(track, (i) => at(i, -wall, lift), (i) => at(i, -curbOuter, lift), { vLength: 4, uB: shoulderU }), mats.shoulder);
  add(ribbon(track, (i) => at(i, curbOuter, lift), (i) => at(i, wall, lift), { vLength: 4, uB: shoulderU }), mats.shoulder);

  for (const side of [-1, 1]) {
    const skip = wallSkip ? (i) => { const p = at(i, side * wall); return wallSkip(p[0], p[2]); } : null;
    add(ribbon(track, (i) => at(i, side * wall, BARRIER_HEIGHT), (i) => at(i, side * wall), { vLength: 3.4, swapUV: true, skip }), mats.barrier);
    add(
      ribbon(track, (i) => at(i, side * wall), (i) => {
        const p = at(i, side * (wall + 0.01));
        return [p[0], groundY, p[2]];
      }, { vLength: 4, skip }),
      mats.skirt,
    );
  }

  // Yellow chevrons on each kicker so jumps read from a distance.
  for (const j of track.jumps || []) {
    const i0 = track.indexAtDistance(j.s);
    const i1 = track.indexAtDistance(j.s + j.len);
    const skip = (i) => (i0 <= i1 ? i < i0 || i > i1 : i < i0 && i > i1);
    add(ribbon(track, (i) => at(i, -hw + 0.5, lift + 0.04), (i) => at(i, hw - 0.5, lift + 0.04), { vLength: 3.4, swapUV: true, skip }), mats.chevron);
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
  const hw = track.halfWidth;

  const positions = [...at(i0, -hw, 0.03), ...at(i0, hw, 0.03), ...at(i1, -hw, 0.03), ...at(i1, hw, 0.03)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, (hw * 2) / 8, 0, 0, 1, (hw * 2) / 8, 1], 2));
  g.setIndex([0, 1, 2, 1, 3, 2]);
  g.computeVertexNormals();
  tex.checker.repeat.set(1, 1);
  group.add(new THREE.Mesh(g, litMaterial({ map: tex.checker, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })));

  // Gantry over the line with the game's name in neon.
  const span = track.wallDist + 0.6;
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
