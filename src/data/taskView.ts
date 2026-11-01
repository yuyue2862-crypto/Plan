import type { SavedTask, Task } from "../domain/tasks";
import { classifyTask, DEFAULT_URGENCY_DAYS } from "../domain/classification";

export function toViewTask(task: SavedTask, now = new Date(), thresholdDays = DEFAULT_URGENCY_DAYS): Task {
  return {
    id: task.id,
    title: task.title,
    quadrant: classifyTask(task, now, thresholdDays),
    createdDate: task.createdAt.slice(0, 10),
    due: task.dueDate
      ? task.dueTime
        ? `${task.dueDate}T${task.dueTime}`
        : task.dueDate
      : undefined,
    pinned: task.pinned,
    lockedNotUrgent: task.urgencyLocked && task.urgencyOverride === false,
    completedAt: task.completedAt ?? undefined,
  };
}
