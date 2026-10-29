import type { ItemResult, QuoteInput, QuoteItem, QuoteResult, RoundingMode } from "./types";

// ============================================================================
// 外贸报价计算核心 —— 纯函数，零依赖，全部可单测
//
// 口径（外贸实务，Incoterms 2020）：
//   每个货号按自己的 HS 编码退税率退税，全单统一增值税率：
//     不含税价 = 采购含税 / (1 + 增值税率)
//     退税收入 = 不含税价 × 该货号退税率
//     净货值成本 = 采购含税 − 退税收入
//   FOB 成本 = 净货值成本 + 国内费用（报关/商检/拖车/港杂/银行/认证）
//   CFR 成本 = FOB 成本 + 海运费
//   CIF 成本 = CFR 成本 / (1 − 保险加成 × 保险费率)
//   报价 = 所选术语的成本 × (1 + 目标利润率)
//   换汇成本 = FOB 人民币成本 ÷ FOB 美元报价（低于银行汇率才有利润）
//
// 整单费用（国内 + 海运 + 保险）按货值或按数量分摊到每个货号，
// 这样才知道"哪个货号吃掉了成本"，而不是只看整单平均。
// ============================================================================

const round = (n: number, digits = 2): number => {
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
};

const num = (n: number): number => (Number.isFinite(n) ? n : 0);

/**
 * 把单价取整到指定单位。
 * epsilon 是必要的：29.4 / 0.1 在浮点里是 293.99999999999994，
 * 直接 ceil 会变成 294.0000...1 → 30.0，客户会发现"我按 29.4 算的，你怎么报 30"。
 */
function roundToUnit(value: number, mode: RoundingMode, unit: number): number {
  if (mode === "none" || unit <= 0) return value;
  const steps = value / unit;
  const rounded = mode === "up" ? Math.ceil(steps - 1e-9) : Math.round(steps);
  return rounded * unit;
}

/** 新建一个空货号（UI 里"添加一行"用） */
export function createItem(id: string): QuoteItem {
  return {
    id,
    name: "",
    spec: "",
    hsCode: "",
    quantity: 1,
    purchasePrice: 0,
    rebateRate: 13,
    volumePerUnit: 0,
    weightPerUnit: 0,
  };
}

export function computeQuote(input: QuoteInput): QuoteResult {
  const rate = num(input.exchangeRate) || 1;
  const profitRate = num(input.profitRate);
  const vatDivisor = 1 + num(input.vatRate) / 100;

  // —— 1. 逐行算货值成本（每行用自己的退税率）——
  const baseRows = (input.items || []).map((item) => {
    const quantity = Math.max(0, num(item.quantity));
    const purchaseTotal = num(item.purchasePrice) * quantity;
    const priceExVat = purchaseTotal / vatDivisor;
    const rebateIncome = priceExVat * (num(item.rebateRate) / 100);
    const netCostRMB = purchaseTotal - rebateIncome;
    // 体积重：海运拼箱按 W/M 择大计费，行业统一 1 CBM = 1000 kg
    const volumeCBM = Math.max(0, num(item.volumePerUnit)) * quantity;
    const weightKg = Math.max(0, num(item.weightPerUnit)) * quantity;
    const chargeableTon = Math.max(volumeCBM, weightKg / 1000);
    return {
      item,
      quantity,
      purchaseTotal,
      priceExVat,
      rebateIncome,
      netCostRMB,
      volumeCBM,
      weightKg,
      chargeableTon,
    };
  });

  const purchaseTotal = baseRows.reduce((s, r) => s + r.purchaseTotal, 0);
  const priceExVat = baseRows.reduce((s, r) => s + r.priceExVat, 0);
  const rebateIncome = baseRows.reduce((s, r) => s + r.rebateIncome, 0);
  const netGoodsCostRMB = purchaseTotal - rebateIncome;
  const totalQuantity = baseRows.reduce((s, r) => s + r.quantity, 0);
  const totalVolumeCBM = baseRows.reduce((s, r) => s + r.volumeCBM, 0);
  const totalWeightKg = baseRows.reduce((s, r) => s + r.weightKg, 0);
  // 整单计费吨就是货代报价的那个数：总体积与总重量择大
  const chargeableTon = Math.max(totalVolumeCBM, totalWeightKg / 1000);

  // 没有货就没有订单：固定费用不该被算成一份"零件的报价"。
  // 总数量为 0 时全部金额归零（明细行保留，便于用户看到自己填了哪些行）。
  if (totalQuantity <= 0) {
    return {
      purchaseTotal: 0,
      priceExVat: 0,
      rebateIncome: 0,
      netGoodsCostRMB: 0,
      domesticTotal: 0,
      fobCostRMB: 0,
      fobCostUSD: 0,
      cfrCostUSD: 0,
      insuranceUSD: 0,
      cifCostUSD: 0,
      cifCostRMB: 0,
      quoteUSD: 0,
      quoteRawUSD: 0,
      profitUSD: 0,
      profitRMB: 0,
      commissionUSD: 0,
      netIncomeUSD: 0,
      exchangeCost: 0,
      healthy: false,
      totalQuantity: 0,
      totalVolumeCBM: 0,
      totalWeightKg: 0,
      chargeableTon: 0,
      billableTon: 0,
      freightUSD: 0,
      items: baseRows.map((row) => ({
        id: row.item.id,
        name: row.item.name,
        spec: row.item.spec,
        hsCode: row.item.hsCode,
        quantity: row.quantity,
        purchaseTotal: 0,
        rebateIncome: 0,
        netCostRMB: 0,
        allocatedRMB: 0,
        cifCostRMB: 0,
        cifCostUSD: 0,
        amountUSD: 0,
        unitPrice: 0,
        profitUSD: 0,
        share: 0,
        volumeCBM: 0,
        weightKg: 0,
        chargeableTon: 0,
      })),
    };
  }

  // —— 2. 整单费用与三级成本 ——
  const domesticTotal = num(input.domesticFees) + num(input.bankFee) + num(input.certFee);

  // 海运费两种计费方式：
  //   total  —— 货代给的整单总额（最低计费吨已包含在里面，不再重复计算）
  //   perRT  —— 按计费吨单价，此时「最低计费吨」才有意义：不足按最低计收
  const billableTon =
    input.freightMode === "perRT"
      ? Math.max(chargeableTon, Math.max(0, num(input.minChargeableTon)))
      : 0;
  const freightUSD =
    input.freightMode === "perRT"
      ? billableTon * Math.max(0, num(input.freightRatePerRT))
      : num(input.freightUSD);

  const fobCostRMB = netGoodsCostRMB + domesticTotal;
  const fobCostUSD = fobCostRMB / rate;
  const cfrCostUSD = fobCostUSD + freightUSD;

  // 保险费按 CIF 价加成计算，解方程得 CIF 成本
  const insuranceFactor = (num(input.insuranceMarkup) / 100) * (num(input.insuranceRate) / 100);
  const cifCostUSD = insuranceFactor >= 1 ? cfrCostUSD : cfrCostUSD / (1 - insuranceFactor);
  const insuranceUSD = cifCostUSD - cfrCostUSD;
  const cifCostRMB = cifCostUSD * rate;

  // —— 3. 按所选术语报价 ——
  const baseCostUSD =
    input.incoterm === "FOB" ? fobCostUSD : input.incoterm === "CFR" ? cfrCostUSD : cifCostUSD;
  const quoteUSD = baseCostUSD * (1 + profitRate / 100);

  // 换汇成本口径（外贸标准）：出口总成本 ÷ 出口外汇净收入
  // 净收入 = FOB 报价 − 佣金（佣金是劳务费用，不属于卖方净收入）
  // 固定按 FOB 口径，与所选术语无关，方便横向比较
  const fobQuoteUSD = fobCostUSD * (1 + profitRate / 100);
  const commissionRate = Math.min(100, Math.max(0, num(input.commissionRate)));
  const commissionUSD = quoteUSD * (commissionRate / 100);
  const netIncomeUSD = fobQuoteUSD * (1 - commissionRate / 100);

  // —— 4. 费用分摊到每个货号 ——
  const feePoolRMB = domesticTotal + freightUSD * rate + insuranceUSD * rate;

  const weightOf = (row: (typeof baseRows)[number]) => {
    if (input.allocation === "quantity") return row.quantity;
    if (input.allocation === "volume") return row.chargeableTon;
    return row.netCostRMB;
  };

  // 分摊权重的兜底链：所选口径没数据时退回货值，再退回数量。
  // 否则用户选了「按体积重」却没填体积/重量，费用分摊不出去，
  // 「各行之和 = 整单」这个不变量就破了。
  let effectiveWeightOf = weightOf;
  let totalWeight = baseRows.reduce((s, r) => s + weightOf(r), 0);
  if (totalWeight <= 0) {
    effectiveWeightOf = (row) => row.netCostRMB;
    totalWeight = baseRows.reduce((s, r) => s + effectiveWeightOf(r), 0);
  }
  if (totalWeight <= 0) {
    effectiveWeightOf = (row) => row.quantity;
    totalWeight = baseRows.reduce((s, r) => s + effectiveWeightOf(r), 0);
  }

  const items: ItemResult[] = baseRows.map((row) => {
    const share = totalWeight > 0 ? effectiveWeightOf(row) / totalWeight : 0;

    // 分摊后的三级成本：保证「各行加总 = 整单」（有测试守着）
    const itemFobUSD = (row.netCostRMB + domesticTotal * share) / rate;
    const itemCfrUSD = itemFobUSD + freightUSD * share;
    const itemCifUSD = itemCfrUSD + insuranceUSD * share;

    const itemBaseUSD =
      input.incoterm === "FOB" ? itemFobUSD : input.incoterm === "CFR" ? itemCfrUSD : itemCifUSD;
    const amountUSD = itemBaseUSD * (1 + profitRate / 100);

    return {
      id: row.item.id,
      name: row.item.name,
      spec: row.item.spec,
      hsCode: row.item.hsCode,
      quantity: row.quantity,
      purchaseTotal: round(row.purchaseTotal),
      rebateIncome: round(row.rebateIncome),
      netCostRMB: round(row.netCostRMB),
      allocatedRMB: round(feePoolRMB * share),
      cifCostRMB: round(itemCifUSD * rate),
      cifCostUSD: round(itemCifUSD),
      amountUSD: round(amountUSD),
      unitPrice: round(row.quantity > 0 ? amountUSD / row.quantity : 0, 4),
      profitUSD: round(amountUSD - itemBaseUSD),
      share,
      volumeCBM: round(row.volumeCBM, 4),
      weightKg: round(row.weightKg, 2),
      chargeableTon: round(row.chargeableTon, 4),
    };
  });

  // —— 5. 报价尾数处理 ——
  // 业务员不会给客户报 29.4637 这种单价，但手工取整后总价又对不上。
  // 这里按单价取整、总价重算，保证客户拿计算器一乘就是这个金额。
  const quoteRawUSD = quoteUSD;
  let finalQuoteUSD = quoteUSD;

  if (input.rounding !== "none" && items.length > 0) {
    const unit = Math.max(0.01, num(input.roundingUnit) || 0.01);
    let sum = 0;
    for (const item of items) {
      const rawUnit = item.quantity > 0 ? item.amountUSD / item.quantity : 0;
      // 取整前的成本单价：金额 = 成本 × (1 + 利润率)，反推即可
      const baseUnit = rawUnit / (1 + profitRate / 100);
      const roundedUnit = roundToUnit(rawUnit, input.rounding, unit);
      item.unitPrice = round(roundedUnit, 4);
      item.amountUSD = round(roundedUnit * item.quantity);
      item.profitUSD = round(item.amountUSD - baseUnit * item.quantity);
      sum += item.amountUSD;
    }
    finalQuoteUSD = round(sum);
  }

  // 取整只改变报价，不改变成本：利润与换汇成本都要按取整后的报价重算，
  // 否则会出现「报价涨了但利润没变」的自相矛盾。
  const scale = quoteRawUSD > 0 ? finalQuoteUSD / quoteRawUSD : 1;
  const finalCommissionUSD = commissionUSD * scale;
  const finalNetIncomeUSD = netIncomeUSD * scale;
  const finalExchangeCost = finalNetIncomeUSD > 0 ? fobCostRMB / finalNetIncomeUSD : 0;
  const finalProfitUSD = finalQuoteUSD - baseCostUSD;
  const finalHealthy = finalExchangeCost > 0 && finalExchangeCost < rate;

  return {
    purchaseTotal: round(purchaseTotal),
    priceExVat: round(priceExVat),
    rebateIncome: round(rebateIncome),
    netGoodsCostRMB: round(netGoodsCostRMB),
    domesticTotal: round(domesticTotal),
    fobCostRMB: round(fobCostRMB),
    fobCostUSD: round(fobCostUSD),
    cfrCostUSD: round(cfrCostUSD),
    freightUSD: round(freightUSD),
    insuranceUSD: round(insuranceUSD),
    cifCostUSD: round(cifCostUSD),
    cifCostRMB: round(cifCostRMB),
    quoteUSD: round(finalQuoteUSD),
    quoteRawUSD: round(quoteRawUSD),
    profitUSD: round(finalProfitUSD),
    profitRMB: round(finalProfitUSD * rate),
    commissionUSD: round(finalCommissionUSD),
    netIncomeUSD: round(finalNetIncomeUSD),
    exchangeCost: round(finalExchangeCost, 4),
    healthy: finalHealthy,
    totalQuantity,
    totalVolumeCBM: round(totalVolumeCBM, 4),
    totalWeightKg: round(totalWeightKg, 2),
    chargeableTon: round(chargeableTon, 4),
    billableTon: round(billableTon, 4),
    items,
  };
}
