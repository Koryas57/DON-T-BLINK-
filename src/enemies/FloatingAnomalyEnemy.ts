import * as THREE from 'three';
import type { EnemySystemConfig } from './EnemyConfig';
import type { EnemyResources } from './EnemyResources';

export class FloatingAnomalyEnemy {
  private static nextId = 1;

  readonly id = FloatingAnomalyEnemy.nextId++;
  readonly root = new THREE.Group();
  readonly velocity = new THREE.Vector3();
  readonly seed = Math.random() * 1000;

  private readonly body: THREE.Mesh;
  private readonly leftWing: THREE.Mesh;
  private readonly rightWing: THREE.Mesh;
  private readonly leftEdge: THREE.Line;
  private readonly rightEdge: THREE.Line;
  private readonly accent: THREE.Mesh;
  private readonly thermal: THREE.Mesh;
  private readonly thermalMaterial: THREE.MeshBasicMaterial;
  private readonly targetingParticles: THREE.Points;
  private readonly targetingParticleMaterial: THREE.PointsMaterial;
  private readonly baseScale: number;
  private readonly lifetime: number;
  private age = 0;
  private opacity = 0;
  private targetIntensity = 0;
  private heat = 0;
  private destroyed = false;

  constructor(
    resources: EnemyResources,
    private readonly config: EnemySystemConfig,
  ) {
    this.body = new THREE.Mesh(resources.bodyGeometry, resources.bodyMaterial);
    this.leftWing = new THREE.Mesh(resources.wingGeometry, resources.wingMaterial);
    this.rightWing = new THREE.Mesh(resources.wingGeometry, resources.wingMaterial);
    this.leftEdge = new THREE.Line(resources.wingEdgeGeometry, resources.edgeMaterial);
    this.rightEdge = new THREE.Line(resources.wingEdgeGeometry, resources.edgeMaterial);
    this.accent = new THREE.Mesh(resources.accentGeometry, resources.accentMaterial);
    this.thermalMaterial = new THREE.MeshBasicMaterial({
      color: 0xff315c,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.thermal = new THREE.Mesh(resources.thermalGeometry, this.thermalMaterial);
    this.targetingParticleMaterial = new THREE.PointsMaterial({
      color: 0x88fbff,
      size: 0.035,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.targetingParticles = new THREE.Points(resources.targetingParticleGeometry, this.targetingParticleMaterial);

    this.rightWing.scale.x = -1;
    this.rightEdge.scale.x = -1;
    this.leftWing.position.set(-0.08, 0, 0.02);
    this.rightWing.position.set(0.08, 0, 0.02);
    this.leftEdge.position.copy(this.leftWing.position);
    this.rightEdge.position.copy(this.rightWing.position);
    this.accent.position.set(0, 0.025, 0.36);
    this.thermal.position.set(0, 0, 0.08);

    this.root.add(
      this.thermal,
      this.targetingParticles,
      this.leftWing,
      this.rightWing,
      this.leftEdge,
      this.rightEdge,
      this.body,
      this.accent,
    );
    this.baseScale = THREE.MathUtils.lerp(config.baseScaleMin, config.baseScaleMax, Math.random());
    this.lifetime = THREE.MathUtils.lerp(config.minLifetime, config.maxLifetime, Math.random());
    this.root.scale.setScalar(this.baseScale);
    this.respawn();
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  get expired(): boolean {
    return this.age >= this.lifetime;
  }

  get readyToExplode(): boolean {
    return !this.destroyed && this.heat >= 1;
  }

  get heatIntensity(): number {
    return this.heat;
  }

  get targetingIntensity(): number {
    return this.targetIntensity;
  }

  setTargeting(active: boolean, deltaSeconds: number): void {
    this.targetIntensity = THREE.MathUtils.damp(this.targetIntensity, active ? 1 : 0, active ? 2.6 : 2.7, deltaSeconds);
    const stableLock = active && this.targetIntensity > 0.52;
    const heatTarget = stableLock ? 1.08 : 0;
    this.heat = THREE.MathUtils.damp(this.heat, heatTarget, stableLock ? 0.46 : 0.72, deltaSeconds);
  }

  update(deltaSeconds: number, elapsedSeconds: number, neighbors: FloatingAnomalyEnemy[]): void {
    this.age += deltaSeconds;
    this.opacity = Math.min(1, Math.min(this.age * 1.8, (this.lifetime - this.age) * 1.35));

    const desired = this.getFlowField(elapsedSeconds);
    desired.add(this.getFlockingForce(neighbors));
    desired.multiplyScalar(deltaSeconds);

    this.velocity.add(desired);
    this.velocity.multiplyScalar(0.975);
    this.velocity.clampLength(0.02, this.config.driftSpeed);
    this.position.addScaledVector(this.velocity, deltaSeconds);

    const flap = Math.sin(elapsedSeconds * (5.2 + this.seed * 0.003) + this.seed) * 0.34;
    const preExplosionShake = this.heat * this.heat;
    const twitch = Math.sin(elapsedSeconds * (17.0 + preExplosionShake * 42) + this.seed * 3.1) * (0.055 + preExplosionShake * 0.16);
    const breathe = 1 + Math.sin(elapsedSeconds * 1.9 + this.seed) * 0.045;

    this.root.scale.setScalar(this.baseScale * breathe * this.opacity * (1 + this.heat * 0.12));
    const driftRoll = Math.atan2(this.velocity.y, this.velocity.x) * 0.16;
    this.root.rotation.set(
      Math.sin(elapsedSeconds * (0.73 + preExplosionShake * 9) + this.seed) * (0.18 + preExplosionShake * 0.16),
      Math.cos(elapsedSeconds * (0.61 + preExplosionShake * 7) + this.seed * 0.4) * (0.22 + preExplosionShake * 0.18),
      driftRoll + twitch,
    );
    this.leftWing.rotation.set(0.08 + flap, -0.18, -0.32 - flap * 0.35);
    this.rightWing.rotation.set(0.08 - flap, 0.18, 0.32 + flap * 0.35);
    this.leftEdge.rotation.copy(this.leftWing.rotation);
    this.rightEdge.rotation.copy(this.rightWing.rotation);
    this.accent.scale.setScalar(0.85 + Math.abs(flap) * 1.7 + this.targetIntensity * 1.8 + this.heat * 2.8);
    this.thermal.rotation.z = elapsedSeconds * 1.4 + this.seed;
    this.thermal.scale.setScalar(0.56 + this.targetIntensity * 0.52 + this.heat * 1.2 + Math.abs(flap) * 0.1);
    this.thermalMaterial.opacity = Math.min(0.68, this.targetIntensity * 0.2 + this.heat * 0.48);
    this.targetingParticles.rotation.z = -elapsedSeconds * 1.8 + this.seed;
    this.targetingParticles.scale.setScalar(0.65 + this.targetIntensity * 0.7 + this.heat * 1.2);
    this.targetingParticleMaterial.opacity = Math.min(0.95, this.targetIntensity * 0.48 + this.heat * 0.55);
    this.targetingParticleMaterial.size = 0.035 + this.heat * 0.035;
  }

  markDestroyed(): void {
    this.destroyed = true;
  }

  dispose(parent: THREE.Group): void {
    parent.remove(this.root);
    this.thermalMaterial.dispose();
    this.targetingParticleMaterial.dispose();
  }

  private respawn(): void {
    this.root.position.set(
      THREE.MathUtils.randFloatSpread(this.config.spawnRadiusX * 2),
      THREE.MathUtils.randFloatSpread(this.config.spawnRadiusY),
      THREE.MathUtils.lerp(this.config.depthMin, this.config.depthMax, Math.random()),
    );
    this.velocity.set(THREE.MathUtils.randFloatSpread(0.16), THREE.MathUtils.randFloatSpread(0.1), 0);
  }

  private getFlowField(elapsedSeconds: number): THREE.Vector3 {
    const time = elapsedSeconds * 0.32;
    const x = Math.sin(time + this.seed) * 0.34;
    const y = Math.cos(time * 1.7 + this.seed * 0.27) * 0.28;
    const z = Math.sin(time * 1.2 + this.position.x * 0.9) * 0.08;
    const towardCenter = this.position.clone().multiplyScalar(-0.035);

    return new THREE.Vector3(x, y, z)
      .multiplyScalar(this.config.disturbance)
      .add(towardCenter);
  }

  private getFlockingForce(neighbors: FloatingAnomalyEnemy[]): THREE.Vector3 {
    const cohesion = new THREE.Vector3();
    const separation = new THREE.Vector3();
    let count = 0;

    for (const neighbor of neighbors) {
      if (neighbor === this) {
        continue;
      }

      const distance = this.position.distanceTo(neighbor.position);
      if (distance > 1.65) {
        continue;
      }

      cohesion.add(neighbor.position);
      separation.add(this.position.clone().sub(neighbor.position).multiplyScalar(1 / Math.max(distance, 0.08)));
      count += 1;
    }

    if (count === 0) {
      return cohesion;
    }

    cohesion.multiplyScalar(1 / count).sub(this.position).multiplyScalar(this.config.cohesion);
    separation.multiplyScalar(this.config.separation / count);

    return cohesion.add(separation);
  }

}
