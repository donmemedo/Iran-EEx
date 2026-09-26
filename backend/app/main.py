"""EEx Iran API - energy cost intelligence for Iranian factories."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from .config import settings
from .database import engine, init_db
from .routers import alerts, auth, bills, dashboard, public, sites
from .seed import seed


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
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (auth.router, sites.router, bills.router, dashboard.router, alerts.router, public.router):
    app.include_router(router, prefix=settings.api_prefix)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "service": "eex-iran-api"}


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {"name": settings.project_name, "docs": "/docs", "health": "/health"}
