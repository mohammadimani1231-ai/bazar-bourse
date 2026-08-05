import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import { RegimeBanner } from "@/components/RegimeBanner";
import { createServerSupabaseClient } from "@/lib/supabase/serverClient.ts";
import type { MarketRegime } from "@/lib/marketRegime.ts";
import "./globals.css";

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic", "latin"],
});

export const metadata: Metadata = {
  title: "داشبورد بازار بورس",
  description: "تحلیل بازار بورس ایران و بازارهای جهانی",
};

// بنر رژیم بازار باید همیشه تازه باشد — نباید در build-time freeze شود
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createServerSupabaseClient();
  const { data: regimeSetting } = await supabase.from("settings").select("value").eq("key", "market_regime").maybeSingle();
  const regime = ((regimeSetting?.value as MarketRegime | undefined) ?? "normal") as MarketRegime;

  return (
    <html lang="fa" dir="rtl" className={`${vazirmatn.variable} dark h-full antialiased`}>
      <body className="flex min-h-full font-sans">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <RegimeBanner regime={regime} />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
