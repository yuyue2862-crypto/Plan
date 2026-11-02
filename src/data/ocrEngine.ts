export interface CropArea { x: number; y: number; width: number; height: number }
export const FULL_CROP: CropArea = { x: 0, y: 0, width: 100, height: 100 };
export const MAX_OCR_SIDE = 2400;

export function ocrDimensions(width: number, height: number) {
  const scale = Math.min(1, MAX_OCR_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

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
    const dimensions = ocrDimensions(sw, sh);
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法创建图片裁剪画布");
    context.drawImage(image, sx, sy, Math.min(sw, sourceWidth - sx), Math.min(sh, sourceHeight - sy), 0, 0, dimensions.width, dimensions.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) =>
      blob ? resolve(blob) : reject(new Error("图片处理失败")), "image/jpeg", 0.9));
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export function ocrResourceBase(baseUrl: string, pageUrl: string): string {
  return new URL(`ocr/`, new URL(baseUrl, pageUrl)).href;
}

/** Fail early on a missing resource or an HTML fallback page. */
export async function checkOcrResources(base: string, request: typeof fetch = fetch): Promise<void> {
  for (const name of ["worker.min.js", "tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm", "tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm", "chi_sim.traineddata.gz"]) {
    let response: Response;
    try { response = await request(`${base}${name}`, { method: "HEAD", redirect: "error" }); }
    catch { throw new Error(`OCR 资源加载异常：${name} 无法访问`); }
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || /text\/html/i.test(type)) throw new Error(`OCR 资源加载异常：${name} 返回 ${response.status} ${type}`);
  }
}

export async function createLocalOcrWorker(onProgress: (status: string, progress: number) => void) {
  if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") throw new Error("浏览器不支持 Web Worker 或 WebAssembly");
  const { createWorker, OEM } = await import("tesseract.js");
  const base = ocrResourceBase(import.meta.env.BASE_URL, window.location.href);
  await checkOcrResources(base);
  return createWorker("chi_sim", OEM.LSTM_ONLY, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base,
    workerBlobURL: false,
    errorHandler: (error) => { if (import.meta.env.DEV) console.error("OCR Worker", error); },
    logger: ({ status, progress }) => onProgress(status, progress),
  });
}

export function ocrErrorMessage(error: unknown): string {
  const value = typeof ErrorEvent !== "undefined" && error instanceof ErrorEvent ? error.message : error instanceof Error ? error.message
    : typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String(error.message ?? "") : "";
  const reason = value.replace(/^(Error:\s*)+/i, "").trim();
  if (/资源加载异常|traineddata|fetch|network|404|wasm|worker|failed to load|importscripts|cors/i.test(reason))
    return "OCR 运行资源加载异常，请检查网络并重试。";
  if (/无法打开图片|图片尺寸|图片处理|画布|decode|image format|unsupported image/i.test(reason))
    return "图片格式或解码异常，请换一张 JPG、PNG 或 WebP 图片重试。";
  if (/不支持|not supported/i.test(reason)) return "当前浏览器不支持本地图片识别所需的 Worker 或 WebAssembly。";
  if (/memory|allocation|out of bounds/i.test(reason)) return "识别时内存不足，请关闭其他页面或裁剪图片后重试。";
  if (/没有识别到文字/.test(reason)) return "没有识别到文字，请调整裁剪区域后重试。";
  return "识别引擎运行失败，请重试或检查浏览器兼容性。";
}
