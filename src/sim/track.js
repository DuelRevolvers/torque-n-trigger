// Track geometry for the simulation: a spline centreline resampled at a fixed
// spacing, with a fast "where am I relative to the road" query used for wheel
// raycasts, walls and lap progress. Rendering builds its meshes from the same data.

export const SURFACE = Object.freeze({ ROAD: 0, CURB: 1, OFFROAD: 2 });

const SEARCH_WINDOW = 16; // samples either side of the hint index

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
  const jumps = (def.jumps || []).map((j) => ({ s: j.frac !== undefined ? j.frac * pts.length : j.s, len: j.len, height: j.height }));
  for (const j of jumps) {
    pts.points.forEach((pt, i) => {
      const s = i * pts.step;
      if (s >= j.s && s <= j.s + j.len) pt[1] += (j.height * (s - j.s)) / j.len;
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
  const track = new Track(name, pts, closed, { halfWidth, curbWidth, shoulderWidth });
  track.jumps = jumps;
  track.gaps = gaps.length ? gaps : null;
  // Shortcut branches: narrow roads that leave the main line at s0 and rejoin at s1.
  if (def.branches?.length) {
    track.branches = def.branches.map((b) => ({
      track: buildTrack({ ...b, closed: false, halfWidth: b.halfWidth ?? 6, curbWidth: 0.8, shoulderWidth: 2, spacing }),
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
  }

  // How far the ground falls away at distance s (over a gap between rooftops).
  gapDrop(s) {
    if (!this.gaps) return 0;
    for (const g of this.gaps) if (s > g.s0 && s < g.s1) return g.drop;
    return 0;
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
  query(x, z, hint = -1) {
    const r = this.queryMain(x, z, hint);
    if (!this.branches) return r;
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
    const surface =
      abs <= this.halfWidth
        ? SURFACE.ROAD
        : abs <= this.halfWidth + this.curbWidth
          ? SURFACE.CURB
          : SURFACE.OFFROAD;

    return {
      index: best,
      s: this.s[i0] + u * this.step,
      lateral,
      overrun: Math.sqrt(Math.max(0, seg.d - lateral * lateral)), // distance past an open end

      height: this.y[i0] + (this.y[i1] - this.y[i0]) * u - this.gapDrop(this.s[i0] + u * this.step),
      nx,
      ny,
      nz,
      rx,
      rz,
      surface,
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
