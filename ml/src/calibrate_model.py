
from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd

from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import (
    brier_score_loss,
    roc_auc_score,
    confusion_matrix
)

from feature_extraction import build_features

BASE = Path(__file__).resolve().parents[1]
DATA = BASE / "data/processed/mendeley_v2"
MODELS = BASE / "models"
REPORTS = BASE / "reports"

val = pd.read_csv(DATA / "validation.csv")

artifact = joblib.load(
    MODELS / "rf_mendeley_v2.joblib"
)
model = artifact["model"]

# Split validation by registered domain.
splitter = GroupShuffleSplit(
    n_splits=1,
    test_size=0.5,
    random_state=2026
)

cal_idx, decision_idx = next(
    splitter.split(
        val,
        val["label"],
        groups=val["domain_group"]
    )
)

cal = val.iloc[cal_idx]
decision = val.iloc[decision_idx]

assert set(cal.domain_group).isdisjoint(
    set(decision.domain_group)
)
assert set(cal.label) == {0, 1}
assert set(decision.label) == {0, 1}

def get_scores(data):
    X = build_features(data["url"].astype(str))
    assert list(X.columns) == artifact["features"]
    return model.predict_proba(X)[:, 1]

# The original Random Forest remains frozen.
cal_raw = get_scores(cal)
decision_raw = get_scores(decision)

# Fit sigmoid calibration on a separate partition.
calibrator = LogisticRegression(
    C=1000,
    max_iter=1000,
    random_state=42
)

calibrator.fit(
    cal_raw.reshape(-1, 1),
    cal["label"]
)

# Assess both score versions on decision data.
calibrated_scores = calibrator.predict_proba(
    decision_raw.reshape(-1, 1)
)[:, 1]

y = decision["label"].to_numpy()

print("\nCALIBRATION COMPARISON")
print("Calibration records:", len(cal))
print("Decision records:", len(decision))

print("Raw Brier score:",
      round(brier_score_loss(y, decision_raw), 6))
print("Calibrated Brier score:",
      round(brier_score_loss(y, calibrated_scores), 6))

print("Raw ROC-AUC:",
      round(roc_auc_score(y, decision_raw), 6))
print("Calibrated ROC-AUC:",
      round(roc_auc_score(y, calibrated_scores), 6))

# Select threshold on decision partition only.
rows = []

for threshold in np.linspace(0.05, 0.99, 95):
    predictions = (
        calibrated_scores >= threshold
    ).astype(int)

    tn, fp, fn, tp = confusion_matrix(
        y, predictions, labels=[0, 1]
    ).ravel()

    fpr = fp / (fp + tn)
    recall = tp / (tp + fn)

    rows.append({
        "threshold": float(threshold),
        "fpr": float(fpr),
        "recall": float(recall),
        "fp": int(fp),
        "fn": int(fn),
        "tp": int(tp),
        "tn": int(tn)
    })

thresholds = pd.DataFrame(rows)
thresholds.to_csv(
    REPORTS / "calibrated_thresholds.csv",
    index=False
)

eligible = thresholds[thresholds["fpr"] <= 0.05]

selected = None

if not eligible.empty:
    best = eligible.sort_values(
        ["recall", "fpr"],
        ascending=[False, True]
    ).iloc[0]
    selected = float(best["threshold"])

    print("\nPROVISIONAL CALIBRATED THRESHOLD")
    print(best.to_string())
else:
    print("\nNo threshold meets the exploratory FPR target.")

# Save only locally trusted model components.
joblib.dump({
    "classifier": model,
    "calibrator": calibrator,
    "features": artifact["features"],
    "threshold": selected,
    "version": "rf-mendeley-v2-calibrated",
    "research_only": True
}, MODELS / "rf_mendeley_v2_calibrated.joblib")

summary = {
    "calibration_records": len(cal),
    "decision_records": len(decision),
    "raw_brier": float(
        brier_score_loss(y, decision_raw)
    ),
    "calibrated_brier": float(
        brier_score_loss(y, calibrated_scores)
    ),
    "raw_roc_auc": float(
        roc_auc_score(y, decision_raw)
    ),
    "calibrated_roc_auc": float(
        roc_auc_score(y, calibrated_scores)
    ),
    "selected_threshold": selected
}

with open(
    REPORTS / "calibrated_model_results.json", "w"
) as f:
    json.dump(summary, f, indent=2)

print("\nCalibrated model saved.")
print("Held-out test dataset not used.")
