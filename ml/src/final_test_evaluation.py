
from pathlib import Path
from time import perf_counter
import json
import platform

import joblib
import numpy as np
import pandas as pd

from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    roc_auc_score,
    average_precision_score,
    brier_score_loss,
)

from feature_extraction import build_features

BASE = Path(__file__).resolve().parents[1]
DATA = BASE / "data/processed/mendeley_v2"
REPORTS = BASE / "reports"
MODELS = BASE / "models"

# 1. Load the untouched test set
test = pd.read_csv(DATA / "test.csv")
train = pd.read_csv(DATA / "train.csv")
validation = pd.read_csv(DATA / "validation.csv")

# 2. Verify domain separation
test_domains = set(test["domain_group"])

assert test_domains.isdisjoint(
    set(train["domain_group"])
)
assert test_domains.isdisjoint(
    set(validation["domain_group"])
)

# 3. Load our frozen, locally trained artifact
artifact = joblib.load(
    MODELS / "rf_mendeley_v2_calibrated.joblib"
)

assert artifact["research_only"] is True

model = artifact["classifier"]
calibrator = artifact["calibrator"]
threshold = artifact["threshold"]

if threshold is None:
    raise ValueError("No selected threshold")

# 4. Extract exactly the training features
X = build_features(test["url"].astype(str))
y = test["label"].to_numpy()

assert list(X.columns) == artifact["features"]

# 5. Raw and calibrated predictions
raw_scores = model.predict_proba(X)[:, 1]

scores = calibrator.predict_proba(
    raw_scores.reshape(-1, 1)
)[:, 1]

pred = (scores >= threshold).astype(int)

# 6. Confusion matrix
tn, fp, fn, tp = confusion_matrix(
    y, pred, labels=[0, 1]
).ravel()

# 7. Evaluation metrics
metrics = {
    "dataset": "Mendeley 2021 held-out test",
    "model_version": artifact["version"],
    "threshold": float(threshold),
    "total_records": int(len(test)),
    "accuracy": float(accuracy_score(y, pred)),
    "precision": float(precision_score(
        y, pred, zero_division=0
    )),
    "recall": float(recall_score(
        y, pred, zero_division=0
    )),
    "f1": float(f1_score(
        y, pred, zero_division=0
    )),
    "false_positive_rate": float(
        fp / (fp + tn)
    ),
    "roc_auc": float(roc_auc_score(y, scores)),
    "average_precision": float(
        average_precision_score(y, scores)
    ),
    "brier_score": float(
        brier_score_loss(y, scores)
    ),
    "tn": int(tn),
    "fp": int(fp),
    "fn": int(fn),
    "tp": int(tp),
}

# 8. Measure single-URL prediction latency
# This measures local Python inference including
# feature extraction, not network/API latency.
sample = test["url"].iloc[0]

def predict_one(url):
    features = build_features([url])
    raw = model.predict_proba(features)[:, 1]
    return calibrator.predict_proba(
        raw.reshape(-1, 1)
    )[0, 1]

# Warm up
for _ in range(20):
    predict_one(sample)

times = []

for _ in range(100):
    start = perf_counter()
    predict_one(sample)
    times.append(
        (perf_counter() - start) * 1000
    )

metrics["single_url_latency_ms_median"] = float(
    np.median(times)
)
metrics["single_url_latency_ms_p95"] = float(
    np.percentile(times, 95)
)
metrics["python_version"] = platform.python_version()

# 9. Save results
REPORTS.mkdir(exist_ok=True)

output = REPORTS / "final_test_metrics.json"

if output.exists():
    raise FileExistsError(
        "Final test results already exist. "
        "Do not overwrite or rerun during model selection."
    )

with output.open("w") as file:
    json.dump(metrics, file, indent=2)

print("\nFINAL HELD-OUT TEST RESULTS")
for key, value in metrics.items():
    print(f"{key}: {value}")

print("\nSaved:", output)
print("Test evaluation complete.")
