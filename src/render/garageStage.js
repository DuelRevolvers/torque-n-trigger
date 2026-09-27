import * as THREE from 'three';
import { standardMaterial, litMaterial, glowMaterial } from './retroMaterial.js';
import { PALETTE } from './textures.js';
import { setUvRect } from './trackView.js';

// Neon-lit workshop with one or more turntables. Used by the starter selection
// (three tables) and the garage (one table). Each table is a Group whose y = 0 is
// the table surface; put cars on it with CarView.addTo(table) + showcase().

export class GarageStage {
  constructor(tex, tablePositions) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07050d');
    scene.fog = new THREE.Fog('#07050d', 18, 45);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 120);

    scene.add(new THREE.HemisphereLight('#5a5aa0', '#120a1e', 0.9));
    const env = { envMap: tex.env };

    // Wet, glossy workshop floor.
    tex.ground.repeat.set(12, 12);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2),
      standardMaterial({ map: tex.ground, roughness: 0.28, metalness: 0.3, envMapIntensity: 0.8, ...env }),
    );
    scene.add(floor);

    // Back wall with neon strips and the game's sign.
    const wallMat = litMaterial({ map: tex.building, color: '#6a6a80' });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 10, 0.5), wallMat);
    wall.position.set(0, 5, -9);
    scene.add(wall);
    for (const [y, color] of [[0.4, PALETTE.pink], [6.5, PALETTE.cyan]]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(40, 0.08, 0.1), glowMaterial({ color, intensity: 2.5 }));
      strip.position.set(0, y, -8.7);
      scene.add(strip);
    }
    const rect = tex.signs.rects[0];
    const sign = new THREE.PlaneGeometry(1.6 * rect.aspect, 1.6);
    setUvRect(sign, rect);
    const signMesh = new THREE.Mesh(sign, glowMaterial({ map: tex.signs.texture, intensity: 2.2 }));
    signMesh.position.set(0, 4.6, -8.7);
    scene.add(signMesh);

    // Side props: tire stacks and shelving.
    const tireMat = litMaterial({ color: '#141218' });
    const shelfMat = litMaterial({ color: '#2a2838' });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.28, 10), tireMat);
        tire.position.set(side * 9.5, 0.14 + i * 0.3, -6.5);
        scene.add(tire);
      }
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3, 4), shelfMat);
      shelf.position.set(side * 11, 1.5, -4);
      scene.add(shelf);
      const light = new THREE.PointLight(side < 0 ? PALETTE.pink : PALETTE.cyan, 25, 14, 1.6);
      light.position.set(side * 7, 3, 2);
      scene.add(light);
    }

    // Turntables, each lit by a spotlight from above.
    const baseMat = standardMaterial({ color: '#1c1b24', metalness: 0.7, roughness: 0.35, ...env });
    const ringMat = glowMaterial({ color: PALETTE.cyan, intensity: 2.4 });
    this.tables = tablePositions.map((x) => {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.1, 0.16, 40), baseMat);
      base.position.set(x, 0.08, 0);
      scene.add(base);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.02, 0.035, 4, 64).rotateX(Math.PI / 2), ringMat);
      ring.position.set(x, 0.16, 0);
      scene.add(ring);
      const table = new THREE.Group();
      table.position.set(x, 0.16, 0);
      scene.add(table);
      const spot = new THREE.SpotLight('#fff0e0', 60, 16, 0.55, 0.5, 1.4);
      spot.position.set(x, 8, 2);
      spot.target = table;
      scene.add(spot);
      return table;
    });
    this.spin = this.tables.map(() => true);
  }

  update(dt) {
    this.tables.forEach((t, i) => {
      if (this.spin[i]) t.rotation.y += dt * 0.35;
    });
  }
}
