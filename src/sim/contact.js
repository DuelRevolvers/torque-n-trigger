// Car-to-car contact classification: what kind of hit happened, who did it and
// when. Rules adapted from Burnout 3 (see rules.js). Phase 1 only records the
// result on both cars (plain data in car.contact) and pushes a 'contact' event;
// nothing here changes damage or handling.

import { sub, quatRotate, quatRotateInv } from './math.js';
import { SIM_HZ, SIM_DT } from '../config.js';
import { CONTACT as C } from './rules.js';

const FWD = { x: 0, y: 0, z: -1 };
const SLAMS = new Set(['slam', 'shunt', 'huge']); // hits that count as a slam on the victim

export const newContact = () => ({
  lastSlamBy: -1, lastSlamTick: -1, lastSlamKind: null, lastSlamGeo: null, hitSide: null,
  lastPartner: -1, lastPartnerTick: -1,
  touching: {}, // other car index -> { secs, tick }: continuous contact time (for grinding)
});

const flat = (v) => {
  const l = Math.hypot(v.x, v.z);
  return l > 1e-6 ? { x: v.x / l, z: v.z / l } : { x: 0, z: -1 };
};
const angleDeg = (u, v) => (Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.z * v.z))) * 180) / Math.PI;

// Pure: classifies one hit. a/b: { pos, vel, fwd }; n: unit normal from a to b;
// impact: closing speed along n (m/s); cooling: this pair slammed within the
// cooldown. Returns { label, geo, attacker: 'a' | 'b', angle (heading difference, degrees) }.
export function classifyContact({ a, b, n, impact, cooling = false }) {
  const fa = flat(a.fwd);
  const fb = flat(b.fwd);
  const angle = angleDeg(fa, fb);
  const ab = flat(sub(b.pos, a.pos));
  let geo;
  let attacker;
  if (angle <= C.alignedDeg) {
    if (angleDeg(fa, ab) <= C.shuntConeDeg) [geo, attacker] = ['shunt', 'a'];
    else if (angleDeg(fb, { x: -ab.x, z: -ab.z }) <= C.shuntConeDeg) [geo, attacker] = ['shunt', 'b'];
    else geo = 'side';
  } else if (angle >= C.headOnDeg) geo = 'headOn';
  else geo = Math.abs(angle - 90) <= C.tboneDeg ? 'tbone' : 'angled';

  if (!attacker) {
    // The car moving into the other is the attacker, unless the other is much faster.
    const intoA = a.vel.x * n.x + a.vel.z * n.z;
    const intoB = -(b.vel.x * n.x + b.vel.z * n.z);
    attacker = intoA >= intoB ? 'a' : 'b';
    const sa = Math.hypot(a.vel.x, a.vel.z);
    const sb = Math.hypot(b.vel.x, b.vel.z);
    if ((attacker === 'a' ? sb - sa : sa - sb) >= C.attackerFlip) attacker = attacker === 'a' ? 'b' : 'a';
  }

  let label;
  if (impact > C.huge) label = 'huge';
  else if (geo === 'shunt') label = impact > C.shunt ? 'shunt' : impact >= C.bump ? 'bump' : 'rub';
  else label = impact > C.slam ? 'slam' : impact >= C.tradePaint ? 'tradePaint' : 'rub';
  if (cooling && label === 'slam') label = 'tradePaint';
  if (cooling && label === 'shunt') label = 'bump';
  return { label, geo, attacker, angle };
}

// Which side of car j a world point is on: 'front' | 'rear' | 'left' | 'right'.
function hitSide(world, j, point) {
  const car = world.state.cars[j];
  const local = quatRotateInv(car.quat, sub(point, car.pos));
  const L = world.params[j].body.length;
  return local.z < -L * 0.25 ? 'front' : local.z > L * 0.25 ? 'rear' : local.x > 0 ? 'right' : 'left';
}

const slammedBy = (car, other, tick) =>
  car.contact.lastSlamBy === other && tick - car.contact.lastSlamTick < C.pairCooldown * SIM_HZ;

// Cars a and b overlap this tick: builds up their rub time.
export function touchContact(world, a, b) {
  const { cars, tick } = world.state;
  for (const [i, j] of [[a, b], [b, a]]) {
    const t = (cars[i].contact ||= newContact()).touching; // (states saved before contact existed)
    const e = t[j];
    if (e && tick - e.tick <= C.rubReset * SIM_HZ) {
      e.secs += SIM_DT;
      e.tick = tick;
    } else t[j] = { secs: SIM_DT, tick };
  }
}

// Seconds car i has been touching car j without a break (0 if not touching).
export function rubTime(world, i, j) {
  const e = world.state.cars[i].contact.touching[j];
  return e && world.state.tick - e.tick <= C.rubReset * SIM_HZ ? e.secs : 0;
}

// Cars a and b closing at `impact` m/s along n (a -> b): classify, record, report.
export function noteContact(world, a, b, n, impact, point) {
  const { cars, tick } = world.state;
  const A = cars[a];
  const B = cars[b];
  const r = classifyContact({
    a: { pos: A.pos, vel: A.vel, fwd: quatRotate(A.quat, FWD) },
    b: { pos: B.pos, vel: B.vel, fwd: quatRotate(B.quat, FWD) },
    n, impact, cooling: slammedBy(A, b, tick) || slammedBy(B, a, tick),
  });
  const atk = r.attacker === 'a' ? a : b;
  const vic = atk === a ? b : a;
  for (const [i, j] of [[a, b], [b, a]]) {
    cars[i].contact.lastPartner = j;
    cars[i].contact.lastPartnerTick = tick;
  }
  if (SLAMS.has(r.label)) {
    const v = cars[vic].contact;
    v.lastSlamBy = atk;
    v.lastSlamTick = tick;
    v.lastSlamKind = r.label;
    v.lastSlamGeo = r.geo;
    v.hitSide = hitSide(world, vic, point);
  }
  world.events.push({ type: 'contact', a, b, attacker: atk, victim: vic, label: r.label, geo: r.geo, angle: r.angle, impact, point });
  return r;
}
