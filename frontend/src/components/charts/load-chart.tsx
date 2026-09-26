"use client";

import { useMemo, useState } from "react";

import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

import {
  areaPath,
  bandColor,
  defaultPadding,
  linearScale,
  nearestIndex,
  niceTicks,
  smoothPath,
} from "./chart-utils";
import { useMeasure } from "./use-measure";

export interface LoadPoint {
  ts: string;
  value: number;
  band?: string;
  anomaly?: boolean;
}

export interface ReferenceLine {
  value: number;
  label: string;
  tone?: "critical" | "neutral";
}

/**
 * The load profile: a single-series area chart with tariff-band shading behind
 * it and a crosshair readout. One series means no legend box - the card title
 * names it - but the band strip underneath does carry a legend, because it is
 * three categories.
 */
export function LoadChart({
  points,
  height = 260,
  referenceLines = [],
  formatValue,
  formatAxisValue,
  formatLabel,
  unit,
  className,
  showBandStrip = true,
}: {
  points: LoadPoint[];
  height?: number;
  referenceLines?: ReferenceLine[];
  formatValue: (value: number) => string;
  formatAxisValue: (value: number) => string;
  formatLabel: (ts: string) => string;
  unit?: string;
  className?: string;
  showBandStrip?: boolean;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const { dict, dir } = useLocale();
  const [hover, setHover] = useState<number | null>(null);

  // The value axis lives on the reading-start side, so the gutter mirrors with
  // direction instead of leaving dead space on one edge.
  const gutter = 44;
  const padding = {
    top: defaultPadding.top,
    bottom: showBandStrip ? 34 : 24,
    left: dir === "rtl" ? 12 : gutter,
    right: dir === "rtl" ? gutter : 12,
  };
  const stripHeight = showBandStrip ? 6 : 0;
  const plotWidth = Math.max(0, width - padding.left - padding.right);
  const plotHeight = Math.max(0, height - padding.top - padding.bottom);

  const geometry = useMemo(() => {
    if (points.length === 0 || plotWidth <= 0) return null;
    const maxValue = Math.max(...points.map((p) => p.value), ...referenceLines.map((r) => r.value));
    const { max, ticks } = niceTicks(maxValue * 1.08, 4);
    const x = linearScale([0, Math.max(points.length - 1, 1)], [padding.left, padding.left + plotWidth]);
    const y = linearScale([0, max], [padding.top + plotHeight, padding.top]);
    const coords = points.map((point, index) => ({ x: x(index), y: y(point.value) }));
    return { x, y, coords, ticks, max, xs: coords.map((c) => c.x) };
  }, [points, plotWidth, plotHeight, padding.left, padding.top, referenceLines]);

  if (points.length === 0) {
    return (
      <div
        ref={ref}
        className={cn("flex items-center justify-center text-sm text-ink-3", className)}
        style={{ height }}
      >
        {dict.chart.noData}
      </div>
    );
  }

  const active = hover !== null ? points[hover] : null;
  const activeCoord = hover !== null && geometry ? geometry.coords[hover] : null;

  // Contiguous runs of the same band, drawn as one strip segment each.
  const bandRuns: { band: string; from: number; to: number }[] = [];
  if (showBandStrip) {
    points.forEach((point, index) => {
      const band = point.band ?? "mid_peak";
      const last = bandRuns[bandRuns.length - 1];
      if (last && last.band === band) last.to = index;
      else bandRuns.push({ band, from: index, to: index });
    });
  }

  const tooltipOnRight = activeCoord ? activeCoord.x < padding.left + plotWidth / 2 : true;

  return (
    <div ref={ref} className={cn("relative", className)} style={{ height }}>
      {width > 0 && geometry && (
        <>
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={dict.app.dashboard.portfolioLoad}
            className="overflow-visible"
          >
            <defs>
              <linearGradient id="load-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.26" />
                <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Gridlines stay recessive - they orient, they don't compete. */}
            {geometry.ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={padding.left}
                  x2={padding.left + plotWidth}
                  y1={geometry.y(tick)}
                  y2={geometry.y(tick)}
                  stroke="var(--grid)"
                  strokeWidth={1}
                />
                <text
                  x={dir === "rtl" ? padding.left + plotWidth + 10 : padding.left - 10}
                  y={geometry.y(tick)}
                  dy="0.32em"
                  textAnchor={dir === "rtl" ? "start" : "end"}
                  className="fill-[var(--ink-3)] text-[0.625rem] tabular"
                >
                  {formatAxisValue(tick)}
                </text>
              </g>
            ))}

            {referenceLines.map((line) => (
              <g key={line.label}>
                <line
                  x1={padding.left}
                  x2={padding.left + plotWidth}
                  y1={geometry.y(line.value)}
                  y2={geometry.y(line.value)}
                  stroke={line.tone === "critical" ? "var(--status-critical)" : "var(--axis)"}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  opacity={0.75}
                />
                {/* The label hugs the reading-start edge, so it never runs off
                    the plot in either direction. */}
                <text
                  x={dir === "rtl" ? padding.left + plotWidth - 6 : padding.left + 6}
                  y={geometry.y(line.value) - 6}
                  textAnchor={dir === "rtl" ? "end" : "start"}
                  className="fill-[var(--ink-3)] text-[0.625rem] font-medium"
                >
                  {line.label}
                </text>
              </g>
            ))}

            <path d={areaPath(geometry.coords, padding.top + plotHeight)} fill="url(#load-fill)" />
            <path
              d={smoothPath(geometry.coords)}
              fill="none"
              stroke="var(--brand)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Anomalies are marked, not just coloured - a ring plus a label in
                the tooltip, so the cue survives greyscale. */}
            {points.map((point, index) =>
              point.anomaly ? (
                <circle
                  key={`anomaly-${point.ts}`}
                  cx={geometry.coords[index].x}
                  cy={geometry.coords[index].y}
                  r={4}
                  fill="var(--surface)"
                  stroke="var(--status-serious)"
                  strokeWidth={2}
                />
              ) : null,
            )}

            {showBandStrip &&
              bandRuns.map((run) => {
                const x1 = geometry.x(run.from);
                const x2 = geometry.x(run.to);
                return (
                  <rect
                    key={`${run.band}-${run.from}`}
                    x={x1}
                    // A 2px gap keeps adjacent segments from reading as one block.
                    width={Math.max(1, x2 - x1 - 2)}
                    y={padding.top + plotHeight + 12}
                    height={stripHeight}
                    rx={stripHeight / 2}
                    fill={bandColor[run.band]}
                    opacity={0.85}
                  />
                );
              })}

            {activeCoord && (
              <g>
                <line
                  x1={activeCoord.x}
                  x2={activeCoord.x}
                  y1={padding.top}
                  y2={padding.top + plotHeight}
                  stroke="var(--axis)"
                  strokeWidth={1}
                />
                {/* A surface-coloured ring separates the marker from the line. */}
                <circle cx={activeCoord.x} cy={activeCoord.y} r={6} fill="var(--surface)" />
                <circle cx={activeCoord.x} cy={activeCoord.y} r={4.5} fill="var(--brand)" />
              </g>
            )}

            <rect
              x={padding.left}
              y={padding.top}
              width={plotWidth}
              height={plotHeight + 16}
              fill="transparent"
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const x = event.clientX - rect.left + padding.left;
                setHover(nearestIndex(geometry.xs, x));
              }}
              onPointerLeave={() => setHover(null)}
              style={{ touchAction: "pan-y" }}
            />
          </svg>

          {active && activeCoord && (
            <div
              className="pointer-events-none absolute z-10 min-w-32 rounded-[--radius-md] border border-line bg-glass glass px-3 py-2 shadow-[var(--shadow-md)]"
              style={{
                left: tooltipOnRight ? activeCoord.x + 12 : undefined,
                right: tooltipOnRight ? undefined : width - activeCoord.x + 12,
                top: Math.max(4, activeCoord.y - 52),
              }}
            >
              <div className="text-[0.625rem] text-ink-3">{formatLabel(active.ts)}</div>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className="text-sm font-semibold tabular text-ink">
                  {formatValue(active.value)}
                </span>
                {unit && <span className="text-[0.625rem] text-ink-3">{unit}</span>}
              </div>
              {active.band && (
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: bandColor[active.band] }}
                    aria-hidden
                  />
                  <span className="text-[0.625rem] text-ink-2">
                    {dict.bands[active.band as keyof typeof dict.bands]}
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The legend for the tariff-band strip. */
export function BandLegend({ className }: { className?: string }) {
  const { dict } = useLocale();
  const items = [
    { key: "peak", hours: dict.bands.peakHours },
    { key: "mid_peak", hours: dict.bands.midHours },
    { key: "off_peak", hours: dict.bands.offHours },
  ] as const;

  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5 text-[0.6875rem] text-ink-2">
          <span
            className="size-2.5 rounded-full"
            style={{ background: bandColor[item.key] }}
            aria-hidden
          />
          <span>{dict.bands[item.key]}</span>
          <span className="text-ink-3 tabular">{item.hours}</span>
        </li>
      ))}
    </ul>
  );
}
