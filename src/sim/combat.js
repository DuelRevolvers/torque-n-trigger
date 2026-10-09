// Combat: weapons, projectiles, mines, utility zones, damage, part wear, heat,
// car-to-car collisions, wrecks and respawns. All state is plain data in
// world.state; transient visual events go to world.events for the renderer.

import { v3, add, sub, scale, dot, cross, length, normalize, quatRotate, quatRotateInv } from './math.js';
import { conditionFactor } from '../parts/build.js';
import { onOil } from './gadgets.js';
import { newContact, touchContact, noteContact, damageMul } from './contact.js';
import { crashes, queueCredit, ringOutCredit, award, checkLucky } from './takedown.js';
import { earnNitro } from './nitro.js';
import { deathRollLive } from './deathRoll.js';
import { NITRO } from './rules.js';
import { blastTraffic, shootTraffic } from './traffic.js';

const DEFAULT_COMBAT = {
  hp: 500, armor: 0, heatCapacity: 70, dissipation: 0.7, heatRate: 1, powerDeficit: 0,
  ramDamage: 0, ramResist: 1, rollCage: 0.3, cooldownMul: 1,
};

// How each weapon type behaves. cone = auto-aim half-angle in radians.
export const WEAPON_BEHAVIOR = {
  chaingun: { mode: 'bullet', speed: 220, spread: 0.012, cone: 0.14 },
  scatter: { mode: 'bullet', speed: 160, pellets: 8, spread: 0.07, cone: 0.14 },
  plasma: { mode: 'bullet', speed: 90, splash: 3, cone: 0.14 },
  flamethrower: { mode: 'flame', cone: 0.35 },
  railgun: { mode: 'beam', cone: 0.1 },
  mines: { mode: 'mine' },
  turret: { mode: 'bullet', speed: 200, spread: 0.02, cone: Math.PI },
  rockets: { mode: 'bullet', speed: 80, splash: 3.5, homing: 1.6, cone: 0.35 },
  tesla: { mode: 'arc', cone: Math.PI },
};

// Parts nearest each hit region take the wear.
const REGION_SLOTS = {
  front: ['engine', 'cooling', 'bodyKit', 'lights', 'turbo'],
  rear: ['exhaust', 'fuelTank', 'spoiler', 'nitrous', 'secondaryWeapon', 'utility', 'transmission'],
  side: ['wheels', 'suspension', 'armor', 'brakes'],
  top: ['primaryWeapon', 'interiors', 'secondaryWeapon'],
};
const WEAR = 0.25; // condition % lost per point of damage, split across the region's parts

const WRECK_TIME = 5; // seconds before a wrecked car respawns
const SPAWN_GUARD = 2; // seconds after a respawn with no damage and no crash wrecks (shown as the shield)
const MINE_TRIGGER = 2.4;
const FWD = v3(0, 0, -1);
const combatOf = (p) => p.combat || DEFAULT_COMBAT;

export function initCombat(car, params, conditions = {}) {
  const c = combatOf(params);
  const weapon = (w) => (w ? { cooldown: 0, ammo: w.ammo, reload: 0 } : null);
  car.maxHp = c.hp;
  car.hp = c.hp;
  car.heat = 0;
  car.overheated = false;
  car.weapons = { primary: weapon(params.weapons?.primary), secondary: weapon(params.weapons?.secondary) };
  car.firing = { primary: false, secondary: false };
  car.utility = { cooldown: 0 };
  car.condition = { ...conditions };
  car.shield = 0;
  car.repair = 0;
  car.burning = 0;
  car.shocked = 0; // (seconds: off a sparking plate, its engine, nitro and weapons cut out)
  car.fuelIgnited = false;
  car.wrecked = false;
  car.wreckTimer = 0;
  car.takedowns = 0;
  car.lastHitBy = -1;
  car.contact = newContact(); // (car-to-car hit classification; see contact.js)
  car.impact = 0;
  car.nextRocketSide = 1;
  car.mods = { torque: 1, grip: 1, brake: 1 };
}

export function initCombatWorld(state) {
  state.projectiles = [];
  state.mines = [];
  state.zones = [];
  state.nextId = 1;
  state.rng = 0x2545f491;
}

// Deterministic RNG kept in state so snapshots replay exactly.
function rand(state) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}

const cfOf = (car, slot) => (car.condition[slot] === undefined ? 1 : conditionFactor(car.condition[slot]));

// Driving modifiers from part condition, heat, power draw and oil. Called before
// each car's physics step.
export function updateMods(world, i) {
  const car = world.state.cars[i];
  const c = combatOf(world.params[i]);
  let torque = Math.max(0.3, cfOf(car, 'engine')) * (0.6 + 0.4 * cfOf(car, 'transmission'));
  if (car.overheated) torque *= 0.55;
  if (car.shocked > 0) torque *= 0.25; // (shocked: the engine cuts out)
  if (car.firing.primary || car.firing.secondary) torque *= 1 - c.powerDeficit * 0.6;
  let grip = (car.condition.wheels !== undefined && car.condition.wheels <= 0 ? 0.55 : 0.6 + 0.4 * cfOf(car, 'wheels'));
  grip *= 0.85 + 0.15 * cfOf(car, 'suspension');
  if (world.state.zones.some((z) => z.type === 'oil' && horizDist(z.pos, car.pos) < z.radius) || onOil(world.track, car.pos)) grip *= 0.35;
  car.mods = { torque, grip, brake: 0.4 + 0.6 * cfOf(car, 'brakes') };
}

const horizDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const toWorld = (car, local) => add(car.pos, quatRotate(car.quat, local));

// Collision spheres approximating the car body: front and rear.
function spheres(world, j) {
  const car = world.state.cars[j];
  const { length: L, width: W } = world.params[j].body;
  const f = quatRotate(car.quat, FWD);
  const r = Math.max(W / 2, L / 4) + 0.15;
  return [
    { c: add(car.pos, scale(f, L / 4)), r },
    { c: add(car.pos, scale(f, -L / 4)), r },
  ];
}

function invInertiaWorld(car, p, v) {
  const b = quatRotateInv(car.quat, v);
  return quatRotate(car.quat, v3(b.x / p.inertia.x, b.y / p.inertia.y, b.z / p.inertia.z));
}

// ram: a car-to-car hit (slams earn nitrous on their own, contact.js); other
// damage from a car is its weapons', and earns it nitrous.
export function applyDamage(world, j, amount, point, source, silent = false, ram = false) {
  const car = world.state.cars[j];
  if (car.wrecked || amount <= 0 || car.invulnerable || car.spawnGuard > 0) return;
  source ??= -1; // (hazards pass null: no one's)
  const p = world.params[j];
  const c = combatOf(p);
  if (car.shield > 0) amount *= 0.2;
  amount *= 1 - c.armor * cfOf(car, 'armor');
  if (source >= 0 && source !== j && !ram) earnNitro(world, source, (NITRO.damage * Math.min(amount, car.hp)) / car.maxHp);
  car.hp -= amount;
  if (source >= 0 && source !== j) {
    car.lastHitBy = source;
    car.lastHitTick = world.state.tick;
  }
  const local = quatRotateInv(car.quat, sub(point, car.pos));
  wearParts(world, j, local, amount);
  if (!silent) world.events.push({ type: 'hit', car: j, point, local, amount });
  if (car.hp > 0) return;
  // Killed by a car's guns or bumper: theirs now. Anything else (a wall, a fire)
  // goes to the takedown credit rules.
  if (source >= 0 && source !== j) wreck(world, j, source);
  else wreckPhysical(world, j, 'damage');
}

function wearParts(world, j, local, amount) {
  const car = world.state.cars[j];
  const p = world.params[j];
  const L = p.body.length;
  const region = local.y > 0.45 ? 'top' : local.z < -L * 0.25 ? 'front' : local.z > L * 0.25 ? 'rear' : 'side';
  const slots = REGION_SLOTS[region].filter((s) => car.condition[s] !== undefined);
  if (!slots.length) return;
  const per = (amount * WEAR) / slots.length;
  for (const s of slots) {
    const before = car.condition[s];
    car.condition[s] = Math.max(0, before - per / (p.durability?.[s] || 1));
    if (s === 'fuelTank' && car.condition[s] <= 0 && !car.fuelIgnited) {
      car.fuelIgnited = true;
      car.burning = 8;
      world.events.push({ type: 'ignite', car: j });
    }
    if (before > 0 && car.condition[s] <= 0) world.events.push({ type: 'broken', car: j, slot: s });
  }
}

// Knocked into a pit (the dry dock): a wreck, and a takedown for whoever hit
// the car last, if they did in the last eight seconds.
export function ringOut(world, j, hz) {
  const car = world.state.cars[j];
  if (car.wrecked) return;
  // (Also a slam partner from the last 2 s: takedown.js.)
  const recent = ringOutCredit(world, j);
  wreck(world, j, recent);
  world.events.push({ type: 'ringout', car: j, by: recent });
}

export function wreck(world, j, source) {
  const car = world.state.cars[j];
  car.wrecked = true;
  car.wrecks = (car.wrecks || 0) + 1; // (the Creator's "without being wrecked" triggers)
  car.hp = 0;
  car.wreckTimer = WRECK_TIME;
  car.wreckIndex = car.trackIndex;
  car.burning = 0;
  car.shocked = 0;
  car.shield = 0;
  car.wreckTick = world.state.tick;
  car.contact.react = null;
  earnNitro(world, j, NITRO.wrecked);
  car.vel = add(car.vel, v3(0, 5, 0));
  car.angVel = add(car.angVel, quatRotate(car.quat, v3(0, 0, 1.5)));
  if (source >= 0 && source !== j) award(world, source, j, deathRollLive(world, source) ? 'deathRoll' : 'hp');
  world.events.push({ type: 'wreck', car: j, pos: { ...car.pos }, by: source });
}

// A physical wreck (a wall, a huge hit, a tip-over, or HP lost to no one):
// credit is queued and confirmed later by takedown.js.
export function wreckPhysical(world, j, cause) {
  if (world.state.cars[j].wrecked) return;
  queueCredit(world, j, cause);
  wreck(world, j, -1);
}

// Picks the best target inside the aim cone and range, or null.
function findTarget(world, i, origin, dir, cone, range) {
  let best = null;
  let bestScore = Infinity;
  world.state.cars.forEach((t, j) => {
    if (j === i || t.wrecked) return;
    if (world.state.zones.some((z) => z.type === 'smoke' && horizDist(z.pos, t.pos) < z.radius)) return;
    const to = sub(t.pos, origin);
    const d = length(to);
    if (d > range || d < 0.5) return;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(to, dir) / d)));
    if (angle > cone) return;
    const score = cone > 1 ? d : angle; // wide cones prefer the nearest car
    if (score < bestScore) {
      bestScore = score;
      best = j;
    }
  });
  return best;
}

function leadDir(world, origin, j, speed) {
  const t = world.state.cars[j];
  const d = length(sub(t.pos, origin));
  const aim = add(t.pos, scale(t.vel, speed ? d / speed : 0));
  return normalize(sub(aim, origin));
}

function spread(state, dir, amount) {
  if (!amount) return dir;
  return normalize(add(dir, v3((rand(state) - 0.5) * 2 * amount, (rand(state) - 0.5) * amount, (rand(state) - 0.5) * 2 * amount)));
}

function muzzle(world, i, slot, type) {
  const car = world.state.cars[i];
  const { length: L, width: W } = world.params[i].body;
  if (slot === 'primary') return toWorld(car, v3(0, 0.95, -1.0));
  if (type === 'mines') return toWorld(car, v3(0, -0.2, L / 2 + 0.6));
  if (type === 'rockets') return toWorld(car, v3(car.nextRocketSide * (W / 2 + 0.16), 0.05, -0.8));
  return toWorld(car, v3(0, 0.95, 0.4));
}

function fireWeapon(world, i, slot, pressed, dt) {
  const car = world.state.cars[i];
  const p = world.params[i];
  const w = p.weapons?.[slot];
  const ws = car.weapons[slot];
  car.firing[slot] = false;
  if (!w || !ws) return;
  ws.cooldown = Math.max(0, ws.cooldown - dt);
  if (ws.reload > 0) {
    ws.reload -= dt;
    if (ws.reload <= 0) ws.ammo = w.ammo;
  }
  const cf = cfOf(car, slot === 'primary' ? 'primaryWeapon' : 'secondaryWeapon');
  if (!pressed || cf <= 0 || car.shocked > 0) return;
  // Drag races allow only rear-facing weapons.
  if (world.state.event?.weapons === 'rear' && !(slot === 'secondary' && w.type === 'mines')) return;
  if (world.state.event?.weaponsLocked) return; // "weapons in the second half" modifier
  if (w.heatPerShot && car.overheated) return;
  if (w.ammo !== null && (ws.ammo <= 0 || ws.reload > 0)) return;
  const beh = WEAPON_BEHAVIOR[w.type];
  const c = combatOf(p);
  const origin = muzzle(world, i, slot, w.type);
  const fwd = quatRotate(car.quat, FWD);
  const damage = w.damage * cf;

  if (beh.mode === 'flame') {
    car.firing[slot] = true;
    car.heat += w.heatPerShot * w.fireRate * dt;
    world.state.cars.forEach((t, j) => {
      if (j === i || t.wrecked) return;
      const to = sub(t.pos, origin);
      const d = length(to);
      if (d > w.range + 1.5) return;
      if (Math.acos(Math.max(-1, Math.min(1, dot(to, fwd) / d))) > beh.cone) return;
      applyDamage(world, j, damage * w.fireRate * dt, t.pos, i, true);
    });
    return;
  }
  if (ws.cooldown > 0) return;
  ws.cooldown = (1 / w.fireRate) * c.cooldownMul;
  if (w.ammo !== null && --ws.ammo <= 0) ws.reload = w.reload;
  car.heat += w.heatPerShot;
  car.firing[slot] = true;

  const state = world.state;
  const target = beh.mode === 'mine' ? null : findTarget(world, i, origin, fwd, beh.cone, w.range);
  const dir = target !== null ? leadDir(world, origin, target, beh.speed) : fwd;
  world.events.push({ type: 'shot', car: i, slot, weapon: w.type, from: origin, dir });

  if (beh.mode === 'bullet') {
    const pellets = beh.pellets || 1;
    for (let k = 0; k < pellets; k++) {
      const d = spread(state, dir, beh.spread);
      state.projectiles.push({
        id: state.nextId++, owner: i, type: w.type, pos: origin, vel: add(scale(d, beh.speed), car.vel),
        life: w.range / beh.speed, damage: damage / pellets, splash: beh.splash || 0,
        homing: beh.homing || 0, target: target ?? -1,
      });
    }
    if (w.type === 'rockets') car.nextRocketSide = -car.nextRocketSide;
  } else if (beh.mode === 'beam') {
    const hit = raycastCars(world, i, origin, dir, w.range);
    const to = hit ? hit.point : add(origin, scale(dir, w.range));
    if (hit) applyDamage(world, hit.car, damage, hit.point, i);
    world.events.push({ type: 'beam', car: i, from: origin, to });
  } else if (beh.mode === 'arc') {
    if (target === null) return;
    const t = state.cars[target];
    applyDamage(world, target, damage, t.pos, i);
    world.events.push({ type: 'arc', car: i, from: origin, to: { ...t.pos } });
  } else if (beh.mode === 'mine') {
    const g = world.track.query(origin.x, origin.z, car.trackIndex, origin.y);
    state.mines.push({ id: state.nextId++, owner: i, pos: v3(origin.x, g.height + 0.1, origin.z), arm: 0.8, life: 45, damage });
  }
}

// First car hit along a ray (excluding `self`): { car, point, t } or null.
function raycastCars(world, self, origin, dir, range) {
  let best = null;
  world.state.cars.forEach((t, j) => {
    if (j === self || t.wrecked) return;
    for (const s of spheres(world, j)) {
      const m = sub(origin, s.c);
      const b = dot(m, dir);
      const c = dot(m, m) - s.r * s.r;
      const disc = b * b - c;
      if (disc < 0) continue;
      const tHit = -b - Math.sqrt(disc);
      if (tHit < 0 || tHit > range) continue;
      if (!best || tHit < best.t) best = { car: j, t: tHit, point: add(origin, scale(dir, tHit)) };
    }
  });
  return best;
}

export function explode(world, pos, radius, damage, source) {
  blastTraffic(world, pos, radius);
  world.state.cars.forEach((t, j) => {
    const d = length(sub(t.pos, pos));
    if (d > radius + 1.5 || t.gone) return; // (Last Lap Out: a cleared wreck)
    applyDamage(world, j, damage * Math.max(0.25, 1 - d / (radius + 1.5)), pos, source, true);
    world.events.push({ type: 'hit', car: j, point: pos, local: quatRotateInv(t.quat, sub(pos, t.pos)), amount: damage });
  });
  world.events.push({ type: 'explosion', pos, size: radius });
}

function updateProjectiles(world, dt) {
  const { state, track } = world;
  state.projectiles = state.projectiles.filter((pr) => {
    if (pr.homing && pr.target >= 0 && !state.cars[pr.target].wrecked) {
      const speed = length(pr.vel);
      const want = normalize(sub(state.cars[pr.target].pos, pr.pos));
      const cur = scale(pr.vel, 1 / speed);
      pr.vel = scale(normalize(add(cur, scale(want, pr.homing * dt))), speed);
    }
    const step = scale(pr.vel, dt);
    const dist = length(step);
    const dir = scale(step, 1 / dist);
    const hit = raycastCars(world, pr.owner, pr.pos, dir, dist);
    // (Traffic in the way is cover: the shot stops on it and knocks it.)
    const th = shootTraffic(world, pr.pos, dir, hit ? hit.t : dist);
    if (th) {
      if (pr.splash) explode(world, th.point, pr.splash, pr.damage, pr.owner);
      else world.events.push({ type: 'spark', pos: th.point });
      return false;
    }
    if (hit) {
      if (pr.splash) explode(world, hit.point, pr.splash, pr.damage, pr.owner);
      else applyDamage(world, hit.car, pr.damage, hit.point, pr.owner);
      return false;
    }
    pr.pos = add(pr.pos, step);
    pr.life -= dt;
    const g = track.query(pr.pos.x, pr.pos.z, -1, pr.pos.y);
    if (pr.pos.y < g.height || Math.abs(g.lateral) > track.wallDist) {
      if (pr.splash) explode(world, pr.pos, pr.splash, pr.damage, pr.owner);
      else world.events.push({ type: 'spark', pos: pr.pos });
      return false;
    }
    return pr.life > 0;
  });
}

function updateMines(world, dt) {
  const { state } = world;
  state.mines = state.mines.filter((m) => {
    m.arm -= dt;
    m.life -= dt;
    if (m.arm > 0) return m.life > 0;
    const victim = state.cars.findIndex((c) => !c.wrecked && length(sub(c.pos, m.pos)) < MINE_TRIGGER);
    if (victim >= 0) {
      state.cars[victim].vel = add(state.cars[victim].vel, v3(0, 6, 0));
      explode(world, m.pos, 4, m.damage, m.owner);
      return false;
    }
    return m.life > 0;
  });
  state.zones = state.zones.filter((z) => (z.life -= dt) > 0);
}

function useUtility(world, i, pressed, dt) {
  const car = world.state.cars[i];
  const u = world.params[i].weapons?.utility;
  car.utility.cooldown = Math.max(0, car.utility.cooldown - dt);
  if (!u || !pressed || car.utility.cooldown > 0 || cfOf(car, 'utility') <= 0) return;
  car.utility.cooldown = u.cooldown * combatOf(world.params[i]).cooldownMul;
  const behind = toWorld(car, v3(0, 0, world.params[i].body.length / 2 + 2));
  const state = world.state;
  if (u.type === 'oil') state.zones.push({ id: state.nextId++, type: 'oil', pos: behind, radius: 3.5, life: 12 });
  if (u.type === 'smoke') state.zones.push({ id: state.nextId++, type: 'smoke', pos: behind, radius: 5, life: 8 });
  if (u.type === 'shield') car.shield = 3;
  if (u.type === 'repair') car.repair = 2;
  world.events.push({ type: 'utility', car: i, utility: u.type });
}

// Car-to-car collisions: separate, bounce with an impulse, and turn hard
// impacts into damage (more for the heavier car, and for ram bumpers).
export function collideCars(world) {
  const { state, params } = world;
  const cars = state.cars;
  for (let a = 0; a < cars.length; a++) {
    for (let b = a + 1; b < cars.length; b++) {
      const A = cars[a];
      const B = cars[b];
      if (A.gone || B.gone || horizDist(A.pos, B.pos) > 8) continue; // (Last Lap Out: a cleared wreck)
      let best = null;
      for (const sa of spheres(world, a)) {
        for (const sb of spheres(world, b)) {
          const d = sub(sb.c, sa.c);
          d.y = 0;
          const dist = length(d);
          const pen = sa.r + sb.r - dist;
          if (pen > 0 && (!best || pen > best.pen)) {
            const n = dist > 1e-6 ? scale(d, 1 / dist) : v3(1, 0, 0);
            best = { pen, n, point: add(sa.c, scale(n, sa.r - pen / 2)) };
          }
        }
      }
      if (!best) continue;
      touchContact(world, a, b);
      const pa = params[a];
      const pb = params[b];
      const invA = 1 / pa.mass;
      const invB = 1 / pb.mass;
      const { n, pen, point } = best;
      A.pos = sub(A.pos, scale(n, (pen * invA) / (invA + invB)));
      B.pos = add(B.pos, scale(n, (pen * invB) / (invA + invB)));

      const rA = sub(point, A.pos);
      const rB = sub(point, B.pos);
      const vA = add(A.vel, cross(A.angVel, rA));
      const vB = add(B.vel, cross(B.angVel, rB));
      const vn = dot(sub(vB, vA), n);
      if (vn >= 0) continue;
      const hit = noteContact(world, a, b, n, -vn, point); // (classified on the pre-bounce velocities)
      const k = invA + invB +
        dot(cross(invInertiaWorld(A, pa, cross(rA, n)), rA), n) +
        dot(cross(invInertiaWorld(B, pb, cross(rB, n)), rB), n);
      const j = (-(1 + 0.2) * vn) / k;
      const J = scale(n, j);
      A.vel = sub(A.vel, scale(J, invA));
      A.angVel = sub(A.angVel, invInertiaWorld(A, pa, cross(rA, J)));
      B.vel = add(B.vel, scale(J, invB));
      B.angVel = add(B.angVel, invInertiaWorld(B, pb, cross(rB, J)));

      const impact = -vn;
      world.events.push({ type: 'crash', a, b, point, impact });
      if (impact < 4) continue;
      const base = (impact - 4) * 3;
      const ca = combatOf(pa);
      const cb = combatOf(pb);
      const front = (car, p) => quatRotateInv(car.quat, sub(point, car.pos)).z < -p.body.length * 0.25;
      const dmgA = (base * (2 * pb.mass) / (pa.mass + pb.mass) * (1 - ca.rollCage * 0.4)) / ca.ramResist + (front(B, pb) ? (cb.ramDamage * impact) / 15 : 0);
      const dmgB = (base * (2 * pa.mass) / (pa.mass + pb.mass) * (1 - cb.rollCage * 0.4)) / cb.ramResist + (front(A, pa) ? (ca.ramDamage * impact) / 15 : 0);
      applyDamage(world, a, dmgA * damageMul(hit, a), point, b, false, true);
      applyDamage(world, b, dmgB * damageMul(hit, b), point, a, false, true);
      if (crashes(world, a, 'car', impact, b)) wreckPhysical(world, a, 'car');
      if (crashes(world, b, 'car', impact, a)) wreckPhysical(world, b, 'car');
    }
  }
}

// Weapons, utility, heat, burning, wall impacts, wreck timers, projectiles.
// `respawn(world, i)` puts a car back on track (provided by world.js).
export function updateCombat(world, inputs, dt, respawn) {
  const { state, params } = world;
  state.cars.forEach((car, i) => {
    const p = params[i];
    const c = combatOf(p);
    const input = inputs[i] || {};
    if (car.wrecked) {
      car.firing.primary = car.firing.secondary = false;
      car.impact = 0; // (the wreck's wall hits: never a crash for the respawned car)
      car.wreckTimer -= dt;
      if (car.wreckTimer <= 0 && world.respawnOnWreck && !car.out) { // (out: Rampage's totaled, or a rival not back yet; Last Lap Out's eliminated)
        respawn(world, i, { back: 0, index: car.wreckIndex }); // right where it was wrecked
        car.wrecked = false;
        car.hp = car.maxHp;
        car.heat = 0;
        car.overheated = false;
        car.burning = 0;
        car.shocked = 0;
        car.shield = car.spawnGuard = SPAWN_GUARD; // (no spawn kills, even in one-hit events)
        for (const slot of ['primary', 'secondary']) {
          const w = p.weapons?.[slot];
          if (w) car.weapons[slot] = { cooldown: 0, ammo: w.ammo, reload: 0 };
        }
        car.race.penalty = (car.race.penalty || 0) + 2; // wreck time penalty (seconds)
        world.events.push({ type: 'respawn', car: i });
      }
      return;
    }

    // Heat: engine load, nitrous and energy weapons build it; cooling sheds it.
    const gain = c.heatRate * (input.throttle || 0) * 4 + (car.nitro.active > 0 ? 12 : 0);
    car.heat = Math.max(0, Math.min(c.heatCapacity, car.heat + (gain - c.dissipation * 6 * cfOf(car, 'cooling')) * dt));
    if (car.heat >= c.heatCapacity) car.overheated = true;
    else if (car.heat < c.heatCapacity * 0.5) car.overheated = false;

    fireWeapon(world, i, 'primary', input.fire1, dt);
    fireWeapon(world, i, 'secondary', input.fire2, dt);
    useUtility(world, i, input.utility, dt);
    car.heat = Math.min(c.heatCapacity, car.heat);

    if (car.shield > 0) car.shield = Math.max(0, car.shield - dt);
    if (car.spawnGuard > 0) car.spawnGuard = Math.max(0, car.spawnGuard - dt);
    if (car.repair > 0) {
      car.repair = Math.max(0, car.repair - dt);
      car.hp = Math.min(car.maxHp, car.hp + car.maxHp * 0.125 * dt);
    }
    if (car.shocked > 0) car.shocked = Math.max(0, car.shocked - dt);
    if (car.burning > 0) {
      car.burning = Math.max(0, car.burning - dt);
      applyDamage(world, i, 6 * dt, car.pos, -1, true); // (credit: whoever hit it in the last 8 s)
    }
    // Wall hits: only a hard slam hurts, and gently (roll cages soften it further).
    if (car.impact > 12) {
      applyDamage(world, i, (car.impact - 12) * 2 * (1 - c.rollCage * 0.4), toWorld(car, v3(0, 0, -p.body.length / 2)), -1);
    }
    if (car.impact > 0) {
      if (crashes(world, i, 'wall', car.impact)) wreckPhysical(world, i, 'wall');
      else checkLucky(world, i, car.impact);
    }
    car.impact = 0;
  });
  updateProjectiles(world, dt);
  updateMines(world, dt);
}
