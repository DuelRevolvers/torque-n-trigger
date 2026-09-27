import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { retroUniforms } from './retroMaterial.js';

// Renders the scene at an internal resolution (default ~960x540) with neon bloom,
// then upscales it to the screen at an integer scale so every pixel is the same
// size. The post pass also does the optional colour-quantise + dither, scanlines
// and CRT curvature, and composites the HUD canvas on top.

const POST_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const POST_FRAGMENT = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tHud;
  uniform vec2 uInternal;   // internal resolution in pixels
  uniform float uScale;     // output pixels per internal pixel
  uniform float uDither;
  uniform float uLevels;
  uniform float uScanlines;
  uniform float uCrt;

  float bayer4(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    int i = x + y * 4;
    float m[16];
    m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0;
    m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
    m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0;
    m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
    for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0 - 0.5;
    return 0.0;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / (uInternal * uScale);
    if (uCrt > 0.5) {
      vec2 c = uv * 2.0 - 1.0;
      c *= 1.0 + 0.06 * (c.yx * c.yx);
      uv = c * 0.5 + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
    }
    vec2 pixel = floor(uv * uInternal);
    vec2 sampleUv = (pixel + 0.5) / uInternal;

    vec3 color = linearToOutputTexel(texture2D(tScene, sampleUv)).rgb;
    if (uDither > 0.5) {
      color = floor(color * uLevels + 0.5 + bayer4(pixel)) / uLevels;
    }
    vec4 hud = texture2D(tHud, sampleUv);
    color = mix(color, linearToOutputTexel(vec4(hud.rgb, 1.0)).rgb, hud.a);

    if (uScanlines > 0.5 && uScale >= 2.0) {
      float row = fract(uv.y * uInternal.y);
      color *= row < 0.5 ? 0.72 : 1.0;
    }
    if (uCrt > 0.5) {
      vec2 c = uv * 2.0 - 1.0;
      color *= 1.0 - 0.35 * dot(c * c, c * c);
    }
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;

export class RetroRenderer {
  constructor(canvas, hudCanvas, settings) {
    this.settings = settings;
    this.hudCanvas = hudCanvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.composer = null; // created on first render, when scene and camera are known
    this.hudTexture = new THREE.CanvasTexture(hudCanvas);
    this.hudTexture.minFilter = this.hudTexture.magFilter = THREE.NearestFilter;
    this.hudTexture.generateMipmaps = false;
    this.hudTexture.colorSpace = THREE.SRGBColorSpace;

    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VERTEX,
      fragmentShader: POST_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: null },
        tHud: { value: this.hudTexture },
        uInternal: { value: new THREE.Vector2(1, 1) },
        uScale: { value: 1 },
        uDither: { value: 1 },
        uLevels: { value: 48 },
        uScanlines: { value: 0 },
        uCrt: { value: 0 },
      },
    });
    this.postScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    quad.frustumCulled = false;
    this.postScene.add(quad);
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.width = 1;
    this.height = 1;
    this.resize();
  }

  // Picks an integer scale so the internal height is close to the setting.
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const outW = Math.floor(cssW * dpr);
    const outH = Math.floor(cssH * dpr);
    const res = this.settings.resolution;
    const scale = res ? Math.max(1, Math.round(outH / res)) : 1;
    this.width = Math.ceil(outW / scale);
    this.height = Math.ceil(outH / scale);
    this.scale = scale;

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(cssW, cssH);
    if (this.composer) this.sizeComposer();
    this.hudCanvas.width = this.width;
    this.hudCanvas.height = this.height;
    this.hudTexture.dispose(); // canvas size changed; reallocate on the GPU
    this.post.uniforms.uInternal.value.set(this.width, this.height);
    this.post.uniforms.uScale.value = scale;
    retroUniforms.uSnapRes.value.set(this.width / 2, this.height / 2);
  }

  applySettings() {
    const s = this.settings;
    this.post.uniforms.uDither.value = s.dither ? 1 : 0;
    this.post.uniforms.uScanlines.value = s.scanlines ? 1 : 0;
    this.post.uniforms.uCrt.value = s.crt ? 1 : 0;
    retroUniforms.uSnap.value = s.vertexSnap ? 1 : 0;
  }

  get aspect() {
    return this.width / this.height;
  }

  sizeComposer() {
    this.composer.setPixelRatio(1);
    this.composer.setSize(this.width, this.height);
  }

  render(scene, camera) {
    if (!this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.renderToScreen = false;
      this.composer.addPass(new RenderPass(scene, camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 0.55, 0.35, 0.9);
      this.composer.addPass(this.bloom);
      this.sizeComposer();
    }
    this.bloom.enabled = this.settings.bloom;
    this.hudTexture.needsUpdate = true;
    this.composer.render();
    this.post.uniforms.tScene.value = this.composer.readBuffer.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
  }
}
