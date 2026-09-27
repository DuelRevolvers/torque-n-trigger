// On-screen touch controls: a steering slider under the left thumb (steer is
// measured from wherever the thumb first lands) and pedal/action buttons on the right.

const STEER_RANGE_PX = 70; // thumb travel for full lock

export class TouchControls {
  constructor(root) {
    this.root = root;
    this.visible = false;
    this.steer = 0;
    this.held = new Set();
    this.steerPointer = null;
    this.steerOrigin = 0;

    root.innerHTML = `
      <div class="t-steer">
        <div class="t-steer-track"><div class="t-steer-knob"></div></div>
        <div class="t-label">STEER</div>
      </div>
      <div class="t-buttons">
        <button class="t-btn t-fire" data-action="fire1">FIRE</button>
        <button class="t-btn t-alt" data-action="fire2">ALT</button>
        <button class="t-btn t-nitro" data-action="nitro">N2O</button>
        <button class="t-btn t-drift" data-action="handbrake">DRIFT</button>
        <button class="t-btn t-gas" data-action="throttle">GAS</button>
        <button class="t-btn t-brake" data-action="brake">BRAKE</button>
      </div>
      <div class="t-top">
        <button class="t-btn t-small" data-action="lookBack">LOOK</button>
        <button class="t-btn t-small" data-action="utility">UTIL</button>
        <button class="t-btn t-small" data-action="reset">RESET</button>
      </div>`;

    this.knob = root.querySelector('.t-steer-knob');
    const steerZone = root.querySelector('.t-steer');
    steerZone.addEventListener('pointerdown', (e) => {
      if (this.steerPointer !== null) return;
      this.steerPointer = e.pointerId;
      this.steerOrigin = e.clientX;
      steerZone.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    steerZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.steerPointer) return;
      this.steer = Math.max(-1, Math.min(1, (e.clientX - this.steerOrigin) / STEER_RANGE_PX));
      this.knob.style.transform = `translateX(${this.steer * STEER_RANGE_PX * 0.6}px)`;
    });
    const endSteer = (e) => {
      if (e.pointerId !== this.steerPointer) return;
      this.steerPointer = null;
      this.steer = 0;
      this.knob.style.transform = '';
    };
    steerZone.addEventListener('pointerup', endSteer);
    steerZone.addEventListener('pointercancel', endSteer);

    for (const btn of root.querySelectorAll('[data-action]')) {
      const action = btn.dataset.action;
      btn.addEventListener('pointerdown', (e) => {
        btn.setPointerCapture(e.pointerId);
        this.held.add(action);
        btn.classList.add('down');
        e.preventDefault();
      });
      const release = () => {
        this.held.delete(action);
        btn.classList.remove('down');
      };
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  setVisible(visible) {
    this.visible = visible;
    this.root.hidden = !visible;
    if (!visible) {
      this.held.clear();
      this.steer = 0;
    }
  }

  apply(frame) {
    if (!this.visible) return;
    if (Math.abs(this.steer) > Math.abs(frame.steer)) frame.steer = this.steer;
    if (this.held.has('throttle')) frame.throttle = 1;
    if (this.held.has('brake')) frame.brake = 1;
    frame.handbrake ||= this.held.has('handbrake');
    frame.nitro ||= this.held.has('nitro');
    frame.lookBack ||= this.held.has('lookBack');
    frame.reset ||= this.held.has('reset');
    frame.fire1 ||= this.held.has('fire1');
    frame.fire2 ||= this.held.has('fire2');
    frame.utility ||= this.held.has('utility');
  }
}
