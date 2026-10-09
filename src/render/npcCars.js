import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHELLS } from './carShells.js';

// NPC cars (parked cars, traffic): the game's own car bodies (carShells),
// bare: no parts, no weapons, just body, glass and wheels, in all sorts of
// colours. One geometry with vertex colours, for a view's painted bucket;
// light (their outlines extruded, the wheels as dark axles): a district can
// have thousands.

export const NPC_COLORS = ['#b83a3a', '#3a6ab8', '#c8c8c8', '#2a2a30', '#d8a020', '#3a8a5a', '#6a3a8a', '#e8e8f0', '#d86a1a', '#1a8a9a', '#8a1a3a', '#5a6a7a'];
const TYPES = ['hatch', 'wedge', 'muscle', 'pickup', 'van'];
const W = 1.9; // body width
const R = 0.34; // wheel radius
const WHEEL_Y = -0.37; // wheel centres, body frame (the body's bottom is at -0.42)

// A side outline ([z, y], convex) extruded across the car, narrowing from hw0
// at its bottom to hw1 at its top; every face turned outwards.
function extrude(profile, hw0, hw1) {
  const ys = profile.map((p) => p[1]);
  const zs = profile.map((p) => p[0]);
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const mid = new THREE.Vector3(0, (y0 + y1) / 2, (Math.min(...zs) + Math.max(...zs)) / 2);
  const wAt = (y) => hw0 + ((hw1 - hw0) * (y - y0)) / (y1 - y0 || 1);
  const pos = [];
  const idx = [];
  const v = (x, y, z) => pos.push(x, y, z) / 3 - 1;
  const tri = (a, b, c) => {
    const P = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    const n = P(b).sub(P(a)).cross(P(c).sub(P(a)));
    const out = P(a).add(P(b)).add(P(c)).divideScalar(3).sub(mid);
    idx.push(...(n.dot(out) >= 0 ? [a, b, c] : [a, c, b]));
  };
  const n = profile.length;
  for (const sx of [-1, 1]) {
    const ring = profile.map(([z, y]) => v(sx * wAt(y), y, z));
    for (let k = 1; k + 1 < n; k++) tri(ring[0], ring[k], ring[k + 1]);
  }
  for (let k = 0; k < n; k++) {
    const [za, ya] = profile[k];
    const [zb, yb] = profile[(k + 1) % n];
    const q = [v(-wAt(ya), ya, za), v(wAt(ya), ya, za), v(wAt(yb), yb, zb), v(-wAt(yb), yb, zb)];
    tri(q[0], q[1], q[2]);
    tri(q[0], q[2], q[3]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const colored = (g, color) => {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) a.set([c.r, c.g, c.b], k * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  // (The same attributes as the rest of a painted bucket, and indexed like it.)
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.index) g.setIndex([...Array(n).keys()]);
  return g;
};

// A bare car of a type in a colour, at the origin, wheels on y = 0, its length along z.
const cache = new Map();
function bare(type, paint) {
  const key = `${type}|${paint}`;
  if (!cache.has(key)) {
    const s = SHELLS[type];
    const parts = [colored(extrude(s.body, W / 2, (W / 2) * 0.95), paint)];
    if (s.cabin) parts.push(colored(extrude(s.cabin, (W / 2) * (s.cabinWidth || 0.86), (W / 2) * (s.cabinWidth || 0.65)), '#1c2230'));
    for (const z of [s.front * 0.62, s.rear * 0.62]) parts.push(colored(new THREE.BoxGeometry(W + 0.04, R * 2, R * 2).translate(0, WHEEL_Y, z), '#18181c'));
    cache.set(key, mergeGeometries(parts).translate(0, R - WHEEL_Y, 0));
  }
  return cache.get(key);
}

// A bare body by type and paint, shared (never transform it): moving traffic.
export const NPC_TYPES = TYPES;
export const npcBody = (type, paint) => bare(type, paint);

// An NPC car for seed n (its type and colour), placed: { x, y (the ground), z,
// yaw (its length along the heading) }; type forces a body ('van'), paint a colour.
export function npcCar(n, { x = 0, y = 0, z = 0, yaw = 0, type, paint } = {}) {
  const k = Math.abs(Math.round(n)) || 0;
  const g = bare(type || TYPES[k % TYPES.length], paint || NPC_COLORS[(k * 7 + 3) % NPC_COLORS.length]).clone();
  return g.rotateY(yaw).translate(x, y, z);
}
