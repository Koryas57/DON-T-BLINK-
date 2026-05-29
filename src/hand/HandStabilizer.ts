import type { NormalizedLandmark } from '@mediapipe/hands';

export interface StabilizedHandFrame {
  landmarks: NormalizedLandmark[];
  confidence: number;
  predicted: boolean;
  smoothing: number;
}

interface OneEuroState {
  value: number;
  derivative: number;
  initialized: boolean;
}

const DEFAULT_FREQUENCY = 60;
const MIN_CUTOFF = 1.12;
const BETA = 0.014;
const DERIVATIVE_CUTOFF = 1.2;
const DEADZONE = 0.0016;
const MAX_STEP = 0.055;
const PREDICTION_MS = 140;

export class HandStabilizer {
  private readonly filters = Array.from({ length: 21 }, () => ({
    x: createState(),
    y: createState(),
    z: createState(),
  }));
  private readonly velocity = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  private readonly stabilized = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  private lastTimestamp = 0;
  private lastSeenAt = 0;
  private confidence = 0;

  update(landmarks: NormalizedLandmark[], qualityConfidence: number, timestamp = performance.now()): StabilizedHandFrame {
    if (landmarks.length < 21) {
      return this.predict(timestamp);
    }

    const deltaSeconds = this.getDeltaSeconds(timestamp);
    this.lastSeenAt = timestamp;
    this.confidence += (qualityConfidence - this.confidence) * 0.18;

    for (let index = 0; index < 21; index += 1) {
      const target = landmarks[index];
      const previous = this.stabilized[index];
      const next = this.stabilized[index];

      next.x = this.filterAxis(this.filters[index].x, previous.x, target.x, deltaSeconds);
      next.y = this.filterAxis(this.filters[index].y, previous.y, target.y, deltaSeconds);
      next.z = this.filterAxis(this.filters[index].z, previous.z, target.z ?? 0, deltaSeconds);

      this.velocity[index].x = (next.x - previous.x) / deltaSeconds;
      this.velocity[index].y = (next.y - previous.y) / deltaSeconds;
      this.velocity[index].z = (next.z - previous.z) / deltaSeconds;
    }

    return {
      landmarks: this.stabilized,
      confidence: this.confidence,
      predicted: false,
      smoothing: MIN_CUTOFF + BETA,
    };
  }

  reset(): void {
    this.lastTimestamp = 0;
    this.lastSeenAt = 0;
    this.confidence = 0;
    for (const filter of this.filters) {
      filter.x.initialized = false;
      filter.y.initialized = false;
      filter.z.initialized = false;
    }
  }

  private predict(timestamp: number): StabilizedHandFrame {
    const lostFor = timestamp - this.lastSeenAt;

    if (this.lastSeenAt === 0 || lostFor > PREDICTION_MS) {
      this.confidence *= 0.7;
      return {
        landmarks: [],
        confidence: this.confidence,
        predicted: false,
        smoothing: 0,
      };
    }

    const deltaSeconds = this.getDeltaSeconds(timestamp);
    const fade = 1 - lostFor / PREDICTION_MS;
    this.confidence *= 0.82;

    for (let index = 0; index < 21; index += 1) {
      this.stabilized[index].x += this.velocity[index].x * deltaSeconds * 0.55 * fade;
      this.stabilized[index].y += this.velocity[index].y * deltaSeconds * 0.55 * fade;
      this.stabilized[index].z += this.velocity[index].z * deltaSeconds * 0.55 * fade;
    }

    return {
      landmarks: this.stabilized,
      confidence: this.confidence,
      predicted: true,
      smoothing: 0.5,
    };
  }

  private filterAxis(state: OneEuroState, current: number, target: number, deltaSeconds: number): number {
    if (!state.initialized) {
      state.value = target;
      state.derivative = 0;
      state.initialized = true;
      return target;
    }

    const clampedTarget = current + clamp(target - current, -MAX_STEP, MAX_STEP);
    const delta = clampedTarget - current;

    if (Math.abs(delta) < DEADZONE) {
      return current;
    }

    const derivative = delta / deltaSeconds;
    const derivativeAlpha = smoothingAlpha(deltaSeconds, DERIVATIVE_CUTOFF);
    state.derivative += (derivative - state.derivative) * derivativeAlpha;

    const cutoff = MIN_CUTOFF + BETA * Math.abs(state.derivative);
    const alpha = smoothingAlpha(deltaSeconds, cutoff);
    state.value += (clampedTarget - state.value) * alpha;

    return state.value;
  }

  private getDeltaSeconds(timestamp: number): number {
    if (this.lastTimestamp === 0) {
      this.lastTimestamp = timestamp;
      return 1 / DEFAULT_FREQUENCY;
    }

    const deltaSeconds = clamp((timestamp - this.lastTimestamp) / 1000, 1 / 120, 1 / 24);
    this.lastTimestamp = timestamp;
    return deltaSeconds;
  }
}

function createState(): OneEuroState {
  return {
    value: 0,
    derivative: 0,
    initialized: false,
  };
}

function smoothingAlpha(deltaSeconds: number, cutoff: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / deltaSeconds);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
