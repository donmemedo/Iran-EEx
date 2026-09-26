"use client";

import { ArrowLeft, ArrowRight, Bell, Factory, Receipt, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import { AlertRow, EmptyState, FindingRow, KpiCard, PageHeader } from "@/components/app/pieces";
import { BandDonut } from "@/components/charts/band-donut";
import { PowerFactorGauge } from "@/components/charts/gauge";
import { BandLegend, LoadChart } from "@/components/charts/load-chart";
import { Badge, billStatusTone, siteStatusTone } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/field";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import type { Alert, Bill, ConsumptionSeries, Feeder, Finding, Site } from "@/lib/api";
import {
  formatDate,
  formatEnergy,
  formatMonthKey,
  formatNumber,
  formatPercent,
  formatTime,
  splitToman,
} from "@/lib/format";
import { useLocale, useLocalized } from "@/lib/locale-context";

type Range = "24h" | "7d" | "30d" | "12m";

export default function SiteDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { dict, locale, href, dir } = useLocale();
  const pick = useLocalized();
  const [range, setRange] = useState<Range>("24h");

  const { data: site } = useSWR<Site>(`/api/v1/sites/${id}`, { refreshInterval: 60_000 });
  const { data: series } = useSWR<ConsumptionSeries>(`/api/v1/sites/${id}/consumption?range=${range}`);
  const { data: meters } = useSWR<{ feeders: Feeder[]; total_kw: number }>(`/api/v1/sites/${id}/meters`);
  const { data: bills } = useSWR<Bill[]>(`/api/v1/bills?site_id=${id}&limit=12`);
  const { data: findings } = useSWR<Finding[]>(`/api/v1/findings?site_id=${id}&status=open`);
  const { data: alerts } = useSWR<Alert[]>(`/api/v1/alerts?site_id=${id}&limit=10`);

  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;

  if (!site) {
    return (
      <>
        <Skeleton className="h-8 w-56" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      </>
    );
  }

  const potential = splitToman(site.annual_saving_potential, locale, dict.common);
  const verified = splitToman(site.verified_savings_ytd, locale, dict.common);
  const energy = series?.total_kwh ? formatEnergy(series.total_kwh, locale) : null;
  const isMonthly = range === "12m";

  return (
    <>
      <Link
        href={href("/app/sites")}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-ink-3 transition-colors hover:text-ink"
      >
        <Back className="size-3.5" />
        {dict.app.site.backToSites}
      </Link>

      <PageHeader
        title={pick(site, "name")}
        subtitle={`${pick(site, "city")}، ${pick(site, "province")} · ${
          dict.industries.items[site.industry as keyof typeof dict.industries.items]
        }`}
        action={<Badge tone={siteStatusTone[site.status]}>{dict.app.sites.status[site.status]}</Badge>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={dict.app.sites.loadNow}
          value={formatNumber(site.live.kw, locale)}
          unit={dict.common.kw}
          icon={Factory}
          meter={{
            value: site.live.kw,
            max: site.contracted_demand_kw,
            tone: site.live.demand_headroom_percent < 8 ? "critical" : "brand",
          }}
        />
        <KpiCard
          label={dict.app.sites.contractedDemand}
          value={formatNumber(site.contracted_demand_kw, locale)}
          unit={dict.common.kw}
          delta={formatPercent(Math.abs(site.live.demand_headroom_percent), locale)}
          deltaGood={site.live.demand_headroom_percent > 8}
        />
        <KpiCard
          label={dict.app.sites.potential}
          value={potential.value}
          unit={potential.unit}
          icon={Sparkles}
        />
        <KpiCard
          label={dict.app.savings.totalVerified}
          value={verified.value}
          unit={verified.unit}
        />
      </div>

      <Card className="mt-4">
        <CardHeader
          title={dict.app.site.consumption}
          action={
            <Segmented
              size="sm"
              value={range}
              onChange={setRange}
              options={(["24h", "7d", "30d", "12m"] as const).map((key) => ({
                value: key,
                label: dict.app.site.ranges[key],
              }))}
            />
          }
        />
        <div className="p-3 sm:p-5">
          {series ? (
            <>
              <LoadChart
                points={series.points.map((point) => ({
                  ts: point.ts,
                  value: isMonthly ? point.kwh : point.kw,
                  band: isMonthly ? undefined : point.band,
                  anomaly: point.anomaly,
                }))}
                height={300}
                showBandStrip={!isMonthly}
                unit={isMonthly ? dict.common.kwh : dict.common.kw}
                referenceLines={
                  isMonthly
                    ? []
                    : [
                        {
                          value: series.contracted_demand_kw,
                          label: dict.app.site.contractedLine,
                          tone: "critical",
                        },
                      ]
                }
                formatValue={(value) => formatNumber(value, locale)}
                formatAxisValue={(value) =>
                  value >= 1000
                    ? `${formatNumber(value / 1000, locale, { maximumFractionDigits: 1 })} ${isMonthly ? "MWh" : "MW"}`
                    : formatNumber(value, locale)
                }
                formatLabel={(ts) =>
                  isMonthly
                    ? formatMonthKey(ts, locale)
                    : range === "24h"
                      ? formatTime(ts, locale)
                      : formatDate(ts, locale)
                }
              />
              {!isMonthly && <BandLegend className="mt-3" />}

              <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
                <Stat label={dict.app.site.peakLoad} value={`${formatNumber(series.peak_kw ?? 0, locale)} ${dict.common.kw}`} />
                <Stat label={dict.app.site.avgLoad} value={`${formatNumber(series.avg_kw ?? 0, locale)} ${dict.common.kw}`} />
                <Stat
                  label={dict.app.site.totalEnergy}
                  value={energy ? `${energy.value} ${energy.unit}` : "—"}
                />
                <Stat
                  label={dict.app.site.avgPowerFactor}
                  value={formatNumber(series.avg_power_factor ?? site.live.power_factor, locale, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                />
              </dl>
            </>
          ) : (
            <Skeleton className="h-72 w-full" />
          )}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title={dict.app.dashboard.bandSplit} />
          <div className="p-5">
            {series && (
              <BandDonut
                data={series.bands}
                size={148}
                centerValue={formatEnergy(Object.values(series.bands).reduce((a, b) => a + b, 0), locale).value}
                centerLabel={formatEnergy(Object.values(series.bands).reduce((a, b) => a + b, 0), locale).unit}
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title={dict.app.sites.powerFactor} />
          <div className="flex items-center gap-5 p-5">
            <PowerFactorGauge value={site.live.power_factor} label="cos φ" />
            <p className="text-xs leading-relaxed text-ink-2">
              {site.live.power_factor < 0.9
                ? locale === "fa"
                  ? "ضریب توان زیر حد مجاز ۰٫۹۰ است و جریمه توان راکتیو به صورت‌حساب اضافه می‌شود."
                  : "Power factor is below the 0.90 floor, so a reactive penalty is being added to the invoice."
                : locale === "fa"
                  ? "ضریب توان در محدوده مجاز است و جریمه‌ای اعمال نمی‌شود."
                  : "Power factor is within the allowed range; no penalty applies."}
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title={dict.app.site.feeders} />
          <div className="p-5">
            {meters ? (
              <ul className="space-y-3">
                {meters.feeders.map((feeder) => (
                  <li key={feeder.id}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-ink-2">{pick(feeder, "name")}</span>
                      <span className="shrink-0 font-semibold tabular text-ink">
                        {formatNumber(feeder.kw, locale)}
                        <span className="ms-1 text-[0.625rem] font-normal text-ink-3">
                          {dict.common.kw}
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full bg-brand transition-[width] duration-500 ease-[var(--ease-out)]"
                        style={{ width: `${feeder.share * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Skeleton className="h-40 w-full" />
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={dict.app.site.bills} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-start text-xs">
              <thead>
                <tr className="border-y border-line text-ink-3">
                  <th className="p-3 text-start font-medium">{dict.app.bills.period}</th>
                  <th className="p-3 text-start font-medium">{dict.app.bills.energy}</th>
                  <th className="p-3 text-start font-medium">{dict.app.bills.billed}</th>
                  <th className="p-3 text-start font-medium">{dict.app.bills.findings}</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {bills?.map((bill) => {
                  const money = splitToman(bill.billed_total, locale, dict.common);
                  const kwh = formatEnergy(bill.total_kwh, locale);
                  return (
                    <tr key={bill.id} className="transition-colors hover:bg-surface-2">
                      <td className="p-3 font-medium text-ink">{pick(bill, "period_label")}</td>
                      <td className="p-3 tabular text-ink-2">
                        {kwh.value} {kwh.unit}
                      </td>
                      <td className="p-3 tabular text-ink-2">
                        {money.value} {money.unit}
                      </td>
                      <td className="p-3">
                        <Badge tone={billStatusTone[bill.status]}>
                          {formatNumber(bill.finding_count, locale)}
                        </Badge>
                      </td>
                      <td className="p-3 text-end">
                        <Link
                          href={href(`/app/bills/${bill.id}`)}
                          className="font-medium text-brand hover:opacity-75"
                        >
                          {dict.common.viewMore}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title={dict.app.site.findings} />
            <div className="mt-3 divide-y divide-[var(--line)] border-t border-line">
              {findings && findings.length > 0 ? (
                findings.slice(0, 4).map((finding) => <FindingRow key={finding.id} finding={finding} />)
              ) : (
                <div className="p-5">
                  <EmptyState message={dict.app.findings.noFindings} icon={Sparkles} />
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={dict.app.site.alerts} />
            <div className="mt-3 divide-y divide-[var(--line)] border-t border-line">
              {alerts && alerts.length > 0 ? (
                alerts.slice(0, 4).map((alert) => (
                  <AlertRow key={alert.id} alert={alert} showSite={false} />
                ))
              ) : (
                <div className="p-5">
                  <EmptyState message={dict.app.alerts.noAlerts} icon={Bell} />
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.625rem] text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular text-ink">{value}</dd>
    </div>
  );
}
