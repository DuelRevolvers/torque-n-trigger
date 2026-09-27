// Garage operations on career data. Pure data changes; the UI calls these and saves.

import { REQUIRED_SLOTS } from '../parts/catalog.js';
import { canFit, computeBuild } from '../parts/build.js';
import { makeRng, makePart } from '../parts/generate.js';

// The build as it would be with `part` installed (the current part comes out).
export function withPart(build, part) {
  return { parts: { ...build.parts, [part.slot]: part } };
}

export function withoutSlot(build, slot) {
  return { parts: { ...build.parts, [slot]: null } };
}

// Checks whether a swap is allowed; returns { ok, reason, result }.
export function checkInstall(build, part) {
  const fit = canFit(build, part);
  if (!fit.ok) return { ok: false, reason: fit.reason };
  const result = computeBuild(withPart(build, part));
  if (!result.ok) return { ok: false, reason: result.errors[0], result };
  return { ok: true, result };
}

export function installPart(career, car, uid) {
  const i = career.inventory.findIndex((p) => p.uid === uid);
  if (i < 0) return { ok: false, reason: 'Part not in inventory' };
  const part = career.inventory[i];
  const check = checkInstall(car.build, part);
  if (!check.ok) return check;
  const old = car.build.parts[part.slot];
  career.inventory.splice(i, 1);
  if (old) career.inventory.push(old);
  car.build = withPart(car.build, part);
  return { ok: true };
}

export function removePart(career, car, slot) {
  if (REQUIRED_SLOTS.includes(slot)) return { ok: false, reason: 'The car needs this part to drive' };
  const old = car.build.parts[slot];
  if (!old) return { ok: false, reason: 'Nothing installed' };
  career.inventory.push(old);
  car.build = withoutSlot(car.build, slot);
  return { ok: true };
}

// Repainting is free until the economy exists. Creates a paint job if none.
export function repaint(car, { color, finish }) {
  const current = car.build.parts.paint;
  const paint = current
    ? { ...current, color: color ?? current.color, type: finish ?? current.type }
    : { ...makePart(makeRng(Date.now() & 0xffff), 'paint', finish || 'gloss', 'stock'), color: color || '#c8203c' };
  car.build = withPart(car.build, paint);
}
