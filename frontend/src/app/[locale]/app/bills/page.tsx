"use client";

import Link from "next/link";
import useSWR from "swr";

import { EmptyState, ErrorState, PageHeader } from "@/components/app/pieces";
import { Badge, billStatusTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Bill, Site } from "@/lib/api";
import { formatEnergy, formatNumber, splitToman } from "@/lib/format";
import { useLocale, useLocalized } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

export default function BillsPage() {
  const { dict, locale, href } = useLocale();
  const pick = useLocalized();
  const { data: bills, error, isLoading, mutate } = useSWR<Bill[]>("/api/v1/bills?limit=120");
  const { data: sites } = useSWR<Site[]>("/api/v1/sites");

  const siteById = new Map((sites ?? []).map((site) => [site.id, site]));

  return (
    <>
      <PageHeader title={dict.app.bills.title} subtitle={dict.app.bills.subtitle} />

      {error && !bills ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : !bills || bills.length === 0 ? (
        <EmptyState message={dict.app.bills.noBills} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-start text-xs">
              <thead>
                <tr className="border-b border-line text-ink-3">
                  <th className="p-4 text-start font-medium">{dict.app.bills.period}</th>
                  <th className="p-4 text-start font-medium">{dict.app.bills.site}</th>
                  <th className="p-4 text-start font-medium">{dict.app.bills.energy}</th>
                  <th className="p-4 text-start font-medium">{dict.app.bills.billed}</th>
                  <th className="p-4 text-start font-medium">{dict.app.bills.difference}</th>
                  <th className="p-4 text-start font-medium">{dict.app.bills.findings}</th>
                  <th className="p-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {bills.map((bill) => {
                  const site = siteById.get(bill.site_id);
                  const money = splitToman(bill.billed_total, locale, dict.common);
                  const delta = bill.billed_total - bill.recomputed_total;
                  const deltaMoney = splitToman(Math.abs(delta), locale, dict.common);
                  const kwh = formatEnergy(bill.total_kwh, locale);
                  const material = Math.abs(delta) / Math.max(bill.recomputed_total, 1) > 0.01;

                  return (
                    <tr key={bill.id} className="transition-colors hover:bg-surface-2">
                      <td className="p-4 font-medium whitespace-nowrap text-ink">
                        {pick(bill, "period_label")}
                      </td>
                      <td className="p-4 text-ink-2">
                        {site ? (
                          <Link
                            href={href(`/app/sites/${site.id}`)}
                            className="tap-target rounded-xs hover:text-brand"
                          >
                            {pick(site, "name")}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-4 tabular whitespace-nowrap text-ink-2">
                        {kwh.value} {kwh.unit}
                      </td>
                      <td className="p-4 tabular whitespace-nowrap font-medium text-ink">
                        {money.value} <span className="text-[0.625rem] text-ink-3">{money.unit}</span>
                      </td>
                      <td
                        className={cn(
                          "p-4 tabular whitespace-nowrap",
                          material ? "font-medium text-critical" : "text-ink-3",
                        )}
                      >
                        {material ? `${delta > 0 ? "+" : "−"}${deltaMoney.value} ${deltaMoney.unit}` : "—"}
                      </td>
                      <td className="p-4">
                        <Badge tone={billStatusTone[bill.status]} className="tabular">
                          {dict.app.bills.status[bill.status]} · {formatNumber(bill.finding_count, locale)}
                        </Badge>
                      </td>
                      <td className="p-4 text-end whitespace-nowrap">
                        <Link
                          href={href(`/app/bills/${bill.id}`)}
                          className="tap-target rounded-xs font-medium text-brand hover:opacity-75"
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
      )}
    </>
  );
}
