import Link from "next/link";
import { useId } from "react";

import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  // The logo appears in the header and the footer; a fixed id would repeat.
  const gradient = useId();
  return (
    <svg viewBox="0 0 48 48" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--brand)" />
          <stop offset="55%" stopColor="var(--band-off)" />
          <stop offset="100%" stopColor="var(--band-mid)" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" className="fill-[var(--ink)]" />
      <polygon points="26,4 6,28 18,28 16,44 36,20 24,20" fill={`url(#${gradient})`} />
    </svg>
  );
}

export function Logo({
  href,
  name,
  latin,
  className,
}: {
  href: string;
  name: string;
  latin: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-2.5 transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97]",
        className,
      )}
    >
      <LogoMark className="size-8 transition-transform duration-300 ease-[var(--ease-out)] group-hover:scale-105" />
      <span className="flex flex-col leading-none">
        <span className="text-[0.9375rem] font-bold tracking-tight text-ink">{name}</span>
        <span className="mt-0.5 text-[0.625rem] font-medium tracking-[0.14em] text-ink-3" lang="en">
          {latin}
        </span>
      </span>
    </Link>
  );
}
