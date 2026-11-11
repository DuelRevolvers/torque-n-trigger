// Championship Cup (B3 integration, phase 7d; B3's Grand Prix,
// docs/gameplay/modes.md §2): rounds in a row against the same field, points
// per finish, a bonus point for the round's most takedowns. The series lives
// in memory between rounds (RaceScreen's args); quitting restarts it (B3).

import { CUP } from '../sim/rules.js';

// A new series for a Cup event (made by districtEvents: event.cup.rounds).
// seed: picks the field, the same in every round.
export function newCupRun(event, seed) {
  const n = event.cars || CUP.cars;
  return { round: 0, seed, points: Array(n).fill(0), takedowns: Array(n).fill(0), last: Array(n).fill(n), victims: [], rounds: [] };
}

// Scores a finished round. order: standings (best first, { id }); takedowns:
// per car index. Returns { points, bonus } for the round; changes run.
export function scoreRound(run, order, takedowns, victims = []) {
  const points = Array(run.points.length).fill(0);
  order.forEach((r, k) => {
    points[r.id] = CUP.points[k] || 0;
    run.last[r.id] = k + 1;
  });
  // The bonus: the most takedowns this round, at least one (shared on a tie).
  const most = Math.max(0, ...takedowns);
  const bonus = most > 0 ? takedowns.flatMap((t, i) => (t === most ? [i] : [])) : [];
  for (const i of bonus) points[i] += CUP.takedownBonus;
  points.forEach((p, i) => {
    run.points[i] += p;
    run.takedowns[i] += takedowns[i] || 0;
  });
  for (const v of victims) if (!run.victims.includes(v)) run.victims.push(v);
  run.rounds.push({ points, bonus });
  return { points, bonus };
}

// Car indexes, Cup leader first: points, then takedowns, then the last round's finish.
export function cupStandings(run) {
  return run.points.map((_, i) => i).sort((a, b) => run.points[b] - run.points[a] || run.takedowns[b] - run.takedowns[a] || run.last[a] - run.last[b]);
}

// The grid after round 1: reverse Cup order, so the leader starts last.
// poses: gridPoses order (pole first). Returns one pose per car index.
export function cupGrid(run, poses) {
  if (!run.round) return poses;
  const rev = cupStandings(run).reverse();
  return poses.map((_, i) => poses[rev.indexOf(i)]);
}

export const lastRound = (run, event) => run.round >= event.cup.rounds.length - 1;
