import { describe, expect, it } from "vitest";
import { createTaskRepository } from "./taskRepository";
import {
  createDraftStore,
  candidatesFromSources,
  DRAFT_KEY,
  duplicateIds,
  editCandidate,
  makeCandidates,
  markSourcesImported,
  mergeWithNext,
  saveCandidates,
  splitCandidate,
  splitTaskText,
} from "./textEntry";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    raw: (key: string) => values.get(key),
  };
}

describe("text entry", () => {
  it("funnels multiple voice or OCR text segments into the existing candidates without reimporting them", () => {
    const sources = [
      { id: "voice-1", text: "第一项\n第二项", imported: false },
      { id: "voice-2", text: "第三项", imported: false },
    ];
    expect(candidatesFromSources(sources, new Date("2026-11-01T12:00:00")).map((item) => item.title))
      .toEqual(["第一项", "第二项", "第三项"]);
    expect(candidatesFromSources(markSourcesImported(sources), new Date()).length).toBe(0);
  });
  it("persists recognized text drafts without audio or image bytes", () => {
    const store = storage();
    const draft = createDraftStore(store);
    draft.write({ text: "", candidates: [], voiceTexts: [{ id: "v1", text: "中文语音", imported: false }],
      ocrTexts: [{ id: "o1", text: "中文图片", imported: false }] });
    expect(createDraftStore(store).read()).toMatchObject({
      voiceTexts: [{ text: "中文语音" }], ocrTexts: [{ text: "中文图片" }],
    });
    expect(store.raw(DRAFT_KEY)).not.toMatch(/data:image|data:audio|blob:/);
  });
  it("requires confirmation of detected dates and saves confirmed classification", () => {
    const store = storage();
    const repo = createTaskRepository(store, {
      newId: () => "dated-real", now: () => new Date("2026-11-01T08:00:00Z"),
    });
    const items = makeCandidates("明天提交材料", () => "draft-1", new Date("2026-11-01T12:00:00"));
    expect(items[0]).toMatchObject({ title: "明天提交材料", dueDate: "2026-11-02", dateConfirmed: false });
    expect(saveCandidates(items, [], repo.add).blocked).toContain("确认");
    const confirmed = [{ ...items[0], dateConfirmed: true, importanceAnswers: { duty: "yes" as const, consequence: null } }];
    expect(saveCandidates(confirmed, [], repo.add, { now: new Date("2026-11-01T12:00:00"), thresholdDays: 3 }).success).toBe(1);
    expect(repo.findById("dated-real")).toMatchObject({ ok: true, value: { dueDate: "2026-11-02", dueTime: null, important: true, quadrant: "q1" } });
  });
  it("splits lines and common list numbers without splitting commas or dropping repeats", () => {
    expect(splitTaskText("单条任务")).toEqual(["单条任务"]);
    expect(
      splitTaskText(
        "1. 审核试卷\n2、确认名单\n（3）准备汇报\n一、跟进维修，采购\n  \n审核试卷",
      ),
    ).toEqual([
      "审核试卷",
      "确认名单",
      "准备汇报",
      "跟进维修，采购",
      "审核试卷",
    ]);
  });

  it("edits, merges adjacent candidates, and manually splits one", () => {
    const items = makeCandidates(
      "甲\n乙",
      (() => {
        let n = 0;
        return () => `c${++n}`;
      })(),
    );
    expect(editCandidate(items, "c1", "新甲")[0].title).toBe("新甲");
    const merged = mergeWithNext(items, "c1");
    expect(merged.map((item) => item.title)).toEqual(["甲 乙"]);
    expect(
      splitCandidate(merged, "c1", 1, () => "c3").map((item) => item.title),
    ).toEqual(["甲", "乙"]);
  });

  it("checks candidate and saved duplicates, while preserving explicit save choice", () => {
    const store = storage();
    const repo = createTaskRepository(store, {
      newId: () => "saved",
      now: () => new Date("2026-11-01T00:00:00Z"),
    });
    repo.add({ title: "重复" });
    const saved = repo.read();
    if (!saved.ok) throw new Error();
    const items = makeCandidates(
      "重复\n重复",
      (() => {
        let n = 0;
        return () => `c${++n}`;
      })(),
    ).map((item) => ({ ...item, urgency: "unsure" as const }));
    expect([...duplicateIds(items, saved.value)]).toEqual(["c1", "c2"]);
    expect(saveCandidates(items, saved.value, repo.add).blocked).toBeTruthy();
  });

  it("saves only selected items and keeps failures without duplicating successes on retry", () => {
    const store = storage();
    let n = 0;
    const repo = createTaskRepository(store, {
      newId: () => `real-${++n}`,
      now: () => new Date("2026-11-01T00:00:00Z"),
    });
    const items = makeCandidates(
      "第一项\n第二项\n第三项",
      (() => {
        let i = 0;
        return () => `c${++i}`;
      })(),
    ).map((item, index) => ({
      ...item,
      selected: index !== 2,
      urgency: "unsure" as const,
    }));
    let calls = 0;
    const first = saveCandidates(items, [], (input) => {
      calls++;
      return calls === 2
        ? { ok: false, code: "write_failed", message: "failed" }
        : repo.add(input);
    });
    expect(first).toMatchObject({ success: 1, failed: 1 });
    expect(first.items.map((item) => item.title)).toEqual(["第二项", "第三项"]);
    const beforeRetry = repo.read();
    if (!beforeRetry.ok) throw new Error();
    const retry = saveCandidates(first.items, beforeRetry.value, repo.add);
    expect(retry.success).toBe(1);
    const read = repo.read();
    expect(read.ok && read.value.map((task) => task.title)).toEqual([
      "第一项",
      "第二项",
    ]);
  });

  it("stores a draft independently, restores it, and clears it only on discard", () => {
    const store = storage();
    const draft = createDraftStore(store);
    const value = {
      text: "未预览",
      candidates: makeCandidates("待保存", () => "c1"),
    };
    expect(draft.write(value)).toBe(true);
    expect(createDraftStore(store).read()).toEqual(value);
    expect(store.raw(DRAFT_KEY)).toBeTruthy();
    expect(draft.clear()).toBe(true);
    expect(createDraftStore(store).read()).toBeNull();
  });
});
