import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../src/sim/track.js';
import { buildArena } from '../src/sim/arena.js';
import { VENUES } from '../src/sim/tracks/venues.js';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { createEventState, gridPoses, standings } from '../src/sim/event.js';
import { initAi, aiInput } from '../src/sim/ai.js';
import { neutralInput } from '../src/sim/input.js';
import { SIM_DT } from '../src/config.js';
import { computeBuild } from '../src/parts/build.js';
import { DRIVERS, buildDriver } from '../src/parts/drivers.js';
import { EVENTS, computeRewards, rollSalvage } from '../src/career/events.js';

const venue = (id) => (VENUES[id].kind === 'arena' ? buildArena(VENUES[id].def) : buildTrack(VENUES[id].def));

// All-AI event; `player` optionally overrides car 0's inputs.
function setup(eventId, { count, hp } = {}) {
  const def = EVENTS.find((e) => e.id === eventId);
  const track = venue(def.venue);
  const n = count || def.cars;
  const entries = DRIVERS.slice(0, n).map((d, k) => buildDriver(d, 1, 50 + k));
  const world = createWorld({
    track,
    cars: entries.map((e) => ({ params: computeBuild(e.build).params })),
    poses: gridPoses(track, def, n),
    event: createEventState(def, track),
    respawnOnWreck: !(def.type === 'arena' && def.mode === 'lastStanding'),
  });
  world.state.cars.forEach((c, k) => {
    initAi(c, entries[k].personality, 9 + k);
    if (hp) c.hp = c.maxHp = hp;
  });
  return { world, def, track };
}
const run = (world, seconds, override = null) => {
  for (let t = 0; t < seconds * 60 && !world.state.event.done; t++) {
    stepWorld(world, world.state.cars.map((_, i) => (override && i === 0 ? { ...neutralInput(), ...override(world, t) } : aiInput(world, i, SIM_DT))));
  }
};

test('countdown holds the grid, then the race starts', () => {
  const { world } = setup('strip-sprint');
  const start = world.state.cars.map((c) => ({ ...c.pos }));
  for (let t = 0; t < 150; t++) stepWorld(world, world.state.cars.map(() => ({ ...neutralInput(), throttle: 1 })));
  world.state.cars.forEach((c, i) => assert.ok(Math.hypot(c.pos.x - start[i].x, c.pos.z - start[i].z) < 0.5, 'moved during countdown'));
  assert.equal(world.state.event.phase, 'countdown');
});

test('sprint: AI field finishes and standings are by time', () => {
  const { world } = setup('strip-sprint');
  run(world, 150);
  const ev = world.state.event;
  assert.ok(ev.done, `only ${ev.finished.length} finished`);
  const s = standings(world);
  for (let k = 1; k < s.length; k++) assert.ok(s[k].time >= s[k - 1].time);
});

test('circuit: 3 laps complete; the pit zone heals', () => {
  const { world } = setup('loop-gp', { count: 4 });
  run(world, 200);
  assert.ok(world.state.event.finished.length >= 3, `finished ${world.state.event.finished.length}`);

  const pit = setup('loop-gp', { count: 1 });
  const car = pit.world.state.cars[0];
  run(pit.world, 3.2);
  const i = pit.track.indexAtDistance(100);
  car.pos = { x: pit.track.x[i] + pit.track.rx[i] * 5, y: pit.track.y[i] + 0.7, z: pit.track.z[i] + pit.track.rz[i] * 5 };
  car.vel = { x: 0, y: 0, z: 0 };
  car.hp = car.maxHp * 0.3;
  run(pit.world, 1, () => ({}));
  assert.ok(car.hp > car.maxHp * 0.35, 'healed in the pit');
});

test('drag: manual shifting, launch boost, false starts, rear weapons only', () => {
  const { world } = setup('quarter-mile', { count: 2 });
  const ev = world.state.event;
  // (The top gear each reached: past the line, the barrier at the strip's end stops them.)
  const top = [0, 0];
  for (let t = 0; t < 40; t += 0.25) {
    run(world, 0.25);
    world.state.cars.forEach((c, i) => (top[i] = Math.max(top[i], c.gear)));
  }
  assert.equal(ev.finished.length, 2);
  assert.ok(top.every((g) => g >= 3), `AI shifted up (top gears ${top})`);
  assert.ok(world.state.projectiles.length === 0);

  // Car 0 jumps the start: locked for a second after GO.
  const jump = setup('quarter-mile', { count: 2 });
  run(jump.world, 3.4, () => ({ throttle: 1 }));
  assert.ok(jump.world.state.cars[0].lockTime > 0 || jump.world.events.some((e) => e.type === 'falseStart'));

  // Car 0 launches right on GO: boost.
  const good = setup('quarter-mile', { count: 2 });
  run(good.world, 3.1, (w) => ({ throttle: w.state.event.phase === 'racing' ? 1 : 0 }));
  assert.ok(good.world.events.some((e) => e.type === 'launch' && e.car === 0));
});

test('arena last standing ends with one survivor; takedown mode ranks by KOs', () => {
  const { world } = setup('dc-last', { count: 4, hp: 150 });
  run(world, 240);
  const ev = world.state.event;
  assert.ok(ev.done);
  const alive = world.state.cars.filter((c) => !c.wrecked).length;
  assert.ok(alive <= 1 || ev.time >= ev.timeLimit, `alive ${alive}`);
  assert.ok(ev.eliminated.length >= 2, 'arena AI should fight');

  const brawl = setup('dc-brawl', { count: 4, hp: 150 });
  run(brawl.world, 60);
  const s = standings(brawl.world);
  for (let k = 1; k < s.length; k++) assert.ok(s[k].takedowns <= s[k - 1].takedowns);
});

test('free drive: solo, no countdown, never ends', () => {
  const { world } = setup('free-drive');
  assert.equal(world.state.cars.length, 1);
  assert.equal(world.state.event.phase, 'racing');
  run(world, 60);
  assert.equal(world.state.event.done, false);
  assert.ok(world.state.cars[0].race.lap >= 1);
});

test('rewards and salvage', () => {
  const def = EVENTS.find((e) => e.id === 'strip-sprint');
  const r1 = computeRewards(def, 1, { takedowns: 2, style: { cash: 120 } }, 0);
  const r4 = computeRewards(def, 4, { takedowns: 0, style: { cash: 0 } }, 0);
  assert.ok(r1.total > r4.total);
  assert.equal(r1.total, 600 + 300 + 120);
  const victims = DRIVERS.slice(0, 5).map((d) => buildDriver(d, 2, 1).build);
  const salvage = rollSalvage(victims, 4);
  assert.ok(salvage.length >= 1);
  for (const p of salvage) assert.ok(p.condition >= 40 && p.condition <= 90);
});
