"""Invoices and their audit findings."""
from fastapi import APIRouter, Query
from sqlmodel import Session, func, select

from ..models import Bill, Finding, Site
from ..schemas import BillDetail, BillOut, FindingOut, FindingStatus
from ..security import DbSession, Editor, OrgUser
from ..tenancy import get_owned_or_404, org_site_ids

router = APIRouter(tags=["bills"])


def _bills_out(session: Session, bills: list[Bill]) -> list[BillOut]:
    """Bills with their finding count and saving potential, in one grouped query."""
    totals = {
        bill_id: (int(count or 0), float(saving or 0.0))
        for bill_id, count, saving in session.exec(
            select(
                Finding.bill_id,
                func.count(Finding.id),
                func.coalesce(func.sum(Finding.annual_saving), 0.0),
            )
            .where(Finding.bill_id.in_([b.id for b in bills]))
            .group_by(Finding.bill_id)
        ).all()
    } if bills else {}
    return [
        BillOut(
            **b.model_dump(exclude={"breakdown"}),
            total_kwh=round(b.peak_kwh + b.mid_peak_kwh + b.off_peak_kwh, 1),
            finding_count=totals.get(b.id, (0, 0.0))[0],
            saving_potential=totals.get(b.id, (0, 0.0))[1],
        )
        for b in bills
    ]


@router.get("/bills", response_model=list[BillOut])
def list_bills(
    user: OrgUser,
    session: DbSession,
    site_id: int | None = None,
    status: str | None = Query(default=None, max_length=32),
    limit: int = Query(default=60, ge=1, le=300),
) -> list[BillOut]:
    stmt = select(Bill).where(Bill.site_id.in_(org_site_ids(user)))
    if site_id:
        stmt = stmt.where(Bill.site_id == site_id)
    if status:
        stmt = stmt.where(Bill.status == status)
    bills = session.exec(stmt.order_by(Bill.issued_at.desc()).limit(limit)).all()
    return _bills_out(session, list(bills))


@router.get("/bills/{bill_id}", response_model=BillDetail)
def get_bill(bill_id: int, user: OrgUser, session: DbSession) -> BillDetail:
    bill = get_owned_or_404(session, user, Bill, bill_id, "Bill not found")
    site = session.get(Site, bill.site_id)
    findings = session.exec(
        select(Finding).where(Finding.bill_id == bill.id).order_by(Finding.annual_saving.desc())
    ).all()
    base = _bills_out(session, [bill])[0]
    return BillDetail(
        **base.model_dump(),
        breakdown=bill.breakdown or {},
        findings=[FindingOut.model_validate(f, from_attributes=True) for f in findings],
        site_name_fa=site.name_fa if site else "",
        site_name_en=site.name_en if site else "",
    )


@router.get("/findings", response_model=list[FindingOut])
def list_findings(
    user: OrgUser,
    session: DbSession,
    site_id: int | None = None,
    status: FindingStatus | None = "open",
    severity: str | None = Query(default=None, max_length=16),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[FindingOut]:
    stmt = select(Finding).where(Finding.site_id.in_(org_site_ids(user)))
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
    status: FindingStatus,
    user: Editor,
    session: DbSession,
) -> FindingOut:
    finding = get_owned_or_404(session, user, Finding, finding_id, "Finding not found")
    finding.status = status
    session.add(finding)
    session.commit()
    session.refresh(finding)
    return FindingOut.model_validate(finding, from_attributes=True)
