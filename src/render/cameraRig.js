import * as THREE from 'three';

// Third-person chase camera. It is render-only: it reads interpolated car poses
// and never feeds back into the simulation.

const _fwd = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _look = new THREE.Vector3();

export class CameraRig {
  constructor(camera, track) {
    this.camera = camera;
    this.track = track;
    this.heading = new THREE.Vector3(0, 0, -1);
    this.height = null;
    this.fov = camera.fov;
    this.hint = -1;
  }

  update(pose, car, frameDt, lookBack) {
    // Follow a blend of where the car points and where it's going, so drifts
    // show the car's angle instead of the camera swinging with it.
    _fwd.set(0, 0, -1).applyQuaternion(pose.quat);
    _fwd.y = 0;
    _fwd.normalize();
    _vel.set(car.vel.x, 0, car.vel.z);
    const speed = _vel.length();
    if (speed > 3) _fwd.lerp(_vel.normalize(), 0.35).normalize();
    this.heading.lerp(_fwd, 1 - Math.exp(-7 * frameDt)).normalize();

    const dir = lookBack ? this.heading.clone().negate() : this.heading;
    const dist = 6.4 + Math.min(speed, 60) * 0.025;
    const targetY = pose.pos.y + 2.3;
    this.height = this.height === null ? targetY : this.height + (targetY - this.height) * (1 - Math.exp(-10 * frameDt));

    const cam = this.camera.position;
    cam.set(pose.pos.x - dir.x * dist, this.height, pose.pos.z - dir.z * dist);
    const g = this.track.query(cam.x, cam.z, this.hint);
    this.hint = g.index;
    cam.y = Math.max(cam.y, g.height + 0.8);

    _look.set(pose.pos.x + dir.x * 4, pose.pos.y + 0.7, pose.pos.z + dir.z * 4);
    this.camera.lookAt(_look);

    const boost = car.nitro.active > 0 ? 8 : 0;
    const targetFov = 66 + Math.min(speed, 70) * 0.18 + boost;
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-4 * frameDt));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
