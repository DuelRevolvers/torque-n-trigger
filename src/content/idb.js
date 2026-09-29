// The game's own storage in this browser (IndexedDB, which holds far more
// than localStorage): the players' maps (maps), edited districts played in
// the game (overrides), and the T&T SDK's own (sdk: the last session, a test
// drive being handed to the game). Each store is read into memory once, before
// the game or the SDK starts, so they can read it straight away.
const DB = 'tt-maps';
const STORES = ['maps', 'overrides', 'sdk'];

export const hasIdb = () => !!globalThis.indexedDB;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = globalThis.indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run(store, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req?.result);
        t.onerror = () => reject(t.error);
      }),
  );
}

// Everything in a store: a Map of key -> value (empty with no IndexedDB).
export async function readStore(store) {
  if (!hasIdb()) return new Map();
  const [keys, values] = await Promise.all([run(store, 'readonly', (s) => s.getAllKeys()), run(store, 'readonly', (s) => s.getAll())]);
  return new Map((keys || []).map((k, i) => [k, values[i]]));
}

export const write = (store, key, value) => (hasIdb() ? run(store, 'readwrite', (s) => s.put(value, key)) : Promise.resolve());
export const remove = (store, key) => (hasIdb() ? run(store, 'readwrite', (s) => s.delete(key)) : Promise.resolve());
