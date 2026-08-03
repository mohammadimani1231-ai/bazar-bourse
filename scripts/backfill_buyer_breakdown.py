"""
Backfill داده واقعی حقیقی/حقوقی (BrsApi Tsetmc/History.php?type=1) برای نمادهای watchlist
در daily_candles، طوری که انگار پایپ‌لاین از ماه‌ها قبل زنده بوده — لازم برای متریک «پول درشت»
در lib/tabloo.ts که به تاریخچهٔ واقعی سرانه خرید نیاز دارد، نه فقط دادهٔ زنده‌ی از امروز.

فقط ستون‌های buy_i_volume/sell_i_volume/buy_count_i/sell_count_i را merge می‌کند
(upsert جزئی PostgREST — ستون‌های OHLCV موجود از seed_history.py دست‌نخورده می‌مانند).
Idempotent: می‌شود دوباره اجرا کرد.

نکته: این اسکریپت از IP بعضی محیط‌های ابری (مثل sandbox اجرای Claude Code) توسط BrsApi ریست
می‌شود؛ اگر مشابه این خطا دیدی، از Edge Function معادل
(supabase/functions/backfill-buyer-breakdown) استفاده کن که از IP خود Supabase اجرا می‌شود.

استفاده:
    python scripts/backfill_buyer_breakdown.py

نیازمندی: همان scripts/requirements.txt (jdatetime هم از وابستگی‌های pytse-client می‌آید).
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import jdatetime
import requests

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

DAYS_OF_HISTORY = 130
BATCH_SIZE = 500
SECONDS_BETWEEN_SYMBOLS = 5
HISTORY_URL = "https://Api.BrsApi.ir/Tsetmc/History.php"


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


def jalali_to_gregorian(jalali_date: str) -> str | None:
    try:
        jy, jm, jd = (int(p) for p in jalali_date.split("-"))
        return jdatetime.date(jy, jm, jd).togregorian().strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return None


def get_watchlist_symbols(supabase_url: str, service_role_key: str) -> list[str]:
    res = requests.get(
        f"{supabase_url}/rest/v1/watchlist",
        params={"select": "symbol"},
        headers={"apikey": service_role_key, "Authorization": f"Bearer {service_role_key}"},
        timeout=15,
    )
    res.raise_for_status()
    return [row["symbol"] for row in res.json()]


def fetch_with_retry(url: str, params: dict, retries: int = 3, timeout: int = 60) -> requests.Response:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            res = requests.get(url, params=params, timeout=timeout)
            res.raise_for_status()
            return res
        except requests.exceptions.RequestException as err:
            last_error = err
            if attempt < retries:
                wait = 2 * (attempt + 1)
                print(f"  [retry {attempt + 1}/{retries}] {err} — {wait}s صبر می‌کنم")
                time.sleep(wait)
    assert last_error is not None
    raise last_error


def rows_for_symbol(symbol: str, brsapi_key: str) -> list[dict]:
    # پاسخ برای نمادهای قدیمی می‌تواند چند مگابایت باشد (تاریخچه تا ۱۳۸۷) — timeout بالا + retry لازم است.
    res = fetch_with_retry(HISTORY_URL, {"key": brsapi_key, "type": 1, "l18": symbol})
    entries = res.json()
    if not isinstance(entries, list):
        print(f"  [skip] {symbol}: پاسخ غیرمنتظره از History.php")
        return []

    rows: list[dict] = []
    for entry in entries[:DAYS_OF_HISTORY]:
        date = jalali_to_gregorian(entry.get("date", ""))
        if date is None:
            continue
        rows.append(
            {
                "symbol": symbol,
                "date": date,
                "buy_i_volume": entry.get("Buy_I_Volume"),
                "sell_i_volume": entry.get("Sell_I_Volume"),
                "buy_count_i": entry.get("Buy_CountI"),
                "sell_count_i": entry.get("Sell_CountI"),
            }
        )
    return rows


def upsert_rows(supabase_url: str, service_role_key: str, rows: list[dict]) -> None:
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
    brsapi_key = env.get("BRSAPI_KEY")
    if not supabase_url or not service_role_key or not brsapi_key:
        print("NEXT_PUBLIC_SUPABASE_URL، SUPABASE_SERVICE_ROLE_KEY و BRSAPI_KEY باید در .env.local باشند.")
        sys.exit(1)

    symbols = get_watchlist_symbols(supabase_url, service_role_key)
    print(f"{len(symbols)} نماد در watchlist")

    total_rows = 0
    failed: list[str] = []
    for i, symbol in enumerate(symbols):
        if i > 0:
            time.sleep(SECONDS_BETWEEN_SYMBOLS)
        print(f"-> {symbol}")
        try:
            rows = rows_for_symbol(symbol, brsapi_key)
        except requests.exceptions.RequestException as err:
            # خطای یک نماد نباید بقیه را متوقف کند — معمولاً برای نمادهای خیلی قدیمی با
            # تاریخچه چند مگابایتی رخ می‌دهد؛ می‌شود بعداً جدا دوباره امتحان کرد.
            print(f"  [failed] {err}")
            failed.append(symbol)
            continue
        if rows:
            upsert_rows(supabase_url, service_role_key, rows)
            total_rows += len(rows)
        print(f"  {len(rows)} ردیف")

    print(f"تمام. مجموع ردیف‌های merge‌شده: {total_rows}")
    if failed:
        print(f"نمادهای ناموفق ({len(failed)}): {', '.join(failed)}")


if __name__ == "__main__":
    main()
