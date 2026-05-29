import * as THREE from 'three';
import type { Handedness, HandTrackingData } from '../tracking/HandTrackingTypes';

export interface RetargetedHandPose {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  confidence: number;
  pinchWorld: THREE.Vector3;
  indexTipWorld: THREE.Vector3;
}

export interface HandBoneMap {
  wrist: THREE.Bone | null;
  thumb: THREE.Bone[];
  index: THREE.Bone[];
  middle: THREE.Bone[];
  ring: THREE.Bone[];
  pinky: THREE.Bone[];
}

const FINGER_LANDMARKS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
} as const;

const MODEL_FORWARD = new THREE.Vector3(0, 0, 1);
const MODEL_UP = new THREE.Vector3(0, 1, 0);

export class HandRetargeting {
  private readonly tempA = new THREE.Vector3();
  private readonly tempB = new THREE.Vector3();
  private readonly tempC = new THREE.Vector3();
  private readonly tempMatrix = new THREE.Matrix4();
  private readonly targetRotation = new THREE.Quaternion();
  private readonly previousRotation = new THREE.Quaternion();
  private hasRotation = false;

  update(modelRoot: THREE.Object3D, boneMap: HandBoneMap, hand: HandTrackingData, camera: THREE.PerspectiveCamera): RetargetedHandPose | null {
    if (!hand.detected || hand.landmarks.length < 21) {
      return null;
    }

    const pose = this.getControllerPose(hand, camera);
    modelRoot.visible = true;
    modelRoot.position.lerp(pose.position, hand.controller.predicted ? 0.08 : 0.18);

    if (!this.hasRotation) {
      this.previousRotation.copy(pose.rotation);
      this.hasRotation = true;
    } else {
      this.previousRotation.slerp(pose.rotation, hand.controller.predicted ? 0.08 : 0.2);
    }

    modelRoot.quaternion.copy(this.previousRotation);
    modelRoot.scale.setScalar(hand.controller.scale);
    this.applyFingerPose(boneMap, hand);

    return {
      position: modelRoot.position.clone(),
      rotation: modelRoot.quaternion.clone(),
      confidence: hand.controller.confidence,
      pinchWorld: this.landmarkToWorld(hand, 4, camera).lerp(this.landmarkToWorld(hand, 8, camera), 0.5),
      indexTipWorld: this.landmarkToWorld(hand, 8, camera),
    };
  }

  reset(modelRoot: THREE.Object3D): void {
    modelRoot.visible = false;
    this.hasRotation = false;
  }

  private getControllerPose(hand: HandTrackingData, camera: THREE.PerspectiveCamera): RetargetedHandPose {
    const z = THREE.MathUtils.lerp(0.6, -0.55, hand.controller.depth);
    const x = THREE.MathUtils.clamp(hand.controller.positionX * 0.64, -0.86, 0.86);
    const y = THREE.MathUtils.clamp(hand.controller.positionY * 0.58, -0.78, 0.78);
    const position = this.ndcToWorld(x, y, z, camera);
    const rotation = this.getPalmRotation(hand);
    const pinchWorld = this.landmarkToWorld(hand, 4, camera).lerp(this.landmarkToWorld(hand, 8, camera), 0.5);
    const indexTipWorld = this.landmarkToWorld(hand, 8, camera);

    return {
      position,
      rotation,
      confidence: hand.controller.confidence,
      pinchWorld,
      indexTipWorld,
    };
  }

  private getPalmRotation(hand: HandTrackingData): THREE.Quaternion {
    const landmarks = hand.landmarks;
    const wrist = this.landmarkToLocal(landmarks[0]);
    const indexBase = this.landmarkToLocal(landmarks[5]);
    const pinkyBase = this.landmarkToLocal(landmarks[17]);
    const middleBase = this.landmarkToLocal(landmarks[9]);
    const palmRight = this.tempA.copy(indexBase).sub(pinkyBase).normalize();
    const palmUp = this.tempB.copy(middleBase).sub(wrist).normalize();
    const palmForward = this.tempC.copy(palmRight).cross(palmUp).normalize();

    if (palmForward.lengthSq() < 0.0001) {
      return this.targetRotation.identity();
    }

    this.tempB.copy(palmForward).cross(palmRight).normalize();
    this.tempMatrix.makeBasis(palmRight, this.tempB, palmForward);
    this.targetRotation.setFromRotationMatrix(this.tempMatrix);
    this.targetRotation.multiply(new THREE.Quaternion().setFromUnitVectors(MODEL_FORWARD, new THREE.Vector3(0, 0, 1)));
    this.targetRotation.multiply(new THREE.Quaternion().setFromUnitVectors(MODEL_UP, new THREE.Vector3(0, 1, 0)));
    return this.targetRotation;
  }

  private applyFingerPose(boneMap: HandBoneMap, hand: HandTrackingData): void {
    this.applyFingerChain(boneMap.thumb, FINGER_LANDMARKS.thumb, hand, 0.92);
    this.applyFingerChain(boneMap.index, FINGER_LANDMARKS.index, hand, 1);
    this.applyFingerChain(boneMap.middle, FINGER_LANDMARKS.middle, hand, 1);
    this.applyFingerChain(boneMap.ring, FINGER_LANDMARKS.ring, hand, 0.96);
    this.applyFingerChain(boneMap.pinky, FINGER_LANDMARKS.pinky, hand, 0.9);
  }

  private applyFingerChain(bones: THREE.Bone[], landmarks: readonly number[], hand: HandTrackingData, curlScale: number): void {
    const points = landmarks.map((index) => this.landmarkToLocal(hand.landmarks[index]));

    for (let index = 0; index < bones.length && index < points.length - 1; index += 1) {
      const bone = bones[index];
      const current = points[index];
      const next = points[index + 1];
      const direction = next.sub(current).normalize();

      if (direction.lengthSq() < 0.0001) {
        continue;
      }

      const parentQuaternion = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
      const worldQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      bone.quaternion.slerp(parentQuaternion.invert().multiply(worldQuaternion), 0.22 * curlScale);
    }
  }

  private landmarkToWorld(hand: HandTrackingData, index: number, camera: THREE.PerspectiveCamera): THREE.Vector3 {
    const point = hand.landmarks[index];
    const x = THREE.MathUtils.clamp((point.x - 0.5) * 2 * 0.64, -0.86, 0.86);
    const y = THREE.MathUtils.clamp(-(point.y - 0.5) * 2 * 0.58, -0.78, 0.78);
    const z = THREE.MathUtils.lerp(0.6, -0.55, hand.controller.depth) + (point.z ?? 0) * 0.7;
    return this.ndcToWorld(x, y, z, camera);
  }

  private landmarkToLocal(point: { x: number; y: number; z?: number }): THREE.Vector3 {
    return new THREE.Vector3((point.x - 0.5) * 2, -(point.y - 0.5) * 2, (point.z ?? 0) * 2);
  }

  private ndcToWorld(x: number, y: number, worldZ: number, camera: THREE.PerspectiveCamera): THREE.Vector3 {
    const direction = new THREE.Vector3(x, y, 0.5).unproject(camera).sub(camera.position).normalize();
    const distance = (worldZ - camera.position.z) / direction.z;
    return direction.multiplyScalar(distance).add(camera.position);
  }
}

export function createHandBoneMap(root: THREE.Object3D, handedness: Handedness): HandBoneMap {
  const bones: THREE.Bone[] = [];
  root.traverse((child) => {
    if ((child as THREE.Bone).isBone) {
      bones.push(child as THREE.Bone);
    }
  });

  const suffix = handedness === 'Left' ? 'L' : 'R';
  const fallbackSuffix = suffix === 'L' ? 'R' : 'L';

  return {
    wrist: findBone(bones, [`hand.${suffix}`, `hand.${fallbackSuffix}`, 'wrist', 'hand']),
    thumb: findChain(bones, [`thumb.01.${suffix}`, `thumb.02.${suffix}`, `thumb.03.${suffix}`], [`thumb.01.${fallbackSuffix}`, `thumb.02.${fallbackSuffix}`, `thumb.03.${fallbackSuffix}`]),
    index: findChain(bones, [`finger_index.01.${suffix}`, `finger_index.02.${suffix}`, `finger_index.03.${suffix}`], [`finger_index.01.${fallbackSuffix}`, `finger_index.02.${fallbackSuffix}`, `finger_index.03.${fallbackSuffix}`]),
    middle: findChain(bones, [`finger_middle.01.${suffix}`, `finger_middle.02.${suffix}`, `finger_middle.03.${suffix}`], [`finger_middle.01.${fallbackSuffix}`, `finger_middle.02.${fallbackSuffix}`, `finger_middle.03.${fallbackSuffix}`]),
    ring: findChain(bones, [`finger_ring.01.${suffix}`, `finger_ring.02.${suffix}`, `finger_ring.03.${suffix}`], [`finger_ring.01.${fallbackSuffix}`, `finger_ring.02.${fallbackSuffix}`, `finger_ring.03.${fallbackSuffix}`]),
    pinky: findChain(bones, [`finger_pinky.01.${suffix}`, `finger_pinky.02.${suffix}`, `finger_pinky.03.${suffix}`], [`finger_pinky.01.${fallbackSuffix}`, `finger_pinky.02.${fallbackSuffix}`, `finger_pinky.03.${fallbackSuffix}`]),
  };
}

function findChain(bones: THREE.Bone[], preferred: string[], fallback: string[]): THREE.Bone[] {
  const chain = preferred.map((name) => bones.find((bone) => bone.name === name)).filter(Boolean) as THREE.Bone[];
  if (chain.length > 0) {
    return chain;
  }

  return fallback.map((name) => bones.find((bone) => bone.name === name)).filter(Boolean) as THREE.Bone[];
}

function findBone(bones: THREE.Bone[], candidates: string[]): THREE.Bone | null {
  for (const candidate of candidates) {
    const exact = bones.find((bone) => bone.name === candidate);

    if (exact) {
      return exact;
    }

    const partial = bones.find((bone) => bone.name.toLowerCase().includes(candidate.toLowerCase()));

    if (partial) {
      return partial;
    }
  }

  return null;
}
