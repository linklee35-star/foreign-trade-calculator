import { describe, expect, it } from "vitest";
import {
  clearInput,
  readInput,
  STORAGE_KEY,
  writeInput,
  type StorageLike,
} from "./storage";
import type { QuoteInput } from "./types";

// ============================================================================
// 输入持久化 —— 守住「刷新不丢数据」和「坏存档不能把页面搞崩」两件事
// ============================================================================

const FALLBACK: QuoteInput = {
  purchasePrice: 100,
  quantity: 100,
  vatRate: 13,
  rebateRate: 13,
  domesticFees: 2000,
  bankFee: 500,
  certFee: 500,
  freightUSD: 1000,
  insuranceRate: 0.3,
  insuranceMarkup: 110,
  exchangeRate: 7.1,
  profitRate: 10,
};

function memoryStore(initial: Record<string, string> = {}): StorageLike & {
  data: Record<string, string>;
} {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

describe("输入持久化", () => {
  it("没有存档时返回默认值", () => {
    expect(readInput(memoryStore(), FALLBACK)).toEqual(FALLBACK);
  });

  it("写入后能原样读回", () => {
    const store = memoryStore();
    const edited: QuoteInput = { ...FALLBACK, purchasePrice: 88.5, quantity: 500, rebateRate: 9 };
    writeInput(store, edited);
    expect(readInput(store, FALLBACK)).toEqual(edited);
  });

  it("存档缺字段时，缺的用默认值补齐", () => {
    const store = memoryStore({ [STORAGE_KEY]: JSON.stringify({ purchasePrice: 66 }) });
    const result = readInput(store, FALLBACK);
    expect(result.purchasePrice).toBe(66);
    expect(result.quantity).toBe(FALLBACK.quantity);
    expect(result.exchangeRate).toBe(FALLBACK.exchangeRate);
  });

  it("坏存档（非法 JSON / 非对象）退回默认值，不抛异常", () => {
    expect(readInput(memoryStore({ [STORAGE_KEY]: "{not json" }), FALLBACK)).toEqual(FALLBACK);
    expect(readInput(memoryStore({ [STORAGE_KEY]: "null" }), FALLBACK)).toEqual(FALLBACK);
    expect(readInput(memoryStore({ [STORAGE_KEY]: '"a string"' }), FALLBACK)).toEqual(FALLBACK);
  });

  it("非数字字段被忽略（手改 localStorage 也不能污染计算）", () => {
    const store = memoryStore({
      [STORAGE_KEY]: JSON.stringify({
        purchasePrice: "88",
        quantity: null,
        vatRate: 13,
        rebateRate: 0,
        unknownField: 999,
      }),
    });
    const result = readInput(store, FALLBACK);
    expect(result.purchasePrice).toBe(FALLBACK.purchasePrice); // 字符串被拒
    expect(result.quantity).toBe(FALLBACK.quantity); // null 被拒
    expect(result.vatRate).toBe(13); // 合法数字保留
    expect(result.rebateRate).toBe(0); // 0 是合法值，不能被当成"空"
    expect("unknownField" in result).toBe(false); // 未知字段不进入输入
  });

  it("store 不可用（隐私模式）时全部安全降级", () => {
    expect(readInput(null, FALLBACK)).toEqual(FALLBACK);
    expect(readInput(undefined, FALLBACK)).toEqual(FALLBACK);
    expect(() => writeInput(null, FALLBACK)).not.toThrow();
    expect(() => clearInput(null)).not.toThrow();
  });

  it("清空后回到默认值", () => {
    const store = memoryStore();
    writeInput(store, { ...FALLBACK, purchasePrice: 1 });
    clearInput(store);
    expect(readInput(store, FALLBACK)).toEqual(FALLBACK);
    expect(store.data[STORAGE_KEY]).toBeUndefined();
  });

  it("setItem 抛异常时不影响调用方（配额满 / 隐私模式）", () => {
    const broken: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(() => writeInput(broken, FALLBACK)).not.toThrow();
    expect(() => clearInput(broken)).not.toThrow();
  });
});
