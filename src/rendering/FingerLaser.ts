import * as THREE from 'three';
import type { AimInput } from '../input/InputMode';

export class FingerLaser {
  readonly root = new THREE.Group();

  private readonly fingerMaterial = new THREE.LineBasicMaterial({
    color: 0xdffbff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  private readonly fingerGeometry = new THREE.BufferGeometry();
  private readonly impactMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  private readonly pinchMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  private readonly impact = new THREE.Mesh(new THREE.RingGeometry(0.028, 0.064, 28), this.impactMaterial);
  private readonly pinchHalo = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.09, 28), this.pinchMaterial);
  private readonly coneMaterial = new THREE.MeshBasicMaterial({
    color: 0x9ff7ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  private readonly assistCone = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.115, 40), this.coneMaterial);
  private readonly finger: THREE.Line;
  private readonly start = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private readonly smoothStart = new THREE.Vector3();
  private readonly smoothEnd = new THREE.Vector3();
  private hasRay = false;

  constructor() {
    this.fingerGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.finger = new THREE.Line(this.fingerGeometry, this.fingerMaterial);
    this.root.add(this.finger, this.impact, this.pinchHalo, this.assistCone);
  }

  update(input: AimInput, camera: THREE.PerspectiveCamera): void {
    const visible = input.source === 'deathFinger' && input.detected;
    const confidence = THREE.MathUtils.clamp(input.confidence, 0, 1);
    const pinchStrength = input.pinchStrength ?? (input.pinchActive ? 1 : 0);
    this.fingerMaterial.opacity = THREE.MathUtils.lerp(this.fingerMaterial.opacity, visible ? 0.12 + confidence * 0.12 : 0, 0.18);
    this.impactMaterial.opacity = THREE.MathUtils.lerp(this.impactMaterial.opacity, visible ? 0.28 + confidence * 0.18 : 0, 0.24);
    this.pinchMaterial.opacity = THREE.MathUtils.lerp(this.pinchMaterial.opacity, visible ? pinchStrength * 0.64 : 0, 0.32);
    this.coneMaterial.opacity = THREE.MathUtils.lerp(this.coneMaterial.opacity, visible ? 0.08 + confidence * 0.16 : 0, 0.18);

    if (!visible) {
      this.hasRay = false;
      return;
    }

    const originX = input.originX ?? input.aimX - 0.18;
    const originY = input.originY ?? input.aimY - 0.18;

    this.ndcToWorld(originX, originY, camera, this.start);
    this.ndcToWorld(input.aimX, input.aimY, camera, this.end);
    this.end.z -= 0.18;

    if (!this.hasRay) {
      this.smoothStart.copy(this.start);
      this.smoothEnd.copy(this.end);
      this.hasRay = true;
    } else {
      this.smoothStart.lerp(this.start, 0.18);
      this.smoothEnd.lerp(this.end, 0.22);
    }

    const positions = this.fingerGeometry.attributes.position.array as Float32Array;
    positions[0] = this.smoothStart.x;
    positions[1] = this.smoothStart.y;
    positions[2] = this.smoothStart.z;
    positions[3] = this.smoothEnd.x;
    positions[4] = this.smoothEnd.y;
    positions[5] = this.smoothEnd.z;
    this.fingerGeometry.attributes.position.needsUpdate = true;

    this.impact.position.copy(this.smoothEnd);
    this.impact.scale.setScalar(0.75 + confidence * 0.72);
    this.pinchHalo.position.copy(this.smoothEnd);
    this.pinchHalo.scale.setScalar(0.9 + pinchStrength * 0.72);
    this.assistCone.position.copy(this.smoothEnd);
    this.assistCone.scale.setScalar(0.85 + confidence * 1.18);
  }

  dispose(): void {
    this.fingerGeometry.dispose();
    this.fingerMaterial.dispose();
    this.impact.geometry.dispose();
    this.impactMaterial.dispose();
    this.pinchHalo.geometry.dispose();
    this.pinchMaterial.dispose();
    this.assistCone.geometry.dispose();
    this.coneMaterial.dispose();
  }

  private ndcToWorld(x: number, y: number, camera: THREE.PerspectiveCamera, target: THREE.Vector3): void {
    target.set(x, y, 0.18).unproject(camera);
  }
}
