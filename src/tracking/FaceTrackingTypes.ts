import type { NormalizedLandmark } from '@mediapipe/face_mesh';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 extends Vec2 {
  z: number;
}

export interface HeadRotation {
  pitch: number;
  yaw: number;
  roll: number;
}

export interface IrisLandmarks {
  left: Vec3[];
  right: Vec3[];
}

export interface BlinkMetrics {
  leftEye: number;
  rightEye: number;
  average: number;
  leftClosed: boolean;
  rightClosed: boolean;
  bothClosed: boolean;
}

export interface FaceTrackingData {
  timestamp: number;
  detected: boolean;
  faceCenter: Vec3;
  headRotation: HeadRotation;
  irisLandmarks: IrisLandmarks;
  blink: BlinkMetrics;
  landmarks: NormalizedLandmark[];
}
