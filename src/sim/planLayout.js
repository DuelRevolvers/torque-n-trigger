// Everything solid (and every prop) in a plan district, placed once by fixed
// rules from the district's data: no randomness. Ordinary buildings stand
// along each block's street frontages, sized from fixed cycles for the block's
// kind; sites and set pieces are placed where the district file says. The
// renderer draws exactly these items and free roam collides with exactly these.
//
// Item: { t, solid, y (base, world), h (height above the base) } with a
// footprint: r [x0, x1, z0, z1], or obb { x, z, hw, hd, yaw } (and r its
// bounding box), or poly (a convex polygon, and r its bounding box).

import * as G from './geom2d.js';
import { suburbLayout } from './planSuburb.js';
import { roofLayout } from './planRoof.js';
import { underLayout } from './planUnder.js';

// Building kinds: frontage widths, depth, heights (fixed cycles), setback from
// the lot edge, gap between buildings, and a second row behind the first.
export const RULES = {
  casinos: { widths: [48, 36, 42, 30, 44, 38], depth: 42, heights: [26, 40, 32, 45, 28, 36], setback: 3, gap: 4 },
  clubs: { widths: [24, 30, 20, 28, 22, 26], depth: 24, heights: [12, 16, 10, 18, 14, 11], setback: 2, gap: 3, back: 20 },
  hotels: { widths: [56, 44, 60, 48, 52], depth: 30, heights: [58, 72, 50, 86, 64, 78], setback: 6, gap: 8, back: 26 },
  motels: { widths: [64, 56, 70, 60], depth: 14, heights: [7], setback: 18, gap: 10, back: 14, motel: true },
  chapels: { widths: [18, 22, 16, 20], depth: 26, heights: [9, 10, 8], setback: 8, gap: 10, back: 22 },
  pawn: { widths: [16, 20, 14, 18, 22], depth: 20, heights: [7, 9, 6, 8], setback: 2, gap: 2, back: 18 },
  flats: { widths: [34, 30, 38], depth: 14, heights: [10, 12, 11], setback: 6, gap: 8, back: 14 },
  // The Undercity: shacks and container homes right up to the kerb, a second row
  // behind; the Old Town's tilted, half-sunk blocks.
  shacks: { widths: [9, 12, 7, 10, 8, 14, 11], depth: 11, heights: [7, 11, 15, 9, 18, 12, 8], setback: 0.5, gap: 1, back: 10 },
  oldtown: { widths: [22, 18, 26, 20], depth: 18, heights: [14, 18, 12, 16], setback: 2, gap: 6 },
};
const STREET_ORDER = (st) => (!st ? 9 : st.name === 'The Strip' ? 0 : st.width >= 20 ? 1 : st.width >= 12 ? 2 : 3);
const CAR_COLORS = 7;

export function planLayout(map) {
  const { style, heightAt: H } = map;
  const P = style.plan;
  const items = [];
  // Footprints of everything solid on the ground ('taken') and the areas
  // ordinary buildings stay out of ('keep': sites, the promenade, set pieces;
  // some let breakable props in), in a grid so a district of houses stays quick.
  const CELL = 24;
  const cells = new Map();
  const boxOf = (poly) => G.polyBounds(poly);
  const overlapsBox = (a, b, m) => a.minX - m < b.maxX && b.minX - m < a.maxX && a.minZ - m < b.maxZ && b.minZ - m < a.maxZ;
  const file = (entry) => {
    const b = entry.box;
    for (let a = Math.floor(b.minX / CELL); a <= Math.floor(b.maxX / CELL); a++) {
      for (let c = Math.floor(b.minZ / CELL); c <= Math.floor(b.maxZ / CELL); c++) {
        const k = a * 100003 + c;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(entry);
      }
    }
  };
  const near = (box, m) => {
    const out = new Set();
    for (let a = Math.floor((box.minX - m) / CELL); a <= Math.floor((box.maxX + m) / CELL); a++) {
      for (let c = Math.floor((box.minZ - m) / CELL); c <= Math.floor((box.maxZ + m) / CELL); c++) {
        for (const e of cells.get(a * 100003 + c) || []) out.add(e);
      }
    }
    return out;
  };
  // Is this footprint clear of everything taken and kept out (a breakable
  // prop may stand where only solid things are kept out; a site's own things
  // stand in the site: ignore 'site')?
  const clear = (poly, margin = 1, { breakable = false, keep = true, ignore = null } = {}) => {
    const box = boxOf(poly);
    for (const t of near(box, margin)) {
      if (t.keep && (!keep || (breakable && t.breakOk) || (ignore && t.tag === ignore))) continue;
      if (overlapsBox(box, t.box, margin) && G.convexOverlap(poly, t.poly, margin)) return false;
    }
    return true;
  };
  const takenHit = (poly, margin) => !clear(poly, margin, { keep: false });
  const take = (poly) => file({ poly, box: boxOf(poly) });
  const reserve = (poly, breakOk = false, tag = null) => file({ poly, box: boxOf(poly), keep: true, breakOk, tag });
  // An item's base: just under its lowest corner, so nothing floats on a slope.
  const baseUnder = (pts) => Math.min(...pts.map(([x, z]) => H(x, z))) - 0.6;

  // A solid rotated box standing on the ground; h is its height above the
  // ground at its middle.
  const obbItem = (t, o, h, extra = {}) => {
    const corners = G.obbCorners(o);
    const y = extra.y ?? baseUnder(corners);
    const it = { t, solid: true, obb: o, r: G.aabbOf(corners), y, h: extra.y !== undefined ? h : h + (H(o.x, o.z) - y), ...extra, x: o.x, z: o.z };
    items.push(it);
    if (it.y < H(o.x, o.z) + 2) take(corners);
    return it;
  };
  const polyItem = (t, poly, h, extra = {}) => {
    const c = G.polyCentroid(poly);
    const y = extra.y ?? baseUnder(poly);
    const it = { t, solid: true, poly, r: G.aabbOf(poly), y, h: extra.y !== undefined ? h : h + (H(c[0], c[1]) - y), ...extra, x: c[0], z: c[1] };
    items.push(it);
    if (it.y < H(c[0], c[1]) + 2) take(poly);
    return it;
  };
  const deco = (t, extra) => items.push({ t, solid: false, ...extra });
  const box = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const along = (pts, s) => G.pointAlong(pts, s);

  for (const s of map.sites) if (s.poly) reserve(s.poly, false, 'site');
  for (const L of P.lots || []) if (L.poly) reserve(L.poly);
  // The service alleys: kept clear, with a metre to spare either side.
  const alleyStrip = ([a, b], half) => {
    const L = G.len2(a, b);
    const n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
    return [[a[0] + n[0] * half, a[1] + n[1] * half], [b[0] + n[0] * half, b[1] + n[1] * half], [b[0] - n[0] * half, b[1] - n[1] * half], [a[0] - n[0] * half, a[1] - n[1] * half]];
  };
  for (const run of P.alleys?.runs || []) reserve(alleyStrip(run, P.alleys.width / 2 + 1));

  // --- Sites and set pieces first (they reserve their ground) ---
  const site = (kind) => map.sites.find((s) => s.kind === kind);
  glowPalace(site('casino'));
  carPark(site('arena'));
  nightMarket(site('market'));
  driveIn(site('drivein'));
  boneyard(site('boneyard'));
  busDepot(site('depot'));
  for (const sp of P.specials || []) special(sp);

  if (P.suburb) suburbLayout({ map, P, H, items, obbItem, polyItem, deco, clear, take, reserve, inLot, box, along, baseUnder });
  if (P.decks) roofLayout({ map, P, H, items, obbItem, polyItem, deco, clear, take, reserve });
  if (P.under) underLayout({ map, P, H, items, obbItem, polyItem, deco, clear, take, reserve });

  // --- Ordinary buildings along every block's frontages ---
  for (const b of map.blocks) {
    const kindFor = (fr) => {
      const o = b.lots.find((L) => fr.street?.name === L.along && (!L.near || nearest(b, L).includes(fr)));
      return o ? o.kind : b.kind;
    };
    const fronts = [...b.frontages].sort((p, q) => STREET_ORDER(p.street) - STREET_ORDER(q.street) || q.len - p.len);
    for (const back of [false, true]) {
      let k = b.id * 3;
      for (const fr of fronts) {
        const R = RULES[kindFor(fr)];
        if (!R || (back && !R.back)) continue;
        k = frontage(b, fr, kindFor(fr), R, back, k);
      }
    }
  }

  // --- Along the streets: lamps, the Strip's median palms and arches ---
  streetFurniture();
  alleys();
  seawall();
  exits();
  fillers();
  return { items };

  // The frontage of block b nearest a lots entry's `near` point, for a street it names.
  function nearest(b, L) {
    const cands = b.frontages.filter((f) => f.street?.name === L.along);
    let best = null;
    for (const f of cands) {
      const d = G.nearestOnLine(f.pts, L.near[0], L.near[1]).d;
      if (!best || d < best.d) best = { f, d };
    }
    return best ? [best.f] : [];
  }

  // Buildings along one frontage, walking its length. Returns the next cycle index.
  function frontage(b, fr, kind, R, back, k) {
    const pts = fr.pts;
    const L = fr.len;
    const sg = G.polyArea(b.lot) > 0 ? 1 : -1;
    const setback = back ? R.setback + R.depth + 8 : fr.boundary ? 1.5 : R.setback;
    const depth0 = back ? R.back : R.depth;
    const margin = 3;
    for (let s = margin, guard = 0; s < L - margin - 8 && guard < 400; guard++) {
      let w = R.widths[k % R.widths.length];
      if (s + w > L - margin) w = L - margin - s;
      if (w < Math.min(10, ...R.widths)) break; // (narrow shacks are narrower than 10 m)
      const a = along(pts, s);
      const e = along(pts, s + w);
      const cl = Math.hypot(e.x - a.x, e.z - a.z);
      const d = [(e.x - a.x) / cl, (e.z - a.z) / cl];
      const n = [-d[1] * sg, d[0] * sg]; // into the block
      let placed = false;
      for (const depth of [depth0, depth0 * 0.7, depth0 * 0.5]) {
        if (depth < 8) continue;
        const fx = (a.x + e.x) / 2 + n[0] * setback;
        const fz = (a.z + e.z) / 2 + n[1] * setback;
        const o = { x: fx + (n[0] * depth) / 2, z: fz + (n[1] * depth) / 2, hw: cl / 2, hd: depth / 2, yaw: Math.atan2(n[0], n[1]) };
        const corners = G.obbCorners(o);
        const inLot = [...corners, [fx, fz]].every(([x, z]) => G.pointInPoly(x, z, b.lot));
        if (!inLot || !clear(corners, 1.5)) continue;
        const h = R.heights[k % R.heights.length];
        // The first chapel on Chapel St is the drive-through one.
        const drive = kind === 'chapels' && fr.street?.name === 'Chapel Street' && !items.some((q) => q.drive);
        obbItem('bldg', o, h, { kind: kindOf(kind, fr), front: [-n[0], -n[1]], street: fr.street?.name || null, cycle: k, ...(drive ? { drive } : {}) });
        if (R.motel && !back) motelFront(fx, fz, n, d, cl, k);
        placed = true;
        break;
      }
      if (placed) {
        s += w + R.gap;
        k++;
      } else s += 4;
    }
    return k;
  }

  // Casinos front the Strip; the rest take the block's kind (singular names on items).
  function kindOf(kind, fr) {
    return { casinos: 'casino', clubs: 'club', hotels: 'hotel', motels: 'motel', chapels: 'chapel', pawn: 'pawn', flats: 'flats', shacks: 'shack', oldtown: 'oldtown' }[kind] || kind;
  }

  // A motel's forecourt: its pole sign by the street and cars in the bays.
  function motelFront(fx, fz, n, d, cl, k) {
    const sx = fx - n[0] * 14 + d[0] * (cl / 2 - 3);
    const sz = fz - n[1] * 14 + d[1] * (cl / 2 - 3);
    const pole = { x: sx, z: sz, hw: 0.4, hd: 0.4, yaw: 0 };
    if (clear(G.obbCorners(pole), 0.5)) obbItem('pole', pole, 11, { sign: 'motel', front: [-n[0], -n[1]], cycle: k });
    for (let q = 0; q < 4; q++) {
      if ((q + k) % 3 === 2) continue;
      const along = -cl / 2 + 6 + q * 5;
      const cx = fx - n[0] * 5 + d[0] * along;
      const cz = fz - n[1] * 5 + d[1] * along;
      const car = { x: cx, z: cz, hw: 1.0, hd: 2.3, yaw: Math.atan2(n[0], n[1]) };
      if (clear(G.obbCorners(car), 0.4)) obbItem('car', car, 1.5, { color: (k + q) % CAR_COLORS });
    }
  }

  // --- The Glow Palace: podium wings either side of the underpass, the
  // porte-cochere and fountain forecourt facing Marquee St, the cash dock, the
  // hotel tower and its neon crown. ---
  function glowPalace(s) {
    if (!s) return;
    const g = s.palace;
    const [top, bot] = [g.front, g.back]; // z of the podium's north (Marquee) and south faces
    const slot = g.underpass.half; // half the underpass's width
    // x of the podium's diagonal side at z (east; the west mirrors it).
    const [e0, e1] = s.poly.filter(([x]) => x > 0).sort((p, q) => q[1] - p[1]);
    const side = (z) => e0[0] + ((e1[0] - e0[0]) * (z - e0[1])) / (e1[1] - e0[1]);
    for (const m of [-1, 1]) {
      const X = (x) => m * x;
      // Wing pieces (convex), with the cash dock bay cut into the west wing.
      const dock = m < 0 ? g.dock : null;
      const cuts = dock ? [bot, dock.z1, dock.z0, g.recess] : [bot, g.recess];
      for (let q = 0; q + 1 < cuts.length; q++) {
        const za = cuts[q];
        const zb = cuts[q + 1];
        const inner = dock && za === dock.z1 ? dock.x : slot;
        const poly = [[X(inner), za], [X(side(za)), za], [X(side(zb)), zb], [X(inner), zb]];
        polyItem('podium', m < 0 ? poly.reverse() : poly, g.podiumH, { palace: true });
      }
      // The mouth block carrying the porte-cochere, out to Marquee St.
      polyItem('podium', box(Math.min(X(slot), X(g.mouth)), Math.max(X(slot), X(g.mouth)), top, g.recess), g.podiumH, { palace: true, mouth: true });
      // A fountain in the forecourt.
      const f = g.fountain;
      obbItem('fountain', { x: X(f.x), z: f.z, hw: f.r, hd: f.r, yaw: 0 }, 0.8, { rad: f.r });
    }
    // The underpass roof (you drive under it), and over the cash dock.
    const H0 = H(0, (top + bot) / 2);
    polyItem('podium', box(-slot, slot, top, bot), g.podiumH - g.underpass.ceiling, { y: H0 + g.underpass.ceiling, palace: true, roof: true });
    if (g.dock) polyItem('podium', box(-g.dock.x, -slot, g.dock.z0, g.dock.z1), g.podiumH - g.underpass.ceiling, { y: H0 + g.underpass.ceiling, palace: true, roof: true });
    deco('underpass', { x: 0, z0: top, z1: bot, half: slot, ceiling: g.underpass.ceiling, y: H0 });
    deco('cashDock', { ...g.dock, y: H0 });
    // The tower on the podium, and its crown.
    const t = g.tower;
    obbItem('tower', { x: 0, z: t.z, hw: t.hw, hd: t.hd, yaw: 0 }, t.h, { y: H0 + g.podiumH });
    deco('crown', { x: 0, z: t.z, hw: t.hw, hd: t.hd, y: H0 + g.podiumH + t.h });
    deco('porteCochere', { x: 0, z0: top - g.canopy.depth, z1: top, hw: g.canopy.hw, y: H(0, top) + g.canopy.y });
    deco('palaceFront', { top, back: bot, recess: g.recess, mouth: g.mouth, side: [side(top), side(g.recess)], y: H(0, top) });
  }

  // --- The Casino Car Park: its low wall (gaps for the aisle, the side
  // entrances and the shortcut), rows of parked cars, lamp masts, the valet
  // booth and the shuttle shelter. The valet ramp deck is in the arena data. ---
  function carPark(s) {
    if (!s?.carpark) return;
    const c = s.carpark;
    for (const w of c.walls) obbItem('lowWall', w, 1, { cycle: 0 });
    let n = 0;
    for (const row of c.rows) {
      // Cars nose to tail across the row's depth, side by side along it.
      const [x0, x1, z0, z1] = row.r;
      const lines = row.double ? [z0 + 2.4, z1 - 2.4] : [(z0 + z1) / 2];
      lines.forEach((z, li) => {
        for (let x = x0 + 1.3, q = 0; x <= x1 - 1.3; x += 2.6, q++) {
          if ((q + li * 3 + n) % 9 === 8) continue; // an empty bay now and then
          if (row.skip?.some(([a, b, za, zb]) => x > a && x < b && z > za && z < zb)) continue;
          if (c.lane && G.nearestOnLine(c.lane, x, z).d < c.laneClear) continue;
          obbItem('car', { x, z, hw: 1.0, hd: 2.3, yaw: li ? Math.PI : 0 }, 1.5, { color: (q + n) % CAR_COLORS, parked: true });
        }
      });
      n++;
    }
    for (const [x, z] of c.masts) obbItem('mast', { x, z, hw: 0.4, hd: 0.4, yaw: 0 }, 16, { cycle: 0 });
    obbItem('booth', c.booth, 3, { cycle: 0 });
    obbItem('shelter', c.shelter, 3.2, { cycle: 0 });
  }

  // --- The Night Market: stalls along the lane (solid: slow and tight), food
  // trucks, the gate on the Strip, strings of lights and tarps. ---
  function nightMarket(s) {
    if (!s?.market) return;
    const m = s.market;
    const lane = s.way;
    const L = G.lineLength(lane);
    let k = 0;
    for (let t = m.start; t < L - m.end; t += m.pitch, k++) {
      const p = along(lane, t);
      for (const sd of [-1, 1]) {
        if ((k + (sd > 0 ? 1 : 0)) % 7 === 6) continue; // gaps between the stalls
        const off = m.half + 0.3 + m.stall / 2;
        const x = p.x - p.dz * sd * off;
        const z = p.z + p.dx * sd * off;
        const truck = k % 11 === 5;
        const o = { x, z, hw: truck ? 3.8 : m.stall / 2, hd: truck ? 1.3 : m.stall / 2, yaw: Math.atan2(p.dx, p.dz) };
        if (!G.pointInPoly(x, z, s.poly)) continue;
        if (truck) obbItem('foodTruck', { ...o, hw: 1.3, hd: 3.8 }, 3, { cycle: k });
        else obbItem('stall', o, 2.8, { cycle: k + (sd > 0 ? 3 : 0), front: [p.dz * sd, -p.dx * sd] });
      }
      if (k % 3 === 1) deco('lights', { x: p.x, z: p.z, dx: p.dx, dz: p.dz, span: 2 * (m.half + m.stall + 1), y: H(p.x, p.z) + 5.2 });
    }
    deco('marketGate', { ...m.gate, y: H(m.gate.x, m.gate.z) });
    for (const f of m.fence) obbItem('fence', f, 2.4, { cycle: 0 });
  }

  // --- The Starlite Drive-In: the screen (solid), rows of parking humps
  // (small jumps), speaker posts (they get knocked down: not solid), the snack
  // bar and projection booth, and the gate at Drive-in Road. ---
  function driveIn(s) {
    if (!s) return;
    const d = s.drivein;
    obbItem('screen', d.screen, d.screenH, { cycle: 0 });
    obbItem('snackBar', d.snack, 5, { cycle: 0 });
    for (const [z, x0, x1] of d.humps) {
      const y = H((x0 + x1) / 2, z);
      for (const dir of [1, -1]) {
        // Up on the north side, down on the south: a low hump you can jump.
        items.push({ t: 'hump', solid: false, ramp: { x: (x0 + x1) / 2, z: z - dir * d.hump.len, dirX: 0, dirZ: dir, len: d.hump.len, width: x1 - x0, height: d.hump.h }, y });
      }
      for (let x = x0 + 4, q = 0; x < x1 - 2; x += d.speakerPitch, q++) deco('speaker', { x, z: z + d.hump.len + 2.5, y, knock: true, id: `${z}:${q}` });
    }
    for (const f of d.fence) obbItem('fence', f, 2.4, { cycle: 0 });
    deco('driveinGate', { ...d.gate, y: H(d.gate.x, d.gate.z) });
  }

  // --- The Sign Boneyard: the dead signs of the Strip, solid, a few still
  // flickering; a fence round it with gates where the path goes through. ---
  function boneyard(s) {
    if (!s) return;
    const b = s.boneyard;
    b.signs.forEach((sg, k) => obbItem('deadSign', { x: sg.x, z: sg.z, hw: sg.w / 2, hd: sg.d / 2, yaw: sg.yaw || 0 }, sg.h, { shape: sg.shape, flicker: !!sg.flicker, lying: !!sg.lying, cycle: k }));
    for (const f of b.fence) obbItem('fence', f, 2.4, { cycle: 0 });
  }

  // --- The Bus Depot: tour buses in rows (solid), the depot office, a fence
  // with openings where the yard's way through meets the streets. ---
  function busDepot(s) {
    if (!s) return;
    const d = s.depot;
    d.buses.forEach((b, k) => obbItem('bus', b, 3.4, { color: k % 4, cycle: k }));
    obbItem('bldg', d.office, 8, { kind: 'depot', front: d.office.front, cycle: 0 });
    for (const f of d.fence) obbItem('fence', f, 2.4, { cycle: 0 });
  }

  // Named buildings: the Pink Room, the Hi-Score Arcade, Candy Chrome, the counting house.
  function special(sp) {
    const o = { x: sp.x, z: sp.z, hw: sp.w / 2, hd: sp.d / 2, yaw: sp.yaw || 0 };
    const corners = G.obbCorners(o);
    if (!clear(corners, 0.5)) throw new Error(`${style.id}: ${sp.kind} overlaps something`);
    obbItem('bldg', o, sp.h, { kind: sp.kind, front: [Math.sin(o.yaw + Math.PI), Math.cos(o.yaw + Math.PI)], name: sp.name, cycle: 0 });
    for (const x of sp.extra || []) obbItem(x.t, { x: x.x, z: x.z, hw: x.w / 2, hd: x.d / 2, yaw: x.yaw || 0 }, x.h, { ...x.props, cycle: 0 });
    reserve(corners);
  }

  // Lamp posts along every street (just inside the lots), the Strip's median
  // (a kerb with neon palms, broken at every junction) and its neon arches.
  function streetFurniture() {
    const F = P.furniture;
    if (!F) return;
    for (const e of map.edgeList) {
      const st = e.street;
      if (st.lampless || st.surface === 'dirt') continue;
      const clearEnd = (n) => (map.adj[n].length > 1 ? 18 : 6);
      const L = e.len;
      for (let t = clearEnd(e.a); t < L - clearEnd(e.b); t += F.lampPitch) {
        const p = along(e.pts, t);
        for (const sd of [-1, 1]) {
          // Just inside the lots, or on the verge (lampIn < 0).
          const lat = st.edge + (F.lampIn ?? 0.6);
          const x = p.x - p.dz * sd * lat;
          const z = p.z + p.dx * sd * lat;
          if (((F.lampIn ?? 0.6) > 0 && !inLot(x, z)) || map.sites.some((q) => q.poly && G.pointInPoly(x, z, q.poly))) continue;
          const pole = { x, z, hw: 0.2, hd: 0.2, yaw: 0 };
          if (!clear(G.obbCorners(pole), 0.2)) continue;
          obbItem('lamp', pole, 7, { toward: [p.dz * sd, -p.dx * sd], cycle: 0 });
        }
      }
    }
    const strip = map.streets.find((st) => st.median);
    if (strip) {
      const junctions = strip.marks.filter((m) => map.adj[m.node.id].length > 2).map((m) => G.nearestOnLine(strip.pts, m.node.x, m.node.z).s);
      const L = G.lineLength(strip.pts);
      const open = (t) => junctions.some((j) => Math.abs(t - j) < F.medianGap) || t < 10 || t > L - 10;
      // Median kerb runs between the junction gaps; palms along it.
      let run = null;
      for (let t = 0; t <= L; t += 2) {
        if (!open(t) && !run) run = t;
        if ((open(t) || t + 2 > L) && run !== null) {
          const a = along(strip.pts, run);
          const b = along(strip.pts, t - 2);
          const len = Math.hypot(b.x - a.x, b.z - a.z);
          obbItem('median', { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, hw: strip.median / 2, hd: len / 2, yaw: Math.atan2(b.x - a.x, b.z - a.z) }, F.medianH, { y: H((a.x + b.x) / 2, (a.z + b.z) / 2) - 0.2, cycle: 0 });
          for (let q = run + 6; q < t - 6; q += F.palmPitch) {
            const p = along(strip.pts, q);
            deco('palm', { x: p.x, z: p.z, y: H(p.x, p.z) + F.medianH - 0.2, neon: Math.round(q / F.palmPitch) % 3 });
          }
          run = null;
        }
      }
      for (const ax of F.arches) {
        const q = G.nearestOnLine(strip.pts, ax, 60);
        const p = along(strip.pts, q.s);
        const lat = strip.edge + 0.8;
        for (const sd of [-1, 1]) obbItem('archLeg', { x: p.x - p.dz * sd * lat, z: p.z + p.dx * sd * lat, hw: 0.5, hd: 0.5, yaw: 0 }, 11, { cycle: 0 });
        deco('arch', { x: p.x, z: p.z, dx: p.dx, dz: p.dz, span: 2 * lat, y: H(p.x, p.z), k: F.arches.indexOf(ax) });
      }
    }
  }

  // On a lot (not a street or sidewalk).
  function inLot(x, z) {
    return map.blocks.some((b) => G.pointInPoly(x, z, b.lot));
  }

  // The service alleys: the lane itself, and brick walls along both sides
  // wherever no building stands against it (open at the streets it joins).
  function alleys() {
    const A = P.alleys;
    if (!A) return;
    for (const [a, b] of A.runs) {
      const L = G.len2(a, b);
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      deco('alley', { a, b, width: A.width, y: H((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) });
      for (const side of [-1, 1]) {
        const off = side * (A.width / 2 + 0.25);
        const at = (t) => [a[0] + d[0] * t - d[1] * off, a[1] + d[1] * t + d[0] * off];
        // Where a wall can stand: on a lot, and not against (or in) a building.
        const free = (t) => {
          const [x, z] = at(t);
          if (!inLot(x, z)) return false;
          const probe = G.obbCorners({ x: x - d[1] * side * 0.8, z: z + d[0] * side * 0.8, hw: 0.3, hd: 0.3, yaw: 0 });
          return !takenHit(probe, 0.2);
        };
        let from = null;
        for (let t = 0; t <= L; t += 2) {
          const ok = free(t) && t <= L - 1;
          if (ok && from === null) from = t;
          if ((!ok || t + 2 > L) && from !== null) {
            const to = ok ? t : t - 2;
            if (to - from >= 3) {
              const [x0, z0] = at(from);
              const [x1, z1] = at(to);
              obbItem('wall', { x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: 0.25, hd: (to - from) / 2 + 1, yaw: Math.atan2(d[0], d[1]) }, 3.2, { cycle: 0 });
            }
            from = null;
          }
        }
      }
    }
  }

  // The seawall along the bay: a solid parapet, the promenade's palms and benches.
  function seawall() {
    const S = P.seawall;
    if (!S) return;
    for (let k = 0; k + 1 < S.pts.length; k++) {
      const a = S.pts[k];
      const b = S.pts[k + 1];
      const L = G.len2(a, b);
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      // Inland: the side of the wall that's inside the district.
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      const sg = G.pointInPoly(mx - d[1] * 3, mz + d[0] * 3, P.boundary) ? 1 : -1;
      const inl = [-d[1] * sg, d[0] * sg];
      const o = { x: mx + inl[0] * 0.4, z: mz + inl[1] * 0.4, hw: 0.4, hd: L / 2, yaw: Math.atan2(d[0], d[1]) };
      obbItem('seawall', o, S.h, { cycle: 0, inland: inl });
      for (let t = 10; t < L - 6; t += S.palmPitch) {
        const x = a[0] + d[0] * t + inl[0] * S.palmIn;
        const z = a[1] + d[1] * t + inl[1] * S.palmIn;
        const trunk = { x, z, hw: 0.35, hd: 0.35, yaw: 0 };
        if (clear(G.obbCorners(trunk), 0.3)) obbItem('palmTree', trunk, 9, { cycle: Math.round(t) });
      }
    }
    deco('seawallLine', { pts: S.pts, h: S.h });
  }

  // The city carrying on beyond the district's edge: a ring of buildings just
  // outside the boundary (solid, so free roam stays in the district), open
  // where the roads leave and along the seawall.
  function fillers() {
    const F = P.fillers;
    if (!F) return;
    const bnd = P.boundary;
    const sea = P.seawall?.pts || [];
    const river = [...(P.river?.bank || []), ...Object.values(P.under?.shores || {}).flat()];
    const onLine = (line, a, b) => line.some((p, k) => k + 1 < line.length && ((G.len2(p, a) < 1 && G.len2(line[k + 1], b) < 1) || (G.len2(p, b) < 1 && G.len2(line[k + 1], a) < 1)));
    const onSea = (a, b) => onLine(sea, a, b) || onLine(river, a, b);
    const exitsAt = map.nodes.filter((n) => n.exit);
    let k = 0;
    bnd.forEach((a, q) => {
      const b = bnd[(q + 1) % bnd.length];
      if (onSea(a, b)) return;
      const L = G.len2(a, b);
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      const sg = G.pointInPoly(mx - d[1] * 3, mz + d[0] * 3, bnd) ? -1 : 1;
      const out = [-d[1] * sg, d[0] * sg];
      for (let s = 0; s < L - 8; ) {
        const w = Math.min(F.widths[k % F.widths.length], L - s);
        const cx = a[0] + d[0] * (s + w / 2) + out[0] * (F.depth / 2 + 1);
        const cz = a[1] + d[1] * (s + w / 2) + out[1] * (F.depth / 2 + 1);
        const near = exitsAt.some((n) => Math.hypot(n.x - (a[0] + d[0] * (s + w / 2)), n.z - (a[1] + d[1] * (s + w / 2))) < w / 2 + F.exitGap);
        const o = { x: cx, z: cz, hw: w / 2, hd: F.depth / 2, yaw: Math.atan2(out[0], out[1]) };
        if (!near && clear(G.obbCorners(o), 0.5)) obbItem('bldg', o, F.heights[k % F.heights.length], { kind: F.kind || 'filler', front: [-out[0], -out[1]], cycle: k });
        s += w + 2;
        k++;
      }
    });
  }

  // Where the roads leave the district: barriers across them at the boundary.
  function exits() {
    for (const n of map.nodes.filter((q) => q.exit)) {
      const e = map.edgeList.find((q) => q.a === n.id || q.b === n.id);
      const pts = e.a === n.id ? e.pts : [...e.pts].reverse();
      const p = along(pts, 6);
      const half = e.street.edge;
      obbItem('gate', { x: p.x, z: p.z, hw: half, hd: 0.5, yaw: Math.atan2(p.dx, p.dz) }, 1.2, { cycle: 0, ...(P.decks ? { y: H(p.x, p.z) - 0.05 } : {}) });
    }
  }
}
