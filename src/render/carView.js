import * as THREE from 'three';
import { litMaterial, glowMaterial, additiveMaterial } from './retroMaterial.js';
import { PALETTE } from './textures.js';

// Low-poly car assembled from simple hulls. In M1 this becomes the part-driven
// car builder (chassis shell + mount points); for M0 it is one wedge coupe.
// Body frame matches the sim: +X right, +Y up, -Z forward, origin at centre of mass.

// Side profiles as [z, y] points around a convex outline.
const BODY_PROFILE = [[-2.15, -0.42], [2.1, -0.42], [2.15, 0.02], [1.95, 0.2], [-1.1, 0.12], [-2.2, -0.1]];
const CABIN_PROFILE = [[-1.0, 0.1], [1.55, 0.16], [0.95, 0.62], [-0.25, 0.62]];

const _up = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _tilt = new THREE.Quaternion();
const _yaw = new THREE.Quaternion();

export class CarView {
  constructor(params, { paint = PALETTE.pink, glow = PALETTE.cyan } = {}, tex) {
    this.params = params;
    this.group = new THREE.Group();
    const body = new THREE.Group();
    this.group.add(body);

    const paintMat = litMaterial({ color: paint, side: THREE.DoubleSide });
    const darkMat = litMaterial({ color: '#1b1830', side: THREE.DoubleSide });
    const glassMat = litMaterial({ color: '#10142a', emissive: '#0b2a3a', side: THREE.DoubleSide });

    body.add(new THREE.Mesh(extrudeProfile(BODY_PROFILE, 0.95, 0.9), paintMat));
    body.add(new THREE.Mesh(extrudeProfile(CABIN_PROFILE, 0.82, 0.6), glassMat));

    // Side skirts and a dark lower band so the wedge reads at low resolution.
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.14, 3.6), darkMat);
    skirt.position.set(0, -0.36, 0.05);
    body.add(skirt);

    // Spoiler on two struts.
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.4), darkMat);
    wing.position.set(0, 0.5, 1.9);
    body.add(wing);
    for (const sx of [-0.6, 0.6]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.12), darkMat);
      strut.position.set(sx, 0.34, 1.9);
      body.add(strut);
    }

    // Lights.
    const headMat = glowMaterial({ color: '#e8fbff' });
    this.tailMat = glowMaterial({ color: '#7a0a1e' });
    for (const sx of [-0.62, 0.62]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.06), headMat);
      head.position.set(sx, -0.05, -2.18);
      body.add(head);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.09, 0.06), this.tailMat);
      tail.position.set(sx, 0.04, 2.14);
      body.add(tail);
    }
    // Headlight pool on the road ahead.
    const poolGeo = new THREE.PlaneGeometry(5, 10);
    poolGeo.rotateX(-Math.PI / 2);
    const pool = new THREE.Mesh(poolGeo, additiveMaterial({ map: tex.glow, color: '#7ab8d8', opacity: 0.6 }));
    pool.position.set(0, -0.56, -7.5);
    pool.renderOrder = 1;
    body.add(pool);

    // Neon underglow.
    const glowGeo = new THREE.PlaneGeometry(3.2, 5.6);
    glowGeo.rotateX(-Math.PI / 2);
    this.underglow = new THREE.Mesh(glowGeo, additiveMaterial({ map: tex.glow, color: glow, opacity: 0.9 }));
    this.underglow.position.y = -0.55;
    this.underglow.renderOrder = 1;
    body.add(this.underglow);

    // Exhaust tips and nitro flames.
    const flameMat = new THREE.SpriteMaterial({
      map: tex.glow,
      color: '#5ad0ff',
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.flames = [];
    for (const sx of [-0.45, 0.45]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.25, 6), darkMat);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(sx, -0.3, 2.15);
      body.add(pipe);
      const flame = new THREE.Sprite(flameMat);
      flame.position.set(sx, -0.3, 2.5);
      flame.visible = false;
      body.add(flame);
      this.flames.push(flame);
    }

    // Wheels: a pivot per wheel for steering, the tire inside it spins.
    const r = params.wheelRadius;
    const tireGeo = new THREE.CylinderGeometry(r, r, 0.28, 8);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = litMaterial({ color: '#141218' });
    const hubMat = litMaterial({ color: '#8a88a8' });
    const hubGeo = new THREE.BoxGeometry(0.3, r * 1.1, 0.12);
    this.wheels = params.wheels.map((w) => {
      const pivot = new THREE.Group();
      pivot.position.set(w.x, w.y - params.suspension.rest, w.z);
      const tire = new THREE.Group();
      tire.add(new THREE.Mesh(tireGeo, tireMat));
      const hub = new THREE.Mesh(hubGeo, hubMat); // spoke bar makes rotation visible
      tire.add(hub);
      pivot.add(tire);
      this.group.add(pivot);
      return { def: w, pivot, tire };
    });

    // Blob shadow, placed on the ground under the car every frame.
    const shadowGeo = new THREE.PlaneGeometry(2.6, 4.8);
    shadowGeo.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({
        map: tex.shadow,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      }),
    );
    this.shadow.renderOrder = 1;
  }

  addTo(scene) {
    scene.add(this.group, this.shadow);
  }

  // pose: interpolated { pos, quat } (three.js types); car: latest sim state.
  update(pose, car, track, time) {
    this.group.position.copy(pose.pos);
    this.group.quaternion.copy(pose.quat);

    const p = this.params;
    this.wheels.forEach(({ def, pivot, tire }, i) => {
      const ws = car.wheels[i];
      pivot.position.y = def.y - (p.suspension.rest - Math.min(ws.compression, p.suspension.rest + 0.1));
      pivot.rotation.y = def.steer ? -car.steer : 0;
      tire.rotation.x = -ws.spin;
    });

    this.tailMat.color.set(car.braking ? '#ff2040' : '#7a0a1e');
    this.underglow.material.opacity = 0.75 + 0.15 * Math.sin(time * 3);

    const boosting = car.nitro.active > 0;
    for (const flame of this.flames) {
      flame.visible = boosting;
      if (boosting) {
        const s = 0.7 + Math.random() * 0.5;
        flame.scale.set(s, s, s);
      }
    }

    const g = track.query(pose.pos.x, pose.pos.z, car.trackIndex);
    const heightAbove = Math.max(0, pose.pos.y - g.height - 0.6);
    this.shadow.position.set(pose.pos.x, g.height + 0.05, pose.pos.z);
    _fwd.set(0, 0, -1).applyQuaternion(pose.quat);
    _normal.set(g.nx, g.ny, g.nz);
    _tilt.setFromUnitVectors(_up, _normal);
    _yaw.setFromAxisAngle(_up, Math.atan2(-_fwd.x, -_fwd.z));
    this.shadow.quaternion.multiplyQuaternions(_tilt, _yaw);
    this.shadow.material.opacity = Math.max(0, 1 - heightAbove * 0.25);
  }
}

// Extrudes a convex side profile across the car's width. The width tapers from
// halfWidth at the profile's lowest point to topHalfWidth at its highest.
function extrudeProfile(profile, halfWidth, topHalfWidth) {
  const ys = profile.map((p) => p[1]);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const widthAt = (y) => halfWidth + (topHalfWidth - halfWidth) * ((y - yMin) / (yMax - yMin));
  const vert = ([z, y], side) => [side * widthAt(y), y, z];

  const positions = [];
  const tri = (a, b, c) => positions.push(...a, ...b, ...c);
  const n = profile.length;
  for (let i = 1; i < n - 1; i++) {
    tri(vert(profile[0], 1), vert(profile[i], 1), vert(profile[i + 1], 1));
    tri(vert(profile[0], -1), vert(profile[i + 1], -1), vert(profile[i], -1));
  }
  for (let i = 0; i < n; i++) {
    const a = profile[i];
    const b = profile[(i + 1) % n];
    tri(vert(a, 1), vert(b, 1), vert(b, -1));
    tri(vert(a, 1), vert(b, -1), vert(a, -1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}
