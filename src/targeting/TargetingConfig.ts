export interface TargetingConfig {
  sensitivity: number;
  smoothing: number;
  lockRadius: number;
  lockStickiness: number;
  feedbackRise: number;
  feedbackFall: number;
  headInfluence: number;
  irisInfluence: number;
}

export const DEFAULT_TARGETING_CONFIG: TargetingConfig = {
  sensitivity: 1.04,
  smoothing: 0.14,
  lockRadius: 0.17,
  lockStickiness: 0.045,
  feedbackRise: 2.05,
  feedbackFall: 2.2,
  headInfluence: 0.64,
  irisInfluence: 0.42,
};
