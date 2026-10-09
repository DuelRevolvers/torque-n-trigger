import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial } from './retroMaterial.js';
import { npcBody, NPC_TYPES, NPC_COLORS } from './npcCars.js';
import { TRAFFIC } from '../sim/rules.js';

// Rush hour traffic (phase 6): a mesh per traffic car, the parked cars' bodies,
// posed between sim steps, with brake lights and flashing indicators while it
// changes lane. Meshes come and go with the cars in world.state.traffic.

let shared = null;
function parts() {
  if (shared) return shared;
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const brake = (hl) => mergeGeometries([box(0.42, 0.14, 0.06, -0.62, 0.86, hl), box(0.42, 0.14, 0.06, 0.62, 0.86, hl)]);
  // (A car faces -z; its right is +x.)
  const side = (sx, hl) => mergeGeometries([box(0.08, 0.12, 0.22, sx * 0.97, 0.82, -hl + 0.3), box(0.08, 0.12, 0.22, sx * 0.97, 0.82, hl - 0.3)]);
  shared = {
    body: litMaterial({ vertexColors: true }),
    red: new THREE.MeshBasicMaterial({ color: '#ff2a2a' }),
    amber: new THREE.MeshBasicMaterial({ color: '#ffb020' }),
    brake: TRAFFIC.halfLength.map(brake),
    left: TRAFFIC.halfLength.map((hl) => side(-1, hl)),
    right: TRAFFIC.halfLength.map((hl) => side(1, hl)),
  };
  return shared;
}

export function buildTrafficView() {
  const group = new THREE.Group();
  group.name = 'traffic';
  group.userData.meshes = new Map();
  return group;
}

function makeCar(c) {
  const P = parts();
  const m = new THREE.Mesh(npcBody(NPC_TYPES[c.body], NPC_COLORS[c.paint % NPC_COLORS.length]), P.body);
  const brake = new THREE.Mesh(P.brake[c.body], P.red);
  const left = new THREE.Mesh(P.left[c.body], P.amber);
  const right = new THREE.Mesh(P.right[c.body], P.amber);
  m.add(brake, left, right);
  m.userData = { brake, left, right };
  return m;
}

// Every traffic car's pose, kept before a sim step (for posing between steps).
export function trafficPoses(state) {
  const out = new Map();
  const tr = state.traffic;
  if (tr) for (const c of [...tr.cars, ...tr.loose]) out.set(c.id, { x: c.x, y: c.y, z: c.z, yaw: c.yaw });
  return out;
}

export function updateTrafficView(group, state, prev, alpha, time) {
  const { meshes } = group.userData;
  const tr = state.traffic;
  const seen = new Set();
  const flash = Math.floor(time * 3) % 2 === 0;
  for (const c of tr ? [...tr.cars, ...tr.loose] : []) {
    seen.add(c.id);
    let m = meshes.get(c.id);
    if (!m) {
      m = makeCar(c);
      meshes.set(c.id, m);
      group.add(m);
    }
    const p = prev?.get(c.id) || c;
    let dy = c.yaw - p.yaw;
    dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
    m.position.set(p.x + (c.x - p.x) * alpha, p.y + (c.y - p.y) * alpha, p.z + (c.z - p.z) * alpha);
    m.rotation.set(0, p.yaw + dy * alpha, 0);
    const lane = c.lane !== undefined;
    m.userData.brake.visible = lane && !!c.brk;
    // Changing lane: towards the inner lane (an even lane) is the car's left.
    m.userData.left.visible = lane && c.chg >= 0 && c.chg % 2 === 0 && flash;
    m.userData.right.visible = lane && c.chg >= 0 && c.chg % 2 === 1 && flash;
  }
  for (const [id, m] of meshes) {
    if (seen.has(id)) continue;
    group.remove(m);
    meshes.delete(id);
  }
}
