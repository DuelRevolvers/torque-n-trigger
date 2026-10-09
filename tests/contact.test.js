import test from 'node:test';
import assert from 'node:assert/strict';
import { PAD } from './helpers.js';
import { createWorld, snapshotWorld, restoreWorld } from '../src/sim/world.js';
import { collideCars } from '../src/sim/combat.js';
import { classifyContact, rubTime } from '../src/sim/contact.js';
import { TEST_CAR } from '../src/sim/carParams.js';
import { quatFromYaw, yawFromDirection } from '../src/sim/math.js';

const { length: L, width: W } = TEST_CAR.body;
const R = Math.max(W / 2, L / 4) + 0.15; // collision sphere radius (combat.js)
const GAP = 2 * R - 0.3; // sphere centres this far apart overlap by 0.3 m

const world2 = () => createWorld({ track: PAD, cars: [{ params: TEST_CAR }, { params: TEST_CAR }] });

// [pos [x, z], facing [dx, dz], velocity [vx, vz]]
function place(world, i, [[x, z], [dx, dz], [vx, vz]]) {
  const c = world.state.cars[i];
  c.pos = { x, y: 0.9, z };
  c.quat = quatFromYaw(yawFromDirection(dx, dz));
  c.vel = { x: vx, y: 0, z: vz };
  c.angVel = { x: 0, y: 0, z: 0 };
}

// Stages one collision between car 0 (a) and car 1 (b); returns the contact event.
function hit(world, a, b) {
  place(world, 0, a);
  place(world, 1, b);
  world.events = [];
  collideCars(world);
  return world.events.find((e) => e.type === 'contact');
}

const NORTH = [0, -1];
const side = (vx, va = -30, vb = -30) => [[[-GAP, 0], NORTH, [vx, va]], [[0, 0], NORTH, [0, vb]]];
const rear = (vb) => [[[0, 0], NORTH, [0, -30]], [[0, -(L / 2 + GAP)], NORTH, [0, vb]]];

test('side hit at 4 m/s is trading paint, at 20 m/s a slam', () => {
  const w = world2();
  const e = hit(w, ...side(4));
  assert.equal(e.label, 'tradePaint');
  assert.equal(e.geo, 'side');
  assert.equal(e.attacker, 0);
  assert.equal(w.state.cars[1].contact.lastSlamBy, -1, 'trading paint is not a slam');
  assert.ok(w.events.some((x) => x.type === 'crash'), 'the crash event still fires');

  const w2 = world2();
  const s = hit(w2, ...side(20));
  assert.equal(s.label, 'slam');
  assert.ok(Math.abs(s.impact - 20) < 1e-9);
  const v = w2.state.cars[1].contact;
  assert.deepEqual([v.lastSlamBy, v.lastSlamKind, v.lastSlamGeo, v.hitSide], [0, 'slam', 'side', 'left']);
  assert.equal(w2.state.cars[0].contact.lastPartner, 1);
});

test('nose into tail at 12 m/s is a bump, at 20 m/s a shunt', () => {
  const b = hit(world2(), ...rear(-18));
  assert.deepEqual([b.label, b.geo, b.attacker, b.victim], ['bump', 'shunt', 0, 1]);
  const w = world2();
  const s = hit(w, ...rear(-10));
  assert.equal(s.label, 'shunt');
  assert.equal(w.state.cars[1].contact.hitSide, 'rear');
});

test('T-bone and head-on geometry', () => {
  const t = hit(world2(), [[-L / 4 - GAP, -L / 4], [1, 0], [25, 0]], [[0, 0], NORTH, [0, -5]]);
  assert.deepEqual([t.label, t.geo, t.attacker], ['slam', 'tbone', 0]);
  const h = hit(world2(), [[0, 0], NORTH, [0, -15]], [[0, -(L / 2 + GAP)], [0, 1], [0, 15]]);
  assert.deepEqual([h.label, h.geo], ['slam', 'headOn']);
  assert.ok(Math.abs(h.impact - 30) < 1e-9);
});

test('a much faster victim takes the attacker role', () => {
  const e = hit(world2(), ...side(4, -5, -30)); // slow car sideswipes a car 23.6 m/s faster
  assert.equal(e.label, 'tradePaint');
  assert.deepEqual([e.attacker, e.victim], [1, 0]);
});

test('the same pair cannot slam again within 1 s', () => {
  const w = world2();
  assert.equal(hit(w, ...side(20)).label, 'slam');
  w.state.tick = 30;
  assert.equal(hit(w, ...side(20)).label, 'tradePaint');
  assert.equal(w.state.cars[1].contact.lastSlamTick, 0);
  w.state.tick = 61;
  assert.equal(hit(w, ...side(20)).label, 'slam');
  assert.equal(w.state.cars[1].contact.lastSlamTick, 61);
});

test('rub time builds while touching and resets after 1 s apart', () => {
  const w = world2();
  for (let k = 0; k < 30; k++) {
    assert.equal(hit(w, ...side(0)), undefined, 'touching without closing is not an impact');
    w.state.tick++;
  }
  assert.ok(Math.abs(rubTime(w, 0, 1) - 0.5) < 1e-9);
  assert.equal(rubTime(w, 1, 0), rubTime(w, 0, 1));
  w.state.tick += 61;
  assert.equal(rubTime(w, 0, 1), 0);
  hit(w, ...side(0));
  assert.ok(Math.abs(rubTime(w, 0, 1) - 1 / 60) < 1e-9);
});

test('huge hits and light touches', () => {
  const car = (z, vz) => ({ pos: { x: 0, z }, vel: { x: 0, z: vz }, fwd: { x: 0, z: -1 } });
  const n = { x: 0, z: -1 };
  assert.equal(classifyContact({ a: car(0, -80), b: car(-5, -5), n, impact: 75 }).label, 'huge');
  assert.deepEqual(classifyContact({ a: car(0, -30), b: car(-5, -25), n, impact: 5 }), { label: 'rub', geo: 'shunt', attacker: 'a', angle: 0 });
});

test('contact data survives snapshot, restore and JSON', () => {
  const w = world2();
  hit(w, ...side(20));
  const snap = snapshotWorld(w);
  const w2 = world2();
  restoreWorld(w2, snap);
  assert.deepEqual(w2.state.cars.map((c) => c.contact), w.state.cars.map((c) => c.contact));
  assert.deepEqual(JSON.parse(JSON.stringify(snap.cars[1].contact)), w.state.cars[1].contact);
});
