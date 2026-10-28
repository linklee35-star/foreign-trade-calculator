/** 单个货号（外贸报价单的一行） */
export interface QuoteItem {
  id: string;
  /** 品名 */
  name: string;
  /** 规格 / 型号 */
  spec: string;
  /** HS 编码（记录用，退税率需按编码自行确认后填入） */
  hsCode: string;
  /** 数量 */
  quantity: number;
  /** 采购含税单价（RMB/件） */
  purchasePrice: number;
  /** 该货号的出口退税率 %（按 HS 编码，常见 13 / 9 / 0） */
  rebateRate: number;
}

/** 整单费用分摊方式 */
export type AllocationMode = "value" | "quantity";

/** 报价术语：决定报价基数用哪一级成本 */
export type Incoterm = "FOB" | "CFR" | "CIF";

/** 报价输入（金额单位见字段注释：RMB 或 USD） */
export interface QuoteInput {
  /** 商品明细（至少一行） */
  items: QuoteItem[];

  /** 增值税率 %（一般纳税人 13%，全单统一） */
  vatRate: number;

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
  /** 目标利润率 %（基于所选术语的成本加成） */
  profitRate: number;
  /**
   * 中间商佣金 %（按报价金额计）。
   * 换汇成本要用「外汇净收入」而不是报价本身，
   * 佣金是净收入里必须扣掉的部分（外贸常见 3~5%）。
   */
  commissionRate: number;

  /** 整单费用分摊方式 */
  allocation: AllocationMode;

  /** —— 报价单抬头信息 —— */
  /** 报价单号（留空则按日期自动生成） */
  quoteNo: string;
  customer: string;
  incoterm: Incoterm;
  /** 装运港（如 Shanghai）——Incoterms 必须带地点，只写 CIF 是无效条款 */
  pol: string;
  /** 目的港（如 Hamburg） */
  pod: string;
  /** 交货期（如 30 days after deposit） */
  leadTime: string;
  /** 报价有效期（天） */
  validDays: number;
  /** 付款方式 */
  paymentTerm: string;
}

/** 单个货号的测算结果 */
export interface ItemResult {
  id: string;
  name: string;
  spec: string;
  hsCode: string;
  quantity: number;
  /** 采购含税总额（RMB） */
  purchaseTotal: number;
  /** 退税收入（RMB） */
  rebateIncome: number;
  /** 净货值成本 = 采购含税 − 退税（RMB） */
  netCostRMB: number;
  /** 分摊到的整单费用：国内 + 海运 + 保险（RMB） */
  allocatedRMB: number;
  /** 该行 CIF 成本（RMB / USD） */
  cifCostRMB: number;
  cifCostUSD: number;
  /** 该行按所选术语的报价（USD）与单价（USD/件） */
  amountUSD: number;
  unitPrice: number;
  /** 该行利润（USD） */
  profitUSD: number;
  /** 该行成本占整单比例（0~1），用于识别"哪个货号吃掉了成本" */
  share: number;
}

/** 报价结果 */
export interface QuoteResult {
  /** 采购含税总额（RMB） */
  purchaseTotal: number;
  /** 不含税采购额（RMB） */
  priceExVat: number;
  /** 退税收入（RMB） */
  rebateIncome: number;
  /** 净货值成本 = 采购含税 − 退税（RMB） */
  netGoodsCostRMB: number;
  /** 国内费用合计（RMB） */
  domesticTotal: number;

  /** FOB 成本（RMB / USD） */
  fobCostRMB: number;
  fobCostUSD: number;
  /** CFR 成本（USD） */
  cfrCostUSD: number;
  /** 保险费（USD） */
  insuranceUSD: number;
  /** CIF 成本（USD / RMB） */
  cifCostUSD: number;
  cifCostRMB: number;

  /** 报价（按所选术语）与利润 */
  quoteUSD: number;
  profitUSD: number;
  profitRMB: number;

  /** 付给中间商的佣金（USD） */
  commissionUSD: number;
  /** 外汇净收入（USD）= FOB 报价 − 佣金，换汇成本的分母 */
  netIncomeUSD: number;

  /** 换汇成本（RMB per USD，越低越好） */
  exchangeCost: number;
  /** 换汇成本是否优于银行汇率（健康） */
  healthy: boolean;

  /** 总数量 */
  totalQuantity: number;
  /** 各货号明细 */
  items: ItemResult[];
}
