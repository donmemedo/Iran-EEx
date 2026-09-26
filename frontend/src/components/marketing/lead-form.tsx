"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Phone, Send } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { apiFetch } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { useLocale } from "@/lib/locale-context";

import { Reveal, SectionHeading } from "./reveal";

const INDUSTRIES = ["steel", "cement", "ceramic", "plastic", "food", "pharma", "textile", "other"] as const;

const PROVINCES = [
  "تهران", "البرز", "قزوین", "اصفهان", "یزد", "مرکزی", "قم",
  "خراسان رضوی", "خوزستان", "فارس", "کرمان", "آذربایجان شرقی", "بوشهر", "هرمزگان",
];

type State = "idle" | "sending" | "sent" | "error";

export function LeadForm() {
  const { dict, locale } = useLocale();
  const [state, setState] = useState<State>("idle");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [bill, setBill] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const phone = String(form.get("phone") ?? "").replace(/[۰-۹]/g, (d) =>
      String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)),
    );

    // Validate inline, as the user submits - not with a red wall afterwards.
    if (!/^0?9\d{9}$/.test(phone.replace(/\D/g, ""))) {
      setPhoneError(dict.leadForm.invalidPhone);
      return;
    }
    setPhoneError(null);
    setState("sending");

    try {
      await apiFetch("/api/v1/leads", {
        method: "POST",
        body: JSON.stringify({
          company: form.get("company"),
          contact_name: form.get("contact_name"),
          phone: phone.replace(/\D/g, ""),
          email: form.get("email") || null,
          industry: form.get("industry"),
          province: form.get("province"),
          monthly_bill: bill ? Number(bill.replace(/\D/g, "")) : null,
          message: form.get("message") || null,
          locale,
        }),
      });
      setState("sent");
    } catch {
      setState("error");
    }
  }

  return (
    <section id="contact" className="scroll-mt-24 border-t border-line bg-surface py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.25fr] lg:gap-16">
          <div>
            <SectionHeading
              eyebrow={dict.leadForm.eyebrow}
              title={dict.leadForm.title}
              subtitle={dict.leadForm.subtitle}
              align="start"
            />
            <Reveal delay={0.1} className="mt-8">
              <a
                href="tel:+982100000000"
                className="inline-flex items-center gap-3 rounded-[--radius-lg] border border-line bg-surface-2 p-4 transition-colors duration-150 hover:border-brand/30"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <Phone className="size-4" />
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
              {state === "sent" ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                  className="flex flex-col items-center py-10 text-center"
                >
                  <span className="flex size-14 items-center justify-center rounded-full bg-good/10 text-good">
                    <CheckCircle2 className="size-7" />
                  </span>
                  <h3 className="mt-5 text-base font-semibold text-ink">
                    {dict.leadForm.successTitle}
                  </h3>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-2">
                    {dict.leadForm.successBody}
                  </p>
                  <Button variant="secondary" className="mt-6" onClick={() => setState("idle")}>
                    {dict.leadForm.another}
                  </Button>
                </motion.div>
              ) : (
                <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
                  <Field label={dict.leadForm.company} className="sm:col-span-2">
                    <Input name="company" required minLength={2} autoComplete="organization" />
                  </Field>

                  <Field label={dict.leadForm.contactName}>
                    <Input name="contact_name" required minLength={2} autoComplete="name" />
                  </Field>

                  <Field label={dict.leadForm.phone} error={phoneError}>
                    <Input
                      name="phone"
                      required
                      inputMode="tel"
                      autoComplete="tel"
                      dir="ltr"
                      placeholder="09121234567"
                      className="tabular"
                      onChange={() => phoneError && setPhoneError(null)}
                    />
                  </Field>

                  <Field label={dict.leadForm.email}>
                    <Input name="email" type="email" autoComplete="email" dir="ltr" />
                  </Field>

                  <Field label={dict.leadForm.industry}>
                    <Select name="industry" defaultValue="steel">
                      {INDUSTRIES.map((key) => (
                        <option key={key} value={key}>
                          {dict.industries.items[key]}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label={dict.leadForm.province}>
                    <Select name="province" defaultValue={PROVINCES[0]}>
                      {PROVINCES.map((province) => (
                        <option key={province} value={province}>
                          {province}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label={dict.leadForm.monthlyBill}>
                    <Input
                      name="monthly_bill"
                      inputMode="numeric"
                      className="tabular"
                      value={bill ? formatNumber(Number(bill.replace(/\D/g, "")) || 0, locale) : ""}
                      onChange={(event) => setBill(event.target.value)}
                    />
                  </Field>

                  <Field label={dict.leadForm.message} className="sm:col-span-2">
                    <Textarea name="message" rows={3} placeholder={dict.leadForm.messagePlaceholder} />
                  </Field>

                  {state === "error" && (
                    <p className="text-xs text-critical sm:col-span-2">{dict.leadForm.errorBody}</p>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    loading={state === "sending"}
                    className="sm:col-span-2"
                  >
                    {state !== "sending" && <Send className="size-4" />}
                    {state === "sending" ? dict.leadForm.submitting : dict.leadForm.submit}
                  </Button>
                </form>
              )}
            </Card>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
