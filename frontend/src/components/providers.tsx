"use client";

import { ThemeProvider } from "next-themes";
import { SWRConfig } from "swr";
import type { ReactNode } from "react";

import type { Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { fetcher } from "@/lib/api";
import { AuthProvider } from "@/lib/auth";
import { LocaleProvider } from "@/lib/locale-context";

export function Providers({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: ReactNode;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <LocaleProvider locale={locale} dict={dict}>
        <AuthProvider locale={locale}>
          <SWRConfig
            value={{
              fetcher,
              revalidateOnFocus: false,
              shouldRetryOnError: false,
              dedupingInterval: 10_000,
            }}
          >
            {children}
          </SWRConfig>
        </AuthProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
