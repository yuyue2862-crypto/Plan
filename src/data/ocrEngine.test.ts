import { describe, expect, it } from "vitest";
import { checkOcrResources, normalizeCrop, normalizeOcrText, ocrDimensions, ocrErrorMessage, ocrResourceBase } from "./ocrEngine";

describe("OCR preparation", () => {
  it("keeps each OCR line separate while removing artificial spaces between Han characters", () => {
    expect(normalizeOcrText("1. 审 核 七 年 级 地 理 试 卷\n2. 确 认 校 庆 名 单\f"))
      .toBe("1. 审核七年级地理试卷\n2. 确认校庆名单");
  });
  it("keeps a crop rectangle inside an image", () => {
    expect(normalizeCrop({ x: 90, y: -5, width: 50, height: 49 })).toEqual({ x: 50, y: 0, width: 50, height: 49 });
    expect(normalizeCrop({ x: 0, y: 0, width: 1, height: 100 })).toEqual({ x: 0, y: 0, width: 10, height: 100 });
  });
  it("resolves assets under the deployed base and limits large photos", () => {
    expect(ocrResourceBase("/Plan/", "https://example.com/Plan/")).toBe("https://example.com/Plan/ocr/");
    expect(ocrResourceBase("/", "http://localhost:5173/")).toBe("http://localhost:5173/ocr/");
    expect(ocrDimensions(4032, 3024)).toEqual({ width: 2400, height: 1800 });
  });
  it("rejects HTML fallbacks and never displays undefined", async () => {
    await expect(checkOcrResources("https://example.com/Plan/ocr/", async () => new Response("", { headers: { "content-type": "text/html" } })))
      .rejects.toThrow("资源加载异常");
    expect(ocrErrorMessage(undefined)).toBe("识别引擎运行失败，请重试或检查浏览器兼容性。");
    expect(ocrErrorMessage({ message: undefined })).not.toContain("undefined");
  });
});
