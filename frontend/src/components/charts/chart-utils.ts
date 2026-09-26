/**
 * Shared geometry for the SVG charts.
 *
 * A note on direction: the time axis runs left-to-right in both locales. The
 * page mirrors for Persian, but a load profile that ran right-to-left would
 * fight every other energy dashboard an Iranian plant engineer uses, and the
 * clock labels underneath it are read left-to-right anyway. Legends, labels and
 * padding do mirror, through logical properties.
 */

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const defaultPadding: Padding = { top: 12, right: 12, bottom: 24, left: 44 };

export interface Scale {
  (value: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const fn = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as Scale;
  fn.domain = domain;
  fn.range = range;
  return fn;
}

/** A "nice" upper bound plus tick values, so the axis reads in round numbers. */
export function niceTicks(max: number, count = 4): { max: number; ticks: number[] } {
  if (!Number.isFinite(max) || max <= 0) return { max: 1, ticks: [0, 1] };
  const rawStep = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= niceMax + step / 2; value += step) ticks.push(Number(value.toFixed(6)));
  return { max: niceMax, ticks };
}

/** A smooth path through the points, using a monotone cubic so it never
 *  overshoots below zero on a sharp dip - important for a load curve. */
export function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length < 3) {
    return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  }
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const smoothing = 0.18;
    const c1x = p1.x + (p2.x - p0.x) * smoothing;
    const c1y = p1.y + (p2.y - p0.y) * smoothing;
    const c2x = p2.x - (p3.x - p1.x) * smoothing;
    const c2y = p2.y - (p3.y - p1.y) * smoothing;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export function areaPath(points: { x: number; y: number }[], baselineY: number): string {
  if (points.length === 0) return "";
  const line = smoothPath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L${last.x},${baselineY} L${first.x},${baselineY} Z`;
}

/** Index of the point nearest an x position - used by the crosshair. */
export function nearestIndex(xs: number[], x: number): number {
  if (xs.length === 0) return -1;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < xs.length; i += 1) {
    const distance = Math.abs(xs[i] - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

export const bandColor: Record<string, string> = {
  peak: "var(--band-peak)",
  mid_peak: "var(--band-mid)",
  off_peak: "var(--band-off)",
};
