import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial, glowMaterial } from './retroMaterial.js';
import { trainAt, TRAIN } from '../sim/train.js';

// The freight train: a locomotive and a string of wagons, placed each frame from
// the simulation's schedule (hidden when no train is running).

const box = (w, h, d, x, y, z) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
};

export function buildTrainView() {
  const group = new THREE.Group();
  const loco = [box(3.2, 3.6, 18, 0, 2.6, -9)];
  const wagons = [];
  const dark = [box(3, 0.8, 17, 0, 0.6, -9)];
  const glow = [box(2.4, 0.4, 0.2, 0, 3.4, 0.05), box(0.6, 0.6, 0.1, -1, 1.6, 0.05), box(0.6, 0.6, 0.1, 1, 1.6, 0.05)];
  for (let z = -19.5; z - 13.5 > -TRAIN.length; z -= 14.5) {
    wagons.push(box(3, 3.2, 13.5, 0, 2.5, z - 6.75));
    dark.push(box(2.8, 0.8, 13, 0, 0.6, z - 6.75));
  }
  group.add(
    new THREE.Mesh(mergeGeometries(loco), litMaterial({ color: '#d8a020' })),
    new THREE.Mesh(mergeGeometries(wagons), litMaterial({ color: '#7a3a2a' })),
    new THREE.Mesh(mergeGeometries(dark), litMaterial({ color: '#1c1a24' })),
    new THREE.Mesh(mergeGeometries(glow), glowMaterial({ color: '#fff4c0', intensity: 3 })),
  );
  group.visible = false;
  return group;
}

// tick may be fractional (interpolated between simulation steps).
export function updateTrainView(group, line, tick) {
  const at = trainAt(line, tick);
  group.visible = !!at;
  if (!at) return;
  const ux = (line.bx - line.ax) / line.length;
  const uz = (line.bz - line.az) / line.length;
  group.position.set(line.ax + ux * at.head, line.y, line.az + uz * at.head);
  group.rotation.y = Math.atan2(ux * at.dir, uz * at.dir);
}
