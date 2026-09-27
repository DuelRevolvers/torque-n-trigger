import * as THREE from 'three';
import { DISTRICTS, HOME_EVENTS, MODIFIER_LABELS, districtEvents, districtUnlocked, bossProgress } from '../career/districts.js';
import { SHOP_KINDS, shopStock, buyPrice, sellPrice, buyPart, sellPart } from '../career/shop.js';
import { saveCareer, activeCar } from '../career/career.js';
import { computeBuild, resolvePart } from '../parts/build.js';
import { partName, SLOT_NAMES } from '../parts/catalog.js';
import { drawText, textWidth } from '../ui/bitmapFont.js';
import { districtMap, SETBACK } from '../sim/city.js';
import { getVenue } from '../sim/tracks/venues.js';
import { makeRng } from '../parts/generate.js';
import { keepScroll } from '../ui/keepScroll.js';

const MAP_W = 400;
const MAP_H = 300;
const TYPE_COLOR = { free: '#ffffff', circuit: '#05d9e8', sprint: '#ff2a6d', arena: '#ffb000', drag: '#39ff14' };
const TYPE_LABEL = { free: 'FREE DRIVE', sprint: 'SPRINT', circuit: 'CIRCUIT', arena: 'ARENA', drag: 'DRAG' };
const HOME = { x: 24, y: 46 }; // map coords (0-100)
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
    return [...HOME_EVENTS, ...DISTRICTS.flatMap((d) => districtEvents(d))];
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
      e.purse ? `Purse <b>$${e.purse}</b>` : 'No prizes',
      `Entry ${e.entryFee ? `$${e.entryFee}` : 'free'}`,
    ].filter(Boolean).join(' &middot; ');
    const disabled = !drivable || !canPay || !gate.open;
    return `<button class="event-card" data-event="${e.id}" ${disabled ? 'disabled' : ''}>
      <span>${n ? `<span class="num" style="background:${TYPE_COLOR[e.type]}">${n}</span>` : ''}<span class="tag">${TYPE_LABEL[e.type]}</span> ${badges}</span>
      <b>${esc(e.name)}</b>
      ${e.desc ? `<span class="event-desc">${esc(e.desc)}</span>` : ''}
      ${mods ? `<span class="mods">${mods}</span>` : ''}
      <span class="event-meta">${meta}</span>
      ${!gate.open ? `<span class="err">Locked: podium ${gate.need - gate.done} more event${gate.need - gate.done > 1 ? 's' : ''} here to face the boss (${gate.done}/${gate.need}).</span>` : !drivable ? '<span class="err">Your car is missing parts.</span>' : !canPay ? '<span class="err">Not enough cash for the entry fee.</span>' : ''}
    </button>`;
  }

  panelHtml(computed) {
    const { career } = this.app;
    if (this.selected === 'home') {
      return `<h2>Home</h2><div class="hint">Your garage and the back streets. These are always open.</div>
        <button class="btn primary wide garage-alt">GARAGE</button>
        <h3>Back alley</h3>${HOME_EVENTS.map((e, k) => this.eventCard(e, computed.ok, k + 1)).join('')}`;
    }
    const d = DISTRICTS[this.selected];
    if (this.view.startsWith('shop:')) return this.shopHtml(d, this.view.slice(5));
    const shops = ['shop', 'used', ...(d.tier >= 2 ? ['black'] : [])]
      .map((k) => `<button class="btn small" data-shop="${k}">${SHOP_KINDS[k].name.toUpperCase()}</button>`).join('');
    return `<h2 style="color:${d.color}">${d.name}</h2>
      <div class="hint">${esc(d.blurb)}<br>Faction: <b>${d.faction}</b> &middot; Tier ${d.tier + 1}</div>
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

    // The bay along the south and the river through the middle.
    const water = '#0c1c36';
    ctx.fillStyle = water;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 3) ctx.lineTo(x, H * 0.955 + Math.sin(x / 19) * 2.5 + Math.sin(x / 6) * 0.8);
    ctx.lineTo(W, H);
    ctx.fill();
    ctx.strokeStyle = water;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(...P(61, -2));
    ctx.bezierCurveTo(...P(59, 18), ...P(64, 34), ...P(64, 46.5));
    ctx.bezierCurveTo(...P(64, 48), ...P(80, 46), ...P(102, 47));
    ctx.stroke();
    ctx.fillStyle = '#1c3050';
    for (let k = 0; k < 40; k++) ctx.fillRect(Math.floor(rng() * W), Math.floor(H * 0.965 + rng() * H * 0.03), 2, 1);

    // Highways between districts.
    const centre = (d) => P(d.map.reduce((a, q) => a + q[0] / 4, 0), d.map.reduce((a, q) => a + q[1] / 4, 0));
    const [rust, strip, chrome, under, spire] = DISTRICTS.map(centre);
    const home = P(HOME.x, HOME.y);
    const roads = [[home, rust], [home, spire], [rust, strip], [strip, chrome], [strip, under], [spire, strip], [spire, chrome], [chrome, under]];
    for (const [w, col, dash] of [[5, '#261e38', []], [1, '#54447a', [3, 3]]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.setLineDash(dash);
      for (const [a, b] of roads) {
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    DISTRICTS.forEach((d, i) => this.drawDistrict(ctx, d, i, P));

    // Home garage.
    const [hx, hy] = home;
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

    // Legend and compass.
    const items = [['CIRCUIT', TYPE_COLOR.circuit], ['SPRINT', TYPE_COLOR.sprint], ['ARENA', TYPE_COLOR.arena], ['DRAG', TYPE_COLOR.drag], ['SHOP', '#e8e8ff']];
    ctx.fillStyle = 'rgba(5,3,10,0.85)';
    ctx.fillRect(4, 4, 64, items.length * 10 + 6);
    items.forEach(([t, c], k) => {
      ctx.fillStyle = c;
      ctx.fillRect(8, 9 + k * 10, 5, 5);
      drawText(ctx, t, 17, 8 + k * 10, { color: '#c8c0e8' });
    });
    drawText(ctx, 'N', W - 10, 5, { color: '#8a82b0', align: 'center' });
    ctx.fillStyle = '#8a82b0';
    ctx.beginPath();
    ctx.moveTo(W - 10, 14);
    ctx.lineTo(W - 13, 21);
    ctx.lineTo(W - 7, 21);
    ctx.fill();
  }

  drawDistrict(ctx, d, i, P) {
    const { career } = this.app;
    const open = districtUnlocked(career, i);
    const poly = d.map.map(([x, y]) => P(x, y));
    const map = districtMap(d.city);
    const b = map.bounds;
    const pad = SETBACK + 14;
    const at = (x, z) => bilinear(poly, (x - b.minX + pad) / (b.maxX - b.minX + 2 * pad), (z - b.minZ + pad) / (b.maxZ - b.minZ + 2 * pad));
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
    };
    for (const c of map.cells) {
      const [x0, x1, z0, z1] = c.lot;
      ctx.fillStyle = open ? lotColor[c.kind] : '#191522';
      line([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], true);
      ctx.fill();
    }
    // Streets, with the main avenue picked out.
    for (const e of map.edges.values()) {
      const A = map.nodes[e.a];
      const B = map.nodes[e.b];
      const avenue = A.j === map.avenue && B.j === map.avenue;
      ctx.strokeStyle = !open ? '#2e2838' : avenue ? d.color : '#8a86a4';
      ctx.lineWidth = avenue ? 1.8 : 1;
      line([[A.x, A.z], [B.x, B.z]]);
      ctx.stroke();
    }
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
          pins.push([at(v.def.cx, v.def.cz), TYPE_COLOR[e.type] || TYPE_COLOR.arena, k + 1]);
          return;
        }
        const pts = v.def.points.map(([x, , z]) => [x, z]);
        if (this.hover === e.id) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          line(pts, v.def.closed);
          ctx.stroke();
          ctx.strokeStyle = TYPE_COLOR[e.type];
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
        pins.push([at(pts[0][0], pts[0][1]), TYPE_COLOR[e.type], k + 1]);
      });
      const shop = map.cells.filter((c) => c.kind === 'buildings').sort((p, q) => Math.hypot(...lotCentre(p.lot)) - Math.hypot(...lotCentre(q.lot)))[0];
      if (shop) pins.push([at(...lotCentre(shop.lot)), '#e8e8ff', '$']);
      if (!events.length && map.arena) pins.push([at(map.arena.x, map.arena.z), TYPE_COLOR.arena, '']);
      for (const [[x, y], color, text] of pins) this.pin(ctx, x, y, color, String(text));
    } else {
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
    outline();
    ctx.strokeStyle = this.selected === i ? '#ffffff' : open ? d.color : '#3a3448';
    ctx.lineWidth = this.selected === i ? 2 : 1.5;
    ctx.stroke();

    // Name plate at the top edge, status underneath.
    const x = (poly[0][0] + poly[1][0]) / 2;
    const y = Math.min(poly[0][1], poly[1][1]) + 4;
    const status = !open ? 'LOCKED' : career.bosses.includes(d.id) ? 'CLEARED' : `TIER ${d.tier + 1}`;
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
