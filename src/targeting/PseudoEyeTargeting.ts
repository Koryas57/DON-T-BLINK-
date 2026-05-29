import * as THREE from 'three';
import type { FloatingAnomalyEnemy } from '../enemies/FloatingAnomalyEnemy';
import type { AimInput } from '../input/InputMode';
import type { FaceTrackingData, Vec3 } from '../tracking/FaceTrackingTypes';
import { DEFAULT_TARGETING_CONFIG, type TargetingConfig } from './TargetingConfig';

export interface TargetingState {
  aim: THREE.Vector2;
  rawAim: THREE.Vector2;
  targetId: number | null;
  targetIntensity: number;
  confidence: number;
}

const CENTER = new THREE.Vector2(0, 0);

export class PseudoEyeTargeting {
  readonly state: TargetingState = {
    aim: new THREE.Vector2(),
    rawAim: new THREE.Vector2(),
    targetId: null,
    targetIntensity: 0,
    confidence: 0,
  };

  private readonly config: TargetingConfig;
  private readonly projectedPosition = new THREE.Vector3();
  private currentTarget: FloatingAnomalyEnemy | null = null;
  private readonly demoDestruction = new URLSearchParams(window.location.search).has('demoDestruction');

  constructor(config: Partial<TargetingConfig> = {}) {
    this.config = {
      ...DEFAULT_TARGETING_CONFIG,
      ...config,
      sensitivity: getRuntimeSensitivity(config.sensitivity ?? DEFAULT_TARGETING_CONFIG.sensitivity),
    };
  }

  update(
    input: AimInput,
    enemies: FloatingAnomalyEnemy[],
    camera: THREE.Camera,
    deltaSeconds: number,
  ): TargetingState {
    const rawAim = this.demoDestruction ? this.getDemoAim(enemies, camera) : this.getInputAim(input);
    this.state.rawAim.copy(rawAim);
    const inputSmoothing = input.source === 'deathFinger' ? 0.18 : this.config.smoothing;
    this.state.aim.lerp(rawAim, inputSmoothing);
    this.state.confidence = this.demoDestruction ? 1 : input.confidence;

    const target = input.detected || this.demoDestruction ? this.pickTarget(enemies, camera) : null;
    const rise = target ? this.config.feedbackRise : this.config.feedbackFall;

    this.currentTarget = target;
    this.state.targetId = target?.id ?? null;
    this.state.targetIntensity = THREE.MathUtils.damp(
      this.state.targetIntensity,
      target ? 1 : 0,
      rise,
      deltaSeconds,
    );

    return this.state;
  }

  createEyeAimInput(tracking: FaceTrackingData): AimInput {
    if (!tracking.detected) {
      return {
        detected: false,
        aimX: 0,
        aimY: 0,
        confidence: 0,
        source: 'eyeLaser',
      };
    }

    const irisAim = this.getIrisAim(tracking);
    const headAim = new THREE.Vector2(
      tracking.headRotation.yaw * this.config.headInfluence,
      -tracking.headRotation.pitch * this.config.headInfluence,
    );

    const aim = headAim
      .add(irisAim.multiplyScalar(this.config.irisInfluence))
      .multiplyScalar(this.config.sensitivity)
      .clamp(new THREE.Vector2(-0.92, -0.92), new THREE.Vector2(0.92, 0.92));

    return {
      detected: true,
      aimX: aim.x,
      aimY: aim.y,
      confidence: 1,
      source: 'eyeLaser',
    };
  }

  private getIrisAim(tracking: FaceTrackingData): THREE.Vector2 {
    const left = averageIris(tracking.irisLandmarks.left);
    const right = averageIris(tracking.irisLandmarks.right);

    if (!left || !right) {
      return new THREE.Vector2();
    }

    const irisCenter = new THREE.Vector2((left.x + right.x) * 0.5, (left.y + right.y) * 0.5);
    return new THREE.Vector2((irisCenter.x - tracking.faceCenter.x) * 3.2, -(irisCenter.y - tracking.faceCenter.y) * 3.2);
  }

  private pickTarget(enemies: FloatingAnomalyEnemy[], camera: THREE.Camera): FloatingAnomalyEnemy | null {
    let bestEnemy: FloatingAnomalyEnemy | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const enemy of enemies) {
      this.projectedPosition.copy(enemy.position).project(camera);

      if (this.projectedPosition.z < -1 || this.projectedPosition.z > 1) {
        continue;
      }

      const screenPosition = new THREE.Vector2(this.projectedPosition.x, this.projectedPosition.y);
      const distance = screenPosition.distanceTo(this.state.aim);
      const stickyBonus = this.currentTarget === enemy ? this.config.lockStickiness + this.state.confidence * 0.035 : 0;
      const score = distance - stickyBonus - enemy.targetingIntensity * 0.08;

      if (score < bestScore) {
        bestEnemy = enemy;
        bestScore = score;
      }
    }

    const forgivingRadius = this.config.lockRadius + this.state.confidence * 0.035;
    return bestScore <= forgivingRadius ? bestEnemy : null;
  }

  private getDemoAim(enemies: FloatingAnomalyEnemy[], camera: THREE.Camera): THREE.Vector2 {
    const firstEnemy = enemies[0];
    if (!firstEnemy) {
      return CENTER.clone();
    }

    this.projectedPosition.copy(firstEnemy.position).project(camera);
    return new THREE.Vector2(this.projectedPosition.x, this.projectedPosition.y).clamp(
      new THREE.Vector2(-0.82, -0.82),
      new THREE.Vector2(0.82, 0.82),
    );
  }

  private getInputAim(input: AimInput): THREE.Vector2 {
    if (!input.detected) {
      return CENTER.clone();
    }

    return new THREE.Vector2(input.aimX, input.aimY).clamp(
      new THREE.Vector2(-0.94, -0.94),
      new THREE.Vector2(0.94, 0.94),
    );
  }
}

function getRuntimeSensitivity(fallback: number): number {
  const rawValue = new URLSearchParams(window.location.search).get('targetingSensitivity');
  const value = rawValue ? Number.parseFloat(rawValue) : Number.NaN;

  return Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0.55, 2.2) : fallback;
}

function averageIris(points: Vec3[]): Vec3 | null {
  if (points.length === 0) {
    return null;
  }

  return points.reduce(
    (acc, point) => ({
      x: acc.x + point.x / points.length,
      y: acc.y + point.y / points.length,
      z: acc.z + point.z / points.length,
    }),
    { x: 0, y: 0, z: 0 },
  );
}
