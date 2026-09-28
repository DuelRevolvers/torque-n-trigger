import * as THREE from 'three';

// The Sign Boneyard's dead signs, as shapes that fit inside each sign's
// footprint (w wide, d deep, h high: what the car hits). Built in the sign's
// own frame (x across its face, y up, z through it) and returned as the
// faded body and the neon tube along it.

const bar = (w, h, d, x, y, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

export function deadSignShape(shape, w, d, h) {
  const body = [];
  const tube = [];
  const t = Math.max(0.6, Math.min(w, h) * 0.18); // stroke thickness
  const dd = Math.min(d, 1.2);
  // A stroke from (x0, y0) to (x1, y1) on the face, with a tube along it.
  const stroke = (x0, y0, x1, y1, th = t) => {
    const L = Math.hypot(x1 - x0, y1 - y0);
    const g = new THREE.BoxGeometry(th, L, dd);
    g.rotateZ(-Math.atan2(x1 - x0, y1 - y0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    body.push(g);
    const tb = new THREE.BoxGeometry(0.15, L, 0.15);
    tb.rotateZ(-Math.atan2(x1 - x0, y1 - y0));
    tb.translate((x0 + x1) / 2, (y0 + y1) / 2, -dd / 2 - 0.08);
    tube.push(tb);
  };
  const W = w / 2 - t / 2;
  const top = h - t / 2;
  const bot = t / 2;
  switch (shape) {
    case 'letterO':
      stroke(-W, bot, -W, top);
      stroke(W, bot, W, top);
      stroke(-W, top, W, top);
      stroke(-W, bot, W, bot);
      break;
    case 'letterG':
      stroke(-W, bot, -W, top);
      stroke(-W, top, W, top);
      stroke(-W, bot, W, bot);
      stroke(W, bot, W, h * 0.5);
      stroke(0, h * 0.5, W, h * 0.5);
      break;
    case 'letterL':
      stroke(-W, bot, -W, top);
      stroke(-W, bot, W, bot);
      break;
    case 'letterW':
      stroke(-W, top, -W * 0.5, bot);
      stroke(-W * 0.5, bot, 0, h * 0.6);
      stroke(0, h * 0.6, W * 0.5, bot);
      stroke(W * 0.5, bot, W, top);
      break;
    case 'arrow':
      stroke(-W, h * 0.55, W * 0.4, h * 0.55);
      stroke(W * 0.4, h * 0.9, W, h * 0.55);
      stroke(W * 0.4, h * 0.2, W, h * 0.55);
      if (h > 3) body.push(bar(0.4, h * 0.55, 0.4, -W * 0.5, h * 0.275));
      break;
    case 'cowboy': {
      const s = Math.min(w, h / 2.6);
      stroke(-s * 0.2, 0, -s * 0.2, h * 0.4, s * 0.22);
      stroke(s * 0.2, 0, s * 0.2, h * 0.4, s * 0.22);
      body.push(bar(s * 0.7, h * 0.3, dd, 0, h * 0.55));
      body.push(bar(s * 0.35, h * 0.12, dd, 0, h * 0.77));
      stroke(s * 0.35, h * 0.62, s * 0.5, h * 0.92, s * 0.15); // the raised arm
      body.push(new THREE.CylinderGeometry(s * 0.45, s * 0.45, h * 0.02, 10).translate(0, h * 0.84, 0));
      body.push(new THREE.CylinderGeometry(s * 0.18, s * 0.22, h * 0.08, 8).translate(0, h * 0.89, 0));
      break;
    }
    case 'cocktail':
      body.push(new THREE.CylinderGeometry(w * 0.3, w * 0.3, 0.4, 12).translate(0, 0.2, 0));
      body.push(new THREE.CylinderGeometry(0.25, 0.25, h * 0.45, 8).translate(0, h * 0.225 + 0.2, 0));
      body.push(new THREE.ConeGeometry(w * 0.5, h * 0.45, 12).rotateX(Math.PI).translate(0, h * 0.775, 0));
      body.push(new THREE.SphereGeometry(w * 0.08, 6, 4).translate(w * 0.15, h * 0.85, 0));
      stroke(-w * 0.45, h * 0.99, w * 0.45, h * 0.99, 0.2);
      break;
    case 'dice': {
      const s = Math.min(w, d, h) * 0.95;
      body.push(bar(s, s, s, 0, s / 2));
      for (const [x, y] of [[-0.25, 0.25], [0, 0], [0.25, -0.25]]) tube.push(bar(s * 0.12, s * 0.12, 0.1, x * s, s / 2 + y * s, -s / 2 - 0.05));
      break;
    }
    case 'horseshoe':
      stroke(-W, h * 0.2, -W, top);
      stroke(W, h * 0.2, W, top);
      stroke(-W, h * 0.2, 0, bot);
      stroke(0, bot, W, h * 0.2);
      break;
    case 'star': {
      const pts = [];
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
        const r = (k % 2 ? 0.4 : 1) * Math.min(w, h) * 0.5;
        pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
      }
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: dd, bevelEnabled: false });
      g.translate(0, h - Math.min(w, h) * 0.5, -dd / 2);
      body.push(g);
      tube.push(bar(0.2, h - Math.min(w, h), 0.2, 0, (h - Math.min(w, h)) / 2));
      break;
    }
    case 'motel':
      body.push(bar(w * 0.4, h, dd, -w * 0.3, h / 2));
      stroke(-w * 0.1, h * 0.35, W, h * 0.35);
      stroke(W * 0.6, h * 0.55, W, h * 0.35);
      stroke(W * 0.6, h * 0.15, W, h * 0.35);
      break;
    case 'showgirl': {
      const s = Math.min(w, h / 2);
      stroke(-s * 0.12, 0, -s * 0.12, h * 0.45, s * 0.14);
      stroke(s * 0.12, 0, s * 0.12, h * 0.45, s * 0.14);
      body.push(bar(s * 0.4, h * 0.25, dd, 0, h * 0.57));
      body.push(bar(s * 0.2, h * 0.08, dd, 0, h * 0.73));
      for (let k = -3; k <= 3; k++) stroke(0, h * 0.78, k * s * 0.14, h * 0.99, 0.25); // the feathers
      break;
    }
    default:
      body.push(bar(w, h, dd, 0, h / 2));
  }
  for (const g of [...body, ...tube]) if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
  return { body, tube };
}
