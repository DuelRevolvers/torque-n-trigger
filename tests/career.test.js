import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../src/sim/track.js';
import { buildArena } from '../src/sim/arena.js';
import { getVenue } from '../src/sim/tracks/venues.js';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { createEventState, gridPoses, standings } from '../src/sim/event.js';
import { initAi, aiInput } from '../src/sim/ai.js';
import { neutralInput } from '../src/sim/input.js';
import { SIM_DT } from '../src/config.js';
import { computeBuild } from '../src/parts/build.js';
import { DRIVERS, buildDriver } from '../src/parts/drivers.js';
import { DISTRICTS, districtEvents } from '../src/career/districts.js';
import { shopStock, buyPart, sellPart, buyPrice, repairCost, repairParts } from '../src/career/shop.js';
import { newCareer, addCar } from '../src/career/career.js';
import { generateStarters } from '../src/parts/starters.js';

const venueTrack = (id, def) => {
  const v = getVenue(id, def);
  return v.kind === 'arena' ? buildArena(v.def) : buildTrack(v.def);
};

function aiEvent(def, n = 4) {
  const track = venueTrack(def.venue, def);
  const entries = DRIVERS.slice(0, n).map((d, k) => buildDriver(d, def.tier ?? 1, 70 + k));
  const world = createWorld({
    track,
    cars: entries.map((e) => ({ params: computeBuild(e.build).params })),
    poses: gridPoses(track, def, n),
    event: createEventState(def, track),
    respawnOnWreck: !(def.type === 'arena' && def.mode === 'lastStanding'),
  });
  world.state.cars.forEach((c, k) => initAi(c, entries[k].personality, 3 + k));
  return { world, track };
}
const run = (world, seconds, override) => {
  for (let t = 0; t < seconds * 60 && !world.state.event.done; t++) {
    stepWorld(world, world.state.cars.map((_, i) => (override && i === 0 ? { ...neutralInput(), ...override } : aiInput(world, i, SIM_DT))));
  }
};

test('every district venue generates and every event is well formed', () => {
  for (const d of DISTRICTS) {
    const events = districtEvents(d);
    assert.equal(events.filter((e) => e.boss).length, 1);
    for (const e of events) {
      const track = venueTrack(e.venue, e);
      assert.ok(track, e.id);
      assert.ok(e.entryFee >= 0 && e.purse > 0);
    }
  }
});

test('AI can race a generated circuit and a generated sprint to the finish', () => {
  const rust = districtEvents(DISTRICTS[0]);
  for (const key of ['rustline-circuit', 'rustline-sprint']) {
    const { world } = aiEvent(rust.find((e) => e.id === key));
    run(world, 240);
    assert.ok(world.state.event.finished.length >= 3, `${key}: only ${world.state.event.finished.length} finished`);
  }
});

test('districts: long sprints, and shortcuts through side streets and special lots', () => {
  const kinds = new Set();
  for (const d of DISTRICTS) {
    for (const e of districtEvents(d)) {
      const v = getVenue(e.venue, e);
      if (v.kind !== 'track') continue;
      const t = buildTrack(v.def);
      if (e.type === 'sprint') assert.ok(t.length > 2400, `${e.id} only ${Math.round(t.length)} m`);
      for (const b of t.branches || []) {
        kinds.add(b.kind);
        const saving = b.s1 - b.s0 - b.track.length;
        assert.ok(saving > 0 && saving < 320, `${e.id} shortcut saves ${Math.round(saving)} m`);
      }
    }
  }
  assert.ok(kinds.has('street'));
  assert.ok([...kinds].some((k) => k !== 'street'), 'expected a lot shortcut (construction, alley, car park or plaza)');
});

test('arenas: big, with decks you can drive up onto and moving parts', () => {
  const d = DISTRICTS[0];
  const e = districtEvents(d).find((x) => x.type === 'arena');
  const def = getVenue(e.venue, e).def;
  assert.ok(def.sizeX >= 150 && def.sizeZ >= 150, `${def.sizeX} x ${def.sizeZ}`);
  assert.ok(def.platforms.length >= 2 && def.lifts.length >= 1 && def.sweepers.length >= 1);
  const arena = buildArena(def);
  // Drive at a deck ramp and end up on top.
  const ramp = def.ramps.find((r) => !r.base && r.height >= 3);
  const world = createWorld({ track: arena, cars: [{ params: computeBuild(buildDriver(DRIVERS[1], 2, 1).build).params }] });
  const car = world.state.cars[0];
  const sx = arena.cx + ramp.x - ramp.dirX * 30;
  const sz = arena.cz + ramp.z - ramp.dirZ * 30;
  const yaw = Math.atan2(-ramp.dirX, -ramp.dirZ);
  car.pos = { x: sx, y: arena.y0 + 0.9, z: sz };
  car.quat = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
  car.vel = { x: ramp.dirX * 14, y: 0, z: ramp.dirZ * 14 };
  let top = 0;
  for (let t = 0; t < 150; t++) {
    stepWorld(world, [{ ...neutralInput(), throttle: 0.5 }]);
    top = Math.max(top, car.pos.y - arena.y0);
  }
  assert.ok(top > ramp.height, `only reached ${top.toFixed(1)} m (deck ${ramp.height.toFixed(1)} m)`);
  // Lifts move with time.
  arena.setTime(0);
  const h0 = arena.liftTop(def.lifts[0]);
  arena.setTime(def.lifts[0].period / 2);
  assert.notEqual(Math.round(h0 * 10), Math.round(arena.liftTop(def.lifts[0]) * 10));
});

test('shortcuts: a car on the branch reports progress between its ends', () => {
  const track = venueTrack('gen-circuit-102');
  assert.ok(track.branches?.length, 'expected a shortcut');
  const b = track.branches[0];
  const mid = Math.floor(b.track.count / 2);
  const g = track.query(b.track.x[mid], b.track.z[mid]);
  assert.ok(g.onBranch);
  assert.ok(Math.abs(g.lateral) < track.wallDist, 'inside the walls on the branch');
  assert.ok(g.s > b.s0 && g.s < b.s1, `progress ${g.s} not between ${b.s0} and ${b.s1}`);
});

test('jump kickers launch the car', () => {
  const track = venueTrack('gen-sprint-101');
  const j = track.jumps[0];
  assert.ok(j, 'expected a jump');
  const def = { type: 'sprint', seed: 1 };
  const world = createWorld({ track, cars: [{ params: computeBuild(buildDriver(DRIVERS[1], 2, 1).build).params }], event: createEventState(def, track) });
  world.state.event.phase = 'racing';
  const car = world.state.cars[0];
  const i = track.indexAtDistance(j.s - 80);
  car.pos = { x: track.x[i], y: track.y[i] + 0.8, z: track.z[i] };
  car.quat = { x: 0, y: Math.sin(Math.atan2(-track.tx[i], -track.tz[i]) / 2), z: 0, w: Math.cos(Math.atan2(-track.tx[i], -track.tz[i]) / 2) };
  car.vel = { x: track.tx[i] * 38, y: 0, z: track.tz[i] * 38 };
  let air = 0;
  for (let t = 0; t < 240; t++) {
    stepWorld(world, [{ ...neutralInput(), throttle: 1 }]);
    if (!car.wheels.some((w) => w.contact)) air++;
  }
  assert.ok(air > 20, `only ${air} ticks airborne`);
});

test('pickups heal and respawn', () => {
  const rust = districtEvents(DISTRICTS[0]);
  const { world } = aiEvent(rust.find((e) => e.id === 'rustline-circuit'), 1);
  world.state.event.phase = 'racing';
  const pk = world.state.event.pickups.find((p) => p.type === 'health');
  const car = world.state.cars[0];
  car.hp = car.maxHp * 0.3;
  car.pos = { x: pk.x, y: pk.y, z: pk.z };
  car.vel = { x: 0, y: 0, z: 0 };
  stepWorld(world, [neutralInput()]);
  assert.ok(car.hp > car.maxHp * 0.6);
  assert.equal(pk.active, false);
  car.pos = { x: pk.x + 50, y: pk.y, z: pk.z };
  for (let t = 0; t < 20 * 60; t++) stepWorld(world, [neutralInput()]);
  assert.equal(pk.active, true);
});

test('shops: stock is stable, buying and selling move cash and parts, repairs cost', () => {
  const career = newCareer(generateStarters(4)[0], 4);
  const d = DISTRICTS[0];
  const a = shopStock(career, d, 'shop');
  assert.deepEqual(a, shopStock(career, d, 'shop'));
  const part = a.find((p) => buyPrice(p, 'shop') <= career.cash);
  const cash = career.cash;
  assert.ok(buyPart(career, d, 'shop', part.uid).ok);
  assert.equal(career.cash, cash - buyPrice(part, 'shop'));
  assert.ok(!shopStock(career, d, 'shop').some((p) => p.uid === part.uid), 'sold item leaves the stock');
  const bought = career.inventory.at(-1);
  assert.ok(sellPart(career, bought.uid).ok);
  assert.ok(career.cash > cash - buyPrice(part, 'shop'));
  career.eventsRun++;
  assert.notDeepEqual(shopStock(career, d, 'shop').map((p) => p.type), a.map((p) => p.type));

  const worn = career.cars[0].build.parts.engine;
  worn.condition = 40;
  const before = career.cash;
  assert.ok(repairCost(worn) > 0);
  assert.ok(repairParts(career, [worn]).ok);
  assert.equal(worn.condition, 100);
  assert.ok(career.cash < before);
});

test('a new car can be started from a spare chassis', () => {
  const career = newCareer(generateStarters(5)[0], 5);
  const chassis = career.inventory.find((p) => p.slot === 'chassis');
  const car = addCar(career, chassis.uid);
  assert.equal(career.cars.length, 2);
  assert.equal(career.activeCar, car.id);
  assert.equal(computeBuild(car.build).ok, false);
});

test('modifiers: one-hit wrecks and no nitrous', () => {
  const def = { type: 'sprint', seed: 2, modifiers: ['oneHit', 'noNitro'] };
  const track = venueTrack('gen-sprint-101');
  const world = createWorld({ track, cars: [{ params: computeBuild(buildDriver(DRIVERS[1], 2, 1).build).params }], event: createEventState(def, track) });
  const car = world.state.cars[0];
  assert.equal(car.maxHp, 1);
  run(world, 5, { throttle: 1 });
  assert.equal(car.nitro.charges, 0);
  assert.ok(standings(world).length === 1);
});
