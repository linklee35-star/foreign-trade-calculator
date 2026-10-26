import { useMemo, useState } from "react";
import { computeQuote } from "./lib/quote";
import type { QuoteInput } from "./lib/types";

const DEFAULT_INPUT: QuoteInput = {
  purchasePrice: 100,
  quantity: 100,
  vatRate: 13,
  rebateRate: 13,
  domesticFees: 2000,
  bankFee: 500,
  certFee: 500,
  freightUSD: 1000,
  insuranceRate: 0.3,
  insuranceMarkup: 110,
  exchangeRate: 7.1,
  profitRate: 10,
};

interface FieldProps {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  step?: number;
}

function Field({ label, unit, value, onChange, hint, step = 1 }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-zinc-400">
        {label}
        {hint ? <span className="ml-1 text-zinc-600">· {hint}</span> : null}
      </span>
      <div className="relative">
        <input
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 pr-12 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
          {unit}
        </span>
      </div>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
      <h2 className="mb-3 text-sm font-medium text-zinc-300">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
    </section>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div
        className={
          "mt-1 text-lg font-semibold " +
          (tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-rose-400" : "text-zinc-100")
        }
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

const fmt = (n: number, d = 2) =>
  n.toLocaleString("zh-CN", { minimumFractionDigits: d, maximumFractionDigits: d });

export default function App() {
  const [input, setInput] = useState<QuoteInput>(DEFAULT_INPUT);
  const set = <K extends keyof QuoteInput>(key: K, v: QuoteInput[K]) =>
    setInput((s) => ({ ...s, [key]: v }));

  const r = useMemo(() => computeQuote(input), [input]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">外贸报价计算器</h1>
        <p className="mt-1 text-sm text-zinc-400">
          FOB / CFR / CIF 报价 · 出口退税 · 换汇成本 —— 纯前端本地计算，数据不出浏览器
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Section title="① 采购（含税价，RMB）">
            <Field label="采购单价" unit="¥/件" value={input.purchasePrice} onChange={(v) => set("purchasePrice", v)} />
            <Field label="数量" unit="件" value={input.quantity} onChange={(v) => set("quantity", v)} />
            <Field label="增值税率" unit="%" value={input.vatRate} onChange={(v) => set("vatRate", v)} hint="一般 13" />
            <Field
              label="出口退税率"
              unit="%"
              value={input.rebateRate}
              onChange={(v) => set("rebateRate", v)}
              hint="按 HS 编码，常见 13/9/0"
            />
          </Section>

          <Section title="② 国内费用（整单，RMB）">
            <Field label="报关/商检/拖车/港杂" unit="¥" value={input.domesticFees} onChange={(v) => set("domesticFees", v)} />
            <Field label="银行费用" unit="¥" value={input.bankFee} onChange={(v) => set("bankFee", v)} hint="信用证/TT" />
            <Field label="认证/检测" unit="¥" value={input.certFee} onChange={(v) => set("certFee", v)} />
          </Section>

          <Section title="③ 国际物流（USD）">
            <Field label="海运费" unit="$" value={input.freightUSD} onChange={(v) => set("freightUSD", v)} />
            <Field label="保险费率" unit="%" value={input.insuranceRate} onChange={(v) => set("insuranceRate", v)} step={0.01} hint="常见 0.3" />
            <Field label="保险加成" unit="%" value={input.insuranceMarkup} onChange={(v) => set("insuranceMarkup", v)} hint="常见 110" />
          </Section>

          <Section title="④ 报价参数">
            <Field label="银行汇率" unit="CNY/USD" value={input.exchangeRate} onChange={(v) => set("exchangeRate", v)} step={0.01} />
            <Field label="目标利润率" unit="%" value={input.profitRate} onChange={(v) => set("profitRate", v)} hint="按 CIF 成本加成" />
          </Section>
        </div>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
            <h2 className="mb-3 text-sm font-medium text-zinc-300">报价结果</h2>
            <div className="space-y-3">
              <Metric label="FOB 成本" value={`$${fmt(r.fobCostUSD)}`} sub={`¥${fmt(r.fobCostRMB)}`} />
              <Metric label="CFR 成本" value={`$${fmt(r.cfrCostUSD)}`} sub={`含运费 $${fmt(input.freightUSD)}`} />
              <Metric label="CIF 成本" value={`$${fmt(r.cifCostUSD)}`} sub={`含保险 $${fmt(r.insuranceUSD)}`} />
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3">
                <div className="text-xs text-indigo-300">CIF 报价（含 {input.profitRate}% 利润）</div>
                <div className="mt-1 text-2xl font-semibold text-indigo-200">${fmt(r.quoteUSD)}</div>
                <div className="mt-0.5 text-xs text-indigo-300/70">单价 ${fmt(r.quoteUnitUSD, 4)} / 件</div>
              </div>
              <Metric
                label="换汇成本"
                value={`${fmt(r.exchangeCost, 4)} CNY/USD`}
                sub={r.healthy ? `低于银行汇率 ${input.exchangeRate}，有利润` : `高于银行汇率 ${input.exchangeRate}，亏损`}
                tone={r.healthy ? "good" : "bad"}
              />
              <Metric label="整单利润" value={`$${fmt(r.profitUSD)}`} sub={`≈ ¥${fmt(r.profitRMB)}`} />
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs leading-relaxed text-zinc-500">
            <p className="mb-1 font-medium text-zinc-400">口径说明</p>
            <p>· 退税 = 含税采购 ÷ (1+增值税率) × 退税率，需增值税专用发票</p>
            <p>· CIF = CFR ÷ (1 − 保险加成 × 保险费率)</p>
            <p>· 换汇成本 = FOB 人民币成本 ÷ FOB 美元报价，低于银行汇率才赚钱</p>
            <p className="mt-2 text-zinc-600">公式与单测见 src/lib/quote.ts（vitest 覆盖 7 个场景）</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
