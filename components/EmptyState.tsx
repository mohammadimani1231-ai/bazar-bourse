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
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Icon className="h-8 w-8 text-muted" aria-hidden="true" />
      <p className="text-sm font-bold text-foreground">{title}</p>
      {description && <p className="max-w-xs text-xs text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
