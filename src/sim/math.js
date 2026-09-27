// Small vector and quaternion helpers on plain {x, y, z} / {x, y, z, w} objects.
// The simulation uses these instead of three.js so its state stays plain data.

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const length = (a) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export function normalize(a) {
  const len = length(a);
  return len > 1e-9 ? scale(a, 1 / len) : v3();
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function approach(value, target, maxDelta) {
  if (value < target) return Math.min(value + maxDelta, target);
  return Math.max(value - maxDelta, target);
}

// Rotation about +Y. Yaw 0 faces -Z (the car's forward axis).
export function quatFromYaw(yaw) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

// Yaw that points the car's forward axis (-Z) along the horizontal direction (dx, dz).
export const yawFromDirection = (dx, dz) => Math.atan2(-dx, -dz);

export function quatRotate(q, v) {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

export function quatRotateInv(q, v) {
  return quatRotate({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, v);
}

// Integrates orientation q by world-space angular velocity w over dt.
export function quatIntegrate(q, w, dt) {
  const h = 0.5 * dt;
  const x = q.x + h * (w.x * q.w + w.y * q.z - w.z * q.y);
  const y = q.y + h * (w.y * q.w + w.z * q.x - w.x * q.z);
  const z = q.z + h * (w.z * q.w + w.x * q.y - w.y * q.x);
  const ww = q.w + h * (-w.x * q.x - w.y * q.y - w.z * q.z);
  const len = Math.sqrt(x * x + y * y + z * z + ww * ww);
  return { x: x / len, y: y / len, z: z / len, w: ww / len };
}
