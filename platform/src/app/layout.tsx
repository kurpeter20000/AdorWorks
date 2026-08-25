import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { ConnectivityBanner } from "@/components/connectivity-banner";
import { InstallAppBanner } from "@/components/install-app-banner";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-cloud text-midnight">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-midnight focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <ConnectivityBanner />
        <InstallAppBanner />
        <PwaRegister />
        <div id="main-content">{children}</div>
      </body>
    </html>
  );
}
