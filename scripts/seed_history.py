"""
Seed داده تاریخی ۵ ساله برای نمادهای watchlist با pytse-client → daily_candles.
Idempotent: از PostgREST upsert (merge-duplicates) روی کلید (symbol, date) استفاده می‌کند.

علاوه بر OHLCV، تاریخچهٔ حقیقی/حقوقی (client types) هم از همان pytse-client برای کل بازهٔ
۵ ساله گرفته می‌شود و ستون‌های buy_i_volume/sell_i_volume/buy_count_i/sell_count_i را در
daily_candles پر می‌کند — قبل از این، این ستون‌ها فقط برای ~۱۳۰ روز اخیر پر بودند
(scripts/backfill_buyer_breakdown.py، محدودیت BrsApi History.php)، یعنی قوانین تابلوخوانی
(buyer_power_strong، money_inflow_3d، suspicious_volume) در بک‌تست ۵ ساله برای اکثر بازه
داده نداشتند.

استفاده:
    python scripts/seed_history.py

نیازمندی‌ها (روی Python 3.12 نصب شود، نه 3.14 — lxml هنوز wheel برای 3.14 ندارد):
    pip install -r scripts/requirements.txt

متغیرهای محیطی از .env.local پروژه خوانده می‌شوند: NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

import requests
import pytse_client as tse

YEARS_OF_HISTORY = 5
BATCH_SIZE = 500


def load_env_local() -> dict[str, str]:
    env_path = Path(__file__).resolve().parent.parent / ".env.local"
    values: dict[str, str] = {}
    if not env_path.exists():
        return values
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip()
    return values


def get_watchlist_symbols(supabase_url: str, service_role_key: str) -> list[str]:
    res = requests.get(
        f"{supabase_url}/rest/v1/watchlist",
        params={"select": "symbol"},
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
        },
        timeout=15,
    )
    res.raise_for_status()
    return [row["symbol"] for row in res.json()]


def rows_for_symbol(symbol: str, cutoff_date: datetime) -> list[dict]:
    data = tse.download(symbols=[symbol], write_to_csv=False, adjust=False)
    df = data.get(symbol)
    if df is None or df.empty:
        print(f"  [skip] {symbol}: بدون دیتای تاریخی")
        return []

    df = df[df["date"] >= cutoff_date]
    rows: list[dict] = []
    for _, r in df.iterrows():
        close = float(r["close"]) if r["close"] == r["close"] else None  # NaN check
        rows.append(
            {
                "symbol": symbol,
                "date": r["date"].strftime("%Y-%m-%d"),
                "open": float(r["open"]) if r["open"] == r["open"] else None,
                "high": float(r["high"]) if r["high"] == r["high"] else None,
                "low": float(r["low"]) if r["low"] == r["low"] else None,
                "close": close,
                "final_price": close,
                "volume": int(r["volume"]) if r["volume"] == r["volume"] else None,
                "value": float(r["value"]) if r["value"] == r["value"] else None,
                "adjusted_close": float(r["adjClose"]) if r["adjClose"] == r["adjClose"] else None,
            }
        )
    return rows


def client_types_rows_for_symbol(symbol: str, cutoff_date: datetime) -> tuple[list[dict], dict]:
    """ردیف‌های buy_i_volume/sell_i_volume/buy_count_i/sell_count_i از client_types pytse-client.

    برمی‌گرداند: (rows, stats) — stats شامل fetched (تعداد روز دریافتی در بازه) و
    complete (تعداد روزی که هر ۴ ستون مقدار غیر-NaN داشتند) است، برای گزارش صادقانهٔ نقص داده.
    """
    data = tse.download_client_types_records(symbols=[symbol], write_to_csv=False, include_jdate=False)
    df = data.get(symbol)
    if df is None or df.empty:
        return [], {"fetched": 0, "complete": 0}

    df = df[df["date"] >= cutoff_date]
    rows: list[dict] = []
    complete = 0
    for _, r in df.iterrows():
        # buy_i_volume/sell_i_volume در daily_candles از نوع bigint هستند — نه numeric؛
        # float() یک لیترال با نقطهٔ اعشار (مثل "4202621718.0") تولید می‌کند که Postgres
        # برای bigint رد می‌کند (22P02)، دقیقاً مثل ستون volume در rows_for_symbol باید int() شود.
        buy_vol = int(r["individual_buy_vol"]) if r["individual_buy_vol"] == r["individual_buy_vol"] else None
        sell_vol = int(r["individual_sell_vol"]) if r["individual_sell_vol"] == r["individual_sell_vol"] else None
        buy_count = int(r["individual_buy_count"]) if r["individual_buy_count"] == r["individual_buy_count"] else None
        sell_count = int(r["individual_sell_count"]) if r["individual_sell_count"] == r["individual_sell_count"] else None
        if buy_vol is not None and sell_vol is not None and buy_count is not None and sell_count is not None:
            complete += 1
        rows.append(
            {
                "symbol": symbol,
                "date": r["date"].strftime("%Y-%m-%d"),
                "buy_i_volume": buy_vol,
                "sell_i_volume": sell_vol,
                "buy_count_i": buy_count,
                "sell_count_i": sell_count,
            }
        )
    return rows, {"fetched": len(rows), "complete": complete}


def upsert_candles(supabase_url: str, service_role_key: str, rows: list[dict]) -> None:
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        res = requests.post(
            f"{supabase_url}/rest/v1/daily_candles",
            params={"on_conflict": "symbol,date"},
            headers={
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            json=batch,
            timeout=30,
        )
        if not res.ok:
            print(f"  [error] batch {i}-{i + len(batch)}: {res.status_code} {res.text[:300]}")
            res.raise_for_status()


def main() -> None:
    env = {**load_env_local(), **os.environ}
    supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    service_role_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role_key:
        print("NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY باید در .env.local باشند.")
        sys.exit(1)

    cutoff_date = datetime.now() - timedelta(days=YEARS_OF_HISTORY * 365)

    symbols = get_watchlist_symbols(supabase_url, service_role_key)
    print(f"{len(symbols)} نماد در watchlist")

    total_rows = 0
    ohlcv_failed: list[str] = []
    print("\n=== OHLCV ===")
    for symbol in symbols:
        print(f"-> {symbol}")
        try:
            rows = rows_for_symbol(symbol, cutoff_date)
        except Exception as err:  # خطای شبکهٔ یک نماد نباید بقیه را متوقف کند (دیده‌شده زنده: قطعی old.tsetmc.com)
            print(f"  [failed] {err}")
            ohlcv_failed.append(symbol)
            continue
        if rows:
            upsert_candles(supabase_url, service_role_key, rows)
            total_rows += len(rows)
        print(f"  {len(rows)} ردیف")

    print(f"OHLCV تمام. مجموع ردیف‌های upsert‌شده: {total_rows}")
    if ohlcv_failed:
        print(f"نمادهای ناموفق OHLCV (خطای دانلود، {len(ohlcv_failed)}): {', '.join(ohlcv_failed)} — دوباره اجرای اسکریپت idempotent است و همین‌ها را جبران می‌کند.")

    print("\n=== client types (حقیقی/حقوقی) ===")
    ct_total_rows = 0
    ct_total_complete = 0
    ct_min_date: str | None = None
    ct_max_date: str | None = None
    ct_failed: list[str] = []
    ct_per_symbol: list[dict] = []
    for symbol in symbols:
        print(f"-> {symbol}")
        try:
            rows, stats = client_types_rows_for_symbol(symbol, cutoff_date)
        except Exception as err:  # نباید یک نماد بقیه را متوقف کند
            print(f"  [failed] {err}")
            ct_failed.append(symbol)
            continue
        if rows:
            upsert_candles(supabase_url, service_role_key, rows)
            ct_total_rows += len(rows)
            ct_total_complete += stats["complete"]
            dates = [r["date"] for r in rows]
            ct_min_date = min(dates) if ct_min_date is None else min(ct_min_date, min(dates))
            ct_max_date = max(dates) if ct_max_date is None else max(ct_max_date, max(dates))
        ct_per_symbol.append({"symbol": symbol, "fetched": stats["fetched"], "complete": stats["complete"]})
        print(f"  {stats['fetched']} ردیف ({stats['complete']} کامل)")

    coverage_pct = (ct_total_complete / ct_total_rows * 100) if ct_total_rows > 0 else 0.0
    incomplete_symbols = [s for s in ct_per_symbol if s["fetched"] > 0 and s["complete"] < s["fetched"]]
    zero_symbols = [s["symbol"] for s in ct_per_symbol if s["fetched"] == 0]

    print("\n=== گزارش نهایی client types ===")
    print(f"نماد پردازش‌شده: {len(symbols)}")
    print(f"مجموع ردیف upsert‌شده: {ct_total_rows}")
    if ct_min_date and ct_max_date:
        print(f"بازهٔ واقعی داده: {ct_min_date} تا {ct_max_date}")
    print(f"پوشش کامل (هر ۴ ستون غیر-NULL): {ct_total_complete}/{ct_total_rows} = {coverage_pct:.1f}٪")
    if zero_symbols:
        print(f"نمادهای بدون هیچ داده‌ای ({len(zero_symbols)}): {', '.join(zero_symbols)}")
    if incomplete_symbols:
        print(f"نمادهای با نقص جزئی ({len(incomplete_symbols)}):")
        for s in incomplete_symbols:
            print(f"  {s['symbol']}: {s['complete']}/{s['fetched']} کامل")
    if ct_failed:
        print(f"نمادهای ناموفق (خطای دانلود، {len(ct_failed)}): {', '.join(ct_failed)}")


if __name__ == "__main__":
    main()
