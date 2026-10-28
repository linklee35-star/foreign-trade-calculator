import { useEffect, useMemo, useState } from "react";
import { computeQuote, createItem } from "./lib/quote";
import { buildBreakdown } from "./lib/breakdown";
import { buildMarginScenarios, buildTermScenarios } from "./lib/scenarios";
import {
  CURRENCIES,
  FALLBACK_RATE_DATE,
  fetchRate,
  formatAmount,
  formatMoney,
  getCurrency,
  readCachedRate,
} from "./lib/currency";
import type { CurrencyCode } from "./lib/types";
import { DEFAULT_INPUT, defaultQuoteNo, newItemId } from "./lib/defaults";
import { clearInput, readInput, writeInput, type StorageLike } from "./lib/storage";
import type { AllocationMode, FreightMode, Incoterm, QuoteInput, QuoteItem } from "./lib/types";

/** 隐私模式下访问 localStorage 会抛异常，统一在这里兜住 */
function getStore(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const fmt = (n: number, d = 2) =>
  n.toLocaleString("zh-CN", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

/* ------------------------------------------------------------------ 主题 */

type Theme = "dark" | "light";
const THEME_KEY = "ftc-theme";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // 存不下也无所谓，本次会话照常生效
    }
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="btn rounded-lg px-2.5 py-1.5 text-xs"
      aria-label="切换主题"
      title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
    >
      {theme === "dark" ? "☀ 浅色" : "☾ 深色"}
    </button>
  );
}

/* ------------------------------------------------------------------ 基础控件 */

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
      <span className="mb-1 block text-xs text-muted">
        {label}
        {hint ? <span className="ml-1 text-subtle">· {hint}</span> : null}
      </span>
      <div className="relative">
        <input
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="field rounded-lg px-3 py-2 pr-12 text-sm"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-subtle">
          {unit}
        </span>
      </div>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="field rounded-lg px-3 py-2 text-sm"
      />
    </label>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={
              "rounded-lg px-3 py-1.5 text-xs transition " +
              (value === opt.value ? "chip-active" : "chip")
            }
          >
            {opt.label}
            {opt.hint ? <span className="ml-1 text-[10px] text-subtle">{opt.hint}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel rounded-2xl p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {desc ? <p className="mb-3 mt-1 text-xs text-subtle">{desc}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
  accent?: boolean;
}) {
  return (
    <div className="panel-soft rounded-xl p-3">
      <div className="text-xs text-subtle">{label}</div>
      <div
        className={
          "mt-1 text-lg font-semibold " +
          (tone === "good" ? "tone-good" : tone === "bad" ? "tone-bad" : "") +
          (accent ? " print-accent" : "")
        }
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-subtle">{sub}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ 主界面 */

export default function App() {
  const [input, setInput] = useState<QuoteInput>(() => readInput(getStore(), DEFAULT_INPUT));

  // 每次改动都落盘：外贸报价要反复调参数，刷新丢掉很致命
  useEffect(() => {
    writeInput(getStore(), input);
  }, [input]);

  const set = <K extends keyof QuoteInput>(key: K, v: QuoteInput[K]) =>
    setInput((s) => ({ ...s, [key]: v }));

  const updateItem = (id: string, patch: Partial<QuoteItem>) =>
    setInput((s) => ({
      ...s,
      items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));

  const addItem = () =>
    setInput((s) => ({ ...s, items: [...s.items, createItem(newItemId())] }));

  const removeItem = (id: string) =>
    setInput((s) => ({
      ...s,
      // 至少留一行，避免出现空订单
      items: s.items.length > 1 ? s.items.filter((it) => it.id !== id) : s.items,
    }));

  const reset = () => {
    clearInput(getStore());
    setInput(DEFAULT_INPUT);
  };

  /* —— 汇率：手动 > 实时接口 > 兜底参考值 —— */
  const [rateBusy, setRateBusy] = useState(false);

  const setRateManual = (v: number) =>
    setInput((s) => ({ ...s, exchangeRate: v, rateSource: "manual" }));

  const refreshRate = async (code: CurrencyCode) => {
    setRateBusy(true);
    const quote = await fetchRate(code);
    setRateBusy(false);
    // 失败就保留当前值（可能是手动填的），绝不因为接口挂了把汇率清掉
    if (!quote) return;
    setInput((s) =>
      s.currency === code
        ? { ...s, exchangeRate: quote.rate, rateSource: "api", rateUpdatedAt: quote.updatedAt }
        : s,
    );
  };

  const switchCurrency = (code: CurrencyCode) => {
    if (code === input.currency) return;
    const cached = readCachedRate(code);
    const meta = getCurrency(code);
    setInput((s) => ({
      ...s,
      currency: code,
      exchangeRate: cached ? cached.rate : meta.fallbackRate,
      rateSource: cached ? "api" : "fallback",
      rateUpdatedAt: cached ? cached.updatedAt : "",
    }));
    if (!cached) void refreshRate(code);
  };

  const rateHint =
    input.rateSource === "manual"
      ? "手动填写（不会被自动覆盖）"
      : input.rateSource === "api"
        ? `实时汇率 · 更新于 ${
            input.rateUpdatedAt
              ? new Date(input.rateUpdatedAt).toLocaleString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"
          }`
        : `参考值（${FALLBACK_RATE_DATE} 核实）· 未取到实时汇率，请核对后手填`;

  const r = useMemo(() => computeQuote(input), [input]);
  const breakdown = useMemo(() => buildBreakdown(input, r), [input, r]);
  const termScenarios = useMemo(() => buildTermScenarios(input), [input]);
  const marginScenarios = useMemo(() => buildMarginScenarios(input, 3), [input]);
  /** 术语对应的成本口径，用来在对比表里显示"这个报价是加在哪个成本上的" */
  const costOf = (term: Incoterm, s: (typeof termScenarios)[number]) =>
    term === "FOB" ? s.result.fobCostUSD : term === "CFR" ? s.result.cfrCostUSD : s.result.cifCostUSD;
  const today = useMemo(() => new Date().toLocaleDateString("zh-CN"), []);
  // 报价单号留空时按日期自动生成，用户填了就用自己的
  const quoteNo = input.quoteNo.trim() || defaultQuoteNo();
  const validUntil = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + (input.validDays || 0));
    return d.toLocaleDateString("zh-CN");
  }, [input.validDays]);

  const showVolume = input.allocation === "volume";
  /** 金额显示：自动带币种符号 */
  const money = (n: number, d?: number) => formatMoney(n, input.currency, d);

  const incotermNote: Record<Incoterm, string> = {
    FOB: "装运港船上交货（不含海运费与保险）",
    CFR: "成本加运费（含海运费，不含保险）",
    CIF: "成本保险费加运费（含海运费与保险）",
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* ================= 打印版：给客户的报价单（不含成本，成本是内部信息） ================= */}
      <div className="print-only mb-6">
        <div className="flex items-start justify-between border-b-2 pb-2" style={{ borderColor: "#333" }}>
          <div>
            <h1 className="text-2xl font-bold">出口报价单 / QUOTATION</h1>
            <p className="mt-1 text-sm">Quotation No.: {quoteNo}</p>
            <p className="text-sm">To: {input.customer || "—"}</p>
          </div>
          <div className="text-right text-xs leading-relaxed">
            <p>Date: {today}</p>
            <p>Valid until: {validUntil}</p>
            <p>
              Price term: {input.incoterm} {input.pod || "—"}
            </p>
            <p>
              POL / POD: {input.pol || "—"} / {input.pod || "—"}
            </p>
          </div>
        </div>

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: "#888" }}>
              <th className="py-1.5 font-semibold">No.</th>
              <th className="py-1.5 font-semibold">Description</th>
              <th className="py-1.5 font-semibold">Spec</th>
              <th className="py-1.5 text-right font-semibold">Qty</th>
              <th className="py-1.5 text-right font-semibold">Unit Price ({input.currency})</th>
              <th className="py-1.5 text-right font-semibold">Amount ({input.currency})</th>
            </tr>
          </thead>
          <tbody>
            {r.items.map((it, i) => (
              <tr key={it.id} className="border-b" style={{ borderColor: "#ddd" }}>
                <td className="py-1.5">{i + 1}</td>
                <td className="py-1.5">{it.name || "—"}</td>
                <td className="py-1.5">{it.spec || "—"}</td>
                <td className="py-1.5 text-right tabular-nums">{fmt(it.quantity, 0)}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatAmount(it.unitPrice, input.currency, 4)}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatAmount(it.amountUSD, input.currency)}
                </td>
              </tr>
            ))}
            <tr>
              <td className="py-2 font-semibold" colSpan={5}>
                TOTAL {input.incoterm} {input.pod || ""}
              </td>
              <td className="py-2 text-right font-bold tabular-nums print-accent">
                {money(r.quoteUSD)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4 text-xs leading-relaxed">
          <p>
            Price term: {input.incoterm} {input.pod || "—"} — {incotermNote[input.incoterm]}
          </p>
          <p>
            Port of loading: {input.pol || "—"} · Port of destination: {input.pod || "—"}
          </p>
          <p>Payment: {input.paymentTerm || "—"}</p>
          <p>Lead time: {input.leadTime || "—"}</p>
          <p>Validity: {input.validDays} days from the date above.</p>
        </div>
      </div>

      {/* ================= 屏幕版 ================= */}
      <header className="no-print mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">外贸报价工作台</h1>
          <p className="mt-1 text-sm text-muted">
            多货号成本核算 · 费用分摊 · FOB/CFR/CIF 报价 · 一键出客户报价单
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-primary rounded-lg px-3 py-1.5 text-xs font-medium"
          >
            生成报价单 / 存为 PDF
          </button>
          <button type="button" onClick={reset} className="btn rounded-lg px-3 py-1.5 text-xs">
            恢复默认值
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="no-print space-y-4">
          {/* ① 商品明细 */}
          <Section
            title="① 商品明细"
            desc={
              showVolume
                ? "每个货号按自己的 HS 编码填退税率；按体积重分摊时需填单件体积与毛重"
                : "每个货号按自己的 HS 编码填退税率，退税单独计算，不共用全单一个税率"
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-subtle">
                    <th className="pb-2 text-left font-normal">品名</th>
                    <th className="pb-2 text-left font-normal">规格</th>
                    <th className="pb-2 text-left font-normal">HS 编码</th>
                    <th className="pb-2 text-right font-normal">数量</th>
                    <th className="pb-2 text-right font-normal">含税单价 ¥</th>
                    <th className="pb-2 text-right font-normal">退税率 %</th>
                    {showVolume ? (
                      <>
                        <th className="pb-2 text-right font-normal">单件体积 CBM</th>
                        <th className="pb-2 text-right font-normal">单件毛重 kg</th>
                      </>
                    ) : null}
                    <th className="pb-2 text-right font-normal">CIF 单价 $</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {input.items.map((it, index) => {
                    const result = r.items[index];
                    return (
                      <tr key={it.id} className="row-divider">
                        <td className="py-1.5 pr-1">
                          <input
                            value={it.name}
                            placeholder="品名"
                            onChange={(e) => updateItem(it.id, { name: e.target.value })}
                            className="field w-28 rounded-md px-2 py-1.5 text-xs"
                          />
                        </td>
                        <td className="py-1.5 pr-1">
                          <input
                            value={it.spec}
                            placeholder="规格"
                            onChange={(e) => updateItem(it.id, { spec: e.target.value })}
                            className="field w-20 rounded-md px-2 py-1.5 text-xs"
                          />
                        </td>
                        <td className="py-1.5 pr-1">
                          <input
                            value={it.hsCode}
                            placeholder="选填"
                            onChange={(e) => updateItem(it.id, { hsCode: e.target.value })}
                            className="field w-24 rounded-md px-2 py-1.5 text-xs"
                          />
                        </td>
                        <td className="py-1.5 pr-1">
                          <input
                            type="number"
                            value={it.quantity}
                            onChange={(e) => updateItem(it.id, { quantity: Number(e.target.value) || 0 })}
                            className="field w-20 rounded-md px-2 py-1.5 text-right text-xs"
                          />
                        </td>
                        <td className="py-1.5 pr-1">
                          <input
                            type="number"
                            step={0.01}
                            value={it.purchasePrice}
                            onChange={(e) => updateItem(it.id, { purchasePrice: Number(e.target.value) || 0 })}
                            className="field w-24 rounded-md px-2 py-1.5 text-right text-xs"
                          />
                        </td>
                        <td className="py-1.5 pr-1">
                          <input
                            type="number"
                            value={it.rebateRate}
                            onChange={(e) => updateItem(it.id, { rebateRate: Number(e.target.value) || 0 })}
                            className="field w-16 rounded-md px-2 py-1.5 text-right text-xs"
                          />
                        </td>
                        {showVolume ? (
                          <>
                            <td className="py-1.5 pr-1">
                              <input
                                type="number"
                                step={0.001}
                                value={it.volumePerUnit}
                                onChange={(e) =>
                                  updateItem(it.id, { volumePerUnit: Number(e.target.value) || 0 })
                                }
                                className="field w-20 rounded-md px-2 py-1.5 text-right text-xs"
                              />
                            </td>
                            <td className="py-1.5 pr-1">
                              <input
                                type="number"
                                step={0.01}
                                value={it.weightPerUnit}
                                onChange={(e) =>
                                  updateItem(it.id, { weightPerUnit: Number(e.target.value) || 0 })
                                }
                                className="field w-20 rounded-md px-2 py-1.5 text-right text-xs"
                              />
                            </td>
                          </>
                        ) : null}
                        <td className="py-1.5 pr-1 text-right text-xs tabular-nums text-muted">
                          {result ? fmt(result.unitPrice, 4) : "—"}
                        </td>
                        <td className="py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => removeItem(it.id)}
                            disabled={input.items.length <= 1}
                            title={input.items.length <= 1 ? "至少保留一行" : "删除该行"}
                            className="rounded-md px-2 py-1 text-xs text-subtle hover:bg-[var(--panel-2)] hover:text-[var(--bad)] disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={addItem}
                className="rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted hover:text-[var(--accent-text)]"
                style={{ borderColor: "var(--border-strong)" }}
              >
                + 添加货号
              </button>
              <span className="text-xs text-subtle">
                合计 {fmt(r.totalQuantity, 0)} 件 · {fmt(r.totalVolumeCBM, 3)} CBM ·{" "}
                {fmt(r.totalWeightKg, 1)} kg · 计费吨 {fmt(r.chargeableTon, 3)} R/T
              </span>
            </div>
          </Section>

          {/* ② 国内费用 */}
          <Section title="② 国内费用（整单，RMB）" desc="报关、商检、拖车、港杂、银行、认证等">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="报关/商检/拖车/港杂" unit="¥" value={input.domesticFees} onChange={(v) => set("domesticFees", v)} />
              <Field label="银行费用" unit="¥" value={input.bankFee} onChange={(v) => set("bankFee", v)} hint="信用证/TT" />
              <Field label="认证/检测" unit="¥" value={input.certFee} onChange={(v) => set("certFee", v)} />
            </div>
          </Section>

          {/* ③ 国际物流与分摊 */}
          <Section
            title="③ 国际物流与费用分摊"
            desc="整单费用按所选口径分摊到每个货号，才能看出哪个货号吃掉成本"
          >
            <div className="mb-3">
              <Segmented<FreightMode>
                label="海运费计费方式"
                value={input.freightMode}
                onChange={(v) => set("freightMode", v)}
                options={[
                  { value: "total", label: "整单总额", hint: "货代给的总价" },
                  { value: "perRT", label: "按计费吨单价", hint: `${input.currency}/R/T` },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {input.freightMode === "total" ? (
                <Field
                  label="海运费总额"
                  unit={input.currency}
                  value={input.freightUSD}
                  onChange={(v) => set("freightUSD", v)}
                />
              ) : (
                <>
                  <Field
                    label="海运单价"
                    unit={`${input.currency}/R/T`}
                    value={input.freightRatePerRT}
                    onChange={(v) => set("freightRatePerRT", v)}
                    step={0.5}
                    hint="货代报价"
                  />
                  <Field
                    label="最低计费吨"
                    unit="R/T"
                    value={input.minChargeableTon}
                    onChange={(v) => set("minChargeableTon", v)}
                    step={0.5}
                    hint="0 = 不设下限"
                  />
                </>
              )}
              <Field label="保险费率" unit="%" value={input.insuranceRate} onChange={(v) => set("insuranceRate", v)} step={0.01} hint="常见 0.3" />
              <Field label="保险加成" unit="%" value={input.insuranceMarkup} onChange={(v) => set("insuranceMarkup", v)} hint="常见 110" />
            </div>
            {input.freightMode === "perRT" ? (
              <p className="mt-2 text-[11px] text-subtle">
                实际计费吨 = max(计费吨 {fmt(r.chargeableTon, 3)}, 最低 {fmt(input.minChargeableTon, 3)}) ={" "}
                <span className="text-muted">{fmt(r.billableTon, 3)} R/T</span> → 海运费 $
                {money(r.freightUSD)}（单价 {money(input.freightRatePerRT, 2)}/R/T）
              </p>
            ) : null}
            <div className="mt-3">
              <Segmented<AllocationMode>
                label="费用分摊方式"
                value={input.allocation}
                onChange={(v) => set("allocation", v)}
                options={[
                  { value: "value", label: "按货值", hint: "高价值多摊" },
                  { value: "quantity", label: "按数量", hint: "件数多摊" },
                  { value: "volume", label: "按体积重", hint: "W/M 择大" },
                ]}
              />
              <p className="mt-1.5 text-[11px] text-subtle">
                {input.allocation === "volume"
                  ? "海运拼箱按 W/M 择大计费：1 CBM = 1000 kg，逐行取 max(体积吨, 重量吨) 后按占比分摊；未填体积/重量时自动退回按货值分摊"
                  : "海运费、保险、国内费用汇总成费用池后按占比分摊，各行成本之和等于整单"}
              </p>
            </div>
          </Section>

          {/* ④ 报价参数 */}
          <Section title="④ 报价参数" desc="佣金只影响换汇成本（净收入），不改变给客户的报价">
            <div className="mb-3">
              <span className="mb-1 block text-xs text-muted">报价币种（成本始终为人民币）</span>
              <div className="flex flex-wrap gap-1.5">
                {CURRENCIES.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => switchCurrency(c.code)}
                    title={c.name}
                    className={
                      "rounded-lg px-3 py-1.5 text-xs transition " +
                      (input.currency === c.code ? "chip-active" : "chip")
                    }
                  >
                    {c.symbol} {c.code}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-xs text-muted">
                  银行汇率 <span className="text-subtle">· CNY/{input.currency}</span>
                </span>
                <div className="flex gap-1">
                  <input
                    type="number"
                    step={0.0001}
                    value={Number.isFinite(input.exchangeRate) ? input.exchangeRate : 0}
                    onChange={(e) => setRateManual(Number(e.target.value) || 0)}
                    className="field min-w-0 flex-1 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void refreshRate(input.currency)}
                    disabled={rateBusy}
                    className="btn shrink-0 rounded-lg px-2 py-1 text-[11px] disabled:opacity-50"
                    title="从 open.er-api.com 拉取实时汇率"
                  >
                    {rateBusy ? "…" : "刷新"}
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-subtle">{rateHint}</p>
              </label>
              <Field label="目标利润率" unit="%" value={input.profitRate} onChange={(v) => set("profitRate", v)} hint="按所选术语成本加成" />
              <Field label="中间商佣金" unit="%" value={input.commissionRate} onChange={(v) => set("commissionRate", v)} hint="常见 3~5" />
              <Field label="增值税率" unit="%" value={input.vatRate} onChange={(v) => set("vatRate", v)} hint="一般 13" />
            </div>
            <div className="mt-3">
              <Segmented<Incoterm>
                label="报价术语（决定报价基数）"
                value={input.incoterm}
                onChange={(v) => set("incoterm", v)}
                options={[
                  { value: "FOB", label: "FOB" },
                  { value: "CFR", label: "CFR" },
                  { value: "CIF", label: "CIF" },
                ]}
              />
              <p className="mt-1.5 text-[11px] text-subtle">{incotermNote[input.incoterm]}</p>
            </div>
          </Section>

          {/* ⑤ 报价单信息 */}
          <Section
            title="⑤ 报价单信息"
            desc="打印时显示在报价单抬头。Incoterms 必须带目的港——只写 CIF 是无效条款"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField label="报价单号" value={input.quoteNo} onChange={(v) => set("quoteNo", v)} placeholder={defaultQuoteNo()} />
              <TextField label="客户名称" value={input.customer} onChange={(v) => set("customer", v)} placeholder="ACME Trading Co." />
              <Field label="报价有效期" unit="天" value={input.validDays} onChange={(v) => set("validDays", v)} />
              <TextField label="装运港 POL" value={input.pol} onChange={(v) => set("pol", v)} placeholder="Shanghai" />
              <TextField label="目的港 POD" value={input.pod} onChange={(v) => set("pod", v)} placeholder="Hamburg" />
              <TextField label="交货期" value={input.leadTime} onChange={(v) => set("leadTime", v)} placeholder="30 days after deposit" />
            </div>
            <div className="mt-3">
              <TextField
                label="付款方式"
                value={input.paymentTerm}
                onChange={(v) => set("paymentTerm", v)}
                placeholder="T/T 30% deposit, balance against B/L copy"
              />
            </div>
          </Section>

          {/* ⑥ 方案对比 */}
          <Section
            title="⑥ 方案对比"
            desc="同一份订单换术语/利润率重算——客户问「FOB 多少、CIF 多少」时直接念，不用来回切"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-subtle">
                    <th className="pb-2 text-left font-normal">术语</th>
                    <th className="pb-2 text-right font-normal">成本 {input.currency}</th>
                    <th className="pb-2 text-right font-normal">报价 {input.currency}</th>
                    <th className="pb-2 text-right font-normal">均摊单价 {input.currency}</th>
                    <th className="pb-2 text-right font-normal">利润 {input.currency}</th>
                    <th className="pb-2 text-right font-normal">换汇成本</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {termScenarios.map((s) => (
                    <tr
                      key={s.incoterm}
                      className={"row-divider " + (s.isCurrent ? "bg-[var(--accent-bg)]" : "")}
                    >
                      <td className="py-1.5 font-medium">{s.incoterm}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted">
                        {formatAmount(costOf(s.incoterm, s), input.currency)}
                      </td>
                      <td className="py-1.5 text-right font-medium tabular-nums">
                        {formatAmount(s.result.quoteUSD, input.currency)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-muted">
                        {formatAmount(
                          s.result.totalQuantity > 0
                            ? s.result.quoteUSD / s.result.totalQuantity
                            : 0,
                          input.currency,
                          4,
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-muted">
                        {formatAmount(s.result.profitUSD, input.currency)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-muted">
                        {fmt(s.result.exchangeCost, 4)}
                      </td>
                      <td className="py-1.5 text-right">
                        {s.isCurrent ? (
                          <span className="text-[11px] text-subtle">当前</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => set("incoterm", s.incoterm)}
                            className="rounded-md px-2 py-1 text-xs text-muted hover:bg-[var(--panel-2)] hover:text-[var(--accent-text)]"
                          >
                            采用
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs text-subtle">
                利润率敏感性（基于当前 {input.incoterm} 术语）
              </p>
              <div className="flex flex-wrap gap-2">
                {marginScenarios.map((s) => (
                  <div
                    key={s.profitRate}
                    className={
                      "min-w-[120px] rounded-xl px-3 py-2 text-xs " +
                      (s.isCurrent ? "accent-card" : "panel-soft")
                    }
                  >
                    <div className="text-subtle">
                      利润率 {s.profitRate}%{s.isCurrent ? " · 当前" : ""}
                    </div>
                    <div className="mt-0.5 text-base font-semibold tabular-nums">
                      {money(s.result.quoteUSD)}
                    </div>
                    <div
                      className={
                        "mt-0.5 tabular-nums " +
                        (s.result.healthy ? "tone-good" : "tone-bad")
                      }
                    >
                      换汇 {fmt(s.result.exchangeCost, 4)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* 成本拆解 */}
          <Section title="成本拆解" desc="全部折算成人民币，便于横向比较（海运费、保险原始为美元）">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-subtle">
                    <th className="pb-2 text-left font-normal">项目</th>
                    <th className="pb-2 text-right font-normal">金额（¥）</th>
                    <th className="pb-2 text-right font-normal">占 CIF 成本</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.lines.map((line) => (
                    <tr key={line.key} className="row-divider">
                      <td className="py-1.5">
                        <span>{line.label}</span>
                        {line.note ? <span className="ml-1 text-[11px] text-subtle">· {line.note}</span> : null}
                      </td>
                      <td
                        className={
                          "py-1.5 text-right tabular-nums " +
                          (line.amountRMB < 0 ? "tone-good" : "")
                        }
                      >
                        {fmt(line.amountRMB)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-subtle">{fmtPct(line.share)}</td>
                    </tr>
                  ))}
                  <tr className="border-t" style={{ borderColor: "var(--border-strong)" }}>
                    <td className="py-2 font-medium">CIF 成本合计</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{fmt(breakdown.totalRMB)}</td>
                    <td className="py-2 text-right tabular-nums text-subtle">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        {/* ================= 右侧结果 ================= */}
        <aside className="no-print space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="panel rounded-2xl p-4">
            <h2 className="mb-3 text-sm font-medium">整单结果</h2>
            <div className="space-y-3">
              <Metric label="FOB 成本" value={money(r.fobCostUSD)} sub={`¥${fmt(r.fobCostRMB)}`} />
              <Metric label="CFR 成本" value={money(r.cfrCostUSD)} sub={`含运费 ${money(r.freightUSD)}`} />
              <Metric label="CIF 成本" value={money(r.cifCostUSD)} sub={`含保险 ${money(r.insuranceUSD)}`} />
              <div className="accent-card rounded-xl p-3">
                <div className="text-xs" style={{ color: "var(--accent-text)" }}>
                  {input.incoterm} 报价（含 {input.profitRate}% 利润）
                </div>
                <div className="mt-1 text-2xl font-semibold" style={{ color: "var(--accent-text)" }}>
                  {money(r.quoteUSD)}
                </div>
                <div className="mt-0.5 text-xs" style={{ color: "var(--accent)" }}>
                  共 {fmt(r.totalQuantity, 0)} 件 · 均摊{" "}
                  {money(r.totalQuantity > 0 ? r.quoteUSD / r.totalQuantity : 0, 4)}/件
                </div>
              </div>
              <Metric
                label="换汇成本"
                value={`${fmt(r.exchangeCost, 4)} CNY/${input.currency}`}
                sub={
                  r.healthy
                    ? `低于银行汇率 ${input.exchangeRate}，有利润`
                    : `高于银行汇率 ${input.exchangeRate}，亏损`
                }
                tone={r.healthy ? "good" : "bad"}
              />
              <Metric label="整单利润" value={money(r.profitUSD)} sub={`≈ ¥${fmt(r.profitRMB)}`} />
              <div className="panel-soft rounded-xl p-3 text-xs">
                <div className="flex justify-between text-subtle">
                  <span>中间商佣金（{input.commissionRate}%）</span>
                  <span className="tabular-nums">{money(r.commissionUSD)}</span>
                </div>
                <div className="mt-1 flex justify-between text-subtle">
                  <span>外汇净收入（FOB − 佣金）</span>
                  <span className="tabular-nums">{money(r.netIncomeUSD)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="panel rounded-2xl p-4">
            <h2 className="mb-1 text-sm font-medium">各货号成本占比</h2>
            <p className="mb-3 text-xs text-subtle">
              按
              {input.allocation === "volume"
                ? "计费吨"
                : input.allocation === "quantity"
                  ? "数量"
                  : "货值"}
              分摊
            </p>
            <div className="space-y-2">
              {r.items.map((it, i) => (
                <div key={it.id}>
                  <div className="flex justify-between text-xs">
                    <span className="truncate text-muted">{it.name || `货号 ${i + 1}`}</span>
                    <span className="ml-2 shrink-0 tabular-nums text-subtle">{fmtPct(it.share)}</span>
                  </div>
                  <div className="track mt-1 h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bar h-full rounded-full"
                      style={{ width: `${Math.min(100, it.share * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              {r.items.length === 0 ? <p className="text-xs text-subtle">暂无货号</p> : null}
            </div>
          </div>

          <div className="panel rounded-2xl p-4 text-xs leading-relaxed text-subtle">
            <p className="mb-1 font-medium text-muted">口径说明</p>
            <p>· 退税 = 含税采购 ÷ (1+增值税率) × 该货号退税率</p>
            <p className="text-[11px]">
              　（外贸企业「免退税」口径，依据财政部税务总局 2026 年第 11 号公告；生产企业「免抵退」不适用）
            </p>
            <p>· CIF = CFR ÷ (1 − 保险加成 × 保险费率)</p>
            <p>· 换汇成本 = 出口总成本 ÷ 外汇净收入（净收入 = FOB 报价 − 佣金）</p>
            <p>· 计费吨 = max(体积 CBM, 重量吨)，海运拼箱 W/M 择大，1 CBM = 1000 kg</p>
            <p>· 按吨单价计费时：海运费 = 单价 × max(计费吨, 最低计费吨)</p>
            <p className="mt-2 text-[11px]">
              退税率以税务总局「退税率文库」为准，按 HS 编码填写；输入自动保存在本机浏览器
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
