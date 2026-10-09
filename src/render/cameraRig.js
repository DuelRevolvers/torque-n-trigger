import * as THREE from 'three';

// Race camera: a third-person chase camera, a farther one, or one at the
// windscreen. It is render-only: it reads interpolated car poses and never feeds
// back into the simulation.

// The player cycles through these with the camera button.
export const CAMERA_MODES = ['chase', 'far', 'windshield'];
export const CAMERA_NAMES = { chase: 'CHASE CAM', far: 'FAR CAM', windshield: 'WINDSHIELD CAM' };
// Chase distances: how far behind and how high over the car.
const CHASE = { chase: { dist: 6.2, height: 2.3 }, far: { dist: 9.6, height: 3.5 } };

// The crash camera (B3's "HandyCam", Camera.cfg: CONFIRMED spring 15, damping 10
// per axis): how far behind and over the wreck it sits (GUESS).
const CRASH_CAM = { spring: 15, damping: 10, dist: 9, height: 4, maxStep: 1 / 30 };
// Camera kicks: B3's impulse presets (Camera.cfg, CONFIRMED forces and springs,
// per axis: pitch, yaw, roll / right, up, back). The scales turn B3's forces into
// a starting speed (rad/s, m/s) and the damping ratio is T&T's (GUESS).
const KICKS = {
  slam: { ang: [0, 0, 10000], pos: [0, 0, 0], angK: [15, 15, 200], posK: [15, 15, 15] },
  shunt: { ang: [2000, 0, 0], pos: [0, 400, 600], angK: [15, 500, 15], posK: [15, 100, 10] },
  shunted: { ang: [0, 0, 10000], pos: [0, 0, -20], angK: [15, 15, 200], posK: [15, 15, 15] },
  shake: { ang: [2000, 0, 0], pos: [0, 0, 0], angK: [500, 15, 150], posK: [300, 30, 50] },
  burnout: { ang: [0, 0, 10000], pos: [0, 0, -500], angK: [150, 150, 300], posK: [150, 150, 10] },
};
const KICK_SCALE = { ang: 7e-5, pos: 3.2e-3, zeta: 0.35 };

const _fwd = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _look = new THREE.Vector3();
const _target = new THREE.Vector3();

export class CameraRig {
  constructor(camera, track) {
    this.camera = camera;
    this.track = track;
    this.heading = new THREE.Vector3(0, 0, -1);
    this.height = null;
    this.fov = camera.fov;
    this.hint = -1;
    this.crash = null; // the crash camera's spring: { pos, vel }
    // Kick springs, one per axis: angles (pitch, yaw, roll) and offsets (right, up, back).
    this.kicks = { ang: [0, 0, 0].map(() => ({ x: 0, v: 0, k: 0 })), pos: [0, 0, 0].map(() => ({ x: 0, v: 0, k: 0 })) };
  }

  // A camera kick from one of KICKS: adds speed to each axis's spring.
  kick(name) {
    const preset = KICKS[name];
    if (!preset) return;
    for (const kind of ['ang', 'pos']) {
      this.kicks[kind].forEach((s, a) => {
        s.v += preset[kind][a] * KICK_SCALE[kind];
        s.k = preset[`${kind}K`][a];
      });
    }
  }

  // Steps the kick springs and applies them to the camera (after it's placed).
  applyKicks(frameDt) {
    const dt = Math.min(frameDt, 1 / 30);
    const step = (s) => {
      if (!s.k) return;
      s.v += (-s.k * s.x - 2 * KICK_SCALE.zeta * Math.sqrt(s.k) * s.v) * dt;
      s.x += s.v * dt;
    };
    this.kicks.ang.forEach(step);
    this.kicks.pos.forEach(step);
    const [p, r] = [this.kicks.pos, this.kicks.ang];
    if (p.some((s) => Math.abs(s.x) > 1e-4)) {
      _look.set(p[0].x, p[1].x, p[2].x).applyQuaternion(this.camera.quaternion);
      this.camera.position.add(_look);
    }
    if (r.some((s) => Math.abs(s.x) > 1e-5)) {
      this.camera.rotateX(r[0].x);
      this.camera.rotateY(r[1].x);
      this.camera.rotateZ(r[2].x);
    }
  }

  // The crash camera: a spring behind and over the wreck's travel, looking at
  // the wreck, or between it and `focus` (a rival it's aimed at).
  crashCam(pose, car, frameDt, focus) {
    if (!this.crash) this.crash = { pos: this.camera.position.clone(), vel: new THREE.Vector3(), dir: this.heading.clone() };
    const c = this.crash;
    // Behind the wreck's travel; a slow, spinning wreck keeps the last direction.
    _vel.set(car.vel.x, 0, car.vel.z);
    if (_vel.length() > 2) c.dir.copy(_vel.normalize());
    const dir = c.dir;
    const spread = focus ? Math.hypot(focus.x - pose.pos.x, focus.z - pose.pos.z) : 0;
    const dist = CRASH_CAM.dist + spread * 0.5;
    const target = _target.set(pose.pos.x - dir.x * dist, pose.pos.y + CRASH_CAM.height + spread * 0.2, pose.pos.z - dir.z * dist);
    for (let left = frameDt; left > 1e-6; left -= CRASH_CAM.maxStep) {
      const h = Math.min(left, CRASH_CAM.maxStep);
      c.vel.addScaledVector(_look.copy(target).sub(c.pos).multiplyScalar(CRASH_CAM.spring).addScaledVector(c.vel, -CRASH_CAM.damping), h);
      c.pos.addScaledVector(c.vel, h);
    }
    const cam = this.camera.position.copy(c.pos);
    const g = this.track.query(cam.x, cam.z, this.hint);
    this.hint = g.index;
    cam.y = Math.max(cam.y, g.height + 0.8);
    const ceil = this.track.ceilingAt?.(cam.x, cam.z, pose.pos.y);
    if (ceil != null) cam.y = Math.min(cam.y, ceil - 0.9);
    c.pos.y = cam.y;
    // Mostly the wreck, so it stays well inside the frame (B3's safe frame).
    _look.copy(pose.pos);
    if (focus) _look.lerp(focus, 0.35);
    this.camera.lookAt(_look);
  }

  // mode: one of CAMERA_MODES. eyes: the car view's windshieldEyes(), for that mode.
  // focus: while wrecked, a rival's position for the crash camera to frame too.
  update(pose, car, frameDt, { lookBack = false, mode = 'chase', eyes = null, focus = null } = {}) {
    // Follow a blend of where the car points and where it's going, so drifts
    // show the car's angle instead of the camera swinging with it.
    _fwd.set(0, 0, -1).applyQuaternion(pose.quat);
    _fwd.y = 0;
    _fwd.normalize();
    _vel.set(car.vel.x, 0, car.vel.z);
    const speed = _vel.length();
    if (speed > 3) _fwd.lerp(_vel.normalize(), 0.35).normalize();
    this.heading.lerp(_fwd, 1 - Math.exp(-7 * frameDt)).normalize();

    // Speed feel (Burnout-style): intensity ramps in from ~90 km/h.
    const s = Math.min(1, Math.max(0, (speed - 25) / 45));
    const boosting = car.nitro.active > 0;
    this.boost = (this.boost || 0) + ((boosting ? 1 : 0) - (this.boost || 0)) * (1 - Math.exp(-6 * frameDt));
    this.intensity = Math.min(1, s * s * 0.85 + this.boost * 0.45);

    const cam = this.camera.position;
    // A wreck is watched from outside, by the crash camera.
    if (car.wrecked) {
      this.crashCam(pose, car, frameDt, focus);
      this.height = null; // the chase camera starts afresh after
    } else if (mode === 'windshield' && eyes) {
      this.crash = null;
      // Fixed to the car: pitches, rolls and bumps with it.
      cam.copy(lookBack ? eyes.rear : eyes.front).applyQuaternion(pose.quat).add(pose.pos);
      this.camera.quaternion.copy(pose.quat);
      if (lookBack) this.camera.rotateY(Math.PI);
      this.camera.rotateX(-0.05); // tipped down a touch, so the bonnet shows
      this.height = null; // the chase camera starts afresh after
    } else {
      this.crash = null;
      const dir = lookBack ? this.heading.clone().negate() : this.heading;
      const chase = CHASE[mode] || CHASE.chase;
      const k = chase.dist / CHASE.chase.dist; // the far camera scales the speed pull-back too
      const dist = chase.dist + (s * 0.6 + this.boost * 1.4) * k;
      const targetY = pose.pos.y + chase.height - s * 0.45;
      this.height = this.height === null ? targetY : this.height + (targetY - this.height) * (1 - Math.exp(-10 * frameDt));

      cam.set(pose.pos.x - dir.x * dist, this.height, pose.pos.z - dir.z * dist);
      const g = this.track.query(cam.x, cam.z, this.hint);
      this.hint = g.index;
      cam.y = Math.max(cam.y, g.height + 0.8);
      // Under a ceiling (the Undercity's deck, a tunnel's roof): stay beneath it.
      const ceil = this.track.ceilingAt?.(cam.x, cam.z, pose.pos.y);
      if (ceil != null) cam.y = Math.min(cam.y, ceil - 0.9);

      _look.set(pose.pos.x + dir.x * 4, pose.pos.y + 0.7, pose.pos.z + dir.z * 4);
      this.camera.lookAt(_look);
    }

    // Shake grows with speed; boost adds a rumble.
    const shake = s * s * 0.05 + this.boost * 0.06;
    if (shake > 0.001) {
      cam.x += (Math.random() - 0.5) * shake;
      cam.y += (Math.random() - 0.5) * shake;
    }
    this.applyKicks(frameDt);
    const targetFov = 64 + s * 24 + this.boost * 12;
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-4 * frameDt));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
