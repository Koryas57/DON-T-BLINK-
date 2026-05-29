import * as THREE from 'three';
import type { HandTrackingData } from '../tracking/HandTrackingTypes';

const FINGER_CHAINS = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [0, 9, 10, 11, 12],
  [0, 13, 14, 15, 16],
  [0, 17, 18, 19, 20],
];

const PALM_BONES = [
  [5, 9],
  [9, 13],
  [13, 17],
  [0, 5],
  [0, 17],
];

const FINGER_RADIUS = [0.72, 0.92, 0.96, 0.9, 0.76];

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const HAND_Z_NEAR = 0.95;
const HAND_Z_FAR = -0.25;
const CONTROLLER_DEPTH_SIGN = 1;
const DEFAULT_CONFIG = {
  xSensitivity: 0.62,
  ySensitivity: 0.58,
  poseScale: 0.36,
  minOpacity: 0.22,
};

interface BoneLink {
  from: number;
  to: number;
  radiusScale: number;
  mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
}

export class VirtualHandModel {
  readonly root = new THREE.Group();

  private readonly jointGeometry = new THREE.SphereGeometry(0.032, 18, 12);
  private readonly tipGeometry = new THREE.SphereGeometry(0.038, 18, 12);
  private readonly boneGeometry = new THREE.CylinderGeometry(0.024, 0.031, 1, 18, 1);
  private readonly palmGeometry = new THREE.SphereGeometry(0.205, 28, 18);
  private readonly palmBackGeometry = new THREE.SphereGeometry(0.218, 28, 18);
  private readonly handMaterial = new THREE.MeshStandardMaterial({
    color: 0xdbeeff,
    roughness: 0.48,
    metalness: 0.04,
    transparent: true,
    opacity: 0.5,
    emissive: 0x5ea8c8,
    emissiveIntensity: 0.035,
    depthWrite: false,
  });
  private readonly accentMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4fbff,
    roughness: 0.42,
    metalness: 0.05,
    transparent: true,
    opacity: 0.62,
    emissive: 0x9ddcff,
    emissiveIntensity: 0.08,
    depthWrite: false,
  });
  private readonly rimMaterial = new THREE.MeshBasicMaterial({
    color: 0xbfeeff,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });
  private readonly pinchMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private readonly joints: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[] = [];
  private readonly bones: BoneLink[] = [];
  private readonly palm = new THREE.Mesh(this.palmGeometry, this.handMaterial);
  private readonly palmBack = new THREE.Mesh(this.palmBackGeometry, this.rimMaterial);
  private readonly pinchAura = new THREE.Mesh(new THREE.SphereGeometry(0.08, 20, 12), this.pinchMaterial);
  private readonly localPoints = Array.from({ length: 21 }, () => new THREE.Vector3());
  private readonly worldTarget = new THREE.Vector3();
  private readonly tempA = new THREE.Vector3();
  private readonly tempB = new THREE.Vector3();
  private readonly tempMid = new THREE.Vector3();
  private readonly tempDirection = new THREE.Vector3();
  private readonly tempMatrix = new THREE.Matrix4();
  private hasPose = false;

  constructor() {
    this.root.visible = false;
    this.root.renderOrder = 12;
    this.root.scale.setScalar(1);
    this.palm.scale.set(1.18, 0.78, 0.32);
    this.palmBack.scale.set(1.26, 0.84, 0.4);
    this.root.add(this.palmBack, this.palm, this.pinchAura);

    for (let index = 0; index < 21; index += 1) {
      const geometry = index === 4 || index === 8 || index === 12 || index === 16 || index === 20 ? this.tipGeometry : this.jointGeometry;
      const material = index === 4 || index === 8 ? this.accentMaterial : this.handMaterial;
      const joint = new THREE.Mesh(geometry, material);
      joint.renderOrder = 13;
      this.joints.push(joint);
      this.root.add(joint);
    }

    for (let fingerIndex = 0; fingerIndex < FINGER_CHAINS.length; fingerIndex += 1) {
      const chain = FINGER_CHAINS[fingerIndex];
      for (let index = 0; index < chain.length - 1; index += 1) {
        this.addBone(chain[index], chain[index + 1], FINGER_RADIUS[fingerIndex] * (1 - index * 0.11));
      }
    }

    for (const [from, to] of PALM_BONES) {
      this.addBone(from, to, 1.12);
    }

    const rimLight = new THREE.PointLight(0xbdefff, 0.38, 2.4);
    rimLight.position.set(0.22, 0.4, 0.56);
    this.root.add(rimLight);
  }

  update(hand: HandTrackingData | null, camera: THREE.PerspectiveCamera): void {
    if (!hand?.detected || hand.landmarks.length < 21) {
      this.root.visible = false;
      this.hasPose = false;
      return;
    }

    this.root.visible = true;
    this.updateRootPosition(hand, camera);
    this.updateLocalPose(hand);
    this.updateMeshes(hand);
  }

  dispose(): void {
    this.jointGeometry.dispose();
    this.tipGeometry.dispose();
    this.boneGeometry.dispose();
    this.palmGeometry.dispose();
    this.palmBackGeometry.dispose();
    this.pinchAura.geometry.dispose();
    this.handMaterial.dispose();
    this.accentMaterial.dispose();
    this.rimMaterial.dispose();
    this.pinchMaterial.dispose();
  }

  private addBone(from: number, to: number, radiusScale: number): void {
    const mesh = new THREE.Mesh(this.boneGeometry, this.handMaterial);
    mesh.renderOrder = 12;
    this.bones.push({ from, to, radiusScale, mesh });
    this.root.add(mesh);
  }

  private updateRootPosition(hand: HandTrackingData, camera: THREE.PerspectiveCamera): void {
    const z = THREE.MathUtils.lerp(HAND_Z_NEAR, HAND_Z_FAR, hand.controller.depth);
    const x = THREE.MathUtils.clamp(hand.controller.positionX * DEFAULT_CONFIG.xSensitivity, -0.92, 0.92);
    const y = THREE.MathUtils.clamp(hand.controller.positionY * DEFAULT_CONFIG.ySensitivity, -0.86, 0.86);
    this.worldTarget.set(x, y, 0.5).unproject(camera);
    this.worldTarget.sub(camera.position).normalize();
    const distanceToPlane = (z - camera.position.z) / this.worldTarget.z;
    this.worldTarget.multiplyScalar(distanceToPlane).add(camera.position);

    if (!this.hasPose) {
      this.root.position.copy(this.worldTarget);
      return;
    }

    const alpha = hand.controller.predicted ? 0.08 : hand.quality.usable ? 0.18 : 0.1;
    this.root.position.lerp(this.worldTarget, alpha);
  }

  private updateLocalPose(hand: HandTrackingData): void {
    const landmarks = hand.landmarks;
    const anchor = landmarks[9];
    const basis = Math.max(
      0.001,
      distance2d(landmarks[0], landmarks[9]),
      distance2d(landmarks[5], landmarks[17]),
      distance2d(landmarks[0], landmarks[12]) * 0.7,
    );
    const targetScale = DEFAULT_CONFIG.poseScale * hand.controller.scale;
    const alpha = this.hasPose ? (hand.controller.predicted ? 0.06 : hand.quality.usable ? 0.14 : 0.09) : 1;

    for (let index = 0; index < landmarks.length; index += 1) {
      const landmark = landmarks[index];
      this.tempA.set(
        ((landmark.x - anchor.x) / basis) * targetScale,
        (-(landmark.y - anchor.y) / basis) * targetScale,
        ((landmark.z - anchor.z) / basis) * targetScale * 0.84 * CONTROLLER_DEPTH_SIGN,
      );
      this.localPoints[index].lerp(this.tempA, alpha);
    }

    this.hasPose = true;
  }

  private updateMeshes(hand: HandTrackingData): void {
    const pinchStrength = hand.controller.pinchStrength;
    const confidence = THREE.MathUtils.clamp(hand.controller.confidence, 0, 1);
    const opacity = THREE.MathUtils.lerp(DEFAULT_CONFIG.minOpacity, 0.54, confidence);
    this.handMaterial.opacity = opacity;
    this.accentMaterial.opacity = THREE.MathUtils.lerp(0.24, 0.66, confidence);
    this.rimMaterial.opacity = THREE.MathUtils.lerp(0.02, 0.1, confidence) + pinchStrength * 0.03;
    this.handMaterial.emissiveIntensity = 0.035 + pinchStrength * 0.05;
    this.accentMaterial.emissiveIntensity = 0.08 + pinchStrength * 0.18;
    this.pinchMaterial.opacity = THREE.MathUtils.lerp(this.pinchMaterial.opacity, pinchStrength * 0.34, 0.28);

    for (let index = 0; index < this.joints.length; index += 1) {
      const joint = this.joints[index];
      joint.position.copy(this.localPoints[index]);
      const fingertip = index === 4 || index === 8 || index === 12 || index === 16 || index === 20;
      const palmJoint = index === 0 || index === 5 || index === 9 || index === 13 || index === 17;
      joint.scale.setScalar(fingertip ? 0.78 : palmJoint ? 0.92 : 0.74);
    }

    for (const bone of this.bones) {
      this.placeBone(bone.mesh, this.localPoints[bone.from], this.localPoints[bone.to], bone.radiusScale);
    }

    this.tempA.copy(this.localPoints[0]);
    this.tempA.add(this.localPoints[5]).add(this.localPoints[9]).add(this.localPoints[13]).add(this.localPoints[17]).multiplyScalar(0.2);
    this.palm.position.copy(this.tempA);
    this.palmBack.position.copy(this.tempA);
    this.orientPalm();
    this.palmBack.quaternion.copy(this.palm.quaternion);

    this.pinchAura.position.copy(this.localPoints[8]);
    this.pinchAura.scale.setScalar(0.82 + pinchStrength * 0.62);
  }

  private placeBone(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, radiusScale: number): void {
    this.tempMid.copy(from).add(to).multiplyScalar(0.5);
    this.tempDirection.copy(to).sub(from);
    const length = Math.max(0.001, this.tempDirection.length());

    mesh.position.copy(this.tempMid);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, this.tempDirection.normalize());
    mesh.scale.set(radiusScale * 0.72, length, radiusScale * 0.72);
  }

  private orientPalm(): void {
    this.tempA.copy(this.localPoints[17]).sub(this.localPoints[5]).normalize();
    this.tempB.copy(this.localPoints[9]).sub(this.localPoints[0]).normalize();
    this.tempDirection.copy(this.tempA).cross(this.tempB);

    if (this.tempDirection.lengthSq() < 0.0001) {
      this.palm.quaternion.identity();
      return;
    }

    this.tempDirection.normalize();
    this.tempB.copy(this.tempDirection).cross(this.tempA).normalize();
    this.tempMatrix.makeBasis(this.tempA, this.tempB, this.tempDirection);
    this.palm.quaternion.setFromRotationMatrix(this.tempMatrix);
  }
}

function distance2d(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
