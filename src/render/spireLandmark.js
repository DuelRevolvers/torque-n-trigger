import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DISTRICTS } from '../career/districts.js';
import * as G from '../sim/geom2d.js';

// The Spire from the rest of the city: Syncorp's 420 m tower in the Corporate
// Spire, seen from another district in its true direction (from the two
// districts' places on the city map), drawn on the skyline with its gold bands
// and crowned beacon. Unfogged, so it shows from every district.

const REACH = 1350; // drawn this far out (inside the skyline), scaled to look its true size

// A district's map transform (map % = c + metres / s), from its outline.
function transform(d) {
  const b = d.city?.plan?.boundary;
  if (!b || !d.map || d.map.length !== b.length) return null;
  const mb = G.polyBounds(b);
  const pb = G.polyBounds(d.map);
  const sx = (mb.maxX - mb.minX) / (pb.maxX - pb.minX);
  const sy = (mb.maxZ - mb.minZ) / (pb.maxZ - pb.minZ);
  return { cx: pb.minX - mb.minX / sx, cy: pb.minZ - mb.minZ / sy, sx, sy };
}

export function distantSpire(style, groundY = 0) {
  if (style.id === 'spire') return null;
  const here = DISTRICTS.find((d) => d.city?.id === style.id);
  const spire = DISTRICTS.find((d) => d.id === 'spire');
  const a = here && transform(here);
  const b = spire && transform(spire);
  if (!a || !b) return null;
  // The Spire's own origin on the map, in this district's metres.
  const x = (b.cx - a.cx) * a.sx;
  const z = (b.cy - a.cy) * a.sy;
  const dist = Math.hypot(x, z);
  if (dist < 1) return null;
  const k = Math.min(1, REACH / dist);
  const px = x * k;
  const pz = z * k;
  const H = 420 * k;
  const R = 32 * k;
  const body = [];
  const gold = [];
  const tiers = [[0, 0.3, 1], [0.3, 0.55, 0.84], [0.55, 0.76, 0.68], [0.76, 0.9, 0.52], [0.9, 0.975, 0.36]];
  for (const [t0, t1, s] of tiers) {
    body.push(new THREE.CylinderGeometry(R * s, R * s, (t1 - t0) * H, 8, 1, false, Math.PI / 8).translate(px, groundY + ((t0 + t1) / 2) * H, pz));
    gold.push(new THREE.CylinderGeometry(R * s * 1.02, R * s * 1.02, 1.4 * k + 0.4, 8, 1, false, Math.PI / 8).translate(px, groundY + t1 * H, pz));
  }
  gold.push(new THREE.CylinderGeometry(0.8 * k + 0.2, 1.6 * k + 0.3, 30 * k, 8).translate(px, groundY + H * 0.975 + 15 * k, pz));
  const group = new THREE.Group();
  group.add(new THREE.Mesh(mergeGeometries(body), new THREE.MeshBasicMaterial({ color: '#2a2630', fog: false })));
  group.add(new THREE.Mesh(mergeGeometries(gold), new THREE.MeshBasicMaterial({ color: '#ffc850', fog: false })));
  const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(4 * k + 1.5, 0).translate(px, groundY + H * 0.975 + 34 * k, pz), new THREE.MeshBasicMaterial({ color: '#fff0c0', fog: false }));
  group.add(beacon);
  group.userData.animate = (real) => beacon.material.color.setScalar(0.7 + 0.3 * Math.sin(real * 2.2));
  return group;
}
