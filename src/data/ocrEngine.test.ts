import { describe, expect, it } from "vitest";
import { normalizeCrop, normalizeOcrText } from "./ocrEngine";

describe("OCR preparation", () => {
  it("keeps each OCR line separate while removing artificial spaces between Han characters", () => {
    expect(normalizeOcrText("1. 审 核 七 年 级 地 理 试 卷\n2. 确 认 校 庆 名 单\f"))
      .toBe("1. 审核七年级地理试卷\n2. 确认校庆名单");
  });
  it("keeps a crop rectangle inside an image", () => {
    expect(normalizeCrop({ x: 90, y: -5, width: 50, height: 49 })).toEqual({ x: 50, y: 0, width: 50, height: 49 });
    expect(normalizeCrop({ x: 0, y: 0, width: 1, height: 100 })).toEqual({ x: 0, y: 0, width: 10, height: 100 });
  });
});
