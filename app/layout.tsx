import type { Metadata, Viewport } from "next";
import { Libre_Baskerville, Karla, IBM_Plex_Mono } from "next/font/google";
import { EvmProvider } from "@/components/providers/EvmProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { app } from "@/lib/app-config";
import "./globals.css";

const head = Libre_Baskerville({ variable: "--font-head", subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const text = Karla({ variable: "--font-text", subsets: ["latin"], display: "swap" });
const num = IBM_Plex_Mono({ variable: "--font-num", subsets: ["latin"], weight: ["400", "500"], display: "swap" });

export const metadata: Metadata = {
  title: `${app.name} — ${app.tagline}`,
  description: app.tagline,
  openGraph: { title: app.name, description: app.tagline, type: "website", url: app.url },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#F7F8F6" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${head.variable} ${text.variable} ${num.variable} h-full`}>
      <body className="min-h-full antialiased">
        <EvmProvider>
          <ToastProvider>{children}</ToastProvider>
        </EvmProvider>
      </body>
    </html>
  );
}
