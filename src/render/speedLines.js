import * as THREE from 'three';

// Wind streaks rushing past the camera at speed. They live in camera space in a
// ring around the view axis, so they frame the edges without covering the car.
const COUNT = 70;

export class SpeedLines {
  constructor(camera) {
    this.lines = [];
    const positions = new Float32Array(COUNT * 6);
    for (let i = 0; i < COUNT; i++) this.lines.push(this.spawn({}, true));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.LineBasicMaterial({
      color: new THREE.Color('#c8dcff').multiplyScalar(1.6),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.LineSegments(geo, this.material);
    this.mesh.frustumCulled = false;
    camera.add(this.mesh);
  }

  spawn(l, anywhere = false) {
    const a = Math.random() * Math.PI * 2;
    const r = 3 + Math.random() * 6;
    l.x = Math.cos(a) * r;
    l.y = Math.sin(a) * r * 0.6;
    l.z = anywhere ? -Math.random() * 60 : -50 - Math.random() * 15;
    return l;
  }

  // intensity: 0..1 from the speed effect curve.
  update(dt, speed, intensity) {
    this.material.opacity = intensity * 0.55;
    this.mesh.visible = intensity > 0.01;
    if (!this.mesh.visible) return;
    const p = this.mesh.geometry.attributes.position.array;
    const len = 1.5 + speed * 0.09;
    this.lines.forEach((l, i) => {
      l.z += speed * 1.3 * dt;
      if (l.z > 2) this.spawn(l);
      p.set([l.x, l.y, l.z, l.x, l.y, l.z - len], i * 6);
    });
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}
