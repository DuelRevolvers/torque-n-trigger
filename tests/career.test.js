import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../src/sim/track.js';
import { buildArena } from '../src/sim/arena.js';
import { getVenue } from '../src/sim/tracks/venues.js';
import { createWorld, stepWorld, respawnCar } from '../src/sim/world.js';
import { createEventState, gridPoses, standings } from '../src/sim/event.js';
import { initAi, aiInput } from '../src/sim/ai.js';
import { neutralInput } from '../src/sim/input.js';
import { placeCar } from '../src/sim/vehicle.js';
import { yawFromDirection } from '../src/sim/math.js';
import { SIM_DT } from '../src/config.js';
import { computeBuild } from '../src/parts/build.js';
import { DRIVERS, buildDriver } from '../src/parts/drivers.js';
import { DISTRICTS, districtEvents } from '../src/career/districts.js';
import { shopStock, buyPart, sellPart, buyPrice, repairCost, repairParts } from '../src/career/shop.js';
import { newCareer, addCar } from '../src/career/career.js';
import { generateStarters } from '../src/parts/starters.js';
import { makeRng, makePart } from '../src/parts/generate.js';

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

test('open routes: no invisible walls off the road, unless the event has barriers', () => {
  const rust = districtEvents(DISTRICTS[0]);
  const sprint = rust.find((e) => e.type === 'sprint' && !e.rival);
  const track = venueTrack(sprint.venue, sprint);
  assert.ok(track.reach, 'a Rustline sprint is open');
  const i = track.reach.r.findIndex((r) => r >= 30);
  assert.ok(i >= 0);
  // 25 m out: open ground; past the reach: the wall.
  const at = (lat) => track.query(track.x[i] + track.rx[i] * lat, track.z[i] + track.rz[i] * lat, i);
  const pen = (lat) => Math.abs(at(lat).lateral) - track.wallDist;
  if (!track.blockedAt(track.x[i] + track.rx[i] * 25, track.z[i] + track.rz[i] * 25, track.y[i])) assert.ok(pen(25) <= 0);
  assert.ok(pen(track.reach.r[i] + 1) > 0);
  const walled = venueTrack(sprint.venue, { ...sprint, barriers: true });
  assert.equal(walled.reach, null);
  assert.ok(Math.abs(walled.query(track.x[i] + track.rx[i] * 25, track.z[i] + track.rz[i] * 25, i).lateral) > walled.wallDist);
});

test('open routes: a car driven into a fence stays on its side of it', () => {
  const dash = districtEvents(DISTRICTS[0]).find((e) => e.name === 'Dockside Dash');
  const { world, track } = aiEvent(dash, 1);
  world.state.event.phase = 'racing';
  const car = world.state.cars[0];
  // Drives at it from (px, pz) along dir at 30 m/s for 1.5 s: the body's
  // middle never ends up alongside the fence within 0.5 m of it.
  const drive = (o, ax, az, nx, nz, y, px, pz, dir) => {
    placeCar(car, world.params[0], { pos: { x: px, y: y + 0.6, z: pz }, yaw: yawFromDirection(dir[0], dir[1]) });
    car.vel = { x: dir[0] * 30, y: 0, z: dir[1] * 30 };
    for (let t = 0, last = { ...car.pos }; t < 90; t++) {
      run(world, 1 / 60, { throttle: 1 });
      if (Math.hypot(car.pos.x - last.x, car.pos.z - last.z) > 3) break; // (put back on the road)
      last = { ...car.pos };
      const side = (car.pos.x - o.x) * nx + (car.pos.z - o.z) * nz;
      const along = (car.pos.x - o.x) * ax + (car.pos.z - o.z) * az;
      if (Math.abs(along) < Math.max(o.hw, o.hd)) assert.ok(Math.abs(side) > 0.5, `into the fence at ${o.x.toFixed(1)}, ${o.z.toFixed(1)} (${side.toFixed(2)} m)`);
    }
  };
  const clear = (x, z, y) => !track.blockedAt(x, z, y, 1.2) && Math.abs(track.query(x, z).height - y) < 0.3;
  let sides = 0;
  let ends = 0;
  for (const o of track.obstacles) {
    if (Math.min(o.hw, o.hd) > 0.2 || Math.max(o.hw, o.hd) < 2 || o.h < 2) continue;
    const L = Math.max(o.hw, o.hd);
    const yaw = o.yaw || 0;
    const [ax, az] = o.hd >= o.hw ? [Math.sin(yaw), Math.cos(yaw)] : [Math.cos(yaw), -Math.sin(yaw)];
    const [nx, nz] = [az, -ax];
    const y = track.query(o.x, o.z).height;
    // Side on, at 30 and 70 degrees, with open ground 8 m either side.
    if (sides < 3 && [-8, -4, 4, 8].every((d) => clear(o.x + nx * d, o.z + nz * d, y))) {
      for (const lean of [0.5, 1.2]) {
        const dir = [-nx * Math.sin(lean) + ax * Math.cos(lean), -nz * Math.sin(lean) + az * Math.cos(lean)];
        drive(o, ax, az, nx, nz, y, o.x + nx * 7 - dir[0] * 4, o.z + nz * 7 - dir[1] * 4, dir);
      }
      sides++;
    }
    // End on, where the fence stops (a gap, a corner): straight at its end, a little off its line.
    for (const sg of [-1, 1]) {
      if (ends >= 3 || ![2, 5, 8, 11].every((d) => clear(o.x + ax * sg * (L + d), o.z + az * sg * (L + d), y))) continue;
      for (const off of [0.2, 0.5, 0.8]) {
        drive(o, ax, az, nx, nz, y, o.x + ax * sg * (L + 9) + nx * off, o.z + az * sg * (L + 9) + nz * off, [-ax * sg, -az * sg]);
      }
      ends++;
    }
    if (sides >= 3 && ends >= 3) break;
  }
  assert.ok(sides > 0 && ends > 0, 'found fences to drive into');
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
  assert.ok(def.platforms.length >= 1 && def.lifts.length >= 1 && def.sweepers.length + (def.movers || []).length >= 1);
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
  for (let t = 0; t < 300; t++) {
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

test('AI: a hurt car crosses the road for a health pickup ahead', () => {
  const rust = districtEvents(DISTRICTS[0]);
  const { world, track } = aiEvent(rust.find((e) => e.id === 'rustline-circuit'), 1);
  world.state.event.phase = 'racing';
  world.state.event.time = 5;
  const pk = world.state.event.pickups.find((p) => p.type === 'health' && Math.abs(track.queryMain(p.x, p.z).trueLateral) > 1.5);
  const at = track.queryMain(pk.x, pk.z);
  const car = world.state.cars[0];
  car.lateral = -Math.sign(at.trueLateral); // (starts on the far side)
  respawnCar(world, 0, { index: track.indexAtDistance(at.s - 70) });
  car.hp = car.maxHp * 0.3;
  run(world, 6);
  assert.equal(pk.active, false, 'the pickup was left');
  assert.ok(car.hp > car.maxHp * 0.5);
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
  const chassis = makePart(makeRng(5), 'chassis', 'muscle', 'junk');
  career.inventory.push(chassis);
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
