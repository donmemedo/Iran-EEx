"""Shared fixtures.

The demo portfolio is seeded once per test session into an in-memory template
database. Each test gets a private copy (SQLite backup API), so tests stay
isolated without paying for the seed again.
"""
import os
import sys
from datetime import UTC, datetime

# Settings are read at import time, so the test environment is set first.
os.environ.update(
    ENVIRONMENT="development",
    JWT_SECRET="test-secret-" + "x" * 40,
    DATABASE_URL="sqlite://",
    SEED_ON_STARTUP="false",
    BCRYPT_ROUNDS="4",  # bcrypt's minimum; production keeps 12
)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session, SQLModel, create_engine, select  # noqa: E402
from sqlmodel.pool import StaticPool  # noqa: E402

import app.seed as seed_module  # noqa: E402
from app.database import get_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Alert, Bill, Finding, Organization, Site, User  # noqa: E402
from app.ratelimit import ALL_LIMITERS  # noqa: E402
from app.security import hash_password  # noqa: E402

PASSWORD = "demo1234"


def _memory_engine():
    return create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)


def _guaranteed_alert(site: Site) -> Alert:
    """Seeded alerts depend on the live reading, so tests add one they can rely on."""
    return Alert(
        site_id=site.id, kind="anomaly", severity="medium", title_fa="آزمون", title_en="Test",
        message_fa="آزمون", message_en="Test alert", acknowledged=False,
        created_at=datetime.now(UTC),
    )


@pytest.fixture(scope="session")
def template_engine():
    engine = _memory_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        original = seed_module.SITES
        seed_module.SITES = original[:2]  # a small slice keeps the session setup fast
        try:
            seed_module.seed(session)
        finally:
            seed_module.SITES = original
        demo_site = session.exec(select(Site).order_by(Site.id)).first()
        session.add(_guaranteed_alert(demo_site))

        # A second tenant, used to attack the first one.
        rival = Organization(name_fa="رقیب", name_en="Rival Co", industry="steel")
        session.add(rival)
        session.flush()
        session.add(User(email="rival@other.ir", hashed_password=hash_password(PASSWORD),
                         full_name="Rival", role="owner", organization_id=rival.id))
        session.add(User(email="orphan@other.ir", hashed_password=hash_password(PASSWORD),
                         full_name="No org", role="manager", organization_id=None))
        rival_site = Site(organization_id=rival.id, name_fa="کارخانه رقیب", name_en="Rival Plant",
                          industry="steel", base_load_kw=300, peak_capacity_kw=1500,
                          contracted_demand_kw=1400, shifts=2)
        session.add(rival_site)
        session.flush()
        seed_module._build_bills(session, rival_site, months=4)
        session.add(_guaranteed_alert(rival_site))
        session.commit()
    return engine


@pytest.fixture
def engine(template_engine):
    engine = _memory_engine()
    source = template_engine.raw_connection().driver_connection
    target = engine.raw_connection().driver_connection
    source.backup(target)
    return engine


@pytest.fixture(name="client")
def client_fixture(engine):
    def override():
        with Session(engine) as session:
            yield session

    for limiter in ALL_LIMITERS:
        limiter.reset()
    app.dependency_overrides[get_session] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def db(engine):
    with Session(engine) as session:
        yield session


def login(client, email: str, password: str = PASSWORD) -> dict:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def demo_headers(client):
    return login(client, "demo@eex.ir")


@pytest.fixture
def rival_headers(client):
    return login(client, "rival@other.ir")


@pytest.fixture
def analyst_headers(client):
    return login(client, "analyst@eex.ir")


@pytest.fixture
def demo_ids(db):
    """One object of each kind owned by the demo organization."""
    org = db.exec(select(Organization).where(Organization.name_en == "EEx Iran")).one()
    site = db.exec(select(Site).where(Site.organization_id == org.id).order_by(Site.id)).first()
    return {
        "site": site.id,
        "bill": db.exec(select(Bill).where(Bill.site_id == site.id)).first().id,
        "finding": db.exec(select(Finding).where(Finding.site_id == site.id)).first().id,
        "alert": db.exec(select(Alert).where(Alert.site_id == site.id)).first().id,
    }
