"""
Seed داده تاریخی ۵ ساله برای نمادهای watchlist با pytse-client → daily_candles.
Idempotent: از PostgREST upsert (merge-duplicates) روی کلید (symbol, date) استفاده می‌کند.

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
    for symbol in symbols:
        print(f"-> {symbol}")
        rows = rows_for_symbol(symbol, cutoff_date)
        if rows:
            upsert_candles(supabase_url, service_role_key, rows)
            total_rows += len(rows)
        print(f"  {len(rows)} ردیف")

    print(f"تمام. مجموع ردیف‌های upsert‌شده: {total_rows}")


if __name__ == "__main__":
    main()
