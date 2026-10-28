import { describe, expect, it } from "vitest";
import {
  CURRENCIES,
  fetchRate,
  formatAmount,
  formatMoney,
  getCurrency,
  readCachedRate,
} from "./currency";
import type { StorageLike } from "./storage";
import type { CurrencyCode } from "./types";

// ============================================================================
// 多币种与汇率 —— 守住三件事：
//   1. 金额显示带对符号、对的小数位（日元不带小数）
//   2. 接口返回的 CNY 基准值要正确取倒数（1 外币 = ? CNY）
//   3. 任何接口异常都返回 null，让调用方退回手动值/兜底值，绝不让页面算不出数
// ============================================================================

function memoryStore(initial: Record<string, string> = {}): StorageLike & {
  data: Record<string, string>;
} {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

/** 构造一个假 fetch，返回指定 payload */
function fakeFetch(payload: unknown, ok = true): typeof fetch {
  return (async () => ({
    ok,
    json: async () => payload,
  })) as unknown as typeof fetch;
}

describe("多币种", () => {
  it("金额带币种符号，日元默认不带小数", () => {
    expect(formatMoney(1234.567, "USD")).toBe("$1,234.57");
    expect(formatMoney(1234.567, "EUR")).toBe("€1,234.57");
    expect(formatMoney(1234.567, "JPY")).toBe("JP¥1,235");
    expect(formatMoney(1234.567, "HKD")).toBe("HK$1,234.57");
  });

  it("可以强制指定小数位（单价常需要 4 位）", () => {
    expect(formatAmount(1.2, "USD", 4)).toBe("1.2000");
    expect(formatMoney(1.2, "JPY", 2)).toBe("JP¥1.20");
  });

  it("非有限数字按 0 显示，不出现 NaN", () => {
    expect(formatAmount(Number.NaN, "USD")).toBe("0.00");
    expect(formatAmount(Number.POSITIVE_INFINITY, "USD")).toBe("0.00");
  });

  it("未知币种回退到第一个（USD），不会抛异常", () => {
    expect(getCurrency("XXX" as CurrencyCode).code).toBe(CURRENCIES[0].code);
  });

  it("每个币种都有兜底汇率且为正数（接口挂了也能算）", () => {
    for (const c of CURRENCIES) {
      expect(c.fallbackRate).toBeGreaterThan(0);
      expect(Number.isFinite(c.fallbackRate)).toBe(true);
    }
  });
});

describe("汇率获取", () => {
  it("把 CNY 基准值正确取倒数：1 外币 = ? CNY", async () => {
    // er-api 返回的是 1 CNY = 0.149678 USD
    const quote = await fetchRate(
      "USD",
      fakeFetch({
        result: "success",
        rates: { USD: 0.149678 },
        time_last_update_utc: "Wed, 28 Oct 2026 00:02:31 +0000",
      }),
      8000,
      null,
    );
    expect(quote).not.toBeNull();
    expect(quote!.rate).toBeCloseTo(6.681, 2);
    expect(quote!.source).toBe("api");
    expect(quote!.updatedAt).toContain("2026-10-28");
  });

  it("接口返回失败状态时返回 null", async () => {
    const quote = await fetchRate(
      "USD",
      fakeFetch({ result: "error", rates: { USD: 0.15 } }),
      8000,
      null,
    );
    expect(quote).toBeNull();
  });

  it("返回结构不对 / 缺币种 / 汇率非正数时返回 null", async () => {
    expect(await fetchRate("EUR", fakeFetch({ result: "success", rates: {} }), 8000, null)).toBeNull();
    expect(
      await fetchRate("EUR", fakeFetch({ result: "success", rates: { EUR: "7.4" } }), 8000, null),
    ).toBeNull();
    expect(
      await fetchRate("EUR", fakeFetch({ result: "success", rates: { EUR: 0 } }), 8000, null),
    ).toBeNull();
    expect(
      await fetchRate("EUR", fakeFetch({ result: "success", rates: { EUR: -1 } }), 8000, null),
    ).toBeNull();
  });

  it("HTTP 非 2xx 或网络异常都返回 null（不抛到页面）", async () => {
    expect(await fetchRate("USD", fakeFetch({}, false), 8000, null)).toBeNull();
    const boom = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await fetchRate("USD", boom, 8000, null)).toBeNull();
  });

  it("成功时写入缓存，12 小时内可直接读缓存不再请求", async () => {
    const store = memoryStore();
    await fetchRate(
      "EUR",
      fakeFetch({
        result: "success",
        rates: { EUR: 0.134436 },
        time_last_update_utc: "Wed, 28 Oct 2026 00:02:31 +0000",
      }),
      8000,
      store,
    );
    const cached = readCachedRate("EUR", store);
    expect(cached).not.toBeNull();
    expect(cached!.rate).toBeCloseTo(7.4385, 2);
    expect(cached!.source).toBe("cache");
  });

  it("缓存过期（超过 12 小时）后不再使用", async () => {
    const store = memoryStore();
    await fetchRate(
      "EUR",
      fakeFetch({ result: "success", rates: { EUR: 0.134436 } }),
      8000,
      store,
    );
    const thirteenHoursLater = Date.now() + 13 * 60 * 60 * 1000;
    expect(readCachedRate("EUR", store, thirteenHoursLater)).toBeNull();
  });

  it("缓存内容损坏时返回 null，不抛异常", () => {
    const store = memoryStore({ "ftc-rate-USD": "{not json" });
    expect(readCachedRate("USD", store)).toBeNull();
    const bad = memoryStore({ "ftc-rate-USD": JSON.stringify({ rate: "6.6", updatedAt: 1 }) });
    expect(readCachedRate("USD", bad)).toBeNull();
  });

  it("没有存储（隐私模式）时读写缓存都安全降级", async () => {
    expect(readCachedRate("USD", null)).toBeNull();
    const quote = await fetchRate(
      "USD",
      fakeFetch({ result: "success", rates: { USD: 0.15 } }),
      8000,
      null,
    );
    expect(quote).not.toBeNull(); // 没缓存也能拿到汇率
  });
});
