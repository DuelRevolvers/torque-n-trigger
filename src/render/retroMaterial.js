import * as THREE from 'three';

// Shared uniforms for the optional 90s-console vertex snapping: projected vertices
// are rounded to a coarse screen grid, which gives the characteristic wobble.
// Only vertices within SNAP_MAX_DEPTH are snapped: snapping a distant vertex of a
// triangle that also reaches behind the camera gets magnified near the camera and
// visibly tilts the whole triangle. Very large flat surfaces (the ground) opt out.
const SNAP_MAX_DEPTH = 120; // metres (clip-space w)

export const retroUniforms = {
  uSnapRes: { value: new THREE.Vector2(240, 135) },
  uSnap: { value: 1 },
};

// Patches a built-in material to support vertex snapping. Returns the material.
export function retro(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSnapRes = retroUniforms.uSnapRes;
    shader.uniforms.uSnap = retroUniforms.uSnap;
    shader.vertexShader =
      'uniform vec2 uSnapRes;\nuniform float uSnap;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        if (uSnap > 0.5 && gl_Position.w > 0.0 && gl_Position.w < ${SNAP_MAX_DEPTH.toFixed(1)}) {
          vec2 grid = uSnapRes * 0.5;
          gl_Position.xy = floor(gl_Position.xy / gl_Position.w * grid + 0.5) / grid * gl_Position.w;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'retro-snap';
  return material;
}

// Flat-shaded lit material, the default for solid geometry.
export const litMaterial = (params) => retro(new THREE.MeshLambertMaterial({ flatShading: true, ...params }));

// Unlit material for emissive things: neon, lights, signs.
export const glowMaterial = (params) => retro(new THREE.MeshBasicMaterial(params));

// Additive, depth-tested but not depth-writing: light beams, glows, underglow.
export const additiveMaterial = (params) =>
  retro(
    new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      ...params,
    }),
  );
