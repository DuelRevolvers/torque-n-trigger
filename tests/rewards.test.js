import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRewards } from '../src/career/events.js';
import { recordFeats, progress, triggerText } from '../src/career/unlocks.js';

test('takedown bonuses are paid as reward lines, scaled by tier', () => {
  const car = { takedowns: 3, contact: { signatures: ['A', 'B'], revenges: 1, doubles: 1, lucky: 2 }, style: { cash: 0 } };
  const lines = Object.fromEntries(computeRewards({ purse: 1000 }, 1, car, 0).lines);
  assert.equal(lines['Signature takedowns x2'], 700);
  assert.equal(lines['Revenge x1'], 100);
  assert.equal(lines['Double takedowns x1'], 100);
  assert.equal(lines['Lucky escapes x2'], 50);
  assert.equal(Object.fromEntries(computeRewards({ purse: 1000 }, 1, car, 2).lines)['Revenge x1'], 200);
  // (No bonuses: no extra lines.)
  assert.equal(computeRewards({ purse: 1000 }, 1, { takedowns: 0, contact: {} }, 0).lines.length, 1);
});

test('revenges, signature takedowns and rams are tallied as feats', () => {
  const career = {};
  recordFeats(career, { type: 'sprint', district: 'strip', place: 2, takedowns: 3, revenges: 1, signatures: 2, rams: 3 });
  assert.ok(progress(career, { rams: 3, district: 'strip' }).met);
  assert.ok(progress(career, { signatures: 2, type: 'sprint' }).met);
  assert.equal(progress(career, { revenges: 2 }).have, 1);
  assert.equal(triggerText({ signatures: 1 }), 'Make 1 signature takedown');
});
