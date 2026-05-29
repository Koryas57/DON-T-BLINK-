export interface FrontCameraOptions {
  width?: number;
  height?: number;
  frameRate?: number;
}

const DEFAULT_CAMERA_OPTIONS: Required<FrontCameraOptions> = {
  width: 720,
  height: 1280,
  frameRate: 30,
};

export class FrontCamera {
  readonly video: HTMLVideoElement;

  private stream: MediaStream | null = null;
  private readonly options: Required<FrontCameraOptions>;

  constructor(options: FrontCameraOptions = {}) {
    this.options = { ...DEFAULT_CAMERA_OPTIONS, ...options };
    this.video = document.createElement('video');
    this.video.className = 'camera-feed';
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.playsInline = true;
  }

  async start(): Promise<HTMLVideoElement> {
    if (this.stream) {
      return this.video;
    }

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        'Camera access requires HTTPS, localhost, or the installed Capacitor Android app. LAN HTTP URLs cannot request camera permission.',
      );
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: this.options.width },
        height: { ideal: this.options.height },
        frameRate: { ideal: this.options.frameRate, max: this.options.frameRate },
      },
    });

    this.video.srcObject = this.stream;
    await this.video.play();
    await this.waitForMetadata();

    return this.video;
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  private waitForMetadata(): Promise<void> {
    if (this.video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    });
  }
}
