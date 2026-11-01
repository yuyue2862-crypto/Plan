import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { browserTaskRepository } from "./data/taskRepository";
import {
  browserDraftStore,
  candidatesFromSources,
  duplicateIds,
  editCandidate,
  makeCandidates,
  markSourcesImported,
  mergeWithNext,
  saveCandidates,
  splitCandidate,
  type Candidate,
  type Draft,
  type SourceText,
} from "./data/textEntry";
import type { SavedTask } from "./domain/tasks";
import { ClassificationFields } from "./ClassificationFields";
import { browserSettingsStore } from "./data/settings";
import { VoiceEntry } from "./VoiceEntry";
import { OcrEntry } from "./OcrEntry";
import { clampDialogOffset, clampInputHeight, type Point } from "./ui/layoutGeometry";

export function TextEntryDialog({
  onClose,
  onSaved,
  now,
}: {
  onClose: () => void;
  onSaved: () => void;
  now: Date;
}) {
  const draftStore = useMemo(browserDraftStore, []);
  const repository = useMemo(browserTaskRepository, []);
  const thresholdDays = useMemo(() => {
    const result = browserSettingsStore().read();
    return result.ok ? result.value : 3;
  }, []);
  const [initial] = useState<Draft>(
    () => draftStore.read() ?? { text: "", candidates: [] },
  );
  const [text, setText] = useState(initial.text);
  const [items, setItems] = useState<Candidate[]>(initial.candidates);
  const [voiceTexts, setVoiceTexts] = useState<SourceText[]>(initial.voiceTexts ?? []);
  const [ocrTexts, setOcrTexts] = useState<SourceText[]>(initial.ocrTexts ?? []);
  const [ocrHasImages, setOcrHasImages] = useState(false);
  const [clearedSourceIds, setClearedSourceIds] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedTask[]>(() => {
    const result = repository.read();
    return result.ok ? result.value : [];
  });
  const [message, setMessage] = useState("");
  const [exitPrompt, setExitPrompt] = useState(false);
  const [splitId, setSplitId] = useState<string | null>(null);
  const [splitAt, setSplitAt] = useState(1);
  const [mode, setMode] = useState<"text" | "voice" | "ocr">("text");
  const [desktop, setDesktop] = useState(() => window.innerWidth > 700);
  const [dialogOffset, setDialogOffset] = useState<Point>({ x: 0, y: 0 });
  const offsetRef = useRef(dialogOffset);
  offsetRef.current = dialogOffset;
  const dialogRef = useRef<HTMLElement>(null);
  const headerDrag = useRef<{ pointerId: number; x: number; y: number; offset: Point } | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const inputPaneRef = useRef<HTMLDivElement>(null);
  const splitDrag = useRef<{ pointerId: number; y: number; height: number } | null>(null);
  const [inputHeight, setInputHeight] = useState(168);
  const duplicates = duplicateIds(items, saved);
  const dirty = Boolean(text.trim() || items.length || voiceTexts.length || ocrTexts.length || ocrHasImages);
  useEffect(() => {
    if (!draftStore.write({ text, candidates: items, voiceTexts, ocrTexts }))
      setMessage("草稿暂存失败，请勿关闭页面");
  }, [text, items, voiceTexts, ocrTexts, draftStore]);
  useEffect(() => {
    const onResize = () => {
      const isDesktop = window.innerWidth > 700;
      setDesktop(isDesktop);
      if (!isDesktop) { setDialogOffset({ x: 0, y: 0 }); return; }
      const rect = dialogRef.current?.getBoundingClientRect();
      if (!rect) return;
      const current = offsetRef.current;
      setDialogOffset(clampDialogOffset(current, {
        left: rect.left - current.x, top: rect.top - current.y,
        width: rect.width, height: rect.height,
      }, { width: window.innerWidth, height: window.innerHeight }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const setItem = (id: string, change: Partial<Candidate>) =>
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );
  const requestClose = () => (dirty ? setExitPrompt(true) : onClose());

  function moveHeader(event: PointerEvent<HTMLElement>) {
    const drag = headerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId || !dialogRef.current) return;
    const rect = dialogRef.current.getBoundingClientRect();
    const current = offsetRef.current;
    setDialogOffset(clampDialogOffset({
      x: drag.offset.x + event.clientX - drag.x,
      y: drag.offset.y + event.clientY - drag.y,
    }, {
      left: rect.left - current.x, top: rect.top - current.y,
      width: rect.width, height: rect.height,
    }, { width: window.innerWidth, height: window.innerHeight }));
  }

  function resizePane(event: PointerEvent<HTMLDivElement>) {
    const drag = splitDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setInputHeight(clampInputHeight(drag.height + event.clientY - drag.y, workspaceRef.current?.clientHeight ?? 600));
  }

  function generateFromSources(kind: "voice" | "ocr") {
    const sources = kind === "voice" ? voiceTexts : ocrTexts;
    const next = candidatesFromSources(sources, now);
    if (!next.length) { setMessage("请先确认至少一段识别文字"); return; }
    setItems((current) => [...current, ...next]);
    if (kind === "voice") setVoiceTexts((current) => markSourcesImported(current));
    else setOcrTexts((current) => markSourcesImported(current));
    setMode("text");
    setMessage(`已从${kind === "voice" ? "语音" : "OCR"}文字生成 ${next.length} 项候选任务，请继续核对日期与分类。`);
  }

  function save() {
    const current = repository.read();
    if (!current.ok) {
      setMessage(`读取真实任务失败：${current.message}`);
      return;
    }
    const outcome = saveCandidates(items, current.value, repository.add, { now, thresholdDays });
    if (outcome.blocked) {
      setMessage(outcome.blocked);
      return;
    }
    setItems(outcome.items);
    if (outcome.success > 0) {
      setClearedSourceIds([...voiceTexts, ...ocrTexts].filter((source) => source.imported).map((source) => source.id));
      setVoiceTexts((current) => current.filter((source) => !source.imported));
      setOcrTexts((current) => current.filter((source) => !source.imported));
    }
    const updated = repository.read();
    if (updated.ok) setSaved(updated.value);
    if (outcome.success) onSaved();
    setMessage(
      `已保存 ${outcome.success} 项，失败 ${outcome.failed} 项${outcome.failed ? "；失败项目已留在草稿中，可重试" : ""}`,
    );
  }

  return (
    <div
      className="overlay entry-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        className="dialog entry-dialog"
        ref={dialogRef}
        style={desktop ? { transform: `translate(${dialogOffset.x}px, ${dialogOffset.y}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-title"
      >
        <header className="entry-header"
          onPointerDown={(event) => {
            if (!desktop || event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            headerDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offset: offsetRef.current };
          }}
          onPointerMove={moveHeader}
          onPointerUp={(event) => { if (headerDrag.current?.pointerId === event.pointerId) headerDrag.current = null; }}
          onPointerCancel={() => { headerDrag.current = null; }}
          onDoubleClick={(event) => {
            if (desktop && !(event.target as HTMLElement).closest("button")) setDialogOffset({ x: 0, y: 0 });
          }}
          title={desktop ? "拖动标题栏移动窗口；双击恢复居中" : undefined}>
          <div>
            <span className="dialog-kicker">TASK NOTEBOOK</span>
            <h2 id="entry-title">新建任务</h2>
          </div>
          <button
            className="dialog-close"
            type="button"
            onClick={requestClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>
        <nav className="entry-tabs" aria-label="录入方式">
          <button
            type="button"
            className={mode === "text" ? "active" : ""}
            onClick={() => setMode("text")}
          >
            文字录入
          </button>
          <button
            type="button"
            className={mode === "voice" ? "active" : ""}
            onClick={() => setMode("voice")}
          >
            语音录入
          </button>
          <button
            type="button"
            className={mode === "ocr" ? "active" : ""}
            onClick={() => setMode("ocr")}
          >
            拍照OCR
          </button>
        </nav>
        <VoiceEntry texts={voiceTexts} onTextsChange={setVoiceTexts} onGenerate={() => generateFromSources("voice")}
          clearedIds={clearedSourceIds} hidden={mode !== "voice"} />
        <OcrEntry texts={ocrTexts} onTextsChange={setOcrTexts} onGenerate={() => generateFromSources("ocr")}
          onPendingChange={setOcrHasImages} clearedIds={clearedSourceIds} hidden={mode !== "ocr"} />
        {mode === "text" && (
          <div className="entry-workspace" ref={workspaceRef}>
            <div className="entry-input-pane" ref={inputPaneRef} style={{ flexBasis: inputHeight }}>
            <label className="entry-label" htmlFor="entry-text">
              一次输入多项任务，每行一项
            </label>
            <textarea
              id="entry-text"
              className="entry-textarea"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={
                "整理下周工作重点\n1. 审核七年级地理试卷\n2、确认校庆嘉宾名单"
              }
            />
            <div className="entry-actions">
              <span>按换行及行首编号拆分；日期识别需确认，分类可稍后补充。</span>
              <button
                type="button"
                onClick={() => {
                  const next = makeCandidates(text, undefined, now);
                  if (!next.length) {
                    setMessage("请输入至少一项任务");
                    return;
                  }
                  setItems((current) => [...current, ...next]);
                  setText("");
                  setMessage(`已生成 ${next.length} 项候选任务`);
                }}
              >
                生成任务预览
              </button>
            </div>
            </div>
            <div className="entry-splitter" role="separator" tabIndex={0} aria-label="调整录入与预览区域高度"
              aria-orientation="horizontal" aria-valuemin={106}
              aria-valuemax={Math.max(106, (workspaceRef.current?.clientHeight ?? 600) - 190)}
              aria-valuenow={inputHeight}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                splitDrag.current = { pointerId: event.pointerId, y: event.clientY, height: inputPaneRef.current?.getBoundingClientRect().height ?? inputHeight };
              }}
              onPointerMove={resizePane}
              onPointerUp={(event) => { if (splitDrag.current?.pointerId === event.pointerId) splitDrag.current = null; }}
              onPointerCancel={() => { splitDrag.current = null; }}
              onDoubleClick={() => setInputHeight(168)}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  setInputHeight((current) => clampInputHeight(current + (event.key === "ArrowDown" ? 20 : -20), workspaceRef.current?.clientHeight ?? 600));
                }
              }}><span aria-hidden="true" /></div>
            <div className="entry-preview-pane">
            {items.length > 0 && (
              <section className="candidate-section" aria-label="候选任务预览">
                <div className="candidate-heading">
                  <strong>候选任务 · {items.length} 项</strong>
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        setItems((current) =>
                          current.map((item) => ({ ...item, selected: true })),
                        )
                      }
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setItems((current) =>
                          current.map((item) => ({ ...item, selected: false })),
                        )
                      }
                    >
                      取消全选
                    </button>
                  </div>
                </div>
                <p className="candidate-hint">
                  仅任务名称必填。未确认的识别日期会被忽略，其他分类信息可以稍后补充。
                </p>
                <div className="bulk-urgency">
                  <span>批量重要性</span>
                  <button type="button" onClick={() => setItems((current) => current.map((item) => item.selected ? { ...item, importanceOverride: true } : item))}>重要</button>
                  <button type="button" onClick={() => setItems((current) => current.map((item) => item.selected ? { ...item, importanceOverride: false } : item))}>不重要</button>
                  <button type="button" onClick={() => setItems((current) => current.map((item) => item.selected ? { ...item, importanceOverride: null } : item))}>按问答</button>
                </div>
                <div className="bulk-urgency">
                  <span>批量设为</span>
                  {(["urgent", "not_urgent", "unsure"] as const).map(
                    (choice) => (
                      <button
                        type="button"
                        key={choice}
                        onClick={() =>
                          setItems((current) =>
                            current.map((item) =>
                              item.selected && !item.dueDate
                                ? { ...item, urgency: choice }
                                : item,
                            ),
                          )
                        }
                      >
                        {choice === "urgent"
                          ? "紧急"
                          : choice === "not_urgent"
                            ? "不紧急"
                            : "暂不确定"}
                      </button>
                    ),
                  )}
                </div>
                <ol className="candidate-list">
                  {items.map((item, index) => (
                    <li key={item.id} className="candidate-item">
                      <label className="candidate-select">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={(event) =>
                            setItem(item.id, { selected: event.target.checked })
                          }
                          aria-label={`选择候选任务 ${index + 1}`}
                        />
                      </label>
                      <div className="candidate-fields">
                        <input
                          className="candidate-title"
                          value={item.title}
                          onChange={(event) =>
                            setItems((current) =>
                              editCandidate(
                                current,
                                item.id,
                                event.target.value,
                                now,
                              ),
                            )
                          }
                          aria-label={`候选任务 ${index + 1} 名称`}
                        />
                        <div className="candidate-row">
                          <button
                            type="button"
                            onClick={() =>
                              setItems((current) =>
                                mergeWithNext(current, item.id, now),
                              )
                            }
                            disabled={index === items.length - 1}
                          >
                            与下一项合并
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSplitId(item.id);
                              setSplitAt(
                                Math.max(1, Math.floor(item.title.length / 2)),
                              );
                            }}
                          >
                            拆分
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setItems((current) =>
                                current.filter(
                                  (candidate) => candidate.id !== item.id,
                                ),
                              )
                            }
                          >
                            删除
                          </button>
                        </div>
                        <ClassificationFields
                          value={{ ...item, dueDate: item.dueDate ?? null }}
                          onChange={(change) => setItem(item.id, change)}
                          thresholdDays={thresholdDays}
                          now={now}
                        />
                        {duplicates.has(item.id) && (
                          <div className="duplicate-warning">
                            疑似重复：请选择处理方式{" "}
                            <select
                              aria-label={`候选任务 ${index + 1} 重复处理`}
                              value={item.duplicateChoice ?? ""}
                              onChange={(event) =>
                                setItem(item.id, {
                                  duplicateChoice: event.target
                                    .value as Candidate["duplicateChoice"],
                                })
                              }
                            >
                              <option value="">请选择</option>
                              <option value="skip">跳过</option>
                              <option value="save">仍然保存</option>
                              <option value="edit">返回编辑</option>
                            </select>
                          </div>
                        )}
                        {splitId === item.id && (
                          <div className="split-control">
                            <label>
                              在第{" "}
                              <input
                                type="number"
                                min="1"
                                max={Math.max(1, item.title.length - 1)}
                                value={splitAt}
                                onChange={(event) =>
                                  setSplitAt(Number(event.target.value))
                                }
                              />{" "}
                              个字符后拆分
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setItems((current) =>
                                  splitCandidate(current, item.id, splitAt, undefined, now),
                                );
                                setSplitId(null);
                              }}
                            >
                              确认拆分
                            </button>
                            <button
                              type="button"
                              onClick={() => setSplitId(null)}
                            >
                              取消
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {items.length === 0 && <p className="entry-preview-empty">任务预览和分类问答会显示在这里。生成预览后，可拖动上方分隔条调整空间。</p>}
            {items.length > 0 && <div className="entry-save">
              <button type="button" className="dialog-confirm" onClick={save}>保存选中任务</button>
            </div>}
            </div>
          </div>
        )}
        {message && (
          <p className="entry-message" role="status">
            {message}
          </p>
        )}
        {exitPrompt && (
          <div
            className="entry-exit"
            role="alertdialog"
            aria-label="未保存草稿"
          >
            <p>还有未保存的录入内容。文字草稿可恢复；音频和未处理图片退出后无法恢复。</p>
            <button type="button" onClick={() => setExitPrompt(false)}>
              继续编辑
            </button>
            <button type="button" onClick={() => {
              if (draftStore.write({ text, candidates: items, voiceTexts, ocrTexts })) onClose();
              else setMessage("保留草稿失败，请重试或继续编辑");
            }}>
              保留草稿退出
            </button>
            <button
              type="button"
              onClick={() => {
                if (draftStore.clear()) {
                  setText("");
                  setItems([]);
                  setVoiceTexts([]);
                  setOcrTexts([]);
                  onClose();
                } else setMessage("清除草稿失败，请重试");
              }}
            >
              放弃草稿退出
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
