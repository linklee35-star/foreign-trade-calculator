/** 报价输入（金额单位见字段注释：RMB 或 USD） */
export interface QuoteInput {
  /** 采购含税单价（RMB/件） */
  purchasePrice: number;
  /** 数量 */
  quantity: number;
  /** 增值税率 %（一般纳税人 13%） */
  vatRate: number;
  /** 出口退税率 %（按 HS 编码，常见 13 / 9 / 0） */
  rebateRate: number;

  /** 国内费用：报关/商检/拖车/港杂等（RMB，整单） */
  domesticFees: number;
  /** 银行费用：信用证/TT 手续费等（RMB，整单） */
  bankFee: number;
  /** 认证/检测/其他（RMB，整单） */
  certFee: number;

  /** 海运费（USD，整单） */
  freightUSD: number;
  /** 保险费率 %（常见 0.3） */
  insuranceRate: number;
  /** 保险加成 %（常见 110） */
  insuranceMarkup: number;

  /** 银行汇率（CNY per USD，如 7.10） */
  exchangeRate: number;
  /** 目标利润率 %（基于 CIF 成本加成） */
  profitRate: number;
}

/** 报价结果 */
export interface QuoteResult {
  /** 采购含税总额（RMB） */
  purchaseTotal: number;
  /** 不含税采购额（RMB） */
  priceExVat: number;
  /** 退税收入（RMB） */
  rebateIncome: number;
  /** 国内费用合计（RMB） */
  domesticTotal: number;
  /** FOB 成本（RMB / USD） */
  fobCostRMB: number;
  fobCostUSD: number;
  /** CFR 成本（USD） */
  cfrCostUSD: number;
  /** 保险费（USD） */
  insuranceUSD: number;
  /** CIF 成本（USD） */
  cifCostUSD: number;
  /** 整单报价（USD）与单价（USD/件） */
  quoteUSD: number;
  quoteUnitUSD: number;
  /** 利润（USD / RMB） */
  profitUSD: number;
  profitRMB: number;
  /** FOB 美元报价（USD） */
  fobQuoteUSD: number;
  /** 换汇成本（RMB per USD，越低越好） */
  exchangeCost: number;
  /** 换汇成本是否优于银行汇率（健康） */
  healthy: boolean;
}
