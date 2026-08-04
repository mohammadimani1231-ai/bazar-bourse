"""
Backfill بنچمارک‌های بک‌تست (فاز ۳) در benchmark_candles: شاخص کل (tedpix) از pytse-client،
دلار آزاد (usd_irr) و طلای ۱۸ عیار (gold_18k) از BrsApi Gold_Currency_Pro (history=2).
Idempotent (upsert روی asset,date).

استفاده:
    python scripts/backfill_benchmarks.py

نیازمندی‌ها: همان scripts/requirements.txt، روی Python 3.12 (نه 3.14 — lxml wheel ندارد).
"""

from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import jdatetime
import requests
import pytse_client as tse

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

YEARS_OF_HISTORY = 5
BATCH_SIZE = 500
GOLD_CURRENCY_PRO_URL = "https://Api.BrsApi.ir/Market/Gold_Currency_Pro.php"


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
        jy, jm, jd = (int(p) for p in jalali_date.replace("/", "-").split("-"))
        return jdatetime.date(jy, jm, jd).togregorian().strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return None


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


def pytse_index_rows(asset: str, pytse_symbol: str, cutoff_date: datetime) -> list[dict]:
    """هر شاخص رسمی TSE که pytse-client می‌شناسد (نه فقط شاخص کل) — نگاه کن به
    pytse_client/data/indices_name.json برای اسم دقیق."""
    data = tse.download_financial_indexes(symbols=pytse_symbol, write_to_csv=False)
    if not data:
        return []
    df = list(data.values())[0]
    df = df[df["date"] >= cutoff_date]

    rows: list[dict] = []
    for _, r in df.iterrows():
        rows.append(
            {
                "asset": asset,
                "date": r["date"].strftime("%Y-%m-%d"),
                "open": float(r["open"]) if r["open"] == r["open"] else None,
                "high": float(r["high"]) if r["high"] == r["high"] else None,
                "low": float(r["low"]) if r["low"] == r["low"] else None,
                "close": float(r["close"]) if r["close"] == r["close"] else None,
            }
        )
    return rows


def brsapi_history_rows(
    asset: str, section: str, symbol: str, brsapi_key: str, cutoff_date_str: str, jalali_date_end: str
) -> list[dict]:
    res = fetch_with_retry(
        GOLD_CURRENCY_PRO_URL,
        {
            "key": brsapi_key,
            "section": section,
            "history": 2,
            "symbol": symbol,
            "date_start": "1400-01-01",
            "date_end": jalali_date_end,
        },
    )
    data = res.json()
    entries = data.get("history_daily", [])
    if not isinstance(entries, list):
        print(f"  [skip] {asset}: پاسخ غیرمنتظره از Gold_Currency_Pro")
        return []

    rows: list[dict] = []
    for e in entries:
        date = jalali_to_gregorian(e.get("date", ""))
        if date is None or date < cutoff_date_str:
            continue
        rows.append(
            {
                "asset": asset,
                "date": date,
                "open": e.get("open"),
                "high": e.get("high"),
                "low": e.get("low"),
                "close": e.get("close"),
            }
        )
    return rows


def upsert_rows(supabase_url: str, service_role_key: str, rows: list[dict]) -> None:
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        res = requests.post(
            f"{supabase_url}/rest/v1/benchmark_candles",
            params={"on_conflict": "asset,date"},
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

    cutoff_date = datetime.now() - timedelta(days=YEARS_OF_HISTORY * 365)
    cutoff_date_str = cutoff_date.strftime("%Y-%m-%d")
    jalali_today = jdatetime.date.today().strftime("%Y-%m-%d")

    total = 0

    print("-> tedpix (شاخص کل)")
    rows = pytse_index_rows("tedpix", "شاخص كل", cutoff_date)
    if rows:
        upsert_rows(supabase_url, service_role_key, rows)
    total += len(rows)
    print(f"  {len(rows)} ردیف")

    print("-> tedpix_equal_weight (شاخص کل هم‌وزن)")
    rows = pytse_index_rows("tedpix_equal_weight", "شاخص كل (هم وزن)", cutoff_date)
    if rows:
        upsert_rows(supabase_url, service_role_key, rows)
    total += len(rows)
    print(f"  {len(rows)} ردیف")

    print("-> usd_irr (دلار آزاد)")
    rows = brsapi_history_rows("usd_irr", "currency", "USD", brsapi_key, cutoff_date_str, jalali_today)
    if rows:
        upsert_rows(supabase_url, service_role_key, rows)
    total += len(rows)
    print(f"  {len(rows)} ردیف")

    print("-> gold_18k (طلای ۱۸ عیار)")
    rows = brsapi_history_rows("gold_18k", "gold", "IR_GOLD_18K", brsapi_key, cutoff_date_str, jalali_today)
    if rows:
        upsert_rows(supabase_url, service_role_key, rows)
    total += len(rows)
    print(f"  {len(rows)} ردیف")

    print(f"تمام. مجموع ردیف‌های merge‌شده: {total}")


if __name__ == "__main__":
    main()
