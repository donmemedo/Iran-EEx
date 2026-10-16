"use client";

import { AlertTriangle, Bell, Building2, Gauge, PiggyBank, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";

import { BandDonut } from "@/components/charts/band-donut";
import { BarSeries } from "@/components/charts/bar-series";
import { BandLegend, LoadChart } from "@/components/charts/load-chart";
import {
  AlertRow,
  EmptyState,
  ErrorState,
  FindingRow,
  KpiCard,
  markAcknowledged,
  PageHeader,
  SiteCard,
  useAcknowledgeAlert,
  ViewOnlyNote,
} from "@/components/app/pieces";
import { Card, CardHeader } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/skeleton";
import type { DashboardData } from "@/lib/api";
import {
  formatEnergy,
  formatMonthKey,
  formatNumber,
  formatPercent,
  formatTime,
  splitToman,
} from "@/lib/format";
import { useLocale, useLocalized } from "@/lib/locale-context";

export default function DashboardPage() {
  const { dict, locale, href } = useLocale();
  const pick = useLocalized();
  const { data, error, mutate } = useSWR<DashboardData>("/api/v1/dashboard", {
    // The portfolio load is a live figure; refresh it while the tab is open.
    refreshInterval: 60_000,
  });
  const { acknowledge, failure, canEdit } = useAcknowledgeAlert(mutate, (current, id) => ({
    ...current,
    recent_alerts: markAcknowledged(current.recent_alerts, id),
    kpis: { ...current.kpis, unacknowledged_alerts: Math.max(0, current.kpis.unacknowledged_alerts - 1) },
  }));

  if (error && !data) {
    return (
      <>
        <PageHeader title={dict.app.dashboard.title} subtitle={dict.app.dashboard.greeting} />
        <ErrorState error={error} onRetry={() => mutate()} />
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PageHeader title={dict.app.dashboard.title} subtitle={dict.app.dashboard.greeting} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      </>
    );
  }

  const { kpis } = data;
  const cost = splitToman(kpis.monthly_energy_cost, locale, dict.common);
  const verified = splitToman(kpis.verified_savings_ytd, locale, dict.common);
  const potential = splitToman(kpis.saving_potential, locale, dict.common);
  const load = formatNumber(kpis.total_kw_now / 1000, locale, { maximumFractionDigits: 1 });
  const totalBandKwh = Object.values(data.band_split).reduce((sum, value) => sum + value, 0);
  const totalEnergy = formatEnergy(totalBandKwh, locale);

  return (
    <>
      <PageHeader title={dict.app.dashboard.title} subtitle={dict.app.dashboard.greeting} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={dict.app.dashboard.kpi.loadNow}
          value={load}
          unit="MW"
          icon={Zap}
          meter={{ value: kpis.total_kw_now, max: kpis.total_kw_now * 1.35, tone: "brand" }}
        />
        <KpiCard
          label={dict.app.dashboard.kpi.monthlyCost}
          value={cost.value}
          unit={cost.unit}
          icon={Building2}
        />
        <KpiCard
          label={dict.app.dashboard.kpi.verifiedSavings}
          value={verified.value}
          unit={verified.unit}
          icon={PiggyBank}
          delta={formatPercent(Math.abs(kpis.energy_intensity_change), locale, 1)}
          deltaGood
        />
        <KpiCard
          label={dict.app.dashboard.kpi.potential}
          value={potential.value}
          unit={potential.unit}
          icon={Sparkles}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={dict.app.dashboard.kpi.activeSites}
          value={formatNumber(kpis.active_sites, locale)}
          unit={`${dict.common.of} ${formatNumber(data.sites.length, locale)}`}
          icon={Building2}
        />
        <KpiCard
          label={dict.app.dashboard.kpi.avgPowerFactor}
          value={formatNumber(kpis.avg_power_factor, locale, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
          icon={Gauge}
          meter={{
            value: kpis.avg_power_factor,
            max: 1,
            tone: kpis.avg_power_factor < 0.9 ? "critical" : "good",
          }}
        />
        <KpiCard
          label={dict.app.dashboard.kpi.openFindings}
          value={formatNumber(kpis.open_findings, locale)}
          unit={`${formatNumber(kpis.high_severity_findings, locale)} ${dict.app.findings.severity.high}`}
          icon={AlertTriangle}
        />
        <KpiCard
          label={dict.app.dashboard.kpi.alerts}
          value={formatNumber(kpis.unacknowledged_alerts, locale)}
          icon={Bell}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title={dict.app.dashboard.portfolioLoad}
            hint={dict.app.dashboard.portfolioLoadHint}
            action={<BandLegend className="hidden sm:flex" />}
          />
          <div className="p-3 sm:p-5">
            <LoadChart
              label={dict.app.dashboard.portfolioLoad}
              points={data.portfolio_load.map((point, index) => ({
                ts: point.ts,
                value: point.kw,
                band: bandForTimestamp(point.ts),
                anomaly: false,
              }))}
              height={280}
              unit={dict.common.kw}
              formatValue={(value) => formatNumber(value, locale)}
              formatAxisValue={(value) =>
                `${formatNumber(value / 1000, locale, { maximumFractionDigits: 1 })} MW`
              }
              formatLabel={(ts) => formatTime(ts, locale)}
            />
            <BandLegend className="mt-3 sm:hidden" />
          </div>
        </Card>

        <Card>
          <CardHeader title={dict.app.dashboard.bandSplit} />
          <div className="p-5">
            <BandDonut
              data={data.band_split}
              centerValue={totalEnergy.value}
              centerLabel={totalEnergy.unit}
            />
            <p className="mt-5 rounded-md border border-line bg-surface-2 p-3 text-[0.6875rem] leading-relaxed text-ink-2">
              {locale === "fa"
                ? `سهم اوج بار ${formatPercent(kpis.peak_share * 100, locale, 1)} است. هر درصد کاهش این سهم، مستقیماً از هزینه انرژی کم می‌کند.`
                : `The peak band is ${formatPercent(kpis.peak_share * 100, locale, 1)} of consumption. Every point shaved off it comes straight off the energy bill.`}
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={dict.app.dashboard.savingsTrend} hint={dict.common.millionToman} />
          <div className="p-3 sm:p-5">
            <BarSeries
              label={dict.app.dashboard.savingsTrend}
              points={data.savings_trend.map((item) => ({
                key: item.month,
                label: formatMonthKey(item.month, locale),
                value: item.saved_amount,
              }))}
              height={220}
              formatValue={(value) => {
                const money = splitToman(value, locale, dict.common);
                return `${money.value} ${money.unit}`;
              }}
              formatAxisValue={(value) => formatNumber(value / 1_000_000, locale)}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title={dict.app.dashboard.topFindings}
            action={
              <Link href={href("/app/findings")} className="tap-target rounded-xs text-[0.6875rem] font-medium text-brand hover:opacity-75">
                {dict.common.viewAll}
              </Link>
            }
          />
          <div className="mt-3 divide-y divide-[var(--line)] border-t border-line">
            {data.top_findings.length === 0 ? (
              <div className="p-5">
                <EmptyState message={dict.app.findings.noFindings} />
              </div>
            ) : (
              data.top_findings.slice(0, 5).map((finding) => {
                const site = data.sites.find((s) => s.id === finding.site_id);
                return (
                  <FindingRow
                    key={finding.id}
                    finding={finding}
                    siteName={site ? pick(site, "name") : undefined}
                    href={href("/app/findings")}
                  />
                );
              })
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title={dict.app.dashboard.sitesOverview}
            action={
              <Link href={href("/app/sites")} className="tap-target rounded-xs text-[0.6875rem] font-medium text-brand hover:opacity-75">
                {dict.common.viewAll}
              </Link>
            }
          />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {data.sites.slice(0, 4).map((site) => (
              <SiteCard key={site.id} site={site} href={href(`/app/sites/${site.id}`)} />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={dict.app.dashboard.recentAlerts}
            action={
              <Link href={href("/app/alerts")} className="tap-target rounded-xs text-[0.6875rem] font-medium text-brand hover:opacity-75">
                {dict.common.viewAll}
              </Link>
            }
          />
          <div className="mt-3 divide-y divide-[var(--line)] border-t border-line">
            {data.recent_alerts.length === 0 ? (
              <div className="p-5">
                <EmptyState message={dict.app.dashboard.noAlerts} icon={Bell} />
              </div>
            ) : (
              data.recent_alerts
                .slice(0, 5)
                .map((alert) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    onAcknowledge={acknowledge && (() => acknowledge(alert.id))}
                    error={failure?.id === alert.id ? failure.message : undefined}
                  />
                ))
            )}
          </div>
          {!canEdit && data.recent_alerts.length > 0 && <ViewOnlyNote className="m-4" />}
        </Card>
      </div>
    </>
  );
}

/** Tehran-local tariff band for a timestamp, so the strip under the portfolio
 *  chart matches what the meter is actually being billed at. */
const tehranHour = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hour12: false,
  timeZone: "Asia/Tehran",
});

function bandForTimestamp(ts: string): string {
  const hour = Number(tehranHour.format(new Date(ts)));
  if (hour >= 19 && hour < 23) return "peak";
  if (hour >= 7 && hour < 19) return "mid_peak";
  return "off_peak";
}
