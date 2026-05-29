import * as THREE from 'three';

export class DamageText {
  readonly root = new THREE.Group();
  alive = true;

  private readonly sprite: THREE.Sprite;
  private age = 0;
  private readonly lifetime = 0.72;

  constructor(amount: number, position: THREE.Vector3) {
    const material = new THREE.SpriteMaterial({
      map: createDamageTexture(amount),
      transparent: true,
      depthTest: false,
      toneMapped: false,
    });
    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.set(0.78, 0.34, 1);
    this.root.position.copy(position).add(new THREE.Vector3(0, 0.9, 0));
    this.root.add(this.sprite);
  }

  update(deltaSeconds: number): void {
    this.age += deltaSeconds;
    this.root.position.y += deltaSeconds * 0.72;
    const t = Math.min(1, this.age / this.lifetime);
    this.sprite.material.opacity = 1 - t;
    this.alive = this.age < this.lifetime;
  }

  dispose(): void {
    this.sprite.material.map?.dispose();
    this.sprite.material.dispose();
  }
}

function createDamageTexture(amount: number): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create damage text canvas.');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = '800 34px Inter, system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 6;
  context.strokeStyle = 'rgba(12, 2, 4, 0.95)';
  context.fillStyle = '#fff3b0';
  context.strokeText(String(amount), canvas.width / 2, canvas.height / 2);
  context.fillText(String(amount), canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
