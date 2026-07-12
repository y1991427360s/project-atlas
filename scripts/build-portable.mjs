import { spawn } from 'node:child_process';
import { access, copyFile, cp, mkdir, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { createPackage } from '@electron/asar';

const root = process.cwd();
const outputDirectory = process.env.PROJECT_ATLAS_OUTPUT || 'release';
const releaseDirectory = path.resolve(root, outputDirectory);
const electronDirectory = path.join(root, 'node_modules', 'electron', 'dist');
const unpackedDirectory = path.join(releaseDirectory, 'win-unpacked');
const stagingDirectory = path.join(releaseDirectory, 'app-staging');

if (!releaseDirectory.startsWith(`${root}${path.sep}`)) {
  throw new Error('构建输出目录必须位于项目目录内。');
}

await access(path.join(electronDirectory, 'electron.exe'));
await mkdir(releaseDirectory, { recursive: true });
for (const entry of await readdir(releaseDirectory)) {
  await rm(path.join(releaseDirectory, entry), { recursive: true, force: true });
}
await mkdir(unpackedDirectory, { recursive: true });
await cp(electronDirectory, unpackedDirectory, { recursive: true, force: true });

await mkdir(stagingDirectory, { recursive: true });
await copyFile(path.join(root, 'package.json'), path.join(stagingDirectory, 'package.json'));
await cp(path.join(root, 'dist'), path.join(stagingDirectory, 'dist'), { recursive: true });
await cp(path.join(root, 'dist-electron'), path.join(stagingDirectory, 'dist-electron'), { recursive: true });

const resourcesDirectory = path.join(unpackedDirectory, 'resources');
await createPackage(stagingDirectory, path.join(resourcesDirectory, 'app.asar'));
await rm(path.join(resourcesDirectory, 'default_app.asar'), { force: true });
await rename(
  path.join(unpackedDirectory, 'electron.exe'),
  path.join(unpackedDirectory, '项目总览.exe'),
);
await rm(stagingDirectory, { recursive: true, force: true });

const builderScript = path.join(root, 'node_modules', 'electron-builder', 'cli.js');
const builderArguments = [
  '--win',
  'portable',
  '--prepackaged',
  unpackedDirectory,
  `--config.directories.output=${outputDirectory}`,
];

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [builderScript, ...builderArguments], {
    cwd: root,
    stdio: 'inherit',
  });
  child.once('error', reject);
  child.once('exit', (code) => resolve(code ?? 1));
});

if (exitCode !== 0) {
  throw new Error(`便携版打包失败，退出码：${exitCode}`);
}

await rm(unpackedDirectory, { recursive: true, force: true });
console.log(`便携版已生成：${path.join(releaseDirectory, '项目总览.exe')}`);
