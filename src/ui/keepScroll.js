// Screens re-render their HTML on every change; this keeps each scrolling panel
// where it was (e.g. selling a part doesn't jump the shop list to the top).
// Call it just before replacing root's HTML: positions are restored once the
// render finishes. Panels are matched by class and position among same-class
// elements. When the context key changes (another district, another slot), the
// panels start at the top again.

export function keepScroll(root, context) {
  const same = root._scrollContext === context;
  root._scrollContext = context;
  if (!same) return;
  const saved = new Map();
  for (const el of root.querySelectorAll('*')) {
    const k = (el.scrollTop || el.scrollLeft) && key(root, el);
    if (k) saved.set(k, [el.scrollTop, el.scrollLeft]);
  }
  if (!saved.size) return;
  queueMicrotask(() => {
    for (const el of root.querySelectorAll('*')) {
      const s = saved.get(key(root, el));
      if (s) [el.scrollTop, el.scrollLeft] = s;
    }
  });
}

function key(root, el) {
  const cls = typeof el.className === 'string' ? el.className.split(' ')[0] : '';
  if (!cls) return null;
  return `${cls}#${[...root.getElementsByClassName(cls)].indexOf(el)}`;
}
