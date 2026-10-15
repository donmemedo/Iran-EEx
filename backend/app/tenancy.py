"""Tenant scoping. Every row a user can read or change belongs to their organization.

All routers go through these helpers, so the organization check lives in one place.
An object owned by another organization answers 404, not 403, so ids of other
tenants' data cannot be confirmed by probing.
"""
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlmodel import Session, select

from .models import Site, User
from .services.jalali import from_date, jalali_to_gregorian


def org_site_ids(user: User):
    """Subquery: ids of the sites the user's organization owns."""
    return select(Site.id).where(Site.organization_id == user.organization_id)


def get_site_or_404(session: Session, user: User, site_id: int) -> Site:
    site = session.get(Site, site_id)
    if site is None or site.organization_id != user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    return site


def get_owned_or_404(session: Session, user: User, model, obj_id: int, detail: str):
    """Fetch a row that carries site_id (Bill, Finding, Alert) if the user's org owns it."""
    obj = session.exec(
        select(model)
        .join(Site, Site.id == model.site_id)
        .where(model.id == obj_id, Site.organization_id == user.organization_id)
    ).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return obj


def jalali_year_start_month(now: datetime | None = None) -> str:
    """YYYY-MM of the Gregorian month in which the current Jalali year began.

    Savings are stored per Gregorian month, so "this year" (امسال) starts at the
    month that contains Nowruz.
    """
    jy, _, _ = from_date((now or datetime.now(UTC)).date())
    gy, gm, _ = jalali_to_gregorian(jy, 1, 1)
    return f"{gy:04d}-{gm:02d}"
