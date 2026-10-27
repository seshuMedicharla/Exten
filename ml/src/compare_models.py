
from pathlib import Path
from time import perf_counter
import json
import joblib
import pandas as pd

from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score, precision_score,
    recall_score, f1_score,
    confusion_matrix, roc_auc_score,
    average_precision_score
)

from feature_extraction import build_features

BASE = Path(__file__).resolve().parents[1]
DATA = BASE / "data" / "processed"
REPORTS = BASE / "reports"
REPORTS.mkdir(exist_ok=True)

train = pd.read_csv(DATA / "train.csv")
val = pd.read_csv(DATA / "validation.csv")

assert set(train.domain_group).isdisjoint(
    set(val.domain_group)
)

X_train = build_features(train.url.astype(str))
X_val = build_features(val.url.astype(str))

y_train = train.label
y_val = val.label

# Load previously trained Random Forest
artifact = joblib.load(
    BASE / "models" / "rf_baseline_v1.joblib"
)

rf = artifact["model"]
assert list(X_val.columns) == artifact["features"]

# Train Logistic Regression using training data only
lr = make_pipeline(
    StandardScaler(),
    LogisticRegression(
        max_iter=2000,
        class_weight="balanced",
        random_state=42
    )
)

lr.fit(X_train, y_train)

# A very simple source-bias diagnostic:
# non-homepage URLs are treated as phishing.
# This is NOT a recommended phishing detector.
heuristic_pred = (
    (X_val["path_length"] > 1) |
    (X_val["query_length"] > 0)
).astype(int)


def evaluate(name, predictions, scores=None):
    tn, fp, fn, tp = confusion_matrix(
        y_val, predictions, labels=[0, 1]
    ).ravel()

    result = {
        "model": name,
        "accuracy": accuracy_score(y_val, predictions),
        "precision": precision_score(
            y_val, predictions, zero_division=0
        ),
        "recall": recall_score(
            y_val, predictions, zero_division=0
        ),
        "f1": f1_score(
            y_val, predictions, zero_division=0
        ),
        "fpr": fp / (fp + tn),
        "tn": int(tn),
        "fp": int(fp),
        "fn": int(fn),
        "tp": int(tp)
    }

    if scores is not None:
        result["roc_auc"] = roc_auc_score(y_val, scores)
        result["average_precision"] = (
            average_precision_score(y_val, scores)
        )

    return result


results = []

for name, model in [
    ("Random Forest", rf),
    ("Logistic Regression", lr)
]:
    start = perf_counter()
    scores = model.predict_proba(X_val)[:, 1]
    elapsed = perf_counter() - start

    result = evaluate(
        name,
        (scores >= 0.5).astype(int),
        scores
    )
    result["batch_ms_per_url"] = (
        elapsed * 1000 / len(X_val)
    )
    results.append(result)

results.append(
    evaluate("URL format heuristic", heuristic_pred)
)

summary = pd.DataFrame(results)

print("\nMODEL COMPARISON")
print(summary.round(4).to_string(index=False))

summary.to_csv(
    REPORTS / "model_comparison.csv",
    index=False
)

with open(
    REPORTS / "model_comparison.json", "w"
) as f:
    json.dump(results, f, indent=2)

print("\nSaved model comparison results.")
print("Do not use these as production accuracy claims.")
