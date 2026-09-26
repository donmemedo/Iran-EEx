"use client";

import { Languages, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { locales, localeMeta } from "@/i18n/config";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

/**
 * Theme toggle. It cycles light -> dark -> system rather than hiding the system
 * option, so a user who never set a preference can always get back to it.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const { dict } = useLocale();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const order = ["light", "dark", "system"] as const;
  const current = (mounted ? theme : "system") as (typeof order)[number];
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;
  const label =
    current === "light"
      ? dict.common.themeLight
      : current === "dark"
        ? dict.common.themeDark
        : dict.common.themeSystem;

  return (
    <button
      type="button"
      aria-label={`${dict.common.theme}: ${label}`}
      title={`${dict.common.theme}: ${label}`}
      onClick={() => setTheme(order[(order.indexOf(current) + 1) % order.length])}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-[--radius-md] border border-line",
        "bg-surface-2 text-ink-2 transition-[color,background-color,transform] duration-150",
        "ease-[var(--ease-out)] hover:bg-surface-3 hover:text-ink active:scale-[0.93]",
        className,
      )}
    >
      {/* Suppress the icon until mounted so the server and client agree. */}
      <Icon className={cn("size-4 transition-opacity", mounted ? "opacity-100" : "opacity-0")} />
    </button>
  );
}

/** Switches locale while staying on the same page. */
export function LocaleToggle({ className }: { className?: string }) {
  const { locale, dict } = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const other = locales.find((l) => l !== locale) ?? "en";
  const target = pathname.replace(new RegExp(`^/${locale}`), `/${other}`) || `/${other}`;

  return (
    <button
      type="button"
      aria-label={`${dict.common.language}: ${localeMeta[other].label}`}
      title={localeMeta[other].label}
      onClick={() => router.push(target)}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-[--radius-md] border border-line px-2.5",
        "bg-surface-2 text-ink-2 transition-[color,background-color,transform] duration-150",
        "ease-[var(--ease-out)] hover:bg-surface-3 hover:text-ink active:scale-[0.95]",
        className,
      )}
    >
      <Languages className="size-4" />
      <span className="text-xs font-semibold">{localeMeta[other].short}</span>
    </button>
  );
}
