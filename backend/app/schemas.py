"""Request and response schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# --- auth -------------------------------------------------------------------
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    locale: str
    organization_id: int | None = None
    organization_name_fa: str | None = None
    organization_name_en: str | None = None


# --- sites ------------------------------------------------------------------
class SiteOut(BaseModel):
    id: int
    name_fa: str
    name_en: str
    industry: str
    province_fa: str
    province_en: str
    city_fa: str
    city_en: str
    status: str
    contracted_demand_kw: float
    peak_capacity_kw: float
    shifts: int
    meters_count: int
    lat: float
    lng: float
    monthly_production: float
    production_unit_fa: str
    production_unit_en: str


class SiteLive(BaseModel):
    """The live tile shown on the dashboard for one site."""

    site_id: int
    kw: float
    kvar: float
    power_factor: float
    band: str
    load_percent: float
    demand_headroom_percent: float
    ts: str


class SiteDetail(SiteOut):
    live: SiteLive
    open_findings: int
    annual_saving_potential: float
    verified_savings_ytd: float
    last_bill_total: float | None = None
    last_bill_period_fa: str | None = None


# --- bills ------------------------------------------------------------------
class FindingOut(BaseModel):
    id: int
    code: str
    severity: str
    title_fa: str
    title_en: str
    detail_fa: str
    detail_en: str
    action_fa: str
    action_en: str
    annual_saving: float
    monthly_saving: float
    confidence: float
    investment: float
    payback_months: float | None
    evidence: dict
    status: str
    site_id: int


class BillOut(BaseModel):
    id: int
    site_id: int
    jalali_year: int
    jalali_month: int
    period_label_fa: str
    period_label_en: str
    issued_at: datetime
    peak_kwh: float
    mid_peak_kwh: float
    off_peak_kwh: float
    total_kwh: float
    contracted_demand_kw: float
    peak_demand_kw: float
    power_factor: float
    production_units: float | None
    billed_total: float
    recomputed_total: float
    status: str
    finding_count: int = 0
    saving_potential: float = 0.0


class BillDetail(BillOut):
    breakdown: dict
    findings: list[FindingOut] = []
    site_name_fa: str = ""
    site_name_en: str = ""


class BillAnalyzeRequest(BaseModel):
    """Ad-hoc analysis: paste the numbers off an invoice, get findings back."""

    peak_kwh: float = Field(ge=0)
    mid_peak_kwh: float = Field(ge=0)
    off_peak_kwh: float = Field(ge=0)
    contracted_demand_kw: float = Field(gt=0)
    peak_demand_kw: float = Field(gt=0)
    power_factor: float = Field(gt=0, le=1)
    jalali_month: int = Field(default=1, ge=1, le=12)
    billed_total: float | None = None
    production_units: float | None = None
    industry: str = "other"


class BillAnalyzeResponse(BaseModel):
    breakdown: dict
    findings: list[dict]
    summary: dict


# --- alerts -----------------------------------------------------------------
class AlertOut(BaseModel):
    id: int
    site_id: int
    site_name_fa: str = ""
    site_name_en: str = ""
    kind: str
    severity: str
    title_fa: str
    title_en: str
    message_fa: str
    message_en: str
    value: float | None
    threshold: float | None
    acknowledged: bool
    created_at: datetime


# --- dashboard --------------------------------------------------------------
class DashboardKpis(BaseModel):
    active_sites: int
    pilot_sites: int
    total_kw_now: float
    monthly_energy_cost: float
    verified_savings_ytd: float
    saving_potential: float
    open_findings: int
    high_severity_findings: int
    avg_power_factor: float
    peak_share: float
    unacknowledged_alerts: int
    energy_intensity_change: float


class PortfolioPoint(BaseModel):
    ts: str
    kw: float


class DashboardOut(BaseModel):
    kpis: DashboardKpis
    portfolio_load: list[PortfolioPoint]
    band_split: dict
    savings_trend: list[dict]
    top_findings: list[FindingOut]
    sites: list[SiteDetail]
    recent_alerts: list[AlertOut]


# --- savings ----------------------------------------------------------------
class SavingsOut(BaseModel):
    id: int
    site_id: int
    month: str
    period_label_fa: str
    baseline_kwh: float
    actual_kwh: float
    saved_kwh: float
    saved_amount: float
    verified: bool


# --- public -----------------------------------------------------------------
class CalculatorRequest(BaseModel):
    monthly_bill: float = Field(gt=0, description="Monthly energy bill in Toman")
    industry: str = "other"
    shifts: int = Field(default=2, ge=1, le=3)
    power_factor: float | None = Field(default=None, gt=0, le=1)
    has_peak_production: bool = True


class CalculatorResponse(BaseModel):
    conservative_annual: float
    expected_annual: float
    optimistic_annual: float
    monthly_expected: float
    percent_expected: float
    payback_months: float
    breakdown: list[dict]
    subscription_annual: float
    net_annual: float
    roi_multiple: float


class LeadRequest(BaseModel):
    company: str = Field(min_length=2, max_length=160)
    contact_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=6, max_length=32)
    email: EmailStr | None = None
    industry: str = "other"
    province: str = ""
    monthly_bill: float | None = None
    message: str | None = Field(default=None, max_length=2000)
    locale: str = "fa"


class LeadResponse(BaseModel):
    id: int
    status: str
    message_fa: str
    message_en: str
