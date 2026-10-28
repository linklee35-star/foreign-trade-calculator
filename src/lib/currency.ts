import type { CurrencyCode } from "./types";
import type { StorageLike } from "./storage";

// ============================================================================
// 多币种与汇率
//
// 汇率方向统一为「1 单位外币 = 多少 CNY」，与外贸业务员的习惯一致
// （报价用外币，成本用人民币，换汇成本就是 CNY per 1 外币）。
//
// 三条获取路径，优先级从高到低：
//   1. 手动填写（用户改过就用手动值，永不被覆盖）
//   2. 实时 API（open.er-api.com，CNY 基准，CORS 开放）
//   3. 兜底参考值（下表，标注核实日期，离线/接口挂掉时仍能算）
// ============================================================================

export interface CurrencyMeta {
  code: CurrencyCode;
  /** 显示符号。JPY 用 JP¥ 是为了和人民币 ¥ 区分开 */
  symbol: string;
  name: string;
  /** 金额默认小数位（日元一般不带小数） */
  decimals: number;
  /** 兜底汇率：1 单位外币 = ? CNY */
  fallbackRate: number;
}

/** 兜底汇率的核实时间，接口不可用时显示出来，让用户知道这个数有多旧 */
export const FALLBACK_RATE_DATE = "2026-10-28";

export const CURRENCIES: CurrencyMeta[] = [
  { code: "USD", symbol: "$", name: "美元", decimals: 2, fallbackRate: 6.681 },
  { code: "EUR", symbol: "€", name: "欧元", decimals: 2, fallbackRate: 7.4385 },
  { code: "JPY", symbol: "JP¥", name: "日元", decimals: 0, fallbackRate: 0.0423 },
  { code: "GBP", symbol: "£", name: "英镑", decimals: 2, fallbackRate: 8.89 },
  { code: "HKD", symbol: "HK$", name: "港币", decimals: 2, fallbackRate: 0.8517 },
  { code: "AUD", symbol: "A$", name: "澳元", decimals: 2, fallbackRate: 4.6892 },
];

export function getCurrency(code: CurrencyCode): CurrencyMeta {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

/** 纯数字（不带符号），用于表格对齐 */
export function formatAmount(
  amount: number,
  code: CurrencyCode,
  digits?: number,
): string {
  const meta = getCurrency(code);
  const d = digits ?? meta.decimals;
  const safe = Number.isFinite(amount) ? amount : 0;
  return safe.toLocaleString("zh-CN", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

/** 带符号的金额 */
export function formatMoney(
  amount: number,
  code: CurrencyCode,
  digits?: number,
): string {
  return getCurrency(code).symbol + formatAmount(amount, code, digits);
}

/* ------------------------------------------------------------------ 汇率获取 */

const RATE_URL = "https://open.er-api.com/v6/latest/CNY";
const CACHE_PREFIX = "ftc-rate-";
/** 缓存有效期：汇率一天变不了几个点，12 小时内不重复请求 */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export interface RateQuote {
  /** 1 单位外币 = ? CNY */
  rate: number;
  /** 数据源更新时间（ISO） */
  updatedAt: string;
  source: "api" | "cache";
}

type FetchLike = typeof fetch;

const round4 = (n: number) => Math.round(n * 10000) / 10000;

function cacheKey(code: CurrencyCode): string {
  return CACHE_PREFIX + code;
}

function getStore(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readCachedRate(
  code: CurrencyCode,
  store: StorageLike | null = getStore(),
  now = Date.now(),
): RateQuote | null {
  if (!store) return null;
  try {
    const raw = store.getItem(cacheKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { rate?: unknown; updatedAt?: unknown; fetchedAt?: unknown };
    if (
      typeof parsed.rate !== "number" ||
      !Number.isFinite(parsed.rate) ||
      parsed.rate <= 0 ||
      typeof parsed.updatedAt !== "string" ||
      typeof parsed.fetchedAt !== "number"
    ) {
      return null;
    }
    if (now - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return { rate: parsed.rate, updatedAt: parsed.updatedAt, source: "cache" };
  } catch {
    return null;
  }
}

function writeCachedRate(
  code: CurrencyCode,
  quote: RateQuote,
  store: StorageLike | null = getStore(),
): void {
  if (!store) return;
  try {
    store.setItem(
      cacheKey(code),
      JSON.stringify({ rate: quote.rate, updatedAt: quote.updatedAt, fetchedAt: Date.now() }),
    );
  } catch {
    // 存不下不影响本次使用
  }
}

/**
 * 拉实时汇率。任何失败（断网、超时、返回结构不对、汇率非法）都返回 null，
 * 由调用方退回手动值或兜底参考值 —— 绝不因为接口挂了就让页面算不出数。
 */
export async function fetchRate(
  code: CurrencyCode,
  fetchImpl: FetchLike = fetch,
  timeoutMs = 8000,
  store: StorageLike | null = getStore(),
): Promise<RateQuote | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(RATE_URL, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data: unknown = await res.json();
    const payload = data as {
      result?: string;
      rates?: Record<string, unknown>;
      time_last_update_utc?: string;
    };
    if (payload.result !== "success") return null;

    const perCny = payload.rates?.[code];
    if (typeof perCny !== "number" || !Number.isFinite(perCny) || perCny <= 0) {
      return null;
    }

    const updatedAt =
      typeof payload.time_last_update_utc === "string"
        ? new Date(payload.time_last_update_utc).toISOString()
        : new Date().toISOString();

    const quote: RateQuote = { rate: round4(1 / perCny), updatedAt, source: "api" };
    writeCachedRate(code, quote, store);
    return quote;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
