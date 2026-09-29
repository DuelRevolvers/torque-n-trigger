// New maps in the T&T SDK: a blank district in the Neon Strip's look (flat
// ground, a ring road with Main Street across it, blocks of clubs: draw its
// streets, fill its blocks, place its objects, make its events). A copy of a
// built-in district is that district opened and saved as a map of your own.
import { docFromDistrict } from '../content/mapDoc.js';

export function blankDistrict(style, n = 1) {
  const doc = docFromDistrict(style);
  const d = doc.district;
  const half = 600;
  d.city = {
    ...d.city,
    id: `custom-${n}`,
    name: 'New District',
    plan: {
      boundary: [[-half, -half], [half, -half], [half, half], [-half, half]],
      terrain: {},
      defaultLot: 'clubs',
      roamStart: 'w',
      // A ring road round the middle, and Main Street across it and out both sides
      // (a road named for a district leaves the district: it meets the edge).
      nodes: { nw: [-400, -400], ne: [400, -400], se: [400, 400], sw: [-400, 400], w: [-400, 0], e: [400, 0], rustline: [-half, 0], undercity: [half, 0] },
      streets: [
        { name: 'Ring Road', loop: true, path: ['nw', 'ne', 'e', 'se', 'sw', 'w'] },
        { name: 'Main Street', width: 'avenue', path: ['rustline', 'w', 'e', 'undercity'] },
      ],
      sites: [],
      lots: [],
    },
  };
  delete d.city.arenas;
  Object.assign(d, { id: `custom-${n}`, name: 'New District', blurb: 'A district of your own.', events: [], boss: null });
  return { ...doc, id: d.id, name: d.name, base: null, baseHash: null };
}
