"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SITE_SESSION_COOKIE, sitePasswordHash } from "@/lib/siteAuth.ts";

function safeNextPath(next: string): string {
  // فقط مسیر داخلی مجاز است — از open-redirect با //evil.com یا آدرس مطلق جلوگیری می‌کند
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function login(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? "/"));
  const expected = process.env.SITE_PASSWORD;

  if (!expected || password !== expected) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  (await cookies()).set(SITE_SESSION_COOKIE, sitePasswordHash(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  redirect(next);
}
