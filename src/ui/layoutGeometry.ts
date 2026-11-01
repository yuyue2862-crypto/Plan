export interface Point { x: number; y: number }
export interface Rect { left: number; top: number; width: number; height: number }

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/** Keep the entire movable dialog inside the visible browser area. */
export function clampDialogOffset(offset: Point, centeredRect: Rect, viewport: { width: number; height: number }, margin = 12): Point {
  return {
    x: clamp(offset.x, margin - centeredRect.left, viewport.width - margin - centeredRect.left - centeredRect.width),
    y: clamp(offset.y, margin - centeredRect.top, viewport.height - margin - centeredRect.top - centeredRect.height),
  };
}

/** Reserve enough room for the preview and fixed save action. */
export function clampInputHeight(height: number, workspaceHeight: number): number {
  return clamp(height, 106, workspaceHeight - 190);
}
