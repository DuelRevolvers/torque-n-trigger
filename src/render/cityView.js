import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial, glowMaterial } from './retroMaterial.js';
import { makeRng } from './textures.js';
import { setUvRect } from './trackView.js';

// Procedural city around the track: tower blocks with lit windows, neon signs
// facing the road, and a distant skyline ring. Everything is merged into a few
// meshes so it costs only a handful of draw calls.

const WINDOW_U = 24; // metres of wall per horizontal texture repeat
const WINDOW_V = 48; // metres of wall per vertical texture repeat

export function buildCityView(track, tex) {
  const rng = makeRng(42);
  const group = new THREE.Group();
  const buildings = [];
  const signs = [];
  const groundY = track.minY - 0.6;

  const clearOfTrack = (x, z, radius) => {
    const minD = track.wallDist + 3 + radius;
    const minD2 = minD * minD;
    for (let i = 0; i < track.count; i++) {
      const dx = x - track.x[i];
      const dz = z - track.z[i];
      if (dx * dx + dz * dz < minD2) return false;
    }
    return true;
  };

  const step = Math.max(1, Math.round(22 / track.step));
  for (let i = 0; i < track.count; i += step) {
    for (const side of [-1, 1]) {
      for (let row = 0; row < 2; row++) {
        if (rng() < 0.2) continue;
        const along = 10 + rng() * 12;
        const across = 10 + rng() * 12;
        const height = 14 + rng() * (row === 0 ? 40 : 75);
        const lateral = track.wallDist + 6 + row * 30 + rng() * 10 + across / 2;
        const x = track.x[i] + track.rx[i] * side * lateral;
        const z = track.z[i] + track.rz[i] * side * lateral;
        if (!clearOfTrack(x, z, Math.hypot(along, across) / 2)) continue;

        const yaw = Math.atan2(track.tx[i], track.tz[i]); // local +Z along the track
        const box = new THREE.BoxGeometry(across, height, along);
        texturedBoxUvs(box, across, height, along, rng);
        box.translate(0, height / 2, 0);
        box.rotateY(yaw);
        box.translate(x, groundY, z);
        buildings.push(box);

        if (row === 0 && rng() < 0.45) {
          const rect = tex.signs.rects[1 + Math.floor(rng() * (tex.signs.rects.length - 1))];
          let h = 2.5 + rng() * 2;
          let w = h * rect.aspect;
          if (w > along * 0.9) {
            w = along * 0.9;
            h = w / rect.aspect;
          }
          const sign = new THREE.PlaneGeometry(w, h);
          setUvRect(sign, rect);
          // Face the road: rotate the plane's +Z normal toward the track.
          const toTrackX = -track.rx[i] * side;
          const toTrackZ = -track.rz[i] * side;
          sign.rotateY(Math.atan2(toTrackX, toTrackZ));
          const signY = groundY + Math.min(height - h, 6 + rng() * 18);
          const offset = across / 2 + 0.2;
          sign.translate(x + toTrackX * offset, signY, z + toTrackZ * offset);
          signs.push(sign);
        }
      }
    }
  }

  if (buildings.length) {
    group.add(
      new THREE.Mesh(
        mergeGeometries(buildings),
        litMaterial({ map: tex.building, emissiveMap: tex.buildingGlow, emissive: 0xffffff }),
      ),
    );
  }
  if (signs.length) {
    group.add(new THREE.Mesh(mergeGeometries(signs), glowMaterial({ map: tex.signs.texture, side: THREE.DoubleSide })));
  }
  group.add(buildSkyline(track, tex));
  return group;
}

// Scales box UVs to world size so windows stay the same size on every building.
function texturedBoxUvs(box, sx, sy, sz, rng) {
  const uv = box.attributes.uv;
  const ou = Math.floor(rng() * 8) / 8;
  const ov = Math.floor(rng() * 16) / 16;
  // BoxGeometry faces, 4 vertices each: +X, -X, +Y, -Y, +Z, -Z.
  const faceSize = [
    [sz, sy], [sz, sy], null, null, [sx, sy], [sx, sy],
  ];
  for (let f = 0; f < 6; f++) {
    for (let k = f * 4; k < f * 4 + 4; k++) {
      const size = faceSize[f];
      if (!size) uv.setXY(k, 0.01, 0.99); // roofs: plain wall texel
      else uv.setXY(k, ou + (uv.getX(k) * size[0]) / WINDOW_U, ov + (uv.getY(k) * size[1]) / WINDOW_V);
    }
  }
}

function buildSkyline(track, tex) {
  const radius = 900;
  const height = 240;
  const g = new THREE.CylinderGeometry(radius, radius, height, 32, 1, true);
  tex.skyline.repeat.set(7, 1);
  const mat = new THREE.MeshBasicMaterial({
    map: tex.skyline,
    side: THREE.BackSide,
    alphaTest: 0.5,
    fog: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.set(
    (track.bounds.minX + track.bounds.maxX) / 2,
    track.minY + height / 2 - 30,
    (track.bounds.minZ + track.bounds.maxZ) / 2,
  );
  mesh.renderOrder = -1;
  return mesh;
}
