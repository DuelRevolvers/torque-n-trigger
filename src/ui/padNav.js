// Gamepad menu navigation: D-pad / left stick moves a focus highlight between
// buttons (spatially, to the nearest one in that direction), A presses it, B
// goes back (closes the pause menu, or presses the screen's back button), and
// LB / RB call the screen's onPadTab(-1 | 1) (e.g. cycle districts on the map).
// A on a dropdown opens it: up / down pick, A keeps the pick, B puts it back.
// Left / right move a slider. Screens re-render their HTML often, so focus is
// remembered by position and put back on the element at the same place in the list.

const BTN = { A: 0, B: 1, LB: 4, RB: 5, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const FOCUSABLE = 'button:not([disabled]), select, input:not([type=hidden])';
const REPEAT_DELAY = 0.35;
const REPEAT_RATE = 0.12;

export class PadNav {
  constructor() {
    this.prev = {};
    this.held = null;
    this.holdTime = 0;
    this.index = 0;
    this.used = false;
    this.open = null; // the dropdown open now
    this.openValue = null; // its value before
  }

  // root: the element whose buttons are navigable right now (null: none).
  // screen: gets onPadTab(dir) for LB / RB.
  poll(root, dt, screen) {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected) : [];
    const pressed = (i) => pads.some((p) => p.buttons[i]?.pressed);
    const axis = (i) => pads.reduce((v, p) => (Math.abs(p.axes[i] || 0) > Math.abs(v) ? p.axes[i] : v), 0);
    const now = {
      A: pressed(BTN.A), B: pressed(BTN.B), LB: pressed(BTN.LB), RB: pressed(BTN.RB),
      up: pressed(BTN.UP) || axis(1) < -0.5, down: pressed(BTN.DOWN) || axis(1) > 0.5,
      left: pressed(BTN.LEFT) || axis(0) < -0.5, right: pressed(BTN.RIGHT) || axis(0) > 0.5,
    };
    // (Any button or stick input this frame: the menu legend switches to the pad.)
    this.active = pads.some((p) => p.buttons.some((b) => b.pressed) || p.axes.some((a) => Math.abs(a) > 0.5));
    const prev = this.prev;
    const edge = (k) => now[k] && !prev[k];
    this.prev = now;
    // (An open dropdown re-rendered away, or under the pause menu: shut, unchanged.)
    if (this.open && !root?.contains(this.open)) {
      if (this.open.isConnected) this.closeDropdown(false);
      else this.open = null;
    }
    if (!root || !pads.length) return;

    const items = navItems(root);
    if (!items.length) return;
    let current = items.find((el) => el.classList.contains('pad-focus'));
    if (!current && this.used) {
      current = items[Math.min(this.index, items.length - 1)];
      this.focus(current, items);
    }

    // Direction with auto-repeat while held.
    const dir = ['up', 'down', 'left', 'right'].find((k) => now[k]) || null;
    let step = null;
    if (dir !== this.held) {
      this.held = dir;
      this.holdTime = 0;
      step = dir;
    } else if (dir) {
      this.holdTime += dt;
      if (this.holdTime > REPEAT_DELAY) {
        this.holdTime -= REPEAT_RATE;
        step = dir;
      }
    }
    if (this.open) {
      if (step === 'up' || step === 'down') pick(this.open, step === 'down' ? 1 : -1);
      if (edge('A')) this.closeDropdown(true);
      else if (edge('B')) this.closeDropdown(false);
      return;
    }
    if (current?.type === 'range' && (step === 'left' || step === 'right')) {
      if (step === 'right') current.stepUp();
      else current.stepDown();
      current.dispatchEvent(new Event('input', { bubbles: true }));
      current.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (step) {
      this.used = true;
      if (!current) this.focus(items[0], items);
      else this.focus(nearest(current, items, step) || current, items);
    }
    if (edge('A') && current) {
      this.used = true;
      if (current.tagName === 'SELECT') this.openDropdown(current);
      else current.click();
    }
    if (edge('B')) {
      items.find(isBack)?.click();
    }
    if (edge('LB')) screen?.onPadTab?.(-1);
    if (edge('RB')) screen?.onPadTab?.(1);
  }

  // A native dropdown can't be opened from a script, so it's shown as a list in place.
  openDropdown(sel) {
    this.open = sel;
    this.openValue = sel.value;
    sel.size = Math.max(2, Math.min(sel.options.length, 8));
    sel.classList.add('pad-open');
  }

  // keep: the pick stands (a change event if it's new); else the value goes back.
  closeDropdown(keep) {
    const sel = this.open;
    this.open = null;
    sel.removeAttribute('size');
    sel.classList.remove('pad-open');
    if (!keep) sel.value = this.openValue;
    else if (sel.value !== this.openValue) sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  focus(el, items) {
    for (const o of items) o.classList.remove('pad-focus');
    el.classList.add('pad-focus');
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.index = items.indexOf(el);
  }
}

// The buttons, dropdowns and fields the pad can move between, on screen now.
export function navItems(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el.getClientRects().length);
}

// A button that goes back: B presses it.
export function isBack(el) {
  return el.matches('.menu-resume, [data-back], .back, .garage, .cancel') || /^(◀|BACK\b)/.test(el.textContent.trim());
}

// The next option in a dropdown that isn't disabled, d = 1 down or -1 up.
function pick(sel, d) {
  for (let i = sel.selectedIndex + d; i >= 0 && i < sel.options.length; i += d) {
    if (sel.options[i].disabled) continue;
    sel.selectedIndex = i;
    return;
  }
}

// The closest element in a direction: the edge-to-edge gap along it, plus a
// penalty for the gap off to the side (none when the two line up), so a wide
// dropdown under a small button counts as straight below it.
export function nearest(from, items, dir) {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  const vert = dir === 'up' || dir === 'down';
  let best = null;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    const dx = b.left + b.width / 2 - ax;
    const dy = b.top + b.height / 2 - ay;
    const centre = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
    if (centre <= 2) continue;
    const along = Math.max(0, dir === 'up' ? a.top - b.bottom : dir === 'down' ? b.top - a.bottom
      : dir === 'left' ? a.left - b.right : b.left - a.right);
    const side = vert ? Math.max(0, b.left - a.right, a.left - b.right) : Math.max(0, b.top - a.bottom, a.top - b.bottom);
    // (Left / right stay on roughly the same row, not a far corner.)
    if (!vert && side > Math.max(along, 8)) continue;
    const score = along + side * 2.5 + Math.abs(vert ? dx : dy) * 0.05;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}
