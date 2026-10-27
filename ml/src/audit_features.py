
from pathlib import Path
import pandas as pd

BASE = Path(__file__).resolve().parents[1]
FILE = BASE / "data" / "processed" / "features.csv"

# Read in chunks to limit memory consumption.
counts = {}

for chunk in pd.read_csv(FILE, chunksize=100_000):
    features = [c for c in chunk.columns if c != "label"]

    grouped = chunk.groupby(
        features + ["label"]
    ).size()

    for key, count in grouped.items():
        counts[key] = counts.get(key, 0) + int(count)

# Identify feature vectors that have opposing labels.
feature_labels = {}

for key, count in counts.items():
    vector, label = key[:-1], key[-1]
    if vector not in feature_labels:
        feature_labels[vector] = {}

    feature_labels[vector][label] = count

conflicts = {
    vector: labels
    for vector, labels in feature_labels.items()
    if len(labels) > 1
}

affected = sum(
    sum(labels.values())
    for labels in conflicts.values()
)

print("Distinct feature vectors:", len(feature_labels))
print("Conflicting feature vectors:", len(conflicts))
print("Records in conflicting vectors:", affected)
print("Conflict percentage:",
      round(100 * affected / 4759958, 2))

print("\nSample conflicting label counts:")
for labels in list(conflicts.values())[:5]:
    print(labels)
