// Development-only launcher for the Angular UI and visual fixture API.
// Run from the repository root with `npm run demo`.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = process.env.npm_execpath;
const children = [];
let stopping = false;

if (!npmCli) {
  throw new Error('Start the visual demo through npm: npm run demo');
}

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  });
  children.push(child);
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
  return child;
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(exitCode), 500).unref();
}

console.log('Starting the key-free visual demo...');
console.log('Open http://127.0.0.1:4200/ when Angular is ready.');

start(process.execPath, ['scripts/visual-fixture-api.mjs']);
start(process.execPath, [npmCli, 'run', 'start', '--workspace', 'web', '--', '--host', '127.0.0.1']);

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
