// A rooftop district's layout (Chrome Heights): the parapets round every deck
// (a glass balustrade round Tower Plaza, which breaks), the crossings' decks,
// balustrades and kickers, the spiral ramp towers, Kessler HQ's tower and sky
// lobby, the floodlights, and what stands on each deck (plan.roof.props).
// Placed by fixed rules from the district's data; nothing is random. Called
// from planLayout with its helpers.
//
// Items added here: { t: 'kicker', ramp: { ..., abs } } a gap's steel kicker
// (abs: its base height, world), { t: 'pad', deck: true } a raised deck,
// { t: 'patch', surface, poly } lawns and shallow pools, { t: 'brk', id, kind }
// breakable (glass panels, loungers, umbrellas, tables).

import * as G from './geom2d.js';

export function roofLayout(ctx) {
  const { map, P, H, items, obbItem, polyItem, deco, reserve } = ctx;
  const R = P.roof;
  const street = R.street ?? 0;
  const deck = (name) => map.decks.find((d) => d.name === name);
  let brkId = 0;
  const breakable = (kind, o, y, h) => {
    const corners = G.obbCorners(o);
    items.push({ t: 'brk', kind, solid: false, breakable: true, id: brkId++, obb: o, r: G.aabbOf(corners), x: o.x, z: o.z, y, h });
  };
  const patch = (surface, kind, poly, y) => items.push({ t: 'patch', solid: false, surface, kind, poly, r: G.aabbOf(poly), y });
  const on = (d, x, z) => d.hAt(z);

  // Where the crossings leave each deck (their heads), for the parapet openings.
  const heads = [];
  for (const c of map.crossings) {
    const w = c.half + c.walk + 0.6;
    if (c.deckA) heads.push({ deck: c.deckA, p: c.headA, w });
    if (c.deckB) heads.push({ deck: c.deckB, p: c.headB, w });
  }

  parapets();
  for (const c of map.crossings) crossing(c);
  for (const sp of map.spirals) spiralTower(sp);
  hqTower();
  floods();
  for (const [name, list] of Object.entries(R.props || {})) for (const p of list) prop(deck(name), p);
  return;

  // --- Parapets: 1.2 m concrete round every deck, open where a crossing leaves;
  // Tower Plaza's is a low glass balustrade (breakable: push a car through it) ---
  function parapets() {
    for (const d of map.decks) {
      const glass = d.name === 'Tower Plaza';
      const sg = G.polyArea(d.poly) > 0 ? 1 : -1;
      const piece = Array.isArray(d.h) ? 10 : 20;
      d.poly.forEach((a, k) => {
        const b = d.poly[(k + 1) % d.poly.length];
        const L = G.len2(a, b);
        const dir = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
        const inl = [-dir[1] * sg, dir[0] * sg];
        const cuts = heads.filter((h) => h.deck === d && G.segDist(h.p[0], h.p[1], a, b).d < 3).map((h) => {
          const t = G.segDist(h.p[0], h.p[1], a, b).t * L;
          return [t - h.w, t + h.w];
        }).sort((p, q) => p[0] - q[0]);
        const runs = [];
        let t0 = 0;
        for (const [c0, c1] of [...cuts, [L, L]]) {
          if (c0 - t0 > 0.5) runs.push([t0, c0]);
          t0 = Math.max(t0, c1);
        }
        for (const [r0, r1] of runs) {
          const step = glass ? 2.4 : piece;
          for (let t = r0; t < r1 - 0.3; t += step) {
            const len = Math.min(step, r1 - t);
            const tm = t + len / 2;
            const x = a[0] + dir[0] * tm + inl[0] * 0.3;
            const z = a[1] + dir[1] * tm + inl[1] * 0.3;
            const o = { x, z, hw: glass ? 0.06 : 0.25, hd: len / 2, yaw: Math.atan2(dir[0], dir[1]) };
            const y = d.hAt(z) - 0.05;
            if (glass) breakable('glass', { ...o, hd: len / 2 - 0.05 }, y, 1.1);
            else obbItem('parapet', o, 1.25, { y, inland: inl, cycle: 0 });
          }
        }
      });
    }
  }

  // Balustrade pieces along both sides of a stretch of road (its heights from h(s)).
  function balustrades(pts, lat, h, keep = () => true) {
    const L = G.lineLength(pts);
    for (let t = 0; t < L - 0.2; t += 6) {
      const len = Math.min(6, L - t);
      const p = G.pointAlong(pts, t + len / 2);
      for (const sd of [-1, 1]) {
        const x = p.x - p.dz * sd * lat;
        const z = p.z + p.dx * sd * lat;
        if (!keep(x, z)) continue;
        obbItem('balustrade', { x, z, hw: 0.08, hd: len / 2, yaw: Math.atan2(p.dx, p.dz) }, 1.1, { y: h(t + len / 2) - 0.05, cycle: 0 });
      }
    }
  }

  // --- A crossing: its deck and glass balustrades; a gap's cantilevers and kickers ---
  function crossing(c) {
    const lat = c.half + c.walk - 0.1;
    const h = (s) => c.hA + ((c.hB - c.hA) * Math.min(c.len, Math.max(0, s))) / (c.len || 1);
    if (c.kind === 'bridge' || c.kind === 'ramp' || c.kind === 'exit') {
      deco('bridge', { pts: c.pts, half: c.half + c.walk, h0: c.hA, h1: c.hB, kind: c.kind, street: c.st.name });
      balustrades(c.pts, lat, h);
    } else if (c.kind === 'gap') {
      const k = c.cant;
      if (k > 0.5) {
        const a = G.subLine(c.pts, 0, k);
        const b = G.subLine(c.pts, c.len - k, c.len);
        deco('cantilever', { pts: a, half: c.half + c.walk, h: c.hA });
        deco('cantilever', { pts: b, half: c.half + c.walk, h: c.hB });
        balustrades(a, lat, () => c.hA);
        balustrades(b, lat, () => c.hB);
      }
      // The steel kickers, rising to each lip.
      const K = c.K;
      const e = c.e;
      for (const [sLip, sgn, y] of [[c.sa + k, 1, c.hA], [c.sb - k, -1, c.hB]]) {
        const lip = G.pointAlong(e.pts, sLip);
        const d = [lip.dx * sgn, lip.dz * sgn];
        const x0 = lip.x - d[0] * K.len;
        const z0 = lip.z - d[1] * K.len;
        items.push({ t: 'kicker', solid: false, ramp: { x: x0, z: z0, dirX: d[0], dirZ: d[1], len: K.len, width: c.half * 2, height: K.rise, abs: y }, y, lip: [lip.x, lip.z], crossing: c.st.name });
      }
      deco('gapJump', { pts: c.pts, half: c.half, hA: c.hA, hB: c.hB, lipA: [c.lipA.x, c.lipA.z], lipB: [c.lipB.x, c.lipB.z], oneWay: c.oneWay, street: c.st.name });
    } else if (c.kind === 'spiral') {
      const hx = c.st.helix;
      const ring = hx.r + hx.half + c.walk + 1;
      const outside = (x, z) => Math.hypot(x - hx.cx, z - hx.cz) > ring;
      const a = hx.s0 - c.sa;
      const b = hx.s1 - c.sa;
      if (a > 0.5) {
        const pts = G.subLine(c.pts, 0, a);
        deco('bridge', { pts, half: c.half + c.walk, h0: hx.yTop, h1: hx.yTop, kind: 'approach' });
        balustrades(pts, lat, () => hx.yTop, outside);
      }
      if (c.len - b > 0.5) {
        const pts = G.subLine(c.pts, b, c.len);
        deco('bridge', { pts, half: c.half + c.walk, h0: hx.yBot, h1: hx.yBot, kind: 'approach' });
        balustrades(pts, lat, () => hx.yBot, outside);
      }
    }
  }

  // --- A spiral ramp tower: the helix, its solid core, a parapet round every
  // level (open where the approaches join) and the frame round it ---
  function spiralTower(sp) {
    const walk = R.walk ?? 1;
    const total = sp.turns * Math.PI * 2;
    const inner = sp.r - sp.half - walk;
    const outer = sp.r + sp.half + walk;
    const core = [...Array(12).keys()].map((k) => [sp.cx + Math.cos((k / 12) * Math.PI * 2) * (inner - 0.4), sp.cz + Math.sin((k / 12) * Math.PI * 2) * (inner - 0.4)]);
    polyItem('spiralCore', core, sp.yTop + 4 - street, { y: street, cycle: 0 });
    // Where the straight approaches cross the outer edge, from the tangent point.
    const open = Math.atan(Math.sqrt(outer * outer - sp.r * sp.r) / sp.r) + 0.05;
    const dth = 0.18;
    for (let th = 0; th < total; th += dth) {
      const tm = th + dth / 2;
      if (tm < open || tm > total - open) continue;
      const a = sp.a0 + sp.dir * tm;
      const y = sp.yTop + ((sp.yBot - sp.yTop) * tm) / total;
      const x = sp.cx + Math.cos(a) * (outer - 0.2);
      const z = sp.cz + Math.sin(a) * (outer - 0.2);
      obbItem('spiralWall', { x, z, hw: 0.2, hd: (outer * dth) / 2 + 0.1, yaw: Math.atan2(-Math.sin(a), Math.cos(a)) }, 1.2, { y: y - 0.1, cycle: 0 });
    }
    deco('helix', { ...sp, inner, outer, street });
  }

  // --- Kessler HQ: the glass tower rising from the middle of its deck, its
  // floor at deck level open through (the sky lobby) along the Crown Line ---
  function hqTower() {
    const s = map.sites.find((q) => q.kind === 'tower');
    if (!s) return;
    const [w, dd] = s.size;
    const [cx, cz] = s.at;
    const y0 = map.heightAt(cx, cz);
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const z0 = cz - dd / 2;
    const z1 = cz + dd / 2;
    const openHalf = 15;
    const wall = (x, z, hw, hd) => obbItem('lobbyWall', { x, z, hw, hd, yaw: 0 }, s.lobby, { y: y0 - 0.05, cycle: 0 });
    wall(cx, z0 + 0.3, w / 2, 0.3);
    wall(cx, z1 - 0.3, w / 2, 0.3);
    for (const x of [x0 + 0.3, x1 - 0.3]) {
      wall(x, (z0 + (cz - openHalf)) / 2, 0.3, (cz - openHalf - z0) / 2);
      wall(x, (z1 + (cz + openHalf)) / 2, 0.3, (z1 - (cz + openHalf)) / 2);
    }
    polyItem('hqTower', s.poly, s.h - y0 - s.lobby, { y: y0 + s.lobby, cycle: 0 });
    // Show cars on plinths either side of the road.
    [[-20, -17], [20, -17], [-20, 17], [20, 17]].forEach(([dx, dz], k) => obbItem('plinth', { x: cx + dx, z: cz + dz, hw: 3.4, hd: 1.8, yaw: 0 }, 1.9, { y: y0 - 0.05, cycle: k }));
    deco('lobby', { x: cx, z: cz, w, d: dd, y: y0, ceiling: s.lobby, openHalf, h: s.h });
    reserve(s.poly);
  }

  // --- Floodlight masts round the decks; lamp masts down the Straight ---
  function floods() {
    for (const [x, z] of R.floods || []) {
      const d = map.deckAt(x, z);
      if (!d) continue;
      obbItem('flood', { x, z, hw: 0.3, hd: 0.3, yaw: 0 }, 14, { y: d.hAt(z) - 0.05, cycle: 0 });
    }
    const st = deck('Skyline Straight');
    if (!st) return;
    const gantries = (R.props?.['Skyline Straight'] || []).filter((p) => p.t === 'gantry').map((p) => p.z);
    for (let z = st.box.minZ + 12; z < st.box.maxZ - 6; z += 40) {
      if (gantries.some((g) => Math.abs(g - z) < 8)) continue;
      for (const x of [st.box.minX + 5, st.box.maxX - 5]) obbItem('lampMast', { x, z, hw: 0.3, hd: 0.3, yaw: 0 }, 12, { y: st.hAt(z) - 0.05, toward: [x < 540 ? 1 : -1, 0], cycle: 0 });
    }
  }

  // --- What stands on a deck ---
  function prop(d, p) {
    if (!d) return;
    const y = (x, z) => d.hAt(z) - 0.05;
    const o = { x: p.x, z: p.z, hw: p.hw, hd: p.hd, yaw: p.yaw || 0 };
    switch (p.t) {
      case 'lawn': return patch(2, 'lawn', p.poly, d.hAt(p.poly[0][1]));
      case 'pool':
      case 'reflect': return patch(3, p.t, p.poly, d.hAt(p.poly[0][1]));
      case 'court': return deco('court', { ...p, y: d.hAt(p.z) });
      case 'runTrack': return deco('runTrack', { ...p, y: d.hAt(p.z) });
      case 'lounger':
      case 'umbrella':
      case 'table': return breakable(p.t, o, y(p.x, p.z), p.h);
      case 'dome':
      case 'bandstand': {
        const n = p.t === 'dome' ? 16 : 8;
        const poly = [...Array(n).keys()].map((k) => [p.x + Math.cos((k / n) * Math.PI * 2) * p.hw, p.z + Math.sin((k / n) * Math.PI * 2) * p.hw]);
        return polyItem(p.t, poly, p.h, { y: y(p.x, p.z), cycle: 0 });
      }
      case 'pad': {
        // A raised pad, and its ramp up (from the east).
        const top = d.hAt(p.z) + p.h;
        items.push({ t: 'pad', solid: false, deck: true, obb: o, r: G.aabbOf(G.obbCorners(o)), x: p.x, z: p.z, y: d.hAt(p.z), h: top });
        const r = p.ramp;
        items.push({ t: 'padRamp', solid: false, ramp: { x: p.x + p.hw + r.len, z: p.z, dirX: -1, dirZ: 0, len: r.len, width: r.width, height: p.h, abs: d.hAt(p.z) }, y: d.hAt(p.z) });
        return;
      }
      case 'crane': {
        obbItem('craneMast', o, p.h, { y: y(p.x, p.z), cycle: 0 });
        return deco('craneJib', { x: p.x, z: p.z, y: d.hAt(p.z) + p.h, jib: p.jib, counter: p.counter });
      }
      case 'storey': {
        const top = d.hAt((p.z0 + p.z1) / 2) + p.h;
        for (let x = p.x0; x <= p.x1 + 0.01; x += p.pitch) {
          for (let z = p.z0; z <= p.z1 + 0.01; z += p.pitch) {
            const crane = (R.props['Kessler Tower Site'] || []).find((q) => q.t === 'crane');
            if (crane && Math.abs(crane.x - x) < 4 && Math.abs(crane.z - z) < 4) continue;
            obbItem('column', { x, z, hw: 0.5, hd: 0.5, yaw: 0 }, p.h, { y: y(x, z), cycle: 0 });
          }
        }
        return polyItem('slab', [[p.x0 - 1, p.z0 - 1], [p.x1 + 1, p.z0 - 1], [p.x1 + 1, p.z1 + 1], [p.x0 - 1, p.z1 + 1]], 0.5, { y: top, cycle: 0 });
      }
      case 'gantry': {
        for (const s of [-1, 1]) obbItem('gantryLeg', { x: p.x + s * p.hw, z: p.z, hw: 0.4, hd: 0.4, yaw: 0 }, p.h, { y: y(p.x, p.z), cycle: 0 });
        return deco('timingGantry', { x: p.x, z: p.z, hw: p.hw, h: p.h, label: p.label, y: d.hAt(p.z) });
      }
      case 'billboard': {
        for (const s of [-1, 1]) obbItem('billboardLeg', { x: p.x + s * (p.hw - 1), z: p.z, hw: 0.3, hd: 0.3, yaw: 0 }, p.h, { y: y(p.x, p.z), cycle: 0 });
        return deco('billboard', { ...p, y: d.hAt(p.z), k: Math.round(p.x) % 3 });
      }
      case 'pergola': {
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) obbItem('pergolaPost', { x: p.x + sx * (p.hw - 0.3), z: p.z + sz * (p.hd - 0.3), hw: 0.2, hd: 0.2, yaw: 0 }, p.h, { y: y(p.x, p.z), cycle: 0 });
        return deco('pergola', { ...p, y: d.hAt(p.z) });
      }
      case 'car': return obbItem('car', o, 1.5, { y: y(p.x, p.z), color: p.color, parked: true });
      default: return obbItem(p.t, o, p.h, { y: y(p.x, p.z), cycle: 0, tree: !!p.tree });
    }
  }
}
