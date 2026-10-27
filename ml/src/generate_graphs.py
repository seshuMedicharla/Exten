
from pathlib import Path
import numpy as np
import pandas as pd
import joblib
import matplotlib.pyplot as plt
from sklearn.metrics import confusion_matrix

from feature_extraction import build_features

BASE = Path(__file__).resolve().parents[1]
DATA = BASE / "data/processed/mendeley_v2"
REPORTS = BASE / "reports"
FIGURES = REPORTS / "figures"
FIGURES.mkdir(parents=True, exist_ok=True)

# Use validation records only.
val = pd.read_csv(DATA / "validation.csv")

# Only load our locally trained model.
artifact = joblib.load(
    BASE / "models/rf_mendeley_v2.joblib"
)
model = artifact["model"]

X = build_features(val["url"].astype(str))
y = val["label"]

assert list(X.columns) == artifact["features"]

scores = model.predict_proba(X)[:, 1]
threshold = 0.65
pred = (scores >= threshold).astype(int)

# Figure 1: Confusion matrix
cm = confusion_matrix(y, pred, labels=[0, 1])

fig, ax = plt.subplots(figsize=(6, 5))
image = ax.imshow(cm, cmap="Blues")
fig.colorbar(image, ax=ax)

ax.set_xticks([0, 1], ["Legitimate", "Phishing"])
ax.set_yticks([0, 1], ["Legitimate", "Phishing"])
ax.set_xlabel("Predicted label")
ax.set_ylabel("Actual label")
ax.set_title("Random Forest v2 — Validation Confusion Matrix")

for i in range(2):
    for j in range(2):
        ax.text(
            j, i, str(cm[i, j]),
            ha="center", va="center",
            color="white" if cm[i, j] > cm.max()/2 else "black"
        )

fig.tight_layout()
fig.savefig(FIGURES / "confusion_matrix.png", dpi=300)
plt.close(fig)

# Figure 2: Threshold tradeoffs
thresholds = pd.read_csv(
    REPORTS / "mendeley_v2_thresholds.csv"
)

fig, ax = plt.subplots(figsize=(8, 5))

for column in ["precision", "recall", "fpr"]:
    ax.plot(
        thresholds["threshold"],
        thresholds[column],
        marker="o",
        label=column.upper()
    )

ax.axvline(
    threshold, linestyle="--",
    label="Provisional threshold 0.65"
)
ax.set_xlabel("Classification threshold")
ax.set_ylabel("Metric value")
ax.set_ylim(0, 1)
ax.set_title("Validation Threshold Tradeoffs")
ax.legend()
ax.grid(alpha=0.3)

fig.tight_layout()
fig.savefig(FIGURES / "threshold_analysis.png", dpi=300)
plt.close(fig)

# Figure 3: Tree impurity-based feature importance.
importance = pd.Series(
    model.feature_importances_,
    index=X.columns
).sort_values()

fig, ax = plt.subplots(figsize=(9, 6))
importance.plot.barh(ax=ax)

ax.set_xlabel("Impurity-based feature importance")
ax.set_title("Random Forest v2 — Feature Importance")

fig.tight_layout()
fig.savefig(FIGURES / "feature_importance.png", dpi=300)
plt.close(fig)

print("\nEXPERIMENTAL GRAPHS GENERATED")
for file in sorted(FIGURES.glob("*.png")):
    print(file.name)

print("\nDataset: Mendeley validation")
print("Model: Random Forest v2")
print("Threshold:", threshold)
print("Held-out test set not used.")
