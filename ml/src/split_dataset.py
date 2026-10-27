
from pathlib import Path
from urllib.parse import urlsplit
import ipaddress
import pandas as pd
import tldextract
from sklearn.model_selection import GroupShuffleSplit

BASE = Path(__file__).resolve().parents[1]
DATA = BASE / "data" / "processed"

df = pd.read_csv(DATA / "dev_sample.csv")

# Use the bundled Public Suffix List snapshot.
# No network lookup is required.
extractor = tldextract.TLDExtract(
    suffix_list_urls=(),
    include_psl_private_domains=True
)


def get_domain(url):
    host = urlsplit(url).hostname
    if not host:
        raise ValueError("URL has no hostname")

    try:
        return ipaddress.ip_address(host).compressed
    except ValueError:
        pass

    result = extractor(host)
    return result.top_domain_under_public_suffix or host


# Identify related URLs by their registered domain.
df["domain_group"] = df["url"].map(get_domain)

# Remove domain groups containing opposing labels
conflicts = df.groupby("domain_group")["label"].nunique()
bad_groups = set(conflicts[conflicts > 1].index)

print("Conflicting domain groups:", len(bad_groups))

df = df[
    ~df["domain_group"].isin(bad_groups)
].copy()

# Separate 20% of domain groups for testing.
splitter = GroupShuffleSplit(
    n_splits=1,
    test_size=0.20,
    random_state=42
)

train_val_idx, test_idx = next(
    splitter.split(
        df, df["label"], groups=df["domain_group"]
    )
)

train_val = df.iloc[train_val_idx].copy()
test = df.iloc[test_idx].copy()

# From the remaining data, reserve approximately
# 20% of groups for validation.
splitter2 = GroupShuffleSplit(
    n_splits=1,
    test_size=0.20,
    random_state=42
)

train_idx, val_idx = next(
    splitter2.split(
        train_val,
        train_val["label"],
        groups=train_val["domain_group"]
    )
)

train = train_val.iloc[train_idx].copy()
val = train_val.iloc[val_idx].copy()

# Confirm that registered domains never overlap.
train_groups = set(train["domain_group"])
val_groups = set(val["domain_group"])
test_groups = set(test["domain_group"])

assert train_groups.isdisjoint(val_groups)
assert train_groups.isdisjoint(test_groups)
assert val_groups.isdisjoint(test_groups)

# Save URL and label; domain groups remain audit metadata.
for name, subset in [
    ("train", train),
    ("validation", val),
    ("test", test)
]:
    subset.to_csv(DATA / f"{name}.csv", index=False)

    print(f"\n{name.upper()}")
    print("Records:", len(subset))
    print("Unique domains:", subset["domain_group"].nunique())
    print("Label counts:")
    print(subset["label"].value_counts().sort_index())

print("\nDomain overlap: 0")
print("Dataset splitting completed.")
