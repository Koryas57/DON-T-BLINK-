import * as THREE from 'three';
import { GAME_CONFIG } from './GameConfig';

export class Arena {
  readonly root = new THREE.Group();
  readonly radius = GAME_CONFIG.mapRadius;
  readonly baseRadius = GAME_CONFIG.baseRadius;

  private readonly disposables: Array<{ dispose: () => void }> = [];

  constructor(mapTexture: THREE.Texture | null) {
    const planeGeometry = new THREE.PlaneGeometry(this.radius * 2.25, this.radius * 2.25, 1, 1);
    const planeMaterial = new THREE.MeshStandardMaterial({
      color: mapTexture ? 0xffffff : 0x18252d,
      map: mapTexture,
      roughness: 0.82,
      metalness: 0,
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.03;
    this.root.add(plane);
    this.disposables.push(planeGeometry, planeMaterial);

    if (!mapTexture) {
      this.addFallbackMarkings();
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private addFallbackMarkings(): void {
    const ringMaterial = new THREE.LineBasicMaterial({
      color: 0x4fb8c9,
      transparent: true,
      opacity: 0.38,
    });
    this.disposables.push(ringMaterial);

    for (const radius of [this.baseRadius, 3.4, 6.2, this.radius]) {
      const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2);
      const points = curve.getPoints(96).map((point) => new THREE.Vector3(point.x, 0.02, point.y));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.LineLoop(geometry, ringMaterial);
      this.root.add(line);
      this.disposables.push(geometry);
    }
  }

}
