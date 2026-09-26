/**
 * Number, money and date formatting.
 *
 * Persian output uses Persian digits and the Jalali calendar throughout - the
 * platform is Persian-first, and a Gregorian date on an invoice reads as a
 * translation artefact to an Iranian accountant.
 */
import type { Locale } from "@/i18n/config";

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

export function localizeDigits(input: string, locale: Locale): string {
  return locale === "fa" ? toPersianDigits(input) : input;
}

export function formatNumber(
  value: number,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
): string {
  if (!Number.isFinite(value)) return "—";
  const formatted = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
    maximumFractionDigits: 0,
    ...options,
  }).format(value);
  return formatted;
}

/**
 * Money, scaled to the unit a factory manager actually speaks in.
 * Iranian industrial figures live in millions and billions of Toman, so a raw
 * 12-digit number is unreadable - it gets scaled and labelled instead.
 */
export function formatToman(
  value: number,
  locale: Locale,
  labels: { toman: string; millionToman: string; billionToman: string },
  options: { compact?: boolean; withUnit?: boolean } = {},
): string {
  const { compact = true, withUnit = true } = options;
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);

  if (!compact || abs < 1_000_000) {
    const n = formatNumber(value, locale);
    return withUnit ? `${n} ${labels.toman}` : n;
  }
  if (abs < 1_000_000_000) {
    const n = formatNumber(value / 1_000_000, locale, {
      maximumFractionDigits: abs < 10_000_000 ? 1 : 0,
    });
    return withUnit ? `${n} ${labels.millionToman}` : n;
  }
  const n = formatNumber(value / 1_000_000_000, locale, { maximumFractionDigits: 1 });
  return withUnit ? `${n} ${labels.billionToman}` : n;
}

/** Split money into the number and its unit, for typographic separation. */
export function splitToman(
  value: number,
  locale: Locale,
  labels: { toman: string; millionToman: string; billionToman: string },
): { value: string; unit: string } {
  const abs = Math.abs(value);
  if (abs < 1_000_000) {
    return { value: formatNumber(value, locale), unit: labels.toman };
  }
  if (abs < 1_000_000_000) {
    return {
      value: formatNumber(value / 1_000_000, locale, {
        maximumFractionDigits: abs < 10_000_000 ? 1 : 0,
      }),
      unit: labels.millionToman,
    };
  }
  return {
    value: formatNumber(value / 1_000_000_000, locale, { maximumFractionDigits: 1 }),
    unit: labels.billionToman,
  };
}

/** Energy, scaled kWh -> MWh -> GWh. */
export function formatEnergy(kwh: number, locale: Locale): { value: string; unit: string } {
  const abs = Math.abs(kwh);
  if (abs >= 1_000_000) {
    return { value: formatNumber(kwh / 1_000_000, locale, { maximumFractionDigits: 1 }), unit: "GWh" };
  }
  if (abs >= 1_000) {
    return { value: formatNumber(kwh / 1_000, locale, { maximumFractionDigits: 1 }), unit: "MWh" };
  }
  return { value: formatNumber(kwh, locale), unit: "kWh" };
}

/** Power, scaled kW -> MW. */
export function formatPower(kw: number, locale: Locale): { value: string; unit: string } {
  if (Math.abs(kw) >= 1_000) {
    return { value: formatNumber(kw / 1_000, locale, { maximumFractionDigits: 2 }), unit: "MW" };
  }
  return { value: formatNumber(kw, locale, { maximumFractionDigits: 0 }), unit: "kW" };
}

export function formatPercent(value: number, locale: Locale, fractionDigits = 0): string {
  const n = formatNumber(value, locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return locale === "fa" ? `${n}٪` : `${n}%`;
}

/** A date, in the Jalali calendar for Persian. */
export function formatDate(value: string | Date, locale: Locale): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatTime(value: string | Date, locale: Locale): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tehran",
  }).format(date);
}

export function formatDateTime(value: string | Date, locale: Locale): string {
  return `${formatDate(value, locale)} · ${formatTime(value, locale)}`;
}

/** "3 hours ago" style, in whichever locale. */
export function formatRelative(value: string | Date, locale: Locale): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diffMs = date.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale === "fa" ? "fa-IR" : "en", { numeric: "auto" });
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

/** The month key the API returns ("2026-07") as a localized month label. */
export function formatMonthKey(key: string, locale: Locale): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-GB", {
    month: "short",
    year: "2-digit",
  }).format(new Date(Date.UTC(y, m - 1, 15)));
}
