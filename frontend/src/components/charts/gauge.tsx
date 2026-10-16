"use client";

import { useLocale } from "@/lib/locale-context";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Power factor gauge. The 0.90 regulatory floor is drawn as a hard tick, and
 * the reading's status is carried by an icon-and-label badge beside the gauge,
 * not by the arc colour alone.
 */
export function PowerFactorGauge({
  value,
  threshold = 0.9,
  size = 120,
  className,
  label,
}: {
  value: number;
  threshold?: number;
  size?: number;
  className?: string;
  label?: string;
}) {
  const { locale } = useLocale();
  const min = 0.6;
  const max = 1;
  const clamped = Math.min(max, Math.max(min, value));
  const fraction = (clamped - min) / (max - min);
  const thresholdFraction = (threshold - min) / (max - min);

  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  // A three-quarter arc leaves room for the reading underneath.
  const sweep = 0.72;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * sweep;
  const below = value < threshold;

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size * 0.78 }}>
      {/* The reading below is the text alternative; the arc only illustrates it. */}
      <svg
        width={size}
        height={size}
        aria-hidden
        className="absolute inset-x-0 top-0"
        style={{ transform: "rotate(133deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={below ? "var(--status-critical)" : "var(--status-good)"}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength * fraction} ${circumference}`}
          strokeLinecap="round"
          className="transition-[stroke-dasharray] duration-500 ease-[var(--ease-out)]"
        />
        {/* The regulatory floor, marked on the arc. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--ink-3)"
          strokeWidth={strokeWidth + 4}
          strokeDasharray={`2 ${circumference}`}
          strokeDashoffset={-arcLength * thresholdFraction}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="text-xl font-semibold tabular text-ink">
          {formatNumber(value, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        {label && <span className="mt-0.5 text-[0.625rem] text-ink-3">{label}</span>}
      </div>
    </div>
  );
}

/** A compact inline trend line, no axes - it shows shape, not values. */
export function Sparkline({
  values,
  width = 88,
  height = 28,
  color = "var(--brand)",
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((value, index) => ({
    x: index * step,
    y: height - 2 - ((value - min) / span) * (height - 4),
  }));
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2.5} fill={color} />
    </svg>
  );
}

/**
 * A horizontal meter for a bounded ratio, such as load against capacity. It
 * always sits beside the number it illustrates, so it is hidden from assistive
 * technology rather than read out twice.
 */
export function Meter({
  value,
  max = 100,
  tone = "brand",
  className,
  markers = [],
}: {
  value: number;
  max?: number;
  tone?: "brand" | "critical" | "warning" | "good";
  className?: string;
  markers?: { value: number; label?: string }[];
}) {
  const fraction = Math.min(1, Math.max(0, value / max));
  const colors = {
    brand: "var(--brand)",
    critical: "var(--status-critical)",
    warning: "var(--status-warning)",
    good: "var(--status-good)",
  };
  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)} aria-hidden>
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out)]"
        style={{ width: `${fraction * 100}%`, background: colors[tone] }}
      />
      {markers.map((marker) => (
        <span
          key={marker.value}
          title={marker.label}
          className="absolute top-0 h-full w-0.5 bg-[var(--ink-3)]"
          style={{ insetInlineStart: `${Math.min(100, (marker.value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
