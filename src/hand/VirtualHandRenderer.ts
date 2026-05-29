import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Handedness, HandTrackingData } from '../tracking/HandTrackingTypes';
import { createHandBoneMap, HandRetargeting, type HandBoneMap, type RetargetedHandPose } from './HandRetargeting';

const MODEL_URL = '/assets/models/Rigged Hand.fbx';
const COLOR_URL = '/assets/models/textures/HAND_C.jpg';
const NORMAL_URL = '/assets/models/textures/HAND_N%20.jpg';
const SPECULAR_URL = '/assets/models/textures/HAND_S.jpg';

interface HandSlot {
  handedness: Handedness;
  controller: THREE.Group;
  retargeting: HandRetargeting;
  boneMap: HandBoneMap;
  pose: RetargetedHandPose | null;
  material: THREE.MeshPhysicalMaterial;
}

export class VirtualHandRenderer {
  readonly root = new THREE.Group();

  private readonly loader = new FBXLoader();
  private readonly textureLoader = new THREE.TextureLoader();
  private readonly baseMaterial: THREE.MeshPhysicalMaterial;
  private baseModel: THREE.Object3D | null = null;
  private slots: HandSlot[] = [];
  private ready = false;

  constructor() {
    this.root.visible = false;
    this.baseMaterial = this.createMaterial();
    void this.load();
  }

  get isReady(): boolean {
    return this.ready;
  }

  get pose(): RetargetedHandPose | null {
    return this.slots.find((slot) => slot.pose)?.pose ?? null;
  }

  update(hands: HandTrackingData[], camera: THREE.PerspectiveCamera): void {
    if (!this.ready) {
      this.root.visible = false;
      return;
    }

    const activeHands = hands.slice(0, 2);
    this.root.visible = activeHands.length > 0;

    const usedHandIds = new Set<number>();

    for (const slot of this.slots) {
      const hand = activeHands.find((candidate) => candidate.handedness === slot.handedness)
        ?? activeHands.find((candidate) => candidate.handedness === 'Unknown' && !usedHandIds.has(candidate.id))
        ?? null;

      if (!hand) {
        slot.pose = null;
        slot.retargeting.reset(slot.controller);
        continue;
      }

      usedHandIds.add(hand.id);
      slot.pose = slot.retargeting.update(slot.controller, slot.boneMap, hand, camera);
      slot.material.opacity = THREE.MathUtils.lerp(0.42, 0.82, hand.controller.confidence);
      slot.material.emissiveIntensity = 0.05 + hand.controller.pinchStrength * 0.08;
    }
  }

  dispose(): void {
    this.root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
    });

    for (const slot of this.slots) {
      slot.material.map?.dispose();
      slot.material.normalMap?.dispose();
      slot.material.roughnessMap?.dispose();
      slot.material.dispose();
    }

    this.baseMaterial.dispose();
  }

  private async load(): Promise<void> {
    const model = await this.loader.loadAsync(MODEL_URL);
    const meshNames: string[] = [];
    const skeletonNames: string[] = [];
    const boneNames: string[] = [];

    model.name = 'Rigged Hand Source';
    model.visible = true;

    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      const skinnedMesh = child as THREE.SkinnedMesh;

      if (mesh.isMesh) {
        meshNames.push(child.name || '(unnamed mesh)');
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
        mesh.material = this.baseMaterial;
      }

      if (skinnedMesh.isSkinnedMesh && skinnedMesh.skeleton) {
        skeletonNames.push(`${child.name || '(unnamed skeleton mesh)'}: ${skinnedMesh.skeleton.bones.map((bone) => bone.name).join(', ')}`);
      }

      if ((child as THREE.Bone).isBone) {
        boneNames.push(child.name || '(unnamed bone)');
      }
    });

    this.normalizeModel(model);
    this.baseModel = model;
    this.slots = [this.createSlot('Left'), this.createSlot('Right')];
    this.ready = true;

    console.info('[DONT BLINK] FBX hand hierarchy', {
      meshNames,
      skeletonNames,
      boneNames,
      slots: this.slots.map((slot) => ({
        handedness: slot.handedness,
        wrist: slot.boneMap.wrist?.name ?? null,
        index: slot.boneMap.index.map((bone) => bone.name),
      })),
    });
  }

  private createSlot(handedness: Handedness): HandSlot {
    if (!this.baseModel) {
      throw new Error('Cannot create hand slot before the FBX model is loaded.');
    }

    const model = cloneSkeleton(this.baseModel);
    const material = this.createMaterial();
    const controller = new THREE.Group();
    const retargeting = new HandRetargeting();

    model.traverse((child) => {
      const mesh = child as THREE.Mesh;

      if (mesh.isMesh) {
        mesh.material = material;
        mesh.frustumCulled = false;
        mesh.visible = shouldKeepObjectForHand(mesh.name, handedness);
        mesh.geometry = filterGeometryForHand(mesh.geometry, (mesh as THREE.SkinnedMesh).skeleton?.bones ?? [], handedness);
      }

      if ((child as THREE.Bone).isBone) {
        child.visible = shouldKeepObjectForHand(child.name, handedness);
      }
    });

    controller.visible = false;
    controller.add(model);
    this.root.add(controller);

    return {
      handedness,
      controller,
      retargeting,
      boneMap: createHandBoneMap(model, handedness),
      pose: null,
      material,
    };
  }

  private createMaterial(): THREE.MeshPhysicalMaterial {
    const colorMap = this.textureLoader.load(COLOR_URL);
    const normalMap = this.textureLoader.load(NORMAL_URL);
    const roughnessMap = this.textureLoader.load(SPECULAR_URL);

    colorMap.colorSpace = THREE.SRGBColorSpace;
    normalMap.colorSpace = THREE.NoColorSpace;
    roughnessMap.colorSpace = THREE.NoColorSpace;

    return new THREE.MeshPhysicalMaterial({
      map: colorMap,
      normalMap,
      roughnessMap,
      color: 0xdceeff,
      roughness: 0.56,
      metalness: 0,
      transparent: true,
      opacity: 0.72,
      emissive: 0x76b7ce,
      emissiveIntensity: 0.06,
      clearcoat: 0.16,
      clearcoatRoughness: 0.74,
      depthWrite: false,
    });
  }

  private normalizeModel(model: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxAxis = Math.max(size.x, size.y, size.z, 0.001);
    const scale = 3.1 / maxAxis;

    model.position.sub(center);
    model.scale.setScalar(scale);
    model.rotation.set(Math.PI * 0.5, Math.PI, 0);

    console.info('[DONT BLINK] normalized hand model', {
      sourceSize: size.toArray(),
      sourceCenter: center.toArray(),
      scale,
    });
  }
}

function shouldKeepObjectForHand(name: string, handedness: Handedness): boolean {
  const suffix = handedness === 'Left' ? '.L' : '.R';
  const oppositeSuffix = handedness === 'Left' ? '.R' : '.L';

  if (name.includes(oppositeSuffix)) {
    return false;
  }

  if (name.includes(suffix)) {
    return true;
  }

  return true;
}

function filterGeometryForHand(source: THREE.BufferGeometry, bones: THREE.Bone[], handedness: Handedness): THREE.BufferGeometry {
  const skinIndex = source.getAttribute('skinIndex');
  const skinWeight = source.getAttribute('skinWeight');

  if (!skinIndex || !skinWeight || bones.length === 0) {
    return source.clone();
  }

  const suffix = handedness === 'Left' ? '.L' : '.R';
  const oppositeSuffix = handedness === 'Left' ? '.R' : '.L';
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  const filtered = new THREE.BufferGeometry();
  const vertexCount = geometry.getAttribute('position').count;
  const keepVertex = new Array(vertexCount).fill(false);
  const filteredAttributes = new Map<string, number[]>();

  for (let triangleStart = 0; triangleStart < vertexCount; triangleStart += 3) {
    let sideScore = 0;
    let oppositeScore = 0;

    for (let offset = 0; offset < 3; offset += 1) {
      const vertex = triangleStart + offset;
      const boneName = getDominantBoneName(geometry, bones, vertex);

      if (boneName.includes(suffix)) {
        sideScore += 1;
      }

      if (boneName.includes(oppositeSuffix)) {
        oppositeScore += 1;
      }
    }

    if (sideScore >= oppositeScore) {
      keepVertex[triangleStart] = true;
      keepVertex[triangleStart + 1] = true;
      keepVertex[triangleStart + 2] = true;
    }
  }

  for (const name of Object.keys(geometry.attributes)) {
    const attribute = geometry.getAttribute(name);
    const values: number[] = [];

    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      if (!keepVertex[vertex]) {
        continue;
      }

      for (let item = 0; item < attribute.itemSize; item += 1) {
        values.push(attribute.getComponent(vertex, item));
      }
    }

    filteredAttributes.set(name, values);
    filtered.setAttribute(name, new THREE.BufferAttribute(new Float32Array(values), attribute.itemSize, attribute.normalized));
  }

  filtered.computeBoundingBox();
  filtered.computeBoundingSphere();
  geometry.dispose();
  return filtered;
}

function getDominantBoneName(geometry: THREE.BufferGeometry, bones: THREE.Bone[], vertex: number): string {
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  let bestBoneIndex = 0;
  let bestWeight = -1;

  for (let item = 0; item < skinIndex.itemSize; item += 1) {
    const weight = skinWeight.getComponent(vertex, item);

    if (weight > bestWeight) {
      bestWeight = weight;
      bestBoneIndex = skinIndex.getComponent(vertex, item);
    }
  }

  return bones[bestBoneIndex]?.name ?? '';
}
