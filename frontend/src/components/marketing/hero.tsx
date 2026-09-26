"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, PlayCircle, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { BandLegend } from "@/components/charts/load-chart";
import { bandColor, linearScale, smoothPath, areaPath } from "@/components/charts/chart-utils";
import { ButtonLink } from "@/components/ui/button";
import { formatNumber, formatToman } from "@/lib/format";
import { useLocale } from "@/lib/locale-context";

/**
 * A deterministic 24-hour industrial load profile for the hero.
 *
 * It is computed, not fetched, so the landing page renders identically on the
 * server and the client and needs no API round-trip - and it mirrors the shape
 * the real generator produces: three shifts, a changeover dip, and a peak-band
 * ramp in the evening.
 */
function heroProfile(): { hour: number; kw: number; band: string }[] {
  const base = 620;
  const capacity = 2400;
  return Array.from({ length: 49 }, (_, index) => {
    const hour = index / 2;
    const shift =
      hour >= 6 && hour < 22
        ? hour >= 13.5 && hour < 15
          ? 0.62 // shift changeover
          : 0.86
        : 0.31;
    const evening = hour >= 19 && hour < 23 ? 0.08 : 0;
    const ripple = Math.sin(hour * 1.7) * 0.035 + Math.sin(hour * 0.55) * 0.025;
    const kw = base + (capacity - base) * Math.max(0, shift + evening + ripple);
    const band = hour >= 19 && hour < 23 ? "peak" : hour >= 7 && hour < 19 ? "mid_peak" : "off_peak";
    return { hour, kw: Math.round(kw), band };
  });
}

export function Hero() {
  const { dict, locale, dir } = useLocale();
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  return (
    <section className="relative isolate overflow-hidden pt-28 pb-16 sm:pt-36 sm:pb-24">
      <div className="aurora" aria-hidden />
      <div className="grain absolute inset-0" aria-hidden />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <div>
            <motion.span
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-medium text-ink-2 shadow-[var(--shadow-sm)]"
            >
              <Sparkles className="size-3.5 text-brand" />
              {dict.hero.badge}
            </motion.span>

            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05, ease: [0.23, 1, 0.32, 1] }}
              className="display-1 mt-6 text-ink"
            >
              {dict.hero.title}{" "}
              <span className="brand-gradient-text">{dict.hero.titleAccent}</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.12, ease: [0.23, 1, 0.32, 1] }}
              className="mt-6 max-w-xl text-base leading-relaxed text-ink-2 sm:text-lg"
            >
              {dict.hero.subtitle}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.18, ease: [0.23, 1, 0.32, 1] }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <ButtonLink href="#contact" size="lg" className="group">
                {dict.hero.ctaPrimary}
                <Arrow className="size-4 transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
              </ButtonLink>
              <ButtonLink href="#platform" variant="outline" size="lg">
                <PlayCircle className="size-4" />
                {dict.hero.ctaSecondary}
              </ButtonLink>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.28 }}
              className="mt-6 text-xs leading-relaxed text-ink-3"
            >
              {dict.hero.trust}
            </motion.p>

            <motion.dl
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.34, ease: [0.23, 1, 0.32, 1] }}
              className="mt-10 grid grid-cols-3 gap-4 border-t border-line pt-6"
            >
              {[
                { value: dict.hero.stat1Value, label: dict.hero.stat1Label },
                { value: dict.hero.stat2Value, label: dict.hero.stat2Label },
                { value: dict.hero.stat3Value, label: dict.hero.stat3Label },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="text-lg font-bold tracking-tight text-ink sm:text-xl">{stat.value}</dt>
                  <dd className="mt-1 text-[0.6875rem] leading-relaxed text-ink-3">{stat.label}</dd>
                </div>
              ))}
            </motion.dl>
          </div>

          <HeroVisual />
        </div>
      </div>
    </section>
  );
}

function HeroVisual() {
  const { dict, locale } = useLocale();
  const reduceMotion = useReducedMotion();
  const points = useMemo(heroProfile, []);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const width = 560;
  const height = 300;
  const padding = { top: 20, right: 16, bottom: 34, left: 16 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const max = Math.max(...points.map((p) => p.kw)) * 1.12;
  const x = linearScale([0, points.length - 1], [padding.left, padding.left + plotWidth]);
  const y = linearScale([0, max], [padding.top + plotHeight, padding.top]);
  const coords = points.map((point, index) => ({ x: x(index), y: y(point.kw) }));
  const line = smoothPath(coords);
  const area = areaPath(coords, padding.top + plotHeight);

  // The evening peak band, highlighted as the expensive window.
  const peakStart = points.findIndex((p) => p.band === "peak");
  const peakEnd = points.length - 1 - [...points].reverse().findIndex((p) => p.band === "peak");
  const nowIndex = Math.round(points.length * 0.86);

  const bandRuns: { band: string; from: number; to: number }[] = [];
  points.forEach((point, index) => {
    const last = bandRuns[bandRuns.length - 1];
    if (last && last.band === point.band) last.to = index;
    else bandRuns.push({ band: point.band, from: index, to: index });
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}
      className="relative"
    >
      <div className="glass glass-edge relative rounded-[--radius-2xl] border border-line p-4 shadow-[var(--shadow-lg)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-pulse-ring rounded-full bg-brand" />
              <span className="relative inline-flex size-2 rounded-full bg-brand" />
            </span>
            <span className="text-xs font-medium text-ink-2">{dict.hero.liveLabel}</span>
            <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[0.625rem] font-medium text-ink-3">
              {dict.common.live}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold tabular tracking-tight text-ink">
              {formatNumber(points[nowIndex].kw, locale)}
            </span>
            <span className="text-[0.6875rem] font-medium text-ink-3">{dict.common.kw}</span>
          </div>
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full" role="img" aria-label={dict.hero.liveLabel}>
          <defs>
            <linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.30" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* The peak window, shaded - the most expensive hours of the day. */}
          <rect
            x={x(peakStart)}
            width={x(peakEnd) - x(peakStart)}
            y={padding.top}
            height={plotHeight}
            fill="var(--band-peak)"
            opacity={0.07}
          />

          {[0.25, 0.5, 0.75, 1].map((fraction) => (
            <line
              key={fraction}
              x1={padding.left}
              x2={padding.left + plotWidth}
              y1={y(max * fraction)}
              y2={y(max * fraction)}
              stroke="var(--grid)"
              strokeWidth={1}
            />
          ))}

          <path d={area} fill="url(#hero-fill)" />
          <motion.path
            d={line}
            fill="none"
            stroke="var(--brand)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduceMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.6, delay: 0.4, ease: [0.23, 1, 0.32, 1] }}
          />

          {bandRuns.map((run) => (
            <rect
              key={`${run.band}-${run.from}`}
              x={x(run.from)}
              width={Math.max(2, x(run.to) - x(run.from) - 2)}
              y={padding.top + plotHeight + 14}
              height={6}
              rx={3}
              fill={bandColor[run.band]}
              opacity={0.85}
            />
          ))}

          {mounted && (
            <g>
              <line
                x1={coords[nowIndex].x}
                x2={coords[nowIndex].x}
                y1={padding.top}
                y2={padding.top + plotHeight}
                stroke="var(--axis)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <circle cx={coords[nowIndex].x} cy={coords[nowIndex].y} r={7} fill="var(--surface)" />
              <circle cx={coords[nowIndex].x} cy={coords[nowIndex].y} r={4.5} fill="var(--brand)" />
            </g>
          )}
        </svg>

        <BandLegend className="mt-2" />
      </div>

      {/* What the engine found in this very profile, called out under the card. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <FindingChip
          delay={1.0}
          tone="critical"
          title={locale === "fa" ? "جریمه توان راکتیو" : "Reactive power penalty"}
          value={formatToman(349_000_000, locale, dict.common)}
          caption={dict.common.perYear}
        />
        <FindingChip
          delay={1.15}
          tone="warning"
          title={locale === "fa" ? "بار قابل جابه‌جایی از اوج بار" : "Shiftable peak load"}
          value={formatToman(118_000_000, locale, dict.common)}
          caption={dict.common.perYear}
        />
      </div>
    </motion.div>
  );
}

function FindingChip({
  title,
  value,
  caption,
  tone,
  delay,
}: {
  title: string;
  value: string;
  caption: string;
  tone: "critical" | "warning";
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay, ease: [0.23, 1, 0.32, 1] }}
      className="flex items-center justify-between gap-3 rounded-[--radius-lg] border border-line bg-surface p-3.5 shadow-[var(--shadow-sm)]"
    >
      <span className="flex min-w-0 items-start gap-2">
        <span
          className="mt-1 size-1.5 shrink-0 rounded-full"
          style={{
            background: tone === "critical" ? "var(--status-critical)" : "var(--status-warning)",
          }}
          aria-hidden
        />
        {/* Wraps rather than truncates - a clipped finding name tells nobody anything. */}
        <span className="text-[0.6875rem] font-medium leading-snug text-ink-2">{title}</span>
      </span>
      <span className="flex shrink-0 items-baseline gap-1">
        <span className="text-sm font-bold tabular text-ink">{value}</span>
        <span className="text-[0.625rem] text-ink-3">{caption}</span>
      </span>
    </motion.div>
  );
}
