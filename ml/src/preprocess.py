
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
import ipaddress
import pandas as pd

BASE = Path(__file__).resolve().parents[1]
RAW = BASE / "data" / "raw"
OUT = BASE / "data" / "processed"
OUT.mkdir(parents=True, exist_ok=True)


def clean_url(value):
    if not isinstance(value, str):
        return None

    value = value.strip()
    if not value or any(c.isspace() for c in value):
        return None

    try:
        parts = urlsplit(value)
        if parts.scheme.lower() not in ("http", "https"):
            return None

        host = parts.hostname
        if not host or parts.username or parts.password:
            return None

        port = parts.port
        host = host.lower().rstrip(".")
        ip = None
        try:
            ip = ipaddress.ip_address(host)
        except ValueError:
            pass

        if ip:
            host = ip.compressed
            if ip.version == 6:
                host = f"[{host}]"
        else:
            host = host.encode("idna").decode("ascii")
            if len(host) > 253:
                return None
            labels = host.split(".")
            if any(
                not label or len(label) > 63
                or label.startswith("-")
                or label.endswith("-")
                for label in labels
            ):
                return None

        netloc = host + (f":{port}" if port else "")
        path = parts.path or "/"

        # Fragments never reach web servers.
        return urlunsplit((
            parts.scheme.lower(),
            netloc,
            path,
            parts.query,
            ""
        ))
    except (ValueError, UnicodeError):
        return None


# 1. Load phishing dataset
phish = pd.read_csv(RAW / "phishing.csv", low_memory=False)
phish.columns = phish.columns.str.strip().str.lower()

required = {"url", "verified", "online"}
if not required.issubset(phish.columns):
    raise ValueError("Missing required PhishTank columns")

# Use only records explicitly marked verified and online.
for col in ("verified", "online"):
    phish[col] = (
        phish[col].astype(str).str.strip().str.lower()
    )

phish = phish[
    phish["verified"].isin(["yes", "true", "1"])
    & phish["online"].isin(["yes", "true", "1"])
].copy()

phish["url"] = phish["url"].map(clean_url)
phish = phish.dropna(subset=["url"])
phish = phish[["url"]].drop_duplicates()
phish["label"] = 1


# 2. Load Tranco candidate benign domains
tranco = pd.read_csv(
    RAW / "tranco.csv",
    header=None,
    names=["rank", "domain"],
    dtype=str
)

tranco["domain"] = tranco["domain"].str.strip().str.lower()

tranco["url"] = tranco["domain"].map(
    lambda domain: clean_url("https://" + domain)
    if isinstance(domain, str) else None
)

tranco = tranco.dropna(subset=["url"])
tranco = tranco[["url"]].drop_duplicates()
tranco["label"] = 0


# 3. Remove exact-URL label conflicts
combined = pd.concat([phish, tranco], ignore_index=True)

conflicts = combined.groupby("url")["label"].nunique()
conflicting_urls = set(conflicts[conflicts > 1].index)

combined = combined[
    ~combined["url"].isin(conflicting_urls)
].copy()

combined = combined.drop_duplicates(subset=["url", "label"])

# 4. Save without train/test splitting yet
combined = combined.sample(frac=1, random_state=42)
combined.to_csv(OUT / "urls_clean.csv", index=False)

print("\nDATA PREPROCESSING COMPLETE")
print("Verified phishing URLs:", len(phish))
print("Candidate benign URLs:", len(tranco))
print("Conflicting URLs removed:", len(conflicting_urls))
print("Final records:", len(combined))
print("\nClass distribution:")
print(combined["label"].value_counts().sort_index())
print("\nSaved: data/processed/urls_clean.csv")
