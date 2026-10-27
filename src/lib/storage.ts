import type { QuoteInput } from "./types";

const STORAGE_KEY = "foreign-trade-quote-input-v1";

/**
 * 只依赖 getItem/setItem/removeItem 三个方法，
 * 这样单测可以注入一个内存实现，不必引入 jsdom。
 */
export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

/**
 * 读取上次输入。任何异常（JSON 坏、字段缺失、隐私模式禁用存储）
 * 都退回默认值 —— 存不下最多是没记住，不能让页面打不开。
 */
export function readInput(
  store: StorageLike | null | undefined,
  fallback: QuoteInput,
): QuoteInput {
  if (!store) return fallback;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fallback;

    const merged: QuoteInput = { ...fallback };
    for (const key of Object.keys(fallback) as (keyof QuoteInput)[]) {
      const value = (parsed as Record<string, unknown>)[key];
      // 只接受有限数字：手改 localStorage 塞进字符串/NaN 也不能污染计算
      if (typeof value === "number" && Number.isFinite(value)) {
        merged[key] = value;
      }
    }
    return merged;
  } catch {
    return fallback;
  }
}

/** 保存输入。隐私模式或配额满时静默失败，不影响计算本身。 */
export function writeInput(
  store: StorageLike | null | undefined,
  input: QuoteInput,
): void {
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(input));
  } catch {
    // 忽略：存不下不是致命错误
  }
}

/** 清空已保存的输入（恢复默认值用） */
export function clearInput(store: StorageLike | null | undefined): void {
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}

export { STORAGE_KEY };
