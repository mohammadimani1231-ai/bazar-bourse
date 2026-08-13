import type { Metadata } from "next";
import { Vazirmatn, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { ThemeProvider } from "@/components/ThemeProvider";
import { createServerSupabaseClient } from "@/lib/supabase/serverClient.ts";
import type { MarketRegime } from "@/lib/marketRegime.ts";
import "./globals.css";

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic", "latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "داشبورد بازار بورس",
  description: "تحلیل بازار بورس ایران و بازارهای جهانی",
};

// دیتای رژیم بازار/واچ‌لیست باید همیشه تازه باشد — نباید در build-time freeze شود
export const dynamic = "force-dynamic";

// طبق design_handoff_dashboard_redesign: تم پیش‌فرض روشن است. این اسکریپت پیش از هیدریشن
// (و پیش از اولین رنگ‌آمیزی) اجرا می‌شود تا data-theme را از localStorage روی <html> بگذارد —
// بدون آن یک فلش تم غلط (FOUC) بین رندر سرور (همیشه روشن) و کلاینت (ممکن است تاریک بوده) دیده می‌شد.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark")document.documentElement.dataset.theme="dark";}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createServerSupabaseClient();
  const [{ data: regimeSetting }, { data: watchlist }] = await Promise.all([
    supabase.from("settings").select("value").eq("key", "market_regime").maybeSingle(),
    supabase.from("watchlist").select("symbol, company_name"),
  ]);
  const regime = ((regimeSetting?.value as MarketRegime | undefined) ?? "normal") as MarketRegime;
  const symbolOptions = (watchlist ?? [])
    .map((w) => ({ symbol: w.symbol as string, companyName: (w.company_name as string | null) ?? null }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol, "fa"));

  return (
    <html lang="fa" dir="rtl" className={`${vazirmatn.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full font-sans">
        <ThemeProvider>
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Header regime={regime} symbolOptions={symbolOptions} />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
