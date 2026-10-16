"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * One IntersectionObserver shared by every Reveal on the page. It writes a data
 * attribute straight onto the element, so revealing never re-renders React and
 * never reads layout on the main thread.
 *
 * Content is visible by default - without JavaScript, and for anything already
 * on screen at load. Only elements that start fully below the viewport are
 * hidden, and they fade up as they scroll in. Under Reduce Motion nothing is
 * ever hidden: the content is simply there.
 */
let observer: IntersectionObserver | null = null;

function observe(element: HTMLElement) {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          if (target.dataset.reveal === "out") target.dataset.reveal = "in";
          observer?.unobserve(target);
        } else if (!target.dataset.reveal) {
          // First report. Hide it only if it is still entirely below the fold;
          // anything on screen or above it (after a deep link) stays as it is.
          const viewportBottom = (entry.rootBounds?.bottom ?? Infinity) + 60;
          if (entry.boundingClientRect.top >= viewportBottom) target.dataset.reveal = "out";
          else observer?.unobserve(target);
        }
      }
    },
    { rootMargin: "0px 0px -60px 0px" },
  );
  observer.observe(element);
  return () => observer?.unobserve(element);
}

export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? observe(ref.current) : undefined), []);

  // The tag varies but the ref target is just an element, so one type serves.
  const Tag = as as "div";
  return (
    <Tag
      ref={ref}
      className={cn(
        "motion-safe:data-[reveal=out]:opacity-0 motion-safe:data-[reveal=out]:translate-y-[18px]",
        "motion-safe:data-[reveal=in]:transition-[opacity,translate] motion-safe:data-[reveal=in]:duration-550 motion-safe:data-[reveal=in]:ease-[var(--ease-out)]",
        className,
      )}
      style={delay ? { transitionDelay: `${delay}s` } : undefined}
    >
      {children}
    </Tag>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
  align?: "center" | "start";
  className?: string;
}) {
  return (
    <Reveal className={cn(align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl", className)}>
      <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1 text-[0.6875rem] font-semibold tracking-wide text-brand">
        {eyebrow}
      </span>
      <h2 className="display-3 mt-4 text-ink">{title}</h2>
      {subtitle && <p className="mt-4 text-sm leading-relaxed text-ink-2 sm:text-base">{subtitle}</p>}
    </Reveal>
  );
}
