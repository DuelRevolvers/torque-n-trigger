import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { rampGeometry } from '../src/render/shapes.js';

// Most ramps are drawn with one-sided materials (docks, platforms, rooftops,
// suburbs), so a face wound the wrong way is invisible.
test('ramp wedges are wound outward, slope up, in any direction', () => {
  for (const [dirX, dirZ] of [[0, 1], [-1, 0], [Math.SQRT1_2, -Math.SQRT1_2]]) {
    const r = { x: 10, z: -4, dirX, dirZ, len: 8, width: 4, height: 1.2, base: 0.5 };
    const g = rampGeometry(r, 2);
    // The wedge's centroid, placed the way the geometry is.
    const c = new THREE.Vector3(0, r.height / 3, (2 * r.len) / 3).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dirX, dirZ)).add(new THREE.Vector3(r.x, 2 + r.base, r.z));
    const p = g.attributes.position;
    let up = 0;
    for (let f = 0; f < p.count / 3; f++) {
      const [a, b, d] = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, f * 3 + k));
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
      const mid = a.clone().add(b).add(d).divideScalar(3);
      assert.ok(n.dot(mid.sub(c)) > 0, `face ${f} faces inward (dir ${dirX}, ${dirZ})`);
      if (n.y > 0.9) up++;
    }
    assert.equal(up, 2, 'the slope faces up');
  }
});
