import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { neutralInput } from '../src/sim/input.js';
import { computeBuild } from '../src/parts/build.js';
import { STRAIGHT } from './helpers.js';

const part = (slot, type, quality = 'street') => ({ uid: `${slot}-${type}`, slot, type, quality, traits: [], condition: 100 });

function build(extra = {}) {
  return {
    parts: {
      chassis: part('chassis', 'muscle'),
      engine: part('engine', 'v6'),
      suspension: part('suspension', 'street'),
      transmission: part('transmission', 'six'),
      wheels: part('wheels', 'street'),
      primaryWeapon: part('primaryWeapon', 'chaingun'),
      interiors: part('interiors', 'street'),
      ...extra,
    },
  };
}
const conditionsOf = (b) => Object.fromEntries(Object.entries(b.parts).filter(([s, p]) => p && s !== 'chassis' && s !== 'paint').map(([s, p]) => [s, p.condition]));

// Car 0 shooter behind car 1 target on the straight (grid: car 1 is beside car 0;
// move it 20 m ahead of the shooter).
function duel(shooter, target, opts) {
  const w = createWorld({
    track: STRAIGHT,
    cars: [shooter, target].map((b) => ({ params: computeBuild(b).params, conditions: conditionsOf(b) })),
    ...opts,
  });
  const [a, t] = w.state.cars;
  t.pos = { ...a.pos, z: a.pos.z - 20 };
  t.quat = { ...a.quat };
  return w;
}
const step = (w, seconds, input0 = {}, input1 = {}) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) stepWorld(w, [{ ...neutralInput(), ...input0 }, { ...neutralInput(), ...input1 }]);
};

test('primary fire auto-aims, hits, uses ammo and reloads', () => {
  const w = duel(build(), build());
  const t = w.state.cars[1];
  const hp0 = t.hp;
  step(w, 1, { fire1: true });
  assert.ok(t.hp < hp0, 'target took damage');
  assert.ok(w.state.cars[0].weapons.primary.ammo < w.params[0].weapons.primary.ammo);
  step(w, 2, { fire1: true });
  assert.ok(t.hp < hp0 - 100, `hp ${t.hp}`);
});

test('armor reduces damage; front hits wear front parts', () => {
  const plain = duel(build(), build());
  const armored = duel(build(), build({ armor: part('armor', 'heavy') }));
  step(plain, 2, { fire1: true });
  step(armored, 2, { fire1: true });
  const lost = (w) => w.state.cars[1].maxHp - w.state.cars[1].hp;
  assert.ok(lost(armored) < lost(plain) * 0.85, `${lost(armored)} vs ${lost(plain)}`);
  const cond = plain.state.cars[1].condition;
  assert.ok(cond.primaryWeapon < 100 || cond.transmission < 100 || cond.exhaust !== undefined || cond.interiors < 100, 'some part wore');
});

test('wrecks credit a takedown, then respawn with full HP', () => {
  const w = duel(build({ primaryWeapon: part('primaryWeapon', 'chaingun', 'elite') }), build());
  const t = w.state.cars[1];
  t.hp = 20;
  step(w, 2, { fire1: true });
  assert.ok(t.wrecked);
  assert.equal(w.state.cars[0].takedowns, 1);
  assert.ok(w.events.some((e) => e.type === 'wreck'));
  step(w, 3.2);
  assert.equal(t.wrecked, false);
  assert.equal(t.hp, t.maxHp);
});

test('no respawn when respawnOnWreck is false', () => {
  const w = duel(build(), build(), { respawnOnWreck: false });
  w.state.cars[1].hp = 5;
  step(w, 5, { fire1: true });
  assert.ok(w.state.cars[1].wrecked);
});

test('broken engine and burst tires slow the car', () => {
  const fresh = duel(build(), build());
  const broken = duel(build(), build());
  broken.state.cars[0].condition.engine = 0;
  broken.state.cars[0].condition.wheels = 0;
  step(fresh, 4, { throttle: 1 });
  step(broken, 4, { throttle: 1 });
  const speed = (w) => Math.hypot(w.state.cars[0].vel.x, w.state.cars[0].vel.z);
  assert.ok(speed(broken) < speed(fresh) * 0.6);
});

test('cars collide instead of passing through; a ram bumper hurts more', () => {
  const run = (rammer) => {
    const w = duel(rammer, build());
    step(w, 4, { throttle: 1 });
    return w;
  };
  const plain = run(build());
  const ram = run(build({ bodyKit: part('bodyKit', 'ram') }));
  const [a, t] = plain.state.cars;
  assert.ok(a.pos.z > t.pos.z - 1, 'rammer should not pass through the target');
  const lost = (w) => w.state.cars[1].maxHp - w.state.cars[1].hp;
  assert.ok(lost(plain) > 0);
  assert.ok(lost(ram) > lost(plain));
});

test('mines trigger, energy weapons overheat, oil cuts grip', () => {
  const miner = duel(build({ secondaryWeapon: part('secondaryWeapon', 'mines') }), build());
  // Put the target behind the mine layer, driving into the mine.
  const [m, t] = miner.state.cars;
  t.pos = { ...m.pos, z: m.pos.z + 15 };
  step(miner, 0.2, { fire2: true });
  assert.equal(miner.state.mines.length, 1);
  step(miner, 4, {}, { throttle: 0.6 });
  assert.ok(t.hp < t.maxHp, 'mine hurt the target');

  const hot = duel(build({ primaryWeapon: part('primaryWeapon', 'plasma') }), build());
  step(hot, 12, { fire1: true });
  assert.ok(hot.state.cars[0].overheated || hot.state.cars[0].heat > 50);

  const oily = duel(build({ utility: part('utility', 'oil') }), build());
  step(oily, 0.1, { utility: true });
  const zone = oily.state.zones[0];
  oily.state.cars[1].pos = { ...zone.pos };
  step(oily, 0.05);
  assert.ok(oily.state.cars[1].mods.grip < 0.5);
});

test('combat is deterministic', () => {
  const run = () => {
    const w = duel(build({ primaryWeapon: part('primaryWeapon', 'scatter') }), build());
    step(w, 6, { fire1: true, throttle: 1 }, { throttle: 0.5 });
    return w.state;
  };
  assert.deepEqual(run(), run());
});
