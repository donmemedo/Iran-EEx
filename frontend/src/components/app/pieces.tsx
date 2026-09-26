"use client";

import { ArrowDownRight, ArrowUpRight, Inbox, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge, severityTone, siteStatusTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Meter, Sparkline } from "@/components/charts/gauge";
import type { Alert, Finding, Site } from "@/lib/api";
import { formatNumber, formatPercent, formatRelative, splitToman } from "@/lib/format";
import { useLocale, useLocalized } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ message, icon: Icon = Inbox }: { message: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[--radius-lg] border border-dashed border-line-strong px-6 py-14 text-center">
      <Icon className="size-6 text-ink-3" />
      <p className="mt-3 text-sm text-ink-3">{message}</p>
    </div>
  );
}

/** A KPI tile. The value is the hero; the label and delta are secondary ink. */
export function KpiCard({
  label,
  value,
  unit,
  delta,
  deltaGood,
  spark,
  meter,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  deltaGood?: boolean;
  spark?: number[];
  meter?: { value: number; max: number; tone?: "brand" | "critical" | "warning" | "good" };
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <Card className={cn("group p-5 transition-shadow duration-300 hover:shadow-[var(--shadow-md)]", className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium text-ink-3">{label}</span>
        {Icon && <Icon className="size-4 shrink-0 text-ink-3" />}
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tracking-tight tabular text-ink">{value}</span>
        {unit && <span className="text-xs font-medium text-ink-3">{unit}</span>}
      </div>

      {delta && (
        <div
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-[0.6875rem] font-medium",
            deltaGood ? "text-good" : "text-critical",
          )}
        >
          {deltaGood ? <ArrowDownRight className="size-3" /> : <ArrowUpRight className="size-3" />}
          {delta}
        </div>
      )}

      {spark && spark.length > 1 && <Sparkline values={spark} className="mt-3" />}
      {meter && (
        <Meter value={meter.value} max={meter.max} tone={meter.tone} className="mt-3" />
      )}
    </Card>
  );
}

export function SiteCard({ site, href }: { site: Site; href: string }) {
  const { dict, locale } = useLocale();
  const pick = useLocalized();
  const potential = splitToman(site.annual_saving_potential, locale, dict.common);
  const headroom = site.live.demand_headroom_percent;

  return (
    <Link href={href} className="group block">
      <Card className="h-full p-5 transition-[transform,box-shadow,border-color] duration-250 ease-[var(--ease-out)] group-hover:-translate-y-0.5 group-hover:border-brand/30 group-hover:shadow-[var(--shadow-md)] group-active:scale-[0.99]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-ink">{pick(site, "name")}</h3>
            <p className="mt-0.5 truncate text-[0.6875rem] text-ink-3">
              {pick(site, "city")}، {pick(site, "province")} ·{" "}
              {dict.industries.items[site.industry as keyof typeof dict.industries.items]}
            </p>
          </div>
          <Badge tone={siteStatusTone[site.status]}>
            {dict.app.sites.status[site.status]}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <div className="text-[0.625rem] text-ink-3">{dict.app.sites.loadNow}</div>
            <div className="mt-0.5 text-base font-semibold tabular text-ink">
              {formatNumber(site.live.kw, locale)}
              <span className="ms-1 text-[0.625rem] font-normal text-ink-3">{dict.common.kw}</span>
            </div>
          </div>
          <div>
            <div className="text-[0.625rem] text-ink-3">{dict.app.sites.powerFactor}</div>
            <div
              className={cn(
                "mt-0.5 text-base font-semibold tabular",
                site.live.power_factor < 0.9 ? "text-critical" : "text-ink",
              )}
            >
              {formatNumber(site.live.power_factor, locale, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-[0.625rem] text-ink-3">
            <span>{dict.app.sites.headroom}</span>
            <span className={cn("tabular font-medium", headroom < 8 ? "text-critical" : "text-ink-2")}>
              {formatPercent(headroom, locale)}
            </span>
          </div>
          <Meter
            value={site.live.kw}
            max={site.contracted_demand_kw}
            tone={headroom < 8 ? "critical" : headroom < 20 ? "warning" : "brand"}
            className="mt-1.5"
          />
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5">
          <span className="text-[0.6875rem] text-ink-3">
            {formatNumber(site.open_findings, locale)} {dict.app.sites.openFindings}
          </span>
          <span className="text-xs font-semibold tabular text-brand">
            {potential.value}
            <span className="ms-1 text-[0.625rem] font-normal text-ink-3">{potential.unit}</span>
          </span>
        </div>
      </Card>
    </Link>
  );
}

export function FindingRow({
  finding,
  onOpen,
  siteName,
}: {
  finding: Finding;
  onOpen?: () => void;
  siteName?: string;
}) {
  const { dict, locale } = useLocale();
  const pick = useLocalized();
  const money = splitToman(finding.annual_saving, locale, dict.common);

  return (
    <button
      onClick={onOpen}
      className="flex w-full items-start gap-3.5 p-4 text-start transition-colors duration-150 hover:bg-surface-2 active:scale-[0.995]"
    >
      <span
        className="mt-1.5 size-2 shrink-0 rounded-full"
        style={{
          background:
            finding.severity === "high"
              ? "var(--status-critical)"
              : finding.severity === "medium"
                ? "var(--status-warning)"
                : "var(--band-mid)",
        }}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[0.8125rem] font-medium text-ink">{pick(finding, "title")}</span>
          <Badge tone={severityTone[finding.severity]} className="shrink-0">
            {dict.app.findings.severity[finding.severity]}
          </Badge>
        </span>
        {siteName && <span className="mt-0.5 block text-[0.6875rem] text-ink-3">{siteName}</span>}
      </span>
      <span className="shrink-0 text-end">
        <span className="block text-sm font-bold tabular text-brand">{money.value}</span>
        <span className="block text-[0.625rem] text-ink-3">{money.unit}</span>
      </span>
    </button>
  );
}

export function AlertRow({
  alert,
  onAcknowledge,
  showSite = true,
}: {
  alert: Alert;
  onAcknowledge?: () => void;
  showSite?: boolean;
}) {
  const { dict, locale } = useLocale();
  const pick = useLocalized();

  return (
    <div
      className={cn(
        "flex items-start gap-3.5 p-4 transition-colors duration-150",
        alert.acknowledged ? "opacity-60" : "hover:bg-surface-2",
      )}
    >
      <span
        className="mt-1.5 size-2 shrink-0 rounded-full"
        style={{
          background:
            alert.severity === "high"
              ? "var(--status-critical)"
              : alert.severity === "medium"
                ? "var(--status-warning)"
                : "var(--band-mid)",
        }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.8125rem] font-medium text-ink">{pick(alert, "title")}</span>
          <Badge tone={severityTone[alert.severity]}>{dict.app.alerts.kinds[alert.kind]}</Badge>
        </div>
        {showSite && (
          <div className="mt-0.5 text-[0.6875rem] text-ink-3">{pick(alert, "site_name")}</div>
        )}
        <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{pick(alert, "message")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-[0.625rem] text-ink-3">
            {formatRelative(alert.created_at, locale)}
          </span>
          {!alert.acknowledged && onAcknowledge && (
            <button
              onClick={onAcknowledge}
              className="text-[0.625rem] font-medium text-brand transition-opacity hover:opacity-75 active:scale-95"
            >
              {dict.app.alerts.acknowledge}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
