"""Demo data: a portfolio of Iranian industrial sites with 12 months of history.

Bills are generated from the same load-profile generator that drives the live
charts, then run through the audit engine, so every number in the product is
internally consistent: the chart, the invoice and the finding all agree.
"""
from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from .models import Alert, Bill, Finding, Lead, Organization, SavingsRecord, Site, User
from .security import hash_password
from .services.bill_audit import audit_bill
from .services.jalali import MONTHS_EN, MONTHS_FA, from_date, persianize
from .services.tariff import BASE_ENERGY_RATE, DEMAND_RATE, BillInput
from .services.timeseries import SiteProfile, monthly_totals

# name_fa, name_en, industry, province_fa, province_en, city_fa, city_en,
# contracted_kw, capacity_kw, base_kw, shifts, pf, production, unit_fa, unit_en, status, lat, lng
SITES: list[tuple] = [
    ("فولاد پارس آرین", "Pars Arian Steel", "steel", "اصفهان", "Isfahan", "مبارکه", "Mobarakeh",
     4150, 4600, 900, 3, 0.83, 7800, "تن", "ton", "active", 32.35, 51.50),
    ("سیمان البرز غربی", "West Alborz Cement", "cement", "البرز", "Alborz", "نظرآباد", "Nazarabad",
     3550, 3400, 620, 3, 0.86, 26000, "تن", "ton", "active", 35.95, 50.60),
    ("کاشی و سرامیک میبد", "Meybod Tile & Ceramic", "ceramic", "یزد", "Yazd", "میبد", "Meybod",
     3200, 2000, 340, 3, 0.84, 21000, "مترمربع", "sqm", "active", 32.24, 54.02),
    ("پلاستیک سازان قزوین", "Qazvin Plastics", "plastic", "قزوین", "Qazvin", "البرز صنعتی", "Alborz Industrial",
     950, 1080, 175, 2, 0.88, 1150, "تن", "ton", "active", 36.18, 50.00),
    ("صنایع غذایی دشت سبز", "Dasht Sabz Foods", "food", "تهران", "Tehran", "شهریار", "Shahriar",
     850, 820, 190, 2, 0.91, 2400, "تن", "ton", "active", 35.66, 51.05),
    ("داروسازی رازی نوین", "Razi Novin Pharma", "pharma", "تهران", "Tehran", "پرند", "Parand",
     1100, 700, 210, 2, 0.93, 850, "بچ", "batch", "active", 35.48, 50.95),
    ("نساجی یزدبافت", "Yazd Baft Textile", "textile", "یزد", "Yazd", "یزد", "Yazd",
     1250, 1400, 260, 3, 0.85, 2100, "تن", "ton", "active", 31.90, 54.36),
    ("فولاد گستر خراسان", "Khorasan Steel Gostar", "steel", "خراسان رضوی", "Razavi Khorasan", "نیشابور", "Neyshabur",
     4150, 3950, 780, 3, 0.82, 6400, "تن", "ton", "active", 36.21, 58.79),
    ("سیمان مرکزی ساوه", "Saveh Central Cement", "cement", "مرکزی", "Markazi", "ساوه", "Saveh",
     5100, 3200, 580, 3, 0.87, 24000, "تن", "ton", "active", 35.02, 50.36),
    ("کاشی البرز کرج", "Alborz Karaj Tile", "ceramic", "البرز", "Alborz", "کرج", "Karaj",
     1550, 1700, 300, 2, 0.86, 16500, "مترمربع", "sqm", "active", 35.83, 50.99),
    ("پلی‌اتیلن اصفهان", "Isfahan Polyethylene", "plastic", "اصفهان", "Isfahan", "اصفهان", "Isfahan",
     1300, 1250, 205, 3, 0.89, 1400, "تن", "ton", "active", 32.65, 51.67),
    ("لبنیات آسمان قم", "Aseman Qom Dairy", "food", "قم", "Qom", "قم", "Qom",
     1000, 640, 165, 2, 0.90, 1800, "تن", "ton", "active", 34.64, 50.88),
    ("صنایع نساجی کاشان", "Kashan Textile Works", "textile", "اصفهان", "Isfahan", "کاشان", "Kashan",
     1000, 1120, 215, 2, 0.84, 1600, "تن", "ton", "active", 33.98, 51.43),
    ("ذوب فلزات تهران", "Tehran Metal Smelting", "steel", "تهران", "Tehran", "ری", "Rey",
     2850, 2700, 520, 2, 0.81, 3900, "تن", "ton", "active", 35.57, 51.43),
    ("سرامیک صنعتی مرکزی", "Markazi Industrial Ceramics", "ceramic", "مرکزی", "Markazi", "اراک", "Arak",
     2450, 1520, 285, 3, 0.87, 14000, "مترمربع", "sqm", "active", 34.09, 49.70),
    ("داروپخش قزوین", "Qazvin Pharma Works", "pharma", "قزوین", "Qazvin", "قزوین", "Qazvin",
     550, 590, 175, 2, 0.92, 620, "بچ", "batch", "pilot", 36.27, 50.00),
    ("پلاستیک نوین یزد", "Yazd Novin Plastics", "plastic", "یزد", "Yazd", "اشکذر", "Ashkezar",
     1000, 960, 160, 2, 0.87, 980, "تن", "ton", "pilot", 31.98, 54.16),
    ("آرد و غلات البرز", "Alborz Flour & Grain", "food", "البرز", "Alborz", "هشتگرد", "Hashtgerd",
     900, 550, 130, 1, 0.89, 3200, "تن", "ton", "pilot", 35.96, 50.68),
    ("فولاد صنعت مرکزی", "Markazi Steel Industry", "steel", "مرکزی", "Markazi", "خمین", "Khomein",
     2600, 2900, 560, 3, 0.83, 4200, "تن", "ton", "pilot", 33.64, 50.08),
    ("نساجی خراسان نخ", "Khorasan Nakh Textile", "textile", "خراسان رضوی", "Razavi Khorasan", "مشهد", "Mashhad",
     900, 880, 185, 2, 0.86, 1250, "تن", "ton", "onboarding", 36.30, 59.57),
]


def _profile(site: Site) -> SiteProfile:
    return SiteProfile(
        site_id=site.id or 0,
        base_load_kw=site.base_load_kw,
        peak_capacity_kw=site.peak_capacity_kw,
        shifts=site.shifts,
        power_factor=site.typical_power_factor,
    )


def _build_bills(session: Session, site: Site, months: int = 12) -> None:
    """Generate, audit and store a year of invoices for one site."""
    totals = monthly_totals(_profile(site), months=months)
    # Skip the current, still-incomplete month.
    totals = totals[:-1] if len(totals) > 1 else totals

    for idx, m in enumerate(totals):
        year, month = (int(x) for x in m["month"].split("-"))
        issued = datetime(year, month, 1, tzinfo=UTC) + timedelta(days=32)
        issued = issued.replace(day=5)
        jy, jm, _ = from_date(issued.date())

        # Production tracks energy, with its own efficiency drift.
        ratio = m["kwh"] / max(sum(t["kwh"] for t in totals) / len(totals), 1.0)
        production = site.monthly_production * ratio * (1 + 0.04 * math.sin(idx))

        data = BillInput(
            peak_kwh=m["peak"],
            mid_peak_kwh=m["mid_peak"],
            off_peak_kwh=m["off_peak"],
            contracted_demand_kw=site.contracted_demand_kw,
            peak_demand_kw=m["peak_kw"],
            power_factor=m["power_factor"],
            jalali_month=jm,
            billed_total=None,
            production_units=round(production, 1),
            industry=site.industry,
        )
        breakdown, findings = audit_bill(data)

        # The utility's invoice: usually correct, but ~1 in 6 carries an error.
        billed = breakdown.total
        if (site.id or 0) % 6 == idx % 6:
            billed = round(breakdown.total * 1.065)   # over-reading / wrong tariff band
            data.billed_total = billed
            breakdown, findings = audit_bill(data)

        bill = Bill(
            site_id=site.id,
            jalali_year=jy,
            jalali_month=jm,
            period_label_fa=persianize(f"{MONTHS_FA[jm - 1]} {jy}"),
            period_label_en=f"{MONTHS_EN[jm - 1]} {jy}",
            issued_at=issued,
            peak_kwh=round(m["peak"], 1),
            mid_peak_kwh=round(m["mid_peak"], 1),
            off_peak_kwh=round(m["off_peak"], 1),
            contracted_demand_kw=site.contracted_demand_kw,
            peak_demand_kw=m["peak_kw"],
            power_factor=m["power_factor"],
            production_units=round(production, 1),
            billed_total=round(billed),
            recomputed_total=breakdown.total,
            breakdown=breakdown.__dict__ | {"lines": breakdown.lines},
            status="disputed" if data.billed_total else "analyzed",
        )
        session.add(bill)
        session.commit()
        session.refresh(bill)

        # Only the most recent three invoices keep open findings; older ones are
        # marked resolved so the savings history has something to point at.
        for f in findings:
            session.add(
                Finding(
                    bill_id=bill.id,
                    site_id=site.id,
                    status="open" if idx >= len(totals) - 3 else "done",
                    **f.as_dict(),
                )
            )
        session.commit()


def _build_alerts(session: Session, site: Site) -> None:
    now = datetime.now(UTC)
    profile = _profile(site)
    from .services.timeseries import sample

    reading = sample(profile, now)
    seeds = []

    if reading["power_factor"] < 0.90:
        seeds.append(
            (
                "power_factor", "high",
                "ضریب توان زیر حد مجاز",
                "Power factor below the allowed floor",
                f"ضریب توان به {reading['power_factor']:.2f} رسیده است. ادامه این وضعیت تا پایان دوره، "
                f"جریمه توان راکتیو به صورت‌حساب اضافه می‌کند.",
                f"Power factor has dropped to {reading['power_factor']:.2f}. If it holds until the end of "
                f"the period, a reactive power penalty will be added to the invoice.",
                reading["power_factor"], 0.90, 0,
            )
        )
    if reading["kw"] > site.contracted_demand_kw * 0.92:
        seeds.append(
            (
                "demand_exceedance", "high",
                "نزدیک شدن به سقف دیماند قراردادی",
                "Approaching the contracted demand ceiling",
                f"توان لحظه‌ای {reading['kw']:,.0f} کیلووات است و به دیماند قراردادی "
                f"{site.contracted_demand_kw:,.0f} کیلووات نزدیک می‌شود. راه‌اندازی هم‌زمان تجهیزات سنگین را متوقف کنید.",
                f"Instantaneous load is {reading['kw']:,.0f} kW, approaching the contracted "
                f"{site.contracted_demand_kw:,.0f} kW. Hold back simultaneous heavy equipment start-ups.",
                reading["kw"], site.contracted_demand_kw, 1,
            )
        )
    if reading["band"] == "peak":
        seeds.append(
            (
                "peak_warning", "medium",
                "مصرف در بازه اوج بار",
                "Consumption inside the peak band",
                f"سایت در بازه اوج بار {reading['kw']:,.0f} کیلووات مصرف می‌کند. هر کیلووات‌ساعت در این بازه "
                f"چهار برابر کم‌باری هزینه دارد.",
                f"The site is drawing {reading['kw']:,.0f} kW during the peak band, where every kWh costs "
                f"four times the off-peak rate.",
                reading["kw"], None, 2,
            )
        )
    if reading["anomaly"]:
        seeds.append(
            (
                "anomaly", "medium",
                "الگوی مصرف غیرعادی",
                "Unusual consumption pattern",
                "مصرف ثبت‌شده بیش از ۲۰٪ بالاتر از الگوی معمول این ساعت است؛ احتمال کارکرد پیوسته کمپرسور یا "
                "تجهیز بی‌بار وجود دارد.",
                "Measured load is more than 20% above the usual pattern for this hour; a compressor or an "
                "idling machine may be running continuously.",
                reading["kw"], None, 4,
            )
        )

    for kind, severity, t_fa, t_en, m_fa, m_en, value, threshold, hours_ago in seeds:
        session.add(
            Alert(
                site_id=site.id,
                kind=kind,
                severity=severity,
                title_fa=persianize(t_fa),
                title_en=t_en,
                message_fa=persianize(m_fa),
                message_en=m_en,
                value=round(value, 2) if value is not None else None,
                threshold=threshold,
                acknowledged=hours_ago > 3,
                created_at=now - timedelta(hours=hours_ago, minutes=(site.id or 1) * 7 % 60),
            )
        )
    session.commit()


def _build_savings(session: Session, site: Site) -> None:
    """Verified savings: the baseline minus what the site actually consumed."""
    totals = monthly_totals(_profile(site), months=12)[:-1]
    if not totals:
        return
    # Baseline = the average of the first three months, before any measure landed.
    baseline = sum(t["kwh"] for t in totals[:3]) / 3
    blended_rate = BASE_ENERGY_RATE * 1.05

    for idx, m in enumerate(totals):
        if idx < 3:
            continue  # baseline period, nothing claimed yet
        year, month = (int(x) for x in m["month"].split("-"))
        jy, jm, _ = from_date(datetime(year, month, 15).date())
        # Measures ramp in: each month captures a little more.
        ramp = min(0.14, 0.022 * (idx - 2))
        saved_kwh = baseline * ramp
        session.add(
            SavingsRecord(
                site_id=site.id,
                month=m["month"],
                period_label_fa=persianize(f"{MONTHS_FA[jm - 1]} {jy}"),
                baseline_kwh=round(baseline, 1),
                actual_kwh=round(m["kwh"], 1),
                saved_kwh=round(saved_kwh, 1),
                saved_amount=round(saved_kwh * blended_rate),
                verified=idx < len(totals) - 1,
            )
        )
    session.commit()


def seed(session: Session, force: bool = False) -> dict:
    """Populate the database. Idempotent unless force is set."""
    existing = session.exec(select(Site)).first()
    if existing and not force:
        return {"seeded": False, "reason": "already populated"}

    org = Organization(
        name_fa="بهینه‌یار انرژی ایران",
        name_en="EEx Iran",
        industry="energy",
        plan="enterprise",
    )
    session.add(org)
    session.commit()
    session.refresh(org)

    users = [
        ("demo@eex.ir", "مدیر نمونه", "owner"),
        ("manager@eex.ir", "سارا رحیمی", "manager"),
        ("analyst@eex.ir", "امیر کاظمی", "analyst"),
    ]
    for email, name, role in users:
        session.add(
            User(
                email=email,
                hashed_password=hash_password("demo1234"),
                full_name=name,
                role=role,
                organization_id=org.id,
            )
        )
    session.commit()

    for row in SITES:
        (name_fa, name_en, industry, prov_fa, prov_en, city_fa, city_en, contracted,
         capacity, base, shifts, pf, production, unit_fa, unit_en, status, lat, lng) = row
        site = Site(
            organization_id=org.id,
            name_fa=name_fa,
            name_en=name_en,
            industry=industry,
            province_fa=prov_fa,
            province_en=prov_en,
            city_fa=city_fa,
            city_en=city_en,
            status=status,
            contracted_demand_kw=float(contracted),
            peak_capacity_kw=float(capacity),
            base_load_kw=float(base),
            shifts=shifts,
            typical_power_factor=pf,
            monthly_production=float(production),
            production_unit_fa=unit_fa,
            production_unit_en=unit_en,
            meters_count=max(3, int(capacity // 450)),
            lat=lat,
            lng=lng,
            commissioned_at=datetime.now(UTC) - timedelta(days=380),
        )
        session.add(site)
        session.commit()
        session.refresh(site)

        _build_bills(session, site)
        _build_alerts(session, site)
        if site.status == "active":
            _build_savings(session, site)

    # A couple of inbound leads so the pipeline view is not empty.
    session.add(
        Lead(
            company="صنایع مفتول البرز",
            contact_name="رضا موسوی",
            phone="09121234567",
            email="r.mousavi@example.ir",
            industry="steel",
            province="البرز",
            monthly_bill=780_000_000,
            message="قبض برق ما در تابستان دو برابر شده است. امکان بررسی وجود دارد؟",
            status="contacted",
        )
    )
    session.commit()

    return {
        "seeded": True,
        "sites": len(SITES),
        "users": len(users),
    }
