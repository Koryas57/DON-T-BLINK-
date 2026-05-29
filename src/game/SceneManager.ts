import * as THREE from 'three';
import { GAME_CONFIG } from './GameConfig';

export class SceneManager {
  readonly canvas = document.createElement('canvas');
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);

  private readonly renderer: THREE.WebGLRenderer;
  private width = 1;
  private height = 1;

  constructor() {
    this.canvas.className = 'render-surface';
    this.scene.background = new THREE.Color(0x05070a);
    this.scene.fog = new THREE.FogExp2(0x071016, 0.018);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.setClearColor(0x05070a, 1);

    this.camera.position.set(0, 24, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);

    const ambient = new THREE.HemisphereLight(0xcdeeff, 0x0a1014, 1.8);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(6, 11, 7);
    const rim = new THREE.DirectionalLight(0x68d8ff, 0.9);
    rim.position.set(-7, 6, -6);
    this.scene.add(ambient, key, rim);
  }

  resize(width = window.innerWidth, height = window.innerHeight): void {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));

    if (safeWidth === this.width && safeHeight === this.height) {
      return;
    }

    this.width = safeWidth;
    this.height = safeHeight;
    this.updateOrthoFrustum();
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(safeWidth, safeHeight, false);
  }

  private updateOrthoFrustum(): void {
    const aspect = this.width / this.height;
    const halfHeight = GAME_CONFIG.cameraZoom;
    const halfWidth = halfHeight * aspect;

    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
