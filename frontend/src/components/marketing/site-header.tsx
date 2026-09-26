"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { LocaleToggle, ThemeToggle } from "@/components/ui/toggles";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

import { Logo } from "./logo";

export function SiteHeader() {
  const { dict, href } = useLocale();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock the page behind the mobile sheet.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const links = [
    { href: "#platform", label: dict.nav.platform },
    { href: "#how", label: dict.nav.howItWorks },
    { href: "#calculator", label: dict.nav.calculator },
    { href: "#industries", label: dict.nav.industries },
    { href: "#pricing", label: dict.nav.pricing },
  ];

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ease-[var(--ease-out)]",
          // The bar is a translucent layer with content scrolling under it, and
          // only gains its edge once something is actually behind it.
          scrolled ? "glass glass-edge border-b border-line" : "border-b border-transparent",
        )}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Logo href={href("/")} name={dict.common.brand} latin={dict.common.brandLatin} />

          <nav className="mx-auto hidden items-center gap-1 lg:flex">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-[--radius-sm] px-3 py-2 text-[0.8125rem] font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-2 lg:ms-0">
            <ThemeToggle />
            <LocaleToggle className="hidden sm:inline-flex" />
            <ButtonLink href={href("/login")} variant="ghost" size="sm" className="hidden sm:inline-flex">
              {dict.nav.login}
            </ButtonLink>
            <ButtonLink href="#contact" size="sm" className="hidden sm:inline-flex">
              {dict.nav.requestDemo}
            </ButtonLink>
            <Button
              variant="secondary"
              size="sm"
              className="!px-2.5 lg:hidden"
              aria-label={dict.common.menu}
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <Menu className="size-4" /> : <Menu className="size-4" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile sheet. It enters and leaves along the same path - down from the
          bar it belongs to - so dismissing it feels like the reverse of opening. */}
      <div
        className={cn(
          "fixed inset-0 z-40 lg:hidden",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!open}
      >
        <div
          className={cn(
            "absolute inset-0 bg-[var(--plane)]/70 backdrop-blur-sm transition-opacity duration-200 ease-[var(--ease-out)]",
            open ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setOpen(false)}
        />
        <div
          className={cn(
            "absolute inset-x-0 top-16 origin-top border-b border-line bg-surface p-4 shadow-[var(--shadow-lg)]",
            "transition-[transform,opacity] duration-250 ease-[var(--ease-drawer)]",
            open ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0",
          )}
        >
          <nav className="flex flex-col">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-[--radius-md] px-3 py-3 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
            <ButtonLink href={href("/login")} variant="secondary" size="sm" className="flex-1">
              {dict.nav.login}
            </ButtonLink>
            <ButtonLink href="#contact" size="sm" className="flex-1" onClick={() => setOpen(false)}>
              {dict.nav.requestDemo}
            </ButtonLink>
            <LocaleToggle />
          </div>
        </div>
      </div>
    </>
  );
}

export function SiteFooter() {
  const { dict, href } = useLocale();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Logo href={href("/")} name={dict.common.brand} latin={dict.common.brandLatin} />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-3">{dict.footer.tagline}</p>
            <p className="mt-4 text-xs leading-relaxed text-ink-3">{dict.footer.demoNote}</p>
          </div>

          <FooterColumn
            title={dict.footer.product}
            links={[
              { href: "#platform", label: dict.nav.platform },
              { href: "#calculator", label: dict.nav.calculator },
              { href: "#pricing", label: dict.nav.pricing },
              { href: "#security", label: dict.nav.security },
            ]}
          />
          <FooterColumn
            title={dict.footer.company}
            links={[
              { href: "#how", label: dict.nav.howItWorks },
              { href: "#industries", label: dict.nav.industries },
              { href: "#contact", label: dict.footer.contact },
            ]}
          />
          <FooterColumn
            title={dict.footer.legal}
            links={[
              { href: "#security", label: dict.footer.privacy },
              { href: "#pricing", label: dict.footer.terms },
            ]}
          />
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-xs text-ink-3">
          <span>
            © {year} {dict.common.brand} · {dict.footer.rights}
          </span>
          <span>{dict.footer.address}</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-ink">{title}</h4>
      <ul className="mt-3 space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="text-sm text-ink-3 transition-colors duration-150 hover:text-ink"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
