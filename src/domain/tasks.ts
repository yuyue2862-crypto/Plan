export type QuadrantId = "q1" | "q2" | "q3" | "q4";
export type TaskQuadrant = QuadrantId | "inbox";
export type ImportanceAnswer = "yes" | "no" | "unsure" | null;
export interface ImportanceAnswers {
  duty: ImportanceAnswer;
  consequence: ImportanceAnswer;
}

export interface Task {
  id: string;
  title: string;
  quadrant: TaskQuadrant;
  createdDate: string; // YYYY-MM-DD, used when there is no due date
  due?: string; // YYYY-MM-DD or local YYYY-MM-DDTHH:mm; date-only is never given an invented time
  pinned?: boolean;
  lockedNotUrgent?: boolean;
  completedAt?: string;
  // Future detail, reminder and assignee data can be added here without changing the view.
}

/** Real user task. Kept separate from the legacy, in-memory demo view model. */
export interface SavedTask {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  workStatus: string;
  dueDate: string | null; // YYYY-MM-DD; no time is implied
  dueTime: string | null; // HH:mm, only meaningful with dueDate
  important: boolean | null;
  importanceAnswers?: ImportanceAnswers;
  importanceOverride?: boolean | null;
  urgent: boolean | null;
  urgencyOverride: boolean | null;
  urgencyLocked: boolean;
  quadrant: TaskQuadrant;
  pinned: boolean;
  notes: string | null;
  completedAt: string | null;
}

export type NewTaskInput = Pick<SavedTask, "title"> &
  Partial<Omit<SavedTask, "id" | "title" | "createdAt" | "updatedAt">>;
export type TaskChanges = Partial<
  Omit<SavedTask, "id" | "createdAt" | "updatedAt">
>;

// Shared by desktop and mobile grids. Keep this visual order aligned with the frozen layout.
export const quadrantOrder: QuadrantId[] = ["q1", "q2", "q3", "q4"];

export const quadrantMeta: Record<
  QuadrantId,
  { number: string; title: string; subtitle: string; action: string }
> = {
  q2: {
    number: "02",
    title: "重要 · 不紧急",
    subtitle: "为长远目标留出时间",
    action: "计划推进",
  },
  q1: {
    number: "01",
    title: "重要 · 紧急",
    subtitle: "优先处理关键事项",
    action: "立即处理",
  },
  q4: {
    number: "04",
    title: "不重要 · 不紧急",
    subtitle: "减少无效占用",
    action: "适度安排",
  },
  q3: {
    number: "03",
    title: "不重要 · 紧急",
    subtitle: "快速处理或委派",
    action: "灵活处理",
  },
};

export type DateFilter = "all" | "today" | "week" | "month" | "year" | "custom";

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isOverdue(task: Task, now: Date): boolean {
  if (task.completedAt || !task.due) return false;
  if (task.due.includes("T"))
    return new Date(task.due).getTime() < now.getTime();
  return task.due < dateKey(now);
}

export function sortTasks(tasks: Task[], now: Date): Task[] {
  return [...tasks].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    if (isOverdue(a, now) !== isOverdue(b, now))
      return isOverdue(a, now) ? -1 : 1;
    if (Boolean(a.due) !== Boolean(b.due)) return a.due ? -1 : 1;
    if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
    return (
      a.createdDate.localeCompare(b.createdDate) || a.id.localeCompare(b.id)
    );
  });
}

export function filterTasks(
  tasks: Task[],
  filter: DateFilter,
  now: Date,
  range?: { start: string; end: string },
): Task[] {
  if (filter === "all") return tasks;
  const today = dateKey(now);
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - ((now.getDay() + 6) % 7),
  );
  const sunday = new Date(
    monday.getFullYear(),
    monday.getMonth(),
    monday.getDate() + 6,
  );
  const bounds: Record<
    Exclude<DateFilter, "all" | "custom">,
    [string, string]
  > = {
    today: [today, today],
    week: [dateKey(monday), dateKey(sunday)],
    month: [
      dateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
      dateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    ],
    year: [`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`],
  };
  const [start, end] =
    filter === "custom" ? [range?.start, range?.end] : bounds[filter];
  if (!start || !end || start > end) return [];
  return tasks.filter((task) => {
    if (isOverdue(task, now)) return true;
    const taskDate = task.due?.slice(0, 10) ?? task.createdDate;
    return taskDate >= start && taskDate <= end;
  });
}

export function formatDue(due: string): string {
  const date = due.slice(5, 10).replace("-", "/");
  return due.includes("T") ? `${date} ${due.slice(11, 16)}` : date;
}
