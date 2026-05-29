import * as THREE from 'three';

export class ExplosionEffect {
  readonly root = new THREE.Group();

  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly particlesGeometry: THREE.BufferGeometry;
  private readonly particlesMaterial: THREE.PointsMaterial;
  private readonly shockwaveMaterial: THREE.MeshBasicMaterial;
  private readonly flashMaterial: THREE.MeshBasicMaterial;
  private readonly shockwave: THREE.Mesh;
  private readonly flash: THREE.Mesh;
  private age = 0;
  private readonly duration = 1.05;

  constructor(position: THREE.Vector3, intensity: number) {
    const count = 86;
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);

    for (let index = 0; index < count; index += 1) {
      const stride = index * 3;
      const direction = new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(1),
        THREE.MathUtils.randFloatSpread(1),
        THREE.MathUtils.randFloatSpread(0.7),
      ).normalize();
      const speed = THREE.MathUtils.randFloat(1.2, 3.6) * intensity;

      this.velocities[stride] = direction.x * speed;
      this.velocities[stride + 1] = direction.y * speed;
      this.velocities[stride + 2] = direction.z * speed;
    }

    this.particlesGeometry = new THREE.BufferGeometry();
    this.particlesGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.particlesMaterial = new THREE.PointsMaterial({
      color: 0xff476e,
      size: 0.045,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(this.particlesGeometry, this.particlesMaterial);

    this.shockwaveMaterial = new THREE.MeshBasicMaterial({
      color: 0x9bfaff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.shockwave = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.18, 48), this.shockwaveMaterial);

    this.flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 8), this.flashMaterial);

    this.root.position.copy(position);
    this.root.add(this.shockwave, this.flash, particles);
  }

  get finished(): boolean {
    return this.age >= this.duration;
  }

  update(deltaSeconds: number): void {
    this.age += deltaSeconds;
    const progress = THREE.MathUtils.clamp(this.age / this.duration, 0, 1);
    const blast = easeOutExpo(progress);
    const fade = 1 - progress;

    for (let index = 0; index < this.positions.length; index += 3) {
      this.positions[index] = this.velocities[index] * blast;
      this.positions[index + 1] = this.velocities[index + 1] * blast;
      this.positions[index + 2] = this.velocities[index + 2] * blast;
    }

    this.particlesGeometry.attributes.position.needsUpdate = true;
    this.particlesMaterial.opacity = fade * fade;
    this.shockwave.scale.setScalar(1 + blast * 4.9);
    this.shockwaveMaterial.opacity = fade * 0.72;
    this.flash.scale.setScalar(1 + blast * 2.4);
    this.flashMaterial.opacity = Math.max(0, 1 - progress * 5.8);
  }

  dispose(parent: THREE.Group): void {
    parent.remove(this.root);
    this.particlesGeometry.dispose();
    this.particlesMaterial.dispose();
    this.shockwave.geometry.dispose();
    this.shockwaveMaterial.dispose();
    this.flash.geometry.dispose();
    this.flashMaterial.dispose();
  }
}

function easeOutExpo(value: number): number {
  return value >= 1 ? 1 : 1 - 2 ** (-10 * value);
}
