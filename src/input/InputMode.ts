export type InputMode = 'eyeLaser' | 'deathFinger';

export interface AimInput {
  detected: boolean;
  aimX: number;
  aimY: number;
  originX?: number;
  originY?: number;
  confidence: number;
  pinchActive?: boolean;
  pinchTriggered?: boolean;
  pinchStrength?: number;
  pinchStart?: boolean;
  pinchHold?: boolean;
  pinchEnd?: boolean;
  gripActive?: boolean;
  gripStrength?: number;
  source: InputMode;
}

export const EMPTY_AIM_INPUT: AimInput = {
  detected: false,
  aimX: 0,
  aimY: 0,
  confidence: 0,
  source: 'eyeLaser',
};
