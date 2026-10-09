// Earned nitrous (B3 integration, phase 3): fighting and risky driving refill
// the nitrous part's charges, on top of a slow timed refill (vehicle.js).
// Earnings fill the next charge (car.nitro.recharge: seconds of the part's
// rechargeTime) and carry over into the one after; losses come off that fill
// first, then a charge. All state is plain data on the car.
import { NITRO } from './rules.js';

// Adds amount charges (negative: takes them) to car i's nitrous, within 0 and the part's charges.
export function earnNitro(world, i, amount) {
  const p = world.params[i].nitro;
  if (!p?.charges || !amount || world.state.event?.modifiers?.includes('noNitro')) return;
  const n = world.state.cars[i].nitro;
  const total = Math.max(0, Math.min(p.charges, n.charges + n.recharge / p.rechargeTime + amount));
  n.charges = Math.floor(total + 1e-9);
  n.recharge = n.charges >= p.charges ? 0 : Math.max(0, total - n.charges) * p.rechargeTime;
}

// The nitro force's multiplier t seconds after a charge fired: a kick that eases off.
export const nitroKick = (t) => 1 + NITRO.kick * Math.max(0, 1 - t / NITRO.kickTime);
