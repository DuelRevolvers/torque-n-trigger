import * as THREE from 'three';
import { computeBuild } from '../parts/build.js';
import { DRIVERS, buildDriver, rankForPr } from '../parts/drivers.js';
import { recordText } from '../career/career.js';
import { rankSpread, makeBots, maxCars, PR_CLASSES, prClass } from '../career/multiplayer.js';
import { maps, campaignEvents, eventRef, eventByRef, modeName } from '../career/playlist.js';
import { DEVICES, devicesClash } from '../input/localInput.js';
import { NetSession } from '../net/session.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Phones get no split-screen: one local player (online rooms still work).
export const isPhone = () => window.matchMedia('(pointer: coarse)').matches && Math.min(window.screen.width, window.screen.height) < 700;

// Loaner cars for players without a car of their own, one per rank band.
const LOANERS = [
  { id: 'loaner-0', name: 'Loaner Junker', driver: 'jackal', tier: 0 },
  { id: 'loaner-2', name: 'Loaner Street', driver: 'hammer', tier: 2 },
  { id: 'loaner-4', name: 'Loaner Racer', driver: 'vixen', tier: 4 },
];
export const loanerCars = () => LOANERS.map((l, k) => ({
  id: l.id,
  name: l.name,
  loaner: true,
  build: buildDriver(DRIVERS.find((d) => d.id === l.driver), l.tier, 777 + k).build,
}));

// One lobby for quick races and campaign events, solo or multiplayer. In
// multiplayer, 1-4 local split-screen players can also open the room online
// (a 5-letter code); remote players join it from their own lobby. The host runs
// the race; the online session lives on app.net across races.
export class LobbyScreen {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0a0418');
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 10);
    this.loaners = loanerCars();
    this.state = null;
    this.error = '';
    this.busy = false;
  }

  cars() {
    return [...(this.app.career?.cars || []), ...this.loaners];
  }

  carEntry(id) {
    const car = this.cars().find((c) => c.id === id) || this.cars()[0];
    return { id: car.id, carName: car.name, build: car.build, pr: computeBuild(car.build).pr, record: car.loaner ? 'Loaner car: no career record' : `Career: ${recordText(car)}` };
  }

  enter(data = {}) {
    const career = this.app.career;
    const firstCar = career?.activeCar || this.loaners[0].id;
    if (!this.state) this.state = { mode: 'multi', source: 'quick', ref: null, classId: 'open', seats: [{ car: firstCar, device: 'kb' }], bots: 5, seed: 1 + Math.floor(Math.random() * 1e6) };
    const s = this.state;
    if (data.mode) {
      s.mode = data.mode;
      s.source = data.source || 'quick';
      s.ref = null;
    }
    if (data.error) this.error = data.error;
    if (s.mode === 'solo' || isPhone()) s.seats.length = 1;
    const ids = new Set(this.cars().map((c) => c.id));
    for (const seat of s.seats) if (!ids.has(seat.car)) seat.car = firstCar;
    if (s.seats.length === 1) s.seats[0].device = 'kb';
    const net = this.app.net;
    if (net) {
      this.hook();
      if (net.session.role === 'host') for (const p of net.remote) p.ready = false;
    }
    this.refresh();
  }

  exit() {
    this.app.ui.innerHTML = '';
  }

  step() {}

  // --- Event choice ---
  events() {
    const s = this.state;
    if (s.source === 'campaign') return campaignEvents(this.app.career).map((e) => ({ ref: eventRef('campaign', e), label: e.name, e }));
    const m = maps({ solo: s.mode === 'solo' });
    const map = m.find((x) => s.ref?.startsWith(`${x.id}/`)) || m[0];
    return map.events.map((e) => ({ ref: eventRef(map.id, e), label: `${modeName(e)}: ${e.name}`, e, map }));
  }

  event() {
    const s = this.state;
    const list = this.events();
    if (!list.some((x) => x.ref === s.ref)) s.ref = list[0].ref;
    return eventByRef(s.ref);
  }

  // --- Online ---
  leaveRoom() {
    this.app.net?.session.close();
    this.app.net = null;
  }

  async openRoom() {
    this.busy = true;
    this.error = '';
    this.refresh();
    try {
      const session = await NetSession.host();
      this.app.net = { session, remote: [] };
      this.hook();
    } catch (e) {
      this.error = e.message || String(e);
    }
    this.busy = false;
    this.refresh();
  }

  async joinRoom(code) {
    if (!/^[A-Z2-9]{5}$/i.test(code.trim())) {
      this.error = 'Room codes are 5 letters.';
      return this.refresh();
    }
    this.busy = true;
    this.error = '';
    this.refresh();
    try {
      const session = await NetSession.join(code);
      this.app.net = { session, room: null, ready: false, carId: this.state.seats[0].car };
      this.hook();
      this.sendCar();
    } catch (e) {
      this.error = e.message || String(e);
    }
    this.busy = false;
    this.refresh();
  }

  sendCar() {
    const net = this.app.net;
    const { id, ...entry } = this.carEntry(net.carId);
    net.session.send({ t: 'car', ...entry, ready: !!net.ready });
  }

  hook() {
    const net = this.app.net;
    const s = net.session;
    if (s.role === 'host') {
      s.on({
        message: (msg, from) => {
          if (msg.t !== 'car') return;
          let p = net.remote.find((x) => x.id === from);
          if (!p) {
            if (this.state.seats.length + net.remote.length >= maxCars(this.event())) return s.send({ t: 'full' }, from);
            net.remote.push((p = { id: from }));
          }
          Object.assign(p, { carName: msg.carName, build: msg.build, pr: msg.pr, record: msg.record, ready: !!msg.ready });
          this.refresh();
        },
        leave: (id) => {
          net.remote = net.remote.filter((p) => p.id !== id);
          this.refresh();
        },
      });
    } else {
      s.on({
        message: (msg) => {
          if (msg.t === 'room') {
            net.room = msg.room;
            net.ready = !!msg.room.players.find((p) => p.id === s.peer.id)?.ready; // the host resets it on changes
            this.refresh();
          } else if (msg.t === 'full') {
            this.leaveRoom();
            this.error = 'That room is full.';
            this.refresh();
          } else if (msg.t === 'start') {
            net.ready = false;
            this.app.go('race', {
              event: eventByRef(msg.eventRef),
              multiplayer: { players: msg.players, bots: msg.bots, seed: msg.seed, online: { session: s, role: 'client', slot: msg.slot } },
            });
          }
        },
        leave: () => {
          this.leaveRoom();
          this.error = 'The host closed the room.';
          this.refresh();
        },
      });
    }
  }

  // Everyone in the race: local seats first, then remote players.
  entrants() {
    const s = this.state;
    const split = s.seats.length > 1;
    const local = s.seats.map((seat) => ({ ...this.carEntry(seat.car), device: split ? seat.device : null, local: true, ready: true }));
    const remote = (this.app.net?.remote || []).map((p) => ({ ...p, device: null }));
    return [...local, ...remote];
  }

  start() {
    const s = this.state;
    const net = this.app.net;
    const event = this.event();
    const entrants = this.entrants();
    const players = entrants.map((p, i) => ({ name: `P${i + 1}`, carName: p.carName, build: p.build, pr: p.pr, record: p.record, device: p.device }));
    const bots = this.bots;
    const seed = s.seed;
    s.seed = 1 + Math.floor(Math.random() * 1e6); // fresh bots next time
    let online = null;
    if (net) {
      const slots = {};
      entrants.forEach((p, i) => {
        if (p.local) return;
        slots[p.id] = i;
        net.session.send({ t: 'start', eventRef: s.ref, players: players.map(({ device, ...p2 }) => p2), bots, seed, slot: i }, p.id);
      });
      online = { session: net.session, role: 'host', viewers: s.seats.map((_, i) => i), slots };
    }
    this.app.go('race', { event, multiplayer: { players, bots, seed, online } });
  }

  // --- View ---
  refresh() {
    const net = this.app.net;
    if (net?.session.role === 'client') return this.renderClient();
    this.clampBots();
    const s = this.state;
    const ev = this.event();
    const solo = s.mode === 'solo';
    const phone = isPhone();
    const cls = prClass(solo ? 'open' : s.classId);
    const max = maxCars(ev);
    const entrants = this.entrants();
    this.bots = makeBots(s.bots, entrants.map((p) => p.pr), s.seed, cls.maxPr);
    const split = s.seats.length > 1;
    const clash = split && s.seats.some((a, i) => s.seats.some((b, j) => j > i && devicesClash(a.device, b.device)));
    const over = entrants.some((p) => p.pr > cls.maxPr);
    const waiting = entrants.some((p) => !p.ready);
    const total = entrants.length + s.bots;
    const minBots = entrants.length > 1 ? 0 : 1;

    const carOptions = (sel) => {
      const opt = (c) => {
        const pr = computeBuild(c.build).pr;
        return `<option value="${c.id}" ${c.id === sel ? 'selected' : ''} ${pr > cls.maxPr ? 'disabled' : ''}>${esc(c.name)} (PR ${pr})</option>`;
      };
      const own = (this.app.career?.cars || []).map(opt).join('');
      return `${own ? `<optgroup label="Your garage">${own}</optgroup>` : ''}<optgroup label="Loaners">${this.loaners.map(opt).join('')}</optgroup>`;
    };
    const deviceOptions = (sel) => DEVICES.map((d) => `<option value="${d.id}" ${d.id === sel ? 'selected' : ''}>${d.name}</option>`).join('');
    const rankTag = (pr) => `<span class="rank rank-${rankForPr(pr || 0)}">${rankForPr(pr || 0)}</span><span class="seat-pr">PR ${pr ?? '?'}</span>`;
    const overNote = (pr) => (pr > cls.maxPr ? `<div class="err">Over the ${cls.name} cap (PR ${cls.maxPr}).</div>` : '');

    const seatRows = s.seats.map((seat, i) => {
      const e = this.carEntry(seat.car);
      return `<div class="seat"><div class="seat-top"><b class="pn">P${i + 1}</b>
        <select class="car-pick" data-i="${i}">${carOptions(seat.car)}</select>
        ${split ? `<select class="dev-pick" data-i="${i}">${deviceOptions(seat.device)}</select>` : ''}
        ${rankTag(e.pr)}${i > 0 ? `<button class="btn small drop" data-i="${i}">&#10005;</button>` : ''}</div>
        ${overNote(e.pr)}<div class="record">${esc(e.record)}</div></div>`;
    }).join('');
    const remoteRows = (net?.remote || []).map((p, k) => `<div class="seat"><div class="seat-top"><b class="pn">P${s.seats.length + k + 1}</b><span>${esc(p.carName || '...')} <span class="tag">ONLINE</span></span>
        ${rankTag(p.pr)}<span class="${p.ready ? 'up' : 'hint'}">${p.ready ? 'READY' : 'NOT READY'}</span></div>
        ${overNote(p.pr)}<div class="record">${esc(p.record || '')}</div></div>`).join('');

    const spread = rankSpread(entrants.map((p, i) => ({ name: `P${i + 1}`, car: p.carName, pr: p.pr })));
    const rankNote = spread.wild
      ? `<div class="rank-warn"><b>WILDLY DIFFERENT RANKS</b> ${esc(spread.high.name)}'s ${esc(spread.high.car)} is rank ${spread.high.rank} (PR ${spread.high.pr}), ${esc(spread.low.name)}'s ${esc(spread.low.car)} is rank ${spread.low.rank} (PR ${spread.low.pr}). Expect a one-sided race: try a loaner, a closer car or a PR class.</div>`
      : spread.gap === 1 ? `<div class="hint">Ranks differ a little (${spread.low.rank} to ${spread.high.rank}). Should still be a race.</div>` : '';

    const list = this.events();
    const mapPick = s.source === 'quick'
      ? `<label class="ev-row">MAP <select class="map-pick">${maps({ solo }).map((m) => `<option value="${m.id}" ${m.id === list[0].map.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>`
      : '';
    const evPick = `<label class="ev-row">${s.source === 'quick' ? 'MODE' : 'EVENT'} <select class="ev-pick">${list.map((x) => `<option value="${x.ref}" ${x.ref === s.ref ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>`;
    const classPick = solo ? '' : `<label class="ev-row">CLASS <select class="cls-pick">${PR_CLASSES.map((c) => `<option value="${c.id}" ${c.id === cls.id ? 'selected' : ''}>${c.name}${c.maxPr < Infinity ? ` (PR &le; ${c.maxPr})` : ''}</option>`).join('')}</select></label>`;

    let online = '';
    if (!solo) {
      online = net
        ? `<h3>Online room <span class="room-code">${esc(net.session.code)}</span></h3><div class="hint">Friends join with this code from Multiplayer in their own game.</div>${remoteRows || '<div class="hint">No one has joined yet.</div>'}<div class="row"><button class="btn small close-room">CLOSE ROOM</button></div>`
        : `<h3>Online</h3><div class="row"><button class="btn small open-room" ${this.busy ? 'disabled' : ''}>OPEN ROOM ONLINE</button><input class="code-in" maxlength="5" placeholder="CODE" autocomplete="off" spellcheck="false"><button class="btn small join" ${this.busy ? 'disabled' : ''}>JOIN ROOM</button></div>${this.busy ? '<div class="hint">Connecting...</div>' : ''}`;
    }
    const canAddPlayer = !solo && !phone && s.seats.length < 4 && entrants.length < max;
    const canStart = !clash && !over && !waiting && total >= (ev.type === 'free' ? 1 : 2);

    this.app.ui.innerHTML = `<div class="screen lobby"><div class="lobby-panel">
      <h1>${solo ? 'QUICK RACE' : 'MULTIPLAYER'}</h1>
      ${this.error ? `<div class="err">${esc(this.error)}</div>` : ''}
      <div class="row"><button class="btn small src ${s.source === 'quick' ? 'on' : ''}" data-src="quick">MAP &amp; MODE</button><button class="btn small src ${s.source === 'campaign' ? 'on' : ''}" data-src="campaign">CAMPAIGN EVENTS</button></div>
      ${mapPick}${evPick}${classPick}
      <div class="hint">${esc(ev.desc || '')} Up to ${max} cars.</div>
      <h3>${solo ? 'Your car' : 'Players'}</h3>
      ${seatRows}
      ${!solo && phone ? '<div class="hint">Split-screen isn\'t available on phones.</div>' : canAddPlayer ? '<button class="btn small add-player">+ LOCAL PLAYER</button>' : ''}
      ${online}
      ${rankNote}
      ${clash ? '<div class="err">Two players are on the same controls. Give each player their own.</div>' : ''}
      ${waiting ? '<div class="hint">Waiting for online players to ready up.</div>' : ''}
      <h3>Bots <span class="hint">built to match the players' PR${cls.maxPr < Infinity ? `, capped at ${cls.maxPr}` : ''}</span></h3>
      ${this.bots.map((b) => `<div class="bot"><span>${esc(b.name)}</span><span>${rankTag(b.pr)}</span></div>`).join('') || '<div class="hint">No bots.</div>'}
      <div class="row"><button class="btn small bot-minus" ${s.bots <= minBots ? 'disabled' : ''}>- BOT</button><button class="btn small bot-plus" ${total >= max ? 'disabled' : ''}>+ BOT</button><button class="btn small bot-fill" ${total >= max ? 'disabled' : ''}>FILL SLOTS</button></div>
      <div class="row"><button class="btn back">BACK</button><button class="btn primary start" ${canStart ? '' : 'disabled'}>START &#9654;</button></div>
    </div></div>`;

    if (net) {
      // Clients see the room without builds; settings changes un-ready them (handlers below).
      const view = { code: net.session.code, eventRef: s.ref, eventName: ev.name, classId: cls.id, bots: s.bots, players: entrants.map(({ build, ...p }, i) => ({ ...p, id: p.local ? `local-${i}` : p.id })) };
      net.session.broadcast({ t: 'room', room: view });
    }
    this.bindHost(max);
  }

  clampBots() {
    const s = this.state;
    const max = maxCars(this.event());
    const humans = this.entrants().length;
    s.bots = Math.max(humans > 1 ? 0 : 1, Math.min(max - humans, s.bots));
  }

  bindHost(max) {
    const s = this.state;
    const ui = this.app.ui;
    const on = (sel, type, fn) => ui.querySelectorAll(sel).forEach((el) => el.addEventListener(type, () => fn(el)));
    // Room settings changed: online players ready up again.
    const change = (fn) => (el) => {
      fn(el);
      for (const p of this.app.net?.remote || []) p.ready = false;
      this.refresh();
    };
    on('.src', 'click', change((el) => {
      s.source = el.dataset.src;
      s.ref = null;
    }));
    on('.map-pick', 'change', change((el) => (s.ref = `${el.value}/`)));
    on('.ev-pick', 'change', change((el) => (s.ref = el.value)));
    on('.cls-pick', 'change', change((el) => (s.classId = el.value)));
    on('.bot-minus', 'click', change(() => s.bots--));
    on('.bot-plus', 'click', change(() => s.bots++));
    on('.bot-fill', 'click', change(() => (s.bots = max)));
    on('.car-pick', 'change', (el) => {
      s.seats[el.dataset.i].car = el.value;
      this.refresh();
    });
    on('.dev-pick', 'change', (el) => {
      s.seats[el.dataset.i].device = el.value;
      this.refresh();
    });
    on('.drop', 'click', (el) => {
      s.seats.splice(Number(el.dataset.i), 1);
      if (s.seats.length === 1) s.seats[0].device = 'kb';
      this.refresh();
    });
    on('.add-player', 'click', () => {
      if (this.entrants().length + s.bots >= max) s.bots--;
      s.seats.push({ car: this.cars()[0].id, device: this.freeDevice() });
      this.refresh();
    });
    on('.open-room', 'click', () => this.openRoom());
    on('.join', 'click', () => this.joinRoom(ui.querySelector('.code-in').value));
    ui.querySelector('.code-in')?.addEventListener('keydown', (e) => e.key === 'Enter' && this.joinRoom(e.target.value));
    on('.close-room', 'click', () => {
      this.leaveRoom();
      this.refresh();
    });
    on('.back', 'click', () => this.app.go('menu', { page: s.mode === 'solo' ? 'solo' : 'multi' }));
    on('.start', 'click', () => this.start());
  }

  // First controller not already taken; a lone full keyboard splits in two.
  freeDevice() {
    const s = this.state;
    const pads = this.app.localInput.gamepads.connected().length;
    const order = [...DEVICES.filter((d) => d.id.startsWith('pad')).slice(0, pads).map((d) => d.id), 'kbRight', 'kbLeft'];
    const kbSeat = s.seats.find((x) => x.device === 'kb');
    const pick = () => order.find((id) => s.seats.every((x) => !devicesClash(x.device, id)));
    let id = pick();
    if (!id && kbSeat) {
      kbSeat.device = 'kbLeft';
      id = pick();
    }
    return id || 'pad0';
  }

  // A joined player's view: their car and ready state; the host sets the rest.
  renderClient() {
    const net = this.app.net;
    const ui = this.app.ui;
    const room = net.room;
    if (!room) {
      ui.innerHTML = '<div class="screen lobby"><div class="lobby-panel"><h1>JOINING...</h1></div></div>';
      return;
    }
    const cls = prClass(room.classId);
    const me = this.carEntry(net.carId);
    const opts = this.cars().map((c) => {
      const pr = computeBuild(c.build).pr;
      return `<option value="${c.id}" ${c.id === me.id ? 'selected' : ''} ${pr > cls.maxPr ? 'disabled' : ''}>${esc(c.name)} (PR ${pr})</option>`;
    }).join('');
    const rows = room.players.map((p, i) => `<div class="seat"><div class="seat-top"><b class="pn">P${i + 1}</b><span>${esc(p.carName)}${p.id === net.session.peer.id ? ' <span class="tag">YOU</span>' : ''}</span>
      <span class="rank rank-${rankForPr(p.pr)}">${rankForPr(p.pr)}</span><span class="seat-pr">PR ${p.pr}</span><span class="${p.ready ? 'up' : 'hint'}">${p.ready ? 'READY' : 'NOT READY'}</span></div>
      <div class="record">${esc(p.record || '')}</div></div>`).join('');
    const spread = rankSpread(room.players.map((p, i) => ({ name: `P${i + 1}`, car: p.carName, pr: p.pr })));
    ui.innerHTML = `<div class="screen lobby"><div class="lobby-panel">
      <h1>ROOM ${esc(room.code)}</h1>
      <div class="hint">${esc(room.eventName)} &middot; ${cls.name}${cls.maxPr < Infinity ? ` (PR &le; ${cls.maxPr})` : ''} &middot; ${room.bots} bots. The host picks the event.</div>
      <h3>Your car</h3>
      <div class="seat"><div class="seat-top"><select class="car-pick">${opts}</select><span class="rank rank-${rankForPr(me.pr)}">${rankForPr(me.pr)}</span><span class="seat-pr">PR ${me.pr}</span></div>
        ${me.pr > cls.maxPr ? `<div class="err">Over the ${cls.name} cap.</div>` : ''}<div class="record">${esc(me.record)}</div></div>
      <h3>Players</h3>${rows}
      ${spread.wild ? `<div class="rank-warn"><b>WILDLY DIFFERENT RANKS</b> rank ${spread.low.rank} (PR ${spread.low.pr}) up to rank ${spread.high.rank} (PR ${spread.high.pr}).</div>` : ''}
      <div class="row"><button class="btn leave">LEAVE ROOM</button><button class="btn primary ready" ${me.pr > cls.maxPr ? 'disabled' : ''}>${net.ready ? 'NOT READY' : 'READY'}</button></div>
    </div></div>`;
    ui.querySelector('.car-pick').addEventListener('change', (e) => {
      net.carId = e.target.value;
      net.ready = false;
      this.sendCar();
    });
    ui.querySelector('.ready').addEventListener('click', () => {
      net.ready = !net.ready;
      this.sendCar();
    });
    ui.querySelector('.leave').addEventListener('click', () => {
      this.leaveRoom();
      this.refresh();
    });
  }

  render() {
    return { scene: this.scene, camera: this.camera };
  }
}
