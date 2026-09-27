import * as THREE from 'three';
import { GarageStage } from '../render/garageStage.js';
import { CarView } from '../render/carView.js';
import { computeBuild, resolvePart } from '../parts/build.js';
import { SLOTS, SLOT_NAMES, REQUIRED_SLOTS, QUALITY, TRAITS, PART_TYPES, PAINT_COLORS, partName } from '../parts/catalog.js';
import { ARCHETYPES } from '../parts/starters.js';
import { statBarsHtml } from '../ui/statBars.js';
import { saveCareer, activeCar } from '../career/career.js';
import { checkInstall, installPart, removePart, repaint, withPart } from '../career/garage.js';
import { glowMaterial } from '../render/retroMaterial.js';
import { PALETTE } from '../render/textures.js';

// Stats shown on part cards: [label, unit, multiplier].
const PART_STATS = {
  torque: ['Torque', 'Nm'], redline: ['Redline', 'rpm'], power: ['Power', 'kW'], hp: ['HP', ''],
  armor: ['Armor', '%', 100], grip: ['Grip', ''], offroadGrip: ['Off-road grip', ''], brakeForce: ['Brake force', 'N'],
  turboBoost: ['Boost', '%', 100], force: ['Nitro force', 'N'], charges: ['Charges', ''], heatCapacity: ['Heat capacity', ''],
  dissipation: ['Cooling', ''], damage: ['Damage', ''], fireRate: ['Fire rate', '/s'], range: ['Range', 'm'],
  rollCage: ['Roll cage', '%', 100], controls: ['Controls', '%', 100], electronics: ['Electronics', '%', 100],
  aero: ['Aero', '%', 100], ramDamage: ['Ram damage', ''], downforce: ['Downforce', ''], capacity: ['Fuel', 'L'],
  shiftTime: ['Shift time', 's'], weightCapacity: ['Weight capacity', 'kg'], handling: ['Handling', 'x'],
  torqueBonus: ['Power bonus', '%', 100], powerDraw: ['Power draw', 'kW'], cooldown: ['Cooldown', 's'],
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const num = (v) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100);

function partStatsHtml(part) {
  const eff = resolvePart(part);
  const rows = Object.entries(PART_STATS)
    .filter(([k]) => typeof eff[k] === 'number' && eff[k] !== 0)
    .slice(0, 5)
    .map(([k, [label, unit, mul = 1]]) => `<span>${label} <b>${num(eff[k] * mul)}${unit}</b></span>`);
  if (eff.weight) rows.push(`<span>Weight <b>${Math.round(eff.weight)}kg</b></span>`);
  if (eff.size) rows.push(`<span>Size <b>${eff.size}</b></span>`);
  return `<div class="part-stats">${rows.join('')}</div>`;
}

function partCardHtml(part) {
  const traits = part.traits.map((t) => `<span class="trait" title="${TRAITS[t].desc}">${TRAITS[t].name}</span>`).join('');
  return `<div class="part-card">
    <div class="part-name q-${part.quality}">${esc(partName(part))}</div>
    <div class="part-meta">${traits} <span class="cond">Condition ${Math.round(part.condition)}%</span></div>
    ${partStatsHtml(part)}
  </div>`;
}

export class GarageScreen {
  constructor(app) {
    this.app = app;
    this.stage = new GarageStage(app.tex, [0]);
    this.table = this.stage.tables[0];
    this.view = null;
    this.highlight = null;
    this.camPos = new THREE.Vector3(6, 3, 7);
    this.camTarget = new THREE.Vector3(0, 0.6, 0);
    this.dragging = null;
    this.idleSpinAt = 0;

    const canvas = app.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      if (this.app.current !== this) return;
      this.dragging = e.clientX;
    });
    window.addEventListener('pointermove', (e) => {
      if (this.dragging === null) return;
      this.table.rotation.y += (e.clientX - this.dragging) * 0.01;
      this.dragging = e.clientX;
      this.idleSpinAt = performance.now() + 4000;
    });
    window.addEventListener('pointerup', () => (this.dragging = null));
  }

  enter() {
    this.root = this.app.ui;
    this.car = activeCar(this.app.career);
    this.slot = null;
    this.previewUid = null;
    this.refresh();
  }

  exit() {
    this.setView(null);
    this.root.innerHTML = '';
  }

  // Rebuilds stats, the 3D car (current or preview build) and the UI.
  refresh() {
    this.computed = computeBuild(this.car.build);
    this.preview = null;
    if (this.previewUid) {
      const part = this.app.career.inventory.find((p) => p.uid === this.previewUid);
      const check = checkInstall(this.car.build, part);
      this.preview = { part, ...check };
    }
    const shown = this.preview?.ok ? { build: withPart(this.car.build, this.preview.part), computed: this.preview.result } : { build: this.car.build, computed: this.computed };
    const view = new CarView(shown.build, shown.computed, this.app.tex);
    this.setView(view);
    this.renderUi();
  }

  setView(view) {
    if (this.view) this.view.removeFrom(this.table);
    this.view = view;
    this.highlight = null;
    if (!view) return;
    view.addTo(this.table);
    view.showcase();
    this.updateHighlight();
  }

  updateHighlight() {
    if (!this.view || !this.slot) return;
    const focus = this.view.slotFocus(this.slot);
    if (!focus) return;
    const size = focus.box ? focus.box.getSize(new THREE.Vector3()).addScalar(0.12) : new THREE.Vector3(0.7, 0.7, 0.7);
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z));
    this.highlight = new THREE.LineSegments(edges, glowMaterial({ color: PALETTE.amber, intensity: 3, transparent: true }));
    this.highlight.position.copy(focus.center);
    this.view.group.add(this.highlight);
  }

  select(slot) {
    this.slot = this.slot === slot ? null : slot;
    this.previewUid = null;
    this.refresh();
  }

  save() {
    saveCareer(this.app.career);
  }

  renderUi() {
    const { career } = this.app;
    const car = this.car;
    const parts = car.build.parts;
    const slotButtons = SLOTS.map((slot) => {
      const p = parts[slot];
      return `<button class="slot-btn ${slot === this.slot ? 'active' : ''} ${p ? '' : 'empty'}" data-slot="${slot}">
        <span>${SLOT_NAMES[slot]}</span><small class="${p ? `q-${p.quality}` : ''}">${p ? esc(partName(p)) : '&mdash; empty &mdash;'}</small></button>`;
    }).join('');

    const pv = this.preview;
    const stats = statBarsHtml(this.computed.stats, pv?.ok ? pv.result.stats : null, this.computed.pr, pv?.ok ? pv.result.pr : null);
    const weightLine = `<div class="build-line">Weight <b>${Math.round(this.computed.weight)}</b> / ${Math.round(this.computed.capacity)} kg &middot; Power <b>${Math.round(this.computed.powerDraw)}</b> / ${Math.round(this.computed.powerSupply)} kW</div>`;
    const warnings = (pv?.ok ? pv.result.warnings : this.computed.warnings).map((w) => `<div class="warn">${esc(w)}</div>`).join('');

    let detail = `<div class="hint">Select a slot to inspect or swap parts. Drag the car to turn it.</div>`;
    if (this.slot === 'paint') {
      const cur = parts.paint;
      detail = `<h2>Paint job</h2>
        <div class="swatches">${PAINT_COLORS.map((c) => `<button class="swatch ${cur?.color === c ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>
        <div class="finishes">${Object.entries(PART_TYPES.paint).map(([id, t]) => `<button class="btn small finish ${cur?.type === id ? 'on' : ''}" data-finish="${id}">${t.name}</button>`).join('')}</div>
        <div class="hint">Cosmetic only. Free until the economy arrives.</div>`;
    } else if (this.slot) {
      const installed = parts[this.slot];
      const spares = career.inventory.filter((p) => p.slot === this.slot);
      const rows = spares.map((p) => {
        const check = checkInstall(car.build, p);
        return `<button class="spare ${p.uid === this.previewUid ? 'on' : ''} ${check.ok ? '' : 'bad'}" data-uid="${p.uid}">
          <span class="q-${p.quality}">${esc(partName(p))}</span><small>${check.ok ? 'Fits' : 'Won’t fit'}</small></button>`;
      }).join('');
      detail = `<h2>${SLOT_NAMES[this.slot]}</h2>
        ${installed ? partCardHtml(installed) : '<div class="hint">Nothing installed.</div>'}
        ${installed && !REQUIRED_SLOTS.includes(this.slot) ? '<button class="btn small remove">REMOVE TO INVENTORY</button>' : ''}
        <h3>Spare parts (${spares.length})</h3>
        <div class="spares">${rows || '<div class="hint">No spares for this slot. Shops and salvage arrive later.</div>'}</div>
        ${pv ? `<div class="preview">${partCardHtml(pv.part)}${pv.ok ? '' : `<div class="err">${esc(pv.reason)}</div>`}
          <div class="row"><button class="btn primary install" ${pv.ok ? '' : 'disabled'}>INSTALL</button><button class="btn small cancel">CANCEL</button></div></div>` : ''}`;
    }

    this.root.innerHTML = `<div class="screen garage">
      <div class="g-head">
        <div><h1>GARAGE</h1><div class="car-name">${esc(car.name)} <span class="tag">${ARCHETYPES[car.archetype]?.name || ''}</span></div></div>
        <button class="btn primary race">RACE &#9654;</button>
      </div>
      <div class="g-slots">${slotButtons}</div>
      <div class="g-side">
        <div class="g-stats">${stats}${weightLine}${warnings}</div>
        <div class="g-detail">${detail}</div>
      </div>
    </div>`;

    const on = (sel, fn) => this.root.querySelectorAll(sel).forEach((el) => el.addEventListener('click', () => fn(el)));
    on('.slot-btn', (el) => this.select(el.dataset.slot));
    on('.race', () => this.app.go('race', { build: this.car.build }));
    on('.spare', (el) => {
      this.previewUid = this.previewUid === el.dataset.uid ? null : el.dataset.uid;
      this.refresh();
    });
    on('.cancel', () => {
      this.previewUid = null;
      this.refresh();
    });
    on('.install', () => {
      if (installPart(career, car, this.previewUid).ok) {
        this.previewUid = null;
        this.save();
        this.refresh();
      }
    });
    on('.remove', () => {
      if (removePart(career, car, this.slot).ok) {
        this.save();
        this.refresh();
      }
    });
    on('.swatch', (el) => {
      repaint(car, { color: el.dataset.color });
      this.save();
      this.refresh();
    });
    on('.finish', (el) => {
      repaint(car, { finish: el.dataset.finish });
      this.save();
      this.refresh();
    });
  }

  step() {}

  render(alpha, dt) {
    const now = performance.now();
    this.stage.spin[0] = !this.slot && this.dragging === null && now > this.idleSpinAt;
    this.stage.update(dt);
    this.view?.tick(now / 1000);
    if (this.highlight) this.highlight.material.opacity = 0.55 + 0.45 * Math.sin(now / 180);

    // Camera: wide three-quarter view, or zoomed onto the selected slot.
    const cam = this.stage.camera;
    const narrow = cam.aspect < 1.1;
    const goalPos = new THREE.Vector3();
    const goalTarget = new THREE.Vector3();
    const focus = this.slot && this.view ? this.view.slotFocus(this.slot) : null;
    if (focus) {
      const world = this.view.group.localToWorld(focus.center.clone());
      const center = this.view.group.localToWorld(new THREE.Vector3(0, 0.2, 0));
      const dir = world.clone().sub(center).setY(0);
      if (dir.lengthSq() < 0.3) dir.copy(this.camPos).sub(center).setY(0);
      dir.normalize();
      const dist = 2.8 + focus.radius * 2.5 + (narrow ? 1.5 : 0);
      goalTarget.copy(world);
      goalPos.copy(world).addScaledVector(dir, dist).add(new THREE.Vector3(0, 1.1, 0));
    } else {
      goalTarget.set(0, narrow ? 0.2 : 0.7, 0);
      goalPos.set(narrow ? 5.5 : 6.5, narrow ? 3.8 : 3.0, narrow ? 9 : 7.5);
      // Keep the car left of the side panel on wide screens.
      if (!narrow) goalTarget.x = 0.8;
    }
    const k = 1 - Math.exp(-5 * dt);
    this.camPos.lerp(goalPos, k);
    this.camTarget.lerp(goalTarget, k);
    cam.position.copy(this.camPos);
    cam.lookAt(this.camTarget);
    return { scene: this.stage.scene, camera: cam };
  }
}
