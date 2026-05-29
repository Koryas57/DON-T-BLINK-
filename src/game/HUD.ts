import type { WaveSnapshot } from './WaveManager';

export class HUD {
  readonly element = document.createElement('section');

  constructor() {
    this.element.className = 'game-hud';
    this.render({
      wave: 0,
      pending: 0,
      alive: 0,
      remaining: 0,
    }, 100);
  }

  render(wave: WaveSnapshot, baseHp: number): void {
    this.element.innerHTML = `
      <div class="game-hud__brand">ORBITAL BASTION</div>
      <div class="game-hud__stats">
        <span>Wave <strong>${wave.wave}</strong></span>
        <span>Enemies <strong>${wave.remaining}</strong></span>
        <span>Base <strong>${Math.max(0, Math.ceil(baseHp))}</strong></span>
      </div>
    `;
  }

  showGameOver(): void {
    this.element.dataset.gameOver = 'true';
    this.element.innerHTML += `
      <div class="game-hud__game-over">
        <strong>BASTION LOST</strong>
        <span>Refresh to restart</span>
      </div>
    `;
  }
}
