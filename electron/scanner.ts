import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  AppSettings,
  ProjectRecord,
  ProjectSnapshot,
  ScanError,
} from '../shared/types';

export const YEAR_PATTERN = /^(20\d{2})年$/;
export const MONTH_PATTERN = /^(?:20\d{2}年)?(0?[1-9]|1[0-2])月$/;

export interface ScannerResult {
  snapshot: ProjectSnapshot;
  watchPaths: string[];
}

function pathKey(value: string): string {
  return value.replaceAll('/', '\\').toLocaleLowerCase('zh-CN');
}

function projectId(relativePath: string): string {
  return createHash('sha1').update(pathKey(relativePath)).digest('hex').slice(0, 14);
}

export function parseYearName(name: string): number | null {
  const match = YEAR_PATTERN.exec(name);
  return match ? Number(match[1]) : null;
}

export function parseMonthName(name: string): number | null {
  const match = MONTH_PATTERN.exec(name);
  return match ? Number(match[1]) : null;
}

async function readDirectories(
  directoryPath: string,
  errors: ScanError[],
): Promise<string[]> {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    errors.push({
      path: directoryPath,
      message: nodeError.message,
      code: nodeError.code,
    });
    return [];
  }
}

async function modifiedAt(directoryPath: string): Promise<string | null> {
  try {
    return (await fs.stat(directoryPath)).mtime.toISOString();
  } catch {
    return null;
  }
}

function recentMap(settings: AppSettings): Map<string, string> {
  return new Map(
    settings.recent.map((item) => [pathKey(item.relativePath), item.openedAt]),
  );
}

export async function scanProjectRoot(
  rootPath: string,
  settings: AppSettings,
): Promise<ScannerResult> {
  const errors: ScanError[] = [];
  const watchPaths = new Set<string>();
  const projects: ProjectRecord[] = [];
  const excluded = new Set(settings.excluded.map(pathKey));
  const favorites = new Set(settings.favorites.map(pathKey));
  const opened = recentMap(settings);

  const rootDirectories = await readDirectories(rootPath, errors);
  if (errors.length === 0) {
    watchPaths.add(rootPath);
  }

  const years = rootDirectories
    .map((name) => ({ name, year: parseYearName(name) }))
    .filter((item): item is { name: string; year: number } => item.year !== null)
    .sort((a, b) => b.year - a.year);

  for (const { name: yearName, year } of years) {
    const yearPath = path.join(rootPath, yearName);
    const yearDirectories = await readDirectories(yearPath, errors);
    watchPaths.add(yearPath);

    const months = yearDirectories
      .map((name) => ({ name, month: parseMonthName(name) }))
      .filter((item): item is { name: string; month: number } => item.month !== null)
      .sort((a, b) => a.month - b.month);

    const monthNames = new Set(months.map((item) => item.name));

    for (const { name: monthName, month } of months) {
      const monthPath = path.join(yearPath, monthName);
      const childDirectories = await readDirectories(monthPath, errors);
      watchPaths.add(monthPath);

      for (const name of childDirectories.sort((a, b) => a.localeCompare(b, 'zh-CN'))) {
        const absolutePath = path.join(monthPath, name);
        const relativePath = path.relative(rootPath, absolutePath);
        const key = pathKey(relativePath);
        projects.push({
          id: projectId(relativePath),
          name,
          path: absolutePath,
          relativePath,
          year,
          yearName,
          month,
          monthName,
          source: 'month',
          modifiedAt: await modifiedAt(absolutePath),
          excluded: excluded.has(key),
          favorite: favorites.has(key),
          lastOpenedAt: opened.get(key) ?? null,
          duplicateName: false,
        });
      }
    }

    const unfiled = yearDirectories
      .filter((name) => !monthNames.has(name))
      .sort((a, b) => a.localeCompare(b, 'zh-CN'));

    for (const name of unfiled) {
      const absolutePath = path.join(yearPath, name);
      const relativePath = path.relative(rootPath, absolutePath);
      const key = pathKey(relativePath);
      projects.push({
        id: projectId(relativePath),
        name,
        path: absolutePath,
        relativePath,
        year,
        yearName,
        month: null,
        monthName: null,
        source: 'unfiled',
        modifiedAt: await modifiedAt(absolutePath),
        excluded: excluded.has(key),
        favorite: favorites.has(key),
        lastOpenedAt: opened.get(key) ?? null,
        duplicateName: false,
      });
    }
  }

  const nameCounts = new Map<string, number>();
  for (const project of projects) {
    const key = project.name.trim().toLocaleLowerCase('zh-CN');
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  for (const project of projects) {
    const key = project.name.trim().toLocaleLowerCase('zh-CN');
    project.duplicateName = (nameCounts.get(key) ?? 0) > 1;
  }

  return {
    snapshot: {
      rootPath,
      scannedAt: new Date().toISOString(),
      projects,
      errors,
      watchActive: false,
    },
    watchPaths: [...watchPaths],
  };
}
