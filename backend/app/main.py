"""EEx Iran API - energy cost intelligence for Iranian factories."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import Session

from .config import settings
from .database import engine, init_db
from .routers import alerts, auth, bills, dashboard, public, sites
from .seed import seed

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if settings.seed_on_startup:
        with Session(engine) as session:
            seed(session)
    yield


app = FastAPI(
    title=settings.project_name,
    version="1.0.0",
    description=(
        "Energy cost intelligence for Iranian industry: bill audit, real-time "
        "consumption analytics and verified savings."
    ),
    lifespan=lifespan,
    # API docs only in development; they map the whole attack surface.
    docs_url="/docs" if settings.is_development else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.is_development else None,
)

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}


@app.middleware("http")
async def harden(request, call_next):
    # Reject oversized bodies before they are read. Every endpoint takes small JSON.
    length = request.headers.get("content-length")
    if length and (not length.isdigit() or int(length) > settings.max_body_bytes):
        return JSONResponse({"detail": "Request body too large"}, status_code=413)
    response = await call_next(request)
    for key, value in SECURITY_HEADERS.items():
        response.headers.setdefault(key, value)
    if request.url.path.startswith(settings.api_prefix):
        # Tenant data must never sit in a shared or browser HTTP cache.
        response.headers["Cache-Control"] = "no-store"
        if not request.url.path.startswith(f"{settings.api_prefix}/docs"):
            response.headers.setdefault(
                "Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"
            )
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc: RequestValidationError) -> JSONResponse:
    # The default handler echoes the rejected input back. That leaks submitted
    # passwords into responses and logs, and an Infinity/NaN input crashes the
    # JSON encoder, turning a 422 into a 500.
    errors = [{k: v for k, v in e.items() if k in ("type", "loc", "msg")} for e in exc.errors()]
    return JSONResponse({"detail": jsonable_encoder(errors)}, status_code=422)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,  # bearer tokens, no cookies
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Retry-After"],
    max_age=600,
)

for router in (auth.router, sites.router, bills.router, dashboard.router, alerts.router, public.router):
    app.include_router(router, prefix=settings.api_prefix)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "service": "eex-iran-api"}


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {"name": settings.project_name, "health": "/health"}
