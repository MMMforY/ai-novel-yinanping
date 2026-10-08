import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';

if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw new Error('Commit source changes before packaging a deployable release.');
const release = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const staging = resolve('.local', 'packages', release);
await mkdir(staging, { recursive: true });
const sourceFiles = execFileSync('git', ['ls-files', 'backend', 'deploy'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
for (const file of sourceFiles) {
  if (file.endsWith('/.env') || file.includes('__pycache__')) throw new Error('Unexpected private file in release.');
  const destination = join(staging, file);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(file, destination);
}
async function copyTree(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const file of await readdir(source, { withFileTypes: true })) {
    if (file.isDirectory()) await copyTree(join(source, file.name), join(destination, file.name));
    else await copyFile(join(source, file.name), join(destination, file.name));
  }
}
await copyTree('dist', join(staging, 'webdist'));
await copyFile('docs/API.md', join(staging, 'webdist/api-docs.md'));
const checksums = {};
async function hashTree(folder, prefix = '') {
  for (const file of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, file.name), relative = prefix + file.name;
    if (file.isDirectory()) await hashTree(path, relative + '/');
    else if (relative !== 'release.json') checksums[relative] = createHash('sha256').update(await readFile(path)).digest('hex');
  }
}
await hashTree(staging);
await writeFile(join(staging, 'release.json'), JSON.stringify({ release, checksums }, null, 2) + '\n');
const archive = resolve('.local', 'dieye-' + release.slice(0, 12) + '.tar.gz');
execFileSync('tar', ['-czf', archive, '-C', staging, '.']);
console.log(JSON.stringify({ release, archive, bytes: (await stat(archive)).size }));
