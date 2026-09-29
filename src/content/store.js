// What the game plays for each district, in layers (docs/tt-sdk-design.md §9):
//
// - Official: the district files (src/districts), or in their place a map
//   published from the T&T SDK's Studio (src/content/maps/<id>.json, shipped
//   with the game). The career always plays these.
// - Override: an edited copy of a district saved in this browser (from the
//   SDK's "Play in game"). Free roam plays it while it's on; the career never
//   does. Reverting deletes it.
import { districtFromDoc, migrateDoc, hasEdits, baseChanged } from './mapDoc.js';

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

const KEY = 'tt-maps:overrides'; // { [district id]: { doc, on } }
const storage = () => {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
};

// Parsed once per change to what's stored, so each override keeps one object
// (its district's map and venues stay cached).
let raw = null;
let all = {};
function readAll() {
  let text = null;
  try {
    text = storage()?.getItem(KEY) ?? null;
  } catch {
    text = null;
  }
  if (text !== raw) {
    raw = text;
    try {
      all = text ? JSON.parse(text) : {};
    } catch {
      all = {};
    }
  }
  return all;
}

function writeAll(next) {
  const text = JSON.stringify(next);
  storage()?.setItem(KEY, text); // may throw (storage full): the caller says so
}

export const getOverride = (id) => readAll()[id] || null;

// Every override: { id, name, on, doc, edits (count), baseChanged }.
export function listOverrides(districts) {
  return Object.entries(readAll()).map(([id, o]) => {
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
export function saveOverride(doc) {
  if (!doc.base) throw new Error('only an edited built-in district can be played in its place');
  writeAll({ ...readAll(), [doc.base]: { doc, on: true } });
}

export function setOverrideOn(id, on) {
  const cur = readAll();
  if (cur[id]) writeAll({ ...cur, [id]: { ...cur[id], on } });
}

// Revert: the district plays as it was made again.
export function removeOverride(id) {
  const { [id]: _gone, ...rest } = readAll();
  writeAll(rest);
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
