from pathlib import Path
import socket

import joblib
import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.app import create_app
from api.model import MODEL_PATH, ModelService, build_features

EXTENSION_ID = "a" * 32
ORIGIN = f"chrome-extension://{EXTENSION_ID}"
HEADERS = {"Origin": ORIGIN, "X-ExAiSec-Client": "1"}


@pytest.fixture(scope="module")
def client():
    return TestClient(create_app(extension_id=EXTENSION_ID), base_url="http://127.0.0.1:8765")


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "model_version": "rf-mendeley-v2-calibrated",
        "extension_origin_configured": True,
    }


def test_predict_returns_research_score_and_observations_without_fetching(client, monkeypatch):
    def forbidden_network(*_args, **_kwargs):
        raise AssertionError("URL fetch attempted")

    monkeypatch.setattr(socket, "create_connection", forbidden_network)
    response = client.post("/predict", json={"url": "http://example.com/login"}, headers=HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert 0 <= body["model_score"] <= 1
    assert body["classification"] in {"elevated_signal", "below_threshold"}
    assert body["threshold"] == pytest.approx(0.62)
    assert body["model_version"] == "rf-mendeley-v2-calibrated"
    assert body["observed_url_indicators"][0]["id"] == "http"
    assert any("historical" in item for item in body["limitations"])
    assert "example.com" not in response.text


@pytest.mark.parametrize("url", [
    "file:///tmp/page", "javascript:alert(1)", "not-a-url", "https://", "https://bad..example/",
    "https://-bad.example/", "https://example.com:99999/", "https://user:pass@example.com/",
    "https://example.com/?token=secret", "https://example.com/#secret", "https://example.com/" + "x" * 4096,
    "https://example.com/\nInjected: value", "https://example.com/a b",
])
def test_rejects_unsupported_or_sensitive_urls(client, url):
    response = client.post("/predict", json={"url": url}, headers=HEADERS)
    assert response.status_code == 422
    assert url not in response.text


def test_rejects_extra_fields_and_does_not_echo_them(client):
    response = client.post("/predict", json={"url": "https://example.com/", "password": "secret"}, headers=HEADERS)
    assert response.status_code == 422
    assert "secret" not in response.text


def test_rejects_oversized_body_before_parsing(client):
    response = client.post("/predict", content=b"x" * 9000, headers={**HEADERS, "Content-Type": "application/json"})
    assert response.status_code == 413


@pytest.mark.parametrize("headers", [
    {"X-ExAiSec-Client": "1"},
    {"Origin": "https://attacker.example", "X-ExAiSec-Client": "1"},
    {"Origin": ORIGIN},
])
def test_rejects_unauthorized_callers(client, headers):
    response = client.post("/predict", json={"url": "https://example.com/"}, headers=headers)
    assert response.status_code == 403


def test_cors_restricts_preflight(client):
    headers = {"Origin": ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-exaisec-client"}
    allowed = client.options("/predict", headers=headers)
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == ORIGIN
    denied = client.options("/predict", headers={**headers, "Origin": "https://attacker.example"})
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers


def test_host_is_restricted(client):
    response = client.get("/health", headers={"Host": "attacker.example"})
    assert response.status_code == 400


def test_exact_extractor_and_calibration_match_artifact():
    assert MODEL_PATH == Path(__file__).resolve().parents[2] / "ml/models/rf_mendeley_v2_calibrated.joblib"
    artifact = joblib.load(MODEL_PATH)
    service = ModelService(artifact)
    url = "https://example.com/login"
    features = build_features([url])
    assert list(features.columns) == artifact["features"]
    raw_score = artifact["classifier"].predict_proba(features)[0, 1]
    calibrated_score = artifact["calibrator"].predict_proba(np.array([[raw_score]]))[0, 1]
    assert service.score(url) == pytest.approx(calibrated_score)


def test_invalid_extension_id_rejected():
    with pytest.raises(ValueError):
        create_app(extension_id="not-an-extension-id")
