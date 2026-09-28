// The Neon Strip, authored to docs/districts/02-neon-strip.md. The plan
// (boundary, nodes, streets, sites) is the doc's; what's on every block, the
// set pieces and the Car Park Brawl's structures are placed here, and the
// ordinary buildings fill the blocks by fixed rules (sim/planLayout.js).
// Nothing is random.

// A straight run of fence (or low wall) from a to b, as a thin rotated box.
const run = ([ax, az], [bx, bz], thick = 0.3) => {
  const L = Math.hypot(bx - ax, bz - az);
  return { x: (ax + bx) / 2, z: (az + bz) / 2, hw: thick / 2, hd: L / 2, yaw: Math.atan2(bx - ax, bz - az) };
};
// Fence along a polyline, leaving gaps open: [s0, s1] metres along it, or
// { at: [x, z], half } (a gap `half` metres either side of the nearest point).
const fenceAlong = (pts, gapList = [], thick = 0.3) => {
  const out = [];
  const gaps = gapList.map((g) => (Array.isArray(g) ? g : ((s) => [s - g.half, s + g.half])(alongOf(pts, g.at))));
  let s = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, az] = pts[k];
    const [bx, bz] = pts[k + 1];
    const L = Math.hypot(bx - ax, bz - az);
    let t = 0;
    const cuts = gaps.map(([g0, g1]) => [g0 - s, g1 - s]).filter(([g0, g1]) => g1 > 0 && g0 < L).sort((p, q) => p[0] - q[0]);
    const at = (u) => [ax + ((bx - ax) * u) / L, az + ((bz - az) * u) / L];
    for (const [g0, g1] of cuts) {
      if (g0 > t + 0.5) out.push(run(at(t), at(Math.min(g0, L)), thick));
      t = Math.max(t, g1);
    }
    if (L > t + 0.5) out.push(run(at(t), at(L), thick));
    s += L;
  }
  return out;
};
// Metres along a polyline to the point nearest p.
const alongOf = (pts, [px, pz]) => {
  let best = [Infinity, 0];
  let run = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, az] = pts[k];
    const [bx, bz] = pts[k + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / (L * L)));
    const d = Math.hypot(px - ax - (bx - ax) * t, pz - az - (bz - az) * t);
    if (d < best[0]) best = [d, run + t * L];
    run += L;
  }
  return best[1];
};
// A rectangle with rounded corners (radius r), as a closed polyline.
const roundRect = (x0, x1, z0, z1, r, steps = 4) => {
  const pts = [];
  const corner = (cx, cz, a0) => {
    for (let q = 0; q <= steps; q++) {
      const a = a0 + ((Math.PI / 2) * q) / steps;
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  };
  corner(x1 - r, z0 + r, -Math.PI / 2);
  corner(x1 - r, z1 - r, 0);
  corner(x0 + r, z1 - r, Math.PI / 2);
  corner(x0 + r, z0 + r, Math.PI);
  pts.push(pts[0]);
  return pts;
};
// A point `s` metres along the line a->b and `lat` metres to its right.
const onLine = ([ax, az], [bx, bz], s, lat) => {
  const L = Math.hypot(bx - ax, bz - az);
  const dx = (bx - ax) / L;
  const dz = (bz - az) / L;
  return [ax + dx * s - dz * lat, az + dz * s + dx * lat];
};

// The Sign Boneyard's dead signs, placed along its path (s: metres from the
// Crown Road gate, lat: metres to the right of the path).
const BONE_A = [380, -488];
const BONE_B = [420, -312];
const BONE_YAW = Math.atan2(BONE_B[0] - BONE_A[0], BONE_B[1] - BONE_A[1]);
const boneSign = (s, lat, w, d, h, shape, more = {}) => {
  const [x, z] = onLine(BONE_A, BONE_B, s, lat);
  return { x, z, w, d, h, shape, yaw: BONE_YAW + (more.turn || 0), ...more };
};

// The Bus Depot's tour buses: rows parallel to the yard's diagonal way
// through, 16 m apart along each row, kept clear of the way and the fence.
const DEPOT_A = [468, 320];
const DEPOT_B = [280, 508];
const depotBuses = () => {
  const out = [];
  const L = Math.hypot(DEPOT_B[0] - DEPOT_A[0], DEPOT_B[1] - DEPOT_A[1]);
  const yaw = Math.atan2(DEPOT_B[0] - DEPOT_A[0], DEPOT_B[1] - DEPOT_A[1]);
  for (const lat of [-62, -46, -30, -14, 14, 30, 46, 62]) {
    for (let s = -120; s <= L + 120; s += 16) {
      const [x, z] = onLine(DEPOT_A, DEPOT_B, s, lat);
      const c = Math.abs(Math.cos(yaw));
      const sn = Math.abs(Math.sin(yaw));
      const ex = 1.3 * c + 6 * sn;
      const ez = 1.3 * sn + 6 * c;
      if (x - ex < 264 || x + ex > 464 || z - ez < 316 || z + ez > 504) continue;
      if (x > 418 && z > 470) continue; // the depot office
      out.push({ x, z, hw: 1.3, hd: 6, yaw });
    }
  }
  return out;
};

// The Casino Car Park: double rows of parked cars (9.4 m deep) either side of
// Palace Drive's aisle, lanes 8 m wide between them, a cross aisle between the
// side entrances (z -40), and an open band across the middle for the valet
// ramp's run-up and landing. The circuit's shortcut lane runs diagonally
// through the south-east rows.
const ROW_Z = [[-121.8, -112.4], [-104.4, -95], [-70.8, -61.4], [-53.4, -44], [-28, -18.6], [-10.6, -1.2], [6.8, 16.2], [24.2, 33.6]];
const CAR_ROWS = ROW_Z.flatMap(([z0, z1]) => [{ r: [-114, -14, z0, z1], double: true }, { r: [14, 114, z0, z1], double: true }]);
const MASTS = [-117.1, -66.1, -23.3, 11.5].flatMap((z) => [[-64, z], [64, z]]);
const PARK_LANE = [[128, -40], [60, 42]];

export const STRIP_CITY = {
  id: 'strip', name: 'Neon Strip', authored: true, seed: 2202,
  plan: {
    boundary: [[-487, -380], [-298, -490], [-54, -541], [0, -600], [81, -541], [352, -558], [596, -481], [650, -223], [542, -6], [623, 252],
               [515, 469], [569, 588], [135, 570], [-244, 600], [-542, 579], [-623, 371], [-542, 154], [-650, -83], [-569, -261]],
    terrain: { fall: 3 }, // metres, north edge to south
    nodes: { // junctions and street ends, metres (x east, z south)
      maple: [0, -598], rustline: [-584, 60], undercity: [562, 60],
      'crown-palace': [0, -495], 'velvet-lucky': [-294, -396], 'crown-seven': [355, -499],
      'marquee-lucky': [-236, -300], 'marquee-palace': [0, -300], 'marquee-seven': [236, -300], 'marquee-east': [480, -300],
      'lucky-bend': [-140, -140], 'seven-bend': [140, -140],
      'club-velvet': [-490, -100], 'club-juke': [-330, -100], 'club-lucky': [-140, -100], 'arcade-seven': [140, -100], 'arcade-east': [480, -100],
      'strip-velvet': [-490, 60], 'strip-juke': [-330, 60], 'strip-lucky': [-140, 60], 'strip-palace': [0, 60],
      'strip-seven': [140, 60], 'strip-pawn': [330, 60], 'strip-east': [480, 60],
      'loop-n': [-330, 210], 'loop-e': [-200, 300], 'loop-s': [-330, 410],
      'back-motel': [-140, 300], 'back-chapel': [0, 300], 'back-dice': [350, 300], 'back-east': [480, 300], 'pawn-east': [480, 231],
      'shore-west': [-490, 520], 'shore-proj': [-330, 520], 'shore-motel': [-140, 520], 'shore-chapel': [0, 520], 'shore-east': [480, 520],
    },
    streets: [ // width: 'lane' 7, 'street' 12 (default), 'avenue' 20, or metres
      { name: 'The Strip', width: 30, median: 2, path: ['rustline', 'strip-velvet', 'strip-juke', 'strip-lucky', 'strip-palace', 'strip-seven', 'strip-pawn', 'strip-east', 'undercity'] },
      { name: 'Palace Drive', width: 'avenue', path: ['maple', 'crown-palace', 'marquee-palace', 'strip-palace'] },
      { name: 'Crown Road', path: ['crown-palace', 'crown-seven', { via: [480, -500], r: 80 }, 'marquee-east'] },
      { name: 'Velvet Curve', path: ['crown-palace', 'velvet-lucky', { via: [-490, -330], r: 120 }, 'club-velvet', 'strip-velvet'] },
      { name: 'Marquee Street', path: ['marquee-lucky', 'marquee-palace', 'marquee-seven', 'marquee-east'] },
      { name: 'Lucky Street', path: ['strip-lucky', 'club-lucky', 'lucky-bend', 'marquee-lucky', 'velvet-lucky'] },
      { name: 'Seven Street', path: ['strip-seven', 'arcade-seven', 'seven-bend', 'marquee-seven', 'crown-seven'] },
      { name: 'Club Street', path: ['club-velvet', 'club-juke', 'club-lucky'] },
      { name: 'Arcade Street', path: ['arcade-seven', 'arcade-east'] },
      { name: 'Jukebox Lane', width: 'lane', path: ['club-juke', 'strip-juke'] },
      { name: 'Drive-in Road', width: 'lane', path: ['strip-juke', 'loop-n'] },
      { name: 'East Row', path: ['marquee-east', 'arcade-east', 'strip-east', 'pawn-east', 'back-east', 'shore-east'] },
      { name: 'Tinsel Street', path: ['strip-velvet', 'shore-west'] },
      { name: 'Starlite Loop', loop: true, path: ['loop-n', { via: [-200, 210], r: 60 }, 'loop-e', { via: [-200, 410], r: 60 }, 'loop-s', { via: [-440, 410], r: 60 }, { via: [-440, 210], r: 60 }] },
      { name: 'Motel Row', path: ['strip-lucky', 'back-motel', 'shore-motel'] },
      { name: 'Chapel Street', path: ['strip-palace', 'back-chapel', 'shore-chapel'] },
      { name: 'Back Street', path: ['loop-e', 'back-motel', 'back-chapel', 'back-dice', 'back-east'] },
      { name: 'Dice Street', path: ['strip-seven', 'back-dice'] },
      { name: 'Pawn Street', path: ['strip-pawn', 'pawn-east'] },
      { name: 'Projector Lane', width: 'lane', path: ['loop-s', 'shore-proj'] },
      { name: 'Shore Road', path: ['shore-west', 'shore-proj', 'shore-motel', 'shore-chapel', 'shore-east'], seawall: true },
    ],
    sites: [ // polygons; may span or cut blocks; arenas first
      {
        kind: 'arena', name: 'Casino Car Park', poly: [[-128, -135], [128, -135], [128, 42], [-128, 42]], through: 'Palace Drive',
        carpark: {
          // Low wall round the edge: gaps for the aisle (north and south), the
          // side entrances off Lucky St and Seven St, and the shortcut's exit.
          walls: [
            ...fenceAlong([[-128, -134.6], [128, -134.6]], [{ at: [0, -134.6], half: 10 }], 0.8),
            ...fenceAlong([[-128, 41.6], [128, 41.6]], [{ at: [0, 41.6], half: 10 }, { at: [60, 41.6], half: 6 }], 0.8),
            ...fenceAlong([[-127.6, -135], [-127.6, 42]], [{ at: [-127.6, -40], half: 4 }], 0.8),
            ...fenceAlong([[127.6, -135], [127.6, 42]], [{ at: [127.6, -40], half: 4 }], 0.8),
          ],
          rows: CAR_ROWS,
          lane: PARK_LANE, laneClear: 5.5,
          masts: MASTS,
          booth: { x: -16, z: -125, hw: 1.5, hd: 1.5, yaw: 0 }, // the valet booth by the underpass mouth
          shelter: { x: 18, z: -125, hw: 1.5, hd: 5, yaw: Math.PI / 2 }, // the shuttle shelter
        },
      },
      {
        kind: 'casino', name: 'The Glow Palace', poly: [[-135, -150], [135, -150], [222, -290], [-222, -290]], over: 'Palace Drive',
        palace: {
          front: -290, back: -150, // the podium's north (Marquee) and south (car park) faces
          recess: -262, // the fountain forecourt: the wings stand back to here, either side of the mouth
          mouth: 30, // the mouth blocks either side of the underpass reach Marquee St (|x| < 30)
          podiumH: 15,
          underpass: { half: 5, ceiling: 6 }, // two lanes, 10 m wide, 6 m ceiling
          dock: { x: 14, z0: -215, z1: -195 }, // the cash dock: a bay in the west wall of the underpass
          fountain: { x: 112, z: -276, r: 9 }, // one each side of the mouth
          tower: { z: -210, hw: 30, hd: 22, h: 95 }, // on the podium: 110 m to the top
          canopy: { depth: 6, hw: 40, y: 8 }, // the porte-cochere over the mouth
        },
      },
      {
        kind: 'market', name: 'Night Market', poly: [[10, 80], [145, 80], [330, 290], [10, 290]], path: [[25, 80], [60, 160], [200, 200], [330, 290]],
        wayWidth: { halfWidth: 3, wallDist: 4.2 },
        market: {
          half: 4.2, stall: 3.4, pitch: 4.6, start: 28, end: 14,
          gate: { x: 25, z: 81, yaw: 0, span: 12 },
          fence: [
            ...fenceAlong([[10, 80], [145, 80]], [{ at: [25, 80], half: 6 }]),
            ...fenceAlong([[145, 80], [330, 290]], [{ at: [330, 290], half: 12 }]),
            ...fenceAlong([[10, 290], [330, 290]], [{ at: [330, 290], half: 14 }]),
            ...fenceAlong([[10, 80], [10, 290]]),
          ],
        },
      },
      {
        kind: 'drivein', name: 'Starlite Drive-In', poly: [[-430, 220], [-210, 220], [-210, 400], [-430, 400]],
        drivein: {
          screen: { x: -320, z: 388, hw: 30, hd: 1.5, yaw: 0 }, screenH: 22,
          snack: { x: -320, z: 300, hw: 9, hd: 5, yaw: 0 }, // the snack bar and projection booth
          humps: [[250, -405, -235], [268, -405, -235], [286, -405, -235], [318, -405, -235], [336, -405, -235], [354, -405, -235]],
          hump: { len: 2.5, h: 0.45 },
          speakerPitch: 6,
          fence: fenceAlong(roundRect(-429, -211, 221, 399, 49), [{ at: [-330, 221], half: 6 }]),
          gate: { x: -330, z: 221, yaw: Math.PI / 2, span: 12 },
        },
      },
      {
        kind: 'boneyard', name: 'Sign Boneyard', poly: [[250, -310], [468, -310], [468, -420], [410, -488], [360, -488]], path: [[380, -488], [420, -312]],
        wayWidth: { halfWidth: 3.5, wallDist: 5 },
        boneyard: {
          signs: [
            boneSign(18, -11, 8, 2, 10, 'letterG'),
            boneSign(30, 12, 6, 3, 16, 'cowboy', { flicker: true }),
            boneSign(52, -13, 7, 3, 12, 'cocktail', { flicker: true }),
            boneSign(62, 28, 10, 4, 8, 'dice'),
            boneSign(80, 9.5, 14, 4, 1.5, 'arrow', { lying: true, turn: 0.4 }),
            boneSign(96, -9.5, 9, 3, 1.6, 'letterL', { lying: true, turn: -0.3 }),
            boneSign(104, -34, 10, 3, 9, 'horseshoe'),
            boneSign(118, 13, 9, 2, 10, 'letterO'),
            boneSign(134, 32, 9, 3, 9, 'star', { flicker: true }),
            boneSign(142, -12, 12, 2, 8, 'arrow', { flicker: true, turn: 0.2 }),
            boneSign(158, 9, 11, 3, 1.6, 'letterW', { lying: true, turn: 0.5 }),
            boneSign(40, -30, 12, 2.5, 7, 'motel'),
            boneSign(10, 30, 7, 3, 11, 'showgirl'),
          ],
          fence: [
            ...fenceAlong([[360, -488], [410, -488]], [{ at: [380, -488], half: 7 }]),
            ...fenceAlong([[410, -488], [468, -420], [468, -310]]),
            ...fenceAlong([[468, -310], [250, -310]], [{ at: [420, -310], half: 7 }]),
            ...fenceAlong([[250, -310], [360, -488]]),
          ],
        },
      },
      {
        kind: 'depot', name: 'Bus Depot', poly: [[260, 312], [468, 312], [468, 508], [260, 508]], path: [[468, 320], [280, 508]],
        wayWidth: { halfWidth: 4, wallDist: 6 },
        depot: {
          buses: depotBuses(),
          office: { x: 443, z: 489, hw: 14, hd: 9, yaw: Math.PI, front: [0, -1] },
          fence: [
            ...fenceAlong([[260, 312], [468, 312]]),
            ...fenceAlong([[468, 312], [468, 508]], [{ at: [468, 320], half: 7 }]),
            ...fenceAlong([[468, 508], [260, 508]], [{ at: [280, 508], half: 7 }]),
            ...fenceAlong([[260, 508], [260, 312]]),
          ],
        },
      },
    ],
    // What each block is (the block containing `at`). `along` sets the kind of
    // one street's frontage in that block (`near`: which one, where a block
    // fronts the same street twice).
    lots: [
      { at: [-120, -380], kind: 'hotels' }, // Palace Drive's west side, north of Marquee St
      { at: [150, -400], kind: 'hotels' }, // Palace Drive's east side, north of Marquee St
      { at: [550, -150], kind: 'hotels' }, // north of Crown Road and the lobes east of East Row
      { at: [550, -150], along: 'The Strip', kind: 'casinos' },
      { at: [-560, -150], kind: 'clubs' }, // the north-west, outside Velvet Curve
      { at: [-560, -150], along: 'The Strip', kind: 'casinos' },
      { at: [-336, -221], kind: 'clubs' }, // inside Velvet Curve's bend: the Pink Room and the clubs
      { at: [384, -388], kind: 'boneyard' },
      { at: [-85, -141], kind: 'palace' }, // the Glow Palace and the car park
      { at: [85, -141], kind: 'palace' },
      { at: [328, -195], kind: 'arcade' }, // the Hi-Score Arcade
      { at: [-407, -24], kind: 'clubs' }, // the Strip's north side: casinos on it, clubs behind
      { at: [-407, -24], along: 'The Strip', kind: 'casinos' },
      { at: [-238, -24], kind: 'clubs' },
      { at: [-238, -24], along: 'The Strip', kind: 'casinos' },
      { at: [310, -24], kind: 'clubs' },
      { at: [310, -24], along: 'The Strip', kind: 'casinos' },
      { at: [-420, 140], kind: 'motels' }, // round the drive-in
      { at: [-228, 156], kind: 'motels' },
      { at: [-223, 442], kind: 'motels' },
      { at: [-70, 185], kind: 'motels' }, // Candy Chrome's block
      { at: [-70, 410], kind: 'flats' }, // the Strip's workers, and the counting house
      { at: [129, 199], kind: 'market' },
      { at: [338, 181], kind: 'pawn' }, // pawnshops and bail bonds between Dice St and Pawn St
      { at: [433, 121], kind: 'pawn' },
      { at: [-320, 310], kind: 'drivein' },
      { at: [240, 410], kind: 'chapels' }, // wedding chapels, and the bus depot
      { at: [-560, 300], kind: 'motels' }, // the south: motels west of Tinsel St, pawnshops east of East Row
      { at: [-560, 300], along: 'East Row', kind: 'pawn' },
      { at: [-560, 300], along: 'The Strip', near: [520, 80], kind: 'pawn' },
      // The promenade between Shore Road and the seawall: no buildings.
      { kind: 'promenade', poly: [[-561, 530], [542.7, 530], [569, 588], [135, 570], [-244, 600], [-542, 579]] },
    ],
    shop: [-70, 110], // the block containing this point: Candy Chrome
    // Named buildings: the Glow Syndicate's club, the arcade, the parts shop and
    // the armoured truck's counting house. yaw turns the building; it faces away
    // from its yaw (yaw 0 faces north).
    specials: [
      { kind: 'pinkroom', name: 'The Pink Room', x: -440.6, z: -294.5, w: 36, d: 34, yaw: 0.947, h: 14 },
      {
        kind: 'arcade', name: 'Hi-Score Arcade', x: 340, z: -200, w: 110, d: 50, yaw: Math.PI, h: 12,
        extra: [{ t: 'pylon', x: 404, z: -128, w: 3, d: 3, h: 24, props: { sign: 'HI-SCORE' } }],
      },
      {
        kind: 'shop', name: 'Candy Chrome', x: -70, z: 125, w: 64, d: 34, yaw: 0, h: 10,
        extra: [
          { t: 'pylon', x: -30, z: 86, w: 2.5, d: 2.5, h: 14, props: { sign: 'CANDY CHROME' } },
          { t: 'car', x: -92, z: 96, w: 2, d: 4.6, h: 1.5, yaw: 0.4, props: { color: 3 } },
          { t: 'car', x: -64, z: 94, w: 2, d: 4.6, h: 1.5, yaw: -0.3, props: { color: 5 } },
          { t: 'tyres', x: -104, z: 104, w: 2.8, d: 2.8, h: 1.8 },
        ],
      },
      { kind: 'counting', name: 'Counting House', x: -40, z: 490, w: 40, d: 36, yaw: Math.PI, h: 11 }, // on Shore Road, by Chapel St
    ],
    // Service alleys, 5 m wide, behind the Strip casinos and behind the clubs on
    // Club St. Drivable in free roam; brick walls line them between buildings.
    alleys: {
      width: 5,
      runs: [
        [[-480, -8], [-150, -8]], // behind the casinos, Velvet Curve to Lucky St (across Jukebox Lane)
        [[150, -8], [470, -8]], // behind the casinos, Seven St to East Row
        [[-480, -139], [-130, -139]], // behind the Club St clubs, Velvet Curve to Lucky St
      ],
    },
    // The Car Park Brawl's (and the circuit's) way through the car park rows,
    // from Seven St's entrance to the Strip.
    corridors: [
      { id: 'car-park', kind: 'parking', points: [[140, -40], ...PARK_LANE, [60, 60]], halfWidth: 3.5, wallDist: 4.6 },
    ],
    furniture: {
      lampPitch: 32, // street lamps, both sides
      medianGap: 16, // the Strip's median breaks this far either side of a junction
      medianH: 0.6, palmPitch: 12,
      arches: [-562, -462, -362, -262, -162, -62, 38, 238, 438, 538], // x of the neon arches over the Strip (none on a junction)
    },
    // The Glow Palace's armoured cash truck: between the cash dock (in the underpass's
    // west wall) and the counting house on Shore Road, keeping to its lane each way.
    truck: {
      runs: {
        south: [[-9.5, -205], [-5, -196], [-3, -186], [-3, 506], [-8, 515], [-16, 517], [-34, 517], [-40, 513], [-40, 509]],
        north: [[-40, 509], [-40, 515], [-34, 523], [-10, 523], [-2, 518], [3, 508], [3, -184], [-2, -196], [-9.5, -205]],
      },
      speed: 13.9, length: 8, width: 2.6, chance: 0.2, // 50 km/h, about one minute in five
    },
    // The city beyond the district's edge (a ring of buildings outside the boundary).
    fillers: { widths: [28, 22, 36, 26, 32, 24], heights: [18, 26, 14, 32, 22, 16, 28], depth: 30, exitGap: 24 },
    seawall: { pts: [[569, 588], [135, 570], [-244, 600], [-542, 579]], h: 1, palmPitch: 26, palmIn: 7 },
  },
  // The Car Park Brawl (world coordinates). The parked cars, lamp masts, booth
  // and shelter are the car park's own (above); the arena adds the valet ramp,
  // the shuttle bus and limos across the entrances.
  arenas: {
    'Casino Car Park': {
      bounds: [-128, 128, -135, 42],
      // The valet ramp: a short two-level deck over the middle of the aisle (drive
      // under it), up a ramp from the west and off the far end.
      platforms: [{
        x: 0, z: -86, hw: 24, hd: 7, h: 5.5, under: true, thick: 0.8, kind: 'valet',
        legs: [[-22, -92.4], [-13, -92.4], [13, -92.4], [22, -92.4], [-22, -79.6], [-13, -79.6], [13, -79.6], [22, -79.6]],
      }],
      ramps: [{ x: -46, z: -86, dirX: 1, dirZ: 0, len: 22, width: 14, height: 5.5 }],
      // The sweeper: a Glow Palace shuttle bus doing slow laps of the lot (this event only).
      movers: [{ kind: 'bus', event: true, path: roundRect(-121, 121, -131, 38, 10), speed: 7, phase: 0, hw: 1.3, hd: 6, y0: 0, h: 3.4, dps: 30 }],
      // Limos parked across the entrances and the underpass mouth (x0, z0, x1, z1).
      limos: [[-10, -137, 10, -137], [-5, -147, 5, -147], [-10, 44, 10, 44], [54, 44, 66, 44], [-130, -44, -130, -36], [130, -44, 130, -36]],
      spawns: [
        { x: -60, z: -108.4 }, { x: 60, z: -108.4 }, { x: -80, z: -86 }, { x: 80, z: -86 },
        { x: -60, z: -57.4 }, { x: 60, z: -57.4 }, { x: -60, z: 20.2 }, { x: 60, z: 20.2 },
      ],
      pickups: [
        { type: 'health', x: 0, z: -86, deck: true }, { type: 'ammo', x: -100, z: -40 }, { type: 'nitro', x: 100, z: -40 },
        { type: 'health', x: 0, z: -20 }, { type: 'nitro', x: -60, z: -14.6 }, { type: 'ammo', x: 60, z: -14.6 },
      ],
    },
  },
  features: [],
  buildings: 'dense', heights: [14, 48],
  look: { building: '#8070a8', buildingTex: 'building', lamp: '#ff9ad0', barrier: '#ffffff', signs: 0.85, lot: '#5a5068', neon: ['#ff2a6d', '#05d9e8', '#b04dff'], road: '#c8b0d0', roadGloss: 1, walk: '#c0b0c8', closures: 'limos', ledBarriers: true, startDressing: 'strip' },
};
