
from pathlib import Path
from time import perf_counter
import json
import joblib
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, confusion_matrix, roc_auc_score,
    average_precision_score
)

from feature_extraction import build_features

BASE = Path(__file__).resolve().parents[1]
DATA = BASE / "data/processed/mendeley_v2"
MODELS = BASE / "models"
REPORTS = BASE / "reports"

MODELS.mkdir(exist_ok=True)
REPORTS.mkdir(exist_ok=True)

# Load training and validation only.
train = pd.read_csv(DATA / "train.csv")
val = pd.read_csv(DATA / "validation.csv")

assert set(train["label"]) == {0, 1}
assert set(val["label"]) == {0, 1}
assert set(train["domain_group"]).isdisjoint(
    set(val["domain_group"])
)

X_train = build_features(train["url"].astype(str))
X_val = build_features(val["url"].astype(str))

y_train = train["label"]
y_val = val["label"]

assert list(X_train.columns) == list(X_val.columns)
FEATURES = X_train.columns.tolist()

print("Training records:", len(train))
print("Validation records:", len(val))
print("Number of features:", len(FEATURES))

models = {
    "Random Forest v2": RandomForestClassifier(
        n_estimators=100,
        max_depth=15,
        min_samples_leaf=3,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1
    ),
    "Logistic Regression v2": make_pipeline(
        StandardScaler(),
        LogisticRegression(
            max_iter=2000,
            class_weight="balanced",
            random_state=42
        )
    )
}

results = []

def evaluate(name, predictions, scores=None):
    tn, fp, fn, tp = confusion_matrix(
        y_val, predictions, labels=[0, 1]
    ).ravel()

    metrics = {
        "model": name,
        "accuracy": float(accuracy_score(y_val, predictions)),
        "precision": float(precision_score(
            y_val, predictions, zero_division=0
        )),
        "recall": float(recall_score(
            y_val, predictions, zero_division=0
        )),
        "f1": float(f1_score(
            y_val, predictions, zero_division=0
        )),
        "fpr": float(fp / (fp + tn)),
        "tn": int(tn),
        "fp": int(fp),
        "fn": int(fn),
        "tp": int(tp)
    }

    if scores is not None:
        metrics["roc_auc"] = float(
            roc_auc_score(y_val, scores)
        )
        metrics["average_precision"] = float(
            average_precision_score(y_val, scores)
        )

    return metrics


for name, model in models.items():
    print("\nTraining:", name)

    start = perf_counter()
    model.fit(X_train, y_train)
    training_seconds = perf_counter() - start

    start = perf_counter()
    scores = model.predict_proba(X_val)[:, 1]
    inference_seconds = perf_counter() - start

    predictions = (scores >= 0.5).astype(int)
    metrics = evaluate(name, predictions, scores)

    metrics["training_seconds"] = training_seconds
    metrics["batch_ms_per_url"] = (
        inference_seconds * 1000 / len(X_val)
    )

    results.append(metrics)

    filename = (
        "rf_mendeley_v2.joblib"
        if name.startswith("Random")
        else "lr_mendeley_v2.joblib"
    )

    joblib.dump({
        "model": model,
        "features": FEATURES,
        "version": name,
        "research_only": True
    }, MODELS / filename)

# Dataset-format bias diagnostic.
heuristic = (
    (X_val["path_length"] > 1) |
    (X_val["query_length"] > 0)
).astype(int)

results.append(
    evaluate("URL format heuristic v2", heuristic)
)

summary = pd.DataFrame(results)

print("\nMENDELEY V2 VALIDATION RESULTS")
print(summary.round(4).to_string(index=False))

summary.to_csv(
    REPORTS / "mendeley_v2_comparison.csv",
    index=False
)

with open(
    REPORTS / "mendeley_v2_comparison.json", "w"
) as f:
    json.dump(results, f, indent=2)

print("\nModels and comparison results saved.")
print("Test dataset has not been used.")
print("Research models only — not production approved.")
