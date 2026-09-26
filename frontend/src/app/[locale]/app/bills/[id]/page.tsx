"use client";

import { ArrowLeft, ArrowRight, Lightbulb, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";

import { PageHeader } from "@/components/app/pieces";
import { Badge, billStatusTone, severityTone } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { BillDetail } from "@/lib/api";
import { formatDate, formatEnergy, formatNumber, formatPercent, splitToman } from "@/lib/format";
import { useLocale, useLocalized } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

/** Invoice lines carry the same colour identity as the consumption charts. */
const LINE_COLORS: Record<string, string> = {
  energy_peak: "var(--band-peak)",
  energy_mid_peak: "var(--band-mid)",
  energy_off_peak: "var(--band-off)",
  demand_charge: "var(--series-4)",
  levies: "var(--ink-3)",
  service_charge: "var(--ink-3)",
  vat: "var(--series-5)",
};

export default function BillDetailPage() {
  const params = useParams<{ id: string }>();
  const { dict, locale, href, dir } = useLocale();
  const pick = useLocalized();
  const { data: bill } = useSWR<BillDetail>(`/api/v1/bills/${params.id}`);
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;

  if (!bill) return <Skeleton className="h-96 w-full" />;

  const billed = splitToman(bill.billed_total, locale, dict.common);
  const recomputed = splitToman(bill.recomputed_total, locale, dict.common);
  const delta = bill.billed_total - bill.recomputed_total;
  const deltaMoney = splitToman(Math.abs(delta), locale, dict.common);
  const material = Math.abs(delta) / Math.max(bill.recomputed_total, 1) > 0.01;
  const kwh = formatEnergy(bill.total_kwh, locale);
  const lines = bill.breakdown?.lines ?? [];
  const maxLine = Math.max(...lines.map((line) => Math.abs(line.amount)), 1);

  return (
    <>
      <Link
        href={href(`/app/sites/${bill.site_id}`)}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-ink-3 transition-colors hover:text-ink"
      >
        <Back className="size-3.5" />
        {pick(bill, "site_name")}
      </Link>

      <PageHeader
        title={pick(bill, "period_label")}
        subtitle={`${pick(bill, "site_name")} · ${formatDate(bill.issued_at, locale)}`}
        action={<Badge tone={billStatusTone[bill.status]}>{dict.app.bills.status[bill.status]}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <span className="text-xs text-ink-3">{dict.app.bills.billed}</span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular text-ink">{billed.value}</span>
            <span className="text-xs text-ink-3">{billed.unit}</span>
          </div>
        </Card>
        <Card className="p-5">
          <span className="text-xs text-ink-3">{dict.app.bills.recomputed}</span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular text-ink">{recomputed.value}</span>
            <span className="text-xs text-ink-3">{recomputed.unit}</span>
          </div>
        </Card>
        <Card className={cn("p-5", material && "border-critical/40")}>
          <span className="text-xs text-ink-3">{dict.app.bills.difference}</span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span
              className={cn("text-2xl font-bold tabular", material ? "text-critical" : "text-ink-3")}
            >
              {material ? `${delta > 0 ? "+" : "−"}${deltaMoney.value}` : "—"}
            </span>
            {material && <span className="text-xs text-ink-3">{deltaMoney.unit}</span>}
          </div>
          {material && (
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-2">
              {formatPercent((Math.abs(delta) / bill.recomputed_total) * 100, locale, 1)}
            </p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title={dict.app.bills.breakdown} />
          <ul className="mt-3 divide-y divide-[var(--line)] border-t border-line">
            {lines
              .filter((line) => Math.abs(line.amount) > 0)
              .map((line) => {
                const money = splitToman(line.amount, locale, dict.common);
                const isPenalty = line.key.includes("penalty");
                const isCredit = line.amount < 0;
                return (
                  <li key={line.key} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-xs text-ink-2">
                          {dict.app.bills.lines[line.key as keyof typeof dict.app.bills.lines]}
                        </span>
                        {isPenalty && (
                          <Badge tone="critical" className="shrink-0">
                            {dict.app.findings.severity.high}
                          </Badge>
                        )}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-xs font-semibold tabular",
                          isCredit ? "text-good" : isPenalty ? "text-critical" : "text-ink",
                        )}
                      >
                        {money.value}
                        <span className="ms-1 text-[0.625rem] font-normal text-ink-3">{money.unit}</span>
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(Math.abs(line.amount) / maxLine) * 100}%`,
                          background: isCredit
                            ? "var(--status-good)"
                            : isPenalty
                              ? "var(--status-critical)"
                              : // Energy lines keep their tariff-band colour, so the
                                // invoice reads with the same identity as the charts.
                                LINE_COLORS[line.key] ?? "var(--ink-3)",
                        }}
                      />
                    </div>
                  </li>
                );
              })}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title={dict.app.bills.meterReadings} />
            <dl className="mt-3 divide-y divide-[var(--line)] border-t border-line text-xs">
              <Row label={dict.bands.peak} value={`${formatNumber(bill.peak_kwh, locale)} ${dict.common.kwh}`} color="var(--band-peak)" />
              <Row label={dict.bands.mid_peak} value={`${formatNumber(bill.mid_peak_kwh, locale)} ${dict.common.kwh}`} color="var(--band-mid)" />
              <Row label={dict.bands.off_peak} value={`${formatNumber(bill.off_peak_kwh, locale)} ${dict.common.kwh}`} color="var(--band-off)" />
              <Row label={dict.app.bills.total} value={`${kwh.value} ${kwh.unit}`} strong />
              <Row label={dict.app.bills.peakDemand} value={`${formatNumber(bill.peak_demand_kw, locale)} ${dict.common.kw}`} />
              <Row label={dict.app.bills.contracted} value={`${formatNumber(bill.contracted_demand_kw, locale)} ${dict.common.kw}`} />
              <Row
                label="cos φ"
                value={formatNumber(bill.power_factor, locale, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                warn={bill.power_factor < 0.9}
              />
              {bill.production_units && (
                <Row
                  label={dict.app.bills.production}
                  value={formatNumber(bill.production_units, locale)}
                />
              )}
            </dl>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader
          title={dict.app.findings.title}
          hint={`${formatNumber(bill.findings.length, locale)} · ${splitToman(bill.saving_potential, locale, dict.common).value} ${splitToman(bill.saving_potential, locale, dict.common).unit} ${dict.common.perYear}`}
        />
        <div className="mt-3 divide-y divide-[var(--line)] border-t border-line">
          {bill.findings.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-3">{dict.app.findings.noFindings}</p>
          ) : (
            bill.findings.map((finding) => {
              const saving = splitToman(finding.annual_saving, locale, dict.common);
              const investment = splitToman(finding.investment, locale, dict.common);
              return (
                <article key={finding.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-ink">{pick(finding, "title")}</h4>
                        <Badge tone={severityTone[finding.severity]}>
                          {dict.app.findings.severity[finding.severity]}
                        </Badge>
                      </div>
                      <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-2">
                        {pick(finding, "detail")}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <div className="flex items-center gap-1.5 text-brand">
                        <TrendingDown className="size-3.5" />
                        <span className="text-lg font-bold tabular">{saving.value}</span>
                      </div>
                      <div className="text-[0.625rem] text-ink-3">
                        {saving.unit} {dict.common.perYear}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[--radius-md] border border-line bg-surface-2 p-3.5">
                    <div className="flex items-start gap-2">
                      <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-brand" />
                      <div>
                        <span className="text-[0.625rem] font-semibold text-ink">
                          {dict.app.findings.action}
                        </span>
                        <p className="mt-1 text-xs leading-relaxed text-ink-2">
                          {pick(finding, "action")}
                        </p>
                      </div>
                    </div>
                  </div>

                  <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[0.6875rem]">
                    {finding.investment > 0 && (
                      <div className="flex gap-1.5">
                        <dt className="text-ink-3">{dict.app.findings.investment}:</dt>
                        <dd className="font-medium tabular text-ink">
                          {investment.value} {investment.unit}
                        </dd>
                      </div>
                    )}
                    {finding.payback_months && (
                      <div className="flex gap-1.5">
                        <dt className="text-ink-3">{dict.app.findings.payback}:</dt>
                        <dd className="font-medium tabular text-ink">
                          {formatNumber(finding.payback_months, locale, { maximumFractionDigits: 1 })}{" "}
                          {dict.calculator.months}
                        </dd>
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <dt className="text-ink-3">{dict.app.findings.confidence}:</dt>
                      <dd className="font-medium tabular text-ink">
                        {formatPercent(finding.confidence * 100, locale)}
                      </dd>
                    </div>
                  </dl>
                </article>
              );
            })
          )}
        </div>
      </Card>
    </>
  );
}

function Row({
  label,
  value,
  color,
  strong,
  warn,
}: {
  label: string;
  value: string;
  color?: string;
  strong?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3.5">
      <dt className="flex items-center gap-2 text-ink-2">
        {color && <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />}
        {label}
      </dt>
      <dd
        className={cn(
          "tabular",
          strong ? "font-bold text-ink" : warn ? "font-semibold text-critical" : "font-medium text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
