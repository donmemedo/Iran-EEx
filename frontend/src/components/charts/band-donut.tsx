"use client";

import { useState } from "react";

import { useLocale } from "@/lib/locale-context";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

import { bandColor } from "./chart-utils";

interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Consumption split by tariff band. Three categories, so the legend is always
 * present and every slice is also directly labelled with its share - identity
 * never rests on colour alone.
 */
export function BandDonut({
  data,
  size = 168,
  thickness = 22,
  centerLabel,
  centerValue,
  className,
  formatValue,
}: {
  data: Record<string, number>;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  className?: string;
  formatValue?: (value: number) => string;
}) {
  const { dict, locale } = useLocale();
  const [active, setActive] = useState<string | null>(null);

  const slices: Slice[] = (["peak", "mid_peak", "off_peak"] as const)
    .map((key) => ({
      key,
      label: dict.bands[key],
      value: data[key] ?? 0,
      color: bandColor[key],
    }))
    .filter((slice) => slice.value > 0);

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) {
    return <div className={cn("text-sm text-ink-3", className)}>{dict.chart.noData}</div>;
  }

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  // A 2px gap between segments so neighbouring fills stay separable.
  const gap = 3;

  let offset = 0;
  const arcs = slices.map((slice) => {
    const fraction = slice.value / total;
    const length = Math.max(circumference * fraction - gap, 1);
    const arc = {
      ...slice,
      fraction,
      dasharray: `${length} ${circumference - length}`,
      dashoffset: -offset,
    };
    offset += circumference * fraction;
    return arc;
  });

  return (
    <div className={cn("flex flex-wrap items-center gap-6", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--surface-2)"
            strokeWidth={thickness}
          />
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={active === arc.key ? thickness + 4 : thickness}
              strokeDasharray={arc.dasharray}
              strokeDashoffset={arc.dashoffset}
              strokeLinecap="butt"
              className="transition-[stroke-width,opacity] duration-150 ease-[var(--ease-out)]"
              opacity={active && active !== arc.key ? 0.4 : 1}
              onPointerEnter={() => setActive(arc.key)}
              onPointerLeave={() => setActive(null)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-lg font-semibold tabular text-ink">{centerValue}</span>
          {centerLabel && <span className="mt-0.5 text-[0.625rem] text-ink-3">{centerLabel}</span>}
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-2.5">
        {arcs.map((arc) => (
          <li
            key={arc.key}
            className="flex items-center gap-2.5"
            onPointerEnter={() => setActive(arc.key)}
            onPointerLeave={() => setActive(null)}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: arc.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-xs text-ink-2">{arc.label}</span>
            <span className="shrink-0 text-xs font-semibold tabular text-ink">
              {formatPercent(arc.fraction * 100, locale)}
            </span>
            {formatValue && (
              <span className="shrink-0 text-[0.625rem] tabular text-ink-3">
                {formatValue(arc.value)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
