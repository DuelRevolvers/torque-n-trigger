// T&T SDK map documents: a district (its plan, look, place on the city map
// and events) and the edits made to it, as plain JSON. This is what the SDK
// saves and opens, and what the game plays when a map has been edited.
//
// {
//   format: 'tt-map', version: 1,
//   id, name,
//   base: the built-in district it was made from (null: a new district),
//   baseHash: that district's hash when it was made (a game update that
//     changes the district shows up as a different hash),
//   district: { id, name, tier, faction, color, blurb, theme, map, frame, label, city, events, boss },
//   edits: { remove: [key], move: { key: { dx, dz, yaw, dy } }, add: [{ id, from, x, z, yaw, dy }] },
//   meta: { created, modified, editor },
// }
//
// The district's city (plan, grid, look...) is the same data the district
// files hold (src/districts); the edits are made on top of what its rules
// place (sim/layoutEdits.js).

export const FORMAT = 'tt-map';
export const VERSION = 1;
export const EDITOR = 'T&T SDK 0.1';

const KEYS = ['id', 'name', 'tier', 'faction', 'color', 'blurb', 'theme', 'map', 'frame', 'label', 'city', 'events', 'boss'];

const json = (v) => JSON.parse(JSON.stringify(v));

// FNV-1a over the value's JSON: a short fingerprint of a district.
export function hashOf(value) {
  const s = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const districtData = (d) => json(Object.fromEntries(KEYS.filter((k) => d[k] !== undefined).map((k) => [k, d[k]])));

export const emptyEdits = () => ({ remove: [], move: {}, add: [] });

// A new document for a built-in district. A district published from the SDK
// already carries edits (city.edits): they come out as the document's own.
export function docFromDistrict(d, now = new Date().toISOString()) {
  const district = districtData(d);
  const edits = { ...emptyEdits(), ...district.city?.edits };
  if (district.city) delete district.city.edits;
  return {
    format: FORMAT,
    version: VERSION,
    id: d.id,
    name: d.name,
    base: d.id,
    baseHash: hashOf(districtData(d)),
    district,
    edits,
    meta: { created: now, modified: now, editor: EDITOR },
  };
}

// Has the built-in district this document was made from changed since?
export const baseChanged = (doc, d) => !!doc.base && hashOf(districtData(d)) !== doc.baseHash;

// Is there anything edited?
export const hasEdits = (e) =>
  !!e && ((e.remove?.length || 0) + Object.keys(e.move || {}).length + (e.add?.length || 0) + Object.keys(e.terrain?.dh || {}).length + Object.keys(e.paint?.s || {}).length > 0);

// Problems with a document (an empty list if it's fine to open).
export function validateDoc(doc) {
  const out = [];
  if (!doc || typeof doc !== 'object') return ['not a map document'];
  if (doc.format !== FORMAT) out.push(`not a ${FORMAT} document`);
  if (!Number.isInteger(doc.version) || doc.version < 1) out.push('no version');
  else if (doc.version > VERSION) out.push(`made by a newer T&T SDK (version ${doc.version}; this reads up to ${VERSION})`);
  const d = doc.district;
  if (!d || typeof d !== 'object') out.push('no district');
  else {
    if (!d.id) out.push('district has no id');
    if (!d.city || typeof d.city !== 'object') out.push('district has no city');
    else if (!d.city.plan && !d.city.grid) out.push('district city has neither a plan nor a grid');
  }
  const e = doc.edits;
  if (e) {
    if (e.remove && !Array.isArray(e.remove)) out.push('edits.remove is not a list');
    if (e.move && (typeof e.move !== 'object' || Array.isArray(e.move))) out.push('edits.move is not a table');
    if (e.add && !Array.isArray(e.add)) out.push('edits.add is not a list');
    for (const a of e.add || []) if (!a.from || typeof a.x !== 'number' || typeof a.z !== 'number') out.push(`edits.add ${a.id}: needs from, x and z`);
    const ids = (e.add || []).map((a) => a.id);
    if (new Set(ids).size !== ids.length) out.push('edits.add: ids repeat');
  }
  return out;
}

// Older documents brought up to this version (none yet: version 1 is the first).
export function migrateDoc(doc) {
  const problems = validateDoc(doc);
  if (problems.length) throw new Error(`map document: ${problems.join('; ')}`);
  return { ...doc, edits: { ...emptyEdits(), ...doc.edits } };
}

export const serializeDoc = (doc) => JSON.stringify(doc);
export const parseDoc = (text) => migrateDoc(JSON.parse(text));

// The district a document describes, ready for the game: its city carries the
// edits. The same document always gives the same object (the district's map
// and layout are cached by it).
const districts = new WeakMap();
export function districtFromDoc(doc) {
  if (!districts.has(doc)) {
    const d = json(doc.district);
    if (hasEdits(doc.edits)) d.city.edits = json(doc.edits);
    districts.set(doc, d);
  }
  return districts.get(doc);
}
