import { GarageStage } from '../render/garageStage.js';
import { CarView } from '../render/carView.js';
import { computeBuild } from '../parts/build.js';
import { EVENTS } from '../career/events.js';
import { tierForPr } from '../parts/drivers.js';

const TYPE_LABEL = { free: 'FREE DRIVE', sprint: 'SPRINT', circuit: 'CIRCUIT', arena: 'ARENA', drag: 'DRAG' };

// Pick an event. The player's car turns on the table behind the list.
export class EventScreen {
  constructor(app) {
    this.app = app;
    this.stage = new GarageStage(app.tex, [0]);
    this.view = null;
  }

  enter({ car }) {
    this.car = car;
    const computed = computeBuild(car.build);
    this.view = new CarView(car.build, computed, this.app.tex);
    this.view.addTo(this.stage.tables[0]);
    this.view.showcase();
    const tier = tierForPr(computed.pr);
    const scale = 1 + tier * 0.5;
    const cards = EVENTS.map((e) => `<button class="event-card" data-id="${e.id}">
        <span class="tag">${TYPE_LABEL[e.type]}</span>
        <b>${e.name}</b>
        <span class="event-desc">${e.desc}</span>
        <span class="event-meta">${e.cars > 1 ? `${e.cars} cars` : 'Solo'}${e.laps ? ` &middot; ${e.laps} laps` : ''}${e.timeLimit ? ` &middot; ${Math.round(e.timeLimit / 60)} min` : ''} &middot; ${e.purse ? `Purse <b>$${Math.round(e.purse * scale)}</b>` : 'No prizes'}</span>
      </button>`).join('');
    this.app.ui.innerHTML = `<div class="screen events">
      <div class="g-head"><div><h1>EVENTS</h1><div class="car-name">${car.name} &middot; PR ${computed.pr} &middot; $${this.app.career.cash}</div></div>
        <button class="btn back">&#9664; GARAGE</button></div>
      <div class="event-list">${cards}</div>
    </div>`;
    this.app.ui.querySelector('.back').addEventListener('click', () => this.app.go('garage'));
    this.app.ui.querySelectorAll('.event-card').forEach((b) =>
      b.addEventListener('click', () => this.app.go('race', { build: car.build, car, event: EVENTS.find((e) => e.id === b.dataset.id) })),
    );
  }

  exit() {
    this.view?.removeFrom(this.stage.tables[0]);
    this.view = null;
    this.app.ui.innerHTML = '';
  }

  step() {}

  render(alpha, dt) {
    this.stage.update(dt);
    this.view?.tick(performance.now() / 1000);
    const cam = this.stage.camera;
    const narrow = cam.aspect < 1.1;
    cam.position.set(narrow ? 5 : 3.5, narrow ? 4 : 2.8, narrow ? 9 : 7.5);
    cam.lookAt(narrow ? 0 : -2.2, narrow ? -1 : 0.6, 0);
    return { scene: this.stage.scene, camera: cam };
  }
}
