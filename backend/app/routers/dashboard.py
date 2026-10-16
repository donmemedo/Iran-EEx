"""The portfolio dashboard: one call, everything the landing screen needs."""
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter
from sqlmodel import case, func, select

from ..models import Alert, Bill, Finding, SavingsRecord, Site
from ..schemas import (
    AlertOut,
    DashboardKpis,
    DashboardOut,
    FindingOut,
    PortfolioPoint,
    SavingsOut,
    SiteFilter,
)
from ..security import DbSession, OrgUser
from ..services.timeseries import aggregate_bands, downsample, series
from ..tenancy import org_site_ids
from .sites import details_for, profile_for

router = APIRouter(tags=["dashboard"])


def _energy_intensity_change(session, user) -> float:
    """Mean per-site percent change in kWh per production unit, latest 3 billing months vs
    the first 3. Per site, because sites count production in different units (tons,
    square metres, batches) that cannot be added together."""
    rows = session.exec(
        select(
            Bill.site_id,
            Bill.peak_kwh + Bill.mid_peak_kwh + Bill.off_peak_kwh,
            Bill.production_units,
        )
        .where(Bill.site_id.in_(org_site_ids(user)), Bill.production_units > 0)
        .order_by(Bill.site_id, Bill.jalali_year, Bill.jalali_month)
    ).all()
    by_site: dict[int, list[float]] = {}
    for site_id, kwh, units in rows:
        by_site.setdefault(site_id, []).append(kwh / units)
    changes = [
        sum(v[-3:]) / sum(v[:3]) - 1 for v in by_site.values() if len(v) >= 6 and sum(v[:3])
    ]
    return round(sum(changes) / len(changes) * 100, 1) if changes else 0.0


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(user: OrgUser, session: DbSession) -> DashboardOut:
    sites = session.exec(
        select(Site).where(Site.organization_id == user.organization_id).order_by(Site.id)
    ).all()
    site_ids = org_site_ids(user)

    now = datetime.now(UTC)
    details = details_for(session, list(sites), now)

    # Portfolio load: sum the last 24h across every site.
    portfolio: dict[str, float] = {}
    band_totals = {"peak": 0.0, "mid_peak": 0.0, "off_peak": 0.0}
    for site in sites:
        readings = downsample(series(profile_for(site), now - timedelta(hours=24), now, 15), 120)
        for r in readings:
            portfolio[r["ts"]] = portfolio.get(r["ts"], 0.0) + r["kw"]
        for k, v in aggregate_bands(readings).items():
            band_totals[k] += v

    portfolio_load = [
        PortfolioPoint(ts=ts, kw=round(kw, 1)) for ts, kw in sorted(portfolio.items())
    ]
    total_band = sum(band_totals.values()) or 1.0

    open_findings, high_findings, potential = session.exec(
        select(
            func.count(Finding.id),
            func.coalesce(func.sum(case((Finding.severity == "high", 1), else_=0)), 0),
            func.coalesce(func.sum(Finding.annual_saving), 0.0),
        ).where(Finding.site_id.in_(site_ids), Finding.status == "open")
    ).one()
    unacked = session.exec(
        select(func.count(Alert.id)).where(
            Alert.site_id.in_(site_ids),
            Alert.acknowledged == False,  # noqa: E712
        )
    ).one()

    # Savings trend: verified savings per month across the portfolio.
    rows = session.exec(
        select(
            SavingsRecord.month,
            func.sum(SavingsRecord.saved_amount),
            func.sum(SavingsRecord.saved_kwh),
        )
        .where(SavingsRecord.site_id.in_(site_ids))
        .group_by(SavingsRecord.month)
        .order_by(SavingsRecord.month)
    ).all()
    savings_trend = [
        {"month": m, "saved_amount": float(amount or 0), "saved_kwh": float(kwh or 0)}
        for m, amount, kwh in rows
    ]

    top = session.exec(
        select(Finding)
        .where(Finding.site_id.in_(site_ids), Finding.status == "open")
        .order_by(Finding.annual_saving.desc())
        .limit(6)
    ).all()

    alert_rows = session.exec(
        select(Alert).where(Alert.site_id.in_(site_ids)).order_by(Alert.created_at.desc()).limit(8)
    ).all()
    site_by_id = {s.id: s for s in sites}
    recent_alerts = [
        AlertOut(
            **a.model_dump(),
            site_name_fa=site_by_id[a.site_id].name_fa,
            site_name_en=site_by_id[a.site_id].name_en,
        )
        for a in alert_rows
    ]

    live_readings = [d.live for d in details]
    avg_pf = sum(r.power_factor for r in live_readings) / max(len(live_readings), 1)

    kpis = DashboardKpis(
        active_sites=sum(1 for s in sites if s.status == "active"),
        pilot_sites=sum(1 for s in sites if s.status == "pilot"),
        total_kw_now=round(sum(r.kw for r in live_readings), 1),
        # Latest invoice of each site, not the N most recent invoices overall.
        monthly_energy_cost=round(sum(d.last_bill_total or 0 for d in details)),
        verified_savings_ytd=round(sum(d.verified_savings_ytd for d in details)),
        saving_potential=round(float(potential or 0)),
        open_findings=int(open_findings or 0),
        high_severity_findings=int(high_findings or 0),
        avg_power_factor=round(avg_pf, 3),
        peak_share=round(band_totals["peak"] / total_band, 3),
        unacknowledged_alerts=int(unacked or 0),
        energy_intensity_change=_energy_intensity_change(session, user),
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
def savings(user: OrgUser, session: DbSession, site_id: SiteFilter = None) -> list[SavingsOut]:
    stmt = select(SavingsRecord).where(SavingsRecord.site_id.in_(org_site_ids(user)))
    if site_id:
        stmt = stmt.where(SavingsRecord.site_id == site_id)
    rows = session.exec(stmt.order_by(SavingsRecord.month)).all()
    return [SavingsOut.model_validate(r, from_attributes=True) for r in rows]
