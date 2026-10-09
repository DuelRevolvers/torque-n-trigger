// Button legend along the bottom of menus. It follows the last input used: a
// gamepad, the keyboard or the mouse (hidden on touch). Shown only while the
// screen (or the pause menu) has something to press.

import { navItems, isBack } from './padNav.js';

const pad = (b, cls = '') => `<b class="lg-pad ${cls}">${b}</b>`;
const key = (k) => `<b class="lg-key">${k}</b>`;

export class Legend {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'legend';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.mode = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
    this.html = '';
    window.addEventListener('keydown', () => (this.mode = 'keys'), true);
    window.addEventListener('pointerdown', (e) => (this.mode = e.pointerType === 'touch' ? 'touch' : 'mouse'), true);
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && Math.abs(e.movementX) + Math.abs(e.movementY) > 3) this.mode = 'mouse';
    }, true);
    window.addEventListener('wheel', () => (this.mode = 'mouse'), { capture: true, passive: true });
  }

  // root: the navigable element now (the pause menu or the screen). padNav: its
  // pad state. screen: the current screen (LB / RB if it has onPadTab).
  // pausable: the pause menu can open here.
  update(root, menuOpen, padNav, screen, pausable) {
    if (padNav.active) this.mode = 'pad';
    const items = root && this.mode !== 'touch' ? navItems(root) : [];
    const html = items.length ? this.entries(items, menuOpen, padNav, screen, pausable).map(([k, label]) => `<span>${k}${label}</span>`).join('') : '';
    if (html !== this.html) {
      this.html = html;
      this.el.innerHTML = html;
    }
    this.el.hidden = !html;
    document.body.classList.toggle('legend-ui', !!html && !menuOpen);
    document.body.classList.toggle('legend-menu', !!html && menuOpen);
  }

  entries(items, menuOpen, padNav, screen, pausable) {
    const menu = menuOpen ? 'Close' : pausable ? 'Menu' : null;
    if (this.mode === 'pad') {
      if (padNav.open) return [[pad('✛', 'dpad'), 'Choose'], [pad('A', 'a'), 'Keep'], [pad('B', 'b'), 'Cancel']];
      const focus = items.find((el) => el.classList.contains('pad-focus'));
      return [
        [pad('✛', 'dpad'), 'Move'],
        ...(focus?.type === 'range' ? [[pad('◀▶', 'dpad'), 'Adjust']] : []),
        [pad('A', 'a'), focus?.tagName === 'SELECT' ? 'Open' : 'Select'],
        ...(items.some(isBack) ? [[pad('B', 'b'), 'Back']] : []),
        ...(!menuOpen && screen?.onPadTab ? [[pad('LB', 'bumper') + pad('RB', 'bumper'), screen.padTabLabel || 'Switch']] : []),
        ...(menu ? [[pad('☰', 'start'), menu]] : []),
      ];
    }
    const esc = menu ? [[key('Esc'), menu]] : [];
    if (this.mode === 'keys') return [[key('Tab'), 'Move'], [key('Enter'), 'Select'], ...esc];
    return [[key('Click'), 'Select'], [key('Wheel'), 'Scroll'], ...esc];
  }
}
