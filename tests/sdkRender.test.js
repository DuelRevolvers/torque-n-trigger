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
const { baseLayout, setEdits, districtLayout } = await import('../src/sim/cityLayout.js');
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

// Objects from any district in any other: the copy carries the object (its
// district's data), collides where it's put, and is drawn there by its own
// district's view (none of that district's streets or ground come with it).
test('sdk render: an object from each district, placed in another, is drawn and solid where it is put', async () => {
  const { setDistrictStyles } = await import('../src/render/districtView.js');
  const { catalogue } = await import('../src/sdk/catalogue.js');
  const { itemCentre } = await import('../src/sim/layoutEdits.js');
  const { docFromDistrict, districtFromDoc } = await import('../src/content/mapDoc.js');
  setDistrictStyles((id) => DISTRICTS.find((d) => d.id === id)?.city || null);
  const into = { rustline: 'strip', strip: 'maple', maple: 'strip', chrome: 'strip', undercity: 'spire', spire: 'undercity' };
  for (const src of DISTRICTS) {
    const map = districtMap(src.city);
    const items = baseLayout(map).items;
    // (A solid thing with some size: a building or the like.)
    const e = catalogue(items).filter((q) => q.t !== 'quayCrane').find((q) => {
      const it = items.find((i) => i.key === q.from);
      return it.solid && q.size[0] > 3 && q.size[0] < 60 && q.size[2] > 3 && q.size[2] < 60;
    });
    assert.ok(e, `${src.id}: something to copy`);
    const item = JSON.parse(JSON.stringify(items.find((i) => i.key === e.from)));
    const ground = map.heightAt(...itemCentre(item));
    const target = DISTRICTS.find((d) => d.id === into[src.id]);
    const doc = docFromDistrict(target);
    doc.edits.add.push({ id: 'g1', from: e.from, district: src.id, item, ground, x: 20, z: 40, yaw: 0.5 });
    const d = districtFromDoc(doc);
    const there = districtMap(d.city);
    const it = districtLayout(there).items.find((q) => q.key === '+g1');
    assert.equal(it?.guest, src.id, `${src.id} -> ${target.id}: in the layout`);
    const [cx, cz] = itemCentre(it);
    assert.ok(Math.hypot(cx - 20, cz - 40) < 0.5, 'where it was put');
    const view = buildDistrictView(there, tex);
    const guests = view.getObjectByName('guests');
    assert.ok(guests, `${src.id} -> ${target.id}: drawn by ${src.id}'s view`);
    const c = census(guests, Infinity);
    assert.ok(c.near > 0, `${src.id} -> ${target.id}: ${e.id} drawn (${guests.children.map((v) => v.children.length).join()} meshes)`);
    // (All of it round where it was put: nothing of its home district comes with it.)
    const pts = points(guests);
    const reach = Math.hypot(...e.size) + 12;
    const far = pts.filter(([x, z]) => Math.hypot(x - 20, z - 40) > reach);
    assert.equal(far.length, 0, `${src.id}: ${far.length} points far from it (e.g. ${far[0]?.map(Math.round)})`);
  }
});

// A run of fence or wall from each district: its pieces drawn at the length
// they were made (their own drawers, posts and all), from post to post round
// the bend, and nowhere else.
test('sdk render: a run of fence or wall is drawn post to post, round its bend', async () => {
  const { runnable, runPieces } = await import('../src/sdk/runs.js');
  const G = await import('../src/sim/geom2d.js');
  const { longSide } = await import('../src/sim/layoutEdits.js');
  for (const d of DISTRICTS) {
    const map = districtMap(structuredClone(d.city));
    const items = baseLayout(map).items;
    const found = new Set();
    const kinds = items.filter((it) => canMove(it) && runnable(it) && !found.has(it.t + it.kind) && found.add(it.t + it.kind));
    assert.ok(kinds.length, `${d.id}: something to put in a run`);
    const cut = census(buildDistrictView(map, tex), Infinity).maxX + 100;
    // Each kind's run in its own row, far out: 40 m east, then 16 m north.
    const add = [];
    const runs = kinds.map((it, row) => {
      const posts = [[cut + 50, row * 60], [cut + 90, row * 60], [cut + 90, row * 60 - 16]];
      runPieces(it, posts).forEach((p, k) => add.push({ id: `r${row}-${k}`, from: it.key, x: p.x, z: p.z, yaw: p.yaw, len: p.len }));
      return { it, posts, pts: [] };
    });
    setEdits(map, { add });
    const pts = points(buildDistrictView(map, tex)).filter(([x]) => x > cut);
    setEdits(map, null);
    for (const [x, z] of pts) {
      const r = runs.find((q) => Math.abs(z - q.posts[0][1]) < 30);
      assert.ok(r, `${d.id}: drawn only where its runs are (${x.toFixed(1)}, ${z.toFixed(1)})`);
      r.pts.push([x, z]);
    }
    for (const { it, posts, pts: drawn } of runs) {
      const name = `${d.id} ${it.t}${it.kind ? '.' + it.kind : ''}`;
      const w = longSide(it).width / 2 + 1.2;
      const line = G.nearestOnLine;
      assert.ok(drawn.length, `${name}: drawn`);
      for (const [x, z] of drawn) assert.ok(line(posts, x, z).d < w, `${name}: along the run (${x.toFixed(1)}, ${z.toFixed(1)})`);
      // Reaching from the first post to the last, and round the bend.
      const reach = (p) => Math.min(...drawn.map(([x, z]) => Math.hypot(x - p[0], z - p[1])));
      for (const p of posts) assert.ok(reach(p) < 4.5, `${name}: drawn up to (${p.map(Math.round)}) (${reach(p).toFixed(1)} m off)`);
      const mid = [[(posts[0][0] + posts[1][0]) / 2, posts[0][1]], [posts[1][0], (posts[1][1] + posts[2][1]) / 2]];
      for (const p of mid) assert.ok(reach(p) < 4.5, `${name}: and all along (${p.map(Math.round)})`);
    }
  }
});

// Every kind of light draws (a light source on no fixture: only its light),
// all of it round where it stands, and its moving parts move with the clock.
test('sdk render: every kind of light is drawn where it stands', async () => {
  const { lightView, lightMarkers } = await import('../src/render/lightView.js');
  const { newGadget, LIGHT_FIXTURES, lightPreset } = await import('../src/sim/gadgets.js');
  for (const f of Object.keys(LIGHT_FIXTURES)) {
    const g = { ...newGadget('light', 'g1', 40, -30, 0.4), ...lightPreset(f), real: true };
    const view = lightView([g], () => 2, tex);
    view.userData.animate(1.7);
    const meshes = [];
    view.traverse((o) => (o.isMesh || o.isSprite) && meshes.push(o));
    const lights = [];
    view.traverse((o) => o.isLight && lights.push(o));
    assert.equal(lights.length, 1, `${f}: its real light`);
    // (The ground glow is one mesh; the rest is the fixture.)
    if (f === 'bare') assert.equal(meshes.length, 1, 'just the light: only its glow on the ground');
    else assert.ok(meshes.length > 1, `${f}: drawn`);
    const reach = f === 'search' ? 100 : Math.max(g.reach, (g.span || 0) / 2 + g.reach) * 2 + 2; // (its glow's square, set ahead of a floodlight)
    for (const [x, z] of points(view)) assert.ok(Number.isFinite(x) && Math.hypot(x - 40, z + 30) < reach, `${f}: drawn round it (${x.toFixed(1)}, ${z.toFixed(1)})`);
    assert.equal(lightMarkers([g], () => 2) !== null, f === 'bare', `${f}: an SDK marker only for a bare light`);
  }
});
