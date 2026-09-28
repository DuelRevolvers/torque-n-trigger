import * as THREE from 'three';
import { clearCareer } from '../career/career.js';
import { listSaves, saveLabel } from '../career/saves.js';

// Title screen: Solo, Multiplayer, Settings, Load, Exit. Solo and Multiplayer
// each offer the campaign or a quick race on a chosen map and mode.
export class MenuScreen {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0a0418');
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 10);
    this.page = 'main';
    this.note = '';
  }

  enter(data = {}) {
    this.page = data.page || 'main';
    this.note = '';
    this.refresh();
  }

  exit() {
    this.app.ui.innerHTML = '';
  }

  step() {}

  newCampaign() {
    if (this.app.career && !window.confirm('Start a new campaign? The current one is lost unless it is in a save slot.')) return;
    clearCareer();
    this.app.career = null;
    this.app.go('starter');
  }

  refresh() {
    const { app } = this;
    const career = app.career;
    const pages = {
      main: ['TORQUE &amp; TRIGGER', '', [
        ['SOLO', () => this.show('solo')],
        ['MULTIPLAYER', () => this.show('multi')],
        ['SETTINGS', () => app.openSettings()],
        ['LOAD', () => this.show('load')],
        ['EXIT', () => this.exitGame()],
      ]],
      solo: ['SOLO', '', [
        [career ? 'CONTINUE CAMPAIGN' : 'NEW CAMPAIGN', () => (career ? app.go('garage') : app.go('starter'))],
        ...(career ? [['NEW CAMPAIGN', () => this.newCampaign()]] : []),
        ['QUICK RACE', () => app.go('lobby', { mode: 'solo', source: 'quick' })],
        ['BACK', () => this.show('main')],
      ]],
      multi: ['MULTIPLAYER', 'Local split-screen and online rooms share one lobby.', [
        ['CAMPAIGN EVENTS', () => app.go('lobby', { mode: 'multi', source: 'campaign' })],
        ['QUICK RACE', () => app.go('lobby', { mode: 'multi', source: 'quick' })],
        ['BACK', () => this.show('main')],
      ]],
      load: ['LOAD', 'Loading replaces the current campaign.', [
        ...(career ? [['CONTINUE (AUTOSAVE)', () => app.go('garage')]] : []),
        ...listSaves().map((s) => [`SLOT ${s.slot}: ${saveLabel(s.meta)}`, s.meta ? () => app.loadSlot(s.slot) : null]),
        ['BACK', () => this.show('main')],
      ]],
    };
    const [title, sub, items] = pages[this.page];
    app.ui.innerHTML = `<div class="screen title-menu"><div class="title-panel">
      <h1>${title}</h1>${sub ? `<div class="hint">${sub}</div>` : ''}
      ${items.map(([label, fn], i) => `<button class="btn title-btn ${i === 0 ? 'primary' : ''}" data-i="${i}" ${fn ? '' : 'disabled'}>${label}</button>`).join('')}
      ${this.note ? `<div class="hint">${this.note}</div>` : ''}
    </div></div>`;
    app.ui.querySelectorAll('.title-btn').forEach((b) => b.addEventListener('click', () => items[b.dataset.i][1]?.()));
  }

  show(page) {
    this.page = page;
    this.note = '';
    this.refresh();
  }

  // Browsers only let a script close a window it opened; otherwise say so.
  exitGame() {
    window.close();
    setTimeout(() => {
      this.note = 'Close this tab or window to exit. Your campaign is autosaved.';
      this.refresh();
    }, 150);
  }

  render() {
    return { scene: this.scene, camera: this.camera };
  }
}
