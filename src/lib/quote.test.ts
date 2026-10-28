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
  volumePerUnit: 0,
  weightPerUnit: 0,
  ...over,
});

const base: QuoteInput = {
  items: [item()],
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
  currency: "USD",
  rateSource: "manual",
  rateUpdatedAt: "",
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

  it("佣金只影响净收入与换汇成本，不改变给客户的报价", () => {
    const noCommission = computeQuote({ ...base, commissionRate: 0 });
    const withCommission = computeQuote({ ...base, commissionRate: 5 });

    // 报价对客户是同一个数
    expect(withCommission.quoteUSD).toBe(noCommission.quoteUSD);
    // 净收入 = FOB 报价 × (1 − 佣金)
    expect(withCommission.netIncomeUSD).toBeCloseTo(noCommission.fobCostUSD * 1.1 * 0.95, 1);
    expect(withCommission.commissionUSD).toBeCloseTo(withCommission.quoteUSD * 0.05, 1);
    // 收入变少 → 换汇成本变差（数字更大）
    expect(withCommission.exchangeCost).toBeGreaterThan(noCommission.exchangeCost);
  });

  it("佣金 100% 时净收入为 0，换汇成本归零并判为不健康（不出现 Infinity）", () => {
    const r = computeQuote({ ...base, commissionRate: 100 });
    expect(r.netIncomeUSD).toBe(0);
    expect(r.exchangeCost).toBe(0);
    expect(r.healthy).toBe(false);
  });

  it("佣金率超出 0~100 时被夹到边界，不产生负数收入", () => {
    const over = computeQuote({ ...base, commissionRate: 150 });
    const negative = computeQuote({ ...base, commissionRate: -20 });
    expect(over.netIncomeUSD).toBe(0);
    expect(negative.netIncomeUSD).toBeCloseTo(negative.fobCostUSD * 1.1, 1);
  });

  it("按体积重分摊：泡货按体积、重货按重量，各自择大后分费用", () => {
    const r = computeQuote({
      ...base,
      allocation: "volume",
      items: [
        // 泡货：1 件 0.5 CBM、10 kg → 50 CBM vs 1 吨 → 按体积 50 计费吨
        item({ id: "bulky", quantity: 100, volumePerUnit: 0.5, weightPerUnit: 10 }),
        // 重货：1 件 0.001 CBM、25 kg → 0.1 CBM vs 2.5 吨 → 按重量 2.5 计费吨
        item({ id: "heavy", quantity: 100, volumePerUnit: 0.001, weightPerUnit: 25 }),
      ],
    });
    const bulky = r.items[0];
    const heavy = r.items[1];
    expect(bulky.chargeableTon).toBeCloseTo(50, 2);
    expect(heavy.chargeableTon).toBeCloseTo(2.5, 2);
    // 泡货计费吨远大于重货，分摊的费用也应该远大于
    expect(bulky.allocatedRMB).toBeGreaterThan(heavy.allocatedRMB);
    expect(bulky.share).toBeGreaterThan(heavy.share);
  });

  it("整单计费吨 = max(总体积, 总重量 ÷ 1000)", () => {
    const bulky = computeQuote({
      ...base,
      items: [item({ quantity: 10, volumePerUnit: 2, weightPerUnit: 1 })],
    });
    // 20 CBM vs 0.01 吨 → 20
    expect(bulky.totalVolumeCBM).toBeCloseTo(20, 3);
    expect(bulky.chargeableTon).toBeCloseTo(20, 3);

    const heavy = computeQuote({
      ...base,
      items: [item({ quantity: 100, volumePerUnit: 0.01, weightPerUnit: 30 })],
    });
    // 1 CBM vs 3 吨 → 3
    expect(heavy.totalVolumeCBM).toBeCloseTo(1, 3);
    expect(heavy.totalWeightKg).toBeCloseTo(3000, 1);
    expect(heavy.chargeableTon).toBeCloseTo(3, 3);
  });

  it("选了按体积重但没填体积/重量时，自动退回货值分摊（不破坏各行之和 = 整单）", () => {
    const r = computeQuote({
      ...base,
      allocation: "volume",
      items: [
        item({ id: "a", purchasePrice: 100, quantity: 100 }),
        item({ id: "b", purchasePrice: 300, quantity: 100 }),
      ],
    });
    const sumCif = r.items.reduce((s, i) => s + i.cifCostRMB, 0);
    expect(sumCif).toBeCloseTo(r.cifCostRMB, 0);
    expect(r.chargeableTon).toBe(0);
    // 退回货值口径：高价行摊得更多
    expect(r.items[1].share).toBeGreaterThan(r.items[0].share);
  });

  it("按计费吨单价计费：海运费 = 单价 × 实际计费吨", () => {
    const r = computeQuote({
      ...base,
      freightMode: "perRT",
      freightRatePerRT: 45,
      items: [item({ quantity: 100, volumePerUnit: 0.2, weightPerUnit: 1 })],
    });
    // 20 CBM vs 0.1 吨 → 20 R/T
    expect(r.chargeableTon).toBeCloseTo(20, 3);
    expect(r.billableTon).toBeCloseTo(20, 3);
    expect(r.freightUSD).toBeCloseTo(20 * 45, 2);
    // 整单总额模式下的 1000 被忽略
    expect(r.freightUSD).not.toBe(base.freightUSD);
  });

  it("最低计费吨生效：实际计费吨不足时按最低计收", () => {
    const r = computeQuote({
      ...base,
      freightMode: "perRT",
      freightRatePerRT: 45,
      minChargeableTon: 2,
      items: [item({ quantity: 10, volumePerUnit: 0.05, weightPerUnit: 1 })], // 0.5 R/T
    });
    expect(r.chargeableTon).toBeCloseTo(0.5, 3);
    expect(r.billableTon).toBeCloseTo(2, 3); // 被抬到最低
    expect(r.freightUSD).toBeCloseTo(2 * 45, 2);
  });

  it("实际计费吨超过最低时，最低值不参与计算（不会压低运费）", () => {
    const r = computeQuote({
      ...base,
      freightMode: "perRT",
      freightRatePerRT: 45,
      minChargeableTon: 2,
      items: [item({ quantity: 100, volumePerUnit: 0.1, weightPerUnit: 1 })], // 10 R/T
    });
    expect(r.billableTon).toBeCloseTo(10, 3);
    expect(r.freightUSD).toBeCloseTo(10 * 45, 2);
  });

  it("整单总额模式下最低计费吨不起作用（总额已含最低，不重复计）", () => {
    const withMin = computeQuote({ ...base, freightMode: "total", minChargeableTon: 5 });
    const withoutMin = computeQuote({ ...base, freightMode: "total", minChargeableTon: 0 });
    expect(withMin.freightUSD).toBe(withoutMin.freightUSD);
    expect(withMin.freightUSD).toBe(base.freightUSD);
    expect(withMin.billableTon).toBe(0);
  });

  it("按吨单价计费时，分摊不变量仍成立（各行之和 = 整单）", () => {
    const r = computeQuote({
      ...base,
      allocation: "volume",
      freightMode: "perRT",
      freightRatePerRT: 50,
      minChargeableTon: 3,
      items: [
        item({ id: "a", quantity: 100, volumePerUnit: 0.1, weightPerUnit: 2 }),
        item({ id: "b", quantity: 100, volumePerUnit: 0.02, weightPerUnit: 8 }),
      ],
    });
    const sumCif = r.items.reduce((s, i) => s + i.cifCostRMB, 0);
    expect(sumCif).toBeCloseTo(r.cifCostRMB, 0);
    const sumAmount = r.items.reduce((s, i) => s + i.amountUSD, 0);
    expect(sumAmount).toBeCloseTo(r.quoteUSD, 0);
  });
});
