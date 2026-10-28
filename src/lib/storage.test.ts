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
// 多货号之后还要守住：坏行丢弃、好行保留、全坏时回退默认行
// ============================================================================

const FALLBACK: QuoteInput = {
  items: [
    {
      id: "item-1",
      name: "默认货号",
      spec: "",
      hsCode: "",
      quantity: 100,
      purchasePrice: 100,
      rebateRate: 13,
      volumePerUnit: 0.02,
      weightPerUnit: 0.5,
    },
  ],
  vatRate: 13,
  domesticFees: 2000,
  bankFee: 500,
  certFee: 500,
  freightUSD: 1000,
  insuranceRate: 0.3,
  insuranceMarkup: 110,
  exchangeRate: 7.1,
  profitRate: 10,
  commissionRate: 0,
  allocation: "value",
  quoteNo: "",
  customer: "",
  incoterm: "CIF",
  pol: "Shanghai",
  pod: "",
  leadTime: "",
  validDays: 15,
  paymentTerm: "",
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

  it("写入后能原样读回（含多货号与报价单抬头）", () => {
    const store = memoryStore();
    const edited: QuoteInput = {
      ...FALLBACK,
      items: [
        {
          id: "a",
          name: "货号A",
          spec: "20cm",
          hsCode: "3926909090",
          quantity: 500,
          purchasePrice: 88.5,
          rebateRate: 9,
          volumePerUnit: 0.015,
          weightPerUnit: 0.8,
        },
        {
          id: "b",
          name: "货号B",
          spec: "",
          hsCode: "",
          quantity: 200,
          purchasePrice: 12,
          rebateRate: 0,
          volumePerUnit: 0,
          weightPerUnit: 2,
        },
      ],
      incoterm: "FOB",
      allocation: "quantity",
      quoteNo: "Q-20261028-01",
      customer: "ACME Trading",
      pol: "Ningbo",
      pod: "Hamburg",
      leadTime: "45 days",
      commissionRate: 3,
      paymentTerm: "L/C at sight",
      validDays: 30,
    };
    writeInput(store, edited);
    expect(readInput(store, FALLBACK)).toEqual(edited);
  });

  it("存档缺字段时，缺的用默认值补齐", () => {
    const store = memoryStore({ [STORAGE_KEY]: JSON.stringify({ profitRate: 25 }) });
    const result = readInput(store, FALLBACK);
    expect(result.profitRate).toBe(25);
    expect(result.exchangeRate).toBe(FALLBACK.exchangeRate);
    expect(result.items).toEqual(FALLBACK.items);
  });

  it("坏存档（非法 JSON / 非对象）退回默认值，不抛异常", () => {
    expect(readInput(memoryStore({ [STORAGE_KEY]: "{not json" }), FALLBACK)).toEqual(FALLBACK);
    expect(readInput(memoryStore({ [STORAGE_KEY]: "null" }), FALLBACK)).toEqual(FALLBACK);
    expect(readInput(memoryStore({ [STORAGE_KEY]: '"a string"' }), FALLBACK)).toEqual(FALLBACK);
  });

  it("非数字字段被忽略（手改 localStorage 也不能污染计算）", () => {
    const store = memoryStore({
      [STORAGE_KEY]: JSON.stringify({
        profitRate: "25",
        exchangeRate: null,
        rebateRate: 0,
        unknownField: 999,
      }),
    });
    const result = readInput(store, FALLBACK);
    expect(result.profitRate).toBe(FALLBACK.profitRate); // 字符串被拒
    expect(result.exchangeRate).toBe(FALLBACK.exchangeRate); // null 被拒
    expect("unknownField" in result).toBe(false);
  });

  it("枚举字段只接受白名单值（防手改 URL/存储塞进非法术语）", () => {
    const store = memoryStore({
      [STORAGE_KEY]: JSON.stringify({ incoterm: "EXW", allocation: "weight" }),
    });
    const result = readInput(store, FALLBACK);
    expect(result.incoterm).toBe(FALLBACK.incoterm);
    expect(result.allocation).toBe(FALLBACK.allocation);
  });

  it("坏货号行被丢弃，好行保留", () => {
    const store = memoryStore({
      [STORAGE_KEY]: JSON.stringify({
        items: [
          { id: "a", name: "好行", quantity: 10, purchasePrice: 5, rebateRate: 13 },
          { id: "b", name: "坏行-数量是字符串", quantity: "10", purchasePrice: 5, rebateRate: 13 },
          { id: "c", name: "坏行-缺退税率", quantity: 10, purchasePrice: 5 },
          "not an object",
        ],
      }),
    });
    const result = readInput(store, FALLBACK);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("好行");
  });

  it("货号行负数数量被夹到 0", () => {
    const store = memoryStore({
      [STORAGE_KEY]: JSON.stringify({
        items: [{ id: "a", name: "负数量", quantity: -5, purchasePrice: 5, rebateRate: 13 }],
      }),
    });
    expect(readInput(store, FALLBACK).items[0].quantity).toBe(0);
  });

  it("老存档没有体积/重量字段时补 0，不丢整行", () => {
    const store = memoryStore({
      [STORAGE_KEY]: JSON.stringify({
        items: [{ id: "old", name: "老数据", quantity: 10, purchasePrice: 5, rebateRate: 13 }],
      }),
    });
    const saved = readInput(store, FALLBACK).items[0];
    expect(saved.name).toBe("老数据");
    expect(saved.volumePerUnit).toBe(0);
    expect(saved.weightPerUnit).toBe(0);
  });

  it("分摊方式接受 volume（按计费吨）", () => {
    const store = memoryStore({ [STORAGE_KEY]: JSON.stringify({ allocation: "volume" }) });
    expect(readInput(store, FALLBACK).allocation).toBe("volume");
  });

  it("明细全坏时回退默认行，不产生空订单", () => {
    const store = memoryStore({ [STORAGE_KEY]: JSON.stringify({ items: [1, 2, 3] }) });
    expect(readInput(store, FALLBACK).items).toEqual(FALLBACK.items);
  });

  it("store 不可用（隐私模式）时全部安全降级", () => {
    expect(readInput(null, FALLBACK)).toEqual(FALLBACK);
    expect(readInput(undefined, FALLBACK)).toEqual(FALLBACK);
    expect(() => writeInput(null, FALLBACK)).not.toThrow();
    expect(() => clearInput(null)).not.toThrow();
  });

  it("清空后回到默认值", () => {
    const store = memoryStore();
    writeInput(store, { ...FALLBACK, profitRate: 1 });
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
