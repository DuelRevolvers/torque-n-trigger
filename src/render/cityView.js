import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial, glowMaterial } from './retroMaterial.js';
import { makeRng } from './textures.js';
import { setUvRect } from './trackView.js';

// Procedural city around the track: tower blocks with lit windows, big neon
// billboards (horizontal, vertical and a skull board) facing the road, and a
// distant skyline ring. Everything is merged into a few meshes.

const WINDOW_U = 48; // metres of wall per horizontal texture repeat (3 m per window)
const WINDOW_V = 96; // metres of wall per vertical texture repeat (3 m per floor)

export function buildCityView(track, tex) {
  const rng = makeRng(42);
  const group = new THREE.Group();
  const buildings = [];
  const signs = [];
  const groundY = track.minY - 0.6;
  const atlas = tex.signs;

  const clearOfTrack = (x, z, radius) => {
    const minD = track.wallDist + 3 + radius;
    const minD2 = minD * minD;
    for (const t of [track, ...(track.branches || []).map((b) => b.track)]) {
      for (let i = 0; i < t.count; i++) {
        const dx = x - t.x[i];
        const dz = z - t.z[i];
        if (dx * dx + dz * dz < minD2) return false;
      }
    }
    return true;
  };

  // A sign plane of height h for atlas rect `rect`, facing (fx, fz), centred at (x, y, z).
  const addSign = (rect, h, x, y, z, fx, fz) => {
    const sign = new THREE.PlaneGeometry(h * rect.aspect, h);
    setUvRect(sign, rect);
    sign.rotateY(Math.atan2(fx, fz));
    sign.translate(x, y, z);
    signs.push(sign);
  };

  const step = Math.max(1, Math.round(22 / track.step));
  for (let i = 0; i < track.count; i += step) {
    for (const side of [-1, 1]) {
      for (let row = 0; row < 2; row++) {
        if (rng() < 0.15) continue;
        const along = 12 + rng() * 14;
        const across = 10 + rng() * 12;
        const height = 18 + rng() * (row === 0 ? 45 : 90);
        const lateral = track.wallDist + 5 + row * 30 + rng() * 8 + across / 2;
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
        if (row !== 0) continue;

        // Billboards on the face toward the road.
        const fx = -track.rx[i] * side;
        const fz = -track.rz[i] * side;
        const faceX = x + fx * (across / 2 + 0.25);
        const faceZ = z + fz * (across / 2 + 0.25);
        const kind = rng();
        if (kind < 0.45) {
          const rect = atlas.rects[1 + Math.floor(rng() * (atlas.rects.length - 1))];
          const h = Math.min(4 + rng() * 3, (along * 0.9) / rect.aspect);
          addSign(rect, h, faceX, groundY + Math.min(height - h, 9 + rng() * 14), faceZ, fx, fz);
        } else if (kind < 0.8) {
          // Vertical sign near one corner of the face, sticking out toward the road.
          const rect = atlas.vertical[Math.floor(rng() * atlas.vertical.length)];
          const h = Math.min(10 + rng() * 8, height - 6);
          const offset = (rng() < 0.5 ? -1 : 1) * (along / 2 - 2);
          addSign(
            rect,
            h,
            faceX + track.tx[i] * offset + fx * 0.6,
            groundY + 6 + h / 2 + rng() * 6,
            faceZ + track.tz[i] * offset + fz * 0.6,
            fx,
            fz,
          );
        } else {
          const h = Math.min(12, height - 8);
          addSign(atlas.skull, h, faceX, groundY + 8 + h / 2, faceZ, fx, fz);
        }
      }
    }
  }

  if (buildings.length) {
    group.add(
      new THREE.Mesh(
        mergeGeometries(buildings),
        litMaterial({ map: tex.building, emissiveMap: tex.buildingGlow, emissive: 0xffffff, emissiveIntensity: 0.9 }),
      ),
    );
  }
  if (signs.length) {
    group.add(new THREE.Mesh(mergeGeometries(signs), glowMaterial({ map: atlas.texture, intensity: 2.4, side: THREE.DoubleSide })));
  }
  group.add(buildSkyline(track, tex));
  return group;
}

// Scales box UVs to world size so windows stay the same size on every building.
function texturedBoxUvs(box, sx, sy, sz, rng) {
  const uv = box.attributes.uv;
  const ou = Math.floor(rng() * 16) / 16;
  const ov = Math.floor(rng() * 32) / 32;
  // BoxGeometry faces, 4 vertices each: +X, -X, +Y, -Y, +Z, -Z.
  const faceSize = [[sz, sy], [sz, sy], null, null, [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) {
    for (let k = f * 4; k < f * 4 + 4; k++) {
      const size = faceSize[f];
      if (!size) uv.setXY(k, 0.005, 0.995); // roofs: plain wall texel
      else uv.setXY(k, ou + (uv.getX(k) * size[0]) / WINDOW_U, ov + (uv.getY(k) * size[1]) / WINDOW_V);
    }
  }
}

function buildSkyline(track, tex) {
  const radius = 900;
  const height = 260;
  const g = new THREE.CylinderGeometry(radius, radius, height, 48, 1, true);
  tex.skyline.repeat.set(5, 1);
  const mat = new THREE.MeshBasicMaterial({ map: tex.skyline, side: THREE.BackSide, alphaTest: 0.5, fog: false });
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.set(
    (track.bounds.minX + track.bounds.maxX) / 2,
    track.minY + height / 2 - 30,
    (track.bounds.minZ + track.bounds.maxZ) / 2,
  );
  mesh.renderOrder = -1;
  return mesh;
}
