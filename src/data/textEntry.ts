import type { ImportanceAnswers, NewTaskInput, SavedTask } from "../domain/tasks";
import { classifyTask, importanceFromAnswers, recognizeDueDate, DEFAULT_URGENCY_DAYS } from "../domain/classification";
import type { Result } from "./taskRepository";

export type UrgencyChoice = "urgent" | "not_urgent" | "unsure" | null;
export interface Candidate {
  id: string;
  title: string;
  selected: boolean;
  urgency: UrgencyChoice;
  dueDate?: string | null;
  dueTime?: string | null;
  dateSource?: string | null;
  dateWarning?: string | null;
  dateConfirmed?: boolean;
  importanceAnswers?: ImportanceAnswers;
  importanceOverride?: boolean | null;
  urgencyLocked?: boolean;
  duplicateChoice?: "skip" | "save" | "edit";
}
export interface Draft {
  text: string;
  candidates: Candidate[];
  voiceTexts?: SourceText[];
  ocrTexts?: SourceText[];
}
export interface SourceText {
  id: string;
  text: string;
  imported: boolean;
}
export const DRAFT_KEY = "four-quadrant:text-draft:v1";
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function splitTaskText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(
          /^(?:(?:\d+)[.、．)]|[（(]\s*\d+\s*[）)]|[一二三四五六七八九十]+、)\s*/,
          "",
        )
        .trim(),
    )
    .filter(Boolean);
}
export function makeCandidates(
  text: string,
  id: () => string = () => crypto.randomUUID(),
  now: Date = new Date(),
): Candidate[] {
  return splitTaskText(text).map((title) => ({
    id: id(), title, selected: true, urgency: null,
    ...recognizedFields(title, now),
  }));
}

/** Voice and OCR both enter the same candidate pipeline as typed text. */
export function candidatesFromSources(sources: SourceText[], now: Date): Candidate[] {
  return sources.filter((source) => !source.imported && source.text.trim())
    .flatMap((source) => makeCandidates(source.text, undefined, now));
}

export function markSourcesImported(sources: SourceText[]): SourceText[] {
  return sources.map((source) => source.text.trim() ? { ...source, imported: true } : source);
}

export function recognizedFields(title: string, now = new Date()) {
  const found = recognizeDueDate(title, now);
  return {
    dueDate: found?.date ?? null,
    dueTime: null,
    dateSource: found?.source ?? null,
    dateWarning: found?.warning ?? null,
    dateConfirmed: !found,
  };
}
export function editCandidate(
  items: Candidate[],
  id: string,
  title: string,
  now = new Date(),
): Candidate[] {
  return items.map((item) =>
    item.id === id ? { ...item, title, duplicateChoice: undefined,
      ...(item.dateConfirmed && item.dateSource === null ? {} : recognizedFields(title, now)) } : item,
  );
}
export function mergeWithNext(items: Candidate[], id: string, now = new Date()): Candidate[] {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0 || index === items.length - 1) return items;
  const merged = {
    ...items[index],
    title:
      `${items[index].title.trim()} ${items[index + 1].title.trim()}`.trim(),
    urgency:
      items[index].urgency === items[index + 1].urgency
        ? items[index].urgency
        : null,
    duplicateChoice: undefined,
    ...recognizedFields(`${items[index].title.trim()} ${items[index + 1].title.trim()}`.trim(), now),
  };
  return [...items.slice(0, index), merged, ...items.slice(index + 2)];
}
export function splitCandidate(
  items: Candidate[],
  id: string,
  at: number,
  newId: () => string = () => crypto.randomUUID(),
  now = new Date(),
): Candidate[] {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return items;
  const left = items[index].title.slice(0, at).trim(),
    right = items[index].title.slice(at).trim();
  if (!left || !right) return items;
  const base = { ...items[index], duplicateChoice: undefined };
  return [
    ...items.slice(0, index),
    { ...base, title: left, ...recognizedFields(left, now) },
    { ...base, id: newId(), title: right, ...recognizedFields(right, now) },
    ...items.slice(index + 1),
  ];
}
const identity = (title: string) =>
  title.trim().replace(/\s+/g, " ").toLocaleLowerCase();
export function duplicateIds(
  items: Candidate[],
  saved: SavedTask[],
): Set<string> {
  const existing = new Set(saved.map((task) => identity(task.title)));
  const counts = new Map<string, number>();
  for (const item of items.filter(
    (item) => item.selected && item.title.trim(),
  )) {
    const key = identity(item.title);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicates = new Set<string>();
  for (const item of items.filter(
    (item) => item.selected && item.title.trim(),
  )) {
    const key = identity(item.title);
    if ((counts.get(key) ?? 0) > 1 || existing.has(key))
      duplicates.add(item.id);
  }
  return duplicates;
}

export function createDraftStore(storage: DraftStorage) {
  function read(): Draft | null {
    try {
      const raw = storage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const value: unknown = JSON.parse(raw);
      if (
        !value ||
        typeof value !== "object" ||
        !("version" in value) ||
        value.version !== 1 ||
        !("draft" in value)
      )
        return null;
      const draft = value.draft;
      if (
        !draft ||
        typeof draft !== "object" ||
        !("text" in draft) ||
        typeof draft.text !== "string" ||
        !("candidates" in draft) ||
        !Array.isArray(draft.candidates)
      )
        return null;
      return {
        text: draft.text,
        candidates: draft.candidates.filter(
          (item: unknown): item is Candidate =>
            !!item &&
            typeof item === "object" &&
            "id" in item &&
            typeof item.id === "string" &&
            "title" in item &&
            typeof item.title === "string" &&
            "selected" in item &&
            typeof item.selected === "boolean" &&
            "urgency" in item &&
            [null, "urgent", "not_urgent", "unsure"].includes(
              item.urgency as string | null,
            ),
        ),
        ...("voiceTexts" in draft ? { voiceTexts: validSourceTexts(draft.voiceTexts) } : {}),
        ...("ocrTexts" in draft ? { ocrTexts: validSourceTexts(draft.ocrTexts) } : {}),
      };
    } catch {
      return null;
    }
  }
  function write(draft: Draft): boolean {
    try {
      storage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, draft }));
      return true;
    } catch {
      return false;
    }
  }
  function clear(): boolean {
    try {
      storage.removeItem(DRAFT_KEY);
      return true;
    } catch {
      return false;
    }
  }
  return { read, write, clear };
}
function validSourceTexts(value: unknown): SourceText[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SourceText =>
    !!item && typeof item === "object" && "id" in item && typeof item.id === "string" &&
    "text" in item && typeof item.text === "string" && "imported" in item && typeof item.imported === "boolean",
  ).map((item) => ({ id: item.id, text: item.text, imported: item.imported }));
}
export function browserDraftStore() {
  return createDraftStore({
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
  });
}

export function saveCandidates(
  items: Candidate[],
  saved: SavedTask[],
  add: (input: NewTaskInput) => Result<SavedTask>,
  options: { now?: Date; thresholdDays?: number } = {},
) {
  const duplicates = duplicateIds(items, saved);
  const unresolved = items.filter(
    (item) => item.selected && duplicates.has(item.id) && !item.duplicateChoice,
  );
  if (unresolved.length)
    return { items, success: 0, failed: 0, blocked: "请先处理疑似重复任务" };
  // 未确认的自动识别日期不阻止保存。
  // 保存时忽略未经确认的日期。
  if (items.some((item) => item.selected && item.urgencyLocked && item.urgency !== "urgent" && item.urgency !== "not_urgent"))
    return { items, success: 0, failed: 0, blocked: "人工锁定紧急性时，请选择紧急或不紧急" };
  if (items.some((item) => item.selected && !item.title.trim()))
    return { items, success: 0, failed: 0, blocked: "任务名称不能为空" };
  let success = 0,
    failed = 0;
  const remaining: Candidate[] = [];
  for (const item of items) {
    if (!item.selected || item.duplicateChoice === "edit") {
      remaining.push(item);
      continue;
    }
    if (item.duplicateChoice === "skip") {
      remaining.push({ ...item, selected: false });
      continue;
    }
    const dueDate = item.dateSource && !item.dateConfirmed ? null : (item.dueDate ?? null);
    const important = importanceFromAnswers(item.importanceAnswers);
    const urgent = item.urgency === "urgent" ? true : item.urgency === "not_urgent" ? false : null;
    const fields = {
      important,
      importanceAnswers: item.importanceAnswers,
      importanceOverride: item.importanceOverride ?? null,
      urgent: dueDate && !item.urgencyLocked ? null : urgent,
      dueDate,
      dueTime: dueDate ? item.dueTime ?? null : null,
      urgencyLocked: item.urgencyLocked ?? false,
      urgencyOverride: item.urgencyLocked ? urgent : null,
    };
    const result = add({
      title: item.title.trim(),
      workStatus: "待开始",
      ...fields,
      quadrant: classifyTask(fields, options.now ?? new Date(), options.thresholdDays ?? DEFAULT_URGENCY_DAYS),
    });
    if (result.ok) success++;
    else {
      failed++;
      remaining.push(item);
    }
  }
  return { items: remaining, success, failed, blocked: null as string | null };
}
