import { Hands, type Results } from '@mediapipe/hands';
import type { HandTrackingData } from './HandTrackingTypes';

const INDEX_MCP = 5;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const WRIST = 0;
const PINKY_MCP = 17;
const RING_TIP = 16;
const PINKY_TIP = 20;
const LOST_PREDICTION_MS = 180;
const AIM_DEADZONE = 0.004;
const LANDMARK_DEADZONE = 0.0022;
const MAX_LANDMARK_STEP = 0.075;
const MAX_AIM_STEP = 0.18;
const DEFAULT_HAND_DATA: HandTrackingData = {
  id: 0,
  handedness: 'Unknown',
  timestamp: 0,
  detected: false,
  landmarks: [],
  quality: {
    hint: 'searching',
    usable: false,
    distance: 0,
    framing: 0,
    size: 0,
  },
  controller: {
    confidence: 0,
    positionX: 0,
    positionY: 0,
    depth: 0.5,
    scale: 1,
    pinchStrength: 0,
    pinchStart: false,
    pinchHold: false,
    pinchEnd: false,
    gripActive: false,
    gripStrength: 0,
    predicted: false,
    smoothing: 0,
  },
  aim: {
    detected: false,
    aimX: 0,
    aimY: 0,
    confidence: 0,
    source: 'deathFinger',
  },
};

export class HandTracker {
  private readonly hands: Hands;
  private dataSnapshot: HandTrackingData = DEFAULT_HAND_DATA;
  private isProcessing = false;
  private smoothedAimX = 0;
  private smoothedAimY = 0;
  private smoothedOriginX = 0;
  private smoothedOriginY = 0;
  private previousAimX = 0;
  private previousAimY = 0;
  private aimVelocityX = 0;
  private aimVelocityY = 0;
  private smoothedConfidence = 0;
  private smoothedPinchStrength = 0;
  private smoothedGripStrength = 0;
  private readonly smoothedLandmarks: HandTrackingData['landmarks'] = [];
  private lastSeenAt = 0;
  private wasPinching = false;
  private wasGripActive = false;
  private hasSmoothState = false;

  constructor() {
    this.hands = new Hands({
      locateFile: (file) => `/vendor/mediapipe/hands/${file}`,
    });

    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 0,
      selfieMode: true,
      minDetectionConfidence: 0.62,
      minTrackingConfidence: 0.58,
    });

    this.hands.onResults((results) => this.handleResults(results));
  }

  get data(): HandTrackingData {
    return this.dataSnapshot;
  }

  async process(video: HTMLVideoElement): Promise<void> {
    if (this.isProcessing || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    this.isProcessing = true;

    try {
      await this.hands.send({ image: video });
    } finally {
      this.isProcessing = false;
    }
  }

  dispose(): void {
    this.hands.close();
  }

  private handleResults(results: Results): void {
    const landmarks = results.multiHandLandmarks?.[0] ?? [];
    const now = performance.now();

    if (landmarks.length === 0) {
      this.handleLostTracking(now);
      return;
    }

    const quality = getTrackingQuality(landmarks);
    const smoothing = quality.usable ? 0.18 : 0.1;
    const filteredLandmarks = this.smoothLandmarks(landmarks, smoothing);
    const indexBase = filteredLandmarks[INDEX_MCP];
    const indexTip = filteredLandmarks[INDEX_TIP];
    const thumbTip = filteredLandmarks[THUMB_TIP];
    const middleBase = filteredLandmarks[MIDDLE_MCP];
    const directionX = indexTip.x - indexBase.x;
    const directionY = indexTip.y - indexBase.y;
    const extension = Math.hypot(directionX, directionY);
    const projectedX = indexTip.x + directionX * 0.92;
    const projectedY = indexTip.y + directionY * 0.92;
    const rawAimX = normalizedToNdcX(projectedX);
    const rawAimY = normalizedToNdcY(projectedY);
    const rawOriginX = normalizedToNdcX(indexTip.x);
    const rawOriginY = normalizedToNdcY(indexTip.y);
    const pinchDistance = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
    const handScale = Math.max(0.001, Math.hypot(indexBase.x - middleBase.x, indexBase.y - middleBase.y));
    const pinchRatio = pinchDistance / handScale;
    const rawPinchStrength = 1 - smoothStep(0.74, 1.42, pinchRatio);
    this.smoothedPinchStrength += (rawPinchStrength - this.smoothedPinchStrength) * 0.22;
    const pinchActive = this.smoothedPinchStrength > 0.58;
    const pinchTriggered = pinchActive && !this.wasPinching;
    const pinchEnd = !pinchActive && this.wasPinching;
    const gripStrength = this.getGripStrength(filteredLandmarks);
    const gripActive = gripStrength > 0.62;
    const rawConfidence = Math.min(1, extension * 7.2) * quality.distance * quality.framing;

    this.wasPinching = pinchActive;
    this.wasGripActive = gripActive;
    this.lastSeenAt = now;
    this.smoothAim(rawAimX, rawAimY, rawOriginX, rawOriginY, quality);
    this.smoothedConfidence += (rawConfidence - this.smoothedConfidence) * 0.18;
    this.smoothedGripStrength += (gripStrength - this.smoothedGripStrength) * 0.18;

    this.dataSnapshot = {
      id: 0,
      handedness: 'Unknown',
      timestamp: now,
      detected: true,
      landmarks: filteredLandmarks,
      quality,
      controller: {
        confidence: this.smoothedConfidence,
        positionX: normalizedToNdcX(filteredLandmarks[MIDDLE_MCP].x),
        positionY: normalizedToNdcY(filteredLandmarks[MIDDLE_MCP].y),
        depth: getDepthFromSize(quality.size),
        scale: getScaleFromSize(quality.size),
        pinchStrength: this.smoothedPinchStrength,
        pinchStart: pinchTriggered && quality.usable,
        pinchHold: pinchActive,
        pinchEnd,
        gripActive,
        gripStrength: this.smoothedGripStrength,
        predicted: false,
        smoothing,
      },
      aim: {
        detected: quality.usable,
        aimX: this.smoothedAimX,
        aimY: this.smoothedAimY,
        originX: this.smoothedOriginX,
        originY: this.smoothedOriginY,
        confidence: this.smoothedConfidence,
        pinchActive,
        pinchTriggered: pinchTriggered && quality.usable,
        pinchStrength: this.smoothedPinchStrength,
        pinchStart: pinchTriggered && quality.usable,
        pinchHold: pinchActive,
        pinchEnd,
        gripActive,
        gripStrength: this.smoothedGripStrength,
        source: 'deathFinger',
      },
    };
  }

  private handleLostTracking(now: number): void {
    const lostFor = now - this.lastSeenAt;

    if (this.hasSmoothState && lostFor < LOST_PREDICTION_MS && this.smoothedLandmarks.length > 0) {
      const fade = 1 - lostFor / LOST_PREDICTION_MS;
      this.smoothedAimX = THREEClamp(this.smoothedAimX + this.aimVelocityX * 0.72, -0.98, 0.98);
      this.smoothedAimY = THREEClamp(this.smoothedAimY + this.aimVelocityY * 0.72, -0.98, 0.98);
      this.smoothedConfidence *= 0.82;
      this.smoothedPinchStrength *= 0.86;
      this.smoothedGripStrength *= 0.86;
      this.wasPinching = false;

      this.dataSnapshot = {
        id: 0,
        handedness: 'Unknown',
        timestamp: now,
        detected: true,
        landmarks: this.smoothedLandmarks,
        quality: {
          hint: 'edge',
          usable: false,
          distance: fade,
          framing: fade * 0.45,
          size: this.dataSnapshot.quality.size,
        },
        controller: {
          ...this.dataSnapshot.controller,
          confidence: this.smoothedConfidence,
          pinchStrength: this.smoothedPinchStrength,
          pinchStart: false,
          pinchHold: false,
          pinchEnd: this.dataSnapshot.controller.pinchHold,
          gripActive: false,
          gripStrength: this.smoothedGripStrength,
          predicted: true,
          smoothing: 0.06,
        },
        aim: {
          ...this.dataSnapshot.aim,
          detected: false,
          aimX: this.smoothedAimX,
          aimY: this.smoothedAimY,
          confidence: this.smoothedConfidence,
          pinchActive: false,
          pinchTriggered: false,
          pinchStrength: this.smoothedPinchStrength,
          pinchStart: false,
          pinchHold: false,
          pinchEnd: this.dataSnapshot.aim.pinchHold,
          gripActive: false,
          gripStrength: this.smoothedGripStrength,
          source: 'deathFinger',
        },
      };
      return;
    }

    this.wasPinching = false;
    this.wasGripActive = false;
    this.hasSmoothState = false;
    this.smoothedConfidence *= 0.65;
    this.dataSnapshot = { ...DEFAULT_HAND_DATA, timestamp: now };
  }

  private smoothLandmarks(landmarks: HandTrackingData['landmarks'], alpha: number): HandTrackingData['landmarks'] {
    if (!this.hasSmoothState || this.smoothedLandmarks.length !== landmarks.length) {
      this.smoothedLandmarks.length = 0;
      this.smoothedLandmarks.push(...landmarks.map((point) => ({ ...point })));
      return this.smoothedLandmarks;
    }

    for (let index = 0; index < landmarks.length; index += 1) {
      this.smoothedLandmarks[index].x = smoothDeadzoneClamped(this.smoothedLandmarks[index].x, landmarks[index].x, alpha, LANDMARK_DEADZONE, MAX_LANDMARK_STEP);
      this.smoothedLandmarks[index].y = smoothDeadzoneClamped(this.smoothedLandmarks[index].y, landmarks[index].y, alpha, LANDMARK_DEADZONE, MAX_LANDMARK_STEP);
      this.smoothedLandmarks[index].z = smoothDeadzoneClamped(this.smoothedLandmarks[index].z ?? 0, landmarks[index].z ?? 0, alpha, LANDMARK_DEADZONE, MAX_LANDMARK_STEP);
    }

    return this.smoothedLandmarks;
  }

  private smoothAim(aimX: number, aimY: number, originX: number, originY: number, quality: HandTrackingData['quality']): void {
    if (!this.hasSmoothState) {
      this.smoothedAimX = aimX;
      this.smoothedAimY = aimY;
      this.smoothedOriginX = originX;
      this.smoothedOriginY = originY;
      this.previousAimX = aimX;
      this.previousAimY = aimY;
      this.hasSmoothState = true;
      return;
    }

    const alpha = quality.usable ? 0.14 : 0.065;
    const nextAimX = smoothDeadzoneClamped(this.smoothedAimX, aimX, alpha, AIM_DEADZONE, MAX_AIM_STEP);
    const nextAimY = smoothDeadzoneClamped(this.smoothedAimY, aimY, alpha, AIM_DEADZONE, MAX_AIM_STEP);
    this.aimVelocityX = nextAimX - this.previousAimX;
    this.aimVelocityY = nextAimY - this.previousAimY;
    this.previousAimX = nextAimX;
    this.previousAimY = nextAimY;
    this.smoothedAimX = nextAimX;
    this.smoothedAimY = nextAimY;
    this.smoothedOriginX += (originX - this.smoothedOriginX) * alpha;
    this.smoothedOriginY += (originY - this.smoothedOriginY) * alpha;
  }

  private getGripStrength(landmarks: HandTrackingData['landmarks']): number {
    const palm = landmarks[MIDDLE_MCP];
    const handScale = Math.max(0.001, Math.hypot(landmarks[INDEX_MCP].x - landmarks[PINKY_MCP].x, landmarks[INDEX_MCP].y - landmarks[PINKY_MCP].y));
    const indexCurl = 1 - THREEClamp(Math.hypot(landmarks[INDEX_TIP].x - palm.x, landmarks[INDEX_TIP].y - palm.y) / (handScale * 1.45), 0, 1);
    const ringCurl = 1 - THREEClamp(Math.hypot(landmarks[RING_TIP].x - palm.x, landmarks[RING_TIP].y - palm.y) / (handScale * 1.35), 0, 1);
    const pinkyCurl = 1 - THREEClamp(Math.hypot(landmarks[PINKY_TIP].x - palm.x, landmarks[PINKY_TIP].y - palm.y) / (handScale * 1.35), 0, 1);

    return THREEClamp((indexCurl + ringCurl + pinkyCurl) / 3, 0, 1);
  }
}

function getTrackingQuality(landmarks: HandTrackingData['landmarks']): HandTrackingData['quality'] {
  const xs = landmarks.map((point) => point.x);
  const ys = landmarks.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const span = Math.max(width, height);
  const edgeMargin = Math.min(minX, minY, 1 - maxX, 1 - maxY);
  const palmSpan = Math.hypot(landmarks[INDEX_MCP].x - landmarks[PINKY_MCP].x, landmarks[INDEX_MCP].y - landmarks[PINKY_MCP].y);
  const wristToMiddle = Math.hypot(landmarks[WRIST].x - landmarks[MIDDLE_MCP].x, landmarks[WRIST].y - landmarks[MIDDLE_MCP].y);
  const stableSize = Math.max(span, palmSpan * 2.05, wristToMiddle * 1.5);
  const tooFar = stableSize < 0.13;
  const tooClose = stableSize > 0.92;
  const nearEdge = edgeMargin < 0.045;
  const distance = smoothBand(stableSize, 0.13, 0.24, 0.68, 0.95);
  const framing = THREEClamp((edgeMargin + 0.08) / 0.165, 0.32, 1);

  return {
    hint: nearEdge ? 'edge' : tooFar ? 'tooFar' : tooClose ? 'tooClose' : 'good',
    usable: !tooFar && !tooClose,
    distance,
    framing,
    size: stableSize,
  };
}

function smoothDeadzoneClamped(current: number, target: number, alpha: number, deadzone: number, maxStep: number): number {
  const delta = target - current;

  if (Math.abs(delta) < deadzone) {
    return current;
  }

  return current + THREEClamp(delta, -maxStep, maxStep) * alpha;
}

function smoothStep(edge0: number, edge1: number, value: number): number {
  const x = THREEClamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function getDepthFromSize(size: number): number {
  return 1 - THREEClamp((size - 0.16) / 0.64, 0, 1);
}

function getScaleFromSize(size: number): number {
  return THREEClamp(1.08 - (size - 0.3) * 0.2, 0.88, 1.16);
}

function smoothBand(value: number, min: number, goodMin: number, goodMax: number, max: number): number {
  if (value < min || value > max) {
    return 0;
  }

  if (value >= goodMin && value <= goodMax) {
    return 1;
  }

  if (value < goodMin) {
    return (value - min) / (goodMin - min);
  }

  return (max - value) / (max - goodMax);
}

function THREEClamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizedToNdcX(value: number): number {
  return (value - 0.5) * 2;
}

function normalizedToNdcY(value: number): number {
  return -(value - 0.5) * 2;
}
