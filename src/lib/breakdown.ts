import type { QuoteInput, QuoteResult } from "./types";

// ============================================================================
// 成本拆解 —— 把报价结果拆成「一眼能对账」的明细行
// 报价谈不下来时，业务员需要知道钱花在哪一项、哪一项能压
// 全部折算成人民币，便于横向比较（海运费、保险本来都是美元）
// ============================================================================

export interface CostLine {
  key: string;
  label: string;
  /** 金额（人民币；退税为负数，表示冲减成本） */
  amountRMB: number;
  /** 占 CIF 成本的比例（0~1） */
  share: number;
  note?: string;
}

export interface CostBreakdown {
  lines: CostLine[];
  /** 成本合计（人民币）= CIF 成本换算成人民币 */
  totalRMB: number;
}

export function buildBreakdown(
  input: QuoteInput,
  result: QuoteResult,
): CostBreakdown {
  const rate = input.exchangeRate || 1;
  const totalRMB = result.cifCostUSD * rate;

  const lines: CostLine[] = [
    {
      key: "purchase",
      label: "采购（含税）",
      amountRMB: result.purchaseTotal,
      share: 0,
    },
    {
      key: "rebate",
      label: "出口退税（冲减）",
      amountRMB: -result.rebateIncome,
      share: 0,
      note: "不含税价 × 退税率",
    },
    {
      key: "domestic",
      label: "国内费用",
      amountRMB: result.domesticTotal,
      share: 0,
      note: "报关 / 商检 / 拖车 / 港杂 / 银行 / 认证",
    },
    {
      key: "freight",
      label: "海运费",
      amountRMB: (input.freightUSD || 0) * rate,
      share: 0,
    },
    {
      key: "insurance",
      label: "保险费",
      amountRMB: result.insuranceUSD * rate,
      share: 0,
      note: "按 CIF 加成反解",
    },
  ];

  for (const line of lines) {
    line.share = totalRMB > 0 ? line.amountRMB / totalRMB : 0;
  }

  return { lines, totalRMB };
}
