import { describe, expect, it } from "vitest";
import { cancelledBySwipe, MAX_RECORDING_MS, microphoneAvailability, speechErrorMessage, speechRecognitionConstructor } from "./voiceEngine";

describe("browser voice entry", () => {
  it("enforces 60 seconds and an upward cancellation gesture", () => {
    expect(MAX_RECORDING_MS).toBe(60_000);
    expect(cancelledBySwipe(300, 220)).toBe(true);
    expect(cancelledBySwipe(300, 221)).toBe(false);
    expect(cancelledBySwipe(300, 360)).toBe(false);
  });
  it("detects unsupported or insecure browsers instead of claiming recognition", () => {
    const insecure = { isSecureContext: false } as Window;
    expect(microphoneAvailability(insecure)).toContain("安全上下文");
    const noSpeech = { isSecureContext: true, navigator: { mediaDevices: { getUserMedia() {} } } } as unknown as Window;
    expect(speechRecognitionConstructor(noSpeech)).toBeNull();
    expect(microphoneAvailability(noSpeech)).toContain("没有可用");
    expect(speechErrorMessage("network")).toContain("网络失败");
  });
});
