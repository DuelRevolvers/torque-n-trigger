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

// Streets drawn in the SDK: curved, bending at a click, at tight angles onto
// others, onto a curved street, and ending on their own. Every junction's
// outline is a clean one, and no road or junction surface lies over another
// (a road stops square where its junction starts).
test('sdk render: drawn streets meet in clean junctions, curved, bent and at tight angles', async () => {
  const { Session } = await import('../src/sdk/session.js');
  const { roadEdit } = await import('../src/sdk/roads.js');
  const { blankDistrict } = await import('../src/sdk/templates.js');
  const G = await import('../src/sim/geom2d.js');
  const s = new Session(blankDistrict(DISTRICTS.find((d) => d.id === 'strip'), 1));
  const road = (clicks, bends, name) => s.change((e) => (e.plan = roadEdit(s, clicks, { name, bends })));
  road([[-400, -150], [-100, -400]], [[-270, -290]], 'Curve A');
  road([[-200, 150], [0, 300], [200, 150]], [[-170, 260], [170, 260]], 'Bend B');
  road([[100, 0], [400, -300]], [], 'Cut C');
  road([[-370, 60], [-340, 220], [-230, 250]], [], 'Dogleg D');
  const a = s.map.streets.find((q) => q.name === 'Curve A');
  const mid = G.pointAlong(a.pts, a.len / 2);
  road([[-100, -150], [mid.x, mid.z]], [[-150, -230]], 'Link E');
  road([[150, 250], [330, 400]], [], 'Sharp F');
  road([[100, 290], [300, 400]], [], 'Wide G');

  const view = buildDistrictView(s.map, tex);
  let fallbacks = null;
  const tris = [];
  view.traverse((o) => {
    if (o.userData.junctionFallbacks) fallbacks = o.userData.junctionFallbacks;
    if (o.name !== 'roads' && o.name !== 'junctions') return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    for (let k = 0; k < idx.count; k += 3) tris.push([0, 1, 2].map((q) => [pos.getX(idx.getX(k + q)), pos.getZ(idx.getX(k + q))]));
  });
  assert.deepEqual(fallbacks, [], 'every junction outline a clean one');
  // Road surface over road surface, sampled every half metre.
  const hits = new Map();
  for (const [p, q, r] of tris) {
    const area = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    if (Math.abs(area) < 1e-6) continue;
    for (let i = Math.floor(Math.min(p[0], q[0], r[0]) * 2); i <= Math.max(p[0], q[0], r[0]) * 2; i++) {
      for (let j = Math.floor(Math.min(p[1], q[1], r[1]) * 2); j <= Math.max(p[1], q[1], r[1]) * 2; j++) {
        const [x, z] = [(i + 0.5) / 2 + 0.0123, (j + 0.5) / 2 + 0.0371];
        const inside = [[p, q], [q, r], [r, p]].every(([u, v]) => ((v[0] - u[0]) * (z - u[1]) - (v[1] - u[1]) * (x - u[0])) / area >= 0);
        if (inside) hits.set(`${i},${j}`, (hits.get(`${i},${j}`) || 0) + 1);
      }
    }
  }
  const over = [...hits.values()].filter((n) => n > 1).length / 4;
  assert.ok(hits.size > 50000, 'the roads are drawn');
  assert.ok(over < 2, `road surfaces overlap by ${over} m2`);
  // The lots round them (the sidewalks' far edges) never fold over themselves,
  // at a wedge's tip, beside a dead end or where a short street meets another.
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (const b of s.map.blocks) {
    const p = b.lot;
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 2; j < p.length; j++) {
        if (i === 0 && j === p.length - 1) continue;
        const [a, c, d, e] = [p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length]];
        assert.ok(!(cross(a, c, d) * cross(a, c, e) < -1e-9 && cross(d, e, a) * cross(d, e, c) < -1e-9), `block ${b.id}'s lot folds over itself near ${a.map(Math.round)}`);
      }
    }
  }
});
