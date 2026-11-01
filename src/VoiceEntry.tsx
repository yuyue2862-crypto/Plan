import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { SourceText } from "./data/textEntry";
import {
  cancelledBySwipe, MAX_RECORDING_MS, microphoneAvailability,
  speechErrorMessage, speechRecognitionConstructor,
  type SpeechRecognitionLike,
} from "./data/voiceEngine";

type Phase = "idle" | "permission" | "recording" | "recognizing";
type SegmentStatus = "recognizing" | "success" | "error";
interface SegmentMeta { status: SegmentStatus; error: string; audioUrl: string | null }
interface Attempt { id: string; startY: number; requestedAt: number; released: boolean; cancelled: boolean }
interface Session {
  id: string;
  recognition: SpeechRecognitionLike;
  recorder: MediaRecorder;
  stream: MediaStream;
  startedAt: number;
  finals: Map<number, string>;
  interim: string;
  chunks: Blob[];
  stopping: boolean;
  cancelled: boolean;
  error: string;
  limitTimer: number;
  elapsedTimer: number;
  endTimer: number | null;
}

export function VoiceEntry({ texts, onTextsChange, onGenerate, clearedIds, hidden }: {
  texts: SourceText[];
  onTextsChange: (updater: (current: SourceText[]) => SourceText[]) => void;
  onGenerate: () => void;
  clearedIds: string[];
  hidden: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [cancelHint, setCancelHint] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [message, setMessage] = useState("");
  const [meta, setMeta] = useState<Record<string, SegmentMeta>>({});
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const attemptRef = useRef<Attempt | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const mountedRef = useRef(true);
  const supportMessage = microphoneAvailability(window);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const session = sessionRef.current;
      if (session) {
        session.cancelled = true;
        window.clearTimeout(session.limitTimer);
        window.clearInterval(session.elapsedTimer);
        if (session.endTimer !== null) window.clearTimeout(session.endTimer);
        try { session.recognition.abort(); } catch { /* already stopped */ }
        if (session.recorder.state !== "inactive") session.recorder.stop();
        session.stream.getTracks().forEach((track) => track.stop());
      }
      Object.values(metaRef.current).forEach((item) => { if (item.audioUrl) URL.revokeObjectURL(item.audioUrl); });
    };
  }, []);
  useEffect(() => {
    if (!clearedIds.length) return;
    const removed = new Set(clearedIds);
    for (const id of removed) {
      const url = metaRef.current[id]?.audioUrl;
      if (url) URL.revokeObjectURL(url);
    }
    setMeta((current) => {
      const next = { ...current };
      for (const id of removed) delete next[id];
      return next;
    });
  }, [clearedIds]);

  const setSegmentMeta = (id: string, change: Partial<SegmentMeta>) => {
    if (mountedRef.current) setMeta((current) => ({ ...current,
      [id]: { status: current[id]?.status ?? "recognizing", error: current[id]?.error ?? "", audioUrl: current[id]?.audioUrl ?? null, ...change },
    }));
  };
  function finalize(session: Session) {
    if (sessionRef.current !== session || session.cancelled) return;
    if (session.endTimer !== null) window.clearTimeout(session.endTimer);
    const text = [...session.finals.entries()].sort(([a], [b]) => a - b).map(([, value]) => value).join(" ").trim()
      || session.interim.trim();
    if (mountedRef.current) {
      if (text) {
        onTextsChange((current) => current.map((item) => item.id === session.id ? { ...item, text, imported: false } : item));
        setSegmentMeta(session.id, { status: "success", error: session.finals.size ? "" : "仅获得临时识别结果，请仔细核对。" });
      } else {
        setSegmentMeta(session.id, { status: "error", error: session.error || speechErrorMessage("no-speech") });
      }
      setPhase("idle"); setLiveText(""); setElapsed(0); setCancelHint(false);
    }
    session.stream.getTracks().forEach((track) => track.stop());
    sessionRef.current = null;
  }
  function stopSession(reason: "release" | "limit" | "service_end" | "cancel") {
    const session = sessionRef.current;
    if (!session || session.stopping) return;
    session.stopping = true;
    session.cancelled = reason === "cancel";
    window.clearTimeout(session.limitTimer);
    window.clearInterval(session.elapsedTimer);
    if (reason === "limit") setMessage("已达到 60 秒上限，自动停止并等待识别结果。");
    if (reason === "cancel") {
      try { session.recognition.abort(); } catch { /* already ended */ }
      if (session.recorder.state !== "inactive") session.recorder.stop();
      session.stream.getTracks().forEach((track) => track.stop());
      onTextsChange((current) => current.filter((item) => item.id !== session.id));
      setMeta((current) => { const next = { ...current }; delete next[session.id]; return next; });
      sessionRef.current = null;
      setPhase("idle"); setElapsed(0); setCancelHint(false); setLiveText("");
      setMessage("已取消本次录音，没有加入候选任务。");
      return;
    }
    setPhase("recognizing");
    setSegmentMeta(session.id, { status: "recognizing" });
    if (session.recorder.state !== "inactive") session.recorder.stop();
    if (reason !== "service_end") {
      try { session.recognition.stop(); } catch { finalize(session); return; }
    } else finalize(session);
    session.endTimer = window.setTimeout(() => finalize(session), 6000);
  }
  async function startRecording(startY: number) {
    if (supportMessage) { setMessage(supportMessage); return; }
    if (phase !== "idle") return;
    const Constructor = speechRecognitionConstructor(window);
    if (!Constructor) return;
    const attempt: Attempt = { id: crypto.randomUUID(), startY, requestedAt: Date.now(), released: false, cancelled: false };
    attemptRef.current = attempt;
    setMessage(""); setPhase("permission");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (attemptRef.current !== attempt || attempt.released || attempt.cancelled || !mountedRef.current || Date.now() - attempt.requestedAt > 1500) {
        stream.getTracks().forEach((track) => track.stop());
        attemptRef.current = null;
        if (mountedRef.current) { setPhase("idle"); setMessage("麦克风已授权；请再次按住按钮开始录音。"); }
        return;
      }
      const recorder = new MediaRecorder(stream);
      const recognition = new Constructor();
      recognition.lang = "zh-CN";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      const session: Session = {
        id: attempt.id, recognition, recorder, stream, startedAt: Date.now(),
        finals: new Map(), interim: "", chunks: [], stopping: false, cancelled: false,
        error: "", limitTimer: 0, elapsedTimer: 0, endTimer: null,
      };
      sessionRef.current = session;
      onTextsChange((current) => [...current, { id: session.id, text: "", imported: false }]);
      setSegmentMeta(session.id, { status: "recognizing", error: "", audioUrl: null });
      recorder.ondataavailable = (event) => { if (event.data.size) session.chunks.push(event.data); };
      recorder.onstop = () => {
        if (session.cancelled || !mountedRef.current || !session.chunks.length) return;
        const audio = new Blob(session.chunks, { type: recorder.mimeType || "audio/webm" });
        if (audio.size) setSegmentMeta(session.id, { audioUrl: URL.createObjectURL(audio) });
      };
      recognition.onresult = (event) => {
        let interim = "";
        for (let index = event.resultIndex; index < event.results.length; index++) {
          const result = event.results[index];
          if (result.isFinal) session.finals.set(index, result[0].transcript.trim());
          else interim += result[0].transcript;
        }
        session.interim = interim;
        if (mountedRef.current) setLiveText([...session.finals.values()].join(" ") + interim);
      };
      recognition.onerror = (event) => {
        session.error = speechErrorMessage(event.error);
        if (event.error === "not-allowed" || event.error === "audio-capture" || event.error === "network")
          stopSession("service_end");
      };
      recognition.onend = () => {
        if (session.cancelled || sessionRef.current !== session) return;
        if (!session.stopping) stopSession("service_end");
        else finalize(session);
      };
      recorder.start();
      recognition.start();
      session.limitTimer = window.setTimeout(() => stopSession("limit"), MAX_RECORDING_MS);
      session.elapsedTimer = window.setInterval(() => setElapsed(Math.min(60, Math.floor((Date.now() - session.startedAt) / 1000))), 250);
      setPhase("recording");
    } catch (error) {
      if (sessionRef.current) sessionRef.current.cancelled = true;
      sessionRef.current?.stream.getTracks().forEach((track) => track.stop());
      if (sessionRef.current?.recorder.state !== "inactive") sessionRef.current?.recorder.stop();
      sessionRef.current = null;
      if (mountedRef.current) {
        onTextsChange((current) => current.filter((item) => item.id !== attempt.id));
        setMeta((current) => { const next = { ...current }; delete next[attempt.id]; return next; });
        setPhase("idle");
        setMessage(error instanceof Error && error.name === "NotAllowedError"
          ? "麦克风权限被拒绝。请在浏览器地址栏允许麦克风后重新按住录音。"
          : `无法开始录音：${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    void startRecording(event.clientY);
  }
  function pointerEnd(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const attempt = attemptRef.current;
    if (!attempt) return;
    const shouldCancel = cancelled || attempt.cancelled || cancelledBySwipe(attempt.startY, event.clientY);
    attempt.released = true;
    attempt.cancelled = shouldCancel;
    attemptRef.current = null;
    if (sessionRef.current?.id === attempt.id) stopSession(shouldCancel ? "cancel" : "release");
    else if (phase === "permission") { setPhase("idle"); setMessage(shouldCancel ? "已取消本次录音。" : "授权完成后请再次按住录音。"); }
  }
  function removeSegment(id: string) {
    const url = meta[id]?.audioUrl;
    if (url) URL.revokeObjectURL(url);
    setMeta((current) => { const next = { ...current }; delete next[id]; return next; });
    onTextsChange((current) => current.filter((item) => item.id !== id));
  }
  return <section className="source-panel voice-panel" hidden={hidden} aria-label="语音录入">
    <p className="source-note">按住说话，松开识别；上滑 80px 后松开可取消。每段最多 60 秒，可连续录制。语音可能由浏览器服务处理；本站不永久保存音频，也不上传到自建服务。</p>
    {supportMessage ? <p className="entry-message" role="alert">{supportMessage} 可切换到“文字录入”继续。</p> :
      <>
        <p className="source-note">首次使用请允许麦克风，用于录音和本次回听。</p>
        <button type="button" className={`record-button ${phase === "recording" ? "is-recording" : ""} ${cancelHint ? "is-cancelling" : ""}`}
          onPointerDown={pointerDown}
          onPointerMove={(event) => { const attempt = attemptRef.current; if (attempt && phase === "recording") setCancelHint(cancelledBySwipe(attempt.startY, event.clientY)); }}
          onPointerUp={(event) => pointerEnd(event)} onPointerCancel={(event) => pointerEnd(event, true)}
          disabled={phase === "recognizing"} aria-label="按住录音，松开识别，上滑取消">
          {phase === "permission" ? "等待麦克风授权" : phase === "recording" ? `${cancelHint ? "松手取消" : "正在录音"} ${elapsed} / 60 秒` : phase === "recognizing" ? "正在识别…" : "按住录音"}
        </button>
        {phase === "recording" && <p className="record-live">{cancelHint ? "上滑取消本次录音" : liveText || "正在倾听普通话…"}</p>}
      </>}
    {message && <p className="entry-message" role="status">{message}</p>}
    <div className="source-list">
      {texts.map((item, index) => <article className="source-card" key={item.id}>
        <div className="source-card-header"><strong>第 {index + 1} 段语音</strong><span>{meta[item.id]?.status === "error" ? "识别失败" : meta[item.id]?.status === "recognizing" ? "正在识别" : item.imported ? "已加入预览" : item.text ? "等待用户确认" : "等待识别"}</span></div>
        {meta[item.id]?.error && <p className="entry-message" role="alert">{meta[item.id].error}</p>}
        {meta[item.id]?.audioUrl && <audio controls src={meta[item.id].audioUrl ?? undefined} aria-label={`回听第 ${index + 1} 段录音`} />}
        <label className="source-text-label">识别文字（可修改）
          <textarea value={item.text} onChange={(event) => onTextsChange((current) => current.map((segment) => segment.id === item.id ? { ...segment, text: event.target.value, imported: false } : segment))}
            placeholder="识别失败时可手动填写，或重新录制一段" />
        </label>
        <div className="source-card-actions"><button type="button" onClick={() => removeSegment(item.id)}>删除此段</button></div>
      </article>)}
    </div>
    {texts.some((item) => !item.imported && item.text.trim()) && <button className="source-primary" type="button" onClick={onGenerate}>从语音文字生成任务预览</button>}
  </section>;
}
