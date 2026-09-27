// Enclosed arena venue. Implements the same query interface as Track, so the
// vehicle, combat and camera code work unchanged: `lateral` is set so that
// |lateral| - wallDist is the penetration into the nearest wall or obstacle, and
// (rx, rz) points into that wall.

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
    this.half = def.size / 2;
    this.halfWidth = this.half;
    this.wallDist = WALL_DIST;
    this.minY = 0;
    this.count = 1;
    this.length = 1;
    this.step = 1;
    this.bounds = { minX: -this.half, maxX: this.half, minZ: -this.half, maxZ: this.half };
  }

  wrap() {
    return 0;
  }

  indexAtDistance() {
    return 0;
  }

  // Ramp height and surface normal at (x, z).
  ground(x, z) {
    for (const r of this.def.ramps) {
      const dx = x - r.x;
      const dz = z - r.z;
      const u = dx * r.dirX + dz * r.dirZ; // along the ramp
      const v = -dx * r.dirZ + dz * r.dirX; // across it
      if (u >= 0 && u <= r.len && Math.abs(v) <= r.width / 2) {
        const slope = r.height / r.len;
        const n = Math.hypot(slope, 1);
        return { h: slope * u, nx: (-r.dirX * slope) / n, ny: 1 / n, nz: (-r.dirZ * slope) / n };
      }
    }
    return { h: 0, nx: 0, ny: 1, nz: 0 };
  }

  query(x, z) {
    const g = this.ground(x, z);
    // Deepest penetration into the outer walls or any obstacle (negative = clear).
    let pen = -Infinity;
    let rx = 1;
    let rz = 0;
    const walls = [
      [x - this.half, 1, 0], [-this.half - x, -1, 0],
      [z - this.half, 0, 1], [-this.half - z, 0, -1],
    ];
    for (const [d, wx, wz] of walls) {
      if (d > pen) {
        pen = d;
        rx = wx;
        rz = wz;
      }
    }
    for (const o of this.def.obstacles) {
      const dx = Math.abs(x - o.x) - o.hw;
      const dz = Math.abs(z - o.z) - o.hd;
      const outside = Math.max(dx, dz);
      const p = -outside; // > 0 inside the box
      if (p > pen) {
        pen = p;
        if (dx > dz) {
          rx = Math.sign(o.x - x) || 1;
          rz = 0;
        } else {
          rx = 0;
          rz = Math.sign(o.z - z) || 1;
        }
      }
    }
    return { index: 0, s: 0, lateral: WALL_DIST + pen, height: g.h, nx: g.nx, ny: g.ny, nz: g.nz, rx, rz, surface: 0 };
  }

  // Spawn points on a ring, facing the centre.
  spawnPose(slot) {
    const n = this.def.spawns;
    const a = (slot / n) * Math.PI * 2 + 0.3;
    const r = this.def.spawnRadius;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    return { pos: { x, y: 0.9, z }, yaw: yawFromDirection(-x, -z) };
  }

  hazardAt(x, z) {
    return this.def.hazards.find((h) => Math.hypot(x - h.x, z - h.z) < h.r) || null;
  }
}
