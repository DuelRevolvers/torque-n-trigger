// Small geometry builders shared by the district, arena and track views.

import * as THREE from 'three';

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
  const faces = [[0, 1, 2], [0, 2, 3], [1, 5, 2], [0, 3, 4], [3, 2, 5], [3, 5, 4]];
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

export function scaleUv(g, su, sv) {
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * su, uv.getY(k) * sv);
  return g;
}
