import type { NewTaskInput, SavedTask, TaskChanges } from "../domain/tasks";

export const TASK_STORAGE_KEY = "four-quadrant:tasks:v1";
type StorageLike = Pick<Storage, "getItem" | "setItem">;
type StoredDocument = { version: 1; tasks: SavedTask[]; realMode: true };
export type RepositoryErrorCode =
  | "storage_unavailable"
  | "corrupt_data"
  | "unsupported_version"
  | "invalid_task"
  | "duplicate_id"
  | "not_found"
  | "write_failed";
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: RepositoryErrorCode; message: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(code: RepositoryErrorCode, message: string): Result<T> => ({
  ok: false,
  code,
  message,
});
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const dateValid = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const timeValid = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const timestampValid = (value: string) => !Number.isNaN(Date.parse(value));
const quadrants = new Set(["q1", "q2", "q3", "q4", "inbox"]);
const taskFields = new Set([
  "id",
  "title",
  "createdAt",
  "updatedAt",
  "workStatus",
  "dueDate",
  "dueTime",
  "important",
  "importanceAnswers",
  "importanceOverride",
  "urgent",
  "urgencyOverride",
  "urgencyLocked",
  "quadrant",
  "pinned",
  "notes",
  "completedAt",
]);

function validTask(task: unknown): task is SavedTask {
  if (!isRecord(task)) return false;
  if (Object.keys(task).some((key) => !taskFields.has(key))) return false;
  return (
    typeof task.id === "string" &&
    task.id.length > 0 &&
    typeof task.title === "string" &&
    task.title.trim().length > 0 &&
    typeof task.createdAt === "string" &&
    timestampValid(task.createdAt) &&
    typeof task.updatedAt === "string" &&
    timestampValid(task.updatedAt) &&
    typeof task.workStatus === "string" &&
    task.workStatus.trim().length > 0 &&
    (task.dueDate === null ||
      (typeof task.dueDate === "string" && dateValid(task.dueDate))) &&
    (task.dueTime === null ||
      (typeof task.dueTime === "string" && timeValid(task.dueTime))) &&
    (task.dueTime === null || task.dueDate !== null) &&
    (task.important === null || typeof task.important === "boolean") &&
    (task.importanceOverride === undefined || task.importanceOverride === null ||
      typeof task.importanceOverride === "boolean") &&
    (task.importanceAnswers === undefined ||
      (isRecord(task.importanceAnswers) &&
        Object.keys(task.importanceAnswers).every((key) => ["duty", "consequence"].includes(key)) &&
        [null, "yes", "no", "unsure"].includes(task.importanceAnswers.duty as string | null) &&
        [null, "yes", "no", "unsure"].includes(task.importanceAnswers.consequence as string | null))) &&
    (task.urgent === null || typeof task.urgent === "boolean") &&
    (task.urgencyOverride === null ||
      typeof task.urgencyOverride === "boolean") &&
    typeof task.urgencyLocked === "boolean" &&
    typeof task.quadrant === "string" &&
    quadrants.has(task.quadrant) &&
    typeof task.pinned === "boolean" &&
    (task.notes === null || typeof task.notes === "string") &&
    (task.completedAt === null ||
      (typeof task.completedAt === "string" &&
        timestampValid(task.completedAt)))
  );
}

export function createTaskRepository(
  storage: StorageLike,
  options: { now?: () => Date; newId?: () => string } = {},
) {
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? (() => crypto.randomUUID());

  function read(): Result<SavedTask[]> {
    let raw: string | null;
    try {
      raw = storage.getItem(TASK_STORAGE_KEY);
    } catch {
      return fail("storage_unavailable", "无法读取浏览器本地任务存储");
    }
    if (raw === null) return ok([]);
    let document: unknown;
    try {
      document = JSON.parse(raw);
    } catch {
      return fail("corrupt_data", "任务存储内容损坏，原始数据已保留");
    }
    if (!isRecord(document))
      return fail("corrupt_data", "任务存储格式无效，原始数据已保留");
    if (document.version !== 1)
      return fail(
        "unsupported_version",
        "任务存储版本不受支持，原始数据已保留",
      );
    if (!Array.isArray(document.tasks) || !document.tasks.every(validTask))
      return fail("corrupt_data", "任务存储含无效字段，原始数据已保留");
    const ids = new Set(document.tasks.map((task) => task.id));
    if (ids.size !== document.tasks.length)
      return fail("corrupt_data", "任务存储含重复 ID，原始数据已保留");
    return ok(document.tasks.map((task) => ({ ...task })));
  }

  function write(tasks: SavedTask[]): Result<SavedTask[]> {
    const document: StoredDocument = { version: 1, tasks, realMode: true };
    try {
      storage.setItem(TASK_STORAGE_KEY, JSON.stringify(document));
    } catch {
      return fail("write_failed", "保存任务失败，浏览器存储可能已满或不可用");
    }
    return ok(tasks.map((task) => ({ ...task })));
  }

  function add(input: NewTaskInput): Result<SavedTask> {
    const current = read();
    if (!current.ok) return current;
    if (
      !isRecord(input) ||
      Object.keys(input).some(
        (key) =>
          !taskFields.has(key) ||
          ["id", "createdAt", "updatedAt"].includes(key),
      )
    )
      return fail("invalid_task", "任务字段无效，未保存");
    if (typeof input.title !== "string")
      return fail("invalid_task", "任务名称无效，未保存");
    const id = newId();
    if (current.value.some((task) => task.id === id))
      return fail("duplicate_id", "任务 ID 已存在");
    const timestamp = now().toISOString();
    const task: SavedTask = {
      id,
      title: input.title.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
      workStatus: input.workStatus ?? "pending",
      dueDate: input.dueDate ?? null,
      dueTime: input.dueTime ?? null,
      important: input.important ?? null,
      ...(input.importanceAnswers !== undefined ? { importanceAnswers: input.importanceAnswers } : {}),
      ...(input.importanceOverride !== undefined ? { importanceOverride: input.importanceOverride } : {}),
      urgent: input.urgent ?? null,
      urgencyOverride: input.urgencyOverride ?? null,
      urgencyLocked: input.urgencyLocked ?? false,
      quadrant: input.quadrant ?? "inbox",
      pinned: input.pinned ?? false,
      notes: input.notes ?? null,
      completedAt: input.completedAt ?? null,
    };
    if (!validTask(task)) return fail("invalid_task", "任务字段无效，未保存");
    const saved = write([...current.value, task]);
    return saved.ok ? ok(task) : saved;
  }

  function update(id: string, changes: TaskChanges): Result<SavedTask> {
    const current = read();
    if (!current.ok) return current;
    if (
      !isRecord(changes) ||
      Object.keys(changes).some(
        (key) =>
          !taskFields.has(key) ||
          ["id", "createdAt", "updatedAt"].includes(key),
      )
    )
      return fail("invalid_task", "任务字段无效，未保存");
    const index = current.value.findIndex((task) => task.id === id);
    if (index < 0) return fail("not_found", "任务不存在");
    const task = {
      ...current.value[index],
      ...changes,
      id,
      createdAt: current.value[index].createdAt,
      updatedAt: now().toISOString(),
    };
    if (!validTask(task)) return fail("invalid_task", "任务字段无效，未保存");
    const next = [...current.value];
    next[index] = task;
    const saved = write(next);
    return saved.ok ? ok(task) : saved;
  }

  function updateStatus(id: string, workStatus: string): Result<SavedTask> {
    return update(id, { workStatus });
  }
  function remove(id: string): Result<void> {
    const current = read();
    if (!current.ok) return current;
    if (!current.value.some((task) => task.id === id))
      return fail("not_found", "任务不存在");
    const saved = write(current.value.filter((task) => task.id !== id));
    return saved.ok ? ok(undefined) : saved;
  }
  function findById(id: string): Result<SavedTask | null> {
    const current = read();
    return current.ok
      ? ok(current.value.find((task) => task.id === id) ?? null)
      : current;
  }
  function hasEnteredRealMode(): Result<boolean> {
    const current = read();
    if (!current.ok) return current;
    if (current.value.length > 0) return ok(true);
    try {
      const raw = storage.getItem(TASK_STORAGE_KEY);
      return ok(raw !== null && JSON.parse(raw).realMode === true);
    } catch {
      return fail("storage_unavailable", "无法读取真实任务模式");
    }
  }
  return {
    read,
    add,
    update,
    updateStatus,
    remove,
    findById,
    hasEnteredRealMode,
  };
}

/** Call only from browser-side features; no storage access occurs at module import. */
export function browserTaskRepository() {
  return createTaskRepository({
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  });
}
