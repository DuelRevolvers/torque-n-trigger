import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial, glowMaterial } from './retroMaterial.js';
import { truckAt } from '../sim/truck.js';

// The Glow Palace's armoured cash truck: a steel box on a heavy cab, gold
// stripes, amber beacons. Placed each frame from the simulation's schedule
// (hidden when it isn't out).

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

export function buildTruckView(truck) {
  const group = new THREE.Group();
  const L = truck.length;
  const W = truck.width;
  const body = [box(W, 2.6, L * 0.7, 0, 2, -L * 0.15), box(W, 2, L * 0.28, 0, 1.6, L * 0.36)];
  const dark = [box(W - 0.2, 0.8, L - 0.6, 0, 0.45, 0), box(W - 0.3, 0.8, 0.1, 0, 2.2, L / 2 + 0.01)];
  const gold = [box(W + 0.04, 0.25, L * 0.7, 0, 1.6, -L * 0.15), box(W + 0.04, 0.25, L * 0.7, 0, 2.6, -L * 0.15)];
  const lights = [box(0.5, 0.3, 0.1, -W / 2 + 0.4, 1, L / 2 + 0.02), box(0.5, 0.3, 0.1, W / 2 - 0.4, 1, L / 2 + 0.02)];
  const beacons = [box(0.4, 0.3, 0.4, -0.6, 3.45, -L * 0.15), box(0.4, 0.3, 0.4, 0.6, 3.45, -L * 0.15)];
  group.add(
    new THREE.Mesh(mergeGeometries(body), litMaterial({ color: '#8a8a94' })),
    new THREE.Mesh(mergeGeometries(dark), litMaterial({ color: '#1c1a24' })),
    new THREE.Mesh(mergeGeometries(gold), glowMaterial({ color: '#ffc850', intensity: 1.6 })),
    new THREE.Mesh(mergeGeometries(lights), glowMaterial({ color: '#fff4c0', intensity: 3 })),
  );
  const beacon = new THREE.Mesh(mergeGeometries(beacons), glowMaterial({ color: '#ffa020', intensity: 3 }));
  group.add(beacon);
  group.userData.beacon = beacon;
  group.visible = false;
  return group;
}

// tick may be fractional (interpolated between simulation steps).
export function updateTruckView(group, truck, tick, heightAt) {
  const at = truckAt(truck, tick);
  group.visible = !!at;
  if (!at) return;
  group.position.set(at.x, heightAt ? heightAt(at.x, at.z) : 0, at.z);
  group.rotation.y = at.yaw;
  group.userData.beacon.visible = Math.floor(tick / 12) % 2 === 0;
}
