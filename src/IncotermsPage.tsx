import { useMemo, useState } from "react";
import {
  GROUP_LABEL,
  INCOTERMS,
  TRANSPORT_LABEL,
  bySellerBurden,
  byTransport,
  getIncoterm,
  type IncotermInfo,
  type Party,
} from "./lib/incoterms";

// ============================================================================
// Incoterms® 2020 责任矩阵
// 目的：把「谁负责什么」从 PDF 图表变成可以点、可以查、能直接跳去算报价的页面
// 只讲规则层面的事实（谁办报关、谁付运费、谁投保），不掺费率
// ============================================================================

function PartyTag({ party }: { party: Party }) {
  const isSeller = party === "seller";
  return (
    <span
      className={
        "inline-block rounded px-1.5 py-0.5 text-[11px] " +
        (isSeller ? "chip-active" : "chip")
      }
    >
      {isSeller ? "卖方" : "买方"}
    </span>
  );
}

/** 责任清单的一行 */
function DutyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t py-1.5 text-xs" style={{ borderColor: "var(--border)" }}>
      <span className="text-subtle">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function TermDetail({
  term,
  onUseTerm,
}: {
  term: IncotermInfo;
  onUseTerm?: (code: "FOB" | "CFR" | "CIF") => void;
}) {
  const quotable = ["FOB", "CFR", "CIF"].includes(term.code);

  return (
    <div className="panel rounded-2xl p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-xl font-semibold">{term.code}</h2>
        <span className="text-sm text-muted">{term.nameZh}</span>
        <span className="text-xs text-subtle">{term.nameEn}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
        <span className="chip rounded px-1.5 py-0.5">{GROUP_LABEL[term.group]}</span>
        <span className="chip rounded px-1.5 py-0.5">{TRANSPORT_LABEL[term.transport]}</span>
      </div>

      <div className="mt-3 space-y-2 text-xs">
        <div className="panel-soft rounded-lg p-2.5">
          <p className="text-subtle">风险转移点</p>
          <p className="mt-0.5">{term.riskTransfer}</p>
        </div>
        <div className="panel-soft rounded-lg p-2.5">
          <p className="text-subtle">卖方费用承担到</p>
          <p className="mt-0.5">{term.costUntil}</p>
        </div>
      </div>

      <div className="mt-3">
        <DutyRow label="出口报关">
          <PartyTag party={term.exportClearance} />
        </DutyRow>
        <DutyRow label="主运费">
          <PartyTag party={term.mainFreight} />
        </DutyRow>
        <DutyRow label="运输保险">
          <span className={term.insurance === "seller" ? "tone-good" : "text-subtle"}>
            {term.insurance === "seller" ? "卖方投保" : "无强制义务"}
          </span>
        </DutyRow>
        <DutyRow label="进口清关">
          <PartyTag party={term.importClearance} />
        </DutyRow>
        <DutyRow label="进口关税">
          <PartyTag party={term.duty} />
        </DutyRow>
        <DutyRow label="起运地装货">
          <PartyTag party={term.loadingAtOrigin} />
        </DutyRow>
        <DutyRow label="目的地卸货">
          <PartyTag party={term.unloadingAtDest} />
        </DutyRow>
      </div>

      {term.insurance === "seller" ? (
        <p className="mt-2 text-[11px] text-subtle">保险：{term.insuranceNote}</p>
      ) : null}

      <div className="accent-card mt-3 rounded-lg p-2.5 text-[11px] leading-relaxed">
        <span className="font-medium">实务提醒：</span>
        {term.caution}
      </div>

      {quotable && onUseTerm ? (
        <button
          type="button"
          onClick={() => onUseTerm(term.code as "FOB" | "CFR" | "CIF")}
          className="btn-primary mt-3 w-full rounded-lg px-3 py-1.5 text-xs font-medium"
        >
          用 {term.code} 算一单报价 →
        </button>
      ) : (
        <p className="mt-3 text-[11px] text-subtle">
          报价计算器目前支持 FOB / CFR / CIF 三个术语
        </p>
      )}
    </div>
  );
}

export default function IncotermsPage({
  onUseTerm,
}: {
  onUseTerm?: (code: "FOB" | "CFR" | "CIF") => void;
}) {
  const [selected, setSelected] = useState("FOB");
  const term = getIncoterm(selected) ?? INCOTERMS[3];
  const ladder = useMemo(() => bySellerBurden(), []);
  const anyMode = useMemo(() => byTransport("any"), []);
  const seaMode = useMemo(() => byTransport("sea"), []);

  const TermButton = ({ t }: { t: IncotermInfo }) => (
    <button
      type="button"
      onClick={() => setSelected(t.code)}
      className={
        "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition " +
        (selected === t.code ? "chip-active" : "chip")
      }
    >
      <span>
        <span className="font-medium">{t.code}</span>
        <span className="ml-1.5 opacity-80">{t.nameZh}</span>
      </span>
      <span className="text-[10px] opacity-60">{t.group}</span>
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Incoterms® 2020 责任矩阵</h1>
        <p className="mt-1 text-sm text-muted">
          十一种贸易术语，谁办报关、谁付运费、谁投保、风险在哪一刻转移——点术语看细节
        </p>
        <p className="mt-1 text-[11px] text-subtle">
          依据 ICC《国际贸易术语解释通则·2020》（2020-01-01 生效）。术语是国际惯例，不是法律；
          合同约定与术语冲突时以合同为准。
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="space-y-3">
          <div className="panel rounded-2xl p-3">
            <p className="mb-2 text-[11px] text-subtle">{TRANSPORT_LABEL.any}（7）</p>
            <div className="space-y-1">
              {anyMode.map((t) => (
                <TermButton key={t.code} t={t} />
              ))}
            </div>
          </div>
          <div className="panel rounded-2xl p-3">
            <p className="mb-2 text-[11px] text-subtle">{TRANSPORT_LABEL.sea}（4）</p>
            <div className="space-y-1">
              {seaMode.map((t) => (
                <TermButton key={t.code} t={t} />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <TermDetail term={term} onUseTerm={onUseTerm} />

          {/* 卖方责任阶梯 */}
          <section className="panel rounded-2xl p-4">
            <h2 className="text-sm font-medium">卖方责任阶梯</h2>
            <p className="mb-3 mt-1 text-xs text-subtle">
              从左到右卖方承担得越来越多：EXW 最轻，DDP 最重
            </p>
            <div className="space-y-1.5">
              {ladder.map((t) => (
                <button
                  key={t.code}
                  type="button"
                  onClick={() => setSelected(t.code)}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <span className={"w-10 shrink-0 text-[11px] " + (selected === t.code ? "font-semibold" : "text-subtle")}>
                    {t.code}
                  </span>
                  <span className="track h-2 flex-1 overflow-hidden rounded-full">
                    <span
                      className="bar block h-full rounded-full"
                      style={{ width: `${Math.max(4, (t.sellerBurden / 10) * 100)}%` }}
                    />
                  </span>
                  <span className="w-6 shrink-0 text-right text-[10px] text-subtle">{t.sellerBurden}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 责任矩阵总表 */}
          <section className="panel rounded-2xl p-4">
            <h2 className="mb-1 text-sm font-medium">责任总表</h2>
            <p className="mb-3 text-xs text-subtle">点任意行可切到该术语详情</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] text-subtle">
                    <th className="pb-2 text-left font-normal">术语</th>
                    <th className="pb-2 text-center font-normal">出口报关</th>
                    <th className="pb-2 text-center font-normal">主运费</th>
                    <th className="pb-2 text-center font-normal">保险</th>
                    <th className="pb-2 text-center font-normal">进口清关</th>
                    <th className="pb-2 text-center font-normal">关税</th>
                    <th className="pb-2 text-center font-normal">目的地卸货</th>
                    <th className="pb-2 text-left font-normal">风险转移</th>
                  </tr>
                </thead>
                <tbody>
                  {INCOTERMS.map((t) => (
                    <tr
                      key={t.code}
                      onClick={() => setSelected(t.code)}
                      className={
                        "cursor-pointer border-t hover:bg-[var(--panel-2)] " +
                        (selected === t.code ? "bg-[var(--accent-bg)]" : "")
                      }
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td className="py-1.5 font-medium">{t.code}</td>
                      <td className="py-1.5 text-center">{t.exportClearance === "seller" ? "卖" : "买"}</td>
                      <td className="py-1.5 text-center">{t.mainFreight === "seller" ? "卖" : "买"}</td>
                      <td className="py-1.5 text-center">
                        {t.insurance === "seller" ? <span className="tone-good">卖</span> : "—"}
                      </td>
                      <td className="py-1.5 text-center">{t.importClearance === "seller" ? "卖" : "买"}</td>
                      <td className="py-1.5 text-center">{t.duty === "seller" ? "卖" : "买"}</td>
                      <td className="py-1.5 text-center">{t.unloadingAtDest === "seller" ? "卖" : "买"}</td>
                      <td className="max-w-[220px] truncate py-1.5 text-subtle">{t.riskTransfer}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] text-subtle">卖 = 卖方负责　买 = 买方负责　— = 规则未规定强制投保</p>
          </section>

          {/* 最容易踩的三个坑 */}
          <section className="panel rounded-2xl p-4">
            <h2 className="mb-2 text-sm font-medium">最容易踩的三个坑</h2>
            <div className="space-y-2 text-xs leading-relaxed">
              <div className="panel-soft rounded-lg p-2.5">
                <p className="font-medium">① EXW 出口退不了税</p>
                <p className="mt-0.5 text-subtle">
                  EXW 下出口报关是买方的事，卖方拿不到以自己名义的出口报关单，就办不了退税。
                  中国出口商一般应改用 FCA。
                </p>
              </div>
              <div className="panel-soft rounded-lg p-2.5">
                <p className="font-medium">② CIF 和 CIP 的保险要求不一样</p>
                <p className="mt-0.5 text-subtle">
                  2020 版 CIP 要求卖方投最高险 ICC(A)，CIF 仍是最低险 ICC(C)。按 2010 版习惯报 CIP
                  会少算保费。
                </p>
              </div>
              <div className="panel-soft rounded-lg p-2.5">
                <p className="font-medium">③ DPU 和 DAP 差一个卸货</p>
                <p className="mt-0.5 text-subtle">
                  DPU 卖方负责卸货，DAP 卖方只送到车上不卸。卸货费在目的港可能很贵，签错术语就是白送钱。
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
