export type ProjectSource = 'month' | 'unfiled';

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  year: number;
  yearName: string;
  month: number | null;
  monthName: string | null;
  source: ProjectSource;
  modifiedAt: string | null;
  excluded: boolean;
  favorite: boolean;
  lastOpenedAt: string | null;
  duplicateName: boolean;
}

export interface ScanError {
  path: string;
  message: string;
  code?: string;
}

export interface ProjectSnapshot {
  rootPath: string;
  scannedAt: string;
  projects: ProjectRecord[];
  errors: ScanError[];
  watchActive: boolean;
}

export interface RecentProject {
  relativePath: string;
  openedAt: string;
}

export interface AppSettings {
  version: 1;
  rootPath: string;
  excluded: string[];
  favorites: string[];
  recent: RecentProject[];
  expandedNodes: string[];
  expandedStateInitialized: boolean;
}

export interface ProjectFlagUpdate {
  relativePath: string;
  excluded?: boolean;
  favorite?: boolean;
}

export interface UiStateUpdate {
  expandedNodes: string[];
  expandedStateInitialized: boolean;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface ProjectApi {
  scanProjects: () => Promise<ProjectSnapshot>;
  getSettings: () => Promise<AppSettings>;
  chooseRoot: () => Promise<ProjectSnapshot | null>;
  updateProjectFlags: (update: ProjectFlagUpdate) => Promise<ProjectSnapshot>;
  updateUiState: (update: UiStateUpdate) => Promise<AppSettings>;
  openFolder: (relativePath: string) => Promise<ActionResult>;
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<boolean>;
  closeWindow: () => Promise<void>;
  isWindowMaximized: () => Promise<boolean>;
  onProjectsChanged: (callback: (snapshot: ProjectSnapshot) => void) => void;
  removeProjectsChangedListener: () => void;
  onWindowMaximizedChanged: (callback: (maximized: boolean) => void) => void;
  removeWindowMaximizedListener: () => void;
}
