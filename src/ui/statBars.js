// Stat bars with optional preview: gains in green, losses in red.

export const STAT_ROWS = [
  ['topSpeed', 'Top speed'],
  ['acceleration', 'Acceleration'],
  ['handling', 'Handling'],
  ['grip', 'Grip'],
  ['braking', 'Braking'],
  ['weight', 'Weight', true], // higher is worse
  ['hp', 'HP'],
  ['armor', 'Armor'],
  ['heatCapacity', 'Heat capacity'],
  ['firepower', 'Firepower'],
];

const fmt = (s) => `${s.value}${s.unit && s.unit !== 'x' ? (s.unit.startsWith('s') || s.unit === '%' ? '' : ' ') + s.unit : ''}`;

// stats: computeBuild(...).stats; preview: stats of the candidate build, or null.
export function statBarsHtml(stats, preview = null, pr = null, previewPr = null) {
  let html = '';
  if (pr !== null) {
    const d = previewPr !== null ? previewPr - pr : 0;
    html += `<div class="pr">PR <b>${pr}</b>${d ? ` <span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>` : ''}</div>`;
  }
  for (const [key, label, inverse] of STAT_ROWS) {
    const a = stats[key];
    const b = preview ? preview[key] : a;
    const lo = Math.min(a.score, b.score);
    const hi = Math.max(a.score, b.score);
    const better = inverse ? b.score < a.score : b.score > a.score;
    const deltaCls = b.score === a.score ? '' : better ? 'up' : 'down';
    html += `<div class="stat">
      <span class="stat-label">${label}</span>
      <span class="bar"><i style="width:${lo}%"></i>${hi > lo ? `<i class="${deltaCls}" style="left:${lo}%;width:${hi - lo}%"></i>` : ''}</span>
      <span class="stat-value ${deltaCls}">${preview && b.value !== a.value ? `${fmt(a)} &rarr; ${fmt(b)}` : fmt(a)}</span>
    </div>`;
  }
  return html;
}
