"""Use the existing trusted calibrated model and original feature extractor."""

from pathlib import Path
import sys

import joblib
import numpy as np

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = REPOSITORY_ROOT / "ml" / "models" / "rf_mendeley_v2_calibrated.joblib"
FEATURE_SOURCE = REPOSITORY_ROOT / "ml" / "src"
if str(FEATURE_SOURCE) not in sys.path:
    sys.path.insert(0, str(FEATURE_SOURCE))

from feature_extraction import build_features  # noqa: E402 - trusted project module


class ModelService:
    def __init__(self, artifact: dict):
        required = {"classifier", "calibrator", "features", "threshold", "version", "research_only"}
        if not isinstance(artifact, dict) or not required.issubset(artifact):
            raise ValueError("Model artifact has an unexpected format")
        if artifact["version"] != "rf-mendeley-v2-calibrated" or artifact["research_only"] is not True:
            raise ValueError("Model artifact version is unsupported")
        expected_features = list(build_features(["https://example.com/"]).columns)
        if list(artifact["features"]) != expected_features:
            raise ValueError("Model feature order differs from the existing extractor")
        threshold = float(artifact["threshold"])
        if not np.isfinite(threshold) or not 0 < threshold < 1:
            raise ValueError("Model threshold is invalid")
        self.classifier = artifact["classifier"]
        self.calibrator = artifact["calibrator"]
        self.features = expected_features
        self.threshold = threshold
        self.version = artifact["version"]

    @classmethod
    def from_trusted_artifact(cls) -> "ModelService":
        # joblib can execute code while loading; this path is fixed to this trusted local project.
        path = MODEL_PATH.resolve(strict=True)
        if path.parent != (REPOSITORY_ROOT / "ml" / "models").resolve():
            raise ValueError("Model artifact path escaped the trusted models directory")
        return cls(joblib.load(path))

    def score(self, url: str) -> float:
        features = build_features([url])
        if list(features.columns) != self.features:
            raise ValueError("Feature order mismatch")
        raw = float(self.classifier.predict_proba(features)[0, 1])
        calibrated = float(self.calibrator.predict_proba(np.array([[raw]]))[0, 1])
        if not np.isfinite(calibrated) or not 0 <= calibrated <= 1:
            raise ValueError("Model returned an invalid score")
        return calibrated
