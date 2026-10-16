"use client";

import { AlertCircle, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Segmented } from "@/components/ui/field";
import { ApiError, apiFetch, type CalculatorResult } from "@/lib/api";
import { formatNumber, formatPercent, formatToman, splitToman } from "@/lib/format";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

import { rateLimitText } from "./lead-form";
import { MAX_TOMAN, toLatinDigits } from "./lead-validation";
import { Reveal, SectionHeading } from "./reveal";

// Mirrors the backend's Industry literal.
const INDUSTRIES = ["steel", "cement", "ceramic", "plastic", "food", "pharma", "textile", "other"] as const;
// Every option is inside the API's (0, 1] range.
const POWER_FACTORS = ["0.75", "0.80", "0.85", "0.88", "0.90", "0.93", "0.96"];
const SLIDER_MIN = 50_000_000;
const SLIDER_MAX = 5_000_000_000;

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
  const [industry, setIndustry] = useState("steel");
  const [shifts, setShifts] = useState<"1" | "2" | "3">("3");
  const [powerFactor, setPowerFactor] = useState("0.85");
  const [peakProduction, setPeakProduction] = useState(true);
  const [result, setResult] = useState<CalculatorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // The inputs follow every keystroke and slider frame; only the request waits
  // for a pause, and a newer request cancels the one still in flight, so a slow
  // answer can never overwrite a newer one.
  useEffect(() => {
    if (bill <= 0) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiFetch<CalculatorResult>("/api/v1/calculator/estimate", {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({
            monthly_bill: bill,
            industry,
            shifts: Number(shifts),
            power_factor: powerFactor === "unknown" ? null : Number(powerFactor),
            has_peak_production: peakProduction,
          }),
        });
        setResult(data);
        setError(null);
      } catch (failure) {
        if (controller.signal.aborted) return;
        setError(
          !(failure instanceof ApiError)
            ? dict.common.errors.load // no response at all: the network
            : failure.status === 429
              ? rateLimitText(failure.retryAfter, dict, locale)
              : dict.common.error,
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [bill, industry, shifts, powerFactor, peakProduction, attempt, dict, locale]);

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
                      value={bill > 0 ? formatNumber(bill, locale) : ""}
                      onChange={(event) => {
                        // The field shows Persian digits in Persian, so normalise before parsing.
                        const digits = toLatinDigits(event.target.value).replace(/\D/g, "");
                        setBill(Math.min(MAX_TOMAN, Number(digits) || 0));
                      }}
                      className="pe-16 text-base font-semibold tabular"
                    />
                    <span className="pointer-events-none absolute inset-y-0 end-3.5 flex items-center text-xs text-ink-3">
                      {dict.common.toman}
                    </span>
                  </div>
                </Field>
                {/* Outside the label, so the label names only the text field. 44px
                    tall for touch; the track itself stays thin. */}
                <input
                  type="range"
                  min={SLIDER_MIN}
                  max={SLIDER_MAX}
                  step={SLIDER_MIN}
                  value={Math.min(Math.max(bill, SLIDER_MIN), SLIDER_MAX)}
                  onChange={(event) => setBill(Number(event.target.value))}
                  className="-mt-4 h-11 w-full cursor-pointer accent-brand"
                  aria-label={dict.calculator.monthlyBill}
                  aria-valuetext={formatToman(bill, locale, dict.common)}
                />

                <Field label={dict.calculator.industry}>
                  <Select value={industry} onChange={(event) => setIndustry(event.target.value)}>
                    {INDUSTRIES.map((key) => (
                      <option key={key} value={key}>
                        {dict.industries.items[key]}
                      </option>
                    ))}
                  </Select>
                </Field>

                {/* Not a Field: a <label> around a radio group would hand its
                    text, and its clicks, to the first option. */}
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-ink-2">{dict.calculator.shifts}</span>
                  <Segmented
                    label={dict.calculator.shifts}
                    value={shifts}
                    onChange={setShifts}
                    className="w-full [&>button]:flex-1"
                    options={[
                      { value: "1", label: dict.calculator.shiftLabels[0] },
                      { value: "2", label: dict.calculator.shiftLabels[1] },
                      { value: "3", label: dict.calculator.shiftLabels[2] },
                    ]}
                  />
                </div>

                <Field label={dict.calculator.powerFactor}>
                  <Select value={powerFactor} onChange={(event) => setPowerFactor(event.target.value)}>
                    <option value="unknown">{dict.calculator.powerFactorUnknown}</option>
                    {POWER_FACTORS.map((value) => (
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
              </div>
            </Card>

            <Card className="relative flex flex-col overflow-hidden p-6" aria-busy={loading}>
              {/* Always mounted, so the error is announced politely when it arrives:
                  the estimate updates as people type, which is no reason to interrupt. */}
              <div role="status">
                {error && bill > 0 && (
                  <div className="mb-5 flex items-center gap-3 rounded-md border border-line bg-surface-2 p-3">
                    <AlertCircle className="size-4 shrink-0 text-critical" aria-hidden />
                    <span className="flex-1 text-xs leading-relaxed text-ink">{error}</span>
                    <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                      {dict.common.retry}
                    </Button>
                  </div>
                )}
              </div>

              {bill <= 0 ? (
                <p className="flex flex-1 items-center justify-center text-center text-sm text-ink-3">
                  {dict.calculator.billRequired}
                </p>
              ) : !result || !expected ? (
                !error && (
                  <div className="flex flex-1 items-center justify-center text-ink-3">
                    <Loader2 className="size-5 animate-spin" aria-hidden />
                    <span className="sr-only">{dict.common.loading}</span>
                  </div>
                )
              ) : (
                // A stale result dims while the next one is on its way, rather than vanishing.
                <div
                  className={cn(
                    "flex flex-1 flex-col transition-opacity duration-200 ease-[var(--ease-out)]",
                    (loading || error) && "opacity-60",
                  )}
                >
                  <div aria-live="polite" aria-atomic="true">
                    <p className="text-xs font-medium text-ink-3">{dict.calculator.resultTitle}</p>
                    <div
                      key={result.expected_annual}
                      className="mt-2 flex flex-wrap items-baseline gap-2 transition-[opacity,translate] duration-350 ease-[var(--ease-out)] starting:translate-y-1.5 starting:opacity-0"
                    >
                      <span className="text-4xl font-bold tracking-tight tabular text-brand sm:text-5xl">
                        {expected.value}
                      </span>
                      <span className="text-sm font-medium text-ink-2">{expected.unit}</span>
                      <span className="ms-2 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[0.6875rem] font-semibold tabular text-ink-2">
                        {formatPercent(result.percent_expected, locale, 1)} {dict.common.perYear}
                      </span>
                    </div>
                  </div>

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
                            <span className="ms-1 text-[0.625rem] font-normal text-ink-3">{money.unit}</span>
                          </div>
                          <div className="mt-0.5 text-[0.625rem] text-ink-3">{item.label}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-5">
                    <h3 className="text-xs font-semibold text-ink">{dict.calculator.breakdownTitle}</h3>

                    {/* One stacked bar, then a labelled list - identity comes from
                        the label, colour only reinforces it. */}
                    <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
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
                              <span className="ms-1 text-[0.625rem] font-normal text-ink-3">{money.unit}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div className="mt-5 rounded-md border border-line bg-surface-2 p-4">
                    <h3 className="text-xs font-semibold text-ink">{dict.calculator.netTitle}</h3>
                    <dl className="mt-3 space-y-2 text-xs">
                      <Row
                        label={dict.calculator.subscriptionLabel}
                        value={`− ${formatToman(result.subscription_annual, locale, dict.common)}`}
                      />
                      <Row
                        label={dict.calculator.netLabel}
                        value={formatToman(result.net_annual, locale, dict.common)}
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

                  <ButtonLink href="#contact" variant="secondary" className="group mt-4 w-full">
                    {dict.calculator.ctaAfter}
                    <Arrow className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                  </ButtonLink>
                </div>
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
