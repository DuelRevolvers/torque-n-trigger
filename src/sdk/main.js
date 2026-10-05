import * as THREE from 'three';
import { DISTRICTS } from '../career/districts.js';
import { createTextures, createEnvMap } from '../render/textures.js';
import { createCityTextures } from '../render/cityTextures.js';
import { createStreetTextures } from '../render/streetTextures.js';
import { retroUniforms } from '../render/retroMaterial.js';
import { buildDistrictView, districtViewOf, setDistrictStyles } from '../render/districtView.js';
import { docFromDistrict, districtFromDoc, serializeDoc, parseDoc, baseChanged, hashOf } from '../content/mapDoc.js';
import { canMove, LINKED, itemCentre, longSide, withSet } from '../sim/layoutEdits.js';
import { runnable, runPieces } from './runs.js';
import { baseLayout } from '../sim/cityLayout.js';
import { brokenEvents, gridProblem, wayProblem } from './checks.js';
import { isSpot } from '../sim/routePoints.js';
import { layoutObstacle, districtMap } from '../sim/city.js';
import { onFoot } from '../sim/track.js';
import { TYPES, MODES, BARRIER_STYLES, MODIFIER_LABELS, DRIVERS, newEvent, nextKey, routePoint, arenaSites, routePreview, aiTestRun } from './events.js';
import { arenasOf, outlineOf, outlineProblem, middleOf } from '../sim/arenaEdits.js';
import { Session, footBox } from './session.js';
import { OBJECT_OPTIONS, optionDefault } from './objectOptions.js';
import { catalogue, SECTIONS, GADGET_SECTION, HOME_ONLY, GROUND, models, modelOf } from './catalogue.js';
import { brush, lift } from './brush.js';
import { GADGETS, GADGET_SHAPES, shapeOf, shapeSettings, LINKABLE, liftPosts, addGadgets, newGadget, rampsOf, SETTINGS, DROPS, NO_TURN, SIGN_STYLES, HAZARD_KINDS, signSize, LIGHT_FIXTURES, LIGHT_PRESETS, SPAN_LIGHTS, lightPreset, lightResize, LIGHT_FLICKER, LIGHT_COLORS, MAX_REAL_LIGHTS } from '../sim/gadgets.js';
import { lightMarkers } from '../render/lightView.js';
import { bridgeView } from '../render/bridgeView.js';
import { BRIDGE_STYLES, BRIDGE_DEFAULTS } from '../sim/bridges.js';
import { placedView, startMarkers } from '../render/placedView.js';
import { rampGeometry } from '../render/shapes.js';
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
import { openCarEditor, carEditorOpen } from './carEditor.js';

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
const ghostLayer = new THREE.Group(); // the object being placed, drawn see-through
scene.add(ghostLayer);
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
let group = []; // several things selected (box or Ctrl+click): [{ key } | { gadget }]
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
let runPts = []; // placing in a run (a fence, a wall): its posts so far
let runHover = null; // where the next post goes: { p, close }
let runWanted = false; // In a run was picked last (it's picked again for the next fence or wall)
let scatter = null; // placing by scatter: [[x, z, yaw]] so far
let feature = null; // a street, junction, site or gadget selected (sdk/roads.js featureAt)
let placingGadget = null; // a gadget type being placed
let placingPreset = null; // and its own settings (a light's fixture, a ramp's shape: LIGHT_PRESETS, GADGET_SHAPES)
let placingModel = null; // the model being placed (placing: one of its styles; catalogue.js models)
let pasting = null; // several things copied, being placed together (Paste): the clipboard (clip)
let modelList = new Map(); // (the Objects list's models, by key)
const stylePicked = new Map(); // a model's style picked last (its uid)
const shapePicked = new Map(); // a gadget's shape picked last
let linking = null; // a trigger pad's id while a gadget's being linked to it (its Link a gadget button)
let linkAt = null; // (the cursor's ground, while linking)
// Each kind of light, as the Lights list has it.
const LIGHT_ABOUT = {
  post: 'A street lamp: a pole, an arm out over the road, the lamp at its end.',
  flood: 'A floodlight tower: two big lamps up high, lighting a wide stretch the way it faces.',
  wall: 'A lamp on a wall, at its height, shining down and out the way it faces (nothing to hit).',
  bollard: 'A short post with a glowing top, for paths and car parks.',
  string: 'A string of bulbs sagging between two thin poles, along the way it faces (its Length).',
  bar: 'A neon tube at its height, along the way it faces (its Length; nothing to hit).',
  search: 'A searchlight on a stand, its beam sweeping slowly round the sky.',
  barrel: 'An oil drum with a fire burning in it.',
  beacon: 'A warning beacon on a short post, its beams going round.',
  ground: 'A light set flush in the ground (nothing to hit).',
  bare: 'Just the light, on no fixture: nothing to see or hit, only its light (the SDK marks where it is).',
};
// --- Bridges (the Roads tab's Bridge tool; sim/bridges.js) ---
let bridgePts = []; // the bridge being drawn: its points
let bridgeSel = null; // the bridge selected (its id)
const bridgeDraft = { ...BRIDGE_DEFAULTS }; // what the next one's like
let bridgeGroup = null; // the bridges, as the game draws them
const bridgeLayer = new THREE.Group(); // the one being drawn, the one selected
scene.add(bridgeLayer);

function rebuildBridges() {
  if (bridgeGroup) {
    scene.remove(bridgeGroup);
    dispose(bridgeGroup);
    bridgeGroup = null;
  }
  const g = session ? bridgeView(session.bridges(), H, tex) : null;
  if (g) {
    bridgeGroup = g;
    scene.add(g);
  }
}

// The bridge whose deck is over a ground point, or null.
function bridgeAt(g) {
  for (const b of session.bridges()) if (G.nearestOnLine(b.pts, g.x, g.z).d < b.width / 2 + 1) return b.id;
  return null;
}

// The path being drawn (on to the cursor), at the height it'll be; the bridge selected, outlined.
function drawBridges(cursor = null) {
  for (const o of [...bridgeLayer.children]) {
    bridgeLayer.remove(o);
    dispose(o);
  }
  if (tool !== 'bridge' || !session) return;
  const line = (pts, up, color) => {
    if (pts.length < 2) return;
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, H(x, z) + up + 0.3, z))), new THREE.LineBasicMaterial({ color, depthTest: false, fog: false }));
    l.renderOrder = 12;
    bridgeLayer.add(l);
  };
  line(cursor ? [...bridgePts, [cursor.x, cursor.z]] : bridgePts, bridgeDraft.height, 0x05d9e8);
  for (const [x, z] of bridgePts) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), new THREE.MeshBasicMaterial({ color: 0x05d9e8, depthTest: false, fog: false }));
    m.position.set(x, H(x, z) + bridgeDraft.height + 1, z);
    m.renderOrder = 13;
    bridgeLayer.add(m);
  }
  const sel = bridgeSel && session.bridges().find((b) => b.id === bridgeSel);
  if (sel) {
    for (const sg of [-1, 1]) {
      line(sel.pts.map((p, k) => {
        const a = sel.pts[Math.max(0, k - 1)];
        const b = sel.pts[Math.min(sel.pts.length - 1, k + 1)];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        return [p[0] - ((b[1] - a[1]) / L) * sg * (sel.width / 2), p[1] + ((b[0] - a[0]) / L) * sg * (sel.width / 2)];
      }), sel.height + 1.2, 0xffb000);
    }
  }
}

function endBridge() {
  if (bridgePts.length < 2) {
    bridgePts = [];
    drawBridges();
    return toast('A bridge needs two points or more: click along its path.');
  }
  bridgeSel = session.addBridge(bridgePts, bridgeDraft);
  bridgePts = [];
  changed(false);
  showBridgeOpts();
  drawBridges();
  hint();
}

// The Bridge tool's settings (on the left, under the tools): the next one's,
// or the selected bridge's (changed as they're set).
function showBridgeOpts() {
  const box = $('bridge-opts');
  if (!box) return;
  box.hidden = tool !== 'bridge';
  if (box.hidden || !session) return;
  const sel = bridgeSel && session.bridges().find((b) => b.id === bridgeSel);
  const v = sel || bridgeDraft;
  box.innerHTML = `<h3>${sel ? `Bridge ${esc(sel.id)}` : bridgePts.length ? 'Drawing a bridge' : 'Bridge'}</h3>
    <div class="grid">
      <label for="br-style">style</label><select id="br-style">${Object.entries(BRIDGE_STYLES).map(([k, n]) => `<option value="${k}"${v.style === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
      ${sliderPair('br-width', 'width', 4, 30, 0.5, ' m', v.width)}
      ${sliderPair('br-height', 'height', 0, 20, 0.25, ' m', v.height)}
    </div>
    <label class="check"><input type="checkbox" id="br-ramps"${v.ramps !== false ? ' checked' : ''} /> Ramps down from its ends</label>
    <p class="note">Height: over the ground at its ends; it runs level from one to the other. 0 lays it from rooftop to rooftop, straight across a gap.${sel ? '' : ' Click along its path; double-click, Space or Enter builds it.'}</p>
    ${sel ? '<div class="row"><button id="br-del" class="danger" title="Delete">Delete bridge</button></div>' : ''}`;
  box.querySelectorAll('input.num[data-for]').forEach(numberBox);
  const read = () => ({ style: $('br-style').value, width: Number($('br-width').value), height: Number($('br-height').value), ramps: $('br-ramps').checked });
  for (const id of ['br-style', 'br-width', 'br-height', 'br-ramps']) {
    $(id).addEventListener('change', () => {
      const p = read();
      if (sel) {
        if (session.setBridge(sel.id, p)) changed(false);
      } else Object.assign(bridgeDraft, p);
      drawBridges();
    });
  }
  $('br-del')?.addEventListener('click', () => {
    if (!session.removeBridge(sel.id)) return;
    bridgeSel = null;
    changed(false);
    showBridgeOpts();
    drawBridges();
  });
}

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
    selected = hovered = placing = pasting = drag = ghostAt = stroke = runHover = null;
    runPts = [];
    clearGroup(preview);
    // (Named by the district they're from, as every other district's are.)
    const home = DISTRICTS.find((d) => d.id === doc.base)?.name || doc.name;
    cat = catalogue([...session.base.values()]).map((e) => ({ ...e, uid: e.id, districtName: home, home: doc.base }));
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
  if (group.length) group = group.filter((t) => (t.key ? session.item(t.key) : session.gadgets().some((g) => g.id === t.gadget)));
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
  // From the map's test drive start, facing its arrow (a car's yaw faces -z
  // at 0; a gadget's arrow +z); else where the middle of the view meets the
  // ground, heading the way the camera looks.
  const at = session.gadgets().find((q) => q.type === 'testStart');
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const g = at ? null : groundHit();
  const spawn = at ? { x: at.x, z: at.z, yaw: Math.atan2(-Math.sin(at.yaw || 0), -Math.cos(at.yaw || 0)) } : { x: g ? g.x : cam.x, z: g ? g.z : cam.z, yaw: cam.yaw + Math.PI };
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

// The top of whatever's drawn under the ray (a roof, a deck, the ground), as
// { x, y, z }; the ground if what's hit first is a side (a wall).
function surfaceHit() {
  if (view) {
    for (const h of ray.intersectObject(view, true)) {
      const m = h.object.material;
      if (!h.object.visible || !m || m.transparent || m.blending === THREE.AdditiveBlending) continue;
      const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : null;
      if (n && Math.abs(n.y) > 0.6) return h.point;
      break;
    }
  }
  const g = groundHit();
  return g ? new THREE.Vector3(g.x, H(g.x, g.z), g.z) : null;
}

// How far up off the ground a ghost at at is (on top of something), to the cm; 0 on the ground.
function upHere(at) {
  if (at?.y === null || at?.y === undefined) return 0;
  const up = at.y - H(at.x, at.z);
  return up > 0.05 ? Math.round(up * 100) / 100 : 0;
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

// A ghost in any shape (world coordinates): see-through, its edges drawn over everything.
function ghostShape(geo, color, opacity = 0.25) {
  const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, fog: false }));
  edges.renderOrder = 10;
  overlay.add(fill, edges);
}

// What a gadget, light, drop, ramp, hazard, sign or start would be where it's
// going: its shape as the game has it (a ramp's wedge, a slick's or a plate's
// reach, a light's post and what it lights, a start's car and the way it faces).
const ARROW = [[-0.5, -2], [0.5, -2], [0.5, 0.4], [1.4, 0.4], [0, 2.2], [-1.4, 0.4], [-0.5, 0.4]];
function gadgetGhost(g, color = 0x05d9e8) {
  const up = g.up || 0; // (on top of something)
  const ground = H(g.x, g.z) + up;
  const yaw = g.yaw || 0;
  const at = (w, d, base, h, opacity = 0.25) => box({ x: g.x, z: g.z, w, d, yaw }, base, h, color, opacity);
  const disc = (r, h, opacity = 0.25, base = ground) => ghostShape(new THREE.CylinderGeometry(r, r, h, 40).translate(g.x, base + h / 2, g.z), color, opacity);
  switch (g.type) {
    case 'lift':
      for (const [px, pz] of liftPosts(g.x, g.z, g.w / 2, g.d / 2, yaw)) box({ x: px, z: pz, w: 0.4, d: 0.4, yaw: 0 }, H(px, pz) + up, g.hMax + 0.6, color, 0.25);
      return at(g.w, g.d, ground, 0.6);
    case 'gate':
      return at(g.width, 1.2, ground, g.hMax);
    case 'trigger':
      return disc(g.r, 0.15);
    case 'hazard':
    case 'oil':
      return disc(g.r, 0.12);
    case 'sweeper':
      // (Where its bar sweeps, round its pivot.)
      disc(g.len, 0.06, 0.12);
      return at(0.6, 0.6, ground, 1.8);
    case 'mover':
      // (The block, and how far it slides either way along its heading.)
      at(g.w, g.d + g.travel * 2, ground, 0.05, 0.1);
      return at(g.w, g.d, ground, 2.5);
    case 'light': {
      disc(g.reach, 0.05, 0.07);
      const f = g.fixture || 'post';
      if (f === 'bare') return at(0.8, 0.8, ground + g.height - 0.4, 0.8);
      if (f === 'wall') return at(0.4, 0.6, ground + g.height - 0.3, 0.6);
      if (f === 'bar') return at(0.3, g.span, ground + g.height - 0.15, 0.4);
      if (f === 'ground') return at(0.7, 0.7, ground, 0.1);
      if (f === 'search') return at(1.2, 1.2, ground, 1.6);
      if (f === 'barrel') return ghostShape(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 16).translate(g.x, ground + 0.5, g.z), color);
      if (f === 'string') {
        at(0.15, g.span, ground + g.height - 0.6, 0.6);
        for (const s of [-1, 1]) {
          const [px, pz] = [g.x + Math.sin(yaw) * s * (g.span / 2), g.z + Math.cos(yaw) * s * (g.span / 2)];
          box({ x: px, z: pz, w: 0.2, d: 0.2, yaw }, H(px, pz) + up, g.height + 0.3, color, 0.25);
        }
        return;
      }
      const w = f === 'flood' ? 1.2 : f === 'post' ? 0.5 : 0.3;
      return at(w, w, ground, g.height + 0.5);
    }
    case 'health':
    case 'ammo':
    case 'nitro':
      return at(1.4, 1.4, ground + 0.1 + (g.height || 0), 1.4);
    case 'ramp':
    case 'kicker': {
      const r = rampsOf([g], H)[0];
      return ghostShape(rampGeometry(r, r.abs), color);
    }
    case 'barrel':
      return ghostShape(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 16).translate(g.x, ground + 0.55, g.z), color);
    case 'sign': {
      const { w, h } = signSize(g);
      at(w + 0.2, 0.3, ground + g.height - 0.1, h + 0.2);
      if (g.posts) {
        for (const s of [-1, 1]) {
          const [px, pz] = [g.x + Math.cos(yaw) * s * (w / 2 - 0.3), g.z - Math.sin(yaw) * s * (w / 2 - 0.3)];
          box({ x: px, z: pz, w: 0.25, d: 0.25, yaw }, H(px, pz) + up, g.height + h, color, 0.25);
        }
      }
      return;
    }
    case 'start':
    case 'testStart':
    case 'spawn': {
      at(2.2, 4.6, ground, 1.4);
      const shape = new THREE.Shape(ARROW.map(([x, y]) => new THREE.Vector2(x * 1.3, y * 1.3)));
      return ghostShape(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).scale(1, 1, -1).rotateY(yaw).translate(g.x, ground + 0.3, g.z), color, 0.5);
    }
    default:
      return at(2, 2, ground, 2);
  }
}

function showOverlay() {
  for (const o of [...overlay.children]) {
    overlay.remove(o);
    dispose(o);
  }
  ghostLayer.clear(); // (clones sharing the cached ghosts' geometry: not disposed)
  if (!session) return;
  // (A footprint from what was drawn carries its own bottom and height.)
  const shown = (key, color, opacity) => {
    const it = session.item(key);
    if (!it) return;
    const fb = footBox(it);
    const { y0, h } = session.heightOf(it);
    box(fb, y0, h, color, opacity);
  };
  if (hovered && hovered !== selected && !drag && !placing) shown(hovered, 0xffffff, 0.08);
  if (drag?.moved && drag.key && !drag.feature) {
    // The object where it's going: its box, moved and turned, kept at its height above the ground.
    const it = session.item(drag.key);
    const fb = footBox(it);
    const p = session.pose(drag.key);
    const { y0, h } = session.heightOf(it);
    box({ ...fb, x: fb.x + drag.x - p.x, z: fb.z + drag.z - p.z, yaw: fb.yaw + drag.yaw - p.yaw }, H(drag.x, drag.z) + y0 - H(fb.x, fb.z), h, 0x05d9e8, 0.25);
  } else if (selected) shown(selected, 0xffb000, 0.15);
  if (group.length) {
    const d = drag?.group && (drag.moved || drag.rotating) ? drag : null;
    const moves = d ? groupMoves(d) : null;
    group.forEach((t, i) => {
      const mv = moves?.[i];
      if (t.gadget) {
        const g = session.gadgets().find((q) => q.id === t.gadget);
        if (g) gadgetGhost(mv ? { ...g, x: mv.x, z: mv.z, yaw: mv.yaw } : g, mv ? 0x05d9e8 : 0xffb000);
        return;
      }
      const it = session.item(t.key);
      if (!it) return;
      const fb = footBox(it);
      const { y0, h } = session.heightOf(it);
      if (!mv) return box(fb, y0, h, 0xffb000, 0.15);
      const p = session.pose(t.key);
      box({ ...fb, x: mv.x + fb.x - p.x, z: mv.z + fb.z - p.z, yaw: fb.yaw + mv.yaw - p.yaw }, H(mv.x, mv.z) + y0 - H(fb.x, fb.z), h, 0x05d9e8, 0.25);
    });
  }
  if (placing && ghostAt) {
    const { src, lift } = placingSource();
    const fb = footBox(src);
    // (The object itself, see-through, its bottom on what's under it (y: the top it's on); a box if it draws nothing alone.)
    const model = ghostModel(placing.from, ghostSet(placing));
    const ghost = (x, z, yaw, y = null) => {
      if (!model) return box({ x, z, w: fb.w, d: fb.d, yaw: fb.yaw + yaw }, (y ?? H(x, z)) + lift, src.h || 2, 0x05d9e8, 0.25);
      const g = model.view.clone();
      g.matrixAutoUpdate = false;
      g.matrix.makeTranslation(-model.px, 0, -model.pz).premultiply(new THREE.Matrix4().makeRotationY(yaw)).premultiply(new THREE.Matrix4().makeTranslation(x, (y ?? H(x, z)) - model.ground - model.drop, z));
      ghostLayer.add(g);
    };
    if (scatter) for (const [x, z, yaw] of scatter) ghost(x, z, yaw);
    else if (runMode()) {
      const side = longSide(src);
      const posts = runHover && !runHover.close ? [...runPts, runHover.p] : runPts;
      for (const p of runPieces(src, posts, !!runHover?.close)) box({ x: p.x, z: p.z, w: side.width, d: p.len, yaw: side.yaw + p.yaw }, H(p.x, p.z) + lift, src.h || 2, 0x05d9e8, 0.25);
      const post = ([x, z], color) => box({ x, z, w: 0.7, d: 0.7, yaw: 0 }, H(x, z) + lift, (src.h || 2) + 0.6, color, 0.5);
      runPts.forEach((p, k) => post(p, k === 0 && runHover?.close ? 0x39ff14 : 0xffb000));
      if (runHover && !runHover.close) post(runHover.p, 0x05d9e8);
    } else if (lineFrom) for (const [x, z, yaw] of linePoses(lineFrom, [ghostAt.x, ghostAt.z])) ghost(x, z, yaw);
    else ghost(ghostAt.x, ghostAt.z, placeYaw + (placing.copied ? 0 : squareTurn(src)), ghostAt.y);
  }
  if (pasting && ghostAt) pasteGhosts();
  if (placingGadget && ghostAt) gadgetGhost({ ...newGadget(placingGadget, 'ghost', ghostAt.x, ghostAt.z, NO_TURN.has(placingGadget) ? 0 : placeYaw), ...placingPreset, up: upHere(ghostAt) });
  // (Linking a gadget to a trigger pad: a line from the pad to the cursor, and the gadget under it outlined.)
  const pad = linking && session.gadgets().find((q) => q.id === linking);
  if (pad && linkAt) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(pad.x, H(pad.x, pad.z) + 0.4, pad.z), new THREE.Vector3(linkAt.x, linkAt.y + 0.4, linkAt.z)]), new THREE.LineDashedMaterial({ color: 0xffb000, dashSize: 0.8, gapSize: 0.5, depthTest: false, transparent: true, fog: false }));
    line.computeLineDistances();
    line.renderOrder = 11;
    overlay.add(line);
    const under = gadgetAt(linkAt.x, linkAt.z);
    const g = under && under !== pad.id && session.gadgets().find((q) => q.id === under);
    if (g) gadgetGhost(g, LINKABLE.has(g.type) ? 0x39ff14 : 0xff2a6d);
  }
  // (A spawn point placed in the Arenas tool: red where it can't go.)
  if (tool === 'arena' && arenaSpawning && arenaGhost) gadgetGhost(newGadget('spawn', 'ghost', arenaGhost.x, arenaGhost.z, arenaGhost.yaw), arenaGhost.ok ? 0x05d9e8 : 0xff2a6d);
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
const TAB_OF = { height: 'terrain', raise: 'terrain', lower: 'terrain', smooth: 'terrain', flatten: 'terrain', paint: 'terrain', erase: 'terrain', road: 'roads', bridge: 'roads', lot: 'roads', events: 'events', arena: 'events', sky: 'sky' };
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
  linking = null;
  roadPts = [];
  roadBends = [];
  roadStage = 'drawing';
  bridgePts = [];
  bridgeSel = null;
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
  showBridgeOpts();
  drawBridges();
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
    pasting = null;
    ghostAt = null;
    runPts = [];
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

// A grid row: its label, then a slider and its number box (typed into as well).
const sliderPair = (id, label, min, max, step, unit, value, extra = '') => `<label for="${id}">${label}</label><span class="slider"><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" ${extra}/><input class="num" id="${id}-v" data-for="${id}" data-unit="${unit}" inputmode="decimal" /></span>`;

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
  group = [];
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
    linking = null;
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
        ${sliderPair('st-width', 'width', 4, 60, 1, ' m', f.width)}
        <label for="st-surface">surface</label><select id="st-surface"><option value="asphalt"${f.surface === 'asphalt' ? ' selected' : ''}>Asphalt</option><option value="dirt"${f.surface === 'dirt' ? ' selected' : ''}>Dirt</option></select>
      </div>` : ''}
      ${f.fixed ? `<p class="note">${esc(f.fixed)}</p>` : ''}
      <div class="row">${f.key ? '<button id="st-apply">Apply</button>' : ''}${f.fixed ? '' : '<button id="f-del" class="danger">Delete street</button>'}</div>
      ${warn}`;
    ins.querySelectorAll('input.num[data-for]').forEach(numberBox);
    $('st-apply')?.addEventListener('click', () =>
      editFeature('Rebuilding the street…', () => ({ plan: setStreet(session, f, { name: $('st-name').value, width: Number($('st-width').value), surface: $('st-surface').value }) }), f.at));
  } else if (f.type === 'node') {
    ins.innerHTML = `
      <h3>${esc(f.name)}</h3><div class="key">junction</div>
      ${f.movable ? `<div class="grid">
        ${sliderPair('n-x', 'x', Math.floor(f.x - 200), Math.ceil(f.x + 200), 1, ' m', +f.x.toFixed(1))}
        ${sliderPair('n-z', 'z', Math.floor(f.z - 200), Math.ceil(f.z + 200), 1, ' m', +f.z.toFixed(1))}
      </div><p class="note">Drag it to move it: every street through it follows.</p>` : '<p class="note">Part of a ring road or the rooftops: it moves with them.</p>'}
      <div class="row">${f.movable ? '<button id="f-del" class="danger">Remove junction</button>' : ''}</div>
      ${warn}`;
    ins.querySelectorAll('input.num[data-for]').forEach(numberBox);
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
      <div class="grid">${sliderPair('g-line', f.line.axis, f.line.value - 300, f.line.value + 300, 5, ' m', f.line.value)}</div>
      <p class="note">Moves the whole ${f.dir === 'h' ? 'row' : 'column'} of streets it's on.</p>
      <div class="row"><button id="f-del" class="danger">Delete this piece</button></div>
      ${warn}`;
    ins.querySelectorAll('input.num[data-for]').forEach(numberBox);
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

// The object being placed as its district draws it, see-through: its ghost,
// built once each ({ view, px, pz: its middle, ground: the ground under it
// there, drop: how far its bottom is up off that ground, which placing takes
// away so it sits on what's under it }); null if it draws nothing on its own.
const ghostModels = new Map();
// Objects sunk in their own district (the Spire's plaza, flush with its ground;
// the Low Road's portal in its cut; the Culvert in the drain): a copy stands on what's under it.
const SUNK = new Set(['plaza', 'portal', 'culvert', 'cantilever', 'pad']);
const guestMaps = new Map();
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x05d9e8, transparent: true, opacity: 0.3, depthWrite: false, fog: false, side: THREE.DoubleSide });
function ghostModel(from, set) {
  if (ghostModels.session !== session) {
    ghostModels.clear();
    ghostModels.session = session;
  }
  const own = typeof from === 'string';
  // (set: a copy's own settings; else what a new one starts as.)
  const id = (own ? from : `${from.district}:${from.from}`) + (set ? `|${JSON.stringify(set)}` : '');
  if (ghostModels.has(id)) return ghostModels.get(id);
  let model = null;
  try {
    const item = own ? session.base.get(from) : from.item;
    if (!own && !guestMaps.has(from.district)) guestMaps.set(from.district, districtMap(DISTRICTS.find((d) => d.id === from.district).city));
    const map = own ? session.map : guestMaps.get(from.district);
    const v = districtViewOf(map, tex, { only: [{ ...withSet(item, set ?? placeDefaults(item)), copy: true }] });
    v.traverse((o) => {
      if (o.isMesh && o.material?.blending !== THREE.AdditiveBlending) o.material = ghostMat;
      else if (o !== v && !o.isGroup) o.visible = false;
    });
    const box = shownBox(v);
    const [px, pz] = itemCentre(item);
    const ground = own ? H(px, pz) : from.ground ?? 0;
    const bottom = box.isEmpty() ? 0 : box.min.y - ground;
    // (What stood sunk in its district's ground, in a cut or a ditch, comes up out of it.)
    if (!box.isEmpty()) model = { view: v, px, pz, ground, drop: bottom > 0.5 || (SUNK.has(item.t) && bottom < 0) ? bottom : 0 };
  } catch (err) {
    console.warn('ghost', id, err);
  }
  ghostModels.set(id, model);
  return model;
}
// What a view shows, as a box: its visible meshes, and of an instanced one
// only the instances drawn (a view's hidden ones, its breakables' pieces
// waiting to fly, stand at its origin at no size).
function shownBox(root) {
  const box = new THREE.Box3();
  const b = new THREE.Box3();
  const m = new THREE.Matrix4();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry?.attributes.position) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    if (!o.isInstancedMesh) return box.union(b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
    for (let k = 0; k < o.count; k++) {
      o.getMatrixAt(k, m);
      if (Math.abs(m.determinant()) < 1e-9) continue;
      box.union(b.copy(o.geometry.boundingBox).applyMatrix4(m.premultiply(o.matrixWorld)));
    }
  });
  return box;
}

const placingDrop = () => (placing ? ghostModel(placing.from, ghostSet(placing))?.drop || 0 : 0);

// What a copy starts as (its settings): a speed hump a road wide; a solar
// panel, a wall, a sea wall or a railing short (as in a run, one piece).
function placeDefaults(src) {
  if (!src) return null;
  if (src.t === 'hump') return { len: 12 };
  const side = longSide(src);
  const short = src.t === 'panel' || ['wall', 'seawall', 'railing', 'barrier'].includes(modelOf({ id: src.t, t: src.t }));
  return short && side?.len > 10 ? { len: 8 } : null;
}
// How far a copy's turned so it comes in square to the map (its nearest
// quarter turn), however its original stands: by its box, its ramp, its ends,
// its line or its own heading.
function squareTurn(src) {
  if (!src) return 0;
  const end = (p) => [p[0], p.length > 2 ? p[2] : p[1]];
  let yaw = 0;
  if (src.obb) yaw = src.obb.yaw || 0;
  else if (src.ramp) yaw = Math.atan2(src.ramp.dirX, src.ramp.dirZ);
  else if (Array.isArray(src.a) && Array.isArray(src.b)) {
    const [a, b] = [end(src.a), end(src.b)];
    yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
  } else if (src.pts?.length > 1) {
    const [a, b] = [end(src.pts[0]), end(src.pts[src.pts.length - 1])];
    yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
  } else if (typeof src.dx === 'number' && typeof src.dz === 'number') yaw = Math.atan2(src.dx, src.dz);
  else if (typeof src.yaw === 'number') yaw = src.yaw;
  const q = Math.PI / 2;
  return Math.round(yaw / q) * q - yaw;
}

const placingSourceOf = (from) => (typeof from === 'string' ? session.base.get(from) : from.item);
const placingDefaults = () => (placing ? (placing.copied ? placing.copied.set : placeDefaults(placingSourceOf(placing.from))) : null);
// A copy's ghost as it was (its settings, and its length if a run made it one); undefined: as new.
const ghostSet = (entry) => (entry?.copied ? { ...entry.copied.set, ...(entry.copied.len ? { len: entry.copied.len } : {}) } : undefined);

// Copies along a line from a to b, turned to run along it.
function linePoses(a, b) {
  const { pts, yaw } = linePoints(a, b, spacing());
  const fb = footBox(placingSource().src);
  return pts.slice(0, 300).map(([x, z]) => [x, z, yaw - fb.yaw + placeYaw]);
}

function placeLine(a, b) {
  const ids = session.addMany(placing.from, linePoses(a, b), -placingDrop(), placingDefaults());
  lineFrom = null;
  selected = ids[ids.length - 1] || null;
  changed();
}

// --- Fences and walls in a run (sdk/runs.js) ----------------------------------------
// Placing In a run: click post after post, as a road's points; the run bends
// at each post, and each stretch between is filled with the object, made to fit.

const runMode = () => !!placing && $('place-mode').value === 'run' && runnable(placingSource().src);

// Where a post at g goes: on the first post (closing the run), or in 15° steps
// from the last and a whole grid step on (Alt, or snapping off: anywhere).
function runSnap(g, e) {
  if (runPts.length >= 3 && Math.hypot(runPts[0][0] - g.x, runPts[0][1] - g.z) < grabR(g.x, g.z)) return { p: runPts[0], close: true };
  const last = runPts[runPts.length - 1];
  if (!last) return { p: [snap(g.x, e), snap(g.z, e)] };
  let a = Math.atan2(g.x - last[0], g.z - last[1]);
  let L = Math.hypot(g.x - last[0], g.z - last[1]);
  if (!e?.altKey && $('snap-turn').checked) a = Math.round(a / turnStep()) * turnStep();
  if (snapping(e)) L = Math.max(gridSize(), Math.round(L / gridSize()) * gridSize());
  const r2 = (v) => Math.round(v * 100) / 100;
  return { p: [r2(last[0] + Math.sin(a) * L), r2(last[1] + Math.cos(a) * L)] };
}

function runClick(g, e) {
  const s = runSnap(g, e);
  if (s.close) return buildRun(true);
  if (e.detail >= 2 && runPts.length >= 2) return buildRun();
  const last = runPts[runPts.length - 1];
  if (last && Math.hypot(s.p[0] - last[0], s.p[1] - last[1]) < 0.3) return;
  runPts.push(s.p);
  runHover = null;
  showOverlay();
  hint();
}

// The run built: every piece, as one step to undo. Placing goes on (Esc stops).
function buildRun(closed = false) {
  if (runPts.length < 2) return toast('Place at least two posts first.');
  const pieces = runPieces(placingSource().src, runPts, closed && runPts.length >= 3);
  if (pieces.length > 800) return toast('That run is too long for one go: build it in parts.');
  runPts = [];
  runHover = null;
  if (pieces.length) {
    const ids = session.addMany(placing.from, pieces.map((p) => [p.x, p.z, p.yaw, p.len]), -placingDrop());
    selected = ids[ids.length - 1] || null;
    changed();
  }
  showOverlay();
  hint();
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
    // (Its numbers: sliders with their number boxes, each between its sensible ends.)
    const RANGE = { 'ev-cars': [2, 8, ''], 'ev-purse': [0, 20000, ' $'], 'ev-laps': [1, 10, ''], 'ev-finish': [100, 2000, ' m'], 'ev-time': [30, 600, ' s'] };
    const field = (id, label, value, type = 'number', step = 1) => (type === 'number' && RANGE[id] ? sliderPair(id, label, Math.min(RANGE[id][0], Number(value)), Math.max(RANGE[id][1], Number(value)), step, RANGE[id][2], value) : `<label for="${id}">${label}</label><input id="${id}" type="${type}" step="${step}" value="${esc(value ?? '')}" />`);
    html += `
      <h3>${evKey && savedEvent(evKey) ? 'Editing' : 'New'}: ${esc(TYPES[d.type] || d.type)}</h3>
      <div class="grid">
        ${field('ev-name', 'name', d.name, 'text')}
        ${field('ev-cars', 'cars', d.cars)}
        ${CREATOR ? '' : field('ev-purse', 'purse ($)', d.purse, 'number', 50)}
        ${d.type === 'circuit' ? field('ev-laps', 'laps', d.laps) : ''}
        ${d.type === 'drag' ? field('ev-finish', 'length (m)', d.finishS ?? 414, 'number', 10) : ''}
        ${d.type === 'arena' ? `<label for="ev-mode">mode</label><select id="ev-mode">${Object.entries(MODES).map(([k, n]) => `<option value="${k}"${d.mode === k ? ' selected' : ''}>${n}</option>`).join('')}</select>${field('ev-time', 'time (s)', d.timeLimit, 'number', 10)}<label for="ev-site">ground</label><select id="ev-site">${arenaSites(session).map((a) => `<option value="${a.site}"${r.site === a.site ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select>` : ''}
        ${d.type === 'arena' ? '' : `<label for="ev-barrier">barriers</label><select id="ev-barrier" title="How the race's barriers look">${Object.entries(BARRIER_STYLES).map(([k, n]) => `<option value="${k}"${(d.barrierStyle || '') === k ? ' selected' : ''}>${n}</option>`).join('')}</select>`}
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
        <div class="row"><button id="ev-reverse" title="Race it the other way round"${r.path.length < 2 ? ' disabled' : ''}>⇄ Swap direction</button><button id="ev-clear">Clear route</button></div>
        <h4>Shortcuts</h4>
        <div class="row"><button id="ev-cut" class="${evStage === 'cut' ? 'on' : ''}" title="Click on the route where it leaves, then where it goes, then back on the route further on"${r.path.length < 2 ? ' disabled' : ''}>✂ Draw shortcut</button></div>
        <div class="chips">${(r.shortcuts || []).map((c, k) => `<span class="chip">${esc(typeof c === 'string' ? `Shortcut: ${c}` : `Shortcut ${k + 1}`)}<b data-cut-drop="${k}" title="Take it out">×</b></span>`).join('') || '<span class="note">None.</span>'}</div>` : ''}
      ${r.kind === 'drag' ? `<div class="row"><button id="ev-start" class="${evStage === 'start' ? 'on' : ''}" title="Then click the start on a street">⚑ Place start</button><button id="ev-reverse" title="Race it the other way down the street"${r.along && r.to !== null && r.to !== undefined ? '' : ' disabled'}>⇄ Swap direction</button><button id="ev-clear">Clear route</button></div>
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
  if ($('ev-barrier')) {
    if ($('ev-barrier').value) d.barrierStyle = $('ev-barrier').value;
    else delete d.barrierStyle;
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
  panel.querySelectorAll('input.num[data-for]').forEach(numberBox);
  panel.querySelectorAll('[data-drop]').forEach((el) =>
    el.addEventListener('click', () => {
      evDraft.route.path.splice(Number(el.dataset.drop), 1);
      renderEvents();
      previewEvent();
    }));
  panel.querySelectorAll('[data-cut-drop]').forEach((el) =>
    el.addEventListener('click', () => {
      evDraft.route.shortcuts.splice(Number(el.dataset.cutDrop), 1);
      if (!evDraft.route.shortcuts.length) delete evDraft.route.shortcuts;
      renderEvents();
      previewEvent();
    }));
  $('ev-cut')?.addEventListener('click', () => {
    if (evStage === 'cut') return stopCut();
    if (!evPreview?.pts) return toast('The route has to be set up first.');
    evStage = 'cut';
    evCut = [];
    evSel = null;
    renderEvents();
    hint();
    drawEventMarks();
  });
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
  $('ev-reverse')?.addEventListener('click', reverseRoute);
  $('ev-clear')?.addEventListener('click', () => {
    evStage = null;
    evSel = null;
    evCut = null;
    if (evDraft.route.kind === 'drag') Object.assign(evDraft.route, { along: '', from: [0, 0], to: null });
    else {
      // (Its shortcuts went from it and back onto it: they go too.)
      evDraft.route.path = [];
      delete evDraft.route.shortcuts;
    }
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

// --- Selecting several things --------------------------------------------------------
// As in Windows: drag a box from empty ground round them, or Ctrl+click them one
// by one (Ctrl+drag: a box added). Several selected move together (drag any of
// them), turn together round their middle (the ring, Q/E, the wheel while
// dragging), nudge, delete and copy together; the right bar has nothing for them.

const sameThing = (a, b) => (a.key ? a.key === b.key : a.gadget === b.gadget);
// What's selected, as things that move: several, or the one object or gadget.
function selection() {
  if (group.length) return group;
  if (selected && canMove(session.item(selected))) return [{ key: selected }];
  return feature?.type === 'gadget' ? [{ gadget: feature.id }] : [];
}
function setSelection(list) {
  if (list.length > 1) {
    group = list;
    selected = null;
    feature = null;
    refresh();
    showOverlay();
    return;
  }
  if (!list.length) return select(null);
  if (list[0].key) return select(list[0].key);
  selectFeature(gadgetFeature(list[0].gadget));
}
// Ctrl+click: in, or out.
function toggleThing(t) {
  const now = selection();
  setSelection(now.some((q) => sameThing(q, t)) ? now.filter((q) => !sameThing(q, t)) : [...now, t]);
}
// Where a thing stands and how it's turned (an object: its turn from how it was placed).
function poseOf(t) {
  if (t.key) return session.pose(t.key);
  const g = session.gadgets().find((q) => q.id === t.gadget);
  return { x: g.x, z: g.z, yaw: g.yaw || 0, type: g.type };
}
function middleOfThings(list) {
  let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const { p } of list) [x0, x1, z0, z1] = [Math.min(x0, p.x), Math.max(x1, p.x), Math.min(z0, p.z), Math.max(z1, p.z)];
  return [(x0 + x1) / 2, (z0 + z1) / 2];
}
// The group as it is, ready to move: each with its pose; its middle.
function groupMove(extra = {}) {
  const members = group.map((t) => ({ ...t, p: poseOf(t) }));
  const [cx, cz] = middleOfThings(members);
  return { group: members, cx, cz, dx: 0, dz: 0, yaw: 0, yaw0: 0, ...extra };
}
// Where each goes: turned (yaw - yaw0) round the middle, then moved (dx, dz).
function groupMoves(d) {
  const a = d.yaw - d.yaw0;
  const [c, sn] = [Math.cos(a), Math.sin(a)];
  return d.group.map((m) => {
    const [u, v] = [m.p.x - d.cx, m.p.z - d.cz];
    const turns = !(m.gadget && NO_TURN.has(m.p.type));
    return { ...(m.key ? { key: m.key } : { gadget: m.gadget }), x: d.cx + u * c + v * sn + d.dx, z: d.cz - u * sn + v * c + d.dz, yaw: m.p.yaw + (turns ? a : 0) };
  });
}
function applyGroup(d) {
  const moves = groupMoves(d);
  if (session.moveMany(moves)) changed(moves.some((m) => m.key));
  else showOverlay();
}
// Everything whose middle is in the box dragged on the screen (objects that move, gadgets).
const MAX_BOXED = 1500;
function boxSelect(d) {
  const r = canvas.getBoundingClientRect();
  const [x0, x1, y0, y1] = [Math.min(d.sx, d.x2), Math.max(d.sx, d.x2), Math.min(d.sy, d.y2), Math.max(d.sy, d.y2)];
  const v = new THREE.Vector3();
  const inBox = (x, y, z) => {
    v.set(x, y, z).project(camera);
    if (v.z > 1 || v.z < -1) return false;
    const [px, py] = [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
    return px >= x0 && px <= x1 && py >= y0 && py <= y1;
  };
  const found = [];
  for (const it of session.layout.items) {
    if (it.hidden || !canMove(it) || GROUND.has(it.t)) continue;
    const fb = footBox(it);
    const { y0, h } = session.heightOf(it);
    if (inBox(fb.x, y0 + h / 2, fb.z)) found.push({ key: it.key });
  }
  for (const g of session.gadgets()) if (inBox(g.x, H(g.x, g.z) + 1, g.z)) found.push({ gadget: g.id });
  if (found.length > MAX_BOXED) {
    toast(`${found.length} things in that box: the first ${MAX_BOXED} are selected.`);
    found.length = MAX_BOXED;
  }
  const base = d.add ? selection() : [];
  setSelection([...base, ...found.filter((t) => !base.some((q) => sameThing(q, t)))]);
}
// The box being dragged, on the screen.
const marquee = document.createElement('div');
marquee.style.cssText = 'position:fixed;display:none;border:1px dashed #05d9e8;background:rgba(5,217,232,0.08);pointer-events:none;z-index:5';
document.body.append(marquee);
function showMarquee(d) {
  if (!d) return (marquee.style.display = 'none');
  Object.assign(marquee.style, { display: 'block', left: `${Math.min(d.sx, d.x2)}px`, top: `${Math.min(d.sy, d.y2)}px`, width: `${Math.abs(d.x2 - d.sx)}px`, height: `${Math.abs(d.y2 - d.sy)}px` });
}

function select(key) {
  selected = key;
  feature = null;
  group = [];
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
  } else if (placing || placingGadget || pasting) {
    placeYaw = snapTurn(placeYaw + d, fine);
    showOverlay();
  } else if (group.length) {
    applyGroup(groupMove({ yaw: d }));
  } else if (feature?.type === 'gadget') {
    const g = session.gadgets().find((q) => q.id === feature.id);
    if (g && session.setGadget(g.id, { yaw: snapTurn((g.yaw || 0) + d, fine) })) changed(false);
  } else if (selected && canMove(session.item(selected))) {
    const p = session.pose(selected);
    if (session.place(selected, p.x, p.z, snapTurn(p.yaw + d, fine))) changed();
  }
}

// How far the arrows nudge: Nudge (the move grid, or metres) and, with Shift,
// Fine; set in Controls, kept in this browser.
const NUDGE_STORE = 'tt-sdk:nudge';
const NUDGE_STEPS = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16];
let nudgeAmounts = { step: 'grid', fine: 0.1 };
try {
  nudgeAmounts = { ...nudgeAmounts, ...JSON.parse(localStorage.getItem(NUDGE_STORE) || '{}') };
} catch {
  // (The defaults.)
}
const nudgeStep = (fine) => (fine ? Number(nudgeAmounts.fine) || 0.1 : nudgeAmounts.step === 'grid' ? gridSize() : Number(nudgeAmounts.step) || gridSize());

// The selection nudged: objects (several together), a gadget (a light, a drop,
// a ramp, a sign...), or a junction.
function nudge(dx, dz) {
  if (group.length) return applyGroup(groupMove({ dx, dz }));
  if (!selected && feature?.type === 'gadget') {
    const g = session.gadgets().find((q) => q.id === feature.id);
    if (!g) return;
    const [x, z] = [Math.round((g.x + dx) * 100) / 100, Math.round((g.z + dz) * 100) / 100];
    if (session.setGadget(g.id, { x, z, up: session.topAt(x, z) })) changed(false);
    feature = gadgetFeature(g.id);
    return showOverlay();
  }
  if (!selected && feature?.type === 'node' && feature.movable) {
    const [x, z] = [feature.x + dx, feature.z + dz];
    const name = feature.name;
    return editFeature('Moving the junction…', () => ({ plan: moveNode(session, name, x, z) }), [x, z], () => nodeProblem(session, name));
  }
  if (!selected || !canMove(session.item(selected))) return;
  const p = session.pose(selected);
  if (session.place(selected, p.x + dx, p.z + dz, p.yaw)) changed();
}

function removeSelected() {
  if (group.length) {
    if (session.removeMany(group)) {
      const objects = group.some((t) => t.key);
      group = [];
      changed(objects);
    }
    return;
  }
  if (feature) return deleteFeature();
  if (selected && session.remove(selected)) {
    selected = null;
    changed();
  }
}

function duplicate() {
  // (Several, or a gadget on its own.)
  if (group.length || (!selected && feature?.type === 'gadget')) {
    const list = group.length ? group : selection();
    // (What's locked can be moved and deleted, not copied: left out.)
    const open = list.filter((t) => !t.key || !lockOf(specialOfType(session.item(t.key).t)));
    if (open.length < list.length) toast('Some of them are locked: those can be moved or deleted, but not copied yet.');
    const copies = session.duplicateMany(open, gridSize() * 4);
    if (copies.length) {
      changed(copies.some((t) => t.key));
      setSelection(copies);
    }
    return;
  }
  if (!selected || !canMove(session.item(selected))) return;
  const lock = lockOf(specialOfType(session.item(selected).t));
  if (lock) return toast(`Locked: it can be moved or deleted, but not copied yet. To unlock it: ${lock}.`);
  selected = session.duplicate(selected, gridSize() * 4);
  changed();
}

// --- Copy and paste, and the right-click menu ------------------------------------------
// Copy (Ctrl+C, or Copy on the menu) takes what's selected and starts placing
// it, as if it were picked in the Objects list: its ghost under the cursor, a
// click places one (as many as you like), Space or Esc stops. Paste (Ctrl+V)
// places what was copied last, again. One object comes as it is (its style,
// settings, length and turn); a gadget with its settings; several together, as
// they stood, turned together (the wheel, Q/E).

// The clipboard: { things: [{ from, dx, dz, yaw, dy, len, set } | { gadget: its settings, dx, dz, yaw }] },
// each from the middle of them all.
let clip = null;
let rmb = null; // the right button pressed: where, when, how far the mouse has gone since (a click opens the menu)

function copySelection(at = null, cut = false) {
  const list = selection();
  if (!list.length) return toast(`Select something to ${cut ? 'cut' : 'copy'}: click it, or drag a box round several.`);
  // (What's locked can be moved and deleted, not copied: left out.)
  const open = list.filter((t) => !t.key || !lockOf(specialOfType(session.item(t.key).t)));
  if (open.length < list.length) toast(open.length ? 'Some of them are locked: those can be moved or deleted, but not copied yet.' : 'Locked: it can be moved or deleted, but not copied yet.');
  if (!open.length) return;
  const members = open.map((t) => ({ ...t, p: poseOf(t) }));
  const [cx, cz] = middleOfThings(members);
  clip = {
    things: members.map(({ key, gadget, p }) => {
      if (gadget) {
        const { id: _id, x, z, ...g } = structuredClone(session.gadgets().find((q) => q.id === gadget));
        return { gadget: g, dx: x - cx, dz: z - cz, yaw: g.yaw || 0 };
      }
      return { from: session.source(key), dx: p.x - cx, dz: p.z - cz, yaw: p.yaw, dy: p.dy || 0, len: session.addOf(key)?.len || 0, set: session.settingsOf(key) };
    }),
  };
  // (Cut (Ctrl+X): copied, then taken off the map; placing them puts them back somewhere.)
  if (cut && session.removeMany(open)) {
    selected = feature = null;
    group = [];
    changed(open.some((t) => t.key));
  }
  paste(at);
}

// Places what was copied (at: where its ghost starts, else under the cursor).
function paste(at = null) {
  if (!clip) return toast('Nothing copied yet: select something, then Ctrl+C (or right-click it: Copy).');
  if (tool !== 'select') setTool('select');
  placing = placingModel = pasting = null;
  placingGadget = placingPreset = null;
  linking = null;
  lineFrom = null;
  runPts = [];
  ghostAt = at;
  const one = clip.things.length === 1 ? clip.things[0] : null;
  if (!one) {
    pasting = clip;
    placeYaw = 0;
  } else if (one.gadget) {
    // (A gadget: as if picked in the list, with its own settings and turn.)
    const { type, yaw, up: _up, ...set } = one.gadget;
    placingGadget = type;
    placingPreset = set;
    placeYaw = yaw || 0;
  } else {
    // (An object: as if picked in the list, and shown picked there, but as it was.)
    const src = placingSourceOf(one.from);
    const found = listedAs(src, one.from);
    placingModel = found?.model || null;
    placing = { ...(found?.style || {}), name: found?.style?.name || nameOf(src), from: one.from, copied: { set: one.set, len: one.len } };
    placeYaw = one.yaw;
  }
  renderCatalogue();
  showOverlay();
  hint();
}

// The Objects list's model and style an object is (this map's own, or another
// district's), or null if it isn't listed.
function listedAs(src, from) {
  const district = typeof from === 'string' ? null : from.district;
  for (const m of modelList.values()) {
    const style = m.styles.find((e) => e.t === src.t && (e.kind || null) === (src.kind || null) && (e.district || null) === district);
    if (style) return { model: m, style };
  }
  return null;
}

// Where each of several pasted together goes, at (their middle there), turned placeYaw together.
function pastePoses(at) {
  const [c, sn] = [Math.cos(placeYaw), Math.sin(placeYaw)];
  return pasting.things.map((t) => {
    const turns = !(t.gadget && NO_TURN.has(t.gadget.type));
    return { ...t, x: at.x + t.dx * c + t.dz * sn, z: at.z - t.dx * sn + t.dz * c, yaw: t.yaw + (turns ? placeYaw : 0) };
  });
}

// Their ghosts, each as it was (its height off the ground too).
function pasteGhosts() {
  for (const p of pastePoses(ghostAt)) {
    if (p.gadget) {
      gadgetGhost({ ...p.gadget, x: p.x, z: p.z, yaw: p.yaw });
      continue;
    }
    const y = H(p.x, p.z) + (p.dy || 0);
    const model = ghostModel(p.from, { ...p.set, ...(p.len ? { len: p.len } : {}) });
    if (!model) {
      const src = placingSourceOf(p.from);
      const fb = footBox(src);
      box({ x: p.x, z: p.z, w: fb.w, d: fb.d, yaw: fb.yaw + p.yaw }, y, src.h || 2, 0x05d9e8, 0.25);
      continue;
    }
    const g = model.view.clone();
    g.matrixAutoUpdate = false;
    g.matrix.makeTranslation(-model.px, 0, -model.pz).premultiply(new THREE.Matrix4().makeRotationY(p.yaw)).premultiply(new THREE.Matrix4().makeTranslation(p.x, y - model.ground, p.z));
    ghostLayer.add(g);
  }
}

// The right-click menu: a right-click (not held to look round) on something
// selects it (if it wasn't already), then offers what can be done.
const menu = document.createElement('div');
menu.id = 'ctx-menu';
menu.hidden = true;
document.body.append(menu);
let menuAt = null; // the ground where the menu was opened (Paste puts the ghost there)

function openMenu(x, y, fromList = false) {
  if (!session) return;
  setRay({ clientX: x, clientY: y });
  if (!fromList && tool === 'select' && !placing && !placingGadget && !pasting) {
    const gp = groundHit();
    const gid = gp ? gadgetAt(gp.x, gp.z) : null;
    const hit = gid ? null : meshHit();
    const key = hit ? session.pick(hit.x, hit.z, hit.y) : null;
    const thing = gid ? { gadget: gid } : key && canMove(session.item(key)) ? { key } : null;
    if (thing && !selection().some((q) => sameThing(q, thing))) setSelection([thing]);
  }
  const g = fromList ? null : groundHit();
  menuAt = g ? { x: snap(g.x), z: snap(g.z), y: null } : null;
  const has = selection().length > 0;
  const rows = [
    ['copy', 'Copy', 'Ctrl+C', has],
    ['cut', 'Cut', 'Ctrl+X', has],
    ['paste', 'Paste', 'Ctrl+V', !!clip],
    null,
    ['duplicate', 'Duplicate', 'Ctrl+D', has],
    ['focus', 'Look at it', 'F', has || !!feature],
    ['delete', 'Delete', keyName(binding.delete[0]), has || !!feature],
  ];
  menu.innerHTML = rows.map((r) => (r ? `<button data-act="${r[0]}"${r[3] ? '' : ' disabled'}><span>${r[1]}</span><kbd>${esc(r[2])}</kbd></button>` : '<hr />')).join('');
  menu.hidden = false;
  // (Kept on the screen.)
  const b = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, innerWidth - b.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, innerHeight - b.height - 4))}px`;
}

function closeMenu() {
  menu.hidden = true;
}

menu.addEventListener('contextmenu', (e) => e.preventDefault());
menu.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b || b.disabled) return;
  closeMenu();
  if (b.dataset.act === 'copy') copySelection(menuAt);
  else if (b.dataset.act === 'cut') copySelection(menuAt, true);
  else if (b.dataset.act === 'paste') paste(menuAt);
  else if (b.dataset.act === 'focus') focus();
  else if (b.dataset.act === 'duplicate') duplicate();
  else removeSelected();
});
// (A click anywhere else closes it; a left click on the map does only that.)
window.addEventListener('mousedown', (e) => {
  if (menu.hidden || menu.contains(e.target)) return;
  closeMenu();
  if (e.button === 0 && e.target === canvas) {
    e.stopPropagation();
    e.preventDefault();
  }
}, true);

// --- On this map: the right bar's list -----------------------------------------------
// Everything on the map, by name (objects and gadgets), under what's selected.
// As in Windows Explorer: a click selects one (and looks at it), Ctrl+click adds
// or takes one out, Shift+click selects everything from the last one clicked;
// ↑ ↓ (Shift: several), Ctrl+A everything listed. Right-click: the menu (copy,
// cut, paste, duplicate, delete), as on the map. Only the rows in sight are
// drawn (a district has thousands).

const ROW_H = 20;
const LIST_H = 'tt-sdk:list-height';
const listBox = $('obj-list');
const listRowsEl = $('obj-list-rows');
const collate = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;
const thingId = (t) => (t.key ? `k${t.key}` : `g${t.gadget}`);
let listRows = []; // [{ id, thing, name, tag }], as listed (searched, sorted)
let listMade = null; // (what they were made from: made again when it changes)
let listAnchor = null; // the row a Shift+click (or Shift+arrow) runs from: its id
let listCursor = null; // the row clicked or moved to last: its id
let listShown = ''; // (the selection last shown: a new one is scrolled into sight)

const gadgetLabel = (g) => (g.type === 'light' ? LIGHT_FIXTURES[g.fixture || GADGETS.light.fixture] || GADGETS.light.name : GADGETS[g.type].name);

function makeList() {
  const q = $('list-search').value.trim().toLowerCase();
  const made = [session, session.layout, q, cat.length, others.length];
  if (listMade && made.every((v, i) => v === listMade[i])) return;
  listMade = made;
  const names = new Map();
  const name = (it) => {
    const k = `${it.t}|${it.kind || ''}|${it.guest || ''}`;
    if (!names.has(k)) names.set(k, nameOf(it));
    return names.get(k);
  };
  const rows = [];
  for (const it of session.layout.items) {
    if (it.hidden || GROUND.has(it.t)) continue;
    rows.push({ id: `k${it.key}`, thing: { key: it.key }, name: name(it), tag: it.key.startsWith('+') ? 'added' : '' });
  }
  for (const g of session.gadgets()) rows.push({ id: `g${g.id}`, thing: { gadget: g.id }, name: gadgetLabel(g), tag: `gadget ${g.id}` });
  listRows = (q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.tag.includes(q) || r.id.slice(1).toLowerCase().includes(q)) : rows).sort((a, b) => collate(a.name, b.name) || collate(a.id, b.id));
}

// (After every refresh: what's on the map, and what's selected.)
function showList() {
  if (!session) {
    listRows = [];
    listMade = null;
    $('list-count').textContent = '';
    listRowsEl.innerHTML = '';
    return;
  }
  makeList();
  const sel = selection();
  $('list-count').textContent = `${listRows.length}${$('list-search').value.trim() ? ' found' : ''}${sel.length > 1 ? ` · ${sel.length} selected` : ''}`;
  const shown = sel.map(thingId).join(' ');
  if (shown !== listShown) {
    listShown = shown;
    if (sel.length === 1) {
      const i = listRows.findIndex((r) => r.id === shown);
      if (i >= 0) {
        listCursor = listRows[i].id;
        listReveal(i);
      }
    }
  }
  drawList();
}

function drawList() {
  if (!session) return;
  const sel = new Set(selection().map(thingId));
  if (!listRows.length) {
    listRowsEl.style.height = '';
    listRowsEl.innerHTML = `<div class="empty">${$('list-search').value.trim() ? 'Nothing on this map by that name.' : 'Nothing on this map yet.'}</div>`;
    return;
  }
  listRowsEl.style.height = `${listRows.length * ROW_H}px`;
  const first = Math.max(0, Math.floor(listBox.scrollTop / ROW_H) - 5);
  const last = Math.min(listRows.length, Math.ceil((listBox.scrollTop + listBox.clientHeight) / ROW_H) + 5);
  let html = '';
  for (let i = first; i < last; i++) {
    const r = listRows[i];
    html += `<div class="lrow${sel.has(r.id) ? ' sel' : ''}${r.id === listCursor && document.activeElement === listBox ? ' anchor' : ''}" data-i="${i}" style="top:${i * ROW_H}px" title="${esc(r.name)}"><span>${esc(r.name)}</span>${r.tag ? `<small>${esc(r.tag)}</small>` : ''}</div>`;
  }
  listRowsEl.innerHTML = html;
}

// (A row brought into sight, if it's out of it.)
function listReveal(i) {
  const top = i * ROW_H;
  if (top < listBox.scrollTop) listBox.scrollTop = top;
  else if (top + ROW_H > listBox.scrollTop + listBox.clientHeight) listBox.scrollTop = top + ROW_H - listBox.clientHeight;
}

// Selected from the list: placing stops, and it's the Select tool's.
function listSelect(list) {
  if (placing || placingGadget || pasting) stopPlacing();
  if (tool !== 'select') setTool('select');
  setSelection(list);
}

function listClick(r, e) {
  const ctrl = e.ctrlKey || e.metaKey;
  const a = e.shiftKey ? listRows.findIndex((q) => q.id === listAnchor) : -1;
  listCursor = r.id;
  if (a >= 0) {
    const b = listRows.indexOf(r);
    const range = listRows.slice(Math.min(a, b), Math.max(a, b) + 1).map((q) => q.thing);
    const keep = ctrl ? selection().filter((t) => !range.some((q) => sameThing(q, t))) : [];
    return listSelect([...keep, ...range]);
  }
  listAnchor = r.id;
  if (ctrl) {
    if (placing || placingGadget || pasting) stopPlacing();
    return toggleThing(r.thing);
  }
  listSelect([r.thing]);
  focus();
}

listBox.addEventListener('scroll', () => drawList());
listBox.addEventListener('focus', () => drawList());
listBox.addEventListener('blur', () => drawList());
listBox.addEventListener('mousedown', (e) => {
  const row = e.target.closest('.lrow');
  if (!session || e.button !== 0) return;
  e.preventDefault(); // (no text selected; the list takes the keys)
  listBox.focus({ preventScroll: true });
  if (row) listClick(listRows[+row.dataset.i], e);
});
listBox.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (!session) return;
  const r = listRows[+e.target.closest('.lrow')?.dataset.i];
  listBox.focus({ preventScroll: true });
  if (r && !selection().some((t) => sameThing(t, r.thing))) {
    listAnchor = listCursor = r.id;
    listSelect([r.thing]);
  }
  openMenu(e.clientX, e.clientY, true);
});
// (The one under the cursor, outlined on the map.)
listBox.addEventListener('mousemove', (e) => {
  const key = listRows[+e.target.closest('.lrow')?.dataset.i]?.thing.key || null;
  if (session && key !== hovered) {
    hovered = key;
    showOverlay();
  }
});
listBox.addEventListener('mouseleave', () => {
  if (session && hovered) {
    hovered = null;
    showOverlay();
  }
});
// ↑ ↓ Page Up/Down Home End (Shift: from the anchor), Ctrl+A, Enter looks at it.
// (Taken here, before the map's own keys: the arrows don't nudge while the list has them.)
listBox.addEventListener('keydown', (e) => {
  if (!session || !listRows.length) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.code === 'KeyA') {
    e.preventDefault();
    e.stopPropagation();
    return listSelect(listRows.map((r) => r.thing));
  }
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    e.stopPropagation();
    return focus();
  }
  const page = Math.max(1, Math.floor(listBox.clientHeight / ROW_H) - 1);
  const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -page, PageDown: page, Home: -Infinity, End: Infinity }[e.code];
  if (step === undefined || ctrl || e.altKey) return;
  e.preventDefault();
  e.stopPropagation();
  let at = listRows.findIndex((r) => r.id === listCursor);
  if (at < 0) at = step > 0 ? -1 : listRows.length;
  const i = Math.max(0, Math.min(listRows.length - 1, at + step));
  listCursor = listRows[i].id;
  listReveal(i);
  const a = e.shiftKey ? listRows.findIndex((r) => r.id === listAnchor) : -1;
  if (a >= 0) return listSelect(listRows.slice(Math.min(a, i), Math.max(a, i) + 1).map((r) => r.thing));
  listAnchor = listCursor;
  listSelect([listRows[i].thing]);
  focus();
});
// (Clicked elsewhere, but for the menu: the keys are the map's again.)
window.addEventListener('mousedown', (e) => {
  if (document.activeElement === listBox && !listBox.contains(e.target) && !menu.contains(e.target)) listBox.blur();
}, true);

$('list-search').addEventListener('input', () => {
  $('list-search-clear').hidden = !$('list-search').value;
  listBox.scrollTop = 0;
  showList();
});
$('list-search-clear').addEventListener('click', () => {
  $('list-search').value = '';
  $('list-search-clear').hidden = true;
  showList();
  $('list-search').focus();
});

// The split between the selection and the list: dragged (and kept).
try {
  const h = Number(localStorage.getItem(LIST_H));
  if (h > 0) $('scene-list').style.height = `${h}px`;
} catch {
  // (The default, then.)
}
$('list-split').addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  const [box, split] = [$('scene-list'), $('list-split')];
  const [y0, h0] = [e.clientY, box.offsetHeight];
  split.classList.add('on');
  const move = (ev) => {
    box.style.height = `${Math.max(90, Math.min($('right').clientHeight - 80, h0 + y0 - ev.clientY))}px`;
    drawList();
  };
  const up = () => {
    removeEventListener('mousemove', move);
    removeEventListener('mouseup', up);
    split.classList.remove('on');
    try {
      localStorage.setItem(LIST_H, String(box.offsetHeight));
    } catch {
      // (Kept for this session only.)
    }
  };
  addEventListener('mousemove', move);
  addEventListener('mouseup', up);
});
addEventListener('resize', () => drawList());

// Done placing objects or gadgets (Space, or Esc): what was placed last stays selected.
function stopPlacing() {
  placing = null;
  ghostAt = null;
  lineFrom = null;
  runPts = [];
  placingGadget = placingPreset = null;
  pasting = null;
  renderCatalogue();
  showOverlay();
  hint();
}

function placeEntry(entry, g, e, dropped) {
  // (Where the ghost is: on the ground or on top of something; its bottom there.)
  const at = !dropped && ghostAt ? ghostAt : { x: snap(g.x, e), z: snap(g.z, e), y: null };
  const up = at.y === null || at.y === undefined ? 0 : at.y - H(at.x, at.z);
  // (A copy (Copy, Paste): as it was, its settings, length and turn; else as the list has it.)
  const c = entry.copied;
  const src = placingSourceOf(entry.from);
  const key = session.addMany(entry.from, [[at.x, at.z, placeYaw + (c ? 0 : squareTurn(src)), c?.len || 0]], up - (ghostModel(entry.from, ghostSet(entry))?.drop || 0), c ? c.set : placeDefaults(src))[0];
  selected = key;
  // (Clicked: it keeps placing, more of the same, until Space or Esc; dragged in from the list: just the one.)
  if (dropped) {
    placing = null;
    ghostAt = null;
    renderCatalogue();
  }
  changed();
}

// (The selected object; or a light, drop, gadget, junction or site.)
function focus() {
  if (group.length) {
    const d = groupMove();
    const reach = Math.max(10, ...d.group.map((m) => Math.hypot(m.p.x - d.cx, m.p.z - d.cz)));
    cam.pitch = Math.min(cam.pitch, -0.35);
    const fw = forward();
    const dist = Math.max(25, reach * 2.4);
    [cam.x, cam.z, cam.y] = [d.cx - fw.x * dist, d.cz - fw.z * dist, H(d.cx, d.cz) - fw.y * dist];
    return;
  }
  const it = selected && session.item(selected);
  const spot = !it && feature && typeof feature.x === 'number';
  if (!it && !spot) return;
  const fb = it ? footBox(it) : { x: feature.x, z: feature.z, w: 2 * (feature.r || 4), d: 2 * (feature.r || 4) };
  // (Its height as drawn, where it's been drawn: an item's h isn't always one.)
  const tall = it ? session.heightOf(it) : null;
  const h = tall ? tall.h : 4;
  const dist = Math.max(25, Math.max(fb.w, fb.d, h) * 2.2);
  cam.pitch = Math.min(cam.pitch, -0.35);
  const f = forward();
  cam.x = fb.x - f.x * dist;
  cam.z = fb.z - f.z * dist;
  cam.y = (tall ? tall.y0 : H(fb.x, fb.z)) + h / 2 - f.y * dist;
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

const OTHERS_VERSION = 3; // (bump when what an object carries changes)

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
  if (group.length) {
    ins.innerHTML = `<h3>${group.length} selected</h3><p class="note">They move and turn together: drag any of them, or the ring round them.</p>`;
  } else if (feature) featureInspector(ins);
  else if (!it) {
    ins.innerHTML = `<p class="note">Click an object to select it. Drag it to move it.<br><br>Pick an object on the left, then click in the world to place it (or drag it in).</p>`;
  } else {
    const p = session.pose(selected);
    const movable = canMove(it);
    const moved = !selected.startsWith('+') && doc.edits.move[selected];
    // (A copy of a fence or wall: how long it is.)
    const add = session.addOf(selected);
    const own = add && (add.item || session.base.get(add.from));
    const long = own && runnable(own) ? add.len || longSide(own).len : null;
    ins.innerHTML = `
      <h3>${esc(nameOf(it))}</h3>
      <div class="key">${esc(selected.startsWith('+') ? `copy of ${sourceName(session.source(selected))}` : selected)}</div>
      <div class="grid">
        ${sliderPair('in-x', 'x', Math.floor(p.x - 200), Math.ceil(p.x + 200), 0.5, ' m', +p.x.toFixed(1), movable ? '' : 'disabled')}
        ${sliderPair('in-z', 'z', Math.floor(p.z - 200), Math.ceil(p.z + 200), 0.5, ' m', +p.z.toFixed(1), movable ? '' : 'disabled')}
        ${sliderPair('in-turn', 'turn', 0, 359, 1, '°', Math.round(((((p.yaw * 180) / Math.PI) % 360) + 360) % 360), movable ? '' : 'disabled')}
      </div>
      <label>Lift <input type="range" id="in-lift" min="${Math.min(-10, Math.floor(p.dy))}" max="${Math.max(30, Math.ceil(p.dy))}" step="0.25" value="${+p.dy.toFixed(2)}" ${movable ? '' : 'disabled'} /><input class="num" id="in-lift-v" data-for="in-lift" data-unit=" m" inputmode="decimal" /></label>
      ${long ? `<label>Length <input type="range" id="in-len" min="0.5" max="${Math.max(400, Math.ceil(long))}" step="0.5" value="${+long.toFixed(1)}" /><input class="num" id="in-len-v" data-for="in-len" data-unit=" m" inputmode="decimal" /></label>` : ''}
      <div class="row">
        <button id="b-left" title="Turn 15° (Q; Shift+Q: 1°)">⟲ 15°</button>
        <button id="b-right" title="Turn the other way 15° (E; Shift+E: 1°)">⟳ 15°</button>
        <button id="b-dup" ${movable ? '' : 'disabled'} title="Ctrl+D">Duplicate</button>
        <button id="b-focus" title="F">Focus</button>
        ${moved ? '<button id="b-reset">Put back</button>' : ''}
        <button id="b-del" class="danger" title="Delete">Delete</button>
      </div>
      ${optionsHtml(it)}
      ${LINKED[it.t] ? `<p class="note">${esc(LINKED[it.t])}</p>` : ''}`;
    optionsWire(it);
    const read = () => [Number($('in-x').value), Number($('in-z').value), (Number($('in-turn').value) * Math.PI) / 180, Number($('in-lift').value)];
    for (const id of ['in-x', 'in-z', 'in-turn', 'in-lift']) {
      $(id)?.addEventListener('change', () => {
        const [x, z, yaw, dy] = read();
        if ([x, z, yaw, dy].every(Number.isFinite) && session.place(selected, x, z, yaw, dy)) changed();
      });
    }
    if ($('in-len-v')) numberBox($('in-len-v'));
    for (const id of ['in-x', 'in-z', 'in-turn', 'in-lift']) if ($(`${id}-v`)) numberBox($(`${id}-v`));
    $('in-len')?.addEventListener('change', () => {
      const v = Math.min(400, Math.max(0.5, Number($('in-len').value)));
      if (Number.isFinite(v) && session.setLength(selected, Math.abs(v - longSide(own).len) < 0.001 ? null : v)) changed();
      else refresh();
    });
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
  showList();
  hint();
}

// What's being placed, by name (a light by its fixture).
const placingName = () => (placingPreset?.fixture ? LIGHT_FIXTURES[placingPreset.fixture] : GADGETS[placingGadget].name);

function hint() {
  $('hint').textContent = !session
    ? 'Open a built-in district or a .ttmap file to start'
    : linking
      ? `Linking to trigger pad ${linking}: click a lift pad, gate, spinning bar or moving block to link it · Link a gadget again, or Esc, stops`
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
      : tool === 'bridge'
        ? bridgePts.length
          ? 'Bridge: click along its path · double-click, Space or Enter builds it · Backspace takes a point back · Esc stops'
          : 'Bridge: click along its path to draw one (its settings on the left) · click a bridge to select it (Delete removes it) · Ctrl+Z undo'
      : tool === 'lot'
        ? 'Lot: click a block to make it the chosen kind · 1 back to Select · Ctrl+Z undo'
        : tool === 'height'
          ? `Raise / lower: mouse wheel over the ground (or ${keyName(binding.liftUp[0])} / ${keyName(binding.liftDown[0])}), a grid step up or down (hold ${keyName(binding.liftFine[0])}: 25 cm) · hold the right button to zoom and fly · [ ] size · 1 back to Select · Ctrl+Z undo`
          : tool !== 'select'
          ? `${TOOL_NAMES[tool]}: hold the left button and move${ANGLED.has(tool) && Number($('angle').value) ? ' (angled: rising the way you look)' : ''} · [ ] size · 1 back to Select · Ctrl+Z undo`
          : pasting
            ? `Pasting ${pasting.things.length} things together: click where they go (as many times as you like) · wheel or Q/E to turn them · Alt: no snap · Space or Esc to stop`
          : placingGadget
            ? `Placing ${/^[aeiou]/i.test(placingName()) ? 'an' : 'a'} ${placingName().toLowerCase()}: click where each goes${NO_TURN.has(placingGadget) ? '' : ' · wheel or Q/E to turn'} · Space or Esc to stop`
            : runMode()
            ? `Placing ${placing.name} in a run: click each post (15° steps; Alt: any angle) · click the first post to close it · Space, Enter or double-click builds it · Backspace takes a post back · Esc ${runPts.length ? 'starts again' : 'stops'}`
            : placing && $('place-mode').value === 'line'
            ? `Placing ${placing.name} along a line: click ${lineFrom ? 'where it ends' : 'where it starts'} · wheel or Q/E to turn · Space or Esc to stop`
            : placing && $('place-mode').value === 'scatter'
              ? `Scattering ${placing.name}: hold the left button and brush (spacing sets how far apart) · Space or Esc to stop`
              : placing
    ? `Placing ${placing.name}: click to place, as many as you like · wheel or Q/E to turn · Alt: no snap · Space or Esc to stop${runnable(placingSource().src) ? ' · Place: In a run puts them post to post, like a road' : ''}`
    : drag
      ? 'Wheel or Q/E to turn · Alt: no snap'
      : group.length
        ? `${group.length} selected: drag any of them to move them all · the ring or Q/E turns them · arrows nudge · Del delete · Ctrl+C copy · Ctrl+X cut · Ctrl+D duplicate · right-click: menu · Ctrl+click adds or takes one out · Esc deselect`
      : selected
        ? 'Drag to move · Q/E turn (Shift: 1°) · arrows nudge · Del delete · Ctrl+C copy · Ctrl+X cut · Ctrl+D duplicate · right-click: menu · Ctrl+click another to select several · F focus · Esc deselect'
        : 'Click to select · drag a box to select several (Ctrl: add) · hold right button + WASD to fly (Space up, Ctrl down) · middle drag to pan · wheel to zoom · Tab top view · P test drive';
}

// An object's options (sdk/objectOptions.js): its colour, light, width, text…
function optionsHtml(it) {
  const list = OBJECT_OPTIONS[it.t];
  if (!list || !canMove(it)) return '';
  const set = session.settingsOf(selected);
  const val = (k) => set[k] ?? optionDefault(it, k);
  const field = ([k, label, kind, a, b, step, unit]) => {
    const id = `op-${k}`;
    if (kind === 'color') return `<label for="${id}">${label}</label><input id="${id}" data-op="${k}" type="color" value="${esc(String(val(k)))}" />`;
    if (kind === 'select') return `<label for="${id}">${label}</label><select id="${id}" data-op="${k}">${Object.entries(a).map(([v, n]) => `<option value="${esc(v)}"${String(val(k)) === v ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
    if (kind === 'text') return `<label for="${id}">${label}</label><input id="${id}" data-op="${k}" type="text" maxlength="40" value="${esc(String(val(k)))}" />`;
    // (A slider with its number box, typed into as well; wide enough for what it is now.)
    const v = Number(val(k)) || a;
    return `<label>${label} <input type="range" id="${id}" data-op="${k}" data-kind="range" min="${Math.min(a, v)}" max="${Math.max(b, Math.ceil(v))}" step="${step}" value="${v}" /><input class="num" id="${id}-v" data-for="${id}" data-unit="${unit || ''}" inputmode="decimal" /></label>`;
  };
  const own = Object.keys(set).length;
  const pairs = list.filter((o) => o[2] !== 'range');
  const sliders = list.filter((o) => o[2] === 'range');
  return `<h4>Options</h4>${pairs.length ? `<div class="grid">${pairs.map(field).join('')}</div>` : ''}${sliders.map(field).join('')}${own ? '<div class="row"><button id="op-reset" title="Back to how it was">Reset options</button></div>' : ''}`;
}

function optionsWire(it) {
  const list = OBJECT_OPTIONS[it.t];
  if (!list) return;
  for (const el of document.querySelectorAll('#inspector [data-op]')) {
    el.addEventListener('change', () => {
      const o = list.find((q) => q[0] === el.dataset.op);
      let v = el.value;
      if (el.dataset.kind === 'range') {
        v = Number(v);
        if (!Number.isFinite(v)) return refresh();
        v = Math.min(Number(el.max), Math.max(Number(el.min), v));
      }
      if (session.setSettings(selected, { [o[0]]: v })) changed();
    });
  }
  document.querySelectorAll('#inspector input.num[data-for^="op-"]').forEach(numberBox);
  $('op-reset')?.addEventListener('click', () => {
    const none = Object.fromEntries(Object.keys(session.settingsOf(selected)).map((k) => [k, null]));
    if (session.setSettings(selected, none)) changed();
  });
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
  // (The same model from every district, or by another name, is one entry: its styles picked on the right.)
  modelList = new Map(models(pool).map((m) => [m.key, m]));
  const objectsIn = (c) => [...modelList.values()].filter((m) => m.category === c && (!q || m.name.toLowerCase().includes(q) || m.styles.some((e) => e.name.toLowerCase().includes(q) || (e.districtName || '').toLowerCase().includes(q))));
  const gadgets = Object.entries(GADGETS)
    .filter(([, g]) => !g.hidden)
    .flatMap(([t, g]) => (t === 'light' ? Object.entries(LIGHT_FIXTURES).map(([f, name]) => ({ t, f, name, about: LIGHT_ABOUT[f], group: g.group })) : [{ t, f: null, name: g.name, about: g.about, group: g.group }]))
    .filter((e) => !q || e.name.toLowerCase().includes(q) || (e.f && 'light'.includes(q)));
  // (Each section: what's placed in it first, then the districts' objects.)
  const html = SECTIONS.map((c) => {
    const placed = gadgets.filter((e) => GADGET_SECTION[e.group || 'Gadgets'] === c);
    const list = objectsIn(c);
    if (!placed.length && !list.length) return '';
    return `<h4>${c}</h4>${placed.map(({ t, f, name, about }) => {
      const lock = lockOf(specialOfGadget(t), career);
      const on = placingGadget === t && (placingPreset?.fixture ?? null) === f;
      return `<div class="entry${on ? ' on' : ''}${lock ? ' locked' : ''}" data-gadget="${t}"${f ? ` data-fixture="${f}"` : ''} title="${esc(about)}"${lockAttrs(lock)}><span>${lock ? '🔒 ' : ''}${esc(name)}</span></div>`;
    }).join('')}${list
      .map((m) => {
        const locks = m.styles.map((e) => styleLock(e, career));
        const lock = locks.every(Boolean) ? locks[0] : null;
        const tip = m.styles.map((e) => `${e.districtName || 'This map'}: ${e.name}, ${e.size.map((v) => v.toFixed(1)).join(' × ')} m (${e.count} there)`).join('\n');
        const n = m.styles.length;
        const side = n > 1 ? `${n} styles` : from === 'all' ? short(m.styles[0]) : m.styles[0].count;
        return `<div class="entry${placingModel?.key === m.key && placing ? ' on' : ''}${lock ? ' locked' : ''}" draggable="${!lock}" data-model="${esc(m.key)}" title="${esc(tip)}"${lockAttrs(lock)}><span>${lock ? '🔒 ' : ''}${esc(m.name)}</span><i>${esc(String(side))}</i></div>`;
      })
      .join('')}`;
  }).join('');
  const loading = othersLoading && from !== 'here' ? '<p class="loading">Loading the other districts\' objects…</p>' : '';
  $('cat').innerHTML = (html || (loading ? '' : '<p class="none">Nothing matches.</p>')) + loading;
  showPlaceOpts();
}

// How it's placed (on the right, while an object is being placed): In a run only
// for what can go in one; Spacing only along a line or scattered.
// A style's lock (the Creator: its district, or its special asset), or null.
const styleLock = (e, career = CREATOR ? loadCareer() : null) => districtLock(e, career) || lockOf(specialOfType(e.t), career);
// The style of a model to place: the one picked last, else the first (this map's own come first) not locked.
function pickStyle(m) {
  if (!m) return null;
  const open = m.styles.filter((e) => !styleLock(e));
  return open.find((e) => e.uid === stylePicked.get(m.key)) || open[0] || null;
}

function showPlaceOpts() {
  const shapes = placingGadget ? GADGET_SHAPES[placingGadget] : null;
  $('place-opts').hidden = !placing && !shapes;
  if (!placing && !shapes) return;
  $('mode-row').hidden = !placing;
  $('shape-row').hidden = !shapes;
  if (shapes) {
    // (A gadget with shapes: a ramp, long or a kicker.)
    $('place-title').textContent = `Placing: ${placingName()}`;
    $('style-row').hidden = $('spacing-row').hidden = true;
    const on = shapeOf({ type: placingGadget, ...placingPreset });
    $('place-shape').innerHTML = Object.entries(shapes).map(([k, sh]) => `<option value="${k}"${k === on ? ' selected' : ''}>${esc(sh.name)}</option>`).join('');
    return;
  }
  const styles = placingModel?.styles.includes(placing) ? placingModel.styles : [placing];
  $('place-title').textContent = `Placing: ${styles.length > 1 ? placingModel.name : placing.name}`;
  $('style-row').hidden = styles.length < 2;
  if (styles.length > 1) {
    const career = CREATOR ? loadCareer() : null;
    const named = new Set(styles.map((e) => e.name)).size > 1;
    $('place-style').innerHTML = styles
      .map((e, i) => {
        const lock = styleLock(e, career);
        return `<option value="${i}"${e === placing ? ' selected' : ''}${lock ? ' disabled' : ''}>${lock ? '🔒 ' : ''}${esc(e.districtName || 'This map')}${named ? ` · ${esc(e.name)}` : ''} (${e.size[0].toFixed(0)} × ${e.size[2].toFixed(0)} m)</option>`;
      })
      .join('');
  }
  const canRun = !!session && runnable(placingSource().src);
  $('run-mode').hidden = $('run-mode').disabled = !canRun;
  if (canRun && runWanted) $('place-mode').value = 'run';
  else if (!canRun && $('place-mode').value === 'run') $('place-mode').value = 'one';
  $('spacing-row').hidden = !['line', 'scatter'].includes($('place-mode').value);
}

// --- Input ------------------------------------------------------------------------

// The search's × (only while something's typed) clears it.
$('search').addEventListener('input', () => {
  $('search-clear').hidden = !$('search').value;
  renderCatalogue();
});
$('search-clear').addEventListener('click', () => {
  $('search').value = '';
  $('search-clear').hidden = true;
  renderCatalogue();
  $('search').focus();
});
$('place-style').addEventListener('change', () => {
  const e = placingModel?.styles[Number($('place-style').value)];
  if (!e) return;
  placing = e;
  stylePicked.set(placingModel.key, e.uid);
  showPlaceOpts();
  showOverlay();
  hint();
});
$('place-shape').addEventListener('change', () => {
  if (!placingGadget) return;
  shapePicked.set(placingGadget, $('place-shape').value);
  placingPreset = shapeSettings(placingGadget, $('place-shape').value);
  showOverlay();
  hint();
});
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
  runPts = [];
  runHover = null;
  runWanted = $('place-mode').value === 'run';
  showPlaceOpts();
  showOverlay();
  hint();
});
$('cat').addEventListener('click', (e) => {
  const locked = e.target.closest('[data-lock]');
  if (locked) return toast(`Locked. To unlock it: ${locked.dataset.lock}.`);
  const gEl = e.target.closest('[data-gadget]');
  if (gEl && session) {
    if (tool !== 'select') setTool('select');
    const fixture = gEl.dataset.fixture || null;
    const same = placingGadget === gEl.dataset.gadget && (placingPreset?.fixture ?? null) === fixture;
    placingGadget = same ? null : gEl.dataset.gadget;
    placingPreset = same || !fixture ? null : lightPreset(fixture);
    const shapes = !same && GADGET_SHAPES[gEl.dataset.gadget];
    if (shapes) placingPreset = shapeSettings(gEl.dataset.gadget, shapePicked.get(gEl.dataset.gadget) || Object.keys(shapes)[0]);
    placing = null;
    pasting = null;
    placeYaw = 0;
    ghostAt = null;
    renderCatalogue();
    showOverlay();
    hint();
    return;
  }
  const el = e.target.closest('.entry');
  if (!el || !session) return;
  placingGadget = placingPreset = null;
  pasting = null;
  linking = null;
  if (el.dataset.lock) return toast(`Locked: ${el.dataset.lock}`);
  const model = modelList.get(el.dataset.model);
  if (tool !== 'select') setTool('select');
  const same = !!placing && placingModel?.key === model?.key;
  placingModel = same ? null : model;
  placing = same ? null : pickStyle(model);
  placeYaw = 0;
  ghostAt = null;
  runPts = [];
  renderCatalogue();
  hint();
});
$('cat').addEventListener('dragstart', (e) => {
  const el = e.target.closest('.entry');
  if (!el) return;
  if (el.dataset.lock) return e.preventDefault();
  e.dataTransfer.setData('text/plain', el.dataset.model);
  if (tool !== 'select') setTool('select');
  placingModel = modelList.get(el.dataset.model);
  placing = pickStyle(placingModel);
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
    rmb = { x: e.clientX, y: e.clientY, at: performance.now(), moved: 0 };
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
  if (tool === 'bridge') {
    const g = groundHit();
    if (!g) return;
    // (Not drawing one: a click on a bridge selects it.)
    if (!bridgePts.length && e.detail < 2) {
      const hit = bridgeAt(g);
      if (hit || bridgeSel) {
        bridgeSel = hit;
        showBridgeOpts();
        drawBridges();
        if (hit) return;
      }
    }
    if (e.detail >= 2) return endBridge();
    bridgePts.push([snap(g.x, e), snap(g.z, e)]);
    showBridgeOpts();
    drawBridges(g);
    hint();
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
    if (evStage === 'cut' && r?.path) return cutClick(g);
    if ((r?.path || r?.kind === 'drag') && evStage !== 'start') {
      const at = routePointAt(g);
      // (Ctrl+click a point: taken out.)
      if (at !== null && (e.ctrlKey || e.metaKey) && r.path) {
        r.path.splice(at, 1);
        evSel = null;
        renderEvents();
        return previewEvent();
      }
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
    // (Where its ghost is: on the ground, or up on top of something.)
    const at = ghostAt || { x: snap(g.x, e), z: snap(g.z, e), y: null };
    const up = upHere(at);
    const id = session.addGadget(placingGadget, at.x, at.z, placeYaw, { ...placingPreset, ...(up ? { up } : {}) });
    renderCatalogue();
    changed(false);
    selectFeature(gadgetFeature(id));
    return;
  }
  if (pasting) {
    const g = groundHit();
    if (!g) return;
    const made = session.pasteMany(pastePoses(ghostAt || { x: snap(g.x, e), z: snap(g.z, e) }));
    if (made.length) {
      changed(made.some((t) => t.key));
      setSelection(made);
    }
    hint();
    return;
  }
  if (placing) {
    const g = groundHit();
    if (!g) return;
    const mode = $('place-mode').value;
    if (runMode()) runClick(g, e);
    else if (mode === 'line') {
      if (!lineFrom) lineFrom = [snap(g.x, e), snap(g.z, e)];
      else placeLine(lineFrom, [snap(g.x, e), snap(g.z, e)]);
    } else if (mode === 'scatter') {
      scatter = [];
      ghostAt = { x: g.x, z: g.z };
    } else placeEntry(placing, g, e, false);
    hint();
    return;
  }
  if (linking) {
    const g = groundHit();
    linkTo(g ? gadgetAt(g.x, g.z) : null);
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
  const hit = gid ? null : meshHit();
  const key = hit ? session.pick(hit.x, hit.z, hit.y) : null;
  const thing = gid ? { gadget: gid } : key && canMove(session.item(key)) ? { key } : null;
  // (Ctrl: one in or out of the selection; or, from empty ground, a box of them added.)
  if (e.ctrlKey) {
    if (thing) toggleThing(thing);
    else drag = { box: true, add: true, sx: e.clientX, sy: e.clientY, x2: e.clientX, y2: e.clientY, moved: false };
    return;
  }
  // (One of several selected: they all move; let go without moving, just it's selected.)
  if (thing && group.some((t) => sameThing(t, thing))) {
    if (gp) drag = groupMove({ only: thing, sx: e.clientX, sy: e.clientY, ax: gp.x, az: gp.z, moved: false });
    return;
  }
  if (gid) {
    const f = gadgetFeature(gid);
    selectFeature(f);
    drag = { feature: f, sx: e.clientX, sy: e.clientY, ox: f.x - gp.x, oz: f.z - gp.z, x: f.x, z: f.z, yaw: 0, moved: false };
    return;
  }
  const f = !key && hit ? featureAt(session, hit.x, hit.z) : null;
  if (f?.type === 'node' && f.movable) {
    selectFeature(f);
    const g = groundHit();
    if (g) drag = { feature: f, sx: e.clientX, sy: e.clientY, ox: f.x - g.x, oz: f.z - g.z, x: f.x, z: f.z, yaw: 0, moved: false };
    return;
  }
  // (Empty ground, or a street or site: a click selects it, or nothing; a drag, a box.)
  if (!key) {
    drag = { box: true, click: f, sx: e.clientX, sy: e.clientY, x2: e.clientX, y2: e.clientY, moved: false };
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
    if (rmb) rmb.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
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
    if (tool === 'bridge' && bridgePts.length) drawBridges(g);
    showBrush();
    showRoad();
    showLotHover();
    return;
  }
  if (drag) {
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
    drag.moved = true;
    if (drag.box) {
      [drag.x2, drag.y2] = [e.clientX, e.clientY];
      showMarquee(drag);
      return;
    }
    if (drag.group && !drag.rotating) {
      if (g) [drag.dx, drag.dz] = [snap(g.x - drag.ax, e), snap(g.z - drag.az, e)];
      showOverlay();
      hint();
      return;
    }
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
  if (placing || placingGadget || pasting) {
    // (One object at a time: on whatever's under the cursor, the ground or the top of something.)
    const s = (placing && $('place-mode').value === 'one' && !runMode()) || placingGadget ? surfaceHit() : null;
    const at = s || g;
    ghostAt = at ? { x: snap(at.x, e), z: snap(at.z, e), y: s ? s.y : null } : null;
    runHover = g && runMode() ? runSnap(g, e) : null;
    showOverlay();
    return;
  }
  if (linking) {
    linkAt = g;
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
    // (A right-click, not a look round or a fly: the menu.)
    const r = rmb;
    rmb = null;
    if (r && !r.flew && r.moved < 6 && performance.now() - r.at < 400) openMenu(r.x, r.y);
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
      session.addMany(placing.from, list, -placingDrop(), placingDefaults());
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
    if (d.box) {
      showMarquee(null);
      if (d.moved) return boxSelect(d);
      if (d.click) selectFeature(d.click);
      else if (!d.add) select(null);
      return;
    }
    if (d.group) {
      if (d.moved) return applyGroup(d);
      if (d.only) return setSelection([d.only]);
      return showOverlay();
    }
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
      // (Moved: up onto, or down off, what's there.)
      const [x, z] = [Math.round(d.x * 100) / 100, Math.round(d.z * 100) / 100];
      if (session.setGadget(d.feature.id, { x, z, ...(d.rotating ? { yaw: d.yaw } : { up: session.topAt(x, z) }) })) changed(false);
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
  closeMenu();
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
  // (Holding the right button, the wheel zooms instead.)
  if ((drag || placing || placingGadget || pasting) && !flying) {
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
  if (!menu.hidden && e.code === 'Escape') {
    e.preventDefault();
    return closeMenu();
  }
  keys.add(e.code);
  if (!session) return;
  if (flying) {
    if (rmb) rmb.flew = true; // (so letting go of the right button isn't a click)
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
  if (ctrl && e.code === 'KeyC') {
    e.preventDefault();
    copySelection();
    return;
  }
  if (ctrl && e.code === 'KeyX') {
    e.preventDefault();
    copySelection(null, true);
    return;
  }
  if (ctrl && e.code === 'KeyV') {
    e.preventDefault();
    paste();
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
  const bridgePlacing = tool === 'bridge' && bridgePts.length;
  // Drawing a bridge: build it, take a point back, or (Esc) stop; Delete: the bridge selected.
  if (tool === 'bridge') {
    const p = actionFor(e.code, 'place');
    if (bridgePlacing && (p || act === 'cancel')) {
      e.preventDefault();
      if (p === 'endPlacing' || p === 'buildRoad') return endBridge();
      if (p === 'backPoint') bridgePts.pop();
      else bridgePts = [];
      showBridgeOpts();
      drawBridges();
      hint();
      return;
    }
    if (!bridgePlacing && bridgeSel && act === 'delete') {
      e.preventDefault();
      if (session.removeBridge(bridgeSel)) {
        bridgeSel = null;
        changed(false);
        showBridgeOpts();
        drawBridges();
      }
      return;
    }
  }
  const racePlacing = tool === 'events' && evDraft?.route?.path;
  const runPlacing = runPts.length && runMode();
  const place = roadPlacing || racePlacing || runPlacing ? actionFor(e.code, 'place') : null;
  // Placing objects or gadgets (one per click): Space stops.
  if (!runPlacing && (placing || placingGadget || pasting) && actionFor(e.code, 'place') === 'endPlacing') {
    e.preventDefault();
    stopPlacing();
    return;
  }
  // Placing a run's posts: build it, take a post back, or (Esc) start it again.
  if (runPlacing && (place || act === 'cancel')) {
    e.preventDefault();
    if (place === 'endPlacing' || place === 'buildRoad') return buildRun();
    if (place === 'backPoint') runPts.pop();
    else runPts = [];
    showOverlay();
    hint();
    return;
  }
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
    // Drawing a shortcut: take back a point, or stop (what's drawn so far is dropped).
    if (evStage === 'cut' && (place === 'backPoint' || place === 'endPlacing' || act === 'cancel')) {
      e.preventDefault();
      if (place === 'backPoint' && evCut?.length) {
        evCut.pop();
        return drawEventMarks();
      }
      return stopCut();
    }
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
  const step = nudgeStep(e.shiftKey);
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
      if (linking) {
        stopLinking();
        break;
      }
      stopPlacing();
      drag = null;
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
$('customize-car').addEventListener('click', () => {
  toggleControls(false);
  openCarEditor(tex);
});
window.addEventListener('beforeunload', (e) => {
  // (Flying with Ctrl held, W closes the tab: it asks first.)
  if (session?.dirty || flying) e.preventDefault();
});

// --- Loop ----------------------------------------------------------------------------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // (Customize Car covers the view: it draws its own.)
  if (carEditorOpen()) return requestAnimationFrame(frame);
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
  rebuildBridges();
  if (gadgetGroup) {
    scene.remove(gadgetGroup);
    dispose(gadgetGroup);
    gadgetGroup = null;
  }
  if (!session?.gadgets().length) return;
  const all = session.gadgets().map((g) => (trying && g.id === trying.id ? { ...g, ...trying.patch } : g));
  const def = addGadgets({ cx: 0, cz: 0, y: 0, size: 1e6, obstacles: [], ramps: [], lifts: [], sweepers: [], hazards: [], movers: [] }, all, H);
  const parts = [gadgetView(buildArena(def), tex, { ownClock: true }), placedView(all, H, tex), startMarkers(all, H), lightMarkers(all, H), linkLines(all)].filter(Boolean);
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

// --- Trigger pads: linking gadgets to them -------------------------------------------
// A trigger pad's Link a gadget button stays on (linking) till it's pressed
// again, Esc, or a gadget's clicked: that gadget is linked to the pad (its
// link), and from then on runs only when the pad's driven over (sim/gadgets.js
// runLinked; a gate opens). On the map, a dashed line joins each pad to what
// it sets off.

const gadgetName = (g) => `${GADGETS[g.type].name.toLowerCase()} ${g.id}`;

function startLinking(id) {
  linking = id;
  linkAt = null;
  if (feature?.id !== id) selectFeature(gadgetFeature(id));
  refresh();
  showOverlay();
}

function stopLinking() {
  linking = null;
  linkAt = null;
  refresh();
  showOverlay();
}

// A click while linking: the gadget there (if it can be set off) linked to the pad.
function linkTo(gid) {
  const pad = session.gadgets().find((q) => q.id === linking);
  const g = gid && session.gadgets().find((q) => q.id === gid);
  if (!pad) return stopLinking();
  if (!g || g.id === pad.id) return toast('Click a lift pad, gate, spinning bar or moving block to link it (or press Link a gadget again to stop).');
  if (!LINKABLE.has(g.type)) return toast(`A ${GADGETS[g.type].name.toLowerCase()} can't be set off by a trigger pad: only lift pads, gates, spinning bars and moving blocks.`);
  linking = null;
  linkAt = null;
  if (session.setGadget(g.id, { link: pad.id })) changed(false);
  toast(`The ${gadgetName(g)} now ${g.type === 'gate' ? 'opens' : 'runs'} while trigger pad ${pad.id} is switched on (drive onto it to switch it on, and again to switch it off).`);
  selectFeature(gadgetFeature(pad.id));
  showOverlay();
}

// The SDK's lines (not in the game) from each trigger pad to what it sets off.
function linkLines(all) {
  const pads = new Map(all.filter((g) => g.type === 'trigger').map((g) => [g.id, g]));
  const pts = [];
  for (const g of all) {
    const pad = LINKABLE.has(g.type) && pads.get(g.link);
    if (pad) pts.push(new THREE.Vector3(pad.x, H(pad.x, pad.z) + 0.4, pad.z), new THREE.Vector3(g.x, H(g.x, g.z) + 0.6, g.z));
  }
  if (!pts.length) return null;
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x40f0ff, dashSize: 0.8, gapSize: 0.5, depthTest: false, transparent: true, opacity: 0.8, fog: false }));
  lines.computeLineDistances();
  lines.renderOrder = 11;
  return lines;
}

// How far a gadget reaches from its middle (for picking it and outlining it).
const reachOf = (g) =>
  g.type === 'lift' ? Math.hypot(g.w, g.d) / 2 : g.type === 'gate' ? g.width / 2 : g.type === 'sweeper' ? g.len : g.type === 'mover' ? g.travel + Math.hypot(g.w, g.d) / 2
    : g.type === 'ramp' || g.type === 'kicker' ? Math.max(g.len, g.width) / 2 : g.type === 'sign' ? signSize(g).w / 2 : g.type === 'barrel' ? 1
    : g.type === 'light' && SPAN_LIGHTS.has(g.fixture) ? g.span / 2 : g.r ?? 2;

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
  const sliders = (SETTINGS[g.type] || []).filter(([k]) => {
    if (typeof g[k] !== 'number') return false;
    if (g.type === 'light') return !((k === 'height' && LIGHT_PRESETS[g.fixture]?.fixed) || (k === 'span' && !SPAN_LIGHTS.has(g.fixture)));
    // (A gate's timer: only when it's not switched by a pad.)
    if (g.type === 'gate' && k === 'period') return !g.link;
    return true;
  });
  const linked = g.type === 'trigger' ? session.gadgets().filter((q) => q.link === g.id && LINKABLE.has(q.type)) : [];
  const triggers = session.gadgets().filter((q) => q.type === 'trigger');
  const realOn = session.gadgets().filter((q) => q.type === 'light' && q.real).length;
  const slider = (id, label, min, max, step, unit, value, k = '') => `<label>${esc(label)} <input type="range" id="${id}"${k ? ` data-k="${k}"` : ''} min="${min}" max="${max}" step="${step}" value="${value}" /><input class="num" id="${id}-v" data-for="${id}" data-unit="${unit}" inputmode="decimal" /></label>`;
  const options = (table, on) => Object.entries(table).map(([v, n]) => `<option value="${v}"${on === v ? ' selected' : ''}>${esc(n)}</option>`).join('');
  const WHERE = {
    ramp: 'In every event on this map and free roam (a race only uses it if the route runs over it).',
    hazard: g.type === 'oil' ? 'In every event on this map and free roam.' : 'In every event on this map and free roam: once it has gone off it stays gone for the rest of the event.',
    sign: 'In every event on this map and free roam. Its posts are solid; so is the sign itself when its bottom is below 2.2 m.',
    start: g.type === 'start' ? 'Free roam on this map starts here (Test drive starts at the Test drive start, if there is one).' : g.type === 'testStart' ? 'Test drive (P, or the ▶ Test drive button) starts here. Racing an event (Shift+P) starts on its own grid.' : 'Only in arena events, and only inside the arena\'s ground.',
    light: 'Lights show in every event on this map and in free roam; a lamp post or floodlight tower is solid.',
    drop: "Drops are in every event on this map (not drag races) and in free roam, as well as the event's own (an event can turn its own off).",
    gadget: 'Gadgets work in free roam and in arena events.',
  };
  ins.innerHTML = `
    <h3>${esc(G.name)}</h3><div class="key">${kind} ${esc(g.id)}</div>
    <p class="note">${esc(g.type === 'light' ? LIGHT_ABOUT[g.fixture] || G.about : G.about)}</p>
    <div class="sliders">
      ${g.type === 'sign' ? `<label>Words <input id="gd-text" maxlength="24" value="${esc(g.text || '')}" /></label>
        <label>Style <select id="gd-style">${options(SIGN_STYLES, g.style)}</select></label>` : ''}
      ${g.type === 'light' || g.type === 'sign' ? `<label>Colour <span class="swatches">${LIGHT_COLORS.map((c) => `<button class="sw${g.color === c ? ' on' : ''}" data-color="${c}" title="${c}" style="background:${c}"></button>`).join('')}<input type="color" id="gd-color" value="${g.color}" title="Any colour" /></span></label>` : ''}
      ${g.type === 'light' ? `<label>Fixture <select id="gd-fixture">${options(LIGHT_FIXTURES, g.fixture)}</select></label>` : ''}
      ${GADGET_SHAPES[g.type] ? `<label title="Sets its size; the sliders change it from there">Shape <select id="gd-shape">${Object.entries(GADGET_SHAPES[g.type]).map(([k, sh]) => `<option value="${k}"${shapeOf(g) === k ? ' selected' : ''}>${esc(sh.name)}</option>`).join('')}${shapeOf(g) ? '' : '<option selected disabled>Your own</option>'}</select></label>` : ''}
      ${g.type === 'hazard' ? `<label title="Flames: burns a car and sets it alight. Sparks: shocks it (its engine cuts out; its nitro and weapons won't fire) for a moment.">Kind <select id="gd-kind">${options(HAZARD_KINDS, g.kind || 'fire')}</select></label>` : ''}
      ${sliders.map(([k, label, min, max, step, unit]) => slider(`gd-${k}`, label, min, max, step, unit, g[k], k)).join('')}
      ${turns ? slider('gd-turn', 'Turn', 0, 359, 1, '°', Math.round((((g.yaw || 0) * 180) / Math.PI + 360) % 360)) : ''}
      ${g.type === 'sign' ? `<label class="check"><input type="checkbox" id="gd-posts"${g.posts ? ' checked' : ''} /> On posts (solid, down to the ground)</label>` : ''}
      ${g.type === 'light' ? `<label>Flicker <select id="gd-flicker">${options(LIGHT_FLICKER, g.flicker)}</select></label>
        <label class="check" title="A real light shines on the cars and the walls round it, not just the ground. Each one costs a little speed, so a map can have ${MAX_REAL_LIGHTS}."><input type="checkbox" id="gd-real"${g.real ? ' checked' : ''}${!g.real && realOn >= MAX_REAL_LIGHTS ? ' disabled' : ''} /> Real light: shines on cars and walls (${realOn} of ${MAX_REAL_LIGHTS} on this map)</label>` : ''}
      ${['lift', 'gate', 'sweeper', 'mover'].includes(g.type) ? `<label class="check" title="Off: it stays where it rests (a gate stays shut), even when a trigger pad's switched on."><input type="checkbox" id="gd-moving"${g.still ? '' : ' checked'} /> Moves (its animation)</label>` : ''}
      ${g.type === 'gate' ? `<label>Opens <select id="gd-link"><option value="">on its timer</option>${triggers.map((t) => `<option value="${t.id}"${g.link === t.id ? ' selected' : ''}>while trigger pad ${t.id} is on</option>`).join('')}</select></label>` : ''}
      ${LINKABLE.has(g.type) && g.type !== 'gate' ? `<label>Runs <select id="gd-link"><option value="">on its own</option>${triggers.map((t) => `<option value="${t.id}"${g.link === t.id ? ' selected' : ''}>while trigger pad ${t.id} is on</option>`).join('')}</select></label>` : ''}
    </div>
    ${g.type === 'trigger' ? `<div class="links"><span>Switches:</span> ${linked.length ? linked.map((q) => `<span class="link">${esc(gadgetName(q))}<button class="unlink" data-unlink="${q.id}" title="Unlink it: it moves on its own again">×</button></span>`).join('') : '<i>nothing yet</i>'}</div>
      <div class="row"><button id="gd-linking" class="${linking === g.id ? 'on' : ''}" title="Then click a lift pad, gate, spinning bar or moving block on the map (Esc, or this again, stops)">${linking === g.id ? 'Linking: click a gadget…' : 'Link a gadget'}</button></div>` : ''}
    <div class="row">${!turns ? '' : '<button id="gd-left" title="Turn 15° (Q)">⟲ 15°</button><button id="gd-right" title="Turn the other way 15° (E)">⟳ 15°</button>'}<button id="f-del" class="danger">Delete</button></div>
    <p class="note">Drag it to move it${!turns ? '' : '; drag its ring (or Q/E) to turn it'}. ${WHERE[kind]}</p>`;
  // (What the controls say now: shown while a slider's dragged, kept when it's let go.)
  const read = () => {
    const patch = $('gd-turn') ? { yaw: (Number($('gd-turn').value) * Math.PI) / 180 } : {};
    for (const el of ins.querySelectorAll('input[type=range][data-k]')) patch[el.dataset.k] = Number(el.value);
    if ($('gd-link')) patch.link = $('gd-link').value;
    if ($('gd-kind')) patch.kind = $('gd-kind').value;
    if ($('gd-moving')) patch.still = !$('gd-moving').checked;
    if ($('gd-fixture')) {
      Object.assign(patch, { fixture: $('gd-fixture').value, flicker: $('gd-flicker').value, real: $('gd-real').checked });
      if (patch.fixture !== g.fixture) Object.assign(patch, lightResize(patch.fixture));
    }
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
  for (const el of ins.querySelectorAll('select:not(#gd-shape), #gd-real, #gd-posts, #gd-text, #gd-moving')) el.addEventListener('change', () => apply());
  $('gd-shape')?.addEventListener('change', () => apply(shapeSettings(g.type, $('gd-shape').value)));
  $('gd-text')?.addEventListener('input', () => {
    // (The letters the game's pixel font has, capitals.)
    const t = signText($('gd-text').value);
    if (t !== $('gd-text').value) $('gd-text').value = t;
    rebuildGadgets({ id: g.id, patch: read() });
  });
  ins.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => apply({ color: b.dataset.color })));
  $('gd-left')?.addEventListener('click', (ev) => turn(1, ev.shiftKey));
  $('gd-right')?.addEventListener('click', (ev) => turn(-1, ev.shiftKey));
  $('gd-linking')?.addEventListener('click', () => (linking === g.id ? stopLinking() : startLinking(g.id)));
  ins.querySelectorAll('[data-unlink]').forEach((b) => b.addEventListener('click', () => {
    if (session.setGadget(b.dataset.unlink, { link: '' })) changed(false);
  }));
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
let arenaGhost = null; // placing spawn points: where the next would go { x, z, yaw, ok (inside it) }
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
    arenaGhost = null;
    renderArenaPanel();
    showOverlay();
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
  if (arenaSpawning) {
    // (Facing the middle, as it'll be placed.)
    const a = arenaList()[arenaSel];
    const poly = a && !a.removed ? outlineOf(a) : null;
    const [mx, mz] = poly ? middleOf(poly) : [g.x, g.z + 1];
    arenaGhost = { x: g.x, z: g.z, yaw: Math.atan2(mx - g.x, mz - g.z), ok: !!poly && G.pointInPoly(g.x, g.z, poly) };
    showOverlay();
  } else if (arenaGhost) {
    arenaGhost = null;
    showOverlay();
  }
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
    arenaGhost = null;
    renderArenaPanel();
    showOverlay();
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
  ['Roads, races, arenas, runs and objects (while placing)', 'place', [
    ['endPlacing', 'Stop placing (objects and gadgets; a race: the last point is the finish; an arena: close it; a run of fence or wall: build it)', 'Space'],
    ['backPoint', 'Road, arena or run: take the last point back', 'Backspace'],
    ['buildRoad', 'Road: build the street (an arena: close it; a run: build it)', 'Enter', 'NumpadEnter'],
  ]],
  ['Editing', 'edit', [
    ['delete', 'Delete the selection (or a race\'s selected point, an arena\'s selected corner)', 'Delete', 'Backspace'], ['turnLeft', 'Turn left 15° (Shift: 1°)', 'KeyQ'], ['turnRight', 'Turn right 15° (Shift: 1°)', 'KeyE'],
    ['nudgeUp', 'Nudge forward (how far: below; Shift: the fine amount)', 'ArrowUp'], ['nudgeDown', 'Nudge back', 'ArrowDown'], ['nudgeLeft', 'Nudge left', 'ArrowLeft'], ['nudgeRight', 'Nudge right', 'ArrowRight'],
    ['focus', 'Focus the selection', 'KeyF'], ['snap', 'Snapping on/off', 'KeyG'], ['cancel', 'Cancel or stop (placing, a road, a run, an arena outline, linking) / deselect', 'Escape'],
  ]],
  ['View and play', 'edit', [
    ['topView', 'Top view', 'Tab'], ['testDrive', 'Test drive, from the Test drive start or where you look (Shift: race the event)', 'KeyP'],
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
  ['Copy the selection, and place it (as if picked in the Objects list)', 'Ctrl+C'], ['Paste: place what was copied, again', 'Ctrl+V'],
  ['Cut the selection: take it off the map, and place it (as Copy does)', 'Ctrl+X'],
  ['On this map (the list): select the one above or below (Shift: several)', '↑ ↓'], ['On this map (the list): select everything listed', 'Ctrl+A'],
  ['No snapping while moving, turning or placing (roads, runs: any angle)', 'Hold Alt'], ['Finer turns (1°) and nudges (the fine amount)', 'Hold Shift'],
  ['A typed slider number: set it', 'Enter'], ['A typed slider number: keep the old one', 'Esc'],
  ['Customize Car: close it (the car stays as you left it)', 'Esc'],
];
// [what, button]: in the key column, like the keys.
const MOUSE = [
  ['The menu: copy, cut, paste, duplicate, delete (right-clicking something selects it)', 'Right click'],
  ['On this map (the list): select one and look at it', 'Click'], ['On this map (the list): select several, one by one (in or out)', 'Ctrl + click'],
  ['On this map (the list): select everything from the last one clicked', 'Shift + click'], ['On this map (the list): its menu', 'Right click'],
  ['Select, place, brush, draw a road, or set a lot', 'Left click'], ['Select a street, junction, site or gadget', 'Left click'],
  ['Place objects, one per click (Space or Esc stops)', 'Click'], ['Place one object', 'Drag it in from the list'],
  ['Along a line: where it starts, then where it ends', 'Click, click'], ['Scatter: brush them on', 'Left drag'],
  ['Move the selection (several: drag any of them), a junction or a gadget', 'Left drag'],
  ['Select several: a box round them, from empty ground', 'Left drag'], ['Select several, one by one (in or out)', 'Ctrl + click'], ['Add a box of them to the selection', 'Ctrl + drag'], ['Brush the ground (Smooth, Flatten, Paint…)', 'Left drag'], ['Turn the selection (several: round their middle)', 'Drag its ring'],
  ['Look around, and fly with the keys', 'Hold right'], ['Pan', 'Middle drag'], ['Zoom', 'Wheel'], ['Turn while moving or placing (Shift: 1°)', 'Wheel'],
  ['Raise / lower: a grid step up or down', 'Wheel'], ['Raise / lower: a 25 cm step up or down', '{fine} + wheel'], ['Raise / lower: zoom', 'Hold right + wheel'], ['Placing or dragging: zoom instead of turning', 'Hold right + wheel'],
  ['Road: curve a stretch, or move a point', 'Drag a handle'], ['Road: stop placing points, or straighten a curve', 'Double-click'],
  ['Race: move a point (the start and finish too)', 'Drag it'], ['Race: add a point', 'Click the route'], ['Race: select a point', 'Click it'], ['Race: take out a point', 'Ctrl+click it'], ['Race: draw a shortcut', '✂ Draw shortcut, then click on the route, round, and back on it'], ['Bridge: draw one (Roads tab: Bridge)', 'Click along its path, double-click to build'], ['Bridge: select one', 'Click it'],
  ['Arena: move a corner, or add one at a midpoint', 'Drag a handle'], ['Arena: select a corner', 'Click it'],
  ['Arena: close the outline', 'Click its first point'], ['Arena: close the outline', 'Double-click'],
  ['Trigger pad: link a gadget to it (after Link a gadget)', 'Click the gadget'],
  ['Run of fence or wall: close it round', 'Click its first post'], ['Run of fence or wall: build it', 'Double-click'],
  ['Customize Car: turn round the car', 'Left drag'], ['Customize Car: zoom', 'Wheel'], ['Customize Car: close it', 'Click outside it'],
];

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
  // (The arrows' nudge amounts, under the Editing keys.)
  const nudgeRows = `
      <h4>Nudge amounts (the arrow keys)</h4>
      <div class="krow"><span>Nudge</span><span class="keys"><select id="nudge-step"><option value="grid"${nudgeAmounts.step === 'grid' ? ' selected' : ''}>The move grid</option>${NUDGE_STEPS.map((v) => `<option value="${v}"${Number(nudgeAmounts.step) === v ? ' selected' : ''}>${v < 1 ? `${Math.round(v * 100)} cm` : `${v} m`}</option>`).join('')}</select></span></div>
      <div class="krow"><span>Fine nudge (holding Shift)</span><span class="keys"><select id="nudge-fine">${NUDGE_STEPS.map((v) => `<option value="${v}"${Number(nudgeAmounts.fine) === v ? ' selected' : ''}>${v < 1 ? `${Math.round(v * 100)} cm` : `${v} m`}</option>`).join('')}</select></span></div>`;
  panel.innerHTML = `<h3>Controls</h3>
    <p class="note">Click a key to change it, then press the new one (Esc keeps it; × takes an alt key off). A key another action in the same group had is swapped over.</p>
    ${keysNote ? `<p class="note warn">${esc(keysNote)}</p>` : ''}
    <div class="krow head"><span></span><span class="keys"><b>Key</b><b>Alt</b><i class="clear"></i></span></div>
    ${ACTIONS.map(([title, , list]) => `<h4>${esc(title)}</h4>${list.map(row).join('')}${title === 'Editing' ? nudgeRows : ''}`).join('')}
    <h4>Fixed keys</h4>${FIXED_KEYS.map(([what, k, alt]) => `<div class="krow fixed"><span>${esc(what)}</span><span class="keys"><kbd>${esc(k)}</kbd><kbd class="${alt ? '' : 'none'}">${esc(alt || '')}</kbd><i class="clear"></i></span></div>`).join('')}
    ${[['Mouse', MOUSE]].map(([title, list]) => `<h4>${title}</h4>${list.map(([what, k]) => `<div class="krow fixed"><span>${esc(keyText(what))}</span><span class="keys"><kbd class="wide">${esc(keyText(k))}</kbd><i class="clear"></i></span></div>`).join('')}`).join('')}
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
  for (const [id, k] of [['nudge-step', 'step'], ['nudge-fine', 'fine']]) {
    $(id).addEventListener('change', () => {
      nudgeAmounts[k] = $(id).value === 'grid' ? 'grid' : Number($(id).value);
      try {
        localStorage.setItem(NUDGE_STORE, JSON.stringify(nudgeAmounts));
      } catch {
        // (Kept for this session only.)
      }
      $(id).blur(); // (so the arrows nudge again)
    });
  }
  $('keys-reset').addEventListener('click', () => {
    binding = structuredClone(DEFAULT_KEYS);
    nudgeAmounts = { step: 'grid', fine: 0.1 };
    try {
      localStorage.removeItem(NUDGE_STORE);
    } catch {
      // (Nothing kept.)
    }
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
    const { y0, h } = session.heightOf(it);
    return new THREE.Vector3(fb.x, y0 + h / 2, fb.z);
  }
  if (feature && typeof feature.x === 'number') return new THREE.Vector3(feature.x, H(feature.x, feature.z), feature.z);
  return lookPivot;
}

// Nothing selected: looking round turns round the ground under the cursor
// (where it was when the right button went down).
let lookPivot = null;
function pivotUnder(e) {
  setRay(e);
  lookPivot = groundHit();
}

// The camera's own axes (right, up, forward) at a heading and pitch.
function camAxes() {
  const f = forward();
  const r = new THREE.Vector3(-Math.cos(cam.yaw), 0, Math.sin(cam.yaw));
  return [r, new THREE.Vector3().crossVectors(r, f), f];
}

function lookBy(dyaw, dpitch) {
  const pivot = orbitPivot();
  const at = new THREE.Vector3(cam.x, cam.y, cam.z);
  const dist = pivot ? pivot.distanceTo(at) : 0;
  // Round the ground under the cursor (nothing selected): the camera turns
  // round it as a whole, so it stays where it is in the view, not pulled to the middle.
  const free = pivot && pivot === lookPivot;
  const off = free ? at.sub(pivot) : null;
  const before = free ? camAxes().map((a) => off.dot(a)) : null;
  cam.yaw += dyaw;
  cam.pitch = Math.max(-1.55, Math.min(1.4, cam.pitch + dpitch));
  if (!pivot) return;
  if (free) {
    const p = camAxes().reduce((v, a, k) => v.addScaledVector(a, before[k]), pivot.clone());
    Object.assign(cam, { x: p.x, y: p.y, z: p.z });
    return;
  }
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
  if (group.length) {
    const d = groupMove();
    const r = Math.max(4, ...d.group.map((m) => Math.hypot(m.p.x - d.cx, m.p.z - d.cz))) + 4;
    return { x: d.cx, z: d.cz, y: H(d.cx, d.cz), r, yaw: 0, drag: d };
  }
  const it = selected && session.item(selected);
  if (it && canMove(it)) {
    const fb = footBox(it);
    const p = session.pose(selected);
    return { x: fb.x, z: fb.z, y: session.heightOf(it).y0, r: Math.max(fb.w, fb.d) / 2 + 2.5, yaw: fb.yaw, drag: { key: selected, ox: 0, oz: 0, x: p.x, z: p.z, yaw: p.yaw, yaw0: p.yaw, cx: fb.x, cz: fb.z } };
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

let evStage = null; // null, 'start', 'placing', 'editing', 'cut' (drawing a shortcut)
let evCut = null; // the shortcut being drawn: its points ([x, z])

// How far (m) a ground point is from the race's line (the preview's), or Infinity.
function offRoute(g) {
  const pts = evPreview && !evPreview.error ? evPreview.pts : null;
  let best = Infinity;
  for (let k = 1; k < (pts?.length || 0); k++) {
    const [ax, az] = pts[k - 1];
    const [bx, bz] = pts[k];
    const L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((g.x - ax) * (bx - ax) + (g.z - az) * (bz - az)) / L2));
    best = Math.min(best, Math.hypot(g.x - ax - t * (bx - ax), g.z - az - t * (bz - az)));
  }
  return best;
}

// Drawing a shortcut: it starts on the race's route, goes where it's clicked,
// and is added when a click lands back on the route further on (the game
// puts its ends on the route's middle).
function cutClick(g) {
  const on = offRoute(g) < 10;
  const p = [Math.round(g.x * 10) / 10, Math.round(g.z * 10) / 10];
  if (!evCut.length) {
    if (!on) return toast("Start the shortcut on the race's route.");
    evCut.push(p);
    return drawEventMarks();
  }
  if (!on) {
    evCut.push(p);
    return drawEventMarks();
  }
  if (Math.hypot(p[0] - evCut[0][0], p[1] - evCut[0][1]) < 20) return toast('Join the route further on (20 m or more from where the shortcut leaves it).');
  evCut.push(p);
  (evDraft.route.shortcuts ||= []).push({ path: evCut });
  stopCut();
  previewEvent();
}

function stopCut() {
  evStage = 'editing';
  evCut = null;
  renderEvents();
  hint();
  drawEventMarks();
}
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
  if (evStage === 'cut') return `Drawing a shortcut: click on the route where it leaves, then where it goes (anywhere), then back on the route further on: that's it added. ${keyName(binding.backPoint?.[0] || 'Backspace')}: take back a point; Esc: stop.`;
  if (evStage === 'start') return 'Click the start anywhere: on a street, off the streets, or up on top of something (not inside it).';
  if (evStage === 'placing') return `Click where the race goes: a junction, a way through a site or lot, or anywhere (off the streets it goes straight there, and up onto things). Space (or Finish here): ${r.kind === 'circuit' ? 'it comes back round to the start' : 'the last point is the finish'}.`;
  if (r.path.length) return 'Drag a point to move it (the start and finish too); click the route to add one; Ctrl+click one (or select it and press Delete) to take it out.';
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

// The race the other way round. A sprint: its finish is the start, its start
// the finish. A circuit: the same start, round the loop the other way. A
// drag: from where it finished, to where it started. (Its shortcuts are
// drawn from the route as it goes, either way.)
function reverseRoute() {
  const r = evDraft.route;
  if (r.kind === 'drag') [r.from, r.to] = [r.to, r.from];
  else if (r.kind === 'sprint') r.path.reverse();
  else if (isSpot(r.path[0])) r.path = [r.path[0], ...r.path.slice(1).reverse()];
  else {
    // (A circuit starting so far along its first street: the same place, from that street's other end.)
    const [a, b] = [routePos(r.path[0]), routePos(r.path[1])];
    if (r.start !== undefined && a && b) r.start = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) - r.start));
    r.path = [r.path[1], r.path[0], ...r.path.slice(2).reverse()];
  }
  evSel = null;
  renderEvents();
  previewEvent();
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
  // The shortcuts (purple): where the game puts them; the one being drawn, and its points.
  const cutLine = (pts) => {
    if (pts.length < 2) return;
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, H(x, z) + 0.6, z))), new THREE.LineBasicMaterial({ color: 0xb967ff, depthTest: false, fog: false }));
    l.renderOrder = 14;
    eventMarks.add(l);
  };
  if (!evPreview?.error) for (const c of evPreview?.cuts || []) cutLine(c);
  if (evStage === 'cut' && evCut) {
    cutLine(evCut);
    for (const [x, z] of evCut) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(size * 0.7), basic(0xb967ff));
      m.position.set(x, H(x, z) + size * 2, z);
      m.renderOrder = 15;
      eventMarks.add(m);
    }
  }
  // Arrows along the route the game builds, the way the cars drive (spaced
  // and sized by how high the camera is).
  const line = !evPreview?.error && evPreview?.pts;
  if (line && line.length > 1) {
    const L = G.lineLength(line);
    const gap = Math.max(25, altitude() * 0.12);
    const a = size * 1.2;
    const pos = [];
    for (let s = gap / 2; s < L; s += gap) {
      const p = G.pointAlong(line, s);
      const y = H(p.x, p.z) + 0.7;
      // (A flat arrowhead: its tip ahead, its two back corners either side.)
      pos.push(p.x + p.dx * a, y, p.z + p.dz * a, p.x - p.dx * a * 0.6 - p.dz * a * 0.8, y, p.z - p.dz * a * 0.6 + p.dx * a * 0.8, p.x - p.dx * a * 0.6 + p.dz * a * 0.8, y, p.z - p.dz * a * 0.6 - p.dx * a * 0.8);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const arrows = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x05d9e8, depthTest: false, fog: false, side: THREE.DoubleSide }));
    arrows.renderOrder = 13;
    eventMarks.add(arrows);
  }
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
