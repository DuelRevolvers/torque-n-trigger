import * as THREE from 'three';
import { buildTrack } from '../sim/track.js';
import { buildArena } from '../sim/arena.js';
import { getVenue } from '../sim/tracks/venues.js';
import { createWorld, stepWorld } from '../sim/world.js';
import { createEventState, gridPoses, standings, resolvePit } from '../sim/event.js';
import { districtMap } from '../sim/city.js';
import { InputQueue, neutralInput, sanitizeInput } from '../sim/input.js';
import { initAi, aiInput } from '../sim/ai.js';
import { WEAPON_BEHAVIOR } from '../sim/combat.js';
import { SIM_DT } from '../config.js';
import { computeBuild } from '../parts/build.js';
import { DRIVERS, buildDriver, tierForPr } from '../parts/drivers.js';
import { partType, partName } from '../parts/catalog.js';
import { saveCareer, recordResult, recordText } from '../career/career.js';
import { DISTRICTS } from '../career/districts.js';
import { EVENTS, computeRewards, rollSalvage, ordinal } from '../career/events.js';
import { PALETTE } from '../render/textures.js';
import { buildTrackView } from '../render/trackView.js';
import { buildCityView } from '../render/cityView.js';
import { buildArenaView } from '../render/arenaView.js';
import { buildDistrictView, districtClear } from '../render/districtView.js';
import { buildTrainView, updateTrainView } from '../render/trainView.js';
import { buildTruckView, updateTruckView } from '../render/truckView.js';
import { buildRvView, updateRvView } from '../render/rvView.js';
import { districtLayout } from '../sim/cityLayout.js';
import { trainAt } from '../sim/train.js';
import { additiveMaterial } from '../render/retroMaterial.js';
import { CarView } from '../render/carView.js';
import { CameraRig } from '../render/cameraRig.js';
import { Rain } from '../render/rain.js';
import { Fx } from '../render/fx.js';
import { SpeedLines } from '../render/speedLines.js';
import { formatTime } from '../ui/hud.js';

const SNAP_EVERY = 3; // online: host snapshots at 20 Hz
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
// The street faces of a plan district's hotels and casinos (where crews stand at the start).
function buildingFronts(map) {
  return districtLayout(map).items
    .filter((it) => it.t === 'bldg' && (it.kind === 'hotel' || it.kind === 'casino' || it.kind === 'house' || it.kind === 'bighouse'))
    .map((it) => ({ x: it.obb.x + it.front[0] * it.obb.hd, z: it.obb.z + it.front[1] * it.obb.hd, fx: it.front[0], fz: it.front[1], w: it.obb.hw * 2, y: map.heightAt(it.obb.x, it.obb.z) }));
}

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
        const map = districtMap(def.city);
        const view = buildTrackView(track, tex, {
          city: true, sidewalk: def.city.rooftop ? tex.lot : tex.sidewalk, barrierColor: def.city.look.barrier, look: def.city.look,
          clear: def.city.authored ? districtClear(map) : null,
          arches: map.plan ? districtLayout(map).items.filter((it) => it.t === 'arch') : null,
          fronts: map.plan ? buildingFronts(map) : null,
          drag: def.type === 'drag',
          // A suburb: its maples (the drag's start lights hang from one), the pond's banks.
          trees: def.city.look.suburb ? districtLayout(map).items.filter((it) => it.t === 'tree' && it.kind === 'maple').map((it) => ({ x: it.x, z: it.z })) : null,
          pond: map.sites?.find((s) => s.pond)?.pond || null,
          heightAt: map.heightAt,
          // The Corporate Spire: its streets (the race's edges), fireworks for the championship.
          planMap: map.plan ? map : null,
          fireworks: def.key === 'boss' && !!def.city.look.spire,
          // The rooftops: the East Terrace bridge, where the drag's crowd stands.
          crowdBridge: map.roof ? map.crossings.find((c) => c.st.name === 'Terrace Line' && c.deckB?.name === 'Skyline Straight') || null : null,
        });
        animate = view.userData.animate || null;
        group.add(view);
      } else {
        group.add(buildTrackView(track, tex), buildCityView(track, tex));
      }
      if (def.pit) group.add(pitZoneMesh(track, resolvePit(def.pit, track), tex));
    }
    const train = track.train ? buildTrainView() : null;
    if (train) group.add(train);
    const truck = track.truck ? buildTruckView(track.truck) : null;
    if (truck) group.add(truck);
    const rv = track.rv ? buildRvView(track.rv, tex) : null;
    if (rv) group.add(rv);
    group.visible = false;
    this.scene.add(group);
    const entry = { track, group, outdoor: v.kind !== 'arena' || !!def.city, animate, train, truck, rv, heightAt: def.city ? districtMap(def.city).heightAt : null };
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

  // multiplayer: { players: [{ name, carName, build, pr, device }], bots } from the
  // lobby. Players take the first car slots; each gets a split-screen pane.
  enter({ build, car, event, multiplayer }) {
    this.args = { build, car, event, multiplayer };
    this.mp = multiplayer || null;
    this.net = multiplayer?.online || null;
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
    this.envGroup = this.def.city ? this.env(this.def.city) : null;
    if (this.envGroup) {
      this.envGroup.visible = true;
      // Warehouse Row's doorways are shuttered for the boss fight.
      const shutters = this.envGroup.getObjectByName('shutters');
      if (shutters) shutters.visible = !!venue.track.def?.shell;
    }
    this.crossingLights = this.envGroup?.getObjectByName('crossingLights') || null;
    this.track = venue.track;
    this.outdoor = venue.outdoor;
    // District look and event modifiers.
    const theme = DISTRICTS.find((d) => d.id === this.def.district)?.theme;
    const mods = this.def.modifiers || [];
    const blackout = mods.includes('blackout');
    const haze = theme?.haze || PALETTE.haze;
    this.scene.fog = venue.outdoor
      ? new THREE.FogExp2(haze, (theme?.fog || 0.0045) * (blackout ? 2.4 : 1))
      : new THREE.Fog('#07050d', blackout ? 15 : 40, blackout ? 70 : 160);
    this.hemi.intensity = blackout ? 0.3 : 1.4;
    this.hemiBase = this.hemi.intensity;
    this.scene.background = venue.outdoor ? this.app.tex.sky : new THREE.Color('#07050d');

    // AI field: random named drivers at a tier matching the player's car.
    const seed = multiplayer?.seed ?? Math.floor(Math.random() * 1e9); // online: shared so AI matches
    this.seed = seed;
    // Career events run at their district's tier; a rival or boss (one tier up)
    // always takes the first AI slot.
    const humans = this.mp ? this.mp.players : [{ name: 'YOU', build, device: null }];
    const H = (this.humans = humans.length);
    this.devices = humans.map((h) => h.device);
    // Cars with a camera on this machine: every split-screen player, or online just ours.
    this.viewers = this.net ? this.net.viewers || [this.net.slot] : humans.map((_, p) => p);
    let entries;
    if (this.mp) {
      // Lobby bots were already built to the players' PR.
      this.tier = tierForPr(humans.reduce((s, h) => s + h.pr, 0) / H);
      this.specialIndex = -1;
      entries = this.mp.bots;
      this.names = [...humans.map((h) => h.name), ...entries.map((e) => e.name)];
    } else {
      this.tier = this.def.tier ?? tierForPr(computeBuild(build).pr);
      const special = this.def.driver || this.def.rivalDriver || null;
      const pool = [...DRIVERS].sort((a, b) => ((hashId(a.id) ^ seed) >>> 0) - ((hashId(b.id) ^ seed) >>> 0)).filter((d) => d.id !== special);
      const drivers = [...(special ? [DRIVERS.find((d) => d.id === special)] : []), ...pool].slice(0, this.def.cars - 1);
      const fieldTier = special ? Math.max(0, this.tier - 1) : this.tier;
      entries = drivers.map((d, k) => buildDriver(d, special && k === 0 ? this.tier : fieldTier, seed + k));
      this.specialIndex = special ? 1 : -1;
      this.names = ['YOU', ...entries.map((e, k) => (special && k === 0 ? `${e.name} ${this.def.boss ? 'BOSS' : 'RIVAL'}` : e.name))];
    }
    this.builds = [...humans.map((h) => h.build), ...entries.map((e) => e.build)];
    this.computed = this.builds.map((b) => computeBuild(pristine(b)));
    const n = this.builds.length;
    this.world = createWorld({
      track: this.track,
      // Multiplayer runs every car fresh; wear isn't written back either.
      cars: this.builds.map((b, i) => ({ params: this.computed[i].params, conditions: conditionsOf(this.mp ? pristine(b) : b) })),
      poses: gridPoses(this.track, this.def, n),
      event: createEventState(this.def, this.track),
      respawnOnWreck: !(this.def.type === 'arena' && this.def.mode === 'lastStanding'),
    });
    entries.forEach((e, k) => initAi(this.world.state.cars[k + H], e.personality, seed + 31 * k));
    this.queues = humans.map(() => new InputQueue());
    this.lastFrames = humans.map(() => neutralInput());
    this.views = this.builds.map((b, i) => this.makeView(i));
    // One camera per player; the first is the screen's own camera.
    this.extraCams ||= [];
    const V = this.viewers.length;
    while (this.extraCams.length < V - 1) this.extraCams.push(new THREE.PerspectiveCamera(68, 16 / 9, 0.3, 1500));
    this.cameras = [this.camera, ...this.extraCams.slice(0, V - 1)]; // per viewer
    this.rigs = this.cameras.map((cam) => new CameraRig(cam, this.track));
    this.panes = splitLayout(V);
    this.shakes = humans.map(() => 0); // per human car
    this.wrongWays = humans.map(() => 0);
    this.popupsBy = humans.map(() => []);
    this.setupNet();
    this.prevPoses = this.capturePoses();
    this.victims = new Set();
    this.pickupMeshes = this.world.state.event.pickups.map((pk) => {
      const m = makePickupMesh(pk.type);
      m.position.set(pk.x, pk.y, pk.z);
      this.scene.add(m);
      return m;
    });
    this.resultsAt = null;
    this.resultsShown = false;
    this.app.ui.innerHTML = '';
    this.labels = humans.map((h) => {
      const b = h.build;
      const text = `PR ${computeBuild(b).pr}  ${partType(b.parts.chassis).name} / ${partType(b.parts.engine).name}`;
      return this.mp && (H > 1 || this.net) ? `${h.name}  ${text}` : text;
    });
  }

  makeView(i) {
    const view = new CarView(this.builds[i], this.computed[i], this.app.tex);
    view.addTo(this.scene);
    return view;
  }

  exit() {
    // Online: the host leaving the race sends everyone back to the room.
    if (this.net) {
      if (this.net.role === 'host') this.net.session.broadcast({ t: 'room' });
      this.net.session.on({});
      this.net = null;
    }
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

  // Online races keep running while the pause menu is open.
  get online() {
    return !!this.net;
  }

  // Host-authoritative sync. The host simulates everything, takes each client's
  // latest input and broadcasts the whole world state every SNAP_EVERY ticks.
  // Clients predict locally, then on each snapshot restore the host's state and
  // replay their own inputs since that tick.
  setupNet() {
    const net = this.net;
    this.remoteIn = [];
    this.history = new Map();
    this.pendingSnap = null;
    this.outEvents = [];
    if (!net) return;
    const { session } = net;
    if (net.role === 'host') {
      session.on({
        message: (msg, from) => {
          const slot = net.slots[from];
          if (msg.t === 'in' && slot > 0) this.remoteIn[slot] = sanitizeInput(msg.f || {});
        },
        leave: (id) => {
          const slot = net.slots[id];
          if (slot > 0) {
            this.remoteIn[slot] = neutralInput();
            this.popup(`${this.names[slot]} LEFT`, PALETTE.pink, 0);
          }
        },
      });
    } else {
      session.on({
        message: (msg) => {
          if (msg.t === 'snap' && (!this.pendingSnap || msg.tick > this.pendingSnap.tick)) {
            // Events between two snapshots must not be lost when one is skipped.
            if (this.pendingSnap) msg.events = [...this.pendingSnap.events, ...msg.events];
            this.pendingSnap = msg;
          } else if (msg.t === 'room') {
            this.app.go('lobby');
          }
        },
        leave: () => {
          session.close();
          this.app.net = null;
          this.net = null;
          this.app.go('lobby', { error: 'Lost the connection to the host.' });
        },
      });
    }
  }

  reconcile() {
    const snap = this.pendingSnap;
    this.pendingSnap = null;
    const world = this.world;
    const localTick = world.state.tick;
    const me = this.net.slot;
    snap.inputs.forEach((f, p) => {
      if (p !== me) this.remoteIn[p] = f;
    });
    world.state = snap.state;
    world.events.push(...snap.events);
    const kept = world.events.length;
    for (let t = snap.tick; t < localTick; t++) {
      const inputs = [];
      for (let p = 0; p < this.humans; p++) inputs.push(p === me ? this.history.get(t) || neutralInput() : this.remoteIn[p] || neutralInput());
      for (let i = this.humans; i < world.state.cars.length; i++) inputs.push(aiInput(world, i, SIM_DT));
      stepWorld(world, inputs);
    }
    world.events.length = kept; // replayed ticks don't repeat effects
    for (const t of this.history.keys()) if (t < snap.tick) this.history.delete(t);
    // Keep interpolation sane after a correction.
    this.prevPoses = this.capturePoses();
  }

  capturePoses() {
    return this.world.state.cars.map((c) => ({ pos: { ...c.pos }, quat: { ...c.quat } }));
  }

  step() {
    const net = this.net;
    if (net?.role === 'client' && this.pendingSnap) this.reconcile();
    const { state } = this.world;
    const tick = state.tick;
    const inputs = [];
    for (let p = 0; p < this.humans; p++) {
      if (!this.viewers.includes(p)) {
        // Someone else's car: the host uses their latest input, a client the host's.
        inputs.push(this.remoteIn[p] || neutralInput());
        continue;
      }
      this.lastFrames[p] = this.app.localInput.sample(this.devices[p]);
      this.queues[p].push(tick, this.lastFrames[p]);
      const frame = this.queues[p].take(tick);
      inputs.push(frame);
      if (net?.role === 'client') {
        this.history.set(tick, frame);
        net.session.send({ t: 'in', f: frame });
      }
    }
    state.cars[0].invulnerable = !this.mp && !!this.app.settings.godMode;
    for (let i = this.humans; i < state.cars.length; i++) inputs.push(aiInput(this.world, i, SIM_DT));
    this.prevPoses = this.capturePoses();
    stepWorld(this.world, inputs);
    if (net?.role === 'client') {
      this.world.events.length = 0; // effects come from the host's snapshots
    } else if (net) {
      this.outEvents.push(...this.world.events);
      if (state.tick % SNAP_EVERY === 0) {
        net.session.broadcast({ t: 'snap', tick: state.tick, state, inputs: inputs.slice(0, this.humans), events: this.outEvents });
        this.outEvents = [];
      }
    }
    // Wrong way: moving against the track direction for over a second.
    for (let p = 0; p < this.humans; p++) {
      const car = state.cars[p];
      const i = car.trackIndex;
      const racing = !this.track.isArena && state.event.phase === 'racing' && !car.wrecked && i >= 0;
      const along = racing ? car.vel.x * this.track.tx[i] + car.vel.z * this.track.tz[i] : 0;
      const w = this.wrongWays[p];
      this.wrongWays[p] = along < -4 ? w + SIM_DT : along > 1 || !racing ? 0 : w;
    }
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
  markers(p, camera) {
    const out = [];
    const { state, params } = this.world;
    const player = state.cars[p];
    const w = params[p].weapons?.primary;
    const beh = w && WEAPON_BEHAVIOR[w.type];
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.views[p].group.quaternion);
    let lock = -1;
    let best = Infinity;
    state.cars.forEach((c, j) => {
      if (j === p || c.wrecked) return;
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
      const s = new THREE.Vector3(c.pos.x, c.pos.y + 1.6, c.pos.z).project(camera);
      if (s.z > 1) return;
      out.push({ x: s.x, y: s.y, hp: c.hp / c.maxHp, id: j, name: this.names[j] });
    });
    for (const m of out) m.lock = m.id === lock;
    return out;
  }

  popup(text, color, p = 0) {
    const list = this.popupsBy[p];
    list.unshift({ text, color, age: 0 });
    list.length = Math.min(list.length, 4);
  }

  eventInfo(p) {
    const { state } = this.world;
    const ev = state.event;
    const car = state.cars[p];
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
    const place = ev.finished.indexOf(p) + 1;
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
      wrongWay: this.wrongWays[p] > 1,
      popups: this.popupsBy[p],
    };
  }

  render(alpha, dt, paused) {
    const { settings, hud, touch } = this.app;
    this.time += dt;
    const { state } = this.world;
    if (this.venueEntry?.train) updateTrainView(this.venueEntry.train, this.track.train, state.tick - 1 + alpha);
    if (this.venueEntry?.truck) updateTruckView(this.venueEntry.truck, this.track.truck, state.tick - 1 + alpha, this.venueEntry.heightAt);
    if (this.venueEntry?.rv) updateRvView(this.venueEntry.rv, this.track.rv, state.tick - 1 + alpha, this.venueEntry.heightAt);
    // Speaker posts at the drive-in go down when a car drives through them.
    this.envGroup?.userData.knock?.(state.cars.map((c) => ({ x: c.pos.x, y: c.pos.y, z: c.pos.z, vx: c.vel.x, vz: c.vel.z })));
    if (this.crossingLights) {
      // Level crossing lamps flash from a few seconds before a train until it's gone.
      const line = this.track.train;
      const coming = line && [0, 3, 6].some((s) => trainAt(line, state.tick + Math.round(s / SIM_DT)));
      this.crossingLights.visible = !!coming && Math.floor(this.time * 2.5) % 2 === 0;
    }
    const ev = state.event;

    // Events: effects, dents, respawns (a fresh car model), popups and shake.
    const events = this.world.events.splice(0);
    // Breakable props (a suburb) knocked over this frame, and which are down.
    for (const e of events) if (e.type === 'break') this.envGroup?.userData.breakEvent?.(e);
    this.envGroup?.userData.setBroken?.(state.broken);
    for (const e of events) {
      if (e.type === 'respawn') {
        this.views[e.car].removeFrom(this.scene);
        this.views[e.car] = this.makeView(e.car);
      }
      for (let p = 0; p < this.humans; p++) {
        if ((e.type === 'hit' && e.car === p) || (e.type === 'crash' && (e.a === p || e.b === p))) this.shakes[p] = Math.min(0.5, this.shakes[p] + 0.15);
        if (e.type === 'wreck' || e.type === 'explosion') this.shakes[p] = Math.min(0.6, this.shakes[p] + 0.25);
        if (e.type === 'wreck' && e.by === p && e.car !== p) {
          if (!this.mp) this.victims.add(e.car);
          this.popup(`TAKEDOWN! ${this.names[e.car]}`, PALETTE.pink, p);
        }
        if (e.car === p) {
          if (e.type === 'style') this.popup(`${e.kind} +$${e.amount}`, PALETTE.amber, p);
          if (e.type === 'launch') this.popup('PERFECT LAUNCH!', PALETTE.green, p);
          if (e.type === 'pickup') this.popup(`+${e.kind.toUpperCase()}`, PALETTE.cyan, p);
          if (e.type === 'falseStart') this.popup('FALSE START!', PALETTE.pink, p);
        }
      }
    }
    for (const list of this.popupsBy) for (const p of list) p.age += dt;
    state.event.pickups.forEach((pk, k) => {
      const m = this.pickupMeshes[k];
      m.visible = pk.active;
      m.rotation.y += dt * 2;
      m.position.y = pk.y + Math.sin(this.time * 3 + k) * 0.2;
    });
    this.popupsBy = this.popupsBy.map((list) => list.filter((p) => p.age < 1.8));

    state.cars.forEach((car, i) => this.views[i].update(this.pose(i, paused ? 1 : alpha), car, this.track, this.time));
    this.venueEntry.animate?.((state.tick + (paused ? 0 : alpha)) * SIM_DT, this.time);
    this.envGroup?.userData.animate?.((state.tick + (paused ? 0 : alpha)) * SIM_DT, this.time);
    this.fx.handleEvents(events, this.world, this.views);
    this.fx.update(paused ? 0 : dt, this.world, this.views);

    const split = this.viewers.length > 1;
    const player = state.cars[this.viewers[0]];
    for (let v = 0; v < this.viewers.length; v++) {
      const p = this.viewers[v];
      const cam = this.cameras[v];
      this.rigs[v].update(this.poses[p], state.cars[p], dt, this.lastFrames[p].lookBack);
      if (this.shakes[p] > 0) {
        cam.position.x += (Math.random() - 0.5) * this.shakes[p];
        cam.position.y += (Math.random() - 0.5) * this.shakes[p];
        this.shakes[p] = Math.max(0, this.shakes[p] - dt * 1.5);
      }
      if (split) {
        const aspect = (this.app.renderer.aspect * this.panes[v].w) / this.panes[v].h;
        if (Math.abs(cam.aspect - aspect) > 1e-4) {
          cam.aspect = aspect;
          cam.updateProjectionMatrix();
        }
      }
    }
    // Speed blur, speed lines and rain follow one camera: single screen only.
    const fxOn = settings.speedFx !== false && !this.resultsShown && !split;
    this.speedFx = fxOn ? this.rigs[0].intensity || 0 : 0;
    this.speedLines.update(paused ? 0 : dt, Math.hypot(player.vel.x, player.vel.z), this.speedFx);
    // Under the Undercity's deck (or in its tunnel): no sky light, no rain.
    const cam = this.camera.position;
    const covered = !!this.track?.ceilingAt && this.track.ceilingAt(cam.x, cam.z, cam.y) != null;
    if (this.track?.ceilingAt) this.hemi.intensity += ((covered ? this.hemiBase * 0.45 : this.hemiBase) - this.hemi.intensity) * Math.min(1, dt * 3);
    this.rain.mesh.visible = settings.rain && this.outdoor && !split && !covered;
    if (this.rain.mesh.visible) this.rain.update(this.camera.position, dt);

    // Results a moment after the player finishes, is eliminated, or the event ends.
    const done = (p) => ev.finishTime[p] !== undefined || (ev.mode === 'lastStanding' && state.cars[p].wrecked);
    const playerDone = ev.done || this.viewers.every(done);
    if (playerDone && this.resultsAt === null) this.resultsAt = this.time + 2.5;
    if (this.resultsAt !== null && this.time >= this.resultsAt && !this.resultsShown) this.showResults();

    const views = split ? this.cameras.map((camera, p) => ({ camera, rect: this.panes[p] })) : this.camera;
    if (this.resultsShown) {
      hud.clear();
      return { scene: this.scene, camera: views };
    }
    const order = standings(this.world);
    const cw = hud.canvas.width;
    const ch = hud.canvas.height;
    for (let v = 0; v < this.viewers.length; v++) {
      const p = this.viewers[v];
      const r = this.panes[v];
      const label = this.labels[p];
      hud.draw({
        viewport: split ? { x: Math.round(r.x * cw), y: Math.round(r.y * ch), w: Math.round(r.w * cw), h: Math.round(r.h * ch) } : null,
        keep: v > 0,
        car: state.cars[p],
        params: this.computed[p].params,
        tick: state.tick,
        fps: this.app.fps,
        showFps: settings.showFps && v === 0,
        touchLayout: touch.visible && !split,
        label: settings.godMode && !this.mp ? `${label}  GOD MODE` : label,
        units: settings.units,
        hudScale: settings.hudSize,
        markers: this.markers(p, this.cameras[v]),
        position: state.cars.length > 1 ? { pos: order.findIndex((o) => o.id === p) + 1, total: state.cars.length } : null,
        eventInfo: this.eventInfo(p),
        minimap: { track: this.track, cars: state.cars, player: p },
      });
    }
    return { scene: this.scene, camera: views };
  }

  showResults() {
    if (this.mp) return this.showMpResults();
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
      if (this.def.type !== 'free') recordResult(this.careerCar, { place, of: order.length, takedowns: player.takedowns || 0, cash: rewards.total });
      career.completed ??= [];
      // Best result per event, shown on its card afterwards.
      if (this.def.career && place > 0) {
        career.results ??= {};
        const prev = career.results[this.def.id];
        career.results[this.def.id] = { best: prev ? Math.min(prev.best, place) : place, of: order.length, runs: (prev?.runs || 0) + 1 };
      }
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

  // Multiplayer results: standings only. No cash, salvage or career record changes.
  showMpResults() {
    this.resultsShown = true;
    const ev = this.world.state.event;
    const order = standings(this.world);
    const players = this.mp.players;
    const rows = order.map((r, k) => {
      const result = ev.type === 'arena'
        ? `KO ${r.takedowns}${ev.mode === 'lastStanding' ? (r.eliminated === -1 ? ' &middot; SURVIVED' : ' &middot; OUT') : ''}`
        : r.finished ? formatTime(Math.round(r.time * 60)) : 'DNF';
      const human = r.id < this.humans;
      const name = human ? `${players[r.id].name} &middot; ${esc(players[r.id].carName)}` : `${esc(this.names[r.id])} <span class="hint">BOT</span>`;
      return `<tr class="${human ? 'me' : ''}"><td>${k + 1}</td><td>${name}</td><td>${result}</td></tr>`;
    }).join('');
    const career = this.app.career?.cars || [];
    const records = players.map((p) => {
      const car = career.find((c) => c.build === p.build);
      const text = p.record ? esc(p.record) : car ? recordText(car) : 'loaner, no career record';
      return `<div class="record"><b>${p.name}</b> ${esc(p.carName)}: ${text}</div>`;
    }).join('');
    const winner = order[0] && order[0].id < this.humans ? `${players[order[0].id].name} WINS` : `${esc(this.names[order[0]?.id] ?? '')} WINS`;
    this.app.ui.innerHTML = `<div class="screen results"><div class="results-panel">
      <h1>${esc(this.def.name)}</h1>
      <h2>${winner}</h2>
      <table class="standings">${rows}</table>
      <h3>Career records</h3>${records}
      <div class="hint">Multiplayer races don't pay out or count toward career records.</div>
      ${this.net
        ? this.net.role === 'host' ? '<div class="row"><button class="btn primary room">BACK TO ROOM</button></div>' : '<div class="hint">Waiting for the host to go back to the room...</div>'
        : '<div class="row"><button class="btn primary again">REMATCH</button><button class="btn lobby">LOBBY</button><button class="btn menu">MAIN MENU</button></div>'}
    </div></div>`;
    const on = (sel, fn) => this.app.ui.querySelector(sel)?.addEventListener('click', fn);
    on('.room', () => this.app.go('lobby'));
    on('.again', () => this.app.go('race', this.args));
    on('.lobby', () => this.app.go('lobby'));
    on('.menu', () => this.app.go('menu'));
  }
}

// Split-screen panes (0..1, top-left origin) with a thin gap between them: two
// players stacked, three with P1 on top, four in quarters.
const GAP = 0.003;
function splitLayout(n) {
  const full = { x: 0, y: 0, w: 1, h: 1 };
  const top = { x: 0, y: 0, w: 1, h: 0.5 - GAP };
  const bottom = { x: 0, y: 0.5 + GAP, w: 1, h: 0.5 - GAP };
  const q = (col, row) => ({ x: col ? 0.5 + GAP : 0, y: row ? 0.5 + GAP : 0, w: 0.5 - GAP, h: 0.5 - GAP });
  if (n <= 1) return [full];
  if (n === 2) return [top, bottom];
  if (n === 3) return [top, q(0, 1), q(1, 1)];
  return [q(0, 0), q(1, 0), q(0, 1), q(1, 1)];
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
