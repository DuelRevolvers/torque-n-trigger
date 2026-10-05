import test from 'node:test';
import assert from 'node:assert/strict';
import { PART_TYPES } from '../src/parts/catalog.js';
import { resolvePart, computeBuild, canFit, conditionFactor } from '../src/parts/build.js';
import { makeRng, makePart, randomBuild } from '../src/parts/generate.js';
import { buildTrack } from '../src/sim/track.js';
import { TEST_LOOP } from '../src/sim/tracks/testLoop.js';
import { createWorld } from '../src/sim/world.js';
import { run, autopilot, upOf, makeWorld, STRAIGHT } from './helpers.js';

const part = (slot, type, quality = 'street', extra = {}) => ({ uid: `${slot}-t`, slot, type, quality, traits: [], condition: 100, ...extra });

function baseBuild(overrides = {}) {
  return {
    parts: {
      chassis: part('chassis', 'wedge'),
      engine: part('engine', 'v6'),
      suspension: part('suspension', 'street'),
      transmission: part('transmission', 'six'),
      wheels: part('wheels', 'street'),
      primaryWeapon: part('primaryWeapon', 'chaingun'),
      interiors: part('interiors', 'street'),
      ...overrides,
    },
  };
}

test('quality scales stats; weight is unaffected', () => {
  const junk = resolvePart(part('engine', 'v8hybrid', 'junk'));
  const elite = resolvePart(part('engine', 'v8hybrid', 'elite'));
  assert.equal(Math.round(junk.torque), Math.round(290 * 0.7));
  assert.equal(Math.round(elite.torque), Math.round(290 * 1.45));
  assert.equal(junk.weight, elite.weight);
  assert.ok(resolvePart(part('transmission', 'six', 'elite')).shiftTime < 0.14);
});

test('traits and condition modify stats', () => {
  const light = resolvePart(part('armor', 'heavy', 'street', { traits: ['lightweight'] }));
  assert.equal(light.weight, 200 * 0.92);
  assert.equal(conditionFactor(80), 1);
  assert.equal(conditionFactor(25), 0.75);
  const broken = resolvePart(part('engine', 'v6', 'street', { condition: 0 }));
  assert.equal(broken.torque, 0);
  assert.ok(broken.broken);
});

test('mount sizes are enforced', () => {
  const build = baseBuild({ chassis: part('chassis', 'hatch') });
  assert.equal(canFit(build, part('engine', 'v8hybrid')).ok, false);
  assert.equal(canFit(build, part('engine', 'inline4')).ok, true);
  assert.equal(canFit(build, part('primaryWeapon', 'railgun')).ok, false);
  assert.equal(computeBuild(baseBuild({ chassis: part('chassis', 'hatch') })).ok, false, 'v6 in a hatch');
  // Swapping to a chassis that can't hold the installed engine is refused.
  assert.equal(canFit(baseBuild({ engine: part('engine', 'v8hybrid'), chassis: part('chassis', 'muscle') }), part('chassis', 'wedge')).ok, false);
});

test('missing required parts are reported', () => {
  const build = baseBuild({ engine: null });
  const r = computeBuild(build);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /engine/);
});

test('overweight and power draw produce warnings and penalties', () => {
  const light = computeBuild(baseBuild());
  const heavy = computeBuild(baseBuild({ armor: part('armor', 'heavy'), fuelTank: part('fuelTank', 'longRange'), bodyKit: part('bodyKit', 'ram'), secondaryWeapon: part('secondaryWeapon', 'mines') }));
  assert.ok(heavy.warnings.some((w) => /weight/.test(w)));
  assert.ok(heavy.params.engine.maxTorque < light.params.engine.maxTorque);
  assert.ok(heavy.params.steering.max < light.params.steering.max);
  const hungry = computeBuild(baseBuild({ engine: part('engine', 'inline4', 'junk'), chassis: part('chassis', 'wedge'), primaryWeapon: part('primaryWeapon', 'plasma'), utility: part('utility', 'shield') }));
  assert.ok(hungry.warnings.some((w) => /power/.test(w)));
  assert.ok(hungry.params.combat.powerDeficit > 0);
});

test('every part is a trade-off: armor costs speed, a wing costs top speed', () => {
  const plain = computeBuild(baseBuild());
  const armored = computeBuild(baseBuild({ armor: part('armor', 'composite') }));
  assert.ok(armored.stats.hp.value > plain.stats.hp.value);
  assert.ok(armored.stats.acceleration.value > plain.stats.acceleration.value, 'armor should slow 0-100');
  const winged = computeBuild(baseBuild({ spoiler: part('spoiler', 'high') }));
  assert.ok(winged.stats.grip.value > plain.stats.grip.value);
  assert.ok(winged.stats.topSpeed.value < plain.stats.topSpeed.value);
});

test('PR rises with quality', () => {
  const q = (quality) => {
    const b = baseBuild();
    for (const p of Object.values(b.parts)) if (p) p.quality = quality;
    return computeBuild(b).pr;
  };
  assert.ok(q('junk') < q('street') && q('street') < q('elite'), `${q('junk')} ${q('street')} ${q('elite')}`);
});

test('random builds always fit and are deterministic per seed', () => {
  const a = randomBuild(makeRng(5));
  const b = randomBuild(makeRng(5));
  assert.deepEqual(a, b);
  for (let seed = 1; seed <= 60; seed++) {
    const r = computeBuild(randomBuild(makeRng(seed)));
    assert.ok(r.ok, r.errors.join());
    assert.ok(r.weight <= r.capacity);
  }
});

test('every chassis type at junk and elite quality can lap the test loop', () => {
  const track = buildTrack(TEST_LOOP);
  const rng = makeRng(3);
  for (const chassis of Object.keys(PART_TYPES.chassis)) {
    for (const quality of ['junk', 'elite']) {
      const r = computeBuild(randomBuild(rng, { minQuality: quality, maxQuality: quality, chassis }));
      assert.ok(r.ok, r.errors.join());
      const world = createWorld({ track, cars: [{ params: r.params }] });
      run(world, 75, (c) => autopilot(track, c, { targetSpeed: 26 }));
      const c = world.state.cars[0];
      assert.ok(c.race.lap >= 2, `${chassis}/${quality} only reached lap ${c.race.lap}`);
      assert.ok(upOf(c).y > 0.8, `${chassis}/${quality} not upright`);
    }
  }
});

test('built cars reverse briskly, up to the reverse top speed and no further', () => {
  for (const seed of [3, 11, 27]) {
    const params = computeBuild(randomBuild(makeRng(seed))).params;
    const w = makeWorld(STRAIGHT, params);
    run(w, 0.5, () => ({}));
    run(w, 1, () => ({ brake: 1 }));
    const car = w.state.cars[0];
    assert.ok(car.reverse);
    assert.ok(car.vel.z > 25 / 3.6, `seed ${seed}: only ${(car.vel.z * 3.6).toFixed(0)} km/h backwards after 1 s`);
    run(w, 3, () => ({ brake: 1 }));
    assert.ok(car.vel.z < params.maxReverseSpeed + 1, `seed ${seed}: ${(car.vel.z * 3.6).toFixed(0)} km/h backwards is past the cap`);
  }
});
