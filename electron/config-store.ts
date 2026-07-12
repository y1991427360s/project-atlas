import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  AppSettings,
  ProjectFlagUpdate,
  RecentProject,
  UiStateUpdate,
} from '../shared/types';

const FALLBACK_ROOT = 'E:\\Projects';

function defaults(rootPath = FALLBACK_ROOT): AppSettings {
  return {
    version: 1,
    rootPath,
    excluded: [],
    favorites: [],
    recent: [],
    expandedNodes: [],
    expandedStateInitialized: false,
    canvasExpandedNodes: [],
    canvasExpandedStateInitialized: false,
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function sanitizeRecent(value: unknown): RecentProject[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is RecentProject =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as RecentProject).relativePath === 'string' &&
        typeof (item as RecentProject).openedAt === 'string',
    )
    .slice(0, 20);
}

function sanitize(value: unknown, defaultRoot: string): AppSettings {
  if (typeof value !== 'object' || value === null) return defaults(defaultRoot);
  const raw = value as Partial<AppSettings>;
  return {
    version: 1,
    rootPath: typeof raw.rootPath === 'string' && raw.rootPath ? raw.rootPath : defaultRoot,
    excluded: stringArray(raw.excluded),
    favorites: stringArray(raw.favorites),
    recent: sanitizeRecent(raw.recent),
    expandedNodes: stringArray(raw.expandedNodes),
    expandedStateInitialized: raw.expandedStateInitialized === true,
    canvasExpandedNodes: stringArray(raw.canvasExpandedNodes),
    canvasExpandedStateInitialized: raw.canvasExpandedStateInitialized === true,
  };
}

function pathKey(value: string): string {
  return value.replaceAll('/', '\\').toLocaleLowerCase('zh-CN');
}

function togglePath(list: string[], value: string, enabled: boolean): string[] {
  const key = pathKey(value);
  const without = list.filter((item) => pathKey(item) !== key);
  return enabled ? [...without, value] : without;
}

export class ConfigStore {
  private settings: AppSettings;
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly defaultRoot = FALLBACK_ROOT,
  ) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    if (!existsSync(filePath)) {
      this.settings = defaults(this.defaultRoot);
      void this.persist();
      return;
    }

    try {
      this.settings = sanitize(JSON.parse(readFileSync(filePath, 'utf8')), this.defaultRoot);
    } catch {
      this.settings = defaults(this.defaultRoot);
      void this.persist();
    }
  }

  get(): AppSettings {
    return structuredClone(this.settings);
  }

  async setRootPath(rootPath: string): Promise<AppSettings> {
    if (pathKey(rootPath) === pathKey(this.settings.rootPath)) return this.get();
    this.settings = {
      ...defaults(rootPath),
    };
    await this.persist();
    return this.get();
  }

  async updateFlags(update: ProjectFlagUpdate): Promise<AppSettings> {
    if (typeof update.excluded === 'boolean') {
      this.settings.excluded = togglePath(
        this.settings.excluded,
        update.relativePath,
        update.excluded,
      );
      if (update.excluded) {
        this.settings.favorites = togglePath(
          this.settings.favorites,
          update.relativePath,
          false,
        );
      }
    }
    if (typeof update.favorite === 'boolean' && !this.settings.excluded.some(
      (item) => pathKey(item) === pathKey(update.relativePath),
    )) {
      this.settings.favorites = togglePath(
        this.settings.favorites,
        update.relativePath,
        update.favorite,
      );
    }
    await this.persist();
    return this.get();
  }

  async addRecent(relativePath: string): Promise<AppSettings> {
    const key = pathKey(relativePath);
    const recent = this.settings.recent.filter((item) => pathKey(item.relativePath) !== key);
    this.settings.recent = [
      { relativePath, openedAt: new Date().toISOString() },
      ...recent,
    ].slice(0, 20);
    await this.persist();
    return this.get();
  }

  async updateUiState(update: UiStateUpdate): Promise<AppSettings> {
    if (update.expandedNodes) {
      this.settings.expandedNodes = [...new Set(update.expandedNodes)];
    }
    if (typeof update.expandedStateInitialized === 'boolean') {
      this.settings.expandedStateInitialized = update.expandedStateInitialized;
    }
    if (update.canvasExpandedNodes) {
      this.settings.canvasExpandedNodes = [...new Set(update.canvasExpandedNodes)];
    }
    if (typeof update.canvasExpandedStateInitialized === 'boolean') {
      this.settings.canvasExpandedStateInitialized = update.canvasExpandedStateInitialized;
    }
    await this.persist();
    return this.get();
  }

  private persist(): Promise<void> {
    const serialized = JSON.stringify(this.settings, null, 2);
    this.saveQueue = this.saveQueue.then(() => fs.writeFile(this.filePath, serialized, 'utf8'));
    return this.saveQueue;
  }
}
