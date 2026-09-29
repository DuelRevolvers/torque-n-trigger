// Edits to a plan district's plan (sim/planMap.js), made with the T&T SDK's
// road and lot tools: junctions added, streets added or changed (a junction
// put into one where a new street meets it) or taken out, and blocks given a
// kind. The district's own rules then build it: its blocks are traced from
// the streets again and filled the district's way.
//
// edits.plan: {
//   nodes:   { name: [x, z] | null },
//   streets: { key: spec | null },  key: the street's name ('Name#2' for a second street of the same name); a new key adds one
//   lots:    [{ at: [x, z], kind }], the block at `at` becomes `kind` (after the plan's own lots)
//   sites:   { key: spec | null },  a site changed or taken out (key: its name, or kind; '#2' for a second)
//   rings:   { name: null },        an octagonal ring road taken out (the Corporate Spire's)
//   renames: { old: new },          a street renamed, and everything in the plan that names it
// }
//
// Streets and sites in the edited plan carry sdkKey: their key in the plan as
// it was made, so later edits find them however they've been changed.

// Keys for a list, in order: its name ('Name#2' for a second of the same name).
const keysOf = (list, nameOf) => {
  const seen = new Map();
  return list.map((s) => {
    const name = nameOf(s);
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : `${name}#${n}`;
  });
};
export const streetKeys = (streets) => keysOf(streets, (s) => s.name);
export const siteKeys = (sites) => keysOf(sites, (s) => s.name || s.kind);

export const hasPlanEdits = (pe) =>
  !!pe &&
  Object.keys(pe.nodes || {}).length + Object.keys(pe.streets || {}).length + (pe.lots?.length || 0) + Object.keys(pe.sites || {}).length + Object.keys(pe.rings || {}).length + Object.keys(pe.renames || {}).length > 0;

// Every string naming a renamed street, renamed (its keys stay as they were).
export function renameStreets(v, R) {
  if (typeof v === 'string') return R[v] ?? v;
  if (Array.isArray(v)) return v.map((q) => renameStreets(q, R));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, q]) => [k, k === 'sdkKey' ? q : renameStreets(q, R)]));
  return v;
}

// The plan with its edits made (a new object; the plan itself is never changed).
export function applyPlanEdits(P, pe) {
  if (!hasPlanEdits(pe)) return P;
  const nodes = { ...P.nodes };
  for (const [k, v] of Object.entries(pe.nodes || {})) {
    if (v) nodes[k] = v;
    else delete nodes[k];
  }
  const set = pe.streets || {};
  const keys = streetKeys(P.streets);
  const streets = [];
  P.streets.forEach((s, i) => {
    if (!(keys[i] in set)) streets.push({ ...s, sdkKey: keys[i] });
    else if (set[keys[i]]) streets.push({ ...set[keys[i]], sdkKey: keys[i] });
  });
  for (const [k, s] of Object.entries(set)) if (s && !keys.includes(k)) streets.push({ ...s, sdkKey: k });
  const sk = siteKeys(P.sites || []);
  const ss = pe.sites || {};
  const sites = (P.sites || []).flatMap((s, i) => (!(sk[i] in ss) ? [{ ...s, sdkKey: sk[i] }] : ss[sk[i]] ? [{ ...ss[sk[i]], sdkKey: sk[i] }] : []));
  const rings = (P.rings || []).filter((R) => !(R.name in (pe.rings || {})));
  const out = { ...P, nodes, streets, sites, rings, lots: [...(P.lots || []), ...(pe.lots || [])] };
  return Object.keys(pe.renames || {}).length ? renameStreets(out, pe.renames) : out;
}
