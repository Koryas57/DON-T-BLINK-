import * as THREE from 'three';
import type { Enemy } from './Enemy';
import { GAME_CONFIG } from './GameConfig';

let nextProjectileId = 1;

export class Projectile {
  readonly id = nextProjectileId;
  readonly root = new THREE.Group();
  readonly radius = 0.16;
  readonly damage = GAME_CONFIG.turretDamage;

  alive = true;
  hitEnemy: Enemy | null = null;

  private readonly velocity = new THREE.Vector3();
  private readonly speed = GAME_CONFIG.projectileSpeed;
  private readonly maxLifetime = 1.25;
  private readonly previousPosition = new THREE.Vector3();
  private lifetime = 0;
  private readonly mesh: THREE.Mesh;

  constructor(origin: THREE.Vector3, direction: THREE.Vector3) {
    nextProjectileId += 1;
    this.root.position.copy(origin);
    this.previousPosition.copy(origin);
    this.velocity.copy(direction).setY(0).normalize().multiplyScalar(this.speed);

    const geometry = new THREE.SphereGeometry(this.radius, 16, 10);
    const material = new THREE.MeshBasicMaterial({
      color: 0xd9fbff,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    const trail = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.36),
      new THREE.MeshBasicMaterial({ color: 0x79eaff, transparent: true, opacity: 0.6, toneMapped: false }),
    );
    trail.position.z = -0.18;
    this.root.add(this.mesh);
    this.root.add(trail);
    this.root.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
  }

  update(deltaSeconds: number, enemies: Enemy[]): void {
    if (!this.alive) {
      return;
    }

    this.lifetime += deltaSeconds;
    this.previousPosition.copy(this.root.position);
    this.root.position.addScaledVector(this.velocity, deltaSeconds);

    if (this.lifetime >= this.maxLifetime) {
      this.alive = false;
      return;
    }

    for (const enemy of enemies) {
      if (!enemy.alive) {
        continue;
      }

      if (distancePointToSegment2D(enemy.root.position, this.previousPosition, this.root.position) <= enemy.radius + GAME_CONFIG.projectileHitRadius) {
        enemy.damage(this.damage);
        this.hitEnemy = enemy;
        this.alive = false;
        return;
      }
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.disposeMaterial(this.mesh.material);
    for (const child of this.root.children) {
      const mesh = child as THREE.Mesh;

      if (mesh !== this.mesh) {
        mesh.geometry?.dispose();
        this.disposeMaterial(mesh.material);
      }
    }
  }

  private disposeMaterial(material: THREE.Material | THREE.Material[]): void {
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material.dispose();
    }
  }
}

function distancePointToSegment2D(point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3): number {
  const segmentX = end.x - start.x;
  const segmentZ = end.z - start.z;
  const lengthSq = segmentX * segmentX + segmentZ * segmentZ;

  if (lengthSq <= 0.00001) {
    return Math.hypot(point.x - start.x, point.z - start.z);
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * segmentX + (point.z - start.z) * segmentZ) / lengthSq));
  const closestX = start.x + segmentX * t;
  const closestZ = start.z + segmentZ * t;
  return Math.hypot(point.x - closestX, point.z - closestZ);
}
