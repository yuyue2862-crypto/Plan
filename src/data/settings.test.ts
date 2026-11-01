import { describe, expect, it } from "vitest";
import { createSettingsStore, SETTINGS_KEY } from "./settings";

describe("urgency settings", () => {
  it("defaults to 3, persists 1–14 and rejects invalid values", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const first = createSettingsStore(storage);
    expect(first.read()).toEqual({ ok: true, value: 3 });
    expect(first.write(14)).toEqual({ ok: true, value: 14 });
    expect(createSettingsStore(storage).read()).toEqual({ ok: true, value: 14 });
    expect(first.write(15).ok).toBe(false);
    expect(values.get(SETTINGS_KEY)).toContain('"urgencyDays":14');
  });
  it("reports broken storage without deleting the original value", () => {
    let raw = "{bad";
    const store = createSettingsStore({ getItem: () => raw, setItem: (_key, value) => { raw = value; } });
    expect(store.read().ok).toBe(false);
    expect(raw).toBe("{bad");
  });
});
