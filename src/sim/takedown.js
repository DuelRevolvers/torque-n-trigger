// Crashes and takedowns (B3 integration, phase 2a). A car is wrecked by HP as
// before, or physically (a wall, a huge car hit, a tip-over after a slam) once
// its crash tolerance is low enough: hurt and just slammed. Physical wrecks
// credit the last slam partner, a rubbing car, a tailgater or a recent shooter,
// paid CREDIT.confirm seconds later unless that attacker is wrecked meanwhile.
// All state is plain data in world.state.

import { sub, quatRotate } from './math.js';
import { SIM_HZ, SIM_DT } from '../config.js';
import { CRASH, CREDIT, NITRO } from './rules.js';
import { earnNitro } from './nitro.js';
import { rubTime, updateReaction } from './contact.js';

const FWD = { x: 0, y: 0, z: -1 };
const UP = { x: 0, y: 1, z: 0 };
const within = (tick, then, seconds) => then >= 0 && tick - then < seconds * SIM_HZ;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// 1.0 for a healthy, unarmored, unslammed car; lower is easier to crash.
export function tolerance(world, i) {
  const car = world.state.cars[i];
  const c = world.params[i].combat || {};
  const health = Math.max(CRASH.minHealth, car.hp / car.maxHp);
  const slammed = car.contact.lastSlamBy >= 0 && within(world.state.tick, car.contact.lastSlamTick, CRASH.slammedFor);
  return health * (1 + CRASH.armor * (c.armor || 0) + CRASH.rollCage * (c.rollCage ?? 0.3)) * (slammed ? CRASH.slammed : 1);
}

// Does car i crash from this hit? kind: 'wall' (m/s into the wall) or 'car' (closing speed), other: the car hit.
export function crashes(world, i, kind, speed, other = -1) {
  const car = world.state.cars[i];
  if (car.wrecked || car.invulnerable) return false;
  const c = car.contact;
  if (other >= 0 && c.lastVictim === other && within(world.state.tick, c.lastVictimTick, CRASH.victimGrace)) return false;
  return speed > CRASH[kind] * tolerance(world, i);
}

// Who could be credited for car v's physical wreck, best first.
function candidates(world, v) {
  const { cars, tick } = world.state;
  const V = cars[v];
  const out = [];
  const add = (x, psych = false) => {
    if (x < 0 || x === v || out.some((o) => o.by === x)) return;
    if (cars[x].wrecked || dist(cars[x].pos, V.pos) > CREDIT.maxDist) return;
    out.push({ by: x, psych });
  };
  // 1. The last slam partner, either way round: whoever slammed v, or whoever v slammed.
  const slams = [];
  if (V.contact.lastSlamBy >= 0 && within(tick, V.contact.lastSlamTick, CREDIT.slamWindow)) slams.push([V.contact.lastSlamBy, V.contact.lastSlamTick]);
  cars.forEach((X, x) => {
    if (x !== v && X.contact.lastSlamBy === v && within(tick, X.contact.lastSlamTick, CREDIT.slamWindow)) slams.push([x, X.contact.lastSlamTick]);
  });
  slams.sort((p, q) => q[1] - p[1]).forEach(([x]) => add(x));
  // 2. Anyone rubbing against it.
  cars.forEach((_, x) => x !== v && rubTime(world, v, x) > CREDIT.rubMin && add(x));
  // 3. The tailgater psyching it out.
  if (V.contact.psychedBy >= 0 && within(tick, V.contact.psychTick, 2 * SIM_DT)) add(V.contact.psychedBy, true);
  // 4. Whoever shot it recently.
  if (V.lastHitBy >= 0 && within(tick, V.lastHitTick ?? -1, CREDIT.weaponWindow)) add(V.lastHitBy);
  return out;
}

// Car v has just been wrecked physically (cause: 'wall' | 'car' | 'tipOver' | 'damage'): queue the credit.
export function queueCredit(world, v, cause) {
  const cands = candidates(world, v);
  if (!cands.length) return;
  // (s: where it crashed along the route, for signature spots.)
  (world.state.credits ||= []).push({ victim: v, tick: world.state.tick, cause, cands, s: world.state.cars[v].trackS });
}

// The car to credit for a ring-out: whoever slammed it in the last 2 s, else
// T&T's own rule, whoever hit it in the last 8 s (wherever they are now).
export function ringOutCredit(world, v) {
  const { cars, tick } = world.state;
  const c = cars[v].contact;
  if (c.lastSlamBy >= 0 && within(tick, c.lastSlamTick, CREDIT.slamWindow)) return c.lastSlamBy;
  return cars[v].lastHitBy >= 0 && within(tick, cars[v].lastHitTick ?? -1, CREDIT.weaponWindow) ? cars[v].lastHitBy : -1;
}

const RAMS = new Set(['wall', 'car', 'tipOver']); // physical takedowns

// The signature spot (a named stretch of the route) at track position s, or null.
// A spot whose start is past its end runs over the lap line.
export function signatureAt(ev, s) {
  return (ev?.signatures || []).find((sp) => (sp.s0 <= sp.s1 ? s >= sp.s0 && s <= sp.s1 : s >= sp.s0 || s <= sp.s1)) || null;
}

// Pays a takedown of v to x: the count, revenge, doubles, a signature spot (a
// wall crash inside one, s: where along the route), and a 'takedown' event.
export function award(world, x, v, cause, psych = false, s = world.state.cars[v].trackS) {
  const { cars, tick } = world.state;
  const X = cars[x].contact;
  cars[x].takedowns++;
  earnNitro(world, x, NITRO.takedown);
  const double = within(tick, X.lastVictimTick, CREDIT.doubleWindow);
  if (double) X.doubles++;
  if (RAMS.has(cause)) X.rams++;
  const spot = cause === 'wall' && s !== undefined ? signatureAt(world.state.event, s) : null;
  if (spot) X.signatures.push(spot.name);
  const revenge = !!X.grudge[v];
  if (revenge) {
    delete X.grudge[v];
    X.revenges++;
  } else cars[v].contact.grudge[x] = 1;
  X.lastVictim = v;
  X.lastVictimTick = tick;
  cars[v].contact.takedownCause = cause;
  world.events.push({ type: 'takedown', car: x, victim: v, cause, psych, revenge, double, signature: spot?.name ?? null });
}

// Tailgating: a car close behind another, inside a narrow cone, for long enough psychs it out.
function updateTailgates(world) {
  const { cars, tick } = world.state;
  const cos = Math.cos((CREDIT.tailgateConeDeg * Math.PI) / 180);
  cars.forEach((X, x) => {
    let on = -1;
    if (!X.wrecked) {
      const f = quatRotate(X.quat, FWD);
      let best = CREDIT.tailgateDist;
      cars.forEach((V, v) => {
        if (v === x || V.wrecked) return;
        const d = sub(V.pos, X.pos);
        const l = Math.hypot(d.x, d.z);
        if (l < best && l > 1e-6 && (d.x * f.x + d.z * f.z) / (l * Math.hypot(f.x, f.z)) > cos) [best, on] = [l, v];
      });
    }
    const c = X.contact;
    c.tailgateSecs = on >= 0 && on === c.tailgate ? c.tailgateSecs + SIM_DT : on >= 0 ? SIM_DT : 0;
    c.tailgate = on;
    if (on >= 0 && c.tailgateSecs >= CREDIT.tailgateTime) {
      cars[on].contact.psychedBy = x;
      cars[on].contact.psychTick = tick;
    }
  });
}

// A hard wall hit soon after a slam that didn't wreck the car: Lucky for it, Denied for the slammer.
export function checkLucky(world, i, impact) {
  const car = world.state.cars[i];
  const c = car.contact;
  if (car.wrecked || impact <= CREDIT.luckyImpact || c.lastSlamBy < 0 || c.luckyTick === c.lastSlamTick) return;
  if (!within(world.state.tick, c.lastSlamTick, CREDIT.luckyWindow)) return;
  c.luckyTick = c.lastSlamTick;
  c.lucky++;
  world.state.cars[c.lastSlamBy].contact.denied++;
  earnNitro(world, i, NITRO.lucky);
  world.events.push({ type: 'lucky', car: i, by: c.lastSlamBy });
}

// Once a tick, after combat and the event: slam reactions, tailgating, tip-overs,
// and confirming queued credit (all at once when the event is over).
// wreckPhysical(world, i, cause) wrecks a car (provided by combat.js).
export function updateTakedowns(world, wreckPhysical) {
  const { state } = world;
  state.cars.forEach((car) => updateReaction(car, SIM_DT));
  updateTailgates(world);
  state.cars.forEach((car, i) => {
    const c = car.contact;
    if (car.wrecked || car.invulnerable || c.lastSlamBy < 0 || !within(state.tick, c.lastSlamTick, CRASH.tipSlamWindow)) return;
    if (quatRotate(car.quat, UP).y < CRASH.tipUp) wreckPhysical(world, i, 'tipOver');
  });
  if (!state.credits?.length) return;
  const all = !!state.event?.done;
  state.credits = state.credits.filter((p) => {
    if (!all && state.tick - p.tick < CREDIT.confirm * SIM_HZ) return true;
    const ok = p.cands.find((o) => !state.cars[o.by].wrecked && !((state.cars[o.by].wreckTick ?? -1) >= p.tick));
    if (ok) award(world, ok.by, p.victim, p.cause, ok.psych, p.s);
    return false;
  });
}
