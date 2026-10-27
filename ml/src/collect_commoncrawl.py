
from pathlib import Path
from urllib.parse import urlsplit
from datetime import datetime, timezone
import pandas as pd
import requests
import time

BASE = Path(__file__).resolve().parents[1]
RAW = BASE / "data" / "raw"
OUT = RAW / "commoncrawl_candidates.csv"

INDEX = "CC-MAIN-2026-39"
API = f"https://index.commoncrawl.org/{INDEX}-index"

# Small initial experiment to respect API limits.
DOMAIN_LIMIT = 15
URL_LIMIT = 30

tranco = pd.read_csv(
    RAW / "tranco.csv",
    header=None,
    names=["rank", "domain"],
    dtype=str
)

# Select candidate domains reproducibly.
domains = (
    tranco["domain"]
    .dropna()
    .drop_duplicates()
    .sample(n=DOMAIN_LIMIT, random_state=42)
    .tolist()
)

session = requests.Session()
session.headers.update({
    "User-Agent": "ExAiSec-Research/0.1 (academic URL metadata study)"
})

records = []

for domain in domains:
    print("Checking archived URLs for:", domain)

    try:
        response = session.get(
            API,
            params={
                "url": f"{domain}/*",
                "output": "json",
                "filter": "status:200",
                "limit": URL_LIMIT
            },
            timeout=30
        )

        if response.status_code in (404,):
            print("No archived results")
            continue

        if response.status_code in (429, 503):
            print("Rate limited; stopping safely.")
            break

        response.raise_for_status()

        for line in response.text.splitlines():
            if not line.strip():
                continue

            import json
            item = json.loads(line)
            url = item.get("url", "")

            try:
                parts = urlsplit(url)

                if parts.scheme not in ("http", "https"):
                    continue

                # Avoid URLs containing potentially sensitive
                # query parameters or embedded credentials.
                if parts.query or parts.username or parts.password:
                    continue

                # Focus on full URLs with a meaningful path.
                if not parts.path or parts.path == "/":
                    continue

                if len(url) > 2048:
                    continue

                records.append({
                    "url": url,
                    "source": "Common Crawl",
                    "crawl_id": INDEX,
                    "crawl_timestamp": item.get("timestamp", ""),
                    "http_status": item.get("status", ""),
                    "candidate_label": "unverified",
                    "collected_at": datetime.now(
                        timezone.utc
                    ).isoformat()
                })

            except ValueError:
                continue

    except (requests.RequestException, ValueError) as e:
        print("Request failed:", type(e).__name__)

    # Limit request frequency.
    time.sleep(2)

columns = [
    "url", "source", "crawl_id", "crawl_timestamp",
    "http_status", "candidate_label", "collected_at"
]

df = pd.DataFrame(records, columns=columns)
df = df.drop_duplicates(subset=["url"])
df.to_csv(OUT, index=False)

print("\nCOLLECTION COMPLETE")
print("Domains selected:", len(domains))
print("Candidate full URLs:", len(df))
print("File:", OUT)
print("Label status: UNVERIFIED")
