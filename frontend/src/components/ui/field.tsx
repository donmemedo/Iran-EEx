"use client";

import { motion } from "framer-motion";
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

const control =
  "w-full rounded-md border border-line bg-surface-2 px-3.5 text-sm text-ink " +
  "placeholder:text-ink-3 transition-[border-color,box-shadow,background-color] duration-150 " +
  "ease-[var(--ease-out)] hover:border-line-strong " +
  "focus:border-brand focus:bg-surface focus:outline-none focus:ring-4 focus:ring-brand-soft " +
  "disabled:opacity-60";

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-ink-2">{label}</span>
        {hint && <span className="text-[0.6875rem] text-ink-3">{hint}</span>}
      </span>
      {children}
      {/* Validation is inline and immediate, never held back until submit. */}
      {error && <span className="mt-1.5 block text-xs text-critical">{error}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(control, "h-11", className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(control, "min-h-24 py-3 leading-relaxed", className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(control, "h-11 cursor-pointer appearance-none", className)} {...props}>
        {children}
      </select>
    );
  },
);

export function Checkbox({
  label,
  className,
  ...props
}: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-[0.3rem] border border-line-strong bg-surface-2 accent-[var(--brand)] transition-transform duration-100 active:scale-90"
        {...props}
      />
      <label htmlFor={id} className="cursor-pointer text-sm leading-relaxed text-ink-2">
        {label}
      </label>
    </div>
  );
}

/**
 * A segmented control - one choice from a small, fixed set. It is a radio group
 * (there are no tab panels behind it): one tab stop, arrow keys move and select
 * in reading direction, and the thumb slides between options on a critically
 * damped spring. MotionConfig turns the slide off under Reduce Motion.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "md",
  label,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
  /** Accessible name for the group, when no visible label names it. */
  label?: string;
}) {
  const thumbId = useId();
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const last = options.length - 1;
    const step: Record<string, number> = {
      ArrowRight: rtl ? -1 : 1,
      ArrowLeft: rtl ? 1 : -1,
      ArrowDown: 1,
      ArrowUp: -1,
    };
    let next: number;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else if (event.key in step) next = (selected + step[event.key] + options.length) % options.length;
    else return;
    event.preventDefault();
    onChange(options[next].value);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-line bg-surface-2 p-1",
        className,
      )}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            // Roving tab stop: the checked option, or the first when none is.
            tabIndex={index === selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "tap-target rounded-sm font-medium transition-[color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97]",
              size === "sm" ? "px-2.5 py-1 text-[0.75rem]" : "px-3.5 py-1.5 text-[0.8125rem]",
              checked ? "text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {checked && (
              <motion.span
                layoutId={thumbId}
                aria-hidden
                className="absolute inset-0 bg-surface shadow-[var(--shadow-sm)]"
                // A px radius lets the layout animation correct it while scaling;
                // 8px is concentric with the track (12px radius, 4px padding).
                style={{ borderRadius: 8 }}
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
