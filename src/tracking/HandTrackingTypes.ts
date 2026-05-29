import type { NormalizedLandmark } from '@mediapipe/hands';
import type { AimInput } from '../input/InputMode';

export interface HandTrackingData {
  id: number;
  handedness: Handedness;
  timestamp: number;
  detected: boolean;
  landmarks: NormalizedLandmark[];
  quality: HandTrackingQuality;
  controller: HandControllerState;
  aim: AimInput;
}

export type Handedness = 'Left' | 'Right' | 'Unknown';
export type HandTrackingHint = 'searching' | 'good' | 'tooClose' | 'tooFar' | 'edge';

export interface HandTrackingQuality {
  hint: HandTrackingHint;
  usable: boolean;
  distance: number;
  framing: number;
  size: number;
}

export interface HandControllerState {
  confidence: number;
  positionX: number;
  positionY: number;
  depth: number;
  scale: number;
  pinchStrength: number;
  pinchStart: boolean;
  pinchHold: boolean;
  pinchEnd: boolean;
  gripActive: boolean;
  gripStrength: number;
  predicted: boolean;
  smoothing: number;
}
