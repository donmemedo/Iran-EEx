export const locales = ["fa", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "fa";

export const localeMeta: Record<Locale, { dir: "rtl" | "ltr"; label: string; short: string }> = {
  fa: { dir: "rtl", label: "فارسی", short: "FA" },
  en: { dir: "ltr", label: "English", short: "EN" },
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
