// Edits to a grid district's streets (Rustline Docks, sim/authoredMap.js), made
// with the T&T SDK: a run of street between two junctions taken out, a grid
// line (a column's x, a row's z) moved, a site taken out. The district's rules
// then build it again: its lots and what stands on them follow.
//
// edits.grid: {
//   remove: [[i, j, 'h' | 'v']],  the run from junction (i, j) to (i + 1, j) ('h') or to (i, j + 1) ('v')
//   xs: { i: x }, zs: { j: z },    grid lines moved
//   sites: { name: null },         a site taken out
//   add: [[i, j, 'h' | 'v', name]], a run of street put in between two junctions
//   lots: [{ at: [i, j], kind }],  what a block is
//   extra: [{ name, width, surface, pts }], a street off the grid (any line, curves as points):
//     drawn over the ground, what stands in its way cleared (not on the grid: no event routes)
// }

export const hasGridEdits = (ge) =>
  !!ge && (ge.remove?.length || 0) + (ge.add?.length || 0) + (ge.extra?.length || 0) + (ge.lots?.length || 0) + Object.keys(ge.xs || {}).length + Object.keys(ge.zs || {}).length + Object.keys(ge.sites || {}).length > 0;

// The district's city data with its grid edits made (a new object).
export function applyGridEdits(city, ge) {
  if (!hasGridEdits(ge) || !city.grid) return city;
  const g = city.grid;
  const xs = g.xs.map((x, i) => ge.xs?.[i] ?? x);
  const zs = g.zs.map((z, j) => ge.zs?.[j] ?? z);
  const colName = Object.fromEntries(Object.entries(g.cols).map(([n, i]) => [i, n]));
  const rowName = Object.fromEntries(Object.entries(g.rows).map(([n, j]) => [j, n]));
  const gone = new Set((ge.remove || []).map(([i, j, d]) => `${i},${j},${d}`));
  // Each street run, split where a piece of it is taken out.
  const streets = [];
  for (const s of g.streets) {
    const row = !!s.row;
    const fixed = row ? g.rows[s.row] : g.cols[s.col];
    const [a, b] = (row ? [g.cols[s.from], g.cols[s.to]] : [g.rows[s.from], g.rows[s.to]]).sort((p, q) => p - q);
    let start = a;
    for (let k = a; k <= b; k++) {
      const cut = k < b && gone.has(row ? `${k},${fixed},h` : `${fixed},${k},v`);
      if (k === b || cut) {
        if (k > start) streets.push(row ? { ...s, from: colName[start], to: colName[k] } : { ...s, from: rowName[start], to: rowName[k] });
        start = k + 1;
      }
    }
  }
  // New pieces (where there's no street already).
  const have = new Set();
  for (const s of streets) {
    const row = !!s.row;
    const fixed = row ? g.rows[s.row] : g.cols[s.col];
    const [a, b] = (row ? [g.cols[s.from], g.cols[s.to]] : [g.rows[s.from], g.rows[s.to]]).sort((p, q) => p - q);
    for (let k = a; k < b; k++) have.add(row ? `${k},${fixed},h` : `${fixed},${k},v`);
  }
  for (const [i, j, d, name] of ge.add || []) {
    if (have.has(`${i},${j},${d}`)) continue;
    have.add(`${i},${j},${d}`);
    streets.push(d === 'h' ? { name, row: rowName[j], from: colName[i], to: colName[i + 1] } : { name, col: colName[i], from: rowName[j], to: rowName[j + 1] });
  }
  const same = (L, M) => L.at[0] === M.at[0] && L.at[1] === M.at[1];
  const lots = [...(g.lots || []).filter((L) => !(ge.lots || []).some((M) => same(L, M))), ...(ge.lots || [])];
  const sites = (city.sites || []).filter((s) => !((s.name || s.kind) in (ge.sites || {})));
  return { ...city, grid: { ...g, xs, zs, streets, lots, extra: [...(g.extra || []), ...(ge.extra || [])] }, sites };
}
