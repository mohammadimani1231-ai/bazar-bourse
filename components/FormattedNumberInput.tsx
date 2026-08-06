"use client";

/**
 * ورودی عددی با جداکنندهٔ هزارگان زنده حین تایپ («۱٬۲۳۴٬۵۶۷») — چون input[type=number] مرورگر
 * اصلاً از سه‌رقم‌سه‌رقم‌کردن پشتیبانی نمی‌کند (بازخورد کاربر: خواندن عدد بدون جداکننده سخت است).
 * ارقام لاتین نگه داشته می‌شوند (نه فارسی) تا موقعیت مکان‌نما حین تایپ خراب نشود.
 */
export function FormattedNumberInput({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: number | "";
  onChange: (value: number | "") => void;
  className?: string;
  placeholder?: string;
}) {
  const display = value === "" ? "" : value.toLocaleString("en-US");

  return (
    <input
      type="text"
      inputMode="numeric"
      dir="ltr"
      className={className}
      placeholder={placeholder}
      value={display}
      onChange={(e) => {
        const digitsOnly = e.target.value.replace(/[^\d]/g, "");
        onChange(digitsOnly === "" ? "" : Number(digitsOnly));
      }}
    />
  );
}
