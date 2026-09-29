// Maple Hollow, authored to docs/districts/03-maple-hollow.md. The plan
// (boundary, terrain, nodes, streets, sites) is the doc's; what's on every
// block, the set pieces and the stadium's structures are placed here, and the
// houses fill the blocks' street frontages by fixed rules (sim/planSuburb.js).
// Nothing is random.

// An ellipse centred (cx, cz), radii rx and rz, as a polygon.
const ellipse = (cx, cz, rx, rz, n = 48) => [...Array(n).keys()].map((k) => [cx + Math.cos((k / n) * Math.PI * 2) * rx, cz + Math.sin((k / n) * Math.PI * 2) * rz]);
// A running-track oval round (cx, cz): straights `half` either side of the
// middle along z, bends of radius r. Closed polyline.
const oval = (cx, cz, r, half, n = 24) => {
  const pts = [];
  for (let q = 0; q <= n; q++) pts.push([cx + r * Math.cos(Math.PI - (Math.PI * q) / n), cz - half - r * Math.sin((Math.PI * q) / n)]);
  for (let q = 0; q <= n; q++) pts.push([cx + r * Math.cos((Math.PI * q) / n), cz + half + r * Math.sin((Math.PI * q) / n)]);
  pts.push(pts[0]);
  return pts;
};
// A golf hole: the fairway from tee to green (a rotated box), the green.
const hole = (tee, green, hw = 12) => {
  const dx = green[0] - tee[0];
  const dz = green[1] - tee[1];
  const L = Math.hypot(dx, dz);
  return { tee, green, fairway: { x: (tee[0] + green[0]) / 2, z: (tee[1] + green[1]) / 2, hw, hd: L / 2 + 6, yaw: Math.atan2(dx, dz) } };
};
// A straight run of fence from a to b (thin rotated boxes), leaving gaps
// [s0, s1] (metres along it) open.
const fence = (a, b, gaps = [], kind = 'fence', h = 2.4) => {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const out = [];
  let t = 0;
  for (const [g0, g1] of [...gaps, [L, L]]) {
    if (g0 - t > 0.5) out.push({ x: a[0] + (d[0] * (t + g0)) / 2, z: a[1] + (d[1] * (t + g0)) / 2, hw: 0.1, hd: (g0 - t) / 2, yaw: Math.atan2(d[0], d[1]), h, kind });
    t = g1;
  }
  return out;
};
// Rows of parked cars: [x0, x1, z0, z1] each (double: two lines back to back).
const rows = (list, double = true) => list.map((r) => ({ r, double }));

// The homecoming float's lap: the running track's middle lane.
const TRACK = { cx: -360, cz: 195, r: 33, half: 35, lanes: 6 };

export const MAPLE_CITY = {
  id: 'maple', name: 'Maple Hollow', authored: true, seed: 3303,
  plan: {
    boundary: [[-420, -547], [-180, -723], [120, -661], [390, -750], [570, -547], [600, -220], [480, 44], [570, 334],
               [420, 661], [90, 750], [-180, 661], [-450, 750], [-600, 485], [-510, 159], [-600, -163], [-540, -397]],
    terrain: {
      bowl: { c: [40, 175], depth: 12 }, hills: [{ c: [0, -620], r: 260, h: 10 }],
      // Hollow Pond: the ground falls away under the water.
      dips: [{ c: [40, 175], rx: 110, rz: 80, depth: 2.5, bank: 10 }],
      // Level ground for the stadium, and the causeway over the pond (level with
      // the banks at its ends).
      flat: [
        { rect: [-465, -255, 110, 280], blend: 25 },
        { rect: [-16, 16, 95, 255], levelFrom: [[0, 95], [0, 255]], blend: 8 },
      ],
    },
    sidewalk: 5, // a 3 m sidewalk and a 2 m grass verge on every street and court
    walk: 3, // the sidewalk part (paved)
    lawn: 8, // front lawns from the verge to the property line
    nodes: {
      tower: [0, -615], 'ridge-maple': [0, -470], 'ridge-west': [-520, -300], 'ridge-bridge': [450, -300],
      'ridge-chestnut': [200, 30], 'hollow-x': [0, 30], chrome: [590, -300], spire: [-560, -40], strip: [0, 715],
      'pine-hollow': [-530, -40], linden: [-330, -40], 'linden-neck': [-330, -130], 'hollow-lane': [-110, 250],
      'hollow-maple': [0, 330], 'pine-lane': [-300, 600], 'south-x': [0, 605], aspen: [250, 330], hawthorn: [430, 470],
      birch: [150, 602], 'phase2-top': [230, -560], 'phase2-east': [450, -170], 'orchard-n': [0, -330], 'orchard-s': [0, -130],
    },
    streets: [ // [x, z] entries are shape points, not junctions; the path is smoothed through them
      { name: 'Maple Avenue', width: 'avenue', path: ['tower', 'ridge-maple', 'orchard-n', 'orchard-s', 'hollow-x', 'hollow-maple', 'south-x', 'strip'], causeway: [95, 255] },
      { name: 'Water Tower Circle', width: 'court', bulb: { c: [0, -615], r: 30 } },
      { name: 'Ridgeway', path: ['ridge-west', [-380, -405], [-190, -462], 'ridge-maple', [110, -520], 'phase2-top', { via: [450, -590], r: 130 }, 'ridge-bridge', 'phase2-east', { via: [450, 30], r: 120 }, 'ridge-chestnut', 'hollow-x'] },
      { name: 'Riverside Bridge', path: ['ridge-bridge', 'chrome'] },
      { name: 'Pinecrest Drive', path: ['ridge-west', [-540, -170], 'pine-hollow', [-490, 100], [-485, 250], [-505, 420], { via: [-500, 600], r: 120 }, 'pine-lane', 'south-x'] },
      { name: 'Hollow Road', path: ['spire', 'pine-hollow', 'linden', { via: [-110, -40], r: 80 }, 'hollow-lane', { via: [-110, 330], r: 60 }, 'hollow-maple'] },
      { name: 'Orchard Crescent', path: ['orchard-n', { via: [-180, -330], r: 60 }, { via: [-180, -130], r: 60 }, 'orchard-s'] },
      { name: 'Linden Loop', width: 'court', path: ['linden', 'linden-neck'], loop: { c: [-330, -210], r: 80 } },
      { name: 'School Lane', path: ['hollow-lane', [-165, 380], [-245, 500], 'pine-lane'] },
      { name: 'Willow Bend', path: ['hollow-maple', 'aspen', { via: [430, 320], r: 100 }, 'hawthorn', { via: [430, 600], r: 110 }, 'birch', 'south-x'] },
      { name: 'Chestnut Court', width: 'court', path: ['ridge-chestnut', [188, -60], [215, -140]], bulb: { c: [230, -175], r: 22 } },
      { name: 'Aspen Court', width: 'court', path: ['aspen', [255, 250]], bulb: { c: [260, 205], r: 22 } },
      { name: 'Hawthorn Court', width: 'court', path: ['hawthorn', [355, 470]], bulb: { c: [315, 470], r: 22 } },
      { name: 'Birch Court', width: 'court', path: ['birch', [150, 535]], bulb: { c: [150, 495], r: 22 } },
      { name: 'Foundation Road', width: 8, surface: 'dirt', path: ['phase2-top', [250, -450], [330, -330], [410, -230], 'phase2-east'], jumps: [0.35, 0.7] },
    ],
    sites: [ // arenas first
      { kind: 'arena', name: 'Hollow High Stadium', poly: [[-465, 110], [-255, 110], [-255, 280], [-465, 280]] },
      // The boss race's shortcut: in off Pinecrest's south side, between the
      // parked cars of the school car park, and out onto its west side.
      {
        kind: 'school', name: 'Hollow High', poly: [[-465, 300], [-190, 300], [-225, 430], [-280, 545], [-455, 545], [-470, 420]],
        path: [[-322, 588], [-335, 535], [-445, 468], [-492, 408]], wayWidth: { halfWidth: 4, wallDist: 6.5 },
      },
      { kind: 'fields', name: 'Practice Fields', poly: [[-465, -20], [-160, -20], [-160, 90], [-465, 90]] },
      { kind: 'plaza', name: 'Hollow Plaza', poly: [[-95, 355], [-15, 355], [-15, 590], [-270, 590], [-225, 505]] },
      // The sprint's shortcut (the doc's two ends, and the line between them
      // across the course, clear of Ridgeway): through the clubhouse car park.
      {
        kind: 'golf', name: 'Hollow Hills Golf', poly: [[-445, -395], [-400, -500], [-190, -660], [-45, -650], [-35, -500], [-190, -485], [-370, -432]],
        path: [[-10, -600], [-60, -572], [-190, -515], [-360, -448], [-520, -300]], wayWidth: { halfWidth: 5, wallDist: 9 },
      },
      { kind: 'construction', name: 'Phase 2', poly: [[30, -480], [120, -505], [300, -545], [395, -510], [430, -445], [430, -200], [330, -230], [250, -260], [150, -300], [30, -330]] },
      { kind: 'park', name: 'Hollow Park', poly: [[-95, 45], [175, 45], [175, 315], [-95, 315]], pond: ellipse(40, 175, 110, 80) },
      { kind: 'backyards', name: 'Birch–Hawthorn', path: [[150, 495], [230, 480], [315, 470]], wayWidth: { halfWidth: 4, wallDist: 7 } },
      { kind: 'backyards', name: 'Chestnut–Phase 2', path: [[230, -175], [280, -260], [330, -330]], wayWidth: { halfWidth: 4, wallDist: 7 } },
    ],
    // What each block is (a point inside it). Houses unless said otherwise.
    lots: [
      { at: [300, -650], kind: 'houses' }, // the north and outer edge (the golf course, the tower, round the north-east lobe)
      { at: [100, -100], kind: 'houses' }, // east of Maple Ave, inside Ridgeway (Phase 2's south, Chestnut Court)
      { at: [-250, -300], kind: 'houses' }, // west of Maple Ave (Linden Loop, the park's west side)
      { at: [300, 100], kind: 'houses' }, // the east (the park's east side, Aspen Court, the riverside)
      { at: [360, -420], kind: 'construction' }, // Phase 2, between Foundation Road and Ridgeway's bend
      { at: [-535, 560], kind: 'houses' }, // the south-west, outside Pinecrest
      { at: [-200, 200], kind: 'school' }, // Hollow High: the stadium, the school, the practice fields
      { at: [-60, 520], kind: 'houses' }, // the plaza wedge
      { at: [250, 560], kind: 'houses' }, // inside Willow Bend (Birch and Hawthorn Courts)
      { at: [-100, -230], kind: 'houses' }, // inside Orchard Crescent
    ],
    shop: [-60, 520], // Hollow Hardware & Auto, in the plaza
    roamStart: 'hollow-x',

    // --- The suburb (sim/planSuburb.js) ---
    suburb: {
      avenue: 'Maple Avenue',
      // Big houses on the riverside (plots whose middle is in one of these).
      riverside: [[436, 700, -640, 60], [420, 700, 300, 700]],
      tower: { x: 50, z: -615, leg: 9, tank: 24, top: 34 },
      golf: {
        holes: [
          hole([-100, -630], [-186, -640], 10), hole([-209, -625], [-258, -583], 10), hole([-284, -572], [-343, -523], 10),
          hole([-363, -507], [-402, -464], 10), hole([-340, -490], [-265, -530]), hole([-245, -548], [-170, -580]),
          hole([-150, -600], [-150, -560], 10), hole([-170, -505], [-80, -522]), hole([-330, -462], [-240, -490]),
        ],
        // Sand bunkers: beside greens, and three beside the shortcut's line.
        bunkers: [
          ellipse(-176, -650, 6, 3.5, 12), ellipse(-266, -590, 5, 4, 12), ellipse(-334, -514, 5, 4, 12), ellipse(-406, -474, 5, 3.5, 12),
          ellipse(-255, -538, 5, 3.5, 12), ellipse(-162, -590, 5, 3.5, 12), ellipse(-72, -530, 5, 3.5, 12),
          ellipse(-280, -487, 6, 4, 12), ellipse(-130, -535, 5, 4, 12), ellipse(-395, -425, 5, 3.5, 12),
        ],
        hazard: ellipse(-205, -605, 16, 9, 20),
        clubhouse: { x: -80, z: -603, hw: 9, hd: 15, yaw: Math.PI / 2, h: 7, front: [1, 0] },
        carts: [0, 1, 2, 3, 4, 5].map((k) => ({ x: -55, z: -611 + k * 2.6, hw: 0.7, hd: 1.25, yaw: Math.PI / 2 })),
        parking: rows([[-108, -44, -575, -566], [-108, -44, -551, -541]]),
      },
      phase2: {
        // Timber frames either side of Foundation Road (metres along it,
        // metres off it), and three for the next street to the west.
        frames: {
          along: 'Foundation Road', at: [50, 90, 130, 215, 255, 295, 340, 380], off: 24, hw: 6, hd: 5,
          extra: [{ x: 80, z: -420, hw: 6, hd: 5, yaw: 0 }, { x: 110, z: -420, hw: 6, hd: 5, yaw: 0 }, { x: 140, z: -420, hw: 6, hd: 5, yaw: 0 }],
        },
        // Dirt mounds (jumps in free roam): up one side and down the other.
        mounds: [
          { x: 90, z: -370, yaw: 0, len: 6, width: 8, h: 1.6 }, { x: 170, z: -450, yaw: Math.PI / 2, len: 6, width: 8, h: 1.8 },
          { x: 380, z: -440, yaw: 0.4, len: 7, width: 9, h: 2 }, { x: 395, z: -330, yaw: Math.PI / 2, len: 6, width: 8, h: 1.5 },
        ],
        dozers: [{ x: 205, z: -400, hw: 1.7, hd: 3.2, yaw: 0.6 }],
        diggers: [{ x: 350, z: -390, hw: 1.6, hd: 3.6, yaw: -0.8 }],
        lumber: [{ x: 175, z: -345, hw: 1.2, hd: 3.5, yaw: 0.2 }, { x: 180, z: -337, hw: 1.2, hd: 3.5, yaw: 0.2 }, { x: 300, z: -480, hw: 1.2, hd: 3.5, yaw: 1.2 }],
        pipes: [{ x: 60, z: -350, hw: 1.5, hd: 4, yaw: 0 }, { x: 420, z: -280, hw: 1.5, hd: 4, yaw: 0.4 }],
        toilets: [0, 1, 2].map((k) => ({ x: 46 + k * 1.8, z: -462, hw: 0.8, hd: 0.8, yaw: 0 })),
      },
      park: {
        water: 0.2, // the pond's surface
        causeway: { x: 0, half: 11, z0: 95, z1: 255, y: 0.55, embank: 16 },
        gazebo: { x: 135, z: 72, hw: 5, hd: 5, yaw: 0 },
        play: [
          { kind: 'swings', x: -55, z: 290, hw: 4, hd: 1.2, yaw: 0, h: 2.6 },
          { kind: 'slide', x: -40, z: 288, hw: 1, hd: 3, yaw: 0, h: 2.8 },
          { kind: 'frame', x: -70, z: 280, hw: 2.5, hd: 2.5, yaw: 0, h: 2.4 },
        ],
        benches: [
          { x: -80, z: 175, hw: 0.4, hd: 1.2, yaw: 0 }, { x: 160, z: 175, hw: 0.4, hd: 1.2, yaw: 0 }, { x: 40, z: 268, hw: 1.2, hd: 0.4, yaw: 0 },
          { x: 70, z: 85, hw: 1.2, hd: 0.4, yaw: 0 }, { x: -40, z: 100, hw: 1, hd: 0.4, yaw: -0.6 }, { x: 120, z: 250, hw: 1, hd: 0.4, yaw: 0.6 },
        ],
        path: ellipse(40, 175, 124, 94, 64),
        trees: [[-75, 60], [-35, 62], [160, 60], [165, 290], [100, 300], [-80, 250], [-80, 110], [165, 120], [160, 230], [60, 295], [-25, 305]],
      },
      school: {
        building: { x: -370, z: 352, hw: 70, hd: 22, yaw: 0, h: 10, front: [0, 1] },
        gym: { x: -265, z: 355, hw: 30, hd: 24, yaw: Math.PI / 2, h: 12, front: [1, 0] },
        parking: rows([[-440, -295, 460, 470], [-445, -295, 486, 496], [-450, -295, 512, 522]]),
        gates: [{ x: -252, z: 487, yaw: Math.atan2(-55, 115), span: 12 }], // along the site's edge on School Lane
        masts: [[-400, 480], [-330, 480], [-400, 506], [-330, 506]],
        // The flagpole and the sign by the gates.
        sign: { x: -244, z: 458, hw: 0.3, hd: 3, yaw: Math.atan2(-55, 115) },
      },
      fields: {
        // The mound, facing the outfield (north-east); home plate south-west of it.
        diamond: { x: -410, z: 50, r: 42, yaw: (3 * Math.PI) / 4 },
        backstop: [{ x: -428, z: 68, hw: 0.1, hd: 7, yaw: Math.PI / 4 }],
        courts: [{ x: -290, z: 35, hw: 5.5, hd: 12, yaw: 0 }, { x: -262, z: 35, hw: 5.5, hd: 12, yaw: 0 }, { x: -234, z: 35, hw: 5.5, hd: 12, yaw: 0 }],
      },
      plaza: {
        // The strip mall along the south, facing north over its car park.
        shops: [
          { kind: 'supermarket', name: 'FOODWAY', x: -182, z: 566.5, hw: 32, hd: 18.5, yaw: Math.PI, h: 9, front: [0, -1] },
          { kind: 'laundromat', name: 'SUDS', x: -139, z: 566.5, hw: 10, hd: 18.5, yaw: Math.PI, h: 6, front: [0, -1] },
          { kind: 'pizza', name: 'PIZZA', x: -118, z: 566.5, hw: 9, hd: 18.5, yaw: Math.PI, h: 6, front: [0, -1] },
          { kind: 'video', name: 'VIDEO', x: -97, z: 566.5, hw: 10, hd: 18.5, yaw: Math.PI, h: 6, front: [0, -1] },
          { kind: 'shop', name: 'HOLLOW HARDWARE & AUTO', x: -57, z: 566.5, hw: 26, hd: 18.5, yaw: Math.PI, h: 8, front: [0, -1] },
        ],
        parking: [...rows([[-172, -32, 452, 462], [-195, -32, 480, 490]]), ...rows([[-215, -32, 508, 518]])],
        masts: [[-120, 471], [-60, 471], [-120, 499], [-60, 499], [-170, 499]],
        pylon: { x: -24, z: 440, hw: 0.6, hd: 2.5, yaw: 0, h: 12 },
        trees: [[-80, 370], [-55, 370], [-30, 370], [-42, 395], [-30, 420], [-60, 410]],
      },
      // The Linden green: trees round it and benches (offsets from its middle).
      green: {
        trees: [[0, 0, 1.6], [-35, -30, 1.2], [38, -25, 1.2], [-30, 38, 1.2], [36, 34, 1.2], [0, -50, 1], [0, 52, 1], [-52, 5, 1], [52, 0, 1]],
        benches: [{ x: 8, z: 12, hw: 1.2, hd: 0.4, yaw: 0 }, { x: -12, z: -10, hw: 1.2, hd: 0.4, yaw: 0 }],
      },
      // The cut-throughs' backyards: fences across the way between them
      // (fractions along it); each yard reaches `yard` metres either side.
      backyards: {
        yard: 10,
        'Birch–Hawthorn': [0.15, 0.38, 0.62, 0.85], // three backyards
        'Chestnut–Phase 2': [0.1, 0.2, 0.3, 0.4], // three, then Phase 2
      },
    },

    furniture: { lampPitch: 70, lampIn: -1 }, // sparse amber lamps, on the verges
    // The city beyond the edge: more houses (not across the river).
    fillers: { widths: [22, 20, 24, 18, 21], heights: [8, 9, 10, 8.5, 9.5], depth: 22, exitGap: 24, kind: 'house' },
    // The river along the east edge (the bank is the boundary between these points).
    river: { bank: [[570, -547], [600, -220], [480, 44], [570, 334], [420, 661]], width: 70, h: 1 },
    // The runaway RV: off its handbrake on the circle by the tower, down Maple
    // Avenue (drifting across the lanes), off the causeway into the pond.
    rv: {
      path: [[18, -600], [6, -586], [0, -565], [0, 100], [12, 125], [34, 160], [46, 180]],
      accel: 0.6, vmax: 25, drift: 7, wave: 70, leaveAt: 700, sink: 4, length: 9, width: 2.5, height: 3.4, chance: 0.2,
      water: 0.2, // the pond's surface, where it goes in
    },
  },
  // The Homecoming Brawl (world coordinates): the stadium under the floodlights.
  arenas: {
    'Hollow High Stadium': {
      bounds: [-465, -255, 110, 280],
      track: TRACK,
      obstacles: [
        // The bleachers along both long sides, the press box on the home stand.
        { kind: 'bleachers', x: -420, z: 195, hw: 15, hd: 30, h: 6, face: 1 },
        { kind: 'bleachers', x: -300, z: 195, hw: 15, hd: 30, h: 6, face: -1 },
        { kind: 'pressbox', x: -440, z: 195, hw: 4, hd: 12, h: 11 },
        // Goalposts at both ends (the post; the uprights are above car height).
        { kind: 'goalpost', x: -360, z: 139, hw: 0.3, hd: 0.3, h: 3, face: -1 },
        { kind: 'goalpost', x: -360, z: 251, hw: 0.3, hd: 0.3, h: 3, face: 1 },
        // Floodlight towers at the corners.
        ...[[-452, 124], [-268, 124], [-452, 266], [-268, 266]].map(([x, z]) => ({ kind: 'floodlight', x, z, hw: 0.8, hd: 0.8, h: 28 })),
        // The scoreboard's legs, at the south end.
        { kind: 'scoreboard', x: -369, z: 274, hw: 0.4, hd: 0.4, h: 12 }, { kind: 'scoreboard', x: -351, z: 274, hw: 0.4, hd: 0.4, h: 12 },
        // The team benches along the sidelines, the water-cooler table.
        { kind: 'bench', x: -331, z: 180, hw: 0.4, hd: 6, h: 0.9 }, { kind: 'bench', x: -331, z: 210, hw: 0.4, hd: 6, h: 0.9 },
        { kind: 'bench', x: -389, z: 180, hw: 0.4, hd: 6, h: 0.9 }, { kind: 'bench', x: -389, z: 210, hw: 0.4, hd: 6, h: 0.9 },
        { kind: 'cooler', x: -331, z: 195, hw: 0.6, hd: 1.5, h: 1.1 },
        // The fence round it: gates to the fields (north), the school (south) and Pinecrest (west).
        ...fence([-465, 110], [-255, 110], [[99, 111]]), ...fence([-465, 280], [-255, 280], [[99, 111]]),
        ...fence([-465, 110], [-465, 280], [[80, 90]]), ...fence([-255, 110], [-255, 280]),
      ],
      // The homecoming stage at the north end: up the ramp from the west, across it, off the front.
      platforms: [{ kind: 'stage', x: -360, z: 115, hw: 20, hd: 4, h: 1.6 }],
      ramps: [{ x: -390, z: 115, dirX: 1, dirZ: 0, len: 10, width: 8, height: 1.6 }],
      // The sweeper: the homecoming parade float, slow laps of the running track (this event only).
      movers: [{ kind: 'float', event: true, path: oval(TRACK.cx, TRACK.cz, TRACK.r + TRACK.lanes / 2, TRACK.half), speed: 5, phase: 0, hw: 2.2, hd: 4.5, y0: 0, h: 3.6, dps: 25 }],
      // The Watch's minivans across the three gates (x0, z0, x1, z1), just outside the fence.
      limos: [[-367, 108, -353, 108], [-367, 282, -353, 282], [-467, 188, -467, 202]],
      // The field and infield are grass; the running track is hard; grass outside it.
      surfaces: [
        { poly: oval(TRACK.cx, TRACK.cz, TRACK.r, TRACK.half), surface: 2 },
        { poly: oval(TRACK.cx, TRACK.cz, TRACK.r + TRACK.lanes, TRACK.half), surface: 0 },
        { poly: [[-465, 110], [-255, 110], [-255, 280], [-465, 280]], surface: 2 },
      ],
      spawns: [
        { x: -360, z: 165 }, { x: -360, z: 225 }, { x: -380, z: 195 }, { x: -340, z: 195 },
        { x: -425, z: 132 }, { x: -295, z: 132 }, { x: -425, z: 258 }, { x: -295, z: 258 },
      ],
      pickups: [
        { type: 'health', x: -360, z: 115, deck: true }, { type: 'ammo', x: -360, z: 195 }, { type: 'nitro', x: -445, z: 195 },
        { type: 'nitro', x: -275, z: 195 }, { type: 'ammo', x: -310, z: 125 }, { type: 'health', x: -410, z: 265 },
      ],
    },
  },
  features: [],
  buildings: 'houses', heights: [8, 10],
  look: { building: '#c8b8a0', buildingTex: 'building', lamp: '#ffb060', barrier: '#e8e0d0', signs: 0.1, lot: '#3e5a32', neon: ['#ffb060', '#ff6a3a', '#80c0ff'], road: '#8a8690', roadGloss: 0.35, walk: '#a8a4a0', closures: 'watch', startDressing: 'maple', suburb: true },
};
