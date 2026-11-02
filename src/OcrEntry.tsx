import { useEffect, useRef, useState } from "react";
import { cropImage, createLocalOcrWorker, FULL_CROP, normalizeCrop, normalizeOcrText, ocrErrorMessage, type CropArea } from "./data/ocrEngine";
import type { SourceText } from "./data/textEntry";

type OcrWorker = Awaited<ReturnType<typeof createLocalOcrWorker>>;
type ImageStatus = "idle" | "loading" | "recognizing" | "success" | "error";
interface OcrImage {
  id: string;
  file: File;
  url: string;
  cropEnabled: boolean;
  crop: CropArea;
  status: ImageStatus;
  progress: number;
  step: string;
  error: string;
}

export function OcrEntry({ texts, onTextsChange, onGenerate, onPendingChange, clearedIds, hidden }: {
  texts: SourceText[];
  onTextsChange: (updater: (current: SourceText[]) => SourceText[]) => void;
  onGenerate: () => void;
  onPendingChange: (pending: boolean) => void;
  clearedIds: string[];
  hidden: boolean;
}) {
  const [images, setImages] = useState<OcrImage[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState("");
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => onPendingChange(images.length > 0), [images.length, onPendingChange]);
  useEffect(() => {
    if (!clearedIds.length) return;
    const removed = new Set(clearedIds);
    imagesRef.current.filter((image) => removed.has(image.id)).forEach((image) => URL.revokeObjectURL(image.url));
    setImages((current) => current.filter((image) => !removed.has(image.id)));
  }, [clearedIds]);
  const workerRef = useRef<OcrWorker | null>(null);
  const workerPromiseRef = useRef<Promise<OcrWorker> | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      imagesRef.current.forEach((image) => URL.revokeObjectURL(image.url));
      void workerRef.current?.terminate();
      if (!workerRef.current) workerPromiseRef.current?.then((worker) => worker.terminate()).catch(() => undefined);
    };
  }, []);

  const updateImage = (id: string, change: Partial<OcrImage>) => {
    if (mountedRef.current) setImages((current) => current.map((image) => image.id === id ? { ...image, ...change } : image));
  };
  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (imagesRef.current.length + selected.length > 5) {
      setMessage("一次最多处理 5 张图片；请先删除不需要的图片。");
      return;
    }
    const invalid = selected.find((file) => !file.type.startsWith("image/"));
    if (invalid) { setMessage(`${invalid.name} 不是可识别的图片文件`); return; }
    const next = selected.map((file): OcrImage => ({
      id: crypto.randomUUID(), file, url: URL.createObjectURL(file), cropEnabled: false,
      crop: { ...FULL_CROP }, status: "idle", progress: 0, step: "等待识别", error: "",
    }));
    setImages((current) => [...current, ...next]);
    setMessage(`已加入 ${next.length} 张图片；原图仅在当前弹窗内暂存。`);
  }
  function removeImage(id: string) {
    const image = imagesRef.current.find((item) => item.id === id);
    if (image) URL.revokeObjectURL(image.url);
    setImages((current) => current.filter((item) => item.id !== id));
    onTextsChange((current) => current.filter((item) => item.id !== id));
  }
  async function ensureWorker(): Promise<OcrWorker> {
    if (workerRef.current) return workerRef.current;
    if (!workerPromiseRef.current) {
      workerPromiseRef.current = createLocalOcrWorker((status, progress) => {
        const id = activeIdRef.current;
        if (id) updateImage(id, { step: status, progress: Math.round(progress * 100) });
      }).then((worker) => { workerRef.current = worker; return worker; }).catch((error) => {
        workerPromiseRef.current = null;
        throw error;
      });
    }
    return workerPromiseRef.current;
  }
  async function processOne(image: OcrImage) {
    activeIdRef.current = image.id;
    updateImage(image.id, { status: "loading", step: "加载简体中文和英文模型", progress: 0, error: "" });
    try {
      const worker = await ensureWorker();
      updateImage(image.id, { status: "recognizing", step: "识别文字", progress: 0 });
      const input = await cropImage(image.file, image.cropEnabled ? image.crop : FULL_CROP);
      const result = await worker.recognize(input);
      const recognized = normalizeOcrText(result.data.text);
      if (!recognized) throw new Error("没有识别到文字");
      updateImage(image.id, { status: "success", step: "识别完成，等待确认", progress: 100 });
      onTextsChange((current) => {
        const previous = current.find((item) => item.id === image.id);
        return previous
          ? current.map((item) => item.id === image.id ? { ...item, text: recognized, imported: false } : item)
          : [...current, { id: image.id, text: recognized, imported: false }];
      });
    } catch (error) {
      if (import.meta.env.DEV) console.error("OCR recognition failed", error);
      updateImage(image.id, { status: "error", step: "识别失败", error: ocrErrorMessage(error) });
    } finally {
      activeIdRef.current = null;
    }
  }
  async function processImages(targets: OcrImage[]) {
    if (busyRef.current || !targets.length) return;
    busyRef.current = true;
    setBusy(true);
    try {
      for (const image of targets) await processOne(image);
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }
  function editText(id: string, text: string) {
    onTextsChange((current) => current.map((item) => item.id === id ? { ...item, text, imported: false } : item));
  }
  const imageIds = new Set(images.map((image) => image.id));
  return <section className="source-panel ocr-panel" hidden={hidden} aria-label="拍照OCR录入">
    <p className="source-note">图片只在此弹窗中处理；正式任务仅保存确认后的文字。首次加载本地中文模型可能需要一些时间。</p>
    <div className="source-actions">
      <label className="source-file-button">拍照
        <input type="file" accept="image/*" capture="environment" onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
      </label>
      <label className="source-file-button">从相册／电脑选择
        <input type="file" accept="image/*" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
      </label>
      <span>{images.length}/5 张</span>
    </div>
    {message && <p className="entry-message" role="status">{message}</p>}
    {images.length > 0 && <button className="source-primary" type="button" disabled={busy || images.every((image) => image.status !== "idle" && image.status !== "error")}
      onClick={() => void processImages(imagesRef.current.filter((image) => image.status === "idle" || image.status === "error"))}>
      {busy ? "逐张识别中…" : "识别待处理图片"}
    </button>}
    <div className="ocr-image-list">
      {images.map((image) => {
        const text = texts.find((item) => item.id === image.id);
        const crop = normalizeCrop(image.crop);
        return <article className="source-card" key={image.id}>
          <div className="source-card-header"><strong>{image.file.name}</strong><span>{image.status === "success" ? "识别成功" : image.status === "error" ? "识别失败" : image.status === "recognizing" ? "正在识别" : image.status === "loading" ? "加载模型" : "等待识别"}</span></div>
          <p className="source-progress">{image.step} {image.status === "loading" || image.status === "recognizing" ? `${image.progress}%` : ""}</p>
          {image.status === "loading" || image.status === "recognizing" ? <progress value={image.progress} max="100" /> : null}
          {image.error && <p className="entry-message" role="alert">{image.error}</p>}
          <label className="crop-toggle"><input type="checkbox" checked={image.cropEnabled} disabled={busy}
            onChange={(event) => updateImage(image.id, { cropEnabled: event.target.checked, status: "idle", step: "裁剪已修改，等待重新识别" })} />裁剪后识别</label>
          {image.cropEnabled && <div className="crop-controls">
            {(["x", "y", "width", "height"] as const).map((key) => <label key={key}>{({ x: "左边", y: "上边", width: "宽度", height: "高度" })[key]} {crop[key]}%
              <input type="range" min={key === "width" || key === "height" ? 10 : 0} max="100" value={crop[key]} disabled={busy}
                onChange={(event) => updateImage(image.id, { crop: normalizeCrop({ ...crop, [key]: Number(event.target.value) }), status: "idle", step: "裁剪已修改，等待重新识别" })} />
            </label>)}
          </div>}
          <details className="ocr-original"><summary>展开原图核对与裁剪范围</summary>
            <div className="ocr-preview"><img src={image.url} alt={`${image.file.name} 原图`} />
              {image.cropEnabled && <span className="crop-outline" style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.width}%`, height: `${crop.height}%` }} />}
            </div>
          </details>
          {text && <label className="source-text-label">识别文字（可编辑）
            <textarea value={text.text} onChange={(event) => editText(image.id, event.target.value)} />
            <small>{text.imported ? "已加入候选任务预览" : "待确认并加入候选任务"}</small>
          </label>}
          <div className="source-card-actions">
            {image.status === "error" && <button type="button" disabled={busy} onClick={() => void processImages([image])}>单独重试</button>}
            <button type="button" disabled={busy} onClick={() => removeImage(image.id)}>删除图片</button>
          </div>
        </article>;
      })}
      {texts.filter((item) => !imageIds.has(item.id)).map((item) => <article className="source-card" key={item.id}>
        <strong>已恢复的 OCR 文字</strong>
        <label className="source-text-label">识别文字（可编辑）
          <textarea value={item.text} onChange={(event) => editText(item.id, event.target.value)} />
          <small>原图未保存；{item.imported ? "已加入预览" : "待加入预览"}</small>
        </label>
        <button type="button" onClick={() => onTextsChange((current) => current.filter((source) => source.id !== item.id))}>删除文字</button>
      </article>)}
    </div>
    {texts.some((item) => !item.imported && item.text.trim()) && <button className="source-primary" type="button" onClick={onGenerate}>从 OCR 文字生成任务预览</button>}
  </section>;
}
