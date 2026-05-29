import * as THREE from 'three';
import { GAME_CONFIG } from './GameConfig';

let nextEnemyId = 1;

export class Enemy {
  readonly id = nextEnemyId;
  readonly root = new THREE.Group();
  readonly radius = 0.28;

  readonly maxHp: number;
  currentHp: number;
  alive = true;

  private readonly speed: number;
  private readonly mesh: THREE.Mesh;
  private readonly healthBar = new THREE.Group();
  private readonly healthFill: THREE.Mesh;
  private readonly healthFillMaterial: THREE.MeshBasicMaterial;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  constructor(position: THREE.Vector3, wave: number) {
    nextEnemyId += 1;
    this.maxHp = GAME_CONFIG.enemyHp + wave * GAME_CONFIG.enemyHpPerWave;
    this.currentHp = this.maxHp;
    this.speed = GAME_CONFIG.enemySpeed + wave * GAME_CONFIG.enemySpeedPerWave;
    this.root.position.copy(position);

    const geometry = new THREE.CapsuleGeometry(0.22, 0.42, 4, 10);
    const material = new THREE.MeshStandardMaterial({
      color: 0xff5a65,
      emissive: 0x5b0711,
      emissiveIntensity: 0.42,
      roughness: 0.46,
      metalness: 0.04,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = 0.34;
    this.root.add(this.mesh, this.healthBar);
    this.disposables.push(geometry, material);

    const bgGeometry = new THREE.PlaneGeometry(0.72, 0.09);
    const bgMaterial = new THREE.MeshBasicMaterial({
      color: 0x16070a,
      transparent: true,
      opacity: 0.88,
      depthTest: false,
    });
    const fillGeometry = new THREE.PlaneGeometry(0.66, 0.052);
    this.healthFillMaterial = new THREE.MeshBasicMaterial({
      color: 0x4cff7b,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    const background = new THREE.Mesh(bgGeometry, bgMaterial);
    this.healthFill = new THREE.Mesh(fillGeometry, this.healthFillMaterial);
    this.healthFill.position.z = 0.002;
    this.healthBar.position.set(0, 0.86, 0);
    this.healthBar.rotation.x = -Math.PI / 2;
    this.healthBar.add(background, this.healthFill);
    this.disposables.push(bgGeometry, bgMaterial, fillGeometry, this.healthFillMaterial);
  }

  update(deltaSeconds: number, camera: THREE.Camera): boolean {
    if (!this.alive) {
      return false;
    }

    const direction = new THREE.Vector3(-this.root.position.x, 0, -this.root.position.z);
    const distance = direction.length();

    if (distance > 0.001) {
      direction.normalize();
      this.root.position.addScaledVector(direction, this.speed * deltaSeconds);
      this.root.lookAt(0, this.root.position.y, 0);
    }

    this.mesh.rotation.y += deltaSeconds * 1.8;
    this.updateHealthBar(camera);
    return distance <= GAME_CONFIG.enemyReachRadius;
  }

  damage(amount: number): void {
    this.currentHp = Math.max(0, this.currentHp - amount);

    if (this.currentHp <= 0) {
      this.alive = false;
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private updateHealthBar(camera: THREE.Camera): void {
    const ratio = THREE.MathUtils.clamp(this.currentHp / this.maxHp, 0, 1);
    this.healthFill.scale.x = ratio;
    this.healthFill.position.x = -0.33 * (1 - ratio);
    this.healthFillMaterial.color.set(ratio < 0.35 ? 0xff4050 : 0x4cff7b);
    this.healthBar.quaternion.copy(camera.quaternion);
  }
}
