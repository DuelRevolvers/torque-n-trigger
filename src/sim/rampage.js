// Rampage (B3 integration, phase 7a; B3's Road Rage, docs/gameplay/modes.md §4).
// Hunt rivals for takedowns before the clock runs out. Each human has a
// chassis meter (B3's Road Rage health) on top of HP: slams and wrecks wear it
// down, and a wreck under 30 % totals the car. A rival a human takes down stays
// out for a moment, then comes back ahead of that human; a rival that drifts
// too far from every human is moved back ahead of the nearest. All state is
// plain data on the cars (chassis, out, outTimer, by, leash, grade).

import { RAMPAGE } from './rules.js';
import { trackGap } from './aiAttack.js';

const SLAMS = new Set(['slam', 'shunt', 'huge']); // (as contact.js counts a slam on the victim)
export const GRADES = ['', 'BRONZE', 'SILVER', 'GOLD'];

// Sets up a car for a Rampage (initEventCar).
export function initRampageCar(car) {
  car.chassis = 1;
  car.out = false; // totaled (a human), or taken down and not back yet (a rival)
  car.outTimer = 0;
  car.by = -1;
  car.leash = 0;
  car.grade = 0;
}

// Chassis after a wreck: 15 % off, but not below 1 % unless it was under 10 % (B3).
export function wreckCost(c) {
  const next = c - RAMPAGE.wreck;
  return c < RAMPAGE.floorAbove ? Math.max(0, next) : Math.max(RAMPAGE.floor, next);
}

// How many targets (0 to 3) n takedowns reach.
export const gradeOf = (targets, n) => targets.filter((t) => n >= t).length;

// The place a grade pays as: gold 1st, silver 2nd, bronze 3rd, none last of `cars`.
export const gradePlace = (grade, cars) => (grade ? 4 - grade : cars);

// Once a tick, after takedowns. respawn: world.js's respawnCar.
export function updateRampage(world, dt, respawn) {
  const { state, track } = world;
  const ev = state.event;
  const humans = world.humans || 0;
  if (ev.phase !== 'racing') return;
  // The events since the last tick (wrecks between ticks too). The screen
  // empties world.events now and then: then it starts again from the top.
  let k = world.rampageAt || 0;
  if (k > world.events.length || (k && world.events[k - 1] !== world.rampageLast)) k = 0;
  for (; k < world.events.length; k++) {
    const e = world.events[k];
    if (e.type === 'contact' && e.victim != null && e.victim < humans && SLAMS.has(e.label)) {
      const v = state.cars[e.victim];
      v.chassis = Math.max(0, v.chassis - RAMPAGE.slam);
    } else if (e.type === 'wreck' && e.car < humans) {
      const v = state.cars[e.car];
      if (v.chassis < RAMPAGE.totaled) {
        v.out = true; // (combat.js doesn't respawn it)
        world.events.push({ type: 'totaled', car: e.car });
      } else v.chassis = wreckCost(v.chassis);
    } else if (e.type === 'takedown' && e.car < humans && e.victim >= humans) {
      const v = state.cars[e.victim];
      if (v.wrecked) {
        v.out = true;
        v.outTimer = RAMPAGE.reenter;
        v.by = e.car;
      }
      const x = state.cars[e.car];
      const grade = gradeOf(ev.targets, x.takedowns || 0);
      if (grade > x.grade) {
        x.grade = grade;
        world.events.push({ type: 'grade', car: e.car, grade });
      }
    }
  }
  world.rampageAt = world.events.length;
  world.rampageLast = world.events[world.events.length - 1];

  for (let j = humans; j < state.cars.length; j++) {
    const c = state.cars[j];
    if (c.out) {
      // Back in ahead of the human who took it down (or another still in).
      c.outTimer -= dt;
      const h = !state.cars[c.by]?.out && c.by >= 0 ? c.by : state.cars.findIndex((H, i) => i < humans && !H.out);
      if (c.outTimer > 0 || h < 0) continue;
      c.out = false;
      c.wreckIndex = dropIndex(world, h); // (combat.js respawns it there next tick)
      continue;
    }
    c.leash = Math.max(0, c.leash - dt);
    if (c.wrecked || c.leash > 0) continue;
    let near = -1;
    let gap = Infinity;
    for (let h = 0; h < humans; h++) {
      if (state.cars[h].out) continue;
      const g = trackGap(track, state.cars[h], c);
      if (Math.abs(g) < Math.abs(gap)) [gap, near] = [g, h];
    }
    if (near < 0 || (gap >= -RAMPAGE.leashBehind && gap <= RAMPAGE.leashAhead)) continue;
    respawn(world, j, { index: dropIndex(world, near) });
    c.leash = RAMPAGE.leashCooldown;
  }
}

// A track index RAMPAGE.ahead metres in front of human h, a little further on
// if another car is already there.
function dropIndex(world, h) {
  const { track, state } = world;
  const L = track.length;
  let s = state.cars[h].trackS + RAMPAGE.ahead;
  for (let k = 0; k < 6 && state.cars.some((c) => !c.wrecked && Math.abs(trackGap(track, c, { trackS: s % L })) < 12); k++) s += 15;
  return track.indexAtDistance(((s % L) + L) % L);
}
