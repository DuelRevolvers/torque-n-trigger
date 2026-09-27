// Low-poly body shells per chassis type, with named mount points where parts
// attach. Profiles are [z, y] points around a convex side outline (z forward is
// negative), extruded across the chassis width. Values are in metres, body frame.
export const SHELLS = {
  hatch: {
    body: [[-1.9, -0.42], [1.85, -0.42], [1.9, 0.12], [1.78, 0.3], [-0.95, 0.14], [-1.95, -0.04]],
    cabin: [[-0.95, 0.14], [1.78, 0.3], [1.55, 0.8], [-0.1, 0.8]],
    hood: { y: 0.16, z: -1.4 }, roof: { y: 0.8, z: 0.55 }, deck: { y: 0.32, z: 1.65 }, front: -1.95, rear: 1.9,
  },
  wedge: {
    body: [[-2.15, -0.42], [2.1, -0.42], [2.2, 0.08], [2.0, 0.22], [-1.1, 0.16], [-2.22, -0.06]],
    cabin: [[-0.95, 0.14], [1.5, 0.2], [0.95, 0.66], [-0.2, 0.66]],
    hood: { y: 0.17, z: -1.55 }, roof: { y: 0.66, z: 0.35 }, deck: { y: 0.22, z: 1.8 }, front: -2.22, rear: 2.2,
  },
  muscle: {
    body: [[-2.3, -0.42], [2.25, -0.42], [2.3, 0.12], [2.1, 0.26], [-1.2, 0.24], [-2.32, 0.0]],
    cabin: [[-0.8, 0.24], [1.25, 0.26], [0.8, 0.72], [-0.1, 0.72]],
    hood: { y: 0.25, z: -1.65 }, roof: { y: 0.72, z: 0.35 }, deck: { y: 0.26, z: 1.8 }, front: -2.32, rear: 2.3,
  },
  pickup: {
    body: [[-2.45, -0.42], [2.4, -0.42], [2.45, 0.28], [-1.4, 0.32], [-2.47, 0.05]],
    cabin: [[-1.35, 0.32], [0.45, 0.32], [0.3, 0.95], [-0.8, 0.95]],
    bedRails: true,
    hood: { y: 0.33, z: -1.9 }, roof: { y: 0.95, z: -0.25 }, deck: { y: 0.32, z: 1.45 }, front: -2.47, rear: 2.45,
  },
  van: {
    body: [[-2.4, -0.42], [2.4, -0.42], [2.42, 0.98], [-1.3, 1.0], [-2.3, 0.32], [-2.45, 0.0]],
    cabin: [[-2.28, 0.36], [-2.15, 0.36], [-1.25, 0.99], [-1.38, 0.99]],
    cabinWidth: 0.97,
    hood: { y: 0.5, z: -2.0 }, roof: { y: 1.0, z: 0.3 }, deck: { y: 1.0, z: 1.7 }, front: -2.45, rear: 2.42,
  },
  buggy: {
    body: [[-1.8, -0.4], [1.75, -0.4], [1.8, 0.02], [-1.4, 0.06], [-1.85, -0.15]],
    cabin: null,
    cage: true,
    // Rear-engined: the "hood" mount is behind the driver, the "deck" is at the front.
    hood: { y: 0.06, z: 1.15 }, roof: { y: 0.95, z: 0.1 }, deck: { y: 0.06, z: -1.3 }, front: -1.85, rear: 1.8,
  },
};
