"use client";

import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";

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

/**
 * The chart geometry. The profile is fixed, so it is laid out once per page load
 * at module scope rather than on every render. Every value derives from rounded
 * integers, so the server and the browser produce the same path strings.
 */
const WIDTH = 560;
const HEIGHT = 300;
const PADDING = { top: 20, right: 16, bottom: 34, left: 16 };
const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;
const POINTS = heroProfile();
const MIN_KW = Math.min(...POINTS.map((p) => p.kw));
const MAX_KW = Math.max(...POINTS.map((p) => p.kw));
const MAX = MAX_KW * 1.12;
const x = linearScale([0, POINTS.length - 1], [PADDING.left, PADDING.left + PLOT_WIDTH]);
const y = linearScale([0, MAX], [PADDING.top + PLOT_HEIGHT, PADDING.top]);
const COORDS = POINTS.map((point, index) => ({ x: x(index), y: y(point.kw) }));
const LINE = smoothPath(COORDS);
const AREA = areaPath(COORDS, PADDING.top + PLOT_HEIGHT);
// The evening peak band, highlighted as the expensive window.
const PEAK_START = POINTS.findIndex((p) => p.band === "peak");
const PEAK_END = POINTS.findLastIndex((p) => p.band === "peak");
const NOW = Math.round(POINTS.length * 0.86);
const BAND_RUNS: { band: string; from: number; to: number }[] = [];
POINTS.forEach((point, index) => {
  const last = BAND_RUNS[BAND_RUNS.length - 1];
  if (last && last.band === point.band) last.to = index;
  else BAND_RUNS.push({ band: point.band, from: index, to: index });
});

/**
 * Entrances are CSS @starting-style transitions, not framer-motion: the server
 * HTML is visible as sent, so the headline paints before hydration and never
 * stays hidden if a script fails. Without @starting-style support it simply
 * shows; under Reduce Motion there is no starting state, so nothing moves.
 */
const RISE =
  "transition-[opacity,translate] duration-600 ease-[var(--ease-out)] motion-safe:starting:translate-y-3.5 motion-safe:starting:opacity-0";

export function Hero() {
  const { dict, dir } = useLocale();
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  return (
    <section className="relative isolate overflow-hidden pt-28 pb-16 sm:pt-36 sm:pb-24">
      <div className="aurora" aria-hidden />
      <div className="grain absolute inset-0" aria-hidden />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <div>
            <span
              className={`${RISE} inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-medium text-ink-2 shadow-[var(--shadow-sm)]`}
            >
              <Sparkles className="size-3.5 text-brand" aria-hidden />
              {dict.hero.badge}
            </span>

            <h1 className={`${RISE} display-1 mt-6 text-ink delay-50`}>
              {dict.hero.title} <span className="brand-gradient-text">{dict.hero.titleAccent}</span>
            </h1>

            <p className={`${RISE} mt-6 max-w-xl text-base leading-relaxed text-ink-2 delay-120 sm:text-lg`}>
              {dict.hero.subtitle}
            </p>

            <div className={`${RISE} mt-8 flex flex-wrap items-center gap-3 delay-180`}>
              <ButtonLink href="#contact" size="lg" className="group">
                {dict.hero.ctaPrimary}
                <Arrow className="size-4 transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
              </ButtonLink>
              <ButtonLink href="#platform" variant="outline" size="lg">
                {dict.hero.ctaSecondary}
              </ButtonLink>
            </div>

            <p className={`${RISE} mt-6 text-xs leading-relaxed text-ink-3 delay-280`}>{dict.hero.trust}</p>

            <dl className={`${RISE} mt-10 grid grid-cols-3 gap-4 border-t border-line pt-6 delay-340`}>
              {[
                { value: dict.hero.stat1Value, label: dict.hero.stat1Label },
                { value: dict.hero.stat2Value, label: dict.hero.stat2Label },
                { value: dict.hero.stat3Value, label: dict.hero.stat3Label },
              ].map((stat) => (
                // The label is the term and the figure its value; the figure still reads first.
                <div key={stat.label} className="flex flex-col-reverse">
                  <dt className="mt-1 text-[0.6875rem] leading-relaxed text-ink-3">{stat.label}</dt>
                  <dd className="text-lg font-bold tracking-tight tabular text-ink sm:text-xl">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <HeroVisual />
        </div>
      </div>
    </section>
  );
}

function HeroVisual() {
  const { dict, locale } = useLocale();
  const summary = dict.hero.chartSummary
    .replace("{min}", formatNumber(MIN_KW, locale))
    .replace("{max}", formatNumber(MAX_KW, locale));

  return (
    <div className="relative transition-[opacity,translate,scale] delay-150 duration-700 ease-[var(--ease-out)] motion-safe:starting:translate-y-6 motion-safe:starting:scale-[0.98] motion-safe:starting:opacity-0">
      <div className="glass glass-edge relative rounded-2xl border border-line p-4 shadow-[var(--shadow-lg)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-2">
            {/* A computed sample, so it is labelled as one - no "live" pulse. */}
            <span className="size-2 rounded-full bg-brand" aria-hidden />
            <span className="text-xs font-medium text-ink-2">{dict.hero.liveLabel}</span>
            <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[0.625rem] font-medium text-ink-3">
              {dict.hero.sample}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold tabular tracking-tight text-ink">
              {formatNumber(POINTS[NOW].kw, locale)}
            </span>
            <span className="text-[0.6875rem] font-medium text-ink-3">{dict.common.kw}</span>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="mt-3 w-full"
          role="img"
          aria-label={`${dict.hero.liveLabel}. ${summary}`}
        >
          <defs>
            <linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.30" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* The peak window, shaded - the most expensive hours of the day. */}
          <rect
            x={x(PEAK_START)}
            width={x(PEAK_END) - x(PEAK_START)}
            y={PADDING.top}
            height={PLOT_HEIGHT}
            fill="var(--band-peak)"
            opacity={0.07}
          />

          {[0.25, 0.5, 0.75, 1].map((fraction) => (
            <line
              key={fraction}
              x1={PADDING.left}
              x2={PADDING.left + PLOT_WIDTH}
              y1={y(MAX * fraction)}
              y2={y(MAX * fraction)}
              stroke="var(--grid)"
              strokeWidth={1}
            />
          ))}

          <path d={AREA} fill="url(#hero-fill)" />
          {/* Draws itself in: pathLength 1 makes the dash offset a 0-1 fraction. */}
          <path
            d={LINE}
            fill="none"
            stroke="var(--brand)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            className="transition-[stroke-dashoffset] delay-400 duration-1600 ease-[var(--ease-out)] motion-safe:starting:[stroke-dashoffset:1]"
          />

          {BAND_RUNS.map((run) => (
            <rect
              key={`${run.band}-${run.from}`}
              x={x(run.from)}
              width={Math.max(2, x(run.to) - x(run.from) - 2)}
              y={PADDING.top + PLOT_HEIGHT + 14}
              height={6}
              rx={3}
              fill={bandColor[run.band]}
              opacity={0.85}
            />
          ))}

          {/* The reading marker fades in once the line has drawn up to it. */}
          <g className="transition-opacity delay-1500 duration-300 motion-safe:starting:opacity-0">
            <line
              x1={COORDS[NOW].x}
              x2={COORDS[NOW].x}
              y1={PADDING.top}
              y2={PADDING.top + PLOT_HEIGHT}
              stroke="var(--axis)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle cx={COORDS[NOW].x} cy={COORDS[NOW].y} r={7} fill="var(--surface)" />
            <circle cx={COORDS[NOW].x} cy={COORDS[NOW].y} r={4.5} fill="var(--brand)" />
          </g>
        </svg>

        <BandLegend className="mt-2" />
      </div>

      {/* What the engine found in this very profile, called out under the card. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <FindingChip
          delay={1.0}
          tone="critical"
          title={dict.hero.findingReactive}
          value={formatToman(349_000_000, locale, dict.common)}
          caption={dict.common.perYear}
        />
        <FindingChip
          delay={1.15}
          tone="warning"
          title={dict.hero.findingShift}
          value={formatToman(118_000_000, locale, dict.common)}
          caption={dict.common.perYear}
        />
      </div>
    </div>
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
    <div
      style={{ transitionDelay: `${delay}s` }}
      className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3.5 shadow-[var(--shadow-sm)] transition-[opacity,translate,scale] duration-500 ease-[var(--ease-out)] motion-safe:starting:translate-y-2.5 motion-safe:starting:scale-[0.97] motion-safe:starting:opacity-0"
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
    </div>
  );
}
