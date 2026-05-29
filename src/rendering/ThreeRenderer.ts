import * as THREE from 'three';
import { VirtualHandRenderer } from '../hand/VirtualHandRenderer';
import { GrabbableObject } from '../interaction/GrabbableObject';
import { HandInteractor, type HandInteractionDebugState } from '../interaction/HandInteractor';
import type { HandTrackingData } from '../tracking/HandTrackingTypes';

export interface PrototypeDebugState {
  handReady: boolean;
  interaction: HandInteractionDebugState;
}

export class ThreeRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(52, 1, 0.01, 80);

  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock = new THREE.Clock();
  private readonly hand = new VirtualHandRenderer();
  private readonly grabbable = new GrabbableObject();
  private readonly interactor = new HandInteractor();
  private readonly ambientLight = new THREE.HemisphereLight(0xb8eaff, 0x05070a, 1.6);
  private readonly keyLight = new THREE.DirectionalLight(0xdff8ff, 2.1);
  private readonly rimLight = new THREE.PointLight(0x8cecff, 1.1, 5.2);
  private width = 1;
  private height = 1;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'render-surface';
    this.scene.background = new THREE.Color(0x020305);
    this.scene.fog = new THREE.FogExp2(0x020305, 0.038);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: false,
      antialias: true,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x020305, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.setPixelRatio(this.getMobilePixelRatio());

    this.camera.position.set(0, 0, 4.2);
    this.camera.lookAt(0, 0, 0);

    this.keyLight.position.set(1.7, 2.4, 2.6);
    this.rimLight.position.set(-1.2, 0.8, 1.1);
    this.grabbable.root.position.set(0, 0.02, 0);

    this.scene.add(this.ambientLight, this.keyLight, this.rimLight, this.hand.root, this.grabbable.root);
    this.addEnvironmentGrid();
  }

  get debugState(): PrototypeDebugState {
    return {
      handReady: this.hand.isReady,
      interaction: this.interactor.debug,
    };
  }

  resize(width = window.innerWidth, height = window.innerHeight): void {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));

    if (safeWidth === this.width && safeHeight === this.height) {
      return;
    }

    this.width = safeWidth;
    this.height = safeHeight;
    this.camera.aspect = safeWidth / safeHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.getMobilePixelRatio());
    this.renderer.setSize(safeWidth, safeHeight, false);
  }

  update(handsData: HandTrackingData[]): void {
    const deltaSeconds = Math.min(0.05, this.clock.getDelta());
    const elapsedSeconds = this.clock.elapsedTime;
    const primaryHand = handsData[0] ?? null;

    this.hand.update(handsData, this.camera);
    this.interactor.update(primaryHand, this.hand.pose, this.grabbable, deltaSeconds);
    this.grabbable.update(elapsedSeconds, this.interactor.debug.held);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.hand.dispose();
    this.grabbable.dispose();
    this.interactor.dispose();
    this.renderer.dispose();
  }

  private addEnvironmentGrid(): void {
    const grid = new THREE.GridHelper(5, 18, 0x16434d, 0x071a20);
    grid.position.y = -1.2;
    grid.position.z = -0.4;
    grid.material.transparent = true;
    grid.material.opacity = 0.22;
    this.scene.add(grid);
  }

  private getMobilePixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, 1.5);
  }
}
