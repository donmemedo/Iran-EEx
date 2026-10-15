"use client";

import { Lightbulb, Sparkles, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import {
  EmptyState,
  ErrorState,
  InlineError,
  PageHeader,
  useCanEdit,
  useOptimisticAction,
  ViewOnlyNote,
} from "@/components/app/pieces";
import { Badge, findingStatusTone, severityTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, type Finding, type FindingStatus, type Site } from "@/lib/api";
import { formatNumber, formatPercent, splitToman } from "@/lib/format";
import { useLocale, useLocalized } from "@/lib/locale-context";

export default function FindingsPage() {
  const { dict, locale, href } = useLocale();
  const pick = useLocalized();
  const [status, setStatus] = useState<"open" | "in_progress" | "done">("open");
  const [severity, setSeverity] = useState<"" | "high" | "medium" | "low">("");

  const query = `/api/v1/findings?status=${status}${severity ? `&severity=${severity}` : ""}&limit=200`;
  const { data: findings, error, isLoading, mutate } = useSWR<Finding[]>(query);
  const { data: sites } = useSWR<Site[]>("/api/v1/sites");
  const siteById = new Map((sites ?? []).map((site) => [site.id, site]));
  const canEdit = useCanEdit();
  const { run, failure } = useOptimisticAction();

  const total = (findings ?? []).reduce((sum, finding) => sum + finding.annual_saving, 0);
  const totalMoney = splitToman(total, locale, dict.common);

  // The card leaves this filtered list on the press; it comes back with an
  // inline error if the server refuses the change.
  function setFindingStatus(id: number, next: FindingStatus) {
    void run(
      id,
      mutate,
      () => apiFetch(`/api/v1/findings/${id}?status=${next}`, { method: "PATCH" }),
      (list) =>
        list
          .map((finding) => (finding.id === id ? { ...finding, status: next } : finding))
          .filter((finding) => finding.status === status),
      ["/api/v1/findings", "/api/v1/dashboard", "/api/v1/sites"],
    );
  }

  return (
    <>
      <PageHeader
        title={dict.app.findings.title}
        subtitle={dict.app.findings.subtitle}
        action={
          <div className="text-end">
            <div className="text-xl font-bold tabular text-brand">
              {totalMoney.value}
              <span className="ms-1 text-xs font-normal text-ink-3">{totalMoney.unit}</span>
            </div>
            <div className="text-[0.625rem] text-ink-3">{dict.common.perYear}</div>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap gap-3">
        <Segmented
          label={dict.app.findings.filterStatus}
          value={status}
          onChange={setStatus}
          options={[
            { value: "open", label: dict.app.findings.status.open },
            { value: "in_progress", label: dict.app.findings.status.in_progress },
            { value: "done", label: dict.app.findings.status.done },
          ]}
        />
        <Segmented
          label={dict.app.findings.filterSeverity}
          value={severity}
          onChange={setSeverity}
          options={[
            { value: "", label: dict.common.all },
            { value: "high", label: dict.app.findings.severity.high },
            { value: "medium", label: dict.app.findings.severity.medium },
          ]}
        />
      </div>

      {!canEdit && <ViewOnlyNote className="mb-4" />}

      {error && !findings ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : !findings || findings.length === 0 ? (
        <EmptyState message={dict.app.findings.noFindings} icon={Sparkles} />
      ) : (
        <div className="space-y-4">
          {findings.map((finding) => {
            const site = siteById.get(finding.site_id);
            const saving = splitToman(finding.annual_saving, locale, dict.common);
            const investment = splitToman(finding.investment, locale, dict.common);

            return (
              <Card key={finding.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink">{pick(finding, "title")}</h3>
                      <Badge tone={severityTone[finding.severity]}>
                        {dict.app.findings.severity[finding.severity]}
                      </Badge>
                      <Badge tone={findingStatusTone[finding.status]}>
                        {dict.app.findings.status[finding.status]}
                      </Badge>
                    </div>

                    {site && (
                      <Link
                        href={href(`/app/sites/${site.id}`)}
                        className="tap-target mt-1 inline-block rounded-xs text-[0.6875rem] text-ink-3 hover:text-brand"
                      >
                        {pick(site, "name")} · {pick(site, "province")}
                      </Link>
                    )}

                    <p className="mt-2.5 max-w-3xl text-xs leading-relaxed text-ink-2">
                      {pick(finding, "detail")}
                    </p>

                    <div className="mt-3.5 rounded-md border border-line bg-surface-2 p-3.5">
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
                  </div>

                  <div className="shrink-0 text-end">
                    <div className="flex items-center justify-end gap-1.5 text-brand">
                      <TrendingDown className="size-4 rtl:-scale-x-100" />
                      <span className="text-xl font-bold tabular">{saving.value}</span>
                    </div>
                    <div className="text-[0.625rem] text-ink-3">
                      {saving.unit} {dict.common.perYear}
                    </div>

                    <dl className="mt-3 space-y-1 text-[0.625rem]">
                      {finding.investment > 0 && (
                        <div className="flex justify-end gap-1.5">
                          <dt className="text-ink-3">{dict.app.findings.investment}</dt>
                          <dd className="font-medium tabular text-ink-2">
                            {investment.value} {investment.unit}
                          </dd>
                        </div>
                      )}
                      {finding.payback_months && (
                        <div className="flex justify-end gap-1.5">
                          <dt className="text-ink-3">{dict.app.findings.payback}</dt>
                          <dd className="font-medium tabular text-ink-2">
                            {formatNumber(finding.payback_months, locale, { maximumFractionDigits: 1 })}{" "}
                            {dict.calculator.months}
                          </dd>
                        </div>
                      )}
                      <div className="flex justify-end gap-1.5">
                        <dt className="text-ink-3">{dict.app.findings.confidence}</dt>
                        <dd className="font-medium tabular text-ink-2">
                          {formatPercent(finding.confidence * 100, locale)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                {failure?.id === finding.id && <InlineError message={failure.message} className="mt-4" />}

                {canEdit && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                    {finding.status !== "in_progress" && finding.status !== "done" && (
                      <Button size="sm" variant="secondary" onClick={() => setFindingStatus(finding.id, "in_progress")}>
                        {dict.app.findings.markInProgress}
                      </Button>
                    )}
                    {finding.status !== "done" && (
                      <Button size="sm" onClick={() => setFindingStatus(finding.id, "done")}>
                        {dict.app.findings.markDone}
                      </Button>
                    )}
                    {finding.status === "done" && (
                      <Button size="sm" variant="secondary" onClick={() => setFindingStatus(finding.id, "open")}>
                        {dict.app.findings.reopen}
                      </Button>
                    )}
                    {finding.status === "open" && (
                      <Button size="sm" variant="ghost" onClick={() => setFindingStatus(finding.id, "dismissed")}>
                        {dict.app.findings.dismiss}
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
