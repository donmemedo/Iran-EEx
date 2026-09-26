"use client";

import { Check, Download, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/app/pieces";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { locales, localeMeta } from "@/i18n/config";
import { useAuth } from "@/lib/auth";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";
import { usePathname, useRouter } from "next/navigation";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function SettingsPage() {
  const { dict, locale } = useLocale();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setMounted(true);
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const themes = [
    { value: "light", label: dict.common.themeLight, Icon: Sun },
    { value: "dark", label: dict.common.themeDark, Icon: Moon },
    { value: "system", label: dict.common.themeSystem, Icon: Monitor },
  ];

  return (
    <>
      <PageHeader title={dict.app.settings.title} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={dict.app.settings.account} />
          <dl className="mt-3 divide-y divide-[var(--line)] border-t border-line text-xs">
            <Row label={dict.app.settings.name} value={user?.full_name ?? "—"} />
            <Row label={dict.app.settings.email} value={user?.email ?? "—"} ltr />
            <Row
              label={dict.app.settings.role}
              value={
                dict.app.settings.roles[(user?.role ?? "manager") as keyof typeof dict.app.settings.roles]
              }
            />
            <Row
              label={dict.app.settings.organization}
              value={
                (locale === "fa" ? user?.organization_name_fa : user?.organization_name_en) ?? "—"
              }
            />
          </dl>
        </Card>

        <Card>
          <CardHeader title={dict.app.settings.appearance} />
          <div className="p-5">
            <div className="grid grid-cols-3 gap-2">
              {themes.map((item) => {
                const active = mounted && theme === item.value;
                return (
                  <button
                    key={item.value}
                    onClick={() => setTheme(item.value)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-[--radius-md] border p-4 transition-[border-color,background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97]",
                      active
                        ? "border-brand bg-brand-soft text-brand"
                        : "border-line bg-surface-2 text-ink-2 hover:border-line-strong",
                    )}
                  >
                    <item.Icon className="size-4" />
                    <span className="text-[0.6875rem] font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={dict.app.settings.language} />
          <div className="p-5">
            <div className="grid grid-cols-2 gap-2">
              {locales.map((value) => {
                const active = locale === value;
                return (
                  <button
                    key={value}
                    onClick={() =>
                      router.push(pathname.replace(new RegExp(`^/${locale}`), `/${value}`))
                    }
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-[--radius-md] border p-4 transition-colors duration-150 active:scale-[0.97]",
                      active
                        ? "border-brand bg-brand-soft text-brand"
                        : "border-line bg-surface-2 text-ink-2 hover:border-line-strong",
                    )}
                  >
                    <span className="text-sm font-medium">{localeMeta[value].label}</span>
                    {active && <Check className="size-4" />}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={dict.app.settings.install} hint={dict.app.settings.installBody} />
          <div className="p-5">
            <Button
              disabled={installed || !installEvent}
              onClick={async () => {
                if (!installEvent) return;
                await installEvent.prompt();
                const choice = await installEvent.userChoice;
                if (choice.outcome === "accepted") setInstalled(true);
                setInstallEvent(null);
              }}
            >
              <Download className="size-4" />
              {installed ? dict.app.settings.installed : dict.app.settings.installAction}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-medium text-ink" dir={ltr ? "ltr" : undefined}>
        {value}
      </dd>
    </div>
  );
}
