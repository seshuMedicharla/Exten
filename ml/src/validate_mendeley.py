
from pathlib import Path
from urllib.parse import urlsplit
import ipaddress
import json
import pandas as pd
import tldextract

BASE = Path(__file__).resolve().parents[1]
DATA = BASE / "data"
PROCESSED = DATA / "processed"

df = pd.read_csv(PROCESSED / "mendeley_clean.csv")

extractor = tldextract.TLDExtract(
    suffix_list_urls=(),
    include_psl_private_domains=True
)

def inspect_url(value):
    if not isinstance(value, str):
        return None

    try:
        if any(c.isspace() for c in value):
            return None

        parts = urlsplit(value)

        if parts.scheme.lower() not in ("http", "https"):
            return None

        host = parts.hostname
        if not host or parts.username or parts.password:
            return None

        _ = parts.port  # Validate port syntax

        try:
            return ipaddress.ip_address(host).compressed
        except ValueError:
            result = extractor(host)
            return result.top_domain_under_public_suffix or host.lower()

    except (ValueError, UnicodeError):
        return None


print("\nMENDELEY DATASET AUDIT")
print("Total records:", len(df))

# 1. Validate URL format
df["domain_group"] = df["url"].map(inspect_url)

invalid = df["domain_group"].isna()
print("Invalid URLs:", int(invalid.sum()))

# 2. Check date quality
dates = pd.to_datetime(
    df["created_date"], errors="coerce"
)

print("Invalid dates:", int(dates.isna().sum()))
print("Earliest date:", dates.min())
print("Latest date:", dates.max())

# 3. Inspect URL structure by class
df["has_path"] = df["url"].map(
    lambda x: bool(urlsplit(x).path.strip("/"))
)

df["has_query"] = df["url"].map(
    lambda x: bool(urlsplit(x).query)
)

print("\nFULL-URL STRUCTURE (%)")
print(
    df.groupby("label")[["has_path", "has_query"]]
      .mean().mul(100).round(2)
)

# 4. Check conflicting registered domains
valid = df.loc[~invalid].copy()

groups = valid.groupby("domain_group")["label"].nunique()
conflicting_groups = set(groups[groups > 1].index)

print("\nRegistered domains:", valid["domain_group"].nunique())
print("Mixed-label domains:", len(conflicting_groups))

mixed_count = valid["domain_group"].isin(
    conflicting_groups
).sum()
print("Records on mixed-label domains:", mixed_count)

# 5. Check exact URL overlap with previous phishing data
old_file = PROCESSED / "urls_clean.csv"

overlap = None
if old_file.exists():
    previous_phishing = set()

    for chunk in pd.read_csv(
        old_file,
        usecols=["url", "label"],
        chunksize=100_000
    ):
        previous_phishing.update(
            chunk.loc[chunk["label"] == 1, "url"]
        )

    overlap = int(
        valid["url"].isin(previous_phishing).sum()
    )
    print("\nExact overlap with old phishing URLs:", overlap)

# 6. Save audit results
summary = {
    "total_records": int(len(df)),
    "invalid_urls": int(invalid.sum()),
    "invalid_dates": int(dates.isna().sum()),
    "registered_domains": int(valid["domain_group"].nunique()),
    "mixed_label_domains": len(conflicting_groups),
    "mixed_label_records": int(mixed_count),
    "exact_old_phishing_overlap": overlap,
    "url_structure_percent": {
        str(label): {
            col: float(value * 100)
            for col, value in group[
                ["has_path", "has_query"]
            ].mean().items()
        }
        for label, group in df.groupby("label")
    }
}

with open(
    BASE / "reports" / "mendeley_audit.json", "w"
) as file:
    json.dump(summary, file, indent=2)

print("\nAudit completed.")
print("Saved: reports/mendeley_audit.json")
