// The T&T SDK's edits as the districts draw them: an edited object is drawn
// by its district's own drawers and moved whole, and a removed one leaves
// nothing behind. Builds the views headless (a canvas stand-in for the DOM).
import test from 'node:test';
import assert from 'node:assert/strict';

// Canvases whose 2D context ignores every call.
const ctx = new Proxy({}, {
  get: (t, k) =>
    k === 'measureText' ? () => ({ width: 10 })
      : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })
        : k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' ? () => ({ addColorStop() {} })
          : k in t ? t[k] : () => {},
  set: (t, k, v) => ((t[k] = v), true),
});
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) };

const THREE = await import('three');
const { DISTRICTS } = await import('../src/career/districts.js');
const { districtMap } = await import('../src/sim/city.js');
const { baseLayout, setEdits } = await import('../src/sim/cityLayout.js');
const { canMove } = await import('../src/sim/layoutEdits.js');
const { createTextures } = await import('../src/render/textures.js');
const { createCityTextures } = await import('../src/render/cityTextures.js');
const { buildDistrictView } = await import('../src/render/districtView.js');

const tex = { ...createTextures(), ...createCityTextures(), env: new THREE.Texture() };

// Vertices (and instances, counted by their vertices) either side of x = cut, in world space.
function census(group, cut) {
  group.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  let near = 0;
  let far = 0;
  let maxX = 0;
  group.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    if (o.isInstancedMesh) {
      for (let k = 0; k < o.count; k++) {
        o.getMatrixAt(k, m);
        if (Math.abs(m.determinant()) < 1e-9) continue; // hidden (a sprinkler's spray while it's off)
        v.setFromMatrixPosition(m.premultiply(o.matrixWorld));
        if (v.x > cut) far += pos.count;
        else near += pos.count;
        maxX = Math.max(maxX, Math.abs(v.x));
      }
      return;
    }
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld);
      if (v.x > cut) far += pos.count ? 1 : 0;
      else near += 1;
      maxX = Math.max(maxX, Math.abs(v.x));
    }
  });
  return { near, far, maxX };
}

// Every vertex (x, z), and every instance by its position, in world space.
function points(group) {
  group.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const out = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isInstancedMesh) {
      for (let k = 0; k < o.count; k++) {
        o.getMatrixAt(k, m);
        if (Math.abs(m.determinant()) < 1e-9) continue;
        v.setFromMatrixPosition(m.premultiply(o.matrixWorld));
        out.push([v.x, v.z]);
      }
      return;
    }
    const pos = o.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld);
      out.push([v.x, v.z]);
    }
  });
  return out;
}

// Rustline draws some props from a random stream, so what's left can't be
// compared with a view that never drew them; instead, everything moved must
// be exactly what went missing, moved (to within the rounding of positions
// stored far out).
test('sdk render: rustline: moved objects are drawn whole where they went', () => {
  const d = DISTRICTS.find((q) => q.id === 'rustline');
  const map = districtMap(structuredClone(d.city));
  const movable = baseLayout(map).items.filter(canMove);
  assert.ok(movable.length > 100, 'plenty to move');
  const Q = 0.02;
  const key = (x, z) => `${Math.round(x / Q)},${Math.round(z / Q)}`;
  const count = new Map();
  for (const [x, z] of points(buildDistrictView(map, tex))) count.set(key(x, z), (count.get(key(x, z)) || 0) + 1);
  const dx = 20000;
  setEdits(map, { move: Object.fromEntries(movable.map((it) => [it.key, { dx }])) });
  const after = points(buildDistrictView(map, tex));
  // What stayed: exactly as it was (never touched).
  for (const [x, z] of after) {
    if (x > dx / 2) continue;
    const k = key(x, z);
    assert.ok(count.get(k) > 0, `a vertex appeared at ${x}, ${z}`);
    count.set(k, count.get(k) - 1);
  }
  // What moved: each where something went missing, moved back.
  const miss = [];
  for (const [x, z] of after) {
    if (x <= dx / 2) continue;
    const k = key(x - dx, z);
    if (count.get(k) > 0) count.set(k, count.get(k) - 1);
    else miss.push([x - dx, z]);
  }
  for (const [x, z] of miss) {
    const i = Math.round(x / Q);
    const j = Math.round(z / Q);
    const hit = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => `${i + a},${j + b}`).find((k) => count.get(k) > 0);
    assert.ok(hit, `a moved vertex from nowhere, ${x}, ${z}`);
    count.set(hit, count.get(hit) - 1);
  }
  assert.ok(after.some(([x]) => x > dx / 2), 'the moved objects are drawn where they went');
  const left = [...count].filter(([, n]) => n > 0);
  assert.deepEqual(left.slice(0, 5), [], `${left.length} places where something was left behind`);
});

// A turned object is drawn turned the way the simulation turned it.
test('sdk render: a turned car is drawn the way it collides', () => {
  const d = DISTRICTS.find((q) => q.id === 'strip');
  const map = districtMap(structuredClone(d.city));
  const car = baseLayout(map).items.find((it) => it.t === 'car' && canMove(it) && it.obb && it.obb.hd > it.obb.hw * 1.5);
  const cut = census(buildDistrictView(map, tex), Infinity).maxX + 1;
  const dx = 2 * cut + 1000;
  const layout = setEdits(map, { move: { [car.key]: { dx, yaw: 0.6 } } });
  const moved = layout.items.find((it) => it.key === car.key);
  const pts = points(buildDistrictView(map, tex)).filter(([x]) => x > cut);
  assert.ok(pts.length > 8);
  // The long axis of what's drawn, as a yaw (0 along +z).
  const mx = pts.reduce((s, [x]) => s + x, 0) / pts.length;
  const mz = pts.reduce((s, [, z]) => s + z, 0) / pts.length;
  let sxx = 0;
  let szz = 0;
  let sxz = 0;
  for (const [x, z] of pts) {
    sxx += (x - mx) ** 2;
    szz += (z - mz) ** 2;
    sxz += (x - mx) * (z - mz);
  }
  const a = 0.5 * Math.atan2(2 * sxz, sxx - szz); // from +x
  const drawnYaw = Math.atan2(Math.cos(a), Math.sin(a));
  const diff = (((drawnYaw - moved.obb.yaw) % Math.PI) + Math.PI * 1.5) % Math.PI - Math.PI / 2;
  assert.ok(Math.abs(diff) < 0.05, `drawn at yaw ${drawnYaw.toFixed(3)}, collides at ${moved.obb.yaw.toFixed(3)}`);
  assert.ok(Math.abs(mx - moved.obb.x) < 0.5 && Math.abs(mz - moved.obb.z) < 0.5, 'drawn where it collides');
});

// Plan districts: nothing in their views is random, so an item never
// drawn and an item drawn and thrown away must leave the same view behind.
for (const id of ['strip', 'maple', 'chrome', 'undercity', 'spire']) {
  test(`sdk render: ${id}: moved objects are drawn whole where they went, removed ones leave nothing`, () => {
    const d = DISTRICTS.find((q) => q.id === id);
    const map = districtMap(structuredClone(d.city)); // a copy, as the SDK opens it
    const items = baseLayout(map).items;
    // Everything that can move, but one of each type (a view keeps a stand-in
    // instance for a kind of prop it has none of, e.g. the rooftop flags).
    const one = new Set();
    const movable = items.filter((it) => canMove(it) && (one.has(it.t) || !one.add(it.t)));
    assert.ok(movable.length > 100, 'plenty to move');

    const view0 = census(buildDistrictView(map, tex), Infinity);
    const dx = 2 * view0.maxX + 1000;
    const cut = view0.maxX + 1;

    setEdits(map, { move: Object.fromEntries(movable.map((it) => [it.key, { dx }])) });
    const moved = census(buildDistrictView(map, tex), cut);
    setEdits(map, { remove: movable.map((it) => it.key) });
    const removed = census(buildDistrictView(map, tex), cut);
    // Never drawn at all: the movable items taken out of the layout.
    setEdits(map, null);
    const keep = new Set(movable);
    baseLayout(map).items = items.filter((it) => !keep.has(it));
    setEdits(map, null);
    const without = census(buildDistrictView(map, tex), cut);
    baseLayout(map).items = items;

    assert.equal(moved.near + moved.far, view0.near, 'moving loses and adds nothing');
    assert.ok(moved.far > 0, 'the moved objects are drawn where they went');
    assert.equal(moved.near, without.near, 'nothing of a moved object is left where it stood');
    assert.equal(removed.near + removed.far, without.near, 'a removed object leaves nothing behind');
  });
}
