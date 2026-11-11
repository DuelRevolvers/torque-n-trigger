// The junctions of a plan district's roads, as shapes on the map: where each
// road stops, the outline of the junction's own surface, and the curve round
// each corner. render/planView.js draws them with kerbs and sidewalks;
// render/roofView.js (Chrome Heights) with edge lines.
import * as G from '../sim/geom2d.js';
import { densified } from './shapes.js';

// map: a plan district's (planMap). bumpy: its ground is sculpted (the
// corners get more points, to lie on it). Returns { junctions (clear, normal,
// shapes: see junctionShapes), junctionOutline(node), meet }.
export function makeJunctions(map, { bumpy = false } = {}) {
  const junctions = junctionShapes();
  return { junctions, junctionOutline, meet };

  // Junctions like real ones. Round a junction, each pair of neighbouring
  // roads has a corner: their kerbs (as the roads draw them, along their
  // curves) meet, and are joined by a curve (a kerb radius: a road bending
  // on its own gets a wide one; a tight angle a small nose, not a long cut).
  // Each road stops where its corners start, square across; the junction's
  // own surface covers the rest, round the outside of a bend too. A road
  // straight on through carries on. A street drawn in the SDK that ends on
  // its own gets a rounded end.
  // Returns { clear(e, 'a'|'b'): how far back from that end its road stops,
  // normal(e, end): the road's normal there (or null), shapes: node -> shape }.
  function junctionShapes() {
    const ends = new Map(); // 'edge:a|b' -> { c, n (the road's normal, a to b) }
    const shapes = new Map();
    const setEnd = (A, c, nrm) => ends.set(`${A.e.id}:${A.end}`, { c, n: A.end === 'a' ? nrm : [-nrm[0], -nrm[1]] });
    const armsAt = new Map(); // node id -> the roads into it
    for (const e of map.edgeList) {
      if (e.street.drain || e.street.tunnel) continue;
      for (const end of ['a', 'b']) {
        if (!map.nodes[e[end]].name) continue;
        if (!armsAt.has(e[end])) armsAt.set(e[end], []);
        armsAt.get(e[end]).push(armOf(e, end));
      }
    }
    for (const [id, arms] of armsAt) {
      const J = shapeOf(map.nodes[id], arms);
      if (J) shapes.set(id, J);
    }
    // (A junction with no room for a corner in its share of a road takes
    // what the junction at the road's other end leaves it.)
    const other = (A) => {
      const J = shapes.get(A.e[A.end === 'a' ? 'b' : 'a']);
      const B = J?.cap || J?.arms?.find((X) => X.e === A.e && X.end !== A.end);
      return { c: B?.c || 0, cramped: !!J?.cramped };
    };
    for (const [id, J] of shapes) {
      if (!J.cramped) continue;
      const arms = armsAt.get(id).map((A) => {
        const o = other(A);
        return armOf(A.e, A.end, o.cramped ? 0 : A.e.len - o.c - 1);
      });
      shapes.set(id, shapeOf(map.nodes[id], arms));
    }
    for (const J of shapes.values()) {
      if (J.straight) {
        // Straight on: the two roads meet square across the node, mitred.
        const [A, B] = J.arms;
        const u = [A.d[0] - B.d[0], A.d[1] - B.d[1]];
        const L = Math.hypot(u[0], u[1]) || 1;
        setEnd(A, 0, [-u[1] / L, u[0] / L]);
        setEnd(B, 0, [u[1] / L, -u[0] / L]);
      } else for (const A of J.cap ? [J.cap] : J.arms) setEnd(A, A.c, sideAt(A, A.c, 1));
    }
    return {
      clear: (e, end) => ends.get(`${e.id}:${end}`)?.c || 0,
      normal: (e, end) => ends.get(`${e.id}:${end}`)?.n || null,
      shapes,
    };
  }

  // A junction's shape from the roads into it: a dead end's rounded end
  // ({ cap }), straight on ({ straight }), or its corners ({ arms, corners }),
  // cramped where a corner had no room in the roads' share.
  function shapeOf(n, arms) {
    arms.sort((p, q) => p.a - q.a);
    if (arms.length === 1) {
      // A dead end (of a street drawn in the SDK): rounded.
      const A = arms[0];
      if (n.exit || !A.e.street.sdk) return null;
      A.c = Math.min(A.h, A.max);
      return { cap: A };
    }
    if (arms.length < 2) return null;
    const two = arms.length === 2;
    let cramped = false;
    const corners = arms.map((A, i) => {
      const B = arms[(i + 1) % arms.length];
      let phi = B.a - A.a;
      if (phi <= 0) phi += Math.PI * 2;
      if (phi >= Math.PI - 0.02) return { A, B, open: true }; // the outside of a bend, or a straight side
      const P = crossing(kerbOf(A, 1), kerbOf(B, -1));
      if (!P) {
        // (Kerbs that never meet: roads side by side, as far as they go.)
        A.need = A.max;
        B.need = B.max;
        cramped = true;
        return { A, B, open: true, apart: true };
      }
      // The curve round the corner, where the kerbs meet at angle psi.
      const fa = G.pointAlong(A.pts, Math.max(P.sA, 0));
      const fb = G.pointAlong(B.pts, Math.max(P.sB, 0));
      let psi = Math.atan2(fa.dx * fb.dz - fa.dz * fb.dx, fa.dx * fb.dx + fa.dz * fb.dz);
      if (psi <= 0) psi += Math.PI * 2;
      const R = 4 + Math.min(A.h, B.h) * (two ? 0.8 : 0.4);
      const want = psi < Math.PI - 0.01 ? Math.min(R / Math.tan(psi / 2), R * (two ? 2.5 : 1.3)) : 0;
      const T = Math.max(0, Math.min(want, A.max - P.sA, B.max - P.sB));
      if (T < want - 0.5) cramped = true;
      if (P.sA + T < 0 || P.sB + T < 0) return { A, B, open: true };
      A.need = Math.max(A.need, P.sA + T);
      B.need = Math.max(B.need, P.sB + T);
      return { A, B, P, sA: P.sA + T, sB: P.sB + T };
    });
    if (two && corners.every((k) => k.open)) return { straight: true, arms };
    for (const A of arms) A.c = Math.max(0, Math.min(A.need, A.max));
    return { arms, corners, two, cramped };
  }

  // A road as it leaves a junction (from its a or b end): its centreline out
  // from the junction, and how far along it the junction may reach.
  // (room: more of the road than its usual share, where it's free.)
  function armOf(e, end, room = 0) {
    const pts = end === 'a' ? e.pts : [...e.pts].reverse();
    const f = frame(pts, 0);
    return { e, end, pts, h: e.street.half, d: [f.dx, f.dz], a: Math.atan2(f.dz, f.dx), max: Math.min(Math.max(e.len * 0.45, room), 60), need: 0, walk: !!e.street.sidewalk, kerbs: {} };
  }

  // Where a polyline is at arc length s, and its heading: where s is on a
  // corner, the run after it (as a road's strip starting there has it); s < 0
  // runs straight on back from its start.
  function frame(pts, s) {
    let run = 0;
    let last = null;
    for (let k = 0; k + 1 < pts.length; k++) {
      const L = G.len2(pts[k], pts[k + 1]);
      if (L < 1e-6) continue;
      const dx = (pts[k + 1][0] - pts[k][0]) / L;
      const dz = (pts[k + 1][1] - pts[k][1]) / L;
      if (s < run + L - 1e-6) return { x: pts[k][0] + dx * (s - run), z: pts[k][1] + dz * (s - run), dx, dz };
      last = { x: pts[k + 1][0], z: pts[k + 1][1], dx, dz };
      run += L;
    }
    return last || { x: pts[0][0], z: pts[0][1], dx: 1, dz: 0 };
  }

  // The unit normal on one side of a road (+1: to the left of the way it leaves the junction).
  function sideAt(A, s, side) {
    const f = frame(A.pts, s);
    return [-f.dz * side, f.dx * side];
  }

  // A road's centre, or its edge on one side, at s along it from the junction.
  function roadPoint(A, s, side = 0) {
    const f = frame(A.pts, s);
    return [f.x - f.dz * side * A.h, f.z + f.dx * side * A.h];
  }

  // A road's kerb on one side, as its strip draws it (mitred at each point),
  // from a way back behind the junction out to as far as the junction may
  // reach: [{ s, x, z }].
  function kerbOf(A, side) {
    if (A.kerbs[side]) return A.kerbs[side];
    const P = A.pts;
    const back = A.h * 2 + 12;
    const out = [];
    const f0 = frame(P, 0);
    out.push({ s: -back, x: f0.x - f0.dx * back - f0.dz * side * A.h, z: f0.z - f0.dz * back + f0.dx * side * A.h });
    let run = 0;
    for (let k = 0; k < P.length; k++) {
      if (k) run += G.len2(P[k - 1], P[k]);
      if (run >= A.max) break;
      if (k && run - out[out.length - 1].s < 1e-3) continue;
      const a = P[Math.max(0, k - 1)];
      const b = P[Math.min(P.length - 1, k + 1)];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      out.push({ s: run, x: P[k][0] - ((b[1] - a[1]) / L) * side * A.h, z: P[k][1] + ((b[0] - a[0]) / L) * side * A.h });
    }
    const [x, z] = roadPoint(A, A.max, side);
    out.push({ s: A.max, x, z });
    return (A.kerbs[side] = out);
  }

  // A point on a kerb (kerbOf) at s.
  function kerbAt(K, s) {
    for (let k = 0; k + 1 < K.length; k++) {
      if (s > K[k + 1].s && k + 2 < K.length) continue;
      const t = Math.max(0, Math.min(1, (s - K[k].s) / (K[k + 1].s - K[k].s || 1)));
      return [K[k].x + (K[k + 1].x - K[k].x) * t, K[k].z + (K[k + 1].z - K[k].z) * t];
    }
    return [K[0].x, K[0].z];
  }

  // Where two kerbs meet (nearest the junction): { sA, sB, x, z }, or null.
  function crossing(KA, KB) {
    let best = null;
    for (let i = 0; i + 1 < KA.length; i++) {
      const [a, b] = [KA[i], KA[i + 1]];
      for (let j = 0; j + 1 < KB.length; j++) {
        const [c, d] = [KB[j], KB[j + 1]];
        const rx = b.x - a.x;
        const rz = b.z - a.z;
        const qx = d.x - c.x;
        const qz = d.z - c.z;
        const den = rx * qz - rz * qx;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((c.x - a.x) * qz - (c.z - a.z) * qx) / den;
        const u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const sA = a.s + (b.s - a.s) * t;
        const sB = c.s + (d.s - c.s) * u;
        if (!best || Math.abs(sA) + Math.abs(sB) < Math.abs(best.sA) + Math.abs(best.sB)) best = { sA, sB, x: a.x + rx * t, z: a.z + rz * t };
      }
    }
    return best;
  }

  // A curve from p0 (heading u0) to p2 (heading u2 there): a circle's arc
  // where it can be one (a conic through the point their headings meet), or
  // null where there's no curve to be had (straight on, or heading apart).
  function curveBetween(p0, u0, p2, u2, reach = 200) {
    const q = meet(p0, u0, p2, u2, reach);
    if (!q) return null;
    const cosT = u0[0] * u2[0] + u0[1] * u2[1];
    const turn = Math.acos(Math.max(-1, Math.min(1, cosT)));
    const w = Math.cos(turn / 2);
    const steps = Math.max(3, Math.ceil(turn / 0.12));
    return [...Array(steps + 1).keys()].map((i) => {
      const t = i / steps;
      const [a, b, c] = [(1 - t) ** 2, 2 * t * (1 - t) * w, t * t];
      const sum = a + b + c;
      return [(a * p0[0] + b * q[0] + c * p2[0]) / sum, (a * p0[1] + b * q[1] + c * p2[1]) / sum];
    });
  }

  // Where a line from p0 (heading u0) meets one arriving at p2 (heading u2),
  // ahead of the one and behind the other (within reach), or null.
  function meet(p0, u0, p2, u2, reach = 200) {
    const den = u0[0] * u2[1] - u0[1] * u2[0];
    const cosT = u0[0] * u2[0] + u0[1] * u2[1];
    if (Math.abs(den) < 0.02 && cosT > 0) return null;
    if (Math.abs(den) < 1e-6) return null;
    const wx = p2[0] - p0[0];
    const wz = p2[1] - p0[1];
    const l0 = (wx * u2[1] - wz * u2[0]) / den;
    const l2 = (wx * u0[1] - wz * u0[0]) / -den;
    if (l0 < 0.05 || l2 < 0.05 || l0 > reach || l2 > reach) return null;
    return [p0[0] + u0[0] * l0, p0[1] + u0[1] * l0];
  }

  // A corner's edge, from road A's end (its left side) round to road B's end
  // (its right): along A's kerb, the curve, along B's kerb.
  function cornerRun(k) {
    const { A, B } = k;
    const e0 = roadPoint(A, A.c, 1);
    const e2 = roadPoint(B, B.c, -1);
    const back = (X, s) => {
      const f = frame(X.pts, s);
      return [-f.dx, -f.dz];
    };
    const out = (X, s) => {
      const f = frame(X.pts, s);
      return [f.dx, f.dz];
    };
    if (k.open) return (!k.apart && curveBetween(e0, back(A, A.c), e2, out(B, B.c))) || [e0, e2];
    const KA = kerbOf(A, 1);
    const KB = kerbOf(B, -1);
    const ta = A.c - k.sA < 0.05 ? e0 : kerbAt(KA, k.sA);
    const tb = B.c - k.sB < 0.05 ? e2 : kerbAt(KB, k.sB);
    const run = [e0];
    for (let q = KA.length - 1; q >= 0; q--) if (KA[q].s < A.c - 0.05 && KA[q].s > k.sA + 0.05) run.push([KA[q].x, KA[q].z]);
    run.push(...(curveBetween(ta, back(A, k.sA), tb, out(B, k.sB), 80) || [ta, tb]));
    for (const p of KB) if (p.s > k.sB + 0.05 && p.s < B.c - 0.05) run.push([p.x, p.z]);
    run.push(e2);
    return run;
  }

  // A junction's outline: round it, each road's end, then the corner to the
  // next road. { poly, runs (the corners' kerbs, where both roads have
  // sidewalks: { pts, w0, w1 (the sidewalk's width at each end) }), sg (+1:
  // the outline runs anticlockwise), bend (a road bending on its own: the
  // line its markings follow round), fallback (an outline that crossed itself,
  // drawn as a hull), edges (every corner's run, sidewalks or not: the
  // rooftops' edge lines follow them) }.
  function junctionOutline(n) {
    const J = junctions.shapes.get(n.id);
    if (!J || J.straight) return null;
    let pts = [];
    const runs = [];
    const edges = []; // (every corner's run, sidewalks or not)
    if (J.cap) {
      const A = J.cap;
      const [cx, cz] = roadPoint(A, A.c);
      const [nx, nz] = sideAt(A, A.c, 1);
      const a0 = Math.atan2(nz, nx);
      const arc = [...Array(13).keys()].map((q) => [cx + Math.cos(a0 + (Math.PI * q) / 12) * A.h, cz + Math.sin(a0 + (Math.PI * q) / 12) * A.h]);
      pts.push(roadPoint(A, A.c, -1), ...arc.slice(0, -1));
      // (The lot's notch round a dead end is square, out to the sidewalk's edge: lot under all of it, the rounded sidewalk over.)
      const [f0, f1] = [frame(A.pts, 0), frame(A.pts, A.c)];
      const e = A.h + A.e.street.sidewalk;
      const rect = [[f0.x - f0.dz * e, f0.z + f0.dx * e], [f1.x - f1.dz * e, f1.z + f1.dx * e], [f1.x + f1.dz * e, f1.z - f1.dx * e], [f0.x + f0.dz * e, f0.z - f0.dx * e]];
      if (A.walk) runs.push({ pts: arc, w0: A.e.street.sidewalk, w1: A.e.street.sidewalk, rect, u0: [-f1.dx, -f1.dz], u1: [f1.dx, f1.dz] });
    } else {
      J.arms.forEach((A, i) => {
        pts.push(roadPoint(A, A.c, -1));
        const run = bumpy ? densified(cornerRun(J.corners[i]), 3) : cornerRun(J.corners[i]);
        pts.push(...run.slice(0, -1));
        edges.push(run);
        const B = J.corners[i].B;
        const [fa, fb] = [frame(A.pts, A.c), frame(B.pts, B.c)];
        if (A.walk && B.walk) runs.push({ pts: run, w0: A.e.street.sidewalk, w1: B.e.street.sidewalk, u0: [-fa.dx, -fa.dz], u1: [fb.dx, fb.dz] });
      });
    }
    pts = pts.filter((p, q) => Math.hypot(p[0] - pts[(q + pts.length - 1) % pts.length][0], p[1] - pts[(q + pts.length - 1) % pts.length][1]) > 0.02);
    if (pts.length < 3) return null;
    if (!simplePoly(pts)) return { poly: hull(pts), runs: [], edges: [], sg: 1, fallback: true };
    let area = 0;
    pts.forEach(([x, z], q) => (area += x * pts[(q + 1) % pts.length][1] - pts[(q + 1) % pts.length][0] * z));
    let bend = null;
    if (J.two) {
      const [A, B] = J.arms;
      const st = A.e.street;
      if (st.width === B.e.street.width && !st.median && st.surface !== 'dirt' && B.e.street.surface !== 'dirt') {
        const fa = frame(A.pts, A.c);
        const fb = frame(B.pts, B.c);
        const mid = curveBetween(roadPoint(A, A.c), [-fa.dx, -fa.dz], roadPoint(B, B.c), [fb.dx, fb.dz]);
        if (mid) bend = { pts: mid, st };
      }
    }
    return { poly: pts, runs, edges, sg: area > 0 ? 1 : -1, bend };
  }

  // No two of a polygon's edges cross?
  function simplePoly(p) {
    const n = p.length;
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    for (let i = 0; i < n; i++) {
      const [a, b] = [p[i], p[(i + 1) % n]];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const [c, d] = [p[j], p[(j + 1) % n]];
        if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) continue;
        const d1 = cross(a, b, c);
        const d2 = cross(a, b, d);
        const d3 = cross(c, d, a);
        const d4 = cross(c, d, b);
        if (((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))) return false;
      }
    }
    return true;
  }

  function hull(points) {
    const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const q of p) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
      lower.push(q);
    }
    const upper = [];
    for (const q of [...p].reverse()) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
      upper.push(q);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
  }
}
