export interface EnemySystemConfig {
  maxEnemies: number;
  spawnInterval: number;
  spawnJitter: number;
  minLifetime: number;
  maxLifetime: number;
  spawnRadiusX: number;
  spawnRadiusY: number;
  depthMin: number;
  depthMax: number;
  baseScaleMin: number;
  baseScaleMax: number;
  minSpawnDistance: number;
  driftSpeed: number;
  cohesion: number;
  separation: number;
  disturbance: number;
}

export const DEFAULT_ENEMY_SYSTEM_CONFIG: EnemySystemConfig = {
  maxEnemies: 5,
  spawnInterval: 1.85,
  spawnJitter: 0.95,
  minLifetime: 9,
  maxLifetime: 15,
  spawnRadiusX: 1.55,
  spawnRadiusY: 3.25,
  depthMin: -1.35,
  depthMax: -4.15,
  baseScaleMin: 0.58,
  baseScaleMax: 0.9,
  minSpawnDistance: 1.18,
  driftSpeed: 0.32,
  cohesion: 0.08,
  separation: 0.58,
  disturbance: 0.42,
};
