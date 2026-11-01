export const MAX_RECORDING_MS = 60_000;
export const CANCEL_SWIPE_PX = 80;

export interface SpeechResultLike { isFinal: boolean; 0: { transcript: string } }
export interface SpeechEventLike { resultIndex: number; results: ArrayLike<SpeechResultLike> }
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechEventLike) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function speechRecognitionConstructor(scope: Window): SpeechRecognitionConstructor | null {
  const browser = scope as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null;
}

export function cancelledBySwipe(startY: number, endY: number): boolean {
  return startY - endY >= CANCEL_SWIPE_PX;
}

export function speechErrorMessage(code: string): string {
  const reasons: Record<string, string> = {
    "no-speech": "没有检测到清晰语音，请靠近麦克风重新录制，或直接编辑文字。",
    "audio-capture": "无法从麦克风获取声音，请检查麦克风和系统权限。",
    "not-allowed": "麦克风权限被拒绝，请在浏览器地址栏允许后重试。",
    "service-not-allowed": "浏览器语音识别服务不可用，请换用支持的浏览器或文字录入。",
    network: "浏览器语音识别服务网络失败，请稍后重试或改用文字录入。",
    language: "浏览器当前无法识别普通话中文，请改用文字录入。",
    aborted: "本次识别已取消。",
  };
  return reasons[code] ?? `语音识别失败（${code || "未知原因"}），请重新录制或改用文字录入。`;
}

export function microphoneAvailability(scope: Window): string | null {
  if (!scope.isSecureContext)
    return "当前地址不是安全上下文。手机通过局域网 HTTP 地址访问时，麦克风通常被浏览器限制；请改用 HTTPS 或在本机 localhost 使用。";
  if (!speechRecognitionConstructor(scope))
    return "当前浏览器没有可用的原生语音识别接口，请使用文字录入。";
  if (!scope.navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
    return "当前浏览器无法同时录制可回听的音频，请使用支持麦克风录制的浏览器或文字录入。";
  return null;
}
