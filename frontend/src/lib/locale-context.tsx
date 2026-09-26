"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { Dictionary } from "@/i18n";
import { type Locale, localeMeta } from "@/i18n/config";

interface LocaleContextValue {
  locale: Locale;
  dict: Dictionary;
  dir: "rtl" | "ltr";
  /** Prefix a path with the active locale. */
  href: (path: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: ReactNode;
}) {
  const value: LocaleContextValue = {
    locale,
    dict,
    dir: localeMeta[locale].dir,
    href: (path: string) => `/${locale}${path.startsWith("/") ? path : `/${path}`}`,
  };
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside a LocaleProvider");
  return ctx;
}

/** Pick the field matching the active locale from an API object. */
export function useLocalized() {
  const { locale } = useLocale();
  return function pick<T extends object>(obj: T, base: string): string {
    // Interfaces have no index signature, so the lookup goes through a record view.
    const record = obj as Record<string, unknown>;
    return String(record[`${base}_${locale}`] ?? record[`${base}_fa`] ?? "");
  };
}
