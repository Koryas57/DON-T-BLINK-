import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const gradleHome = process.env.DONT_BLINK_GRADLE_HOME ?? getDefaultGradleHome(root);
const gradlew = join(root, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
const args = ['-p', join(root, 'android'), ...process.argv.slice(2)];

await mkdir(gradleHome, { recursive: true });

const command = process.platform === 'win32' ? 'powershell.exe' : gradlew;
const commandArgs =
  process.platform === 'win32'
    ? [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `& ${psQuote(gradlew)} ${args.map(psQuote).join(' ')}`,
      ]
    : args;

const child = spawn(command, commandArgs, {
  cwd: root,
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    GRADLE_USER_HOME: gradleHome,
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

function psQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function getDefaultGradleHome(projectRoot) {
  if (process.platform === 'win32') {
    const drive = projectRoot.slice(0, 3);
    return join(drive, '.gradle-dont-blink');
  }

  return join(projectRoot, '.gradle-user-home');
}
