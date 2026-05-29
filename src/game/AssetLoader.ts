import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MAP_URL = '/assets/maps/MapLvl1.png';
const TURRET_URL = '/assets/models/RotatingTurret.glb';

export class AssetLoader {
  private readonly textureLoader = new THREE.TextureLoader();
  private readonly gltfLoader = new GLTFLoader();

  async loadMapTexture(): Promise<THREE.Texture | null> {
    try {
      const texture = await this.textureLoader.loadAsync(MAP_URL);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      return texture;
    } catch (error) {
      console.warn('[ORBITAL BASTION] MapLvl1.png not found, using procedural arena fallback.', error);
      return null;
    }
  }

  async loadTurretModel(): Promise<THREE.Object3D | null> {
    try {
      const gltf = await this.gltfLoader.loadAsync(TURRET_URL);
      const model = gltf.scene;
      model.traverse((child) => {
        const mesh = child as THREE.Mesh;

        if (mesh.isMesh) {
          mesh.castShadow = false;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
        }
      });
      normalizeModel(model, 1);
      return model;
    } catch (error) {
      console.warn('[ORBITAL BASTION] RotatingTurret.glb not found, using fallback turret.', error);
      return null;
    }
  }
}

function normalizeModel(model: THREE.Object3D, targetSize: number): void {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxAxis = Math.max(size.x, size.y, size.z, 0.001);
  model.position.sub(center);
  model.scale.setScalar(targetSize / maxAxis);
}
