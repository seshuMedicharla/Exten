"""Loopback-only API for experimental URL model assessment."""

import os
import re
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

from api.model import ModelService
from api.validation import InvalidPredictionUrl, url_observations, validate_prediction_url

EXTENSION_ID_PATTERN = re.compile(r"^[a-p]{32}$")
LIMITATIONS = [
    "Experimental research model; historical dataset measurements do not establish real-world performance.",
    "Only sanitized URL syntax is analyzed. Query and fragment are omitted, which may change model behavior.",
    "A lower score does not verify safety; a higher score does not prove phishing. No website is blocked.",
]


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str = Field(min_length=1, max_length=4096)


class UrlObservation(BaseModel):
    id: str
    title: str
    detail: str


class PredictionResponse(BaseModel):
    model_score: float = Field(ge=0, le=1)
    classification: Literal["elevated_signal", "below_threshold"]
    threshold: float
    model_version: str
    observed_url_indicators: list[UrlObservation]
    limitations: list[str]


def create_app(extension_id: str | None = None, model: ModelService | None = None) -> FastAPI:
    extension_id = extension_id if extension_id is not None else os.getenv("EXAISEC_EXTENSION_ID")
    if extension_id and not EXTENSION_ID_PATTERN.fullmatch(extension_id):
        raise ValueError("EXAISEC_EXTENSION_ID must be a 32-character Chrome extension ID")
    origin = f"chrome-extension://{extension_id}" if extension_id else None
    app = FastAPI(title="ExAiSec local API", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.model = model if model is not None else ModelService.from_trusted_artifact()
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin] if origin else [],
        allow_credentials=False,
        allow_methods=["POST"],
        allow_headers=["Content-Type", "X-ExAiSec-Client"],
    )

    @app.middleware("http")
    async def disable_caching(request: Request, call_next):
        if request.url.path == "/predict" and request.method == "POST":
            if origin is None or request.headers.get("origin") != origin or request.headers.get("x-exaisec-client") != "1":
                return JSONResponse(status_code=403, content={"detail": "Extension origin required"}, headers={"Cache-Control": "no-store"})
            content_length = request.headers.get("content-length")
            if content_length and (not content_length.isdigit() or int(content_length) > 8192):
                return JSONResponse(status_code=413, content={"detail": "Request too large"}, headers={"Cache-Control": "no-store"})
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, _error: RequestValidationError):
        # Default errors may echo the submitted URL; return a fixed, nonrevealing message.
        return JSONResponse(status_code=422, content={"detail": "Invalid prediction request"})

    @app.get("/health")
    async def health():
        return {"status": "ok", "model_version": app.state.model.version, "extension_origin_configured": bool(origin)}

    @app.post("/predict", response_model=PredictionResponse)
    async def predict(payload: PredictionRequest, request: Request, x_exaisec_client: str | None = Header(default=None)):
        # CORS alone does not stop simple cross-origin POSTs from reaching this process.
        if origin is None or request.headers.get("origin") != origin or x_exaisec_client != "1":
            raise HTTPException(status_code=403, detail="Extension origin required")
        if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
            raise HTTPException(status_code=415, detail="JSON request required")
        try:
            validated = validate_prediction_url(payload.url)
        except InvalidPredictionUrl as exc:
            raise HTTPException(status_code=422, detail="Unsupported or invalid URL") from exc
        try:
            score = app.state.model.score(validated.value)
        except Exception as exc:
            # Do not log request bodies or full URLs, including on model failures.
            raise HTTPException(status_code=503, detail="Prediction unavailable") from exc
        return PredictionResponse(
            model_score=score,
            classification="elevated_signal" if score >= app.state.model.threshold else "below_threshold",
            threshold=app.state.model.threshold,
            model_version=app.state.model.version,
            observed_url_indicators=url_observations(validated),
            limitations=LIMITATIONS,
        )

    return app


app = create_app()
