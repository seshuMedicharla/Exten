
from pathlib import Path
import pandas as pd

BASE = Path(__file__).resolve().parents[1]
FILE = BASE / "data" / "processed" / "features.csv"

df = pd.read_csv(FILE)

print("\nTOTAL RECORDS:", len(df))

print("\nCLASS DISTRIBUTION:")
print(df["label"].value_counts())

print("\nCLASS PERCENTAGES:")
print(df["label"].value_counts(normalize=True) * 100)

print("\nMISSING VALUES:")
print(df.isnull().sum())

print("\nDUPLICATE FEATURE ROWS:")
print(df.duplicated().sum())

print("\nFEATURE AVERAGES BY CLASS:")
features = [
    "url_length",
    "host_length",
    "path_length",
    "query_length",
    "uses_https",
    "has_suspicious_keyword"
]

print(df.groupby("label")[features].mean().round(3))

print("\nNON-EMPTY QUERY BY CLASS (%):")
print(
    df.assign(has_query=df["query_length"] > 0)
      .groupby("label")["has_query"]
      .mean().mul(100).round(2)
)
