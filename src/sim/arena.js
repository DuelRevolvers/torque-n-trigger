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
// Lifts and sweepers move with setTime(), driven from the world tick.

import { yawFromDirection } from './math.js';

const WALL_DIST = 1000;

export function buildArena(def) {
  return new Arena(def);
}

class Arena {
  constructor(def) {
    this.name = def.name;
    this.isArena = true;
    this.closed = false;
    this.def = def;
    def.platforms ||= [];
    def.lifts ||= [];
    def.sweepers ||= [];
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

  indexAtDistance() {
    return 0;
  }

  // Ramp height and surface normal at arena-local (x, z).
  ground(x, z) {
    for (const r of this.def.ramps) {
      const dx = x - r.x;
      const dz = z - r.z;
      const u = dx * r.dirX + dz * r.dirZ; // along the ramp
      const v = -dx * r.dirZ + dz * r.dirX; // across it
      if (u >= 0 && u <= r.len && Math.abs(v) <= r.width / 2) {
        const slope = r.height / r.len;
        const n = Math.hypot(slope, 1);
        return { h: (r.base || 0) + slope * u, nx: (-r.dirX * slope) / n, ny: 1 / n, nz: (-r.dirZ * slope) / n };
      }
    }
    if (this.heightAt) {
      const wx = x + this.cx;
      const wz = z + this.cz;
      const h = this.heightAt(wx, wz);
      const gx = (this.heightAt(wx + 1, wz) - this.heightAt(wx - 1, wz)) / 2;
      const gz = (this.heightAt(wx, wz + 1) - this.heightAt(wx, wz - 1)) / 2;
      const n = Math.hypot(gx, 1, gz);
      return { h: h - this.y0, nx: -gx / n, ny: 1 / n, nz: -gz / n };
    }
    return { h: 0, nx: 0, ny: 1, nz: 0 };
  }

  query(wx, wz, hint, y) {
    const x = wx - this.cx;
    const z = wz - this.cz;
    const ly = y === undefined ? undefined : y - this.y0;
    const g = this.ground(x, z);
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
    for (const o of this.def.obstacles) {
      if (ly !== undefined && o.h && ly > (o.y || 0) + o.h + 0.3) continue; // flying over it
      boxWall(o.x, o.z, o.hw, o.hd);
    }
    // Decks and lifts: ground when you're on top, a wall when you're beside.
    const deck = (p, top) => {
      if (Math.abs(x - p.x) > p.hw || Math.abs(z - p.z) > p.hd) return;
      if (ly !== undefined && ly > top - 1) {
        if (top > g.h) Object.assign(g, { h: top, nx: 0, ny: 1, nz: 0 });
        return;
      }
      if (p.under && (ly === undefined || ly < top - (p.thick || 0.8) - 1.2)) return; // under the bridge
      boxWall(p.x, p.z, p.hw, p.hd);
    };
    for (const p of this.def.platforms) deck(p, p.h);
    for (const l of this.def.lifts) deck(l, this.liftTop(l));
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
    return { index: 0, s: 0, lateral: WALL_DIST + pen, height: this.y0 + g.h, nx: g.nx, ny: g.ny, nz: g.nz, rx, rz, surface: 0 };
  }

  // Spawn points on a ring, facing the centre.
  spawnPose(slot) {
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
    return null;
  }
}
