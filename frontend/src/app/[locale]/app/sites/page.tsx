"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";

import { EmptyState, PageHeader, SiteCard } from "@/components/app/pieces";
import { Input, Select } from "@/components/ui/field";
import { SkeletonCard } from "@/components/ui/skeleton";
import type { Site } from "@/lib/api";
import { useLocale, useLocalized } from "@/lib/locale-context";

const INDUSTRIES = ["steel", "cement", "ceramic", "plastic", "food", "pharma", "textile"] as const;

export default function SitesPage() {
  const { dict, href } = useLocale();
  const pick = useLocalized();
  const { data, isLoading } = useSWR<Site[]>("/api/v1/sites");

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [industry, setIndustry] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return data.filter((site) => {
      if (status && site.status !== status) return false;
      if (industry && site.industry !== industry) return false;
      if (!needle) return true;
      return [pick(site, "name"), pick(site, "province"), pick(site, "city")]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [data, query, status, industry, pick]);

  return (
    <>
      <PageHeader title={dict.app.sites.title} subtitle={dict.app.sites.subtitle} />

      {/* Filters sit in one row above the content, as a single control group. */}
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-ink-3" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={dict.common.searchPlaceholder}
            className="ps-10"
            aria-label={dict.common.search}
          />
        </div>
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="w-auto min-w-36"
          aria-label={dict.app.sites.filterStatus}
        >
          <option value="">{dict.app.sites.filterStatus}: {dict.common.all}</option>
          {(["active", "pilot", "onboarding"] as const).map((key) => (
            <option key={key} value={key}>
              {dict.app.sites.status[key]}
            </option>
          ))}
        </Select>
        <Select
          value={industry}
          onChange={(event) => setIndustry(event.target.value)}
          className="w-auto min-w-36"
          aria-label={dict.app.sites.filterIndustry}
        >
          <option value="">{dict.app.sites.filterIndustry}: {dict.common.all}</option>
          {INDUSTRIES.map((key) => (
            <option key={key} value={key}>
              {dict.industries.items[key]}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message={dict.app.sites.noResults} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((site) => (
            <SiteCard key={site.id} site={site} href={href(`/app/sites/${site.id}`)} />
          ))}
        </div>
      )}
    </>
  );
}
