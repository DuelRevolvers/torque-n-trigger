import * as THREE from 'three';
import { DISTRICTS, HOME_EVENTS, MODIFIER_LABELS, districtEvents, districtUnlocked } from '../career/districts.js';
import { SHOP_KINDS, shopStock, buyPrice, sellPrice, buyPart, sellPart } from '../career/shop.js';
import { saveCareer, activeCar } from '../career/career.js';
import { computeBuild, resolvePart } from '../parts/build.js';
import { partName, SLOT_NAMES } from '../parts/catalog.js';
import { drawText } from '../ui/bitmapFont.js';

const MAP_W = 200;
const MAP_H = 150;
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

  eventCard(e, drivable) {
    const { career } = this.app;
    const cleared = e.boss && career.bosses.includes(e.district);
    const canPay = (e.entryFee || 0) <= career.cash;
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
    const disabled = !drivable || !canPay;
    return `<button class="event-card" data-event="${e.id}" ${disabled ? 'disabled' : ''}>
      <span><span class="tag">${TYPE_LABEL[e.type]}</span> ${badges}</span>
      <b>${esc(e.name)}</b>
      ${e.desc ? `<span class="event-desc">${esc(e.desc)}</span>` : ''}
      ${mods ? `<span class="mods">${mods}</span>` : ''}
      <span class="event-meta">${meta}</span>
      ${!drivable ? '<span class="err">Your car is missing parts.</span>' : !canPay ? '<span class="err">Not enough cash for the entry fee.</span>' : ''}
    </button>`;
  }

  panelHtml(computed) {
    const { career } = this.app;
    if (this.selected === 'home') {
      return `<h2>Home</h2><div class="hint">Your garage and the back streets. These are always open.</div>
        <button class="btn primary wide garage-alt">GARAGE</button>
        <h3>Back alley</h3>${HOME_EVENTS.map((e) => this.eventCard(e, computed.ok)).join('')}`;
    }
    const d = DISTRICTS[this.selected];
    if (this.view.startsWith('shop:')) return this.shopHtml(d, this.view.slice(5));
    const shops = ['shop', 'used', ...(d.tier >= 2 ? ['black'] : [])]
      .map((k) => `<button class="btn small" data-shop="${k}">${SHOP_KINDS[k].name.toUpperCase()}</button>`).join('');
    return `<h2 style="color:${d.color}">${d.name}</h2>
      <div class="hint">${esc(d.blurb)}<br>Faction: <b>${d.faction}</b> &middot; Tier ${d.tier + 1}</div>
      <div class="row">${shops}<button class="btn small" data-home="1">HOME</button></div>
      <h3>Events</h3>${districtEvents(d).map((e) => this.eventCard(e, computed.ok)).join('')}`;
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

  drawMap() {
    const canvas = this.app.ui.querySelector('.city-map');
    const ctx = canvas.getContext('2d');
    const { career } = this.app;
    const px = ([x, y]) => [(x / 100) * MAP_W, (y / 100) * MAP_H];
    ctx.fillStyle = '#07040f';
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    ctx.fillStyle = '#0b1830'; // the bay
    ctx.fillRect(0, MAP_H * 0.86, MAP_W, MAP_H * 0.14);
    ctx.fillStyle = '#120c22';
    for (let x = 0; x < MAP_W; x += 10) ctx.fillRect(x, 0, 1, MAP_H);
    for (let y = 0; y < MAP_H; y += 10) ctx.fillRect(0, y, MAP_W, 1);

    DISTRICTS.forEach((d, i) => {
      const open = districtUnlocked(career, i);
      const pts = d.map.map(px);
      ctx.beginPath();
      pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = open ? `${d.color}33` : '#15121c';
      ctx.fill();
      ctx.strokeStyle = this.selected === i ? '#ffffff' : open ? d.color : '#3a3448';
      ctx.lineWidth = this.selected === i ? 2 : 1;
      ctx.stroke();
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const words = d.name.replace('The ', '').split(' ');
      words.forEach((w, k) => drawText(ctx, w, cx, cy - 6 - (words.length - 1 - k) * 9, { color: open ? d.color : '#5a5468', align: 'center', shadow: '#000' }));
      const status = !open ? 'LOCKED' : career.bosses.includes(d.id) ? 'CLEARED' : `TIER ${d.tier + 1}`;
      drawText(ctx, status, cx, cy + 4, { color: open ? '#e8e8ff' : '#5a5468', align: 'center', shadow: '#000' });
    });

    const [hx, hy] = px([HOME.x, HOME.y]);
    ctx.fillStyle = this.selected === 'home' ? '#ffffff' : '#ffb000';
    ctx.fillRect(hx - 3, hy - 3, 7, 7);
    drawText(ctx, 'HOME', hx, hy + 6, { color: '#ffb000', align: 'center', shadow: '#000' });
  }
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
