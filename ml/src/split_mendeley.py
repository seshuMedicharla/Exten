
from pathlib import Path
from urllib.parse import urlsplit
import ipaddress
import pandas as pd
import tldextract
from sklearn.model_selection import (
    StratifiedGroupKFold
)

BASE = Path(__file__).resolve().parents[1]
SOURCE = BASE / "data/processed/mendeley_clean.csv"
OUT = BASE / "data/processed/mendeley_v2"
OUT.mkdir(parents=True, exist_ok=True)

df = pd.read_csv(SOURCE)

extractor = tldextract.TLDExtract(
    suffix_list_urls=(),
    include_psl_private_domains=True
)

def get_domain(url):
    host = urlsplit(url).hostname
    if not host:
        raise ValueError("Missing hostname")

    try:
        return ipaddress.ip_address(host).compressed
    except ValueError:
        result = extractor(host)
        return result.top_domain_under_public_suffix or host

df["domain_group"] = df["url"].map(get_domain)

# Five group-stratified folds.
# One fold (~20%) is reserved for validation + testing.
splitter = StratifiedGroupKFold(
    n_splits=5,
    shuffle=True,
    random_state=42
)

train_idx, holdout_idx = next(
    splitter.split(
        df,
        df["label"],
        groups=df["domain_group"]
    )
)

train = df.iloc[train_idx].copy()
holdout = df.iloc[holdout_idx].copy()

# Split the holdout into validation and test groups.
# Group-based splitting avoids domain overlap.
from sklearn.model_selection import GroupShuffleSplit

second_split = GroupShuffleSplit(
    n_splits=1,
    test_size=0.5,
    random_state=43
)

val_idx, test_idx = next(
    second_split.split(
        holdout,
        holdout["label"],
        groups=holdout["domain_group"]
    )
)

validation = holdout.iloc[val_idx].copy()
test = holdout.iloc[test_idx].copy()

# Verify no domain leakage.
train_domains = set(train["domain_group"])
val_domains = set(validation["domain_group"])
test_domains = set(test["domain_group"])

assert train_domains.isdisjoint(val_domains)
assert train_domains.isdisjoint(test_domains)
assert val_domains.isdisjoint(test_domains)

# Verify all records were assigned exactly once.
assert len(train) + len(validation) + len(test) == len(df)

for name, subset in [
    ("train", train),
    ("validation", validation),
    ("test", test)
]:
    subset.to_csv(OUT / f"{name}.csv", index=False)

    counts = subset["label"].value_counts().sort_index()

    print(f"\n{name.upper()}")
    print("Records:", len(subset))
    print("Unique domains:", subset["domain_group"].nunique())
    print("Label counts:")
    print(counts)
    print("Phishing percentage:",
          round(100 * subset["label"].mean(), 2))

    if counts.size != 2:
        raise ValueError(
            f"{name} does not contain both classes"
        )

print("\nDomain overlap: 0")
print("Saved to:", OUT)
print("Mendeley v2 splitting completed.")
