import {
  CalendarDays,
  Folder,
  FolderOpen,
  Move,
  Share2,
  Star,
} from 'lucide-react';
import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { ProjectRecord } from '../shared/types';

interface CanvasProjectGroup {
  id: string;
  label: string;
  month: number | null;
  projects: ProjectRecord[];
}

interface CanvasYearGroup {
  id: string;
  year: number;
  projects: ProjectRecord[];
  groups: CanvasProjectGroup[];
}

interface CanvasViewProps {
  groups: CanvasYearGroup[];
  query: string;
  expanded: Set<string>;
  selectedId: string | null;
  resetKey: number;
  onToggle: (id: string) => void;
  onSelect: (project: ProjectRecord) => void;
  onOpen: (project: ProjectRecord) => void;
  onFavorite: (project: ProjectRecord) => void;
}

interface Point {
  x: number;
  y: number;
}

const ROOT_NODE_ID = 'canvas:root';

export function canvasYearId(year: number): string {
  return `canvas:year:${year}`;
}

export function canvasMonthId(year: number, month: number | null): string {
  return `canvas:month:${year}:${month ?? 'unfiled'}`;
}

export function allCanvasNodeIds(groups: CanvasYearGroup[]): string[] {
  return [
    ROOT_NODE_ID,
    ...groups.flatMap((year) => [
      canvasYearId(year.year),
      ...year.groups.map((group) => canvasMonthId(year.year, group.month)),
    ]),
  ];
}

function CurlyBraceButton({
  open,
  label,
  onClick,
}: {
  open: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`canvas-brace ${open ? 'open' : 'closed'}`}
      type="button"
      aria-label={label}
      aria-expanded={open}
      title={label}
      onClick={onClick}
    >
      <svg viewBox="0 0 30 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M28 2 C11 2 11 18 11 34 C11 45 5 49 2 50 C5 51 11 55 11 66 C11 82 11 98 28 98" />
      </svg>
      <span>{open ? '−' : '+'}</span>
    </button>
  );
}

function ProjectCard({
  project,
  selected,
  onSelect,
  onOpen,
  onFavorite,
}: {
  project: ProjectRecord;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onFavorite: () => void;
}) {
  return (
    <div
      className={`canvas-project-card ${selected ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
      title={`${project.name}\n双击打开文件夹`}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen();
        if (event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <Folder size={17} fill="currentColor" />
      <span>{project.name}</span>
      <button
        type="button"
        className={project.favorite ? 'active' : ''}
        title={project.favorite ? '取消收藏' : '收藏项目'}
        aria-label={project.favorite ? '取消收藏' : '收藏项目'}
        onClick={(event) => {
          event.stopPropagation();
          onFavorite();
        }}
      >
        <Star size={14} fill={project.favorite ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

export default function CanvasView(props: CanvasViewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const rootNodeRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [offset, setOffset] = useState<Point>({ x: 52, y: 46 });
  const [dragging, setDragging] = useState(false);
  const forcedOpen = Boolean(props.query.trim());
  const isOpen = (id: string) => forcedOpen || props.expanded.has(id);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const rootNode = rootNodeRef.current;
    if (!viewport || !rootNode) return;
    setOffset({
      x: 30,
      y: Math.round(viewport.clientHeight / 2 - rootNode.offsetTop - rootNode.offsetHeight / 2),
    });
  }, [props.resetKey]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, [role="button"]')) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  if (props.groups.length === 0) {
    return (
      <div className="canvas-empty">
        <Share2 size={30} />
        <strong>没有可显示的项目</strong>
        <span>请清除搜索条件或检查已排除项目。</span>
      </div>
    );
  }

  const rootOpen = isOpen(ROOT_NODE_ID);

  return (
    <div
      ref={viewportRef}
      className={`canvas-viewport ${dragging ? 'dragging' : ''}`}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="canvas-drag-hint"><Move size={14} />按住空白区域拖动画布</div>
      <div
        className="canvas-world"
        style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
      >
        <div ref={rootNodeRef} className="canvas-root-node">
          <Share2 size={22} />
          <div><strong>项目总览</strong><span>{props.groups.length} 个年份</span></div>
        </div>

        <CurlyBraceButton
          open={rootOpen}
          label={rootOpen ? '收起全部年份' : '展开全部年份'}
          onClick={() => props.onToggle(ROOT_NODE_ID)}
        />

        {rootOpen && (
          <div className="canvas-years">
            {props.groups.map((year) => {
              const yearId = canvasYearId(year.year);
              const yearOpen = isOpen(yearId);
              return (
                <div className="canvas-year-branch" key={year.id}>
                  <button
                    type="button"
                    className="canvas-year-node"
                    aria-expanded={yearOpen}
                    onClick={() => props.onToggle(yearId)}
                  >
                    <strong>{year.year}</strong>
                    <span>年</span>
                    <b>{year.projects.length} 个项目</b>
                  </button>

                  <CurlyBraceButton
                    open={yearOpen}
                    label={yearOpen ? `收起 ${year.year} 年月份` : `展开 ${year.year} 年月份`}
                    onClick={() => props.onToggle(yearId)}
                  />

                  {yearOpen && (
                    <div className="canvas-months">
                      {year.groups.map((group) => {
                        const monthId = canvasMonthId(year.year, group.month);
                        const monthOpen = isOpen(monthId);
                        return (
                          <div className="canvas-month-branch" key={group.id}>
                            <button
                              type="button"
                              className="canvas-month-node"
                              aria-expanded={monthOpen}
                              onClick={() => props.onToggle(monthId)}
                            >
                              <CalendarDays size={17} />
                              <div><strong>{group.label}</strong><span>{group.projects.length} 个项目</span></div>
                            </button>

                            <CurlyBraceButton
                              open={monthOpen}
                              label={monthOpen ? `收起 ${year.year} 年 ${group.label}项目` : `展开 ${year.year} 年 ${group.label}项目`}
                              onClick={() => props.onToggle(monthId)}
                            />

                            {monthOpen && (
                              <div className="canvas-projects">
                                {group.projects.map((project) => (
                                  <ProjectCard
                                    key={project.id}
                                    project={project}
                                    selected={props.selectedId === project.id}
                                    onSelect={() => props.onSelect(project)}
                                    onOpen={() => props.onOpen(project)}
                                    onFavorite={() => props.onFavorite(project)}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="canvas-legend"><FolderOpen size={14} />双击项目节点打开文件夹</div>
    </div>
  );
}
