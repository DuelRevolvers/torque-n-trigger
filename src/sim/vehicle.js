// Arcade raycast vehicle: a rigid body with one suspension ray per wheel, a
// slip-angle tire model with a friction circle, and an automatic gearbox.
// All state lives in the plain `car` object so it can be snapshotted and synced.

import { GRAVITY, PHYSICS_SUBSTEPS } from '../config.js';
import { SURFACE } from './track.js';
import {
  v3, add, sub, scale, dot, cross, length, normalize, clamp, approach,
  quatRotate, quatRotateInv, quatIntegrate, quatFromYaw,
} from './math.js';
import { NITRO } from './rules.js';
import { nitroKick } from './nitro.js';

const WORLD_UP = v3(0, 1, 0);
const LOCAL_UP = WORLD_UP;
const LOCAL_FWD = v3(0, 0, -1);
const LOCAL_RIGHT = v3(1, 0, 0);
const RAD_S_TO_RPM = 60 / (2 * Math.PI);

// Indexed by SURFACE value.
const SURFACE_GRIP = [1, 0.95, 0.72, 0.55, 0.58]; // road, kerb, grass/dirt, sand, wet grass
const SURFACE_DRAG = [0, 0, 25, 90, 30]; // extra rolling resistance, N per m/s per wheel

export function createCarState(id, params, pose) {
  const car = {
    id,
    pos: v3(),
    vel: v3(),
    quat: quatFromYaw(0),
    angVel: v3(),
    steer: 0,
    gear: 1,
    reverse: false,
    rpm: params.engine.idleRpm,
    shiftTimer: 0,
    wheelspin: 0,
    braking: false,
    wheels: params.wheels.map(() => ({ compression: 0, load: 0, contact: false, spin: 0, surface: SURFACE.ROAD })),
    nitro: { charges: params.nitro.charges, active: 0, recharge: 0 },
    prevNitro: false,
    prevReset: false,
    trackIndex: -1,
    trackS: 0,
    lateral: 0,
    stuckTime: 0,
    race: { lap: 0, lapStart: -1, lastLap: -1, bestLap: -1, halfway: false, prevS: -1 },
  };
  placeCar(car, params, pose);
  return car;
}

// Puts the car at a pose ({ pos, yaw }) at rest. Used for spawning and respawning.
export function placeCar(car, params, pose) {
  car.pos = { ...pose.pos };
  car.vel = v3();
  car.quat = quatFromYaw(pose.yaw);
  car.angVel = v3();
  car.steer = 0;
  car.gear = 1;
  car.reverse = false;
  car.rpm = params.engine.idleRpm;
  car.shiftTimer = 0;
  car.wheelspin = 0;
  car.stuckTime = 0;
  car.trackIndex = -1;
  for (const w of car.wheels) {
    w.compression = 0;
    w.load = 0;
    w.contact = false;
  }
}

export function stepCar(car, params, input, track, dt) {
  const center = track.query(car.pos.x, car.pos.z, car.trackIndex, car.pos.y);
  car.trackIndex = center.index;
  car.trackS = center.s;
  car.lateral = center.trueLateral ?? center.lateral;

  updateNitro(car, params, input, dt);
  updateSteering(car, params, input, dt);
  const control = updateDrivetrain(car, params, input, dt);

  const h = dt / PHYSICS_SUBSTEPS;
  for (let i = 0; i < PHYSICS_SUBSTEPS; i++) physicsSubstep(car, params, control, track, h);

  updateWheelSpin(car, params, control, dt);
  car.prevNitro = input.nitro;
  car.prevShift = input.shiftUp;
}

export const carUp = (car) => quatRotate(car.quat, LOCAL_UP);
export const carForward = (car) => quatRotate(car.quat, LOCAL_FWD);
export const carSpeed = (car) => length(car.vel);

function updateNitro(car, p, input, dt) {
  const n = car.nitro;
  if (input.nitro && !car.prevNitro && n.charges > 0 && n.active <= 0 && !(car.shocked > 0)) {
    n.charges--;
    n.active = p.nitro.duration;
  }
  n.active = Math.max(0, n.active - dt);
  // (The timed refill is slow: nitrous is earned by fighting and risky driving, sim/nitro.js.)
  if (n.charges < p.nitro.charges) {
    n.recharge += dt * NITRO.idleRate;
    if (n.recharge >= p.nitro.rechargeTime) {
      n.charges++;
      n.recharge = 0;
    }
  } else {
    n.recharge = 0;
  }
}

function updateSteering(car, p, input, dt) {
  const s = p.steering;
  const fwd = quatRotate(car.quat, LOCAL_FWD);
  const right = quatRotate(car.quat, LOCAL_RIGHT);
  const vLong = dot(car.vel, fwd);
  const vLat = dot(car.vel, right);

  let target = input.steer * s.max / (1 + Math.max(0, vLong) / s.speedFalloff);
  // Counter-steer assist: in a slide, the front wheels lean toward the direction
  // of travel, which is what makes drifts easy to hold.
  if (vLong > 4) target += clamp(Math.atan2(vLat, vLong), -0.6, 0.6) * s.counterSteerAssist;
  target = clamp(target, -s.max, s.max);

  const returning = Math.abs(target) < Math.abs(car.steer) || Math.sign(target) !== Math.sign(car.steer);
  car.steer = approach(car.steer, target, (returning ? s.returnRate : s.rate) * dt);
}

// Torque at rpm. 'flat' curves (electric) make full torque from zero; turbos add
// torque once past their spool rpm.
export function engineTorque(e, rpm) {
  const x = rpm / e.redline;
  let shape = e.curve === 'flat' ? clamp(1.15 - 0.3 * x, 0.8, 1) : clamp(1 - 1.6 * (x - 0.65) ** 2, 0.35, 1);
  if (e.flatten) shape += (1 - shape) * e.flatten; // arcade: less peaky power
  const turbo = e.turboBoost ? e.turboBoost * clamp((rpm - e.turboRpm) / 1500, 0, 1) : 0;
  return e.maxTorque * shape * (1 + turbo);
}

function updateDrivetrain(car, p, input, dt) {
  const t = p.transmission;
  const e = p.engine;
  const vLong = dot(car.vel, quatRotate(car.quat, LOCAL_FWD));

  // Brake at a standstill engages reverse; throttle while (nearly) stopped leaves it.
  if (!car.reverse) {
    if (input.brake > 0.2 && input.throttle < 0.1 && vLong < 0.5) car.reverse = true;
  } else if (input.throttle > 0.2 && vLong > -0.5) {
    car.reverse = false;
  }
  const throttle = car.reverse ? input.brake : input.throttle;
  const brake = car.reverse ? input.throttle : input.brake;

  const ratioOf = (gear) => (car.reverse ? t.reverse : t.gears[gear - 1]) * t.finalDrive;
  const wheelRpm = (ratio) => (Math.abs(vLong) / p.wheelRadius) * ratio * RAD_S_TO_RPM;

  car.shiftTimer = Math.max(0, car.shiftTimer - dt);
  if (car.reverse) {
    car.gear = 1;
  } else if (car.manual) {
    // Manual gearbox (drag races): the driver shifts up; stopping drops to 1st.
    if (Math.abs(vLong) < 2) car.gear = 1;
    else if (input.shiftUp && !car.prevShift && car.gear < t.gears.length && car.shiftTimer === 0) {
      car.gear++;
      car.shiftTimer = t.shiftTime;
    }
  } else if (car.shiftTimer === 0) {
    const rpmNow = wheelRpm(ratioOf(car.gear));
    if (rpmNow > t.shiftUpRpm && car.gear < t.gears.length) {
      car.gear++;
      car.shiftTimer = t.shiftTime;
    } else if (rpmNow < t.shiftDownRpm && car.gear > 1) {
      car.gear--;
      car.shiftTimer = t.shiftTime * 0.5;
    }
  }

  const ratio = ratioOf(car.gear);
  // Below the launch RPM the clutch slips, so the engine can make torque from a standstill.
  const rpm = Math.max(wheelRpm(ratio), e.idleRpm + throttle * (e.launchRpm - e.idleRpm));
  let torque = engineTorque(e, rpm) * throttle * (car.mods ? car.mods.torque : 1);
  if (rpm > e.redline) torque = 0;

  let drive = (torque * ratio * t.efficiency) / p.wheelRadius;
  if (car.shiftTimer > 0) drive *= p.arcade ? p.arcade.shiftKeep : 0.25;
  if (car.reverse) drive = vLong < -p.maxReverseSpeed ? 0 : -drive;
  else if (car.nitro.active > 0) drive += p.nitro.force * nitroKick(p.nitro.duration - car.nitro.active);

  car.rpm = Math.min(e.redline + 150, rpm + car.wheelspin * 1500);
  car.braking = brake > 0.05;
  return { drive, brake, handbrake: input.handbrake, throttle, reverse: car.reverse, steerIn: input.steer, brakeIn: car.reverse ? 0 : input.brake };
}

function physicsSubstep(car, p, ctl, track, h) {
  const q = car.quat;
  const up = quatRotate(q, LOCAL_UP);
  const susp = p.suspension;
  const wheelCount = p.wheels.length;
  const massShare = p.mass / wheelCount;
  const drivenCount = p.wheels.filter((w) => w.drive).length || 1;

  let force = v3(0, -GRAVITY * p.mass, 0);
  let torque = v3();
  const addForceAt = (r, f) => {
    force = add(force, f);
    torque = add(torque, cross(r, f));
  };

  // Pass 1: suspension rays.
  const hits = [];
  for (let i = 0; i < wheelCount; i++) {
    const w = p.wheels[i];
    const rMount = quatRotate(q, w);
    const mount = add(car.pos, rMount);
    // (Its foot: the tyre's bottom now, so it climbs onto nothing taller than a kerb.)
    const g = track.query(mount.x, mount.z, car.trackIndex, mount.y, mount.y - (susp.rest - car.wheels[i].compression) - p.wheelRadius);
    const n = v3(g.nx, g.ny, g.nz);
    const upDotN = dot(up, n);
    let comp = 0;
    let contact = false;
    if (upDotN > 0.25) {
      const len = ((mount.y - g.height) * g.ny) / upDotN - p.wheelRadius;
      if (len < susp.rest) {
        contact = true;
        comp = susp.rest - len;
      }
    }
    const compVel = contact ? (comp - car.wheels[i].compression) / h : 0;
    hits.push({ w, rMount, g, n, comp, compVel, contact });
  }

  // Loads, with an anti-roll bar across each axle.
  const loads = hits.map((hit) => {
    if (!hit.contact) return 0;
    let f = susp.stiffness * hit.comp + susp.damping * hit.compVel;
    if (hit.comp > susp.travel) f += (hit.comp - susp.travel) * susp.stiffness * 8; // bump stop
    return f;
  });
  for (let i = 0; i + 1 < wheelCount; i += 2) {
    const a = hits[i];
    const b = hits[i + 1];
    if (a.contact && b.contact) {
      const roll = (a.comp - b.comp) * susp.antiRoll;
      loads[i] += roll;
      loads[i + 1] -= roll;
    }
  }

  let anyContact = false;
  let wheelspin = 0;
  for (let i = 0; i < wheelCount; i++) {
    const hit = hits[i];
    const ws = car.wheels[i];
    ws.contact = hit.contact;
    ws.compression = hit.comp;
    if (!hit.contact) {
      ws.load = 0;
      continue;
    }
    anyContact = true;
    const w = hit.w;
    const load = clamp(loads[i], 0, p.mass * GRAVITY * 3);
    ws.load = load;
    ws.surface = hit.g.surface;
    addForceAt(hit.rMount, scale(up, load));

    // Tire frame on the ground plane.
    const n = hit.n;
    const steer = w.steer ? car.steer : 0;
    let wf = quatRotate(q, v3(Math.sin(steer), 0, -Math.cos(steer)));
    wf = normalize(sub(wf, scale(n, dot(wf, n))));
    const wr = cross(wf, n);
    const rTire = quatRotate(q, v3(w.x, p.tireForceY, w.z));
    const vc = add(car.vel, cross(car.angVel, rTire));
    const vLong = dot(vc, wf);
    const vLat = dot(vc, wr);

    const maxF = (w.front ? p.gripFront : p.gripRear) * (p.surfaceGrip || SURFACE_GRIP)[hit.g.surface] * load * (car.mods ? car.mods.grip : 1);

    // Longitudinal: drive, brakes, rolling resistance.
    let fx = w.drive ? ctl.drive / drivenCount : 0;
    let brakeF = ctl.brake * p.brakeForce * (w.front ? p.brakeBias : 1 - p.brakeBias) * 0.5 * (car.mods ? car.mods.brake : 1);
    if (ctl.handbrake && !w.front) brakeF += p.handbrakeForce * 0.5;
    if (brakeF > 0) fx -= Math.sign(vLong) * Math.min(brakeF, (Math.abs(vLong) * massShare) / h);
    fx -= Math.sign(vLong) * Math.min(p.rollingResistance, (Math.abs(vLong) * massShare) / h);
    // Off the throttle: engine braking and drag slow the car down quickly.
    if (p.coastDecel && !(ctl.throttle > 0.05)) fx -= Math.sign(vLong) * Math.min(p.coastDecel * massShare, (Math.abs(vLong) * massShare) / h);
    fx -= vLong * SURFACE_DRAG[hit.g.surface];

    // Friction circle: a wheel using its grip to drive or brake has less to turn.
    const demand = Math.abs(fx) / Math.max(maxF, 1);
    if (demand > 1) {
      fx /= demand;
      if (w.drive && ctl.drive !== 0) wheelspin = Math.max(wheelspin, Math.min(1, demand - 1));
    }
    const retain = Math.max(p.minLateralRetain, Math.sqrt(Math.max(0, 1 - Math.min(1, demand) ** 2)));
    const latGrip = maxF * retain * (ctl.handbrake && !w.front ? p.handbrakeGrip : 1) * (!w.front && car.driftKick > 0 ? 0.5 : 1);

    // Lateral: slip-angle curve that peaks, then falls off to a sliding value.
    const alpha = Math.atan2(vLat, Math.max(Math.abs(vLong), p.lowSpeedSlip));
    const fy = -Math.sign(alpha) * lateralCurve(Math.abs(alpha), p.slipPeak, p.slideGrip) * latGrip;

    addForceAt(rTire, add(scale(wf, fx), scale(wr, fy)));
  }
  car.wheelspin = wheelspin;

  const speed = length(car.vel);
  force = add(force, scale(car.vel, -p.drag * speed));
  if (anyContact) {
    force = add(force, scale(up, -p.downforce * speed * speed));
    torque = add(torque, driftAssistTorque(car, p));
    if (p.arcade) {
      const a = arcadeAssist(car, p, ctl, h);
      force = add(force, a.force);
      torque = add(torque, a.torque);
    }
  } else {
    // Gentle mid-air self-righting, so jumps land wheels-down more often than not.
    torque = add(torque, scale(cross(up, WORLD_UP), p.airLeveling));
    torque = add(torque, scale(car.angVel, -p.airDamping));
  }

  // Integrate.
  car.vel = add(car.vel, scale(force, h / p.mass));
  const I = p.inertia;
  const wb = quatRotateInv(q, car.angVel);
  const tb = quatRotateInv(q, torque);
  const damp = 1 / (1 + p.angularDamping * h);
  wb.x = (wb.x + (tb.x / I.x) * h) * damp;
  wb.y = (wb.y + (tb.y / I.y) * h) * damp;
  wb.z = (wb.z + (tb.z / I.z) * h) * damp;
  car.angVel = quatRotate(q, wb);
  car.pos = add(car.pos, scale(car.vel, h));
  car.quat = quatIntegrate(q, car.angVel, h);

  resolveBodyContacts(car, p, track);
}

// Arcade assists (params.arcade): extra thrust that fades with speed, a yaw
// assist that turns the car at the rate its steering asks for (up to latG), and
// velocity alignment so the car goes where it points. The handbrake and big
// slides switch alignment off so drifting still works.
function arcadeAssist(car, p, ctl, h) {
  const a = p.arcade;
  const fwd = quatRotate(car.quat, LOCAL_FWD);
  const right = quatRotate(car.quat, LOCAL_RIGHT);
  const up = quatRotate(car.quat, LOCAL_UP);
  const vLong = dot(car.vel, fwd);
  const vLat = dot(car.vel, right);
  const speed = Math.abs(vLong);
  // Drifts get harder to start and hold the slower you go: 0 at 36 km/h, 1 from 126 km/h.
  const pace = clamp((speed - 10) / 25, 0, 1);
  let force = v3();
  let torque = v3();

  if (!ctl.reverse && ctl.throttle > 0) {
    force = scale(fwd, ctl.throttle * p.mass * a.thrust * clamp(1 - vLong / a.thrustFade, 0, 1));
  } else if (ctl.reverse && ctl.throttle > 0 && a.reverseThrust && -vLong < p.maxReverseSpeed) {
    force = scale(fwd, -ctl.throttle * p.mass * a.reverseThrust);
  }

  // Drift (Burnout-style): tap the brake or handbrake while steering hard at
  // speed. The tail kicks out, the angle follows how hard you steer into the
  // turn, and straightening or counter-steering ends it.
  const slide = Math.atan2(Math.abs(vLat), Math.max(speed, 1));
  const steerIn = ctl.steerIn || 0;
  if (!car.drifting && vLong > 12 && Math.abs(steerIn) > 0.45 && (ctl.handbrake || (ctl.brakeIn > 0.4 && vLong > 16))) {
    car.drifting = true;
    car.driftDir = Math.sign(steerIn);
    car.driftKick = 0.35;
    car.driftExit = 0;
    car.angVel = add(car.angVel, scale(up, -car.driftDir * a.driftKick * (0.4 + 0.6 * pace)));
  }
  if (car.drifting) {
    car.driftKick = Math.max(0, car.driftKick - h);
    const holding = Math.sign(steerIn) === car.driftDir && Math.abs(steerIn) > 0.15;
    car.driftExit = holding ? 0 : car.driftExit + h;
    if (car.driftExit > 0.15 || speed < 6 || (car.driftKick === 0 && slide < 0.15)) {
      car.drifting = false;
      car.regrip = 0.8; // then grip back hard, whatever the slide angle
    }
  }
  const drifting = !!car.drifting;

  const wheelbase = Math.abs(p.wheels[2].z - p.wheels[0].z);
  if (speed > 1.5) {
    const limit = (a.latG * GRAVITY) / speed;
    let want;
    if (drifting) {
      // Hold a drift angle set by how hard you steer into the turn.
      const target = (a.driftAngleMin + (a.driftAngleMax - a.driftAngleMin) * Math.min(1, Math.abs(steerIn))) * (0.45 + 0.55 * pace);
      const angle = Math.atan2(-vLat * car.driftDir, speed); // > 0: nose inside the turn
      want = -car.driftDir * (limit * 0.9 + (target - angle) * 3);
    } else {
      const kinematic = (speed * Math.tan(car.steer)) / wheelbase;
      want = -Math.sign(vLong) * clamp(kinematic, -limit, limit);
    }
    const yaw = dot(car.angVel, up);
    torque = scale(up, (want - yaw) * p.inertia.y * (drifting ? a.yawGain * 0.6 : a.yawGain));
  }

  car.regrip = Math.max(0, (car.regrip || 0) - h);
  if (!ctl.handbrake && (drifting || car.regrip > 0 || slide < a.alignMaxSlip)) {
    const k = Math.min(1, (drifting ? a.driftAlign * (1 + 3 * (1 - pace)) : car.regrip > 0 ? a.align * a.regrip : a.align) * h);
    car.vel = sub(car.vel, scale(right, vLat * k));
    // Keep the speed: redirect the removed sideways motion forward.
    car.vel = add(car.vel, scale(fwd, Math.sign(vLong || 1) * (Math.hypot(vLong, vLat) - Math.hypot(vLong, vLat * (1 - k)))));
  }
  return { force, torque };
}

// Arcade drift control: once the slide angle passes driftAngle, yaw that would
// widen it further is damped, so a drift holds instead of becoming a spin.
function driftAssistTorque(car, p) {
  const s = p.steering;
  const fwd = quatRotate(car.quat, LOCAL_FWD);
  const right = quatRotate(car.quat, LOCAL_RIGHT);
  const vLong = dot(car.vel, fwd);
  const vLat = dot(car.vel, right);
  if (Math.hypot(vLong, vLat) < 4) return v3();
  const beta = Math.atan2(vLat, Math.abs(vLong));
  const up = quatRotate(car.quat, LOCAL_UP);
  const yawRate = dot(car.angVel, up);
  // Positive yaw (turning left) pushes the velocity to the right of the heading.
  const widening = Math.sign(yawRate) === Math.sign(beta);
  const excess = Math.abs(beta) - (s.driftAngle + (car.drifting ? 0.35 : 0));
  if (!widening || excess <= 0) return v3();
  const strength = Math.min(1, excess / 0.5);
  return scale(up, -yawRate * p.inertia.y * s.driftDamping * strength);
}

function lateralCurve(a, peak, slide) {
  if (a < peak) return a / peak;
  return Math.max(slide, 1 - ((a - peak) / (2 * peak)) * (1 - slide));
}

// Keeps the body box out of the ground and inside the walls.
function resolveBodyContacts(car, p, track) {
  const { width, height, length: len, offsetY } = p.body;
  const hx = width / 2;
  const hy = height / 2;
  const hz = len / 2;

  // Each corner's foot is the body's bottom there (the lower of the two corners
  // at that end and side): a corner pressed into a side isn't up on top.
  const corners = [];
  const foot = {};
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const r = quatRotate(car.quat, v3(sx * hx, offsetY + sy * hy, sz * hz));
        const pt = add(car.pos, r);
        corners.push([r, pt, sx * 2 + sz]);
        foot[sx * 2 + sz] = Math.min(foot[sx * 2 + sz] ?? Infinity, pt.y);
      }
    }
  }
  let groundPen = 0;
  let groundN = null;
  for (const [r, pt, k] of corners) {
    const g = track.query(pt.x, pt.z, car.trackIndex, pt.y, foot[k]);
    const pen = (g.height - pt.y) * g.ny;
    if (pen > 0) {
      const n = v3(g.nx, g.ny, g.nz);
      applyContactImpulse(car, p, r, n, 0.1, 0.6);
      if (pen > groundPen) {
        groundPen = pen;
        groundN = n;
      }
    }
  }
  if (groundN) {
    car.pos = add(car.pos, scale(groundN, groundPen));
    for (const k in foot) foot[k] += groundN.y * groundPen;
  }

  let wallPen = 0;
  let wallN = null;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const r = quatRotate(car.quat, v3(sx * hx, offsetY, sz * hz));
      const pt = add(car.pos, r);
      const g = track.query(pt.x, pt.z, car.trackIndex, pt.y, foot[sx * 2 + sz]);
      const excess = Math.abs(g.lateral) - track.wallDist;
      if (excess > 0) {
        const side = -Math.sign(g.lateral);
        const n = v3(g.rx * side, 0, g.rz * side);
        car.impact = Math.max(car.impact || 0, -applyContactImpulse(car, p, r, n, 0.25, 0.3));
        if (excess > wallPen) {
          wallPen = excess;
          wallN = n;
        }
      }
    }
  }
  if (wallN) car.pos = add(car.pos, scale(wallN, wallPen));
}

function invInertiaWorld(car, p, v) {
  const b = quatRotateInv(car.quat, v);
  return quatRotate(car.quat, v3(b.x / p.inertia.x, b.y / p.inertia.y, b.z / p.inertia.z));
}

// Impulse at body-relative point r against a surface with normal n.
function applyContactImpulse(car, p, r, n, restitution, friction) {
  const vc = add(car.vel, cross(car.angVel, r));
  const vn = dot(vc, n);
  if (vn >= 0) return 0;

  const effMass = (dir) => 1 / p.mass + dot(cross(invInertiaWorld(car, p, cross(r, dir)), r), dir);
  const jn = (-(1 + restitution) * vn) / effMass(n);
  let impulse = scale(n, jn);

  const vt = sub(vc, scale(n, vn));
  const vtLen = length(vt);
  if (vtLen > 1e-4) {
    const t = scale(vt, 1 / vtLen);
    const jt = Math.min(friction * jn, vtLen / effMass(t));
    impulse = sub(impulse, scale(t, jt));
  }

  car.vel = add(car.vel, scale(impulse, 1 / p.mass));
  car.angVel = add(car.angVel, invInertiaWorld(car, p, cross(r, impulse)));
  return vn;
}

// Visual wheel rotation, kept in state so every peer renders the same thing.
function updateWheelSpin(car, p, ctl, dt) {
  const fwd = quatRotate(car.quat, LOCAL_FWD);
  const vLong = dot(car.vel, fwd);
  for (let i = 0; i < p.wheels.length; i++) {
    const w = p.wheels[i];
    const ws = car.wheels[i];
    let omega = vLong / p.wheelRadius;
    if (w.drive) omega += car.wheelspin * 30 * Math.sign(ctl.drive);
    if (ctl.handbrake && !w.front && ws.contact) omega = 0;
    ws.spin = (ws.spin + omega * dt) % (2 * Math.PI);
  }
}
