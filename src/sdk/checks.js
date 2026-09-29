// The T&T SDK's checks on a district as edited: which of its events can't be
// set up any more (a route through a junction or street that's gone, an
// arena whose ground was taken out).
import { cityVenue } from '../sim/city.js';

export function brokenEvents(district) {
  const out = [];
  for (const e of [...(district.events || []), ...(district.boss ? [district.boss] : [])]) {
    try {
      cityVenue(district.city, e.route);
    } catch (err) {
      out.push({ key: e.key, name: e.name, error: err.message });
    }
  }
  return out;
}
