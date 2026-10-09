// Torque & Trigger's own rule constants (SI units). The contact rules are
// adapted from Burnout 3's car-to-car rules (mph converted to m/s) and tuned
// for T&T; see the B3 integration plan, phase 1.

export const MPH = 0.44704; // m/s per mph

// Car-to-car contact classification. `impact` is the closing speed along the
// contact normal (m/s), as computed in collideCars.
export const CONTACT = {
  rubReset: 1.0, // s without touching before a pair's rub time resets
  pairCooldown: 1.0, // s before the same two cars can slam each other again
  tradePaint: 3, // m/s: side hit at or above this is trading paint (B3: 20 mph, 8.9 m/s; lowered for T&T speeds, GUESS)
  slam: 6, // m/s: side hit above this is a slam (B3: 36 mph, 16.1 m/s; T&T cars rarely reach that sideways, GUESS)
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
  traffic: 75 * MPH, // m/s closing speed along the normal into traffic (B3, CONFIRMED: 33.5 m/s)
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
  oncomingPerMetre: 0.002, // rush hour: in the oncoming lanes (B3: 0.15 units a metre)
  driftPerSecond: 0.05, driftAfter: 0.8, // s of drifting before it earns
  airPerSecond: 0.1, airAfter: 0.6, // s in the air before it earns
  launch: 0.5, // a perfect launch (B3's Boost Start: +50 units)
  lucky: 0.25, // surviving a slam into a wall
  kick: 1, kickTime: 0.5, // force × (1 + kick × (1 − t / kickTime)) just after a charge fires (B3: 4 over 2 s)
};

// AI that fights (phase 4): B3's attack machine (AI/defaults.cfg, CONFIRMED in
// docs/systems/ai.md §5-6) in metres and seconds; T&T-only values are GUESS.
export const AI_FIGHT = {
  startDelay: 3, minAggression: 0.002, // s after GO before attacks; below this, never attack (B3)
  windowAhead: 150, windowBehind: 40, // m: victim range along the track (B3)
  minVictimSpeed: 15, // m/s (B3: 75 mph; lowered for T&T's city speeds, GUESS)
  maxSpeedDiff: 22, // m/s: victim at most this much faster (B3: 50 mph)
  slamAhead: 3.5, slamSide: 10, laneSin: 0.6, // can-slam: overlap, sideways gap, heading within ~37° (B3)
  windupGap: 4.5, steerOut: 5, // (B3 winds up under 2.5 m; T&T cars need more room to hit hard, GUESS)
  windupTime: 0.5, slamTime: 0.75, recoilTime: 0.5, // (B3)
  slamLead: 0.1, // s: aim at the victim's position this far ahead (B3)
  sideOffset: 5, // m beside the victim while lining up (B3)
  approachTime: 30, coolMax: 3, // s; cooldown = aggression × coolMax (B3)
  blockRange: 15, blockSpeedDiff: 9, blockMin: 3, blockMax: 15, // m, m/s (B3: 20 mph), s (B3)
  retaliateGap: 1, // m: rubbed and further apart than this, slam straight away (B3)
  swerveRate: 10, // m/s of lateral change while winding up, slamming and recoiling (GUESS)
  minMatch: 8, // m/s floor while matching a victim's speed (GUESS)
  ramThreshold: 0.6, ramKit: 0.3, heavier: 0.2, gunReady: 0.3, // ram-or-shoot bias (GUESS)
  capOver: 0.4, gainBase: 0.5, gainCalm: 0.5, // cap = aggression + 0.4; gain = 0.5 + 0.5 × (1 − caution) (GUESS)
  damageGrudge: 1, // grudge per max HP of damage taken: 0.1 per 10 % (GUESS)
  grudgeMin: 0.3, grudgeScore: 0.15, // grudge needed to prefer a car, and the distance weight it gets (GUESS)
  blindRub: 1, blindSlam: 2, // s of no avoidance after a rub / a slam (B3)
  bandRamp: 100, bandOff: 0.8, // m of gap for the full band; share of the race after which it's off (GUESS)
  // band: change to the pace scale ahead of / behind the nearest human. arena
  // (phase 6): aim lead and steering noise (× today's), s on target before
  // firing, HP share it flees under (cautious drivers), going for hurt cars,
  // full throttle within 15 m of the target. All GUESS.
  difficulty: {
    easy: { ahead: -0.08, behind: 0.02, aggression: 0.7, arena: { lead: 0.5, noise: 1.6, fireDelay: 0.4, flee: 0.4, preferHurt: false, commit: false } },
    normal: { ahead: -0.04, behind: 0.06, aggression: 1, arena: { lead: 1, noise: 1, fireDelay: 0.2, flee: 0.3, preferHurt: false, commit: false } },
    hard: { ahead: 0, behind: 0.08, aggression: 1.2, arena: { lead: 1, noise: 0.5, fireDelay: 0, flee: 0.2, preferHurt: true, commit: true } },
  },
  stuckAgain: 3, // s: stuck again this soon after reversing out, reverse twice as long the other way (GUESS)
};

// Death Roll (B3 "Aftertouch", phase 5): a wrecked human steers the wreck. B3 values are CONFIRMED (takedowns.md §10).
export const DEATH_ROLL = {
  window: 5, minSpeed: 1, // s after the wreck; m/s the wreck must still be moving (B3 LIKELY)
  steerMin: 0.5, // steer input needed (B3: stick deflection)
  rate: 24, rateMulti: 45, // °/s of velocity turn at the crash, ÷ (t + 1); without slow motion (B3 split-screen)
  swing: -0.5, swingMax: 72, swingCap: 17, // body yaw per turn, °/s cap, ° total (B3 LIKELY)
  slowmo: 5, // sim runs at 1/N while slow motion is held (B3 races)
};

// Rush hour traffic (phase 6): B3's lane traffic (docs/systems/traffic.md,
// CONFIRMED unless marked). B3's per-tick values are turned into per-second ones
// at 60 updates a second (B3's own rate is a GUESS).
export const TRAFFIC = {
  twoLanes: 7, oneLane: 4.5, // m of road half-width (beside any median) for two lanes each way, or one
  endClear: 30, // m: lanes stop this far short of a jump, a rooftop gap or a road too narrow for them
  behind: 60, ahead: 450, despawnAhead: 200, // m: the window round each human that has traffic; cars this far past its front go (GUESS)
  minStretch: 60, mergeAhead: 80, // m: shortest lane stretch; an ending outer lane's cars merge this far before its end (GUESS)
  noPopIn: 160, // m: nothing spawns this close to a human (B3)
  max: 24, maxLoose: 8, // cars on lanes, and knocked loose (C6: about 20)
  jitter: 0.3, // spacing ±30 % (B3)
  spawnClear: 12, // m: a spawn waits while a car is this close to the spot (GUESS; B3: the lane's first segment)
  lateral: [0.45, 0.55], // place across the lane at spawn (B3)
  laneEase: 1.5, // m/s sideways towards the lane's centre (GUESS)
  accel: 4.8, brake: 6, // m/s²: cruising (B3: +0.08 / -0.10 a tick)
  buffer: 2.5, followMax: 0.8, followGain: 9.2, // following (B3)
  lookTime: 2, lookMin: 0.5, // following look-ahead: s of the car's own speed, at least m (B3 stores one; its value is a GUESS)
  panicAhead: 35, panicTime: 2, panicSide: 5, // m, s, m: a racer or wreck in the way (B3; the sideways limit is a GUESS)
  panicBrake: -9, panicGo: 7.2, // m/s²: the two sticky reactions (B3: -0.15 / +0.12 a tick)
  stopGain: 0.8, // m/s per m to a lane's end (B3's stop state)
  mergeGap: 3, yieldK: 0.55, hurryK: 1.45, // lane changes (B3)
  changeAfter: 2, changeClear: 12, // s stopped behind something before changing lane; m clear in the new lane (GUESS)
  halfWidth: 0.95, halfLength: [1.93, 2.21, 2.31, 2.46, 2.44], // m, per body (npcCars.js: hatch, wedge, muscle, pickup, van)
  mass: [1200, 1200, 1300, 1800, 1800], // kg, per body (GUESS)
  heightGap: 2, // m: contacts further apart than this in height are ignored (B3)
  friction: 6, spinDamp: 2, restitution: 0.2, // knocked loose: m/s², 1/s (GUESS)
  looseLife: 30, looseNear: 100, // s, then removed once no human is within this many metres (GUESS)
  respawnClear: 25, // m round a respawn point
  nearMissGap: 1.8, nearMissSpeed: 20, chainTime: 2.5, // m between footprints (B3), m/s (B3: 27; GUESS), s (B3)
  oncomingSpeed: 50 * MPH, oncomingAfter: 40, // m/s, m in the oncoming lanes before it earns (B3)
  dodgeTime: 2.5, brakeTime: 1, // AI: s from traffic when it steers round it / brakes with no way round (GUESS; B3 looks up to 8 s ahead)
  dodgeRate: 8, passGap: 3.6, freeGap: 2.6, // AI: m/s sideways while dodging; m beside traffic to pass it; m from any other traffic for a way to be free (GUESS)
  pushRange: 40, // m: traffic this close ahead of a victim is worth slamming it into (GUESS)
  blast: 9, // m/s thrown at the middle of a blast (GUESS)
  shotKick: 2, // m/s a bullet or rocket knocks a car (GUESS)
  // Per district: cars a minute per lane, the speed limit (mph) and the body mix
  // (weights for hatch, wedge, muscle, pickup, van). All GUESS.
  districts: {
    rustline: { rate: 6, mph: 30, mix: [2, 1, 1, 4, 4] },
    strip: { rate: 8, mph: 35, mix: [3, 4, 3, 1, 1] },
    maple: { rate: 4, mph: 30, mix: [4, 3, 1, 3, 1] },
    chrome: { rate: 6, mph: 40, mix: [1, 4, 3, 1, 1] },
    undercity: { rate: 4, mph: 35, mix: [1, 1, 1, 4, 4] },
    spire: { rate: 10, mph: 40, mix: [3, 4, 1, 1, 1] },
  },
  fallback: { rate: 6, mph: 35, mix: [3, 3, 2, 2, 2] }, // a map from the T&T SDK
};
