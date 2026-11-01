import {
  dateKey,
  type ImportanceAnswers,
  type SavedTask,
  type TaskQuadrant,
} from "./tasks";

export const DEFAULT_URGENCY_DAYS = 3;
export type ClassifiableTask = Pick<SavedTask, "important" | "urgent" | "dueDate" | "dueTime" | "urgencyLocked" | "urgencyOverride"> &
  Partial<Pick<SavedTask, "importanceAnswers" | "importanceOverride">>;

export function importanceFromAnswers(answers?: ImportanceAnswers): boolean | null {
  if (!answers) return null;
  if (answers.duty === "yes" || answers.consequence === "yes") return true;
  if (answers.duty === "no" && answers.consequence === "no") return false;
  return null;
}

export function effectiveImportance(task: ClassifiableTask): boolean | null {
  if (task.importanceOverride != null) return task.importanceOverride;
  return importanceFromAnswers(task.importanceAnswers) ?? task.important;
}

export function effectiveUrgency(
  task: ClassifiableTask,
  now: Date,
  thresholdDays = DEFAULT_URGENCY_DAYS,
): boolean | null {
  if (task.urgencyLocked && task.urgencyOverride != null)
    return task.urgencyOverride;
  if (!task.dueDate) return task.urgent;
  if (task.dueTime) {
    const deadline = new Date(`${task.dueDate}T${task.dueTime}:00`);
    return deadline.getTime() - now.getTime() <= thresholdDays * 86400000;
  }
  const [year, month, day] = task.dueDate.split("-").map(Number);
  const dueDay = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((dueDay - today) / 86400000) <= thresholdDays;
}

export function classifyTask(
  task: ClassifiableTask,
  now: Date,
  thresholdDays = DEFAULT_URGENCY_DAYS,
): TaskQuadrant {
  const important = effectiveImportance(task);
  const urgent = effectiveUrgency(task, now, thresholdDays);
  if (important == null || urgent == null) return "inbox";
  return important ? (urgent ? "q1" : "q2") : urgent ? "q3" : "q4";
}

export interface RecognizedDate {
  date: string | null;
  source: string;
  warning: string | null;
}

/** Rule-based detection only. The original task title is never modified. */
export function recognizeDueDate(text: string, now: Date): RecognizedDate | null {
  const year = now.getFullYear(), month = now.getMonth(), day = now.getDate();
  const todayKey = dateKey(now);
  const calendarKey = (yearValue: number, monthIndex: number, dayValue: number) =>
    new Date(Date.UTC(yearValue, monthIndex, dayValue)).toISOString().slice(0, 10);
  const valid = (year: number, month: number, day: number) => {
    const value = new Date(Date.UTC(year, month - 1, day));
    return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day
      ? value.toISOString().slice(0, 10) : null;
  };
  const result = (date: string, source: string, ambiguous = false): RecognizedDate => ({
    date,
    source,
    warning: ambiguous
      ? "未写年份，已按今年显示；请核对年份并确认"
      : date < todayKey ? "识别出的日期可能已经过去，请核对并确认" : null,
  });
  const full = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/) ??
    text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (full) {
    const date = valid(Number(full[1]), Number(full[2]), Number(full[3]));
    return date ? result(date, full[0]) : { date: null, source: full[0], warning: "日期无效，请修改或清除后再保存" };
  }
  const short = text.match(/(?<!\d)(\d{1,2})月(\d{1,2})日/);
  if (short) {
    const date = valid(year, Number(short[1]), Number(short[2]));
    if (date) {
      const found = result(date, short[0], true);
      if (date < todayKey) found.warning = "未写年份且今年日期已过，请核对年份并确认";
      return found;
    }
    return { date: null, source: short[0], warning: "日期无效或年份不明确，请修改或清除后再保存" };
  }
  if (text.includes("下个月月底"))
    return result(calendarKey(year, month + 2, 0), "下个月月底");
  if (text.includes("月底"))
    return result(calendarKey(year, month + 1, 0), "月底");
  const week = text.match(/(本周|下周)([一二三四五六日天])/);
  if (week) {
    const weekday = "一二三四五六日天".indexOf(week[2]) % 7;
    const mondayOffset = (new Date(Date.UTC(year, month, day)).getUTCDay() + 6) % 7;
    const date = calendarKey(year, month, day - mondayOffset + weekday + (week[1] === "下周" ? 7 : 0));
    return result(date, week[0]);
  }
  for (const [word, offset] of [["后天", 2], ["明天", 1], ["今天", 0]] as const) {
    if (text.includes(word))
      return result(calendarKey(year, month, day + offset), word);
  }
  return null;
}
