import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppSettings } from '../shared/types';
import { parseMonthName, parseYearName, scanProjectRoot } from '../electron/scanner';

const temporaryRoots: string[] = [];

function settings(rootPath: string): AppSettings {
  return {
    version: 1,
    rootPath,
    excluded: [],
    favorites: [],
    recent: [],
    expandedNodes: [],
    expandedStateInitialized: false,
  };
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'project-atlas-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('目录名称识别', () => {
  it('识别年份与两种月份命名', () => {
    expect(parseYearName('2026年')).toBe(2026);
    expect(parseYearName('2026')).toBeNull();
    expect(parseMonthName('01月')).toBe(1);
    expect(parseMonthName('1月')).toBe(1);
    expect(parseMonthName('2025年12月')).toBe(12);
    expect(parseMonthName('13月')).toBeNull();
  });
});

describe('项目扫描', () => {
  it('只把月份下一级目录计为项目，并保留年份根部未归档目录', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, '2025年', '2025年12月', '项目甲', '内部资料', '更深层'), { recursive: true });
    await mkdir(path.join(root, '2025年', 'PPT', '演示资料'), { recursive: true });
    await mkdir(path.join(root, '2026年', '01月', '示例项目'), { recursive: true });
    await mkdir(path.join(root, '普通资料', '不应扫描'), { recursive: true });

    const { snapshot, watchPaths } = await scanProjectRoot(root, settings(root));

    expect(snapshot.errors).toEqual([]);
    expect(snapshot.projects).toHaveLength(3);
    expect(snapshot.projects.map((item) => item.name)).toEqual([
      '示例项目',
      '项目甲',
      'PPT',
    ]);
    expect(snapshot.projects.find((item) => item.name === '项目甲')).toMatchObject({
      year: 2025,
      month: 12,
      source: 'month',
    });
    expect(snapshot.projects.find((item) => item.name === 'PPT')).toMatchObject({
      month: null,
      source: 'unfiled',
    });
    expect(snapshot.projects.some((item) => item.name === '内部资料')).toBe(false);
    expect(watchPaths).toContain(path.join(root, '2026年', '01月'));
  });

  it('按相对路径应用排除、收藏和最近打开，并标记同名项目', async () => {
    const root = await temporaryRoot();
    const first = path.join('2025年', '2025年12月', '同名项目');
    const second = path.join('2026年', '01月', '同名项目');
    await mkdir(path.join(root, first), { recursive: true });
    await mkdir(path.join(root, second), { recursive: true });
    const appSettings = settings(root);
    appSettings.excluded = [first.toUpperCase()];
    appSettings.favorites = [second];
    appSettings.recent = [{ relativePath: second, openedAt: '2026-07-10T10:00:00.000Z' }];

    const { snapshot } = await scanProjectRoot(root, appSettings);
    const project2025 = snapshot.projects.find((item) => item.year === 2025)!;
    const project2026 = snapshot.projects.find((item) => item.year === 2026)!;

    expect(project2025.excluded).toBe(true);
    expect(project2026.favorite).toBe(true);
    expect(project2026.lastOpenedAt).toBe('2026-07-10T10:00:00.000Z');
    expect(snapshot.projects.every((item) => item.duplicateName)).toBe(true);
  });

  it('根目录不存在时返回可展示的错误而不是抛出异常', async () => {
    const root = path.join(os.tmpdir(), `missing-project-root-${Date.now()}`);
    const { snapshot, watchPaths } = await scanProjectRoot(root, settings(root));
    expect(snapshot.projects).toEqual([]);
    expect(snapshot.errors).toHaveLength(1);
    expect(snapshot.errors[0].path).toBe(root);
    expect(watchPaths).toEqual([]);
  });
});
