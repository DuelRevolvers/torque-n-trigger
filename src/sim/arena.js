// Enclosed arena venue. Implements the same query interface as Track, so the
// vehicle, combat and camera code work unchanged: `lateral` is set so that
// |lateral| - wallDist is the penetration into the nearest wall or obstacle, and
// (rx, rz) points into that wall. Arenas can be rectangular and placed anywhere
// (cx, cz, y) - city arenas sit in a district's arena lot.
//
// Verticality: platforms (raised decks; `under` decks are bridges you can drive
// beneath), lifts (pads that rise and fall) and sweepers (rotating electrified
// bars). Queries take the height being tested (y): on top of a deck it's ground,
// beside it it's a wall, underneath a bridge it's open, above a bar it's clear.
// Lifts, sweepers and movers (a swinging crane hook, a rolling overhead crane)
// move with setTime(), driven from the world tick. Obstacles and decks may be
// rotated (yaw). Holes can be pits you fall into: a ring-out in an arena, or a
// respawn in free roam.

import { yawFromDirection } from './math.js';
import { wetAt } from './sprinklers.js';
import { floodAt, inSurge, sumpWetAt } from './flood.js';

const WALL_DIST = 1000;
const GRID = 16; // obstacle grid cell size (m)

export function buildArena(def) {
  return new Arena(def);
}

// A box's half extents along x and z, allowing for its yaw.
const extents = (o) => {
  if (!o.yaw) return [o.hw, o.hd];
  const c = Math.abs(Math.cos(o.yaw));
  const s = Math.abs(Math.sin(o.yaw));
  return [o.hw * c + o.hd * s, o.hw * s + o.hd * c];
};

const inPoly = (x, z, p) => {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i];
    const [xj, zj] = p[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};

const boxOf = (p) => {
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
};

// A path mover's place on its loop at time t: position and heading.
export function pathPose(m, t) {
  if (!m.cum) {
    m.cum = [0];
    for (let k = 1; k < m.path.length; k++) m.cum.push(m.cum[k - 1] + Math.hypot(m.path[k][0] - m.path[k - 1][0], m.path[k][1] - m.path[k - 1][1]));
  }
  const L = m.cum[m.cum.length - 1];
  const s = (((m.phase || 0) + m.speed * t) % L + L) % L;
  let k = 1;
  while (k < m.cum.length - 1 && m.cum[k] < s) k++;
  const [ax, az] = m.path[k - 1];
  const [bx, bz] = m.path[k];
  const u = (s - m.cum[k - 1]) / Math.max(1e-6, m.cum[k] - m.cum[k - 1]);
  return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, yaw: Math.atan2(bx - ax, bz - az) };
}

// (x, z) in a rotated box's frame: across (along hw) and along (along hd).
const toLocal = (o, x, z) => {
  const dx = Math.sin(o.yaw);
  const dz = Math.cos(o.yaw);
  return [(x - o.x) * dz - (z - o.z) * dx, (x - o.x) * dx + (z - o.z) * dz];
};

class Arena {
  constructor(def) {
    this.name = def.name;
    this.isArena = true;
    this.closed = false;
    this.def = def;
    def.platforms ||= [];
    def.lifts ||= [];
    def.sweepers ||= [];
    def.movers ||= [];
    this.time = 0;
    this.cx = def.cx || 0;
    this.cz = def.cz || 0;
    this.y0 = def.y || 0;
    this.halfX = (def.sizeX ?? def.size) / 2;
    this.halfZ = (def.sizeZ ?? def.size) / 2;
    this.half = Math.max(this.halfX, this.halfZ);
    this.halfWidth = this.half;
    this.wallDist = WALL_DIST;
    this.minY = def.minY ?? this.y0;
    this.heightAt = def.heightAt || null; // free roam: follows the district's hills (world y)
    this.holes = def.holes || [];
    this.train = def.train || null;
    this.truck = def.truck || null;
    this.rv = def.rv || null;
    this.breakables = def.breakables?.length ? def.breakables : null; // world coordinates
    this.sprinklers = def.sprinklers?.length ? def.sprinklers : null; // world coordinates
    this.gusts = def.gusts || null; // the river gusts (Chrome Heights)
    this.flood = def.flood || null; // the flash flood (the Undercity)
    this.ceilingAt = def.ceilingAt || null; // what's overhead, for the camera
    if (def.gustExposure) this.gustExposure = (car) => def.gustExposure(car.pos.x, car.pos.z);
    if (def.obstacles.length > 64) {
      this.grid = new Map();
      for (const o of def.obstacles) {
        const [ex, ez] = extents(o);
        for (let a = Math.floor((o.x - ex) / GRID); a <= Math.floor((o.x + ex) / GRID); a++) {
          for (let b = Math.floor((o.z - ez) / GRID); b <= Math.floor((o.z + ez) / GRID); b++) {
            const k = a * 100003 + b;
            if (!this.grid.has(k)) this.grid.set(k, []);
            this.grid.get(k).push(o);
          }
        }
      }
    }
    this.count = 1;
    this.length = 1;
    this.step = 1;
    this.bounds = { minX: this.cx - this.halfX, maxX: this.cx + this.halfX, minZ: this.cz - this.halfZ, maxZ: this.cz + this.halfZ };
  }

  wrap() {
    return 0;
  }

  setTime(t) {
    this.time = t;
  }

  liftTop(l) {
    return l.hMax * (0.5 - 0.5 * Math.cos((2 * Math.PI * this.time) / l.period + l.phase));
  }

  sweeperAngle(s) {
    return s.phase + s.speed * this.time;
  }

  // Where a mover (crane hook, shuttle bus) is now, arena-local: [x, z, yaw].
  moverAt(m) {
    const t = this.time;
    if (m.path) {
      const p = pathPose(m, t);
      return [p.x, p.z, p.yaw];
    }
    return [m.x + m.ax * Math.sin((2 * Math.PI * t) / m.px + m.phase), m.z + m.az * Math.sin((2 * Math.PI * t) / m.pz + m.phase), 0];
  }

  // The hole at world (wx, wz), if any.
  holeAt(wx, wz) {
    const x = wx - this.cx;
    const z = wz - this.cz;
    return this.holes.find((hl) => (hl.poly ? inPoly(x, z, hl.poly) : x > hl.r[0] && x < hl.r[1] && z > hl.r[2] && z < hl.r[3])) || null;
  }

  isHole(wx, wz) {
    return !!this.holeAt(wx, wz);
  }

  // A car that has dropped into a pit: 'ringOut' (arena) or 'respawn' (free roam).
  fellIn(pos) {
    const hl = this.holeAt(pos.x, pos.z);
    // Dropped well below the ground round it (a pool is shallower than the bay).
    if (!hl) return null;
    // (Off a roof: measured from the arena's own floor, not the streets far below.)
    const base = this.heightAt && !hl.ringOut ? this.heightAt(pos.x, pos.z) : this.y0;
    if (pos.y > base - Math.min(3, (hl.drop || 3) * 0.6)) return null;
    return hl.ringOut ? 'ringOut' : hl.respawn ? 'respawn' : null;
  }

  indexAtDistance() {
    return 0;
  }

  // Ground height and normal at arena-local (x, z): holes (water, the gaps
  // between rooftops), then ramps, then spiral ramp towers (the level under a
  // car at height ly), then the floor (flat, or the district's hills in free roam).
  ground(x, z, ly) {
    const base = this.heightAt ? this.heightAt(x + this.cx, z + this.cz) - this.y0 : 0;
    for (const hl of this.holes) {
      const r = hl.r;
      if (hl.poly ? inPoly(x, z, hl.poly) : x > r[0] && x < r[1] && z > r[2] && z < r[3]) return { h: base - hl.drop, nx: 0, ny: 1, nz: 0 };
    }
    for (const r of this.def.ramps) {
      const dx = x - r.x;
      const dz = z - r.z;
      const u = dx * r.dirX + dz * r.dirZ; // along the ramp
      const v = -dx * r.dirZ + dz * r.dirX; // across it
      if (u >= 0 && u <= r.len && Math.abs(v) <= r.width / 2) {
        const slope = r.height / r.len;
        const n = Math.hypot(slope, 1);
        // (A kicker over a canyon stands at its own height, abs, not on the ground below.)
        const from = r.abs !== undefined ? r.abs - this.y0 : base + (r.base || 0);
        return { h: from + slope * u, nx: (-r.dirX * slope) / n, ny: 1 / n, nz: (-r.dirZ * slope) / n, top: true, surface: r.surface };
      }
    }
    // A tunnel under the ground: a car below the surface in its line is on its road.
    for (const tu of this.def.tunnels || []) {
      if (ly === undefined) break;
      let best = null;
      for (let k = 0; k + 1 < tu.pts.length; k++) {
        const a = tu.pts[k];
        const b = tu.pts[k + 1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const t = Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / (L * L || 1)));
        const d = Math.hypot(x - a[0] - (b[0] - a[0]) * t, z - a[1] - (b[1] - a[1]) * t);
        if (d <= tu.half && (!best || d < best.d)) best = { d, y: tu.heights[k] + (tu.heights[k + 1] - tu.heights[k]) * t };
      }
      if (!best) continue;
      const top = (this.heightAt ? this.heightAt(x + this.cx, z + this.cz) : 0) - this.y0;
      const y = best.y - this.y0;
      if (top - y > 2.5 && ly < top - 1) return { h: y, nx: 0, ny: 1, nz: 0, top: true, surface: 0 };
    }
    for (const sp of this.def.spirals || []) {
      const dx = x - sp.cx;
      const dz = z - sp.cz;
      if (Math.abs(Math.hypot(dx, dz) - sp.r) > sp.half) continue;
      const total = sp.turns * Math.PI * 2;
      let a = (Math.atan2(dz, dx) - sp.a0) * sp.dir;
      a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      let best = null;
      for (let t = a; t <= total + 1e-6; t += Math.PI * 2) {
        const y = sp.yTop + ((sp.yBot - sp.yTop) * t) / total - this.y0;
        if ((ly === undefined || y <= ly + 1.5) && (best === null || y > best)) best = y;
      }
      if (best !== null) return { h: best, nx: 0, ny: 1, nz: 0, top: true, surface: 0 };
    }
    if (this.heightAt) {
      const wx = x + this.cx;
      const wz = z + this.cz;
      const gx = (this.heightAt(wx + 1, wz) - this.heightAt(wx - 1, wz)) / 2;
      const gz = (this.heightAt(wx, wz + 1) - this.heightAt(wx, wz - 1)) / 2;
      const n = Math.hypot(gx, 1, gz);
      return { h: base, nx: -gx / n, ny: 1 / n, nz: -gz / n };
    }
    return { h: 0, nx: 0, ny: 1, nz: 0 };
  }

  // Obstacles near arena-local (x, z): all of them, or (free roam has
  // thousands) the ones in the grid cells around the point.
  nearObstacles(x, z) {
    if (!this.grid) return this.def.obstacles;
    const i = Math.floor(x / GRID);
    const j = Math.floor(z / GRID);
    const out = [];
    for (let a = i - 1; a <= i + 1; a++) {
      for (let b = j - 1; b <= j + 1; b++) {
        const list = this.grid.get(a * 100003 + b);
        if (list) for (const o of list) out.push(o);
      }
    }
    return out;
  }

  query(wx, wz, hint, y) {
    const x = wx - this.cx;
    const z = wz - this.cz;
    const ly = y === undefined ? undefined : y - this.y0;
    const g = this.ground(x, z, ly);
    // Deepest penetration into the outer walls or any obstacle (negative = clear).
    let pen = -Infinity;
    let rx = 1;
    let rz = 0;
    const walls = [
      [x - this.halfX, 1, 0], [-this.halfX - x, -1, 0],
      [z - this.halfZ, 0, 1], [-this.halfZ - z, 0, -1],
    ];
    for (const [d, wxd, wzd] of walls) {
      if (d > pen) {
        pen = d;
        rx = wxd;
        rz = wzd;
      }
    }
    const boxWall = (bx, bz, hw, hd) => {
      const dx = Math.abs(x - bx) - hw;
      const dz = Math.abs(z - bz) - hd;
      const p = -Math.max(dx, dz); // > 0 inside the box
      if (p > pen) {
        pen = p;
        if (dx > dz) {
          rx = Math.sign(bx - x) || 1;
          rz = 0;
        } else {
          rx = 0;
          rz = Math.sign(bz - z) || 1;
        }
      }
    };
    // A rotated box: the same test in its own frame, the push turned back.
    const obbWall = (o) => {
      const [u, v] = toLocal(o, x, z);
      const du = Math.abs(u) - o.hw;
      const dv = Math.abs(v) - o.hd;
      const p = -Math.max(du, dv);
      if (p > pen) {
        pen = p;
        const dx = Math.sin(o.yaw);
        const dz = Math.cos(o.yaw);
        if (du > dv) {
          const sg = -Math.sign(u) || 1;
          rx = dz * sg;
          rz = -dx * sg;
        } else {
          const sg = -Math.sign(v) || 1;
          rx = dx * sg;
          rz = dz * sg;
        }
      }
    };
    // A convex polygon (the Palace podium): the nearest edge pushes back.
    const polyWall = (o) => {
      const p = o.poly;
      if (o.sgn === undefined) {
        let a = 0;
        for (let k = 0; k < p.length; k++) a += p[k][0] * p[(k + 1) % p.length][1] - p[(k + 1) % p.length][0] * p[k][1];
        o.sgn = a > 0 ? 1 : -1;
      }
      let best = Infinity;
      let bx = 0;
      let bz = 0;
      for (let k = 0; k < p.length; k++) {
        const [ax, az] = p[k];
        const [cx, cz] = p[(k + 1) % p.length];
        const L = Math.hypot(cx - ax, cz - az) || 1;
        const nx = (-(cz - az) / L) * o.sgn; // inward
        const nz = ((cx - ax) / L) * o.sgn;
        const d = (x - ax) * nx + (z - az) * nz;
        if (d < best) {
          best = d;
          bx = nx;
          bz = nz;
        }
      }
      if (best > pen) {
        pen = best;
        rx = bx;
        rz = bz;
      }
    };
    for (const o of this.nearObstacles(x, z)) {
      if (ly !== undefined && o.h && ly > (o.y || 0) + o.h + 0.3) continue; // flying over it
      if (ly !== undefined && (o.y || 0) > ly + 2.5) continue; // driving under it (the Palace Underpass)
      if (o.poly) polyWall(o);
      else if (o.yaw) obbWall(o);
      else boxWall(o.x, o.z, o.hw, o.hd);
    }
    // Decks and lifts: ground when you're on top, a wall when you're beside.
    const deck = (p, top) => {
      if (p.yaw) {
        const [u, v] = toLocal(p, x, z);
        if (Math.abs(u) > p.hw || Math.abs(v) > p.hd) return;
      } else if (Math.abs(x - p.x) > p.hw || Math.abs(z - p.z) > p.hd) return;
      if (ly !== undefined && ly > top - 1) {
        if (top > g.h) Object.assign(g, { h: top, nx: 0, ny: 1, nz: 0, top: true, surface: 0 });
        return;
      }
      if (p.under && (ly === undefined || ly < top - (p.thick || 0.8) - 1.2)) return; // under the bridge
      if (p.yaw) obbWall(p);
      else boxWall(p.x, p.z, p.hw, p.hd);
    };
    for (const p of this.def.platforms) deck(p, p.h);
    for (const l of this.def.lifts) deck(l, this.liftTop(l));
    // Movers: a heavy block at car height (clear it by jumping).
    for (const m of this.def.movers) {
      if (ly !== undefined && (ly > m.y0 + m.h + 0.3 || ly < m.y0 - 1.5)) continue;
      const [mx, mz, yaw] = this.moverAt(m);
      if (Math.abs(x - mx) > m.hw + m.hd + 40 || Math.abs(z - mz) > m.hw + m.hd + 40) continue;
      if (yaw) obbWall({ x: mx, z: mz, hw: m.hw, hd: m.hd, yaw });
      else boxWall(mx, mz, m.hw, m.hd);
    }
    // Sweepers: rotating bars at car height (clear them by jumping).
    for (const s of this.def.sweepers) {
      if (ly !== undefined && ly > s.height + 0.3) continue;
      const a = this.sweeperAngle(s);
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const lx = c * (x - s.x) + sn * (z - s.z);
      const lz = -sn * (x - s.x) + c * (z - s.z);
      const ex = Math.abs(lx) - s.len;
      const ez = Math.abs(lz) - s.width / 2;
      const p = -Math.max(ex, ez);
      if (p > pen) {
        pen = p;
        const [ix, iz] = ex > ez ? [-Math.sign(lx) || -1, 0] : [0, -Math.sign(lz) || -1];
        rx = c * ix - sn * iz;
        rz = sn * ix + c * iz;
      }
    }
    return { index: 0, s: 0, lateral: WALL_DIST + pen, height: this.y0 + g.h, nx: g.nx, ny: g.ny, nz: g.nz, rx, rz, surface: g.top ? g.surface ?? 0 : this.surfaceAt(x, z) };
  }

  // The ground's surface at arena-local (x, z): the district's own (free roam
  // in a suburb: groundSurface, world coordinates), else the first of
  // def.surfaces ({ poly, surface }) it's inside, else road. A lawn under a
  // sprinkler is wet.
  surfaceAt(x, z) {
    let s = 0;
    if (this.def.groundSurface) s = this.def.groundSurface(x + this.cx, z + this.cz);
    else if (this.def.surfaces) {
      for (const q of this.def.surfaces) {
        const b = q.box || (q.box = boxOf(q.poly));
        if (x < b[0] || x > b[1] || z < b[2] || z > b[3] || !inPoly(x, z, q.poly)) continue;
        s = q.surface;
        break;
      }
    }
    if (s === 2 && this.sprinklers && this.wetAt(x + this.cx, z + this.cz)) return 4;
    if (this.flood) {
      const at = floodAt(this.flood, Math.round(this.time * 60));
      if (at && (sumpWetAt(this.flood, at, x + this.cx, z + this.cz) || inSurge(this.flood, at, x + this.cx, z + this.cz, (this.heightAt ? this.heightAt(x + this.cx, z + this.cz) : 0) + 0.5))) return 4;
    }
    return s;
  }

  wetAt(x, z) {
    return wetAt(this.sprinklers, this.time, x, z);
  }

  // Spawn points on a ring, facing the centre.
  spawnPose(slot) {
    if (this.def.spawnPoints) {
      const p = this.def.spawnPoints[slot % this.def.spawnPoints.length];
      return { pos: { x: this.cx + p.x, y: this.y0 + this.ground(p.x, p.z).h + 0.9, z: this.cz + p.z }, yaw: p.yaw };
    }
    if (this.def.spawnAt) {
      const p = this.def.spawnAt;
      return { pos: { x: p.x + slot * 6, y: this.y0 + this.ground(p.x + slot * 6 - this.cx, p.z - this.cz).h + 0.9, z: p.z }, yaw: p.yaw };
    }
    const n = this.def.spawns;
    const a = (slot / n) * Math.PI * 2 + 0.3;
    const r = this.def.spawnRadius;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    return { pos: { x: this.cx + x, y: this.y0 + 0.9, z: this.cz + z }, yaw: yawFromDirection(-x, -z) };
  }

  // Free roam recovery: back onto the nearest intersection.
  roadPose(pos) {
    let best = this.def.roadPoints[0];
    for (const p of this.def.roadPoints) if (Math.hypot(p[0] - pos.x, p[1] - pos.z) < Math.hypot(best[0] - pos.x, best[1] - pos.z)) best = p;
    return { pos: { x: best[0], y: this.heightAt(best[0], best[1]) + 0.9, z: best[1] }, yaw: this.def.spawnAt.yaw };
  }

  // Floor plates (only at floor level) and contact with a sweeper bar.
  hazardAt(wx, wz, y) {
    const x = wx - this.cx;
    const z = wz - this.cz;
    const ly = y === undefined ? 0.6 : y - this.y0;
    if (ly < 1.5) {
      const plate = this.def.hazards.find((h) => Math.hypot(x - h.x, z - h.z) < h.r);
      if (plate) return plate;
    }
    for (const s of this.def.sweepers) {
      if (ly > s.height + 0.5) continue;
      const a = this.sweeperAngle(s);
      const lx = Math.cos(a) * (x - s.x) + Math.sin(a) * (z - s.z);
      const lz = -Math.sin(a) * (x - s.x) + Math.cos(a) * (z - s.z);
      if (Math.abs(lx) < s.len + 1.2 && Math.abs(lz) < s.width / 2 + 1.6) return { dps: 45 };
    }
    for (const m of this.def.movers) {
      if (ly > m.y0 + m.h + 0.5 || ly < m.y0 - 1.5) continue;
      const [mx, mz, yaw] = this.moverAt(m);
      const [u, v] = yaw ? toLocal({ x: mx, z: mz, yaw }, x, z) : [x - mx, z - mz];
      if (Math.abs(u) < m.hw + 1.4 && Math.abs(v) < m.hd + 1.4) return { dps: m.dps || 40 };
    }
    return null;
  }
}
