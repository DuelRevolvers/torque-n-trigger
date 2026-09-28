import * as THREE from 'three';
import { buildTrack } from '../sim/track.js';
import { buildArena } from '../sim/arena.js';
import { getVenue } from '../sim/tracks/venues.js';
import { createWorld, stepWorld } from '../sim/world.js';
import { createEventState, gridPoses, standings, resolvePit } from '../sim/event.js';
import { districtMap } from '../sim/city.js';
import { InputQueue, neutralInput } from '../sim/input.js';
import { initAi, aiInput } from '../sim/ai.js';
import { WEAPON_BEHAVIOR } from '../sim/combat.js';
import { SIM_DT } from '../config.js';
import { computeBuild } from '../parts/build.js';
import { DRIVERS, buildDriver, tierForPr } from '../parts/drivers.js';
import { partType, partName } from '../parts/catalog.js';
import { saveCareer } from '../career/career.js';
import { DISTRICTS } from '../career/districts.js';
import { EVENTS, computeRewards, rollSalvage, ordinal } from '../career/events.js';
import { PALETTE } from '../render/textures.js';
import { buildTrackView } from '../render/trackView.js';
import { buildCityView } from '../render/cityView.js';
import { buildArenaView } from '../render/arenaView.js';
import { buildDistrictView } from '../render/districtView.js';
import { additiveMaterial } from '../render/retroMaterial.js';
import { CarView } from '../render/carView.js';
import { CameraRig } from '../render/cameraRig.js';
import { Rain } from '../render/rain.js';
import { Fx } from '../render/fx.js';
import { SpeedLines } from '../render/speedLines.js';
import { formatTime } from '../ui/hud.js';

const hashId = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Params come from a pristine copy of the build; wear is tracked in the sim as
// per-part condition and written back to the career car on exit.
const pristine = (build) => ({
  parts: Object.fromEntries(Object.entries(build.parts).map(([s, p]) => [s, p && { ...p, condition: 100 }])),
});
const conditionsOf = (build) =>
  Object.fromEntries(Object.entries(build.parts).filter(([s, p]) => p && s !== 'chassis' && s !== 'paint').map(([s, p]) => [s, p.condition ?? 100]));

// Runs one event: countdown, the race or fight against AI, then results with
// cash and salvage paid into the career.
export class RaceScreen {
  constructor(app) {
    this.app = app;
    const scene = new THREE.Scene();
    this.hemi = new THREE.HemisphereLight('#6a70c0', '#1a0b2e', 1.4);
    scene.add(this.hemi);
    const moon = new THREE.DirectionalLight('#9ab8ff', 1.2);
    moon.position.set(-0.4, 1, 0.3);
    scene.add(moon);
    this.rain = new Rain();
    scene.add(this.rain.mesh);
    this.fx = new Fx(scene, app.tex);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.3, 1500);
    scene.add(this.camera); // speed lines ride on the camera
    this.speedLines = new SpeedLines(this.camera);
    this.speedFx = 0;
    this.venues = new Map();
    this.envs = new Map(); // district environments, shared by that district's events
    this.poses = [];
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();
    this.time = 0;
    this.shake = 0;
  }

  // Venue geometry is built once and cached (the last few only; they're big).
  venue(def) {
    const id = def.venue;
    const key = `${id}:${def.finishS || ''}:${def.pit ? 'pit' : ''}`;
    if (this.venues.has(key)) return this.venues.get(key);
    if (this.venues.size >= 3) {
      const [oldKey, old] = this.venues.entries().next().value;
      this.scene.remove(old.group);
      old.group.traverse((o) => o.geometry?.dispose());
      this.venues.delete(oldKey);
    }
    const v = getVenue(id, def);
    const tex = this.app.tex;
    let track;
    let animate = null;
    const group = new THREE.Group();
    if (v.kind === 'arena') {
      track = buildArena(v.def);
      if (!v.def.roam) {
        const view = buildArenaView(track, tex, { outdoor: !!def.city, look: def.city?.look });
        animate = view.userData.animate;
        group.add(view);
      }
    } else {
      track = buildTrack(v.def);
      if (def.finishS) track.finishS = def.finishS;
      if (def.city) {
        group.add(buildTrackView(track, tex, { city: true, sidewalk: def.city.rooftop ? tex.lot : tex.sidewalk, barrierColor: def.city.look.barrier, look: def.city.look }));
      } else {
        group.add(buildTrackView(track, tex), buildCityView(track, tex));
      }
      if (def.pit) group.add(pitZoneMesh(track, resolvePit(def.pit, track), tex));
    }
    group.visible = false;
    this.scene.add(group);
    const entry = { track, group, outdoor: v.kind !== 'arena' || !!def.city, animate };
    this.venues.set(key, entry);
    return entry;
  }

  // The whole district around the route (built once per district, last two kept).
  env(style) {
    if (this.envs.has(style.id)) return this.envs.get(style.id);
    if (this.envs.size >= 2) {
      const [oldKey, old] = this.envs.entries().next().value;
      this.scene.remove(old);
      old.traverse((o) => o.geometry?.dispose());
      this.envs.delete(oldKey);
    }
    const group = buildDistrictView(districtMap(style), this.app.tex);
    this.scene.add(group);
    this.envs.set(style.id, group);
    return group;
  }

  enter({ build, car, event }) {
    this.args = { build, car, event };
    this.def = event || EVENTS.find((e) => e.type === 'circuit');
    this.careerCar = car || null;
    if (this.careerCar && this.def.entryFee && this.app.career) {
      this.app.career.cash -= this.def.entryFee;
      saveCareer(this.app.career);
    }
    for (const v of this.venues.values()) v.group.visible = false;
    const venue = this.venue(this.def);
    this.venueEntry = venue;
    venue.group.visible = true;
    for (const env of this.envs.values()) env.visible = false;
    if (this.def.city) this.env(this.def.city).visible = true;
    this.track = venue.track;
    this.outdoor = venue.outdoor;
    // District look and event modifiers.
    const theme = DISTRICTS.find((d) => d.id === this.def.district)?.theme;
    const mods = this.def.modifiers || [];
    const blackout = mods.includes('blackout');
    const haze = mods.includes('acidRain') ? '#10241a' : theme?.haze || PALETTE.haze;
    this.scene.fog = venue.outdoor
      ? new THREE.FogExp2(haze, (theme?.fog || 0.0045) * (blackout ? 2.4 : 1))
      : new THREE.Fog('#07050d', blackout ? 15 : 40, blackout ? 70 : 160);
    this.hemi.intensity = blackout ? 0.3 : 1.4;
    this.forceRain = mods.includes('acidRain');
    this.scene.background = venue.outdoor ? this.app.tex.sky : new THREE.Color('#07050d');

    // AI field: random named drivers at a tier matching the player's car.
    const seed = Math.floor(Math.random() * 1e9);
    this.seed = seed;
    // Career events run at their district's tier; a rival or boss (one tier up)
    // always takes the first AI slot.
    this.tier = this.def.tier ?? tierForPr(computeBuild(build).pr);
    const special = this.def.driver || this.def.rivalDriver || null;
    const pool = [...DRIVERS].sort((a, b) => ((hashId(a.id) ^ seed) >>> 0) - ((hashId(b.id) ^ seed) >>> 0)).filter((d) => d.id !== special);
    const drivers = [...(special ? [DRIVERS.find((d) => d.id === special)] : []), ...pool].slice(0, this.def.cars - 1);
    const fieldTier = special ? Math.max(0, this.tier - 1) : this.tier;
    const entries = drivers.map((d, k) => buildDriver(d, special && k === 0 ? this.tier : fieldTier, seed + k));
    this.specialIndex = special ? 1 : -1;
    this.names = ['YOU', ...entries.map((e, k) => (special && k === 0 ? `${e.name} ${this.def.boss ? 'BOSS' : 'RIVAL'}` : e.name))];
    this.builds = [build, ...entries.map((e) => e.build)];
    this.computed = this.builds.map((b) => computeBuild(pristine(b)));
    const n = this.builds.length;
    this.world = createWorld({
      track: this.track,
      cars: this.builds.map((b, i) => ({ params: this.computed[i].params, conditions: conditionsOf(b) })),
      poses: gridPoses(this.track, this.def, n),
      event: createEventState(this.def, this.track),
      respawnOnWreck: !(this.def.type === 'arena' && this.def.mode === 'lastStanding'),
    });
    entries.forEach((e, k) => initAi(this.world.state.cars[k + 1], e.personality, seed + 31 * k));
    this.queue = new InputQueue();
    this.lastFrame = neutralInput();
    this.views = this.builds.map((b, i) => this.makeView(i));
    this.cameraRig = new CameraRig(this.camera, this.track);
    this.prevPoses = this.capturePoses();
    this.victims = new Set();
    this.pickupMeshes = this.world.state.event.pickups.map((pk) => {
      const m = makePickupMesh(pk.type);
      m.position.set(pk.x, pk.y, pk.z);
      this.scene.add(m);
      return m;
    });
    this.popups = [];
    this.resultsAt = null;
    this.resultsShown = false;
    this.app.ui.innerHTML = '';
    const b = build;
    this.label = `PR ${computeBuild(b).pr}  ${partType(b.parts.chassis).name} / ${partType(b.parts.engine).name}`;
  }

  makeView(i) {
    const view = new CarView(this.builds[i], this.computed[i], this.app.tex);
    view.addTo(this.scene);
    return view;
  }

  exit() {
    // Wear from this outing stays on the car until it's repaired in the garage.
    if (this.careerCar) {
      const cond = this.world.state.cars[0].condition;
      for (const [slot, value] of Object.entries(cond)) {
        const part = this.careerCar.build.parts[slot];
        if (part) part.condition = Math.round(value * 10) / 10;
      }
      saveCareer(this.app.career);
    }
    for (const v of this.views) v.removeFrom(this.scene);
    for (const m of this.pickupMeshes) this.scene.remove(m);
    this.app.ui.innerHTML = '';
    this.app.hud.clear();
  }

  capturePoses() {
    return this.world.state.cars.map((c) => ({ pos: { ...c.pos }, quat: { ...c.quat } }));
  }

  step() {
    const { state } = this.world;
    const tick = state.tick;
    this.lastFrame = this.app.localInput.sample();
    this.queue.push(tick, this.lastFrame);
    state.cars[0].invulnerable = !!this.app.settings.godMode;
    const inputs = [this.queue.take(tick)];
    for (let i = 1; i < state.cars.length; i++) inputs.push(aiInput(this.world, i, SIM_DT));
    this.prevPoses = this.capturePoses();
    stepWorld(this.world, inputs);
    // Wrong way: moving against the track direction for over a second.
    const car = state.cars[0];
    const i = car.trackIndex;
    const racing = !this.track.isArena && state.event.phase === 'racing' && !car.wrecked && i >= 0;
    const along = racing ? car.vel.x * this.track.tx[i] + car.vel.z * this.track.tz[i] : 0;
    this.wrongWay = along < -4 ? (this.wrongWay || 0) + SIM_DT : along > 1 || !racing ? 0 : this.wrongWay || 0;
  }

  pose(i, alpha) {
    const a = this.prevPoses[i];
    const b = this.world.state.cars[i];
    const pose = (this.poses[i] ||= { pos: new THREE.Vector3(), quat: new THREE.Quaternion() });
    pose.pos.set(a.pos.x + (b.pos.x - a.pos.x) * alpha, a.pos.y + (b.pos.y - a.pos.y) * alpha, a.pos.z + (b.pos.z - a.pos.z) * alpha);
    this._qa.set(a.quat.x, a.quat.y, a.quat.z, a.quat.w);
    this._qb.set(b.quat.x, b.quat.y, b.quat.z, b.quat.w);
    pose.quat.slerpQuaternions(this._qa, this._qb, alpha);
    return pose;
  }

  // Health bars and names over other cars, and the lock-on reticle.
  markers(player) {
    const out = [];
    const { state, params } = this.world;
    const w = params[0].weapons?.primary;
    const beh = w && WEAPON_BEHAVIOR[w.type];
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.views[0].group.quaternion);
    let lock = -1;
    let best = Infinity;
    state.cars.forEach((c, j) => {
      if (j === 0 || c.wrecked) return;
      const to = new THREE.Vector3(c.pos.x - player.pos.x, c.pos.y - player.pos.y, c.pos.z - player.pos.z);
      const d = to.length();
      if (beh && d < w.range && beh.cone < 1 && state.event?.weapons !== 'rear') {
        const angle = to.angleTo(fwd);
        if (angle < beh.cone && angle < best) {
          best = angle;
          lock = j;
        }
      }
      if (d > 90) return;
      const p = new THREE.Vector3(c.pos.x, c.pos.y + 1.6, c.pos.z).project(this.camera);
      if (p.z > 1) return;
      out.push({ x: p.x, y: p.y, hp: c.hp / c.maxHp, id: j, name: this.names[j] });
    });
    for (const m of out) m.lock = m.id === lock;
    return out;
  }

  popup(text, color) {
    this.popups.unshift({ text, color, age: 0 });
    this.popups.length = Math.min(this.popups.length, 4);
  }

  eventInfo() {
    const { state } = this.world;
    const ev = state.event;
    const car = state.cars[0];
    const alive = state.cars.filter((c) => !c.wrecked).length;
    const title = {
      free: `LAP ${Math.max(1, car.race.lap)}`,
      circuit: `LAP ${Math.min(Math.max(1, car.race.lap), ev.laps)}/${ev.laps}`,
      sprint: 'SPRINT',
      drag: 'DRAG',
      arena: ev.mode === 'lastStanding' ? 'LAST STANDING' : 'BRAWL',
    }[ev.type];
    let sub = '';
    if (ev.type === 'free') sub = 'FREE ROAM';
    if (ev.type === 'arena') {
      const left = Math.max(0, ev.timeLimit - ev.time);
      sub = ev.mode === 'lastStanding' ? `ALIVE ${alive}` : `LEFT ${formatTime(left * 60).slice(0, -3)}`;
    } else if (ev.type !== 'circuit' && ev.type !== 'free') {
      sub = `${Math.min(100, Math.round((car.trackS / ev.finishS) * 100))}% DONE`;
    }
    const place = ev.finished.indexOf(0) + 1;
    return {
      title,
      sub: sub || undefined,
      timeTicks: ev.type === 'free'
        ? (car.race.lapStart >= 0 ? state.tick - car.race.lapStart : -1)
        : ev.phase === 'racing' ? Math.round(ev.time * 60) : 0,
      countdown: ev.phase === 'countdown' ? Math.ceil(ev.timer) : null,
      go: ev.phase === 'racing' && ev.time < 0.8,
      manual: car.manual,
      finishedText: place ? `FINISHED ${ordinal(place)}` : car.wrecked && ev.mode === 'lastStanding' ? 'ELIMINATED' : null,
      inPit: car.inPit,
      wrongWay: this.wrongWay > 1,
      popups: this.popups,
    };
  }

  render(alpha, dt, paused) {
    const { settings, hud, touch } = this.app;
    this.time += dt;
    const { state } = this.world;
    const ev = state.event;

    // Events: effects, dents, respawns (a fresh car model), popups and shake.
    const events = this.world.events.splice(0);
    for (const e of events) {
      if (e.type === 'respawn') {
        this.views[e.car].removeFrom(this.scene);
        this.views[e.car] = this.makeView(e.car);
      }
      if ((e.type === 'hit' && e.car === 0) || (e.type === 'crash' && (e.a === 0 || e.b === 0))) this.shake = Math.min(0.5, this.shake + 0.15);
      if (e.type === 'wreck' || e.type === 'explosion') this.shake = Math.min(0.6, this.shake + 0.25);
      if (e.type === 'wreck' && e.by === 0 && e.car !== 0) {
        this.victims.add(e.car);
        this.popup(`TAKEDOWN! ${this.names[e.car]}`, PALETTE.pink);
      }
      if (e.car === 0) {
        if (e.type === 'style') this.popup(`${e.kind} +$${e.amount}`, PALETTE.amber);
        if (e.type === 'launch') this.popup('PERFECT LAUNCH!', PALETTE.green);
        if (e.type === 'pickup') this.popup(`+${e.kind.toUpperCase()}`, PALETTE.cyan);
        if (e.type === 'falseStart') this.popup('FALSE START!', PALETTE.pink);
      }
    }
    for (const p of this.popups) p.age += dt;
    state.event.pickups.forEach((pk, k) => {
      const m = this.pickupMeshes[k];
      m.visible = pk.active;
      m.rotation.y += dt * 2;
      m.position.y = pk.y + Math.sin(this.time * 3 + k) * 0.2;
    });
    this.popups = this.popups.filter((p) => p.age < 1.8);

    state.cars.forEach((car, i) => this.views[i].update(this.pose(i, paused ? 1 : alpha), car, this.track, this.time));
    this.venueEntry.animate?.((state.tick + (paused ? 0 : alpha)) * SIM_DT);
    this.fx.handleEvents(events, this.world, this.views);
    this.fx.update(paused ? 0 : dt, this.world, this.views);

    const player = state.cars[0];
    this.cameraRig.update(this.poses[0], player, dt, this.lastFrame.lookBack);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    const fxOn = settings.speedFx !== false && !this.resultsShown;
    this.speedFx = fxOn ? this.cameraRig.intensity || 0 : 0;
    this.speedLines.update(paused ? 0 : dt, Math.hypot(player.vel.x, player.vel.z), this.speedFx);
    this.rain.mesh.visible = (settings.rain || this.forceRain) && this.outdoor;
    if (this.rain.mesh.visible) this.rain.update(this.camera.position, dt);

    // Results a moment after the player finishes, is eliminated, or the event ends.
    const playerDone = ev.finishTime[0] !== undefined || (ev.mode === 'lastStanding' && player.wrecked) || ev.done;
    if (playerDone && this.resultsAt === null) this.resultsAt = this.time + 2.5;
    if (this.resultsAt !== null && this.time >= this.resultsAt && !this.resultsShown) this.showResults();

    if (this.resultsShown) {
      hud.clear();
      return { scene: this.scene, camera: this.camera };
    }
    const order = standings(this.world);
    hud.draw({
      car: player,
      params: this.computed[0].params,
      tick: state.tick,
      fps: this.app.fps,
      showFps: settings.showFps,
      touchLayout: touch.visible,
      label: settings.godMode ? `${this.label}  GOD MODE` : this.label,
      units: settings.units,
      hudScale: settings.hudSize,
      markers: this.markers(player),
      position: state.cars.length > 1 ? { pos: order.findIndex((r) => r.id === 0) + 1, total: state.cars.length } : null,
      eventInfo: this.eventInfo(),
      minimap: { track: this.track, cars: state.cars, player: 0 },
    });
    return { scene: this.scene, camera: this.camera };
  }

  showResults() {
    this.resultsShown = true;
    const { state } = this.world;
    const ev = state.event;
    const order = standings(this.world);
    const place = order.findIndex((r) => r.id === 0) + 1;
    const player = state.cars[0];
    const rewards = computeRewards(this.def, place, player, this.tier);
    const career = this.app.career;
    // Salvage: normal cars drop worn, downgraded parts; a wrecked rival or boss
    // drops a full-quality part, and beating a boss always pays one.
    const victims = [...this.victims];
    const salvage = rollSalvage(victims.filter((i) => i !== this.specialIndex).map((i) => this.builds[i]), this.seed ^ 0xa5a5);
    let bossBeaten = false;
    let unlocked = null;
    if (this.def.boss && career && this.careerCar) {
      const bossRank = order.findIndex((r) => r.id === this.specialIndex);
      bossBeaten = place - 1 < bossRank;
      const d = DISTRICTS.findIndex((x) => x.id === this.def.district);
      if (bossBeaten && !career.bosses.includes(this.def.district)) {
        career.bosses.push(this.def.district);
        if (d + 1 < DISTRICTS.length && career.district < d + 1) {
          career.district = d + 1;
          unlocked = DISTRICTS[d + 1];
        }
      }
    }
    if (this.specialIndex > 0 && (bossBeaten || victims.includes(this.specialIndex))) {
      salvage.push(...rollSalvage([this.builds[this.specialIndex]], this.seed ^ 0x5a5a, { chance: 1, downgrade: false }));
    }
    if (career && this.careerCar) {
      career.cash = (career.cash || 0) + rewards.total;
      career.inventory.push(...salvage);
      career.eventsRun = (career.eventsRun || 0) + 1;
      career.completed ??= [];
      if (this.def.career && place > 0 && place <= 3 && !career.completed.includes(this.def.id)) career.completed.push(this.def.id);
      saveCareer(career);
    }
    const fee = this.def.entryFee || 0;
    const banner = bossBeaten
      ? `<div class="boss-banner">BOSS BEATEN! ${unlocked ? `${unlocked.name} is now open.` : this.def.district === 'spire' ? 'You are the champion of Neon Sprawl!' : ''}</div>`
      : this.def.boss ? '<div class="err">Finish ahead of the boss to open the next district.</div>' : '';

    const rows = order.map((r, k) => {
      let result;
      if (ev.type === 'arena') result = `KO ${r.takedowns}${ev.mode === 'lastStanding' ? (r.eliminated === -1 ? ' &middot; SURVIVED' : ' &middot; OUT') : ''}`;
      else result = r.finished ? formatTime(Math.round(r.time * 60)) : 'DNF';
      return `<tr class="${r.id === 0 ? 'me' : ''}"><td>${k + 1}</td><td>${esc(this.names[r.id])}</td><td>${result}</td></tr>`;
    }).join('');
    const lines = rewards.lines.map(([label, v]) => `<div class="reward-line"><span>${label}</span><b>$${v}</b></div>`).join('');
    const salv = salvage.length
      ? salvage.map((p) => `<div class="q-${p.quality}">${esc(partName(p))} (${p.condition}%)</div>`).join('')
      : '<div class="hint">No salvage this time.</div>';
    this.app.ui.innerHTML = `<div class="screen results"><div class="results-panel">
      <h1>${esc(this.def.name)}</h1>
      <h2>${ordinal(place)} place</h2>
      ${banner}
      <table class="standings">${rows}</table>
      <h3>Winnings</h3>${lines}<div class="reward-line total"><span>Total</span><b>$${rewards.total}</b></div>
      <h3>Salvage</h3>${salv}
      <div class="row"><button class="btn primary again" ${fee > (career?.cash ?? 0) ? 'disabled' : ''}>RACE AGAIN${fee ? ` ($${fee})` : ''}</button><button class="btn city">CITY MAP</button><button class="btn garage">GARAGE</button></div>
    </div></div>`;
    this.app.ui.querySelector('.again').addEventListener('click', () => this.app.go('race', this.args));
    this.app.ui.querySelector('.garage').addEventListener('click', () => this.app.go('garage'));
    this.app.ui.querySelector('.city').addEventListener('click', () => this.app.go('city'));
  }
}

// Floating pickup: red cross (health), cyan canister (nitro), amber crate (ammo).
function makePickupMesh(type) {
  const g = new THREE.Group();
  const color = { health: '#ff2040', nitro: '#05d9e8', ammo: '#ffb000' }[type];
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2) });
  if (type === 'health') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.36, 0.36), mat), new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.2, 0.36), mat));
  } else if (type === 'nitro') {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.1, 8), mat));
  } else {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.6), mat));
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 4, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.5), transparent: true, opacity: 0.6 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.7;
  g.add(ring);
  return g;
}

// Glowing strip marking the pit zone on the right of the road.
function pitZoneMesh(track, pit, tex) {
  const i0 = track.indexAtDistance(pit.s0);
  const i1 = track.indexAtDistance(pit.s1);
  const pos = [];
  const uv = [];
  const idx = [];
  const a = pit.lateral;
  const b = track.halfWidth - 0.2;
  let row = 0;
  for (let i = i0; i !== i1; i = track.wrap(i + 1)) {
    for (const [lat, u] of [[a, 0], [b, 1]]) {
      pos.push(track.x[i] + track.rx[i] * lat, track.y[i] + 0.05, track.z[i] + track.rz[i] * lat);
      uv.push(u, 0.5);
    }
    if (row > 0) {
      const k = (row - 1) * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
    row++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, additiveMaterial({ color: '#05d9e8', opacity: 0.18 }));
  m.renderOrder = 1;
  return m;
}
