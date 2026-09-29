import * as THREE from 'three';
import { movePoint, turnVector } from '../sim/layoutEdits.js';

// Draws a district's layout items with the T&T SDK's edits made (see
// sim/layoutEdits.js), using the view's own drawers. An edited item is drawn
// from its original data, and everything the drawing adds to the view's
// buckets is then moved rigidly into place: geometry, meshes, and records
// ({ x, z } points, [x, z] pairs, directions) gathered for building later. A
// removed item is drawn all the same and what it added thrown away, so every
// item after it comes out exactly as before (some drawers count or draw from
// a random stream as they go).
//
// buckets: what the view's drawers add to: plain objects of arrays (B), arrays,
// Maps of arrays or of { list } (texts by key), and the view's group (meshes
// added directly).
export function itemDrawer(...buckets) {
  const lists = () => {
    const out = [];
    for (const b of buckets) {
      if (!b) continue;
      if (b.isObject3D) out.push(b.children);
      else if (Array.isArray(b)) out.push(b);
      else if (b instanceof Map) for (const v of b.values()) out.push(Array.isArray(v) ? v : v.list);
      else for (const v of Object.values(b)) if (Array.isArray(v)) out.push(v);
    }
    return out;
  };
  return (it, draw) => {
    const xf = it.xf;
    if (!xf) return draw(it);
    if (xf.src.hidden) return undefined;
    const before = new Map(lists().map((l) => [l, l.length]));
    const out = draw(xf.src);
    const M = xf.drop ? null : matrixOf(xf.m);
    for (const l of lists()) {
      const from = before.get(l) ?? 0;
      if (l.length <= from) continue;
      if (xf.drop) {
        for (const e of l.splice(from)) if (e?.isObject3D) e.parent = null;
        continue;
      }
      for (let k = from; k < l.length; k++) l[k] = moveEntry(l[k], M, xf.m, xf.src, it);
    }
    // Emptied Map entries (a removed item's text) are dropped.
    if (xf.drop) for (const b of buckets) if (b instanceof Map) for (const [k, v] of b) if (!(Array.isArray(v) ? v : v.list).length) b.delete(k);
    return out;
  };
}

// The move as a matrix: turn about (px, pz), shift, lift.
function matrixOf(m) {
  const M = new THREE.Matrix4().makeTranslation(-m.px, 0, -m.pz);
  M.premultiply(new THREE.Matrix4().makeRotationY(m.yaw));
  M.premultiply(new THREE.Matrix4().makeTranslation(m.px + m.dx, m.dy, m.pz + m.dz));
  return M;
}

function moveEntry(e, M, m, src, it) {
  if (e === src) return it; // the item itself (props gathered by item): the moved one
  if (e?.isBufferGeometry) return e.clone().applyMatrix4(M);
  if (e?.isObject3D) {
    e.applyMatrix4(M);
    return e;
  }
  if (Array.isArray(e)) {
    if (e.length === 2 && typeof e[0] === 'number' && typeof e[1] === 'number') return movePoint(m, e[0], e[1]);
    return e.map((q) => (q?.isBufferGeometry ? q.clone().applyMatrix4(M) : q));
  }
  if (e && typeof e === 'object') {
    if (e.geo?.isBufferGeometry) e.geo = e.geo.clone().applyMatrix4(M);
    if (Array.isArray(e.geos)) e.geos = e.geos.map((g) => (g?.isBufferGeometry ? g.clone().applyMatrix4(M) : g));
    if (typeof e.x === 'number' && typeof e.z === 'number') {
      [e.x, e.z] = movePoint(m, e.x, e.z);
      if (typeof e.y === 'number') e.y += m.dy;
      if (typeof e.yaw === 'number') e.yaw += m.yaw;
    }
    for (const [a, b] of [['fx', 'fz'], ['dx', 'dz'], ['dirX', 'dirZ']]) {
      if (typeof e[a] === 'number' && typeof e[b] === 'number') [e[a], e[b]] = turnVector(m, e[a], e[b]);
    }
  }
  return e;
}
