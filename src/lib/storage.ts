import type {
  AllocationMode,
  CurrencyCode,
  FreightMode,
  Incoterm,
  QuoteInput,
  QuoteItem,
  RateSource,
  RoundingMode,
} from "./types";

const STORAGE_KEY = "foreign-trade-quote-input-v2";

/**
 * 只依赖 getItem/setItem/removeItem 三个方法，
 * 这样单测可以注入一个内存实现，不必引入 jsdom。
 */
export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const NUMERIC_KEYS = [
  "vatRate",
  "domesticFees",
  "bankFee",
  "certFee",
  "freightUSD",
  "freightRatePerRT",
  "minChargeableTon",
  "insuranceRate",
  "insuranceMarkup",
  "exchangeRate",
  "profitRate",
  "commissionRate",
  "validDays",
  "roundingUnit",
] as const;

const TEXT_KEYS = [
  "quoteNo",
  "sellerName",
  "sellerAddress",
  "sellerContact",
  "customer",
  "pol",
  "pod",
  "leadTime",
  "paymentTerm",
  "rateUpdatedAt",
] as const;

const ALLOCATIONS: AllocationMode[] = ["value", "quantity", "volume"];
const INCOTERMS: Incoterm[] = ["FOB", "CFR", "CIF"];
const FREIGHT_MODES: FreightMode[] = ["total", "perRT"];
const CURRENCIES: CurrencyCode[] = ["USD", "EUR", "JPY", "GBP", "HKD", "AUD"];
const RATE_SOURCES: RateSource[] = ["manual", "api", "fallback"];
const ROUNDINGS: RoundingMode[] = ["none", "up", "nearest"];

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** 单个货号的白名单校验：类型不对就丢弃整行，避免半行脏数据进计算 */
function sanitizeItem(raw: unknown, index: number): QuoteItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  if (
    !isFiniteNumber(r.quantity) ||
    !isFiniteNumber(r.purchasePrice) ||
    !isFiniteNumber(r.rebateRate)
  ) {
    return null;
  }

  const text = (v: unknown) => (typeof v === "string" ? v : "");
  // 体积/重量是后加的字段：老存档没有时按 0 处理，而不是把整行丢掉
  const optionalNumber = (v: unknown) => (isFiniteNumber(v) ? Math.max(0, v) : 0);

  return {
    id: typeof r.id === "string" && r.id ? r.id : `item-restored-${index}`,
    name: text(r.name),
    spec: text(r.spec),
    hsCode: text(r.hsCode),
    quantity: Math.max(0, r.quantity),
    purchasePrice: r.purchasePrice,
    rebateRate: r.rebateRate,
    volumePerUnit: optionalNumber(r.volumePerUnit),
    weightPerUnit: optionalNumber(r.weightPerUnit),
  };
}

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

    const saved = parsed as Record<string, unknown>;
    const merged: QuoteInput = { ...fallback };

    for (const key of NUMERIC_KEYS) {
      const value = saved[key];
      // 只接受有限数字：手改 localStorage 塞进字符串/NaN 也不能污染计算
      if (isFiniteNumber(value)) merged[key] = value;
    }
    for (const key of TEXT_KEYS) {
      const value = saved[key];
      if (typeof value === "string") merged[key] = value;
    }
    if (
      typeof saved.allocation === "string" &&
      ALLOCATIONS.includes(saved.allocation as AllocationMode)
    ) {
      merged.allocation = saved.allocation as AllocationMode;
    }
    if (
      typeof saved.incoterm === "string" &&
      INCOTERMS.includes(saved.incoterm as Incoterm)
    ) {
      merged.incoterm = saved.incoterm as Incoterm;
    }
    if (
      typeof saved.freightMode === "string" &&
      FREIGHT_MODES.includes(saved.freightMode as FreightMode)
    ) {
      merged.freightMode = saved.freightMode as FreightMode;
    }
    if (
      typeof saved.currency === "string" &&
      CURRENCIES.includes(saved.currency as CurrencyCode)
    ) {
      merged.currency = saved.currency as CurrencyCode;
    }
    if (
      typeof saved.rateSource === "string" &&
      RATE_SOURCES.includes(saved.rateSource as RateSource)
    ) {
      merged.rateSource = saved.rateSource as RateSource;
    }
    if (
      typeof saved.rounding === "string" &&
      ROUNDINGS.includes(saved.rounding as RoundingMode)
    ) {
      merged.rounding = saved.rounding as RoundingMode;
    }

    if (Array.isArray(saved.items)) {
      const items = saved.items
        .map((item, index) => sanitizeItem(item, index))
        .filter((item): item is QuoteItem => item !== null);
      // 明细全坏时保留默认那一行，避免出现空订单
      if (items.length > 0) merged.items = items;
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
