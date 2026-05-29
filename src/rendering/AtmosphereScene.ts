import * as THREE from 'three';
import type { AtmosphereConfig } from './AtmosphereConfig';

export class AtmosphereScene {
  private readonly group = new THREE.Group();
  private readonly particles: THREE.Points;
  private readonly particleMaterial: THREE.ShaderMaterial;
  private readonly keyLight = new THREE.PointLight(0x67f7ff, 1.8, 9, 1.8);
  private readonly pulseLight = new THREE.PointLight(0xff285f, 1.1, 7, 2);
  private readonly rimLight = new THREE.DirectionalLight(0xb6d7ff, 0.42);
  private readonly fieldMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0.38 },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;

      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vUv;

      float scan(float y, float speed, float width) {
        float line = fract(y * 18.0 - uTime * speed);
        return smoothstep(width, 0.0, abs(line - 0.5));
      }

      void main() {
        vec2 uv = vUv - 0.5;
        float radius = length(uv);
        float vignette = smoothstep(0.72, 0.08, radius);
        float grid = scan(vUv.y, 0.055, 0.035) * 0.22;
        float aura = pow(max(0.0, 1.0 - radius), 3.0);
        vec3 cyan = vec3(0.05, 0.75, 0.92);
        vec3 red = vec3(0.95, 0.04, 0.22);
        vec3 color = mix(cyan, red, smoothstep(-0.18, 0.32, uv.x));
        float alpha = (aura * 0.44 + grid) * vignette * uIntensity;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  constructor(
    scene: THREE.Scene,
    private readonly config: AtmosphereConfig,
  ) {
    scene.background = new THREE.Color(0x030306);
    scene.fog = new THREE.Fog(config.fogColor, config.fogNear, config.fogFar);

    this.particleMaterial = this.createParticleMaterial();
    this.particles = this.createParticles();

    const field = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), this.fieldMaterial);
    field.position.z = -4.6;

    this.keyLight.position.set(-1.8, 1.7, 2.2);
    this.pulseLight.position.set(2.1, -1.4, 1.4);
    this.rimLight.position.set(0.7, 1.4, 2.6);

    this.group.add(field, this.particles, this.keyLight, this.pulseLight, this.rimLight);
    scene.add(this.group);
  }

  update(elapsedSeconds: number): void {
    this.particleMaterial.uniforms.uTime.value = elapsedSeconds;
    this.fieldMaterial.uniforms.uTime.value = elapsedSeconds;

    this.particles.rotation.y = elapsedSeconds * 0.018;
    this.particles.rotation.x = Math.sin(elapsedSeconds * 0.12) * 0.025;

    const pulse = 0.5 + Math.sin(elapsedSeconds * 0.8) * 0.5;
    this.keyLight.intensity = (1.35 + pulse * 0.48) * this.config.lightingIntensity;
    this.pulseLight.intensity = (0.72 + (1 - pulse) * 0.46) * this.config.lightingIntensity;
    this.group.position.y = Math.sin(elapsedSeconds * 0.17) * 0.08;
  }

  dispose(): void {
    this.particles.geometry.dispose();
    this.particleMaterial.dispose();
    this.fieldMaterial.dispose();
  }

  private createParticles(): THREE.Points {
    const positions = new Float32Array(this.config.particleCount * 3);
    const seeds = new Float32Array(this.config.particleCount);

    for (let index = 0; index < this.config.particleCount; index += 1) {
      const stride = index * 3;
      const radius = Math.sqrt(Math.random()) * this.config.particleRadius;
      const angle = Math.random() * Math.PI * 2;
      const depth = -Math.random() * this.config.particleDepth;

      positions[stride] = Math.cos(angle) * radius;
      positions[stride + 1] = Math.sin(angle) * radius * 1.65;
      positions[stride + 2] = depth;
      seeds[index] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    return new THREE.Points(geometry, this.particleMaterial);
  }

  private createParticleMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: this.config.particleSize },
        uOpacity: { value: this.config.particleOpacity },
      },
      vertexShader: `
        attribute float aSeed;
        uniform float uTime;
        uniform float uSize;
        varying float vSeed;
        varying float vDepth;

        void main() {
          vSeed = aSeed;
          vec3 transformed = position;
          transformed.y += sin(uTime * (0.22 + aSeed * 0.35) + aSeed * 28.0) * 0.12;
          transformed.x += cos(uTime * (0.16 + aSeed * 0.25) + aSeed * 17.0) * 0.08;
          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          vDepth = clamp((-mvPosition.z - 1.0) / 9.0, 0.0, 1.0);
          gl_PointSize = uSize * (360.0 / max(0.35, -mvPosition.z));
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        precision mediump float;

        uniform float uOpacity;
        varying float vSeed;
        varying float vDepth;

        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float core = smoothstep(0.5, 0.0, length(uv));
          float glint = smoothstep(0.04, 0.0, abs(uv.x + uv.y)) * 0.32;
          vec3 cyan = vec3(0.14, 0.88, 1.0);
          vec3 magenta = vec3(1.0, 0.08, 0.34);
          vec3 color = mix(cyan, magenta, smoothstep(0.64, 1.0, vSeed));
          float alpha = (core + glint) * uOpacity * (0.35 + vDepth * 0.65);
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
  }
}
