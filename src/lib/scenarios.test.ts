import { describe, expect, it } from "vitest";
import { buildMarginScenarios, buildTermScenarios } from "./scenarios";
import { computeQuote } from "./quote";
import type { QuoteInput } from "./types";

// ============================================================================
// 方案对比 —— 守住三件事：
//   1. 三个术语都算出来，且 FOB < CFR < CIF（报价必须随成本递进）
//   2. 对比不能污染原输入（纯函数）
//   3. 利润率档位合理：不为负、不重复、当前档标记正确
// ============================================================================

const base: QuoteInput = {
  items: [
    {
      id: "a",
      name: "A",
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
  freightMode: "total",
  freightRatePerRT: 45,
  minChargeableTon: 0,
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

describe("方案对比", () => {
  it("术语对比给出 FOB / CFR / CIF 三档，报价随成本递进", () => {
    const list = buildTermScenarios(base);
    expect(list.map((s) => s.incoterm)).toEqual(["FOB", "CFR", "CIF"]);

    const [fob, cfr, cif] = list;
    expect(fob.result.quoteUSD).toBeLessThan(cfr.result.quoteUSD);
    expect(cfr.result.quoteUSD).toBeLessThan(cif.result.quoteUSD);
    // 只有当前所选术语被标记
    expect(list.filter((s) => s.isCurrent)).toHaveLength(1);
    expect(cif.isCurrent).toBe(true);
  });

  it("术语对比不污染原输入", () => {
    const snapshot = JSON.stringify(base);
    buildTermScenarios(base);
    expect(JSON.stringify(base)).toBe(snapshot);
    // 原输入的报价仍按 CIF 算
    expect(computeQuote(base).quoteUSD).toBeCloseTo(
      buildTermScenarios(base).find((s) => s.incoterm === "CIF")!.result.quoteUSD,
      2,
    );
  });

  it("利润率敏感性给出 -3 / 当前 / +3 三档，报价随利润率上升", () => {
    const list = buildMarginScenarios(base, 3);
    expect(list.map((s) => s.profitRate)).toEqual([7, 10, 13]);
    expect(list[0].result.quoteUSD).toBeLessThan(list[1].result.quoteUSD);
    expect(list[1].result.quoteUSD).toBeLessThan(list[2].result.quoteUSD);
    expect(list.find((s) => s.isCurrent)!.profitRate).toBe(10);
  });

  it("利润率为 0 时下界夹到 0 且不重复出现两行", () => {
    const list = buildMarginScenarios({ ...base, profitRate: 0 }, 3);
    expect(list.map((s) => s.profitRate)).toEqual([0, 3]);
    expect(list.every((s) => s.profitRate >= 0)).toBe(true);
  });

  it("利润率低于步长时也夹到 0（不会出现负利润率报价）", () => {
    const list = buildMarginScenarios({ ...base, profitRate: 2 }, 3);
    expect(list.map((s) => s.profitRate)).toEqual([0, 2, 5]);
  });

  it("利润率升高时换汇成本变好（数字变小）", () => {
    const [low, , high] = buildMarginScenarios(base, 5);
    expect(high.result.exchangeCost).toBeLessThan(low.result.exchangeCost);
  });
});
