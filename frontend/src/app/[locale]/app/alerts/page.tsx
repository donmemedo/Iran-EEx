"use client";

import { Bell } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { AlertRow, EmptyState, PageHeader } from "@/components/app/pieces";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, type Alert } from "@/lib/api";
import { useLocale } from "@/lib/locale-context";

export default function AlertsPage() {
  const { dict } = useLocale();
  const [filter, setFilter] = useState<"all" | "unack">("unack");

  const query =
    filter === "unack" ? "/api/v1/alerts?acknowledged=false&limit=200" : "/api/v1/alerts?limit=200";
  const { data: alerts, isLoading, mutate } = useSWR<Alert[]>(query);

  async function acknowledge(id: number) {
    await apiFetch(`/api/v1/alerts/${id}/acknowledge`, { method: "POST" });
    void mutate();
  }

  return (
    <>
      <PageHeader
        title={dict.app.alerts.title}
        subtitle={dict.app.alerts.subtitle}
        action={
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "unack", label: dict.app.alerts.unacknowledged },
              { value: "all", label: dict.common.all },
            ]}
          />
        }
      />

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : !alerts || alerts.length === 0 ? (
        <EmptyState message={dict.app.alerts.noAlerts} icon={Bell} />
      ) : (
        <Card className="divide-y divide-[var(--line)] overflow-hidden">
          {alerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} onAcknowledge={() => acknowledge(alert.id)} />
          ))}
        </Card>
      )}
    </>
  );
}
