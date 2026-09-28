// Manual save slots. The live campaign still autosaves to its own key; a slot is
// a copy of it with a summary for the load list.

import { migrateCareer, activeCar } from './career.js';
import { DISTRICTS } from './districts.js';

export const SLOT_COUNT = 5;
const key = (n) => `tt.save.${n}`;

export function listSaves() {
  return Array.from({ length: SLOT_COUNT }, (_, i) => {
    try {
      return { slot: i + 1, meta: JSON.parse(localStorage.getItem(key(i + 1)) || 'null')?.meta || null };
    } catch {
      return { slot: i + 1, meta: null };
    }
  });
}

export function saveToSlot(n, career) {
  const meta = {
    savedAt: Date.now(),
    car: activeCar(career)?.name,
    cash: career.cash,
    district: DISTRICTS[career.district || 0]?.name,
    cars: career.cars.length,
  };
  try {
    localStorage.setItem(key(n), JSON.stringify({ meta, career }));
    return true;
  } catch {
    return false;
  }
}

export function loadSlot(n) {
  try {
    const data = JSON.parse(localStorage.getItem(key(n)) || 'null');
    return data ? migrateCareer(JSON.parse(JSON.stringify(data.career))) : null;
  } catch {
    return null;
  }
}

export const saveLabel = (meta) =>
  meta ? `${meta.car} · $${(meta.cash ?? 0).toLocaleString()} · ${meta.district} · ${new Date(meta.savedAt).toLocaleString()}` : 'Empty';
