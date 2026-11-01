import { describe, expect, it } from "vitest";
import { clampDialogOffset, clampInputHeight } from "./layoutGeometry";

describe("entry workspace geometry", () => {
  it("keeps a dragged dialog in view on every edge", () => {
    const rect = { left: 300, top: 100, width: 600, height: 650 };
    const viewport = { width: 1200, height: 900 };
    expect(clampDialogOffset({ x: -999, y: -999 }, rect, viewport)).toEqual({ x: -288, y: -88 });
    expect(clampDialogOffset({ x: 999, y: 999 }, rect, viewport)).toEqual({ x: 288, y: 138 });
  });

  it("reserves usable room for input and preview when splitting", () => {
    expect(clampInputHeight(40, 600)).toBe(106);
    expect(clampInputHeight(800, 600)).toBe(410);
    expect(clampInputHeight(180, 600)).toBe(180);
  });
});
