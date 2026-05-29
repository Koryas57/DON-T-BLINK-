import type { HandTrackingData } from '../tracking/HandTrackingTypes';
import type { PrototypeDebugState } from '../rendering/ThreeRenderer';

export class DebugOverlay {
  readonly element = document.createElement('aside');

  private enabled = new URLSearchParams(window.location.search).has('debug');
  private tapCount = 0;
  private tapTimer = 0;

  constructor() {
    this.element.className = 'debug-overlay';
    this.bindToggle();
    this.renderHiddenState();
  }

  updateHandPrototype(hand: HandTrackingData, prototype: PrototypeDebugState): void {
    if (!this.enabled) {
      return;
    }

    this.element.textContent = [
      `prototype hand-vr`,
      `fbx ${prototype.handReady ? 'ready' : 'loading'}`,
      `hand ${hand.detected ? 'on' : 'off'} ${hand.controller.predicted ? 'predict' : 'live'}`,
      `conf ${(hand.controller.confidence * 100).toFixed(0)}%`,
      `pos ${hand.controller.positionX.toFixed(2)}, ${hand.controller.positionY.toFixed(2)}, ${hand.controller.depth.toFixed(2)}`,
      `pinch ${(hand.controller.pinchStrength * 100).toFixed(0)}% ${hand.controller.pinchHold ? 'hold' : '-'}`,
      `grip ${(hand.controller.gripStrength * 100).toFixed(0)}%`,
      `grab ${prototype.interaction.held ? 'held' : '-'} ${prototype.interaction.target}`,
      `dist ${prototype.interaction.distance.toFixed(2)}`,
      `smooth ${hand.controller.smoothing.toFixed(2)}`,
    ].join('\n');
  }

  private bindToggle(): void {
    window.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() === 'd') {
        this.toggle();
      }
    });

    window.addEventListener(
      'pointerdown',
      (event) => {
        if (event.clientX > 84 || event.clientY > 84) {
          return;
        }

        window.clearTimeout(this.tapTimer);
        this.tapCount += 1;
        this.tapTimer = window.setTimeout(() => {
          this.tapCount = 0;
        }, 700);

        if (this.tapCount >= 4) {
          this.tapCount = 0;
          this.toggle();
        }
      },
      { passive: true },
    );
  }

  private toggle(): void {
    this.enabled = !this.enabled;
    this.renderHiddenState();
  }

  private renderHiddenState(): void {
    this.element.dataset.enabled = String(this.enabled);
    if (!this.enabled) {
      this.element.textContent = '';
    }
  }
}
