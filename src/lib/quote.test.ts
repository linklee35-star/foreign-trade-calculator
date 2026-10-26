import { describe, expect, it } from "vitest";
import { computeQuote } from "./quote";
import type { QuoteInput } from "./types";

// ============================================================================
// 报价引擎单测 —— 覆盖退税、FOB/CFR/CIF 递进、保险加成、换汇成本与边界
// ============================================================================

const base: QuoteInput = {
  purchasePrice: 100, // RMB/件（含税）
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

describe("外贸报价计算", () => {
  it("退税以不含税价为基数（全额退税时采购成本可完全抵扣）", () => {
    const r = computeQuote(base);
    // 含税 10000 → 不含税 8849.56 → 退税率 13% → 退税 1150.44
    expect(r.purchaseTotal).toBe(10000);
    expect(r.priceExVat).toBeCloseTo(8849.56, 1);
    expect(r.rebateIncome).toBeCloseTo(1150.44, 1);
  });

  it("FOB 成本 = 采购含税 − 退税 + 国内费用", () => {
    const r = computeQuote(base);
    // 10000 − 1150.44 + 3000 = 11849.56 RMB
    expect(r.fobCostRMB).toBeCloseTo(11849.56, 1);
    expect(r.fobCostUSD).toBeCloseTo(11849.56 / 7.1, 1);
  });

  it("CIF 成本 = CFR / (1 − 保险加成 × 保险费率)", () => {
    const r = computeQuote(base);
    const cfr = r.fobCostUSD + 1000;
    expect(r.cfrCostUSD).toBeCloseTo(cfr, 1);
    expect(r.cifCostUSD).toBeCloseTo(cfr / (1 - 1.1 * 0.003), 1);
    expect(r.insuranceUSD).toBeCloseTo(r.cifCostUSD - r.cfrCostUSD, 1);
  });

  it("报价 = CIF 成本 × (1 + 利润率)，利润与单价正确", () => {
    const r = computeQuote(base);
    expect(r.quoteUSD).toBeCloseTo(r.cifCostUSD * 1.1, 1);
    expect(r.profitUSD).toBeCloseTo(r.quoteUSD - r.cifCostUSD, 1);
    expect(r.quoteUnitUSD).toBeCloseTo(r.quoteUSD / 100, 2);
  });

  it("换汇成本低于银行汇率才判定健康", () => {
    const healthy = computeQuote(base);
    expect(healthy.exchangeCost).toBeLessThan(7.1);
    expect(healthy.healthy).toBe(true);

    // 亏损报价（利润率为负）→ 换汇成本高于银行汇率
    // 注：利润率为 0 时换汇成本恒等于银行汇率（报价由成本反推），必须负利润才会倒挂
    const bad = computeQuote({ ...base, rebateRate: 0, freightUSD: 5000, profitRate: -10 });
    expect(bad.exchangeCost).toBeGreaterThan(7.1);
    expect(bad.healthy).toBe(false);
  });

  it("边界：数量为 0 时不产生单价除零", () => {
    const r = computeQuote({ ...base, quantity: 0 });
    expect(r.quoteUnitUSD).toBe(0);
    expect(Number.isFinite(r.exchangeCost)).toBe(true);
  });

  it("边界：保险费率异常（加成×费率 ≥ 1）时不产生负值", () => {
    const r = computeQuote({ ...base, insuranceMarkup: 1000, insuranceRate: 20 });
    expect(r.cifCostUSD).toBeGreaterThan(0);
    expect(Number.isFinite(r.cifCostUSD)).toBe(true);
  });
});
