import type { QuoteInput } from "./types";

/** 默认输入：一个示例货号 + 常见的国内费用与海运成本 */
export const DEFAULT_INPUT: QuoteInput = {
  items: [
    {
      id: "item-1",
      name: "示例货号",
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
  leadTime: "30 days after deposit",
  validDays: 15,
  paymentTerm: "T/T 30% deposit, balance against B/L copy",
};

/** 报价单号默认值：Q-YYYYMMDD（留空时使用，用户可改） */
export function defaultQuoteNo(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `Q-${y}${m}${d}`;
}

let seq = 0;

/** 生成货号行 id（同一会话内递增，避免同毫秒重复） */
export function newItemId(): string {
  seq += 1;
  return `item-${Date.now().toString(36)}-${seq}`;
}
