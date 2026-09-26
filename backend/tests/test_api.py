"""API and engine tests."""
import os
import sys
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_session  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed  # noqa: E402
from app.services.bill_audit import audit_bill  # noqa: E402
from app.services.jalali import from_date, gregorian_to_jalali, jalali_to_gregorian  # noqa: E402
from app.services.tariff import BillInput, compute_bill  # noqa: E402
from app.services.timeseries import SiteProfile, sample, series  # noqa: E402


@pytest.fixture(name="client")
def client_fixture():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)

    def override():
        with Session(engine) as session:
            yield session

    with Session(engine) as session:
        # A small slice of the demo portfolio keeps the suite fast.
        import app.seed as seed_module

        original = seed_module.SITES
        seed_module.SITES = original[:2]
        try:
            seed(session)
        finally:
            seed_module.SITES = original

    app.dependency_overrides[get_session] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def auth_headers(client) -> dict:
    r = client.post("/api/v1/auth/login", json={"email": "demo@eex.ir", "password": "demo1234"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# --- tariff -----------------------------------------------------------------
def test_bill_recomputes_consistently():
    data = BillInput(
        peak_kwh=100_000, mid_peak_kwh=300_000, off_peak_kwh=200_000,
        contracted_demand_kw=2000, peak_demand_kw=1900, power_factor=0.96, jalali_month=1,
    )
    b = compute_bill(data)
    # A healthy site pays no penalties and earns the power-factor bonus.
    assert b.demand_penalty == 0
    assert b.reactive_penalty == 0
    assert b.reactive_bonus > 0
    # Peak energy is priced at four times off-peak for the same kWh.
    per_peak = b.energy_peak / data.peak_kwh
    per_off = b.energy_off_peak / data.off_peak_kwh
    assert round(per_peak / per_off, 2) == 4.0


def test_summer_costs_more_than_winter():
    kwargs = dict(
        peak_kwh=100_000, mid_peak_kwh=300_000, off_peak_kwh=200_000,
        contracted_demand_kw=2000, peak_demand_kw=1900, power_factor=0.92,
    )
    assert compute_bill(BillInput(**kwargs, jalali_month=5)).total > compute_bill(
        BillInput(**kwargs, jalali_month=10)
    ).total


# --- audit engine -----------------------------------------------------------
def test_audit_flags_low_power_factor_with_payback():
    _, findings = audit_bill(
        BillInput(
            peak_kwh=90_000, mid_peak_kwh=300_000, off_peak_kwh=200_000,
            contracted_demand_kw=2000, peak_demand_kw=1900, power_factor=0.78, jalali_month=2,
        )
    )
    pf = next(f for f in findings if f.code == "low_power_factor")
    assert pf.severity == "high"
    assert pf.annual_saving > 0
    assert pf.investment > 0
    assert pf.payback_months and pf.payback_months > 0
    assert pf.evidence["required_kvar"] > 0


def test_audit_flags_demand_exceedance_and_oversize_are_exclusive():
    over = audit_bill(
        BillInput(
            peak_kwh=80_000, mid_peak_kwh=300_000, off_peak_kwh=200_000,
            contracted_demand_kw=1000, peak_demand_kw=1400, power_factor=0.95, jalali_month=2,
        )
    )[1]
    under = audit_bill(
        BillInput(
            peak_kwh=80_000, mid_peak_kwh=300_000, off_peak_kwh=200_000,
            contracted_demand_kw=4000, peak_demand_kw=1400, power_factor=0.95, jalali_month=2,
        )
    )[1]
    codes_over = {f.code for f in over}
    codes_under = {f.code for f in under}
    assert "demand_exceedance" in codes_over and "demand_oversized" not in codes_over
    assert "demand_oversized" in codes_under and "demand_exceedance" not in codes_under


def test_audit_detects_billing_error():
    breakdown, _ = audit_bill(
        BillInput(
            peak_kwh=80_000, mid_peak_kwh=300_000, off_peak_kwh=200_000,
            contracted_demand_kw=2000, peak_demand_kw=1900, power_factor=0.95, jalali_month=2,
        )
    )
    _, findings = audit_bill(
        BillInput(
            peak_kwh=80_000, mid_peak_kwh=300_000, off_peak_kwh=200_000,
            contracted_demand_kw=2000, peak_demand_kw=1900, power_factor=0.95, jalali_month=2,
            billed_total=breakdown.total * 1.08,
        )
    )
    mismatch = next(f for f in findings if f.code == "bill_total_mismatch")
    assert mismatch.severity == "high"
    assert mismatch.annual_saving > 0


def test_clean_bill_produces_no_penalty_findings():
    _, findings = audit_bill(
        BillInput(
            peak_kwh=60_000, mid_peak_kwh=300_000, off_peak_kwh=240_000,
            contracted_demand_kw=2000, peak_demand_kw=1800, power_factor=0.96, jalali_month=2,
        )
    )
    assert {f.code for f in findings} <= {"energy_intensity"}


# --- time series ------------------------------------------------------------
def test_series_is_deterministic_and_bounded():
    profile = SiteProfile(site_id=7, base_load_kw=200, peak_capacity_kw=1000, shifts=2, power_factor=0.88)
    now = datetime.now(UTC).replace(second=0, microsecond=0)
    a = series(profile, now - timedelta(hours=6), now, 15)
    b = series(profile, now - timedelta(hours=6), now, 15)
    assert a == b
    for r in a:
        assert profile.base_load_kw * 0.9 <= r["kw"] <= profile.peak_capacity_kw * 1.16
        assert 0.6 <= r["power_factor"] <= 1.0


def test_bands_cover_the_whole_day():
    profile = SiteProfile(site_id=3, base_load_kw=100, peak_capacity_kw=500, shifts=3, power_factor=0.9)
    now = datetime.now(UTC)
    readings = series(profile, now - timedelta(hours=24), now, 60)
    assert {r["band"] for r in readings} == {"peak", "mid_peak", "off_peak"}


# --- jalali -----------------------------------------------------------------
@pytest.mark.parametrize(
    "gregorian,jalali",
    [((2026, 3, 21), (1405, 1, 1)), ((2026, 9, 12), (1405, 6, 21)), ((2024, 2, 29), (1402, 12, 10))],
)
def test_jalali_roundtrip(gregorian, jalali):
    assert gregorian_to_jalali(*gregorian) == jalali
    assert jalali_to_gregorian(*jalali) == gregorian


# --- API --------------------------------------------------------------------
def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


def test_login_rejects_bad_password(client):
    r = client.post("/api/v1/auth/login", json={"email": "demo@eex.ir", "password": "wrong"})
    assert r.status_code == 401


def test_protected_routes_require_a_token(client):
    assert client.get("/api/v1/dashboard").status_code == 401
    assert client.get("/api/v1/sites").status_code == 401


def test_dashboard_returns_a_coherent_portfolio(client):
    r = client.get("/api/v1/dashboard", headers=auth_headers(client))
    assert r.status_code == 200
    body = r.json()
    assert len(body["sites"]) == 2
    assert body["kpis"]["total_kw_now"] > 0
    assert body["portfolio_load"]
    assert sum(body["band_split"].values()) > 0


def test_consumption_ranges(client):
    headers = auth_headers(client)
    for rng, resolution in [("24h", "15m"), ("7d", "60m"), ("30d", "180m"), ("12m", "month")]:
        r = client.get(f"/api/v1/sites/1/consumption?range={rng}", headers=headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["resolution"] == resolution
        assert len(body["points"]) > 1


def test_bill_detail_findings_match_the_stored_total(client):
    headers = auth_headers(client)
    bills = client.get("/api/v1/bills", headers=headers).json()
    assert bills
    detail = client.get(f"/api/v1/bills/{bills[0]['id']}", headers=headers).json()
    assert detail["breakdown"]["total"] == detail["recomputed_total"]
    assert detail["finding_count"] == len(detail["findings"])


def test_finding_status_can_be_updated(client):
    headers = auth_headers(client)
    findings = client.get("/api/v1/findings", headers=headers).json()
    assert findings
    fid = findings[0]["id"]
    r = client.patch(f"/api/v1/findings/{fid}?status=done", headers=headers)
    assert r.status_code == 200 and r.json()["status"] == "done"
    assert client.patch(f"/api/v1/findings/{fid}?status=bogus", headers=headers).status_code == 422


def test_alert_acknowledge(client):
    headers = auth_headers(client)
    alerts = client.get("/api/v1/alerts", headers=headers).json()
    if alerts:
        r = client.post(f"/api/v1/alerts/{alerts[0]['id']}/acknowledge", headers=headers)
        assert r.status_code == 200 and r.json()["acknowledged"] is True


def test_public_calculator_stays_in_the_claimed_band(client):
    r = client.post(
        "/api/v1/calculator/estimate",
        json={"monthly_bill": 500_000_000, "industry": "steel", "shifts": 3, "power_factor": 0.86},
    )
    assert r.status_code == 200
    body = r.json()
    # The business plan claims 8-20% of controllable energy cost.
    assert 8 <= body["percent_expected"] <= 20
    assert body["expected_annual"] > body["conservative_annual"]
    assert body["optimistic_annual"] > body["expected_annual"]
    assert sum(item["annual"] for item in body["breakdown"]) == pytest.approx(
        body["expected_annual"], rel=0.01
    )


def test_public_bill_analysis(client):
    r = client.post(
        "/api/v1/bills/analyze",
        json={
            "peak_kwh": 90000, "mid_peak_kwh": 300000, "off_peak_kwh": 200000,
            "contracted_demand_kw": 2000, "peak_demand_kw": 2300, "power_factor": 0.82,
            "jalali_month": 5, "industry": "steel",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]["annual_saving"] > 0
    assert {f["code"] for f in body["findings"]} >= {"low_power_factor", "demand_exceedance"}


def test_lead_capture(client):
    r = client.post(
        "/api/v1/leads",
        json={
            "company": "کارخانه آزمون", "contact_name": "علی رضایی",
            "phone": "09120000000", "industry": "food", "province": "تهران",
        },
    )
    assert r.status_code == 201
    assert r.json()["status"] == "new"


def test_lead_validation_rejects_empty_company(client):
    r = client.post("/api/v1/leads", json={"company": "", "contact_name": "x", "phone": "1"})
    assert r.status_code == 422


# --- Persian numerals -------------------------------------------------------
def test_persianize_converts_digits_and_separators():
    from app.services.jalali import persianize

    assert persianize("2,104") == "۲٬۱۰۴"
    assert persianize("0.83") == "۰٫۸۳"
    # A separator not between digits is left alone - it is punctuation, not a
    # number separator.
    assert persianize("سلام، خوبی.") == "سلام، خوبی."


def test_findings_carry_persian_numerals():
    _, findings = audit_bill(
        BillInput(
            peak_kwh=120_000, mid_peak_kwh=300_000, off_peak_kwh=180_000,
            contracted_demand_kw=2000, peak_demand_kw=2260, power_factor=0.83, jalali_month=5,
        )
    )
    assert findings
    for finding in findings:
        assert not any(ch.isdigit() and ch.isascii() for ch in finding.detail_fa)
        assert not any(ch.isdigit() and ch.isascii() for ch in finding.action_fa)
