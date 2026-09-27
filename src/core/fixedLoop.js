// Fixed-timestep loop: the simulation advances in exact `dt` steps, and rendering
// happens once per animation frame with an interpolation factor between the last
// two simulation states.

const MAX_FRAME = 0.25; // seconds; longer gaps (tab switch, breakpoint) are dropped
const MAX_STEPS = 8;

export function startFixedLoop({ dt, step, render }) {
  let acc = 0;
  let last = performance.now() / 1000;

  function frame(ms) {
    const now = ms / 1000;
    const frameTime = Math.min(now - last, MAX_FRAME);
    last = now;
    acc += frameTime;

    let steps = 0;
    while (acc >= dt && steps < MAX_STEPS) {
      step();
      acc -= dt;
      steps++;
    }
    if (steps === MAX_STEPS) acc = 0; // can't keep up: slow down rather than spiral

    render(acc / dt, frameTime);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
