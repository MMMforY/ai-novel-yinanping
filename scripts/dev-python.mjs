import 'dotenv/config';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const python = process.env.PYTHON_BIN || resolve(process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const children = [
  spawn(python, ['-m', 'uvicorn', 'backend.app:app', '--host', '127.0.0.1', '--port', process.env.API_PORT || '8787'], { stdio: 'inherit' }),
  spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js')], { stdio: 'inherit' }),
];
let stopped = false;
function stop(code = 0) { if (stopped) return; stopped = true; for (const child of children) if (!child.killed) child.kill(); process.exitCode = code; }
for (const child of children) {
  child.on('error', () => { console.error('请先准备 Python 3.12 虚拟环境与 backend/requirements.txt 依赖。'); stop(1); });
  child.on('exit', code => { if (!stopped) stop(code || 0); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
