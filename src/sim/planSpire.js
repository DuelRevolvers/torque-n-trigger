// The Corporate Spire's set pieces (called from planLayout): Spire Plaza (a
// metre up, its balustrade open at the eight ramps, fountains round the foot of
// the Spire, the 420 m tower itself), Central Park (its lake, big trees on the
// lawns, the bandstand, stone gates where its drives meet the rings), the
// triumphal arches over the four avenues' gate plazas, and the stone piers at
// the North and West Gates. Placed by fixed rules from the district's data;
// nothing is random.

import * as G from './geom2d.js';

export function spireLayout(ctx) {
  const { map, P, H, items, obbItem, polyItem, deco, clear, reserve } = ctx;
  const S = P.spire;
  const dir = (k) => [Math.sin((k * Math.PI) / 4), -Math.cos((k * Math.PI) / 4)];
  // Distance from (x, z) to the nearest carriageway edge (negative: in it).
  const offRoad = (x, z) => {
    let best = Infinity;
    for (const st of map.streets) best = Math.min(best, G.nearestOnLine(st.pts, x, z).d - st.half);
    return best;
  };

  plaza();
  park();
  arches();
  return;

  // Spire Plaza: the balustrade round its edge (open at the ramps), the ramps,
  // the fountains and the Spire.
  function plaza() {
    const p = S.plaza;
    const base = map.terrain.baseAt || H;
    const top = H(0, 0);
    const side = p.apothem * Math.tan(Math.PI / 8);
    for (let k = 0; k < 8; k++) {
      const n = dir(k);
      const t = [-n[1], n[0]]; // along the side
      const c = [n[0] * (p.apothem + 0.25), n[1] * (p.apothem + 0.25)];
      for (const [a, b] of [[-side, -p.rampHalf - 0.4], [p.rampHalf + 0.4, side]]) {
        const m = (a + b) / 2;
        const x = c[0] + t[0] * m;
        const z = c[1] + t[1] * m;
        const y = base(x + n[0] * 0.6, z + n[1] * 0.6) - 0.1;
        obbItem('balustrade', { x, z, hw: 0.3, hd: (b - a) / 2, yaw: Math.atan2(t[0], t[1]) }, top + p.balustrade - y, { y, cycle: k });
      }
      const foot = [n[0] * (p.apothem + p.rampLen), n[1] * (p.apothem + p.rampLen)];
      deco('plazaRamp', { k, n, half: p.rampHalf, from: p.apothem, len: p.rampLen, y0: top, y1: H(...foot) });
    }
    deco('plaza', { apothem: p.apothem, y: top });
    for (const [x, z, r] of S.fountains) obbItem('fountain', { x, z, hw: r, hd: r, yaw: 0 }, 0.8, { rad: r, y: H(x, z) - 0.1 });
    const t = S.tower;
    const R = t.apothem / Math.cos(Math.PI / 8);
    const foot = [...Array(8).keys()].map((k) => [Math.sin(((k + 0.5) * Math.PI) / 4) * R, -Math.cos(((k + 0.5) * Math.PI) / 4) * R]);
    polyItem('spire', foot, t.h, { y: top - 0.2, apothem: t.apothem });
  }

  // Central Park: the lake (fall in and you're put back on the road), big trees
  // on the lawns, the bandstand, and stone gates where its drives meet the rings.
  function park() {
    const site = map.sites.find((s) => s.kind === 'park');
    if (!site) return;
    const K = S.park;
    const L = K.lake;
    const level = H(L.c[0] + L.rx + 4, L.c[1]) - 0.7;
    const ring = (sx, sz) => [...Array(28).keys()].map((q) => [L.c[0] + Math.cos((q / 28) * Math.PI * 2) * L.rx * sx, L.c[1] + Math.sin((q / 28) * Math.PI * 2) * L.rz * sz]);
    const water = ring(0.93, 0.9);
    items.push({ t: 'pond', hole: true, solid: false, poly: water, r: G.aabbOf(water), y: level });
    reserve(ring(1.08, 1.12), false, 'lake');
    const [bx, bz, br] = K.bandstand;
    polyItem('bandstand', [...Array(8).keys()].map((q) => [bx + Math.cos(((q + 0.5) * Math.PI) / 4) * br, bz + Math.sin(((q + 0.5) * Math.PI) / 4) * br]), 6, { rad: br });
    // Trees on a grid over the lawns, clear of the drives, the lake and the bandstand.
    const b = G.polyBounds(site.poly);
    let k = 0;
    for (let x = b.minX + K.treePitch / 2; x < b.maxX; x += K.treePitch) {
      for (let z = b.minZ + K.treePitch / 2; z < b.maxZ; z += K.treePitch, k++) {
        // (Every other row shifted half a pitch, so they don't stand in lines.)
        const tx = x + (Math.round((z - b.minZ) / K.treePitch) % 2 ? K.treePitch / 2 : 0);
        if (!G.pointInPoly(tx, z, site.poly) || offRoad(tx, z) < 9) continue;
        if (Math.hypot((tx - L.c[0]) / (L.rx + 10), (z - L.c[1]) / (L.rz + 10)) < 1 || Math.hypot(tx - bx, z - bz) < br + 10) continue;
        const trunk = { x: tx, z, hw: 0.5, hd: 0.5, yaw: 0 };
        if (clear(G.obbCorners(trunk), 0.5, { ignore: 'site' })) obbItem('parkTree', trunk, 14, { cycle: k, s: 1 + (k % 3) * 0.15 });
      }
    }
    // Stone gates: where Park Drive leaves the Inner Ring and meets Grand
    // Boulevard, and at both ends of Lake Drive.
    const gate = (st, s) => {
      const p = G.pointAlong(st.pts, s);
      for (const sd of [-1, 1]) {
        const lat = st.edge + 1.2;
        const o = { x: p.x - p.dz * sd * lat, z: p.z + p.dx * sd * lat, hw: 1, hd: 1, yaw: Math.atan2(p.dx, p.dz) };
        if (clear(G.obbCorners(o), 0.2, { ignore: 'site' })) obbItem('parkGate', o, 5.5, { cycle: 0 });
      }
    };
    const drive = map.streets.find((st) => st.name === 'Park Drive');
    const lake = map.streets.find((st) => st.name === 'Lake Drive');
    const onDrive = (st, name) => G.nearestOnLine(st.pts, map.byName.get(name).x, map.byName.get(name).z).s;
    if (drive) {
      gate(drive, onDrive(drive, 'i-n') + 24);
      gate(drive, onDrive(drive, 'g-n') - 24);
      gate(drive, onDrive(drive, 'gate-n') - 14); // the North Gate
    }
    if (lake) {
      gate(lake, 24);
      gate(lake, lake.len - 24);
    }
    const charter = map.streets.find((st) => st.name === 'Charter Street');
    if (charter) gate(charter, charter.len - 14); // the West Gate
    parkWall(site);
  }

  // The park's wall: round its edge, half a metre in, in stretches of up to
  // 6 m with a stone pillar at each end; open wherever a street or a path
  // runs into the park (its gates stand there).
  function parkWall(site) {
    const poly = site.poly;
    // (Streets running into it: anywhere along them inside it, sampled every 2 m.)
    const inside = (st) => {
      const L = G.lineLength(st.pts);
      for (let t = 0; t <= L; t += 2) {
        const p = G.pointAlong(st.pts, t);
        if (G.pointInPoly(p.x, p.z, poly)) return true;
      }
      return false;
    };
    const into = map.streets.filter(inside);
    const paths = items.filter((it) => it.t === 'footpath' && it.pts?.length > 1);
    const open = (x, z) => into.some((st) => G.nearestOnLine(st.pts, x, z).d < st.edge + 2.6) || map.streets.some((st) => G.nearestOnLine(st.pts, x, z).d < st.half + 1) || paths.some((p) => G.nearestOnLine(p.pts, x, z).d < (p.half || 1.5) + 1);
    poly.forEach((a, k) => {
      const b = poly[(k + 1) % poly.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1) return;
      const [dx, dz] = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      // (In: the side the park is on.)
      const [mx, mz] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const sg = G.pointInPoly(mx - dz * 2, mz + dx * 2, poly) ? 1 : -1;
      const at = (t) => [a[0] + dx * t - dz * sg * 0.5, a[1] + dz * t + dx * sg * 0.5];
      const stretch = (t0, t1) => {
        const n = Math.ceil((t1 - t0) / 6);
        const len = (t1 - t0) / n;
        if (len < 1.5) return;
        for (let q = 0; q < n; q++) {
          const [x, z] = at(t0 + len * (q + 0.5));
          const o = { x, z, hw: 0.3, hd: len / 2, yaw: Math.atan2(dx, dz) };
          // (Its neighbours touch its ends: only what's beside it counts.)
          if (clear(G.obbCorners({ ...o, hd: Math.max(0.2, o.hd - 0.5) }), 0, { ignore: 'site' })) obbItem('parkWall', o, 1.4, { cycle: 0 });
        }
      };
      let from = null;
      for (let t = 0; t <= L; t += 1) {
        if (open(...at(t))) {
          if (from !== null) stretch(from, t - 1);
          from = null;
        } else if (from === null) from = t;
      }
      if (from !== null) stretch(from, L);
    });
  }

  // The triumphal arches over the diagonal avenues, `back` metres in from each
  // gate: a pier either side beyond the sidewalk, the arch over the avenue; and
  // the gate plaza's paving round the avenue's end.
  function arches() {
    const A = S.arch;
    for (const st of map.streets.filter((q) => q.median && !q.loop)) {
      const end = map.nodes.find((n) => n.name?.startsWith('gate-') && G.nearestOnLine(st.pts, n.x, n.z).d < 1);
      if (!end) continue;
      const L = st.len;
      const s = G.nearestOnLine(st.pts, end.x, end.z).s > L / 2 ? L - A.back : A.back;
      const p = G.pointAlong(st.pts, s);
      const span = st.edge + 1;
      for (const sd of [-1, 1]) {
        const o = { x: p.x - p.dz * sd * (span + A.pier / 2), z: p.z + p.dx * sd * (span + A.pier / 2), hw: A.pier / 2, hd: A.depth / 2, yaw: Math.atan2(p.dx, p.dz) };
        obbItem('archPier', o, A.h, { cycle: 0 });
      }
      deco('triumph', { x: p.x, z: p.z, dx: p.dx, dz: p.dz, span, pier: A.pier, depth: A.depth, h: A.h, y: H(p.x, p.z), name: `${st.name.split(' ')[0].toUpperCase()} GATE` });
      // The gate plaza: paving round the avenue's end.
      const e = G.pointAlong(st.pts, s > L / 2 ? L : 0);
      const out = s > L / 2 ? [p.dx, p.dz] : [-p.dx, -p.dz];
      const n = [-out[1], out[0]];
      const w = st.edge + A.pier + 8;
      const back = A.back + 12;
      const c0 = [e.x - out[0] * back, e.z - out[1] * back];
      const c1 = [e.x + out[0] * 6, e.z + out[1] * 6];
      const poly = [[c0[0] + n[0] * w, c0[1] + n[1] * w], [c1[0] + n[0] * w, c1[1] + n[1] * w], [c1[0] - n[0] * w, c1[1] - n[1] * w], [c0[0] - n[0] * w, c0[1] - n[1] * w]];
      deco('gatePlaza', { poly });
      reserve(poly);
    }
  }
}
