import * as THREE from 'three';
import { DEFAULT_ENEMY_SYSTEM_CONFIG, type EnemySystemConfig } from './EnemyConfig';
import { EnemyResources } from './EnemyResources';
import { ExplosionEffect } from './ExplosionEffect';
import { FloatingAnomalyEnemy } from './FloatingAnomalyEnemy';

export interface ComboState {
  score: number;
  combo: number;
  multiplier: number;
  escalatingIntensity: number;
  flash: number;
  distortion: number;
}

export class EnemyManager {
  readonly root = new THREE.Group();

  private readonly config: EnemySystemConfig;
  private readonly resources = new EnemyResources();
  private readonly enemies: FloatingAnomalyEnemy[] = [];
  private readonly explosions: ExplosionEffect[] = [];
  private nextSpawnAt = 0;
  private lastElapsed = 0;
  private comboTimer = 0;
  private flash = 0;
  private distortion = 0;
  private score = 0;
  private combo = 0;

  constructor(config: Partial<EnemySystemConfig> = {}) {
    this.config = { ...DEFAULT_ENEMY_SYSTEM_CONFIG, ...config };
  }

  get activeEnemies(): readonly FloatingAnomalyEnemy[] {
    return this.enemies;
  }

  get comboState(): ComboState {
    return {
      score: this.score,
      combo: this.combo,
      multiplier: this.multiplier,
      escalatingIntensity: Math.min(1, this.combo / 8),
      flash: this.flash,
      distortion: this.distortion,
    };
  }

  update(elapsedSeconds: number, targetId: number | null): void {
    const deltaSeconds = Math.min(0.05, Math.max(0.001, elapsedSeconds - this.lastElapsed));
    this.lastElapsed = elapsedSeconds;
    this.comboTimer = Math.max(0, this.comboTimer - deltaSeconds);
    if (this.comboTimer === 0) {
      this.combo = 0;
    }
    this.flash = THREE.MathUtils.damp(this.flash, 0, 4.8, deltaSeconds);
    this.distortion = THREE.MathUtils.damp(this.distortion, 0, 3.2, deltaSeconds);

    if (elapsedSeconds >= this.nextSpawnAt && this.enemies.length < this.config.maxEnemies) {
      this.spawn(elapsedSeconds);
    }

    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index];
      enemy.setTargeting(enemy.id === targetId, deltaSeconds);
      enemy.update(deltaSeconds, elapsedSeconds, this.enemies);

      if (enemy.readyToExplode) {
        this.destroyEnemy(enemy, index);
      } else if (enemy.expired) {
        enemy.dispose(this.root);
        this.enemies.splice(index, 1);
      }
    }

    for (let index = this.explosions.length - 1; index >= 0; index -= 1) {
      const explosion = this.explosions[index];
      explosion.update(deltaSeconds);

      if (explosion.finished) {
        explosion.dispose(this.root);
        this.explosions.splice(index, 1);
      }
    }
  }

  dispose(): void {
    for (const enemy of this.enemies) {
      enemy.dispose(this.root);
    }
    for (const explosion of this.explosions) {
      explosion.dispose(this.root);
    }

    this.enemies.length = 0;
    this.explosions.length = 0;
    this.resources.dispose();
  }

  destroyTarget(targetId: number | null): void {
    if (targetId === null) {
      return;
    }

    const index = this.enemies.findIndex((enemy) => enemy.id === targetId);
    if (index === -1) {
      return;
    }

    this.destroyEnemy(this.enemies[index], index, 1.35);
  }

  private get multiplier(): number {
    return Math.min(6, 1 + Math.floor(Math.max(0, this.combo - 1) / 3) * 0.5);
  }

  private spawn(elapsedSeconds: number): void {
    let enemy = new FloatingAnomalyEnemy(this.resources, this.config);

    for (let attempt = 0; attempt < 8 && !this.hasClearSpawn(enemy); attempt += 1) {
      enemy.dispose(this.root);
      enemy = new FloatingAnomalyEnemy(this.resources, this.config);
    }

    this.enemies.push(enemy);
    this.root.add(enemy.root);
    this.nextSpawnAt =
      elapsedSeconds +
      this.config.spawnInterval +
      THREE.MathUtils.randFloatSpread(this.config.spawnJitter);
  }

  private hasClearSpawn(candidate: FloatingAnomalyEnemy): boolean {
    return this.enemies.every((enemy) => enemy.position.distanceTo(candidate.position) >= this.config.minSpawnDistance);
  }

  private destroyEnemy(enemy: FloatingAnomalyEnemy, index: number, forceMultiplier = 1): void {
    enemy.markDestroyed();
    const intensity = (1 + Math.min(1.4, this.combo * 0.16)) * forceMultiplier;
    const explosion = new ExplosionEffect(enemy.position.clone(), intensity);
    this.explosions.push(explosion);
    this.root.add(explosion.root);

    this.combo += 1;
    this.comboTimer = 2.15;
    this.score += Math.round(100 * this.multiplier);
    this.flash = Math.min(1, 0.78 + this.combo * 0.035);
    this.distortion = Math.min(1, 0.46 + this.combo * 0.045);

    enemy.dispose(this.root);
    this.enemies.splice(index, 1);
  }
}
