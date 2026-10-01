import type { Metadata, Viewport } from "next";
import { Manrope, Noto_Sans_Arabic } from "next/font/google";
import { ConnectivityBanner } from "@/components/connectivity-banner";
import { InstallAppBanner } from "@/components/install-app-banner";
import { PwaRegister } from "@/components/pwa-register";
import { AppShell } from "@/components/app-shell";
import { I18nProvider } from "@/i18n/client";
import { dirOf } from "@/i18n/config";
import { getLocale, getMessages, getT } from "@/i18n/server";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

// Only downloaded when an Arabic page actually uses it (preload: false).
const notoArabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["500", "600", "700", "800"],
  preload: false,
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
    <html lang={locale} dir={dirOf(locale)} className={`${manrope.variable} ${notoArabic.variable} h-full antialiased`}>
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
