// What the game plays for each district, in layers (docs/tt-sdk-design.md §9):
//
// - Official: the district files (src/districts), or in their place a map
//   published from the T&T SDK's Studio (src/content/maps/<id>.json, shipped
//   with the game). The career always plays these.
// - Override: an edited copy of a district saved in this browser (the SDK's
//   "Play in game"), in IndexedDB (content/idb.js), read into memory before
//   the game starts (initOverrides). Free roam plays it while it's on; the
//   career never does. Reverting deletes it.
import { districtFromDoc, migrateDoc, hasEdits, baseChanged } from './mapDoc.js';
import { readStore, write, remove } from './idb.js';

// (Under Vite, import.meta.env is set and the glob is filled in at build time;
// in Node's tests there are no published maps.)
const SHIPPED = import.meta.env ? import.meta.glob('./maps/*.json', { eager: true, import: 'default' }) : {};
const shipped = new Map(Object.values(SHIPPED).map((doc) => [doc.id, migrateDoc(doc)]));
// A published map doesn't reload the page it's published from (the SDK keeps
// its session); reload the game to play it.
if (import.meta.hot) import.meta.hot.accept(() => {});

// The map published for district id, if any.
export const shippedMap = (id) => shipped.get(id) || null;

// A published map as a district entry (DISTRICTS in src/career/districts.js).
export function officialDistrict(d) {
  const doc = shippedMap(d.id);
  return doc ? { ...d, ...districtFromDoc(doc), published: true } : d;
}

const overrides = new Map(); // district id -> { doc, on }
const OLD_KEY = 'tt-maps:overrides'; // (where they were kept before: localStorage)

// Reads the overrides into memory (and moves any left in localStorage over).
export async function initOverrides() {
  try {
    for (const [id, o] of await readStore('overrides')) overrides.set(id, o);
  } catch (err) {
    console.warn('overrides: no storage', err);
  }
  let old = null;
  try {
    old = JSON.parse(globalThis.localStorage?.getItem(OLD_KEY) || 'null');
  } catch {
    old = null;
  }
  if (!old) return;
  for (const [id, o] of Object.entries(old)) {
    if (overrides.has(id)) continue;
    overrides.set(id, o);
    await write('overrides', id, o);
  }
  globalThis.localStorage.removeItem(OLD_KEY);
}

export const getOverride = (id) => overrides.get(id) || null;

// Every override: { id, name, on, doc, edits (count), baseChanged }.
export function listOverrides(districts) {
  return [...overrides].map(([id, o]) => {
    const d = districts.find((q) => q.id === id);
    const e = o.doc.edits || {};
    return {
      id, on: !!o.on, doc: o.doc, name: o.doc.name,
      edits: (e.remove?.length || 0) + Object.keys(e.move || {}).length + (e.add?.length || 0),
      baseChanged: d ? baseChanged(o.doc, d) : false,
    };
  });
}

// Saves an edited copy of a built-in district as its override (on).
export async function saveOverride(doc) {
  if (!doc.base) throw new Error('only an edited built-in district can be played in its place');
  const o = { doc: JSON.parse(JSON.stringify(doc)), on: true };
  overrides.set(doc.base, o);
  await write('overrides', doc.base, o);
}

export async function setOverrideOn(id, on) {
  const o = overrides.get(id);
  if (!o) return;
  const next = { ...o, on };
  overrides.set(id, next);
  await write('overrides', id, next);
}

// Revert: the district plays as it was made again.
export async function removeOverride(id) {
  overrides.delete(id);
  await remove('overrides', id);
}

// The district free roam plays: its override while that's on, else the
// official one. An override is marked (edited: true).
const played = new Map(); // id -> { doc, district }
export function playedDistrict(d) {
  const o = getOverride(d.id);
  if (!o?.on || !hasEdits(o.doc?.edits)) return d;
  const hit = played.get(d.id);
  if (hit?.doc === o.doc) return hit.district;
  try {
    const district = { ...districtFromDoc(migrateDoc(o.doc)), edited: true };
    played.set(d.id, { doc: o.doc, district });
    return district;
  } catch (err) {
    console.error(`override for ${d.id} can't be played:`, err);
    return d;
  }
}
