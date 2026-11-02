import { quadrantOrder, type QuadrantId } from "../domain/tasks";

export const LAYOUT_KEY = "four-quadrant:layout:v1";
export type LayoutOrder = [QuadrantId, QuadrantId, QuadrantId, QuadrantId];

export function validLayout(value: unknown): value is LayoutOrder {
  return Array.isArray(value) && value.length === 4 &&
    new Set(value).size === 4 && value.every((id) => quadrantOrder.includes(id));
}

export function readLayout(storage: Pick<Storage, "getItem">): LayoutOrder {
  try {
    const raw = storage.getItem(LAYOUT_KEY);
    if (raw) {
      const value: unknown = JSON.parse(raw);
      if (validLayout(value)) return value;
    }
  } catch { /* Storage can be unavailable in private browsing. */ }
  return [...quadrantOrder] as LayoutOrder;
}

export function saveLayout(storage: Pick<Storage, "setItem">, order: LayoutOrder): boolean {
  try { storage.setItem(LAYOUT_KEY, JSON.stringify(order)); return true; }
  catch { return false; }
}

export function swapLayout(order: LayoutOrder, first: QuadrantId, second: QuadrantId): LayoutOrder {
  const next = [...order] as LayoutOrder;
  const a = next.indexOf(first), b = next.indexOf(second);
  if (a >= 0 && b >= 0) [next[a], next[b]] = [next[b], next[a]];
  return next;
}
