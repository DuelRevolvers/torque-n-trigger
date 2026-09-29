import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial, glowMaterial, additiveMaterial } from './retroMaterial.js';
import { rvAt } from '../sim/rv.js';

// Maple Hollow's runaway RV: a cream motorhome with brown stripes and a cab
// over the front, nobody at the wheel. Placed each frame from the simulation's
// schedule (hidden when it isn't rolling); it goes into Hollow Pond with a
// splash and sinks.

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

export function buildRvView(rv, tex) {
  const group = new THREE.Group();
  const L = rv.length;
  const W = rv.width;
  const H = rv.height;
  const body = [box(W, H - 0.9, L - 1.4, 0, 0.45 + (H - 0.9) / 2 + 0.2, -0.5), box(W, 1.3, 1.8, 0, 1.25, L / 2 - 1.1), box(W, 0.8, 1.6, 0, H - 0.6, L / 2 - 1.6)];
  const stripes = [box(W + 0.04, 0.3, L - 1.5, 0, 1.5, -0.5), box(W + 0.04, 0.15, L - 1.5, 0, 1.9, -0.5)];
  const dark = [box(W - 0.2, 0.7, L - 0.4, 0, 0.35, 0), box(W - 0.1, 0.7, 0.1, 0, 1.7, L / 2 - 0.19), box(0.05, 0.6, 1.2, W / 2 + 0.01, 2.2, -1.5), box(0.05, 0.6, 1.2, -W / 2 - 0.01, 2.2, -1.5), box(0.05, 0.6, 1.2, W / 2 + 0.01, 2.2, 1)];
  const lights = [box(0.4, 0.25, 0.1, -W / 2 + 0.35, 0.9, L / 2 - 0.19), box(0.4, 0.25, 0.1, W / 2 - 0.35, 0.9, L / 2 - 0.19)];
  const wheels = [];
  for (const z of [L / 2 - 1.6, -L / 2 + 1.8]) for (const s of [-1, 1]) wheels.push(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10).rotateZ(Math.PI / 2).translate(s * (W / 2 - 0.1), 0.45, z));
  const rig = new THREE.Group();
  rig.add(
    new THREE.Mesh(mergeGeometries(body), litMaterial({ color: '#e8dcc0' })),
    new THREE.Mesh(mergeGeometries(stripes), litMaterial({ color: '#7a4a2a' })),
    new THREE.Mesh(mergeGeometries(dark), litMaterial({ color: '#1c1a24' })),
    new THREE.Mesh(mergeGeometries(wheels), litMaterial({ color: '#141418' })),
    new THREE.Mesh(mergeGeometries(lights), glowMaterial({ color: '#fff4c0', intensity: 2.4 })),
  );
  group.add(rig);
  // The splash as it goes in.
  const splash = new THREE.Mesh(new THREE.CylinderGeometry(3, 7, 5, 12, 1, true).translate(0, 2.5, 0), additiveMaterial({ map: tex?.glow, color: '#c8e0ff', opacity: 0.5 }));
  splash.visible = false;
  splash.renderOrder = 2;
  group.add(splash);
  group.userData = { rig, splash };
  group.visible = false;
  return group;
}

// tick may be fractional (interpolated between simulation steps).
export function updateRvView(group, rv, tick, heightAt) {
  const at = rvAt(rv, tick);
  group.visible = !!at;
  if (!at) return;
  const ground = heightAt ? heightAt(at.x, at.z) : 0;
  const water = rv.water ?? ground;
  const y = at.inWater ? water - at.sink * (rv.height + 0.6) - 0.4 : ground;
  group.position.set(at.x, y, at.z);
  group.rotation.set(at.inWater ? -0.18 * Math.min(1, at.sink * 3) : 0, at.yaw, 0);
  const { splash } = group.userData;
  splash.visible = at.inWater && at.sink < 0.6;
  if (splash.visible) {
    splash.position.set(0, water - y, 0);
    splash.scale.set(1 + at.sink * 2, 1 - at.sink, 1 + at.sink * 2);
  }
}
