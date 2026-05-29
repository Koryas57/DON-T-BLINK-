import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export interface DistortionUniforms {
  uTime: { value: number };
  uStrength: { value: number };
  uSpeed: { value: number };
}

export function createScreenDistortionPass(strength: number, speed: number): ShaderPass & { uniforms: DistortionUniforms } {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uStrength: { value: strength },
      uSpeed: { value: speed },
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

      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uStrength;
      uniform float uSpeed;
      varying vec2 vUv;

      float hash(float n) {
        return fract(sin(n) * 43758.5453123);
      }

      void main() {
        vec2 uv = vUv;
        float time = uTime * uSpeed;
        float scan = sin((uv.y + time * 0.18) * 760.0) * 0.5 + 0.5;
        float wave = sin(uv.y * 24.0 + time * 2.4) * uStrength;
        float jitter = (hash(floor(uv.y * 96.0) + floor(time * 18.0)) - 0.5) * uStrength * 0.7;
        float offset = wave + jitter * scan;

        vec4 base = texture2D(tDiffuse, uv + vec2(offset, 0.0));
        float red = texture2D(tDiffuse, uv + vec2(offset + uStrength * 0.9, 0.0)).r;
        float blue = texture2D(tDiffuse, uv + vec2(offset - uStrength * 0.9, 0.0)).b;
        float vignette = smoothstep(0.98, 0.28, length(uv - 0.5));
        base.r = red;
        base.b = blue;
        base.rgb *= 0.92 + scan * 0.035;
        base.rgb *= vignette;
        gl_FragColor = base;
      }
    `,
  }) as ShaderPass & { uniforms: DistortionUniforms };

  return pass;
}
