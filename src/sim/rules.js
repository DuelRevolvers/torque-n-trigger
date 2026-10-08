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
