
from pathlib import Path
import csv
import json
import hashlib
from collections import Counter
import pandas as pd

BASE = Path(__file__).resolve().parents[1]
SOURCE = BASE / "data/raw/mendeley_2021/index.sql"
OUT = BASE / "data/processed"
OUT.mkdir(parents=True, exist_ok=True)

records = []
rejected = Counter()
in_insert = False

# Only parse the known index table's INSERT statements.
# Never execute the SQL dump.
with SOURCE.open("r", encoding="utf-8-sig") as file:
    for line_number, line in enumerate(file, 1):
        s = line.strip()

        if s.startswith("INSERT INTO `index`"):
            expected = (
                "(`rec_id`, `url`, `website`, "
                "`result`, `created_date`) VALUES"
            )
            if expected not in s:
                raise ValueError(
                    f"Unexpected schema at line {line_number}"
                )
            in_insert = True
            continue

        if not in_insert:
            continue

        # The supplied phpMyAdmin dump uses one tuple per line.
        if not s.startswith("("):
            if s:
                raise ValueError(
                    f"Unexpected SQL at line {line_number}"
                )
            continue

        if not s.endswith(("),", ");")):
            raise ValueError(
                f"Unexpected row format at line {line_number}"
            )

        last_row = s.endswith(");")
        body = s[1:-2]

        try:
            fields = next(csv.reader(
                [body],
                delimiter=",",
                quotechar="'",
                escapechar="\\",
                doublequote=True,
                skipinitialspace=True,
                strict=True
            ))

            if len(fields) != 5:
                raise ValueError("Expected five fields")

            rec_id, url, website, label, date = fields

            if label not in ("0", "1"):
                rejected["invalid_label"] += 1
            elif not url.strip():
                rejected["empty_url"] += 1
            else:
                records.append({
                    "rec_id": int(rec_id),
                    "url": url.strip(),
                    "label": int(label),
                    "website_file": website,
                    "created_date": date,
                    "source": "Mendeley_PWD2021"
                })

        except (csv.Error, ValueError) as error:
            raise ValueError(
                f"Parsing failed at line {line_number}: "
                f"{type(error).__name__}"
            ) from error

        if last_row:
            in_insert = False

if in_insert:
    raise ValueError("SQL INSERT statement not terminated")

df = pd.DataFrame(records)

if df.empty:
    raise ValueError("No dataset records extracted")

# Validate dates without changing them.
dates = pd.to_datetime(df["created_date"], errors="coerce")
rejected["invalid_dates"] = int(dates.isna().sum())

print("\nRAW RECORDS EXTRACTED:", len(df))
print("\nOriginal label counts:")
print(df["label"].value_counts().sort_index())

# Detect URL conflicts before deduplication.
conflict_counts = df.groupby("url")["label"].nunique()
conflicting_urls = set(
    conflict_counts[conflict_counts > 1].index
)

print("\nConflicting URL labels:", len(conflicting_urls))
print("Exact duplicate URL/label rows:",
      df.duplicated(["url", "label"]).sum())

# Exclude conflicting URLs, preserve a separate audit.
conflict_rows = df[df["url"].isin(conflicting_urls)]
conflict_rows.to_csv(
    OUT / "mendeley_conflicts.csv", index=False
)

clean = df[
    ~df["url"].isin(conflicting_urls)
].copy()

clean = clean.drop_duplicates(
    subset=["url", "label"],
    keep="first"
)

clean.to_csv(
    OUT / "mendeley_clean.csv",
    index=False
)

sha256 = hashlib.sha256(SOURCE.read_bytes()).hexdigest()

summary = {
    "source": "Mendeley Phishing Websites Dataset",
    "doi": "10.17632/n96ncsr5g4.1",
    "source_sha256": sha256,
    "raw_records": len(df),
    "clean_records": len(clean),
    "conflicting_urls": len(conflicting_urls),
    "rejected": dict(rejected),
    "class_counts": {
        str(k): int(v)
        for k, v in clean["label"].value_counts().items()
    }
}

with (OUT / "mendeley_summary.json").open("w") as f:
    json.dump(summary, f, indent=2)

print("\nCLEANED DATASET")
print("Total:", len(clean))
print(clean["label"].value_counts().sort_index())
print("\nSaved: mendeley_clean.csv")
print("Saved: mendeley_summary.json")
