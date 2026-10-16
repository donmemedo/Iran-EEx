import { NextResponse, type NextRequest } from "next/server";

import { defaultLocale, isLocale, locales } from "@/i18n/config";

const PUBLIC_FILE = /\.(.*)$/;

/** Send every unprefixed path to a locale, preferring the browser's language. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/sw.js" ||
    pathname === "/manifest.webmanifest" ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const hasLocale = locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
  if (hasLocale) return NextResponse.next();

  // Browsers list languages in preference order; take the first one we support.
  // (A substring check picked fa for "en-US,en;q=0.9,fa;q=0.8".)
  const preferred =
    (request.headers.get("accept-language") ?? "")
      .split(",")
      .map((tag) => tag.trim().slice(0, 2).toLowerCase())
      .find(isLocale) ?? defaultLocale;

  // No open redirect: the target is a clone of this request's URL and its path
  // always starts with /{locale}, so a path like //evil.example stays on this
  // origin. `preferred` comes from our own list, never from the raw header.
  const url = request.nextUrl.clone();
  url.pathname = `/${preferred}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
