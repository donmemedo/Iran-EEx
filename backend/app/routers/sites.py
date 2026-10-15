"""Sites, live readings and consumption series."""
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Query
from sqlmodel import Session, func, select

from ..models import Bill, Finding, SavingsRecord, Site
from ..schemas import Id, SiteDetail, SiteLive, SiteOut
from ..security import DbSession, OrgUser
from ..services.timeseries import (
    SiteProfile,
    aggregate_bands,
    downsample,
    monthly_totals,
    sample,
    series,
)
from ..tenancy import get_site_or_404, jalali_year_start_month

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


def live_for(site: Site, now: datetime | None = None) -> SiteLive:
    reading = sample(profile_for(site), now or datetime.now(UTC))
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


def site_stats(session: Session, site_ids: list[int]) -> dict[int, dict]:
    """Per-site figures for the site cards, in four grouped queries for any number of sites."""
    stats = {
        sid: {"open": 0, "potential": 0.0, "verified": 0.0, "last_bill": None} for sid in site_ids
    }
    if not site_ids:
        return stats
    for sid, count, potential in session.exec(
        select(Finding.site_id, func.count(Finding.id), func.coalesce(func.sum(Finding.annual_saving), 0.0))
        .where(Finding.site_id.in_(site_ids), Finding.status == "open")
        .group_by(Finding.site_id)
    ).all():
        stats[sid]["open"] = int(count or 0)
        stats[sid]["potential"] = float(potential or 0.0)
    for sid, verified in session.exec(
        select(SavingsRecord.site_id, func.coalesce(func.sum(SavingsRecord.saved_amount), 0.0))
        .where(
            SavingsRecord.site_id.in_(site_ids),
            SavingsRecord.verified == True,  # noqa: E712
            SavingsRecord.month >= jalali_year_start_month(),
        )
        .group_by(SavingsRecord.site_id)
    ).all():
        stats[sid]["verified"] = float(verified or 0.0)
    latest = (
        select(Bill.site_id, func.max(Bill.issued_at).label("issued_at"))
        .where(Bill.site_id.in_(site_ids))
        .group_by(Bill.site_id)
        .subquery()
    )
    for bill in session.exec(
        select(Bill).join(
            latest, (Bill.site_id == latest.c.site_id) & (Bill.issued_at == latest.c.issued_at)
        )
    ).all():
        stats[bill.site_id]["last_bill"] = bill
    return stats


def detail_for(site: Site, stats: dict, live: SiteLive) -> SiteDetail:
    last_bill = stats["last_bill"]
    return SiteDetail(
        **SiteOut.model_validate(site, from_attributes=True).model_dump(),
        live=live,
        open_findings=stats["open"],
        annual_saving_potential=stats["potential"],
        verified_savings_ytd=stats["verified"],
        last_bill_total=last_bill.billed_total if last_bill else None,
        last_bill_period_fa=last_bill.period_label_fa if last_bill else None,
    )


def details_for(session: Session, sites: list[Site], now: datetime | None = None) -> list[SiteDetail]:
    now = now or datetime.now(UTC)
    stats = site_stats(session, [s.id for s in sites])
    return [detail_for(s, stats[s.id], live_for(s, now)) for s in sites]


@router.get("", response_model=list[SiteDetail])
def list_sites(
    user: OrgUser,
    session: DbSession,
    status: str | None = Query(default=None, max_length=32),
    industry: str | None = Query(default=None, max_length=32),
    q: str | None = Query(default=None, max_length=100),
) -> list[SiteDetail]:
    stmt = select(Site).where(Site.organization_id == user.organization_id)
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
    return details_for(session, sites)


@router.get("/{site_id}", response_model=SiteDetail)
def get_site(site_id: Id, user: OrgUser, session: DbSession) -> SiteDetail:
    site = get_site_or_404(session, user, site_id)
    return details_for(session, [site])[0]


@router.get("/{site_id}/live", response_model=SiteLive)
def get_live(site_id: Id, user: OrgUser, session: DbSession) -> SiteLive:
    return live_for(get_site_or_404(session, user, site_id))


@router.get("/{site_id}/consumption")
def consumption(
    site_id: Id,
    user: OrgUser,
    session: DbSession,
    range: str = Query(default="24h", pattern="^(24h|7d|30d|12m)$"),
) -> dict:
    """Load profile and band split over the requested window."""
    site = get_site_or_404(session, user, site_id)

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
def meters(site_id: Id, user: OrgUser, session: DbSession) -> dict:
    """Per-feeder breakdown, derived from the site profile."""
    site = get_site_or_404(session, user, site_id)

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
