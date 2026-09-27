// Keyboard and mouse. Tracks held keys; `apply` writes them into an InputFrame.

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyQ', 'KeyR',
]);

export class Keyboard {
  constructor(mouseTarget) {
    this.down = new Set();
    this.mouse = new Set();
    window.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouse.clear();
    });
    mouseTarget.addEventListener('mousedown', (e) => this.mouse.add(e.button));
    window.addEventListener('mouseup', (e) => this.mouse.delete(e.button));
    mouseTarget.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  held(...codes) {
    return codes.some((c) => this.down.has(c));
  }

  apply(frame) {
    const steer = (this.held('KeyD', 'ArrowRight') ? 1 : 0) - (this.held('KeyA', 'ArrowLeft') ? 1 : 0);
    if (Math.abs(steer) > Math.abs(frame.steer)) frame.steer = steer;
    if (this.held('KeyW', 'ArrowUp')) frame.throttle = 1;
    if (this.held('KeyS', 'ArrowDown')) frame.brake = 1;
    frame.handbrake ||= this.held('Space');
    frame.nitro ||= this.held('ShiftLeft', 'ShiftRight');
    frame.utility ||= this.held('KeyE');
    frame.lookBack ||= this.held('KeyQ');
    frame.reset ||= this.held('KeyR');
    frame.fire1 ||= this.mouse.has(0);
    frame.fire2 ||= this.mouse.has(2);
  }
}
