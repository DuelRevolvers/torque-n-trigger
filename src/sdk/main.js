import * as THREE from 'three';
import { DISTRICTS } from '../career/districts.js';
import { createTextures, createEnvMap } from '../render/textures.js';
import { createCityTextures } from '../render/cityTextures.js';
import { createStreetTextures } from '../render/streetTextures.js';
import { retroUniforms } from '../render/retroMaterial.js';
import { buildDistrictView, setDistrictStyles } from '../render/districtView.js';
import { docFromDistrict, districtFromDoc, serializeDoc, parseDoc, baseChanged, hashOf } from '../content/mapDoc.js';
import { canMove, LINKED, itemCentre } from '../sim/layoutEdits.js';
import { baseLayout } from '../sim/cityLayout.js';
import { brokenEvents, gridProblem, wayProblem } from './checks.js';
import { isSpot } from '../sim/routePoints.js';
import { layoutObstacle, districtMap } from '../sim/city.js';
import { onFoot } from '../sim/track.js';
import { TYPES, MODES, MODIFIER_LABELS, DRIVERS, newEvent, nextKey, routePoint, shortcutOptions, arenaSites, routePreview, aiTestRun } from './events.js';
import { arenasOf, outlineOf, outlineProblem, middleOf } from '../sim/arenaEdits.js';
import { Session, footBox } from './session.js';
import { catalogue, CATEGORIES, HOME_ONLY } from './catalogue.js';
import { brush, lift } from './brush.js';
import { GADGETS, addGadgets, SETTINGS, DROPS, GROUPS, NO_TURN, SIGN_STYLES, signSize, LIGHT_FIXTURES, LIGHT_FLICKER, LIGHT_COLORS, MAX_REAL_LIGHTS } from '../sim/gadgets.js';
import { placedView, startMarkers } from '../render/placedView.js';
import { Rain, RAIN_MAX, RAIN_USUAL } from '../render/rain.js';
import { makePickupMesh } from '../render/pickupMesh.js';
import { SPECIALS, progress, triggerText, specialOfType, specialOfGadget } from '../career/unlocks.js';
import { buildArena } from '../sim/arena.js';
import { gadgetView } from '../render/gadgetView.js';
import { readStore } from '../content/idb.js';
import { curvePts, roadEdit, gridRoadEdit, extraRoadEdit, removeExtra, joinAt, roadProblem, nodeProblem, lotEdit, gridLotEdit, lotAt, lotKinds, linePoints, featureAt, deleteStreet, setStreet, moveNode, removeNode, deleteSite, gridRemove, gridMoveLine } from './roads.js';
import * as G from '../sim/geom2d.js';
import { saveOverride, listOverrides, removeOverride, setOverrideOn, shippedMap } from '../content/store.js';
import { listMaps, saveMap, deleteMap, sdkGet, sdkPut } from '../content/library.js';
import { loadCareer } from '../career/career.js';
import { districtUnlocked } from '../career/districts.js';
import { blankDistrict, BLANK_STYLES } from './templates.js';

// The T&T SDK (Studio): opens a district as a map document; select, move,
// turn, delete and copy its objects, place new ones from the catalogue; undo,
// save and open .ttmap files, and test drive the map in the game.

// Studio (sdk.html: the owner's, publishes into the game) or the Creator (the
// game's page: the players', maps of their own, districts as they unlock them).
const CREATOR = globalThis.TT_EDITION === 'creator';
const AUTOSAVE = CREATOR ? 'autosave:creator' : 'autosave:studio';
const DRIVE = 'testdrive'; // read by the game (src/main.js), through IndexedDB
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
const hemi = new THREE.HemisphereLight(0xc8d0ff, 0x302838, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0e0, 1.2);
sun.position.set(300, 600, 200);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 9000);
const overlay = new THREE.Group(); // selection, hover and ghost boxes
scene.add(overlay);
const preview = new THREE.Group(); // the ground as a brush stroke has it so far
scene.add(preview);
const ring = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x05d9e8, depthTest: false, transparent: true, fog: false }));
ring.renderOrder = 11;
ring.visible = false;
scene.add(ring);
const slopeArrow = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffb000, depthTest: false, transparent: true, fog: false }));
slopeArrow.renderOrder = 11;
slopeArrow.visible = false;
scene.add(slopeArrow);
const PAINT_COLOR = { dirt: 0x9a7a58, grass: 0x4a9a58, sand: 0xe0cc98, road: 0x9894a8, water: 0x2a6ab8 };

let session = null;
let view = null; // the district as drawn
let cat = []; // this map's own objects
// Every other district's (loaded in the background after a map opens, and
// kept in this browser: othersOf): { ...entry, uid, district, from: the object }.
let others = [];
let othersLoading = null; // the district being loaded, or null
// (Objects placed from another district are drawn by that district's own view.)
setDistrictStyles((id) => DISTRICTS.find((d) => d.id === id)?.city || null);
let selected = null;
let hovered = null;
let placing = null; // the catalogue entry being placed
let placeYaw = 0;
let ghostAt = null; // where it would go: { x, z }
let drag = null; // { key, sx, sy, ox, oz, x, z, yaw, moved }
let flying = false;
let panning = null;
let tool = 'select';
let stroke = null; // a ground brush stroke under way (Session.stroke())
let brushAt = null; // where the brush is on the ground
let roadPts = []; // the road tool's points so far
let roadBends = []; // per stretch: the handle its curve passes through halfway, or null
let roadStage = 'drawing'; // 'drawing' (placing points), then 'shaping' (curves; Build street)
let lineFrom = null; // placing along a line: where it starts
let scatter = null; // placing by scatter: [[x, z, yaw]] so far
let feature = null; // a street, junction, site or gadget selected (sdk/roads.js featureAt)
let placingGadget = null; // a gadget type being placed
let gadgetGroup = null; // the gadgets as the game draws them, running
let evKey = null; // the event being edited (Events tool), and its working copy
let evDraft = null;
let evPreview = null;
let evGrid = null; // the draft's grid, if it doesn't fit (gridProblem)
let evWay = null; // where the draft runs into something off the streets (wayProblem)
let evRun = null; // an AI test run: { progress } while it runs, then its results
let rebuildTimer = 0;
const cam = { x: 0, y: 300, z: 400, yaw: Math.PI, pitch: -0.6, top: null };
const keys = new Set();

const H = (x, z) => session.map.heightAt(x, z);
const forward = () => new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
const flat = () => [Math.sin(cam.yaw), Math.cos(cam.yaw)];
const right = () => [-Math.cos(cam.yaw), Math.sin(cam.yaw)];
const altitude = () => Math.max(2, cam.y - (session ? H(cam.x, cam.z) : 0));
// How near (m) the cursor must be to grab a handle at (x, z): about the same on screen, near or far.
const grabR = (x, z, least = 3) => Math.max(least, Math.hypot(x - cam.x, H(x, z) - cam.y, z - cam.z) * 0.02);

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
    selected = hovered = placing = drag = ghostAt = stroke = null;
    clearGroup(preview);
    cat = catalogue([...session.base.values()]).map((e) => ({ ...e, uid: e.id }));
    loadOthers();
    $('district').value = doc.base || '';
    const b = session.map.bounds || { minX: -500, maxX: 500, minZ: -500, maxZ: 500 };
    Object.assign(cam, { x: (b.minX + b.maxX) / 2, z: b.maxZ + 150, yaw: Math.PI, pitch: -0.55, top: null });
    cam.y = H(cam.x, b.maxZ) + 320;
    homeCam = { x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch };
    applyFog();
    buildView();
    rebuildGadgets();
    refreshMarks();
    renderCatalogue();
    refresh();
  }, 30);
}

function applyFog(trying = null) {
  const theme = session.district.theme || {};
  const a = trying || atmosOf();
  const haze = new THREE.Color(a.haze || theme.haze || '#101018');
  scene.background = haze;
  const sky = tool === 'sky';
  scene.fog = $('fog').checked || sky ? new THREE.FogExp2(haze, (theme.fog || 0.004) * (a.fog ?? 1)) : null;
  // (Its darkness and rain while the Sky tab's open.)
  const dark = sky ? a.darkness || 0 : 0;
  hemi.intensity = 1.6 * (1 - 0.8 * dark);
  sun.intensity = 1.2 * (1 - 0.85 * dark);
  const rain = sky ? a.rain ?? RAIN_USUAL : 0;
  if (rain > 0 && !skyRain) {
    skyRain = new Rain(RAIN_MAX);
    scene.add(skyRain.mesh);
  }
  if (skyRain) {
    skyRain.setAmount(Math.round(RAIN_MAX * rain));
    skyRain.mesh.visible = rain > 0;
  }
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

function changed(rebuild = true) {
  if (selected && !session.item(selected)) selected = null;
  autosave();
  rebuildGadgets();
  refresh();
  showOverlay();
  if (rebuild) scheduleBuild();
}

// The map as it is, kept a moment after each change (the Maps screen's "Last session").
let autosaveTimer = 0;
function autosave() {
  clearTimeout(autosaveTimer);
  const doc = JSON.parse(serializeDoc(session.doc));
  autosaveTimer = setTimeout(() => sdkPut(AUTOSAVE, doc).catch((err) => console.warn('autosave:', err)), 400);
}

// Studio: a .ttmap file. The Creator: My maps (this browser), where the game finds it.
async function save() {
  if (CREATOR) {
    try {
      await saveMap(session.doc);
    } catch (err) {
      window.alert(`Couldn't save it: ${err.message}`);
      return;
    }
    toast(`${session.doc.name} saved to My maps: race it from the game's event list (Your maps).`);
  } else exportDoc(session.doc);
  session.dirty = false;
  refresh();
}

function exportDoc(doc) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([serializeDoc(doc)], { type: 'application/json' }));
  a.download = `${doc.name.replace(/[^\w -]+/g, '').trim() || doc.id}.ttmap`;
  a.click();
  URL.revokeObjectURL(a.href);
}

let toastTimer = 0;
function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), 6000);
}

// The game's free roam plays these edits (this browser), until reverted.
async function playInGame() {
  if (!session.doc.base) return window.alert('Only an edited built-in district can play in the game for now.');
  try {
    await saveOverride(JSON.parse(serializeDoc(session.doc)));
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
  // Every event in it has to work: the career plays a published district.
  const broken = brokenEvents(districtFromDoc(JSON.parse(serializeDoc(doc))));
  if (evDraft && evKey && JSON.stringify(evDraft) !== JSON.stringify(savedEvent(evKey))) return window.alert(`Save or revert ${evDraft.name} first (Events).`);
  if (broken.length) return window.alert(`${doc.name} can't be published: these events don't work with it as it is.\n\n${broken.map((b) => `• ${b.name}: ${b.error}`).join('\n')}\n\nPut back what they use (Ctrl+Z), or fix the events.`);
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
  const mine = listMaps();
  $('start-mine-box').hidden = !mine.length;
  $('start-mine').innerHTML = mine
    .map((d) => `<div class="orow" data-mine="${esc(d.meta.id)}"><label>${esc(d.name)}</label><button data-act="open-mine">Open</button><button data-act="export-mine" title="Save it as a .ttmap file">Export</button><button data-act="delete-mine" class="danger">Delete</button></div>`)
    .join('');
  $('start-published-box').hidden = CREATOR || !published.size;
  // (The Creator: what's unlocked, and how far along the rest are.)
  $('start-unlocks-box').hidden = !CREATOR;
  if (CREATOR) {
    const c = loadCareer();
    $('start-unlocks').innerHTML = SPECIALS.map((s) => {
      const p = progress(c, s.unlock);
      return `<div class="${p.met ? 'ok' : 'note'}">${p.met ? '✓' : '🔒'} ${esc(s.name)}${p.met ? '' : `: ${esc(triggerText(s.unlock))}${p.need > 1 ? ` (${p.have}/${p.need})` : ''}`}</div>`;
    }).join('');
  }
  // (The Creator opens the districts the career has reached.)
  const career = CREATOR ? loadCareer() : null;
  $('start-districts').querySelectorAll('button').forEach((b) => {
    const i = DISTRICTS.findIndex((d) => d.id === b.dataset.id);
    b.disabled = CREATOR && !districtUnlocked(career || { district: 0 }, i);
    b.title = b.disabled ? 'Reach it in the campaign to open it here' : '';
  });
  $('start-published').innerHTML = [...published]
    .map((id) => `<div class="orow" data-id="${esc(id)}"><label>${esc(DISTRICTS.find((d) => d.id === id)?.name || id)}</label><button data-act="unpublish" class="danger">Unpublish</button></div>`)
    .join('');
}

async function testDrive(eventKey = null) {
  // From where the middle of the view meets the ground, heading the way the camera looks.
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const g = groundHit();
  const spawn = { x: g ? g.x : cam.x, z: g ? g.z : cam.z, yaw: cam.yaw + Math.PI };
  // (The tab opens first: a browser only allows it straight after the click.)
  const tab = window.open('', 'tt-testdrive');
  try {
    await sdkPut(DRIVE, { doc: JSON.parse(serializeDoc(session.doc)), spawn, event: eventKey });
  } catch (err) {
    tab?.close();
    window.alert(`Couldn't hand the map to the game: ${err.message}`);
    return;
  }
  if (tab) tab.location.href = 'index.html?testdrive';
  else window.open('index.html?testdrive', 'tt-testdrive');
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
  if (drag?.moved && !drag.feature) {
    // The object where it's going: its box, moved and turned, kept at its height above the ground.
    const it = session.item(drag.key);
    const fb = footBox(it);
    const p = session.pose(drag.key);
    const lift = session.baseY(it) - H(fb.x, fb.z);
    box({ ...fb, x: fb.x + drag.x - p.x, z: fb.z + drag.z - p.z, yaw: fb.yaw + drag.yaw - p.yaw }, H(drag.x, drag.z) + lift, it.h || 2, 0x05d9e8, 0.25);
  } else if (selected) shown(selected, 0xffb000, 0.15);
  if (placing && ghostAt) {
    const { src, lift } = placingSource();
    const fb = footBox(src);
    const ghost = (x, z, yaw) => box({ x, z, w: fb.w, d: fb.d, yaw: fb.yaw + yaw }, H(x, z) + lift, src.h || 2, 0x05d9e8, 0.25);
    if (scatter) for (const [x, z, yaw] of scatter) ghost(x, z, yaw);
    else if (lineFrom) for (const [x, z, yaw] of linePoses(lineFrom, [ghostAt.x, ghostAt.z])) ghost(x, z, yaw);
    else ghost(ghostAt.x, ghostAt.z, placeYaw);
  }
  drawRing();
  showFeature();
}

// --- Ground tools -----------------------------------------------------------------

const BRUSHES = new Set(['height', 'raise', 'lower', 'smooth', 'flatten', 'paint', 'erase']);
const spacing = () => Math.max(1, Number($('spacing').value) || 8);
const TOOL_NAMES = { height: 'Raise / lower', raise: 'Raise', lower: 'Lower', smooth: 'Smooth', flatten: 'Flatten', paint: 'Paint', erase: 'Erase paint' };
const brushOpts = (dt) => ({ radius: Number($('radius').value), strength: Number($('strength').value), kind: $('kind').value, target: stroke?.target, dt, angle: ANGLED.has(tool) ? Number($('angle').value) : 0, dir: stroke?.dir, origin: stroke?.origin });
const ANGLED = new Set(['smooth', 'flatten']);

// The tool tabs (Select is always there, above them): each tab's tools, and the one it last had.
const TAB_OF = { height: 'terrain', raise: 'terrain', lower: 'terrain', smooth: 'terrain', flatten: 'terrain', paint: 'terrain', erase: 'terrain', road: 'roads', lot: 'roads', events: 'events', arena: 'events', sky: 'sky' };
const tabTool = { objects: 'select', terrain: 'height', roads: 'road', events: 'events', sky: 'sky' };
let tab = 'objects';
function showTab(t) {
  tab = t;
  for (const b of document.querySelectorAll('#tabs [data-tab]')) b.classList.toggle('on', b.dataset.tab === t);
  for (const p of document.querySelectorAll('#left .pane')) p.hidden = p.id !== `pane-${t}`;
}

// The mouse wheel raises and lowers the ground (the Raise / lower tool), or
// (off) Raise and Lower are held down. Kept in this browser.
const wheelLift = () => $('wheel-lift').checked;
try {
  $('wheel-lift').checked = localStorage.getItem('tt-sdk:wheelLift') !== 'off';
} catch {
  // (On.)
}
function showLiftTools() {
  const on = wheelLift();
  for (const b of document.querySelectorAll('[data-tool="height"]')) b.hidden = !on;
  for (const b of document.querySelectorAll('[data-tool="raise"], [data-tool="lower"]')) b.hidden = on;
}
showLiftTools();

function setTool(t) {
  if (t === 'height' && !wheelLift()) t = 'raise';
  if ((t === 'raise' || t === 'lower') && wheelLift()) t = 'height';
  if (stroke) endStroke();
  tool = t;
  roadPts = [];
  roadBends = [];
  roadStage = 'drawing';
  for (const b of document.querySelectorAll('#left [data-tool]')) b.classList.toggle('on', b.dataset.tool === t);
  if (TAB_OF[t]) {
    tabTool[TAB_OF[t]] = t;
    showTab(TAB_OF[t]);
  }
  $('brush-opts').hidden = !BRUSHES.has(t);
  $('brush-title').textContent = TOOL_NAMES[t] || 'Terrain';
  $('kind-row').hidden = t !== 'paint';
  $('wheel-row').hidden = !['height', 'raise', 'lower'].includes(t);
  $('strength-row').hidden = t === 'height' || t === 'paint' || t === 'erase';
  $('angle-row').hidden = !ANGLED.has(t);
  $('lift-row').hidden = t !== 'height';
  $('lift-up').textContent = `▲ Up a step (${keyName(binding.liftUp[0])})`;
  $('lift-down').textContent = `▼ Down a step (${keyName(binding.liftDown[0])})`;
  $('brush-tip').textContent = keyText(BRUSH_TIPS[t] || '');
  $('road-opts').hidden = t !== 'road';
  $('events-panel').hidden = t !== 'events';
  $('sky-panel').hidden = t !== 'sky';
  $('arena-panel').hidden = t !== 'arena';
  $('inspector').hidden = t === 'events' || t === 'sky' || t === 'arena' || BRUSHES.has(t);
  if (t !== 'arena') {
    arenaDraw = null;
    arenaSpawning = false;
  }
  if (session) {
    if (t === 'sky') renderSky();
    if (t === 'events' || t === 'arena') renderArenas();
    if (t === 'arena') renderEvents();
    drawArenas();
    applyFog();
  }
  if (t === 'events') renderEvents();
  else showEventLine();
  $('lot-opts').hidden = t !== 'lot';
  if (t === 'lot') $('lot-kind').innerHTML = lotKinds(session.district.city.plan || { lots: session.district.city.grid?.lots }).map((k) => `<option>${esc(k)}</option>`).join('');
  showRoad();
  showLotHover();
  if (t !== 'select') {
    placing = null;
    ghostAt = null;
    drag = null;
    hovered = null;
    renderCatalogue();
  }
  showBrush();
  showOverlay();
  hint();
}

function clearGroup(g) {
  for (const o of [...g.children]) {
    g.remove(o);
    dispose(o);
  }
}

// A slider's number box (input.num, data-for the slider, data-unit shown
// after it): it shows the slider's value; click it (or tab to it) and type
// another. It can't go past the slider's ends: a number past them is capped
// as it's typed (where more digits could only take it further), and on
// Enter or leaving the box it's kept within them and to the slider's step.
// Esc puts it back.
function numberBox(box) {
  const range = $(box.dataset.for);
  const unit = box.dataset.unit || '';
  const [min, max, step] = [Number(range.min), Number(range.max), Number(range.step) || 1];
  const places = (String(range.step || 1).split('.')[1] || '').length;
  box.title = `Click to type a number (${min} to ${max})`;
  const show = () => {
    if (document.activeElement !== box) box.value = `${range.value}${unit}`;
  };
  const apply = () => {
    const v = Number(box.value.replace(',', '.'));
    if (box.value.trim() !== '' && Number.isFinite(v)) {
      const kept = Math.min(max, Math.max(min, min + Math.round((v - min) / step) * step));
      if (kept.toFixed(places) === range.value) return;
      range.value = kept.toFixed(places);
      range.dispatchEvent(new Event('input'));
      range.dispatchEvent(new Event('change'));
    }
  };
  range.addEventListener('input', show);
  box.addEventListener('focus', () => {
    box.value = range.value;
    box.select();
  });
  box.addEventListener('input', () => {
    // (Digits, one point and a leading minus where the slider goes below zero.)
    let t = box.value.replace(',', '.').replace(min < 0 ? /[^\d.-]/g : /[^\d.]/g, '');
    t = t.replace(/(?!^)-/g, '').replace(/(\..*)\./g, '$1');
    const v = Number(t);
    if (t !== '' && t !== '-' && Number.isFinite(v)) {
      if (v > max && v > 0) t = String(max);
      else if (v < min && v < 0) t = String(min);
    }
    if (t !== box.value) box.value = t;
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') box.blur();
    else if (e.key === 'Escape') {
      box.value = range.value;
      box.blur();
    }
  });
  box.addEventListener('blur', () => {
    apply();
    box.value = `${range.value}${unit}`;
  });
  show();
}

// The brush's edge on the ground.
function showBrush() {
  if (!BRUSHES.has(tool) || !brushAt || !session) {
    ring.visible = false;
    slopeArrow.visible = false;
    return;
  }
  const R = Number($('radius').value);
  const hAt = stroke ? stroke.heightAt : H;
  const [cx, cz] = tool === 'height' ? liftPoint(brushAt) : [brushAt.x, brushAt.z];
  const pts = [];
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    const x = cx + Math.cos(a) * R;
    const z = cz + Math.sin(a) * R;
    pts.push(x, hAt(x, z) + 0.3, z);
  }
  // (Angled: an arrow up the slope, as steep as it.)
  const angle = ANGLED.has(tool) ? Number($('angle').value) : 0;
  slopeArrow.visible = !!angle;
  if (angle) {
    const [fx, fz] = stroke?.dir || flat();
    const y0 = hAt(cx, cz) + 0.5;
    const rise = Math.tan((angle * Math.PI) / 180);
    const tip = [cx + fx * R, y0 + rise * R, cz + fz * R];
    const barb = (s) => [tip[0] - fx * R * 0.2 + fz * s * R * 0.12, tip[1] - rise * R * 0.2, tip[2] - fz * R * 0.2 - fx * s * R * 0.12];
    slopeArrow.geometry.dispose();
    slopeArrow.geometry = new THREE.BufferGeometry().setFromPoints([[cx, y0, cz], tip, barb(1), tip, barb(-1)].map((p) => new THREE.Vector3(...p)));
  }
  ring.geometry.dispose();
  ring.geometry = new THREE.BufferGeometry();
  ring.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  ring.material.color.set(tool === 'paint' ? PAINT_COLOR[$('kind').value] : tool === 'erase' ? 0xff2a6d : 0x05d9e8);
  ring.visible = true;
}

// The stroke so far: reshaped ground as a wire grid, paint as coloured cells.
function showPreview() {
  clearGroup(preview);
  if (!stroke) return;
  const [x0, x1, z0, z1] = stroke.box;
  if (tool === 'paint') {
    const c = stroke.paint.cell;
    const by = {};
    for (const [k, kind] of Object.entries(stroke.paint.s)) {
      const [i, j] = k.split(',').map(Number);
      if ((i + 1) * c < x0 || i * c > x1 || (j + 1) * c < z0 || j * c > z1) continue;
      (by[kind] ??= []).push(i * c, j * c);
    }
    for (const [kind, list] of Object.entries(by)) {
      const pos = [];
      for (let q = 0; q < list.length; q += 2) {
        const [x, z] = [list[q], list[q + 1]];
        const y = (px, pz) => H(px, pz) + 0.2;
        pos.push(x, y(x, z), z, x + c, y(x + c, z + c), z + c, x + c, y(x + c, z), z, x, y(x, z), z, x, y(x, z + c), z + c, x + c, y(x + c, z + c), z + c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      preview.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: PAINT_COLOR[kind], transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, fog: false })));
    }
    return;
  }
  if (tool === 'erase') return;
  const step = Math.max(stroke.terrain.cell, Math.max(x1 - x0, z1 - z0) / 80);
  const nx = Math.max(1, Math.ceil((x1 - x0) / step));
  const nz = Math.max(1, Math.ceil((z1 - z0) / step));
  const pos = [];
  const idx = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + i * step;
      const z = z0 + j * step;
      pos.push(x, stroke.heightAt(x, z) + 0.2, z);
      if (i < nx && j < nz) {
        const k = j * (nx + 1) + i;
        idx.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  preview.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x05d9e8, wireframe: true, transparent: true, opacity: 0.45, fog: false })));
}

// --- Roads, blocks, lines of objects, scatter ------------------------------------

const lineMat = () => new THREE.LineBasicMaterial({ color: 0xffb000, depthTest: false, transparent: true, fog: false });
const roadLine = new THREE.Line(new THREE.BufferGeometry(), lineMat());
const blockLine = new THREE.LineLoop(new THREE.BufferGeometry(), lineMat());
for (const l of [roadLine, blockLine]) {
  l.renderOrder = 12;
  l.visible = false;
  scene.add(l);
}
function setLine(line, pts) {
  line.geometry.dispose();
  line.geometry = new THREE.BufferGeometry();
  line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap(([x, z]) => [x, H(x, z) + 0.5, z]), 3));
  line.visible = pts.length > 1;
}

// The street being drawn (its curves too), along the ground, to the cursor
// while placing; and its handles: amber for points, blue for curves.
const roadMarks = new THREE.Group();
scene.add(roadMarks);
function showRoad() {
  clearGroup(roadMarks);
  if (tool !== 'road' || !session) {
    roadLine.visible = false;
    return;
  }
  const pts = [...roadPts];
  if (roadStage === 'drawing' && brushAt?.snapped && roadPts.length) pts.push(brushAt.snapped);
  const line = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const seg = roadBends[k] ? curvePts(pts[k], roadBends[k], pts[k + 1], 16) : [pts[k], pts[k + 1]];
    line.push(...(k ? seg.slice(1) : seg));
  }
  if (pts.length === 1) line.push(pts[0]);
  setLine(roadLine, densify(line));
  roadLine.material.color.setHex(pts.length > roadPts.length && roadWhy(pts, [...roadBends, null]) ? 0xff3860 : 0xffb000);
  const mark = (x, z, color, s) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial({ color, depthTest: false, fog: false }));
    m.position.set(x, H(x, z) + 0.8, z);
    m.renderOrder = 14;
    roadMarks.add(m);
  };
  const size = Math.max(1.2, altitude() * 0.012);
  roadPts.forEach(([x, z]) => mark(x, z, 0xffb000, size));
  // (Where the next point would join a street: a ring there.)
  const next = roadStage === 'drawing' && brushAt?.snapped ? joinAt(session, ...brushAt.snapped) : null;
  if (next) {
    const r = Math.max(4, altitude() * 0.02);
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([...Array(24).keys()].map((k) => new THREE.Vector3(next[0] + Math.cos((k / 24) * Math.PI * 2) * r, H(next[0], next[1]) + 0.6, next[1] + Math.sin((k / 24) * Math.PI * 2) * r))), new THREE.LineBasicMaterial({ color: 0x05d9e8, depthTest: false, transparent: true, fog: false }));
    ring.renderOrder = 14;
    roadMarks.add(ring);
  }
  if (roadStage === 'shaping') roadPts.slice(1).forEach((b, k) => mark(...roadHandle(k), 0x05d9e8, size));
}

// Why the road through these points (with these bends) can't be built, or null.
function roadWhy(pts, bends = roadBends) {
  return pts.length < 2 ? null : roadProblem(session, pts, { width: $('road-width').value, bends });
}

// Where stretch k's curve handle is: its bend, or halfway along it.
const roadHandle = (k) => roadBends[k] || [(roadPts[k][0] + roadPts[k + 1][0]) / 2, (roadPts[k][1] + roadPts[k + 1][1]) / 2];

// The handle at ground point g: { point } or { bend }.
function roadHandleAt(g) {
  const near = grabR(g.x, g.z);
  const d = ([x, z]) => Math.hypot(x - g.x, z - g.z);
  const p = roadPts.findIndex((q) => d(q) < near);
  if (p >= 0) return { point: p };
  const b = roadPts.slice(1).findIndex((_, k) => d(roadHandle(k)) < near);
  return b >= 0 ? { bend: b } : null;
}

// A point placed at a 15° step from the last one's heading (Alt, or snapping off: any angle).
function roadSnap([x, z], e) {
  const last = roadPts[roadPts.length - 1];
  if (!last || e?.altKey || !$('snap-turn').checked) return [x, z];
  const L = Math.hypot(x - last[0], z - last[1]);
  const a = Math.round(Math.atan2(x - last[0], z - last[1]) / turnStep()) * turnStep();
  return [last[0] + Math.sin(a) * L, last[1] + Math.cos(a) * L];
}

// Space (or a double-click): no more points; now curve it, and Build street.
function endRoadPlacing() {
  if (roadPts.length < 2) return toast('Place at least two points first.');
  roadStage = 'shaping';
  showRoad();
  hint();
}

function clearRoad() {
  roadPts = [];
  roadBends = [];
  roadStage = 'drawing';
  showRoad();
}

// A point every few metres along a line (so it follows the ground).
function densify(pts) {
  const dense = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, az] = pts[k];
    const [bx, bz] = pts[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4));
    for (let q = 0; q < n; q++) dense.push([ax + ((bx - ax) * q) / n, az + ((bz - az) * q) / n]);
  }
  if (pts.length) dense.push(pts[pts.length - 1]);
  return dense;
}

// --- Streets, junctions and sites already there -----------------------------------

const featLine = new THREE.Line(new THREE.BufferGeometry(), lineMat());
featLine.renderOrder = 12;
featLine.visible = false;
scene.add(featLine);

function selectFeature(f) {
  feature = f;
  selected = null;
  refresh();
  showOverlay();
}

// The selected street, junction (a ring round it) or site, outlined.
function showFeature() {
  const f = drag?.feature ? { ...drag.feature, x: drag.x, z: drag.z } : feature;
  if (!f || !session) {
    featLine.visible = false;
    return;
  }
  const pts =
    f.type === 'node' || f.type === 'gadget' ? [...Array(25).keys()].map((k) => [f.x + Math.cos((k / 24) * Math.PI * 2) * (f.r || 6), f.z + Math.sin((k / 24) * Math.PI * 2) * (f.r || 6)])
      : f.type === 'site' ? [...f.poly, f.poly[0]]
        : f.pts;
  setLine(featLine, densify(pts));
}

// A change to the streets or sites: the district is built again (refused and
// undone if it can't be). The selection is found again at `at`.
// (check: why the change can't be kept, or null: a change that makes a problem there wasn't before is undone.)
function editFeature(label, make, at, check) {
  let patch;
  try {
    patch = make();
  } catch (err) {
    window.alert(err.message);
    return;
  }
  const type = feature?.type;
  rebuildDistrict(
    label,
    (e) => Object.assign(e, patch),
    (kept) => {
      const again = kept && at ? featureAt(session, ...at) : null;
      feature = again && again.type === type ? again : kept ? null : feature;
    },
    check,
  );
}

function deleteFeature() {
  const f = feature;
  if (!f) return;
  if (f.type === 'gadget') {
    session.removeGadget(f.id);
    feature = null;
    return changed(false);
  }
  const make =
    f.type === 'street' && f.extra !== undefined ? () => ({ grid: removeExtra(session, f.extra) })
      : f.type === 'street' ? () => ({ plan: deleteStreet(session, f) })
      : f.type === 'node' ? () => ({ plan: removeNode(session, f.name) })
        : f.type === 'site' ? () => deleteSite(session, f)
          : () => ({ grid: gridRemove(session, f) });
  editFeature(`Taking out ${f.name}…`, make, null);
}

function featureInspector(ins) {
  const f = feature;
  if (f.type === 'gadget') return gadgetInspector(ins, f);
  const warn = '<p class="note">Events that use it may stop working: check them before publishing.</p>';
  if (f.type === 'street') {
    ins.innerHTML = `
      <h3>${esc(f.name)}</h3><div class="key">street${f.ringRoad ? ' (ring road)' : ''}</div>
      ${f.key ? `<div class="grid">
        <label for="st-name">name</label><input id="st-name" value="${esc(f.spec.name)}" />
        <label for="st-width">width (m)</label><input id="st-width" type="number" min="4" max="60" step="1" value="${f.width}" />
        <label for="st-surface">surface</label><select id="st-surface"><option value="asphalt"${f.surface === 'asphalt' ? ' selected' : ''}>Asphalt</option><option value="dirt"${f.surface === 'dirt' ? ' selected' : ''}>Dirt</option></select>
      </div>` : ''}
      ${f.fixed ? `<p class="note">${esc(f.fixed)}</p>` : ''}
      <div class="row">${f.key ? '<button id="st-apply">Apply</button>' : ''}${f.fixed ? '' : '<button id="f-del" class="danger">Delete street</button>'}</div>
      ${warn}`;
    $('st-apply')?.addEventListener('click', () =>
      editFeature('Rebuilding the street…', () => ({ plan: setStreet(session, f, { name: $('st-name').value, width: Number($('st-width').value), surface: $('st-surface').value }) }), f.at));
  } else if (f.type === 'node') {
    ins.innerHTML = `
      <h3>${esc(f.name)}</h3><div class="key">junction</div>
      ${f.movable ? `<div class="grid">
        <label for="n-x">x (m)</label><input id="n-x" type="number" step="1" value="${f.x.toFixed(1)}" />
        <label for="n-z">z (m)</label><input id="n-z" type="number" step="1" value="${f.z.toFixed(1)}" />
      </div><p class="note">Drag it to move it: every street through it follows.</p>` : '<p class="note">Part of a ring road or the rooftops: it moves with them.</p>'}
      <div class="row">${f.movable ? '<button id="f-del" class="danger">Remove junction</button>' : ''}</div>
      ${warn}`;
    for (const id of ['n-x', 'n-z']) {
      $(id)?.addEventListener('change', () => {
        const x = Number($('n-x').value);
        const z = Number($('n-z').value);
        editFeature('Moving the junction…', () => ({ plan: moveNode(session, f.name, x, z) }), [x, z], () => nodeProblem(session, f.name));
      });
    }
  } else if (f.type === 'site') {
    ins.innerHTML = `
      <h3>${esc(f.name)}</h3><div class="key">site (${esc(f.kind)})</div>
      <div class="row"><button id="f-del" class="danger">Delete site</button></div>
      ${f.kind === 'arena' ? '<p class="note warn">An event ground: the arena events held here stop working without it.</p>' : warn}`;
  } else {
    ins.innerHTML = `
      <h3>${esc(f.name)}</h3><div class="key">street, junction to junction</div>
      <div class="grid"><label for="g-line">${f.line.axis} (m)</label><input id="g-line" type="number" step="5" value="${f.line.value}" /></div>
      <p class="note">Moves the whole ${f.dir === 'h' ? 'row' : 'column'} of streets it's on.</p>
      <div class="row"><button id="f-del" class="danger">Delete this piece</button></div>
      ${warn}`;
    $('g-line').addEventListener('change', () => {
      const v = Number($('g-line').value);
      editFeature('Moving the streets…', () => ({ grid: gridMoveLine(session, f.line, v) }), f.line.axis === 'x' ? [v, f.at[1]] : [f.at[0], v]);
    });
  }
  $('f-del')?.addEventListener('click', deleteFeature);
}

function buildRoad() {
  const pts = roadPts;
  const bends = roadBends;
  clearRoad();
  if (pts.length < 2) return;
  const name = $('road-name').value;
  let patch;
  try {
    const opts = { width: $('road-width').value, surface: $('road-surface').value, name, bends };
    if (session.map.plan) patch = { plan: roadEdit(session, pts, opts) };
    else {
      // Rustline: along a row or column between two junctions, a grid street; any other line, a street off the grid.
      let grid = null;
      if (!bends.some(Boolean)) {
        try {
          grid = gridRoadEdit(session, pts, name);
        } catch {
          grid = null;
        }
      }
      patch = { grid: grid || extraRoadEdit(session, pts, opts) };
    }
  } catch (err) {
    window.alert(err.message);
    return;
  }
  rebuildDistrict('Building the street…', (e) => Object.assign(e, patch), (kept) => kept && toast(`${name.trim() || 'New Street'} built: its blocks are filled the district's way.`));
}

function setLot(g) {
  const lot = lotAt(session, g.x, g.z);
  if (!lot) return;
  const kind = $('lot-kind').value;
  rebuildDistrict('Filling the block…', lot.grid ? (e) => (e.grid = gridLotEdit(session, lot.grid, kind)) : (e) => (e.plan = lotEdit(session, g.x, g.z, kind)));
}

// A change to the streets, blocks or sites: the district is built again (a
// change it can't be built with is refused). Then its events are checked: if
// the change stops any of them working, you're asked whether to keep it.
function rebuildDistrict(label, mutate, done, check) {
  setBusy(label);
  setTimeout(() => {
    try {
      const before = session.broken ?? brokenEvents(session.withEvents());
      const was = check?.();
      if (!session.change(mutate)) {
        setBusy(null);
        return;
      }
      const why = check?.();
      if (why && !was) {
        session.undo();
        session.future.pop();
        done?.(false);
        changed();
        window.alert(`That can't be done: ${why}`);
        return;
      }
      const after = brokenEvents(session.withEvents());
      const newly = after.filter((b) => !before.some((q) => q.key === b.key));
      const list = newly.map((b) => `• ${b.name}: ${b.error}`).join('\n');
      if (newly.length && !window.confirm(`This stops ${newly.length === 1 ? 'an event' : 'these events'} working:\n\n${list}\n\nKeep the change anyway? (They'll need fixing before this district can be published.)`)) {
        session.undo();
        session.future.pop();
        session.broken = before;
        done?.(false);
      } else {
        session.broken = after;
        done?.(true);
      }
      changed();
    } catch (err) {
      setBusy(null);
      window.alert(`That can't be built: ${err.message}`);
    }
  }, 30);
}

// The block under the cursor (the lot tool).
function showLotHover() {
  const lot = tool === 'lot' && brushAt && session ? lotAt(session, brushAt.x, brushAt.z) : null;
  if (!lot) blockLine.visible = false;
  else setLine(blockLine, lot.poly);
}

// What's being placed: the object copied (this district's, or one carried from another)
// and how high it stands off the ground.
function placingSource() {
  const f = placing.from;
  if (typeof f === 'string') {
    const src = session.base.get(f);
    const fb = footBox(src);
    return { src, lift: session.baseY(src) - H(fb.x, fb.z) };
  }
  return { src: f.item, lift: typeof f.item.y === 'number' ? f.item.y - f.ground : 0 };
}

// Copies along a line from a to b, turned to run along it.
function linePoses(a, b) {
  const { pts, yaw } = linePoints(a, b, spacing());
  const fb = footBox(placingSource().src);
  return pts.slice(0, 300).map(([x, z]) => [x, z, yaw - fb.yaw + placeYaw]);
}

function placeLine(a, b) {
  const ids = session.addMany(placing.from, linePoses(a, b));
  lineFrom = null;
  selected = ids[ids.length - 1] || null;
  changed();
}

const onStreet = (x, z) => (session.map.edgeList || []).some((e) => e.street && G.nearestOnLine(e.pts, x, z).d < e.street.half + 1);

// Scatter: a few tries a frame at a spot in the brush, clear of the streets and
// of what's been scattered already (spacing apart), each turned at random.
function scatterTick() {
  const r = spacing() * 2.5;
  for (let k = 0; k < 3 && scatter.length < 400; k++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * r;
    const x = ghostAt.x + Math.cos(a) * d;
    const z = ghostAt.z + Math.sin(a) * d;
    if (scatter.some(([px, pz]) => Math.hypot(px - x, pz - z) < spacing()) || onStreet(x, z)) continue;
    scatter.push([x, z, Math.random() * Math.PI * 2]);
  }
  showOverlay();
}

function endStroke() {
  const s = stroke;
  stroke = null;
  clearTimeout(s.timer);
  clearGroup(preview);
  setBusy('Reshaping the ground…');
  reshaping = true;
  setTimeout(() => {
    try {
      if (s.commit()) changed();
      else setBusy(null);
    } finally {
      reshaping = false;
    }
  }, 30);
}

// --- Raise / lower with the mouse wheel ---------------------------------------------
// Each notch lifts (or lowers) the ground at the grid point nearest the brush
// to the next multiple of the move grid (Snap moves' size; Alt, or snapping
// off: 25 cm), the brush round it by as much. Notches in a row are one step
// to undo: the ground's built again once they stop.

let wheelSum = 0;
let liftKeyAt = 0; // (a held key's last step)
let reshaping = false; // (a stroke being built into the district: wait for it)

// The terrain grid point nearest a ground point.
function liftPoint(g) {
  const c = session?.doc.edits.terrain?.cell || 4;
  return [Math.round(g.x / c) * c, Math.round(g.z / c) * c];
}

// One step (dir 1 up, -1 down) at ground point g (the buttons: where the brush last was, or the middle of the view).
function liftStep(dir, g = brushAt || viewMiddle(), free = false) {
  if (!session || reshaping || !g) return;
  if (stroke && !stroke.wheel) endStroke();
  if (!stroke) {
    stroke = session.stroke();
    stroke.wheel = true;
    stroke.box = [g.x, g.x, g.z, g.z];
  }
  const [x, z] = liftPoint(g);
  const R = Number($('radius').value);
  const step = free || !$('snap').checked ? 0.25 : gridSize();
  const goal = lift(stroke, x, z, { radius: R, step, dir });
  const b = stroke.box;
  stroke.box = [Math.min(b[0], x - R), Math.max(b[1], x + R), Math.min(b[2], z - R), Math.max(b[3], z + R)];
  showPreview();
  showBrush();
  $('coords').textContent = `Ground ${goal.toFixed(2)} m`;
  clearTimeout(stroke.timer);
  stroke.timer = setTimeout(() => stroke?.wheel && endStroke(), 700);
}

// The ground in the middle of the view.
function viewMiddle() {
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  return groundHit();
}

// What each terrain tool does (the panel on the right says).
const BRUSH_TIPS = {
  height: 'Over the ground, the mouse wheel (or W and S) raises or lowers it a step: to the next multiple of the move grid (Snap moves; hold {fine}, or snapping off: 25 cm), falling off to the brush\'s edge. Hold the right button to zoom with the wheel, or fly with W and S.',
  raise: 'Hold the left button and move to raise the ground.',
  lower: 'Hold the left button and move to lower the ground.',
  smooth: 'Hold the left button and move to smooth the ground. Angle: smooth it into a slope, rising the way you look.',
  flatten: 'Hold the left button and move: flat at the height where you started. Angle: a slope from there instead, rising the way you look (negative: falling).',
  paint: 'Hold the left button and paint: dirt and grass are off-road grip, water drops the car in.',
  erase: 'Hold the left button and move to take paint off.',
};

// --- Events ------------------------------------------------------------------------

const eventLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x05d9e8, depthTest: false, transparent: true, fog: false }));
eventLine.renderOrder = 12;
eventLine.visible = false;
scene.add(eventLine);
const stuckMarks = new THREE.Group();
scene.add(stuckMarks);

const allEvents = () => {
  const { events, boss } = session.events();
  return [...events, ...(boss && !CREATOR ? [boss] : [])];
};
const savedEvent = (key) => allEvents().find((e) => e.key === key) || null;
const isBoss = () => evKey === 'boss';

function editEvent(key, draft) {
  evKey = key;
  evDraft = draft ? JSON.parse(JSON.stringify(draft)) : null;
  evRun = null;
  evStage = null;
  evSel = null;
  clearGroup(stuckMarks);
  previewEvent();
  renderEvents();
}

// The route the game would build for the draft, drawn on the map.
let previewTimer = 0;
function previewEvent() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const r = evDraft?.route;
    const needs = r && ((r.kind === 'sprint' || r.kind === 'circuit') ? r.path.length >= 2 : r.kind === 'drag' ? !!r.along && !!r.to : true);
    evPreview = needs ? routePreview({ ...session.withEvents(), events: [] }, r) : null;
    const built = evPreview && !evPreview.error && evPreview.pts;
    evGrid = built ? gridProblem(session.withEvents(), evDraft) : null;
    evWay = built ? wayProblem(session.withEvents(), evDraft) : null;
    showEventLine();
    const box = $('ev-preview');
    if (box) box.innerHTML = previewText();
  }, 150);
}

function showEventLine() {
  drawEventMarks();
  if (tool !== 'events' || !evPreview || evPreview.error) {
    eventLine.visible = false;
    return;
  }
  setLine(eventLine, evPreview.rect ? densify([...evPreview.rect, evPreview.rect[0]]) : evPreview.pts);
}

function previewText() {
  const r = evDraft?.route;
  if (!r) return '';
  if (!evPreview) return r.kind === 'drag' ? '<p class="note">Click where it starts, then where it finishes, on one street.</p>' : '<p class="note">Place the start, click where the race goes, then Space: the last point is the finish.</p>';
  if (evPreview.error) return `<p class="note warn">Can't be set up: ${esc(evPreview.error)}</p>`;
  if (evPreview.rect) return `<p class="note ok">Arena: ${evPreview.sizeX.toFixed(0)} × ${evPreview.sizeZ.toFixed(0)} m.</p>`;
  const laps = evDraft.type === 'circuit' ? evDraft.laps || 1 : 1;
  // (A start or finish up on top of something.)
  const up = (y, p, what) => (y !== null && y !== undefined ? `<p class="note">${what} is ${(y - H(p[0], p[1])).toFixed(1)} m up, on top of something${what === 'The finish' ? ': a car has to get up there to finish' : ''}.</p>` : '');
  return `<p class="note ok">${(evPreview.length / 1000).toFixed(2)} km${evPreview.closed ? ` a lap × ${laps} = ${((evPreview.length * laps) / 1000).toFixed(2)} km` : ''}; ${evPreview.shortcuts} shortcut${evPreview.shortcuts === 1 ? '' : 's'} open.</p>
    ${evGrid ? `<p class="note warn">${esc(evGrid.text.replace('something', thing(evGrid.key)))}</p>` : ''}
    ${evWay ? `<p class="note warn">${esc(evWay.text.replace('something', thing(evWay.key)))}</p>` : ''}
    ${up(evPreview.startY, r.path[0], 'The start')}${evPreview.closed ? '' : up(evPreview.finishY, r.path[r.path.length - 1], 'The finish')}`;
}

// A click on the map while editing an event's route.
function routeClick(g) {
  const r = evDraft?.route;
  if (!r) return;
  if (r.kind === 'sprint' || r.kind === 'circuit') {
    if (!evStage) return toast('Press Place start first (Route, on the right).');
    if (evStage === 'start') {
      const s = raceSpot();
      if (s.why) return toast(s.why);
      placeStart(s.at);
    } else if (evStage === 'placing') {
      const p = routeAdd();
      if (p.why) return toast(p.why);
      if (JSON.stringify(r.path[r.path.length - 1]) !== JSON.stringify(p.point)) r.path.push(p.point);
    }
  } else if (r.kind === 'drag') {
    // A drag: its start on a street, then its finish (one click) further along it.
    if (!evStage) return toast('Press Place start first (Route, on the right).');
    const f = featureAt(session, g.x, g.z);
    const street = f?.type === 'street' || f?.type === 'gridStreet' ? f.name : null;
    const at = [Math.round(g.x), Math.round(g.z)];
    if (evStage === 'start') {
      if (!street) return toast('Put the start on a street.');
      const keep = r.along === street && r.to !== null && r.to !== undefined && r.along;
      Object.assign(r, { along: street, from: at, to: keep ? r.to : null });
      evStage = keep ? 'editing' : 'placing';
    } else if (evStage === 'placing') {
      if (street !== r.along) return toast(`Put the finish on ${r.along}, the street it starts on.`);
      r.to = at;
      evStage = 'editing';
    } else return;
  } else return;
  renderEvents();
  previewEvent();
}

function renderEvents() {
  const panel = $('events-panel');
  if (!session || (tool !== 'events' && tool !== 'arena')) return;
  const list = allEvents();
  const row = (e) => `<div class="evrow${e.key === evKey ? ' on' : ''}" data-key="${esc(e.key)}"><span>${esc(e.name)}</span><i>${e.key === 'boss' ? 'boss' : TYPES[e.type] || e.type}${e.rival ? ', rival' : ''}</i></div>`;
  $('events-list').innerHTML = `<h4>This district's events</h4>${list.map(row).join('') || '<p class="note">None yet.</p>'}
    <h4>New event</h4><div class="toolgrid">${Object.entries(TYPES).map(([t, n]) => `<button data-new="${t}">+ ${n}</button>`).join('')}</div>`;
  let html = evDraft ? '' : '<h3>Events</h3><p class="note">Pick an event on the left to edit it here, or make a new one.</p>';
  const d = evDraft;
  if (d) {
    const r = d.route;
    const field = (id, label, value, type = 'number', step = 1) => `<label for="${id}">${label}</label><input id="${id}" type="${type}" step="${step}" value="${esc(value ?? '')}" />`;
    html += `
      <h3>${evKey && savedEvent(evKey) ? 'Editing' : 'New'}: ${esc(TYPES[d.type] || d.type)}</h3>
      <div class="grid">
        ${field('ev-name', 'name', d.name, 'text')}
        ${field('ev-cars', 'cars', d.cars)}
        ${CREATOR ? '' : field('ev-purse', 'purse ($)', d.purse, 'number', 50)}
        ${d.type === 'circuit' ? field('ev-laps', 'laps', d.laps) : ''}
        ${d.type === 'drag' ? field('ev-finish', 'length (m)', d.finishS ?? 414, 'number', 10) : ''}
        ${d.type === 'arena' ? `<label for="ev-mode">mode</label><select id="ev-mode">${Object.entries(MODES).map(([k, n]) => `<option value="${k}"${d.mode === k ? ' selected' : ''}>${n}</option>`).join('')}</select>${field('ev-time', 'time (s)', d.timeLimit, 'number', 10)}<label for="ev-site">ground</label><select id="ev-site">${arenaSites(session).map((a) => `<option value="${a.site}"${r.site === a.site ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select>` : ''}
        ${isBoss() ? `<label for="ev-driver">boss</label><select id="ev-driver">${DRIVERS.map((q) => `<option value="${q.id}"${d.driver === q.id ? ' selected' : ''}>${esc(q.name)}</option>`).join('')}</select>` : ''}
      </div>
      <textarea id="ev-desc" placeholder="What the event is, for the event list">${esc(d.desc || '')}</textarea>
      <div class="checks">
        ${isBoss() || CREATOR ? '' : `<label><input type="checkbox" id="ev-rival"${d.rival ? ' checked' : ''} /> Rival race (the district's rival drives it)</label>`}
        ${Object.entries(MODIFIER_LABELS).map(([k, n]) => `<label><input type="checkbox" data-mod="${k}"${(d.modifiers || []).includes(k) ? ' checked' : ''} /> ${esc(n)}</label>`).join('')}
        ${d.type === 'drag' ? '' : `<label title="Health, ammo and nitro drops the game puts along the route (or round the arena). The drops placed on the map are there either way."><input type="checkbox" id="ev-autodrops"${d.autoDrops === false ? '' : ' checked'} /> Automatic drops</label>`}
      </div>
      <h4>Route</h4>
      ${r.kind === 'sprint' || r.kind === 'circuit' ? `<div class="row">
          <button id="ev-start" class="${evStage === 'start' ? 'on' : ''}" title="Then click the start on the map">⚑ Place start</button>
          ${evStage === 'placing' ? '<button id="ev-finish" title="The last point is the finish (Space)">🏁 Finish here</button>' : r.path.length ? '<button id="ev-more" title="Click more points after the last">Continue placing</button>' : ''}
        </div>
        <p class="note">${routeStageText(r)}</p>
        <div class="chips">${r.path.map((p, k) => `<span class="chip">${esc(pointLabel(r, k))}<b data-drop="${k}" title="Take it out">×</b></span>`).join('') || '<span class="note">No points yet.</span>'}</div>
        <div class="row"><button id="ev-clear">Clear route</button></div>
        <div class="checks">${shortcutOptions(session).map((c) => `<label><input type="checkbox" data-cut="${esc(c)}"${(r.shortcuts || []).includes(c) ? ' checked' : ''} /> Shortcut: ${esc(c)}</label>`).join('')}</div>` : ''}
      ${r.kind === 'drag' ? `<div class="row"><button id="ev-start" class="${evStage === 'start' ? 'on' : ''}" title="Then click the start on a street">⚑ Place start</button><button id="ev-clear">Clear route</button></div>
        <p class="note">${r.along ? `Along ${esc(r.along)}. ` : ''}${routeStageText(r)}</p>` : ''}
      <div id="ev-preview">${previewText()}</div>
      <div class="row">
        <button id="ev-save">Save event</button>
        ${savedEvent(evKey) ? '<button id="ev-revert">Revert</button>' : ''}
        ${!isBoss() && savedEvent(evKey) ? '<button id="ev-del" class="danger">Delete</button>' : ''}
      </div>
      <div class="row">
        <button id="ev-test" title="Shift+P">▶ Race it in the game</button>
        <button id="ev-ai">AI test run</button>
      </div>
      <div id="ev-run">${runText()}</div>`;
  }
  panel.innerHTML = html;
  bindEvents();
}

function runText() {
  if (!evRun) return '';
  if (evRun.progress !== undefined) return `<p class="note">AI test run: ${Math.round(evRun.progress * 100)}%…</p>`;
  if (evRun.error) return `<p class="note warn">${esc(evRun.error)}</p>`;
  const r = evRun.result;
  const rows = r.rows.map((q, k) => `<div>${k + 1}. ${esc(q.name)}: ${r.arena ? `${q.takedowns} takedowns${q.hp > 0 ? '' : ', wrecked'}` : q.finished ? `${q.time.toFixed(1)} s` : 'did not finish'}</div>`).join('');
  return `<h4>AI test run (${r.seconds.toFixed(0)} s raced)</h4><div class="note">${rows}</div>
    <p class="note${r.stuck.length ? ' warn' : ''}">${r.stuck.length ? `Stuck ${r.stuck.length} time${r.stuck.length > 1 ? 's' : ''} (red rings on the map).` : 'Nobody got stuck.'} ${r.wrecks} wreck${r.wrecks === 1 ? '' : 's'}.</p>`;
}

function readEvent() {
  const d = evDraft;
  const num = (id, fallback) => (Number.isFinite(Number($(id)?.value)) && $(id)?.value !== '' ? Number($(id).value) : fallback);
  d.name = $('ev-name').value.trim() || d.name;
  d.desc = $('ev-desc').value;
  d.cars = Math.max(2, Math.min(8, Math.round(num('ev-cars', d.cars))));
  if ($('ev-autodrops')) {
    if ($('ev-autodrops').checked) delete d.autoDrops;
    else d.autoDrops = false;
  }
  d.purse = Math.max(0, Math.round(num('ev-purse', d.purse)));
  if (d.type === 'circuit') d.laps = Math.max(1, Math.round(num('ev-laps', d.laps)));
  if (d.type === 'drag') d.finishS = Math.max(100, num('ev-finish', d.finishS));
  if (d.type === 'arena') {
    d.mode = $('ev-mode').value;
    d.timeLimit = Math.max(30, Math.round(num('ev-time', d.timeLimit)));
    d.route.site = Number($('ev-site').value);
  }
  if (isBoss()) d.driver = $('ev-driver').value;
  else if ($('ev-rival')?.checked) d.rival = true;
  else delete d.rival;
  const mods = [...document.querySelectorAll('[data-mod]')].filter((b) => b.checked).map((b) => b.dataset.mod);
  if (mods.length) d.modifiers = mods;
  else delete d.modifiers;
  if (d.route.path) {
    const cuts = [...document.querySelectorAll('[data-cut]')].filter((b) => b.checked).map((b) => b.dataset.cut);
    if (cuts.length) d.route.shortcuts = cuts;
    else delete d.route.shortcuts;
  }
}

function saveEvent() {
  readEvent();
  // (A race's start and finish are its first and last points; older drafts kept them apart.)
  for (const k of ['lastAt', 'startEdge', 'startFitted', 'startAt', 'finishAt', ...(evDraft.route?.path ? ['startS', 'finishS'] : [])]) delete evDraft[k];
  const { key: _k, ...spec } = evDraft;
  if (session.change((e) => ((e.events ||= {})[evKey] = spec))) {
    session.broken = null;
    changed(false);
  }
  toast(`${evDraft.name} saved.`);
  renderEvents();
}

function bindEvents() {
  const panel = $('events-panel');
  const side = $('events-list');
  side.querySelectorAll('.evrow').forEach((el) =>
    el.addEventListener('click', () => {
      if (tool !== 'events') setTool('events');
      editEvent(el.dataset.key, savedEvent(el.dataset.key));
    }));
  side.querySelectorAll('[data-new]').forEach((el) =>
    el.addEventListener('click', () => {
      if (tool !== 'events') setTool('events');
      const all = allEvents();
      editEvent(nextKey(all), newEvent(el.dataset.new));
    }));
  if (!evDraft) return;
  for (const el of panel.querySelectorAll('input, select, textarea')) {
    el.addEventListener('change', () => {
      readEvent();
      previewEvent();
    });
  }
  panel.querySelectorAll('[data-drop]').forEach((el) =>
    el.addEventListener('click', () => {
      evDraft.route.path.splice(Number(el.dataset.drop), 1);
      renderEvents();
      previewEvent();
    }));
  $('ev-start')?.addEventListener('click', () => {
    evStage = 'start';
    evSel = null;
    renderEvents();
    hint();
  });
  $('ev-finish')?.addEventListener('click', finishRoute);
  $('ev-more')?.addEventListener('click', () => {
    evStage = 'placing';
    renderEvents();
    hint();
  });
  $('ev-clear')?.addEventListener('click', () => {
    evStage = null;
    evSel = null;
    if (evDraft.route.kind === 'drag') Object.assign(evDraft.route, { along: '', from: [0, 0], to: null });
    else evDraft.route.path = [];
    renderEvents();
    previewEvent();
  });
  $('ev-save').addEventListener('click', saveEvent);
  $('ev-revert')?.addEventListener('click', () => editEvent(evKey, savedEvent(evKey)));
  $('ev-del')?.addEventListener('click', () => {
    if (!window.confirm(`Delete ${evDraft.name}?`)) return;
    const base = session.district.events.some((e) => e.key === evKey);
    session.change((e) => {
      e.events ||= {};
      if (base) e.events[evKey] = null;
      else delete e.events[evKey];
    });
    session.broken = null;
    editEvent(null, null);
    changed(false);
  });
  $('ev-test').addEventListener('click', testEvent);
  $('ev-ai').addEventListener('click', runAi);
}

// Saves the draft if it's changed, then checks it can be set up.
function readyEvent() {
  readEvent();
  if (JSON.stringify(evDraft) !== JSON.stringify(savedEvent(evKey))) saveEvent();
  const broken = brokenEvents(session.withEvents()).find((b) => b.key === evKey);
  if (broken) {
    window.alert(`${evDraft.name} can't be set up: ${broken.error}`);
    return false;
  }
  return true;
}

function testEvent() {
  if (evDraft && readyEvent()) testDrive(evKey);
}

function runAi() {
  if (!readyEvent() || evRun?.progress !== undefined) return;
  clearGroup(stuckMarks);
  evRun = { progress: 0 };
  renderEvents();
  let result;
  try {
    result = aiTestRun(session.withEvents(), evKey, (p) => {
      evRun = { progress: p };
      const box = $('ev-run');
      if (box) box.innerHTML = runText();
    });
  } catch (err) {
    evRun = { error: `The AI test run couldn't start: ${err.message}` };
    renderEvents();
    return;
  }
  result.then((r) => {
    evRun = { result: r };
    for (const p of r.stuck) {
      const ring = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff2a6d, depthTest: false, transparent: true, fog: false }));
      ring.renderOrder = 13;
      ring.geometry.setAttribute('position', new THREE.Float32BufferAttribute([...Array(24).keys()].flatMap((k) => {
        const a = (k / 24) * Math.PI * 2;
        const x = p.x + Math.cos(a) * 5;
        const z = p.z + Math.sin(a) * 5;
        return [x, H(x, z) + 0.6, z];
      }), 3));
      stuckMarks.add(ring);
    }
    renderEvents();
  });
}

// --- Selection and editing ---------------------------------------------------

function select(key) {
  selected = key;
  feature = null;
  refresh();
  showOverlay();
}

const gridSize = () => Number($('grid').value);
const snapping = (e) => $('snap').checked && !e?.altKey;
const snap = (v, e) => (snapping(e) ? Math.round(v / gridSize()) * gridSize() : v);
// Turning: in steps (Snap turns, the step chosen beside it), or smooth; fine: 1°.
const turnStep = () => (Number($('turn-step').value) * Math.PI) / 180;
const snapTurn = (yaw, fine) => (fine ? Math.round(yaw / FINE) * FINE : $('snap-turn').checked ? Math.round(yaw / turnStep()) * turnStep() : yaw);

function turn(dir, fine) {
  const d = dir * (fine ? FINE : turnStep());
  if (drag) {
    drag.yaw = snapTurn(drag.yaw + d, fine);
    showOverlay();
  } else if (placing || placingGadget) {
    placeYaw = snapTurn(placeYaw + d, fine);
    showOverlay();
  } else if (feature?.type === 'gadget') {
    const g = session.gadgets().find((q) => q.id === feature.id);
    if (g && session.setGadget(g.id, { yaw: snapTurn((g.yaw || 0) + d, fine) })) changed(false);
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
  if (feature) return deleteFeature();
  if (selected && session.remove(selected)) {
    selected = null;
    changed();
  }
}

function duplicate() {
  if (!selected || !canMove(session.item(selected))) return;
  const lock = lockOf(specialOfType(session.item(selected).t));
  if (lock) return toast(`Locked: it can be moved or deleted, but not copied yet. To unlock it: ${lock}.`);
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

// (The selected object; or a light, drop, gadget, junction or site.)
function focus() {
  const it = selected && session.item(selected);
  const spot = !it && feature && typeof feature.x === 'number';
  if (!it && !spot) return;
  const fb = it ? footBox(it) : { x: feature.x, z: feature.z, w: 2 * (feature.r || 4), d: 2 * (feature.r || 4) };
  const h = it ? it.h || 2 : 4;
  const dist = Math.max(25, Math.max(fb.w, fb.d, h) * 2.2);
  cam.pitch = Math.min(cam.pitch, -0.35);
  const f = forward();
  cam.x = fb.x - f.x * dist;
  cam.z = fb.z - f.z * dist;
  cam.y = (it ? session.baseY(it) : H(fb.x, fb.z)) + h / 2 - f.y * dist;
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
  const name = cat.find((c) => c.id === id)?.name || others.find((c) => c.id === id)?.name || id;
  return it.guest ? `${name} (${DISTRICTS.find((d) => d.id === it.guest)?.name || it.guest})` : name;
}

// --- Objects from every district ------------------------------------------------------
// The catalogue has this map's own objects, and every other district's: a
// copy of one of those carries the object with it (its district's view draws
// it, render/districtView.js; the sim reads it: sim/layoutEdits.js). Each
// district's list takes a second or two to make the first time, so they're
// made in the background, one at a time, and kept in this browser.

const OTHERS_VERSION = 1; // (bump when what an object carries changes)
const entryOf = (uid) => cat.find((c) => c.uid === uid) || others.find((c) => c.uid === uid) || null;

function loadOthers() {
  others = [];
  const own = session.doc.base || null;
  const queue = DISTRICTS.filter((d) => d.id !== own);
  const token = {};
  othersLoading = token;
  $('from').innerHTML = `<option value="all">From every district</option><option value="here">From this map</option>${queue.map((d) => `<option value="${d.id}">From ${esc(d.name)}</option>`).join('')}`;
  const next = () => {
    if (othersLoading !== token) return;
    const d = queue.shift();
    if (!d) {
      othersLoading = null;
      renderCatalogue();
      return;
    }
    othersLoading = token;
    others.push(...othersOf(d));
    renderCatalogue();
    setTimeout(next, 60);
  };
  setTimeout(next, 300);
}

// A district's objects for the catalogue, each carrying the object (kept in this browser).
function othersOf(d) {
  const key = `catalogue:${d.id}:${hashOf(d.city)}:${OTHERS_VERSION}`;
  let list = sdkGet(key);
  if (!list) {
    try {
      const map = districtMap(d.city);
      const items = baseLayout(map).items;
      const byKey = new Map(items.map((it) => [it.key, it]));
      list = catalogue(items).filter((e) => !HOME_ONLY.has(e.t)).map((e) => {
        const src = byKey.get(e.from);
        const [cx, cz] = itemCentre(src);
        return { ...e, from: { from: e.from, district: d.id, item: JSON.parse(JSON.stringify(src)), ground: Math.round(map.heightAt(cx, cz) * 1000) / 1000 } };
      });
      sdkPut(key, list).catch(() => {});
    } catch (err) {
      console.warn(`T&T SDK: ${d.name}'s objects:`, err);
      return [];
    }
  }
  return list.map((e) => ({ ...e, uid: `${d.id}/${e.id}`, district: d.id, districtName: d.name }));
}

// A copy's source, as the inspector names it (another district's: which).
const sourceName = (src) => (typeof src === 'string' ? src : `${src.from} from ${DISTRICTS.find((d) => d.id === src.district)?.name || src.district}`);

// The Creator: another district's objects wait until the career reaches it.
function districtLock(e, career) {
  if (!CREATOR || !e.district) return null;
  const i = DISTRICTS.findIndex((d) => d.id === e.district);
  return districtUnlocked(career || { district: 0 }, i) ? null : `reach ${e.districtName} in the career`;
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
  if (feature) featureInspector(ins);
  else if (!it) {
    ins.innerHTML = `<p class="note">Click an object to select it. Drag it to move it.<br><br>Pick an object on the left, then click in the world to place it (or drag it in).</p>`;
  } else {
    const p = session.pose(selected);
    const movable = canMove(it);
    const moved = !selected.startsWith('+') && doc.edits.move[selected];
    const field = (id, label, value, step) => `<label for="${id}">${label}</label><input id="${id}" type="number" step="${step}" value="${+value.toFixed(3)}" ${movable ? '' : 'disabled'} />`;
    ins.innerHTML = `
      <h3>${esc(nameOf(it))}</h3>
      <div class="key">${esc(selected.startsWith('+') ? `copy of ${sourceName(session.source(selected))}` : selected)}</div>
      <div class="grid">
        ${field('in-x', 'x (m)', p.x, 0.5)}
        ${field('in-z', 'z (m)', p.z, 0.5)}
        ${field('in-turn', 'turn (°)', (p.yaw * 180) / Math.PI, 15)}
        ${field('in-lift', 'lift (m)', p.dy, 0.25)}
      </div>
      <div class="row">
        <button id="b-left" title="Turn 15° (Q; Shift+Q: 1°)">⟲ 15°</button>
        <button id="b-right" title="Turn the other way 15° (E; Shift+E: 1°)">⟳ 15°</button>
        <button id="b-dup" ${movable ? '' : 'disabled'} title="Ctrl+D">Duplicate</button>
        <button id="b-focus" title="F">Focus</button>
        ${moved ? '<button id="b-reset">Put back</button>' : ''}
        <button id="b-del" class="danger" title="Delete">Delete</button>
      </div>
      ${LINKED[it.t] ? `<p class="note">${esc(LINKED[it.t])}</p>` : ''}`;
    const read = () => [Number($('in-x').value), Number($('in-z').value), (Number($('in-turn').value) * Math.PI) / 180, Number($('in-lift').value)];
    for (const id of ['in-x', 'in-z', 'in-turn', 'in-lift']) {
      $(id)?.addEventListener('change', () => {
        const [x, z, yaw, dy] = read();
        if ([x, z, yaw, dy].every(Number.isFinite) && session.place(selected, x, z, yaw, dy)) changed();
      });
    }
    $('b-dup').addEventListener('click', duplicate);
    $('b-left').addEventListener('click', (ev) => turn(1, ev.shiftKey));
    $('b-right').addEventListener('click', (ev) => turn(-1, ev.shiftKey));
    $('b-focus').addEventListener('click', focus);
    $('b-del').addEventListener('click', removeSelected);
    $('b-reset')?.addEventListener('click', () => session.reset(selected) && changed());
  }

  const e = doc.edits;
  const lost = session.layout.orphans.length;
  $('edits').innerHTML = `
    <div>Deleted: ${e.remove.length} · Moved: ${Object.keys(e.move).length} · Added: ${e.add.length}</div>
    ${lost ? `<div class="warn">${lost} edit${lost > 1 ? 's' : ''} lost ${lost > 1 ? 'their objects' : 'its object'} (the district changed since).</div>` : ''}
    <div>${session.map.style.name || doc.name}: ${session.layout.items.filter((it) => !it.hidden).length} objects</div>`;
  hint();
}

function hint() {
  $('hint').textContent = !session
    ? 'Open a built-in district or a .ttmap file to start'
    : tool === 'arena'
      ? arenaDraw
        ? 'Arena: click round its edge (it snaps to blocks, sites, kerbs and arenas) · click the first point, or Space, to close it · Backspace takes a point back · Esc stops'
        : arenaSpawning
          ? 'Arena: click inside it to place a spawn point (it faces the middle) · Esc stops'
          : 'Arena: drag a corner to move it, a blue midpoint to add one · select a corner and press Delete to take it out · click another arena to pick it'
      : tool === 'sky'
      ? 'Sky: pick a starting point on the left, then set the haze, fog, darkness and rain on the right · 1 back to Select · Ctrl+Z undo'
      : tool === 'events'
      ? 'Events: pick one on the left or make a new one; its settings are on the right · Place start, then click its route on the map · Save event · Shift+P races it · 1 back to Select'
      : tool === 'road'
      ? roadStage === 'shaping'
        ? 'Road: drag a blue handle to curve that stretch (double-click it: straight), an amber one to move a point · Build street (or Enter) · Esc cancels'
        : 'Road: click to place points (15° steps; Alt: any angle) · Space or double-click: stop placing · Backspace takes a point back · Esc cancels'
      : tool === 'lot'
        ? 'Lot: click a block to make it the chosen kind · 1 back to Select · Ctrl+Z undo'
        : tool === 'height'
          ? `Raise / lower: mouse wheel over the ground (or ${keyName(binding.liftUp[0])} / ${keyName(binding.liftDown[0])}), a grid step up or down (hold ${keyName(binding.liftFine[0])}: 25 cm) · hold the right button to zoom and fly · [ ] size · 1 back to Select · Ctrl+Z undo`
          : tool !== 'select'
          ? `${TOOL_NAMES[tool]}: hold the left button and move${ANGLED.has(tool) && Number($('angle').value) ? ' (angled: rising the way you look)' : ''} · [ ] size · 1 back to Select · Ctrl+Z undo`
          : placingGadget
            ? `Placing a ${GADGETS[placingGadget].name.toLowerCase()}: click where it goes (Shift: keep placing) · wheel or Q/E to turn · Esc to stop`
            : placing && $('place-mode').value === 'line'
            ? `Placing ${placing.name} along a line: click ${lineFrom ? 'where it ends' : 'where it starts'} · wheel or Q/E to turn · Esc to stop`
            : placing && $('place-mode').value === 'scatter'
              ? `Scattering ${placing.name}: hold the left button and brush (spacing sets how far apart) · Esc to stop`
              : placing
    ? `Placing ${placing.name}: click to place (Shift: keep placing) · wheel or Q/E to turn · Alt: no snap · Esc to stop`
    : drag
      ? 'Wheel or Q/E to turn · Alt: no snap'
      : selected
        ? 'Drag to move · Q/E turn (Shift: 1°) · arrows nudge · Del delete · Ctrl+D copy · F focus · Esc deselect'
        : 'Click to select · hold right button + WASD to fly (Space up, Ctrl down) · middle drag to pan · wheel to zoom · Tab top view · P test drive';
}

// The Creator: a special asset stays locked until its trigger is met
// (career/unlocks.js). The reason, or null.
function lockOf(special, career = loadCareer()) {
  if (!CREATOR || !special) return null;
  const p = progress(career, special.unlock);
  return p.met ? null : `${triggerText(special.unlock)}${p.need > 1 ? ` (${p.have}/${p.need})` : ''}`;
}
const lockAttrs = (lock) => (lock ? ` data-lock="${esc(lock)}" title="Locked: ${esc(lock)}"` : '');

function renderCatalogue() {
  const q = $('search').value.trim().toLowerCase();
  const career = CREATOR ? loadCareer() : null;
  const from = $('from').value || 'all';
  const pool = from === 'here' ? cat : from === 'all' ? [...cat, ...others] : others.filter((e) => e.district === from);
  const short = (e) => (e.districtName || 'this map').replace(/^The /, '').split(' ')[0];
  const html = CATEGORIES.map((c) => {
    const list = pool.filter((e) => e.category === c && (!q || e.name.toLowerCase().includes(q) || (e.districtName || '').toLowerCase().includes(q)));
    if (!list.length) return '';
    return `<h4>${c}</h4>${list
      .map((e) => {
        const lock = districtLock(e, career) || lockOf(specialOfType(e.t), career);
        const tip = `${e.count} in ${e.districtName || 'this map'} · ${e.size.map((v) => v.toFixed(1)).join(' × ')} m`;
        return `<div class="entry${placing === e ? ' on' : ''}${lock ? ' locked' : ''}" draggable="${!lock}" data-id="${esc(e.uid)}" title="${esc(tip)}"${lockAttrs(lock)}><span>${lock ? '🔒 ' : ''}${esc(e.name)}</span><i>${from === 'all' ? esc(short(e)) : e.count}</i></div>`;
      })
      .join('')}`;
  }).join('');
  const gadgets = Object.entries(GADGETS).filter(([, g]) => !q || g.name.toLowerCase().includes(q));
  const gadgetHtml = GROUPS.map((group) => {
    const list = gadgets.filter(([, g]) => (g.group || 'Gadgets') === group);
    return list.length ? `<h4>${group}</h4>${list.map(([t, g]) => {
      const lock = lockOf(specialOfGadget(t), career);
      return `<div class="entry${placingGadget === t ? ' on' : ''}${lock ? ' locked' : ''}" data-gadget="${t}" title="${esc(g.about)}"${lockAttrs(lock)}><span>${lock ? '🔒 ' : ''}${esc(g.name)}</span></div>`;
    }).join('')}` : '';
  }).join('');
  const loading = othersLoading && from !== 'here' ? '<p class="loading">Loading the other districts\' objects…</p>' : '';
  $('cat').innerHTML = gadgetHtml + (html || (loading ? '' : '<p class="none">Nothing matches.</p>')) + loading;
  $('place-opts').hidden = !placing;
}

// --- Input ------------------------------------------------------------------------

$('search').addEventListener('input', renderCatalogue);
$('from').addEventListener('change', renderCatalogue);
$('left').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !session) return;
  if (b.dataset.tool) setTool(b.dataset.tool);
  // (A tab: the tool it last had.)
  else if (b.dataset.tab) setTool(tabTool[b.dataset.tab]);
  if (b.dataset.tab === 'objects') showTab('objects');
});
$('wheel-lift').addEventListener('change', () => {
  try {
    localStorage.setItem('tt-sdk:wheelLift', wheelLift() ? 'on' : 'off');
  } catch {
    // (This session only.)
  }
  showLiftTools();
  if (['height', 'raise', 'lower'].includes(tool)) setTool(wheelLift() ? 'height' : 'raise');
});
$('lift-up').addEventListener('click', (e) => liftStep(1, undefined, fineHeld(e)));
$('lift-down').addEventListener('click', (e) => liftStep(-1, undefined, fineHeld(e)));
for (const id of ['radius', 'strength', 'angle']) {
  $(id).addEventListener('input', () => {
    showBrush();
    if (id === 'angle') hint();
  });
}
document.querySelectorAll('input.num[data-for]').forEach(numberBox);
$('kind').addEventListener('change', showBrush);
$('road-build').addEventListener('click', buildRoad);
$('place-mode').addEventListener('change', () => {
  lineFrom = null;
  hint();
});
$('cat').addEventListener('click', (e) => {
  const locked = e.target.closest('[data-lock]');
  if (locked) return toast(`Locked. To unlock it: ${locked.dataset.lock}.`);
  const gEl = e.target.closest('[data-gadget]');
  if (gEl && session) {
    if (tool !== 'select') setTool('select');
    placingGadget = placingGadget === gEl.dataset.gadget ? null : gEl.dataset.gadget;
    placing = null;
    placeYaw = 0;
    renderCatalogue();
    hint();
    return;
  }
  const el = e.target.closest('.entry');
  if (!el || !session) return;
  placingGadget = null;
  if (el.dataset.lock) return toast(`Locked: ${el.dataset.lock}`);
  const entry = entryOf(el.dataset.id);
  if (tool !== 'select') setTool('select');
  placing = placing === entry ? null : entry;
  placeYaw = 0;
  ghostAt = null;
  renderCatalogue();
  hint();
});
$('cat').addEventListener('dragstart', (e) => {
  const el = e.target.closest('.entry');
  if (!el) return;
  if (el.dataset.lock) return e.preventDefault();
  e.dataTransfer.setData('text/plain', el.dataset.id);
  if (tool !== 'select') setTool('select');
  placing = entryOf(el.dataset.id);
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
    pivotUnder(e);
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
  if (tool === 'road') {
    const g = groundHit();
    if (!g) return;
    if (roadStage === 'shaping') {
      const h = roadHandleAt(g);
      if (h && h.bend !== undefined && e.detail >= 2) {
        // (Straightened, where it can be.)
        const was = roadBends[h.bend];
        roadBends[h.bend] = null;
        const why = roadWhy(roadPts);
        if (why) {
          roadBends[h.bend] = was;
          toast(why);
        }
        showRoad();
      } else if (h) drag = { road: h, sx: e.clientX, sy: e.clientY, moved: false };
      return;
    }
    if (e.detail >= 2) endRoadPlacing();
    else {
      const p = roadSnap([g.x, g.z], e);
      const why = roadWhy([...roadPts, p], [...roadBends, null]);
      if (why) return toast(why);
      roadPts.push(p);
      roadBends.push(null);
      showRoad();
    }
    return;
  }
  if (tool === 'lot') {
    const g = groundHit();
    if (g) setLot(g);
    return;
  }
  if (tool === 'arena') {
    const g = groundHit();
    if (g) arenaDown(g, e);
    return;
  }
  if (tool === 'events') {
    const g = groundHit();
    if (!g) return;
    const r = evDraft?.route;
    if ((r?.path || r?.kind === 'drag') && evStage !== 'start') {
      const at = routePointAt(g);
      if (at !== null) {
        evSel = at;
        drag = { routePoint: at, sx: e.clientX, sy: e.clientY, at: [g.x, g.z], moved: false };
        renderEvents();
        drawEventMarks();
        return;
      }
      const seg = evStage === 'editing' && r.path ? routeSegmentAt(g) : null;
      if (seg !== null) {
        const p = routeAdd();
        if (p.why) return toast(p.why);
        r.path.splice(seg + 1, 0, p.point);
        evSel = seg + 1;
        renderEvents();
        return previewEvent();
      }
    }
    routeClick(g);
    return;
  }
  if (tool === 'height') return; // (the wheel raises and lowers)
  if (tool !== 'select') {
    const g = groundHit();
    if (!g) return;
    if (stroke) endStroke();
    stroke = session.stroke();
    stroke.target = stroke.heightAt(g.x, g.z); // (flatten: to here)
    // (Angled: rising the way the view faces, from here.)
    stroke.dir = flat();
    stroke.origin = [g.x, g.z];
    stroke.box = [g.x, g.x, g.z, g.z];
    brushAt = g;
    return;
  }
  if (placingGadget) {
    const g = groundHit();
    if (!g) return;
    const id = session.addGadget(placingGadget, snap(g.x, e), snap(g.z, e), placeYaw);
    if (!e.shiftKey) placingGadget = null;
    renderCatalogue();
    changed(false);
    selectFeature(gadgetFeature(id));
    return;
  }
  if (placing) {
    const g = groundHit();
    if (!g) return;
    const mode = $('place-mode').value;
    if (mode === 'line') {
      if (!lineFrom) lineFrom = [snap(g.x, e), snap(g.z, e)];
      else placeLine(lineFrom, [snap(g.x, e), snap(g.z, e)]);
    } else if (mode === 'scatter') {
      scatter = [];
      ghostAt = { x: g.x, z: g.z };
    } else placeEntry(placing, g, e, false);
    hint();
    return;
  }
  // The rotation ring round the selection: drag it (its handle, or anywhere on it) to turn.
  const ring = ringOf();
  const rg = ring && groundHit();
  if (rg && Math.abs(Math.hypot(rg.x - ring.x, rg.z - ring.z) - ring.r) < Math.max(1.5, ring.r * 0.15)) {
    drag = { ...ring.drag, sx: e.clientX, sy: e.clientY, rotating: true, a0: Math.atan2(rg.x - ring.x, rg.z - ring.z), moved: false };
    return;
  }
  // A gadget (drawn on its own); else an object; else a junction, street or site.
  const gp = groundHit();
  const gid = gp ? gadgetAt(gp.x, gp.z) : null;
  if (gid) {
    const f = gadgetFeature(gid);
    selectFeature(f);
    drag = { feature: f, sx: e.clientX, sy: e.clientY, ox: f.x - gp.x, oz: f.z - gp.z, x: f.x, z: f.z, yaw: 0, moved: false };
    return;
  }
  const hit = meshHit();
  const key = hit ? session.pick(hit.x, hit.z, hit.y) : null;
  const f = !key && hit ? featureAt(session, hit.x, hit.z) : null;
  if (f) {
    selectFeature(f);
    if (f.type === 'node' && f.movable) {
      const g = groundHit();
      if (g) drag = { feature: f, sx: e.clientX, sy: e.clientY, ox: f.x - g.x, oz: f.z - g.z, x: f.x, z: f.z, yaw: 0, moved: false };
    }
    return;
  }
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
    lookBy(-e.movementX * 0.003, -e.movementY * 0.003);
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
  if (tool === 'arena') return arenaMove(g, e);
  if (tool !== 'select' && !drag?.road && drag?.routePoint === undefined) {
    brushAt = g ? { ...g, snapped: tool === 'road' ? roadSnap([g.x, g.z], e) : null } : null;
    showBrush();
    showRoad();
    showLotHover();
    return;
  }
  if (drag) {
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
    drag.moved = true;
    if (drag.routePoint !== undefined) {
      if (g) drag.at = [g.x, g.z];
      drawEventMarks();
      return;
    }
    if (drag.road) {
      // A road handle: a stretch's bend, or a point.
      if (g) {
        const [list, k, to] = drag.road.bend !== undefined ? [roadBends, drag.road.bend, [g.x, g.z]] : [roadPts, drag.road.point, [snap(g.x, e), snap(g.z, e)]];
        const was = list[k];
        list[k] = to;
        const why = roadWhy(roadPts);
        if (why) {
          list[k] = was; // (it stays where it last could be)
          if (!drag.warned) toast(why);
        }
        drag.warned = !!why;
      }
      showRoad();
      return;
    }
    if (drag.rotating) {
      // (Turned by the angle the cursor has gone round the middle; 15° steps, Alt: free.)
      if (g) {
        const turned = drag.yaw0 + Math.atan2(g.x - drag.cx, g.z - drag.cz) - drag.a0;
        drag.yaw = e.altKey ? turned : snapTurn(turned, false);
      }
      showOverlay();
      hint();
      return;
    }
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
    lookPivot = null;
    document.exitPointerLock?.();
    return;
  }
  if (e.button === 1) {
    panning = null;
    return;
  }
  if (e.button === 0 && scatter) {
    const list = scatter;
    scatter = null;
    if (list.length) {
      session.addMany(placing.from, list);
      changed();
    } else showOverlay();
    return;
  }
  if (e.button === 0 && stroke) {
    endStroke();
    return;
  }
  if (e.button === 0 && drag) {
    const d = drag;
    drag = null;
    if (d.road) return showRoad();
    if (d.arena) return arenaDrop(d);
    if (d.routePoint !== undefined) {
      // (A route point dropped: where it's let go, as if clicked there.)
      if (d.moved) {
        const r = evDraft.route;
        if (r.kind === 'drag') dropDragEnd(d.routePoint, d.at);
        else {
          // (A race's start and finish go anywhere; its other points as clicked: a junction, a way, or anywhere.)
          setRay(e);
          const p = d.routePoint === 0 || (r.kind === 'sprint' && d.routePoint === r.path.length - 1) ? raceSpot() : routeAdd();
          if (p.why) toast(p.why);
          else r.path[d.routePoint] = p.at || p.point;
        }
        renderEvents();
        previewEvent();
      }
      return drawEventMarks();
    }
    if (d.moved && d.feature?.type === 'gadget') {
      if (session.setGadget(d.feature.id, { x: Math.round(d.x * 100) / 100, z: Math.round(d.z * 100) / 100, ...(d.rotating ? { yaw: d.yaw } : {}) })) changed(false);
      feature = gadgetFeature(d.feature.id);
      showOverlay();
      return;
    }
    if (d.moved && d.feature) {
      editFeature('Moving the junction…', () => ({ plan: moveNode(session, d.feature.name, d.x, d.z) }), [d.x, d.z], () => nodeProblem(session, d.feature.name));
      return;
    }
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
  if (tool === 'height' && !flying) {
    setRay(e);
    const g = groundHit();
    if (!g) return;
    // (A notch at a time, however the wheel or trackpad counts it.)
    wheelSum += e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 100 : 1);
    if (Math.abs(wheelSum) < 50) return;
    const dir = wheelSum < 0 ? 1 : -1;
    wheelSum = 0;
    brushAt = g;
    liftStep(dir, g, fineHeld(e));
    return;
  }
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
  if (flying) {
    e.preventDefault(); // WASD, Space and Ctrl fly while the right button is held
    return;
  }
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
  if (ctrl) return;
  if (tool === 'arena' && arenaKey(e)) return;
  if (tool === 'height') {
    const up = actionFor(e.code, 'terrain');
    if (up && up !== 'liftFine') {
      e.preventDefault();
      const now = performance.now();
      if (!e.repeat || now - liftKeyAt > 150) {
        liftKeyAt = now;
        liftStep(up === 'liftUp' ? 1 : -1, brushAt || viewMiddle(), fineHeld(e));
      }
      return;
    }
  }
  // (The key pressed, as the action it's bound to: see Controls.)
  const act = actionFor(e.code, 'edit');
  // Placing a road's points, or a race's: stop, take a point back, build (and Esc cancels a road).
  const roadPlacing = tool === 'road' && roadPts.length;
  const racePlacing = tool === 'events' && evDraft?.route?.path;
  const place = roadPlacing || racePlacing ? actionFor(e.code, 'place') : null;
  if (roadPlacing && (place || act === 'cancel')) {
    e.preventDefault();
    if (place === 'endPlacing') endRoadPlacing();
    else if (place === 'backPoint') {
      roadPts.pop();
      roadBends.pop();
      if (roadPts.length < 2) roadStage = 'drawing';
    } else if (place === 'buildRoad') buildRoad();
    else clearRoad();
    showRoad();
    hint();
    return;
  }
  // Placing a race: stopping, the last point is the finish; Delete takes out the selected point.
  if (racePlacing) {
    if (place === 'endPlacing' && evStage === 'placing') {
      e.preventDefault();
      return finishRoute();
    }
    if (act === 'delete' && evSel !== null) {
      e.preventDefault();
      evDraft.route.path.splice(evSel, 1);
      evSel = null;
      renderEvents();
      return previewEvent();
    }
  }
  const step = e.shiftKey ? 0.1 : gridSize();
  const [fx, fz] = flat();
  const [rx, rz] = right();
  switch (act) {
    case 'tool1':
    case 'tool2':
    case 'tool3':
    case 'tool4':
    case 'tool5':
    case 'tool6':
    case 'tool7':
    case 'tool8':
    case 'tool9':
      setTool(['select', 'raise', 'lower', 'smooth', 'flatten', 'paint', 'erase', 'road', 'lot'][Number(act.slice(4)) - 1]);
      break;
    case 'tool0':
      setTool('events');
      break;
    case 'smaller':
    case 'bigger':
      $('radius').value = Number($('radius').value) + (act === 'smaller' ? -2 : 2);
      $('radius').dispatchEvent(new Event('input'));
      break;
    case 'delete':
      removeSelected();
      break;
    case 'turnLeft':
    case 'turnRight':
      turn(act === 'turnLeft' ? 1 : -1, e.shiftKey);
      break;
    case 'nudgeUp':
      nudge(fx * step, fz * step);
      break;
    case 'nudgeDown':
      nudge(-fx * step, -fz * step);
      break;
    case 'nudgeRight':
      nudge(rx * step, rz * step);
      break;
    case 'nudgeLeft':
      nudge(-rx * step, -rz * step);
      break;
    case 'focus':
      focus();
      break;
    case 'topView':
      e.preventDefault();
      toggleTop();
      break;
    case 'testDrive':
      if (e.shiftKey && evKey) testEvent();
      else testDrive();
      break;
    case 'snap':
      $('snap').checked = !$('snap').checked;
      break;
    case 'cancel':
      placing = null;
      ghostAt = null;
      lineFrom = null;
      placingGadget = null;
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

$('district').innerHTML = `<option value="" disabled selected>Open a district…</option>${DISTRICTS.map((d, i) => `<option value="${d.id}"${CREATOR && !districtUnlocked(loadCareer() || { district: 0 }, i) ? ' disabled' : ''}>${esc(d.name)}</option>`).join('')}`;
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
$('cam-reset').addEventListener('click', () => {
  if (!session || !homeCam) return;
  Object.assign(cam, homeCam, { top: null });
  $('top-view').classList.remove('on');
});
$('drive').addEventListener('click', () => session && testDrive());
window.addEventListener('beforeunload', (e) => {
  // (Flying with Ctrl held, W closes the tab: it asks first.)
  if (session?.dirty || flying) e.preventDefault();
});

// --- Loop ----------------------------------------------------------------------------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  pollPad(dt);
  if (flying && session) {
    const speed = (held('flyFast') ? 4 : 1) * (20 + altitude() * 0.6) * dt;
    const f = forward();
    const [rx, rz] = right();
    const ax = (held('flyRight') ? 1 : 0) - (held('flyLeft') ? 1 : 0);
    const az = (held('flyForward') ? 1 : 0) - (held('flyBack') ? 1 : 0);
    const ay = (held('flyUp') ? 1 : 0) - (held('flyDown') ? 1 : 0);
    const move = [(f.x * az + rx * ax) * speed, (f.y * az + ay) * speed, (f.z * az + rz * ax) * speed];
    cam.x += move[0];
    cam.y += move[1];
    cam.z += move[2];
    lookPivot?.add(new THREE.Vector3(...move));
  }
  if (stroke && brushAt && !stroke.wheel) {
    const o = brushOpts(dt);
    brush(stroke, tool, brushAt.x, brushAt.z, o);
    const b = stroke.box;
    stroke.box = [Math.min(b[0], brushAt.x - o.radius), Math.max(b[1], brushAt.x + o.radius), Math.min(b[2], brushAt.z - o.radius), Math.max(b[3], brushAt.z + o.radius)];
    showPreview();
    showBrush();
  }
  if (scatter && ghostAt && placing) scatterTick();
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
  gadgetGroup?.userData.animate(now / 1000);
  if (skyRain?.mesh.visible) skyRain.update(camera.position, dt);
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
// Blanks in the style of any district (the Creator: those the campaign has reached).
$('blank-style').innerHTML = DISTRICTS.map((d, i) => [d, i])
  .filter(([d]) => BLANK_STYLES.includes(d.id))
  .map(([d, i]) => `<option value="${d.id}"${CREATOR && !districtUnlocked(loadCareer() || { district: 0 }, i) ? ' disabled' : ''}>${esc(d.name)}</option>`)
  .join('');
$('start-blank').addEventListener('click', () => {
  if (session?.dirty && !window.confirm(`Start a new district? Unsaved changes to ${session.doc.name} will be lost.`)) return;
  const n = 1 + listMaps().filter((d) => d.id.startsWith('custom-')).length;
  open(blankDistrict(DISTRICTS.find((d) => d.id === $('blank-style').value), n));
});
$('start-back').addEventListener('click', () => ($('start').hidden = true));
$('start').addEventListener('change', (e) => {
  const id = e.target.closest('.orow')?.dataset.id;
  if (id && e.target.dataset.act === 'on') setOverrideOn(id, e.target.checked).catch((err) => window.alert(`Couldn't change it: ${err.message}`));
});
$('start').addEventListener('click', async (e) => {
  const act = e.target.dataset?.act;
  const mineId = e.target.closest('[data-mine]')?.dataset.mine;
  if (mineId) {
    const doc = listMaps().find((d) => d.meta.id === mineId);
    if (!doc) return;
    if (act === 'export-mine') return exportDoc(doc);
    if (act === 'delete-mine') {
      if (!window.confirm(`Delete ${doc.name} from My maps? (Export it first to keep a copy.)`)) return;
      await deleteMap(mineId);
      return renderStart();
    }
    if (session?.dirty && !window.confirm(`Open ${doc.name}? Unsaved changes to ${session.doc.name} will be lost.`)) return;
    return open(parseDoc(JSON.stringify(doc)));
  }
  const id = e.target.closest('.orow')?.dataset.id;
  if (!id || !act || act === 'on') return;
  if (act === 'unpublish') return unpublish(id);
  const o = listOverrides(DISTRICTS).find((q) => q.id === id);
  if (!o) return;
  if (act === 'open') {
    if (session?.dirty && !window.confirm(`Open ${o.name}? Unsaved changes to ${session.doc.name} will be lost.`)) return;
    open(parseDoc(JSON.stringify(o.doc)));
  } else if (act === 'revert' && window.confirm(`Revert ${o.name}? Free roam goes back to the game's own ${o.name}, and these edits are deleted (save them as a .ttmap first to keep them).`)) {
    await removeOverride(id);
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
  const saved = sdkGet(AUTOSAVE);
  const doc = saved ? parseDoc(JSON.stringify(saved)) : null;
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

// --- The Creator ---------------------------------------------------------------------

if (CREATOR) {
  document.querySelector('#top b').textContent = 'T&T Creator';
  $('publish').hidden = true;
  $('top').insertAdjacentHTML('afterbegin', '<button id="to-game" title="Back to Torque &amp; Trigger">◀ Game</button>');
  $('to-game').addEventListener('click', () => {
    if (session?.dirty && !window.confirm('Back to the game? Unsaved changes will be lost (Save puts the map in My maps).')) return;
    window.location.href = window.location.pathname;
  });
  $('save').title = 'Save to My maps (Ctrl+S): race it from the game';
  let seen = false;
  try {
    seen = !!localStorage.getItem('tt-creator:tips');
  } catch {
    seen = false;
  }
  if (!seen) {
    document.body.insertAdjacentHTML('beforeend', `<div id="tutorial">
      <h2>The T&amp;T Creator</h2>
      <ol>
        <li><b>Open a map</b>: a district you've reached in the campaign, or a blank one.</li>
        <li><b>Look around</b>: hold the right mouse button and use W A S D (Space up, Ctrl down); the wheel zooms; Tab looks straight down.</li>
        <li><b>Change anything</b>: click it, drag it to move it, Q/E turn it, Delete removes it. Streets and junctions too.</li>
        <li><b>Add things</b>: pick one on the left and click to place it (or drag it in). The tools reshape and paint the ground (2-7), draw streets (8), fill blocks (9) and make events (0).</li>
        <li><b>Try it</b>: P drives it. Save puts it in My maps: race it from the game's events (Your maps), or online with a friend.</li>
      </ol>
      <div class="row"><button id="tips-ok">Got it</button></div>
    </div>`);
    $('tips-ok').addEventListener('click', () => {
      $('tutorial').remove();
      try {
        localStorage.setItem('tt-creator:tips', '1');
      } catch {
        // (Shown again next time.)
      }
    });
  }
}

// --- Gadgets ---------------------------------------------------------------------------

// The gadgets as the game draws them, running on their own clock (a gate
// linked to a trigger pad stays shut here: drive over the pad to see it open).
// Lights (render/lightView.js) and drops (as the game floats them) with them.
// (trying: { id, patch }, a setting being dragged, shown before it's kept.)
function rebuildGadgets(trying = null) {
  if (gadgetGroup) {
    scene.remove(gadgetGroup);
    dispose(gadgetGroup);
    gadgetGroup = null;
  }
  if (!session?.gadgets().length) return;
  const all = session.gadgets().map((g) => (trying && g.id === trying.id ? { ...g, ...trying.patch } : g));
  const def = addGadgets({ cx: 0, cz: 0, y: 0, size: 1e6, obstacles: [], ramps: [], lifts: [], sweepers: [], hazards: [], movers: [] }, all, H);
  const parts = [gadgetView(buildArena(def), tex, { ownClock: true }), placedView(all, H, tex), startMarkers(all, H)].filter(Boolean);
  const drops = all.filter((g) => DROPS.has(g.type)).map((g, k) => {
    const m = makePickupMesh(g.type);
    m.position.set(g.x, H(g.x, g.z) + 0.8 + (g.height || 0), g.z);
    m.userData.spin = (t) => {
      m.rotation.y = t * 2;
      m.position.y = H(g.x, g.z) + 0.8 + (g.height || 0) + Math.sin(t * 3 + k) * 0.2;
    };
    return m;
  });
  gadgetGroup = new THREE.Group();
  gadgetGroup.add(...parts, ...drops);
  gadgetGroup.userData.animate = (t) => {
    for (const p of parts) p.userData.animate?.(t);
    for (const m of drops) m.userData.spin(t);
  };
  scene.add(gadgetGroup);
}

// How far a gadget reaches from its middle (for picking it and outlining it).
const reachOf = (g) =>
  g.type === 'lift' ? Math.hypot(g.w, g.d) / 2 : g.type === 'gate' ? g.width / 2 : g.type === 'sweeper' ? g.len : g.type === 'mover' ? g.travel + Math.hypot(g.w, g.d) / 2
    : g.type === 'ramp' || g.type === 'kicker' ? Math.max(g.len, g.width) / 2 : g.type === 'sign' ? signSize(g).w / 2 : g.type === 'barrel' ? 1 : g.r ?? 2;

function gadgetAt(x, z) {
  let best = null;
  for (const g of session.gadgets()) {
    const d = Math.hypot(g.x - x, g.z - z);
    if (d < Math.max(3, reachOf(g)) && (!best || d < best.d)) best = { d, g };
  }
  return best?.g.id || null;
}

function gadgetFeature(id) {
  const g = session.gadgets().find((q) => q.id === id);
  return g ? { type: 'gadget', id, name: GADGETS[g.type].name, x: g.x, z: g.z, r: reachOf(g) } : null;
}

function gadgetInspector(ins, f) {
  const g = session.gadgets().find((q) => q.id === f.id);
  if (!g) return;
  const G = GADGETS[g.type];
  const kind = { Lights: 'light', Drops: 'drop', Ramps: 'ramp', Hazards: 'hazard', Signs: 'sign', Starts: 'start' }[G.group] || 'gadget';
  const turns = !NO_TURN.has(g.type);
  const sliders = (SETTINGS[g.type] || []).filter(([k]) => typeof g[k] === 'number');
  const triggers = session.gadgets().filter((q) => q.type === 'trigger');
  const realOn = session.gadgets().filter((q) => q.type === 'light' && q.real).length;
  const slider = (id, label, min, max, step, unit, value, k = '') => `<label>${esc(label)} <input type="range" id="${id}"${k ? ` data-k="${k}"` : ''} min="${min}" max="${max}" step="${step}" value="${value}" /><input class="num" id="${id}-v" data-for="${id}" data-unit="${unit}" inputmode="decimal" /></label>`;
  const options = (table, on) => Object.entries(table).map(([v, n]) => `<option value="${v}"${on === v ? ' selected' : ''}>${esc(n)}</option>`).join('');
  const WHERE = {
    ramp: 'In every event on this map and free roam (a race only uses it if the route runs over it).',
    hazard: g.type === 'oil' ? 'In every event on this map and free roam.' : 'In every event on this map and free roam: once it has gone off it stays gone for the rest of the event.',
    sign: 'In every event on this map and free roam. Its posts are solid; so is the sign itself when its bottom is below 2.2 m.',
    start: g.type === 'start' ? 'Free roam on this map starts here (Test drive still starts where you are looking).' : 'Only in arena events, and only inside the arena\'s ground.',
    light: 'Lights show in every event on this map and in free roam; a lamp post or floodlight tower is solid.',
    drop: "Drops are in every event on this map (not drag races) and in free roam, as well as the event's own (an event can turn its own off).",
    gadget: 'Gadgets work in free roam and in arena events.',
  };
  ins.innerHTML = `
    <h3>${esc(G.name)}</h3><div class="key">${kind} ${esc(g.id)}</div>
    <p class="note">${esc(G.about)}</p>
    <div class="sliders">
      ${g.type === 'sign' ? `<label>Words <input id="gd-text" maxlength="24" value="${esc(g.text || '')}" /></label>
        <label>Style <select id="gd-style">${options(SIGN_STYLES, g.style)}</select></label>` : ''}
      ${g.type === 'light' || g.type === 'sign' ? `<label>Colour <span class="swatches">${LIGHT_COLORS.map((c) => `<button class="sw${g.color === c ? ' on' : ''}" data-color="${c}" title="${c}" style="background:${c}"></button>`).join('')}<input type="color" id="gd-color" value="${g.color}" title="Any colour" /></span></label>` : ''}
      ${g.type === 'light' ? `<label>Fixture <select id="gd-fixture">${options(LIGHT_FIXTURES, g.fixture)}</select></label>` : ''}
      ${sliders.map(([k, label, min, max, step, unit]) => slider(`gd-${k}`, label, min, max, step, unit, g[k], k)).join('')}
      ${turns ? slider('gd-turn', 'Turn', 0, 359, 1, '°', Math.round((((g.yaw || 0) * 180) / Math.PI + 360) % 360)) : ''}
      ${g.type === 'sign' ? `<label class="check"><input type="checkbox" id="gd-posts"${g.posts ? ' checked' : ''} /> On posts (solid, down to the ground)</label>` : ''}
      ${g.type === 'light' ? `<label>Flicker <select id="gd-flicker">${options(LIGHT_FLICKER, g.flicker)}</select></label>
        <label class="check" title="A real light shines on the cars and the walls round it, not just the ground. Each one costs a little speed, so a map can have ${MAX_REAL_LIGHTS}."><input type="checkbox" id="gd-real"${g.real ? ' checked' : ''}${!g.real && realOn >= MAX_REAL_LIGHTS ? ' disabled' : ''} /> Real light: shines on cars and walls (${realOn} of ${MAX_REAL_LIGHTS} on this map)</label>` : ''}
      ${g.type === 'gate' ? `<label>Opened by <select id="gd-link"><option value="">its timer</option>${triggers.map((t) => `<option value="${t.id}"${g.link === t.id ? ' selected' : ''}>trigger pad ${t.id}</option>`).join('')}</select></label>` : ''}
    </div>
    <div class="row">${!turns ? '' : '<button id="gd-left" title="Turn 15° (Q)">⟲ 15°</button><button id="gd-right" title="Turn the other way 15° (E)">⟳ 15°</button>'}<button id="f-del" class="danger">Delete</button></div>
    <p class="note">Drag it to move it${!turns ? '' : '; drag its ring (or Q/E) to turn it'}. ${WHERE[kind]}</p>`;
  // (What the controls say now: shown while a slider's dragged, kept when it's let go.)
  const read = () => {
    const patch = $('gd-turn') ? { yaw: (Number($('gd-turn').value) * Math.PI) / 180 } : {};
    for (const el of ins.querySelectorAll('input[type=range][data-k]')) patch[el.dataset.k] = Number(el.value);
    if ($('gd-link')) patch.link = $('gd-link').value;
    if ($('gd-fixture')) Object.assign(patch, { fixture: $('gd-fixture').value, flicker: $('gd-flicker').value, real: $('gd-real').checked });
    if ($('gd-color')) patch.color = $('gd-color').value;
    if ($('gd-text')) Object.assign(patch, { text: signText($('gd-text').value) || g.text, style: $('gd-style').value, posts: $('gd-posts').checked });
    return patch;
  };
  const apply = (extra = {}) => {
    if (session.setGadget(g.id, { ...read(), ...extra })) changed(false);
    feature = gadgetFeature(g.id);
    showOverlay();
  };
  ins.querySelectorAll('input.num[data-for]').forEach(numberBox);
  for (const el of ins.querySelectorAll('input[type=range], #gd-color')) {
    el.addEventListener('input', () => rebuildGadgets({ id: g.id, patch: read() }));
    el.addEventListener('change', () => apply());
  }
  for (const el of ins.querySelectorAll('select, #gd-real, #gd-posts, #gd-text')) el.addEventListener('change', () => apply());
  $('gd-text')?.addEventListener('input', () => {
    // (The letters the game's pixel font has, capitals.)
    const t = signText($('gd-text').value);
    if (t !== $('gd-text').value) $('gd-text').value = t;
    rebuildGadgets({ id: g.id, patch: read() });
  });
  ins.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => apply({ color: b.dataset.color })));
  $('gd-left')?.addEventListener('click', (ev) => turn(1, ev.shiftKey));
  $('gd-right')?.addEventListener('click', (ev) => turn(-1, ev.shiftKey));
  $('f-del').addEventListener('click', deleteFeature);
}

// A sign's words: capitals, the characters the pixel font draws, 24 at most.
const signText = (t) => t.toUpperCase().replace(/[^A-Z0-9 .,:!?'&+\-/#%$*()]/g, '').slice(0, 24);

// --- Atmosphere (the Sky tab) ---------------------------------------------------------
// A map's own haze colour, fog, darkness and rain (edits.atmosphere), over the
// district's: every event on the map and free roam have it (the race screen);
// heavy rain costs grip (sim/gadgets.js rainGrip). The SDK shows it while the
// Sky tab's open (or Fog's on), with the rain.

const SKY_PRESETS = {
  own: { name: "District's own", atmos: null },
  clear: { name: 'Clear night', atmos: { fog: 0.5, rain: 0 } },
  drizzle: { name: 'Neon drizzle', atmos: { fog: 1, rain: 0.4 } },
  downpour: { name: 'Downpour', atmos: { fog: 1.6, rain: 1, darkness: 0.25 } },
  fog: { name: 'Thick fog', atmos: { fog: 3, rain: 0, haze: '#3a3448' } },
  toxic: { name: 'Toxic haze', atmos: { fog: 2.2, rain: 0.2, haze: '#24401c' } },
  blackout: { name: 'Blackout', atmos: { fog: 1.5, rain: 0.3, darkness: 0.8 } },
};
const HAZES = ['#101018', '#1e0d30', '#2a1030', '#0c1a2a', '#3a3448', '#24401c', '#402a10', '#301018'];
let skyRain = null;

const atmosOf = () => session?.doc.edits.atmosphere || {};

function renderSky() {
  const a = atmosOf();
  const theme = session.district.theme || {};
  const haze = a.haze || theme.haze || '#101018';
  const pct = (v) => Math.round(v * 100);
  $('sky-list').innerHTML = Object.entries(SKY_PRESETS).map(([k, p]) => `<button data-sky="${k}">${esc(p.name)}</button>`).join('');
  $('sky-panel').innerHTML = `<h3>Atmosphere</h3>
    <p class="note">This map's sky, over the district's own: in every event on it and in free roam. Heavy rain (past the usual 40%) costs grip; an event's Blackout makes it darker still.</p>
    <div class="sliders">
      <label>Haze <span class="swatches">${HAZES.map((c) => `<button class="sw${haze === c ? ' on' : ''}" data-haze="${c}" title="${c}" style="background:${c}"></button>`).join('')}<input type="color" id="sky-haze" value="${haze}" title="Any colour" /></span></label>
      <label>Fog <input type="range" id="sky-fog" min="0" max="4" step="0.1" value="${a.fog ?? 1}" /><input class="num" id="sky-fog-v" data-for="sky-fog" data-unit="×" inputmode="decimal" /></label>
      <label>Darkness <input type="range" id="sky-dark" min="0" max="90" step="5" value="${pct(a.darkness || 0)}" /><input class="num" id="sky-dark-v" data-for="sky-dark" data-unit="%" inputmode="decimal" /></label>
      <label>Rain <input type="range" id="sky-rain" min="0" max="100" step="5" value="${pct(a.rain ?? RAIN_USUAL)}" /><input class="num" id="sky-rain-v" data-for="sky-rain" data-unit="%" inputmode="decimal" /></label>
    </div>
    <div class="row"><button id="sky-reset" title="The district's own sky">Reset</button></div>`;
  $('sky-panel').querySelectorAll('input.num[data-for]').forEach(numberBox);
  const read = (extra = {}) => ({ haze: $('sky-haze').value, fog: Number($('sky-fog').value), darkness: Number($('sky-dark').value) / 100, rain: Number($('sky-rain').value) / 100, ...extra });
  const keep = (atmos) => {
    if (session.change((e) => (atmos ? (e.atmosphere = atmos) : delete e.atmosphere))) changed(false);
    applyFog();
    renderSky();
  };
  for (const el of $('sky-panel').querySelectorAll('input[type=range], #sky-haze')) {
    el.addEventListener('input', () => applyFog(read()));
    el.addEventListener('change', () => keep(read()));
  }
  $('sky-panel').querySelectorAll('[data-haze]').forEach((b) => b.addEventListener('click', () => keep(read({ haze: b.dataset.haze }))));
  $('sky-reset').addEventListener('click', () => keep(null));
  $('sky-list').querySelectorAll('[data-sky]').forEach((b) => b.addEventListener('click', () => keep(SKY_PRESETS[b.dataset.sky].atmos && { haze, ...SKY_PRESETS[b.dataset.sky].atmos })));
}

// --- Arenas (the Events tab) ----------------------------------------------------------
// The map's arenas (sim/arenaEdits.js: the district's own, redrawn or taken
// out, and new ones drawn), listed over the events. Drawing one: click round
// its edge (snapping to the blocks, sites, kerbs and other arenas), then
// close it (the first point, or Space): its ground is an arena event's. Its
// corners drag, its midpoints add corners; spawn points are placed in it
// (Arena spawn point gadgets, facing its middle).

let arenaSel = null; // the selected arena (its index: an arena event's route.site)
let arenaDraw = null; // { pts, of (redrawing that arena), block (taking a block's outline) } while drawing
let arenaSpawning = false;
let arenaHover = null; // the snapped point under the cursor while drawing
let arenaCorner = null; // the selected corner (for Delete)
const arenaMarks = new THREE.Group();
scene.add(arenaMarks);

const arenaList = () => (session ? arenasOf(session.district.city, session.map) : []);
const arenaEvents = (i) => allEvents().filter((e) => e.type === 'arena' && (e.route?.site || 0) === i);

function renderArenas() {
  if (!session) return;
  const list = arenaList();
  if (arenaSel !== null && !list[arenaSel]) arenaSel = null;
  const row = (a) => {
    const n = arenaEvents(a.index).length;
    const note = a.removed ? 'taken out' : `${n} event${n === 1 ? '' : 's'}`;
    return `<div class="evrow${a.index === arenaSel && tool === 'arena' ? ' on' : ''}" data-arena="${a.index}"><span>${esc(a.name)}</span><i>${note}</i></div>`;
  };
  $('arenas-list').innerHTML = `<h4>Arenas</h4>${list.map(row).join('') || '<p class="note">None yet.</p>'}
    <div class="toolgrid"><button id="arena-new" title="Click round its edge on the map">+ Draw an arena</button></div>`;
  $('arenas-list').querySelectorAll('[data-arena]').forEach((el) => el.addEventListener('click', () => pickArena(Number(el.dataset.arena))));
  $('arena-new').addEventListener('click', () => {
    arenaSel = null;
    startArenaDraw(null);
  });
  renderArenaPanel();
}

function pickArena(i) {
  arenaSel = i;
  arenaDraw = null;
  arenaSpawning = false;
  arenaCorner = null;
  if (tool !== 'arena') setTool('arena');
  else {
    renderArenas();
    drawArenas();
    hint();
  }
}

function startArenaDraw(of) {
  arenaDraw = { pts: [], of, block: false };
  arenaSpawning = false;
  if (tool !== 'arena') setTool('arena');
  else {
    renderArenas();
    drawArenas();
    hint();
  }
}

function renderArenaPanel() {
  const panel = $('arena-panel');
  if (tool !== 'arena') return;
  const list = arenaList();
  if (arenaDraw) {
    const name = arenaDraw.of !== null ? list[arenaDraw.of]?.name : null;
    panel.innerHTML = `<h3>${name ? `Redrawing ${esc(name)}` : 'Drawing an arena'}</h3>
      <p class="note">Click round its edge: it snaps to the corners and edges of blocks, sites, kerbs and other arenas. Click the first point (or press Space) to close it; that's its ground. Backspace takes a point back, Esc stops.</p>
      <div class="row"><button id="arena-block" class="${arenaDraw.block ? 'on' : ''}" title="Then click inside a block or site">Take a block's outline</button><button id="arena-close"${arenaDraw.pts.length < 3 ? ' disabled' : ''}>Close it</button><button id="arena-stop">Stop</button></div>
      <p class="note">${arenaDraw.pts.length} point${arenaDraw.pts.length === 1 ? '' : 's'} so far.</p>`;
    $('arena-block').addEventListener('click', () => {
      arenaDraw.block = !arenaDraw.block;
      renderArenaPanel();
    });
    $('arena-close').addEventListener('click', closeArena);
    $('arena-stop').addEventListener('click', stopArenaDraw);
    return;
  }
  const a = list[arenaSel];
  if (!a) {
    panel.innerHTML = '<h3>Arenas</h3><p class="note">Pick an arena on the left to change it, or draw a new one. An arena is the ground of the arena events set there.</p>';
    return;
  }
  const poly = outlineOf(a);
  const b = poly ? G.polyBounds(poly) : null;
  const spawns = session.gadgets().filter((g) => g.type === 'spawn' && poly && G.pointInPoly(g.x, g.z, poly)).length;
  const evs = arenaEvents(a.index);
  panel.innerHTML = `<h3>${esc(a.name)}</h3>
    <div class="key">${a.custom ? 'drawn on this map' : a.removed ? "the district's own, taken out" : a.poly ? "the district's own, redrawn" : "the district's own"}</div>
    <label>Name <input id="arena-name" value="${esc(a.name)}" maxlength="40" /></label>
    ${b ? `<p class="note">${Math.round(b.maxX - b.minX)} × ${Math.round(b.maxZ - b.minZ)} m, ${Math.round(Math.abs(G.polyArea(poly)))} m² inside.</p>` : ''}
    ${a.removed ? '' : '<p class="note">Drag a corner (amber) to move it, a midpoint (blue) to add a corner; select a corner and press Delete to take it out.</p>'}
    <div class="row">
      ${a.removed ? '' : '<button id="arena-redraw">Redraw it</button>'}
      ${a.removed ? '' : `<button id="arena-spawn" class="${arenaSpawning ? 'on' : ''}" title="Then click inside it">Place spawn points</button>`}
      ${a.removed ? '' : '<button id="arena-event">+ Arena event here</button>'}
    </div>
    ${a.removed ? '' : `<p class="note">Spawn points in it: ${spawns}. Cars start on them first, then ${a.custom ? 'round its middle' : 'on its own'}.</p>`}
    <p class="note">${evs.length ? `Its events: ${evs.map((e) => esc(e.name)).join(', ')}.` : 'No events here yet.'}</p>
    <div class="row">
      ${a.custom ? '<button id="arena-del" class="danger">Delete it</button>' : a.removed ? '<button id="arena-back">Put it back</button>' : `${a.poly ? '<button id="arena-own">Back to its own outline</button>' : ''}<button id="arena-del" class="danger">Take it out</button>`}
    </div>`;
  $('arena-name').addEventListener('change', () => {
    const name = $('arena-name').value.trim() || a.name;
    arenaEdit((list2) => {
      const e = a.custom ? list2.find((q) => q.id === a.edit.id) : ensureEdit(list2, a);
      e.name = name;
    });
  });
  $('arena-redraw')?.addEventListener('click', () => startArenaDraw(a.index));
  $('arena-spawn')?.addEventListener('click', () => {
    arenaSpawning = !arenaSpawning;
    renderArenaPanel();
    hint();
  });
  $('arena-event')?.addEventListener('click', () => {
    setTool('events');
    const ev = newEvent('arena');
    ev.route = { ...ev.route, site: a.index };
    editEvent(nextKey(allEvents()), ev);
  });
  $('arena-del')?.addEventListener('click', () => {
    if (a.custom) arenaEdit((list2) => list2.splice(list2.findIndex((q) => q.id === a.edit.id), 1));
    else arenaEdit((list2) => Object.assign(ensureEdit(list2, a), { removed: true, poly: undefined }));
  });
  $('arena-back')?.addEventListener('click', () => arenaEdit((list2) => list2.splice(list2.findIndex((q) => q.of === a.site.name), 1)));
  $('arena-own')?.addEventListener('click', () => arenaEdit((list2) => {
    const e = ensureEdit(list2, a);
    delete e.poly;
    if (!e.name && !e.removed) list2.splice(list2.indexOf(e), 1);
  }));
}

// A district's own arena's edit (made if it has none).
function ensureEdit(list, a) {
  let e = list.find((q) => q.of === a.site.name);
  if (!e) {
    let n = list.length + 1;
    while (list.some((q) => q.id === `r${n}`)) n++;
    e = { id: `r${n}`, of: a.site.name };
    list.push(e);
  }
  return e;
}

// One change to the arenas, as one step. A change that stops events working asks first.
function arenaEdit(mutate) {
  const before = session.broken ?? brokenEvents(session.withEvents());
  let kept = false;
  try {
    kept = session.change((e) => {
      const list = JSON.parse(JSON.stringify(e.arenas || []));
      mutate(list);
      for (const q of list) for (const k of Object.keys(q)) if (q[k] === undefined) delete q[k];
      if (list.length) e.arenas = list;
      else delete e.arenas;
    });
  } catch (err) {
    toast(err.message);
    return false;
  }
  if (!kept) return false;
  const after = brokenEvents(session.withEvents());
  const newly = after.filter((b) => !before.some((q) => q.key === b.key));
  if (newly.length && !window.confirm(`This stops ${newly.length === 1 ? 'an event' : 'these events'} working:\n\n${newly.map((b) => `• ${b.name}: ${b.error}`).join('\n')}\n\nKeep the change anyway?`)) {
    session.undo();
    session.future.pop();
    session.broken = before;
    kept = false;
  } else session.broken = after;
  changed(false);
  renderArenas();
  drawArenas();
  hint();
  return kept;
}

// The outlines a point snaps to: blocks, sites, the district's edge, other arenas (and kerbs: arenaSnap).
function areaOutlines(skip = null) {
  const m = session.map;
  const out = [];
  for (const b of m.blocks || []) if (b.lot?.length > 2) out.push(b.lot);
  for (const s of m.sites || []) if (s.poly?.length > 2) out.push(s.poly);
  for (const c of m.cells || []) if (Array.isArray(c.lot)) out.push([[c.lot[0], c.lot[2]], [c.lot[1], c.lot[2]], [c.lot[1], c.lot[3]], [c.lot[0], c.lot[3]]]);
  if (m.boundary?.length > 2) out.push(m.boundary);
  for (const a of arenaList()) if (a.index !== skip && !a.removed && outlineOf(a)) out.push(outlineOf(a));
  return out;
}

// Where a point at g snaps (a corner, then an edge, then a kerb; closing on the first point): { p, close }.
function arenaSnap(g, skip = null) {
  const R = grabR(g.x, g.z, 4);
  const at = [g.x, g.z];
  if (arenaDraw?.pts.length >= 3 && Math.hypot(arenaDraw.pts[0][0] - g.x, arenaDraw.pts[0][1] - g.z) < R * 1.5) return { p: arenaDraw.pts[0], close: true };
  let corner = null;
  let edge = null;
  for (const poly of areaOutlines(skip)) {
    const b = G.polyBounds(poly);
    if (g.x < b.minX - R || g.x > b.maxX + R || g.z < b.minZ - R || g.z > b.maxZ + R) continue;
    for (const p of poly) {
      const d = Math.hypot(p[0] - g.x, p[1] - g.z);
      if (d < R && (!corner || d < corner.d)) corner = { d, p: [...p] };
    }
    const q = G.nearestOnLine([...poly, poly[0]], g.x, g.z);
    if (q.d < R && (!edge || q.d < edge.d)) edge = { d: q.d, p: q.p };
  }
  if (corner) return { p: corner.p };
  if (!edge) {
    for (const e of session.map.edgeList || []) {
      if (!e.street || e.street.tunnel) continue;
      const q = G.nearestOnLine(e.pts, g.x, g.z);
      const h = e.street.half;
      if (Math.abs(q.d - h) > R) continue;
      const f = G.pointAlong(e.pts, q.s);
      const side = (g.x - f.x) * -f.dz + (g.z - f.z) * f.dx > 0 ? 1 : -1;
      const p = [f.x - f.dz * side * h, f.z + f.dx * side * h];
      const d = Math.hypot(p[0] - g.x, p[1] - g.z);
      if (!edge || d < edge.d) edge = { d, p };
    }
  }
  return { p: edge ? edge.p : at };
}

function arenaDown(g, e) {
  const list = arenaList();
  if (arenaDraw) {
    if (arenaDraw.block) {
      // A block's (or site's, or lot's) outline, as it is.
      const poly = areaOutlines().find((q) => q !== session.map.boundary && G.pointInPoly(g.x, g.z, q));
      if (!poly) return toast('Click inside a block or site.');
      arenaDraw.pts = poly.map((p) => [...p]);
      return closeArena();
    }
    const s = arenaSnap(g, arenaDraw.of);
    if (s.close || (e.detail >= 2 && arenaDraw.pts.length >= 3)) return closeArena();
    arenaDraw.pts.push(s.p.map((v) => Math.round(v * 100) / 100));
    renderArenaPanel();
    drawArenas();
    return;
  }
  const a = list[arenaSel];
  const poly = a && !a.removed ? outlineOf(a) : null;
  if (arenaSpawning && a) {
    if (!poly || !G.pointInPoly(g.x, g.z, poly)) return toast(`Put it inside ${a.name}.`);
    const [mx, mz] = middleOf(poly);
    session.addGadget('spawn', g.x, g.z, Math.atan2(mx - g.x, mz - g.z));
    changed(false);
    renderArenaPanel();
    return;
  }
  if (poly) {
    // A corner, or a midpoint (a new corner there).
    const near = grabR(g.x, g.z);
    const k = poly.findIndex((p) => Math.hypot(p[0] - g.x, p[1] - g.z) < near);
    if (k >= 0) {
      arenaCorner = k;
      drag = { arena: { index: a.index, poly: poly.map((p) => [...p]), k }, sx: e.clientX, sy: e.clientY, moved: false };
      drawArenas();
      return;
    }
    const m = poly.findIndex((p, i) => {
      const q = poly[(i + 1) % poly.length];
      return Math.hypot((p[0] + q[0]) / 2 - g.x, (p[1] + q[1]) / 2 - g.z) < near;
    });
    if (m >= 0) {
      const pts = poly.map((p) => [...p]);
      const q = pts[(m + 1) % pts.length];
      pts.splice(m + 1, 0, [(pts[m][0] + q[0]) / 2, (pts[m][1] + q[1]) / 2]);
      arenaCorner = m + 1;
      drag = { arena: { index: a.index, poly: pts, k: m + 1, added: true }, sx: e.clientX, sy: e.clientY, moved: false };
      drawArenas();
      return;
    }
  }
  // Another arena: picked.
  const hit = list.find((q) => !q.removed && outlineOf(q) && G.pointInPoly(g.x, g.z, outlineOf(q)));
  if (hit) pickArena(hit.index);
}

function arenaMove(g, e) {
  if (!g) return;
  if (drag?.arena) {
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
    drag.moved = true;
    drag.arena.poly[drag.arena.k] = arenaSnap(g, drag.arena.index).p;
    drawArenas();
    return;
  }
  arenaHover = arenaDraw && !arenaDraw.block ? arenaSnap(g, arenaDraw.of) : null;
  drawArenas();
}

function arenaDrop(d) {
  if (!d.moved && !d.arena.added) return drawArenas();
  setArenaOutline(d.arena.index, d.arena.poly.map((p) => p.map((v) => Math.round(v * 100) / 100)));
}

// An arena's outline set (checked first): a new arena's, or a district's own redrawn.
function setArenaOutline(index, poly) {
  const why = outlineProblem(poly);
  if (why) {
    toast(why);
    drawArenas();
    return false;
  }
  const a = arenaList()[index];
  return arenaEdit((list) => {
    if (a.custom) list.find((q) => q.id === a.edit.id).poly = poly;
    else ensureEdit(list, a).poly = poly;
  });
}

function closeArena() {
  const d = arenaDraw;
  if (!d || d.pts.length < 3) return toast('Place at least three points round it.');
  const why = outlineProblem(d.pts);
  if (why) return toast(why);
  if (d.of !== null) {
    arenaDraw = null;
    setArenaOutline(d.of, d.pts);
    return;
  }
  // A new arena, named in turn.
  const count = arenaList().filter((a) => a.custom).length;
  let id = 1;
  while ((session.doc.edits.arenas || []).some((q) => q.id === `r${id}`)) id++;
  arenaDraw = null;
  if (arenaEdit((list) => list.push({ id: `r${id}`, name: `Arena ${count + 1}`, poly: d.pts }))) {
    arenaSel = arenaList().length - 1;
    toast('Arena made: place spawn points, or make an arena event here.');
  }
  renderArenas();
  drawArenas();
  hint();
}

function stopArenaDraw() {
  arenaDraw = null;
  arenaHover = null;
  renderArenas();
  drawArenas();
  hint();
}

// Keys for the arena tool, as bound in Controls (true: used).
function arenaKey(e) {
  const act = actionFor(e.code, 'edit');
  if (arenaDraw) {
    const place = actionFor(e.code, 'place');
    if (place === 'endPlacing' || place === 'buildRoad') closeArena();
    else if (place === 'backPoint') {
      arenaDraw.pts.pop();
      renderArenaPanel();
      drawArenas();
    } else if (act === 'cancel') stopArenaDraw();
    else return false;
    e.preventDefault();
    return true;
  }
  if (act === 'cancel' && arenaSpawning) {
    arenaSpawning = false;
    renderArenaPanel();
    hint();
    e.preventDefault();
    return true;
  }
  const a = arenaList()[arenaSel];
  if (act === 'delete' && a && !a.removed && arenaCorner !== null) {
    const poly = outlineOf(a).map((p) => [...p]);
    if (poly.length <= 3) {
      toast('An arena needs at least three corners.');
    } else {
      poly.splice(arenaCorner, 1);
      arenaCorner = null;
      setArenaOutline(a.index, poly);
    }
    e.preventDefault();
    return true;
  }
  return false;
}

// On the map: every arena's outline (the selected one's corners and midpoints), the one being drawn.
function drawArenas() {
  clearGroup(arenaMarks);
  if (!session || (tool !== 'arena' && tool !== 'events')) return;
  const size = Math.max(1.2, altitude() * 0.012);
  const y = (x, z) => H(x, z) + 0.7;
  const line = (pts, color, loop = true) => {
    const L = new (loop ? THREE.LineLoop : THREE.Line)(new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, y(x, z), z))), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, fog: false }));
    L.renderOrder = 13;
    arenaMarks.add(L);
  };
  const mark = ([x, z], color, s = size) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial({ color, depthTest: false, fog: false }));
    m.position.set(x, y(x, z) + 0.2, z);
    m.renderOrder = 14;
    arenaMarks.add(m);
  };
  // (Following the ground: a point every few metres along each edge.)
  const along = (poly) => poly.flatMap((p, k) => {
    const q = poly[(k + 1) % poly.length];
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 6));
    return [...Array(n).keys()].map((i) => [p[0] + ((q[0] - p[0]) * i) / n, p[1] + ((q[1] - p[1]) * i) / n]);
  });
  for (const a of arenaList()) {
    let poly = outlineOf(a);
    if (!poly) continue;
    if (drag?.arena?.index === a.index) poly = drag.arena.poly;
    const on = a.index === arenaSel && tool === 'arena' && !arenaDraw;
    line(along(poly), a.removed ? 0xff2a6d : on ? 0xffb000 : 0x05d9e8);
    if (on && !a.removed) {
      poly.forEach((p, k) => mark(p, k === arenaCorner ? 0xffffff : 0xffb000));
      poly.forEach((p, k) => {
        const q = poly[(k + 1) % poly.length];
        mark([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], 0x05d9e8, size * 0.6);
      });
    }
  }
  if (arenaDraw) {
    const pts = [...arenaDraw.pts];
    if (arenaHover) pts.push(arenaHover.p);
    // (Open: point to point, and on to the cursor.)
    if (pts.length > 1) line([...along(pts).slice(0, -Math.max(1, Math.ceil(Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) / 6))), pts[pts.length - 1]], 0xffb000, false);
    arenaDraw.pts.forEach((p, k) => mark(p, k === 0 ? 0x39ff14 : 0xffb000));
    if (arenaHover) mark(arenaHover.p, arenaHover.close ? 0x39ff14 : 0x05d9e8, size * 0.8);
  }
}

// --- Playtest marks ------------------------------------------------------------------
// A test drive (src/main.js) records where the car was wrecked, got stuck or
// was put back on the road; back here, they're pins on the map.

const marksGroup = new THREE.Group();
scene.add(marksGroup);
const MARK_COLOR = { wreck: 0xff2a6d, stuck: 0xffb000, respawn: 0x05d9e8 };
let marks = [];

async function refreshMarks() {
  if (!session) return;
  let pt = null;
  try {
    pt = (await readStore('sdk')).get('playtest') || null;
  } catch {
    pt = null;
  }
  marks = pt && pt.district === session.doc.id ? pt.marks : [];
  drawMarks();
}

function drawMarks() {
  clearGroup(marksGroup);
  for (const m of marks) {
    const y = H(m.x, m.z);
    const mat = new THREE.LineBasicMaterial({ color: MARK_COLOR[m.kind] || 0xffffff, depthTest: false, transparent: true, fog: false });
    const pin = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(m.x, y, m.z), new THREE.Vector3(m.x, y + 14, m.z)]), mat);
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([...Array(16).keys()].map((k) => new THREE.Vector3(m.x + Math.cos((k / 16) * Math.PI * 2) * 3, y + 14, m.z + Math.sin((k / 16) * Math.PI * 2) * 3))), mat);
    pin.renderOrder = ring.renderOrder = 13;
    marksGroup.add(pin, ring);
  }
  const count = (k) => marks.filter((m) => m.kind === k).length;
  $('marks').hidden = !marks.length;
  $('marks').textContent = `Playtest: ${count('wreck')} wrecked, ${count('stuck')} stuck, ${count('respawn')} put back ×`;
}

window.addEventListener('focus', refreshMarks);
$('marks').addEventListener('click', () => {
  marks = [];
  drawMarks();
  sdkPut('playtest', null).catch(() => {});
});

// --- Gamepad ---------------------------------------------------------------------------
// Sticks fly (left moves, right looks, triggers down and up, left stick in:
// faster); A acts at the crosshair as a click would; B cancels; X deletes;
// Y copies; LB/RB turn; the d-pad nudges; Back looks down; Start test drives.

let padPrev = [];
function pollPad(dt) {
  const pad = [...(navigator.getGamepads?.() || [])].find((p) => p && p.connected);
  $('crosshair').hidden = !pad || !session;
  if (!pad || !session) return;
  const r = canvas.getBoundingClientRect();
  const [mx, my] = [r.left + r.width / 2, r.top + r.height / 2];
  Object.assign($('crosshair').style, { left: `${mx}px`, top: `${my}px` });
  const axis = (i) => (Math.abs(pad.axes[i] || 0) > 0.15 ? pad.axes[i] : 0);
  const held = (i) => !!pad.buttons[i]?.pressed;
  const now = pad.buttons.map((b) => b.pressed);
  const hit = (i) => now[i] && !padPrev[i];
  padPrev = now;
  const speed = (held(10) ? 4 : 1) * (20 + altitude() * 0.6) * dt;
  const f = forward();
  const [rx, rz] = right();
  if (axis(2) || axis(3)) lookBy(-axis(2) * 2.2 * dt, -axis(3) * 1.6 * dt);
  cam.x += (f.x * -axis(1) + rx * axis(0)) * speed;
  cam.y += (f.y * -axis(1) + (held(7) ? 1 : 0) - (held(6) ? 1 : 0)) * speed;
  cam.z += (f.z * -axis(1) + rz * axis(0)) * speed;
  const at = { clientX: mx, clientY: my, button: 0, bubbles: true };
  if (hit(0)) {
    canvas.dispatchEvent(new MouseEvent('mousedown', at));
    canvas.dispatchEvent(new MouseEvent('mouseup', at));
  }
  if (hit(1)) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  if (hit(2)) removeSelected();
  if (hit(3)) duplicate();
  if (hit(4)) turn(1, false);
  if (hit(5)) turn(-1, false);
  const step = gridSize();
  const [fx, fz] = flat();
  if (tool === 'height' && (hit(12) || hit(13))) liftStep(hit(12) ? 1 : -1, viewMiddle());
  else if (hit(12)) nudge(fx * step, fz * step);
  else if (hit(13)) nudge(-fx * step, -fz * step);
  if (hit(14)) nudge(-rx * step, -rz * step);
  if (hit(15)) nudge(rx * step, rz * step);
  if (hit(8)) toggleTop();
  if (hit(9)) testDrive();
}

// --- Touch ----------------------------------------------------------------------------
// One finger works as the mouse (tap to select or place, drag to move, brush
// or draw); dragging where there's nothing to move looks around. Two fingers
// pan, and pinch to zoom.

let touch = null;
const mouseAt = (type, t, target = canvas) => target.dispatchEvent(new MouseEvent(type, { clientX: t.clientX, clientY: t.clientY, button: 0, bubbles: true }));
const mid = (a, b) => [(a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)];
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (!session) return;
  if (e.touches.length === 1) {
    const t = e.touches[0];
    mouseAt('mousedown', t);
    const looking = tool === 'select' && !drag && !placing && !placingGadget;
    touch = { mode: looking ? 'look' : 'mouse', x: t.clientX, y: t.clientY };
    if (looking) pivotUnder(t);
  } else if (e.touches.length === 2) {
    if (touch?.mode === 'mouse') mouseAt('mouseup', e.touches[0]);
    const [x, y, dist] = mid(e.touches[0], e.touches[1]);
    touch = { mode: 'two', x, y, dist };
  }
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (!touch) return;
  if (touch.mode === 'two' && e.touches.length >= 2) {
    const [x, y, dist] = mid(e.touches[0], e.touches[1]);
    const s = altitude() * 0.0018;
    const [rx, rz] = right();
    const [fx, fz] = flat();
    cam.x += -rx * (x - touch.x) * s + fx * (y - touch.y) * s;
    cam.z += -rz * (x - touch.x) * s + fz * (y - touch.y) * s;
    const f = forward();
    const step = (dist - touch.dist) * altitude() * 0.004;
    cam.x += f.x * step;
    cam.y += f.y * step;
    cam.z += f.z * step;
    Object.assign(touch, { x, y, dist });
    return;
  }
  const t = e.touches[0];
  if (touch.mode === 'look') {
    lookBy(-(t.clientX - touch.x) * 0.005, -(t.clientY - touch.y) * 0.005);
  } else mouseAt('mousemove', t);
  Object.assign(touch, { x: t.clientX, y: t.clientY });
}, { passive: false });
canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (touch?.mode === 'mouse' && e.changedTouches[0]) mouseAt('mouseup', e.changedTouches[0]);
  if (!e.touches.length) {
    touch = null;
    lookPivot = null;
  }
}, { passive: false });

// --- Controls ------------------------------------------------------------------------
// Every key the SDK uses, changeable (kept in this browser): each action has a
// key, and may have an alt key too. Each group has its own keys: flying ones
// are read only while flying, the roads and races ones only while placing
// points, so they can be the same keys as editing ones. The keydown handler
// reads the action a key is (actionFor); flying reads held(action).

const ACTIONS = [
  ['Flying (hold the right mouse button)', 'fly', [
    ['flyForward', 'Forward', 'KeyW'], ['flyBack', 'Back', 'KeyS'], ['flyLeft', 'Left', 'KeyA'], ['flyRight', 'Right', 'KeyD'],
    ['flyUp', 'Up', 'Space', 'KeyE'], ['flyDown', 'Down', 'ControlLeft', 'KeyQ'], ['flyFast', 'Faster', 'ShiftLeft'],
  ]],
  ['Terrain (with the Raise / lower tool)', 'terrain', [
    ['liftUp', 'Up a step, where the brush is', 'KeyW'], ['liftDown', 'Down a step', 'KeyS'],
    ['liftFine', 'Hold for 25 cm steps (the wheel, the keys above)', 'AltLeft'],
  ]],
  ['Roads, races and arenas (while placing points)', 'place', [
    ['endPlacing', 'Stop placing points (a race: the last is the finish; an arena: close it)', 'Space'],
    ['backPoint', 'Road or arena: take the last point back', 'Backspace'],
    ['buildRoad', 'Road: build the street (an arena: close it)', 'Enter', 'NumpadEnter'],
  ]],
  ['Editing', 'edit', [
    ['delete', 'Delete the selection', 'Delete', 'Backspace'], ['turnLeft', 'Turn left 15° (Shift: 1°)', 'KeyQ'], ['turnRight', 'Turn right 15° (Shift: 1°)', 'KeyE'],
    ['nudgeUp', 'Nudge forward (Shift: 10 cm)', 'ArrowUp'], ['nudgeDown', 'Nudge back', 'ArrowDown'], ['nudgeLeft', 'Nudge left', 'ArrowLeft'], ['nudgeRight', 'Nudge right', 'ArrowRight'],
    ['focus', 'Focus the selection', 'KeyF'], ['snap', 'Snapping on/off', 'KeyG'], ['cancel', 'Cancel (a road being drawn too) / deselect', 'Escape'],
  ]],
  ['View and play', 'edit', [
    ['topView', 'Top view', 'Tab'], ['testDrive', 'Test drive (Shift: race the event)', 'KeyP'],
  ]],
  ['Tools', 'edit', [
    ['tool1', 'Select', 'Digit1'], ['tool2', 'Raise / lower (wheel toggle off: Raise)', 'Digit2'], ['tool3', 'Lower (wheel toggle off)', 'Digit3'], ['tool4', 'Smooth', 'Digit4'], ['tool5', 'Flatten', 'Digit5'],
    ['tool6', 'Paint', 'Digit6'], ['tool7', 'Erase paint', 'Digit7'], ['tool8', 'Road', 'Digit8'], ['tool9', 'Lot', 'Digit9'], ['tool0', 'Events', 'Digit0'],
    ['smaller', 'Brush smaller', 'BracketLeft'], ['bigger', 'Brush bigger', 'BracketRight'],
  ]],
];
const SCOPE = Object.fromEntries(ACTIONS.flatMap(([, scope, list]) => list.map(([a]) => [a, scope])));
const LABEL = Object.fromEntries(ACTIONS.flatMap(([, , list]) => list.map(([a, label]) => [a, label])));
const DEFAULT_KEYS = Object.fromEntries(ACTIONS.flatMap(([, , list]) => list.map(([a, , key, alt = null]) => [a, [key, alt]])));
const KEYS_STORE = 'tt-sdk:keys';
let binding = structuredClone(DEFAULT_KEYS);
try {
  const saved = JSON.parse(localStorage.getItem(KEYS_STORE) || '{}');
  // (Saved when E and Q flew up and down: now Space and Ctrl do, with E and Q for alts.)
  if (!('flyUp2' in saved) && saved.flyUp === 'KeyE' && saved.flyDown === 'KeyQ') {
    delete saved.flyUp;
    delete saved.flyDown;
  }
  for (const [a, v] of Object.entries(saved)) {
    if (!binding[a]) continue;
    // (Saved as one key each, before alt keys: that key, and the alt as it comes.)
    binding[a] = Array.isArray(v) ? [v[0] || binding[a][0], v[1] ?? null] : [v, binding[a][1]];
  }
  // (Up and Down's second keys were actions of their own for a while.)
  if (typeof saved.flyUp2 === 'string') binding.flyUp[1] = saved.flyUp2;
  if (typeof saved.flyDown2 === 'string') binding.flyDown[1] = saved.flyDown2;
} catch {
  // (The defaults.)
}
// (Shift and Ctrl: either side.)
const SIDES = { ShiftLeft: 'ShiftRight', ControlLeft: 'ControlRight', AltLeft: 'AltRight' };
const pressed = (code) => !!code && (keys.has(code) || (!!SIDES[code] && keys.has(SIDES[code])));
const held = (action) => binding[action].some(pressed);
// 25 cm steps raising and lowering: its key held (Alt as the event says it, too).
const fineHeld = (e) => held('liftFine') || (!!e?.altKey && binding.liftFine.some((k) => k === 'AltLeft' || k === 'AltRight'));
// Controls text naming a key that can be changed: {fine} is the 25 cm steps' key.
const keyText = (t) => t.replaceAll('{fine}', keyName(binding.liftFine[0]));
// The action of a group (scope) a key is, as its key or its alt, or null.
const actionFor = (code, scope) => Object.keys(binding).find((a) => SCOPE[a] === scope && binding[a].some((k) => k && (k === code || SIDES[k] === code))) || null;

const KEY_NAMES = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', BracketLeft: '[', BracketRight: ']', ShiftLeft: 'Shift', ShiftRight: 'Right Shift', ControlLeft: 'Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Alt', AltRight: 'Right Alt', Space: 'Space', Escape: 'Esc', Enter: 'Enter', NumpadEnter: 'Num Enter', Backquote: '`', Minus: '-', Equal: '=', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\' };
const keyName = (code) => KEY_NAMES[code] || code.replace(/^Key|^Digit|^Numpad/, (m) => (m === 'Numpad' ? 'Num ' : ''));

const FIXED_KEYS = [
  // [what, key, alt key]: set out like the others, in their columns.
  ['Undo', 'Ctrl+Z'], ['Redo', 'Ctrl+Y', 'Ctrl+Shift+Z'], ['Save', 'Ctrl+S'], ['Duplicate the selection', 'Ctrl+D'],
  ['No snapping while moving or placing', 'Hold Alt'], ['Finer turns (1°) and nudges (10 cm)', 'Hold Shift'],
];
// [what, button]: in the key column, like the keys.
const MOUSE = [
  ['Select, place, brush, or draw a road', 'Left click'], ['Select a street, junction, site or gadget', 'Left click'],
  ['Place, and keep placing', 'Shift + click'], ['Move the selection (or brush, or scatter)', 'Left drag'], ['Turn the selection', 'Drag its ring'],
  ['Look around, and fly with the keys', 'Hold right'], ['Pan', 'Middle drag'], ['Zoom', 'Wheel'], ['Turn while moving or placing (Shift: 1°)', 'Wheel'],
  ['Raise / lower: a grid step up or down', 'Wheel'], ['Raise / lower: a 25 cm step up or down', '{fine} + wheel'], ['Raise / lower: zoom', 'Hold right + wheel'],
  ['Road: curve a stretch, or move a point', 'Drag a handle'], ['Road: stop placing points, or straighten a curve', 'Double-click'],
  ['Arena: move a corner, or add one at a midpoint', 'Drag a handle'], ['Arena: close the outline', 'Click its first point'],
];
const GAMEPAD = [
  ['Fly, and look round', 'Sticks'], ['Down / up', 'LT / RT'], ['Faster', 'Left stick in'], ['Act at the crosshair (a click)', 'A'],
  ['Cancel / deselect', 'B'], ['Delete the selection', 'X'], ['Copy the selection', 'Y'], ['Turn 15°', 'LB / RB'],
  ['Nudge (Raise / lower: a step up or down)', 'D-pad'], ['Top view', 'Back'], ['Test drive', 'Start'],
];
const TOUCH = [
  ['Select, place, brush or draw (as the mouse)', 'One finger'], ['Look round (where there\'s nothing to move)', 'Drag one finger'],
  ['Pan', 'Two fingers'], ['Zoom', 'Pinch'],
]

let waiting = null; // { action, slot (0: its key, 1: its alt) }: the key being changed
let keysNote = ''; // why the last change wasn't made
function renderControls() {
  const panel = $('controls-panel');
  const key = (a, slot) => {
    const on = waiting?.action === a && waiting.slot === slot;
    const code = binding[a][slot];
    return `<button data-bind="${a}" data-slot="${slot}" class="${on ? 'wait' : code ? '' : 'none'}">${on ? 'Press…' : code ? esc(keyName(code)) : '—'}</button>`;
  };
  const row = ([a, label]) => `<div class="krow"><span>${esc(label)}</span><span class="keys">${key(a, 0)}${key(a, 1)}${binding[a][1] ? `<button class="clear" data-clear="${a}" title="No alt key">×</button>` : '<i class="clear"></i>'}</span></div>`;
  panel.innerHTML = `<h3>Controls</h3>
    <p class="note">Click a key to change it, then press the new one (Esc keeps it; × takes an alt key off). A key another action in the same group had is swapped over.</p>
    ${keysNote ? `<p class="note warn">${esc(keysNote)}</p>` : ''}
    <div class="krow head"><span></span><span class="keys"><b>Key</b><b>Alt</b><i class="clear"></i></span></div>
    ${ACTIONS.map(([title, , list]) => `<h4>${esc(title)}</h4>${list.map(row).join('')}`).join('')}
    <h4>Fixed keys</h4>${FIXED_KEYS.map(([what, k, alt]) => `<div class="krow fixed"><span>${esc(what)}</span><span class="keys"><kbd>${esc(k)}</kbd><kbd class="${alt ? '' : 'none'}">${esc(alt || '')}</kbd><i class="clear"></i></span></div>`).join('')}
    ${[['Mouse', MOUSE], ['Gamepad', GAMEPAD], ['Touch', TOUCH]].map(([title, list]) => `<h4>${title}</h4>${list.map(([what, k]) => `<div class="krow fixed"><span>${esc(keyText(what))}</span><span class="keys"><kbd class="wide">${esc(keyText(k))}</kbd><i class="clear"></i></span></div>`).join('')}`).join('')}
    <div class="row" style="margin-top:10px"><button id="keys-reset">Reset to defaults</button><button id="keys-close">Close</button></div>`;
  panel.querySelectorAll('[data-bind]').forEach((b) => b.addEventListener('click', () => {
    waiting = { action: b.dataset.bind, slot: Number(b.dataset.slot) };
    keysNote = '';
    renderControls();
  }));
  panel.querySelectorAll('[data-clear]').forEach((b) => b.addEventListener('click', () => {
    binding[b.dataset.clear][1] = null;
    waiting = null;
    saveKeys();
    renderControls();
  }));
  $('keys-reset').addEventListener('click', () => {
    binding = structuredClone(DEFAULT_KEYS);
    keysNote = '';
    saveKeys();
    renderControls();
  });
  $('keys-close').addEventListener('click', () => toggleControls(false));
}

function saveKeys() {
  try {
    localStorage.setItem(KEYS_STORE, JSON.stringify(binding));
  } catch {
    // (Kept for this session only.)
  }
}

// The next key pressed, for the key waiting (before any other handler sees it).
window.addEventListener('keydown', (e) => {
  if (!waiting) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const { action, slot } = waiting;
  const scope = SCOPE[action];
  keysNote = '';
  if (e.code !== 'Escape' && !['MetaLeft', 'MetaRight', ...(scope === 'terrain' ? [] : ['AltLeft', 'AltRight']), ...(scope === 'fly' ? [] : ['ControlLeft', 'ControlRight'])].includes(e.code)) {
    // A key another action in the same group had goes to it in exchange (a key
    // an action has as its only key stays, unless there's one to give it back).
    const was = binding[action][slot];
    const other = Object.keys(binding)
      .flatMap((a) => (SCOPE[a] === scope ? [[a, 0], [a, 1]] : []))
      .find(([a, s]) => !(a === action && s === slot) && binding[a][s] === e.code);
    if (other && other[1] === 0 && !was && other[0] !== action) keysNote = `${keyName(e.code)} is ${LABEL[other[0]]}'s key: give that another key first.`;
    else {
      if (other) binding[other[0]][other[1]] = was;
      binding[action][slot] = e.code;
      if (!binding[action][0]) [binding[action][0], binding[action][1]] = [binding[action][1], null];
      saveKeys();
    }
  }
  waiting = null;
  renderControls();
}, { capture: true });

function toggleControls(show = $('controls-panel').hidden) {
  waiting = null;
  $('controls-panel').hidden = !show;
  if (show) renderControls();
}
document.body.insertAdjacentHTML('beforeend', '<div id="controls-panel" hidden></div>');
$('controls').addEventListener('click', () => toggleControls());

// --- Camera: looking round -------------------------------------------------------------
// On the spot, or (Orbit) round the selection, keeping it in the middle of the
// view at the same distance; with nothing selected, round the ground that was
// under the cursor (lookPivot).

let homeCam = null; // where the camera started (Reset camera)

function orbitPivot() {
  if (!$('orbit').checked || !session) return null;
  const it = selected && session.item(selected);
  if (it) {
    const fb = footBox(it);
    return new THREE.Vector3(fb.x, session.baseY(it) + (it.h || 2) / 2, fb.z);
  }
  if (feature && typeof feature.x === 'number') return new THREE.Vector3(feature.x, H(feature.x, feature.z), feature.z);
  return lookPivot;
}

// Nothing selected: looking round turns round the ground under the cursor
// (where it was when the right button went down, or the touch began).
let lookPivot = null;
function pivotUnder(e) {
  setRay(e);
  lookPivot = groundHit();
}

function lookBy(dyaw, dpitch) {
  const pivot = orbitPivot();
  const dist = pivot ? pivot.distanceTo(new THREE.Vector3(cam.x, cam.y, cam.z)) : 0;
  cam.yaw += dyaw;
  cam.pitch = Math.max(-1.55, Math.min(1.4, cam.pitch + dpitch));
  if (!pivot) return;
  const f = forward();
  cam.x = pivot.x - f.x * dist;
  cam.y = pivot.y - f.y * dist;
  cam.z = pivot.z - f.z * dist;
}

// --- Rotation ring -----------------------------------------------------------------------
// Round the selected object or gadget: a ring on the ground with a handle
// where it faces. Drag the ring to turn it (15° steps, Alt: free).

function ringOf() {
  if (!session || tool !== 'select' || placing || placingGadget) return null;
  const it = selected && session.item(selected);
  if (it && canMove(it)) {
    const fb = footBox(it);
    const p = session.pose(selected);
    return { x: fb.x, z: fb.z, y: session.baseY(it), r: Math.max(fb.w, fb.d) / 2 + 2.5, yaw: fb.yaw, drag: { key: selected, ox: 0, oz: 0, x: p.x, z: p.z, yaw: p.yaw, yaw0: p.yaw, cx: fb.x, cz: fb.z } };
  }
  if (feature?.type === 'gadget') {
    const g = session.gadgets().find((q) => q.id === feature.id);
    if (g && !NO_TURN.has(g.type)) return { x: g.x, z: g.z, y: H(g.x, g.z), r: Math.max(3, feature.r || 3) + 1.5, yaw: g.yaw || 0, drag: { feature, ox: 0, oz: 0, x: g.x, z: g.z, yaw: g.yaw || 0, yaw0: g.yaw || 0, cx: g.x, cz: g.z } };
  }
  return null;
}

function drawRing() {
  const ring = ringOf();
  if (!ring || (drag?.moved && !drag.rotating)) return;
  const yaw = drag?.rotating ? ring.yaw + drag.yaw - drag.yaw0 : ring.yaw;
  const y = ring.y + 0.4;
  const mat = new THREE.LineBasicMaterial({ color: drag?.rotating ? 0x05d9e8 : 0xffb000, depthTest: false, transparent: true, fog: false });
  const circle = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([...Array(48).keys()].map((k) => new THREE.Vector3(ring.x + Math.sin((k / 48) * Math.PI * 2) * ring.r, y, ring.z + Math.cos((k / 48) * Math.PI * 2) * ring.r))), mat);
  const hx = ring.x + Math.sin(yaw) * ring.r;
  const hz = ring.z + Math.cos(yaw) * ring.r;
  const arm = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ring.x, y, ring.z), new THREE.Vector3(hx, y, hz)]), mat);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshBasicMaterial({ color: mat.color, depthTest: false, fog: false }));
  handle.position.set(hx, y, hz);
  for (const o of [circle, arm, handle]) o.renderOrder = 14;
  overlay.add(circle, arm, handle);
}

// --- Races: start, points, finish ----------------------------------------------------
// A sprint or circuit is placed in stages: Place start (click it), then its
// points one by one, then Space (or Finish here): the last point is the
// finish (a circuit comes back round to its start). A point is a junction or
// a way through a site or lot, clicked near one, or a spot anywhere else (see
// sim/routePoints.js): on a street, in its middle; off the streets the race
// goes straight to it; on the ground, or up on top of something (never inside
// it). The start and a sprint's finish are always spots, exactly where they're
// put. After that the points can be dragged (the start and finish too), added
// (click the route) or taken out (select, Delete). On the map: numbered
// points, a start gate (green) and a finish gate (chequered), where the game
// puts them.

let evStage = null; // null, 'start', 'placing', 'editing'
let evSel = null; // the selected route point
const eventMarks = new THREE.Group();
scene.add(eventMarks);

function routeStageText(r) {
  if (r.kind === 'drag') {
    if (evStage === 'start') return 'Click the start on a street.';
    if (evStage === 'placing') return `Click the finish, further along ${r.along}.`;
    if (r.along && r.to !== null && r.to !== undefined) return 'Drag the start or the finish along the street to move it.';
    return 'Press Place start, then click the start on a street.';
  }
  if (evStage === 'start') return 'Click the start anywhere: on a street, off the streets, or up on top of something (not inside it).';
  if (evStage === 'placing') return `Click where the race goes: a junction, a way through a site or lot, or anywhere (off the streets it goes straight there, and up onto things). Space (or Finish here): ${r.kind === 'circuit' ? 'it comes back round to the start' : 'the last point is the finish'}.`;
  if (r.path.length) return 'Drag a point to move it (the start and finish too); click the route to add one; select one and press Delete to take it out.';
  return 'Press Place start, then click the start on the map.';
}

function finishRoute() {
  const r = evDraft?.route;
  if ((r?.path?.length || 0) < 2) return toast('Place at least one point after the start.');
  // (A sprint finishes exactly where it stops: on a junction, a spot there.)
  const last = r.path[r.path.length - 1];
  if (r.kind === 'sprint' && isJunction(last)) r.path[r.path.length - 1] = routePos(last).map((v) => Math.round(v * 10) / 10);
  evStage = 'editing';
  renderEvents();
  previewEvent();
  hint();
}

// Place start clicked at spot S: a new race starts there. One there already:
// S goes into it at the stretch nearest it (a circuit's loop turned to start
// there; a sprint's points before that stretch dropped), in place of the old start.
function placeStart(S) {
  const r = evDraft.route;
  delete r.start; // (a circuit's start was so far along its first street)
  const rest = isSpot(r.path[0]) ? r.path.slice(1) : r.path;
  if (!rest.length) {
    r.path = [S];
    evStage = 'placing';
    return;
  }
  const pos = rest.map(routePos);
  let best = null;
  const n = r.kind === 'circuit' ? pos.length : pos.length - 1;
  for (let k = 0; k < n; k++) {
    const [a, b] = [pos[k], pos[(k + 1) % pos.length]];
    if (!a || !b) continue;
    const q = G.segDist(S[0], S[1], a, b);
    if (!best || q.d < best.d) best = { d: q.d, k, t: q.t };
  }
  if (r.kind === 'circuit') r.path = best ? [S, ...rest.slice(best.k + 1), ...rest.slice(0, best.k + 1)] : [S, ...rest];
  else r.path = !best || (best.k === 0 && best.t < 0.02) ? [S, ...rest] : [S, ...rest.slice(best.k + 1)];
  evStage = 'editing';
}

// What's solid about a district item, as a race off the streets has it (an
// obstacle: footprint, y, h), or null.
function solidOf(it) {
  if (it.hidden || !(it.solid || it.deck) || !Array.isArray(it.r)) return null;
  const o = layoutObstacle(it, 0, 0);
  if (it.deck) {
    const base = typeof it.y === 'number' ? it.y : H(o.x, o.z);
    Object.assign(o, { y: base - 0.05, h: it.h - base + 0.05 });
  }
  return o;
}

// The top of what's solid at (x, z) that a click at height y landed on (or on
// what's drawn on it: rooftop clutter), or null.
function topAt(x, z, y) {
  let best = null;
  for (const it of session.layout.items) {
    const o = solidOf(it);
    if (!o || !onFoot(o, x, z)) continue;
    const top = o.y + o.h;
    if (y >= top - 0.6 && y <= top + 4 && (best === null || top > best)) best = top;
  }
  return best;
}

// The item a car at height y at (x, z) would be inside, or null.
function solidIn(x, z, y) {
  for (const it of session.layout.items) {
    const o = solidOf(it);
    if (o && o.y < y + 1.5 && o.y + o.h > y + 0.3 && onFoot(o, x, z)) return it;
  }
  return null;
}

// The middle of the street at (x, z), if it's on one (its sidewalks too), or null.
function streetMiddle(x, z) {
  const map = session.map;
  let best = null;
  if (map.plan) {
    for (const st of map.streets) {
      if (st.drain || st.tunnel) continue;
      const q = G.nearestOnLine(st.pts, x, z);
      if (q.d < st.half + 3 && (!best || q.d < best.d)) best = q;
    }
    return best?.p || null;
  }
  for (const e of map.edges.values()) {
    const [A, B] = [map.nodes[e.a], map.nodes[e.b]];
    if (A.stub || B.stub || A.i < 0 || B.i < 0) continue;
    const q = G.segDist(x, z, [A.x, A.z], [B.x, B.z]);
    if (q.d < 9 && (!best || q.d < best.d)) best = { d: q.d, p: [A.x + (B.x - A.x) * q.t, A.z + (B.z - A.z) * q.t] };
  }
  return best?.p || null;
}

// Where a race's start or finish goes, under the cursor: on the ground (on a
// street, in its middle) or up on top of something, never inside something.
// { at: [x, z] or [x, z, y] } or { why }.
function raceSpot() {
  const g = groundHit();
  if (!g) return { why: 'Click on the map.' };
  let [x, z, y] = [g.x, g.z, null];
  const m = meshHit();
  if (m && m.y > H(m.x, m.z) + 0.4) {
    // Something's drawn there: stand on its top; its side is refused. (What's
    // not solid, the Undercity's deck, a tree's crown, a sign: the ground under it.)
    const top = topAt(m.x, m.z, m.y);
    if (top !== null) [x, z, y] = [m.x, m.z, top];
    else {
      const d = ray.ray.direction;
      const side = session.layout.items.find((it) => {
        const o = solidOf(it);
        return o && m.y >= o.y - 0.1 && m.y <= o.y + o.h + 0.1 && onFoot(o, m.x + d.x * 0.3, m.z + d.z * 0.3);
      });
      if (side) return { why: `That's the side of the ${nameOf(side).toLowerCase()}: click its top, or the ground.` };
    }
  }
  const inside = solidIn(x, z, y ?? H(x, z));
  if (inside) return { why: `That's inside the ${nameOf(inside).toLowerCase()}: put it on the ground, or on top of something.` };
  if (y === null) [x, z] = streetMiddle(x, z) || [x, z];
  const r1 = (v) => Math.round(v * 10) / 10;
  return { at: y === null ? [r1(x), r1(z)] : [r1(x), r1(z), r1(y)] };
}

// A point clicked along a race: a junction or a way through (near one), or a
// spot anywhere. { point } or { why }.
function routeAdd() {
  const s = raceSpot();
  if (s.why) return s;
  const p = s.at.length === 2 ? routePoint(session, s.at[0], s.at[1]) : null;
  return { point: p ? p.name : s.at };
}

// A junction's name (not a way's, or a spot)?
function isJunction(name) {
  if (isSpot(name)) return false;
  if (session.map.plan) return session.map.byName.has(name);
  const [c, rw] = name.split('.');
  const g = session.district.city.grid;
  return g.cols[c] !== undefined && g.rows[rw] !== undefined;
}

// What a check found in the way, by name ("the warehouse"), or "something".
function thing(key) {
  const it = key && session.item(key);
  return it ? `the ${nameOf(it).toLowerCase()}` : 'something';
}

// A route point as the route's list shows it.
function pointLabel(r, k) {
  const p = r.path[k];
  if (!isSpot(p)) return p;
  const what = k === 0 ? 'Start' : r.kind === 'sprint' && k === r.path.length - 1 && evStage !== 'placing' ? 'Finish' : 'Point';
  const f = featureAt(session, p[0], p[1]);
  const on = f?.type === 'street' || f?.type === 'gridStreet' ? ` on ${f.name}` : '';
  return `${what}${on}${p.length > 2 ? ` (${(p[2] - H(p[0], p[1])).toFixed(1)} m up)` : ''}`;
}

// Where a route point is: a junction, a way through (its middle), or a spot.
function routePos(name) {
  if (isSpot(name)) return [name[0], name[1]];
  const map = session.map;
  if (map.plan) {
    const n = map.byName.get(name);
    if (n) return [n.x, n.z];
  } else if (name.includes('.')) {
    const g = session.district.city.grid;
    const [c, rw] = name.split('.');
    const n = map.nodes[g.rows[rw] * g.xs.length + g.cols[c]];
    if (n && g.cols[c] !== undefined && g.rows[rw] !== undefined) return [n.x, n.z];
  }
  const c = (map.corridors || []).find((q) => q.id === name);
  return c?.points?.length ? c.points[Math.floor(c.points.length / 2)] : null;
}

function routePointAt(g) {
  const near = Math.max(6, altitude() * 0.02);
  let best = null;
  routeMarks().forEach((p, k) => {
    const d = p ? Math.hypot(p[0] - g.x, p[1] - g.z) : Infinity;
    if (d < near && (!best || d < best.d)) best = { d, k };
  });
  return best ? best.k : null;
}

// The stretch of route (between points k and k + 1) at a ground point, or null.
function routeSegmentAt(g) {
  const path = evDraft.route.path;
  const pts = path.map(routePos);
  if (evDraft.route.kind === 'circuit' && pts.length > 2) pts.push(pts[0]);
  let best = null;
  for (let k = 0; k + 1 < pts.length; k++) {
    if (!pts[k] || !pts[k + 1]) continue;
    const { d } = G.segDist(g.x, g.z, pts[k], pts[k + 1]);
    if (d < 12 && (!best || d < best.d)) best = { d, k };
  }
  return best ? Math.min(best.k, path.length - 1) : null;
}

function drawEventMarks() {
  clearGroup(eventMarks);
  const r = evDraft?.route;
  if (tool !== 'events' || !r || !session) return;
  const basic = (color) => new THREE.MeshBasicMaterial({ color, depthTest: false, fog: false });
  const size = Math.max(2, altitude() * 0.015);
  // The route's points, numbered by colour: the start green, the finish white, the rest amber, selected cyan.
  const marks = routeMarks();
  marks.forEach((mp, k) => {
    let p = mp;
    if (drag?.routePoint === k && drag.at) p = drag.at;
    if (!p) return;
    const last = k === marks.length - 1 && evStage !== 'placing' && (r.kind === 'drag' || r.kind === 'sprint');
    const color = evSel === k ? 0x05d9e8 : k === 0 ? 0x39ff14 : last ? 0xffffff : 0xffb000;
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(size), basic(color));
    m.position.set(p[0], (p[2] ?? H(p[0], p[1])) + size * 2, p[1]);
    m.renderOrder = 15;
    eventMarks.add(m);
  });
  // Where the race runs into something (wayProblem): a red ring.
  if (evWay && evStage !== 'placing') {
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([...Array(32).keys()].map((k) => {
      const a = (k / 32) * Math.PI * 2;
      return new THREE.Vector3(evWay.x + Math.cos(a) * 8, H(evWay.x, evWay.z) + 1, evWay.z + Math.sin(a) * 8);
    })), new THREE.LineBasicMaterial({ color: 0xff2a6d, depthTest: false, transparent: true, fog: false }));
    ring.renderOrder = 15;
    eventMarks.add(ring);
  }
  // The gates, where the game puts them (the route it builds), up on what they're on.
  const pts = evPreview?.pts;
  if (!pts || pts.length < 2 || evStage === 'placing' || evStage === 'start') return;
  const gate = ([x, z], [nx, nz], kind, top) => {
    const yaw = Math.atan2(nx - x, nz - z);
    const half = 12;
    const y = top ?? H(x, z);
    const g = new THREE.Group();
    for (const s of [-1, 1]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 0.6).translate(s * half, 3.5, 0), basic(0x4a4858)));
    const cells = 12;
    for (let c = 0; c < cells; c++) {
      for (const row of [0, 1]) {
        const color = kind === 'start' ? 0x39ff14 : (c + row) % 2 ? 0xffffff : 0x111111;
        g.add(new THREE.Mesh(new THREE.BoxGeometry((half * 2) / cells, 0.8, 0.3).translate(-half + ((c + 0.5) * half * 2) / cells, 6.2 + row * 0.8, 0), basic(kind === 'both' ? (c < cells / 2 ? 0x39ff14 : (c + row) % 2 ? 0xffffff : 0x111111) : color)));
      }
    }
    g.position.set(x, y, z);
    g.rotation.y = yaw; // (its beam runs along its local x: across the road)
    g.children.forEach((o) => (o.renderOrder = 15));
    eventMarks.add(g);
  };
  const at = (s) => {
    const p = G.pointAlong(pts, Math.max(0, Math.min(s, G.lineLength(pts))));
    return [[p.x, p.z], [p.x + p.dx, p.z + p.dz]];
  };
  const end = [pts[pts.length - 1], [2 * pts[pts.length - 1][0] - pts[pts.length - 2][0], 2 * pts[pts.length - 1][1] - pts[pts.length - 2][1]]];
  if (evPreview.closed) gate(...at(0), 'both', evPreview.startY);
  else if (r.kind === 'drag') {
    gate(pts[0], pts[1], 'start');
    gate(...end, 'finish');
  } else {
    gate(...at(evPreview.startS), 'start', evPreview.startY);
    gate(...at(evPreview.finishS), 'finish', evPreview.finishY);
  }
}

// The route's points on the map (null: not placed): a drag's start and
// finish (where the game builds them when they're given as distances), or a
// race's junctions, ways and spots ([x, z, y] up on something).
function routeMarks() {
  const r = evDraft?.route;
  if (!r) return [];
  if (r.kind === 'drag') {
    const pts = evPreview?.pts;
    const ends = pts?.length > 1 ? [pts[0], pts[pts.length - 1]] : [null, null];
    const placed = (v, end) => (Array.isArray(v) ? v : v !== null && v !== undefined && r.along ? end : null);
    return [placed(r.from, ends[0]), placed(r.to, ends[1])];
  }
  return (r.path || []).map((p) => (isSpot(p) ? p : routePos(p)));
}

// A drag's start (0) or finish (1) dropped: it stays on its street.
function dropDragEnd(k, at) {
  const r = evDraft.route;
  const f = featureAt(session, at[0], at[1]);
  const street = f?.type === 'street' || f?.type === 'gridStreet' ? f.name : null;
  if (street !== r.along) return toast(`Keep it on ${r.along}.`);
  r[k === 0 ? 'from' : 'to'] = [Math.round(at[0]), Math.round(at[1])];
}
