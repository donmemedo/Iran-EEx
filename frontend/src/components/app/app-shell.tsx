"use client";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from "framer-motion";
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
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import useSWR from "swr";

import { Logo, LogoMark } from "@/components/marketing/logo";
import { Button } from "@/components/ui/button";
import { LocaleToggle, ThemeToggle } from "@/components/ui/toggles";
import { useAuth } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { useLocale } from "@/lib/locale-context";
import { clamp, cn, project, rubberband } from "@/lib/utils";

const NAV = [
  { key: "dashboard", path: "", Icon: LayoutDashboard },
  { key: "sites", path: "/sites", Icon: Building2 },
  { key: "bills", path: "/bills", Icon: Receipt },
  { key: "findings", path: "/findings", Icon: Sparkles },
  { key: "alerts", path: "/alerts", Icon: Bell },
  { key: "savings", path: "/savings", Icon: PiggyBank },
  { key: "settings", path: "/settings", Icon: Settings },
] as const;

const DRAWER_ID = "app-drawer";
/** Movement before a press becomes a drag, so taps and scrolls stay taps and scrolls. */
const HYSTERESIS_PX = 10;
/** Above this release speed the direction of the flick decides, not the position. */
const FLICK_PX_S = 200;
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function AppShell({ children }: { children: ReactNode }) {
  const { dict, href, dir, locale } = useLocale();
  const { user, status, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // The badge only needs a number; the API counts within the organisation.
  const { data: alertCount } = useSWR<{ unacknowledged: number }>(
    status === "authenticated" ? "/api/v1/alerts/count" : null,
    { refreshInterval: 60_000 },
  );
  const unread = alertCount?.unacknowledged ?? 0;

  useEffect(() => {
    if (status === "anonymous") router.replace(href("/login"));
  }, [status, router, href]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const drawer = useDrawer(mobileOpen, setMobileOpen, dir);

  if (status !== "authenticated") {
    return (
      <div
        role="status"
        aria-label={dict.common.loading}
        className="flex min-h-dvh items-center justify-center bg-plane"
      >
        <LogoMark className="size-10 animate-pulse" />
      </div>
    );
  }

  const navItems = NAV.map((item) => {
    const target = href(`/app${item.path}`);
    const active = item.path === "" ? pathname === target : pathname.startsWith(target);
    return { ...item, target, active };
  });
  const current = navItems.find((item) => item.active);
  const role = dict.app.settings.roles[(user?.role ?? "manager") as keyof typeof dict.app.settings.roles];

  const nav = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      {navItems.map((item) => (
        <NavLink
          key={item.key}
          href={item.target}
          Icon={item.Icon}
          active={item.active}
          badge={item.key === "alerts" && unread > 0 ? unread : undefined}
          badgeLabel={formatNumber(unread, locale)}
        >
          {dict.app.nav[item.key]}
        </NavLink>
      ))}
    </nav>
  );
  const userCard = (
    <div className="border-t border-line p-3">
      <UserCard
        name={user?.full_name ?? ""}
        role={role}
        onLogout={logout}
        logoutLabel={dict.app.nav.logout}
        accountHref={href("/app/settings")}
        accountLabel={dict.app.nav.account}
      />
    </div>
  );

  return (
    <div className="min-h-dvh bg-plane">
      {/* Sidebar - a structural region, so it sits on a heavier surface. */}
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 flex-col border-e border-line bg-surface lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo href={href("/app")} name={dict.common.brand} latin={dict.common.brandLatin} />
        </div>
        {nav}
        {userCard}
      </aside>

      {/* Mobile drawer. Closed, it is invisible and inert, so nothing in it is tabbable. */}
      <div
        className={cn("pointer-events-none fixed inset-0 z-50 lg:hidden", !drawer.live && "invisible")}
        inert={!drawer.live}
      >
        <motion.div
          aria-hidden
          style={{ opacity: drawer.scrimOpacity }}
          className={cn(
            "absolute inset-0 bg-black/40 backdrop-blur-[2px]",
            "[@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none",
            mobileOpen && "pointer-events-auto",
          )}
          onClick={() => setMobileOpen(false)}
        />
        <motion.aside
          ref={drawer.panelRef}
          id={DRAWER_ID}
          role="dialog"
          aria-modal="true"
          aria-label={dict.common.menu}
          style={{ x: drawer.x, opacity: drawer.panelOpacity }}
          onKeyDown={drawer.trapFocus}
          {...drawer.dragHandlers}
          className={cn(
            "pointer-events-auto absolute inset-y-0 start-0 flex w-72 touch-pan-y flex-col select-none border-e border-line bg-surface shadow-[var(--shadow-lg)]",
            // Surface beyond the start edge, so a rubber-banded or bouncing
            // drawer never shows a gap at the screen edge.
            "before:absolute before:inset-y-0 before:end-full before:w-16 before:bg-surface",
          )}
        >
          <div className="flex h-16 items-center justify-between px-5">
            <Logo href={href("/app")} name={dict.common.brand} latin={dict.common.brandLatin} />
            <button
              ref={drawer.closeRef}
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label={dict.common.close}
              className="tap-target flex size-8 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink active:scale-90"
            >
              <X className="size-4" />
            </button>
          </div>
          {nav}
          {userCard}
        </motion.aside>
      </div>

      {/* Everything behind an open drawer is inert: no focus, no clicks, no screen reader. */}
      <div className="lg:ps-64" inert={mobileOpen}>
        {/* The top bar is translucent with content scrolling underneath it. */}
        <header className="glass glass-edge sticky top-0 z-30 border-b border-line">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <Button
              ref={drawer.triggerRef}
              variant="ghost"
              size="sm"
              className="!px-2 lg:hidden"
              aria-label={dict.common.menu}
              aria-haspopup="dialog"
              aria-expanded={mobileOpen}
              aria-controls={DRAWER_ID}
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-5" />
            </Button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold text-ink">
                {dict.app.nav[current?.key ?? "dashboard"]}
              </h1>
            </div>

            <Link
              href={href("/app/alerts")}
              aria-label={
                unread > 0
                  ? `${dict.app.nav.alerts}: ${formatNumber(unread, locale)} ${dict.app.alerts.unacknowledged}`
                  : dict.app.nav.alerts
              }
              className="tap-target flex size-9 items-center justify-center rounded-md border border-line bg-surface-2 text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink active:scale-[0.93]"
            >
              <Bell className="size-4" />
              {unread > 0 && (
                <span
                  aria-hidden
                  className="absolute -top-1 -end-1 flex min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[0.5625rem] font-bold text-white tabular"
                >
                  {unread > 99 ? formatNumber(99, locale) + "+" : formatNumber(unread, locale)}
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

/**
 * The mobile drawer's motion and focus.
 *
 * One value, `progress` (0 closed, 1 open), drives everything: the panel slides
 * with it, the scrim fades with it, and under Reduce Motion the panel fades
 * instead of sliding. A drag sets it 1:1 with the pointer; a release hands the
 * pointer's velocity to a spring that starts from wherever the panel is, so any
 * animation can be caught mid-flight.
 */
function useDrawer(open: boolean, setOpen: (open: boolean) => void, dir: "rtl" | "ltr") {
  const reduceMotion = useReducedMotion() ?? false;
  const progress = useMotionValue(0);
  const animation = useRef<AnimationPlaybackControls | null>(null);
  const target = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // The panel slides out toward its own start edge: left in LTR, right in RTL.
  const closedSign = dir === "rtl" ? 1 : -1;
  const x = useTransform(progress, (p) => (reduceMotion ? "0%" : `${(1 - p) * closedSign * 100}%`));
  const panelOpacity = useTransform(progress, (p) => (reduceMotion ? clamp(p, 0, 1) : 1));
  const scrimOpacity = useTransform(progress, (p) => clamp(p, 0, 1));

  // Rendered and interactive while open or still on screen (closing, or caught mid-close).
  const [onScreen, setOnScreen] = useState(false);
  useMotionValueEvent(progress, "change", (p) => setOnScreen(p > 0));
  const live = open || onScreen;

  // Without an explicit release velocity the spring inherits the value's own,
  // so re-targeting mid-flight (close pressed while opening) has no seam.
  const settle = useCallback(
    (next: boolean, velocity?: number, flick = false) => {
      target.current = next;
      animation.current?.stop();
      animation.current = animate(
        progress,
        next ? 1 : 0,
        reduceMotion
          ? { duration: 0.2, ease: "easeOut" }
          : {
              type: "spring",
              // Critically damped by default; a little bounce only when a flick threw it open.
              bounce: flick && next ? 0.15 : 0,
              duration: 0.4,
              ...(velocity === undefined ? {} : { velocity }),
            },
      );
    },
    [progress, reduceMotion],
  );

  // Open/close from a button, the scrim, Escape or a route change.
  useEffect(() => {
    if (target.current !== open) settle(open);
  }, [open, settle]);

  // Focus goes into the drawer on open and back to the trigger on close.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      closeRef.current?.focus({ preventScroll: true });
    } else if (wasOpen.current) {
      const active = document.activeElement;
      if (!active || active === document.body || panelRef.current?.contains(active)) {
        triggerRef.current?.focus({ preventScroll: true });
      }
    }
    wasOpen.current = open;
  }, [open]);

  // While open: Escape closes, the page behind does not scroll, and growing
  // past the breakpoint closes it (the page behind is inert while it is open).
  useEffect(() => {
    if (!open) return;
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    const wide = window.matchMedia("(min-width: 64rem)");
    function onWide() {
      if (wide.matches) setOpen(false);
    }
    const { body, documentElement } = document;
    const previous = { overflow: body.style.overflow, padding: body.style.paddingInlineEnd };
    // Keep the layout from shifting where the scrollbar takes up space.
    const scrollbar = window.innerWidth - documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingInlineEnd = `${scrollbar}px`;
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      body.style.overflow = previous.overflow;
      body.style.paddingInlineEnd = previous.padding;
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open, setOpen]);

  // Tab and Shift+Tab wrap inside the open drawer.
  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab" || !panelRef.current) return;
    const items = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // --- drag to dismiss -------------------------------------------------------
  const drag = useRef<{
    id: number;
    x0: number;
    y0: number;
    p0: number;
    width: number;
    tracking: boolean;
    caught: boolean;
    samples: { t: number; x: number }[];
  } | null>(null);
  const suppressClick = useRef(false);

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    suppressClick.current = false;
    // Touching a moving drawer stops it where it is, like catching it.
    const moving = !!animation.current && progress.get() !== (target.current ? 1 : 0);
    if (moving) animation.current?.stop();
    drag.current = {
      id: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      p0: progress.get(),
      width: event.currentTarget.offsetWidth || 288,
      tracking: false,
      caught: moving,
      samples: [{ t: event.timeStamp, x: event.clientX }],
    };
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    if (!state.tracking) {
      const dx = event.clientX - state.x0;
      const dy = event.clientY - state.y0;
      if (Math.abs(dy) > HYSTERESIS_PX && Math.abs(dy) > Math.abs(dx)) {
        // A vertical scroll of the nav, not a drag. Let any caught animation finish.
        end(event);
        return;
      }
      if (Math.abs(dx) < HYSTERESIS_PX) return;
      // Commit. Track from here and from the current position, so nothing jumps.
      state.tracking = true;
      state.x0 = event.clientX;
      state.p0 = progress.get();
      animation.current?.stop();
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const openSign = -closedSign;
    const raw = state.p0 + ((event.clientX - state.x0) * openSign) / state.width;
    // Past fully open the drawer resists progressively instead of stopping dead.
    progress.set(raw > 1 ? 1 + rubberband(raw - 1, 1) : Math.max(0, raw));
    state.samples.push({ t: event.timeStamp, x: event.clientX });
    while (state.samples.length > 2 && event.timeStamp - state.samples[0].t > 100) state.samples.shift();
  }

  function end(event: PointerEvent<HTMLElement>) {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    drag.current = null;
    if (!state.tracking) {
      // A tap or a scroll. If it caught a moving drawer, let it carry on.
      if (state.caught) settle(target.current);
      return;
    }
    suppressClick.current = true;

    // Release velocity from the last ~100ms of movement; a finger that rested
    // before lifting has none.
    const first = state.samples[0];
    const last = state.samples[state.samples.length - 1];
    const dt = last.t - first.t;
    const velocityPx = dt > 0 && event.timeStamp - last.t < 50 ? ((last.x - first.x) / dt) * 1000 : 0;

    const openSign = -closedSign;
    const velocity = (velocityPx * openSign) / state.width; // progress per second
    const projected = progress.get() + (project(velocityPx) * openSign) / state.width;
    const flick = Math.abs(velocityPx) > FLICK_PX_S;
    const next = flick ? velocity > 0 : projected > 0.5;

    settle(next, velocity, flick);
    setOpen(next);
  }

  return {
    live,
    x,
    panelOpacity,
    scrimOpacity,
    panelRef,
    closeRef,
    triggerRef,
    trapFocus,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      onLostPointerCapture: end,
      // A drag that ends over a link must not also follow it.
      onClickCapture: (event: { preventDefault: () => void; stopPropagation: () => void }) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
    },
  };
}

function NavLink({
  href,
  Icon,
  active,
  badge,
  badgeLabel,
  children,
}: {
  href: string;
  Icon: typeof Gauge;
  active: boolean;
  badge?: number;
  badgeLabel?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-[0.8125rem] font-medium",
        "transition-[color,background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.985] active:duration-75",
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
          {badgeLabel ?? badge}
        </span>
      )}
    </Link>
  );
}

/**
 * The account menu. It is a real ARIA menu: the trigger announces it, arrow
 * keys move between items, Escape closes it and returns focus, and it grows
 * out of the trigger's corner and shrinks back into it along the same path.
 */
function UserCard({
  name,
  role,
  onLogout,
  logoutLabel,
  accountHref,
  accountLabel,
}: {
  name: string;
  role: string;
  onLogout: () => void;
  logoutLabel: string;
  accountHref: string;
  accountLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();
  const menuId = useId();
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    function onPointerDown(event: globalThis.PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) {
      // Handled here, so an enclosing drawer stays open.
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (!open) {
      if (event.target === triggerRef.current && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const moves: Record<string, number> = {
      ArrowDown: (index + 1) % items.length,
      ArrowUp: (index - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    };
    if (!(event.key in moves) || items.length === 0) return;
    event.preventDefault();
    items[moves[event.key]].focus();
  }

  const item =
    "flex min-h-11 w-full items-center gap-2 rounded-sm px-2.5 text-xs text-ink-2 transition-colors " +
    "hover:bg-surface-2 focus-visible:bg-surface-2 active:bg-surface-3 active:duration-0";

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 rounded-md p-2 text-start transition-[background-color,transform] duration-150 hover:bg-surface-2 active:scale-[0.98] active:duration-75"
      >
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand"
        >
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

      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-labelledby={triggerId}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", bounce: 0, duration: 0.25 }}
            className={cn(
              "absolute bottom-full start-0 z-10 mb-1 w-full overflow-hidden rounded-md border border-line bg-surface p-1 shadow-[var(--shadow-lg)]",
              // Grow out of the trigger's corner: bottom-start, in either direction.
              "ltr:origin-bottom-left rtl:origin-bottom-right",
            )}
          >
            <Link href={accountHref} role="menuitem" tabIndex={-1} className={item}>
              <UserRound className="size-3.5" />
              {accountLabel}
            </Link>
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={onLogout}
              className={cn(item, "hover:text-critical")}
            >
              <LogOut className="size-3.5" />
              {logoutLabel}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
