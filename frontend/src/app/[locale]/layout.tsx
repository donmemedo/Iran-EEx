import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";

import "@fontsource-variable/vazirmatn";
import "@fontsource-variable/inter";
import "../globals.css";

import { Providers } from "@/components/providers";
import { getDictionary } from "@/i18n";
import { isLocale, locales, localeMeta, type Locale } from "@/i18n/config";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(locale);
  return {
    title: { default: dict.meta.title, template: `%s · ${dict.common.brand}` },
    description: dict.meta.description,
    applicationName: dict.meta.shortName,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: dict.meta.shortName,
      statusBarStyle: "black-translucent",
    },
    icons: {
      icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
    openGraph: {
      title: dict.meta.title,
      description: dict.meta.description,
      type: "website",
      locale: locale === "fa" ? "fa_IR" : "en_US",
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#07090a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dict = getDictionary(locale);
  const { dir } = localeMeta[locale as Locale];

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body>
        <Providers locale={locale as Locale} dict={dict}>
          {children}
        </Providers>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js').catch(function () {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
