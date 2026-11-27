import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const serverEntry = path.join(root, 'server', 'index.mjs');

const children = [
  spawn(process.execPath, [serverEntry], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, [viteBin, ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' }),
];

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) {
      try { child.kill('SIGTERM'); } catch { /* ignore already-exited child */ }
    }
  }
  process.exitCode = code;
}

for (const child of children) {
  child.on('exit', (code) => {
    if (!shuttingDown) shutdown(code ?? 0);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
