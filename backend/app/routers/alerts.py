"""Operational alerts."""
from fastapi import APIRouter, Query
from sqlmodel import func, select

from ..models import Alert, Site
from ..schemas import AlertCount, AlertOut
from ..security import DbSession, Editor, OrgUser
from ..tenancy import get_owned_or_404, org_site_ids

router = APIRouter(prefix="/alerts", tags=["alerts"])


def _alert_out(alert: Alert, site: Site | None) -> AlertOut:
    return AlertOut(
        **alert.model_dump(),
        site_name_fa=site.name_fa if site else "",
        site_name_en=site.name_en if site else "",
    )


@router.get("", response_model=list[AlertOut])
def list_alerts(
    user: OrgUser,
    session: DbSession,
    site_id: int | None = None,
    severity: str | None = Query(default=None, max_length=16),
    acknowledged: bool | None = None,
    limit: int = Query(default=100, ge=1, le=400),
) -> list[AlertOut]:
    stmt = (
        select(Alert, Site)
        .join(Site, Site.id == Alert.site_id)
        .where(Site.organization_id == user.organization_id)
    )
    if site_id:
        stmt = stmt.where(Alert.site_id == site_id)
    if severity:
        stmt = stmt.where(Alert.severity == severity)
    if acknowledged is not None:
        stmt = stmt.where(Alert.acknowledged == acknowledged)
    rows = session.exec(stmt.order_by(Alert.created_at.desc()).limit(limit)).all()
    return [_alert_out(alert, site) for alert, site in rows]


@router.get("/count", response_model=AlertCount)
def count_alerts(user: OrgUser, session: DbSession) -> AlertCount:
    """Unacknowledged alerts, for the navigation badge."""
    count = session.exec(
        select(func.count(Alert.id)).where(
            Alert.site_id.in_(org_site_ids(user)),
            Alert.acknowledged == False,  # noqa: E712
        )
    ).one()
    return AlertCount(unacknowledged=int(count or 0))


@router.post("/{alert_id}/acknowledge", response_model=AlertOut)
def acknowledge(alert_id: int, user: Editor, session: DbSession) -> AlertOut:
    alert = get_owned_or_404(session, user, Alert, alert_id, "Alert not found")
    alert.acknowledged = True
    session.add(alert)
    session.commit()
    session.refresh(alert)
    return _alert_out(alert, session.get(Site, alert.site_id))
