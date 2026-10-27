
from pathlib import Path
import pandas as pd
from feature_extraction import build_features

BASE = Path(__file__).resolve().parents[1]
DATA = BASE / "data" / "processed"

df = pd.read_csv(DATA / "urls_clean.csv")

X = build_features(df["url"].astype(str))
X["label"] = df["label"].values

X.to_csv(DATA / "features.csv", index=False)

print("Feature extraction completed!")
print("Total records:", len(X))
print("Number of features:", len(X.columns) - 1)
print("\nSample:")
print(X.head())
print("\nSaved: data/processed/features.csv")
