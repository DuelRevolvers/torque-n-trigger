import { GarageStage } from '../render/garageStage.js';
import { CarView } from '../render/carView.js';
import { generateStarters, ARCHETYPES } from '../parts/starters.js';
import { computeBuild } from '../parts/build.js';
import { partName, SLOT_NAMES, QUALITY } from '../parts/catalog.js';
import { statBarsHtml } from '../ui/statBars.js';
import { newCareer, saveCareer } from '../career/career.js';

const SPACING = 6.8;

// Pick one of three generated starter cars, with one free reroll.
export class StarterScreen {
  constructor(app) {
    this.app = app;
    this.stage = new GarageStage(app.tex, [-SPACING, 0, SPACING]);
    this.views = [];
    this.focus = null; // index of the card being looked at on narrow screens
  }

  enter() {
    this.seed = (Date.now() >>> 0) % 1e9;
    this.rerolled = false;
    this.root = this.app.ui;
    this.roll();
  }

  exit() {
    this.clearCars();
    this.root.innerHTML = '';
  }

  clearCars() {
    this.views.forEach((v, i) => v.removeFrom(this.stage.tables[i]));
    this.views = [];
  }

  roll() {
    this.clearCars();
    this.starters = generateStarters(this.seed);
    this.computed = this.starters.map((s) => computeBuild(s.build));
    this.starters.forEach((s, i) => {
      const view = new CarView(s.build, this.computed[i], this.app.tex);
      view.addTo(this.stage.tables[i]);
      view.showcase();
      this.views.push(view);
    });
    this.renderUi();
  }

  renderUi() {
    const cards = this.starters
      .map((s, i) => {
        const r = this.computed[i];
        const parts = Object.entries(s.build.parts)
          .filter(([, p]) => p)
          .map(([slot, p]) => `<li><span>${SLOT_NAMES[slot]}</span><span class="q-${p.quality}">${partName(p)}</span></li>`)
          .join('');
        return `<div class="card" data-i="${i}">
          <div class="card-title"><span class="tag">${ARCHETYPES[s.archetype].name}</span> ${s.name}</div>
          <div class="card-sub">${partName(s.build.parts.chassis).replace(QUALITY[s.build.parts.chassis.quality].name + ' ', '')}</div>
          ${statBarsHtml(r.stats, null, r.pr, null, this.app.settings.units)}
          <ul class="parts">${parts}</ul>
          <button class="btn primary choose" data-i="${i}">CHOOSE</button>
        </div>`;
      })
      .join('');
    this.root.innerHTML = `<div class="screen starter">
      <div class="screen-head"><h1>CHOOSE YOUR RIDE</h1>
        <button class="btn reroll" ${this.rerolled ? 'disabled' : ''}>${this.rerolled ? 'REROLL USED' : 'FREE REROLL'}</button></div>
      <div class="cards">${cards}</div>
    </div>`;
    this.root.querySelector('.reroll').addEventListener('click', () => {
      if (this.rerolled) return;
      this.rerolled = true;
      this.seed += 7919;
      this.roll();
    });
    this.root.querySelectorAll('.choose').forEach((b) => b.addEventListener('click', () => this.choose(Number(b.dataset.i))));
    const cardsEl = this.root.querySelector('.cards');
    cardsEl.addEventListener('scroll', () => {
      // Narrow screens scroll one card at a time; aim the camera at that car.
      const w = cardsEl.firstElementChild?.getBoundingClientRect().width || 1;
      this.focus = Math.round(cardsEl.scrollLeft / w);
    });
  }

  choose(i) {
    const career = newCareer(this.starters[i], this.seed);
    saveCareer(career);
    this.app.career = career;
    this.app.go('garage');
  }

  step() {}

  render(alpha, dt) {
    this.stage.update(dt);
    this.views.forEach((v) => v.tick(performance.now() / 1000));
    const cam = this.stage.camera;
    const narrow = cam.aspect < 1.1;
    const target = narrow ? ((this.focus ?? 1) - 1) * SPACING : 0;
    const dist = narrow ? 9 : 16;
    cam.position.set(target, narrow ? 4.2 : 5.5, dist);
    cam.lookAt(target, narrow ? -1.6 : -3.4, 0);
    return { scene: this.stage.scene, camera: cam };
  }
}
