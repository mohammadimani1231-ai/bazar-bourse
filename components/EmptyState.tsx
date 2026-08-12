import type { LucideIcon } from "lucide-react";

/**
 * حالت خالی یکدست برای همهٔ صفحات — الهام از Robinhood: به‌جای جدول/چارت خالی و گنگ،
 * یک پیام کوتاه + توضیح، و در صورت نیاز یک عمل پیشنهادی.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** برای جایگاه‌هایی که خالی‌بودن حالت طبیعی/موقتی است (مثل بریف روزانه قبل از ۸:۳۰ صبح) —
   * فضای کمتر می‌گیرد تا به‌جای «سطح بزرگ مرده» به‌نظر برسد «هنوز نوبتش نرسیده». */
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-1.5 text-center ${compact ? "py-4" : "py-12"}`}>
      <Icon className={compact ? "h-5 w-5 text-warning/70" : "h-8 w-8 text-muted"} aria-hidden="true" />
      <p className="text-sm font-bold text-foreground">{title}</p>
      {description && <p className="max-w-xs text-xs text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
