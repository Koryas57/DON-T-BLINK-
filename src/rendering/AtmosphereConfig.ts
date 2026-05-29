import * as THREE from 'three';

export interface AtmosphereConfig {
  particleCount: number;
  particleRadius: number;
  particleDepth: number;
  particleSize: number;
  particleOpacity: number;
  fogColor: THREE.ColorRepresentation;
  fogNear: number;
  fogFar: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  distortionStrength: number;
  distortionSpeed: number;
  lightingIntensity: number;
}

export const DEFAULT_ATMOSPHERE_CONFIG: AtmosphereConfig = {
  particleCount: 900,
  particleRadius: 5.8,
  particleDepth: 9,
  particleSize: 0.035,
  particleOpacity: 0.72,
  fogColor: 0x030306,
  fogNear: 2.8,
  fogFar: 10.5,
  bloomStrength: 0.42,
  bloomRadius: 0.58,
  bloomThreshold: 0.08,
  distortionStrength: 0.012,
  distortionSpeed: 0.38,
  lightingIntensity: 1,
};
