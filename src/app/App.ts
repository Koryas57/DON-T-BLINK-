import { Game } from '../game/Game';

export class App {
  private readonly root: HTMLElement;
  private readonly shell = document.createElement('section');
  private readonly game = new Game();

  constructor(root: HTMLElement) {
    this.root = root;
    this.shell.className = 'app-shell';
  }

  async start(): Promise<void> {
    this.root.replaceChildren(this.shell);
    this.shell.append(this.game.sceneManager.canvas, this.game.hud.element);
    this.bindResize();
    this.game.resize();
    await this.game.start();
  }

  stop(): void {
    this.game.dispose();
  }

  private bindResize(): void {
    const resize = () => this.game.resize();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('orientationchange', resize, { passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', resize, { passive: true });
    }
  }
}
