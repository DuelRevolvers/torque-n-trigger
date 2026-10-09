// Track geometry for the simulation: a spline centreline resampled at a fixed
// spacing, with a fast "where am I relative to the road" query used for wheel
// raycasts, walls and lap progress. Rendering builds its meshes from the same data.

// OFFROAD is grass, gravel and dirt; SAND a golf bunker; WET a lawn under a sprinkler.
export const SURFACE = Object.freeze({ ROAD: 0, CURB: 1, OFFROAD: 2, SAND: 3, WET: 4 });

import { wetAt } from './sprinklers.js';
import { pointInPoly as inPoly } from './geom2d.js';
import { floodAt, inSurge, sumpWetAt } from './flood.js';
import { lockdownBoxes } from './lockdown.js';

// Wet from the flood: in the surge on the drain's bed, or on the Sump's floor.
const floodWet = (f, x, z, y, t) => {
  const at = floodAt(f, Math.round(t * 60));
  return !!at && (inSurge(f, at, x, z, y) || sumpWetAt(f, at, x, z));
};

const SEARCH_WINDOW = 16; // samples either side of the hint index
export const END_RUN = 20; // metres past an open end to the barrier across the road
const SECTION_RAMP = 8; // metres over which a street's width blends into the next

// Is (x, z) on obstacle o's footprint (a box, turned by yaw, or a polygon)?
export function onFoot(o, x, z) {
  if (o.poly) return inPoly(x, z, o.poly);
  const dx = Math.sin(o.yaw || 0);
  const dz = Math.cos(o.yaw || 0);
  return Math.abs((x - o.x) * dz - (z - o.z) * dx) <= o.hw && Math.abs((x - o.x) * dx + (z - o.z) * dz) <= o.hd;
}

// Does a car fit on obstacle o's top (a roof, a container, a bus; not a lamp
// post, a tree trunk or a hedge), standing at least MIN_RISE over the ground
// under it (a planter or a kerb block stays a wall)? Then its top is ground to drive on.
const FIT_W = 2.4; // a car's width and length, with room
const FIT_L = 4.6;
const MIN_RISE = 1;
// The most a wheel or the body climbs onto in one go (a kerb). Anything taller
// (a top, a deck, a ramp's side) is a wall unless the car's lowest point (a
// query's foot) is already up level with it: the way up is a ramp.
export const STEP_UP = 0.25;

// Is a ramp's surface at (x, z) a wall for something whose lowest point is at
// foot? Then how far into the ramp's footprint (p) and the way in (rx, rz),
// across its nearest face.
export function rampWall(r, dx, dz, u, h, foot) {
  if (foot === undefined || h <= foot + STEP_UP) return null;
  const v = -dx * r.dirZ + dz * r.dirX; // across it
  const side = r.width / 2 - Math.abs(v);
  const end = r.len - u;
  if (side <= end && side <= u) return { p: side, rx: (Math.sign(v) || 1) * r.dirZ, rz: -(Math.sign(v) || 1) * r.dirX };
  return end <= u ? { p: end, rx: -r.dirX, rz: -r.dirZ } : { p: u, rx: r.dirX, rz: r.dirZ };
}

// (ground: a height, or a function giving it, asked only if the footprint fits.)
export function fitsCar(o, ground = o.y || 0) {
  if (!(o.h > 0)) return false;
  const b = o.poly ? bounds2(o.poly) : null;
  const w = b ? b[1] - b[0] : 2 * o.hw;
  const d = b ? b[3] - b[2] : 2 * o.hd;
  if (Math.min(w, d) < FIT_W || Math.max(w, d) < FIT_L) return false;
  return (o.y || 0) + o.h - (typeof ground === 'function' ? ground() : ground) >= MIN_RISE;
}

// How far (x, z) is inside polygon p, and the way into it from its nearest edge
// ([rx, rz]); null outside.
function polyDepth(p, x, z) {
  if (!inPoly(x, z, p)) return null;
  let best = null;
  for (let k = 0; k < p.length; k++) {
    const a = p[k];
    const b = p[(k + 1) % p.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    const qx = a[0] + dx * t;
    const qz = a[1] + dz * t;
    const d = Math.hypot(x - qx, z - qz);
    if (!best || d < best.d) best = { d, r: d > 1e-6 ? [(x - qx) / d, (z - qz) / d] : [dz / Math.sqrt(L2), -dx / Math.sqrt(L2)] };
  }
  return best;
}

export function buildTrack(def) {
  const {
    name = 'track',
    points,
    closed = true,
    halfWidth = 8,
    curbWidth = 1.2,
    shoulderWidth = 4,
    spacing = 2,
  } = def;
  const dense = densify(points, closed, 24);
  const pts = resample(dense, closed, spacing);
  // Jump kickers: the road rises over len metres, then drops away.
  // (A mound comes down again over the same length: a dirt jump.)
  const jumps = (def.jumps || []).map((j) => ({ s: j.frac !== undefined ? j.frac * pts.length : j.s, len: j.len, height: j.height, bump: !!j.bump, mound: !!j.mound }));
  for (const j of jumps) {
    pts.points.forEach((pt, i) => {
      const s = i * pts.step;
      if (s >= j.s && s <= j.s + j.len) pt[1] += (j.height * (s - j.s)) / j.len;
      else if (j.mound && s > j.s + j.len && s <= j.s + 2 * j.len) pt[1] += j.height * (1 - (s - j.s - j.len) / j.len);
    });
  }
  // Gaps (rooftop districts): a launch ramp up to the gap, nothing under it
  // (see queryMain) and a landing ramp down from the far lip.
  const gaps = def.gaps || [];
  for (const g of gaps) {
    pts.points.forEach((pt, i) => {
      const s = i * pts.step;
      if (s >= g.s0 - g.len && s <= g.s0) pt[1] += (g.rise * (s - (g.s0 - g.len))) / g.len;
      else if (s >= g.s1 && s <= g.s1 + g.len) pt[1] += g.rise * (1 - (s - g.s1) / g.len);
    });
  }
  // Sections (plan districts): the road's half-width and wall distance change
  // street by street; the track's widths are then the widest of them.
  const sections = def.sections?.length ? def.sections : null;
  const widest = sections ? { halfWidth: Math.max(...sections.map((q) => q.half)), wall: Math.max(...sections.map((q) => q.wall)) } : null;
  const track = new Track(name, pts, closed, widest ? { halfWidth: widest.halfWidth, curbWidth, shoulderWidth: widest.wall - widest.halfWidth - curbWidth } : { halfWidth, curbWidth, shoulderWidth });
  track.sections = sections;
  track.medians = def.medians?.length ? def.medians : null; // a solid median down the middle (the Strip)
  track.surfaceAll = def.surfaceAll ?? null; // a whole road of one surface (a shortcut across grass)
  // Solid things inside the walls (verge trees, hedges at a corner): { x, z, hw, hd, yaw?, y, h }.
  // (top: its top is ground a car can drive on, off the streets in a T&T SDK
  // race; anything else a car fits on has one too.)
  if (def.obstacles?.length) track.setObstacles(def.obstacles);
  // The T&T SDK's races off the streets: ramps ({ x, z, dirX, dirZ, len, width, height, abs }),
  // and where the start and finish are (along the track, and how high when up on something).
  track.ramps = def.ramps?.length ? def.ramps : null;
  track.free = def.free?.length ? def.free : null; // the stretches off the streets (lines)
  track.tops = !!track.ramps || !!def.obstacles?.some((o) => o.top);
  track.startS = def.startS ?? null;
  if (def.finishS !== undefined) track.finishS = def.finishS;
  track.startY = def.startY ?? null;
  track.finishY = def.finishY ?? null;
  track.sprinklers = def.sprinklers?.length ? def.sprinklers : null; // lawn sprinklers: { x, z, id }
  track.breakables = def.breakables?.length ? def.breakables : null; // fences, mailboxes, bins
  track.gusts = def.gusts || null;
  track.flood = def.flood || null; // the flash flood (the Undercity)
  track.lockdown = def.lockdown || null; // the security lockdown (the Corporate Spire)
  track.junctions = def.junctions || null; // the junctions on the route (for its dressing)
  track.ceilingAt = def.ceilingAt || null; // what's overhead (the deck, a tunnel's roof), for the camera // the river gusts (Chrome Heights): exposed on bridges, gaps, the Straight
  // Ground in the run-off that isn't grass: sand bunkers, paved car parks ({ poly, surface }).
  track.patches = def.patches?.length ? def.patches.map((p) => ({ ...p, box: p.box || bounds2(p.poly) })) : null;
  track.jumps = jumps;
  track.gaps = gaps.length ? gaps : null;
  track.train = def.train || null; // the freight line, if the district has one
  track.drops = def.drops || null; // the drops placed in the T&T SDK (event.js pickups)
  track.oil = def.oil || null; // its oil slicks (combat.js)
  track.truck = def.truck || null; // the armoured cash truck (the Neon Strip)
  track.rv = def.rv || null; // the runaway RV (Maple Hollow)
  track.closures = def.closures || [];
  track.watchCars = def.watchCars || null; // Maple Hollow: the Watch's cars along the edges
  track.narrows = def.narrows?.length ? def.narrows : null; // container tunnels, alleys
  track.authored = !!def.authored;
  // Shortcut branches: narrow roads that leave the main line at s0 and rejoin at s1.
  if (def.branches?.length) {
    track.branches = def.branches.map((b) => ({
      track: buildTrack({ ...b, closed: false, halfWidth: b.halfWidth ?? 6, curbWidth: b.curbWidth ?? 0.8, shoulderWidth: b.shoulderWidth ?? 2, spacing, obstacles: def.obstacles, sprinklers: def.sprinklers, patches: def.patches }),
      s0: b.s0,
      s1: b.s1,
      kind: b.kind || 'street',
    }));
  }
  return track;
}

class Track {
  constructor(name, pts, closed, widths) {
    this.name = name;
    this.closed = closed;
    this.halfWidth = widths.halfWidth;
    this.curbWidth = widths.curbWidth;
    this.wallDist = widths.halfWidth + widths.curbWidth + widths.shoulderWidth;
    this.searchRadiusSq = (this.wallDist + 25) ** 2;

    const n = pts.points.length;
    this.count = n;
    this.length = pts.length;
    this.step = pts.step;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.z = new Float64Array(n);
    this.s = new Float64Array(n);
    this.tx = new Float64Array(n); // 3D unit tangent
    this.ty = new Float64Array(n);
    this.tz = new Float64Array(n);
    this.rx = new Float64Array(n); // horizontal unit right vector
    this.rz = new Float64Array(n);
    this.nx = new Float64Array(n); // road surface normal
    this.ny = new Float64Array(n);
    this.nz = new Float64Array(n);

    let minY = Infinity;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const [x, y, z] = pts.points[i];
      this.x[i] = x;
      this.y[i] = y;
      this.z[i] = z;
      this.s[i] = i * pts.step;
      minY = Math.min(minY, y);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    for (let i = 0; i < n; i++) {
      const prev = closed ? (i - 1 + n) % n : Math.max(i - 1, 0);
      const next = closed ? (i + 1) % n : Math.min(i + 1, n - 1);
      let tx = this.x[next] - this.x[prev];
      let ty = this.y[next] - this.y[prev];
      let tz = this.z[next] - this.z[prev];
      const tl = Math.hypot(tx, ty, tz);
      tx /= tl;
      ty /= tl;
      tz /= tl;
      // right = tangent x up, flattened
      const hl = Math.hypot(tz, tx);
      const rx = -tz / hl;
      const rz = tx / hl;
      // normal = right x tangent
      let nx = -rz * ty;
      let ny = rz * tx - rx * tz;
      let nz = rx * ty;
      const nl = Math.hypot(nx, ny, nz);
      this.tx[i] = tx;
      this.ty[i] = ty;
      this.tz[i] = tz;
      this.rx[i] = rx;
      this.rz[i] = rz;
      this.nx[i] = nx / nl;
      this.ny[i] = ny / nl;
      this.nz[i] = nz / nl;
    }
    this.minY = minY;
    this.bounds = { minX, maxX, minZ, maxZ };
    this.fits = new WeakMap(); // isTop's answers
  }

  // A section value at s (half or wall), blended over SECTION_RAMP metres where
  // one street's width changes to the next.
  sectionAt(s, key) {
    const secs = this.sections;
    const k = Math.max(0, secs.findIndex((q) => s < q.s1));
    const q = secs[k];
    const v = q[key];
    if (k > 0 && s - q.s0 < SECTION_RAMP) return secs[k - 1][key] + (v - secs[k - 1][key]) * (0.5 + (s - q.s0) / (2 * SECTION_RAMP));
    if (k + 1 < secs.length && q.s1 - s < SECTION_RAMP) return v + (secs[k + 1][key] - v) * (0.5 - (q.s1 - s) / (2 * SECTION_RAMP));
    return v;
  }

  // Wall distance at s: the street's own (sections), with narrow sections
  // (container tunnels, the Palace Underpass) closing the walls in to `wall`,
  // funnelling in over `ramp` metres either side.
  localWall(s) {
    const base = this.sections ? this.sectionAt(s, 'wall') : this.wallDist;
    let w = base;
    for (const n of this.narrows || []) {
      const d = s < n.s0 ? n.s0 - s : s > n.s1 ? s - n.s1 : 0;
      if (d < n.ramp) w = Math.min(w, n.wall + ((base - n.wall) * d) / n.ramp);
    }
    return w;
  }

  // The section at s: its road's own surface (a dirt road is offroad all
  // across) and its sidewalk's width (paved, beyond the kerb).
  sectionOf(s) {
    return this.sections.find((c) => s < c.s1) || this.sections[this.sections.length - 1];
  }

  // Road half-width at s (in a narrow section the road runs wall to wall).
  localHalf(s) {
    const half = this.sections ? this.sectionAt(s, 'half') : this.halfWidth;
    return this.narrows || this.sections ? Math.min(half, this.localWall(s)) : half;
  }

  // The median's half-width at s (0 where there isn't one: at the junction gaps).
  medianAt(s) {
    if (!this.medians) return 0;
    for (const m of this.medians) if (s > m.s0 && s < m.s1) return m.half;
    return 0;
  }

  // How far the ground falls away at distance s (over a gap between rooftops).
  gapDrop(s) {
    if (!this.gaps) return 0;
    for (const g of this.gaps) if (s > g.s0 && s < g.s1) return g.drop;
    return 0;
  }

  // Sim time (seconds), for the sprinklers.
  setTime(t) {
    this.time = t;
  }

  // Is o's top ground to drive on: marked so, or a car fits on it? (Worked
  // out the first time a car comes near it.)
  isTop(o, hint = -1) {
    if (o.top) return true;
    let v = this.fits.get(o);
    if (v === undefined) this.fits.set(o, (v = fitsCar(o, () => this.queryMain(o.x, o.z, hint).height)));
    return v;
  }

  setObstacles(list) {
    this.obstacles = list;
    this.obstacleGrid = new Map();
    for (const o of list) {
      const r = Math.hypot(o.hw, o.hd);
      for (let a = Math.floor((o.x - r) / 16); a <= Math.floor((o.x + r) / 16); a++) {
        for (let b = Math.floor((o.z - r) / 16); b <= Math.floor((o.z + r) / 16); b++) {
          const k = a * 100003 + b;
          if (!this.obstacleGrid.has(k)) this.obstacleGrid.set(k, []);
          this.obstacleGrid.get(k).push(o);
        }
      }
    }
  }

  // How exposed a car is to a gust: fully on a section marked exposed, less elsewhere.
  gustExposure(car) {
    if (!this.sections) return 1;
    return this.sectionOf(car.trackS ?? 0).exposed ? 1 : this.gusts?.sheltered ?? 0.35;
  }

  // Is a sprinkler watering (x, z) now?
  wetAt(x, z) {
    return wetAt(this.sprinklers, this.time || 0, x, z);
  }

  // A patch's surface at (x, z) (sand, paving), or null.
  patchAt(x, z) {
    for (const p of this.patches) {
      const b = p.box;
      if (x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3] && inPoly(x, z, p.poly)) return p.surface;
    }
    return null;
  }

  wrap(i) {
    const n = this.count;
    return this.closed ? ((i % n) + n) % n : Math.min(Math.max(i, 0), n - 1);
  }

  indexAtDistance(s) {
    const i = Math.round(s / this.step);
    return this.wrap(i);
  }

  // Nearest road surface: the main line, or a shortcut branch when the point is
  // on one. Branch hits report main-line progress (s, index) so laps and
  // positions keep working, and a lateral scaled to the main wall distance.
  // y: the height asking; foot: the lowest point of what's asking (a wheel's
  // bottom, the body's lowest corner), for what it can stand on (STEP_UP).
  query(x, z, hint = -1, y, foot = y) {
    const r = this.queryMain(x, z, hint);
    let best = this.branches ? this.queryBranches(x, z, r) : r;
    if (!this.closed && !best.onBranch && (r.index === 0 || r.index === this.count - 1)) best = this.endCap(best, x, z);
    return this.obstacles || this.sprinklers || this.patches || this.flood || this.lockdown || this.ramps ? this.solidAt(x, z, y, best, foot) : best;
  }

  // An open track's ends (a sprint's start and finish): where the barrier
  // across the road stands, END_RUN metres on, and the way out past it
  // (ox, oz); k is the end's sample, wall its wall distance.
  get ends() {
    if (this.closed) return [];
    return (this.endList ||= [0, this.count - 1].map((k) => {
      const sg = k ? 1 : -1;
      const l = Math.hypot(this.tx[k], this.tz[k]) || 1;
      const ox = (this.tx[k] / l) * sg;
      const oz = (this.tz[k] / l) * sg;
      return { k, ox, oz, x: this.x[k] + ox * END_RUN, z: this.z[k] + oz * END_RUN, y: this.y[k], wall: this.localWall(this.s[k]) };
    }));
  }

  // Past an open end's barrier: a wall, as the sides are (at any height).
  endCap(g, x, z) {
    const e = this.ends[g.index < this.count / 2 ? 0 : 1];
    const past = (x - e.x) * e.ox + (z - e.z) * e.oz;
    if (past <= 0 || past <= Math.abs(g.lateral) - this.wallDist) return g;
    return { ...g, lateral: this.wallDist + past, rx: e.ox, rz: e.oz, trueLateral: g.trueLateral ?? g.lateral };
  }

  // A ramp's surface under (x, z), if it's above the ground g: the new ground.
  // (foot: a ramp's side too high to step onto from there is a wall, in out.rampHit.)
  onRamp(x, z, g, foot) {
    let out = g;
    for (const r of this.ramps) {
      const dx = x - r.x;
      const dz = z - r.z;
      const u = dx * r.dirX + dz * r.dirZ; // along the ramp
      if (u < 0 || u > r.len || Math.abs(-dx * r.dirZ + dz * r.dirX) > r.width / 2) continue;
      const slope = r.height / r.len;
      const h = r.abs + slope * u;
      if (h <= out.height) continue;
      const w = rampWall(r, dx, dz, u, h, foot);
      if (w) {
        if (!out.rampHit || w.p > out.rampHit.p) out = { ...out, rampHit: w };
        continue;
      }
      const n = Math.hypot(slope, 1);
      out = { ...out, height: h, nx: (-r.dirX * slope) / n, ny: 1 / n, nz: (-r.dirZ * slope) / n, surface: r.surface ?? SURFACE.ROAD };
    }
    return out;
  }

  // The ground at (x, z) for something no higher than y: the road, a ramp, or
  // the top of what it's on (off the streets in a T&T SDK race; on a track
  // with none, the road's height).
  standY(x, z, y = Infinity) {
    let h = this.queryMain(x, z).height;
    if (this.ramps) {
      const r = this.onRamp(x, z, { height: h }).height;
      if (r <= y + 0.5) h = r;
    }
    for (const o of this.obstacleGrid?.get(Math.floor(x / 16) * 100003 + Math.floor(z / 16)) || []) {
      const top = o.y + o.h;
      if (top > h && top <= y + 0.5 && this.isTop(o) && onFoot(o, x, z)) h = top;
    }
    return h;
  }

  // Track sample i, or the nearest before it (up to 80 m back) that isn't
  // inside something solid: where to put a car back.
  clearIndex(i) {
    const blocked = (k) => {
      const [x, z, y] = [this.x[k], this.z[k], this.y[k]];
      return (this.obstacleGrid?.get(Math.floor(x / 16) * 100003 + Math.floor(z / 16)) || []).some((o) => o.y < y + 1.5 && o.y + o.h > y + 0.3 && this.isTop(o, k) && onFoot(o, x, z));
    };
    for (let k = i, n = 0; n <= 40; n++, k = this.wrap(k - 1)) {
      if (!blocked(k)) return k;
      if (!this.closed && k === 0) break;
    }
    return i;
  }

  // The lawns under a sprinkler are wet; an obstacle inside the walls is a wall.
  solidAt(x, z, y, g, foot = y) {
    let out = g;
    if (this.patches && (g.surface === SURFACE.OFFROAD || g.offRoad)) {
      const p = this.patchAt(x, z);
      if (p !== null) out = { ...g, surface: p };
    }
    if (this.sprinklers && out.surface === SURFACE.OFFROAD && this.wetAt(x, z)) out = { ...out, surface: SURFACE.WET };
    if (this.flood && floodWet(this.flood, x, z, y ?? g.height, this.time || 0)) out = { ...out, surface: SURFACE.WET };
    let pen = Math.abs(g.lateral) - this.wallDist;
    let hit = null;
    if (this.ramps) {
      out = this.onRamp(x, z, out, foot);
      if (out.rampHit) {
        // (Beside a ramp, below its surface: its side is a wall.)
        if (out.rampHit.p > pen) {
          pen = out.rampHit.p;
          hit = [out.rampHit.rx, out.rampHit.rz];
        }
        delete out.rampHit;
      }
    }
    // (The lockdown's bollards, while they're up.)
    const risen = this.lockdown ? lockdownBoxes(this.lockdown, Math.round((this.time || 0) * 60), x, z) : [];
    const fixed = this.obstacles ? this.obstacleGrid.get(Math.floor(x / 16) * 100003 + Math.floor(z / 16)) : null;
    const list = !fixed && !risen.length ? [] : risen.length ? [...(fixed || []), ...risen] : fixed;
    let stand = null; // the top of what it's on
    for (const o of list) {
      const top = this.isTop(o, g.index);
      if (top && foot !== undefined && foot >= o.y + o.h - STEP_UP) {
        // Up on it: its top is the ground.
        if (onFoot(o, x, z) && (stand === null || o.y + o.h > stand)) stand = o.y + o.h;
        continue;
      }
      if (y !== undefined && (y > o.y + o.h + 0.3 || y < o.y - 2.5)) continue;
      if (top && o.poly) {
        // (Its own outline, not the box round it.)
        const q = polyDepth(o.poly, x, z);
        if (q && q.d > pen) {
          pen = q.d;
          hit = q.r;
        }
        continue;
      }
      const dx = Math.sin(o.yaw || 0);
      const dz = Math.cos(o.yaw || 0);
      const u = (x - o.x) * dz - (z - o.z) * dx;
      const v = (x - o.x) * dx + (z - o.z) * dz;
      const du = Math.abs(u) - o.hw;
      const dv = Math.abs(v) - o.hd;
      const p = -Math.max(du, dv);
      if (p <= pen) continue;
      pen = p;
      // Into the obstacle, across whichever face is nearer.
      const su = u < 0 ? 1 : -1;
      const sv = v < 0 ? 1 : -1;
      hit = du > dv ? [dz * su, -dx * su] : [dx * sv, dz * sv];
    }
    if (stand !== null && stand > out.height) out = { ...out, height: stand, nx: 0, ny: 1, nz: 0, surface: SURFACE.ROAD };
    if (!hit) return out;
    return { ...out, lateral: this.wallDist + pen, rx: hit[0], rz: hit[1], trueLateral: g.trueLateral ?? g.lateral };
  }

  queryBranches(x, z, r) {
    let best = r;
    let bestPen = Math.abs(r.lateral) - this.wallDist;
    for (const b of this.branches) {
      const rb = b.track.queryMain(x, z, -1);
      if (rb.overrun > 1) continue;
      const pen = Math.abs(rb.lateral) - b.track.wallDist;
      if (pen < bestPen) {
        bestPen = pen;
        const span = this.closed ? (b.s1 - b.s0 + this.length) % this.length : b.s1 - b.s0;
        let s = b.s0 + (rb.s / b.track.length) * span;
        if (this.closed) s %= this.length;
        best = { ...rb, s, index: this.indexAtDistance(s), lateral: Math.sign(rb.lateral) * (Math.abs(rb.lateral) + this.wallDist - b.track.wallDist), onBranch: true };
      }
    }
    return best;
  }

  // Finds the closest point on the centreline to (x, z). `hint` is the index from
  // the previous query for the same object, which keeps the search local.
  queryMain(x, z, hint = -1) {
    const n = this.count;
    const xs = this.x;
    const zs = this.z;
    let best = -1;
    let bestD = Infinity;
    if (hint >= 0) {
      for (let k = -SEARCH_WINDOW; k <= SEARCH_WINDOW; k++) {
        let i = hint + k;
        if (this.closed) i = ((i % n) + n) % n;
        else if (i < 0 || i >= n) continue;
        const dx = x - xs[i];
        const dz = z - zs[i];
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (bestD > this.searchRadiusSq) best = -1;
    }
    if (best < 0) {
      bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const dx = x - xs[i];
        const dz = z - zs[i];
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }

    // Project onto the segment before and after the closest sample; keep the nearer.
    const prev = this.closed ? (best - 1 + n) % n : Math.max(best - 1, 0);
    const next = this.closed ? (best + 1) % n : Math.min(best + 1, n - 1);
    const a = this.project(prev, best, x, z);
    const b = this.project(best, next, x, z);
    const seg = a.d < b.d ? a : b;
    const { i0, i1, u } = seg;

    let rx = this.rx[i0] + (this.rx[i1] - this.rx[i0]) * u;
    let rz = this.rz[i0] + (this.rz[i1] - this.rz[i0]) * u;
    const rl = Math.hypot(rx, rz);
    rx /= rl;
    rz /= rl;
    let nx = this.nx[i0] + (this.nx[i1] - this.nx[i0]) * u;
    let ny = this.ny[i0] + (this.ny[i1] - this.ny[i0]) * u;
    let nz = this.nz[i0] + (this.nz[i1] - this.nz[i0]) * u;
    const nl = Math.hypot(nx, ny, nz);
    nx /= nl;
    ny /= nl;
    nz /= nl;

    const lateral = (x - seg.px) * rx + (z - seg.pz) * rz;
    const abs = Math.abs(lateral);
    const s = this.s[i0] + u * this.step;
    // Where the walls are nearer than wallDist (a narrow section, a narrower
    // street) the reported lateral is shifted so |lateral| - wallDist is still the
    // penetration into the nearer wall, as for shortcut branches.
    const varied = this.narrows || this.sections;
    const squeeze = varied ? this.wallDist - this.localWall(s) : 0;
    const half = varied ? this.localHalf(s) : this.halfWidth;
    const sec = this.sections ? this.sectionOf(s) : null;
    const road = this.surfaceAll ?? sec?.surface ?? SURFACE.ROAD;
    // (Off the road: grass, or a roof deck's concrete where the section says so.)
    const surface = abs <= half ? road : abs <= half + Math.max(this.curbWidth, sec?.walk || 0) ? (this.surfaceAll ?? SURFACE.CURB) : sec?.off ?? SURFACE.OFFROAD;
    let reported = squeeze > 0 ? Math.sign(lateral) * (abs + squeeze) : lateral;
    // A banked cross-section (the storm drain): a flat bed, a trench, sloped walls.
    let lift = 0;
    if (sec?.bank) {
      const b = sec.bank;
      const d = Math.abs(lateral - b.c);
      if (d > b.flat) {
        lift = Math.min(b.rise, (d - b.flat) * b.slope);
        if (lift < b.rise) {
          const sg = Math.sign(lateral - b.c);
          const tx = nx - rx * b.slope * sg;
          const tz = nz - rz * b.slope * sg;
          const tl = Math.hypot(tx, ny, tz);
          nx = tx / tl;
          ny /= tl;
          nz = tz / tl;
        }
      }
    }
    if (sec?.trench && sec.trench.half && Math.abs(lateral - sec.trench.c) < sec.trench.half) lift -= sec.trench.depth;
    // Inside the median: a wall pushing out to the side the point is on.
    const median = this.medians ? this.medianAt(s) : 0;
    if (median && abs < median && median - abs > abs + squeeze - this.wallDist) reported = -(Math.sign(lateral) || 1) * (this.wallDist + median - abs);

    return {
      index: best,
      s,
      lateral: reported,
      trueLateral: lateral,
      overrun: Math.sqrt(Math.max(0, seg.d - lateral * lateral)), // distance past an open end

      height: this.y[i0] + (this.y[i1] - this.y[i0]) * u - this.gapDrop(this.s[i0] + u * this.step) + lift,
      nx,
      ny,
      nz,
      rx,
      rz,
      surface,
      offRoad: abs > half,
    };
  }

  project(i0, i1, x, z) {
    const ax = this.x[i0];
    const az = this.z[i0];
    const dx = this.x[i1] - ax;
    const dz = this.z[i1] - az;
    const len2 = dx * dx + dz * dz;
    let u = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
    u = Math.min(1, Math.max(0, u));
    const px = ax + dx * u;
    const pz = az + dz * u;
    return { i0, i1, u, px, pz, d: (x - px) ** 2 + (z - pz) ** 2 };
  }
}

// Centripetal Catmull-Rom through the control points.
function densify(points, closed, perSegment) {
  const n = points.length;
  const segs = closed ? n : n - 1;
  const out = [];
  const at = (i) => (closed ? points[((i % n) + n) % n] : points[Math.min(Math.max(i, 0), n - 1)]);
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let k = 0; k < perSegment; k++) out.push(catmullRom(p0, p1, p2, p3, k / perSegment));
  }
  if (!closed) out.push(points[n - 1]);
  return out;
}

function catmullRom(p0, p1, p2, p3, t) {
  const knot = (a, b) => Math.max(Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])), 1e-4);
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const mix = (a, b, ta, tb) => {
    const wa = (tb - u) / (tb - ta);
    const wb = (u - ta) / (tb - ta);
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

// Resamples a polyline to evenly spaced points by arc length.
function resample(dense, closed, spacing) {
  const pts = closed ? [...dense, dense[0]] : dense;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const total = cum[cum.length - 1];
  const count = Math.max(4, Math.round(total / spacing));
  const step = total / count;
  const out = [];
  const last = closed ? count - 1 : count;
  let j = 1;
  for (let k = 0; k <= last; k++) {
    const target = k * step;
    while (j < cum.length - 1 && cum[j] < target) j++;
    const a = pts[j - 1];
    const b = pts[j];
    const segLen = cum[j] - cum[j - 1];
    const u = segLen > 0 ? (target - cum[j - 1]) / segLen : 0;
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]);
  }
  return { points: out, length: total, step };
}

function bounds2(p) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [x, z] of p) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  return [x0, x1, z0, z1];
}
