"""Database models.

NOTE: this module deliberately does not use `from __future__ import annotations`.
SQLModel resolves relationship targets from the real annotation objects, and
stringified annotations break that resolution.
"""

from datetime import UTC, datetime

from sqlalchemy import JSON, Column, Index, Text
from sqlmodel import Field, Relationship, SQLModel


def utcnow() -> datetime:
    return datetime.now(UTC)


class Organization(SQLModel, table=True):
    __tablename__ = "organizations"

    id: int | None = Field(default=None, primary_key=True)
    name_fa: str
    name_en: str
    industry: str = "other"
    plan: str = "growth"          # pilot | growth | enterprise
    created_at: datetime = Field(default_factory=utcnow)

    sites: list["Site"] = Relationship(back_populates="organization")
    users: list["User"] = Relationship(back_populates="organization")


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    hashed_password: str
    full_name: str
    role: str = "manager"          # owner | manager | analyst | admin
    locale: str = "fa"
    is_active: bool = True
    organization_id: int | None = Field(default=None, foreign_key="organizations.id")
    created_at: datetime = Field(default_factory=utcnow)

    organization: Organization | None = Relationship(back_populates="users")


class Site(SQLModel, table=True):
    __tablename__ = "sites"

    id: int | None = Field(default=None, primary_key=True)
    # Every tenant-scoped query filters on this column.
    organization_id: int | None = Field(default=None, foreign_key="organizations.id", index=True)
    name_fa: str
    name_en: str
    industry: str = "other"
    province_fa: str = ""
    province_en: str = ""
    city_fa: str = ""
    city_en: str = ""
    status: str = "active"         # active | pilot | onboarding
    contracted_demand_kw: float = 1000.0
    peak_capacity_kw: float = 1200.0
    base_load_kw: float = 200.0
    shifts: int = 2
    typical_power_factor: float = 0.88
    monthly_production: float = 1000.0
    production_unit_fa: str = "تن"
    production_unit_en: str = "ton"
    meters_count: int = 4
    lat: float = 35.7
    lng: float = 51.4
    commissioned_at: datetime = Field(default_factory=utcnow)

    organization: Organization | None = Relationship(back_populates="sites")
    bills: list["Bill"] = Relationship(
        back_populates="site", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    alerts: list["Alert"] = Relationship(
        back_populates="site", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class Bill(SQLModel, table=True):
    __tablename__ = "bills"
    __table_args__ = (Index("ix_bills_site_issued", "site_id", "issued_at"),)

    id: int | None = Field(default=None, primary_key=True)
    site_id: int = Field(foreign_key="sites.id", index=True)
    jalali_year: int = 1405
    jalali_month: int = 1
    period_label_fa: str = ""
    period_label_en: str = ""
    issued_at: datetime = Field(default_factory=utcnow)
    peak_kwh: float = 0.0
    mid_peak_kwh: float = 0.0
    off_peak_kwh: float = 0.0
    contracted_demand_kw: float = 0.0
    peak_demand_kw: float = 0.0
    power_factor: float = 0.9
    production_units: float | None = None
    billed_total: float = 0.0
    recomputed_total: float = 0.0
    breakdown: dict = Field(default_factory=dict, sa_column=Column(JSON))
    status: str = "analyzed"       # analyzed | pending | disputed
    created_at: datetime = Field(default_factory=utcnow)

    site: Site | None = Relationship(back_populates="bills")
    findings: list["Finding"] = Relationship(
        back_populates="bill", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class Finding(SQLModel, table=True):
    __tablename__ = "findings"
    __table_args__ = (Index("ix_findings_site_status", "site_id", "status"),)

    id: int | None = Field(default=None, primary_key=True)
    bill_id: int = Field(foreign_key="bills.id", index=True)
    site_id: int = Field(foreign_key="sites.id", index=True)
    code: str
    severity: str = "medium"
    title_fa: str
    title_en: str
    detail_fa: str = Field(sa_column=Column(Text))
    detail_en: str = Field(sa_column=Column(Text))
    action_fa: str = Field(sa_column=Column(Text))
    action_en: str = Field(sa_column=Column(Text))
    annual_saving: float = 0.0
    monthly_saving: float = 0.0
    confidence: float = 0.8
    investment: float = 0.0
    payback_months: float | None = None
    evidence: dict = Field(default_factory=dict, sa_column=Column(JSON))
    status: str = "open"           # open | in_progress | done | dismissed
    created_at: datetime = Field(default_factory=utcnow)

    bill: Bill | None = Relationship(back_populates="findings")


class Alert(SQLModel, table=True):
    __tablename__ = "alerts"
    __table_args__ = (Index("ix_alerts_site_ack_created", "site_id", "acknowledged", "created_at"),)

    id: int | None = Field(default=None, primary_key=True)
    site_id: int = Field(foreign_key="sites.id", index=True)
    kind: str                       # peak_warning | power_factor | anomaly | demand_exceedance | outage_risk
    severity: str = "medium"        # high | medium | low
    title_fa: str
    title_en: str
    message_fa: str = Field(sa_column=Column(Text))
    message_en: str = Field(sa_column=Column(Text))
    value: float | None = None
    threshold: float | None = None
    acknowledged: bool = False
    created_at: datetime = Field(default_factory=utcnow, index=True)

    site: Site | None = Relationship(back_populates="alerts")


class SavingsRecord(SQLModel, table=True):
    __tablename__ = "savings_records"

    id: int | None = Field(default=None, primary_key=True)
    site_id: int = Field(foreign_key="sites.id", index=True)
    month: str                      # YYYY-MM
    period_label_fa: str = ""
    baseline_kwh: float = 0.0
    actual_kwh: float = 0.0
    saved_kwh: float = 0.0
    saved_amount: float = 0.0
    verified: bool = True
    created_at: datetime = Field(default_factory=utcnow)


class Lead(SQLModel, table=True):
    """A demo request coming from the public site."""

    __tablename__ = "leads"

    id: int | None = Field(default=None, primary_key=True)
    company: str
    contact_name: str
    phone: str
    email: str | None = None
    industry: str = "other"
    province: str = ""
    monthly_bill: float | None = None
    message: str | None = Field(default=None, sa_column=Column(Text))
    locale: str = "fa"
    source: str = "website"
    status: str = "new"             # new | contacted | meeting | pilot | won | lost
    created_at: datetime = Field(default_factory=utcnow)
