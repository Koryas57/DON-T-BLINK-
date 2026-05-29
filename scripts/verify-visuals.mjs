import { mkdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

const projectRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const screenshotDir = join(projectRoot, 'artifacts');
const screenshotPath = join(screenshotDir, 'dont-blink-visual-check.png');
const executablePath =
  process.env.PLAYWRIGHT_CHROME_PATH ??
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const devServerUrl = process.env.VISUAL_CHECK_URL ?? 'http://127.0.0.1:5173/';

await mkdir(screenshotDir, { recursive: true });
const server = await startDevServer();

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

try {
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  const errors = [];

  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon.ico')) {
      errors.push(message.text());
    }
  });

  await page.goto(devServerUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas.render-surface');
  await page.waitForTimeout(6500);

  await page.screenshot({ path: screenshotPath, fullPage: false });
  const sample = await sampleScreenshot(screenshotPath);

  if (errors.length > 0 || !sample.ok) {
    console.error(JSON.stringify({ errors, sample, screenshotPath }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ sample, screenshotPath }, null, 2));
} finally {
  await browser.close();
  server.kill();
}

async function startDevServer() {
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '--port', '5173'], {
    cwd: projectRoot,
    stdio: 'ignore',
    shell: false,
  });

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await canReachDevServer()) {
      return child;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  child.kill();
  throw new Error(`Vite dev server did not start at ${devServerUrl}`);
}

async function canReachDevServer() {
  try {
    const response = await fetch(devServerUrl, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

async function sampleScreenshot(path) {
  const image = PNG.sync.read(await readFile(path));
  let brightPixels = 0;
  let coloredPixels = 0;

  for (let index = 0; index < image.data.length; index += 4) {
    const red = image.data[index];
    const green = image.data[index + 1];
    const blue = image.data[index + 2];
    const brightness = red + green + blue;

    if (brightness > 28) {
      brightPixels += 1;
    }

    if (Math.abs(red - green) + Math.abs(green - blue) > 18 && brightness > 18) {
      coloredPixels += 1;
    }
  }

  return {
    ok: brightPixels > 2200 && coloredPixels > 1200,
    reason: 'sampled browser screenshot pixels',
    brightPixels,
    coloredPixels,
  };
}
