import * as THREE from 'three';
import type { Enemy } from './Enemy';
import { GAME_CONFIG } from './GameConfig';
import { Projectile } from './Projectile';

export class Turret {
  readonly root = new THREE.Group();

  private readonly yawRoot = new THREE.Group();
  private readonly modelRoot = new THREE.Group();
  private readonly barrelTip = new THREE.Object3D();
  private cooldown = 0;
  private readonly fireInterval = 1 / GAME_CONFIG.turretFireRate;
  private readonly range = GAME_CONFIG.turretRange;
  private readonly fallbackDisposables: Array<{ dispose: () => void }> = [];
  private readonly turretCenter = new THREE.Vector3();
  private readonly barrelTipWorld = new THREE.Vector3();
  private readonly barrelDirection = new THREE.Vector3();
  private readonly targetDirection = new THREE.Vector3();

  constructor(model: THREE.Object3D | null) {
    this.root.position.set(0, 0.12, GAME_CONFIG.turretMapOffsetZ);
    this.root.add(this.yawRoot);
    this.yawRoot.scale.setScalar(GAME_CONFIG.turretScale);
    this.yawRoot.add(this.modelRoot);

    if (model) {
      const barrelSetup = createBarrelSetup(model);
      model.rotation.y = barrelSetup.modelYawOffset;
      model.position.copy(barrelSetup.modelOffset);
      this.barrelTip.position.copy(barrelSetup.tip);
      this.modelRoot.add(model);
    } else {
      this.addFallbackModel();
      this.barrelTip.position.set(0, 0.34, 0.86);
    }

    this.yawRoot.add(this.barrelTip);
  }

  update(deltaSeconds: number, enemies: Enemy[]): Projectile | null {
    this.cooldown = Math.max(0, this.cooldown - deltaSeconds);
    const target = this.findNearestEnemy(enemies);

    if (!target) {
      return null;
    }

    this.turretCenter.copy(this.root.position).setY(0);
    this.targetDirection.copy(target.root.position).sub(this.turretCenter).setY(0).normalize();
    const angle = Math.atan2(this.targetDirection.x, this.targetDirection.z);
    const angleDelta = Math.atan2(Math.sin(angle - this.yawRoot.rotation.y), Math.cos(angle - this.yawRoot.rotation.y));
    this.yawRoot.rotation.y = dampAngle(this.yawRoot.rotation.y, angle, 10, deltaSeconds);

    this.getBarrelDirection();
    const alignment = this.barrelDirection.dot(this.targetDirection);

    if (this.cooldown > 0 || Math.abs(angleDelta) > GAME_CONFIG.turretFireArc || alignment < Math.cos(GAME_CONFIG.turretFireArc)) {
      return null;
    }

    this.cooldown = this.fireInterval;
    return new Projectile(this.barrelTipWorld.clone(), this.barrelDirection.clone());
  }

  dispose(): void {
    for (const disposable of this.fallbackDisposables) {
      disposable.dispose();
    }
  }

  private findNearestEnemy(enemies: Enemy[]): Enemy | null {
    let best: Enemy | null = null;
    let bestDistance = this.range;

    for (const enemy of enemies) {
      if (!enemy.alive) {
        continue;
      }

      const distance = enemy.root.position.length();

      if (distance < bestDistance) {
        best = enemy;
        bestDistance = distance;
      }
    }

    return best;
  }

  private addFallbackModel(): void {
    const baseGeometry = new THREE.CylinderGeometry(0.36, 0.48, 0.18, 32);
    const bodyGeometry = new THREE.BoxGeometry(0.52, 0.24, 0.52);
    const barrelGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.66);
    const material = new THREE.MeshStandardMaterial({
      color: 0xbfd4dc,
      roughness: 0.42,
      metalness: 0.22,
      emissive: 0x0b3f55,
      emissiveIntensity: 0.12,
    });

    const base = new THREE.Mesh(baseGeometry, material);
    const body = new THREE.Mesh(bodyGeometry, material);
    const barrel = new THREE.Mesh(barrelGeometry, material);
    body.position.y = 0.24;
    barrel.position.set(0, 0.26, 0.44);
    this.modelRoot.add(base, body, barrel);
    this.fallbackDisposables.push(baseGeometry, bodyGeometry, barrelGeometry, material);
  }

  private getBarrelDirection(): THREE.Vector3 {
    this.barrelTip.getWorldPosition(this.barrelTipWorld);
    this.barrelDirection.copy(this.barrelTipWorld).sub(this.turretCenter).setY(0).normalize();
    return this.barrelDirection;
  }
}

function dampAngle(current: number, target: number, lambda: number, deltaSeconds: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-lambda * deltaSeconds));
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);

function createBarrelSetup(model: THREE.Object3D): { modelYawOffset: number; modelOffset: THREE.Vector3; tip: THREE.Vector3 } {
  const tip = findUpperFarthestPoint(model) ?? new THREE.Vector3(0, 0.34, 0.86);
  const pivotCenter = findRotatingCoreCenter(model) ?? new THREE.Vector3();
  const modelForwardAngle = Math.atan2(tip.x, tip.z);
  const modelYawOffset = -modelForwardAngle;
  const alignedTip = tip.clone().applyAxisAngle(Y_AXIS, modelYawOffset);
  const alignedPivotCenter = pivotCenter.clone().applyAxisAngle(Y_AXIS, modelYawOffset);
  const modelOffset = new THREE.Vector3(-alignedPivotCenter.x, 0, -alignedPivotCenter.z);
  alignedTip.add(modelOffset);

  if (Math.abs(alignedTip.x) < 0.001) {
    alignedTip.x = 0;
  }

  return {
    modelYawOffset,
    modelOffset,
    tip: alignedTip,
  };
}

function findUpperFarthestPoint(model: THREE.Object3D): THREE.Vector3 | null {
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) {
    return null;
  }

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const minSampleY = center.y + size.y * 0.05;
  const point = new THREE.Vector3();
  const best = new THREE.Vector3();
  let bestDistance = -1;

  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    const position = geometry?.attributes.position as THREE.BufferAttribute | undefined;

    if (!mesh.isMesh || !position) {
      return;
    }

    mesh.updateWorldMatrix(true, false);

    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);

      if (point.y < minSampleY) {
        continue;
      }

      const distance = Math.hypot(point.x - center.x, point.z - center.z);

      if (distance > bestDistance) {
        bestDistance = distance;
        best.copy(point);
      }
    }
  });

  if (bestDistance < 0) {
    return null;
  }

  return best;
}

function findRotatingCoreCenter(model: THREE.Object3D): THREE.Vector3 | null {
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) {
    return null;
  }

  const size = new THREE.Vector3();
  box.getSize(size);

  const minCoreY = box.min.y + size.y * 0.55;
  const maxCoreY = box.min.y + size.y * 0.72;
  const point = new THREE.Vector3();
  const coreBox = new THREE.Box3();

  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    const position = geometry?.attributes.position as THREE.BufferAttribute | undefined;

    if (!mesh.isMesh || !position) {
      return;
    }

    mesh.updateWorldMatrix(true, false);

    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);

      if (point.y >= minCoreY && point.y <= maxCoreY) {
        coreBox.expandByPoint(point);
      }
    }
  });

  if (coreBox.isEmpty()) {
    return null;
  }

  const center = new THREE.Vector3();
  coreBox.getCenter(center);
  center.y = 0;
  return center;
}
