"""Sites, live readings and consumption series."""
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import func, select

from ..models import Bill, Finding, SavingsRecord, Site
from ..schemas import SiteDetail, SiteLive, SiteOut
from ..security import CurrentUser, DbSession
from ..services.timeseries import (
    SiteProfile,
    aggregate_bands,
    downsample,
    monthly_totals,
    sample,
    series,
)

router = APIRouter(prefix="/sites", tags=["sites"])

RANGES: dict[str, tuple[timedelta, int, int]] = {
    # name: (window, step minutes, max points)
    "24h": (timedelta(hours=24), 15, 120),
    "7d": (timedelta(days=7), 60, 168),
    "30d": (timedelta(days=30), 180, 120),
    "12m": (timedelta(days=365), 1440, 120),
}


def profile_for(site: Site) -> SiteProfile:
    return SiteProfile(
        site_id=site.id or 0,
        base_load_kw=site.base_load_kw,
        peak_capacity_kw=site.peak_capacity_kw,
        shifts=site.shifts,
        power_factor=site.typical_power_factor,
    )


def live_for(site: Site) -> SiteLive:
    reading = sample(profile_for(site), datetime.now(UTC))
    return SiteLive(
        site_id=site.id,
        kw=reading["kw"],
        kvar=reading["kvar"],
        power_factor=reading["power_factor"],
        band=reading["band"],
        load_percent=round(reading["kw"] / max(site.peak_capacity_kw, 1) * 100, 1),
        demand_headroom_percent=round(
            (1 - reading["kw"] / max(site.contracted_demand_kw, 1)) * 100, 1
        ),
        ts=reading["ts"],
    )


def detail_for(session, site: Site) -> SiteDetail:
    open_findings = session.exec(
        select(func.count(Finding.id)).where(Finding.site_id == site.id, Finding.status == "open")
    ).one()
    potential = session.exec(
        select(func.coalesce(func.sum(Finding.annual_saving), 0.0)).where(
            Finding.site_id == site.id, Finding.status == "open"
        )
    ).one()
    verified = session.exec(
        select(func.coalesce(func.sum(SavingsRecord.saved_amount), 0.0)).where(
            SavingsRecord.site_id == site.id, SavingsRecord.verified == True  # noqa: E712
        )
    ).one()
    last_bill = session.exec(
        select(Bill).where(Bill.site_id == site.id).order_by(Bill.issued_at.desc())
    ).first()

    return SiteDetail(
        **SiteOut.model_validate(site, from_attributes=True).model_dump(),
        live=live_for(site),
        open_findings=int(open_findings or 0),
        annual_saving_potential=float(potential or 0.0),
        verified_savings_ytd=float(verified or 0.0),
        last_bill_total=last_bill.billed_total if last_bill else None,
        last_bill_period_fa=last_bill.period_label_fa if last_bill else None,
    )


@router.get("", response_model=list[SiteDetail])
def list_sites(
    user: CurrentUser,
    session: DbSession,
    status: str | None = None,
    industry: str | None = None,
    q: str | None = None,
) -> list[SiteDetail]:
    stmt = select(Site)
    if user.organization_id:
        stmt = stmt.where(Site.organization_id == user.organization_id)
    if status:
        stmt = stmt.where(Site.status == status)
    if industry:
        stmt = stmt.where(Site.industry == industry)
    sites = session.exec(stmt.order_by(Site.id)).all()
    if q:
        needle = q.strip().lower()
        sites = [
            s
            for s in sites
            if needle in s.name_fa.lower()
            or needle in s.name_en.lower()
            or needle in s.province_fa.lower()
            or needle in s.province_en.lower()
        ]
    return [detail_for(session, s) for s in sites]


@router.get("/{site_id}", response_model=SiteDetail)
def get_site(site_id: int, user: CurrentUser, session: DbSession) -> SiteDetail:
    site = session.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return detail_for(session, site)


@router.get("/{site_id}/live", response_model=SiteLive)
def get_live(site_id: int, user: CurrentUser, session: DbSession) -> SiteLive:
    site = session.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return live_for(site)


@router.get("/{site_id}/consumption")
def consumption(
    site_id: int,
    user: CurrentUser,
    session: DbSession,
    range: str = Query(default="24h", pattern="^(24h|7d|30d|12m)$"),
) -> dict:
    """Load profile and band split over the requested window."""
    site = session.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    window, step, max_points = RANGES[range]
    now = datetime.now(UTC)
    profile = profile_for(site)

    if range == "12m":
        months = monthly_totals(profile, months=12, end=now)
        return {
            "range": range,
            "resolution": "month",
            "points": [
                {
                    "ts": m["month"],
                    "kwh": m["kwh"],
                    "kw": m["peak_kw"],
                    "power_factor": m["power_factor"],
                    "band": "mid_peak",
                    "anomaly": False,
                }
                for m in months
            ],
            "bands": {
                "peak": round(sum(m["peak"] for m in months), 1),
                "mid_peak": round(sum(m["mid_peak"] for m in months), 1),
                "off_peak": round(sum(m["off_peak"] for m in months), 1),
            },
            "contracted_demand_kw": site.contracted_demand_kw,
            "peak_capacity_kw": site.peak_capacity_kw,
        }

    readings = series(profile, now - window, now, step)
    bands = aggregate_bands(readings)
    points = downsample(readings, max_points)
    return {
        "range": range,
        "resolution": f"{step}m",
        "points": points,
        "bands": bands,
        "contracted_demand_kw": site.contracted_demand_kw,
        "peak_capacity_kw": site.peak_capacity_kw,
        "peak_kw": round(max((r["kw"] for r in readings), default=0.0), 1),
        "avg_kw": round(sum(r["kw"] for r in readings) / max(len(readings), 1), 1),
        "total_kwh": round(sum(r["kwh"] for r in readings), 1),
        "avg_power_factor": round(
            sum(r["power_factor"] for r in readings) / max(len(readings), 1), 3
        ),
    }


@router.get("/{site_id}/meters")
def meters(site_id: int, user: CurrentUser, session: DbSession) -> dict:
    """Per-feeder breakdown, derived from the site profile."""
    site = session.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    live = live_for(site)
    # A realistic industrial distribution: process load dominates, then utilities.
    layout = [
        ("خط تولید اصلی", "Main production line", 0.46),
        ("کوره / فرایند حرارتی", "Furnace / thermal process", 0.21),
        ("هوای فشرده", "Compressed air", 0.12),
        ("تهویه و سرمایش", "HVAC & cooling", 0.11),
        ("روشنایی و اداری", "Lighting & offices", 0.06),
        ("سایر", "Other", 0.04),
    ]
    feeders = []
    for idx, (name_fa, name_en, share) in enumerate(layout):
        kw = round(live.kw * share, 1)
        feeders.append(
            {
                "id": f"{site.id}-{idx + 1}",
                "name_fa": name_fa,
                "name_en": name_en,
                "kw": kw,
                "share": share,
                "status": "online" if idx < site.meters_count else "offline",
                "power_factor": round(min(0.99, live.power_factor + (idx - 2) * 0.012), 3),
            }
        )
    return {"site_id": site.id, "total_kw": live.kw, "feeders": feeders}
