// The player's own maps, made in the T&T Creator: kept in this browser
// (IndexedDB), with a copy in memory so the game can list them straight away
// (initLibrary() runs before the game starts). Maps sent by an online host
// for a race are kept in memory only, for that session.
//
// In the game a map is played as itself: its free roam and its events, never
// the career (docs/tt-sdk-design.md §9).
import { districtFromDoc, migrateDoc } from './mapDoc.js';
import { districtEvents, roamEvent } from '../career/districts.js';

const DB = 'tt-maps';
const STORE = 'maps';
const mine = new Map(); // id -> doc
const shared = new Map(); // id -> doc (from an online host)

function openDb() {
  return new Promise((resolve, reject) => {
    const req = globalThis.indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

// Loads the library into memory (no IndexedDB, or blocked: an empty library).
export async function initLibrary() {
  if (!globalThis.indexedDB) return;
  try {
    for (const doc of (await run('readonly', (s) => s.getAll())) || []) {
      try {
        mine.set(doc.meta.id, migrateDoc(doc));
      } catch (err) {
        console.warn('library: a map that cannot be opened', err);
      }
    }
  } catch (err) {
    console.warn('library: no storage', err);
  }
}

const newId = () => `m${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export const listMaps = () => [...mine.values()].sort((a, b) => (b.meta.modified || '').localeCompare(a.meta.modified || ''));
export const getMap = (id) => mine.get(id) || shared.get(id) || null;
export const sharedMaps = () => [...shared.values()];

// Saves a map (a copy: the one being edited stays the editor's). Returns its id.
export async function saveMap(doc) {
  doc.meta.id ||= newId();
  const copy = JSON.parse(JSON.stringify(doc));
  mine.set(copy.meta.id, copy);
  cache.delete(copy.meta.id);
  if (globalThis.indexedDB) await run('readwrite', (s) => s.put(copy, copy.meta.id));
  return copy.meta.id;
}

export async function deleteMap(id) {
  mine.delete(id);
  cache.delete(id);
  if (globalThis.indexedDB) await run('readwrite', (s) => s.delete(id));
}

// A map an online host is racing on (kept for this session).
export function shareMap(doc) {
  const d = migrateDoc(doc);
  shared.set(d.meta.id, d);
  cache.delete(d.meta.id);
}

// A map as the game plays it: { district, events } (free roam first; none of
// them career events, and no prize money).
const cache = new Map(); // id -> { doc, district, events }
export function playedMap(doc) {
  const hit = cache.get(doc.meta.id);
  if (hit?.doc === doc) return hit;
  const district = districtFromDoc(doc);
  // (A map's boss race is just a race here: no career gate.)
  const tag = (e) => ({ ...e, id: `custom:${doc.meta.id}:${e.key}`, career: false, boss: false, entryFee: 0, purse: 0, custom: doc.meta.id });
  const events = [tag({ ...roamEvent(district), key: 'roam', name: `Free Roam: ${doc.name}` }), ...districtEvents(district).map(tag)];
  const out = { doc, district, events };
  cache.set(doc.meta.id, out);
  return out;
}

export const customEvents = (doc) => playedMap(doc).events;

// The map a race event reference ('custom:<id>/...') is on, if it's one.
export function mapForRef(ref) {
  if (!ref?.startsWith('custom:')) return null;
  return getMap(ref.slice('custom:'.length, ref.lastIndexOf('/')));
}
