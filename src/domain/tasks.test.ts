import { describe, expect, it } from "vitest";
import {
  filterTasks,
  isOverdue,
  quadrantOrder,
  sortTasks,
  type Task,
} from "./tasks";

const now = new Date(2026, 10, 1, 12, 0);
const task = (id: string, due?: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: id,
  quadrant: "q2",
  createdDate: "2026-11-01",
  due,
  ...extra,
});

describe("deadline and date filter rules", () => {
  it("treats date-only deadlines as overdue starting the next day", () => {
    expect(isOverdue(task("yesterday", "2026-10-31"), now)).toBe(true);
    expect(isOverdue(task("today", "2026-11-01"), now)).toBe(false);
  });

  it("uses the specified time for timed deadlines", () => {
    expect(isOverdue(task("morning", "2026-11-01T11:59"), now)).toBe(true);
    expect(isOverdue(task("evening", "2026-11-01T18:00"), now)).toBe(false);
  });

  it("keeps overdue incomplete tasks visible in narrow filters, including custom ranges", () => {
    const tasks = [
      task("old", "2026-10-01"),
      task("today", "2026-11-01"),
      task("future", "2026-11-10"),
    ];
    expect(filterTasks(tasks, "today", now).map((item) => item.id)).toEqual([
      "old",
      "today",
    ]);
    expect(
      filterTasks(tasks, "custom", now, {
        start: "2026-11-10",
        end: "2026-11-10",
      }).map((item) => item.id),
    ).toEqual(["old", "future"]);
  });

  it("does not count completed tasks as overdue", () => {
    expect(
      isOverdue(
        task("done", "2026-10-01", { completedAt: "2026-10-02T10:00" }),
        now,
      ),
    ).toBe(false);
  });
});

describe("task order", () => {
  it("puts pinned tasks first, then overdue, then nearest deadlines, then undated tasks", () => {
    const tasks = [
      task("none"),
      task("later", "2026-11-10"),
      task("overdue", "2026-10-31"),
      task("pinned", "2026-11-20", { pinned: true }),
      task("near", "2026-11-02"),
    ];
    expect(sortTasks(tasks, now).map((item) => item.id)).toEqual([
      "pinned",
      "overdue",
      "near",
      "later",
      "none",
    ]);
  });
});

describe("quadrant display order", () => {
  it("uses the frozen first, second, third, fourth quadrant layout", () => {
    expect(quadrantOrder).toEqual(["q1", "q2", "q3", "q4"]);
  });
});
