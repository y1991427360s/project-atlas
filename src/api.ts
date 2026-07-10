import type {
  AppSettings,
  ProjectApi,
  ProjectRecord,
  ProjectSnapshot,
} from '../shared/types';

const names2026: Record<number, string[]> = {
  1: [
    '北区数据中心110kV变电站',
    '城市通信中心配电改造',
    '设计资料',
    '智慧楼宇实验室10kV配电项目',
    'BIM电缆敷设方案',
    'PDF学习文档',
  ],
  2: [
    '海上风电110kV升压站EPC工程',
    '工业园66kV变电站',
    '新能源220kV主变压器技术协议',
    '自校审核单',
  ],
  3: ['煤矿35kV变电站', '零碳产业园110kV变电站'],
  4: ['能源基地110kV变电站'],
  5: ['定值计算练习', '电缆工具项目', '新能源无人值守升压站典型设计', '住宅配电项目', '接地电阻计算'],
  6: ['技术交流材料', '核电项目设计标准', '质量体系审核资料'],
  7: ['东区变电站改造'],
};

const names2025 = [
  '食品工厂110kV变电站',
  '智能产业基地110kV变电站竣工图',
  '城郊风电场',
  '新能源35kV开关站',
  '汽车产业园配电项目',
  '西北风电项目',
  '智能生态科技园二期项目',
];

function makeProject(
  name: string,
  year: number,
  month: number | null,
  index: number,
  source: 'month' | 'unfiled' = 'month',
): ProjectRecord {
  const yearName = `${year}年`;
  const monthName = month === null ? null : year === 2025 ? '2025年12月' : `${String(month).padStart(2, '0')}月`;
  const relativePath = monthName
    ? `${yearName}\\${monthName}\\${name}`
    : `${yearName}\\${name}`;
  return {
    id: `demo-${year}-${month ?? 'u'}-${index}`,
    name,
    path: `C:\\Projects\\${relativePath}`,
    relativePath,
    year,
    yearName,
    month,
    monthName,
    source,
    modifiedAt: new Date(2026, Math.max(0, (month ?? 7) - 1), Math.min(28, index + 2), 10, 20).toISOString(),
    excluded: false,
    favorite: name.includes('城市通信中心') || name.includes('电缆工具项目'),
    lastOpenedAt: name.includes('城市通信中心')
      ? new Date(Date.now() - 12 * 60 * 1000).toISOString()
      : name.includes('东区变电站改造')
        ? new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
        : null,
    duplicateName: name === '新能源35kV开关站',
  };
}

let projects: ProjectRecord[] = [
  ...Object.entries(names2026).flatMap(([month, names]) =>
    names.map((name, index) => makeProject(name, 2026, Number(month), index)),
  ),
  ...names2025.map((name, index) => makeProject(name, 2025, 12, index)),
  makeProject('新能源35kV开关站', 2025, null, 0, 'unfiled'),
  makeProject('PPT', 2025, null, 1, 'unfiled'),
];

let settings: AppSettings = {
  version: 1,
  rootPath: 'C:\\Projects',
  excluded: [],
  favorites: projects.filter((item) => item.favorite).map((item) => item.relativePath),
  recent: projects
    .filter((item) => item.lastOpenedAt)
    .map((item) => ({ relativePath: item.relativePath, openedAt: item.lastOpenedAt! })),
  expandedNodes: [],
  expandedStateInitialized: false,
};

let projectChanged: ((snapshot: ProjectSnapshot) => void) | null = null;
let maximizedChanged: ((maximized: boolean) => void) | null = null;
let maximized = false;

function snapshot(): ProjectSnapshot {
  return {
    rootPath: settings.rootPath,
    scannedAt: new Date().toISOString(),
    projects: structuredClone(projects),
    errors: [],
    watchActive: true,
  };
}

function emit(): ProjectSnapshot {
  const next = snapshot();
  projectChanged?.(next);
  return next;
}

const mockApi: ProjectApi = {
  scanProjects: async () => snapshot(),
  getSettings: async () => structuredClone(settings),
  chooseRoot: async () => snapshot(),
  updateProjectFlags: async (update) => {
    projects = projects.map((project) => {
      if (project.relativePath !== update.relativePath) return project;
      return {
        ...project,
        excluded: update.excluded ?? project.excluded,
        favorite: update.excluded ? false : (update.favorite ?? project.favorite),
      };
    });
    settings.excluded = projects.filter((item) => item.excluded).map((item) => item.relativePath);
    settings.favorites = projects.filter((item) => item.favorite).map((item) => item.relativePath);
    return emit();
  },
  updateUiState: async (update) => {
    settings = { ...settings, ...update };
    return structuredClone(settings);
  },
  openFolder: async (relativePath) => {
    const openedAt = new Date().toISOString();
    projects = projects.map((project) =>
      project.relativePath === relativePath ? { ...project, lastOpenedAt: openedAt } : project,
    );
    emit();
    return { ok: true };
  },
  minimizeWindow: async () => undefined,
  toggleMaximizeWindow: async () => {
    maximized = !maximized;
    maximizedChanged?.(maximized);
    return maximized;
  },
  closeWindow: async () => undefined,
  isWindowMaximized: async () => maximized,
  onProjectsChanged: (callback) => {
    projectChanged = callback;
  },
  removeProjectsChangedListener: () => {
    projectChanged = null;
  },
  onWindowMaximizedChanged: (callback) => {
    maximizedChanged = callback;
  },
  removeWindowMaximizedListener: () => {
    maximizedChanged = null;
  },
};

export const projectApi = window.projectApi ?? mockApi;
export const isDesktop = Boolean(window.projectApi);
