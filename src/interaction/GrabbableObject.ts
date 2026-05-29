import * as THREE from 'three';

export class GrabbableObject {
  readonly root = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly radius = 0.28;

  private readonly material = new THREE.MeshStandardMaterial({
    color: 0x9adfff,
    roughness: 0.32,
    metalness: 0.08,
    emissive: 0x164d63,
    emissiveIntensity: 0.16,
    transparent: true,
    opacity: 0.88,
  });
  private readonly haloMaterial = new THREE.MeshBasicMaterial({
    color: 0xbdf8ff,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  private readonly halo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 28, 18), this.haloMaterial);

  constructor() {
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38, 2, 2, 2), this.material);
    this.mesh.position.set(0, 0, 0);
    this.halo.position.copy(this.mesh.position);
    this.root.add(this.mesh, this.halo);
  }

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  setHover(value: number): void {
    this.haloMaterial.opacity = THREE.MathUtils.lerp(0.08, 0.28, value);
    this.material.emissiveIntensity = THREE.MathUtils.lerp(0.14, 0.38, value);
  }

  update(elapsedSeconds: number, held: boolean): void {
    if (!held) {
      this.mesh.rotation.x = elapsedSeconds * 0.24;
      this.mesh.rotation.y = elapsedSeconds * 0.32;
    }

    this.halo.position.copy(this.mesh.position);
    this.halo.scale.setScalar(1 + Math.sin(elapsedSeconds * 1.7) * 0.035);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.halo.geometry.dispose();
    this.haloMaterial.dispose();
  }
}
