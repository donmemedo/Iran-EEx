"use client";

import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Calculator as CalculatorIcon, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Segmented } from "@/components/ui/field";
import { apiFetch, type CalculatorResult } from "@/lib/api";
import { formatNumber, formatPercent, splitToman } from "@/lib/format";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

import { Reveal, SectionHeading } from "./reveal";

const INDUSTRIES = ["steel", "cement", "ceramic", "plastic", "food", "pharma", "textile", "other"] as const;

const LEVER_COLORS: Record<string, string> = {
  billing_errors: "var(--series-4)",
  reactive_power: "var(--band-peak)",
  demand_management: "var(--band-mid)",
  load_shifting: "var(--band-off)",
};

export function Calculator() {
  const { dict, locale, dir } = useLocale();
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  const [bill, setBill] = useState(500_000_000);
  const [industry, setIndustry] = useState<string>("steel");
  const [shifts, setShifts] = useState<"1" | "2" | "3">("3");
  const [powerFactor, setPowerFactor] = useState<string>("0.85");
  const [peakProduction, setPeakProduction] = useState(true);
  const [result, setResult] = useState<CalculatorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const run = useMemo(
    () => async () => {
      setLoading(true);
      setError(false);
      try {
        const data = await apiFetch<CalculatorResult>("/api/v1/calculator/estimate", {
          method: "POST",
          body: JSON.stringify({
            monthly_bill: bill,
            industry,
            shifts: Number(shifts),
            power_factor: powerFactor === "unknown" ? null : Number(powerFactor),
            has_peak_production: peakProduction,
          }),
        });
        setResult(data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [bill, industry, shifts, powerFactor, peakProduction],
  );

  // Show a result immediately on first paint rather than an empty panel.
  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const expected = result ? splitToman(result.expected_annual, locale, dict.common) : null;

  return (
    <section id="calculator" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={dict.calculator.eyebrow}
          title={dict.calculator.title}
          subtitle={dict.calculator.subtitle}
        />

        <Reveal className="mt-14">
          <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]">
            <Card className="p-6">
              <div className="space-y-5">
                <Field label={dict.calculator.monthlyBill} hint={dict.calculator.monthlyBillHint}>
                  <div className="relative">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={formatNumber(bill, locale)}
                      onChange={(event) => {
                        const digits = event.target.value
                          .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
                          .replace(/[^0-9]/g, "");
                        setBill(Math.min(50_000_000_000, Number(digits) || 0));
                      }}
                      className="pe-16 text-base font-semibold tabular"
                    />
                    <span className="pointer-events-none absolute inset-y-0 end-3.5 flex items-center text-xs text-ink-3">
                      {dict.common.toman}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={50_000_000}
                    max={5_000_000_000}
                    step={50_000_000}
                    value={Math.min(bill, 5_000_000_000)}
                    onChange={(event) => setBill(Number(event.target.value))}
                    className="mt-3 w-full accent-[var(--brand)]"
                    aria-label={dict.calculator.monthlyBill}
                  />
                </Field>

                <Field label={dict.calculator.industry}>
                  <Select value={industry} onChange={(event) => setIndustry(event.target.value)}>
                    {INDUSTRIES.map((key) => (
                      <option key={key} value={key}>
                        {dict.industries.items[key]}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label={dict.calculator.shifts}>
                  <Segmented
                    value={shifts}
                    onChange={setShifts}
                    className="w-full [&>button]:flex-1"
                    options={[
                      { value: "1", label: dict.calculator.shiftLabels[0] },
                      { value: "2", label: dict.calculator.shiftLabels[1] },
                      { value: "3", label: dict.calculator.shiftLabels[2] },
                    ]}
                  />
                </Field>

                <Field label={dict.calculator.powerFactor}>
                  <Select value={powerFactor} onChange={(event) => setPowerFactor(event.target.value)}>
                    <option value="unknown">{dict.calculator.powerFactorUnknown}</option>
                    {["0.75", "0.80", "0.85", "0.88", "0.90", "0.93", "0.96"].map((value) => (
                      <option key={value} value={value}>
                        {/* Intl gives Persian its own decimal separator, not a Latin dot. */}
                        {formatNumber(Number(value), locale, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Checkbox
                  label={dict.calculator.peakProduction}
                  checked={peakProduction}
                  onChange={(event) => setPeakProduction(event.target.checked)}
                />

                <Button onClick={run} loading={loading} className="w-full" size="lg">
                  {!loading && <CalculatorIcon className="size-4" />}
                  {result ? dict.calculator.recalculate : dict.calculator.calculate}
                </Button>
              </div>
            </Card>

            <Card className="relative flex flex-col overflow-hidden p-6">
              {loading && !result && (
                <div className="flex flex-1 items-center justify-center text-ink-3">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              )}

              {error && !result && (
                <div className="flex flex-1 items-center justify-center text-sm text-ink-3">
                  {dict.common.error}
                </div>
              )}

              {result && expected && (
                <>
                  <div>
                    <p className="text-xs font-medium text-ink-3">{dict.calculator.resultTitle}</p>
                    <motion.div
                      key={result.expected_annual}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                      className="mt-2 flex flex-wrap items-baseline gap-2"
                    >
                      <span className="text-4xl font-bold tracking-tight tabular text-brand sm:text-5xl">
                        {expected.value}
                      </span>
                      <span className="text-sm font-medium text-ink-2">{expected.unit}</span>
                      <span className="ms-2 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[0.6875rem] font-semibold text-ink-2">
                        {formatPercent(result.percent_expected, locale, 1)} {dict.common.perYear}
                      </span>
                    </motion.div>

                    <div className="mt-4 grid grid-cols-3 gap-3 border-y border-line py-4">
                      {[
                        { label: dict.calculator.conservative, value: result.conservative_annual },
                        { label: dict.calculator.expected, value: result.expected_annual },
                        { label: dict.calculator.optimistic, value: result.optimistic_annual },
                      ].map((item, index) => {
                        const money = splitToman(item.value, locale, dict.common);
                        return (
                          <div key={item.label}>
                            <div
                              className={cn(
                                "text-sm font-semibold tabular",
                                index === 1 ? "text-ink" : "text-ink-2",
                              )}
                            >
                              {money.value}
                              <span className="ms-1 text-[0.625rem] font-normal text-ink-3">
                                {money.unit}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[0.625rem] text-ink-3">{item.label}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5">
                    <h4 className="text-xs font-semibold text-ink">{dict.calculator.breakdownTitle}</h4>

                    {/* One stacked bar, then a labelled list - identity comes from
                        the label, colour only reinforces it. */}
                    <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                      {result.breakdown.map((item) => (
                        <div
                          key={item.key}
                          style={{
                            width: `${Math.max(item.share * 100, 0.5)}%`,
                            background: LEVER_COLORS[item.key],
                          }}
                          className="h-full first:rounded-s-full last:rounded-e-full"
                        />
                      ))}
                    </div>

                    <ul className="mt-3.5 space-y-2">
                      {result.breakdown.map((item) => {
                        const money = splitToman(item.annual, locale, dict.common);
                        return (
                          <li key={item.key} className="flex items-center gap-2.5">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ background: LEVER_COLORS[item.key] }}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1 truncate text-xs text-ink-2">
                              {dict.calculator.levers[item.key as keyof typeof dict.calculator.levers]}
                            </span>
                            <span className="shrink-0 text-xs font-semibold tabular text-ink">
                              {money.value}
                              <span className="ms-1 text-[0.625rem] font-normal text-ink-3">
                                {money.unit}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div className="mt-5 rounded-[--radius-md] border border-line bg-surface-2 p-4">
                    <h4 className="text-xs font-semibold text-ink">{dict.calculator.netTitle}</h4>
                    <dl className="mt-3 space-y-2 text-xs">
                      <Row
                        label={dict.calculator.subscriptionLabel}
                        value={`− ${splitToman(result.subscription_annual, locale, dict.common).value} ${splitToman(result.subscription_annual, locale, dict.common).unit}`}
                      />
                      <Row
                        label={dict.calculator.netLabel}
                        value={`${splitToman(result.net_annual, locale, dict.common).value} ${splitToman(result.net_annual, locale, dict.common).unit}`}
                        strong
                      />
                      <Row
                        label={dict.calculator.roiLabel}
                        value={`${formatNumber(result.roi_multiple, locale, { maximumFractionDigits: 1 })}×`}
                      />
                      <Row
                        label={dict.calculator.paybackLabel}
                        value={`${formatNumber(result.payback_months, locale, { maximumFractionDigits: 1 })} ${dict.calculator.months}`}
                      />
                    </dl>
                  </div>

                  <p className="mt-4 text-[0.6875rem] leading-relaxed text-ink-3">
                    {dict.calculator.disclaimer}
                  </p>

                  <ButtonLink href="#contact" variant="secondary" className="mt-4 w-full group">
                    {dict.calculator.ctaAfter}
                    <Arrow className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                  </ButtonLink>
                </>
              )}
            </Card>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className={cn("tabular", strong ? "font-bold text-brand" : "font-medium text-ink")}>{value}</dd>
    </div>
  );
}
