import * as THREE from 'three';
import { litMaterial } from './retroMaterial.js';

// Breakables shattering: when a prop goes down, a few pieces of it burst
// from where it stood, the way the car hit it, tumble, bounce, and lie where
// they land till the props stand again (clear()). update(real) each frame.
export function shards(add, max = 240) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), litMaterial({ color: '#ffffff' }), max);
  mesh.frustumCulled = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const c = new THREE.Color('#ffffff');
  for (let k = 0; k < max; k++) {
    mesh.setMatrixAt(k, zero);
    mesh.setColorAt(k, c);
  }
  add(mesh);
  const live = [];
  let next = 0;
  let last = null;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const P = new THREE.Vector3();
  const S = new THREE.Vector3();
  return {
    // Six pieces of a prop s metres across (colour color), from (x, y, z) up
    // to its height h, landing on the ground at fy; dir: the car's way.
    burst(x, y, z, fy, s, h, color, dir = [0, 1], seed = 1) {
      const r = (i, a) => {
        const v = Math.sin(seed * 12.9898 + i * 78.233 + a * 37.719) * 43758.5453;
        return v - Math.floor(v);
      };
      for (let i = 0; i < 6; i++) {
        const k = next++ % max;
        const push = 2 + r(i, 5) * 3;
        live[k] = {
          p: [x + (r(i, 2) - 0.5) * s * 0.6, y + r(i, 3) * h, z + (r(i, 4) - 0.5) * s * 0.6],
          v: [dir[0] * push + (r(i, 6) - 0.5) * 3, 2 + r(i, 7) * 3, dir[1] * push + (r(i, 8) - 0.5) * 3],
          a: [r(i, 9) * 6, r(i, 10) * 6, r(i, 11) * 6],
          w: [(r(i, 12) - 0.5) * 14, (r(i, 13) - 0.5) * 14, (r(i, 14) - 0.5) * 14],
          s: Math.max(0.08, s * (0.16 + r(i, 1) * 0.2)),
          floor: fy,
          done: false,
        };
        mesh.setColorAt(k, c.set(color));
      }
      mesh.instanceColor.needsUpdate = true;
    },
    clear() {
      live.length = 0;
      for (let k = 0; k < max; k++) mesh.setMatrixAt(k, zero);
      mesh.instanceMatrix.needsUpdate = true;
    },
    update(real) {
      const dt = last === null ? 0 : Math.max(0, Math.min(0.1, real - last));
      last = real;
      let moved = false;
      live.forEach((b, k) => {
        if (!b || b.done) return;
        b.v[1] -= 9.8 * dt;
        for (let i = 0; i < 3; i++) {
          b.p[i] += b.v[i] * dt;
          b.a[i] += b.w[i] * dt;
        }
        // (Landed: bounces a little, slides, stops.)
        if (b.p[1] < b.floor + b.s * 0.14) {
          b.p[1] = b.floor + b.s * 0.14;
          b.v = [b.v[0] * 0.4, Math.abs(b.v[1]) * 0.3, b.v[2] * 0.4];
          b.w = b.w.map((w) => w * 0.4);
          if (Math.hypot(...b.v) < 0.5) {
            b.done = true;
            b.a = [0, b.a[1], 0];
          }
        }
        m.compose(P.set(...b.p), q.setFromEuler(e.set(...b.a)), S.set(b.s, b.s * 0.28, b.s * 0.6));
        mesh.setMatrixAt(k, m);
        moved = true;
      });
      if (moved) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
