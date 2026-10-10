// Every raceable event, grouped for "pick a map and mode", plus the campaign's
// events for multiplayer campaign races.

import { EVENTS } from './events.js';
import { DISTRICTS, HOME_EVENTS, districtEvents, districtUnlocked } from './districts.js';
import { listMaps, sharedMaps, customEvents } from '../content/library.js';

const VENUE_NAMES = { testLoop: 'Test Loop', neonStrip: 'Neon Strip', dataCentre: 'Data Centre', dragStrip: 'Drag Strip' };
// Refs are 'mapId/eventId' (ids can repeat between a district and a classic venue);
// campaign refs are 'campaign/eventId'.
export const eventRef = (mapId, e) => `${mapId}/${e.id}`;
export function eventByRef(ref) {
  const cut = ref.lastIndexOf('/');
  const [mapId, id] = [ref.slice(0, cut), ref.slice(cut + 1)];
  const list = mapId === 'campaign' ? [...HOME_EVENTS, ...DISTRICTS.flatMap((d) => districtEvents(d))] : maps({ solo: true }).find((m) => m.id === mapId)?.events || [];
  return list.find((e) => e.id === id) || null;
}

export const modeName = (e) =>
  ({ sprint: 'Sprint', circuit: 'Circuit', drag: 'Drag', free: 'Free drive', arena: e.mode === 'lastStanding' ? 'Last standing' : 'Brawl' })[e.type] || e.type;

// Maps: each district, then the classic venues. Free drive is solo only.
export function maps({ solo = false } = {}) {
  const out = [];
  const add = (id, name, events) => {
    const list = events.filter((e) => (solo || e.type !== 'free') && e.type !== 'cup'); // (Cups: career only, phase 7d)
    if (list.length) out.push({ id, name, events: list });
  };
  for (const d of DISTRICTS) add(d.id, d.name, districtEvents(d));
  // The players' own maps (T&T Creator), and one an online host is racing on.
  for (const doc of [...listMaps(), ...sharedMaps()]) add(`custom:${doc.meta.id}`, `${doc.name} (custom)`, customEvents(doc));
  const byVenue = {};
  for (const e of [...EVENTS, ...HOME_EVENTS].filter((x) => !x.district)) (byVenue[e.venue] ||= []).push(e);
  for (const [v, list] of Object.entries(byVenue)) add(`venue:${v}`, VENUE_NAMES[v] || v, list);
  return out;
}

// Campaign events from the districts this career has opened.
export function campaignEvents(career) {
  const open = DISTRICTS.filter((_, i) => (career ? districtUnlocked(career, i) : i === 0));
  return [...HOME_EVENTS.filter((e) => e.type !== 'free'), ...open.flatMap((d) => districtEvents(d))].filter((e) => e.type !== 'free' && e.type !== 'cup' && e.mode !== 'rampage' && e.mode !== 'lastLapOut' && e.mode !== 'duel'); // (Rampage, Last Lap Out, Duels and Cups: career only for now, phase 7)
}
