// Low-poly body shells per chassis type, with named mount points where parts
// attach. Profiles are [z, y] points around a convex side outline (z forward is
// negative), extruded across the chassis width with chamfered edges (`bevel`).
// Cabin points: [0] windscreen base, [1] rear base, [2] top of the rear window,
// last: top of the windscreen. Values are in metres, body frame.
// Styles: bumper 'plastic' | 'chrome' | 'steel' | 'tube'; arches 'flare' | 'box' |
// 'well' | 'guard'.
export const SHELLS = {
  // Rally hatchback: short rounded nose, tall glasshouse, roof spoiler.
  hatch: {
    body: [[-1.88, -0.42], [1.84, -0.42], [1.9, -0.32], [1.92, 0.1], [1.84, 0.26], [1.7, 0.31], [0.4, 0.3], [-0.95, 0.28], [-1.5, 0.24], [-1.85, 0.1], [-1.95, -0.06], [-1.95, -0.32]],
    cabin: [[-0.95, 0.27], [1.72, 0.3], [1.56, 0.76], [1.35, 0.81], [0.6, 0.83], [-0.1, 0.8]],
    bevel: 0.07, bumper: 'plastic', arches: 'flare',
    hood: { y: 0.16, z: -1.4 }, roof: { y: 0.8, z: 0.55 }, deck: { y: 0.32, z: 1.65 }, front: -1.95, rear: 1.9,
  },
  // 80s wedge: knife nose, low faceted glasshouse, crisp edges.
  wedge: {
    body: [[-2.12, -0.42], [2.1, -0.42], [2.18, -0.3], [2.2, 0.08], [2.05, 0.23], [1.2, 0.25], [-1.1, 0.25], [-1.75, 0.2], [-2.22, -0.08], [-2.24, -0.2], [-2.18, -0.36]],
    cabin: [[-0.95, 0.24], [1.5, 0.23], [0.95, 0.64], [0.4, 0.67], [-0.2, 0.65]],
    bevel: 0.04, bumper: 'plastic', arches: 'well',
    hood: { y: 0.17, z: -1.55 }, roof: { y: 0.66, z: 0.35 }, deck: { y: 0.22, z: 1.8 }, front: -2.22, rear: 2.2,
  },
  // Muscle car: long flat hood, rounded nose, crowned roof, chrome bumpers.
  muscle: {
    body: [[-2.28, -0.42], [2.24, -0.42], [2.3, -0.3], [2.32, 0.1], [2.22, 0.25], [1.6, 0.28], [-1.2, 0.27], [-2.05, 0.22], [-2.3, 0.08], [-2.34, -0.1], [-2.32, -0.32]],
    cabin: [[-0.8, 0.25], [1.3, 0.27], [0.85, 0.7], [0.35, 0.74], [-0.1, 0.71]],
    bevel: 0.06, bumper: 'chrome', arches: 'flare',
    hood: { y: 0.25, z: -1.65 }, roof: { y: 0.72, z: 0.35 }, deck: { y: 0.26, z: 1.8 }, front: -2.32, rear: 2.3,
  },
  // Work pickup: tall square nose, upright cab, open bed.
  pickup: {
    body: [[-2.42, -0.42], [2.4, -0.42], [2.45, -0.32], [2.46, 0.26], [2.4, 0.3], [-1.4, 0.33], [-2.2, 0.3], [-2.45, 0.22], [-2.49, 0.02], [-2.47, -0.3]],
    cabin: [[-1.35, 0.32], [0.45, 0.32], [0.36, 0.9], [0.22, 0.96], [-0.7, 0.96], [-0.82, 0.93]],
    bedRails: true,
    bevel: 0.06, bumper: 'steel', arches: 'box',
    hood: { y: 0.33, z: -1.9 }, roof: { y: 0.95, z: -0.25 }, deck: { y: 0.32, z: 1.45 }, front: -2.47, rear: 2.45,
  },
  // Box van: rounded roof edges, raked windscreen, flat back.
  van: {
    body: [[-2.38, -0.42], [2.38, -0.42], [2.43, -0.32], [2.44, 0.9], [2.36, 0.99], [2.1, 1.01], [-1.2, 1.01], [-1.34, 0.97], [-2.3, 0.33], [-2.42, 0.16], [-2.46, -0.08], [-2.43, -0.34]],
    cabin: [[-2.28, 0.36], [-2.15, 0.36], [-1.25, 0.99], [-1.38, 0.99]],
    cabinWidth: 0.97,
    bevel: 0.13, cabinBevel: 0.02, bumper: 'steel', arches: 'well',
    hood: { y: 0.5, z: -2.0 }, roof: { y: 1.0, z: 0.3 }, deck: { y: 1.0, z: 1.7 }, front: -2.45, rear: 2.42,
  },
  // Baja buggy: open tub cut high over the wheels, tube bumpers, mudguards.
  buggy: {
    body: [[-1.72, -0.4], [1.7, -0.4], [1.8, -0.28], [1.84, 0.05], [1.74, 0.2], [1.5, 0.25], [-1.2, 0.25], [-1.62, 0.16], [-1.82, 0.0], [-1.87, -0.15], [-1.85, -0.3]],
    cabin: null,
    cage: true,
    bevel: 0.03, bumper: 'tube', arches: 'guard',
    // Rear-engined: the "hood" mount is behind the driver, the "deck" is at the front.
    hood: { y: 0.06, z: 1.15 }, roof: { y: 0.95, z: 0.1 }, deck: { y: 0.06, z: -1.3 }, front: -1.85, rear: 1.8,
  },
};
