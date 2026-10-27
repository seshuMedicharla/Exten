
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from sklearn.metrics import brier_score_loss
from sklearn.calibration import calibration_curve

from feature_extraction import build_features

BASE = Path(__file__).resolve().parents[1]
DATA = BASE / "data/processed/mendeley_v2"
FIGURES = BASE / "reports/figures"
FIGURES.mkdir(parents=True, exist_ok=True)

val = pd.read_csv(DATA / "validation.csv")

# Load only our trusted locally trained artifact.
artifact = joblib.load(
    BASE / "models/rf_mendeley_v2.joblib"
)

X = build_features(val["url"].astype(str))
y = val["label"].to_numpy()

assert list(X.columns) == artifact["features"]

scores = artifact["model"].predict_proba(X)[:, 1]

# Lower Brier score is better.
brier = brier_score_loss(y, scores)

prob_true, prob_pred = calibration_curve(
    y,
    scores,
    n_bins=10,
    strategy="uniform"
)

fig, ax = plt.subplots(figsize=(7, 6))

ax.plot(
    [0, 1], [0, 1],
    linestyle="--",
    label="Perfect calibration"
)

ax.plot(
    prob_pred,
    prob_true,
    marker="o",
    label="Random Forest v2"
)

ax.set_xlabel("Mean predicted model score")
ax.set_ylabel("Observed phishing fraction")
ax.set_title("Random Forest v2 — Calibration Analysis")
ax.set_xlim(0, 1)
ax.set_ylim(0, 1)
ax.grid(alpha=0.3)
ax.legend()

fig.tight_layout()
fig.savefig(
    FIGURES / "calibration_curve.png",
    dpi=300
)
plt.close(fig)

print("\nCALIBRATION ANALYSIS")
print("Validation records:", len(val))
print("Brier score:", round(brier, 6))
print("\nPredicted vs observed:")
for predicted, observed in zip(prob_pred, prob_true):
    print(
        f"Predicted: {predicted:.4f} | "
        f"Observed: {observed:.4f}"
    )

print("\nSaved: reports/figures/calibration_curve.png")
print("Test set not used.")
