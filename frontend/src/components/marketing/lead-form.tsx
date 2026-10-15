"use client";

import { AlertCircle, CheckCircle2, Phone, Send } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { API_URL } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { useLocale } from "@/lib/locale-context";

import {
  LEAD_FIELDS,
  LEAD_LIMITS,
  isLeadField,
  leadProblem,
  toLatinDigits,
  type LeadField,
  type LeadProblem,
} from "./lead-validation";
import { Reveal, SectionHeading } from "./reveal";

// Mirrors the backend's Industry literal.
const INDUSTRIES = ["steel", "cement", "ceramic", "plastic", "food", "pharma", "textile", "other"] as const;

const PROVINCES = [
  "تهران", "البرز", "قزوین", "اصفهان", "یزد", "مرکزی", "قم",
  "خراسان رضوی", "خوزستان", "فارس", "کرمان", "آذربایجان شرقی", "بوشهر", "هرمزگان",
];

// When the server rejects a field the client passed, say what that field needs.
const SERVER_PROBLEM: Partial<Record<LeadField, LeadProblem>> = {
  phone: "invalidPhone",
  email: "invalidEmail",
  monthly_bill: "invalidBill",
};

type Errors = Partial<Record<LeadField, string>>;

/** "Too many requests, try again in N seconds/minutes", from a Retry-After value. */
export function rateLimitText(seconds: number | null, dict: Dictionary, locale: Locale): string {
  if (!seconds) return dict.common.errors.rateLimited;
  if (seconds < 60) return dict.common.errors.rateLimitedFor.replace("{seconds}", formatNumber(seconds, locale));
  return dict.leadForm.rateLimitedMinutes.replace("{minutes}", formatNumber(Math.ceil(seconds / 60), locale));
}

// Stable, so the success heading takes focus once, when it mounts.
function focusOnMount(node: HTMLElement | null) {
  node?.focus();
}

export function LeadForm() {
  const { dict, locale } = useLocale();
  const copy = dict.leadForm;
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [bill, setBill] = useState("");
  // State updates land a render later; the ref stops a fast double press from posting twice.
  const pending = useRef(false);

  const problemText: Record<LeadProblem, string> = {
    required: dict.common.required,
    tooShort: copy.tooShort.replace("{min}", formatNumber(2, locale)),
    tooLong: copy.checkField,
    invalidPhone: copy.invalidPhone,
    invalidEmail: copy.invalidEmail,
    invalidBill: copy.invalidBill,
  };
  const check = (name: LeadField, value: string) => {
    const problem = leadProblem(name, value);
    return problem ? problemText[problem] : undefined;
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (name: string) => String(data.get(name) ?? "").trim();
    const focus = (name: LeadField) => (form.elements.namedItem(name) as HTMLElement | null)?.focus();

    const found: Errors = {};
    for (const name of LEAD_FIELDS) found[name] = check(name, value(name));
    setErrors(found);
    const firstInvalid = LEAD_FIELDS.find((name) => found[name]);
    if (firstInvalid) {
      setBanner(copy.checkFields);
      focus(firstInvalid);
      return;
    }

    pending.current = true;
    setSending(true);
    setBanner(null);
    try {
      // fetch rather than apiFetch: a 422 names its fields only in the body.
      const response = await fetch(`${API_URL}/api/v1/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: value("company"),
          contact_name: value("contact_name"),
          phone: toLatinDigits(value("phone")),
          email: value("email") || null,
          industry: value("industry"),
          province: value("province"),
          monthly_bill: bill ? Number(bill) : null,
          message: value("message") || null,
          locale,
        }),
      });
      if (response.ok) {
        setSent(true);
        return;
      }
      if (response.status === 422) {
        const body = await response.json().catch(() => null);
        const issues: { loc?: unknown[] }[] = Array.isArray(body?.detail) ? body.detail : [];
        const server: Errors = {};
        for (const issue of issues) {
          const name = issue.loc?.[issue.loc.length - 1];
          if (isLeadField(name)) {
            const problem = SERVER_PROBLEM[name];
            server[name] = problem ? problemText[problem] : copy.checkField;
          }
        }
        setErrors(server);
        const first = LEAD_FIELDS.find((name) => server[name]);
        // A rejected field the form does not show (industry, province) has no
        // field to flag, so say the request failed rather than show nothing.
        setBanner(first ? copy.checkFields : copy.errorBody);
        if (first) focus(first);
        return;
      }
      setBanner(
        response.status === 429
          ? rateLimitText(Number(response.headers.get("Retry-After")) || null, dict, locale)
          : copy.errorBody,
      );
    } catch {
      setBanner(copy.networkError);
    } finally {
      pending.current = false;
      setSending(false);
    }
  }

  // Inline validation: a field is checked when focus leaves it, and once flagged
  // its message clears the moment the value is fixed. An empty required field
  // is not flagged on blur - tabbing past it is not a mistake - only on submit.
  function onFieldBlur(target: EventTarget) {
    const { name, value } = target as HTMLInputElement;
    if (!isLeadField(name) || (!value.trim() && !errors[name])) return;
    setErrors((current) => ({ ...current, [name]: check(name, value) }));
  }
  function onFieldChange(target: EventTarget) {
    const { name, value } = target as HTMLInputElement;
    if (isLeadField(name) && errors[name]) setErrors((current) => ({ ...current, [name]: check(name, value) }));
  }

  function reset() {
    setSent(false);
    setBill("");
    setErrors({});
    setBanner(null);
  }

  return (
    <section id="contact" className="scroll-mt-24 border-t border-line bg-surface py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.25fr] lg:gap-16">
          <div>
            <SectionHeading
              eyebrow={copy.eyebrow}
              title={copy.title}
              subtitle={copy.subtitle}
              align="start"
            />
            <Reveal delay={0.1} className="mt-8">
              <a
                href="tel:+982100000000"
                className="inline-flex items-center gap-3 rounded-lg border border-line bg-surface-2 p-4 transition-[border-color,scale] duration-150 ease-[var(--ease-out)] hover:border-brand/30 active:scale-[0.98]"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <Phone className="size-4" aria-hidden />
                </span>
                <span className="flex flex-col">
                  <span className="text-xs text-ink-3">{dict.footer.contact}</span>
                  <span className="text-sm font-semibold tabular text-ink" dir="ltr">
                    +۹۸ ۲۱ ۰۰۰۰ ۰۰۰۰
                  </span>
                </span>
              </a>
            </Reveal>
          </div>

          <Reveal delay={0.08}>
            <Card className="p-6 sm:p-8">
              {sent ? (
                // Grows in from its own centre; Reduce Motion collapses the transition.
                <div className="flex flex-col items-center py-10 text-center transition-[opacity,scale] duration-400 ease-[var(--ease-out)] starting:scale-97 starting:opacity-0">
                  <span className="flex size-14 items-center justify-center rounded-full bg-good/10 text-good">
                    <CheckCircle2 className="size-7" aria-hidden />
                  </span>
                  {/* Focus moves here so keyboard and screen-reader users hear the outcome. */}
                  <h3 ref={focusOnMount} tabIndex={-1} className="mt-5 text-base font-semibold text-ink outline-none">
                    {copy.successTitle}
                  </h3>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-2">{copy.successBody}</p>
                  <Button variant="secondary" className="mt-6" onClick={reset}>
                    {copy.another}
                  </Button>
                </div>
              ) : (
                <form
                  onSubmit={onSubmit}
                  onBlur={(event) => onFieldBlur(event.target)}
                  onChange={(event) => onFieldChange(event.target)}
                  noValidate
                  className="grid gap-4 sm:grid-cols-2"
                >
                  <Field label={copy.company} error={errors.company} className="sm:col-span-2">
                    <Input
                      name="company"
                      required
                      maxLength={LEAD_LIMITS.company}
                      autoComplete="organization"
                      aria-invalid={!!errors.company || undefined}
                    />
                  </Field>

                  <Field label={copy.contactName} error={errors.contact_name}>
                    <Input
                      name="contact_name"
                      required
                      maxLength={LEAD_LIMITS.contact_name}
                      autoComplete="name"
                      aria-invalid={!!errors.contact_name || undefined}
                    />
                  </Field>

                  <Field label={copy.phone} error={errors.phone}>
                    <Input
                      name="phone"
                      type="tel"
                      required
                      maxLength={LEAD_LIMITS.phone}
                      inputMode="tel"
                      autoComplete="tel"
                      dir="ltr"
                      placeholder="09121234567"
                      className="tabular"
                      aria-invalid={!!errors.phone || undefined}
                    />
                  </Field>

                  <Field label={copy.email} error={errors.email}>
                    <Input
                      name="email"
                      type="email"
                      maxLength={LEAD_LIMITS.email}
                      autoComplete="email"
                      dir="ltr"
                      aria-invalid={!!errors.email || undefined}
                    />
                  </Field>

                  <Field label={copy.industry}>
                    <Select name="industry" defaultValue="steel">
                      {INDUSTRIES.map((key) => (
                        <option key={key} value={key}>
                          {dict.industries.items[key]}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label={copy.province}>
                    <Select name="province" defaultValue={PROVINCES[0]}>
                      {PROVINCES.map((province) => (
                        <option key={province} value={province}>
                          {province}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label={copy.monthlyBill} error={errors.monthly_bill}>
                    <Input
                      name="monthly_bill"
                      inputMode="numeric"
                      className="tabular"
                      aria-invalid={!!errors.monthly_bill || undefined}
                      value={bill ? formatNumber(Number(bill), locale) : ""}
                      // Persian keyboards type Persian digits, and the field shows
                      // them too, so normalise before keeping only the digits.
                      onChange={(event) =>
                        setBill(toLatinDigits(event.target.value).replace(/\D/g, "").replace(/^0+/, "").slice(0, 15))
                      }
                    />
                  </Field>

                  <Field label={copy.message} error={errors.message} className="sm:col-span-2">
                    <Textarea
                      name="message"
                      rows={3}
                      maxLength={LEAD_LIMITS.message}
                      placeholder={copy.messagePlaceholder}
                      aria-invalid={!!errors.message || undefined}
                    />
                  </Field>

                  <div className="sm:col-span-2">
                    {/* Always mounted, so the polite announcement fires when a
                        message arrives. The "check the fields" summary goes
                        once the flagged fields are fixed. */}
                    <div role="status">
                      {banner && (banner !== copy.checkFields || Object.values(errors).some(Boolean)) && (
                        <p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-ink">
                          <AlertCircle className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden />
                          {banner}
                        </p>
                      )}
                    </div>
                    <Button type="submit" size="lg" loading={sending} className="w-full">
                      {!sending && <Send className="size-4 rtl:-scale-x-100" aria-hidden />}
                      {sending ? copy.submitting : copy.submit}
                    </Button>
                  </div>
                </form>
              )}
            </Card>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
