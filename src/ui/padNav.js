// Gamepad menu navigation: D-pad / left stick moves a focus highlight between
// buttons (spatially, to the nearest one in that direction), A presses it, B
// goes back (closes the pause menu, or presses the screen's back button), and
// LB / RB call the screen's onPadTab(-1 | 1) (e.g. cycle districts on the map).
// Screens re-render their HTML often, so focus is remembered by position and
// put back on the element at the same place in the list.

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
    const edge = (k) => now[k] && !this.prev[k];
    this.prev = now;
    if (!root || !pads.length) return;

    const items = [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el.getClientRects().length);
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
    if (step) {
      this.used = true;
      if (!current) this.focus(items[0], items);
      else this.focus(nearest(current, items, step) || current, items);
    }
    if (edge('A') && current) {
      this.used = true;
      current.click();
    }
    if (edge('B')) {
      const back = items.find((el) => el.matches('.menu-resume, [data-back], .back, .garage, .cancel') || /^◀/.test(el.textContent.trim()));
      back?.click();
    }
    if (edge('LB')) screen?.onPadTab?.(-1);
    if (edge('RB')) screen?.onPadTab?.(1);
  }

  focus(el, items) {
    for (const o of items) o.classList.remove('pad-focus');
    el.classList.add('pad-focus');
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.index = items.indexOf(el);
  }
}

// The closest element in a direction: distance along it, plus a penalty for
// being off to the side.
function nearest(from, items, dir) {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best = null;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    const dx = b.left + b.width / 2 - ax;
    const dy = b.top + b.height / 2 - ay;
    const [along, side] = dir === 'up' ? [-dy, dx] : dir === 'down' ? [dy, dx] : dir === 'left' ? [-dx, dy] : [dx, dy];
    if (along <= 2) continue;
    const score = along + Math.abs(side) * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}
