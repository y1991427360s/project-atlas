import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigStore } from '../electron/config-store';

const temporaryRoots: string[] = [];

async function temporaryConfig(): Promise<{ root: string; file: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'project-atlas-config-'));
  temporaryRoots.push(root);
  return { root, file: path.join(root, 'config.json') };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('本地配置', () => {
  it('保存排除、收藏、最近记录和展开状态', async () => {
    const { file } = await temporaryConfig();
    const store = new ConfigStore(file);
    const project = '2026年\\01月\\示例项目';

    await store.updateFlags({ relativePath: project, favorite: true });
    await store.addRecent(project);
    await store.updateUiState({ expandedNodes: ['year:2026', 'month:2026:1'], expandedStateInitialized: true });

    expect(store.get().favorites).toEqual([project]);
    expect(store.get().recent[0].relativePath).toBe(project);
    expect(store.get().expandedNodes).toEqual(['year:2026', 'month:2026:1']);
    expect(JSON.parse(await readFile(file, 'utf8')).version).toBe(1);
  });

  it('排除项目时自动取消收藏，切换根目录时清空路径相关状态', async () => {
    const { file, root } = await temporaryConfig();
    const store = new ConfigStore(file);
    const project = '2026年\\01月\\项目';
    await store.updateFlags({ relativePath: project, favorite: true });
    await store.updateFlags({ relativePath: project, excluded: true });

    expect(store.get().excluded).toEqual([project]);
    expect(store.get().favorites).toEqual([]);

    await store.setRootPath(root);
    expect(store.get()).toMatchObject({
      rootPath: root,
      excluded: [],
      favorites: [],
      recent: [],
      expandedNodes: [],
      expandedStateInitialized: false,
    });
  });
});
