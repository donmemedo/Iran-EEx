import type { ReactNode } from "react";

/**
 * The real <html> element is rendered by the [locale] layout, which knows the
 * language and direction. This root only exists to satisfy the App Router.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
