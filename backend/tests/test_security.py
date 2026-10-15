"""Security regression tests. Each one is an attack that used to work or a control
that must keep holding. A failure here is a vulnerability, not a flaky test."""
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from conftest import PASSWORD, login
from pydantic import ValidationError

from app.config import Settings, settings

API = "/api/v1"


# --- tenant isolation ---------------------------------------------------------
@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/sites/{site}"),
        ("get", "/sites/{site}/live"),
        ("get", "/sites/{site}/consumption?range=24h"),
        ("get", "/sites/{site}/meters"),
        ("get", "/bills/{bill}"),
        ("patch", "/findings/{finding}?status=dismissed"),
        ("post", "/alerts/{alert}/acknowledge"),
    ],
)
def test_other_tenants_objects_are_not_found(client, rival_headers, demo_ids, method, path):
    r = getattr(client, method)(API + path.format(**demo_ids), headers=rival_headers)
    assert r.status_code == 404, r.text


def test_lists_only_show_own_tenant(client, rival_headers, demo_ids):
    sites = client.get(f"{API}/sites", headers=rival_headers).json()
    assert [s["name_en"] for s in sites] == ["Rival Plant"]
    rival_site = sites[0]["id"]
    for path in ("/bills", "/findings", "/alerts", "/savings"):
        rows = client.get(API + path, headers=rival_headers).json()
        assert all(row["site_id"] == rival_site for row in rows), path
    # Asking for the other tenant's site by id filters to nothing.
    for path in ("/bills", "/findings", "/alerts", "/savings"):
        assert client.get(f"{API}{path}?site_id={demo_ids['site']}", headers=rival_headers).json() == []


def test_dashboard_aggregates_are_tenant_scoped(client, rival_headers, demo_headers):
    rival = client.get(f"{API}/dashboard", headers=rival_headers).json()
    demo = client.get(f"{API}/dashboard", headers=demo_headers).json()
    assert len(rival["sites"]) == 1 and len(demo["sites"]) == 2
    rival_site = rival["sites"][0]["id"]
    assert all(f["site_id"] == rival_site for f in rival["top_findings"])
    assert all(a["site_id"] == rival_site for a in rival["recent_alerts"])
    rival_open = client.get(f"{API}/findings?limit=500", headers=rival_headers).json()
    assert rival["kpis"]["open_findings"] == len(rival_open)
    assert rival["kpis"]["unacknowledged_alerts"] == 1
    assert client.get(f"{API}/alerts/count", headers=rival_headers).json() == {"unacknowledged": 1}


def test_user_without_organization_sees_nothing(client):
    headers = login(client, "orphan@other.ir")
    assert client.get(f"{API}/auth/me", headers=headers).status_code == 200
    for path in ("/sites", "/dashboard", "/bills", "/findings", "/alerts", "/savings"):
        assert client.get(API + path, headers=headers).status_code == 403, path


def test_registration_endpoint_is_gone(client):
    r = client.post(f"{API}/auth/register", json={"email": "x@evil.io", "password": "password123"})
    assert r.status_code in (404, 405)


# --- roles --------------------------------------------------------------------
def test_analyst_is_read_only(client, analyst_headers, demo_ids):
    assert client.get(f"{API}/findings", headers=analyst_headers).status_code == 200
    r = client.patch(f"{API}/findings/{demo_ids['finding']}?status=done", headers=analyst_headers)
    assert r.status_code == 403
    r = client.post(f"{API}/alerts/{demo_ids['alert']}/acknowledge", headers=analyst_headers)
    assert r.status_code == 403


# --- authentication -------------------------------------------------------------
def test_unknown_email_and_wrong_password_look_the_same(client):
    a = client.post(f"{API}/auth/login", json={"email": "nobody@eex.ir", "password": "x"})
    b = client.post(f"{API}/auth/login", json={"email": "demo@eex.ir", "password": "x"})
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


def _token(**overrides) -> str:
    now = datetime.now(UTC)
    claims = {"sub": "1", "iat": now, "exp": now + timedelta(minutes=5), "typ": "access"}
    claims.update(overrides)
    secret = claims.pop("_secret", settings.jwt_secret)
    alg = claims.pop("_alg", "HS256")
    return jwt.encode(claims, secret, algorithm=alg)


@pytest.mark.parametrize(
    "token",
    [
        pytest.param(lambda: _token(_secret="y" * 48), id="wrong-secret"),
        pytest.param(lambda: _token(exp=datetime.now(UTC) - timedelta(seconds=5)), id="expired"),
        pytest.param(lambda: _token(sub="999999"), id="unknown-user"),
        pytest.param(lambda: _token(sub="demo@eex.ir"), id="email-subject"),
        pytest.param(lambda: _token(typ="refresh"), id="wrong-type"),
        pytest.param(lambda: jwt.encode({"sub": "1"}, None, algorithm="none"), id="alg-none"),
        pytest.param(lambda: "not.a.token", id="garbage"),
    ],
)
def test_forged_or_stale_tokens_are_rejected(client, token):
    r = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token()}"})
    assert r.status_code == 401


def test_login_is_rate_limited(client):
    for _ in range(10):
        client.post(f"{API}/auth/login", json={"email": "demo@eex.ir", "password": "wrong"})
    r = client.post(f"{API}/auth/login", json={"email": "demo@eex.ir", "password": PASSWORD})
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) > 0


def test_lead_spam_is_rate_limited(client):
    lead = {"company": "Acme", "contact_name": "Ali", "phone": "09120000000"}
    codes = [client.post(f"{API}/leads", json=lead).status_code for _ in range(6)]
    assert codes[:5] == [201] * 5 and codes[5] == 429


def test_weak_jwt_secret_is_refused_outside_development():
    for weak in ("", "change-me-in-production-eex-iran", "short"):
        with pytest.raises(ValidationError):
            Settings(environment="production", jwt_secret=weak)
    assert Settings(environment="production", jwt_secret="z" * 32).jwt_secret == "z" * 32


# --- input validation -----------------------------------------------------------
@pytest.mark.parametrize("path", ["/bills?limit=-1", "/bills?limit=0", "/findings?limit=-1", "/alerts?limit=-1"])
def test_negative_or_zero_limit_is_rejected(client, demo_headers, path):
    assert client.get(API + path, headers=demo_headers).status_code == 422


@pytest.mark.parametrize(
    "body",
    [
        '{"monthly_bill": Infinity}',
        '{"monthly_bill": NaN}',
        '{"monthly_bill": 1e400}',
        '{"monthly_bill": 1e14}',
        '{"monthly_bill": 5e8, "industry": "<script>"}',
        '{"monthly_bill": 5e8, "unexpected": 1}',
    ],
)
def test_calculator_rejects_hostile_numbers_and_fields(client, body):
    r = client.post(
        f"{API}/calculator/estimate", content=body, headers={"Content-Type": "application/json"}
    )
    assert r.status_code == 422, r.text


def test_bill_analysis_with_no_energy_is_rejected(client):
    body = {"peak_kwh": 0, "mid_peak_kwh": 0, "off_peak_kwh": 0, "contracted_demand_kw": 100,
            "peak_demand_kw": 90, "power_factor": 0.9}
    assert client.post(f"{API}/bills/analyze", json=body).status_code == 422


def test_unknown_finding_status_is_rejected(client, demo_headers, demo_ids):
    r = client.patch(f"{API}/findings/{demo_ids['finding']}?status=bogus", headers=demo_headers)
    assert r.status_code == 422


def test_oversized_body_is_rejected(client):
    r = client.post(f"{API}/leads", content=b"x" * (70 * 1024), headers={"Content-Type": "application/json"})
    assert r.status_code == 413


# --- transport and headers ------------------------------------------------------
def test_api_responses_carry_security_headers(client, demo_headers):
    r = client.get(f"{API}/sites", headers=demo_headers)
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert r.headers["Cache-Control"] == "no-store"
    assert "default-src 'none'" in r.headers["Content-Security-Policy"]


def test_cors_rejects_unknown_origins(client):
    r = client.options(
        f"{API}/auth/login",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in r.headers
    ok = client.options(
        f"{API}/auth/login",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"},
    )
    assert ok.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "access-control-allow-credentials" not in ok.headers


def test_validation_errors_do_not_echo_input(client):
    secret = "p" * 200
    r = client.post(f"{API}/auth/login", json={"email": "demo@eex.ir", "password": secret})
    assert r.status_code == 422
    assert secret not in r.text


# --- controls added after the blue-team review --------------------------------
def test_streamed_body_without_length_is_capped(client):
    def chunks():
        for _ in range(80):
            yield b"x" * 1024  # 80 KB, sent chunked with no Content-Length

    r = client.post(f"{API}/leads", content=chunks(), headers={"Content-Type": "application/json"})
    # Reading stops past 64 KB. FastAPI reports Starlette's limit error raised mid-body
    # as a body parse error (400); with Content-Length the answer is 413.
    assert r.status_code in (400, 413)


def test_one_source_cannot_lock_an_account_out_for_everyone():
    from app.ratelimit import login_by_email, login_by_ip_email

    for _ in range(20):
        login_by_ip_email.hit("10.0.0.1|demo@eex.ir")
        login_by_email.hit("demo@eex.ir")
    with pytest.raises(Exception) as blocked:
        login_by_ip_email.hit("10.0.0.1|demo@eex.ir")
    assert blocked.value.status_code == 429
    login_by_ip_email.hit("10.0.0.2|demo@eex.ir")  # the real user, elsewhere: still allowed
    login_by_email.hit("demo@eex.ir")  # the per-account ceiling (100) is not reached


def test_limiter_overflow_evicts_oldest_not_everything(monkeypatch):
    import app.ratelimit as rl

    monkeypatch.setattr(rl, "_MAX_KEYS", 3)
    limiter = rl.RateLimiter("t", limit=2, window_seconds=60)
    for key in ("a", "b", "victim"):
        limiter.hit(key)
    limiter.hit("victim")
    limiter.hit("d")  # table full: evicts "a", the oldest window
    assert set(limiter._hits) == {"b", "victim", "d"}
    with pytest.raises(Exception):
        limiter.hit("victim")  # its count survived the overflow


def test_deactivated_user_is_locked_out(client, db, demo_headers):
    from sqlmodel import select

    from app.models import User

    user = db.exec(select(User).where(User.email == "demo@eex.ir")).one()
    user.is_active = False
    db.add(user)
    db.commit()
    assert client.get(f"{API}/auth/me", headers=demo_headers).status_code == 401
    r = client.post(f"{API}/auth/login", json={"email": "demo@eex.ir", "password": PASSWORD})
    assert r.status_code == 401


@pytest.mark.parametrize("missing", ["exp", "iat", "sub"])
def test_tokens_missing_a_required_claim_are_rejected(client, missing):
    now = datetime.now(UTC)
    claims = {"sub": "1", "iat": now, "exp": now + timedelta(minutes=5), "typ": "access"}
    del claims[missing]
    token = jwt.encode(claims, settings.jwt_secret, algorithm="HS256")
    assert client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_password_is_compared_exactly(client):
    r = client.post(f"{API}/auth/login", json={"email": "demo@eex.ir", "password": f" {PASSWORD} "})
    assert r.status_code == 401


@pytest.mark.parametrize("path", ["/sites/99999999999999999999", "/bills?site_id=99999999999999999999"])
def test_oversized_ids_are_rejected_not_crashing(client, demo_headers, path):
    assert client.get(API + path, headers=demo_headers).status_code == 422


def test_docs_and_form_login_are_off_in_production():
    import os
    import subprocess
    import sys

    env = dict(os.environ, ENVIRONMENT="production", JWT_SECRET="p" * 40, DATABASE_URL="sqlite://")
    probe = (
        "from app.main import app;"
        "paths = set(app.openapi_schema or {}) | {getattr(r, 'path', '') for r in app.router.routes};"
        "print(app.docs_url, app.openapi_url, any(p.endswith('/auth/token') for p in paths))"
    )
    out = subprocess.run(
        [sys.executable, "-c", probe], env=env, capture_output=True, text=True, timeout=300,
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    )
    assert out.stdout.split() == ["None", "None", "False"], out.stderr[-2000:]
