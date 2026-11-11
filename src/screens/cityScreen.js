import * as THREE from 'three';
import { DISTRICTS, HOME_EVENTS, MODIFIER_LABELS, districtEvents, districtUnlocked, bossProgress, playedRoamEvent } from '../career/districts.js';
import { SHOP_KINDS, shopStock, buyPrice, sellPrice, buyPart, sellPart } from '../career/shop.js';
import { saveCareer, activeCar } from '../career/career.js';
import { computeBuild, resolvePart } from '../parts/build.js';
import { partName, SLOT_NAMES } from '../parts/catalog.js';
import { drawText, textWidth } from '../ui/bitmapFont.js';
import { districtMap, SETBACK } from '../sim/city.js';
import { getVenue } from '../sim/tracks/venues.js';
import { makeRng } from '../parts/generate.js';
import { keepScroll } from '../ui/keepScroll.js';
import { listMaps, customEvents } from '../content/library.js';

const MAP_W = 400;
const MAP_H = 300;
const TYPE_COLOR = { free: '#ffffff', circuit: '#05d9e8', sprint: '#ff2a6d', arena: '#ffb000', drag: '#39ff14', rampage: '#ff3c3c', lastLapOut: '#ff8a00', duel: '#ff5ec4', cup: '#ffd700' };
const TYPE_LABEL = { free: 'FREE DRIVE', sprint: 'SPRINT', circuit: 'CIRCUIT', arena: 'ARENA', drag: 'DRAG', rampage: 'RAMPAGE', lastLapOut: 'LAST LAP OUT', duel: 'DUEL', cup: 'CUP' };
const kindOf = (e) => (e.mode === 'rampage' || e.mode === 'lastLapOut' || e.mode === 'duel' ? e.mode : e.type); // (Rampage and Last Lap Out are circuit modes; a Duel is a sprint or circuit mode)
const HOME = { x: 19.5, y: 50 }; // map coords (0-100)
// On the map but not raced yet (designs in docs/districts). Lobed like its cul-de-sacs.
const UPCOMING = []; // districts on the map but not in the game yet
// The river, through these points: down between Maple Hollow and Chrome
// Heights, then east between Chrome and the Undercity.
const RIVER = [[66.25, -2], [65.5, 8], [66.5, 17.3], [67.5, 26.3], [66.5, 35], [65.75, 40.7], [67, 45.7], [70.25, 49], [75, 50], [81.25, 50.7], [87.25, 51.7], [93.75, 52.3], [101.25, 51.3]];
// Highways between the districts, through these points. Bridges where they cross the river.
const ROADS = [
  [[25, 42.3], [27, 45.3], [24.5, 48], [21.75, 49.7]], // Corporate Spire - home: winding down the hill
  [[17.25, 50.3], [14, 51], [12.5, 53.7], [14.5, 55.3], [13, 58.7]], // home - Rustline Docks: a hairpin down to the docks
  [[36.5, 24.7], [39.5, 22.5], [40.5, 25.5], [43.5, 26]], // Corporate Spire (Mercantile Street) - Maple Hollow: an S-bend
  [[61.5, 18.7], [65, 14.7], [68.5, 14], [71.5, 16]], // Maple Hollow - Chrome Heights: a humped bridge
  [[53, 41.7], [57, 44.7], [49, 47.3], [53, 50], [53, 52.3]], // Maple Hollow - Neon Strip: switchbacks
  [[90, 44.7], [88, 49.3], [92.5, 52.7], [90, 58.7]], // Chrome Heights - The Undercity: an S across the river
  [[35.5, 71.3], [38.5, 68.7], [40, 75.3], [42.75, 72.7]], // Rustline Docks (Dock Road) - Neon Strip (the Strip)
  [[63.5, 74], [66.25, 74], [69, 72.3], [68.25, 69], [66, 70], [66.5, 73], [69.25, 74.7], [72, 73.3]], // Neon Strip - The Undercity: a corkscrew ramp
];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The career hub: a pixel map of Neon Sprawl. Pick a district to see its
// events, shops and boss; home has the garage and the free events.
export class CityScreen {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#05030a');
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 10);
    this.selected = 'home';
    this.view = 'events';
  }

  enter() {
    this.render_();
  }

  exit() {
    this.app.ui.innerHTML = '';
  }

  step() {}

  render() {
    return { scene: this.scene, camera: this.camera };
  }

  get car() {
    return activeCar(this.app.career);
  }

  render_() {
    const { career } = this.app;
    const car = this.car;
    const computed = computeBuild(car.build);
    keepScroll(this.app.ui, `${this.selected}:${this.view}`);
    this.app.ui.innerHTML = `<div class="screen city">
      <div class="g-head">
        <div><h1>NEON SPRAWL</h1><div class="car-name">${esc(car.name)} &middot; ${computed.ok ? `PR ${computed.pr}` : 'NOT DRIVABLE'} <span class="cash">$${career.cash}</span></div></div>
        <button class="btn garage">&#9664; GARAGE</button>
      </div>
      <canvas class="city-map" width="${MAP_W}" height="${MAP_H}"></canvas>
      <div class="city-panel">${this.panelHtml(computed)}</div>
    </div>`;
    this.drawMap();
    const ui = this.app.ui;
    ui.querySelectorAll('.garage, .garage-alt').forEach((b) => b.addEventListener('click', () => this.app.go('garage')));
    ui.querySelector('.city-map').addEventListener('click', (e) => this.pick(e));
    // Hovering an event shows its route on the map.
    ui.querySelectorAll('.event-card').forEach((b) => {
      const show = (id) => () => {
        this.hover = id;
        this.drawMap();
      };
      b.addEventListener('mouseenter', show(b.dataset.event));
      b.addEventListener('focus', show(b.dataset.event));
      b.addEventListener('mouseleave', show(null));
      b.addEventListener('blur', show(null));
    });
    ui.querySelectorAll('[data-event]').forEach((b) => b.addEventListener('click', () => this.enterEvent(b.dataset.event)));
    ui.querySelectorAll('[data-shop]').forEach((b) => b.addEventListener('click', () => {
      this.view = `shop:${b.dataset.shop}`;
      this.render_();
    }));
    ui.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => {
      this.view = 'events';
      this.render_();
    }));
    ui.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      const [kind, uid] = [b.dataset.kind, b.dataset.buy];
      if (buyPart(career, DISTRICTS[this.selected], kind, uid).ok) saveCareer(career);
      this.render_();
    }));
    ui.querySelectorAll('[data-sell]').forEach((b) => b.addEventListener('click', () => {
      if (sellPart(career, b.dataset.sell).ok) saveCareer(career);
      this.render_();
    }));
    ui.querySelectorAll('[data-home]').forEach((b) => b.addEventListener('click', () => {
      this.selected = 'home';
      this.view = 'events';
      this.render_();
    }));
  }

  allEvents() {
    return [...HOME_EVENTS, ...DISTRICTS.map(playedRoamEvent), ...DISTRICTS.flatMap((d) => districtEvents(d)), ...listMaps().flatMap(customEvents)];
  }

  enterEvent(id) {
    const { career } = this.app;
    const def = this.allEvents().find((e) => e.id === id);
    const car = this.car;
    if (!computeBuild(car.build).ok || (def.entryFee || 0) > career.cash) return;
    this.app.go('race', { build: car.build, car, event: def });
  }

  eventCard(e, drivable, n = 0) {
    const { career } = this.app;
    const cleared = e.boss && career.bosses.includes(e.district);
    const canPay = (e.entryFee || 0) <= career.cash;
    const gate = e.boss ? bossProgress(career, DISTRICTS.find((d) => d.id === e.district)) : { open: true };
    const badges = [
      e.boss ? '<span class="badge boss">BOSS</span>' : '',
      e.rival ? '<span class="badge rival">RIVAL</span>' : '',
      cleared ? '<span class="badge clear">BEATEN</span>' : '',
    ].join('');
    const mods = (e.modifiers || []).map((m) => `<span class="mod">${MODIFIER_LABELS[m]}</span>`).join('');
    const meta = [
      e.cars > 1 ? `${e.cars} cars` : 'Solo',
      e.laps ? `${e.laps} laps` : '',
      e.timeLimit ? `${Math.round(e.timeLimit / 60)} min` : '',
      e.targets ? `targets ${e.targets.join('/')}` : '',
      e.purse ? `Purse <b>$${e.purse}</b>` : 'No prizes',
      `Entry ${e.entryFee ? `$${e.entryFee}` : 'free'}`,
    ].filter(Boolean).join(' &middot; ');
    const disabled = !drivable || !canPay || !gate.open;
    const done = career.results?.[e.id];
    const ord = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
    return `<button class="event-card${done ? ' done' : ''}" data-event="${e.id}" ${disabled ? 'disabled' : ''}>
      <span>${n ? `<span class="num" style="background:${TYPE_COLOR[kindOf(e)]}">${n}</span>` : ''}<span class="tag">${TYPE_LABEL[kindOf(e)]}</span> ${badges}</span>
      <b>${esc(e.name)}</b>
      ${e.desc ? `<span class="event-desc">${esc(e.desc)}</span>` : ''}
      ${mods ? `<span class="mods">${mods}</span>` : ''}
      <span class="event-meta">${meta}</span>
      ${e.mode === 'duel' ? '<span class="event-meta">One on one with the rival. Win: one of their parts &middot; Lose: one of yours</span>' : ''}
      ${e.cup ? `<span class="event-meta">${e.cup.rounds.length} rounds &middot; points 6/4/3/2/1 &middot; +1 for the most takedowns in a round</span>` : ''}
      ${done ? `<span class="event-result"><span>Best: <b>${ord(done.best)}</b> of ${done.of}${done.runs > 1 ? ` &middot; ${done.runs} runs` : ''}</span><span class="retry">RETRY</span></span>` : ''}
      ${!gate.open ? `<span class="err">Locked: podium ${gate.need - gate.done} more event${gate.need - gate.done > 1 ? 's' : ''} here to face the boss (${gate.done}/${gate.need}).</span>` : !drivable ? '<span class="err">Your car is missing parts.</span>' : !canPay ? '<span class="err">Not enough cash for the entry fee.</span>' : ''}
    </button>`;
  }

  panelHtml(computed) {
    const { career } = this.app;
    if (this.selected === 'home') {
      return `<h2>Home</h2><div class="hint">Your garage and the back streets. These are always open.</div>
        <button class="btn primary wide garage-alt">GARAGE</button>
        <h3>Back alley</h3>${HOME_EVENTS.map((e, k) => this.eventCard(e, computed.ok, k + 1)).join('')}
        <h3>Free roam</h3>${DISTRICTS.filter((d, i) => this.app.settings.roamAll || districtUnlocked(career, i)).map((d) => this.eventCard(playedRoamEvent(d), computed.ok)).join('')}
        ${listMaps().length ? `<h3>Your maps <span class="hint">made in the Creator: no prizes</span></h3>${listMaps().flatMap(customEvents).map((e) => this.eventCard(e, computed.ok)).join('')}` : ''}`;
    }
    const d = DISTRICTS[this.selected];
    if (this.view.startsWith('shop:')) return this.shopHtml(d, this.view.slice(5));
    const shops = ['shop', 'used', ...(this.selected >= 3 ? ['black'] : [])]
      .map((k) => `<button class="btn small" data-shop="${k}">${SHOP_KINDS[k].name.toUpperCase()}</button>`).join('');
    return `<h2 style="color:${d.color}">${d.name}</h2>
      <div class="hint">${esc(d.blurb)}<br>Faction: <b>${d.faction}</b> &middot; Tier ${this.selected + 1}</div>
      <div class="row">${shops}<button class="btn small" data-home="1">HOME</button></div>
      <h3>Events</h3>${districtEvents(d).map((e, k) => this.eventCard(e, computed.ok, k + 1)).join('')}`;
  }

  shopHtml(d, kind) {
    const { career } = this.app;
    const stock = shopStock(career, d, kind);
    const statLine = (p) => {
      const e = resolvePart(p);
      const keys = ['torque', 'hp', 'armor', 'grip', 'brakeForce', 'damage', 'charges', 'heatCapacity', 'downforce'];
      const k = keys.find((x) => typeof e[x] === 'number' && e[x]);
      return k ? `${k} ${Math.round(e[k] * (k === 'armor' ? 100 : 1) * 100) / 100}` : '';
    };
    const rows = stock.map((p) => {
      const price = buyPrice(p, kind);
      return `<div class="shop-row"><span><span class="q-${p.quality}">${esc(partName(p))}</span><small>${SLOT_NAMES[p.slot]} &middot; ${statLine(p)}${p.condition < 100 ? ` &middot; ${p.condition}%` : ''}</small></span>
        <button class="btn small" data-buy="${p.uid}" data-kind="${kind}" ${price > career.cash ? 'disabled' : ''}>$${price}</button></div>`;
    }).join('') || '<div class="hint">Sold out until after your next event.</div>';
    const sell = career.inventory.map((p) => `<div class="shop-row"><span><span class="q-${p.quality}">${esc(partName(p))}</span><small>${SLOT_NAMES[p.slot]}${p.condition < 100 ? ` &middot; ${Math.round(p.condition)}%` : ''}</small></span>
        <button class="btn small" data-sell="${p.uid}">SELL $${sellPrice(p)}</button></div>`).join('') || '<div class="hint">No spare parts to sell.</div>';
    return `<h2 style="color:${d.color}">${SHOP_KINDS[kind].name}</h2>
      <div class="hint">${d.name}. Stock changes after every event.</div>
      <div class="row"><button class="btn small" data-back="1">&#9664; BACK</button></div>
      <h3>For sale</h3>${rows}<h3>Sell your spares</h3>${sell}`;
  }

  get padTabLabel() {
    return 'District';
  }

  // LB / RB on a gamepad: step through home and the unlocked districts.
  onPadTab(dir) {
    const stops = ['home', ...DISTRICTS.map((_, i) => i).filter((i) => districtUnlocked(this.app.career, i))];
    const k = stops.indexOf(this.selected);
    this.selected = stops[(k + dir + stops.length) % stops.length];
    this.view = 'events';
    this.render_();
  }

  pick(e) {
    const rect = e.target.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    if (Math.hypot(mx - HOME.x, my - HOME.y) < 6) {
      this.selected = 'home';
    } else {
      const i = DISTRICTS.findIndex((d) => inside(d.map, mx, my));
      if (i < 0 || !districtUnlocked(this.app.career, i)) return;
      this.selected = i;
    }
    this.view = 'events';
    this.render_();
  }

  // A pixel street map of Neon Sprawl: every district's real streets and
  // blocks, water, highways, markers, and the hovered event's route.
  drawMap() {
    const canvas = this.app.ui.querySelector('.city-map');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = MAP_W;
    const H = MAP_H;
    const P = (x, y) => [(x / 100) * W, (y / 100) * H];
    const rng = makeRng(2077);

    // Land, with the rest of the city's streets faintly behind.
    ctx.fillStyle = '#0b0814';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#17121f';
    for (let x = 2; x < W; x += 7 + Math.floor(rng() * 7)) ctx.fillRect(x, 0, 1, H);
    for (let y = 2; y < H; y += 6 + Math.floor(rng() * 7)) ctx.fillRect(0, y, W, 1);

    // The bay along the south: the docks sit right on it, further east the
    // shore drops away. Then the river through the middle.
    const water = '#0c1c36';
    const shore = (x) => (x < W * 0.375 ? 0.873 : x < W * 0.44 ? 0.873 + ((x - W * 0.375) / (W * 0.065)) * 0.06 : 0.933) * H;
    ctx.fillStyle = water;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 3) ctx.lineTo(x, shore(x) + Math.sin(x / 19) * 2.5 + Math.sin(x / 6) * 0.8);
    ctx.lineTo(W, H);
    ctx.fill();
    const river = spline(RIVER.map((p) => P(...p)));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = water;
    ctx.lineWidth = 7;
    path(ctx, river);
    ctx.stroke();
    ctx.fillStyle = '#1c3050';
    for (let k = 0; k < 40; k++) ctx.fillRect(Math.floor(rng() * W), Math.floor(H * 0.965 + rng() * H * 0.03), 2, 1);

    // Highways between the districts, with railed bridge decks over the river.
    const roads = ROADS.map((r) => spline(r.map((p) => P(...p)), 10));
    ctx.strokeStyle = '#261e38';
    ctx.lineWidth = 5;
    for (const r of roads) {
      path(ctx, r);
      ctx.stroke();
    }
    for (const r of roads) {
      for (let k = 1; k < r.length; k++) {
        const [x0, y0] = r[k - 1];
        const [x1, y1] = r[k];
        if (distToLine(river, [(x0 + x1) / 2, (y0 + y1) / 2]) > 6.5) continue;
        const len = Math.hypot(x1 - x0, y1 - y0) || 1;
        const nx = (-(y1 - y0) / len) * 3.2;
        const ny = ((x1 - x0) / len) * 3.2;
        ctx.strokeStyle = '#3a3050';
        ctx.lineWidth = 5;
        path(ctx, [[x0, y0], [x1, y1]]);
        ctx.stroke();
        ctx.strokeStyle = '#8a82b0';
        ctx.lineWidth = 1;
        for (const s of [1, -1]) {
          path(ctx, [[x0 + nx * s, y0 + ny * s], [x1 + nx * s, y1 + ny * s]]);
          ctx.stroke();
        }
      }
    }
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#6a4aa8';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 3]);
    for (const r of roads) {
      path(ctx, r);
      ctx.stroke();
    }
    ctx.restore();

    DISTRICTS.forEach((d, i) => this.drawDistrict(ctx, d, i, P));
    for (const u of UPCOMING) this.drawUpcoming(ctx, u, P);

    // Home garage.
    const [hx, hy] = P(HOME.x, HOME.y);
    ctx.fillStyle = this.selected === 'home' ? '#ffffff' : '#ffb000';
    ctx.beginPath();
    ctx.moveTo(hx, hy - 8);
    ctx.lineTo(hx + 8, hy);
    ctx.lineTo(hx - 8, hy);
    ctx.fill();
    ctx.fillRect(hx - 6, hy, 12, 7);
    ctx.fillStyle = '#0b0814';
    ctx.fillRect(hx - 2, hy + 2, 4, 5);
    this.plate(ctx, 'HOME', hx, hy + 10, '#ffb000');

    // Legend (one row along the bay) and compass.
    const items = [['CIRCUIT', TYPE_COLOR.circuit], ['SPRINT', TYPE_COLOR.sprint], ['ARENA', TYPE_COLOR.arena], ['DRAG', TYPE_COLOR.drag], ['SHOP', '#e8e8ff']];
    const widths = items.map(([t]) => textWidth(t) + 14);
    const ly = H - 12;
    ctx.fillStyle = 'rgba(5,3,10,0.85)';
    ctx.fillRect(4, ly - 3, widths.reduce((a, w) => a + w, 0) + 2, 13);
    let lx = 8;
    items.forEach(([t, c], k) => {
      ctx.fillStyle = c;
      ctx.fillRect(lx, ly + 1, 5, 5);
      drawText(ctx, t, lx + 9, ly, { color: '#c8c0e8' });
      lx += widths[k];
    });
    drawText(ctx, 'N', W - 10, 5, { color: '#8a82b0', align: 'center' });
    ctx.fillStyle = '#8a82b0';
    ctx.beginPath();
    ctx.moveTo(W - 10, 14);
    ctx.lineTo(W - 13, 21);
    ctx.lineTo(W - 7, 21);
    ctx.fill();
  }

  // A district that's on the map but not open yet.
  drawUpcoming(ctx, u, P) {
    const poly = u.map.map(([x, y]) => P(x, y));
    const outline = () => {
      ctx.beginPath();
      poly.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
    };
    ctx.save();
    outline();
    ctx.fillStyle = '#0f0c16';
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    for (let k = -MAP_H; k < MAP_W; k += 6) {
      ctx.beginPath();
      ctx.moveTo(k, 0);
      ctx.lineTo(k + MAP_H, MAP_H);
      ctx.stroke();
    }
    ctx.restore();
    outline();
    ctx.strokeStyle = '#3a3448';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const [x, y] = labelAt(u, P);
    this.plate(ctx, u.name.toUpperCase(), x, y, '#6a6478');
    this.plate(ctx, 'COMING SOON', x, y + 11, '#6a6478');
  }

  drawDistrict(ctx, d, i, P) {
    const { career } = this.app;
    const open = districtUnlocked(career, i);
    const poly = d.map.map(([x, y]) => P(x, y));
    const frame = (d.frame || boxQuad(d.map)).map(([x, y]) => P(x, y));
    const map = districtMap(d.city);
    const b = map.drawBounds || map.bounds;
    // A plan district's streets are drawn to its boundary, which is its outline.
    const pad = map.plan ? 0 : SETBACK + 14;
    const at = (x, z) => bilinear(frame, (x - b.minX + pad) / (b.maxX - b.minX + 2 * pad), (z - b.minZ + pad) / (b.maxZ - b.minZ + 2 * pad));
    const outline = () => {
      ctx.beginPath();
      poly.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
    };
    const line = (pts, closed) => {
      ctx.beginPath();
      pts.forEach(([x, z], k) => (k ? ctx.lineTo(...at(x, z)) : ctx.moveTo(...at(x, z))));
      if (closed) ctx.closePath();
    };

    ctx.save();
    outline();
    ctx.fillStyle = open ? mix(d.color, '#0b0814', 0.86) : '#0f0c16';
    ctx.fill();
    ctx.clip();
    // Blocks, coloured by what's on them.
    const lotColor = {
      buildings: mix(d.color, '#1c1828', 0.78), alley: mix(d.color, '#1c1828', 0.72), yard: '#4a3028',
      construction: '#5c3e1e', plaza: '#4a4660', parking: '#2a2832', arena: mix(d.color, '#0b0814', 0.45),
      park: '#1f5a2a', housing: '#2e4030', quad: mix(d.color, '#1c1828', 0.68), market: '#6a2a58', casino: mix(d.color, '#1c1828', 0.35),
      railyard: '#3e3630', tanks: '#44444c', terminal: '#3a3440',
      warehouses: mix(d.color, '#1c1828', 0.78), fish: '#34464e', shop: mix(d.color, '#1c1828', 0.5),
    };
    if (map.plan) drawPlan(ctx, map, d, open, line, lotColor);
    for (const c of map.cells) {
      const [x0, x1, z0, z1] = c.lot;
      ctx.fillStyle = open ? lotColor[c.kind] : '#191522';
      line([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], true);
      ctx.fill();
    }
    // Streets, with the main avenue picked out. Piers come after the clip: they run out over the bay.
    const piers = [];
    for (const e of map.plan ? [] : map.edges.values()) {
      const A = map.nodes[e.a];
      const B = map.nodes[e.b];
      if (A.pier || B.pier) {
        piers.push([[A.x, A.z], [B.x, B.z]]);
        continue;
      }
      const avenue = A.j === map.avenue && B.j === map.avenue;
      ctx.strokeStyle = !open ? '#2e2838' : avenue ? d.color : '#8a86a4';
      ctx.lineWidth = avenue ? 1.8 : 1;
      line([[A.x, A.z], [B.x, B.z]]);
      ctx.stroke();
    }
    if (!open) {
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      for (let k = -MAP_H; k < MAP_W; k += 6) {
        ctx.beginPath();
        ctx.moveTo(k, 0);
        ctx.lineTo(k + MAP_H, MAP_H);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.strokeStyle = !open ? '#2e2838' : '#8a86a4';
    ctx.lineWidth = 1.6;
    for (const p of piers) {
      line(p);
      ctx.stroke();
    }
    outline();
    ctx.strokeStyle = this.selected === i ? '#ffffff' : open ? d.color : '#3a3448';
    ctx.lineWidth = this.selected === i ? 2 : 1.5;
    ctx.stroke();

    if (open) {
      // The hovered event's route (shortcuts dashed), then numbered markers.
      const events = this.selected === i ? districtEvents(d) : this.selected === 'home' && d.id === 'rustline' ? HOME_EVENTS : [];
      const pins = [];
      events.forEach((e, k) => {
        const v = getVenue(e.venue, e);
        if (v.kind === 'arena') {
          if (this.hover === e.id) {
            const { cx, cz, sizeX, sizeZ } = v.def;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            line([[cx - sizeX / 2, cz - sizeZ / 2], [cx + sizeX / 2, cz - sizeZ / 2], [cx + sizeX / 2, cz + sizeZ / 2], [cx - sizeX / 2, cz + sizeZ / 2]], true);
            ctx.stroke();
          }
          pins.push([at(v.def.cx, v.def.cz), TYPE_COLOR[kindOf(e)] || TYPE_COLOR.arena, k + 1]);
          return;
        }
        const pts = v.def.points.map(([x, , z]) => [x, z]);
        if (this.hover === e.id) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          line(pts, v.def.closed);
          ctx.stroke();
          ctx.strokeStyle = TYPE_COLOR[kindOf(e)];
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.setLineDash([2, 2]);
          ctx.strokeStyle = '#ffb000';
          ctx.lineWidth = 1.6;
          for (const br of v.def.branches || []) {
            line(br.points.map(([x, , z]) => [x, z]));
            ctx.stroke();
          }
          ctx.setLineDash([]);
        }
        // (Rampage and Last Lap Out share their circuit's start: pinned halfway and a quarter of the way round.)
        const pin = e.mode === 'rampage' ? pts[Math.floor(pts.length / 2)] : e.mode === 'lastLapOut' ? pts[Math.floor(pts.length / 4)] : pts[0];
        pins.push([at(pin[0], pin[1]), TYPE_COLOR[kindOf(e)], k + 1]);
      });
      const grid = d.city.grid;
      const planShop = d.city.plan?.specials?.find((q) => q.kind === 'shop');
      const shop = planShop ? null : grid?.shop ? map.cells[grid.shop[1] * (d.city.cols - 1) + grid.shop[0]] : map.cells.filter((c) => c.kind === 'buildings').sort((p, q) => Math.hypot(...lotCentre(p.lot)) - Math.hypot(...lotCentre(q.lot)))[0];
      if (planShop) pins.push([at(planShop.x, planShop.z), '#e8e8ff', '$']);
      else if (d.city.plan?.shop) pins.push([at(...d.city.plan.shop), '#e8e8ff', '$']); // the parts shop's own spot (Maple Hollow's plaza)
      else if (shop) pins.push([at(...lotCentre(shop.lot)), '#e8e8ff', '$']);
      if (!events.length && map.arena) pins.push([at(map.arena.x, map.arena.z), TYPE_COLOR.arena, '']);
      for (const [[x, y], color, text] of pins) this.pin(ctx, x, y, color, String(text));
    }

    // Name plate, status underneath.
    const [x, y] = labelAt(d, P);
    const status = !open ? 'LOCKED' : career.bosses.includes(d.id) ? 'CLEARED' : `TIER ${i + 1}`;
    this.plate(ctx, d.name.toUpperCase(), x, y, open ? d.color : '#6a6478');
    this.plate(ctx, status, x, y + 11, open ? '#e8e8ff' : '#6a6478');
  }

  plate(ctx, text, x, y, color) {
    const w = textWidth(text) + 6;
    ctx.fillStyle = 'rgba(5,3,10,0.85)';
    ctx.fillRect(Math.round(x - w / 2), Math.round(y - 2), w, 11);
    drawText(ctx, text, x, y, { color, align: 'center' });
  }

  pin(ctx, x, y, color, text) {
    const px = Math.round(x);
    const py = Math.round(y);
    ctx.fillStyle = '#05030a';
    ctx.fillRect(px - 6, py - 6, 13, 13);
    ctx.fillStyle = color;
    ctx.fillRect(px - 5, py - 5, 11, 11);
    if (text) drawText(ctx, text, px + 1, py - 3, { color: '#05030a', align: 'center' });
  }
}

// Maps (u, v) in the unit square onto a quad [top-left, top-right, bottom-right, bottom-left].
function bilinear(q, u, v) {
  const tx = q[0][0] + (q[1][0] - q[0][0]) * u;
  const ty = q[0][1] + (q[1][1] - q[0][1]) * u;
  const bx = q[3][0] + (q[2][0] - q[3][0]) * u;
  const by = q[3][1] + (q[2][1] - q[3][1]) * u;
  return [tx + (bx - tx) * v, ty + (by - ty) * v];
}

const lotCentre = (lot) => [(lot[0] + lot[1]) / 2, (lot[2] + lot[3]) / 2];

// The bounding box of an outline, as a quad.
function boxQuad(pts) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

// Where a district's name plate goes (canvas px): its label, or top middle.
function labelAt(d, P) {
  if (d.label) return P(...d.label);
  const [[x0, y0], [x1]] = boxQuad(d.map);
  const [x, y] = P((x0 + x1) / 2, y0);
  return [x, y + 4];
}

// A smooth curve through the points (Catmull-Rom), as a polyline.
function spline(pts, steps = 8) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b, c, d] = [pts[Math.max(i - 1, 0)], pts[i], pts[i + 1], pts[Math.min(i + 2, pts.length - 1)]];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      out.push([0, 1].map((j) => 0.5 * (2 * b[j] + (c[j] - a[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t * t + (3 * b[j] - a[j] - 3 * c[j] + d[j]) * t * t * t)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function path(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
}

// Distance from a point to a polyline.
function distToLine(pts, [px, py]) {
  let best = Infinity;
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1];
    const [bx, by] = pts[k];
    const l2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2));
    best = Math.min(best, Math.hypot(px - ax - t * (bx - ax), py - ay - t * (by - ay)));
  }
  return best;
}

// Blend two #rrggbb colours: t = 0 gives a, 1 gives b.
function mix(a, b, t) {
  const pa = [1, 3, 5].map((k) => parseInt(a.slice(k, k + 2), 16));
  const pb = [1, 3, 5].map((k) => parseInt(b.slice(k, k + 2), 16));
  return `rgb(${pa.map((c, k) => Math.round(c + (pb[k] - c) * t)).join(',')})`;
}

function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// A plan district on the city map: its blocks and sites coloured by what's on
// them, then its streets along their curves (the main street picked out).
function drawPlan(ctx, map, d, open, line, lotColor) {
  const colors = {
    ...lotColor, hotels: mix(d.color, '#1c1828', 0.7), clubs: mix(d.color, '#1c1828', 0.62), motels: '#3a3a52', chapels: '#4a4660',
    pawn: '#40382e', flats: '#2e2c3c', arcade: '#1e4a4a', palace: mix(d.color, '#1c1828', 0.5), drivein: '#26242e', boneyard: '#3a2e2a',
    depot: '#2a2832', market: '#6a2a58', promenade: '#1f4a2a',
    // A suburb: houses on lawns, the golf course, the park, Phase 2's dirt.
    houses: mix(d.color, '#1c2818', 0.78), island: '#27452a', green: '#27452a', golf: '#2e5a2a', park: '#2a5230', fields: '#2e5430',
    construction: '#5a4630', school: '#4a3836', plaza: '#3a3848',
  };
  // The rooftops: decks shaded by tier (the Crown lightest).
  for (const dk of map.decks || []) {
    const h = Array.isArray(dk.h) ? Math.max(...dk.h) : dk.h;
    ctx.fillStyle = open ? mix(d.color, '#1c1828', h >= 108 ? 0.45 : h >= 100 ? 0.6 : 0.72) : '#191522';
    line(dk.poly, true);
    ctx.fill();
  }
  for (const b of map.blocks) {
    ctx.fillStyle = open ? colors[b.kind] || colors.buildings : '#191522';
    line(b.lot, true);
    ctx.fill();
  }
  for (const L of map.style.plan.lots || []) {
    if (!L.poly) continue;
    ctx.fillStyle = open ? colors[L.kind] || colors.buildings : '#191522';
    line(L.poly, true);
    ctx.fill();
  }
  for (const s of map.sites) {
    if (!s.poly || s.kind === 'tower') continue; // a way through (Maple Hollow's backyards); a tower on a deck
    ctx.fillStyle = open ? colors[s.kind] || colors.arena : '#191522';
    line(s.poly, true);
    ctx.fill();
    if (s.pond) {
      ctx.fillStyle = open ? '#1e3a5a' : '#191522';
      line(s.pond, true);
      ctx.fill();
    }
  }
  for (const st of map.streets) {
    const main = !!st.median;
    ctx.strokeStyle = !open ? '#2e2838' : main ? d.color : '#8a86a4';
    ctx.lineWidth = main ? 2 : st.width >= 20 ? 1.4 : st.width >= 12 ? 1 : 0.7;
    line(st.pts, false);
    ctx.stroke();
  }
}
