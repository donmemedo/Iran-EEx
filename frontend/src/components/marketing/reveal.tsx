"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Scroll reveal. Under reduced motion it becomes a plain cross-fade with no
 * translation, which keeps the "something arrived" cue without the vestibular
 * part.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const reduceMotion = useReducedMotion();
  const Component = motion[Tag] as typeof motion.div;

  return (
    <Component
      initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, delay, ease: [0.23, 1, 0.32, 1] }}
      className={className}
    >
      {children}
    </Component>
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
