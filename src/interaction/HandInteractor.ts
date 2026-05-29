import * as THREE from 'three';
import type { HandTrackingData } from '../tracking/HandTrackingTypes';
import type { RetargetedHandPose } from '../hand/HandRetargeting';
import { GrabbableObject } from './GrabbableObject';

export interface HandInteractionDebugState {
  held: boolean;
  hover: number;
  distance: number;
  target: string;
}

export class HandInteractor {
  readonly debug: HandInteractionDebugState = {
    held: false,
    hover: 0,
    distance: 0,
    target: '-',
  };

  private heldObject: GrabbableObject | null = null;
  private readonly holdOffset = new THREE.Vector3();
  private readonly previousPosition = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private hasPrevious = false;

  update(hand: HandTrackingData | null, pose: RetargetedHandPose | null, object: GrabbableObject, deltaSeconds: number): void {
    if (!hand?.detected || !pose) {
      this.release();
      object.setHover(0);
      this.debug.hover = 0;
      this.debug.distance = 0;
      this.debug.target = '-';
      return;
    }

    const pointer = pose.pinchWorld;
    const distance = pointer.distanceTo(object.position);
    const hover = THREE.MathUtils.clamp(1 - distance / 0.78, 0, 1);
    object.setHover(hover);

    if (!this.hasPrevious) {
      this.previousPosition.copy(pointer);
      this.hasPrevious = true;
    }

    this.velocity.copy(pointer).sub(this.previousPosition).divideScalar(Math.max(0.001, deltaSeconds));
    this.previousPosition.copy(pointer);

    if (!this.heldObject && hand.controller.pinchStart && distance < 0.58) {
      this.heldObject = object;
      this.holdOffset.copy(object.position).sub(pointer);
    }

    if (this.heldObject && (hand.controller.pinchEnd || !hand.controller.pinchHold)) {
      this.release();
    }

    if (this.heldObject) {
      const target = pointer.clone().add(this.holdOffset);
      this.heldObject.position.lerp(target, 0.34);
    }

    this.debug.held = this.heldObject !== null;
    this.debug.hover = hover;
    this.debug.distance = distance;
    this.debug.target = hover > 0 ? 'cube' : '-';
  }

  dispose(): void {
    this.release();
  }

  private release(): void {
    this.heldObject = null;
    this.hasPrevious = false;
    this.debug.held = false;
  }
}
