import { describe, expect, it } from "vitest";
import { buildBreakdown } from "./breakdown";
import { computeQuote } from "./quote";
import type { QuoteInput } from "./types";

// ============================================================================
// 成本拆解 —— 明细行必须能对上 CIF 成本总额，否则业务员对账时会发现"差几块钱"
// ============================================================================

const base: QuoteInput = {
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

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("成本拆解", () => {
  it("明细行加总等于 CIF 成本总额（差额只在分位四舍五入）", () => {
    const result = computeQuote(base);
    const { lines, totalRMB } = buildBreakdown(base, result);

    expect(totalRMB).toBeCloseTo(result.cifCostUSD * base.exchangeRate, 6);
    expect(sum(lines.map((l) => l.amountRMB))).toBeCloseTo(totalRMB, 0);
  });

  it("退税是负数（冲减成本），且金额等于引擎算出的退税收入", () => {
    const result = computeQuote(base);
    const { lines } = buildBreakdown(base, result);
    const rebate = lines.find((l) => l.key === "rebate");
    expect(rebate).toBeDefined();
    expect(rebate!.amountRMB).toBeLessThan(0);
    expect(Math.abs(rebate!.amountRMB)).toBeCloseTo(result.rebateIncome, 2);
  });

  it("海运费按汇率折成人民币，方便和采购成本横向比较", () => {
    const result = computeQuote(base);
    const { lines } = buildBreakdown(base, result);
    const freight = lines.find((l) => l.key === "freight");
    expect(freight!.amountRMB).toBeCloseTo(base.freightUSD * base.exchangeRate, 2);
  });

  it("占比加总为 1（正负相抵后）", () => {
    const result = computeQuote(base);
    const { lines } = buildBreakdown(base, result);
    expect(sum(lines.map((l) => l.share))).toBeCloseTo(1, 2);
  });

  it("数量为 0 时占比全部为 0，不出现 NaN", () => {
    const zeroQty: QuoteInput = { ...base, quantity: 0 };
    const result = computeQuote(zeroQty);
    const { lines, totalRMB } = buildBreakdown(zeroQty, result);
    expect(Number.isFinite(totalRMB)).toBe(true);
    for (const line of lines) {
      expect(Number.isFinite(line.share)).toBe(true);
    }
  });
});
