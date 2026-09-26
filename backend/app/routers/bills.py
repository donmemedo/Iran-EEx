"""Invoices and their audit findings."""
from fastapi import APIRouter, HTTPException, Query
from sqlmodel import func, select

from ..models import Bill, Finding, Site
from ..schemas import BillDetail, BillOut, FindingOut
from ..security import CurrentUser, DbSession

router = APIRouter(tags=["bills"])


def _bill_out(session, bill: Bill) -> BillOut:
    count, saving = session.exec(
        select(func.count(Finding.id), func.coalesce(func.sum(Finding.annual_saving), 0.0)).where(
            Finding.bill_id == bill.id
        )
    ).one()
    return BillOut(
        **bill.model_dump(exclude={"breakdown"}),
        total_kwh=round(bill.peak_kwh + bill.mid_peak_kwh + bill.off_peak_kwh, 1),
        finding_count=int(count or 0),
        saving_potential=float(saving or 0.0),
    )


@router.get("/bills", response_model=list[BillOut])
def list_bills(
    user: CurrentUser,
    session: DbSession,
    site_id: int | None = None,
    status: str | None = None,
    limit: int = Query(default=60, le=300),
) -> list[BillOut]:
    stmt = select(Bill)
    if site_id:
        stmt = stmt.where(Bill.site_id == site_id)
    if status:
        stmt = stmt.where(Bill.status == status)
    bills = session.exec(stmt.order_by(Bill.issued_at.desc()).limit(limit)).all()
    return [_bill_out(session, b) for b in bills]


@router.get("/bills/{bill_id}", response_model=BillDetail)
def get_bill(bill_id: int, user: CurrentUser, session: DbSession) -> BillDetail:
    bill = session.get(Bill, bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    site = session.get(Site, bill.site_id)
    findings = session.exec(
        select(Finding).where(Finding.bill_id == bill.id).order_by(Finding.annual_saving.desc())
    ).all()
    base = _bill_out(session, bill)
    return BillDetail(
        **base.model_dump(),
        breakdown=bill.breakdown or {},
        findings=[FindingOut.model_validate(f, from_attributes=True) for f in findings],
        site_name_fa=site.name_fa if site else "",
        site_name_en=site.name_en if site else "",
    )


@router.get("/findings", response_model=list[FindingOut])
def list_findings(
    user: CurrentUser,
    session: DbSession,
    site_id: int | None = None,
    status: str | None = "open",
    severity: str | None = None,
    limit: int = Query(default=100, le=500),
) -> list[FindingOut]:
    stmt = select(Finding)
    if site_id:
        stmt = stmt.where(Finding.site_id == site_id)
    if status:
        stmt = stmt.where(Finding.status == status)
    if severity:
        stmt = stmt.where(Finding.severity == severity)
    rows = session.exec(stmt.order_by(Finding.annual_saving.desc()).limit(limit)).all()
    return [FindingOut.model_validate(f, from_attributes=True) for f in rows]


@router.patch("/findings/{finding_id}", response_model=FindingOut)
def update_finding(
    finding_id: int,
    status: str,
    user: CurrentUser,
    session: DbSession,
) -> FindingOut:
    if status not in {"open", "in_progress", "done", "dismissed"}:
        raise HTTPException(status_code=422, detail="Unknown status")
    finding = session.get(Finding, finding_id)
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    finding.status = status
    session.add(finding)
    session.commit()
    session.refresh(finding)
    return FindingOut.model_validate(finding, from_attributes=True)
