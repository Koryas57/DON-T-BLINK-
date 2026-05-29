import * as THREE from 'three';
import { Enemy } from './Enemy';

export interface WaveSnapshot {
  wave: number;
  pending: number;
  alive: number;
  remaining: number;
}

export class WaveManager {
  private wave = 0;
  private pending = 0;
  private spawnTimer = 0;
  private spawnInterval = 0.82;
  private interWaveTimer = 1.2;

  update(deltaSeconds: number, aliveEnemies: number, arenaRadius: number): Enemy[] {
    if (this.pending <= 0 && aliveEnemies <= 0) {
      this.interWaveTimer -= deltaSeconds;

      if (this.interWaveTimer <= 0) {
        this.startNextWave();
      }
    }

    const spawned: Enemy[] = [];
    if (this.pending <= 0) {
      return spawned;
    }

    this.spawnTimer -= deltaSeconds;
    while (this.spawnTimer <= 0 && this.pending > 0) {
      spawned.push(this.createEnemy(arenaRadius));
      this.pending -= 1;
      this.spawnTimer += this.spawnInterval;
    }

    return spawned;
  }

  getSnapshot(aliveEnemies: number): WaveSnapshot {
    return {
      wave: this.wave,
      pending: this.pending,
      alive: aliveEnemies,
      remaining: this.pending + aliveEnemies,
    };
  }

  private startNextWave(): void {
    this.wave += 1;
    this.pending = 5 + this.wave * 3;
    this.spawnInterval = Math.max(0.34, 0.86 - this.wave * 0.045);
    this.spawnTimer = 0;
    this.interWaveTimer = 2.2;
  }

  private createEnemy(arenaRadius: number): Enemy {
    const angle = Math.random() * Math.PI * 2;
    const radius = arenaRadius + 0.2;
    const position = new THREE.Vector3(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    return new Enemy(position, this.wave);
  }
}
