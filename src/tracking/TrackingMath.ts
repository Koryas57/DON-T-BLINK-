import type { NormalizedLandmark } from '@mediapipe/face_mesh';
import type { BlinkMetrics, FaceTrackingData, HeadRotation, IrisLandmarks, Vec3 } from './FaceTrackingTypes';

const LEFT_EYE = {
  outer: 33,
  inner: 133,
  upperA: 159,
  lowerA: 145,
  upperB: 158,
  lowerB: 153,
};

const RIGHT_EYE = {
  outer: 263,
  inner: 362,
  upperA: 386,
  lowerA: 374,
  upperB: 385,
  lowerB: 380,
};

const BLINK_THRESHOLD = 0.2;
const LEFT_IRIS = [468, 469, 470, 471, 472];
const RIGHT_IRIS = [473, 474, 475, 476, 477];

export function createEmptyTrackingData(timestamp = performance.now()): FaceTrackingData {
  return {
    timestamp,
    detected: false,
    faceCenter: { x: 0.5, y: 0.5, z: 0 },
    headRotation: { pitch: 0, yaw: 0, roll: 0 },
    irisLandmarks: { left: [], right: [] },
    blink: {
      leftEye: 1,
      rightEye: 1,
      average: 1,
      leftClosed: false,
      rightClosed: false,
      bothClosed: false,
    },
    landmarks: [],
  };
}

export function buildTrackingData(landmarks: NormalizedLandmark[], timestamp = performance.now()): FaceTrackingData {
  const faceCenter = averageLandmarks(landmarks, [1, 10, 152, 234, 454]);
  const headRotation = estimateHeadRotation(landmarks);
  const irisLandmarks = pickIrisLandmarks(landmarks);
  const blink = calculateBlinkMetrics(landmarks);

  return {
    timestamp,
    detected: true,
    faceCenter,
    headRotation,
    irisLandmarks,
    blink,
    landmarks,
  };
}

export function smoothTrackingData(previous: FaceTrackingData | null, next: FaceTrackingData, alpha = 0.34): FaceTrackingData {
  if (!previous || !next.detected) {
    return next;
  }

  return {
    ...next,
    faceCenter: lerpVec3(previous.faceCenter, next.faceCenter, alpha),
    headRotation: {
      pitch: lerp(previous.headRotation.pitch, next.headRotation.pitch, alpha),
      yaw: lerp(previous.headRotation.yaw, next.headRotation.yaw, alpha),
      roll: lerpAngle(previous.headRotation.roll, next.headRotation.roll, alpha),
    },
    irisLandmarks: {
      left: smoothLandmarkList(previous.irisLandmarks.left, next.irisLandmarks.left, alpha),
      right: smoothLandmarkList(previous.irisLandmarks.right, next.irisLandmarks.right, alpha),
    },
    blink: {
      ...next.blink,
      leftEye: lerp(previous.blink.leftEye, next.blink.leftEye, alpha),
      rightEye: lerp(previous.blink.rightEye, next.blink.rightEye, alpha),
      average: lerp(previous.blink.average, next.blink.average, alpha),
    },
  };
}

function estimateHeadRotation(landmarks: NormalizedLandmark[]): HeadRotation {
  const nose = landmarks[1];
  const chin = landmarks[152];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const mouth = landmarks[13];
  const faceMidX = (leftEye.x + rightEye.x) * 0.5;
  const eyeMidY = (leftEye.y + rightEye.y) * 0.5;
  const faceHeight = Math.max(distance(leftEye, chin), 0.001);
  const eyeDistance = Math.max(distance(leftEye, rightEye), 0.001);

  return {
    pitch: ((nose.y - eyeMidY) / faceHeight - 0.23) * 2.6 + (mouth.y - nose.y) * 0.2,
    yaw: ((nose.x - faceMidX) / eyeDistance) * 1.8,
    roll: Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x),
  };
}

function calculateBlinkMetrics(landmarks: NormalizedLandmark[]): BlinkMetrics {
  const leftEye = eyeAspectRatio(landmarks, LEFT_EYE);
  const rightEye = eyeAspectRatio(landmarks, RIGHT_EYE);
  const average = (leftEye + rightEye) * 0.5;

  return {
    leftEye,
    rightEye,
    average,
    leftClosed: leftEye < BLINK_THRESHOLD,
    rightClosed: rightEye < BLINK_THRESHOLD,
    bothClosed: leftEye < BLINK_THRESHOLD && rightEye < BLINK_THRESHOLD,
  };
}

function eyeAspectRatio(landmarks: NormalizedLandmark[], eye: typeof LEFT_EYE): number {
  const verticalA = distance(landmarks[eye.upperA], landmarks[eye.lowerA]);
  const verticalB = distance(landmarks[eye.upperB], landmarks[eye.lowerB]);
  const horizontal = Math.max(distance(landmarks[eye.outer], landmarks[eye.inner]), 0.001);

  return (verticalA + verticalB) / (2 * horizontal);
}

function pickIrisLandmarks(landmarks: NormalizedLandmark[]): IrisLandmarks {
  return {
    left: LEFT_IRIS.map((index) => toVec3(landmarks[index])).filter(isVec3),
    right: RIGHT_IRIS.map((index) => toVec3(landmarks[index])).filter(isVec3),
  };
}

function averageLandmarks(landmarks: NormalizedLandmark[], indices: number[]): Vec3 {
  const points = indices.map((index) => landmarks[index]).filter(Boolean);
  const total = points.reduce(
    (acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y,
      z: acc.z + point.z,
    }),
    { x: 0, y: 0, z: 0 },
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
    z: total.z / points.length,
  };
}

function smoothLandmarkList(previous: Vec3[], next: Vec3[], alpha: number): Vec3[] {
  if (previous.length !== next.length) {
    return next;
  }

  return next.map((point, index) => lerpVec3(previous[index], point, alpha));
}

function toVec3(point: NormalizedLandmark | undefined): Vec3 | null {
  return point ? { x: point.x, y: point.y, z: point.z } : null;
}

function isVec3(point: Vec3 | null): point is Vec3 {
  return point !== null;
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}

function lerpAngle(a: number, b: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * alpha;
}

function lerpVec3(a: Vec3, b: Vec3, alpha: number): Vec3 {
  return {
    x: lerp(a.x, b.x, alpha),
    y: lerp(a.y, b.y, alpha),
    z: lerp(a.z, b.z, alpha),
  };
}
