import { computeQuote } from "./quote";
import type { Incoterm, QuoteInput, QuoteResult } from "./types";

// ============================================================================
// 方案对比 —— 同一份输入，换一个变量重算，用来回答"客户会问的那几个问题"
//   ① 术语对比：FOB / CFR / CIF 各报多少（客户常同时问两个）
//   ② 利润率敏感性：利润率高一点低一点，报价和换汇成本怎么变
// 纯函数：不修改入参，只做 computeQuote 的批量调用
// ============================================================================

const TERMS: Incoterm[] = ["FOB", "CFR", "CIF"];

export interface TermScenario {
  incoterm: Incoterm;
  result: QuoteResult;
  /** 是否等于当前所选术语 */
  isCurrent: boolean;
}

export function buildTermScenarios(input: QuoteInput): TermScenario[] {
  return TERMS.map((incoterm) => ({
    incoterm,
    result: computeQuote({ ...input, incoterm }),
    isCurrent: input.incoterm === incoterm,
  }));
}

export interface MarginScenario {
  profitRate: number;
  result: QuoteResult;
  isCurrent: boolean;
}

/**
 * 利润率敏感性：以当前利润率为中心，给出 -step / 0 / +step 三档。
 * 利润率不允许为负（报负利润等于亏本卖），所以下界夹到 0。
 */
export function buildMarginScenarios(input: QuoteInput, step = 3): MarginScenario[] {
  const base = Math.max(0, input.profitRate);
  const rates = [Math.max(0, base - step), base, base + step];
  // 当前利润率本来就在 0 附近时，去重避免出现两行一样的
  const unique = Array.from(new Set(rates));

  return unique.map((profitRate) => ({
    profitRate,
    result: computeQuote({ ...input, profitRate }),
    isCurrent: profitRate === input.profitRate,
  }));
}
