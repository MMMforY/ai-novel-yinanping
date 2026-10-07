
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

// Direct Node children keep startup portable and avoid shell command parsing.
const children = [
  spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { stdio: 'inherit' }),
  spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js')], { stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', () => { console.error('迭页启动失败，请先运行 npm install。'); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 0); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

