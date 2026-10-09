// Death Roll (B3 integration, phase 5; B3's "Aftertouch"). For 5 s after a
// human's car is wrecked, steering turns the wreck's velocity about world up,
// keeping its speed, so it can be aimed into a rival. In single player it only
// steers while slow motion (the nitrous button) is held; with more than one
// human there's no slow motion and it steers faster. Pressing fire secondary
// (T&T, not B3) detonates the wreck once, for a nitrous charge, and ends the
// Death Roll. All state is plain data on car.deathRoll.

import { SIM_HZ, SIM_DT } from '../config.js';
import { quatIntegrate } from './math.js';
import { DEATH_ROLL } from './rules.js';
import { explode } from './combat.js';

const RAD = Math.PI / 180;

// Seconds since car i was wrecked.
const since = (world, car) => (world.state.tick - car.wreckTick) / SIM_HZ;

// Inside the Death Roll window (a wrecked human, under 5 s since the wreck)?
export function inWindow(world, i) {
  const car = world.state.cars[i];
  return !!car.wrecked && i < (world.humans || 0) && since(world, car) < DEATH_ROLL.window;
}

// The share of car i's Death Roll window left (1 just wrecked, 0 over or not a
// Death Roll), for the HUD.
export function deathRollLeft(world, i) {
  return inWindow(world, i) ? 1 - since(world, world.state.cars[i]) / DEATH_ROLL.window : 0;
}

// Can car i's wreck be credited with a takedown: in its window, and steered or detonated?
export function deathRollLive(world, i) {
  const dr = world.state.cars[i].deathRoll;
  return inWindow(world, i) && !!(dr?.steered || dr?.blown) && dr.tick === world.state.cars[i].wreckTick;
}

// Can car i detonate its wreck now: in its window, not yet blown, with nitrous left?
export function canDetonate(world, i) {
  const car = world.state.cars[i];
  return inWindow(world, i) && !(car.deathRoll?.tick === car.wreckTick && car.deathRoll.blown) && car.nitro.charges > 0;
}

// Blows car i's wreck up: nearby cars are thrown clear and take blast damage
// (a wreck from it is a Death Roll takedown), and the wreck jumps.
function detonate(world, i) {
  const car = world.state.cars[i];
  const B = DEATH_ROLL.blast;
  car.deathRoll.blown = true;
  car.deathRoll.slow = false;
  car.nitro.charges = Math.max(0, car.nitro.charges - B.cost);
  world.state.cars.forEach((t, j) => {
    const dx = t.pos.x - car.pos.x;
    const dz = t.pos.z - car.pos.z;
    const d = Math.hypot(dx, dz);
    if (j === i || d > B.radius || d < 1e-3) return;
    const k = B.push * (1 - d / B.radius);
    t.vel = { x: t.vel.x + (dx / d) * k, y: t.vel.y + k * 0.4, z: t.vel.z + (dz / d) * k };
  });
  car.vel = { ...car.vel, y: car.vel.y + B.lift };
  explode(world, { ...car.pos }, B.radius, B.damage, i);
}

// Is the single-player slow motion on (car 0 holding it)?
export function slowMotion(world) {
  const car = world.state.cars[0];
  return !!world.slowmo && !!car?.wrecked && !!car.deathRoll?.slow && car.deathRoll.tick === car.wreckTick;
}

// Once a tick, for a wrecked human, with its raw (unneutralised) input.
export function updateDeathRoll(world, i, input) {
  const car = world.state.cars[i];
  if (car.deathRoll?.tick !== car.wreckTick) car.deathRoll = { tick: car.wreckTick, steered: false, slow: false, swing: 0, blown: false, fire: !!input.fire2 };
  const dr = car.deathRoll;
  // (Only a fresh press detonates: a button held through the wreck doesn't.)
  const press = !!input.fire2 && !dr.fire;
  dr.fire = !!input.fire2;
  if (dr.blown) return;
  if (press && canDetonate(world, i)) return detonate(world, i);
  const speed = Math.hypot(car.vel.x, car.vel.z);
  const live = inWindow(world, i) && speed > DEATH_ROLL.minSpeed;
  dr.slow = live && !!world.slowmo && !!input.nitro;
  if (!live || Math.abs(input.steer) <= DEATH_ROLL.steerMin) return;
  if (world.slowmo && !dr.slow) return; // (single player: steering needs slow motion)
  const rate = world.slowmo ? DEATH_ROLL.rate : DEATH_ROLL.rateMulti;
  // Right is a turn clockwise seen from above: negative about +y.
  const turn = -Math.sign(input.steer) * (rate / (since(world, car) + 1)) * SIM_DT * RAD;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  car.vel = { x: car.vel.x * c + car.vel.z * s, y: car.vel.y, z: -car.vel.x * s + car.vel.z * c };
  dr.steered = true;
  // The body swings the other way a little, up to a total cap (B3 LIKELY).
  const max = DEATH_ROLL.swingMax * SIM_DT * RAD;
  const cap = DEATH_ROLL.swingCap * RAD;
  const swing = Math.max(-cap - dr.swing, Math.min(cap - dr.swing, Math.max(-max, Math.min(max, DEATH_ROLL.swing * turn))));
  if (swing) {
    car.quat = quatIntegrate(car.quat, { x: 0, y: swing, z: 0 }, 1);
    dr.swing += swing;
  }
}
