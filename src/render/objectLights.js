import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glowMaterial, additiveMaterial } from './retroMaterial.js';

// A district light given settings of its own in the T&T SDK (it.set: colour,
// reach, brightness, flicker, as a placed light has; sdk/objectOptions.js):
// its lit parts and its pool on the ground drawn in its own colour, as bright
// and as far as set, flickering so. Without settings, into the view's own
// buckets as before. heads and pools are buckets for the view's itemDrawer
// (what's drawn moves with the item).
export function objectLights(tex) {
  const heads = new Map();
  const pools = new Map();
  const lit = (it) => !!it.set && ['color', 'reach', 'brightness', 'flicker'].some((k) => it.set[k] !== undefined);
  const into = (map, it) => {
    const k = JSON.stringify([it.set.color || '', it.set.brightness ?? 1, it.set.flicker || 'none']);
    if (!map.has(k)) map.set(k, []);
    return map.get(k);
  };
  return {
    lit,
    buckets: [heads, pools],
    // Its lit parts.
    head(it, list, ...geos) {
      (lit(it) ? into(heads, it) : list).push(...geos);
    },
    // A part in a colour of its own, lit (a barrier's top, a stall's light), or the view's.
    colored(color, list, ...geos) {
      if (!color) return list.push(...geos);
      const k = JSON.stringify([color, 1, 'none']);
      if (!heads.has(k)) heads.set(k, []);
      heads.get(k).push(...geos);
    },
    // Its pool: size (metres) the view's own, or twice its reach; make(size) builds it.
    pool(it, list, size, make) {
      (lit(it) ? into(pools, it) : list).push(make(lit(it) && it.set.reach ? it.set.reach * 2 : size));
    },
    // The meshes (colour: the view's light colour where none is set), and
    // animate(real) for the flickering ones.
    build(add, color) {
      const live = [];
      const make = (map, mat) => {
        for (const [k, list] of map) {
          if (!list.length) continue;
          const [c, b, f] = JSON.parse(k);
          const m = new THREE.Mesh(mergeGeometries(list), mat(c || color, b));
          add(m);
          if (f !== 'none') live.push({ m, f, b, n: live.length });
        }
      };
      make(heads, (c, b) => glowMaterial({ color: c, intensity: 0.8 + b * 0.6 }));
      make(pools, (c, b) => {
        const m = additiveMaterial({ map: tex.glow, color: c, opacity: Math.min(0.9, 0.32 * b) });
        return m;
      });
      for (const l of live) if (l.m.material.opacity !== undefined) l.base = l.m.material.opacity;
      return live.length
        ? (real) => {
            for (const l of live) {
              // Breathing: slow and soft; buzzing: fast; failing: dropping out.
              const k = l.f === 'gentle' ? 0.8 + 0.2 * Math.sin(real * 2.2 + l.n) : l.f === 'buzz' ? 0.85 + 0.15 * Math.sin(real * 40 + l.n) : Math.sin(real * 7.3 + l.n * 2) + Math.sin(real * 13.1 + l.n) > -0.7 ? 1 : 0.1;
              if (l.base !== undefined && l.m.material.transparent) l.m.material.opacity = l.base * k;
              else l.m.visible = k > 0.5;
            }
          }
        : null;
    },
  };
}
