
from pathlib import Path
import pandas as pd

BASE = Path(__file__).resolve().parents[1]
DATA = BASE / "data" / "processed"
SOURCE = DATA / "urls_clean.csv"
OUTPUT = DATA / "dev_sample.csv"

samples = {0: [], 1: []}
counts = {0: 0, 1: 0}

# Reservoir-style random sampling is unnecessary here:
# pandas can sample independently after streaming by class.
for chunk in pd.read_csv(SOURCE, chunksize=100_000):
    for label in (0, 1):
        part = chunk[chunk["label"] == label]
        if part.empty:
            continue

        samples[label].append(part)
        counts[label] += len(part)

# Keep all phishing examples and sample candidate benign
# URLs for a reproducible development experiment.
phishing = pd.concat(samples[1], ignore_index=True)
benign = pd.concat(samples[0], ignore_index=True)

phishing = phishing.sample(
    n=min(50_000, len(phishing)),
    random_state=42
)

benign = benign.sample(
    n=min(50_000, len(benign)),
    random_state=42
)

development = pd.concat(
    [phishing, benign],
    ignore_index=True
).sample(frac=1, random_state=42)

development.to_csv(OUTPUT, index=False)

print("Available class counts:", counts)
print("Development sample:")
print(development["label"].value_counts())
print("Saved:", OUTPUT)
