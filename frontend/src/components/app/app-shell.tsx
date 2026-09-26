"use client";

import {
  Bell,
  Building2,
  ChevronDown,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  PiggyBank,
  Receipt,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import useSWR from "swr";

import { Logo, LogoMark } from "@/components/marketing/logo";
import { Button } from "@/components/ui/button";
import { LocaleToggle, ThemeToggle } from "@/components/ui/toggles";
import type { Alert } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

const NAV = [
  { key: "dashboard", path: "", Icon: LayoutDashboard },
  { key: "sites", path: "/sites", Icon: Building2 },
  { key: "bills", path: "/bills", Icon: Receipt },
  { key: "findings", path: "/findings", Icon: Sparkles },
  { key: "alerts", path: "/alerts", Icon: Bell },
  { key: "savings", path: "/savings", Icon: PiggyBank },
  { key: "settings", path: "/settings", Icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { dict, href } = useLocale();
  const { user, status, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: alerts } = useSWR<Alert[]>(
    status === "authenticated" ? "/api/v1/alerts?acknowledged=false&limit=200" : null,
  );
  const unread = alerts?.length ?? 0;

  useEffect(() => {
    if (status === "anonymous") router.replace(href("/login"));
  }, [status, router, href]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-plane">
        <LogoMark className="size-10 animate-pulse" />
      </div>
    );
  }

  const navItems = NAV.map((item) => {
    const target = href(`/app${item.path}`);
    const active = item.path === "" ? pathname === target : pathname.startsWith(target);
    return { ...item, target, active };
  });

  return (
    <div className="min-h-dvh bg-plane">
      {/* Sidebar - a structural region, so it sits on a heavier surface. */}
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 flex-col border-e border-line bg-surface lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo href={href("/app")} name={dict.common.brand} latin={dict.common.brandLatin} />
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.key}
              href={item.target}
              Icon={item.Icon}
              active={item.active}
              badge={item.key === "alerts" && unread > 0 ? unread : undefined}
            >
              {dict.app.nav[item.key]}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <UserCard name={user?.full_name ?? ""} role={dict.app.settings.roles[(user?.role ?? "manager") as keyof typeof dict.app.settings.roles]} onLogout={logout} logoutLabel={dict.app.nav.logout} />
        </div>
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn("fixed inset-0 z-50 lg:hidden", mobileOpen ? "" : "pointer-events-none")}
        aria-hidden={!mobileOpen}
      >
        <div
          className={cn(
            "absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 ease-[var(--ease-out)]",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={cn(
            "absolute inset-y-0 start-0 flex w-72 flex-col border-e border-line bg-surface shadow-[var(--shadow-lg)]",
            "transition-transform duration-300 ease-[var(--ease-drawer)]",
            mobileOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full",
          )}
        >
          <div className="flex h-16 items-center justify-between px-5">
            <Logo href={href("/app")} name={dict.common.brand} latin={dict.common.brandLatin} />
            <button
              onClick={() => setMobileOpen(false)}
              aria-label={dict.common.close}
              className="flex size-8 items-center justify-center rounded-[--radius-sm] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink active:scale-90"
            >
              <X className="size-4" />
            </button>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
            {navItems.map((item) => (
              <NavLink
                key={item.key}
                href={item.target}
                Icon={item.Icon}
                active={item.active}
                badge={item.key === "alerts" && unread > 0 ? unread : undefined}
              >
                {dict.app.nav[item.key]}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-line p-3">
            <UserCard
              name={user?.full_name ?? ""}
              role={dict.app.settings.roles[(user?.role ?? "manager") as keyof typeof dict.app.settings.roles]}
              onLogout={logout}
              logoutLabel={dict.app.nav.logout}
            />
          </div>
        </aside>
      </div>

      <div className="lg:ps-64">
        {/* The top bar is translucent with content scrolling underneath it. */}
        <header className="glass glass-edge sticky top-0 z-30 border-b border-line">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <Button
              variant="ghost"
              size="sm"
              className="!px-2 lg:hidden"
              aria-label={dict.common.menu}
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-5" />
            </Button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold text-ink">
                {navItems.find((item) => item.active)?.key
                  ? dict.app.nav[navItems.find((item) => item.active)!.key]
                  : dict.app.nav.dashboard}
              </h1>
            </div>

            <Link
              href={href("/app/alerts")}
              aria-label={dict.app.nav.alerts}
              className="relative flex size-9 items-center justify-center rounded-[--radius-md] border border-line bg-surface-2 text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink active:scale-[0.93]"
            >
              <Bell className="size-4" />
              {unread > 0 && (
                <span className="absolute -top-1 -end-1 flex min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[0.5625rem] font-bold text-white tabular">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <ThemeToggle />
            <LocaleToggle />
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}

function NavLink({
  href,
  Icon,
  active,
  badge,
  children,
}: {
  href: string;
  Icon: typeof Gauge;
  active: boolean;
  badge?: number;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-[--radius-md] px-3 py-2.5 text-[0.8125rem] font-medium",
        "transition-[color,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.985]",
        active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      {active && (
        <span className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-brand" aria-hidden />
      )}
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge !== undefined && (
        <span className="shrink-0 rounded-full bg-critical px-1.5 py-0.5 text-[0.5625rem] font-bold text-white tabular">
          {badge}
        </span>
      )}
    </Link>
  );
}

function UserCard({
  name,
  role,
  onLogout,
  logoutLabel,
}: {
  name: string;
  role: string;
  onLogout: () => void;
  logoutLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 rounded-[--radius-md] p-2 text-start transition-colors duration-150 hover:bg-surface-2 active:scale-[0.98]"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
          {name.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-ink">{name}</span>
          <span className="block truncate text-[0.625rem] text-ink-3">{role}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-ink-3 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute bottom-full inset-inline-start-0 mb-1 w-full overflow-hidden rounded-[--radius-md] border border-line bg-surface p-1 shadow-[var(--shadow-lg)]">
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-2 rounded-[--radius-sm] px-2.5 py-2 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-critical"
          >
            <LogOut className="size-3.5" />
            {logoutLabel}
          </button>
        </div>
      )}
    </div>
  );
}
