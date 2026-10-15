"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  Eye,
  Inbox,
  RotateCw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { mutate as globalMutate, type KeyedMutator } from "swr";

import { Badge, severityTone, siteStatusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Meter, Sparkline } from "@/components/charts/gauge";
import type { Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { ApiError, apiFetch, type Alert, type Finding, type Site } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatNumber, formatPercent, formatRelative, listSeparator, splitToman } from "@/lib/format";
import { useLocale, useLocalized } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

// --- permissions, errors and optimistic mutations ----------------------------

const EDITOR_ROLES = new Set(["owner", "manager", "admin"]);

/**
 * Whether the signed-in user may change finding status and acknowledge alerts.
 * The API enforces this as well (403); the UI just avoids offering an action
 * that will be refused.
 */
export function useCanEdit(): boolean {
  const { user } = useAuth();
  return !!user && EDITOR_ROLES.has(user.role);
}

/** A sentence for a failed request, specific where the status says why. */
export function errorMessage(
  error: unknown,
  dict: Dictionary,
  locale: Locale,
  fallback: "load" | "save",
): string {
  const copy = dict.common.errors;
  if (error instanceof ApiError) {
    if (error.status === 403) return copy.forbidden;
    if (error.status === 404) return copy.notFound;
    if (error.status === 429) {
      return error.retryAfter
        ? copy.rateLimitedFor.replace("{seconds}", formatNumber(error.retryAfter, locale))
        : copy.rateLimited;
    }
  }
  return copy[fallback];
}

/** Refresh every cached response whose key starts with one of the prefixes. */
export function revalidate(prefixes: readonly string[]) {
  return globalMutate(
    (key) => typeof key === "string" && prefixes.some((prefix) => key.startsWith(prefix)),
  );
}

/**
 * Runs a change against a SWR list optimistically: it shows on the press, rolls
 * back if the server refuses it, and leaves a visible message on the item that
 * failed. Nothing fails silently.
 */
export function useOptimisticAction() {
  const { dict, locale } = useLocale();
  const [failure, setFailure] = useState<{ id: number; message: string } | null>(null);

  const run = useCallback(
    async <Data,>(
      id: number,
      mutate: KeyedMutator<Data>,
      request: () => Promise<unknown>,
      patch: (data: Data) => Data,
      refresh: readonly string[],
    ) => {
      setFailure(null);
      try {
        await mutate(
          async (current) => {
            await request();
            return current === undefined ? current : patch(current);
          },
          {
            optimisticData: (current) => (current === undefined ? current : patch(current)) as Data,
            rollbackOnError: true,
            // One refresh below covers this list and every other view of the data.
            revalidate: false,
          },
        );
      } catch (error) {
        setFailure({ id, message: errorMessage(error, dict, locale, "save") });
      } finally {
        void revalidate(refresh);
      }
    },
    [dict, locale],
  );

  return { run, failure };
}

/** Everything that shows an alert or the unread count. */
const ALERT_VIEWS = ["/api/v1/alerts", "/api/v1/dashboard"] as const;

export function markAcknowledged(alerts: Alert[], id: number): Alert[] {
  return alerts.map((alert) => (alert.id === id ? { ...alert, acknowledged: true } : alert));
}

/**
 * Acknowledge alerts held in any SWR entry. `acknowledge` is undefined for
 * roles that may not acknowledge, so rows simply do not offer the action.
 */
export function useAcknowledgeAlert<Data>(
  mutate: KeyedMutator<Data>,
  patch: (data: Data, id: number) => Data,
) {
  const canEdit = useCanEdit();
  const { run, failure } = useOptimisticAction();
  const acknowledge = (id: number) =>
    run(
      id,
      mutate,
      () => apiFetch(`/api/v1/alerts/${id}/acknowledge`, { method: "POST" }),
      (data) => patch(data, id),
      ALERT_VIEWS,
    );
  return { acknowledge: canEdit ? acknowledge : undefined, failure, canEdit };
}

// --- presentational pieces -------------------------------------------------------

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
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">
      <Icon className="size-6 text-ink-3" />
      <p className="mt-3 text-sm text-ink-3">{message}</p>
    </div>
  );
}

/** A failed load: says what happened and offers a retry, never an endless skeleton. */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => Promise<unknown> | void;
  className?: string;
}) {
  const { dict, locale } = useLocale();
  const [retrying, setRetrying] = useState(false);

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-critical/40 px-6 py-14 text-center",
        className,
      )}
    >
      <TriangleAlert className="size-6 text-critical" />
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-2">
        {errorMessage(error, dict, locale, "load")}
      </p>
      {onRetry && (
        <Button
          size="sm"
          variant="secondary"
          className="mt-4"
          loading={retrying}
          onClick={async () => {
            setRetrying(true);
            try {
              await onRetry();
            } finally {
              setRetrying(false);
            }
          }}
        >
          {!retrying && <RotateCw className="size-3.5" />}
          {dict.common.retry}
        </Button>
      )}
    </div>
  );
}

/** A failed change, shown on the item it belongs to. */
export function InlineError({ message, className }: { message: string; className?: string }) {
  return (
    <p role="alert" className={cn("flex items-start gap-1.5 text-xs leading-relaxed text-critical", className)}>
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
      {message}
    </p>
  );
}

/** Why an action is missing, for roles that can only view. */
export function ViewOnlyNote({ className }: { className?: string }) {
  const { dict } = useLocale();
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-md border border-line bg-surface-2 p-3 text-xs leading-relaxed text-ink-2",
        className,
      )}
    >
      <Eye className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
      {dict.app.viewOnly}
    </p>
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
          {deltaGood ? (
            <ArrowDownRight className="size-3 rtl:-scale-x-100" />
          ) : (
            <ArrowUpRight className="size-3 rtl:-scale-x-100" />
          )}
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
      <Card className="h-full p-5 transition-[transform,box-shadow,border-color] duration-250 ease-[var(--ease-out)] group-hover:-translate-y-0.5 group-hover:border-brand/30 group-hover:shadow-[var(--shadow-md)] group-active:scale-[0.99] group-active:duration-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-ink">{pick(site, "name")}</h3>
            <p className="mt-0.5 truncate text-[0.6875rem] text-ink-3">
              {pick(site, "city")}
              {listSeparator(locale)}
              {pick(site, "province")} ·{" "}
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
  href,
  siteName,
}: {
  finding: Finding;
  onOpen?: () => void;
  href?: string;
  siteName?: string;
}) {
  const { dict, locale } = useLocale();
  const pick = useLocalized();
  const money = splitToman(finding.annual_saving, locale, dict.common);

  const body = (
    <>
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
    </>
  );

  // The press colour lands instantly (duration-0 while active) and eases out.
  const interactive =
    "flex w-full items-start gap-3.5 p-4 text-start transition-colors duration-150 hover:bg-surface-2 active:bg-surface-3 active:duration-0";
  if (href) {
    return (
      <Link href={href} className={interactive}>
        {body}
      </Link>
    );
  }
  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} className={interactive}>
        {body}
      </button>
    );
  }
  return <div className="flex w-full items-start gap-3.5 p-4">{body}</div>;
}

export function AlertRow({
  alert,
  onAcknowledge,
  showSite = true,
  error,
}: {
  alert: Alert;
  /** Omitted for roles that may not acknowledge. */
  onAcknowledge?: () => void;
  showSite?: boolean;
  /** Why the last acknowledge of this alert failed, if it did. */
  error?: string;
}) {
  const { dict, locale } = useLocale();
  const pick = useLocalized();

  return (
    <div
      className={cn(
        "flex items-start gap-3.5 p-4 transition-[opacity,background-color] duration-200",
        alert.acknowledged ? "opacity-70" : "hover:bg-surface-2",
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
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-[0.625rem] text-ink-3">
            {formatRelative(alert.created_at, locale)}
          </span>
          {!alert.acknowledged && onAcknowledge && (
            <button
              type="button"
              onClick={onAcknowledge}
              className="tap-target rounded-xs text-xs font-medium text-brand transition-opacity duration-150 hover:opacity-75 active:opacity-50 active:duration-0"
            >
              {dict.app.alerts.acknowledge}
            </button>
          )}
          {alert.acknowledged && (
            <span className="inline-flex items-center gap-1 text-xs text-ink-3">
              <Check className="size-3.5" />
              {dict.app.alerts.acknowledged}
            </span>
          )}
        </div>
        {error && <InlineError message={error} className="mt-2" />}
      </div>
    </div>
  );
}
