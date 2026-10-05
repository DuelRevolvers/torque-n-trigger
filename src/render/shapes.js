// Small geometry builders shared by the district, arena and track views.

import * as THREE from 'three';
import { clipHalf, polyArea } from '../sim/geom2d.js';

// A flat polygon of any shape following the ground (yAt): its triangles cut
// into cells `cell` metres across, so it rises and falls inside as well as
// round its edge (sculpted ground, a big junction on a hill); finer inside
// fine.box (fine.cell apart: the sculpted ground's own grid). Every triangle
// faces up; UVs are world metres / uv.
export function drapePoly(poly, yAt, cell = 8, uv = 8, fine = null) {
  const pos = [];
  const uvs = [];
  const idx = [];
  // (The lines cutting it, between a and b: every `cell`, and every fine.cell across fine.box.)
  const lines = (a, b, f0, f1) => {
    const out = new Set([a, b]);
    for (let v = Math.ceil(a / cell) * cell; v < b; v += cell) out.add(v);
    if (fine) for (let v = Math.ceil(Math.max(a, f0) / fine.cell) * fine.cell; v < Math.min(b, f1); v += fine.cell) out.add(v);
    return [...out].sort((p, q) => p - q);
  };
  for (const t of THREE.ShapeUtils.triangulateShape(poly.map(([x, z]) => new THREE.Vector2(x, z)), [])) {
    const tri = t.map((q) => poly[q]);
    const xs = tri.map((p) => p[0]);
    const zs = tri.map((p) => p[1]);
    const X = lines(Math.min(...xs), Math.max(...xs), fine?.box[0], fine?.box[1]);
    const Z = lines(Math.min(...zs), Math.max(...zs), fine?.box[2], fine?.box[3]);
    for (let a = 0; a + 1 < X.length; a++) {
      for (let b = 0; b + 1 < Z.length; b++) {
        let piece = tri;
        for (const [n, c] of [[[1, 0], X[a]], [[-1, 0], -X[a + 1]], [[0, 1], Z[b]], [[0, -1], -Z[b + 1]]]) if (piece.length > 2) piece = clipHalf(piece, n, c);
        const area = piece.length > 2 ? polyArea(piece) : 0;
        if (Math.abs(area) < 1e-4) continue;
        const k = pos.length / 3;
        for (const [px, pz] of piece) {
          pos.push(px, yAt(px, pz), pz);
          uvs.push(px / uv, pz / uv);
        }
        for (let q = 1; q + 1 < piece.length; q++) idx.push(...(area < 0 ? [k, k + q, k + q + 1] : [k, k + q + 1, k + q]));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Points along a line no more than `step` metres apart (its own points kept).
export function densified(pts, step = 4) {
  const out = [pts[0]];
  for (let k = 1; k < pts.length; k++) {
    const [a, b] = [pts[k - 1], pts[k]];
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step);
    for (let i = 1; i < n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
    out.push(b);
  }
  return out;
}

// A box of w x h x d centred at (x, y, z), turned by yaw.
export const box = (w, h, d, x, y, z, yaw = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (yaw) g.rotateY(yaw);
  g.translate(x, y, z);
  return g;
};

// A rotated box footprint { x, z, hw (across), hd (along), yaw } from y0 up h.
export const obbBox = (o, h, y0) => {
  const g = new THREE.BoxGeometry(o.hw * 2, h, o.hd * 2);
  g.rotateY(o.yaw || 0);
  g.translate(o.x, y0 + h / 2, o.z);
  return g;
};

// A prism: a polygon of [x, z] points from y0 up h.
export function prism(poly, y0, h) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  g.translate(0, y0 + h, 0);
  return indexed(g);
}

// A flat polygon of [x, z] points at height y(x, z), facing up.
export function flatPoly(poly, y) {
  const pts = poly.map(([x, z]) => new THREE.Vector2(x, z));
  const tris = THREE.ShapeUtils.triangulateShape(pts, []);
  const pos = [];
  const uv = [];
  for (const [x, z] of poly) {
    pos.push(x, y(x, z), z);
    uv.push(x / 8, z / 8);
  }
  const idx = [];
  // Every triangle faces up, whichever way round the polygon runs.
  for (const [a, b, c] of tris) {
    const [ax, az] = poly[a];
    const [bx, bz] = poly[b];
    const [cx, cz] = poly[c];
    const up = (bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0;
    idx.push(...(up ? [a, b, c] : [a, c, b]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A ramp wedge in world space: rises `height` over `len` along (dirX, dirZ) from (x, z).
export function rampGeometry({ x, z, dirX, dirZ, len, width, height, base = 0 }, y = 0) {
  const g = new THREE.BufferGeometry();
  const w = width / 2;
  const P = [[-w, 0, 0], [w, 0, 0], [w, height, len], [-w, height, len], [-w, 0, len], [w, 0, len]];
  // Wound outward (slope, sides, back), so one-sided materials show it.
  const faces = [[0, 2, 1], [0, 3, 2], [1, 2, 5], [0, 4, 3], [3, 5, 2], [3, 4, 5]];
  const pos = [];
  const uvs = [];
  for (const f of faces) {
    for (const k of f) {
      pos.push(...P[k]);
      uvs.push(P[k][0] / 2, P[k][2] / 3);
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  g.rotateY(Math.atan2(dirX, dirZ));
  g.translate(x, y + base, z);
  return g;
}

// Colours every vertex (for vertex-coloured materials); gives non-indexed shapes
// an index so they merge with boxes.
export function tint(g, color) {
  indexed(g);
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let k = 0; k < colors.length; k += 3) colors.set([c.r, c.g, c.b], k);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export function indexed(g) {
  if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
  return g;
}

// A tire: a ring rOut across with a hole rIn across, h deep, centred on 0.
export function tireGeometry(rOut, rIn, h, n = 12) {
  const P = [[rIn, -h / 2], [rOut, -h / 2], [rOut, h / 2], [rIn, h / 2], [rIn, -h / 2]].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(P, n);
}

export function scaleUv(g, su, sv) {
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * su, uv.getY(k) * sv);
  return g;
}
