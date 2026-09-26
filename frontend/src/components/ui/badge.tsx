import { AlertTriangle, CheckCircle2, CircleDot, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Status is never carried by colour alone: every status badge ships an icon and
 * a text label alongside its colour, which is what makes it readable for
 * colour-vision-deficient users, in print, and under forced colours.
 */
type Tone = "good" | "warning" | "serious" | "critical" | "neutral" | "info" | "brand";

const tones: Record<Tone, { className: string; Icon: typeof Info }> = {
  good: { className: "text-good border-good/30 bg-good/10", Icon: CheckCircle2 },
  warning: { className: "text-warning border-warning/35 bg-warning/10", Icon: AlertTriangle },
  serious: { className: "text-serious border-serious/35 bg-serious/10", Icon: AlertTriangle },
  critical: { className: "text-critical border-critical/35 bg-critical/10", Icon: XCircle },
  info: { className: "text-mid border-mid/30 bg-mid/10", Icon: Info },
  brand: { className: "text-brand border-brand/30 bg-brand-soft", Icon: CircleDot },
  neutral: { className: "text-ink-2 border-line bg-surface-2", Icon: CircleDot },
};

export function Badge({
  tone = "neutral",
  children,
  icon = true,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: boolean;
  className?: string;
}) {
  const { className: toneClass, Icon } = tones[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium leading-none whitespace-nowrap",
        toneClass,
        className,
      )}
    >
      {icon && <Icon className="size-3 shrink-0" aria-hidden />}
      {children}
    </span>
  );
}

export const severityTone: Record<string, Tone> = {
  high: "critical",
  medium: "warning",
  low: "info",
};

export const siteStatusTone: Record<string, Tone> = {
  active: "good",
  pilot: "brand",
  onboarding: "neutral",
};

export const findingStatusTone: Record<string, Tone> = {
  open: "warning",
  in_progress: "info",
  done: "good",
  dismissed: "neutral",
};

export const billStatusTone: Record<string, Tone> = {
  analyzed: "good",
  pending: "neutral",
  disputed: "critical",
};
