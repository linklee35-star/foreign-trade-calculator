// ============================================================================
// Incoterms® 2020 十一种术语的责任划分
//
// 数据来源：《国际贸易术语解释通则·2020》（ICC，2020-01-01 生效），
// 责任划分参照中国信保《11 种国际贸易术语详解》整理稿逐条核对。
//
// 只收录「谁负责」这类稳定事实，不收录费率——费率是合同谈的，不是规则定的。
// 每条都带一句实务提醒：术语用错的代价远大于算错一个数。
// ============================================================================

/** 责任方 */
export type Party = "seller" | "buyer";

/** 保险责任：谁有投保义务（none = 规则未规定任何一方必须投保） */
export type InsuranceDuty = "seller" | "none";

/** 运输方式适用范围 */
export type TransportScope = "any" | "sea";

/** 术语分组：E 起运 / F 主运费未付 / C 主运费已付 / D 到达 */
export type IncotermGroup = "E" | "F" | "C" | "D";

export interface IncotermInfo {
  code: string;
  nameEn: string;
  nameZh: string;
  group: IncotermGroup;
  transport: TransportScope;
  /** 风险转移点（货损货差从这一刻起归买方） */
  riskTransfer: string;
  /** 卖方费用承担到哪一步 */
  costUntil: string;
  /** 出口报关由谁办 */
  exportClearance: Party;
  /** 主运费由谁付 */
  mainFreight: Party;
  /** 谁有投保义务 */
  insurance: InsuranceDuty;
  /** 保险要求说明（仅 CIF / CIP 有强制险别） */
  insuranceNote: string;
  /** 进口清关由谁办 */
  importClearance: Party;
  /** 进口关税由谁付 */
  duty: Party;
  /** 装货（起运地装车/装船）由谁负责 */
  loadingAtOrigin: Party;
  /** 目的地卸货由谁负责 */
  unloadingAtDest: Party;
  /** 卖方责任档位 0~10，仅用于可视化排序 */
  sellerBurden: number;
  /** 实务提醒 */
  caution: string;
}

export const INCOTERMS: IncotermInfo[] = [
  {
    code: "EXW",
    nameEn: "Ex Works",
    nameZh: "工厂交货",
    group: "E",
    transport: "any",
    riskTransfer: "在卖方所在地（工厂/仓库）把货备好交买方处置时",
    costUntil: "卖方工厂",
    exportClearance: "buyer",
    mainFreight: "buyer",
    insurance: "none",
    insuranceNote: "规则未规定投保义务",
    importClearance: "buyer",
    duty: "buyer",
    loadingAtOrigin: "buyer",
    unloadingAtDest: "buyer",
    sellerBurden: 0,
    caution:
      "卖方不办出口报关、不负责装车——这是 EXW 最大的坑。中国出口商通常不该用 EXW：没有出口报关单就退不了税。买方无法自行办出口手续时应改用 FCA。",
  },
  {
    code: "FCA",
    nameEn: "Free Carrier",
    nameZh: "货交承运人",
    group: "F",
    transport: "any",
    riskTransfer: "货交买方指定承运人（在卖方处则装上车）时",
    costUntil: "出口国指定交货地点",
    exportClearance: "seller",
    mainFreight: "buyer",
    insurance: "none",
    insuranceNote: "规则未规定投保义务",
    importClearance: "buyer",
    duty: "buyer",
    loadingAtOrigin: "seller",
    unloadingAtDest: "buyer",
    sellerBurden: 2,
    caution:
      "2020 新增：双方可约定由买方指示承运人在装船前向卖方签发已装船提单，解决「信用证要提单、但 FCA 交货点在装船之前」的老矛盾。",
  },
  {
    code: "FAS",
    nameEn: "Free Alongside Ship",
    nameZh: "船边交货",
    group: "F",
    transport: "sea",
    riskTransfer: "货物放到装运港指定船舶旁边时",
    costUntil: "装运港船边",
    exportClearance: "seller",
    mainFreight: "buyer",
    insurance: "none",
    insuranceNote: "规则未规定投保义务",
    importClearance: "buyer",
    duty: "buyer",
    loadingAtOrigin: "seller",
    unloadingAtDest: "buyer",
    sellerBurden: 1,
    caution:
      "仅适用海运/内河。风险在船边就转移，装船由买方负责——大宗散货常用；集装箱货物一般不用 FAS，因为集装箱在堆场交接。",
  },
  {
    code: "FOB",
    nameEn: "Free On Board",
    nameZh: "船上交货",
    group: "F",
    transport: "sea",
    riskTransfer: "货物装上船时",
    costUntil: "装运港船上",
    exportClearance: "seller",
    mainFreight: "buyer",
    insurance: "none",
    insuranceNote: "规则未规定投保义务",
    importClearance: "buyer",
    duty: "buyer",
    loadingAtOrigin: "seller",
    unloadingAtDest: "buyer",
    sellerBurden: 2,
    caution:
      "中国出口最常用。2020 明确风险以「装上船」为界（旧版讲「越过船舷」，表述已改）。买方指定货代时，注意目的港可能向卖方收一堆本地费用。",
  },
  {
    code: "CFR",
    nameEn: "Cost and Freight",
    nameZh: "成本加运费",
    group: "C",
    transport: "sea",
    riskTransfer: "装运港货物装上船时",
    costUntil: "指定目的港",
    exportClearance: "seller",
    mainFreight: "seller",
    insurance: "none",
    insuranceNote: "规则未规定投保义务（买方需自行投保）",
    importClearance: "buyer",
    duty: "buyer",
    loadingAtOrigin: "seller",
    unloadingAtDest: "buyer",
    sellerBurden: 3,
    caution:
      "典型「风险与费用分离」：卖方付海运费到目的港，但运输途中风险归买方。买方必须自己投保，否则货损了卖方不赔。",
  },
  {
    code: "CIF",
    nameEn: "Cost, Insurance and Freight",
    nameZh: "成本、保险费加运费",
    group: "C",
    transport: "sea",
    riskTransfer: "装运港货物装上船时",
    costUntil: "指定目的港",
    exportClearance: "seller",
    mainFreight: "seller",
    insurance: "seller",
    insuranceNote: "卖方须投最低险别 ICC(C)，保额 110% 合同价",
    importClearance: "buyer",
    duty: "buyer",
    loadingAtOrigin: "seller",
    unloadingAtDest: "buyer",
    sellerBurden: 4,
    caution:
      "卖方只须投最低险别 ICC(C)（平安险级别）。客户要求一切险 ICC(A) 时要另算保费——别默认自己扛下来，那可能吃掉整单利润。",
  },
  {
    code: "CPT",
    nameEn: "Carriage Paid To",
    nameZh: "运费付至",
    group: "C",
    transport: "any",
    riskTransfer: "货交第一承运人时（早于费用终点）",
    costUntil: "指定目的地",
    exportClearance: "seller",
    mainFreight: "seller",
    insurance: "none",
    insuranceNote: "规则未规定投保义务（买方需自行投保）",
    importClearance: "buyer",
    duty: "buyer",
    loadingAtOrigin: "seller",
    unloadingAtDest: "buyer",
    sellerBurden: 4,
    caution:
      "多式联运场景下替代 CFR。同样风险费用分离：卖方付运费到目的地，风险在交第一承运人就转移。",
  },
  {
    code: "CIP",
    nameEn: "Carriage and Insurance Paid To",
    nameZh: "运费和保险费付至",
    group: "C",
    transport: "any",
    riskTransfer: "货交第一承运人时",
    costUntil: "指定目的地",
    exportClearance: "seller",
    mainFreight: "seller",
    insurance: "seller",
    insuranceNote: "卖方须投最高险别 ICC(A)，保额 110% 合同价",
    importClearance: "buyer",
    duty: "buyer",
    loadingAtOrigin: "seller",
    unloadingAtDest: "buyer",
    sellerBurden: 5,
    caution:
      "2020 版把 CIP 的保险要求从最低险提到最高险 ICC(A)，而 CIF 仍是最低险 ICC(C)。这一条改动最容易被忽略——按 2010 版习惯报价会少算保费。",
  },
  {
    code: "DAP",
    nameEn: "Delivered at Place",
    nameZh: "目的地交货",
    group: "D",
    transport: "any",
    riskTransfer: "在指定目的地运输工具上（未卸货）交买方处置时",
    costUntil: "指定目的地（不含卸货）",
    exportClearance: "seller",
    mainFreight: "seller",
    insurance: "none",
    insuranceNote: "规则未规定投保义务（但卖方承担全程风险，实务上通常会投保）",
    importClearance: "buyer",
    duty: "buyer",
    loadingAtOrigin: "seller",
    unloadingAtDest: "buyer",
    sellerBurden: 7,
    caution:
      "卖方不负责卸货。如果卖方在运输合同里已经付了卸货费，按规则无权向买方追偿——签运输合同时就要和货代对齐交货点。",
  },
  {
    code: "DPU",
    nameEn: "Delivered at Place Unloaded",
    nameZh: "卸货地交货",
    group: "D",
    transport: "any",
    riskTransfer: "在指定目的地卸货完成后交买方处置时",
    costUntil: "指定目的地（含卸货）",
    exportClearance: "seller",
    mainFreight: "seller",
    insurance: "none",
    insuranceNote: "规则未规定投保义务（但卖方承担全程风险）",
    importClearance: "buyer",
    duty: "buyer",
    loadingAtOrigin: "seller",
    unloadingAtDest: "seller",
    sellerBurden: 8,
    caution:
      "2020 版把 DAT 改名为 DPU，且交货地点不再限于运输终端，可以是任何地点。这是唯一由卖方负责卸货的术语。",
  },
  {
    code: "DDP",
    nameEn: "Delivered Duty Paid",
    nameZh: "完税后交货",
    group: "D",
    transport: "any",
    riskTransfer: "在指定目的地运输工具上（未卸货）交买方处置时",
    costUntil: "指定目的地（含进口关税）",
    exportClearance: "seller",
    mainFreight: "seller",
    insurance: "none",
    insuranceNote: "规则未规定投保义务（但卖方承担全程风险）",
    importClearance: "seller",
    duty: "seller",
    loadingAtOrigin: "seller",
    unloadingAtDest: "buyer",
    sellerBurden: 10,
    caution:
      "卖方责任最大：要办进口清关、付进口关税。拿不到进口许可就不该用 DDP。若想把增值税排除在卖方义务外，须在合同里写明「DDP, VAT unpaid」。",
  },
];

export const GROUP_LABEL: Record<IncotermGroup, string> = {
  E: "E 组 · 起运",
  F: "F 组 · 主运费未付",
  C: "C 组 · 主运费已付",
  D: "D 组 · 到达",
};

export const TRANSPORT_LABEL: Record<TransportScope, string> = {
  any: "任何运输方式",
  sea: "仅海运 / 内河",
};

export function getIncoterm(code: string): IncotermInfo | undefined {
  return INCOTERMS.find((t) => t.code === code);
}

/** 按卖方责任从小到大排序，用于成本阶梯图 */
export function bySellerBurden(): IncotermInfo[] {
  return [...INCOTERMS].sort((a, b) => a.sellerBurden - b.sellerBurden);
}

/** 按运输方式分组，用于列表展示 */
export function byTransport(scope: TransportScope): IncotermInfo[] {
  return INCOTERMS.filter((t) => t.transport === scope);
}

/** 责任归属的展示文案 */
export function partyLabel(party: Party): string {
  return party === "seller" ? "卖方" : "买方";
}

export function insuranceLabel(duty: InsuranceDuty): string {
  return duty === "seller" ? "卖方投保" : "无强制";
}
