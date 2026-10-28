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
  allocation: "value",
  customer: "",
  incoterm: "CIF",
  validDays: 15,
  paymentTerm: "T/T 30% deposit, balance against B/L copy",
};

let seq = 0;

/** 生成货号行 id（同一会话内递增，避免同毫秒重复） */
export function newItemId(): string {
  seq += 1;
  return `item-${Date.now().toString(36)}-${seq}`;
}
