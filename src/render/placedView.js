import * as THREE from 'three';
import { litMaterial, glowMaterial, additiveMaterial, standardMaterial } from './retroMaterial.js';
import { rampGeometry, drapePoly } from './shapes.js';
import { textTexture } from './textures.js';
import { lightView } from './lightView.js';
import { rampsOf, signSize, upOf } from '../sim/gadgets.js';

// What's placed with the T&T SDK that stands in the district (sim/gadgets.js),
// drawn with it in every event and in the SDK: lights (lightView.js), ramps
// and kickers, neon signs, oil slicks and explosive barrels (hidden once
// they've gone off: setBroken). The arena gadgets are gadgetView.js's; drops
// are the race screen's pickups. World coordinates; heightAt: the ground.
export function placedView(gadgets, groundAt, tex) {
  const heightAt = groundAt;
  const list = gadgets || [];
  const group = new THREE.Group();
  group.name = 'placed';
  const lights = lightView(list, heightAt, tex);
  if (lights) group.add(lights);

  // Ramps and kickers: striped wedges, an amber lip along the top edge.
  const rampMat = litMaterial({ map: tex.wall, color: '#ffd080', side: THREE.DoubleSide });
  const lip = glowMaterial({ color: '#ffb000', intensity: 2.5 });
  for (const r of rampsOf(list, heightAt)) {
    group.add(new THREE.Mesh(rampGeometry(r, r.abs), rampMat));
    const edge = new THREE.Mesh(new THREE.BoxGeometry(r.width, 0.12, 0.25), lip);
    edge.position.set(r.x + r.dirX * r.len, r.abs + r.height + 0.02, r.z + r.dirZ * r.len);
    edge.rotation.y = Math.atan2(r.dirX, r.dirZ);
    group.add(edge);
  }

  // Neon signs: the words (the game's pixel font) on a dark board, or bare
  // letters; on posts or not; a little of their glow on the ground.
  const steel = litMaterial({ color: '#2a2834' });
  for (const g of list.filter((q) => q.type === 'sign' && q.text)) {
    const heightAt = upOf(groundAt, g); // (up on top of something, where it is)
    const { w, h } = signSize(g);
    const ground = heightAt(g.x, g.z);
    const yaw = g.yaw || 0;
    const [fx, fz] = [Math.sin(yaw), Math.cos(yaw)];
    const [rx, rz] = [Math.cos(yaw), -Math.sin(yaw)];
    const mid = ground + g.height + h / 2;
    const board = g.style !== 'neon';
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      glowMaterial({ map: textTexture(g.text, g.color, board ? '#0c0814' : 'rgba(0,0,0,0)'), intensity: 2.2, transparent: !board, alphaTest: board ? 0 : 0.3, side: board ? THREE.FrontSide : THREE.DoubleSide }),
    );
    face.position.set(g.x + fx * (board ? 0.13 : 0), mid, g.z + fz * (board ? 0.13 : 0));
    face.rotation.y = yaw;
    group.add(face);
    if (board) {
      const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.22), steel);
      back.position.set(g.x, mid, g.z);
      back.rotation.y = yaw;
      group.add(back);
    }
    if (g.posts) {
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, g.height + h, 0.25), steel);
        const [px, pz] = [g.x + rx * s * (w / 2 - 0.3), g.z + rz * s * (w / 2 - 0.3)];
        post.position.set(px, heightAt(px, pz) + (g.height + h) / 2 - 0.1, pz);
        group.add(post);
      }
    }
    if (g.height < 12) {
      const R = Math.max(3, w * 0.6);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2).rotateX(-Math.PI / 2), additiveMaterial({ map: tex.glow, color: g.color, opacity: 0.22 }));
      pool.position.set(g.x + fx * R * 0.5, heightAt(g.x + fx * R * 0.5, g.z + fz * R * 0.5) + 0.12, g.z + fz * R * 0.5);
      pool.renderOrder = 2;
      group.add(pool);
    }
  }

  // Oil slicks: a black, glossy puddle with a ragged edge (the same every time).
  const oilMat = standardMaterial({ color: '#050408', roughness: 0.08, metalness: 0.85, envMap: tex.env, envMapIntensity: 1.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  list.filter((q) => q.type === 'oil').forEach((g, k) => {
    const heightAt = upOf(groundAt, g);
    const seed = [...String(g.id)].reduce((s, c) => s + c.charCodeAt(0), k * 7);
    const edge = [...Array(20).keys()].map((q) => {
      const a = (q / 20) * Math.PI * 2;
      const r = g.r * (0.82 + 0.12 * Math.sin(a * 3 + seed) + 0.06 * Math.sin(a * 7 + seed * 1.7));
      return [g.x + Math.cos(a) * r, g.z + Math.sin(a) * r];
    });
    group.add(new THREE.Mesh(drapePoly(edge, (x, z) => heightAt(x, z) + 0.06, 3, 4), oilMat));
  });

  // Explosive barrels: red, with glowing hazard bands.
  const red = litMaterial({ color: '#b01818' });
  const band = glowMaterial({ color: '#ffb000', intensity: 2 });
  const barrels = new Map();
  for (const g of list.filter((q) => q.type === 'barrel')) {
    const b = new THREE.Group();
    b.add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12).translate(0, 0.55, 0), red));
    for (const y of [0.25, 0.85]) b.add(new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.08, 12).translate(0, y, 0), band));
    b.position.set(g.x, upOf(groundAt, g)(g.x, g.z), g.z);
    group.add(b);
    barrels.set(`barrel:${g.id}`, b);
  }

  if (!group.children.length) return null;
  group.userData.animate = (t) => lights?.userData.animate(t);
  group.userData.setBroken = (broken) => {
    for (const [id, b] of barrels) b.visible = !broken || broken[id] === undefined;
  };
  return group;
}

// The SDK's markers (not in the game): the free roam start (green), the test
// drive start (amber) and the arena spawn points (cyan, numbered), arrows on
// the ground the way a car faces.
export function startMarkers(gadgets, groundAt) {
  const marks = (gadgets || []).filter((g) => g.type === 'start' || g.type === 'testStart' || g.type === 'spawn');
  if (!marks.length) return null;
  const group = new THREE.Group();
  const arrow = new THREE.Shape([[-0.5, -2], [0.5, -2], [0.5, 0.4], [1.4, 0.4], [0, 2.2], [-1.4, 0.4], [-0.5, 0.4]].map(([x, y]) => new THREE.Vector2(x, y)));
  let n = 0;
  for (const g of marks) {
    const start = g.type === 'start' || g.type === 'testStart';
    const color = g.type === 'start' ? '#39ff14' : g.type === 'testStart' ? '#ffb000' : '#05d9e8';
    const m = new THREE.Mesh(new THREE.ShapeGeometry(arrow).rotateX(-Math.PI / 2).scale(1, 1, -1), glowMaterial({ color, intensity: 2, side: THREE.DoubleSide, depthTest: false }));
    const heightAt = upOf(groundAt, g);
    m.position.set(g.x, heightAt(g.x, g.z) + 0.3, g.z);
    m.rotation.y = g.yaw || 0;
    m.renderOrder = 12;
    group.add(m);
    // (START, or the spawn's number: which car takes it.)
    const word = g.type === 'start' ? 'START' : g.type === 'testStart' ? 'TEST' : String(++n);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(word, color, 'rgba(0,0,0,0.6)'), depthTest: false, fog: false }));
    const h = start ? 1.3 : 1.6;
    label.scale.set((h * (word.length * 6 + 5)) / 13, h, 1);
    label.position.set(g.x, heightAt(g.x, g.z) + 3.2, g.z);
    label.renderOrder = 12;
    group.add(label);
  }
  return group;
}
