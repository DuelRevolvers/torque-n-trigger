import * as THREE from 'three';

// Floating pickup: red cross (health), cyan canister (nitro), amber crate
// (ammo). The race screen's, and the T&T SDK's drops.
export function makePickupMesh(type) {
  const g = new THREE.Group();
  const color = { health: '#ff2040', nitro: '#05d9e8', ammo: '#ffb000' }[type];
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2) });
  if (type === 'health') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.36, 0.36), mat), new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.2, 0.36), mat));
  } else if (type === 'nitro') {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.1, 8), mat));
  } else {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.6), mat));
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 4, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.5), transparent: true, opacity: 0.6 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.7;
  g.add(ring);
  return g;
}
