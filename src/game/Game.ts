import { Arena } from './Arena';
import { AssetLoader } from './AssetLoader';
import { DamageText } from './DamageText';
import { Enemy } from './Enemy';
import { GAME_CONFIG } from './GameConfig';
import { HUD } from './HUD';
import { Projectile } from './Projectile';
import { SceneManager } from './SceneManager';
import { Turret } from './Turret';
import { WaveManager } from './WaveManager';

export class Game {
  readonly sceneManager = new SceneManager();
  readonly hud = new HUD();

  private readonly assetLoader = new AssetLoader();
  private readonly waveManager = new WaveManager();
  private readonly enemies: Enemy[] = [];
  private readonly projectiles: Projectile[] = [];
  private readonly damageTexts: DamageText[] = [];
  private arena: Arena | null = null;
  private turret: Turret | null = null;
  private frameId = 0;
  private lastTime = 0;
  private running = false;
  private baseHp = GAME_CONFIG.baseHp;
  private gameOver = false;

  async start(): Promise<void> {
    const [mapTexture, turretModel] = await Promise.all([
      this.assetLoader.loadMapTexture(),
      this.assetLoader.loadTurretModel(),
    ]);

    this.arena = new Arena(mapTexture);
    this.turret = new Turret(turretModel);
    this.sceneManager.scene.add(this.arena.root, this.turret.root);
    this.running = true;
    this.lastTime = performance.now();
    this.loop();
  }

  resize(): void {
    this.sceneManager.resize();
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.frameId);
    for (const enemy of this.enemies) {
      enemy.dispose();
    }
    for (const projectile of this.projectiles) {
      projectile.dispose();
    }
    for (const damageText of this.damageTexts) {
      damageText.dispose();
    }
    this.arena?.dispose();
    this.turret?.dispose();
    this.sceneManager.dispose();
  }

  private loop = (): void => {
    if (!this.running) {
      return;
    }

    this.frameId = requestAnimationFrame(this.loop);
    const now = performance.now();
    const deltaSeconds = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    if (!this.gameOver) {
      this.update(deltaSeconds);
    }

    this.sceneManager.render();
  };

  private update(deltaSeconds: number): void {
    if (!this.arena || !this.turret) {
      return;
    }

    const spawned = this.waveManager.update(deltaSeconds, this.getAliveEnemyCount(), this.arena.radius);
    for (const enemy of spawned) {
      this.enemies.push(enemy);
      this.sceneManager.scene.add(enemy.root);
    }

    for (const enemy of this.enemies) {
      const reachedBase = enemy.update(deltaSeconds, this.sceneManager.camera);

      if (reachedBase && enemy.alive) {
        enemy.alive = false;
        this.baseHp -= GAME_CONFIG.enemyBaseDamage;
      }
    }

    const projectile = this.turret.update(deltaSeconds, this.enemies);
    if (projectile) {
      this.projectiles.push(projectile);
      this.sceneManager.scene.add(projectile.root);
    }

    for (const shot of this.projectiles) {
      shot.update(deltaSeconds, this.enemies);

      if (shot.hitEnemy) {
        const damageText = new DamageText(shot.damage, shot.hitEnemy.root.position);
        this.damageTexts.push(damageText);
        this.sceneManager.scene.add(damageText.root);
      }
    }

    for (const damageText of this.damageTexts) {
      damageText.update(deltaSeconds);
    }

    this.removeDeadEntities();
    this.hud.render(this.waveManager.getSnapshot(this.getAliveEnemyCount()), this.baseHp);

    if (this.baseHp <= 0) {
      this.gameOver = true;
      this.hud.showGameOver();
    }
  }

  private removeDeadEntities(): void {
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index];

      if (enemy.alive) {
        continue;
      }

      this.sceneManager.scene.remove(enemy.root);
      enemy.dispose();
      this.enemies.splice(index, 1);
    }

    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];

      if (projectile.alive) {
        continue;
      }

      this.sceneManager.scene.remove(projectile.root);
      projectile.dispose();
      this.projectiles.splice(index, 1);
    }

    for (let index = this.damageTexts.length - 1; index >= 0; index -= 1) {
      const damageText = this.damageTexts[index];

      if (damageText.alive) {
        continue;
      }

      this.sceneManager.scene.remove(damageText.root);
      damageText.dispose();
      this.damageTexts.splice(index, 1);
    }
  }

  private getAliveEnemyCount(): number {
    return this.enemies.reduce((count, enemy) => count + (enemy.alive ? 1 : 0), 0);
  }
}
