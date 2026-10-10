// Championship Cup (phase 7d): points, the takedown bonus, the tiebreak, the
// reverse grid, the Cup events and their rewards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newCupRun, scoreRound, cupStandings, cupGrid, lastRound } from '../src/career/cup.js';
import { DISTRICTS, districtEvents, bossProgress } from '../src/career/districts.js';
import { computeRewards } from '../src/career/events.js';
import { campaignEvents, maps } from '../src/career/playlist.js';
import { brokenEvents } from '../src/sdk/checks.js';
import { CUP } from '../src/sim/rules.js';

const ev = { cars: 6, cup: { rounds: [{}, {}, {}] } };
const order = (...ids) => ids.map((id) => ({ id }));

test('cup: points per finish, B3 6/4/3/2/1/0', () => {
  const run = newCupRun(ev, 1);
  const r = scoreRound(run, order(2, 0, 1, 3, 4, 5), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(r.points, [4, 3, 6, 2, 1, 0]);
  assert.deepEqual(r.bonus, []);
  assert.deepEqual(run.points, [4, 3, 6, 2, 1, 0]);
});

test('cup: a bonus point for the most takedowns, shared on a tie', () => {
  const run = newCupRun(ev, 1);
  const r = scoreRound(run, order(0, 1, 2, 3, 4, 5), [1, 0, 2, 2, 0, 0]);
  assert.deepEqual(r.bonus, [2, 3]);
  assert.deepEqual(run.points, [6, 4, 3 + CUP.takedownBonus, 2 + CUP.takedownBonus, 1, 0]);
  assert.deepEqual(run.takedowns, [1, 0, 2, 2, 0, 0]);
});

test('cup: ties go to takedowns, then the last round', () => {
  const run = newCupRun(ev, 1);
  scoreRound(run, order(0, 1, 2, 3, 4, 5), [0, 0, 0, 0, 0, 0]);
  scoreRound(run, order(1, 0, 2, 3, 4, 5), [0, 0, 0, 0, 0, 0]);
  assert.equal(run.points[0], run.points[1]);
  assert.deepEqual(cupStandings(run).slice(0, 2), [1, 0]); // (car 1 won the last round)
  run.takedowns[0] = 3;
  assert.deepEqual(cupStandings(run).slice(0, 2), [0, 1]);
});

test('cup: reverse grid after round 1, the leader last', () => {
  const run = newCupRun(ev, 1);
  const poses = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
  assert.deepEqual(cupGrid(run, poses), poses);
  scoreRound(run, order(3, 0, 1, 2, 4, 5), [0, 0, 0, 0, 0, 0]);
  run.round = 1;
  const g = cupGrid(run, poses);
  assert.equal(g[3], 'p5'); // (leader at the back)
  assert.equal(g[5], 'p0'); // (last on pole)
  assert.equal(new Set(g).size, 6);
  assert.equal(lastRound(run, ev), false);
  run.round = 2;
  assert.equal(lastRound(run, ev), true);
});

test('cup: victims gathered across rounds, once each', () => {
  const run = newCupRun(ev, 1);
  scoreRound(run, order(0, 1, 2, 3, 4, 5), [2, 0, 0, 0, 0, 0], [1, 2]);
  scoreRound(run, order(0, 1, 2, 3, 4, 5), [1, 0, 0, 0, 0, 0], [2]);
  assert.deepEqual(run.victims, [1, 2]);
});

test('cup: one per district, 3 full-field race rounds, outside the boss gate', () => {
  for (const d of DISTRICTS) {
    const cup = districtEvents(d).find((e) => e.type === 'cup');
    assert.ok(cup, d.id);
    assert.equal(cup.id, `${d.id}-cup`);
    assert.equal(cup.cup.rounds.length, CUP.rounds);
    for (const r of cup.cup.rounds) {
      assert.ok(r.type === 'sprint' || r.type === 'circuit');
      assert.equal(r.mode, undefined);
      assert.equal(r.cars, CUP.cars);
      assert.equal(r.entryFee, 0);
      assert.equal(r.rivalDriver, null);
      assert.ok(!r.laps || r.laps <= CUP.maxLaps);
    }
    const ids = d.events.filter((e) => e.type !== 'cup').map((e) => `${d.id}-${e.key}`);
    assert.equal(bossProgress({ completed: [...ids.slice(0, 4), `${d.id}-cup`] }, d).done, 4);
    assert.deepEqual(brokenEvents({ ...d, events: d.events.filter((e) => e.type === 'cup') }).map((b) => b.key), ['cup']); // (rounds gone)
  }
});

test('cup: career only, not in quick races or multiplayer maps', () => {
  assert.ok(!campaignEvents(null).some((e) => e.type === 'cup'));
  assert.ok(!maps().some((m) => m.events.some((e) => e.type === 'cup')));
});

test('cup: rounds pay no place cash; the last pays the Cup place × 1.5', () => {
  const car = { takedowns: 0, contact: {} };
  const round = { purse: 1000, cupRound: 1 };
  assert.equal(computeRewards(round, 1, car, 0).total, 0);
  const last = computeRewards({ ...round, cupRound: 3, cupPlace: 1 }, 2, car, 0);
  assert.deepEqual(last.lines[1], ['Cup: 1st place', 1000 * 0.5 * CUP.purseScale]);
});
