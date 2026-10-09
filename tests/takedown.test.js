import test from 'node:test';
import assert from 'node:assert/strict';
import { PAD } from './helpers.js';
import { createWorld, stepWorld, snapshotWorld, restoreWorld } from '../src/sim/world.js';
import { collideCars, wreckPhysical, applyDamage } from '../src/sim/combat.js';
import { reactInput } from '../src/sim/contact.js';
import { tolerance, crashes, award, updateTakedowns, signatureAt } from '../src/sim/takedown.js';
import { resolveSpot } from '../src/sim/event.js';
import { neutralInput } from '../src/sim/input.js';
import { TEST_CAR } from '../src/sim/carParams.js';
import { quatFromYaw, yawFromDirection } from '../src/sim/math.js';

const { length: L, width: W } = TEST_CAR.body;
const R = Math.max(W / 2, L / 4) + 0.15;
const GAP = 2 * R - 0.3;
const NORTH = [0, -1];

// Cars spaced 30 m apart across the pad, all facing north, at rest.
const worldN = (n = 2) =>
  createWorld({ track: PAD, cars: Array.from({ length: n }, () => ({ params: TEST_CAR })), poses: Array.from({ length: n }, (_, i) => ({ pos: { x: i * 30, y: 0.9, z: 0 }, yaw: 0 })) });

function place(world, i, [[x, z], [dx, dz], [vx, vz]]) {
  const c = world.state.cars[i];
  c.pos = { x, y: 0.9, z };
  c.quat = quatFromYaw(yawFromDirection(dx, dz));
  c.vel = { x: vx, y: 0, z: vz };
  c.angVel = { x: 0, y: 0, z: 0 };
}
const sideSlam = (w, v = 20) => {
  place(w, 0, [[-GAP, 0], NORTH, [v, -30]]);
  place(w, 1, [[0, 0], NORTH, [0, -30]]);
  w.events = [];
  collideCars(w);
};
const step = (w, ticks = 1) => {
  for (let k = 0; k < ticks; k++) stepWorld(w, w.state.cars.map(() => neutralInput()));
};
const slammedBy = (w, v, x) => Object.assign(w.state.cars[v].contact, { lastSlamBy: x, lastSlamTick: w.state.tick });
const hurt = (w, i, f = 0.25) => (w.state.cars[i].hp = w.state.cars[i].maxHp * f);
const wallHit = (w, i, impact) => {
  w.state.cars[i].impact = impact;
  step(w);
};
const takedowns = (w) => w.state.cars.map((c) => c.takedowns);

test('crash tolerance follows health, armor, roll cage and a fresh slam', () => {
  const w = worldN();
  assert.ok(Math.abs(tolerance(w, 0) - 1.15) < 1e-9, 'healthy, default roll cage');
  hurt(w, 0);
  slammedBy(w, 0, 1);
  assert.ok(Math.abs(tolerance(w, 0) - 0.25 * 1.15 * 0.4) < 1e-9);
  const armored = createWorld({ track: PAD, cars: [{ params: { ...TEST_CAR, combat: { hp: 500, armor: 0.4, rollCage: 1 } } }] });
  assert.ok(Math.abs(tolerance(armored, 0) - 1.7) < 1e-9);
});

test('a hurt, slammed car is wrecked by a light wall hit; a healthy one is not', () => {
  const w = worldN();
  wallHit(w, 0, 20);
  assert.equal(w.state.cars[0].wrecked, false, 'healthy car survives 20 m/s');
  hurt(w, 0);
  slammedBy(w, 0, 1);
  wallHit(w, 0, 5);
  assert.equal(w.state.cars[0].wrecked, true);
  assert.deepEqual(takedowns(w), [0, 0], 'credit waits 0.5 s');
  step(w, 30);
  assert.deepEqual(takedowns(w), [0, 1]);
  assert.equal(w.state.cars[0].contact.takedownCause, 'wall');
});

test('no takedown if the attacker is wrecked within 0.5 s', () => {
  const w = worldN();
  hurt(w, 0);
  slammedBy(w, 0, 1);
  wallHit(w, 0, 5);
  step(w, 10);
  wreckPhysical(w, 1, 'wall');
  step(w, 30);
  assert.deepEqual(takedowns(w), [0, 0]);
});

test('slam someone, then crash yourself: they get the takedown', () => {
  const w = worldN();
  slammedBy(w, 1, 0); // car 0 slammed car 1
  hurt(w, 0);
  wallHit(w, 0, 10); // then car 0 hits the wall
  step(w, 30);
  assert.deepEqual(takedowns(w), [0, 1]);
});

test('a hard hit wrecks a hurt car outright; the slam that did it is credited', () => {
  const w = worldN();
  sideSlam(w);
  assert.equal(w.state.cars[1].wrecked, false, 'healthy victim survives');
  const w2 = worldN();
  hurt(w2, 1);
  sideSlam(w2);
  assert.equal(w2.state.cars[1].wrecked, true);
  step(w2, 31);
  assert.deepEqual(takedowns(w2), [1, 0]);
  assert.equal(w2.state.cars[1].contact.takedownCause, 'car');
});

test('you cannot crash into the car you just took down', () => {
  const w = worldN();
  hurt(w, 0);
  award(w, 0, 1, 'wall');
  assert.equal(crashes(w, 0, 'car', 60, 1), false);
  w.state.tick += 91;
  assert.equal(crashes(w, 0, 'car', 60, 1), true);
});

test('tipping over soon after a slam is a wreck; on its own it is not', () => {
  const w = worldN();
  const roll = { x: Math.sin(Math.PI / 4), y: 0, z: 0, w: Math.cos(Math.PI / 4) }; // 90 degrees about X
  w.state.cars[0].quat = roll;
  updateTakedowns(w, wreckPhysical);
  assert.equal(w.state.cars[0].wrecked, false);
  slammedBy(w, 0, 1);
  updateTakedowns(w, wreckPhysical);
  assert.equal(w.state.cars[0].wrecked, true);
  assert.equal(w.state.credits[0].cause, 'tipOver');
});

test('rubbing, tailgating and recent gunfire earn the credit', () => {
  // Rubbing: in contact for more than 0.1 s.
  const w = worldN();
  w.state.cars[0].contact.touching[1] = { secs: 0.2, tick: w.state.tick };
  hurt(w, 0, 0.15);
  wallHit(w, 0, 10);
  step(w, 30);
  assert.deepEqual(takedowns(w), [0, 1]);

  // Psych-out: 6 m behind, same heading, for half a second.
  const t = createWorld({ track: PAD, cars: [{ params: TEST_CAR }, { params: TEST_CAR }], poses: [{ pos: { x: 0, y: 0.9, z: 0 }, yaw: 0 }, { pos: { x: 0, y: 0.9, z: 6 }, yaw: 0 }] });
  step(t, 35);
  assert.equal(t.state.cars[0].contact.psychedBy, 1);
  hurt(t, 0, 0.15);
  wallHit(t, 0, 10);
  t.events = [];
  for (let k = 0; k < 30 && !t.events.some((e) => e.type === 'takedown'); k++) {
    t.events = [];
    step(t);
  }
  const e = t.events.find((x) => x.type === 'takedown');
  assert.deepEqual([e.car, e.victim, e.psych], [1, 0, true]);

  // Gunfire: within 8 s counts, older does not.
  for (const [ago, want] of [[60, 1], [600, 0]]) {
    const g = worldN();
    Object.assign(g.state.cars[0], { lastHitBy: 1, lastHitTick: 0 });
    g.state.tick = ago;
    hurt(g, 0, 0.15);
    wallHit(g, 0, 10);
    step(g, 30);
    assert.equal(g.state.cars[1].takedowns, want, `${ago} ticks after the shot`);
  }
});

test('revenge: taking down the car that took you down', () => {
  const w = worldN();
  award(w, 0, 1, 'wall');
  assert.equal(w.state.cars[1].contact.grudge[0], 1);
  w.events = [];
  award(w, 1, 0, 'wall');
  assert.equal(w.events[0].revenge, true);
  assert.equal(w.state.cars[1].contact.revenges, 1);
  assert.equal(w.state.cars[1].contact.grudge[0], undefined);
});

test('Lucky and Denied: a hard wall hit after a slam, survived', () => {
  const w = worldN();
  slammedBy(w, 0, 1);
  w.state.tick += 70; // past the 1 s when a slammed car is fragile, inside the 2 s window
  wallHit(w, 0, 15);
  assert.equal(w.state.cars[0].wrecked, false);
  assert.deepEqual([w.state.cars[0].contact.lucky, w.state.cars[1].contact.denied], [1, 1]);
  wallHit(w, 0, 15);
  assert.equal(w.state.cars[0].contact.lucky, 1, 'once per slam');
});

test('slam reaction steers the victim away, scaled, and less for players', () => {
  const w = worldN();
  w.state.cars[1].ai = {}; // an AI victim
  sideSlam(w);
  const r = w.state.cars[1].contact.react;
  assert.equal(r.dir, 1, 'hit on the left: steer right');
  assert.equal(r.str, 1);
  assert.equal(reactInput(w.state.cars[1], { steer: -1 }).steer, 1, 'forced during the hold');
  const p = worldN();
  sideSlam(p);
  const rp = p.state.cars[1].contact.react;
  assert.ok(Math.abs(rp.str - 0.6) < 1e-9 && Math.abs(rp.hold - 0.18) < 1e-9, 'player: 60 %');
  step(p, 60);
  assert.equal(p.state.cars[1].contact.react, null, 'control back after hold + blend');
  const tp = worldN();
  place(tp, 0, [[-GAP, 0], NORTH, [10, -30]]);
  place(tp, 1, [[0, 0], NORTH, [0, -30]]);
  collideCars(tp);
  assert.equal(tp.state.cars[1].contact.react, null, 'trading paint: no reaction');
});

test('slams hurt the victim more and the attacker less', () => {
  const w = worldN();
  sideSlam(w);
  const [a, v] = w.state.cars.map((c) => c.maxHp - c.hp);
  assert.ok(Math.abs(v / a - 1.25 / 0.85) < 1e-9, `victim ${v}, attacker ${a}`);
});

test('pending credit is paid when the event ends, and survives snapshots', () => {
  const w = worldN();
  hurt(w, 0);
  slammedBy(w, 0, 1);
  wallHit(w, 0, 5);
  const snap = JSON.parse(JSON.stringify(snapshotWorld(w)));
  const w2 = worldN();
  restoreWorld(w2, snap);
  assert.equal(w2.state.credits.length, 1);
  w2.state.event = { done: true };
  updateTakedowns(w2, wreckPhysical);
  assert.deepEqual(takedowns(w2), [0, 1]);
});

test('two takedowns within 1 s make a double; physical ones count as rams', () => {
  const w = worldN(3);
  w.events = [];
  award(w, 0, 1, 'wall');
  step(w, 30); // 0.5 s
  award(w, 0, 2, 'hp');
  const [first, second] = w.events.filter((e) => e.type === 'takedown');
  assert.equal(first.double, false);
  assert.equal(second.double, true);
  assert.deepEqual([w.state.cars[0].contact.doubles, w.state.cars[0].contact.rams], [1, 1]);
});

test('a wall takedown inside a signature spot is a signature takedown; other causes and places are not', () => {
  const w = worldN(4);
  w.state.event = { signatures: [{ name: 'Gas Station', s0: 40, s1: 60 }] };
  w.events = [];
  award(w, 0, 1, 'wall', false, 50);
  award(w, 0, 2, 'car', false, 50);
  award(w, 0, 3, 'wall', false, 70);
  assert.deepEqual(w.events.map((e) => e.signature), ['Gas Station', null, null]);
  assert.deepEqual(w.state.cars[0].contact.signatures, ['Gas Station']);
  // (A spot over a circuit's lap line.)
  const ev = { signatures: [{ name: 'Line', s0: 90, s1: 10 }] };
  assert.deepEqual([95, 5, 50].map((s) => signatureAt(ev, s)?.name ?? null), ['Line', 'Line', null]);
});

test('signature spots resolve from SDK clicks or track progress', () => {
  const track = (closed) => ({ length: 100, closed, query: (x) => ({ s: x }) });
  assert.deepEqual(resolveSpot({ name: 'A', from: [60, 0], to: [20, 0] }, track(false)), { name: 'A', s0: 20, s1: 60 });
  assert.deepEqual(resolveSpot({ name: 'A', from: [60, 0], to: [20, 0] }, track(true)), { name: 'A', s0: 60, s1: 20 });
  assert.deepEqual(resolveSpot({ name: 'B', s0: -10, s1: 5 }, track(true)), { name: 'B', s0: 90, s1: 5 });
});

test('a hazard hit (no source) credits no one, even if the car then crashes', () => {
  const w = worldN(2);
  applyDamage(w, 1, 5, w.state.cars[1].pos, null);
  assert.equal(w.state.cars[1].lastHitBy, -1);
  wreckPhysical(w, 1, 'wall');
  step(w, 40);
  assert.deepEqual(takedowns(w), [0, 0]);
});
