import { DEFAULT_URGENCY_DAYS } from "../domain/classification";

export const SETTINGS_KEY = "four-quadrant:settings:v1";
type StorageLike = Pick<Storage, "getItem" | "setItem">;
export type SettingsResult = { ok: true; value: number } | { ok: false; message: string };

export function createSettingsStore(storage: StorageLike) {
  return {
    read(): SettingsResult {
      try {
        const raw = storage.getItem(SETTINGS_KEY);
        if (raw === null) return { ok: true, value: DEFAULT_URGENCY_DAYS };
        const value: unknown = JSON.parse(raw);
        if (value && typeof value === "object" && "version" in value && value.version === 1 &&
            "urgencyDays" in value && Number.isInteger(value.urgencyDays) &&
            (value.urgencyDays as number) >= 1 && (value.urgencyDays as number) <= 14)
          return { ok: true, value: value.urgencyDays as number };
        return { ok: false, message: "紧急性设置内容无效，暂按默认 3 天显示；原设置未被清除" };
      } catch {
        return { ok: false, message: "无法读取紧急性设置，暂按默认 3 天显示" };
      }
    },
    write(days: number): SettingsResult {
      if (!Number.isInteger(days) || days < 1 || days > 14)
        return { ok: false, message: "紧急性阈值须为 1—14 天" };
      try {
        storage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, urgencyDays: days }));
        return { ok: true, value: days };
      } catch {
        return { ok: false, message: "紧急性设置保存失败，请检查浏览器本地存储" };
      }
    },
  };
}

export function browserSettingsStore() {
  return createSettingsStore({
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  });
}
