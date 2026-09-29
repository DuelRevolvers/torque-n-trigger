// The Undercity's layout (called from planLayout): the deck's pillars (a 45 m
// grid through the lots and along the kerbs, never in a carriageway; its last
// row down the pit wall; thickest in Pillar Hall), the shacks in terraces up
// the pit walls, the Black Market's stalls, the scrapyard, the tank farm, the
// Sump's props, the storm drain's Culvert, Outfall gates, fences, sirens and
// strobes, the Low Road's walls and portal, the fence round the pit's rim, and
// the river and bay walls. Placed by fixed rules from the district's data;
// nothing is random.

import * as G from './geom2d.js';

export function underLayout(ctx) {
  const { map, P, H, items, obbItem, polyItem, deco, clear, reserve } = ctx;
  const U = P.under;
  const surface = map.streets.filter((st) => !st.tunnel);
  // Distance from (x, z) to the nearest carriageway edge of a street at ground
  // level (negative: in it).
  const offRoad = (x, z, list = surface) => {
    let best = Infinity;
    for (const st of list) {
      const q = G.nearestOnLine(st.pts, x, z);
      best = Math.min(best, q.d - st.half);
    }
    return best;
  };
  const pit = P.pit;
  const rOf = (x, z) => Math.hypot(x - pit.c[0], z - pit.c[1]);
  const hall = map.sites.find((s) => s.name === 'Pillar Hall');
  const lowRoad = map.streets.find((st) => st.tunnel);

  deck();
  pillars();
  hallPillars();
  terraces();
  market();
  scrapyard();
  tankFarm();
  sump();
  drain();
  tunnel();
  rimFence();
  shores();
  return;

  // The deck overhead: its slab (drawn), light wells.
  function deck() {
    deco('deck', { edge: P.deck.edge, height: P.deck.height, wells: U.wells || [], boundary: P.boundary });
  }

  // A pillar: 1.5 m square, from the ground to the deck.
  function pillar(x, z, size = 1.5) {
    const o = { x, z, hw: size / 2, hd: size / 2, yaw: 0 };
    if (!clear(G.obbCorners(o), 0.6, { ignore: 'site' })) return;
    obbItem('pillar', o, P.deck.height - H(x, z), { cycle: 0, size });
  }

  function pillars() {
    const step = P.deck.pillars;
    const b = G.polyBounds(P.boundary);
    for (let x = Math.ceil(b.minX / step) * step; x <= b.maxX; x += step) {
      for (let z = Math.ceil(b.minZ / step) * step; z <= b.maxZ; z += step) {
        if (!map.underDeck(x, z) || !G.pointInPoly(x, z, P.boundary)) continue;
        if (hall && G.pointInPoly(x, z, hall.poly)) continue;
        if (offRoad(x, z) < 3 || offRoad(x, z, [lowRoad]) < 3) continue;
        pillar(x, z);
      }
    }
    // Along both kerbs of the streets under the deck.
    for (const st of surface) {
      if (st.drain || st.descends) continue;
      const L = st.len;
      for (let s = 20; s < L - 20; s += step) {
        const p = G.pointAlong(st.pts, s);
        for (const sd of [-1, 1]) {
          const lat = st.half + 0.9;
          const x = p.x - p.dz * sd * lat;
          const z = p.z + p.dx * sd * lat;
          if (!map.underDeck(x, z) || map.nodes.some((n) => n.name && Math.hypot(n.x - x, n.z - z) < 22)) continue;
          if (offRoad(x, z) < 0.3) continue;
          pillar(x, z);
        }
      }
    }
  }

  // Pillar Hall: the deck's supports at their thickest.
  function hallPillars() {
    if (!hall) return;
    const { pitch, size } = U.hall.pillars;
    const b = G.polyBounds(hall.poly);
    for (let x = b.minX + pitch / 2; x < b.maxX; x += pitch) {
      for (let z = b.minZ + pitch / 2; z < b.maxZ; z += pitch) {
        if (!G.pointInPoly(x, z, hall.poly)) continue;
        if (U.hall.cabins.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < 8) || U.hall.barrels.some(([bx, bz]) => Math.hypot(bx - x, bz - z) < 3)) continue;
        const o = { x, z, hw: size / 2, hd: size / 2, yaw: 0 };
        obbItem('pillar', o, P.deck.height - H(x, z), { cycle: 1, size, hall: true });
      }
    }
  }

  // Shacks and container homes in terraces up the pit walls, clear of the
  // Spiral, the Throat and the Low Road's mouth; ladders and washing lines.
  function terraces() {
    let k = 0;
    for (const r of U.terraces) {
      const n = Math.floor((2 * Math.PI * r) / 13);
      let prev = null;
      for (let q = 0; q < n; q++) {
        const a = (q / n) * Math.PI * 2;
        const x = pit.c[0] + Math.cos(a) * r;
        const z = pit.c[1] + Math.sin(a) * r;
        if (offRoad(x, z) < 9 || offRoad(x, z, [lowRoad]) < 9) {
          prev = null;
          continue;
        }
        const o = { x, z, hw: 4.5 + (k % 3), hd: 3.5, yaw: Math.atan2(Math.cos(a), Math.sin(a)) + Math.PI / 2 };
        if (!clear(G.obbCorners(o), 0.8, { ignore: 'site' })) {
          prev = null;
          continue;
        }
        const it = obbItem('bldg', o, [6, 9, 7, 11, 8][k % 5], { kind: k % 3 === 1 ? 'container' : 'shack', front: [-Math.cos(a), -Math.sin(a)], cycle: k, terrace: true });
        if (prev && k % 2 === 0) deco('washing', { a: [prev.x, prev.y + prev.h - 1, prev.z], b: [x, it.y + it.h - 1, z] });
        prev = it;
        k++;
      }
    }
  }

  // The Black Market: stalls either side of the Market lane under tarps,
  // generators, cages of parts and hanging lamps.
  function market() {
    const m = U.market;
    const site = map.sites.find((s) => s.kind === 'market');
    const lane = map.streets.find((st) => st.name === m.lane);
    if (!site || !lane) return;
    let k = 0;
    for (let s = 10; s < lane.len - 8; s += m.pitch, k++) {
      const p = G.pointAlong(lane.pts, s);
      for (const sd of [-1, 1]) {
        if ((k + (sd > 0 ? 2 : 0)) % m.gap === m.gap - 1) continue;
        const off = lane.half + 0.4 + m.stall / 2;
        const x = p.x - p.dz * sd * off;
        const z = p.z + p.dx * sd * off;
        if (!G.pointInPoly(x, z, site.poly)) continue;
        const o = { x, z, hw: m.stall / 2, hd: m.stall / 2, yaw: Math.atan2(p.dx, p.dz) };
        const t = k % 9 === 4 ? 'generator' : k % 9 === 7 ? 'cage' : 'stall';
        obbItem(t, o, t === 'stall' ? 2.8 : 1.8, { cycle: k + (sd > 0 ? 3 : 0), front: [p.dz * sd, -p.dx * sd] });
      }
      if (k % 3 === 1) deco('lights', { x: p.x, z: p.z, dx: p.dx, dz: p.dz, span: 2 * (lane.half + m.stall + 1), y: H(p.x, p.z) + 4.6 });
    }
    // The gate on Lip Road.
    deco('marketGate', { ...G.pointAlong(lane.pts, 3), y: H(lane.pts[0][0], lane.pts[0][1]) });
  }

  // The scrapyard: stacks of crushed cars, the scrap crane and its magnet, a fence.
  function scrapyard() {
    const s = U.scrap;
    s.stacks.forEach(([x, z], k) => obbItem('scrapStack', { x, z, hw: 2.2, hd: 4.4, yaw: (k % 3) * 0.3 }, 3 + (k % 3), { cycle: k }));
    const [cx, cz] = s.crane;
    obbItem('scrapCrane', { x: cx, z: cz, hw: 2.5, hd: 3.5, yaw: 0 }, 4, { cycle: 0 });
    deco('craneBoom', { x: cx, z: cz, y: H(cx, cz) + 4, len: 26, magnet: true });
    const yard = map.sites.find((q) => q.kind === 'yard');
    fenceRound(yard.poly, 3);
  }

  // The tank farm: old fuel and water tanks, pipe racks.
  function tankFarm() {
    U.tanks.forEach(([x, z, r], k) => {
      const poly = [...Array(14).keys()].map((q) => [x + Math.cos((q / 14) * Math.PI * 2) * r, z + Math.sin((q / 14) * Math.PI * 2) * r]);
      polyItem('tank', poly, 10 + (k % 3) * 3, { cycle: k, rad: r });
    });
    for (const [a, b] of U.pipes) {
      const L = G.len2(a, b);
      for (let t = 0; t <= L; t += 12) {
        const x = a[0] + ((b[0] - a[0]) * t) / L;
        const z = a[1] + ((b[1] - a[1]) * t) / L;
        const o = { x, z, hw: 0.3, hd: 0.3, yaw: 0 };
        if (clear(G.obbCorners(o), 0.3, { ignore: 'site' })) obbItem('rackLeg', o, 5, { cycle: 0 });
      }
      deco('pipes', { a, b, y: H(a[0], a[1]) + 5 });
    }
    const farm = map.sites.find((q) => q.kind === 'tanks');
    fenceRound(farm.poly, 3);
  }

  // A chain-link fence round a polygon, open where streets meet it.
  function fenceRound(poly, h) {
    poly.forEach((a, k) => {
      const b = poly[(k + 1) % poly.length];
      const L = G.len2(a, b);
      for (let t = 0; t < L - 0.5; t += 8) {
        const len = Math.min(8, L - t);
        const x = a[0] + ((b[0] - a[0]) * (t + len / 2)) / L;
        const z = a[1] + ((b[1] - a[1]) * (t + len / 2)) / L;
        if (offRoad(x, z) < 1.5) continue;
        obbItem('fence', { x, z, hw: 0.08, hd: len / 2, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) }, h, { cycle: 0 });
      }
    });
  }

  // The Sump: the half-sunk bus, the inlet pipe in the wall, drain grates.
  function sump() {
    const s = U.sump;
    obbItem('sunkBus', s.bus, 3.2 - s.bus.sink, { y: H(s.bus.x, s.bus.z) - s.bus.sink, cycle: 0 });
    deco('inlet', { x: s.inlet[0], z: s.inlet[1], y: H(...s.inlet) + 2, toward: [pit.c[0] - s.inlet[0], pit.c[1] - s.inlet[1]] });
    for (const [x, z] of s.grates) deco('grate', { x, z, y: H(x, z) });
  }

  // The storm drain: the Culvert's box mouth at the east end, the Outfall gates
  // at the west, a chain-link fence along both tops, sirens and strobes.
  function drain() {
    const d = P.drain;
    const run = d.depth / Math.tan((d.walls * Math.PI) / 180);
    const top = d.bed / 2 + run;
    // The Culvert: a concrete headwall round the tunnel mouth, the tunnel's back wall.
    obbItem('culvert', { x: d.x1 + 4, z: d.z, hw: top + 2, hd: 4, yaw: Math.PI / 2 }, d.depth + 3, { y: -d.depth - 0.5, cycle: 0 });
    deco('culvertMouth', { x: d.x1, z: d.z, w: d.bed, h: d.depth - 1, y: -d.depth });
    obbItem('outfall', { x: d.x0 + 3, z: d.z, hw: d.bed / 2 + run, hd: 1, yaw: Math.PI / 2 }, d.depth + 2, { y: -d.depth - 0.5, cycle: 0 });
    for (const sd of [-1, 1]) {
      for (let x = d.x0 + 4; x < d.x1 - 2; x += 8) {
        const z = d.z + sd * (top + 1.5);
        if (offRoad(x, z) < 1) continue;
        obbItem('fence', { x: x + 4, z, hw: 0.08, hd: 4, yaw: Math.PI / 2 }, 2.4, { cycle: 0 });
      }
      for (let x = d.x0 + 40; x < d.x1 - 20; x += U.sirens) deco('siren', { x, z: d.z + sd * (top - 1), y: -1.5, side: sd });
    }
    reserve([[d.x0 - 10, d.z - top - 8], [d.x1 + 10, d.z - top - 8], [d.x1 + 10, d.z + top + 8], [d.x0 - 10, d.z + top + 8]]);
  }

  // The Low Road: walls either side where it runs underground, a concrete
  // portal at each open end.
  function tunnel() {
    const st = lowRoad;
    if (!st) return;
    const { k0, k1 } = st.descent;
    const cum = st.cum;
    const lat = st.half + 0.5;
    let wasCovered = false;
    for (let s = cum[k0]; s < cum[k1]; s += 4) {
      const p = G.pointAlong(st.pts, s);
      const y = st.hAt(s);
      const covered = map.tunnelAt(p.x, p.z) !== null;
      if (covered !== wasCovered) deco('portal', { x: p.x, z: p.z, dx: p.dx, dz: p.dz, y, half: lat, h: U.ceiling });
      wasCovered = covered;
      for (const sd of [-1, 1]) {
        const x = p.x - p.dz * sd * lat;
        const z = p.z + p.dx * sd * lat;
        obbItem('tunnelWall', { x, z, hw: 0.4, hd: 2.2, yaw: Math.atan2(p.dx, p.dz) }, U.ceiling, { y: y - 0.3, cycle: 0, covered });
      }
    }
    deco('tunnel', { pts: st.pts.slice(k0, k1 + 1), heights: st.heights.slice(k0, k1 + 1), half: lat, ceiling: U.ceiling });
  }

  // A chain-link fence round the pit's rim, open where the roads go in.
  function rimFence() {
    const r = pit.rim + 3;
    const n = Math.floor((2 * Math.PI * r) / 6);
    for (let q = 0; q < n; q++) {
      const a = ((q + 0.5) / n) * Math.PI * 2;
      const x = pit.c[0] + Math.cos(a) * r;
      const z = pit.c[1] + Math.sin(a) * r;
      if (offRoad(x, z) < 2) continue;
      const o = { x, z, hw: 0.08, hd: (Math.PI * r) / n, yaw: Math.atan2(-Math.sin(a), Math.cos(a)) };
      if (clear(G.obbCorners(o), 0.1, { ignore: 'site' })) obbItem('fence', o, 2.2, { cycle: 0 });
    }
  }

  // The river beyond the north edge, the bay beyond the south: a low wall, the water.
  function shores() {
    for (const [name, line] of Object.entries(U.shores || {})) {
      for (let k = 0; k + 1 < line.length; k++) {
        const a = line[k];
        const b = line[k + 1];
        const L = G.len2(a, b);
        const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
        const mx = (a[0] + b[0]) / 2;
        const mz = (a[1] + b[1]) / 2;
        const sg = G.pointInPoly(mx - d[1] * 3, mz + d[0] * 3, P.boundary) ? 1 : -1;
        const inl = [-d[1] * sg, d[0] * sg];
        const cuts = map.nodes.filter((nd) => nd.exit && G.segDist(nd.x, nd.z, a, b).d < 2).map((nd) => G.segDist(nd.x, nd.z, a, b).t * L);
        let t0 = 0;
        for (const c of [...cuts.map((c) => [c - 12, c + 12]), [L, L]]) {
          if (c[0] - t0 > 1) {
            const tm = (t0 + c[0]) / 2;
            obbItem('seaWall', { x: a[0] + d[0] * tm + inl[0] * 0.4, z: a[1] + d[1] * tm + inl[1] * 0.4, hw: 0.4, hd: (c[0] - t0) / 2, yaw: Math.atan2(d[0], d[1]) }, 1.1, { cycle: 0, inland: inl });
          }
          t0 = c[1];
        }
      }
      deco('water', { line, name });
    }
  }
}
