import { cp, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const packages = ['face_mesh', 'hands'];

await Promise.all(packages.map(copyPackageAssets));

async function copyPackageAssets(packageName) {
  const source = join(root, 'node_modules', '@mediapipe', packageName);
  const target = join(root, 'public', 'vendor', 'mediapipe', packageName);

  await mkdir(target, { recursive: true });

  const files = await readdir(source);
  await Promise.all(
    files
      .filter((file) => /\.(binarypb|data|js|tflite|wasm)$/.test(file))
      .map((file) => cp(join(source, file), join(target, file))),
  );
}
