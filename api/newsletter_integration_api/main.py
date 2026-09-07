from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from newsletter_integration_api.catalog import ping_database, read_offers_catalog, read_stories_catalog
from newsletter_integration_api.db import DatabaseUnavailable
from newsletter_integration_api.models import (
    ApiErrorResponse,
    HealthResponse,
    OffersResponse,
    StoriesResponse,
)

app = FastAPI(
    title="Newsletter Integration API",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse | JSONResponse:
    try:
        ping_database()
    except DatabaseUnavailable:
        return JSONResponse(HealthResponse(status="unavailable").model_dump(), status_code=503)
    except Exception:
        return JSONResponse(HealthResponse(status="unavailable").model_dump(), status_code=503)
    return HealthResponse(status="ok")


@app.get("/stories", response_model=StoriesResponse)
def stories() -> StoriesResponse | JSONResponse:
    try:
        return read_stories_catalog()
    except DatabaseUnavailable:
        return JSONResponse(
            ApiErrorResponse(
                error="Stories catalog is temporarily unavailable.",
                code="DATABASE_UNAVAILABLE",
            ).model_dump(),
            status_code=503,
        )
    except Exception:
        return JSONResponse(
            ApiErrorResponse(
                error="Stories catalog could not be loaded.",
                code="INTERNAL_ERROR",
            ).model_dump(),
            status_code=500,
        )


@app.get("/offers", response_model=OffersResponse)
def offers() -> OffersResponse | JSONResponse:
    try:
        return read_offers_catalog()
    except DatabaseUnavailable:
        return JSONResponse(
            ApiErrorResponse(
                error="Offers catalog is temporarily unavailable.",
                code="DATABASE_UNAVAILABLE",
            ).model_dump(),
            status_code=503,
        )
    except Exception:
        return JSONResponse(
            ApiErrorResponse(
                error="Offers catalog could not be loaded.",
                code="INTERNAL_ERROR",
            ).model_dump(),
            status_code=500,
        )
