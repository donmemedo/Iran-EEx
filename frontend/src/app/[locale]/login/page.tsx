"use client";

import { ArrowLeft, ArrowRight, Eye, EyeOff, LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Logo } from "@/components/marketing/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { LocaleToggle, ThemeToggle } from "@/components/ui/toggles";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { useLocale } from "@/lib/locale-context";

// The demo users exist only when the backend seeds them (SEED_ON_STARTUP=true).
// The flag is inlined at build time, so production bundles carry no credentials.
const DEMO =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" ? { email: "demo@eex.ir", password: "demo1234" } : null;

export default function LoginPage() {
  const { dict, href, dir, locale } = useLocale();
  const { login, status } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState(DEMO?.email ?? "");
  const [password, setPassword] = useState(DEMO?.password ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const Arrow = dir === "rtl" ? ArrowRight : ArrowLeft;

  useEffect(() => {
    if (status === "authenticated") router.replace(href("/app"));
  }, [status, router, href]);

  function errorMessage(error: unknown): string {
    if (error instanceof ApiError && error.status === 429) {
      const seconds = error.retryAfter;
      if (!seconds) return dict.auth.tooManyAttemptsLater;
      const inMinutes = seconds >= 60;
      const wait = formatNumber(inMinutes ? Math.ceil(seconds / 60) : seconds, locale, {
        style: "unit",
        unit: inMinutes ? "minute" : "second",
        unitDisplay: "long",
      });
      return dict.auth.tooManyAttempts.replace("{wait}", wait);
    }
    // Any other 4xx means the server rejected the credentials.
    if (error instanceof ApiError && error.status < 500) return dict.auth.invalid;
    // 5xx, or fetch() rejected because the server could not be reached.
    return dict.auth.unreachable;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace(href("/app"));
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-plane">
      <div className="aurora" aria-hidden />

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Logo href={href("/")} name={dict.common.brand} latin={dict.common.brandLatin} />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LocaleToggle />
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Card className="p-7 shadow-[var(--shadow-lg)] sm:p-8">
            <h1 className="text-xl font-bold tracking-tight text-ink">{dict.auth.title}</h1>
            <p className="mt-1.5 text-sm text-ink-2">{dict.auth.subtitle}</p>

            <form onSubmit={onSubmit} className="mt-7 space-y-4">
              <Field label={dict.auth.email}>
                <Input
                  type="email"
                  dir="ltr"
                  required
                  maxLength={254}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>

              <Field label={dict.auth.password}>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    dir="ltr"
                    required
                    maxLength={128}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pe-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? dict.auth.hidePassword : dict.auth.showPassword}
                    className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-ink-3 transition-colors hover:text-ink"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>

              {/* Form-level, not under one field: "server unreachable" is about neither input. */}
              {error && (
                <p role="alert" className="text-xs text-critical">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" loading={submitting} className="w-full">
                {!submitting && <LogIn className="size-4" />}
                {submitting ? dict.auth.submitting : dict.auth.submit}
              </Button>
            </form>

            {DEMO && (
              <div className="mt-6 rounded-md border border-line bg-surface-2 p-4">
                <h2 className="text-xs font-semibold text-ink">{dict.auth.demoTitle}</h2>
                <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-2">{dict.auth.demoBody}</p>
                <dl className="mt-2.5 space-y-1 text-[0.6875rem] tabular" dir="ltr">
                  <div className="flex gap-2">
                    <dt className="text-ink-3">email</dt>
                    <dd className="font-medium text-ink">{DEMO.email}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-ink-3">password</dt>
                    <dd className="font-medium text-ink">{DEMO.password}</dd>
                  </div>
                </dl>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => {
                    setEmail(DEMO.email);
                    setPassword(DEMO.password);
                  }}
                >
                  {dict.auth.useDemo}
                </Button>
              </div>
            )}
          </Card>

          <Link
            href={href("/")}
            className="mt-6 inline-flex items-center gap-1.5 text-xs text-ink-3 transition-colors hover:text-ink"
          >
            <Arrow className="size-3.5" />
            {dict.auth.backHome}
          </Link>
        </div>
      </main>
    </div>
  );
}
