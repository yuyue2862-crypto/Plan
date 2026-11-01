import { describe, expect, it } from "vitest";
import { classifyTask, effectiveUrgency, importanceFromAnswers, recognizeDueDate } from "./classification";
import type { SavedTask } from "./tasks";

const now = new Date("2026-11-01T12:00:00");
const base: SavedTask = {
  id: "old", title: "旧任务", createdAt: now.toISOString(), updatedAt: now.toISOString(),
  workStatus: "待开始", dueDate: null, dueTime: null, important: null, urgent: true,
  urgencyOverride: null, urgencyLocked: false, quadrant: "inbox", pinned: false,
  notes: null, completedAt: null,
};

describe("task classification", () => {
  it("uses frozen importance questions and lets explicit manual importance win", () => {
    expect(importanceFromAnswers({ duty: "yes", consequence: "unsure" })).toBe(true);
    expect(importanceFromAnswers({ duty: "no", consequence: "no" })).toBe(false);
    expect(importanceFromAnswers({ duty: "no", consequence: "unsure" })).toBeNull();
    expect(classifyTask({ ...base, importanceAnswers: { duty: "no", consequence: "no" }, importanceOverride: true }, now)).toBe("q1");
  });

  it("places each known combination in the correct quadrant and keeps unknown in inbox", () => {
    expect(classifyTask({ ...base, important: true }, now)).toBe("q1");
    expect(classifyTask({ ...base, important: true, urgent: false }, now)).toBe("q2");
    expect(classifyTask({ ...base, important: false }, now)).toBe("q3");
    expect(classifyTask({ ...base, important: false, urgent: false }, now)).toBe("q4");
    expect(classifyTask(base, now)).toBe("inbox");
  });

  it("preserves legacy undated urgency, recalculates dated urgency, and respects lock", () => {
    expect(effectiveUrgency(base, now)).toBe(true);
    expect(effectiveUrgency({ ...base, dueDate: "2026-11-04", urgent: null }, now, 3)).toBe(true);
    expect(effectiveUrgency({ ...base, dueDate: "2026-11-05", urgent: null }, now, 3)).toBe(false);
    expect(effectiveUrgency({ ...base, dueDate: "2026-10-31", urgent: null }, now, 3)).toBe(true);
    expect(effectiveUrgency({ ...base, dueDate: "2026-11-01", dueTime: "11:59", urgent: null }, now, 3)).toBe(true);
    expect(effectiveUrgency({ ...base, dueDate: "2026-10-31", urgencyLocked: true, urgencyOverride: false }, now, 3)).toBe(false);
    expect(classifyTask({ ...base, important: false, dueDate: "2026-11-05", urgent: null }, now, 3)).toBe("q4");
    expect(classifyTask({ ...base, important: false, dueDate: "2026-11-05", urgent: null }, now, 5)).toBe("q3");
  });

  it("recognizes required Chinese and ISO dates without changing task text", () => {
    const cases = [
      ["今天开会", "2026-11-01"], ["明天开会", "2026-11-02"], ["后天开会", "2026-11-03"],
      ["本周五提交", "2026-10-30"], ["下周五提交", "2026-11-06"],
      ["月底完成", "2026-11-30"], ["下个月月底完成", "2026-12-31"],
      ["11月15日开会", "2026-11-15"], ["2026年11月15日开会", "2026-11-15"],
      ["2026-11-15开会", "2026-11-15"],
    ];
    for (const [text, date] of cases) expect(recognizeDueDate(text, now)?.date).toBe(date);
    expect(recognizeDueDate("本周五提交", now)?.warning).toContain("已经过去");
    expect(recognizeDueDate("11月15日开会", now)?.warning).toContain("未写年份");
    expect(recognizeDueDate("2026-02-30开会", now)).toMatchObject({ date: null, source: "2026-02-30" });
    expect(recognizeDueDate("普通任务", now)).toBeNull();
  });
});
