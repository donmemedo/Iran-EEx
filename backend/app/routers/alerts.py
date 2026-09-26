"""Operational alerts."""
from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from ..models import Alert, Site
from ..schemas import AlertOut
from ..security import CurrentUser, DbSession

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertOut])
def list_alerts(
    user: CurrentUser,
    session: DbSession,
    site_id: int | None = None,
    severity: str | None = None,
    acknowledged: bool | None = None,
    limit: int = Query(default=100, le=400),
) -> list[AlertOut]:
    stmt = select(Alert)
    if site_id:
        stmt = stmt.where(Alert.site_id == site_id)
    if severity:
        stmt = stmt.where(Alert.severity == severity)
    if acknowledged is not None:
        stmt = stmt.where(Alert.acknowledged == acknowledged)
    rows = session.exec(stmt.order_by(Alert.created_at.desc()).limit(limit)).all()
    sites = {s.id: s for s in session.exec(select(Site)).all()}
    return [
        AlertOut(
            **a.model_dump(),
            site_name_fa=sites[a.site_id].name_fa if a.site_id in sites else "",
            site_name_en=sites[a.site_id].name_en if a.site_id in sites else "",
        )
        for a in rows
    ]


@router.post("/{alert_id}/acknowledge", response_model=AlertOut)
def acknowledge(alert_id: int, user: CurrentUser, session: DbSession) -> AlertOut:
    alert = session.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.acknowledged = True
    session.add(alert)
    session.commit()
    session.refresh(alert)
    site = session.get(Site, alert.site_id)
    return AlertOut(
        **alert.model_dump(),
        site_name_fa=site.name_fa if site else "",
        site_name_en=site.name_en if site else "",
    )
