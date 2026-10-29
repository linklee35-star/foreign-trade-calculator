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
  /** 单件体积（CBM/件，外箱长×宽×高）。按体积重分摊时使用 */
  volumePerUnit: number;
  /** 单件毛重（kg/件）。按体积重分摊时使用 */
  weightPerUnit: number;
}

/**
 * 整单费用分摊方式
 * - value：按货值（高价值货号多摊）
 * - quantity：按数量
 * - volume：按计费吨（W/M 择大，1 CBM = 1000 kg），贴近货代真实计费
 */
export type AllocationMode = "value" | "quantity" | "volume";

/** 报价术语：决定报价基数用哪一级成本 */
export type Incoterm = "FOB" | "CFR" | "CIF";

/** 报价币种（成本始终是人民币，报价与外汇净收入用这个币种） */
export type CurrencyCode = "USD" | "EUR" | "JPY" | "GBP" | "HKD" | "AUD";

/** 汇率来源：手动填写 / 实时接口 / 兜底参考值 */
export type RateSource = "manual" | "api" | "fallback";

/** 报价尾数处理方式：按单价取整，再重算总价 */
export type RoundingMode = "none" | "up" | "nearest";

/**
 * 海运费计费方式
 * - total：直接填整单运费（货代给的总额，最低计费吨已包含在里面）
 * - perRT：按计费吨单价算（货代报 USD xx/R/T），此时最低计费吨才有意义
 */
export type FreightMode = "total" | "perRT";

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

  /** 海运费（USD，整单）—— 仅 freightMode = "total" 时使用 */
  freightUSD: number;
  /** 海运费计费方式 */
  freightMode: FreightMode;
  /** 海运单价（USD / 计费吨 R/T）—— 仅 freightMode = "perRT" 时使用 */
  freightRatePerRT: number;
  /** 最低计费吨（R/T）：不足按最低计收，0 表示不设下限 */
  minChargeableTon: number;
  /** 保险费率 %（常见 0.3） */
  insuranceRate: number;
  /** 保险加成 %（常见 110） */
  insuranceMarkup: number;

  /** 报价币种 */
  currency: CurrencyCode;
  /** 银行汇率：1 单位外币 = ? CNY */
  exchangeRate: number;
  /** 汇率来源，界面上要如实显示是手填的还是接口拉的 */
  rateSource: RateSource;
  /** 汇率的更新时间（ISO 字符串，手动填写时为空） */
  rateUpdatedAt: string;
  /** 目标利润率 %（基于所选术语的成本加成） */
  profitRate: number;
  /**
   * 报价尾数处理：按单价取整后总价重算，
   * 保证「单价 × 数量 = 金额」，不会出现客户拿计算器一乘对不上的情况。
   */
  rounding: RoundingMode;
  /** 取整单位（0.01 / 0.1 / 0.5 / 1） */
  roundingUnit: number;
  /**
   * 中间商佣金 %（按报价金额计）。
   * 换汇成本要用「外汇净收入」而不是报价本身，
   * 佣金是净收入里必须扣掉的部分（外贸常见 3~5%）。
   */
  commissionRate: number;

  /** 整单费用分摊方式 */
  allocation: AllocationMode;

  /** —— 报价单抬头信息 —— */
  /** 卖方（我方）名称：报价单必须能看出是谁发的 */
  sellerName: string;
  /** 卖方地址 */
  sellerAddress: string;
  /** 卖方联系方式（邮箱 / 电话） */
  sellerContact: string;
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
  /** 该行体积（CBM） */
  volumeCBM: number;
  /** 该行毛重（kg） */
  weightKg: number;
  /** 该行计费吨（W/M 择大：max(CBM, 吨)） */
  chargeableTon: number;
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
  /** 实际计入成本的海运费（USD）：按吨单价模式 = 单价 × 实际计费吨 */
  freightUSD: number;
  /** 保险费（USD） */
  insuranceUSD: number;
  /** CIF 成本（USD / RMB） */
  cifCostUSD: number;
  cifCostRMB: number;

  /** 报价（按所选术语）与利润 */
  quoteUSD: number;
  /** 未做尾数处理时的理论报价（用于显示取整带来的差额） */
  quoteRawUSD: number;
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
  /** 总体积（CBM） */
  totalVolumeCBM: number;
  /** 总毛重（kg） */
  totalWeightKg: number;
  /**
   * 整单计费吨（货代报价用的 R/T）= max(总体积 CBM, 总毛重 ÷ 1000)。
   * 注意：各行计费吨相加可能大于它（每行各自择大的结果），分摊按行计费吨占比归一化。
   */
  chargeableTon: number;
  /** 实际计费吨 = max(计费吨, 最低计费吨)，按吨单价模式下用于算运费 */
  billableTon: number;
  /** 各货号明细 */
  items: ItemResult[];
}
