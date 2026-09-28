// Turns a set of installed parts into: effective part stats, fitting results, the
// car's core stats and Performance Rating, and the physics params the sim drives.
//
// A build is { parts: { [slot]: part | null } }.
// A part is { uid, slot, type, quality, traits: [], condition: 0..100, color? }.

import { PART_TYPES, QUALITY, SCALING, INVERSE_SCALING, TRAITS, SIZES, REQUIRED_SLOTS, SLOT_NAMES } from './catalog.js';
import { engineTorque } from '../sim/vehicle.js';
import { GRAVITY } from '../config.js';

// Condition: full stats down to 50%, then a linear drop to half at 1%; 0% = broken.
export function conditionFactor(condition) {
  if (condition <= 0) return 0;
  return condition >= 50 ? 1 : 0.5 + condition / 100;
}

// Effective stats of one part after quality, traits and condition.
export function resolvePart(part) {
  const base = PART_TYPES[part.slot]?.[part.type];
  if (!base) throw new Error(`Unknown part ${part.slot}/${part.type}`);
  const q = QUALITY[part.quality].mult;
  const traits = (part.traits || []).map((t) => TRAITS[t]);
  const perf = traits.reduce((m, t) => m * (t.perfMul || 1), 1);
  const cf = conditionFactor(part.condition ?? 100);
  const out = { ...base, type: part.type, broken: cf === 0 };
  for (const [key, s] of Object.entries(SCALING)) {
    if (typeof base[key] === 'number') out[key] = base[key] * (1 + (q - 1) * s) * perf * cf;
  }
  for (const [key, s] of Object.entries(INVERSE_SCALING)) {
    if (typeof base[key] === 'number') out[key] = base[key] / ((1 + (q - 1) * s) * perf);
  }
  if (typeof base.charges === 'number') out.charges = cf === 0 ? 0 : base.charges;
  for (const t of traits) {
    if (t.weightMul) out.weight *= t.weightMul;
    if (t.hpMul && out.hp) out.hp *= t.hpMul;
    if (t.heatMul) {
      if (out.heat) out.heat *= t.heatMul;
      if (out.heatPerShot) out.heatPerShot *= t.heatMul;
    }
  }
  out.durability = traits.reduce((m, t) => m * (t.durability || 1), 1);
  return out;
}

// Can `part` go into `slot` on this build? Returns { ok, reason }.
export function canFit(build, part) {
  const chassisPart = part.slot === 'chassis' ? part : build.parts.chassis;
  if (!chassisPart) return { ok: part.slot === 'chassis', reason: 'Install a chassis first' };
  const mounts = PART_TYPES.chassis[chassisPart.type].mounts;
  const check = (slot, p) => {
    if (!p || !mounts[slot]) return null;
    const size = PART_TYPES[slot][p.type].size;
    return SIZES[size] > SIZES[mounts[slot]] ? `${PART_TYPES[slot][p.type].name} (${size}) needs a ${size} ${SLOT_NAMES[slot].toLowerCase()} mount; this chassis has ${mounts[slot]}` : null;
  };
  if (part.slot === 'chassis') {
    // Swapping the chassis must still fit everything already installed.
    for (const slot of Object.keys(mounts)) {
      const reason = check(slot, build.parts[slot]);
      if (reason) return { ok: false, reason: reason.replace('this chassis', PART_TYPES.chassis[part.type].name) };
    }
    return { ok: true };
  }
  const reason = check(part.slot, part);
  return reason ? { ok: false, reason } : { ok: true };
}

export function computeBuild(build) {
  const eff = {};
  for (const [slot, part] of Object.entries(build.parts)) if (part) eff[slot] = resolvePart(part);

  const errors = [];
  const warnings = [];
  for (const slot of REQUIRED_SLOTS) if (!eff[slot]) errors.push(`Missing ${SLOT_NAMES[slot].toLowerCase()}`);
  if (errors.length) return { ok: false, errors, warnings, eff };
  for (const part of Object.values(build.parts)) {
    if (part && part.slot !== 'chassis') {
      const fit = canFit(build, part);
      if (!fit.ok) errors.push(fit.reason);
    }
  }

  const weight = Object.values(eff).reduce((w, p) => w + (p.weight || 0), 0);
  const capacity = eff.chassis.weightCapacity;
  const overweight = Math.max(0, weight / capacity - 1);
  if (overweight > 0) warnings.push(`Over weight capacity by ${Math.round(weight - capacity)} kg: handling and acceleration suffer`);

  const powerSupply = eff.engine.power;
  const powerDraw = ['primaryWeapon', 'secondaryWeapon', 'utility'].reduce((s, k) => s + (eff[k]?.powerDraw || 0), 0);
  if (powerDraw > powerSupply) warnings.push('Weapons draw more power than the engine makes: acceleration drops while firing');
  for (const [slot, p] of Object.entries(eff)) if (p.broken) warnings.push(`${SLOT_NAMES[slot]} is broken`);

  const params = deriveParams(eff, weight, overweight, powerSupply, powerDraw);
  const stats = coreStats(eff, params, weight);
  return { ok: errors.length === 0, errors, warnings, eff, weight, capacity, powerSupply, powerDraw, params, stats, pr: performanceRating(stats) };
}

// Global feel tuning: arcade punch on top of the part stats.
const TORQUE_BOOST = 1.4;
const FINAL_DRIVE_SCALE = 0.88; // taller gearing so top speed is drag-limited, not rev-limited
const DRAG_SCALE = 0.9;
const GRIP_BOOST = 1.08; // sharper turn-in and more cornering grip
const STEER = { max: 0.66, falloff: 16, rate: 7.5, returnRate: 10 };
// Arcade handling layer (see vehicle.js arcadeAssist).
const ARCADE = {
  thrust: 3.2, // m/s^2 of extra pull at low speed...
  thrustFade: 75, // ...fading to nothing at this speed (m/s)
  shiftKeep: 0.8, // share of power kept during a gear change
  latG: 1.5, // cornering the yaw assist may ask for, in g
  yawGain: 6, // how firmly the car follows the steering
  align: 2.6, // per second: how fast sideways motion turns into forward motion
  driftAlign: 0.6, // ...while drifting, on street tyres (scaled by wheel grip: better wheels slide less)
  regrip: 1.6, // align boost just after a drift (also scaled by wheel grip)
  driftKick: 1.1, // rad/s of yaw added when a drift starts
  driftAngleMin: 0.28, // drift angle (rad) with light steering...
  driftAngleMax: 0.55, // ...and with full lock into the turn
  alignMaxSlip: 0.65, // rad: slides bigger than this are left alone (drifts)
};

// Drift traction from wheel grip: 1 on stock street tyres, up to ~2x on the best.
const tyreHold = (grip) => Math.min(2.2, Math.max(0.5, (grip / 1.2) ** 2));

// Physics params in the shape vehicle.js expects.
function deriveParams(eff, mass, overweight, powerSupply, powerDraw) {
  const ch = eff.chassis;
  const eng = eff.engine;
  const sus = eff.suspension;
  const tr = eff.transmission;
  const wh = eff.wheels;
  const heavyPenalty = 1 / (1 + 2 * overweight);
  const handling = Math.min(1.35, sus.handling * (1 + (eff.interiors?.controls || 0)) / (1 + 2.5 * overweight));

  const massShare = mass / 4;
  const omega = 2 * Math.PI * sus.frequency;
  const stiffness = massShare * omega * omega;
  const halfWb = ch.wheelbase / 2;
  const halfTrack = ch.track / 2;
  const driven = (front) => ch.drive === 'awd' || (ch.drive === 'fwd') === front;
  const wheel = (x, z, front) => ({ x, y: -0.05, z, front, steer: front, drive: driven(front) });
  const scaleMass = mass / 1200;

  return {
    mass,
    inertia: {
      x: (mass / 12) * (ch.height ** 2 + ch.length ** 2),
      y: (mass / 12) * (ch.width ** 2 + ch.length ** 2) * 0.9,
      z: (mass / 12) * (ch.width ** 2 + ch.height ** 2) * 1.8,
    },
    body: { width: ch.width, height: ch.height, length: ch.length, offsetY: ch.height / 2 - 0.45 },
    wheelRadius: wh.radius,
    wheels: [
      wheel(-halfTrack, -halfWb, true),
      wheel(halfTrack, -halfWb, true),
      wheel(-halfTrack, halfWb, false),
      wheel(halfTrack, halfWb, false),
    ],
    suspension: {
      rest: sus.rest,
      travel: sus.travel,
      stiffness,
      damping: 2 * sus.damping * Math.sqrt(stiffness * massShare),
      antiRoll: stiffness * sus.antiRoll,
    },
    tireForceY: -0.15,
    gripFront: wh.grip * GRIP_BOOST,
    gripRear: wh.grip * 1.167 * GRIP_BOOST,
    surfaceGrip: [1, 0.95, 0.72 * wh.offroadGrip],
    slipPeak: 0.16,
    slideGrip: 0.82,
    lowSpeedSlip: 3,
    minLateralRetain: 0.55,
    arcade: { ...ARCADE, driftAlign: ARCADE.driftAlign * tyreHold(wh.grip), regrip: ARCADE.regrip * tyreHold(wh.grip) },
    handbrakeGrip: 0.55,
    brakeForce: eff.brakes ? eff.brakes.brakeForce : ch.brakeBase,
    brakeBias: 0.62,
    handbrakeForce: 5000 * scaleMass,
    rollingResistance: 45 * scaleMass,
    drag: (ch.drag * (1 - (eff.bodyKit?.aero || 0)) + (eff.spoiler?.drag || 0)) * DRAG_SCALE,
    downforce: 0.5 + (eff.spoiler?.downforce || 0) * 0.35,
    angularDamping: 0.3,
    airLeveling: 3500 * scaleMass,
    airDamping: 1200 * scaleMass,
    engine: {
      maxTorque: eng.torque * (1 + (eff.exhaust?.torqueBonus || 0)) * heavyPenalty * TORQUE_BOOST,
      idleRpm: 1000,
      launchRpm: eng.curve === 'flat' ? 4500 : 3800,
      redline: eng.redline,
      curve: eng.curve || 'peaky',
      flatten: 0.5,
      turboBoost: eff.turbo?.turboBoost || 0,
      turboRpm: eff.turbo?.spoolRpm || 0,
    },
    transmission: {
      gears: tr.gears,
      reverse: 3.4,
      finalDrive: tr.finalDrive * FINAL_DRIVE_SCALE,
      efficiency: 0.88,
      shiftUpRpm: eng.redline - 300,
      shiftDownRpm: eng.redline * 0.44,
      shiftTime: tr.shiftTime,
    },
    maxReverseSpeed: 12,
    steering: {
      max: STEER.max * handling,
      speedFalloff: STEER.falloff * handling,
      rate: STEER.rate * handling,
      returnRate: STEER.returnRate,
      counterSteerAssist: 0.55,
      driftAngle: 0.45,
      driftDamping: 6,
    },
    nitro: eff.nitrous
      ? { charges: eff.nitrous.charges, duration: eff.nitrous.duration, force: eff.nitrous.force, rechargeTime: eff.nitrous.rechargeTime }
      : { charges: 0, duration: 0, force: 0, rechargeTime: 1 },
    weapons: {
      primary: weaponParams(eff.primaryWeapon),
      secondary: weaponParams(eff.secondaryWeapon),
      utility: eff.utility ? { type: eff.utility.type, cooldown: eff.utility.cooldown } : null,
    },
    durability: Object.fromEntries(Object.entries(eff).map(([slot, e]) => [slot, e.durability])),
    // Combat, heat and damage (sim/combat.js).
    combat: {
      hp: ch.hp + (eff.armor?.hp || 0) + (eff.fuelTank?.hp || 0),
      armor: Math.min(0.6, eff.armor?.armor || 0),
      heatCapacity: eff.cooling?.heatCapacity || 70,
      dissipation: (eff.cooling?.dissipation || 0.7) + (eff.exhaust?.dissipation || 0),
      heatRate: eng.heat + (eff.turbo?.heat || 0),
      powerDeficit: Math.max(0, powerDraw - powerSupply) / Math.max(powerDraw, 1),
      ramDamage: (eff.bodyKit?.ramDamage || 0) + (eff.wheels?.ramDamage || 0),
      ramResist: (sus.ramResist || 1) * (eff.bodyKit?.ramResist || 1),
      rollCage: eff.interiors?.rollCage || 0,
      cooldownMul: 1 - (eff.interiors?.electronics || 0),
      fuel: eff.fuelTank?.capacity || 30,
    },
  };
}

const weaponParams = (w) =>
  w
    ? {
        type: w.type, kind: w.kind, damage: w.damage, fireRate: w.fireRate, range: w.range,
        ammo: w.ammo !== undefined ? Math.round(w.ammo) : null, reload: w.reload || 0, heatPerShot: w.heatPerShot || 0,
      }
    : null;

// Straight-line estimate of 0-100 km/h and top speed with the same torque curve,
// gearing, traction limit and drag as the physics.
function straightLine(p) {
  const t = p.transmission;
  const driveShare = p.wheels.filter((w) => w.drive).length / p.wheels.length;
  const traction = p.gripRear * p.mass * GRAVITY * driveShare * 1.05;
  const redlineSpeed = (gear) => ((p.engine.redline / (gear * t.finalDrive)) * 2 * Math.PI * p.wheelRadius) / 60;
  let v = 0;
  let time = 0;
  let t100 = null;
  let gear = 0;
  const dt = 0.02;
  for (let i = 0; i < 4000; i++) {
    while (gear < t.gears.length - 1 && v > redlineSpeed(t.gears[gear]) * 0.96) gear++;
    const ratio = t.gears[gear] * t.finalDrive;
    const rpm = Math.max((v / p.wheelRadius) * ratio * (60 / (2 * Math.PI)), p.engine.launchRpm);
    let drive = rpm > p.engine.redline ? 0 : (engineTorque(p.engine, rpm) * ratio * t.efficiency) / p.wheelRadius;
    drive = Math.min(drive, traction);
    const a = (drive - p.drag * v * v - p.rollingResistance * 4) / p.mass;
    v = Math.max(0, v + a * dt);
    time += dt;
    if (t100 === null && v >= 100 / 3.6) t100 = time;
  }
  return { top: v * 3.6, t100: t100 ?? 99 };
}

// Core stats shown in the garage. Bars use the 0-100 `score` values.
function coreStats(eff, p, weight) {
  const { top, t100 } = straightLine(p);
  const grip = (p.gripFront + p.gripRear) / 2 + p.downforce * 0.05;
  const handling = p.steering.max / 0.6;
  const brakingG = Math.min(p.brakeForce / (p.mass * GRAVITY), grip);
  const c = p.combat;
  const bar = (v, lo, hi) => Math.round(Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)));
  return {
    topSpeed: { value: Math.round(top), unit: 'km/h', score: bar(top, 120, 280) },
    acceleration: { value: Math.round(t100 * 10) / 10, unit: 's 0-100', score: bar(12 - t100, 0, 9) },
    handling: { value: Math.round(handling * 100) / 100, unit: 'x', score: bar(handling, 0.6, 1.35) },
    grip: { value: Math.round(grip * 100) / 100, unit: 'g', score: bar(grip, 0.8, 1.8) },
    braking: { value: Math.round(brakingG * 100) / 100, unit: 'g', score: bar(brakingG, 0.4, 1.5) },
    weight: { value: Math.round(weight), unit: 'kg', score: bar(weight, 800, 2400) },
    hp: { value: Math.round(c.hp), unit: 'HP', score: bar(c.hp, 200, 1000) },
    armor: { value: Math.round(c.armor * 100), unit: '%', score: bar(c.armor, 0, 0.4) },
    heatCapacity: { value: Math.round(c.heatCapacity), unit: '', score: bar(c.heatCapacity, 40, 250) },
    firepower: { value: Math.round(dps(eff)), unit: 'dps', score: bar(dps(eff), 0, 120) },
  };
}

function dps(eff) {
  return ['primaryWeapon', 'secondaryWeapon'].reduce((s, k) => s + (eff[k] ? eff[k].damage * eff[k].fireRate : 0), 0);
}

// One number for event limits and matchmaking. Roughly 100 (junk heap) to 900+.
export function performanceRating(stats) {
  const s = (k) => stats[k].score;
  return Math.round(
    s('topSpeed') * 1.3 + s('acceleration') * 1.3 + s('handling') * 1.1 + s('grip') * 1.2 + s('braking') * 0.7 +
      s('hp') * 1.6 + s('armor') * 1.2 + s('firepower') * 1.6 + s('heatCapacity') * 0.3,
  );
}
