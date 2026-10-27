
from pathlib import Path
from time import perf_counter
import json
import joblib
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    classification_report
)

from feature_extraction import build_features

BASE = Path(__file__).resolve().parents[1]
DATA = BASE / "data" / "processed"
MODELS = BASE / "models"
REPORTS = BASE / "reports"

MODELS.mkdir(exist_ok=True)
REPORTS.mkdir(exist_ok=True)

# 1. Load training and validation data
train = pd.read_csv(DATA / "train.csv")
val = pd.read_csv(DATA / "validation.csv")

# 2. Convert URLs to 15 numerical features
X_train = build_features(train["url"])
y_train = train["label"]

X_val = build_features(val["url"])
y_val = val["label"]

assert list(X_train.columns) == list(X_val.columns)
assert set(train["domain_group"]).isdisjoint(
    set(val["domain_group"])
)

print("Training records:", len(train))
print("Validation records:", len(val))
print("Features:", X_train.shape[1])

# 3. Initialize Random Forest
model = RandomForestClassifier(
    n_estimators=100,
    max_depth=15,
    min_samples_leaf=3,
    class_weight="balanced",
    random_state=42,
    n_jobs=-1
)

# 4. Train
start = perf_counter()
model.fit(X_train, y_train)
training_time = perf_counter() - start

print("\nTraining time:", round(training_time, 3), "seconds")

# 5. Predict on validation data only
start = perf_counter()
predictions = model.predict(X_val)
latency = (perf_counter() - start) / len(X_val) * 1000

# 6. Evaluate
tn, fp, fn, tp = confusion_matrix(
    y_val, predictions, labels=[0, 1]
).ravel()

fpr = fp / (fp + tn) if fp + tn else 0

metrics = {
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
    "false_positive_rate": fpr,
    "inference_ms_per_url_batch_average": latency,
    "training_seconds": training_time,
    "tn": int(tn),
    "fp": int(fp),
    "fn": int(fn),
    "tp": int(tp)
}

print("\nVALIDATION RESULTS")
for key, value in metrics.items():
    print(f"{key}: {value:.4f}")

print("\nCLASSIFICATION REPORT")
print(classification_report(
    y_val, predictions, zero_division=0
))

# 7. Save experimental model and metadata
joblib.dump({
    "model": model,
    "features": X_train.columns.tolist(),
    "model_version": "rf-baseline-v1",
    "research_only": True
}, MODELS / "rf_baseline_v1.joblib")

with open(REPORTS / "validation_metrics.json", "w") as f:
    json.dump(metrics, f, indent=2)

print("\nBaseline model and metrics saved.")
print("Research baseline only — not approved for live warnings.")
