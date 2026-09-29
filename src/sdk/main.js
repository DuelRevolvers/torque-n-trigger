import * as THREE from 'three';
import { DISTRICTS } from '../career/districts.js';
import { createTextures, createEnvMap } from '../render/textures.js';
import { createCityTextures } from '../render/cityTextures.js';
import { createStreetTextures } from '../render/streetTextures.js';
import { retroUniforms } from '../render/retroMaterial.js';
import { buildDistrictView } from '../render/districtView.js';
import { docFromDistrict, serializeDoc, parseDoc, baseChanged } from '../content/mapDoc.js';
import { canMove } from '../sim/layoutEdits.js';
import { Session, footBox } from './session.js';
import { catalogue, CATEGORIES } from './catalogue.js';
import { saveOverride, listOverrides, removeOverride, setOverrideOn, shippedMap } from '../content/store.js';

// The T&T SDK (Studio): opens a district as a map document; select, move,
// turn, delete and copy its objects, place new ones from the catalogue; undo,
// save and open .ttmap files, and test drive the map in the game.

const AUTOSAVE = 'tt-sdk:autosave';
const DRIVE = 'tt-sdk:testdrive'; // read by the game (src/main.js)
const TURN = Math.PI / 12; // 15°
const FINE = Math.PI / 180;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
retroUniforms.uSnap.value = 0; // no vertex wobble while editing

const tex = { ...createTextures(), ...createCityTextures() };
tex.env = createEnvMap(renderer);
const street = createStreetTextures();
Object.assign(tex, { road: street.road, roadRough: street.roadRough, wall: street.wallChevron, wallConcrete: street.wallConcrete, building: street.building, buildingGlow: street.buildingGlow });

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xc8d0ff, 0x302838, 1.6));
const sun = new THREE.DirectionalLight(0xfff0e0, 1.2);
sun.position.set(300, 600, 200);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 9000);
const overlay = new THREE.Group(); // selection, hover and ghost boxes
scene.add(overlay);

let session = null;
let view = null; // the district as drawn
let cat = [];
let selected = null;
let hovered = null;
let placing = null; // the catalogue entry being placed
let placeYaw = 0;
let ghostAt = null; // where it would go: { x, z }
let drag = null; // { key, sx, sy, ox, oz, x, z, yaw, moved }
let flying = false;
let panning = null;
let rebuildTimer = 0;
const cam = { x: 0, y: 300, z: 400, yaw: Math.PI, pitch: -0.6, top: null };
const keys = new Set();

const H = (x, z) => session.map.heightAt(x, z);
const forward = () => new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
const flat = () => [Math.sin(cam.yaw), Math.cos(cam.yaw)];
const right = () => [-Math.cos(cam.yaw), Math.sin(cam.yaw)];
const altitude = () => Math.max(2, cam.y - (session ? H(cam.x, cam.z) : 0));

// --- Opening, building, saving -------------------------------------------

function setBusy(text) {
  $('busy').hidden = !text;
  $('busy').textContent = text || '';
}

function open(doc) {
  $('start').hidden = true;
  setBusy(`Opening ${doc.name}…`);
  setTimeout(() => {
    session = new Session(doc);
    selected = hovered = placing = drag = ghostAt = null;
    cat = catalogue([...session.base.values()]);
    $('district').value = doc.base || '';
    const b = session.map.bounds || { minX: -500, maxX: 500, minZ: -500, maxZ: 500 };
    Object.assign(cam, { x: (b.minX + b.maxX) / 2, z: b.maxZ + 150, yaw: Math.PI, pitch: -0.55, top: null });
    cam.y = H(cam.x, b.maxZ) + 320;
    applyFog();
    buildView();
    renderCatalogue();
    refresh();
  }, 30);
}

function applyFog() {
  const theme = session.district.theme || {};
  const haze = new THREE.Color(theme.haze || '#101018');
  scene.background = haze;
  scene.fog = $('fog').checked ? new THREE.FogExp2(haze, theme.fog || 0.004) : null;
}

function dispose(g) {
  g.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material || [])) m.dispose();
  });
}

function buildView() {
  setBusy('Building…');
  setTimeout(() => {
    if (view) {
      scene.remove(view);
      dispose(view);
    }
    view = buildDistrictView(session.map, tex);
    scene.add(view);
    setBusy(null);
  }, 30);
}

// The district's drawing is rebuilt a moment after the last change.
function scheduleBuild() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(buildView, 250);
}

function changed() {
  if (selected && !session.item(selected)) selected = null;
  try {
    localStorage.setItem(AUTOSAVE, serializeDoc(session.doc));
  } catch {
    // (Storage full or blocked: the map is still open, just not autosaved.)
  }
  refresh();
  showOverlay();
  scheduleBuild();
}

function save() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([serializeDoc(session.doc)], { type: 'application/json' }));
  a.download = `${session.doc.id}.ttmap`;
  a.click();
  URL.revokeObjectURL(a.href);
  session.dirty = false;
  refresh();
}

let toastTimer = 0;
function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), 6000);
}

// The game's free roam plays these edits (this browser), until reverted.
function playInGame() {
  if (!session.doc.base) return window.alert('Only an edited built-in district can play in the game for now.');
  try {
    saveOverride(JSON.parse(serializeDoc(session.doc)));
  } catch (err) {
    window.alert(`Couldn't save it for the game: ${err.message}`);
    return;
  }
  toast(`Free roam in ${session.doc.name} now plays these edits (reload the game). Revert them under Maps.`);
}

// Studio: the map ships with the game in place of its district (the dev server writes it).
const published = new Set(DISTRICTS.filter((d) => shippedMap(d.id)).map((d) => d.id));
async function publish() {
  const doc = session.doc;
  if (!doc.base || doc.base !== doc.id) return window.alert('Only an edited built-in district can be published for now.');
  if (!window.confirm(`Publish ${doc.name}? It ships with the game in place of its district file, career included.`)) return;
  try {
    const res = await fetch(`/__sdk/maps/${encodeURIComponent(doc.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: serializeDoc(doc) });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    published.add(doc.id);
    toast(`Published ${out.file}. Reload the game to play it; commit the file to ship it.`);
  } catch (err) {
    window.alert(`Couldn't publish (the SDK has to run from the dev server, npm run dev): ${err.message}`);
  }
}

async function unpublish(id) {
  const d = DISTRICTS.find((q) => q.id === id);
  if (!window.confirm(`Unpublish ${d?.name || id}? The game goes back to its district file.`)) return;
  try {
    const res = await fetch(`/__sdk/maps/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error);
    published.delete(id);
    renderStart();
    toast(`Unpublished. Reload the game (and this SDK) to see ${d?.name || id} as its district file makes it.`);
  } catch (err) {
    window.alert(`Couldn't unpublish (the SDK has to run from the dev server): ${err.message}`);
  }
}

// The Maps screen: what to open, and what plays in the game.
function renderStart() {
  $('start-back').hidden = !session;
  if (session) $('start-back').textContent = `Back to ${session.doc.name}`;
  const list = listOverrides(DISTRICTS);
  $('start-overrides-box').hidden = !list.length;
  $('start-overrides').innerHTML = list
    .map((o) => `
      <div class="orow" data-id="${esc(o.id)}">
        <label title="Free roam plays these edits while this is on"><input type="checkbox" data-act="on" ${o.on ? 'checked' : ''} /> ${esc(o.name)} (${o.edits} edit${o.edits === 1 ? '' : 's'})</label>
        <button data-act="open">Open</button>
        <button data-act="revert" class="danger">Revert</button>
      </div>
      ${o.baseChanged ? `<div class="note warn">${esc(o.name)} has changed in the game since these edits were made. Keep them (leave them on), Revert, or Open them to check: edits whose object has gone are listed as lost.</div>` : ''}`)
    .join('');
  $('start-published-box').hidden = !published.size;
  $('start-published').innerHTML = [...published]
    .map((id) => `<div class="orow" data-id="${esc(id)}"><label>${esc(DISTRICTS.find((d) => d.id === id)?.name || id)}</label><button data-act="unpublish" class="danger">Unpublish</button></div>`)
    .join('');
}

function testDrive() {
  // From where the middle of the view meets the ground, heading the way the camera looks.
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const g = groundHit();
  const spawn = { x: g ? g.x : cam.x, z: g ? g.z : cam.z, yaw: cam.yaw + Math.PI };
  try {
    localStorage.setItem(DRIVE, JSON.stringify({ doc: session.doc, spawn }));
  } catch (err) {
    window.alert(`Couldn't hand the map to the game: ${err.message}`);
    return;
  }
  window.open('index.html?testdrive', 'tt-testdrive');
}

// --- Picking ----------------------------------------------------------------

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function setRay(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}

// Where the ray meets the district's ground (marched, then halved down).
function groundHit() {
  const o = ray.ray.origin;
  const d = ray.ray.direction;
  const at = (t) => [o.x + d.x * t, o.y + d.y * t, o.z + d.z * t];
  let prev = 0;
  for (let t = 1; t < 6000; t += Math.max(1, t * 0.01)) {
    const [x, y, z] = at(t);
    if (y > H(x, z)) {
      prev = t;
      continue;
    }
    let a = prev;
    let b = t;
    for (let k = 0; k < 24; k++) {
      const m = (a + b) / 2;
      const [px, py, pz] = at(m);
      if (py <= H(px, pz)) b = m;
      else a = m;
    }
    return new THREE.Vector3(...at(b));
  }
  return null;
}

// The first solid surface drawn under the ray.
function meshHit() {
  if (!view) return null;
  for (const h of ray.intersectObject(view, true)) {
    const m = h.object.material;
    if (!h.object.visible || !m || m.transparent || m.blending === THREE.AdditiveBlending) continue;
    return h.point;
  }
  return null;
}

function pickAt() {
  const p = meshHit();
  return p ? session.pick(p.x, p.z, p.y) : null;
}

// --- Overlay: what's selected, under the cursor, being moved or placed --------

function box(fb, base, h, color, opacity) {
  const geo = new THREE.BoxGeometry(Math.max(0.3, fb.w), Math.max(0.3, h), Math.max(0.3, fb.d));
  const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, fog: false }));
  edges.renderOrder = 10;
  const g = new THREE.Group();
  g.add(fill, edges);
  g.position.set(fb.x, base + h / 2, fb.z);
  g.rotation.y = fb.yaw;
  overlay.add(g);
}

function showOverlay() {
  for (const o of [...overlay.children]) {
    overlay.remove(o);
    dispose(o);
  }
  if (!session) return;
  const shown = (key, color, opacity) => {
    const it = session.item(key);
    if (it) box(footBox(it), session.baseY(it), it.h || 2, color, opacity);
  };
  if (hovered && hovered !== selected && !drag && !placing) shown(hovered, 0xffffff, 0.08);
  if (drag?.moved) {
    // The object where it's going: its box, moved and turned, kept at its height above the ground.
    const it = session.item(drag.key);
    const fb = footBox(it);
    const p = session.pose(drag.key);
    const lift = session.baseY(it) - H(fb.x, fb.z);
    box({ ...fb, x: fb.x + drag.x - p.x, z: fb.z + drag.z - p.z, yaw: fb.yaw + drag.yaw - p.yaw }, H(drag.x, drag.z) + lift, it.h || 2, 0x05d9e8, 0.25);
  } else if (selected) shown(selected, 0xffb000, 0.15);
  if (placing && ghostAt) {
    const src = session.base.get(placing.from);
    const fb = footBox(src);
    const lift = session.baseY(src) - H(fb.x, fb.z);
    box({ x: ghostAt.x, z: ghostAt.z, w: fb.w, d: fb.d, yaw: fb.yaw + placeYaw }, H(ghostAt.x, ghostAt.z) + lift, src.h || 2, 0x05d9e8, 0.25);
  }
}

// --- Selection and editing ---------------------------------------------------

function select(key) {
  selected = key;
  refresh();
  showOverlay();
}

const gridSize = () => Number($('grid').value);
const snapping = (e) => $('snap').checked && !e?.altKey;
const snap = (v, e) => (snapping(e) ? Math.round(v / gridSize()) * gridSize() : v);
const snapTurn = (yaw, fine) => (fine ? Math.round(yaw / FINE) * FINE : Math.round(yaw / TURN) * TURN);

function turn(dir, fine) {
  const d = dir * (fine ? FINE : TURN);
  if (drag) {
    drag.yaw = snapTurn(drag.yaw + d, fine);
    showOverlay();
  } else if (placing) {
    placeYaw = snapTurn(placeYaw + d, fine);
    showOverlay();
  } else if (selected && canMove(session.item(selected))) {
    const p = session.pose(selected);
    if (session.place(selected, p.x, p.z, snapTurn(p.yaw + d, fine))) changed();
  }
}

function nudge(dx, dz) {
  if (!selected || !canMove(session.item(selected))) return;
  const p = session.pose(selected);
  if (session.place(selected, p.x + dx, p.z + dz, p.yaw)) changed();
}

function removeSelected() {
  if (selected && session.remove(selected)) {
    selected = null;
    changed();
  }
}

function duplicate() {
  if (!selected || !canMove(session.item(selected))) return;
  selected = session.duplicate(selected, gridSize() * 4);
  changed();
}

function placeEntry(entry, g, e, dropped) {
  const key = session.add(entry.from, snap(g.x, e), snap(g.z, e), placeYaw);
  selected = key;
  if (dropped || !e.shiftKey) {
    placing = null;
    ghostAt = null;
    renderCatalogue();
  }
  changed();
}

function focus() {
  if (!selected) return;
  const it = session.item(selected);
  const fb = footBox(it);
  const dist = Math.max(25, Math.max(fb.w, fb.d, it.h || 2) * 2.2);
  cam.pitch = Math.min(cam.pitch, -0.35);
  const f = forward();
  cam.x = fb.x - f.x * dist;
  cam.z = fb.z - f.z * dist;
  cam.y = session.baseY(it) + (it.h || 2) / 2 - f.y * dist;
}

function toggleTop() {
  if (cam.top) {
    Object.assign(cam, cam.top, { top: null });
  } else {
    const keep = { x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch };
    Object.assign(cam, { pitch: -1.5, y: Math.max(cam.y, H(cam.x, cam.z) + 450), top: keep });
  }
  $('top-view').classList.toggle('on', !!cam.top);
}

// --- Panels ---------------------------------------------------------------------

function nameOf(it) {
  const id = it.kind ? `${it.t}.${it.kind}` : it.t;
  return cat.find((c) => c.id === id)?.name || id;
}

function refresh() {
  if (!session) return;
  const doc = session.doc;
  $('title').textContent = `${doc.name}${session.dirty ? ' *' : ''}`;
  document.title = `${doc.name}${session.dirty ? ' *' : ''} · T&T SDK`;
  $('undo').disabled = !session.past.length;
  $('redo').disabled = !session.future.length;

  const it = selected && session.item(selected);
  const ins = $('inspector');
  if (!it) {
    ins.innerHTML = `<p class="note">Click an object to select it. Drag it to move it.<br><br>Pick an object on the left, then click in the world to place it (or drag it in).</p>`;
  } else {
    const p = session.pose(selected);
    const movable = canMove(it);
    const moved = !selected.startsWith('+') && doc.edits.move[selected];
    const field = (id, label, value, step) => `<label for="${id}">${label}</label><input id="${id}" type="number" step="${step}" value="${+value.toFixed(3)}" ${movable ? '' : 'disabled'} />`;
    ins.innerHTML = `
      <h3>${esc(nameOf(it))}</h3>
      <div class="key">${esc(selected.startsWith('+') ? `copy of ${session.source(selected)}` : selected)}</div>
      <div class="grid">
        ${field('in-x', 'x (m)', p.x, 0.5)}
        ${field('in-z', 'z (m)', p.z, 0.5)}
        ${field('in-turn', 'turn (°)', (p.yaw * 180) / Math.PI, 15)}
        ${field('in-lift', 'lift (m)', p.dy, 0.25)}
      </div>
      <div class="row">
        <button id="b-dup" ${movable ? '' : 'disabled'} title="Ctrl+D">Duplicate</button>
        <button id="b-focus" title="F">Focus</button>
        ${moved ? '<button id="b-reset">Put back</button>' : ''}
        <button id="b-del" class="danger" title="Delete">Delete</button>
      </div>
      ${movable ? '' : '<p class="note">Part of the streets, ground or a district set piece: it can be deleted but not moved.</p>'}`;
    const read = () => [Number($('in-x').value), Number($('in-z').value), (Number($('in-turn').value) * Math.PI) / 180, Number($('in-lift').value)];
    for (const id of ['in-x', 'in-z', 'in-turn', 'in-lift']) {
      $(id)?.addEventListener('change', () => {
        const [x, z, yaw, dy] = read();
        if ([x, z, yaw, dy].every(Number.isFinite) && session.place(selected, x, z, yaw, dy)) changed();
      });
    }
    $('b-dup').addEventListener('click', duplicate);
    $('b-focus').addEventListener('click', focus);
    $('b-del').addEventListener('click', removeSelected);
    $('b-reset')?.addEventListener('click', () => session.reset(selected) && changed());
  }

  const e = doc.edits;
  const lost = session.layout.orphans.length;
  $('edits').innerHTML = `
    <div>Deleted: ${e.remove.length} · Moved: ${Object.keys(e.move).length} · Added: ${e.add.length}</div>
    ${lost ? `<div class="warn">${lost} edit${lost > 1 ? 's' : ''} lost ${lost > 1 ? 'their objects' : 'its object'} (the district changed since).</div>` : ''}
    <div>${session.map.style.name || doc.name}: ${session.layout.items.length} objects</div>`;
  hint();
}

function hint() {
  $('hint').textContent = !session
    ? 'Open a built-in district or a .ttmap file to start'
    : placing
    ? `Placing ${placing.name}: click to place (Shift: keep placing) · wheel or Q/E to turn · Alt: no snap · Esc to stop`
    : drag
      ? 'Wheel or Q/E to turn · Alt: no snap'
      : selected
        ? 'Drag to move · Q/E turn (Shift: 1°) · arrows nudge · Del delete · Ctrl+D copy · F focus · Esc deselect'
        : 'Click to select · hold right button + WASD/QE to fly · middle drag to pan · wheel to zoom · Tab top view · P test drive';
}

function renderCatalogue() {
  const q = $('search').value.trim().toLowerCase();
  const html = CATEGORIES.map((c) => {
    const list = cat.filter((e) => e.category === c && (!q || e.name.toLowerCase().includes(q)));
    if (!list.length) return '';
    return `<h4>${c}</h4>${list
      .map((e) => `<div class="entry${placing === e ? ' on' : ''}" draggable="true" data-id="${esc(e.id)}" title="${e.count} in this district · ${e.size.map((v) => v.toFixed(1)).join(' × ')} m"><span>${esc(e.name)}</span><i>${e.count}</i></div>`)
      .join('')}`;
  }).join('');
  $('cat').innerHTML = html || '<p class="none">Nothing matches.</p>';
}

// --- Input ------------------------------------------------------------------------

$('search').addEventListener('input', renderCatalogue);
$('cat').addEventListener('click', (e) => {
  const el = e.target.closest('.entry');
  if (!el || !session) return;
  const entry = cat.find((c) => c.id === el.dataset.id);
  placing = placing === entry ? null : entry;
  placeYaw = 0;
  ghostAt = null;
  renderCatalogue();
  hint();
});
$('cat').addEventListener('dragstart', (e) => {
  const el = e.target.closest('.entry');
  if (!el) return;
  e.dataTransfer.setData('text/plain', el.dataset.id);
  placing = cat.find((c) => c.id === el.dataset.id);
  placeYaw = 0;
});
canvas.addEventListener('dragover', (e) => {
  if (!placing || !session) return;
  e.preventDefault();
  setRay(e);
  const g = groundHit();
  ghostAt = g ? { x: snap(g.x, e), z: snap(g.z, e) } : null;
  showOverlay();
});
canvas.addEventListener('drop', (e) => {
  e.preventDefault();
  if (!placing || !session) return;
  setRay(e);
  const g = groundHit();
  if (g) placeEntry(placing, g, e, true);
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (!session) return;
  canvas.focus();
  if (e.button === 2) {
    flying = true;
    canvas.requestPointerLock?.();
    return;
  }
  if (e.button === 1) {
    e.preventDefault();
    panning = { x: e.clientX, y: e.clientY };
    return;
  }
  if (e.button !== 0) return;
  setRay(e);
  if (placing) {
    const g = groundHit();
    if (g) placeEntry(placing, g, e, false);
    return;
  }
  const key = pickAt();
  select(key);
  if (key && canMove(session.item(key))) {
    const g = groundHit();
    const p = session.pose(key);
    if (g) drag = { key, sx: e.clientX, sy: e.clientY, ox: p.x - g.x, oz: p.z - g.z, x: p.x, z: p.z, yaw: p.yaw, moved: false };
  }
});

let hoverAt = 0;
window.addEventListener('mousemove', (e) => {
  if (!session) return;
  if (flying) {
    cam.yaw -= e.movementX * 0.003;
    cam.pitch = Math.max(-1.55, Math.min(1.4, cam.pitch - e.movementY * 0.003));
    return;
  }
  if (panning) {
    const s = altitude() * 0.0018;
    const [rx, rz] = right();
    const [fx, fz] = flat();
    const dx = e.clientX - panning.x;
    const dy = e.clientY - panning.y;
    cam.x += -rx * dx * s + fx * dy * s;
    cam.z += -rz * dx * s + fz * dy * s;
    panning = { x: e.clientX, y: e.clientY };
    return;
  }
  if (e.target !== canvas && !drag) return;
  setRay(e);
  const g = groundHit();
  $('coords').textContent = g ? `x ${g.x.toFixed(1)}   z ${g.z.toFixed(1)}   ground ${g.y.toFixed(1)} m` : '';
  if (drag) {
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
    drag.moved = true;
    if (g) {
      drag.x = snap(g.x + drag.ox, e);
      drag.z = snap(g.z + drag.oz, e);
    }
    showOverlay();
    hint();
    return;
  }
  if (placing) {
    ghostAt = g ? { x: snap(g.x, e), z: snap(g.z, e) } : null;
    showOverlay();
    return;
  }
  // What's under the cursor (a few times a second: picking walks every triangle).
  const now = performance.now();
  if (now - hoverAt < 120) return;
  hoverAt = now;
  const key = pickAt();
  if (key !== hovered) {
    hovered = key;
    showOverlay();
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 2 && flying) {
    flying = false;
    document.exitPointerLock?.();
    return;
  }
  if (e.button === 1) {
    panning = null;
    return;
  }
  if (e.button === 0 && drag) {
    const d = drag;
    drag = null;
    if (d.moved && session.place(d.key, d.x, d.z, d.yaw)) changed();
    else {
      showOverlay();
      hint();
    }
  }
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (!session) return;
  if (drag || placing) {
    turn(e.deltaY < 0 ? 1 : -1, e.shiftKey);
    return;
  }
  const f = forward();
  const step = Math.max(2, altitude() * 0.12) * (e.deltaY < 0 ? 1 : -1);
  cam.x += f.x * step;
  cam.y += f.y * step;
  cam.z += f.z * step;
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.target.matches?.('input, select, textarea')) return;
  keys.add(e.code);
  if (!session) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.code === 'KeyZ') {
    e.preventDefault();
    if (e.shiftKey ? session.redo() : session.undo()) changed();
    return;
  }
  if (ctrl && e.code === 'KeyY') {
    e.preventDefault();
    if (session.redo()) changed();
    return;
  }
  if (ctrl && e.code === 'KeyS') {
    e.preventDefault();
    save();
    return;
  }
  if (ctrl && e.code === 'KeyD') {
    e.preventDefault();
    duplicate();
    return;
  }
  if (flying || ctrl) return; // WASD and Q/E fly while the right button is held
  const step = e.shiftKey ? 0.1 : gridSize();
  const [fx, fz] = flat();
  const [rx, rz] = right();
  switch (e.code) {
    case 'Delete':
    case 'Backspace':
      removeSelected();
      break;
    case 'KeyQ':
    case 'KeyE':
      turn(e.code === 'KeyQ' ? 1 : -1, e.shiftKey);
      break;
    case 'ArrowUp':
      nudge(fx * step, fz * step);
      break;
    case 'ArrowDown':
      nudge(-fx * step, -fz * step);
      break;
    case 'ArrowRight':
      nudge(rx * step, rz * step);
      break;
    case 'ArrowLeft':
      nudge(-rx * step, -rz * step);
      break;
    case 'KeyF':
      focus();
      break;
    case 'Tab':
      e.preventDefault();
      toggleTop();
      break;
    case 'KeyP':
      testDrive();
      break;
    case 'KeyG':
      $('snap').checked = !$('snap').checked;
      break;
    case 'Escape':
      placing = null;
      ghostAt = null;
      drag = null;
      renderCatalogue();
      select(null);
      break;
    default:
      return;
  }
  e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// --- Top bar ---------------------------------------------------------------------

$('district').innerHTML = `<option value="" disabled selected>Open a district…</option>${DISTRICTS.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}`;
$('district').addEventListener('change', () => {
  const d = DISTRICTS.find((q) => q.id === $('district').value);
  if (session?.dirty && !window.confirm(`Open ${d.name}? Unsaved changes to ${session.doc.name} will be lost.`)) {
    $('district').value = session.doc.base || '';
    return;
  }
  open(docFromDistrict(d));
});
$('open').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async () => {
  const f = $('file').files[0];
  $('file').value = '';
  if (!f) return;
  let doc;
  try {
    doc = parseDoc(await f.text());
  } catch (err) {
    window.alert(`That isn't a map this SDK can open: ${err.message}`);
    return;
  }
  const d = DISTRICTS.find((q) => q.id === doc.base);
  if (d && baseChanged(doc, d)) window.alert(`${doc.name} was made from an older ${d.name}. It opens on the district as it is now; any edits whose object has gone are listed as lost.`);
  if (session?.dirty && !window.confirm(`Open ${doc.name}? Unsaved changes to ${session.doc.name} will be lost.`)) return;
  open(doc);
});
$('save').addEventListener('click', () => session && save());
$('undo').addEventListener('click', () => session?.undo() && changed());
$('redo').addEventListener('click', () => session?.redo() && changed());
$('fog').addEventListener('change', () => session && applyFog());
$('top-view').addEventListener('click', () => session && toggleTop());
$('drive').addEventListener('click', () => session && testDrive());
window.addEventListener('beforeunload', (e) => {
  if (session?.dirty) e.preventDefault();
});

// --- Loop ----------------------------------------------------------------------------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (flying && session) {
    const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4 : 1) * (20 + altitude() * 0.6) * dt;
    const f = forward();
    const [rx, rz] = right();
    const ax = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const az = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const ay = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
    cam.x += (f.x * az + rx * ax) * speed;
    cam.y += (f.y * az + ay) * speed;
    cam.z += (f.z * az + rz * ax) * speed;
  }
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  const f = forward();
  camera.position.set(cam.x, cam.y, cam.z);
  camera.lookAt(cam.x + f.x, cam.y + f.y, cam.z + f.z);
  view?.userData.animate?.(now / 1000, now / 1000);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// The start screen: nothing open until a map is chosen.
$('start-districts').innerHTML = DISTRICTS.map((d) => `<button data-id="${d.id}">${esc(d.name)}</button>`).join('');
$('start-districts').addEventListener('click', (e) => {
  const d = DISTRICTS.find((q) => q.id === e.target.closest('button')?.dataset.id);
  if (d) open(docFromDistrict(d));
});
$('start-file').addEventListener('click', () => $('file').click());
$('start-back').addEventListener('click', () => ($('start').hidden = true));
$('start').addEventListener('change', (e) => {
  const id = e.target.closest('.orow')?.dataset.id;
  if (id && e.target.dataset.act === 'on') setOverrideOn(id, e.target.checked);
});
$('start').addEventListener('click', (e) => {
  const act = e.target.dataset?.act;
  const id = e.target.closest('.orow')?.dataset.id;
  if (!id || !act || act === 'on') return;
  if (act === 'unpublish') return unpublish(id);
  const o = listOverrides(DISTRICTS).find((q) => q.id === id);
  if (!o) return;
  if (act === 'open') {
    if (session?.dirty && !window.confirm(`Open ${o.name}? Unsaved changes to ${session.doc.name} will be lost.`)) return;
    open(parseDoc(JSON.stringify(o.doc)));
  } else if (act === 'revert' && window.confirm(`Revert ${o.name}? Free roam goes back to the game's own ${o.name}, and these edits are deleted (save them as a .ttmap first to keep them).`)) {
    removeOverride(id);
    renderStart();
  }
});
$('home').addEventListener('click', () => {
  renderStart();
  $('start').hidden = false;
});
$('play').addEventListener('click', () => session && playInGame());
$('publish').addEventListener('click', () => session && publish());
renderStart();
try {
  const saved = localStorage.getItem(AUTOSAVE);
  const doc = saved ? parseDoc(saved) : null;
  if (doc) {
    const n = doc.edits.remove.length + Object.keys(doc.edits.move).length + doc.edits.add.length;
    $('start-resume').textContent = `${doc.name} (${n} edit${n === 1 ? '' : 's'}, ${new Date(doc.meta.modified).toLocaleString()})`;
    $('start-resume').addEventListener('click', () => open(doc));
    $('start-resume-box').hidden = false;
  }
} catch {
  // (No readable autosave: nothing to resume.)
}
hint();
