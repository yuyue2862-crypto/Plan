import { useEffect, useMemo, useState } from "react";
import { loadDemoTasks } from "./data/demoTasks";
import { browserTaskRepository } from "./data/taskRepository";
import { toViewTask } from "./data/taskView";
import { TextEntryDialog } from "./TextEntryDialog";
import { TaskClassificationDialog } from "./TaskClassificationDialog";
import { browserSettingsStore } from "./data/settings";
import { classifyTask, DEFAULT_URGENCY_DAYS } from "./domain/classification";
import { PixelArt } from "./PixelArt";
import {
  dateKey,
  filterTasks,
  formatDue,
  isOverdue,
  quadrantMeta,
  quadrantOrder,
  sortTasks,
  type DateFilter,
  type QuadrantId,
  type Task,
  type SavedTask,
} from "./domain/tasks";

const filterLabels: Record<DateFilter, string> = {
  all: "全部",
  today: "今日",
  week: "本周",
  month: "本月",
  year: "本年",
  custom: "自定义",
};

function TaskRow({
  task,
  now,
  onComplete,
  onDetail,
}: {
  task: Task;
  now: Date;
  onComplete: (id: string) => void;
  onDetail: (id: string) => void;
}) {
  const overdue = isOverdue(task, now);
  return (
    <li className="task-row">
      <label className="task-check" title={`完成：${task.title}`}>
        <input
          type="checkbox"
          checked={false}
          onChange={() => onComplete(task.id)}
          aria-label={`完成任务：${task.title}`}
        />
        <span aria-hidden="true" />
      </label>
      <div className="task-main">
        <span className="task-name" title={task.title}>{task.title}</span>
        <div className="task-meta">
          {task.pinned && <span className="pin-mark">置顶</span>}
          {task.due && <span>截止 {formatDue(task.due)}</span>}
          {overdue && <span className="overdue-mark">已逾期</span>}
        </div>
      </div>
      <button
        className="detail-button"
        type="button"
        onClick={() => onDetail(task.id)}
        aria-label={`查看${task.title}详情`}
        title="查看任务分类"
      >
        <span aria-hidden="true">›</span>
      </button>
    </li>
  );
}

function StatContents({
  tasks,
  now,
  onRecords,
  onInbox,
}: {
  tasks: Task[];
  now: Date;
  onRecords: () => void;
  onInbox: () => void;
}) {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completedAt).length;
  const incomplete = total - completed;
  const overdue = tasks.filter((task) => isOverdue(task, now)).length;
  const inbox = tasks.filter(
    (task) => task.quadrant === "inbox" && !task.completedAt,
  ).length;
  const rate = total ? Math.round((completed / total) * 100) : 0;
  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <span>任务总数</span>
          <strong>{total}</strong>
        </div>
        <button
          type="button"
          className="stat-card stat-card--inbox inbox-link"
          onClick={onInbox}
        >
          <span className="stat-card-label">
            待分类任务
            {inbox > 0 && <i className="inbox-alert-dot" aria-hidden="true" />}
          </span>
          <strong>{inbox}</strong>
          <span className="stat-card-arrow" aria-hidden="true">›</span>
        </button>
        <div className="stat-card">
          <span>已完成</span>
          <strong>{completed}</strong>
        </div>
        <div className="stat-card">
          <span>未完成</span>
          <strong>{incomplete}</strong>
        </div>
        <div className="stat-card stat-card--overdue overdue-summary">
          <span>当前逾期</span>
          <strong>{overdue}</strong>
        </div>
      </div>
      <div className="completion-block">
        <div
          className="ring"
          style={{ "--progress": `${rate}%` } as React.CSSProperties}
          role="img"
          aria-label={`完成率 ${rate}%`}
        >
          <div>
            <strong>{rate}%</strong>
            <span>完成率</span>
          </div>
        </div>
        <button type="button" className="text-link" onClick={onRecords}>
          查看已完成记录 <span aria-hidden="true">↗</span>
        </button>
      </div>
    </>
  );
}

function Quadrant({
  id,
  tasks,
  now,
  onComplete,
  onDetail,
  expanded,
  onExpand,
}: {
  id: QuadrantId;
  tasks: Task[];
  now: Date;
  onComplete: (id: string) => void;
  onDetail: (id: string) => void;
  expanded: boolean;
  onExpand: (id: QuadrantId) => void;
}) {
  const meta = quadrantMeta[id];
  return (
    <section
      className={`quadrant quadrant--${id}`}
      aria-label={`第${meta.number}象限 ${meta.title}`}
    >
      <div className="quadrant-desktop">
        <header className="quadrant-header">
          <span className="quadrant-number">{meta.number}</span>
          <div className="quadrant-heading">
            <h2>{meta.title}</h2>
            <p>{meta.subtitle}</p>
          </div>
          <PixelArt kind={id} className="quadrant-art" />
          <span className="quadrant-count">{tasks.length} 项</span>
        </header>
        <div className="quadrant-list">
          {tasks.length ? (
            <ul>
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  now={now}
                  onComplete={onComplete}
                  onDetail={onDetail}
                />
              ))}
            </ul>
          ) : (
            <p className="empty-state">这里暂时没有任务</p>
          )}
        </div>
        <div className="quadrant-footer">
          <span className="footer-line" />
          <span>{meta.action}</span>
        </div>
      </div>
      <button
        type="button"
        className={`quadrant-mobile ${expanded ? "is-selected" : ""}`}
        onClick={() => onExpand(id)}
        aria-expanded={expanded}
        aria-controls="mobile-task-list"
      >
        <div className="mobile-card-top">
          <span className="quadrant-number">{meta.number}</span>
          <PixelArt kind={id} className="mobile-quadrant-art" />
          <span className="mobile-card-count">{tasks.length} 项</span>
        </div>
        <h2>{meta.title}</h2>
        <ul className="mobile-preview">
          {tasks.slice(0, 3).map((task) => (
            <li key={task.id}>{task.title}</li>
          ))}
          {tasks.length === 0 && <li>暂无任务</li>}
        </ul>
        <span className="mobile-card-arrow">
          查看任务 <span aria-hidden="true">↗</span>
        </span>
      </button>
    </section>
  );
}

function App() {
  const [repository] = useState(browserTaskRepository);
  const [settingsStore] = useState(browserSettingsStore);
  const [thresholdDays, setThresholdDays] = useState(() => {
    const read = settingsStore.read();
    return read.ok ? read.value : DEFAULT_URGENCY_DAYS;
  });
  const [settingsDraft, setSettingsDraft] = useState(thresholdDays);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [demoTasks, setDemoTasks] = useState<Task[]>(loadDemoTasks);
  const [realState, setRealState] = useState<{
    mode: boolean;
    tasks: SavedTask[];
    error: string;
  }>(() => {
    const read = repository.read(),
      mode = repository.hasEnteredRealMode();
    return {
      mode: mode.ok ? (mode.value || import.meta.env.PROD) : false,
      tasks: read.ok ? read.value : [],
      error: !read.ok ? read.message : !mode.ok ? mode.message : "",
    };
  });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const tasks = realState.mode ? realState.tasks.map((task) => toViewTask(task, now, thresholdDays)) : demoTasks;
  const [entryOpen, setEntryOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [filter, setFilter] = useState<DateFilter>("all");
  const [start, setStart] = useState(dateKey(now));
  const [end, setEnd] = useState(dateKey(now));
  const [expanded, setExpanded] = useState<QuadrantId | null>(null);
  const [overlay, setOverlay] = useState<"detail" | "inbox" | "records" | "settings" | null>(
    null,
  );

  const active = useMemo(
    () =>
      tasks.filter((task) => !task.completedAt && task.quadrant !== "inbox"),
    [tasks],
  );
  const visible = useMemo(
    () => filterTasks(active, filter, now, { start, end }),
    [active, filter, now, start, end],
  );
  const byQuadrant = useMemo(
    () =>
      Object.fromEntries(
        quadrantOrder.map((id) => [
          id,
          sortTasks(
            visible.filter((task) => task.quadrant === id),
            now,
          ),
        ]),
      ) as Record<QuadrantId, Task[]>,
    [visible, now],
  );
  const completedTasks = useMemo(
    () =>
      [...tasks]
        .filter((task) => task.completedAt)
        .sort((a, b) =>
          (b.completedAt ?? "").localeCompare(a.completedAt ?? ""),
        ),
    [tasks],
  );
  const refreshReal = () => {
    const read = repository.read(),
      mode = repository.hasEnteredRealMode();
    setRealState({
      mode: mode.ok ? mode.value : realState.mode,
      tasks: read.ok ? read.value : realState.tasks,
      error: !read.ok ? read.message : !mode.ok ? mode.message : "",
    });
  };
  const openDetail = (id: string) => {
    if (realState.mode) { setOverlay(null); setEditingTaskId(id); }
    else setOverlay("detail");
  };
  const saveSettings = () => {
    const result = settingsStore.write(settingsDraft);
    if (!result.ok) { setSettingsMessage(result.message); return; }
    const changed = realState.tasks.filter((task) => !task.completedAt &&
      classifyTask(task, now, thresholdDays) !== classifyTask(task, now, result.value)).length;
    setThresholdDays(result.value);
    setSettingsMessage(`已保存为 ${result.value} 天；${changed} 项自动分类任务的象限已更新。`);
  };
  const completeTask = (id: string) => {
    if (realState.mode) {
      const result = repository.update(id, {
        workStatus: "已完成",
        completedAt: new Date().toISOString(),
      });
      if (result.ok) refreshReal();
      else setRealState((current) => ({ ...current, error: result.message }));
      return;
    }
    setDemoTasks((current) =>
      current.map((task) =>
        task.id === id
          ? { ...task, completedAt: new Date().toISOString() }
          : task,
      ),
    );
  };

  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">
        <div className="brand">
          <span className="brand-symbol" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            四象限<span className="brand-light">时间管理</span>
          </span>
        </div>
        <div className="sidebar-date">
          <span>今天是</span>
          <strong>
            {new Intl.DateTimeFormat("zh-CN", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "long",
            }).format(now)}
          </strong>
        </div>
        <div className="sidebar-divider" />
        <StatContents
          tasks={tasks}
          now={now}
          onRecords={() => setOverlay("records")}
          onInbox={() => setOverlay("inbox")}
        />
        <div className="sidebar-note">
          <span className="demo-dot" />{" "}
          {realState.mode
            ? "真实任务 · 已保存在本机浏览器"
            : "演示数据 · 勾选仅在本次页面中生效"}
        </div>
      </aside>

      <main className="main-content">
        <div className="mobile-stat-wrap">
          <details className="mobile-stats">
            <summary>
              <span>
                {now.getMonth() + 1}月{now.getDate()}日概览{" "}
                <strong>
                  {tasks.filter((task) => !task.completedAt).length} 项待完成
                </strong>
              </span>
              <span className="mobile-stats-toggle">
                展开统计 <span aria-hidden="true">⌄</span>
              </span>
            </summary>
            <div className="mobile-stats-body">
              <StatContents
                tasks={tasks}
                now={now}
                onRecords={() => setOverlay("records")}
                onInbox={() => setOverlay("inbox")}
              />
            </div>
          </details>
        </div>
        {realState.error && (
          <p className="entry-message" role="alert">
            真实任务读取失败：{realState.error}
          </p>
        )}
        <header className="page-header">
          <div className="page-heading">
            <span className="eyebrow">MY PRIORITIES / 四象限工作台</span>
            <h1>把重要的事，放在对的位置。</h1>
            <p>
              四象限任务概览 <span>·</span> 当前显示 {visible.length} 项
            </p>
          </div>
          <div className="header-mascot">
            <img
              className="mascot-art"
              src={`${import.meta.env.BASE_URL}mascot.png`}
              alt="拿着日历的任务吉祥物"
            />
            <span>今天也一起整理好！</span>
          </div>
          <button
            className="new-button desktop-new"
            type="button"
            onClick={() => setEntryOpen(true)}
          >
            <span aria-hidden="true">＋</span> 新建任务
          </button>
        </header>
        <div className="toolbar">
          <div className="filter-label">
            <span className="filter-icon" aria-hidden="true">
              ▦
            </span>{" "}
            日期筛选
          </div>
          <div className="filter-buttons" role="group" aria-label="日期筛选">
            {(Object.keys(filterLabels) as DateFilter[]).map((key) => (
              <button
                type="button"
                key={key}
                className={filter === key ? "active" : ""}
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
              >
                {filterLabels[key]}
              </button>
            ))}
          </div>
          <select
            className="mobile-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value as DateFilter)}
            aria-label="日期筛选"
          >
            {(Object.keys(filterLabels) as DateFilter[]).map((key) => (
              <option key={key} value={key}>
                {filterLabels[key]}
              </option>
            ))}
          </select>
          <span className="toolbar-count">
            工作任务共 <strong>{visible.length}</strong> 项
          </span>
          <button type="button" className="settings-button" onClick={() => { setSettingsDraft(thresholdDays); setSettingsMessage(""); setOverlay("settings"); }}>紧急性设置</button>
        </div>
        {filter === "custom" && (
          <div className="date-range">
            <label>
              开始日期{" "}
              <input
                type="date"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <span>—</span>
            <label>
              结束日期{" "}
              <input
                type="date"
                value={end}
                min={start}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
            {start > end && (
              <span className="range-error">结束日期须晚于开始日期</span>
            )}
          </div>
        )}
        <div className="quadrant-grid">
          {quadrantOrder.map((id) => (
            <Quadrant
              key={id}
              id={id}
              tasks={byQuadrant[id]}
              now={now}
              onComplete={completeTask}
              onDetail={openDetail}
              expanded={expanded === id}
              onExpand={setExpanded}
            />
          ))}
        </div>
        {expanded && (
          <section
            id="mobile-task-list"
            className={`mobile-expanded quadrant--${expanded}`}
            aria-label={`${quadrantMeta[expanded].title}完整任务列表`}
          >
            <header>
              <div>
                <span className="expanded-kicker">
                  象限 {quadrantMeta[expanded].number}
                </span>
                <h2>{quadrantMeta[expanded].title}</h2>
              </div>
              <span>{byQuadrant[expanded].length} 项任务</span>
            </header>
            {byQuadrant[expanded].length ? (
              <ul>
                {byQuadrant[expanded].map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    now={now}
                    onComplete={completeTask}
                    onDetail={openDetail}
                  />
                ))}
              </ul>
            ) : (
              <p className="empty-state">这里暂时没有任务</p>
            )}
          </section>
        )}
        <p className="mobile-demo-note">
          {realState.mode
            ? "真实任务 · 已保存在本机浏览器"
            : "演示数据 · 勾选仅在本次页面中生效"}
        </p>
      </main>
      <button
        className="mobile-new"
        type="button"
        onClick={() => setEntryOpen(true)}
      >
        <span aria-hidden="true">＋</span> 新建任务
      </button>
      {overlay && (
        <div
          className="overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOverlay(null);
          }}
        >
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <button
              className="dialog-close"
              type="button"
              onClick={() => setOverlay(null)}
              aria-label="关闭"
            >
              ×
            </button>
            {overlay === "settings" ? (
              <>
                <span className="dialog-kicker">SETTINGS</span>
                <h2 id="dialog-title">紧急性设置</h2>
                <p className="dialog-intro">有截止日期且未人工锁定的任务，按距离截止日期的天数判断紧急性。</p>
                <label className="settings-field">紧急阈值（1—14 天）
                  <input type="number" min="1" max="14" value={settingsDraft} onChange={(event) => setSettingsDraft(Number(event.target.value))} />
                </label>
                {settingsMessage && <p className="entry-message" role="status">{settingsMessage}</p>}
                <button className="dialog-confirm" type="button" onClick={saveSettings}>保存设置</button>
              </>
            ) : overlay === "records" ? (
              <>
                <span className="dialog-kicker">COMPLETED</span>
                <h2 id="dialog-title">已完成记录</h2>
                <p className="dialog-intro">
                  {realState.mode
                    ? "已完成任务保存在本机浏览器。"
                    : "演示任务完成后会出现在这里；刷新页面将恢复演示数据。"}
                </p>
                {completedTasks.length ? (
                  <ul className="records-list">
                    {completedTasks.map((task) => (
                      <li key={task.id}>
                        <span className="record-check">✓</span>
                        <span>{task.title}</span>
                        <small>{task.completedAt?.slice(0, 10)}</small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dialog-empty">暂无已完成任务</p>
                )}
              </>
            ) : (
              <>
                <span className="dialog-kicker">NEXT STEP</span>
                <h2 id="dialog-title">
                  {overlay === "detail" ? "任务详情" : "待分类任务"}
                </h2>
                <p className="dialog-intro">
                  {overlay === "detail" ? "完整任务详情将在后续阶段接入。" :
                    realState.mode ? "点击任务补充重要性、紧急性或截止日期。" : "演示数据仅供预览；新建真实任务后即可补充分类。"}
                </p>
                {overlay === "inbox" && (
                  <div className="inbox-count">
                    当前待分类{" "}
                    {
                      tasks.filter(
                        (task) =>
                          task.quadrant === "inbox" && !task.completedAt,
                      ).length
                    }{" "}
                    项
                    {realState.mode && (
                      <ul className="inbox-task-list">
                        {realState.tasks
                          .filter((task) => classifyTask(task, now, thresholdDays) === "inbox" && !task.completedAt)
                          .map((task) => (
                            <li key={task.id}>
                              <button type="button" className="inbox-task-button" onClick={() => openDetail(task.id)}><strong>{task.title}</strong></button>
                              <span>
                                {task.urgent === null && !task.dueDate
                                  ? "紧急性待确认"
                                  : task.dueDate ? "截止日期已设置" : task.urgent
                                    ? "紧急"
                                    : "不紧急"}{" "}
                                · {task.workStatus}
                              </span>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
            <button
              className="dialog-confirm"
              type="button"
              onClick={() => setOverlay(null)}
            >
              知道了
            </button>
          </section>
        </div>
      )}
      {entryOpen && (
        <TextEntryDialog
          onClose={() => setEntryOpen(false)}
          onSaved={refreshReal}
          now={now}
        />
      )}
      {editingTaskId && realState.tasks.find((task) => task.id === editingTaskId) && (
        <TaskClassificationDialog
          key={editingTaskId}
          task={realState.tasks.find((task) => task.id === editingTaskId)!}
          thresholdDays={thresholdDays}
          now={now}
          onClose={() => setEditingTaskId(null)}
          onSaved={refreshReal}
        />
      )}
    </div>
  );
}

export default App;
