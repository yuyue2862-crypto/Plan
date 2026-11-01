import { describe, expect, it } from "vitest";
import { loadDemoTasks } from "./demoTasks";
import { createTaskRepository, TASK_STORAGE_KEY } from "./taskRepository";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    raw: () => values.get(TASK_STORAGE_KEY),
  };
}
const options = {
  now: () => new Date("2026-11-01T08:00:00Z"),
  newId: () => "real-1",
};

describe("real task repository", () => {
  it("reads an existing v1 task with its saved urgency and no new importance fields", () => {
    const storage = memoryStorage();
    const repo = createTaskRepository(storage, options);
    expect(repo.add({ title: "既有工作", urgent: true, quadrant: "inbox" }).ok).toBe(true);
    const original = storage.raw();
    const loaded = createTaskRepository(storage).read();
    expect(loaded.ok && loaded.value[0]).toMatchObject({ id: "real-1", title: "既有工作", urgent: true });
    expect(storage.raw()).toBe(original);
    expect(repo.update("real-1", { important: true, importanceAnswers: { duty: "yes", consequence: null }, quadrant: "q1" }).ok).toBe(true);
    const updated = createTaskRepository(storage).read();
    expect(updated.ok && updated.value).toMatchObject([{ id: "real-1", urgent: true, important: true, quadrant: "q1" }]);
    expect(updated.ok && updated.value).toHaveLength(1);
  });
  it("starts empty and keeps demo tasks out of persistent storage", () => {
    const storage = memoryStorage();
    expect(createTaskRepository(storage, options).read()).toEqual({
      ok: true,
      value: [],
    });
    expect(loadDemoTasks().length).toBeGreaterThan(0);
    expect(storage.raw()).toBeUndefined();
  });

  it("persists tasks across repository initialization without inventing a due time", () => {
    const storage = memoryStorage();
    const first = createTaskRepository(storage, options);
    expect(first.add({ title: "  整理资料  ", dueDate: "2026-11-02" }).ok).toBe(
      true,
    );
    const next = createTaskRepository(storage);
    const read = next.findById("real-1");
    expect(read.ok && read.value).toMatchObject({
      title: "整理资料",
      dueDate: "2026-11-02",
      dueTime: null,
      quadrant: "inbox",
    });
    expect(JSON.parse(storage.raw()!).version).toBe(1);
  });

  it("saves undated and unclassified tasks, updates in place, then deletes", () => {
    const storage = memoryStorage();
    const repo = createTaskRepository(storage, options);
    expect(repo.add({ title: "任务" }).ok).toBe(true);
    expect(repo.updateStatus("real-1", "in_progress").ok).toBe(true);
    expect(repo.update("real-1", { notes: "备注" }).ok).toBe(true);
    const read = repo.read();
    expect(read.ok && read.value).toMatchObject([
      {
        dueDate: null,
        dueTime: null,
        important: null,
        urgent: null,
        quadrant: "inbox",
        workStatus: "in_progress",
        notes: "备注",
      },
    ]);
    expect(repo.remove("real-1")).toEqual({ ok: true, value: undefined });
    expect(createTaskRepository(storage).read()).toEqual({
      ok: true,
      value: [],
    });
    expect(createTaskRepository(storage).hasEnteredRealMode()).toEqual({
      ok: true,
      value: true,
    });
  });

  it("rejects duplicate IDs and invalid fields without overwriting data", () => {
    const storage = memoryStorage();
    const repo = createTaskRepository(storage, options);
    repo.add({ title: "原任务" });
    expect(repo.add({ title: "重复" })).toMatchObject({
      ok: false,
      code: "duplicate_id",
    });
    expect(repo.update("real-1", { dueDate: "2026-02-30" })).toMatchObject({
      ok: false,
      code: "invalid_task",
    });
    expect(repo.read()).toMatchObject({
      ok: true,
      value: [{ title: "原任务" }],
    });
  });

  it("reports corrupt or unsupported documents and leaves them intact", () => {
    const storage = memoryStorage();
    storage.setItem(TASK_STORAGE_KEY, "{broken");
    const repo = createTaskRepository(storage, options);
    expect(repo.read()).toMatchObject({ ok: false, code: "corrupt_data" });
    expect(storage.raw()).toBe("{broken");
    storage.setItem(
      TASK_STORAGE_KEY,
      JSON.stringify({ version: 2, tasks: [] }),
    );
    expect(repo.read()).toMatchObject({
      ok: false,
      code: "unsupported_version",
    });
  });

  it("returns a write error instead of claiming success", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(
      createTaskRepository(storage, options).add({ title: "任务" }),
    ).toMatchObject({ ok: false, code: "write_failed" });
  });
});
