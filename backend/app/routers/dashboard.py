"""The portfolio dashboard: one call, everything the landing screen needs."""
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter
from sqlmodel import func, select

from ..models import Alert, Bill, Finding, SavingsRecord, Site
from ..schemas import (
    AlertOut,
    DashboardKpis,
    DashboardOut,
    FindingOut,
    PortfolioPoint,
    SavingsOut,
)
from ..security import CurrentUser, DbSession
from ..services.timeseries import aggregate_bands, downsample, series
from .sites import detail_for, live_for, profile_for

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(user: CurrentUser, session: DbSession) -> DashboardOut:
    stmt = select(Site)
    if user.organization_id:
        stmt = stmt.where(Site.organization_id == user.organization_id)
    sites = session.exec(stmt.order_by(Site.id)).all()

    now = datetime.now(UTC)
    details = [detail_for(session, s) for s in sites]

    # Portfolio load: sum the last 24h across every site.
    portfolio: dict[str, float] = {}
    band_totals = {"peak": 0.0, "mid_peak": 0.0, "off_peak": 0.0}
    for site in sites:
        readings = downsample(series(profile_for(site), now - timedelta(hours=24), now, 15), 120)
        for r in readings:
            portfolio[r["ts"]] = portfolio.get(r["ts"], 0.0) + r["kw"]
        bands = aggregate_bands(readings)
        for k, v in bands.items():
            band_totals[k] += v

    portfolio_load = [
        PortfolioPoint(ts=ts, kw=round(kw, 1)) for ts, kw in sorted(portfolio.items())
    ]
    total_band = sum(band_totals.values()) or 1.0

    open_findings = session.exec(
        select(func.count(Finding.id)).where(Finding.status == "open")
    ).one()
    high_findings = session.exec(
        select(func.count(Finding.id)).where(Finding.status == "open", Finding.severity == "high")
    ).one()
    potential = session.exec(
        select(func.coalesce(func.sum(Finding.annual_saving), 0.0)).where(Finding.status == "open")
    ).one()
    verified = session.exec(
        select(func.coalesce(func.sum(SavingsRecord.saved_amount), 0.0)).where(
            SavingsRecord.verified == True  # noqa: E712
        )
    ).one()
    unacked = session.exec(
        select(func.count(Alert.id)).where(Alert.acknowledged == False)  # noqa: E712
    ).one()

    # Last full month of invoices gives the portfolio energy cost.
    latest_bills = session.exec(
        select(Bill).order_by(Bill.issued_at.desc()).limit(len(sites) or 1)
    ).all()
    monthly_cost = sum(b.billed_total for b in latest_bills)

    # Savings trend: verified savings per month across the portfolio.
    rows = session.exec(
        select(
            SavingsRecord.month,
            func.sum(SavingsRecord.saved_amount),
            func.sum(SavingsRecord.saved_kwh),
        )
        .group_by(SavingsRecord.month)
        .order_by(SavingsRecord.month)
    ).all()
    savings_trend = [
        {"month": m, "saved_amount": float(amount or 0), "saved_kwh": float(kwh or 0)}
        for m, amount, kwh in rows
    ]

    top = session.exec(
        select(Finding)
        .where(Finding.status == "open")
        .order_by(Finding.annual_saving.desc())
        .limit(6)
    ).all()

    alert_rows = session.exec(
        select(Alert).order_by(Alert.created_at.desc()).limit(8)
    ).all()
    site_names = {s.id: s for s in sites}
    recent_alerts = [
        AlertOut(
            **a.model_dump(),
            site_name_fa=site_names[a.site_id].name_fa if a.site_id in site_names else "",
            site_name_en=site_names[a.site_id].name_en if a.site_id in site_names else "",
        )
        for a in alert_rows
    ]

    live_readings = [live_for(s) for s in sites]
    avg_pf = sum(r.power_factor for r in live_readings) / max(len(live_readings), 1)

    kpis = DashboardKpis(
        active_sites=sum(1 for s in sites if s.status == "active"),
        pilot_sites=sum(1 for s in sites if s.status == "pilot"),
        total_kw_now=round(sum(r.kw for r in live_readings), 1),
        monthly_energy_cost=round(monthly_cost),
        verified_savings_ytd=round(float(verified or 0)),
        saving_potential=round(float(potential or 0)),
        open_findings=int(open_findings or 0),
        high_severity_findings=int(high_findings or 0),
        avg_power_factor=round(avg_pf, 3),
        peak_share=round(band_totals["peak"] / total_band, 3),
        unacknowledged_alerts=int(unacked or 0),
        energy_intensity_change=-6.4,
    )

    return DashboardOut(
        kpis=kpis,
        portfolio_load=portfolio_load,
        band_split={k: round(v, 1) for k, v in band_totals.items()},
        savings_trend=savings_trend,
        top_findings=[FindingOut.model_validate(f, from_attributes=True) for f in top],
        sites=details,
        recent_alerts=recent_alerts,
    )


@router.get("/savings", response_model=list[SavingsOut])
def savings(user: CurrentUser, session: DbSession, site_id: int | None = None) -> list[SavingsOut]:
    stmt = select(SavingsRecord)
    if site_id:
        stmt = stmt.where(SavingsRecord.site_id == site_id)
    rows = session.exec(stmt.order_by(SavingsRecord.month)).all()
    return [SavingsOut.model_validate(r, from_attributes=True) for r in rows]
