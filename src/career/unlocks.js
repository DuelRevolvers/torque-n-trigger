// The T&T Creator's special assets (gadgets and a district's landmarks), and
// what unlocks each: a trigger, something done over the career, not one
// particular event (so the events can change and still count). Every race's
// result is tallied (recordFeats) by what kind of event it was and where; a
// trigger reads the tally.
//
// Triggers:
//   { wins: n, type?, district? }       first places (type: sprint, circuit, drag, arena)
//   { podiums: n, type?, district? }    top three
//   { takedowns: n, type?, district? }  cars wrecked, in total
//   { clean: n, type?, district? }      wins without being wrecked once
//   { margin: s, type?, district? }     a win by s seconds or more (races)
//   { boss: districtId }                that district's boss beaten
//   { bosses: n }                       n bosses beaten
import { DISTRICTS } from './districts.js';

const TYPE_NAMES = { sprint: 'sprint', circuit: 'circuit', drag: 'drag race', arena: 'arena event' };
const districtName = (id) => DISTRICTS.find((d) => d.id === id)?.name || id;

export const SPECIALS = [
  // Gadgets.
  { id: 'lift', name: 'Lift pad', gadgets: ['lift'], unlock: { wins: 1 } },
  { id: 'gates', name: 'Gates and trigger pads', gadgets: ['gate', 'trigger'], unlock: { wins: 3 } },
  { id: 'plate', name: 'Live plate', gadgets: ['hazard'], unlock: { wins: 1, type: 'arena' } },
  { id: 'sweeper', name: 'Spinning bar', gadgets: ['sweeper'], unlock: { takedowns: 10, type: 'arena' } },
  { id: 'mover', name: 'Moving block', gadgets: ['mover'], unlock: { podiums: 5 } },
  // Landmarks, district by district (their objects, placed or copied).
  { id: 'cranes', name: 'Quay cranes', types: ['quayCrane'], unlock: { wins: 2, district: 'rustline' } },
  { id: 'drydock', name: 'The dry dock', types: ['drydock', 'hull'], unlock: { boss: 'rustline' } },
  { id: 'arches', name: 'Neon arches', types: ['arch', 'archLeg'], unlock: { wins: 1, type: 'sprint', district: 'strip' } },
  { id: 'deadSigns', name: 'Dead neon signs', types: ['deadSign'], unlock: { takedowns: 5, district: 'strip' } },
  { id: 'palace', name: 'The Glow Palace front', types: ['palaceFront', 'porteCochere', 'podium'], unlock: { boss: 'strip' } },
  { id: 'golf', name: 'Golf fairways', types: ['fairway'], unlock: { clean: 1, district: 'maple' } },
  { id: 'waterTower', name: 'The water tower', types: ['waterTower', 'towerLeg'], unlock: { boss: 'maple' } },
  { id: 'kickers', name: 'Gap jumps and kickers', types: ['gapJump', 'kicker'], unlock: { margin: 5, district: 'chrome' } },
  { id: 'hq', name: 'Kessler HQ', types: ['hqTower', 'lobby', 'lobbyWall'], unlock: { boss: 'chrome' } },
  { id: 'scrapCrane', name: 'The scrapyard crane', types: ['scrapCrane', 'craneBoom'], unlock: { takedowns: 15, district: 'undercity' } },
  { id: 'sunkBus', name: 'The sunken bus', types: ['sunkBus'], unlock: { boss: 'undercity' } },
  { id: 'triumph', name: 'Triumphal arches', types: ['triumph', 'archPier'], unlock: { wins: 3, district: 'spire' } },
  { id: 'fountains', name: 'Fountains', types: ['fountain'], unlock: { clean: 2, district: 'spire' } },
  { id: 'spire', name: 'The Spire', types: ['spire'], unlock: { boss: 'spire' } },
];

const METRICS = ['wins', 'podiums', 'takedowns', 'clean', 'revenges', 'signatures', 'rams'];

// A race's result, into the career's tally. r: { type, district, place,
// takedowns, wrecks, margin (seconds ahead of second, on a win), revenges,
// signatures (signature takedowns), rams (takedowns by wall, car hit or tip-over) }.
export function recordFeats(career, r) {
  const T = (career.tally ||= {});
  const keys = (metric) => [r.type, ''].flatMap((t) => [r.district, ''].map((d) => `${metric}|${t}|${d}`));
  const add = (metric, v) => {
    if (v) for (const k of keys(metric)) T[k] = (T[k] || 0) + v;
  };
  const win = r.place === 1;
  add('wins', win ? 1 : 0);
  add('podiums', r.place > 0 && r.place <= 3 ? 1 : 0);
  add('takedowns', r.takedowns || 0);
  add('clean', win && !r.wrecks ? 1 : 0);
  add('revenges', r.revenges || 0);
  add('signatures', r.signatures || 0);
  add('rams', r.rams || 0);
  if (win && r.margin > 0) for (const k of keys('margin')) T[k] = Math.max(T[k] || 0, r.margin);
}

// How far along a trigger is: { have, need, met }.
export function progress(career, u) {
  const T = career?.tally || {};
  const key = (metric) => `${metric}|${u.type || ''}|${u.district || ''}`;
  if (u.boss) return met(career?.bosses?.includes(u.boss) ? 1 : 0, 1);
  if (u.bosses) return met(career?.bosses?.length || 0, u.bosses);
  if (u.margin) return met(T[key('margin')] >= u.margin ? 1 : 0, 1);
  const metric = METRICS.find((m) => u[m] !== undefined);
  return met(T[key(metric)] || 0, u[metric]);
}
const met = (have, need) => ({ have: Math.min(have, need), need, met: have >= need });

// A trigger in words: "Win 3 sprints in Neon Strip".
export function triggerText(u) {
  const where = u.district ? ` in ${districtName(u.district)}` : '';
  const kind = (n) => (u.type ? `${TYPE_NAMES[u.type]}${n === 1 ? '' : 's'}` : n === 1 ? 'race' : 'races');
  if (u.boss) return `Beat ${districtName(u.boss)}'s boss`;
  if (u.bosses) return `Beat ${u.bosses} bosses`;
  if (u.margin) return `Win ${u.type ? `a ${TYPE_NAMES[u.type]}` : 'a race'}${where} by ${u.margin} s or more`;
  if (u.wins !== undefined) return `Win ${u.wins === 1 ? (u.type ? `a ${TYPE_NAMES[u.type]}` : 'a race') : `${u.wins} ${kind(u.wins)}`}${where}`;
  if (u.podiums !== undefined) return `Finish in the top three ${u.podiums} time${u.podiums === 1 ? '' : 's'}${u.type ? ` in ${kind(2)}` : ''}${where}`;
  if (u.takedowns !== undefined) return `Take down ${u.takedowns} cars${u.type ? ` in ${kind(2)}` : ''}${where}`;
  if (u.revenges !== undefined) return `Get revenge ${u.revenges} time${u.revenges === 1 ? '' : 's'}${u.type ? ` in ${kind(2)}` : ''}${where}`;
  if (u.signatures !== undefined) return `Make ${u.signatures} signature takedown${u.signatures === 1 ? '' : 's'}${u.type ? ` in ${kind(2)}` : ''}${where}`;
  if (u.rams !== undefined) return `Ram ${u.rams} cars to a wreck${u.type ? ` in ${kind(2)}` : ''}${where}`;
  if (u.clean !== undefined) return `Win ${u.clean === 1 ? (u.type ? `a ${TYPE_NAMES[u.type]}` : 'a race') : `${u.clean} ${kind(u.clean)}`}${where} without being wrecked`;
  return '';
}

export const unlockedIds = (career) => new Set(SPECIALS.filter((s) => progress(career, s.unlock).met).map((s) => s.id));

// The special asset an object type or gadget is, if it is one.
export const specialOfType = (t) => SPECIALS.find((s) => s.types?.includes(t)) || null;
export const specialOfGadget = (g) => SPECIALS.find((s) => s.gadgets?.includes(g)) || null;
