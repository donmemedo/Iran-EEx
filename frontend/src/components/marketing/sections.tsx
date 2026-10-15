"use client";

import {
  Activity,
  BadgeCheck,
  Building2,
  Check,
  ChevronDown,
  Database,
  FileSearch,
  Gauge,
  KeyRound,
  Receipt,
  Server,
  ShieldCheck,
  Timer,
  TrendingDown,
  UserCheck,
  Zap,
} from "lucide-react";
import { useId, useState } from "react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

import { Reveal, SectionHeading } from "./reveal";

const OFFERING_ICONS = [FileSearch, Activity, BadgeCheck];
const LEVER_ICONS = [Receipt, Zap, Gauge, TrendingDown];
// One per dict.security.items entry, in the same order.
const SECURITY_ICONS = [Database, Building2, UserCheck, KeyRound, ShieldCheck, Server];

export function Offerings() {
  const { dict } = useLocale();

  return (
    <section id="platform" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={dict.offerings.eyebrow}
          title={dict.offerings.title}
          subtitle={dict.offerings.subtitle}
        />

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {dict.offerings.items.map((item, index) => {
            const Icon = OFFERING_ICONS[index];
            return (
              <Reveal key={item.title} delay={index * 0.08} as="article">
                {/* Static: these cards are not links, so they do not lift on hover. */}
                <Card className="h-full p-6">
                  <div className="flex items-center justify-between">
                    <span className="flex size-11 items-center justify-center rounded-md border border-line bg-surface-2 text-brand">
                      <Icon className="size-5" />
                    </span>
                    <span className="text-2xl font-bold text-ink-3/40 tabular" aria-hidden>
                      {item.tag}
                    </span>
                  </div>
                  <h3 className="mt-5 text-base font-semibold tracking-tight text-ink">{item.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-ink-2">{item.body}</p>
                  <ul className="mt-5 space-y-2 border-t border-line pt-4">
                    {item.points.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-xs leading-relaxed text-ink-2">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-brand" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Levers() {
  const { dict } = useLocale();

  return (
    <section className="border-y border-line bg-surface py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={dict.levers.eyebrow}
          title={dict.levers.title}
          subtitle={dict.levers.subtitle}
          align="start"
        />

        <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {dict.levers.items.map((item, index) => {
            const Icon = LEVER_ICONS[index];
            return (
              <Reveal key={item.title} delay={index * 0.06} as="article">
                <div className="h-full bg-surface p-6">
                  <Icon className="size-5 text-brand" />
                  <h3 className="mt-4 text-sm font-semibold text-ink">{item.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-ink-2">{item.body}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  const { dict, locale } = useLocale();

  return (
    <section id="how" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={dict.how.eyebrow}
          title={dict.how.title}
          subtitle={dict.how.subtitle}
        />

        <div className="relative mt-14">
          {/* The connecting rail sits behind the markers on wide screens. */}
          <div
            className="absolute inset-x-0 top-5 hidden h-px bg-gradient-to-r from-transparent via-line-strong to-transparent md:block"
            aria-hidden
          />
          <ol className="grid gap-8 md:grid-cols-4 md:gap-5">
          {dict.how.steps.map((step, index) => (
            <Reveal key={step.title} delay={index * 0.08} as="li" className="relative">
              {/* The list already announces the position, so the marker is visual only. */}
              <div
                className="flex size-10 items-center justify-center rounded-full border border-line bg-surface text-sm font-bold tabular text-brand shadow-[var(--shadow-sm)]"
                aria-hidden
              >
                {formatNumber(index + 1, locale)}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Timer className="size-3.5 text-ink-3" />
                <span className="text-[0.6875rem] font-medium text-ink-3">{step.duration}</span>
              </div>
              <h3 className="mt-2 text-sm font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-ink-2">{step.body}</p>
            </Reveal>
          ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

const BENCHMARKS: Record<string, number> = {
  steel: 610,
  cement: 118,
  ceramic: 78,
  plastic: 690,
  food: 285,
  pharma: 430,
  textile: 505,
};

export function Industries() {
  const { dict, locale } = useLocale();
  const entries = Object.entries(BENCHMARKS);
  const max = Math.max(...entries.map(([, value]) => value));

  return (
    <section id="industries" className="scroll-mt-24 border-y border-line bg-surface py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={dict.industries.eyebrow}
          title={dict.industries.title}
          subtitle={dict.industries.subtitle}
          align="start"
        />

        <Reveal className="mt-12">
          <Card className="overflow-hidden">
            <div className="flex items-baseline justify-between gap-3 border-b border-line p-5">
              <h3 className="text-sm font-semibold text-ink">{dict.industries.benchmarkLabel}</h3>
              <span className="text-[0.6875rem] text-ink-3">{dict.industries.unitLabel}</span>
            </div>
            <ul className="divide-y divide-line">
              {entries.map(([key, value], index) => (
                <li key={key} className="flex items-center gap-4 p-4">
                  <span className="w-32 shrink-0 text-xs font-medium text-ink sm:w-44 sm:text-sm">
                    {dict.industries.items[key as keyof typeof dict.industries.items]}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    <div
                      className="h-full rounded-e-full"
                      style={{
                        width: `${(value / max) * 100}%`,
                        background: index % 2 === 0 ? "var(--band-mid)" : "var(--band-off)",
                      }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-end text-xs font-semibold tabular text-ink">
                    {formatNumber(value, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}

export function Security() {
  const { dict } = useLocale();

  return (
    <section id="security" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <SectionHeading
            eyebrow={dict.security.eyebrow}
            title={dict.security.title}
            subtitle={dict.security.subtitle}
            align="start"
            className="lg:sticky lg:top-24 lg:self-start"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            {dict.security.items.map((item, index) => {
              const Icon = SECURITY_ICONS[index];
              return (
                <Reveal key={item.title} delay={index * 0.06}>
                  <Card className="h-full p-5">
                    <Icon className="size-5 text-brand" />
                    <h3 className="mt-3.5 text-sm font-semibold text-ink">{item.title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-ink-2">{item.body}</p>
                  </Card>
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Pricing() {
  const { dict } = useLocale();

  return (
    <section id="pricing" className="scroll-mt-24 border-y border-line bg-surface py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={dict.pricing.eyebrow}
          title={dict.pricing.title}
          subtitle={dict.pricing.subtitle}
        />

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {dict.pricing.plans.map((plan, index) => {
            const featured = index === 1;
            return (
              <Reveal key={plan.name} delay={index * 0.08}>
                <Card
                  className={cn(
                    "relative flex h-full flex-col p-6",
                    featured && "border-brand/40 shadow-[var(--shadow-brand)]",
                  )}
                >
                  {featured && (
                    <span className="absolute -top-3 start-6 rounded-full bg-brand px-3 py-1 text-[0.625rem] font-semibold text-brand-ink shadow-[var(--shadow-sm)]">
                      {dict.pricing.popular}
                    </span>
                  )}
                  <h3 className="text-sm font-semibold text-ink">{plan.name}</h3>
                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold tracking-tight tabular text-ink">{plan.price}</span>
                  </div>
                  <p className="mt-1 text-[0.6875rem] text-ink-3">{plan.period}</p>
                  <p className="mt-4 text-xs leading-relaxed text-ink-2">{plan.body}</p>
                  <ul className="mt-5 flex-1 space-y-2.5 border-t border-line pt-5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-xs leading-relaxed text-ink-2">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-brand" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <ButtonLink
                    href="#contact"
                    variant={featured ? "primary" : "secondary"}
                    className="mt-6 w-full"
                  >
                    {dict.pricing.cta}
                  </ButtonLink>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Faq() {
  const { dict } = useLocale();
  const [open, setOpen] = useState<number | null>(0);
  const id = useId();

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow={dict.faq.eyebrow} title={dict.faq.title} />

        <div className="mt-12 divide-y divide-line border-y border-line">
          {dict.faq.items.map((item, index) => {
            const expanded = open === index;
            const panelId = `${id}-${index}`;
            return (
              <div key={item.q}>
                <h3>
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : index)}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    className="group flex w-full items-center justify-between gap-4 py-5 text-start"
                  >
                    <span className="text-sm font-medium text-ink transition-colors duration-150 group-hover:text-brand">
                      {item.q}
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-ink-3 transition-transform duration-250 ease-[var(--ease-out)]",
                        expanded && "rotate-180",
                      )}
                    />
                  </button>
                </h3>
                {/* Collapsed answers stay in the DOM for the height animation, so
                    inert keeps them out of the reading order until opened. */}
                <div
                  id={panelId}
                  inert={!expanded}
                  className="grid transition-[grid-template-rows] duration-300 ease-[var(--ease-out)]"
                  style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
                >
                  <div className="overflow-hidden">
                    <p className="pb-5 text-sm leading-relaxed text-ink-2">{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
