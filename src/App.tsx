import {
  AlertTriangle,
  Archive,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock3,
  Copy,
  EyeOff,
  Folder,
  FolderOpen,
  FolderTree,
  HardDrive,
  History,
  Minus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Square,
  Star,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AppSettings, ProjectRecord, ProjectSnapshot } from '../shared/types';
import { isDesktop, projectApi } from './api';

type ViewName = 'directory' | 'stats' | 'favorites' | 'recent' | 'excluded';
type ToastState = { message: string; tone: 'success' | 'error' | 'info' } | null;

interface ProjectGroup {
  id: string;
  label: string;
  month: number | null;
  projects: ProjectRecord[];
}

interface YearGroup {
  id: string;
  year: number;
  projects: ProjectRecord[];
  groups: ProjectGroup[];
}

const VIEW_LABELS: Record<ViewName, string> = {
  directory: '项目目录',
  stats: '统计概览',
  favorites: '收藏项目',
  recent: '最近打开',
  excluded: '已排除项目',
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN');
}

function matchesQuery(project: ProjectRecord, query: string): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  return normalize([
    project.name,
    project.path,
    project.yearName,
    project.monthName ?? '未归档',
  ].join(' ')).includes(needle);
}

function formatDate(value: string | null, withTime = false): string {
  if (!value) return '未知';
  const date = new Date(value);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    hour12: false,
  }).format(date);
}

function relativeTime(value: string | null): string {
  if (!value) return '';
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(elapsed / 60_000));
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const needle = normalize(query);
  if (!needle) return text;
  const source = text.toLocaleLowerCase('zh-CN');
  const index = source.indexOf(needle);
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  );
}

function buildGroups(projects: ProjectRecord[]): YearGroup[] {
  const byYear = new Map<number, ProjectRecord[]>();
  for (const project of projects) {
    byYear.set(project.year, [...(byYear.get(project.year) ?? []), project]);
  }

  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, yearProjects]) => {
      const byMonth = new Map<number | null, ProjectRecord[]>();
      for (const project of yearProjects) {
        byMonth.set(project.month, [...(byMonth.get(project.month) ?? []), project]);
      }
      const groups = [...byMonth.entries()]
        .sort(([a], [b]) => {
          if (a === null) return 1;
          if (b === null) return -1;
          return a - b;
        })
        .map(([month, monthProjects]) => ({
          id: `month:${year}:${month ?? 'unfiled'}`,
          label: month === null ? '未归档' : `${String(month).padStart(2, '0')} 月`,
          month,
          projects: monthProjects.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
        }));
      return {
        id: `year:${year}`,
        year,
        projects: yearProjects,
        groups,
      };
    });
}

function allNodeIds(groups: YearGroup[]): string[] {
  return groups.flatMap((year) => [year.id, ...year.groups.map((group) => group.id)]);
}

function TitleBar({ maximized, setMaximized }: { maximized: boolean; setMaximized: (value: boolean) => void }) {
  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <Archive size={16} strokeWidth={1.8} />
        <span>项目总览</span>
        {!isDesktop && <span className="preview-tag">界面预览</span>}
      </div>
      <div className="window-controls">
        <button title="最小化" aria-label="最小化" onClick={() => void projectApi.minimizeWindow()}>
          <Minus size={16} />
        </button>
        <button
          title={maximized ? '还原' : '最大化'}
          aria-label={maximized ? '还原' : '最大化'}
          onClick={async () => setMaximized(await projectApi.toggleMaximizeWindow())}
        >
          {maximized ? <Copy size={13} /> : <Square size={13} />}
        </button>
        <button className="window-close" title="关闭" aria-label="关闭" onClick={() => void projectApi.closeWindow()}>
          <X size={16} />
        </button>
      </div>
    </header>
  );
}

interface SidebarProps {
  view: ViewName;
  onView: (view: ViewName) => void;
  activeCount: number;
  favoriteCount: number;
  recentCount: number;
  excludedCount: number;
  rootPath: string;
  onChooseRoot: () => void;
}

function Sidebar(props: SidebarProps) {
  const navItems: Array<{ view: ViewName; icon: ReactNode; count?: number }> = [
    { view: 'directory', icon: <FolderTree size={18} />, count: props.activeCount },
    { view: 'stats', icon: <BarChart3 size={18} /> },
  ];
  const quickItems: Array<{ view: ViewName; icon: ReactNode; count: number }> = [
    { view: 'favorites', icon: <Star size={17} />, count: props.favoriteCount },
    { view: 'recent', icon: <History size={17} />, count: props.recentCount },
    { view: 'excluded', icon: <EyeOff size={17} />, count: props.excludedCount },
  ];
  return (
    <aside className="sidebar">
      <div className="sidebar-heading">
        <div className="archive-mark"><Archive size={22} /></div>
        <div>
          <strong>工程项目档案</strong>
          <span>PROJECT ARCHIVE</span>
        </div>
      </div>

      <nav className="primary-nav" aria-label="主要导航">
        {navItems.map((item) => (
          <button key={item.view} className={props.view === item.view ? 'active' : ''} onClick={() => props.onView(item.view)}>
            {item.icon}
            <span>{VIEW_LABELS[item.view]}</span>
            {typeof item.count === 'number' && <b>{item.count}</b>}
          </button>
        ))}
      </nav>

      <div className="nav-section-label">快捷访问</div>
      <nav className="quick-nav" aria-label="快捷访问">
        {quickItems.map((item) => (
          <button key={item.view} className={props.view === item.view ? 'active' : ''} onClick={() => props.onView(item.view)}>
            {item.icon}
            <span>{VIEW_LABELS[item.view]}</span>
            <b>{item.count}</b>
          </button>
        ))}
      </nav>

      <div className="sidebar-spacer" />
      <div className="root-source">
        <div className="root-label"><HardDrive size={15} /><span>扫描目录</span></div>
        <div className="root-path" title={props.rootPath}>{props.rootPath}</div>
        <button onClick={props.onChooseRoot}><Settings2 size={15} />更换目录</button>
      </div>
    </aside>
  );
}

interface ProjectRowProps {
  project: ProjectRecord;
  query: string;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onFavorite: () => void;
  onExclude?: () => void;
  onRestore?: () => void;
}

function ProjectRow(props: ProjectRowProps) {
  const { project } = props;
  return (
    <div
      className={`project-row ${props.selected ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={props.onSelect}
      onDoubleClick={props.onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter') props.onOpen();
        if (event.key === ' ') {
          event.preventDefault();
          props.onSelect();
        }
      }}
    >
      <div className="project-icon"><Folder size={18} fill="currentColor" /></div>
      <div className="project-copy">
        <div className="project-name">
          <Highlight text={project.name} query={props.query} />
          {project.duplicateName && <span className="duplicate-badge">同名目录</span>}
        </div>
        <div className="project-path"><Highlight text={project.relativePath} query={props.query} /></div>
      </div>
      {project.lastOpenedAt && <span className="row-recency">{relativeTime(project.lastOpenedAt)}</span>}
      <div className="row-actions">
        {!project.excluded && (
          <button
            className={project.favorite ? 'favorite active' : 'favorite'}
            title={project.favorite ? '取消收藏' : '收藏项目'}
            aria-label={project.favorite ? '取消收藏' : '收藏项目'}
            onClick={(event) => { event.stopPropagation(); props.onFavorite(); }}
          >
            <Star size={16} fill={project.favorite ? 'currentColor' : 'none'} />
          </button>
        )}
        <button title="打开文件夹" aria-label="打开文件夹" onClick={(event) => { event.stopPropagation(); props.onOpen(); }}>
          <FolderOpen size={16} />
        </button>
        {props.onExclude && (
          <button title="不计入项目" aria-label="不计入项目" onClick={(event) => { event.stopPropagation(); props.onExclude?.(); }}>
            <EyeOff size={16} />
          </button>
        )}
        {props.onRestore && (
          <button title="恢复到项目" aria-label="恢复到项目" onClick={(event) => { event.stopPropagation(); props.onRestore?.(); }}>
            <RotateCcw size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

interface TreeViewProps {
  groups: YearGroup[];
  query: string;
  expanded: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (project: ProjectRecord) => void;
  onOpen: (project: ProjectRecord) => void;
  onFavorite: (project: ProjectRecord) => void;
  onExclude: (project: ProjectRecord) => void;
}

function TreeView(props: TreeViewProps) {
  if (props.groups.length === 0) return <EmptyState icon={<Search size={28} />} title="没有匹配的项目" detail="请尝试其他关键词或检查已排除项目。" />;
  const forcedOpen = Boolean(normalize(props.query));
  const isOpen = (id: string) => forcedOpen || props.expanded.has(id);
  return (
    <div className="tree-view">
      {props.groups.map((year) => (
        <section className="year-section" key={year.id}>
          <button className="year-heading" onClick={() => props.onToggle(year.id)}>
            <span className="chevron">{isOpen(year.id) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</span>
            <span className="year-number">{year.year}</span>
            <span className="year-unit">年</span>
            <span className="section-rule" />
            <b>{year.projects.length} 个项目</b>
          </button>
          {isOpen(year.id) && (
            <div className="year-content">
              {year.groups.map((group) => (
                <div className="month-group" key={group.id}>
                  <button className="month-heading" onClick={() => props.onToggle(group.id)}>
                    <span className="chevron">{isOpen(group.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                    <CalendarDays size={16} />
                    <span>{group.label}</span>
                    <b>{group.projects.length}</b>
                  </button>
                  {isOpen(group.id) && (
                    <div className="project-list">
                      {group.projects.map((project) => (
                        <ProjectRow
                          key={project.id}
                          project={project}
                          query={props.query}
                          selected={props.selectedId === project.id}
                          onSelect={() => props.onSelect(project)}
                          onOpen={() => props.onOpen(project)}
                          onFavorite={() => props.onFavorite(project)}
                          onExclude={() => props.onExclude(project)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function EmptyState({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="empty-state">
      <div>{icon}</div>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

interface FlatListProps {
  projects: ProjectRecord[];
  query: string;
  selectedId: string | null;
  emptyTitle: string;
  emptyDetail: string;
  onSelect: (project: ProjectRecord) => void;
  onOpen: (project: ProjectRecord) => void;
  onFavorite: (project: ProjectRecord) => void;
  onExclude?: (project: ProjectRecord) => void;
  onRestore?: (project: ProjectRecord) => void;
}

function FlatList(props: FlatListProps) {
  if (props.projects.length === 0) {
    return <EmptyState icon={<Archive size={28} />} title={props.emptyTitle} detail={props.emptyDetail} />;
  }
  return (
    <div className="flat-list">
      {props.projects.map((project) => (
        <ProjectRow
          key={project.id}
          project={project}
          query={props.query}
          selected={props.selectedId === project.id}
          onSelect={() => props.onSelect(project)}
          onOpen={() => props.onOpen(project)}
          onFavorite={() => props.onFavorite(project)}
          onExclude={props.onExclude ? () => props.onExclude?.(project) : undefined}
          onRestore={props.onRestore ? () => props.onRestore?.(project) : undefined}
        />
      ))}
    </div>
  );
}

function StatsView({ projects, excludedCount }: { projects: ProjectRecord[]; excludedCount: number }) {
  const years = useMemo(() => {
    const map = new Map<number, ProjectRecord[]>();
    for (const project of projects) map.set(project.year, [...(map.get(project.year) ?? []), project]);
    return [...map.entries()].sort(([a], [b]) => b - a);
  }, [projects]);
  const maxYear = Math.max(1, ...years.map(([, list]) => list.length));
  const favoriteCount = projects.filter((item) => item.favorite).length;
  const unfiledCount = projects.filter((item) => item.source === 'unfiled').length;

  return (
    <div className="stats-view">
      <div className="metric-strip">
        <div><span>有效项目</span><strong>{projects.length}</strong></div>
        <div><span>年份跨度</span><strong>{years.length}</strong></div>
        <div><span>收藏项目</span><strong>{favoriteCount}</strong></div>
        <div><span>未归档</span><strong>{unfiledCount}</strong></div>
        <div><span>已排除</span><strong>{excludedCount}</strong></div>
      </div>

      <section className="chart-section">
        <div className="chart-title"><div><span>年度项目数量</span><strong>按归档年份统计</strong></div><BarChart3 size={20} /></div>
        <div className="year-bars">
          {years.map(([year, list]) => (
            <div className="year-bar-row" key={year}>
              <span>{year}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(list.length / maxYear) * 100}%` }} /></div>
              <b>{list.length}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="chart-section monthly-section">
        <div className="chart-title"><div><span>月度分布</span><strong>每格代表该月项目数量</strong></div><CalendarDays size={20} /></div>
        <div className="month-grid-header">
          <span />
          {Array.from({ length: 12 }, (_, index) => <b key={index}>{String(index + 1).padStart(2, '0')}</b>)}
          <b>未归档</b>
        </div>
        {years.map(([year, list]) => {
          const counts = Array.from({ length: 12 }, (_, index) => list.filter((item) => item.month === index + 1).length);
          const unfiled = list.filter((item) => item.month === null).length;
          const maxMonth = Math.max(1, ...counts, unfiled);
          return (
            <div className="month-grid-row" key={year}>
              <strong>{year}</strong>
              {[...counts, unfiled].map((count, index) => (
                <div
                  key={index}
                  className={`month-cell ${count ? 'has-value' : ''} ${index === 12 ? 'unfiled' : ''}`}
                  style={{ '--intensity': count / maxMonth } as React.CSSProperties}
                  title={`${index === 12 ? '未归档' : `${index + 1}月`}：${count} 个项目`}
                >
                  {count || '—'}
                </div>
              ))}
            </div>
          );
        })}
      </section>
    </div>
  );
}

interface InspectorProps {
  project: ProjectRecord;
  onClose: () => void;
  onOpen: () => void;
  onFavorite: () => void;
  onExclude: () => void;
  onRestore: () => void;
}

function Inspector(props: InspectorProps) {
  const { project } = props;
  return (
    <aside className="inspector">
      <div className="inspector-header">
        <span>项目信息</span>
        <button title="关闭详情" aria-label="关闭详情" onClick={props.onClose}><X size={17} /></button>
      </div>
      <div className="inspector-project-icon"><FolderOpen size={25} /></div>
      <h2>{project.name}</h2>
      {project.duplicateName && <div className="duplicate-warning"><AlertTriangle size={15} />存在同名项目，请按路径区分</div>}
      <dl>
        <div><dt>归档年份</dt><dd>{project.year} 年</dd></div>
        <div><dt>归档月份</dt><dd>{project.month === null ? '未归档' : `${project.month} 月`}</dd></div>
        <div><dt>最近修改</dt><dd>{formatDate(project.modifiedAt)}</dd></div>
        {project.lastOpenedAt && <div><dt>最近打开</dt><dd>{formatDate(project.lastOpenedAt, true)}</dd></div>}
      </dl>
      <div className="path-block">
        <span>完整路径</span>
        <p>{project.path}</p>
      </div>
      <div className="inspector-actions">
        <button className="primary-action" onClick={props.onOpen}><FolderOpen size={17} />打开文件夹</button>
        {!project.excluded && (
          <button onClick={props.onFavorite}><Star size={17} fill={project.favorite ? 'currentColor' : 'none'} />{project.favorite ? '取消收藏' : '收藏项目'}</button>
        )}
        {project.excluded ? (
          <button onClick={props.onRestore}><RotateCcw size={17} />恢复到项目</button>
        ) : (
          <button className="danger-action" onClick={props.onExclude}><EyeOff size={17} />不计入项目</button>
        )}
      </div>
    </aside>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [view, setView] = useState<ViewName>('directory');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((message: string, tone: ToastState extends null ? never : 'success' | 'error' | 'info') => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ message, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const activeProjects = useMemo(
    () => snapshot?.projects.filter((project) => !project.excluded) ?? [],
    [snapshot],
  );
  const excludedProjects = useMemo(
    () => snapshot?.projects.filter((project) => project.excluded) ?? [],
    [snapshot],
  );
  const allGroups = useMemo(() => buildGroups(activeProjects), [activeProjects]);

  const initializeExpanded = useCallback(async (nextSnapshot: ProjectSnapshot, settings: AppSettings) => {
    if (settings.expandedStateInitialized) {
      setExpanded(new Set(settings.expandedNodes));
      return;
    }
    const ids = allNodeIds(buildGroups(nextSnapshot.projects.filter((project) => !project.excluded)));
    setExpanded(new Set(ids));
    await projectApi.updateUiState({ expandedNodes: ids, expandedStateInitialized: true });
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      projectApi.scanProjects(),
      projectApi.getSettings(),
      projectApi.isWindowMaximized(),
    ]).then(async ([nextSnapshot, settings, isMaximized]) => {
      if (!active) return;
      setSnapshot(nextSnapshot);
      setMaximized(isMaximized);
      await initializeExpanded(nextSnapshot, settings);
      if (active) setLoading(false);
    }).catch((error) => {
      if (!active) return;
      setLoading(false);
      showToast(error instanceof Error ? error.message : '程序初始化失败。', 'error');
    });

    projectApi.onProjectsChanged((nextSnapshot) => {
      if (active) setSnapshot(nextSnapshot);
    });
    projectApi.onWindowMaximizedChanged((value) => {
      if (active) setMaximized(value);
    });
    return () => {
      active = false;
      projectApi.removeProjectsChangedListener();
      projectApi.removeWindowMaximizedListener();
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, [initializeExpanded, showToast]);

  useEffect(() => {
    if (selectedId && !snapshot?.projects.some((project) => project.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, snapshot]);

  const selectedProject = snapshot?.projects.find((project) => project.id === selectedId) ?? null;

  const persistExpanded = useCallback((next: Set<string>) => {
    setExpanded(next);
    void projectApi.updateUiState({ expandedNodes: [...next], expandedStateInitialized: true });
  }, []);

  const toggleNode = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    persistExpanded(next);
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      setSnapshot(await projectApi.scanProjects());
      showToast('项目目录已刷新。', 'success');
    } catch {
      showToast('刷新失败，请检查扫描目录。', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const chooseRoot = async () => {
    const nextSnapshot = await projectApi.chooseRoot();
    if (!nextSnapshot) return;
    setSnapshot(nextSnapshot);
    setSelectedId(null);
    const settings = await projectApi.getSettings();
    await initializeExpanded(nextSnapshot, settings);
    showToast('扫描目录已更新。', 'success');
  };

  const openProject = async (project: ProjectRecord) => {
    const result = await projectApi.openFolder(project.relativePath);
    if (!result.ok) showToast(result.error ?? '无法打开项目文件夹。', 'error');
  };

  const toggleFavorite = async (project: ProjectRecord) => {
    const next = await projectApi.updateProjectFlags({
      relativePath: project.relativePath,
      favorite: !project.favorite,
    });
    setSnapshot(next);
    showToast(project.favorite ? '已取消收藏。' : '已加入收藏。', 'success');
  };

  const excludeProject = async (project: ProjectRecord) => {
    const next = await projectApi.updateProjectFlags({ relativePath: project.relativePath, excluded: true });
    setSnapshot(next);
    setSelectedId(null);
    showToast('已从项目统计中排除。', 'info');
  };

  const restoreProject = async (project: ProjectRecord) => {
    const next = await projectApi.updateProjectFlags({ relativePath: project.relativePath, excluded: false });
    setSnapshot(next);
    showToast('项目已恢复。', 'success');
  };

  const visibleProjects = useMemo(() => {
    let projects: ProjectRecord[];
    if (view === 'excluded') projects = excludedProjects;
    else if (view === 'favorites') projects = activeProjects.filter((project) => project.favorite);
    else if (view === 'recent') {
      projects = activeProjects
        .filter((project) => project.lastOpenedAt)
        .sort((a, b) => new Date(b.lastOpenedAt!).getTime() - new Date(a.lastOpenedAt!).getTime());
    } else projects = activeProjects;
    return projects.filter((project) => matchesQuery(project, query));
  }, [activeProjects, excludedProjects, query, view]);

  const visibleGroups = useMemo(() => buildGroups(visibleProjects), [visibleProjects]);
  const favoriteCount = activeProjects.filter((project) => project.favorite).length;
  const recentCount = activeProjects.filter((project) => project.lastOpenedAt).length;

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-mark"><Archive size={30} /></div>
        <strong>项目总览</strong>
        <span>正在读取项目目录…</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TitleBar maximized={maximized} setMaximized={setMaximized} />
      <div className="workspace">
        <Sidebar
          view={view}
          onView={(nextView) => { setView(nextView); setSelectedId(null); }}
          activeCount={activeProjects.length}
          favoriteCount={favoriteCount}
          recentCount={recentCount}
          excludedCount={excludedProjects.length}
          rootPath={snapshot?.rootPath ?? ''}
          onChooseRoot={() => void chooseRoot()}
        />

        <main className="main-pane">
          <header className="content-toolbar">
            <div className="view-title">
              <span>{VIEW_LABELS[view]}</span>
              <b>{view === 'stats' ? `${activeProjects.length} 个有效项目` : `${visibleProjects.length} 项`}</b>
            </div>
            {view !== 'stats' && (
              <label className="search-box">
                <Search size={17} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目、年份、月份或路径" />
                {query && <button title="清除搜索" aria-label="清除搜索" onClick={() => setQuery('')}><X size={15} /></button>}
              </label>
            )}
            <div className="toolbar-actions">
              {view === 'directory' && (
                <>
                  <button title="全部展开" aria-label="全部展开" onClick={() => persistExpanded(new Set(allNodeIds(allGroups)))}><ChevronsUpDown size={17} /></button>
                  <button title="全部收起" aria-label="全部收起" onClick={() => persistExpanded(new Set())}><ChevronsDownUp size={17} /></button>
                </>
              )}
              <button className={refreshing ? 'spinning' : ''} title="刷新目录" aria-label="刷新目录" onClick={() => void refresh()}><RefreshCw size={17} /></button>
            </div>
          </header>

          {snapshot && snapshot.errors.length > 0 && (
            <div className="error-banner">
              <AlertTriangle size={17} />
              <span>部分目录无法读取：{snapshot.errors[0].path}</span>
              <button onClick={() => void chooseRoot()}>重新选择</button>
            </div>
          )}

          <div className="content-scroll">
            {view === 'directory' && (
              <TreeView
                groups={visibleGroups}
                query={query}
                expanded={expanded}
                selectedId={selectedId}
                onToggle={toggleNode}
                onSelect={(project) => setSelectedId(project.id)}
                onOpen={(project) => void openProject(project)}
                onFavorite={(project) => void toggleFavorite(project)}
                onExclude={(project) => void excludeProject(project)}
              />
            )}
            {view === 'stats' && <StatsView projects={activeProjects} excludedCount={excludedProjects.length} />}
            {view === 'favorites' && (
              <FlatList
                projects={visibleProjects}
                query={query}
                selectedId={selectedId}
                emptyTitle="还没有收藏项目"
                emptyDetail="在项目行中点击星标即可加入收藏。"
                onSelect={(project) => setSelectedId(project.id)}
                onOpen={(project) => void openProject(project)}
                onFavorite={(project) => void toggleFavorite(project)}
                onExclude={(project) => void excludeProject(project)}
              />
            )}
            {view === 'recent' && (
              <FlatList
                projects={visibleProjects}
                query={query}
                selectedId={selectedId}
                emptyTitle="暂无打开记录"
                emptyDetail="打开项目文件夹后会自动出现在这里。"
                onSelect={(project) => setSelectedId(project.id)}
                onOpen={(project) => void openProject(project)}
                onFavorite={(project) => void toggleFavorite(project)}
                onExclude={(project) => void excludeProject(project)}
              />
            )}
            {view === 'excluded' && (
              <FlatList
                projects={visibleProjects}
                query={query}
                selectedId={selectedId}
                emptyTitle="没有已排除项目"
                emptyDetail="标记为非项目的资料目录会集中显示在这里。"
                onSelect={(project) => setSelectedId(project.id)}
                onOpen={(project) => void openProject(project)}
                onFavorite={() => undefined}
                onRestore={(project) => void restoreProject(project)}
              />
            )}
          </div>

          <footer className="statusbar">
            <span className={snapshot?.watchActive ? 'watch-dot active' : 'watch-dot'} />
            <span>{snapshot?.watchActive ? '目录监控中' : '目录监控未启用'}</span>
            <span className="status-separator" />
            <span>更新于 {formatDate(snapshot?.scannedAt ?? null, true)}</span>
          </footer>
        </main>

        {selectedProject && (
          <Inspector
            project={selectedProject}
            onClose={() => setSelectedId(null)}
            onOpen={() => void openProject(selectedProject)}
            onFavorite={() => void toggleFavorite(selectedProject)}
            onExclude={() => void excludeProject(selectedProject)}
            onRestore={() => void restoreProject(selectedProject)}
          />
        )}
      </div>
      {toast && <div className={`toast ${toast.tone}`}>{toast.message}</div>}
    </div>
  );
}
