import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { APP_LOCALE } from "@/lib/copy/dictionary";
import localFont from "next/font/local";
import { AuthProvider } from "@/components/auth/auth-provider";
import { CopyProvider } from "@/lib/copy/provider";
import { RouteTransition } from "@/components/layout/route-transition";
import { AppShellSwitcher } from "@/components/layout/app-shell";
import { QueryProvider } from "@/components/layout/query-provider";
import { ToastProvider } from "@/components/ui/toast-provider";
import "./globals.css";

const fraunces = localFont({
  src: [
    { path: "./fonts/fraunces-latin-full-normal.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/fraunces-latin-ext-full-normal.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-heading",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

const sourceSans3 = localFont({
  src: [
    { path: "./fonts/source-sans-3-latin-wght-normal.woff2", weight: "200 900", style: "normal" },
    { path: "./fonts/source-sans-3-latin-ext-wght-normal.woff2", weight: "200 900", style: "normal" },
    { path: "./fonts/source-sans-3-latin-wght-italic.woff2", weight: "200 900", style: "italic" },
    { path: "./fonts/source-sans-3-latin-ext-wght-italic.woff2", weight: "200 900", style: "italic" },
  ],
  variable: "--font-body",
  display: "swap",
  adjustFontFallback: "Arial",
});

// Nonce CSP needs request-time rendering even without a locale cookie.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Global Scholars Program",
  description: "Global Scholars Program frontend",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      suppressHydrationWarning
      lang={APP_LOCALE}
      className={`${fraunces.variable} ${sourceSans3.variable} h-full antialiased`}
      style={{ "--font-heading": fraunces.style.fontFamily, "--font-body": sourceSans3.style.fontFamily } as CSSProperties}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <QueryProvider>
            <CopyProvider>
              <ToastProvider>
                <RouteTransition>
                  <AppShellSwitcher>{children}</AppShellSwitcher>
                </RouteTransition>
              </ToastProvider>
            </CopyProvider>
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
