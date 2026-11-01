export interface CropArea { x: number; y: number; width: number; height: number }
export const FULL_CROP: CropArea = { x: 0, y: 0, width: 100, height: 100 };

/** Tesseract may insert spaces between adjacent Han characters; preserve line breaks. */
export function normalizeOcrText(text: string): string {
  return text.replace(/([\p{Script=Han}])[ \t]+(?=[\p{Script=Han}])/gu, "$1")
    .replace(/\f/g, "").trim();
}

export function normalizeCrop(value: CropArea): CropArea {
  const width = Math.max(10, Math.min(100, value.width));
  const height = Math.max(10, Math.min(100, value.height));
  return {
    x: Math.max(0, Math.min(100 - width, value.x)),
    y: Math.max(0, Math.min(100 - height, value.y)),
    width, height,
  };
}

/** Creates a temporary OCR input Blob; the original file remains untouched. */
export async function cropImage(file: File, area: CropArea): Promise<Blob> {
  const crop = normalizeCrop(area);
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("无法打开图片，请选择常见的 JPG、PNG 或 WebP 图片"));
      element.src = imageUrl;
    });
    const sourceWidth = image.naturalWidth, sourceHeight = image.naturalHeight;
    if (!sourceWidth || !sourceHeight) throw new Error("图片尺寸无效");
    const sx = Math.floor(sourceWidth * crop.x / 100);
    const sy = Math.floor(sourceHeight * crop.y / 100);
    const sw = Math.max(1, Math.floor(sourceWidth * crop.width / 100));
    const sh = Math.max(1, Math.floor(sourceHeight * crop.height / 100));
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法创建图片裁剪画布");
    context.drawImage(image, sx, sy, Math.min(sw, sourceWidth - sx), Math.min(sh, sourceHeight - sy), 0, 0, sw, sh);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) =>
      blob ? resolve(blob) : reject(new Error("图片裁剪失败")), "image/png"));
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export async function createLocalOcrWorker(onProgress: (status: string, progress: number) => void) {
  const { createWorker, OEM } = await import("tesseract.js");
  const base = "/ocr";
  return createWorker(["chi_sim", "eng"], OEM.LSTM_ONLY, {
    workerPath: `${base}/worker.min.js`,
    corePath: base,
    langPath: base,
    workerBlobURL: false,
    logger: ({ status, progress }) => onProgress(status, progress),
  });
}

export function ocrErrorMessage(error: unknown): string {
  const reason = (error instanceof Error ? error.message : String(error))
    .replace(/^(Error:\s*)+/i, "").replace(/[.。]+$/, "");
  if (/traineddata|fetch|load|network|wasm|worker/i.test(reason))
    return `OCR 中文模型或运行资源加载失败：${reason}。请确认页面资源可访问后单独重试。`;
  return `图片识别失败：${reason}。请调整裁剪区域或换一张清晰图片后重试。`;
}
