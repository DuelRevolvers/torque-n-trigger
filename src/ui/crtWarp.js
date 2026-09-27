// Bends the HTML overlays (menus, garage, city map) with the same barrel curve
// the CRT post pass applies to the game, using an SVG displacement filter.
// Touch controls are left flat so their hit areas stay exact.

const CURVE = 0.06; // must match the post shader: c *= 1.0 + 0.06 * (c.yx * c.yx)
const MAP_W = 256;
const MAP_H = 144;
const NS = 'http://www.w3.org/2000/svg';
const TARGETS = ['ui', 'menu'];

let filter = null;
let image = null;
let displace = null;
let enabled = false;

function build() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  filter = document.createElementNS(NS, 'filter');
  filter.id = 'crt-warp';
  filter.setAttribute('filterUnits', 'userSpaceOnUse');
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  image = document.createElementNS(NS, 'feImage');
  image.setAttribute('preserveAspectRatio', 'none');
  image.setAttribute('result', 'map');
  displace = document.createElementNS(NS, 'feDisplacementMap');
  displace.setAttribute('in', 'SourceGraphic');
  displace.setAttribute('in2', 'map');
  displace.setAttribute('xChannelSelector', 'R');
  displace.setAttribute('yChannelSelector', 'G');
  // Displacement samples the text without filtering; a slight blur smooths the
  // stair-steps so small text stays readable.
  const smooth = document.createElementNS(NS, 'feGaussianBlur');
  smooth.setAttribute('stdDeviation', '0.45');
  filter.append(image, displace, smooth);
  svg.append(filter);
  document.body.append(svg);
}

// Each output pixel samples the overlay where the barrel curve says it came from.
function update() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const scale = CURVE * Math.max(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = MAP_W;
  canvas.height = MAP_H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(MAP_W, MAP_H);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const cx = ((x + 0.5) / MAP_W) * 2 - 1;
      const cy = ((y + 0.5) / MAP_H) * 2 - 1;
      const dx = cx * CURVE * cy * cy * 0.5 * w; // source - output, in pixels
      const dy = cy * CURVE * cx * cx * 0.5 * h;
      const k = (y * MAP_W + x) * 4;
      img.data[k] = Math.round((0.5 + dx / scale) * 255);
      img.data[k + 1] = Math.round((0.5 + dy / scale) * 255);
      img.data[k + 2] = 128;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  for (const [el, attrs] of [[filter, { x: 0, y: 0, width: w, height: h }], [image, { x: 0, y: 0, width: w, height: h }]]) {
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  }
  image.setAttribute('href', canvas.toDataURL());
  displace.setAttribute('scale', scale);
}

export function setCrtWarp(on) {
  if (on && !filter) build();
  enabled = on;
  if (on) update();
  for (const id of TARGETS) {
    const el = document.getElementById(id);
    if (el) el.style.filter = on ? 'url(#crt-warp)' : '';
  }
  document.body.classList.toggle('crt', on);
}

window.addEventListener('resize', () => {
  if (enabled) update();
});
