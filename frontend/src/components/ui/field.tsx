"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const control =
  "w-full rounded-[--radius-md] border border-line bg-surface-2 px-3.5 text-sm text-ink " +
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

/** A segmented control - the tap target for a small, fixed set of choices. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "md",
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-[--radius-md] border border-line bg-surface-2 p-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative rounded-[--radius-sm] font-medium transition-colors duration-150 ease-[var(--ease-out)] active:scale-[0.97]",
              size === "sm" ? "px-2.5 py-1 text-[0.75rem]" : "px-3.5 py-1.5 text-[0.8125rem]",
              active ? "bg-surface text-ink shadow-[var(--shadow-sm)]" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
