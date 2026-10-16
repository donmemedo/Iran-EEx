"use client";

import { useMemo, useState } from "react";

import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

import { linearScale, niceTicks } from "./chart-utils";
import { useMeasure } from "./use-measure";

export interface BarPoint {
  key: string;
  label: string;
  value: number;
  muted?: boolean;
}

/**
 * A column chart for month-over-month values. Bars carry 4px rounded ends at
 * the data end only, anchored to the baseline, and sit on a 2px gap from their
 * neighbours. As with LoadChart, a visually hidden table is the text
 * alternative and the SVG itself is hidden from assistive technology.
 */
export function BarSeries({
  points,
  label,
  height = 200,
  formatValue,
  formatAxisValue,
  className,
  color = "var(--brand)",
  mutedLabel,
}: {
  points: BarPoint[];
  /** What the chart shows; captions the accessible data table. */
  label?: string;
  height?: number;
  formatValue: (value: number) => string;
  formatAxisValue: (value: number) => string;
  className?: string;
  color?: string;
  mutedLabel?: string;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const { dict, dir } = useLocale();
  const [active, setActive] = useState<number | null>(null);

  const gutter = 46;
  const padding = {
    top: 12,
    bottom: 26,
    left: dir === "rtl" ? 8 : gutter,
    right: dir === "rtl" ? gutter : 8,
  };
  const plotWidth = Math.max(0, width - padding.left - padding.right);
  const plotHeight = Math.max(0, height - padding.top - padding.bottom);

  // Scales and bar outlines change with the data and size, not with hover.
  const geometry = useMemo(() => {
    const maxValue = Math.max(...points.map((p) => p.value), 1);
    const { max, ticks } = niceTicks(maxValue * 1.1, 3);
    const y = linearScale([0, max], [padding.top + plotHeight, padding.top]);
    const slot = points.length ? plotWidth / points.length : 0;
    const barWidth = Math.max(6, Math.min(34, slot - 8));
    const bars = points.map((point, index) => {
      const x = padding.left + slot * index + (slot - barWidth) / 2;
      const top = y(point.value);
      const barHeight = Math.max(2, padding.top + plotHeight - top);
      const radius = Math.min(4, barHeight / 2, barWidth / 2);
      // Rounded corners on the data end only; the baseline end stays square.
      return `M${x},${top + barHeight} L${x},${top + radius} Q${x},${top} ${x + radius},${top} L${x + barWidth - radius},${top} Q${x + barWidth},${top} ${x + barWidth},${top + radius} L${x + barWidth},${top + barHeight} Z`;
    });
    return { ticks, y, slot, bars };
  }, [points, plotWidth, plotHeight, padding.left, padding.top]);

  if (points.length === 0) {
    return (
      <div className={cn("flex items-center justify-center text-sm text-ink-3", className)} style={{ height }}>
        {dict.chart.noData}
      </div>
    );
  }

  const { ticks, y, slot, bars } = geometry;
  const activePoint = active !== null ? points[active] : null;

  return (
    <div ref={ref} className={cn("relative", className)} style={{ height }}>
      <table className="sr-only">
        {label && <caption>{label}</caption>}
        <thead>
          <tr>
            <th scope="col">{dict.chart.time}</th>
            <th scope="col">{dict.chart.value}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.key}>
              <th scope="row">{point.label}</th>
              <td>
                {formatValue(point.value)}
                {point.muted && mutedLabel && ` (${mutedLabel})`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {width > 0 && (
        <>
          {/* Absolute, so the measured width never props the container open. */}
          <svg width={width} height={height} aria-hidden className="absolute inset-0 overflow-visible">
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={padding.left}
                  x2={padding.left + plotWidth}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="var(--grid)"
                  strokeWidth={1}
                />
                <text
                  x={dir === "rtl" ? padding.left + plotWidth + 10 : padding.left - 10}
                  y={y(tick)}
                  dy="0.32em"
                  textAnchor={dir === "rtl" ? "start" : "end"}
                  className="fill-[var(--ink-3)] text-[0.625rem] tabular"
                >
                  {formatAxisValue(tick)}
                </text>
              </g>
            ))}

            {points.map((point, index) => (
              <g key={point.key}>
                <path
                  d={bars[index]}
                  fill={point.muted ? "var(--surface-3)" : color}
                  opacity={active !== null && active !== index ? 0.45 : 1}
                  className="transition-opacity duration-150 ease-[var(--ease-out)]"
                />
                <rect
                  x={padding.left + slot * index}
                  y={padding.top}
                  width={slot}
                  height={plotHeight}
                  fill="transparent"
                  onPointerEnter={() => setActive(index)}
                  onPointerLeave={() => setActive(null)}
                />
              </g>
            ))}

            <line
              x1={padding.left}
              x2={padding.left + plotWidth}
              y1={padding.top + plotHeight}
              y2={padding.top + plotHeight}
              stroke="var(--axis)"
              strokeWidth={1}
            />

            {points.map((point, index) => {
              // Label every other column when they would otherwise collide.
              const step = slot < 34 ? Math.ceil(34 / slot) : 1;
              if (index % step !== 0) return null;
              return (
                <text
                  key={`label-${point.key}`}
                  x={padding.left + slot * index + slot / 2}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-[var(--ink-3)] text-[0.625rem]"
                >
                  {point.label}
                </text>
              );
            })}
          </svg>

          {activePoint && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-line bg-glass glass px-2.5 py-1.5 shadow-[var(--shadow-md)]"
              style={{
                left: padding.left + slot * (active ?? 0) + slot / 2,
                top: Math.max(0, y(activePoint.value) - 46),
              }}
            >
              <div className="whitespace-nowrap text-[0.625rem] text-ink-3">{activePoint.label}</div>
              <div className="whitespace-nowrap text-xs font-semibold tabular text-ink">
                {formatValue(activePoint.value)}
              </div>
              {activePoint.muted && mutedLabel && (
                <div className="whitespace-nowrap text-[0.625rem] text-ink-3">{mutedLabel}</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
