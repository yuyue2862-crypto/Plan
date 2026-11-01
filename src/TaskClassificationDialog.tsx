import { useState } from "react";
import { ClassificationFields, type ClassificationValue } from "./ClassificationFields";
import { classifyTask, importanceFromAnswers } from "./domain/classification";
import type { SavedTask } from "./domain/tasks";
import type { UrgencyChoice } from "./data/textEntry";
import { browserTaskRepository } from "./data/taskRepository";

const choiceOf = (value: boolean | null): UrgencyChoice =>
  value === true ? "urgent" : value === false ? "not_urgent" : null;

export function TaskClassificationDialog({ task, thresholdDays, now, onClose, onSaved }: {
  task: SavedTask;
  thresholdDays: number;
  now: Date;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<ClassificationValue>({
    dueDate: task.dueDate,
    dueTime: task.dueTime,
    dateConfirmed: true,
    importanceAnswers: task.importanceAnswers,
    importanceOverride: task.importanceOverride ?? (task.importanceAnswers ? null : task.important),
    urgency: choiceOf(task.urgencyLocked ? task.urgencyOverride : task.urgent),
    urgencyLocked: task.urgencyLocked,
  });
  const [title, setTitle] = useState(task.title);
  const [message, setMessage] = useState("");
  const dateChanged = value.dueDate !== task.dueDate || (value.dueTime ?? null) !== task.dueTime;
  const locked = value.urgencyLocked ?? false;
  const urgent = value.urgency === "urgent" ? true : value.urgency === "not_urgent" ? false : null;

  function save() {
    if (!title.trim()) { setMessage("任务名称不能为空"); return; }
    if (locked && urgent === null) { setMessage("人工锁定时，请选择紧急或不紧急"); return; }
    const important = importanceFromAnswers(value.importanceAnswers);
    const fields = {
      dueDate: value.dueDate,
      dueTime: value.dueDate ? value.dueTime ?? null : null,
      important,
      importanceAnswers: value.importanceAnswers,
      importanceOverride: value.importanceOverride ?? null,
      urgent: value.dueDate && !locked ? task.urgent : urgent,
      urgencyLocked: locked,
      urgencyOverride: locked ? urgent : null,
    };
    const result = browserTaskRepository().update(task.id, {
      title: title.trim(),
      ...fields,
      quadrant: classifyTask(fields, now, thresholdDays),
    });
    if (!result.ok) { setMessage(result.message); return; }
    onSaved();
    onClose();
  }

  return <div className="overlay entry-overlay" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className="dialog classification-dialog" role="dialog" aria-modal="true" aria-labelledby="classification-title">
      <button className="dialog-close" type="button" onClick={onClose} aria-label="关闭">×</button>
      <span className="dialog-kicker">TASK CLASSIFICATION</span>
      <h2 id="classification-title">任务分类</h2>
      <label className="entry-label">任务名称
        <input className="candidate-title" value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <ClassificationFields value={value} onChange={(change) => setValue((current) => ({ ...current, ...change }))}
        thresholdDays={thresholdDays} now={now} />
      {dateChanged && locked && <p className="candidate-hint">截止日期已修改，当前紧急性仍由人工锁定。请核对锁定结果；需要自动判断时可取消锁定。</p>}
      {message && <p className="entry-message" role="alert">{message}</p>}
      <div className="classification-actions">
        <button type="button" onClick={onClose}>取消</button>
        <button type="button" className="dialog-confirm" onClick={save}>保存分类</button>
      </div>
    </section>
  </div>;
}
