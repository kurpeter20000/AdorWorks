import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ConnectivityBanner } from "@/components/connectivity-banner";
import { InstallAppBanner } from "@/components/install-app-banner";
import { PwaRegister } from "@/components/pwa-register";
import { AppShell } from "@/components/app-shell";
import { I18nProvider } from "@/i18n/client";
import { dirOf } from "@/i18n/config";
import { getLocale, getMessages, getT } from "@/i18n/server";
import "./globals.css";

// Fonts are self-hosted (files in ./fonts, variable-weight woff2 from
// Google Fonts, SIL Open Font License). next/font/google downloaded them
// from fonts.googleapis.com during every build, with no retry, and that
// fetch kept failing intermittently in CI ("Run npm run build" in the
// Lighthouse job). Local files make the build fully offline.
const manrope = localFont({
  src: "./fonts/manrope-latin.woff2",
  variable: "--font-manrope",
  weight: "500 800",
  display: "swap",
});

// Only downloaded when an Arabic page actually uses it (preload: false).
const notoArabic = localFont({
  src: "./fonts/noto-sans-arabic.woff2",
  variable: "--font-arabic",
  weight: "500 800",
  display: "swap",
  preload: false,
});

// The public site's display face, used only for headings on the sign-in
// pages. Declared here so its @font-face lands in the main stylesheet (a
// font declared in a nested layout ships as an extra render-blocking CSS
// file), and preload: false so nothing downloads unless a heading on the
// page actually uses it.
const fraunces = localFont({
  src: [
    { path: "./fonts/fraunces-latin.woff2", style: "normal" },
    { path: "./fonts/fraunces-latin-italic.woff2", style: "italic" },
  ],
  variable: "--font-fraunces",
  weight: "400 500",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
});

export const metadata: Metadata = {
  title: {
    default: "AdorWorks",
    template: "%s — AdorWorks",
  },
  description: "Talent found. Work delivered.",
  icons: {
    icon: "/icons/icon-any-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AdorWorks",
  },
};

export const viewport: Viewport = {
  themeColor: "#182230",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const t = await getT();
  return (
    <html lang={locale} dir={dirOf(locale)} className={`${manrope.variable} ${notoArabic.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-cloud text-midnight">
        <I18nProvider locale={locale} messages={getMessages(locale)}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-50 focus:rounded-lg focus:bg-midnight focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          {t("Skip to content")}
        </a>
        <div className="sticky top-0 z-40">
          <ConnectivityBanner />
        </div>
        <InstallAppBanner />
        <PwaRegister />
        <AppShell>{children}</AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
