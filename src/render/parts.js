import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Pieces for the small models (a slide, a dozer, a dish), made in the
// model's own frame: across (x), up (y), along (z); placed() then turns the
// piece to the model's yaw and moves it to where the model stands.

// A round bar from a to b ([x, y, z]), r thick.
export function rod(a, b, r, sides = 6) {
  const A = new THREE.Vector3(...a);
  const d = new THREE.Vector3(...b).sub(A);
  const L = d.length() || 0.01;
  const g = new THREE.CylinderGeometry(r, r, L, sides);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

// A flat piece from a to b, w wide (kept level across) and t thick.
export function slab(a, b, w, t) {
  const A = new THREE.Vector3(...a);
  const d = new THREE.Vector3(...b).sub(A);
  const L = d.length() || 0.01;
  const g = new THREE.BoxGeometry(w, t, L);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()));
  return g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

// A box w × h × d with its middle at (x, y, z), in the model's frame.
export const block = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// A wheel: r round, w wide, its axle across (x), its middle at (x, y, z).
export const wheel = (r, w, x, y, z, sides = 12) => new THREE.CylinderGeometry(r, r, w, sides).rotateZ(Math.PI / 2).translate(x, y, z);

// A track's belt: rounded at both ends (r round), from z0 to z1 along, its
// middle y up, w wide across, round x.
export function belt(z0, z1, r, w, x, y, n = 10) {
  const s = new THREE.Shape();
  s.moveTo(z0 + r, -r);
  s.lineTo(z1 - r, -r);
  s.absarc(z1 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(z0 + r, r);
  s.absarc(z0 + r, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false, curveSegments: n });
  g.clearGroups();
  // (Indexed, as the boxes it's merged with are.)
  return mergeVertices(g).rotateY(-Math.PI / 2).translate(x + w / 2, y, 0);
}

// The piece turned to yaw and moved to (x, y, z).
export const placed = (g, x, y, z, yaw = 0) => g.rotateY(yaw).translate(x, y, z);

// Its faces turned round (the inside of a dish, seen from the front).
export function inside(g) {
  const out = g.clone();
  const idx = out.index.array;
  for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
  out.computeVertexNormals();
  return out;
}
