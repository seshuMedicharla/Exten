
from pathlib import Path
import pandas as pd
import numpy as np
import joblib

from sklearn.metrics import confusion_matrix

from feature_extraction import build_features

BASE = Path(__file__).resolve().parents[1]
DATA = BASE / "data/processed/mendeley_v2"
REPORTS = BASE / "reports"

# Use only validation data.
val = pd.read_csv(DATA / "validation.csv")

# Load the model trained previously.
artifact = joblib.load(
    BASE / "models/rf_mendeley_v2.joblib"
)

model = artifact["model"]

X = build_features(val["url"].astype(str))
y = val["label"].to_numpy()

assert list(X.columns) == artifact["features"]

# Get model-generated scores.
scores = model.predict_proba(X)[:, 1]

results = []

for threshold in np.arange(0.10, 0.96, 0.05):
    predictions = (scores >= threshold).astype(int)

    tn, fp, fn, tp = confusion_matrix(
        y, predictions, labels=[0, 1]
    ).ravel()

    precision = tp / (tp + fp) if tp + fp else 0
    recall = tp / (tp + fn) if tp + fn else 0
    fpr = fp / (fp + tn) if fp + tn else 0
    f1 = (
        2 * precision * recall / (precision + recall)
        if precision + recall else 0
    )

    results.append({
        "threshold": round(float(threshold), 2),
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "fpr": fpr,
        "fp": int(fp),
        "fn": int(fn),
        "tp": int(tp),
        "tn": int(tn)
    })

df = pd.DataFrame(results)

print("\nTHRESHOLD ANALYSIS")
print(df.round(4).to_string(index=False))

# Illustrative requirement for investigating
# a lower false-positive operating point.
candidates = df[df["fpr"] <= 0.05]

if not candidates.empty:
    best = candidates.sort_values(
        ["recall", "fpr"],
        ascending=[False, True]
    ).iloc[0]

    print("\nCANDIDATE WITH VALIDATION FPR <= 5%")
    print(best.to_string())
else:
    print("\nNo threshold achieved validation FPR <= 5%.")

REPORTS.mkdir(exist_ok=True)

df.to_csv(
    REPORTS / "mendeley_v2_thresholds.csv",
    index=False
)

print("\nSaved: reports/mendeley_v2_thresholds.csv")
print("Held-out test set remains untouched.")
