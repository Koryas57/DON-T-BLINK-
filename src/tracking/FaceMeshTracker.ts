import { FaceMesh, type Results } from '@mediapipe/face_mesh';
import type { FaceTrackingData } from './FaceTrackingTypes';
import { buildTrackingData, createEmptyTrackingData, smoothTrackingData } from './TrackingMath';

export interface FaceMeshTrackerOptions {
  maxFaces?: number;
  smoothAlpha?: number;
}

export class FaceMeshTracker extends EventTarget {
  private readonly faceMesh: FaceMesh;
  private readonly smoothAlpha: number;
  private currentData: FaceTrackingData = createEmptyTrackingData();
  private isProcessing = false;

  constructor(options: FaceMeshTrackerOptions = {}) {
    super();

    this.smoothAlpha = options.smoothAlpha ?? 0.34;
    this.faceMesh = new FaceMesh({
      locateFile: (file) => `/vendor/mediapipe/face_mesh/${file}`,
    });

    this.faceMesh.setOptions({
      selfieMode: true,
      maxNumFaces: options.maxFaces ?? 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    this.faceMesh.onResults((results) => this.handleResults(results));
  }

  get data(): FaceTrackingData {
    return this.currentData;
  }

  async process(video: HTMLVideoElement): Promise<void> {
    if (this.isProcessing || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    this.isProcessing = true;

    try {
      await this.faceMesh.send({ image: video });
    } finally {
      this.isProcessing = false;
    }
  }

  dispose(): void {
    this.faceMesh.close();
  }

  private handleResults(results: Results): void {
    const landmarks = results.multiFaceLandmarks?.[0];
    const nextData = landmarks
      ? buildTrackingData(landmarks)
      : createEmptyTrackingData(performance.now());

    this.currentData = smoothTrackingData(this.currentData, nextData, this.smoothAlpha);
    this.dispatchEvent(new CustomEvent<FaceTrackingData>('tracking', { detail: this.currentData }));
  }
}
