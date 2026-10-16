"use client";

import { PiggyBank } from "lucide-react";
import useSWR from "swr";

import { EmptyState, ErrorState, KpiCard, PageHeader } from "@/components/app/pieces";
import { BarSeries } from "@/components/charts/bar-series";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SavingsRecord, Site } from "@/lib/api";
import { formatEnergy, formatMonthKey, formatNumber, formatPercent, splitToman } from "@/lib/format";
import { useLocale, useLocalized } from "@/lib/locale-context";

export default function SavingsPage() {
  const { dict, locale } = useLocale();
  const pick = useLocalized();
  const { data: records, error, isLoading, mutate } = useSWR<SavingsRecord[]>("/api/v1/savings");
  const { data: sites } = useSWR<Site[]>("/api/v1/sites");
  const siteById = new Map((sites ?? []).map((site) => [site.id, site]));

  if (error && !records) {
    return (
      <>
        <PageHeader title={dict.app.savings.title} subtitle={dict.app.savings.subtitle} />
        <ErrorState error={error} onRetry={() => mutate()} />
      </>
    );
  }
  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!records || records.length === 0) {
    return (
      <>
        <PageHeader title={dict.app.savings.title} subtitle={dict.app.savings.subtitle} />
        <EmptyState message={dict.app.savings.noRecords} icon={PiggyBank} />
      </>
    );
  }

  // Roll the per-site records up to a portfolio month series.
  const byMonth = new Map<string, { amount: number; kwh: number }>();
  for (const record of records) {
    const entry = byMonth.get(record.month) ?? { amount: 0, kwh: 0 };
    entry.amount += record.saved_amount;
    entry.kwh += record.saved_kwh;
    byMonth.set(record.month, entry);
  }
  const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));

  const totalAmount = records
    .filter((record) => record.verified)
    .reduce((sum, record) => sum + record.saved_amount, 0);
  const totalKwh = records
    .filter((record) => record.verified)
    .reduce((sum, record) => sum + record.saved_kwh, 0);
  const total = splitToman(totalAmount, locale, dict.common);
  const energy = formatEnergy(totalKwh, locale);

  const latest = records.slice(-40).reverse();

  return (
    <>
      <PageHeader title={dict.app.savings.title} subtitle={dict.app.savings.subtitle} />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label={dict.app.savings.totalVerified}
          value={total.value}
          unit={total.unit}
          icon={PiggyBank}
        />
        <KpiCard label={dict.app.savings.totalKwh} value={energy.value} unit={energy.unit} />
        <KpiCard
          label={dict.app.dashboard.kpi.activeSites}
          value={formatNumber(new Set(records.map((r) => r.site_id)).size, locale)}
        />
      </div>

      <Card className="mt-4">
        <CardHeader title={dict.app.dashboard.savingsTrend} hint={dict.common.millionToman} />
        <div className="p-3 sm:p-5">
          <BarSeries
            label={dict.app.dashboard.savingsTrend}
            points={months.map(([month, entry]) => ({
              key: month,
              label: formatMonthKey(month, locale),
              value: entry.amount,
            }))}
            height={240}
            formatValue={(value) => {
              const money = splitToman(value, locale, dict.common);
              return `${money.value} ${money.unit}`;
            }}
            formatAxisValue={(value) => formatNumber(value / 1_000_000, locale)}
          />
        </div>
      </Card>

      <Card className="mt-4 overflow-hidden">
        <CardHeader title={dict.app.savings.title} />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-start text-xs">
            <thead>
              <tr className="border-y border-line text-ink-3">
                <th className="p-4 text-start font-medium">{dict.app.bills.period}</th>
                <th className="p-4 text-start font-medium">{dict.app.bills.site}</th>
                <th className="p-4 text-start font-medium">{dict.app.savings.baseline}</th>
                <th className="p-4 text-start font-medium">{dict.app.savings.actual}</th>
                <th className="p-4 text-start font-medium">{dict.app.savings.saved}</th>
                <th className="p-4 text-start font-medium">{dict.app.savings.savedAmount}</th>
                <th className="p-4 text-start font-medium">{dict.app.savings.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {latest.map((record) => {
                const site = siteById.get(record.site_id);
                const money = splitToman(record.saved_amount, locale, dict.common);
                const baseline = formatEnergy(record.baseline_kwh, locale);
                const actual = formatEnergy(record.actual_kwh, locale);
                const saved = formatEnergy(record.saved_kwh, locale);
                const share = record.baseline_kwh
                  ? (record.saved_kwh / record.baseline_kwh) * 100
                  : 0;

                return (
                  <tr key={record.id} className="transition-colors hover:bg-surface-2">
                    <td className="p-4 whitespace-nowrap font-medium text-ink">
                      {/* The API only labels periods in Persian. */}
                      {(locale === "fa" && record.period_label_fa) || formatMonthKey(record.month, locale)}
                    </td>
                    <td className="p-4 text-ink-2">{site ? pick(site, "name") : "—"}</td>
                    <td className="p-4 tabular whitespace-nowrap text-ink-2">
                      {baseline.value} {baseline.unit}
                    </td>
                    <td className="p-4 tabular whitespace-nowrap text-ink-2">
                      {actual.value} {actual.unit}
                    </td>
                    <td className="p-4 whitespace-nowrap text-ink">
                      {/* A flex gap keeps the unit and the share from colliding,
                          which a plain inline margin does not in both directions. */}
                      <span className="flex items-baseline gap-2">
                        <span className="tabular">
                          {saved.value} {saved.unit}
                        </span>
                        <span className="text-[0.625rem] tabular text-good">
                          {formatPercent(share, locale, 1)}
                        </span>
                      </span>
                    </td>
                    <td className="p-4 tabular whitespace-nowrap font-semibold text-brand">
                      {money.value} <span className="text-[0.625rem] font-normal text-ink-3">{money.unit}</span>
                    </td>
                    <td className="p-4">
                      <Badge tone={record.verified ? "good" : "neutral"}>
                        {record.verified ? dict.app.savings.verified : dict.app.savings.pending}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
