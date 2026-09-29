// A suburb's layout (Maple Hollow): house plots along every street, and its
// sites and set pieces, placed by fixed rules from the district's data
// (plan.suburb). Nothing is random. Called from planLayout with its helpers.
//
// A plot, from the street: the verge (a maple tree on it), the front lawn
// (drivable, less grip: a race's run-off) with a picket fence, mailbox and
// bins (breakable), then the property line (a hedge or garden wall, solid,
// with a gate across the driveway), the porch, the house and its garage, and
// the backyard (a pool you can fall into, a trampoline or garden furniture,
// breakable fences round it).
//
// Items added here beyond planLayout's:
//   { t: 'brk', kind, id, obb, y, h } a breakable prop (fence panel, mailbox,
//     bin, chair, table, trampoline, flag), knocked flat when hit;
//   { t: 'pool' | 'pond' | 'hazard', hole: true, poly, y } water you fall into
//     (y: its surface);
//   { t: 'patch', surface, kind, poly } ground: grass, sand, dirt, paving;
//   { t: 'sprinkler', id, x, z } a lawn sprinkler.

import * as G from './geom2d.js';

const HOUSES = { widths: [20, 22, 18, 21, 19, 23, 20], depth: 35 };
const RIVERSIDE = { widths: [30, 34, 28, 32], depth: 44 };
const HEIGHTS = [8.5, 9.5, 8, 10, 9];
export const PATCH = { grass: 2, dirt: 2, sand: 3, paved: 0 };

export function suburbLayout(ctx) {
  const { map, P, H, items, obbItem, deco, clear, reserve, inLot } = ctx;
  const S = P.suburb;
  const lawn = P.lawn;
  const site = (kind) => map.sites.find((s) => s.kind === kind);
  let brkId = 0;
  let sprinklerId = 0;

  // A breakable prop: it may stand in a way kept clear (a cut-through).
  const breakable = (kind, o, h) => {
    const corners = G.obbCorners(o);
    if (!clear(corners, 0.05, { breakable: true, ignore: 'site' })) return null;
    const it = { t: 'brk', kind, solid: false, breakable: true, id: brkId++, obb: o, r: G.aabbOf(corners), x: o.x, z: o.z, y: Math.min(...corners.map(([x, z]) => H(x, z))) - 0.1, h };
    items.push(it);
    return it;
  };
  // A solid thing, if it's clear (a site's things stand in their site).
  const solid = (t, o, h, extra = {}, opts = { ignore: 'site' }) => (clear(G.obbCorners(o), 0.3, opts) ? obbItem(t, o, h, extra) : null);
  const water = (t, poly, level, extra = {}) => items.push({ t, hole: true, solid: false, poly, r: G.aabbOf(poly), y: level, ...extra });
  const patch = (kind, poly, extra = {}) => items.push({ t: 'patch', solid: false, surface: PATCH[kind], kind, poly, r: G.aabbOf(poly), ...extra });
  const tree = (x, z, s = 1, kind = 'maple', opts) => solid('tree', { x, z, hw: 0.35 * s, hd: 0.35 * s, yaw: 0 }, 9 * s, { kind, s, cycle: Math.abs(Math.round(x * 7 + z * 13)) % 5 }, opts);
  // Strips of width w along a polyline (one quad a segment).
  const strip = (pts, w) => pts.slice(1).map((b, k) => {
    const a = pts[k];
    const L = G.len2(a, b) || 1;
    const n = [(-(b[1] - a[1]) / L) * (w / 2), ((b[0] - a[0]) / L) * (w / 2)];
    return [[a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]], [b[0] - n[0], b[1] - n[1]], [a[0] - n[0], a[1] - n[1]]];
  });
  // A point on a polyline: s metres along, lat to its right.
  const onLine = (pts, s, lat) => {
    const p = G.pointAlong(pts, s);
    return { x: p.x - p.dz * lat, z: p.z + p.dx * lat, dx: p.dx, dz: p.dz };
  };

  // The ways that must stay open (breakable props may stand in them): the
  // backyard cut-throughs, the golf shortcut, the school car park's.
  const ways = map.corridors.filter((c) => c.kind === 'backyards' || c.kind === 'golf' || c.kind === 'school');
  for (const c of ways) {
    const w = 2 * (c.halfWidth ?? 4) + (c.kind === 'backyards' ? 2 * S.backyards.yard + 2 : 4);
    for (const q of strip(c.points, w)) reserve(q, true, c.kind === 'backyards' ? 'yard' : 'way');
  }

  waterTower();
  golf();
  phase2();
  park();
  school();
  practiceFields();
  plaza();
  islands();
  dirtJumps();
  houses();
  backyards();
  mapleTrees();
  woods();
  riverbank();
  return;

  // --- Water Tower Hill: four solid legs; the tank (MAPLE HOLLOW, a red beacon) ---
  function waterTower() {
    const w = S.tower;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) obbItem('towerLeg', { x: w.x + sx * w.leg, z: w.z + sz * w.leg, hw: 0.6, hd: 0.6, yaw: 0 }, w.tank, { cycle: 0 });
    reserve(G.obbCorners({ x: w.x, z: w.z, hw: w.leg + 6, hd: w.leg + 6, yaw: 0 }));
    deco('waterTower', { ...w, y: H(w.x, w.z) });
  }

  // --- Hollow Hills Golf: nine fairways and greens, bunkers (sand), the water
  // hazard, flags (breakable), the clubhouse off Water Tower Circle with its
  // car park, and golf carts parked in a row ---
  function golf() {
    const g = S.golf;
    patch('grass', site('golf').poly, { golf: true });
    for (const h of g.holes) {
      deco('fairway', { poly: G.obbCorners(h.fairway), tee: h.tee, green: h.green });
      breakable('flag', { x: h.green[0], z: h.green[1], hw: 0.08, hd: 0.08, yaw: 0 }, 2.4);
    }
    for (const b of g.bunkers) patch('sand', b, { bunker: true });
    water('hazard', g.hazard, H(...G.polyCentroid(g.hazard)) - 0.3, { golf: true });
    obbItem('bldg', g.clubhouse, g.clubhouse.h, { kind: 'clubhouse', name: 'HOLLOW HILLS', front: g.clubhouse.front, cycle: 0 });
    g.carts.forEach((c, k) => solid('cart', c, 1.8, { color: k % 3 }));
    carRows(g.parking, 'golf');
  }

  // --- Phase 2: timber frames (solid), dirt mounds (jumps), a bulldozer and a
  // digger, lumber and pipe stacks, portable toilets. The ground is dirt. ---
  function phase2() {
    const p = S.phase2;
    patch('dirt', site('construction').poly, { phase2: true });
    const F = p.frames;
    const road = map.streets.find((q) => q.name === F.along);
    let k = 0;
    for (const s of F.at) {
      for (const sd of [-1, 1]) {
        const q = onLine(road.pts, s, sd * F.off);
        solid('frame', { x: q.x, z: q.z, hw: F.hw, hd: F.hd, yaw: Math.atan2(-q.dz * sd, q.dx * sd) }, 7, { cycle: k++ });
      }
    }
    for (const o of F.extra) solid('frame', o, 7, { cycle: k++ });
    for (const m of p.mounds) mound(m, 'mound');
    for (const [t, list, h] of [['dozer', p.dozers, 3.2], ['digger', p.diggers, 3.6], ['lumber', p.lumber, 1.6], ['pipes', p.pipes, 1.4], ['toilet', p.toilets, 2.4]]) {
      list.forEach((o, n) => solid(t, o, h, { cycle: n }));
    }
  }

  // A mound: up one side and down the other (two ramps back to back).
  function mound(m, t) {
    const dx = Math.sin(m.yaw);
    const dz = Math.cos(m.yaw);
    const y = H(m.x, m.z);
    for (const dir of [1, -1]) {
      items.push({ t, solid: false, ramp: { x: m.x - dx * dir * m.len, z: m.z - dz * dir * m.len, dirX: dx * dir, dirZ: dz * dir, len: m.len, width: m.width, height: m.h }, y, mound: m, half: dir > 0 });
    }
  }

  // The dirt road's jumps (Foundation Road): mounds across it.
  function dirtJumps() {
    for (const st of map.streets) {
      for (const j of st.jumpAt || []) mound({ x: j.x, z: j.z, yaw: Math.atan2(j.dx, j.dz), len: 6, width: st.width, h: 1.2 }, 'jump');
    }
  }

  // --- Hollow Pond and Hollow Park: the pond (fall in and respawn) either side
  // of the causeway and its railings, a gazebo, a playground, footpaths, benches ---
  function park() {
    const s = site('park');
    const pk = S.park;
    patch('grass', s.poly, { park: true });
    const cw = pk.causeway;
    water('pond', G.clipHalf(s.pond, [-1, 0], cw.embank - cw.x), pk.water);
    water('pond', G.clipHalf(s.pond, [1, 0], cw.embank + cw.x), pk.water);
    deco('pondWater', { poly: s.pond, level: pk.water, causeway: cw });
    for (const sd of [-1, 1]) obbItem('railing', { x: cw.x + sd * cw.half, z: (cw.z0 + cw.z1) / 2, hw: 0.15, hd: (cw.z1 - cw.z0) / 2, yaw: 0 }, 1.1, { y: cw.y, cycle: 0 });
    obbItem('gazebo', pk.gazebo, 5, { cycle: 0 });
    pk.play.forEach((o, k) => solid('play', o, o.h, { cycle: k, kind: o.kind }));
    pk.benches.forEach((o, k) => solid('bench', o, 0.9, { cycle: k }));
    for (const [x, z] of pk.trees) tree(x, z, 1.3);
    // The footpath round the pond (not across the avenue).
    const edge = map.streets.find((q) => q.name === S.avenue).edge + 2;
    let run = [];
    for (const p of [...pk.path, pk.path[0]]) {
      if (Math.abs(p[0] - cw.x) > edge) run.push(p);
      else {
        if (run.length > 1) deco('footpath', { pts: run, width: 2.5 });
        run = [];
      }
    }
    if (run.length > 1) deco('footpath', { pts: run, width: 2.5 });
  }

  // --- Hollow High: the school building and gym, the car park (the boss
  // race's shortcut runs between its parked cars), the gates on School Lane ---
  function school() {
    const s = S.school;
    obbItem('bldg', s.building, s.building.h, { kind: 'school', name: 'HOLLOW HIGH', front: s.building.front, cycle: 0 });
    obbItem('bldg', s.gym, s.gym.h, { kind: 'gym', front: s.gym.front, cycle: 1 });
    carRows(s.parking, 'school');
    for (const [x, z] of s.masts) solid('mast', { x, z, hw: 0.4, hd: 0.4, yaw: 0 }, 12, { cycle: 0 });
    for (const g of s.gates) deco('schoolGate', { ...g, y: H(g.x, g.z) });
    solid('schoolSign', s.sign, 2.4, { cycle: 0 });
  }

  // --- The practice fields: a baseball diamond and its backstop, tennis courts ---
  function practiceFields() {
    const f = S.fields;
    patch('grass', site('fields').poly, { fields: true });
    deco('diamond', { ...f.diamond, y: H(f.diamond.x, f.diamond.z) });
    for (const b of f.backstop) obbItem('fence', b, 4, { cycle: 0, tall: true });
    for (const c of f.courts) {
      patch('paved', G.obbCorners({ ...c, hw: c.hw + 3, hd: c.hd + 5 }), { court: true });
      deco('court', { ...c, y: H(c.x, c.z) });
      for (const fe of courtFence(c)) obbItem('fence', fe, 3, { cycle: 0, tall: true });
      obbItem('net', { x: c.x, z: c.z, hw: c.hw + 0.5, hd: 0.05, yaw: c.yaw }, 1, { cycle: 0 });
    }
  }

  // A tennis court's fence: round its edge, a gap for the gate on one side.
  function courtFence(c) {
    const out = [];
    const W = c.hw + 3;
    const D = c.hd + 5;
    const side = (ox, oz, len, alongX) => out.push({ x: c.x + ox, z: c.z + oz, hw: alongX ? len / 2 : 0.08, hd: alongX ? 0.08 : len / 2, yaw: 0 });
    side(-W, 0, 2 * D, false);
    side(W, -4, 2 * D - 8, false);
    side(0, -D, 2 * W, true);
    side(0, D, 2 * W, true);
    return out;
  }

  // --- Hollow Plaza: the strip mall (supermarket, laundromat, pizza, video
  // store, Hollow Hardware & Auto), its car park facing Maple Avenue ---
  function plaza() {
    const p = S.plaza;
    for (const shop of p.shops) obbItem('bldg', shop, shop.h, { kind: shop.kind, name: shop.name, front: shop.front, cycle: 0 });
    carRows(p.parking, 'plaza');
    for (const [x, z] of p.masts) solid('mast', { x, z, hw: 0.4, hd: 0.4, yaw: 0 }, 12, { cycle: 0 });
    obbItem('pylon', p.pylon, p.pylon.h, { name: 'HOLLOW PLAZA', cycle: 0 });
    for (const [x, z] of p.trees) tree(x, z, 1);
  }

  // --- Turning-circle islands (a tree on each) and the Linden green ---
  function islands() {
    for (const b of map.blocks) {
      if (b.kind === 'island') {
        patch('grass', b.lot, { island: true });
        tree(b.ring.c[0], b.ring.c[1], 1.3);
      } else if (b.kind === 'green') {
        patch('grass', b.lot, { green: true });
        for (const [dx, dz, s] of S.green.trees) tree(b.ring.c[0] + dx, b.ring.c[1] + dz, s);
        for (const o of S.green.benches) solid('bench', { ...o, x: b.ring.c[0] + o.x, z: b.ring.c[1] + o.z }, 0.9, { cycle: 0 });
      }
    }
  }

  // Parked cars in rows: { r: [x0, x1, z0, z1], double } (side by side along the
  // longer side, nose to tail across it), and the paving under them.
  function carRows(list, where) {
    let n = 0;
    const box = [Infinity, -Infinity, Infinity, -Infinity];
    for (const row of list) {
      const [x0, x1, z0, z1] = row.r;
      box[0] = Math.min(box[0], x0);
      box[1] = Math.max(box[1], x1);
      box[2] = Math.min(box[2], z0);
      box[3] = Math.max(box[3], z1);
      const alongX = x1 - x0 > z1 - z0;
      const [a0, a1] = alongX ? [x0, x1] : [z0, z1];
      const lines = row.double ? (alongX ? [z0 + 2.4, z1 - 2.4] : [x0 + 2.4, x1 - 2.4]) : [alongX ? (z0 + z1) / 2 : (x0 + x1) / 2];
      lines.forEach((line, li) => {
        for (let t = a0 + 1.3, q = 0; t <= a1 - 1.3; t += 2.6, q++) {
          if ((q + li * 3 + n) % 7 === 5) continue; // an empty bay now and then
          const [x, z] = alongX ? [t, line] : [line, t];
          const yaw = (alongX ? 0 : Math.PI / 2) + (li ? Math.PI : 0);
          solid('car', { x, z, hw: 1.0, hd: 2.3, yaw }, 1.5, { color: (q + n) % 7, parked: where });
        }
      });
      n++;
    }
    patch('paved', [[box[0] - 6, box[2] - 7], [box[1] + 6, box[2] - 7], [box[1] + 6, box[3] + 7], [box[0] - 6, box[3] + 7]], { carPark: where });
  }

  // --- Houses along every street frontage of the house blocks ---
  function houses() {
    const order = (fr) => (fr.street.width >= 20 ? 0 : fr.street.ring ? 2 : 1);
    for (const b of map.blocks) {
      if (b.kind !== 'houses') continue;
      let k = b.id * 5;
      const fronts = b.frontages.filter((fr) => fr.street && fr.street.surface !== 'dirt').sort((p, q) => order(p) - order(q) || q.len - p.len);
      for (const fr of fronts) k = plots(b, fr, k);
    }
  }

  function riverside(x, z) {
    return S.riverside.some(([x0, x1, z0, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
  }

  // Plots walking along one frontage (u along it, v in from the lot line).
  // Returns the next cycle index.
  function plots(b, fr, k) {
    const pts = fr.pts;
    const L = fr.len;
    const sg = G.polyArea(b.lot) > 0 ? 1 : -1;
    for (let s = 2, guard = 0; s < L - 12 && guard < 500; guard++) {
      const a0 = G.pointAlong(pts, s);
      const big = riverside(a0.x, a0.z);
      const R = big ? RIVERSIDE : HOUSES;
      const w = Math.min(R.widths[k % R.widths.length], L - 2 - s);
      if (w < 14) break;
      const e = G.pointAlong(pts, s + w);
      const cl = Math.hypot(e.x - a0.x, e.z - a0.z);
      const d = [(e.x - a0.x) / cl, (e.z - a0.z) / cl];
      const n = [-d[1] * sg, d[0] * sg]; // into the block
      // On a curve the plot's front stands where the lot line is furthest in.
      const m = G.pointAlong(pts, s + w / 2);
      const bow = (m.x - (a0.x + e.x) / 2) * n[0] + (m.z - (a0.z + e.z) / 2) * n[1];
      const front = Math.max(0, bow) + 0.3;
      const mid = [(a0.x + e.x) / 2 + n[0] * front, (a0.z + e.z) / 2 + n[1] * front];
      let depth = 0;
      for (const dd of [R.depth, R.depth * 0.8, lawn + 20]) {
        const o = { x: mid[0] + (n[0] * dd) / 2, z: mid[1] + (n[1] * dd) / 2, hw: cl / 2, hd: dd / 2, yaw: Math.atan2(n[0], n[1]) };
        const corners = G.obbCorners(o);
        if (corners.every(([x, z]) => G.pointInPoly(x, z, b.lot)) && clear(corners, 0.4)) {
          depth = dd;
          break;
        }
      }
      if (!depth) {
        s += 4;
        continue;
      }
      plot(mid, d, n, cl, depth, k, big);
      s += w + 1;
      k++;
    }
    return k;
  }

  // One plot: u runs along the street (-w/2 to w/2), v in from the lot line.
  function plot(mid, d, n, w, depth, k, big) {
    const at = (u, v) => [mid[0] + d[0] * u + n[0] * v, mid[1] + d[1] * u + n[1] * v];
    const yaw = Math.atan2(n[0], n[1]);
    const boxAt = (u0, u1, v0, v1) => {
      const [x, z] = at((u0 + u1) / 2, (v0 + v1) / 2);
      return { x, z, hw: (u1 - u0) / 2, hd: (v1 - v0) / 2, yaw };
    };
    const front = [-n[0], -n[1]];
    const drive = [w / 2 - 6.5, w / 2 - 1]; // the driveway, on the plot's right
    const houseW = big ? w - 12 : w - 9;
    const houseD = big ? 15 : 11;
    const v0 = lawn + (big ? 5 : 4); // the house's front
    const lineKind = k % 3 === 1 ? 'wall' : 'hedge';
    const lineH = lineKind === 'hedge' ? 1.4 : 1;
    const lineD = lineKind === 'hedge' ? 1 : 0.4;
    // The property line, the gate across the driveway.
    obbItem(lineKind, boxAt(-w / 2 + 0.2, drive[0], lawn, lawn + lineD), lineH, { cycle: k, front });
    obbItem(lineKind, boxAt(drive[1], w / 2 - 0.2, lawn, lawn + lineD), lineH, { cycle: k, front });
    obbItem('gate', boxAt(drive[0], drive[1], lawn + 0.1, lawn + 0.3), 1.2, { cycle: k, front });
    // The house, its porch and the garage.
    const hx0 = -w / 2 + 1.5;
    obbItem('bldg', boxAt(hx0, hx0 + houseW, v0, v0 + houseD), HEIGHTS[k % HEIGHTS.length] + (big ? 1.5 : 0), { kind: big ? 'bighouse' : 'house', front, cycle: k });
    obbItem('porch', boxAt(hx0 + houseW / 2 - 3, hx0 + houseW / 2 + 3, v0 - 2.4, v0), 0.5, { cycle: k, front });
    obbItem('garage', boxAt(drive[0] + 0.3, drive[1], v0 + 1, v0 + 8), 3.4, { cycle: k, front });
    if (k % 4 === 0) obbItem('hoop', boxAt(drive[1] - 0.25, drive[1], v0 - 1.5, v0 - 1.25), 3.2, { cycle: k, front });
    deco('driveway', { poly: G.obbCorners(boxAt(drive[0], drive[1], -2, v0 + 1)) });
    // A minivan on the driveway now and then; the mailbox, bins and picket fence.
    if (k % 3 === 0) obbItem('car', boxAt(drive[0] + 0.4, drive[1] - 0.4, 1.4, 6), 1.8, { color: k % 7, minivan: true });
    breakable('mailbox', boxAt(drive[0] - 1.3, drive[0] - 0.9, 0.5, 0.9), 1.2);
    if (k % 2 === 0) {
      breakable('bin', boxAt(drive[0] - 3.2, drive[0] - 2.5, 1.6, 2.3), 1.1);
      breakable('bin', boxAt(drive[0] - 2.4, drive[0] - 1.7, 1.6, 2.3), 1.1);
    }
    if (k % 3 !== 2) {
      for (let u = -w / 2 + 0.3; u < drive[0] - 2.5; u += 2.4) breakable('fence', boxAt(u, Math.min(u + 2.3, drive[0] - 2), 0.3, 0.45), 1);
    }
    // The verge tree, and the lawn's sprinkler.
    const [tx, tz] = at(-w / 4, -1);
    tree(tx, tz, 1, 'maple', {});
    const [sx, sz] = at(-w / 4, lawn / 2);
    items.push({ t: 'sprinkler', solid: false, id: sprinklerId++, x: sx, z: sz });
    // The backyard: a pool, or a trampoline; garden furniture; fences round it.
    const back = v0 + houseD + 1;
    if (depth - back > 10) {
      if (k % 3 !== 1) {
        const pool = G.obbCorners(boxAt(-w / 2 + 3, -w / 2 + 3 + Math.min(9, w - 10), back + 2, back + 6.5));
        if (clear(pool, 0.3)) water('pool', pool, H(...at(0, back + 4)) - 0.3);
      } else breakable('trampoline', boxAt(-w / 2 + 4, -w / 2 + 8, back + 2, back + 6), 1);
      breakable('table', boxAt(w / 2 - 6, w / 2 - 4.6, back + 2, back + 3.4), 0.8);
      breakable('chair', boxAt(w / 2 - 6.8, w / 2 - 6.2, back + 2.3, back + 2.9), 0.9);
    }
    for (let v = back; v < depth - 0.8; v += 2.4) breakable('fence', boxAt(-w / 2, -w / 2 + 0.15, v, Math.min(v + 2.3, depth - 0.5)), 1.6);
    for (let u = -w / 2; u < w / 2 - 0.5; u += 2.4) breakable('fence', boxAt(u, Math.min(u + 2.3, w / 2), depth - 0.45, depth - 0.3), 1.6);
    // The plot is taken.
    reserve(G.obbCorners(boxAt(-w / 2, w / 2, 0, depth)));
  }

  // --- The cut-throughs: backyards the way runs through, fenced from each
  // other across it (breakable), with fences down their sides, a pool beside
  // the way, a shed, a trampoline or garden furniture ---
  function backyards() {
    const B = S.backyards;
    for (const c of map.corridors.filter((q) => q.kind === 'backyards')) {
      const cuts = B[c.name];
      const L = G.lineLength(c.points);
      const half = c.halfWidth ?? 4;
      const side = half + B.yard;
      const panel = (x, z, yaw) => breakable('fence', { x, z, hw: 1.15, hd: 0.08, yaw }, 1.6);
      // Across the way, between the yards.
      for (const f of cuts) {
        const p = G.pointAlong(c.points, f * L);
        for (let u = -side; u < side - 0.5; u += 2.4) {
          const q = onLine(c.points, f * L, u + 1.15);
          panel(q.x, q.z, Math.atan2(p.dx, p.dz));
        }
      }
      // Down both sides of the yards.
      for (const sd of [-1, 1]) {
        for (let t = cuts[0] * L; t < cuts[cuts.length - 1] * L - 1; t += 2.4) {
          const q = onLine(c.points, t + 1.15, sd * side);
          panel(q.x, q.z, Math.atan2(q.dx, q.dz) + Math.PI / 2);
        }
      }
      // In each yard: a pool on one side of the way, a shed and a trampoline
      // (or a table and chairs) on the other.
      for (let y = 0; y + 1 < cuts.length; y++) {
        const t = ((cuts[y] + cuts[y + 1]) / 2) * L;
        const len = (cuts[y + 1] - cuts[y]) * L;
        const sd = y % 2 ? 1 : -1;
        const box = (lat, hw, hd) => {
          const q = onLine(c.points, t, sd * lat);
          return { x: q.x, z: q.z, hw, hd, yaw: Math.atan2(q.dx, q.dz) };
        };
        const pl = box(half + 5, 2.5, Math.min(4.5, len / 2 - 3));
        const pool = G.obbCorners(pl);
        if (clear(pool, 0.3, { ignore: 'yard' })) water('pool', pool, H(pl.x, pl.z) - 0.3);
        solid('shed', box(-(side - 2.5), 1.6, 1.4), 2.6, { cycle: y }, { ignore: 'yard' });
        if (y % 2) breakable('trampoline', box(-(half + 3.5), 2, 2), 1);
        else {
          breakable('table', box(-(half + 3), 0.7, 0.7), 0.8);
          breakable('chair', box(-(half + 4.5), 0.3, 0.3), 0.9);
        }
      }
      deco('backyardWay', { pts: c.points, half, side, cuts });
    }
  }

  // Maple trees along both sides of Maple Avenue (on the verges), where no plot put one.
  function mapleTrees() {
    const st = map.streets.find((q) => q.name === S.avenue);
    const cw = S.park.causeway;
    for (let t = 20; t < st.len - 20; t += 15) {
      const p = G.pointAlong(st.pts, t);
      if (p.z > cw.z0 - 10 && p.z < cw.z1 + 10) continue;
      for (const sd of [-1, 1]) {
        const lat = st.edge - 1;
        const x = p.x - p.dz * sd * lat;
        const z = p.z + p.dx * sd * lat;
        if (map.nodes.some((nd) => (nd.name || nd.ring) && Math.hypot(nd.x - x, nd.z - z) < 24)) continue;
        tree(x, z, 1.1, 'maple', {});
      }
    }
  }

  // Trees in the block middles behind the houses (a grid, where nothing stands).
  function woods() {
    const P17 = 17;
    for (const b of map.blocks) {
      if (b.kind !== 'houses') continue;
      const bb = G.polyBounds(b.lot);
      for (let z = Math.ceil(bb.minZ / P17) * P17; z < bb.maxZ; z += P17) {
        const shift = Math.round(z / P17) % 2 ? 7 : 0;
        for (let x = Math.ceil(bb.minX / P17) * P17 + shift; x < bb.maxX; x += P17) {
          if (!G.pointInPoly(x, z, b.lot) || !inLot(x, z)) continue;
          tree(x, z, 1.2, 'oak', {});
        }
      }
    }
  }

  // The river beyond the east edge: a low wall along its bank (solid, so free
  // roam stays in the district), the water beyond.
  function riverbank() {
    const R = P.river;
    if (!R) return;
    for (let k = 0; k + 1 < R.bank.length; k++) {
      const a = R.bank[k];
      const b = R.bank[k + 1];
      const L = G.len2(a, b);
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      const sg = G.pointInPoly(mx - d[1] * 3, mz + d[0] * 3, P.boundary) ? 1 : -1;
      const inl = [-d[1] * sg, d[0] * sg];
      // Open where a road leaves over the river (its exit gate closes it).
      const cuts = map.nodes.filter((nd) => nd.exit).map((nd) => {
        const q = G.segDist(nd.x, nd.z, a, b);
        const st = map.edgeList.find((e) => e.a === nd.id || e.b === nd.id).street;
        return q.d < 1 ? [q.t * L - st.edge - 1, q.t * L + st.edge + 1] : null;
      }).filter(Boolean);
      let t0 = 0;
      for (const [c0, c1] of [...cuts, [L, L]]) {
        if (c0 - t0 > 1) {
          const tm = (t0 + c0) / 2;
          obbItem('riverWall', { x: a[0] + d[0] * tm + inl[0] * 0.4, z: a[1] + d[1] * tm + inl[1] * 0.4, hw: 0.4, hd: (c0 - t0) / 2 + 0.4, yaw: Math.atan2(d[0], d[1]) }, R.h, { cycle: 0, inland: inl });
        }
        t0 = c1;
      }
    }
    deco('river', { bank: R.bank, width: R.width });
  }
}
