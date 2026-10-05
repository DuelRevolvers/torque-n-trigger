// Customize Car (the button left of Test drive): the car the T&T SDK's test
// drives use, made the way a custom car is in the Texture Lab's showroom: the
// game's own car model (CarView) on a turntable, a part picked per slot, one
// quality, paint and light colours. Or, as before, a random starter car each
// drive. Kept for the game in content/library.js (parts/customCar.js builds it).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createEnvMap, PALETTE } from '../render/textures.js';
import { standardMaterial, glowMaterial } from '../render/retroMaterial.js';
import { applyCarTextures } from '../render/carTextures.js';
import { CarView } from '../render/carView.js';
import { SLOTS, SLOT_NAMES, REQUIRED_SLOTS, PART_TYPES, QUALITIES, PAINT_COLORS, LIGHT_COLORS } from '../parts/catalog.js';
import { computeBuild, canFit } from '../parts/build.js';
import { TEST_CAR, customBuild, randomDesign } from '../parts/customCar.js';
import { sdkGet, sdkPut } from '../content/library.js';

const LINES = 360; // drawn at the game's low resolution, with its neon bloom
const HOME = { yaw: 0.9, pitch: 0.3, dist: 6, target: [0, 0.7, 0] };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const typesOf = (slot) => Object.keys(PART_TYPES[slot]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let ed = null; // the editor, made the first time it opens
export const carEditorOpen = () => !!ed && !ed.root.hidden;

export function openCarEditor(tex) {
  if (carEditorOpen()) return;
  ed ||= makeEditor(tex);
  const saved = sdkGet(TEST_CAR);
  ed.use = !!saved?.use;
  ed.design = saved?.design ? structuredClone(saved.design) : randomDesign(0.7);
  ed.root.hidden = false;
  renderSide();
  showUse();
  rebuild();
  Object.assign(ed.cam, HOME, { target: [...HOME.target] });
  requestAnimationFrame(frame);
}

function closeCarEditor() {
  if (ed) ed.root.hidden = true;
}

// While it's open the editor has the keyboard (Esc closes it); the SDK's keys wait.
window.addEventListener('keydown', (e) => {
  if (!carEditorOpen()) return;
  e.stopImmediatePropagation();
  if (e.code === 'Escape') {
    e.preventDefault();
    closeCarEditor();
  }
}, { capture: true });

function makeEditor(tex) {
  const root = document.createElement('div');
  root.id = 'car-editor';
  root.hidden = true;
  root.innerHTML = `<div class="ce-box" role="dialog" aria-label="Customize car">
    <div class="ce-head">
      <h3>Customize Car</h3>
      <span class="ce-use">Test drive in
        <button data-use="1" title="Test drives use the car made here">This car</button>
        <button data-use="0" title="Test drives use a random starter car in a random colour, a new one each drive">A random car</button>
      </span>
      <span style="margin-left: auto"></span>
      <button class="go" data-act="done" title="Close (Esc)">Done</button>
    </div>
    <div class="ce-body">
      <div class="ce-main">
        <div class="ce-view"><canvas></canvas><div class="ce-badge"></div><div class="ce-hint">drag to turn · wheel to zoom</div></div>
        <div class="ce-tools">
          <button data-act="random" title="Every part the car needs and some others, all at random">Random</button>
          <button data-act="fill" title="A part in every empty slot">Fill all slots</button>
          <button data-act="bare" title="Only what the car needs to drive">Bare</button>
          <button data-act="whole" title="Look at the whole car">Whole car</button>
          <button data-act="spin" title="Turn the turntable">Spin</button>
        </div>
        <div class="ce-msg"></div>
      </div>
      <div class="ce-side"></div>
    </div>
  </div>`;
  document.body.appendChild(root);

  // Its own renderer: the showroom from the Texture Lab.
  const canvas = root.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(1);
  const env = createEnvMap(renderer);
  const carTex = { ...tex, env, carTextures: applyCarTextures };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#07050d');
  scene.fog = new THREE.Fog('#07050d', 18, 45);
  scene.add(new THREE.HemisphereLight('#5a5aa0', '#120a1e', 1.2));
  const key = new THREE.DirectionalLight('#c8d0ff', 1.4);
  key.position.set(3, 6, 4);
  scene.add(key);
  for (const [c, x] of [[PALETTE.pink, -4], [PALETTE.cyan, 4]]) {
    const l = new THREE.PointLight(c, 30, 14, 1.6);
    l.position.set(x, 2.5, 1);
    scene.add(l);
  }
  const floorTex = tex.ground.clone();
  floorTex.repeat.set(12, 12);
  floorTex.needsUpdate = true;
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), standardMaterial({ map: floorTex, roughness: 0.3, metalness: 0.3, envMap: env, envMapIntensity: 0.8 })));
  const table = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.06, 32), standardMaterial({ color: '#1a1826', metalness: 0.6, roughness: 0.35, envMap: env }));
  table.position.y = 0.03;
  scene.add(table);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.03, 4, 48).rotateX(Math.PI / 2), glowMaterial({ color: PALETTE.pink, intensity: 2 }));
  ring.position.y = 0.06;
  scene.add(ring);
  const stand = new THREE.Group(); // y = 0 is the turntable top, as CarView.showcase() expects
  stand.position.y = 0.06;
  scene.add(stand);

  const camera = new THREE.PerspectiveCamera(68, 16 / 10, 0.1, 100);
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(1);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(576, LINES), 0.55, 0.35, 0.9));
  composer.addPass(new OutputPass());

  const e = { root, canvas, renderer, composer, camera, stand, tex: carTex, cam: { ...HOME, target: [...HOME.target] }, car: null, spin: false, use: false, design: null, last: 0 };

  // Turning round the car and zooming.
  let drag = null;
  canvas.addEventListener('pointerdown', (ev) => {
    drag = { x: ev.clientX, y: ev.clientY, yaw: e.cam.yaw, pitch: e.cam.pitch };
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    e.cam.yaw = drag.yaw - (ev.clientX - drag.x) * 0.006;
    e.cam.pitch = clamp(drag.pitch + (ev.clientY - drag.y) * 0.004, -0.05, 1.3);
  });
  canvas.addEventListener('pointerup', () => (drag = null));
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    e.cam.dist = clamp(e.cam.dist * (1 + Math.sign(ev.deltaY) * 0.1), 2.2, 16);
  }, { passive: false });

  // (A click on the dimmed SDK round it closes it too.)
  root.addEventListener('pointerdown', (ev) => {
    if (ev.target === root) closeCarEditor();
  });
  root.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () => {
    ed.use = b.dataset.use === '1';
    showUse();
    save();
  }));
  const act = {
    done: closeCarEditor,
    random: () => restyle(randomDesign(0.7)),
    fill: () => {
      for (const slot of SLOTS) ed.design.types[slot] ||= typesOf(slot)[0];
      changed('chassis');
    },
    bare: () => {
      for (const slot of SLOTS) if (!REQUIRED_SLOTS.includes(slot) && slot !== 'paint' && slot !== 'lights') ed.design.types[slot] = null;
      changed('chassis');
    },
    whole: () => focus(null),
    spin: (b) => {
      ed.spin = !ed.spin;
      b.classList.toggle('on', ed.spin);
    },
  };
  root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act[b.dataset.act](b)));
  return e;
}

// A new design altogether (Random): its colours and quality too.
function restyle(design) {
  ed.design = design;
  changed('chassis');
}

// The design changed: it's the test drive car from now on.
function changed(focusSlot) {
  ed.use = true;
  showUse();
  renderSide();
  rebuild(focusSlot);
  save();
}

function save() {
  sdkPut(TEST_CAR, { use: ed.use, design: ed.design }).catch((err) => console.warn('test car:', err));
}

function showUse() {
  ed.root.querySelectorAll('[data-use]').forEach((b) => b.classList.toggle('on', (b.dataset.use === '1') === ed.use));
}

// Quality, colours, then a part per slot (as in the Texture Lab's showroom).
function renderSide() {
  const d = ed.design;
  const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
  const swatches = (kind, list, current) =>
    list.map((c) => `<button class="swatch${c.toLowerCase() === (current || '').toLowerCase() ? ' on' : ''}" data-${kind}="${c}" style="background:${c}" title="${c}" aria-label="${c}"></button>`).join('');
  const rows = [
    `<div class="ce-row"><label>Quality</label><select data-quality>${QUALITIES.map((q) => opt(q.id, q.name, q.id === d.quality)).join('')}${opt('mixed', 'Mixed (all six)', d.quality === 'mixed')}</select></div>`,
    `<h4>Paint</h4><div class="ce-swatches">${swatches('paint', PAINT_COLORS, d.paint)}<input type="color" data-paint-pick value="${esc(d.paint || '#c8203c')}" title="Any colour" /></div>`,
    `<h4>Lights</h4><div class="ce-swatches">${swatches('light', LIGHT_COLORS, d.light)}</div>`,
    '<h4>Parts</h4>',
  ];
  for (const slot of SLOTS) {
    const none = REQUIRED_SLOTS.includes(slot) ? '' : opt('', '— none —', !d.types[slot]);
    rows.push(`<div class="ce-row"><label>${esc(SLOT_NAMES[slot] || slot)}</label><select data-slot="${slot}">${none}${typesOf(slot).map((t) => opt(t, PART_TYPES[slot][t].name || t, d.types[slot] === t)).join('')}</select></div>`);
  }
  const side = ed.root.querySelector('.ce-side');
  side.innerHTML = rows.join('');
  side.querySelector('[data-quality]').addEventListener('change', (ev) => {
    d.quality = ev.target.value;
    changed();
  });
  side.querySelectorAll('[data-paint]').forEach((b) => b.addEventListener('click', () => {
    d.paint = b.dataset.paint;
    changed('paint');
  }));
  side.querySelector('[data-paint-pick]').addEventListener('change', (ev) => {
    d.paint = ev.target.value;
    changed('paint');
  });
  side.querySelectorAll('[data-light]').forEach((b) => b.addEventListener('click', () => {
    d.light = b.dataset.light;
    changed('lights');
  }));
  side.querySelectorAll('[data-slot]').forEach((sel) => sel.addEventListener('change', () => {
    d.types[sel.dataset.slot] = sel.value || null;
    changed(sel.dataset.slot);
  }));
}

// The car on the turntable, rebuilt as the test drive will build it.
function rebuild(focusSlot) {
  const build = customBuild(ed.design);
  const computed = computeBuild(build);
  const misfits = [];
  for (const slot of SLOTS) {
    const part = build.parts[slot];
    const fit = part && slot !== 'chassis' ? canFit(build, part) : { ok: true };
    ed.root.querySelector(`[data-slot="${slot}"]`)?.classList.toggle('bad', !fit.ok);
    if (!fit.ok) misfits.push(`${SLOT_NAMES[slot]}: ${fit.reason}`);
  }
  const msg = ed.root.querySelector('.ce-msg');
  msg.innerHTML = [
    misfits.length ? `<span class="warn">Wouldn't fit in the garage (drives anyway): ${esc(misfits.join(' · '))}</span>` : '',
    ...(computed.warnings || []).map((w) => `<span class="amber">${esc(w)}</span>`),
  ].filter(Boolean).join('<br>');
  if (!computed.params) return;
  ed.root.querySelector('.ce-badge').textContent = `PR ${computed.pr}`;
  if (ed.car) ed.car.removeFrom(ed.stand);
  ed.car = new CarView(build, computed, ed.tex);
  ed.car.showcase();
  ed.stand.add(ed.car.group, ed.car.shadow);
  if (focusSlot) focus(focusSlot);
}

// The camera on the part just changed (chassis, paint: the whole car).
function focus(slot) {
  const f = slot ? ed.car?.slotFocus(slot) : null;
  if (!f) return Object.assign(ed.cam, HOME, { target: [...HOME.target] });
  ed.stand.updateMatrixWorld(true);
  const c = ed.car.group.localToWorld(f.center.clone());
  ed.cam.target = [c.x, c.y, c.z];
  ed.cam.dist = Math.max(2.2, f.radius * 5);
}

function frame(now) {
  if (!carEditorOpen()) return;
  const dt = Math.min(0.1, (now - ed.last) / 1000);
  ed.last = now;
  if (ed.spin) ed.stand.rotation.y += dt * 0.4;
  ed.car?.tick(now / 1000);
  const { canvas, renderer, composer, camera, cam } = ed;
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const w = Math.max(1, Math.round(LINES * aspect));
  if (canvas.width !== w || canvas.height !== LINES) {
    renderer.setSize(w, LINES, false);
    composer.setSize(w, LINES);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
  const [tx, ty, tz] = cam.target;
  camera.position.set(tx + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist, ty + Math.sin(cam.pitch) * cam.dist, tz + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist);
  camera.lookAt(tx, ty, tz);
  composer.render();
  requestAnimationFrame(frame);
}
