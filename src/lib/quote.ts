import type { QuoteInput, QuoteResult } from "./types";

// ============================================================================
// 外贸报价计算核心 —— 纯函数，零依赖，全部可单测
// 口径说明（外贸实务，FOB/CFR/CIF 按 Incoterms 2020）：
//   采购成本按「含税价」录入，退税以不含税价为基数：
//     不含税价 = 采购含税总额 / (1 + 增值税率)
//     退税收入 = 不含税价 × 出口退税率（按 HS 编码，需增值税专用发票）
//   FOB 成本 = 采购含税总额 − 退税收入 + 国内费用（报关/商检/拖车/港杂/银行/认证）
//   CFR 成本 = FOB 成本 + 海运费
//   CIF 成本 = CFR 成本 / (1 − 保险加成 × 保险费率)
//   报价 = CIF 成本 × (1 + 目标利润率)
//   换汇成本 = FOB 人民币成本 ÷ FOB 美元报价（低于银行汇率才有利润，外贸核心指标）
// ============================================================================

const round = (n: number, digits = 2): number => {
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
};

export function computeQuote(input: QuoteInput): QuoteResult {
  const {
    purchasePrice,
    quantity,
    vatRate,
    rebateRate,
    domesticFees,
    bankFee,
    certFee,
    freightUSD,
    insuranceRate,
    insuranceMarkup,
    exchangeRate,
    profitRate,
  } = input;

  const safeQty = Math.max(0, quantity || 0);
  const purchaseTotal = (purchasePrice || 0) * safeQty; // 含税采购总额 RMB

  // 退税：以不含税价为基数
  const priceExVat = purchaseTotal / (1 + (vatRate || 0) / 100);
  const rebateIncome = priceExVat * ((rebateRate || 0) / 100);

  // 国内费用合计
  const domesticTotal = (domesticFees || 0) + (bankFee || 0) + (certFee || 0);

  // FOB 成本（RMB → USD）
  const fobCostRMB = purchaseTotal - rebateIncome + domesticTotal;
  const rate = exchangeRate || 1;
  const fobCostUSD = fobCostRMB / rate;

  // CFR / CIF（保险费按 CIF 价加成计算，解方程得 CIF 成本）
  const cfrCostUSD = fobCostUSD + (freightUSD || 0);
  const insuranceFactor = ((insuranceMarkup || 0) / 100) * ((insuranceRate || 0) / 100);
  const cifCostUSD = insuranceFactor >= 1 ? cfrCostUSD : cfrCostUSD / (1 - insuranceFactor);
  const insuranceUSD = cifCostUSD - cfrCostUSD;

  // 报价与利润
  const quoteUSD = cifCostUSD * (1 + (profitRate || 0) / 100);
  const profitUSD = quoteUSD - cifCostUSD;
  const quoteUnitUSD = safeQty > 0 ? quoteUSD / safeQty : 0;
  const profitRMB = profitUSD * rate;

  // 换汇成本（外贸核心指标）：FOB 人民币成本 / FOB 美元报价
  const fobQuoteUSD = fobCostUSD * (1 + (profitRate || 0) / 100);
  const exchangeCost = fobQuoteUSD > 0 ? fobCostRMB / fobQuoteUSD : 0;

  return {
    purchaseTotal: round(purchaseTotal),
    priceExVat: round(priceExVat),
    rebateIncome: round(rebateIncome),
    domesticTotal: round(domesticTotal),
    fobCostRMB: round(fobCostRMB),
    fobCostUSD: round(fobCostUSD),
    cfrCostUSD: round(cfrCostUSD),
    insuranceUSD: round(insuranceUSD),
    cifCostUSD: round(cifCostUSD),
    quoteUSD: round(quoteUSD),
    quoteUnitUSD: round(quoteUnitUSD, 4),
    profitUSD: round(profitUSD),
    profitRMB: round(profitRMB),
    fobQuoteUSD: round(fobQuoteUSD),
    exchangeCost: round(exchangeCost, 4),
    // 换汇成本低于银行汇率才赚钱
    healthy: exchangeCost > 0 && exchangeCost < rate,
  };
}
