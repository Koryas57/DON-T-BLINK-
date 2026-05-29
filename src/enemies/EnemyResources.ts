import * as THREE from 'three';

export class EnemyResources {
  readonly bodyGeometry = new THREE.ConeGeometry(0.22, 0.72, 5, 1);
  readonly wingGeometry = new THREE.BufferGeometry();
  readonly wingEdgeGeometry = new THREE.BufferGeometry();
  readonly accentGeometry = new THREE.SphereGeometry(0.035, 8, 6);
  readonly targetingParticleGeometry = new THREE.BufferGeometry();
  readonly bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x050506,
    emissive: 0x111820,
    roughness: 0.78,
    metalness: 0.24,
  });
  readonly wingMaterial = new THREE.MeshStandardMaterial({
    color: 0x010101,
    emissive: 0x070d10,
    roughness: 0.92,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  readonly edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x46eaff,
    transparent: true,
    opacity: 0.34,
  });
  readonly accentMaterial = new THREE.MeshBasicMaterial({
    color: 0xff2d68,
    transparent: true,
    opacity: 0.92,
  });
  readonly thermalGeometry = new THREE.RingGeometry(0.4, 0.47, 36);

  constructor() {
    this.bodyGeometry.rotateX(Math.PI * 0.5);
    this.bodyGeometry.translate(0, 0, -0.02);

    this.wingGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          0, 0.04, 0.04,
          -0.68, 0.12, -0.08,
          -0.18, -0.08, -0.16,
        ],
        3,
      ),
    );
    this.wingGeometry.computeVertexNormals();

    this.wingEdgeGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          0, 0.04, 0.045,
          -0.68, 0.12, -0.075,
          -0.18, -0.08, -0.155,
        ],
        3,
      ),
    );

    const targetingParticles = new Float32Array(18 * 3);
    for (let index = 0; index < 18; index += 1) {
      const stride = index * 3;
      const angle = (index / 18) * Math.PI * 2;
      const radius = 0.28 + Math.random() * 0.26;
      targetingParticles[stride] = Math.cos(angle) * radius;
      targetingParticles[stride + 1] = Math.sin(angle) * radius * 0.72;
      targetingParticles[stride + 2] = THREE.MathUtils.randFloatSpread(0.18);
    }
    this.targetingParticleGeometry.setAttribute('position', new THREE.BufferAttribute(targetingParticles, 3));
  }

  dispose(): void {
    this.bodyGeometry.dispose();
    this.wingGeometry.dispose();
    this.wingEdgeGeometry.dispose();
    this.accentGeometry.dispose();
    this.thermalGeometry.dispose();
    this.targetingParticleGeometry.dispose();
    this.bodyMaterial.dispose();
    this.wingMaterial.dispose();
    this.edgeMaterial.dispose();
    this.accentMaterial.dispose();
  }
}
