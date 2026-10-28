import { describe, expect, it } from "vitest";
import { computeQuote, createItem } from "./quote";
import type { QuoteInput, QuoteItem } from "./types";

// ============================================================================
// 报价引擎单测
// 覆盖：退税基数、多货号各自退税率、费用分摊、术语切换、换汇成本、边界
// ============================================================================

const item = (over: Partial<QuoteItem> = {}): QuoteItem => ({
  id: "a",
  name: "A",
  spec: "",
  hsCode: "",
  quantity: 100,
  purchasePrice: 100,
  rebateRate: 13,
  ...over,
});

const base: QuoteInput = {
  items: [item()],
  vatRate: 13,
  domesticFees: 2000,
  bankFee: 500,
  certFee: 500,
  freightUSD: 1000,
  insuranceRate: 0.3,
  insuranceMarkup: 110,
  exchangeRate: 7.1,
  profitRate: 10,
  allocation: "value",
  customer: "",
  incoterm: "CIF",
  validDays: 15,
  paymentTerm: "",
};

describe("外贸报价计算", () => {
  it("单货号口径与旧版一致（退税以不含税价为基数）", () => {
    const r = computeQuote(base);
    expect(r.purchaseTotal).toBe(10000);
    expect(r.priceExVat).toBeCloseTo(8849.56, 1);
    expect(r.rebateIncome).toBeCloseTo(1150.44, 1);
    expect(r.netGoodsCostRMB).toBeCloseTo(8849.56, 1);
    expect(r.domesticTotal).toBe(3000);
    expect(r.fobCostRMB).toBeCloseTo(11849.56, 1);
    expect(r.fobCostUSD).toBeCloseTo(1668.95, 1);
    expect(r.cfrCostUSD).toBeCloseTo(2668.95, 1);
    expect(r.cifCostUSD).toBeCloseTo(2677.79, 1);
    expect(r.insuranceUSD).toBeCloseTo(8.84, 1);
    expect(r.quoteUSD).toBeCloseTo(2945.57, 1);
  });

  it("多货号各自按自己的退税率退税", () => {
    const r = computeQuote({
      ...base,
      items: [
        item({ id: "a", purchasePrice: 100, quantity: 100, rebateRate: 13 }), // 退税 13%
        item({ id: "b", purchasePrice: 100, quantity: 100, rebateRate: 0 }), // 无退税
      ],
    });
    expect(r.purchaseTotal).toBe(20000);
    // 只有第一行产生退税：10000 / 1.13 × 13%
    expect(r.rebateIncome).toBeCloseTo(1150.44, 1);
    expect(r.items[0].rebateIncome).toBeCloseTo(1150.44, 1);
    expect(r.items[1].rebateIncome).toBe(0);
    expect(r.items[1].netCostRMB).toBe(10000);
  });

  it("按货值分摊：各行 CIF 成本加总等于整单 CIF 成本", () => {
    const r = computeQuote({
      ...base,
      items: [
        item({ id: "a", purchasePrice: 100, quantity: 100 }),
        item({ id: "b", purchasePrice: 300, quantity: 50 }),
      ],
    });
    const sumCif = r.items.reduce((s, i) => s + i.cifCostRMB, 0);
    expect(sumCif).toBeCloseTo(r.cifCostRMB, 0);
    // 货值高的行分摊更多费用
    expect(r.items[1].allocatedRMB).toBeGreaterThan(r.items[0].allocatedRMB);
  });

  it("按数量分摊：数量多的行分摊更多费用", () => {
    const r = computeQuote({
      ...base,
      allocation: "quantity",
      items: [
        item({ id: "a", purchasePrice: 100, quantity: 10 }),
        item({ id: "b", purchasePrice: 100, quantity: 90 }),
      ],
    });
    expect(r.items[1].allocatedRMB).toBeGreaterThan(r.items[0].allocatedRMB);
    // 数量占比 9:1
    expect(r.items[1].share).toBeCloseTo(0.9, 2);
    expect(r.items[0].share).toBeCloseTo(0.1, 2);
  });

  it("术语切换只改报价基数：FOB < CFR < CIF，利润等于基数 × 利润率", () => {
    const fob = computeQuote({ ...base, incoterm: "FOB" });
    const cfr = computeQuote({ ...base, incoterm: "CFR" });
    const cif = computeQuote({ ...base, incoterm: "CIF" });

    expect(fob.quoteUSD).toBeLessThan(cfr.quoteUSD);
    expect(cfr.quoteUSD).toBeLessThan(cif.quoteUSD);
    expect(fob.profitUSD).toBeCloseTo(fob.fobCostUSD * 0.1, 1);
    expect(cfr.profitUSD).toBeCloseTo(cfr.cfrCostUSD * 0.1, 1);
    expect(cif.profitUSD).toBeCloseTo(cif.cifCostUSD * 0.1, 1);
  });

  it("换汇成本口径固定用 FOB，与所选术语无关", () => {
    const a = computeQuote({ ...base, incoterm: "FOB" });
    const b = computeQuote({ ...base, incoterm: "CIF" });
    expect(a.exchangeCost).toBeCloseTo(b.exchangeCost, 6);
    expect(a.healthy).toBe(b.healthy);
  });

  it("利润率为 0 时换汇成本等于银行汇率（数学必然）", () => {
    const r = computeQuote({ ...base, profitRate: 0 });
    expect(r.exchangeCost).toBeCloseTo(base.exchangeRate, 3);
  });

  it("退税率 0 时净货值成本等于含税采购额", () => {
    const r = computeQuote({ ...base, items: [item({ rebateRate: 0 })] });
    expect(r.rebateIncome).toBe(0);
    expect(r.netGoodsCostRMB).toBe(10000);
  });

  it("空明细时全部金额归零：没货就没有订单，固定费用不算成报价", () => {
    const r = computeQuote({ ...base, items: [] });
    expect(r.totalQuantity).toBe(0);
    expect(r.items).toHaveLength(0);
    expect(r.quoteUSD).toBe(0);
    expect(r.cifCostUSD).toBe(0);
    expect(r.domesticTotal).toBe(0); // 固定费用也不进入成本
    expect(r.exchangeCost).toBe(0);
    expect(r.healthy).toBe(false);
  });

  it("总数量为 0 但保留了明细行时，行还在、金额为 0", () => {
    const r = computeQuote({ ...base, items: [item({ quantity: 0 }), item({ id: "b", quantity: 0 })] });
    expect(r.items).toHaveLength(2);
    expect(r.quoteUSD).toBe(0);
    expect(r.items[0].unitPrice).toBe(0);
    expect(Number.isFinite(r.items[0].amountUSD)).toBe(true);
  });

  it("保险费率异常（加成 × 费率 ≥ 1）时不出现负数或除零", () => {
    const r = computeQuote({ ...base, insuranceRate: 100, insuranceMarkup: 110 });
    expect(Number.isFinite(r.cifCostUSD)).toBe(true);
    expect(r.cifCostUSD).toBeGreaterThan(0);
    expect(r.insuranceUSD).toBeCloseTo(0, 2);
  });

  it("多货号单价按各自数量折算，加总等于整单报价", () => {
    const r = computeQuote({
      ...base,
      items: [
        item({ id: "a", quantity: 100, purchasePrice: 100 }),
        item({ id: "b", quantity: 200, purchasePrice: 50 }),
      ],
    });
    const sumAmount = r.items.reduce((s, i) => s + i.amountUSD, 0);
    expect(sumAmount).toBeCloseTo(r.quoteUSD, 0);
    expect(r.items[0].unitPrice).toBeCloseTo(r.items[0].amountUSD / 100, 3);
  });

  it("createItem 生成的空行可直接参与计算", () => {
    const fresh = createItem("new");
    const r = computeQuote({ ...base, items: [fresh] });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].purchaseTotal).toBe(0);
    expect(Number.isFinite(r.quoteUSD)).toBe(true);
  });
});
