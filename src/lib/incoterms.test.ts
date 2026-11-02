import { describe, expect, it } from "vitest";
import {
  INCOTERMS,
  bySellerBurden,
  byTransport,
  getIncoterm,
  insuranceLabel,
  partyLabel,
} from "./incoterms";

// ============================================================================
// Incoterms 2020 数据校验
// 这张表是要给人当参考用的，错一格比没有更糟——所以逐条钉住关键事实：
//   · 11 个术语、4 组、2 类运输方式
//   · 只有 CIF / CIP 卖方有投保义务，且险别要求不同
//   · EXW 是唯一买方办出口报关的术语
//   · DDP 是唯一卖方办进口清关并付关税的术语
//   · DPU 是唯一卖方负责卸货的术语
// ============================================================================

describe("Incoterms 2020 数据", () => {
  it("共 11 个术语，代码不重复", () => {
    expect(INCOTERMS).toHaveLength(11);
    const codes = INCOTERMS.map((t) => t.code);
    expect(new Set(codes).size).toBe(11);
    expect(codes).toEqual(
      expect.arrayContaining([
        "EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP",
        "FAS", "FOB", "CFR", "CIF",
      ]),
    );
  });

  it("按运输方式分类正确：7 个通用 + 4 个仅海运", () => {
    const any = byTransport("any").map((t) => t.code);
    const sea = byTransport("sea").map((t) => t.code);
    expect(any).toEqual(expect.arrayContaining(["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP"]));
    expect(any).toHaveLength(7);
    expect(sea).toEqual(expect.arrayContaining(["FAS", "FOB", "CFR", "CIF"]));
    expect(sea).toHaveLength(4);
  });

  it("分组数量：E 组 1 个、F 组 3 个、C 组 4 个、D 组 3 个", () => {
    const count = (g: string) => INCOTERMS.filter((t) => t.group === g).length;
    expect(count("E")).toBe(1);
    expect(count("F")).toBe(3);
    expect(count("C")).toBe(4);
    expect(count("D")).toBe(3);
  });

  it("只有 CIF 和 CIP 由卖方投保，且 CIF 是最低险、CIP 是最高险", () => {
    const withSellerInsurance = INCOTERMS.filter((t) => t.insurance === "seller").map((t) => t.code);
    expect(withSellerInsurance.sort()).toEqual(["CIF", "CIP"]);

    expect(getIncoterm("CIF")!.insuranceNote).toContain("ICC(C)");
    expect(getIncoterm("CIP")!.insuranceNote).toContain("ICC(A)");
    // 两者都要 110% 保额
    expect(getIncoterm("CIF")!.insuranceNote).toContain("110%");
    expect(getIncoterm("CIP")!.insuranceNote).toContain("110%");
  });

  it("EXW 是唯一由买方办出口报关的术语", () => {
    const buyerClearsExport = INCOTERMS.filter((t) => t.exportClearance === "buyer").map((t) => t.code);
    expect(buyerClearsExport).toEqual(["EXW"]);
  });

  it("DDP 是唯一由卖方办进口清关并付关税的术语", () => {
    const sellerClearsImport = INCOTERMS.filter((t) => t.importClearance === "seller").map((t) => t.code);
    const sellerPaysDuty = INCOTERMS.filter((t) => t.duty === "seller").map((t) => t.code);
    expect(sellerClearsImport).toEqual(["DDP"]);
    expect(sellerPaysDuty).toEqual(["DDP"]);
  });

  it("DPU 是唯一由卖方负责目的地卸货的术语", () => {
    const sellerUnloads = INCOTERMS.filter((t) => t.unloadingAtDest === "seller").map((t) => t.code);
    expect(sellerUnloads).toEqual(["DPU"]);
  });

  it("C 组术语的风险与费用是分离的（主运费卖方付，但风险早于费用终点转移）", () => {
    for (const t of INCOTERMS.filter((x) => x.group === "C")) {
      expect(t.mainFreight).toBe("seller");
      expect(t.riskTransfer).not.toContain("指定目的");
    }
  });

  it("卖方责任档位单调：EXW 最小、DDP 最大", () => {
    const sorted = bySellerBurden();
    expect(sorted[0].code).toBe("EXW");
    expect(sorted[sorted.length - 1].code).toBe("DDP");
    // 档位必须随排序单调不减
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].sellerBurden).toBeGreaterThanOrEqual(sorted[i - 1].sellerBurden);
    }
  });

  it("每个术语都有非空的风险转移点、费用终点和实务提醒", () => {
    for (const t of INCOTERMS) {
      expect(t.riskTransfer.length).toBeGreaterThan(4);
      expect(t.costUntil.length).toBeGreaterThan(1);
      expect(t.caution.length).toBeGreaterThan(10);
      expect(t.nameZh.length).toBeGreaterThan(1);
      expect(t.nameEn.length).toBeGreaterThan(2);
    }
  });

  it("展示文案工具函数", () => {
    expect(partyLabel("seller")).toBe("卖方");
    expect(partyLabel("buyer")).toBe("买方");
    expect(insuranceLabel("seller")).toBe("卖方投保");
    expect(insuranceLabel("none")).toBe("无强制");
    expect(getIncoterm("NOPE")).toBeUndefined();
  });
});
