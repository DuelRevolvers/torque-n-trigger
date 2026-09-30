// 2D geometry on the ground plane ([x, z] points) for plan districts: polylines,
// polygons, rounded corners, offsets and overlap tests.

export const len2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// Signed area (positive: counter-clockwise with x right and z up).
export function polyArea(p) {
  let s = 0;
  for (let k = 0; k < p.length; k++) {
    const a = p[k];
    const b = p[(k + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function polyCentroid(p) {
  let cx = 0;
  let cz = 0;
  let a = 0;
  for (let k = 0; k < p.length; k++) {
    const [x0, z0] = p[k];
    const [x1, z1] = p[(k + 1) % p.length];
    const c = x0 * z1 - x1 * z0;
    a += c;
    cx += (x0 + x1) * c;
    cz += (z0 + z1) * c;
  }
  if (Math.abs(a) < 1e-9) return p.reduce((s, q) => [s[0] + q[0] / p.length, s[1] + q[1] / p.length], [0, 0]);
  return [cx / (3 * a), cz / (3 * a)];
}

export function pointInPoly(x, z, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i];
    const [xj, zj] = p[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function polyBounds(p) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of p) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

// Distance from (x, z) to segment a-b, and the parameter along it.
export function segDist(x, z, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0;
  return { d: Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t), t };
}

// Nearest point on a polyline: distance, arc length along it, and the point.
export function nearestOnLine(pts, x, z) {
  let best = { d: Infinity, s: 0, p: pts[0], k: 0 };
  let run = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const L = len2(pts[k], pts[k + 1]);
    const { d, t } = segDist(x, z, pts[k], pts[k + 1]);
    if (d < best.d) best = { d, s: run + t * L, p: [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t], k };
    run += L;
  }
  return best;
}

export function lineLength(pts) {
  let s = 0;
  for (let k = 0; k + 1 < pts.length; k++) s += len2(pts[k], pts[k + 1]);
  return s;
}

// The point and unit direction at arc length s along a polyline.
export function pointAlong(pts, s) {
  let run = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const L = len2(pts[k], pts[k + 1]);
    if (run + L >= s || k + 2 === pts.length) {
      const t = L > 0 ? Math.max(0, Math.min(1, (s - run) / L)) : 0;
      const dx = (pts[k + 1][0] - pts[k][0]) / (L || 1);
      const dz = (pts[k + 1][1] - pts[k][1]) / (L || 1);
      return { x: pts[k][0] + dx * L * t, z: pts[k][1] + dz * L * t, dx, dz };
    }
    run += L;
  }
  return { x: pts[0][0], z: pts[0][1], dx: 1, dz: 0 };
}

// The part of a polyline between arc lengths s0 and s1.
export function subLine(pts, s0, s1) {
  const out = [];
  const a = pointAlong(pts, s0);
  out.push([a.x, a.z]);
  let run = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    run += len2(pts[k], pts[k + 1]);
    if (run > s0 + 1e-6 && run < s1 - 1e-6) out.push(pts[k + 1]);
  }
  const b = pointAlong(pts, s1);
  out.push([b.x, b.z]);
  return out;
}

// A rounded corner at v between the straight runs from a and on to b: the arc
// of radius r tangent to both, sampled every `step` metres. It may take up to
// share1 and share2 of each run (half, where the next corner shares the run).
export function fillet(a, v, b, r, step = 3, share1 = 0.49, share2 = 0.49) {
  const L1 = len2(a, v);
  const L2 = len2(v, b);
  const d1 = [(v[0] - a[0]) / L1, (v[1] - a[1]) / L1];
  const d2 = [(b[0] - v[0]) / L2, (b[1] - v[1]) / L2];
  const cross = d1[0] * d2[1] - d1[1] * d2[0];
  const turn = Math.atan2(Math.abs(cross), d1[0] * d2[0] + d1[1] * d2[1]);
  if (turn < 1e-3) return [v];
  const tanH = Math.tan(turn / 2);
  const t = Math.min(r * tanH, share1 * L1, share2 * L2);
  const rr = t / tanH;
  const s1 = [v[0] - d1[0] * t, v[1] - d1[1] * t];
  const sign = Math.sign(cross);
  const c = [s1[0] - d1[1] * rr * sign, s1[1] + d1[0] * rr * sign];
  const a1 = Math.atan2(s1[1] - c[1], s1[0] - c[0]);
  const s2 = [v[0] + d2[0] * t, v[1] + d2[1] * t];
  let delta = Math.atan2(s2[1] - c[1], s2[0] - c[0]) - a1;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const m = Math.max(2, Math.ceil((Math.abs(delta) * rr) / step));
  const out = [];
  for (let q = 0; q <= m; q++) {
    const th = a1 + (delta * q) / m;
    out.push([c[0] + Math.cos(th) * rr, c[1] + Math.sin(th) * rr]);
  }
  return out;
}

// Intersection of the infinite lines p + t*d and q + u*e (null when parallel).
export function lineHit(p, d, q, e) {
  const den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den;
  return [p[0] + d[0] * t, p[1] + d[1] * t];
}

// Offsets a closed polygon inward, each edge k by off[k] (edge k runs from
// point k to point k+1). Sharp corners are bevelled instead of mitred far out.
// tidy: edges too short for their offset taken out (see below).
export function insetPoly(p, off, tidy = false) {
  const n = p.length;
  const sgn = polyArea(p) > 0 ? 1 : -1;
  const lines = [];
  for (let k = 0; k < n; k++) {
    const a = p[k];
    const b = p[(k + 1) % n];
    const L = len2(a, b) || 1;
    const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const nrm = [-d[1] * sgn, d[0] * sgn]; // toward the inside
    lines.push({ p: [a[0] + nrm[0] * off[k], a[1] + nrm[1] * off[k]], q: [b[0] + nrm[0] * off[k], b[1] + nrm[1] * off[k]], d });
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    const A = lines[(k - 1 + n) % n];
    const B = lines[k];
    const cross = A.d[0] * B.d[1] - A.d[1] * B.d[0];
    const hit = Math.abs(cross) > 0.02 ? lineHit(A.p, A.d, B.p, B.d) : null;
    const reach = 3 * Math.max(off[(k - 1 + n) % n], off[k]) + 2;
    // (Tidied, a thin wedge's tip is where its sides meet, however far in.)
    if (hit && (len2(hit, p[k]) <= reach || (tidy && cross * sgn > 0))) out.push({ pt: hit, edge: k });
    else if (tidy && !hit && A.d[0] * B.d[0] + A.d[1] * B.d[1] > 0) out.push({ pt: [(A.q[0] + B.p[0]) / 2, (A.q[1] + B.p[1]) / 2], edge: k }); // (nearly straight on)
    else {
      out.push({ pt: A.q, edge: (k - 1 + n) % n, bevel: true });
      if (len2(A.q, B.p) > 0.05) out.push({ pt: B.p, edge: k });
    }
  }
  // An edge too short for its offset turns round (the lines either side of it
  // crossed): it goes, and its neighbours meet instead, until none has.
  for (let guard = 0; tidy && guard < n && out.length > 3; guard++) {
    const m = out.length;
    const k = out.findIndex((q, i) => {
      if (q.bevel) return false;
      const r = out[(i + 1) % m].pt;
      const d = lines[q.edge].d;
      return (r[0] - q.pt[0]) * d[0] + (r[1] - q.pt[1]) * d[1] < -1e-6;
    });
    if (k < 0) break;
    const prev = out[(k - 1 + m) % m];
    const next = out[(k + 1) % m];
    const A = lines[prev.edge];
    const B = lines[next.edge];
    const hit = !prev.bevel && Math.abs(A.d[0] * B.d[1] - A.d[1] * B.d[0]) > 0.02 ? lineHit(A.p, A.d, B.p, B.d) : null;
    const pt = hit && len2(hit, out[k].pt) <= 3 * Math.max(...off) + 2 ? hit : [(out[k].pt[0] + next.pt[0]) / 2, (out[k].pt[1] + next.pt[1]) / 2];
    out.splice(k, 1);
    out[k % out.length] = { pt, edge: next.edge };
  }
  return out.map(({ pt, edge }) => ({ pt, edge })); // [{ pt, edge }]: pt starts the inset edge that came from original edge `edge`
}

// Separating-axis overlap test between two convex polygons.
export function convexOverlap(a, b, margin = 0) {
  for (const poly of [a, b]) {
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k];
      const q = poly[(k + 1) % poly.length];
      const nx = -(q[1] - p[1]);
      const nz = q[0] - p[0];
      const L = Math.hypot(nx, nz) || 1;
      let a0 = Infinity;
      let a1 = -Infinity;
      let b0 = Infinity;
      let b1 = -Infinity;
      for (const [x, z] of a) {
        const v = (x * nx + z * nz) / L;
        a0 = Math.min(a0, v);
        a1 = Math.max(a1, v);
      }
      for (const [x, z] of b) {
        const v = (x * nx + z * nz) / L;
        b0 = Math.min(b0, v);
        b1 = Math.max(b1, v);
      }
      if (a1 + margin <= b0 || b1 + margin <= a0) return false;
    }
  }
  return true;
}

// The corners of a rotated box { x, z, hw (across), hd (along), yaw }.
export function obbCorners(o) {
  const dx = Math.sin(o.yaw);
  const dz = Math.cos(o.yaw);
  const ax = dz * o.hw;
  const az = -dx * o.hw;
  const bx = dx * o.hd;
  const bz = dz * o.hd;
  return [[o.x - ax - bx, o.z - az - bz], [o.x + ax - bx, o.z + az - bz], [o.x + ax + bx, o.z + az + bz], [o.x - ax + bx, o.z - az + bz]];
}

// The axis-aligned box [x0, x1, z0, z1] around some points.
export function aabbOf(pts) {
  const b = polyBounds(pts);
  return [b.minX, b.maxX, b.minZ, b.maxZ];
}

// Clips a polygon to the half-plane where (x, z) . n >= c.
export function clipHalf(p, n, c) {
  const out = [];
  for (let k = 0; k < p.length; k++) {
    const a = p[k];
    const b = p[(k + 1) % p.length];
    const da = a[0] * n[0] + a[1] * n[1] - c;
    const db = b[0] * n[0] + b[1] * n[1] - c;
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

// Where segments a-b and c-d cross (null if they don't).
export function segHit(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
}
