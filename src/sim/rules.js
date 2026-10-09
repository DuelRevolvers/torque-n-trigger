// Torque & Trigger's own rule constants (SI units). The contact rules are
// adapted from Burnout 3's car-to-car rules (mph converted to m/s) and tuned
// for T&T; see the B3 integration plan, phase 1.

export const MPH = 0.44704; // m/s per mph

// Car-to-car contact classification. `impact` is the closing speed along the
// contact normal (m/s), as computed in collideCars.
export const CONTACT = {
  rubReset: 1.0, // s without touching before a pair's rub time resets
  pairCooldown: 1.0, // s before the same two cars can slam each other again
  tradePaint: 20 * MPH, // side hit at or above this is trading paint (8.9 m/s)
  slam: 36 * MPH, // side hit above this is a slam (16.1 m/s)
  bump: 20 * MPH, // nose into tail at or above this is a bump (8.9 m/s)
  shunt: 35 * MPH, // nose into tail above this is a shunt (15.6 m/s)
  huge: 150 * MPH, // any hit above this is huge (67 m/s)
  attackerFlip: 40 * MPH, // a side-hit "victim" this much faster becomes the attacker (17.9 m/s)
  alignedDeg: 45, // headings within this are side-by-side or nose-to-tail
  headOnDeg: 135, // headings at least this far apart are head-on
  shuntConeDeg: 30, // victim within this cone ahead of the attacker = nose into tail
  tboneDeg: 25, // attacker's side axis within this of the victim's nose axis = T-bone
};

// Slam reaction (phase 2): a side slam or T-bone steers the victim away from the
// hit for `hold` seconds, then hands control back over `blend` seconds. Both are
// scaled by the attacker's mass over the victim's, the victim's ram resistance
// and armor; players get `player` of the AI's reaction.
export const SLAM_REACTION = { hold: 0.3, blend: 1.0, minScale: 0.3, maxScale: 1.5, armor: 0.5, player: 0.6 };

// Slam damage (phase 2): multipliers on the normal collision damage.
export const SLAM_DAMAGE = { tbone: 1.5, slam: 1.25, shunt: 1.15, attacker: 0.85 };

// Hybrid crashes (phase 2). Thresholds are multiplied by the car's crash
// tolerance: health (min `minHealth`) x (1 + armor x armor + rollCage x rollCage),
// x `slammed` if slammed in the last `slammedFor` seconds.
export const CRASH = {
  wall: 27.5, // m/s into a wall (B3's 27.5)
  car: 150 * MPH, // m/s closing speed car-vs-car (67 m/s)
  tipUp: 0.5, // up vector Y below this (past 60 degrees) ...
  tipSlamWindow: 2, // ... within this many seconds of a slam
  minHealth: 0.15, armor: 0.5, rollCage: 0.5,
  slammed: 0.4, slammedFor: 1,
  victimGrace: 1.5, // s: no crashing into the car you just took down
};

// Takedown credit (phase 2).
export const CREDIT = {
  confirm: 0.5, // s before a physical takedown is paid; void if the attacker wrecks first
  slamWindow: 2, // s: the last slam partner (either direction) gets the credit
  rubMin: 0.1, // s of contact before a rubbing car gets the credit
  weaponWindow: 8, // s: whoever damaged the car last (the ring-out rule)
  maxDist: 160, // m: attackers further away get nothing
  tailgateDist: 7, tailgateConeDeg: 15, tailgateTime: 0.5, // psych-out (B3 values, GUESS)
  luckyImpact: 12, // m/s wall hit (the wall-damage threshold) that counts as an escape
  luckyWindow: 2, // s after being slammed
  doubleWindow: 1, // s between two takedowns that make a double (B3, CONFIRMED)
};

// Earned nitrous (phase 3). Amounts are in charges (1 = one full charge); B3's
// boost units converted at 72 units ≈ one T&T charge, then tuned (GUESS values).
export const NITRO = {
  idleRate: 0.4, // the timed refill, as a share of the part's own rate (rechargeTime)
  takedown: 1, wrecked: -1, // B3: the bar grows a level / shrinks a level
  slamDealt: 0.5, slammed: -0.5, // side slams and T-bones (B3 converts to 1.7; cut)
  damage: 1, // per target's max HP dealt by weapons: 0.1 per 10 % (B3 has no guns)
  nearMiss: 0.2,
  driftPerSecond: 0.05, driftAfter: 0.8, // s of drifting before it earns
  airPerSecond: 0.1, airAfter: 0.6, // s in the air before it earns
  launch: 0.5, // a perfect launch (B3's Boost Start: +50 units)
  lucky: 0.25, // surviving a slam into a wall
  kick: 1, kickTime: 0.5, // force × (1 + kick × (1 − t / kickTime)) just after a charge fires (B3: 4 over 2 s)
};
