import { Hands, type Results } from '@mediapipe/hands';
import type { Handedness, HandTrackingData } from '../tracking/HandTrackingTypes';
import { HandStabilizer } from './HandStabilizer';

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const RING_TIP = 16;
const PINKY_MCP = 17;
const PINKY_TIP = 20;

const EMPTY_HAND_DATA: HandTrackingData = {
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

export class HandTrackingService {
  private readonly hands: Hands;
  private readonly stabilizers = [new HandStabilizer(), new HandStabilizer()];
  private dataSnapshot: HandTrackingData = EMPTY_HAND_DATA;
  private handsSnapshot: HandTrackingData[] = [];
  private isProcessing = false;
  private readonly wasPinching = [false, false];

  constructor() {
    this.hands = new Hands({
      locateFile: (file) => `/vendor/mediapipe/hands/${file}`,
    });

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      selfieMode: true,
      minDetectionConfidence: 0.64,
      minTrackingConfidence: 0.6,
    });

    this.hands.onResults((results) => this.handleResults(results));
  }

  get data(): HandTrackingData {
    return this.dataSnapshot;
  }

  get handsData(): HandTrackingData[] {
    return this.handsSnapshot;
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
    const now = performance.now();
    const rawHands = results.multiHandLandmarks ?? [];
    const handedness = getHandedness(results);
    const nextHands: HandTrackingData[] = [];

    for (let index = 0; index < this.stabilizers.length; index += 1) {
      const rawLandmarks = rawHands[index] ?? [];
      const rawQuality = rawLandmarks.length >= 21 ? getTrackingQuality(rawLandmarks) : EMPTY_HAND_DATA.quality;
      const stabilized = this.stabilizers[index].update(rawLandmarks, rawQuality.distance * rawQuality.framing, now);
      const hand = this.createHandData(index, handedness[index] ?? 'Unknown', rawLandmarks, rawQuality, stabilized, now);

      if (hand.detected) {
        nextHands.push(hand);
      }
    }

    this.handsSnapshot = nextHands;
    this.dataSnapshot = nextHands[0] ?? {
      ...EMPTY_HAND_DATA,
      timestamp: now,
    };
  }

  private createHandData(
    id: number,
    handedness: Handedness,
    rawLandmarks: HandTrackingData['landmarks'],
    rawQuality: HandTrackingData['quality'],
    stabilized: ReturnType<HandStabilizer['update']>,
    now: number,
  ): HandTrackingData {
    if (stabilized.landmarks.length < 21) {
      this.wasPinching[id] = false;
      return {
        ...EMPTY_HAND_DATA,
        id,
        handedness,
        timestamp: now,
        controller: {
          ...EMPTY_HAND_DATA.controller,
          confidence: stabilized.confidence,
          predicted: stabilized.predicted,
          smoothing: stabilized.smoothing,
        },
      };
    }

    const landmarks = stabilized.landmarks;
    const quality = rawLandmarks.length >= 21 ? rawQuality : {
      ...rawQuality,
      hint: 'edge' as const,
      usable: false,
      distance: stabilized.confidence,
      framing: 0.35,
    };
    const indexTip = landmarks[INDEX_TIP];
    const indexMcp = landmarks[INDEX_MCP];
    const thumbTip = landmarks[THUMB_TIP];
    const middleMcp = landmarks[MIDDLE_MCP];
    const pinchStrength = getPinchStrength(landmarks);
    const pinchHold = pinchStrength > 0.58;
    const pinchStart = pinchHold && !this.wasPinching[id];
    const pinchEnd = !pinchHold && this.wasPinching[id];
    const gripStrength = getGripStrength(landmarks);
    const directionX = indexTip.x - indexMcp.x;
    const directionY = indexTip.y - indexMcp.y;
    const aimX = normalizedToNdcX(indexTip.x + directionX * 0.9);
    const aimY = normalizedToNdcY(indexTip.y + directionY * 0.9);

    this.wasPinching[id] = pinchHold;
    return {
      id,
      handedness,
      timestamp: now,
      detected: true,
      landmarks,
      quality,
      controller: {
        confidence: stabilized.confidence,
        positionX: normalizedToNdcX(middleMcp.x),
        positionY: normalizedToNdcY(middleMcp.y),
        depth: getDepthFromSize(quality.size),
        scale: getScaleFromSize(quality.size),
        pinchStrength,
        pinchStart,
        pinchHold,
        pinchEnd,
        gripActive: gripStrength > 0.62,
        gripStrength,
        predicted: stabilized.predicted,
        smoothing: stabilized.smoothing,
      },
      aim: {
        detected: quality.usable,
        aimX,
        aimY,
        originX: normalizedToNdcX(indexTip.x),
        originY: normalizedToNdcY(indexTip.y),
        confidence: stabilized.confidence,
        pinchActive: pinchHold,
        pinchTriggered: pinchStart,
        pinchStrength,
        pinchStart,
        pinchHold,
        pinchEnd,
        gripActive: gripStrength > 0.62,
        gripStrength,
        source: 'deathFinger',
      },
    };
  }
}

function getHandedness(results: Results): Handedness[] {
  const raw = (results as unknown as { multiHandedness?: Array<{ label?: string }> }).multiHandedness ?? [];

  return raw.map((entry) => {
    if (entry.label === 'Left' || entry.label === 'Right') {
      return entry.label;
    }

    return 'Unknown';
  });
}

function getTrackingQuality(landmarks: HandTrackingData['landmarks']): HandTrackingData['quality'] {
  const xs = landmarks.map((point) => point.x);
  const ys = landmarks.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY);
  const palmSpan = Math.hypot(landmarks[INDEX_MCP].x - landmarks[PINKY_MCP].x, landmarks[INDEX_MCP].y - landmarks[PINKY_MCP].y);
  const wristToMiddle = Math.hypot(landmarks[WRIST].x - landmarks[MIDDLE_MCP].x, landmarks[WRIST].y - landmarks[MIDDLE_MCP].y);
  const stableSize = Math.max(span, palmSpan * 2.05, wristToMiddle * 1.5);
  const edgeMargin = Math.min(minX, minY, 1 - maxX, 1 - maxY);
  const tooFar = stableSize < 0.11;
  const tooClose = stableSize > 0.96;
  const nearEdge = edgeMargin < 0.035;

  return {
    hint: nearEdge ? 'edge' : tooFar ? 'tooFar' : tooClose ? 'tooClose' : 'good',
    usable: !tooFar && !tooClose,
    distance: smoothBand(stableSize, 0.11, 0.24, 0.7, 0.98),
    framing: clamp((edgeMargin + 0.08) / 0.16, 0.28, 1),
    size: stableSize,
  };
}

function getPinchStrength(landmarks: HandTrackingData['landmarks']): number {
  const handScale = Math.max(0.001, Math.hypot(landmarks[INDEX_MCP].x - landmarks[MIDDLE_MCP].x, landmarks[INDEX_MCP].y - landmarks[MIDDLE_MCP].y));
  const pinchDistance = Math.hypot(landmarks[INDEX_TIP].x - landmarks[THUMB_TIP].x, landmarks[INDEX_TIP].y - landmarks[THUMB_TIP].y);
  return 1 - smoothStep(0.74, 1.42, pinchDistance / handScale);
}

function getGripStrength(landmarks: HandTrackingData['landmarks']): number {
  const palm = landmarks[MIDDLE_MCP];
  const handScale = Math.max(0.001, Math.hypot(landmarks[INDEX_MCP].x - landmarks[PINKY_MCP].x, landmarks[INDEX_MCP].y - landmarks[PINKY_MCP].y));
  const indexCurl = 1 - clamp(Math.hypot(landmarks[INDEX_TIP].x - palm.x, landmarks[INDEX_TIP].y - palm.y) / (handScale * 1.45), 0, 1);
  const ringCurl = 1 - clamp(Math.hypot(landmarks[RING_TIP].x - palm.x, landmarks[RING_TIP].y - palm.y) / (handScale * 1.35), 0, 1);
  const pinkyCurl = 1 - clamp(Math.hypot(landmarks[PINKY_TIP].x - palm.x, landmarks[PINKY_TIP].y - palm.y) / (handScale * 1.35), 0, 1);

  return clamp((indexCurl + ringCurl + pinkyCurl) / 3, 0, 1);
}

function getDepthFromSize(size: number): number {
  return 1 - clamp((size - 0.14) / 0.58, 0, 1);
}

function getScaleFromSize(size: number): number {
  return clamp(1.04 - (size - 0.3) * 0.18, 0.9, 1.1);
}

function smoothBand(value: number, min: number, goodMin: number, goodMax: number, max: number): number {
  if (value < min || value > max) {
    return 0;
  }

  if (value >= goodMin && value <= goodMax) {
    return 1;
  }

  return value < goodMin ? (value - min) / (goodMin - min) : (max - value) / (max - goodMax);
}

function smoothStep(edge0: number, edge1: number, value: number): number {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function normalizedToNdcX(value: number): number {
  return (value - 0.5) * 2;
}

function normalizedToNdcY(value: number): number {
  return -(value - 0.5) * 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
