import * as THREE from 'three';

// Render-only rain: streaks in a box that follows the camera.
const BOX = { x: 50, y: 28, z: 50 };
const FALL_SPEED = 30;
const STREAK = 0.9;

const wrap = (v, center, size) => center + ((((v - center + size / 2) % size) + size) % size) - size / 2;

export class Rain {
  constructor(count = 1600) {
    this.count = count;
    this.drops = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.drops[i * 3] = (Math.random() - 0.5) * BOX.x;
      this.drops[i * 3 + 1] = (Math.random() - 0.5) * BOX.y;
      this.drops[i * 3 + 2] = (Math.random() - 0.5) * BOX.z;
    }
    this.positions = new Float32Array(count * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: '#9ab8ff', transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.mesh.frustumCulled = false;
  }

  update(center, dt) {
    const d = this.drops;
    const p = this.positions;
    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      d[k + 1] -= FALL_SPEED * dt;
      d[k] += 2 * dt; // light wind
      const x = wrap(d[k], center.x, BOX.x);
      const y = wrap(d[k + 1], center.y, BOX.y);
      const z = wrap(d[k + 2], center.z, BOX.z);
      d[k] = x;
      d[k + 1] = y;
      d[k + 2] = z;
      const o = i * 6;
      p[o] = x;
      p[o + 1] = y;
      p[o + 2] = z;
      p[o + 3] = x - 0.06;
      p[o + 4] = y + STREAK;
      p[o + 5] = z;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}
