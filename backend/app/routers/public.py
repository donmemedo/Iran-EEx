"""Endpoints the marketing site calls without authentication."""
from fastapi import APIRouter, Depends

from ..models import Lead
from ..ratelimit import analyze_by_ip, calculator_by_ip, leads_by_ip
from ..schemas import (
    BillAnalyzeRequest,
    BillAnalyzeResponse,
    CalculatorRequest,
    CalculatorResponse,
    LeadRequest,
    LeadResponse,
)
from ..security import DbSession
from ..services.bill_audit import audit_bill, audit_summary
from ..services.tariff import INDUSTRY_BENCHMARKS, BillInput

router = APIRouter(tags=["public"])

# How much of a bill each lever can realistically reach, by industry.
# Derived from the value proposition in the business plan: 8-20% of the
# controllable energy cost at a mid-size industrial site.
INDUSTRY_FACTORS: dict[str, float] = {
    "steel": 1.20,
    "cement": 1.15,
    "ceramic": 1.10,
    "plastic": 1.00,
    "food": 0.95,
    "pharma": 0.85,
    "textile": 1.05,
    "other": 1.00,
}


@router.post(
    "/calculator/estimate",
    response_model=CalculatorResponse,
    dependencies=[Depends(calculator_by_ip.by_ip)],
)
def estimate(payload: CalculatorRequest) -> CalculatorResponse:
    """Savings calculator behind the landing page.

    Splits the estimate into the four levers the product actually pulls, so the
    number is explainable rather than a single opaque percentage.
    """
    bill = payload.monthly_bill
    factor = INDUSTRY_FACTORS.get(payload.industry, 1.0)

    # Lever 1: billing errors found in the audit. Roughly one bill in six carries
    # an error; averaged over a year that is a small but reliable recovery.
    billing = bill * 0.015

    # Lever 2: reactive power penalty, only if the power factor is below the floor.
    pf = payload.power_factor
    if pf is None:
        reactive = bill * 0.025           # assume a typical uncorrected site
    elif pf < 0.90:
        reactive = bill * min(0.11, (0.90 / max(pf, 0.5) - 1.0))
    else:
        reactive = 0.0

    # Lever 3: demand management - right-sizing the contract and shaving peaks.
    demand = bill * 0.030 * factor

    # Lever 4: load shifting out of the peak band and operational efficiency.
    shift_capacity = {1: 0.55, 2: 0.85, 3: 1.0}[payload.shifts]
    shifting = bill * 0.045 * factor * shift_capacity * (1.0 if payload.has_peak_production else 0.35)

    monthly_expected = billing + reactive + demand + shifting
    expected_annual = monthly_expected * 12
    conservative_annual = expected_annual * 0.6
    optimistic_annual = expected_annual * 1.45

    # Platform cost: subscription band from the business plan, scaled with bill size.
    monthly_subscription = min(60_000_000.0, max(18_000_000.0, bill * 0.035))
    setup_cost = min(350_000_000.0, max(120_000_000.0, bill * 0.30))
    subscription_annual = monthly_subscription * 12
    net_annual = expected_annual - subscription_annual
    payback = (
        setup_cost / monthly_expected if monthly_expected > 0 else 0.0
    )

    breakdown = [
        {
            "key": "billing_errors",
            "annual": round(billing * 12),
            "share": round(billing / monthly_expected, 3) if monthly_expected else 0,
        },
        {
            "key": "reactive_power",
            "annual": round(reactive * 12),
            "share": round(reactive / monthly_expected, 3) if monthly_expected else 0,
        },
        {
            "key": "demand_management",
            "annual": round(demand * 12),
            "share": round(demand / monthly_expected, 3) if monthly_expected else 0,
        },
        {
            "key": "load_shifting",
            "annual": round(shifting * 12),
            "share": round(shifting / monthly_expected, 3) if monthly_expected else 0,
        },
    ]

    return CalculatorResponse(
        conservative_annual=round(conservative_annual),
        expected_annual=round(expected_annual),
        optimistic_annual=round(optimistic_annual),
        monthly_expected=round(monthly_expected),
        percent_expected=round(monthly_expected / bill * 100, 1),
        payback_months=round(payback, 1),
        breakdown=breakdown,
        subscription_annual=round(subscription_annual),
        net_annual=round(net_annual),
        roi_multiple=round(expected_annual / subscription_annual, 1) if subscription_annual else 0,
    )


@router.post(
    "/bills/analyze",
    response_model=BillAnalyzeResponse,
    dependencies=[Depends(analyze_by_ip.by_ip)],
)
def analyze(payload: BillAnalyzeRequest) -> BillAnalyzeResponse:
    """Run the audit engine on numbers pasted straight off an invoice."""
    data = BillInput(**payload.model_dump())
    breakdown, findings = audit_bill(data)
    return BillAnalyzeResponse(
        breakdown=breakdown.__dict__ | {"lines": breakdown.lines},
        findings=[f.as_dict() for f in findings],
        summary=audit_summary(findings),
    )


@router.post(
    "/leads",
    response_model=LeadResponse,
    status_code=201,
    dependencies=[Depends(leads_by_ip.by_ip)],
)
def create_lead(payload: LeadRequest, session: DbSession) -> LeadResponse:
    lead = Lead(**payload.model_dump(exclude={"email"}), email=str(payload.email) if payload.email else None)
    session.add(lead)
    session.commit()
    session.refresh(lead)
    return LeadResponse(
        id=lead.id,
        status=lead.status,
        message_fa="درخواست شما ثبت شد. کارشناس ما تا یک روز کاری تماس می‌گیرد.",
        message_en="Your request is registered. Our specialist will call within one business day.",
    )


@router.get("/benchmarks")
def benchmarks() -> dict:
    """Published energy-intensity benchmarks by industry."""
    return {"unit": "kWh per production unit", "industries": INDUSTRY_BENCHMARKS}
