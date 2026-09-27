import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStarters, STARTER_SLOTS, buildValue, ARCHETYPES, PR_SPREAD } from '../src/parts/starters.js';
import { SLOTS } from '../src/parts/catalog.js';
import { computeBuild } from '../src/parts/build.js';
import { newCareer, activeCar } from '../src/career/career.js';
import { installPart, removePart, repaint, checkInstall } from '../src/career/garage.js';
import { makePart, makeRng } from '../src/parts/generate.js';

test('starters follow the generation rules', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const cars = generateStarters(seed);
    assert.deepEqual(cars.map((c) => c.archetype), ['speed', 'brawler', 'balanced']);
    const weapons = new Set();
    for (const c of cars) {
      const filled = SLOTS.filter((s) => c.build.parts[s]);
      assert.deepEqual(filled.sort(), [...STARTER_SLOTS].sort());
      const qualities = Object.values(c.build.parts).map((p) => p.quality);
      assert.ok(qualities.every((q) => q === 'junk' || q === 'stock'));
      assert.ok(qualities.filter((q) => q === 'stock').length <= 2);
      assert.ok(ARCHETYPES[c.archetype].chassis.includes(c.build.parts.chassis.type));
      assert.ok(computeBuild(c.build).ok);
      weapons.add(c.build.parts.primaryWeapon.type);
    }
    assert.equal(weapons.size, 3, 'weapon types differ');
    const prs = cars.map((c) => computeBuild(c.build).pr);
    assert.ok(Math.max(...prs) <= Math.min(...prs) * PR_SPREAD, `PRs ${prs}`);
    const values = cars.map((c) => buildValue(c.build));
    assert.ok(Math.max(...values) <= Math.min(...values) * 1.1, `values ${values}`);
  }
  assert.deepEqual(generateStarters(9), generateStarters(9));
});

test('install swaps parts through the inventory; remove and fit rules hold', () => {
  const career = newCareer(generateStarters(3)[1], 3);
  const car = activeCar(career);
  const before = career.inventory.length;
  const spare = career.inventory.find((p) => p.slot === 'armor' && checkInstall(car.build, p).ok);
  assert.ok(installPart(career, car, spare.uid).ok);
  assert.equal(car.build.parts.armor.uid, spare.uid);
  assert.equal(career.inventory.length, before - 1);

  const oldWheels = car.build.parts.wheels;
  const wheels = career.inventory.find((p) => p.slot === 'wheels');
  assert.ok(installPart(career, car, wheels.uid).ok);
  assert.ok(career.inventory.some((p) => p.uid === oldWheels.uid), 'old part returns to inventory');

  assert.equal(removePart(career, car, 'engine').ok, false);
  assert.ok(removePart(career, car, 'armor').ok);

  const hatch = makePart(makeRng(1), 'chassis', 'hatch', 'junk');
  career.inventory.push(hatch);
  assert.equal(installPart(career, car, hatch.uid).ok, false, 'brawler parts should not fit a hatch');

  repaint(car, { color: '#123456', finish: 'chrome' });
  assert.equal(car.build.parts.paint.color, '#123456');
  assert.equal(car.build.parts.paint.type, 'chrome');
});
