import { effectiveImportance, effectiveUrgency, importanceFromAnswers } from "./domain/classification";
import type { ImportanceAnswers } from "./domain/tasks";
import type { UrgencyChoice } from "./data/textEntry";

export interface ClassificationValue {
  dueDate: string | null;
  dueTime?: string | null;
  dateSource?: string | null;
  dateWarning?: string | null;
  dateConfirmed?: boolean;
  importanceAnswers?: ImportanceAnswers;
  importanceOverride?: boolean | null;
  urgency: UrgencyChoice;
  urgencyLocked?: boolean;
}

const answerOptions = [
  ["", "暂不确定"], ["yes", "是"], ["no", "否"],
] as const;

export function ClassificationFields({ value, onChange, thresholdDays, now }: {
  value: ClassificationValue;
  onChange: (change: Partial<ClassificationValue>) => void;
  thresholdDays: number;
  now: Date;
}) {
  const answers = value.importanceAnswers ?? { duty: null, consequence: null };
  const important = effectiveImportance({
    important: importanceFromAnswers(answers),
    importanceAnswers: answers,
    importanceOverride: value.importanceOverride,
    urgent: null, dueDate: null, dueTime: null, urgencyLocked: false, urgencyOverride: null,
  });
  const urgent = effectiveUrgency({
    important: null,
    urgent: value.urgency === "urgent" ? true : value.urgency === "not_urgent" ? false : null,
    urgencyOverride: value.urgency === "urgent" ? true : value.urgency === "not_urgent" ? false : null,
    urgencyLocked: value.urgencyLocked ?? false,
    dueDate: value.dueDate,
    dueTime: value.dueTime ?? null,
  }, now, thresholdDays);
  return (
    <div className="classification-fields">
      <div className="classification-grid">
        <label>截止日期
          <input type="date" value={value.dueDate ?? ""} onChange={(event) =>
            onChange({ dueDate: event.target.value || null, dateSource: null, dateWarning: null, dateConfirmed: true })} />
        </label>
        <label>截止时刻（可留空）
          <input type="time" value={value.dueTime ?? ""} disabled={!value.dueDate}
            onChange={(event) => onChange({ dueTime: event.target.value || null })} />
        </label>
      </div>
      {value.dateSource && (
        <div className="recognized-date">
          识别到“{value.dateSource}” → {value.dueDate ?? "日期待核对"}
          {value.dateWarning && <span>；{value.dateWarning}</span>}
          {!value.dateConfirmed ? (
            <button type="button" disabled={!value.dueDate} onClick={() => onChange({ dateConfirmed: true })}>确认日期</button>
          ) : <strong> · 已确认</strong>}
          <button type="button" onClick={() => onChange({ dueDate: null, dueTime: null, dateSource: null, dateWarning: null, dateConfirmed: true })}>清除日期</button>
        </div>
      )}
      <div className="importance-questions">
        <label>这项工作是否涉及你的主要职责、重要工作目标或正式考核？
          <select value={answers.duty ?? ""} onChange={(event) =>
            onChange({ importanceAnswers: { ...answers, duty: (event.target.value || null) as ImportanceAnswers["duty"] } })}>
            {answerOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label>如果未按时完成，是否会产生严重后果或明显影响？
          <select value={answers.consequence ?? ""} onChange={(event) =>
            onChange({ importanceAnswers: { ...answers, consequence: (event.target.value || null) as ImportanceAnswers["consequence"] } })}>
            {answerOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className="classification-grid">
        <label>重要性人工调整
          <select value={value.importanceOverride === true ? "important" : value.importanceOverride === false ? "not_important" : "auto"}
            onChange={(event) => onChange({ importanceOverride: event.target.value === "auto" ? null : event.target.value === "important" })}>
            <option value="auto">按问答判断</option>
            <option value="important">重要</option>
            <option value="not_important">不重要</option>
          </select>
        </label>
        <div className="classification-result">重要性：{important === null ? "暂不确定" : important ? "重要" : "不重要"}</div>
      </div>
      {value.dueDate ? (
        <div className="urgency-control">
          <span>按截止日期自动判断：{urgent === null ? "暂不确定" : urgent ? "紧急" : "不紧急"}（阈值 {thresholdDays} 天）</span>
          <label className="lock-toggle"><input type="checkbox" checked={value.urgencyLocked ?? false}
            onChange={(event) => onChange({ urgencyLocked: event.target.checked })} />人工锁定紧急性</label>
          {value.urgencyLocked && <label>锁定为
            <select value={value.urgency ?? ""} onChange={(event) => onChange({ urgency: (event.target.value || null) as UrgencyChoice })}>
              <option value="">请选择</option><option value="urgent">紧急</option><option value="not_urgent">不紧急</option>
            </select>
          </label>}
        </div>
      ) : (
        <label className="urgency-control">无截止日期：紧急性
          <select value={value.urgency ?? ""} onChange={(event) => onChange({ urgency: (event.target.value || null) as UrgencyChoice, urgencyLocked: false })}>
            <option value="">暂不确定</option><option value="urgent">紧急</option><option value="not_urgent">不紧急</option>
          </select>
        </label>
      )}
      <p className="classification-preview">当前归属：{important === null || urgent === null ? "待分类" : important ? urgent ? "第一象限" : "第二象限" : urgent ? "第三象限" : "第四象限"}</p>
    </div>
  );
}
