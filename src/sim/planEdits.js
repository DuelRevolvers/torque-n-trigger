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
// }

// Each street's key, in plan order.
export function streetKeys(streets) {
  const seen = new Map();
  return streets.map((s) => {
    const n = (seen.get(s.name) || 0) + 1;
    seen.set(s.name, n);
    return n === 1 ? s.name : `${s.name}#${n}`;
  });
}

export const hasPlanEdits = (pe) => !!pe && Object.keys(pe.nodes || {}).length + Object.keys(pe.streets || {}).length + (pe.lots?.length || 0) > 0;

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
    if (!(keys[i] in set)) streets.push(s);
    else if (set[keys[i]]) streets.push(set[keys[i]]);
  });
  for (const [k, s] of Object.entries(set)) if (s && !keys.includes(k)) streets.push(s);
  return { ...P, nodes, streets, lots: [...(P.lots || []), ...(pe.lots || [])] };
}
