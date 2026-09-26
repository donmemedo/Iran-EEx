"""The bill audit engine.

Takes the metered inputs of an industrial invoice, recomputes it against the
tariff model, and emits findings: billing errors, avoidable penalties and
consumption-side savings opportunities. Every finding carries an estimated
annual saving in Toman, a confidence, and a concrete recommended action.

This is the engine behind "Product 1 - Energy Bill Audit" in the business plan.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

from .jalali import persianize
from .tariff import (
    BAND_COEFFICIENTS,
    DEMAND_RATE,
    EXCESS_DEMAND_FACTOR,
    INDUSTRY_BENCHMARKS,
    POWER_FACTOR_THRESHOLD,
    BillBreakdown,
    BillInput,
    capacitor_bank_cost,
    compute_bill,
    required_kvar,
)

SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}

# A factory should not draw more than this share of its energy in the peak band.
# The peak window is 4 of 24 hours, so a continuous plant sits near 0.167 by
# default; anything above this is schedulable load worth moving.
HEALTHY_PEAK_SHARE = 0.17
# Findings below this monthly value are not worth a factory manager's attention.
# Materiality scales with the invoice - 200 million Toman a month matters to a
# small food plant and is noise to a steel mill - with an absolute floor.
MATERIALITY_FLOOR = 3_000_000.0
MATERIALITY_SHARE = 0.004
# Codes that bypass the materiality filter. A wrong invoice, a contract
# overshoot and a reactive-power penalty are compliance and risk signals - they
# get reported whatever their size.
ALWAYS_REPORT = {"bill_total_mismatch", "demand_exceedance", "low_power_factor"}
# Contracted demand is over-sized when the measured peak stays below this ratio.
DEMAND_UNDERUSE_RATIO = 0.72
# Tolerance before a recomputed total counts as a billing discrepancy.
TOTAL_MISMATCH_TOLERANCE = 0.01


@dataclass
class Finding:
    code: str
    severity: str
    title_fa: str
    title_en: str
    detail_fa: str
    detail_en: str
    action_fa: str
    action_en: str
    annual_saving: float = 0.0
    monthly_saving: float = 0.0
    confidence: float = 0.8
    investment: float = 0.0
    payback_months: float | None = None
    evidence: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return asdict(self)


def _fmt_m(value: float) -> str:
    """Format Toman as millions, for use inside finding text."""
    return f"{value / 1_000_000:,.0f}"


def audit_bill(data: BillInput) -> tuple[BillBreakdown, list[Finding]]:
    """Recompute the invoice and return it alongside the findings."""
    breakdown = compute_bill(data)
    findings: list[Finding] = []
    total_kwh = data.total_kwh or 1.0

    # 1. Arithmetic / billing discrepancy ------------------------------------
    if data.billed_total is not None and breakdown.total > 0:
        delta = data.billed_total - breakdown.total
        if abs(delta) / breakdown.total > TOTAL_MISMATCH_TOLERANCE:
            overcharged = delta > 0
            findings.append(
                Finding(
                    code="bill_total_mismatch",
                    severity="high" if overcharged else "medium",
                    title_fa="مغایرت مبلغ صورت‌حساب با محاسبه مجدد",
                    title_en="Invoice total does not match recalculation",
                    detail_fa=(
                        f"مبلغ صورت‌حساب {_fmt_m(data.billed_total)} میلیون تومان است، اما محاسبه مجدد بر پایه "
                        f"مصرف، دیماند و ضریب توان، مبلغ {_fmt_m(breakdown.total)} میلیون تومان را نشان می‌دهد؛ "
                        f"اختلاف {_fmt_m(abs(delta))} میلیون تومان "
                        f"({'به زیان مشترک' if overcharged else 'به سود مشترک'})."
                    ),
                    detail_en=(
                        f"The invoice states {_fmt_m(data.billed_total)}M Toman while recalculating from "
                        f"consumption, demand and power factor gives {_fmt_m(breakdown.total)}M Toman — a "
                        f"{_fmt_m(abs(delta))}M Toman difference "
                        f"{'against' if overcharged else 'in favour of'} the site."
                    ),
                    action_fa="ثبت اعتراض به صورت‌حساب و درخواست بازبینی قرائت و تعرفه از اداره برق.",
                    action_en="File a billing objection and request a reading and tariff review from the utility.",
                    annual_saving=abs(delta) * 12 if overcharged else 0.0,
                    monthly_saving=abs(delta) if overcharged else 0.0,
                    confidence=0.7,
                    evidence={"billed": data.billed_total, "recomputed": breakdown.total, "delta": delta},
                )
            )

    # 2. Reactive power penalty ----------------------------------------------
    if data.power_factor < POWER_FACTOR_THRESHOLD and breakdown.reactive_penalty > 0:
        kvar = required_kvar(data.peak_demand_kw, data.power_factor, 0.95)
        investment = capacitor_bank_cost(kvar)
        annual = breakdown.reactive_penalty * 12
        payback = (investment / (annual / 12)) if annual > 0 else None
        findings.append(
            Finding(
                code="low_power_factor",
                severity="high",
                title_fa="جریمه توان راکتیو به دلیل ضریب توان پایین",
                title_en="Reactive power penalty from a low power factor",
                detail_fa=(
                    f"ضریب توان سایت {data.power_factor:.2f} است و کمتر از حد مجاز ۰٫۹۰ قرار دارد. "
                    f"این موضوع ماهانه {_fmt_m(breakdown.reactive_penalty)} میلیون تومان جریمه به صورت‌حساب اضافه می‌کند."
                ),
                detail_en=(
                    f"The site's power factor is {data.power_factor:.2f}, below the 0.90 floor, adding "
                    f"{_fmt_m(breakdown.reactive_penalty)}M Toman of penalty to the invoice every month."
                ),
                action_fa=(
                    f"نصب یا اصلاح بانک خازنی به ظرفیت حدود {kvar:,.0f} کیلووار برای رساندن ضریب توان به ۰٫۹۵؛ "
                    f"سرمایه‌گذاری تقریبی {_fmt_m(investment)} میلیون تومان."
                ),
                action_en=(
                    f"Install or repair a capacitor bank of about {kvar:,.0f} kVAr to reach a 0.95 power "
                    f"factor; approximate investment {_fmt_m(investment)}M Toman."
                ),
                annual_saving=annual,
                monthly_saving=breakdown.reactive_penalty,
                confidence=0.92,
                investment=investment,
                payback_months=round(payback, 1) if payback else None,
                evidence={"power_factor": data.power_factor, "required_kvar": round(kvar, 1)},
            )
        )

    # 3. Demand exceedance ----------------------------------------------------
    excess = data.peak_demand_kw - data.contracted_demand_kw
    if excess > 0 and breakdown.demand_penalty > 0:
        # Compare two remedies: raise the contract, or shave the peak.
        raise_contract_cost = excess * data.demand_rate  # billed at 1x instead of 2x
        saving_from_raising = breakdown.demand_penalty - raise_contract_cost
        findings.append(
            Finding(
                code="demand_exceedance",
                severity="high",
                title_fa="تجاوز از دیماند قراردادی",
                title_en="Demand drawn above the contracted level",
                detail_fa=(
                    f"حداکثر توان مصرفی {data.peak_demand_kw:,.0f} کیلووات در برابر دیماند قراردادی "
                    f"{data.contracted_demand_kw:,.0f} کیلووات ثبت شده است. "
                    f"{excess:,.0f} کیلووات تجاوز، ماهانه {_fmt_m(breakdown.demand_penalty)} میلیون تومان جریمه دارد."
                ),
                detail_en=(
                    f"Peak demand reached {data.peak_demand_kw:,.0f} kW against a contracted "
                    f"{data.contracted_demand_kw:,.0f} kW. The {excess:,.0f} kW overshoot costs "
                    f"{_fmt_m(breakdown.demand_penalty)}M Toman per month in penalties."
                ),
                action_fa=(
                    "کنترل هم‌زمانی راه‌اندازی تجهیزات سنگین و اجرای برنامه پیک‌سایی؛ در صورت دائمی بودن بار، "
                    "اصلاح دیماند قراردادی ارزان‌تر از پرداخت جریمه است."
                ),
                action_en=(
                    "Stagger heavy equipment start-ups and run a peak-shaving plan; if the load is permanent, "
                    "raising the contracted demand is cheaper than paying the penalty."
                ),
                annual_saving=max(saving_from_raising, 0.0) * 12,
                monthly_saving=max(saving_from_raising, 0.0),
                confidence=0.85,
                evidence={
                    "peak_demand_kw": data.peak_demand_kw,
                    "contracted_demand_kw": data.contracted_demand_kw,
                    "excess_kw": excess,
                },
            )
        )

    # 4. Over-sized contracted demand ----------------------------------------
    if data.contracted_demand_kw > 0:
        ratio = data.peak_demand_kw / data.contracted_demand_kw
        if ratio < DEMAND_UNDERUSE_RATIO:
            # Keep 10% headroom above the measured peak.
            suggested = max(data.peak_demand_kw * 1.1, 1.0)
            monthly = (data.contracted_demand_kw - suggested) * data.demand_rate
            if monthly > 0:
                findings.append(
                    Finding(
                        code="demand_oversized",
                        severity="medium",
                        title_fa="دیماند قراردادی بیش از نیاز واقعی",
                        title_en="Contracted demand is larger than the site needs",
                        detail_fa=(
                            f"بیشترین توان مصرفی تنها {ratio * 100:.0f}٪ دیماند قراردادی بوده است. "
                            f"هزینه ظرفیت بلااستفاده ماهانه حدود {_fmt_m(monthly)} میلیون تومان است."
                        ),
                        detail_en=(
                            f"Peak demand used only {ratio * 100:.0f}% of the contracted capacity. The unused "
                            f"capacity costs about {_fmt_m(monthly)}M Toman per month."
                        ),
                        action_fa=(
                            f"درخواست کاهش دیماند قراردادی به حدود {suggested:,.0f} کیلووات با حفظ ۱۰٪ حاشیه اطمینان."
                            " پیش از اقدام، بار فصل اوج تولید بررسی شود."
                        ),
                        action_en=(
                            f"Apply to reduce the contracted demand to about {suggested:,.0f} kW, keeping 10% "
                            "headroom. Review peak-season production load before applying."
                        ),
                        annual_saving=monthly * 12,
                        monthly_saving=monthly,
                        confidence=0.68,
                        evidence={"utilisation": round(ratio, 3), "suggested_kw": round(suggested)},
                    )
                )

    # 5. Peak-band load shifting ---------------------------------------------
    peak_share = data.peak_kwh / total_kwh
    if peak_share > HEALTHY_PEAK_SHARE:
        shiftable_kwh = (peak_share - HEALTHY_PEAK_SHARE) * total_kwh
        # Value of moving that energy from the peak band to the off-peak band.
        rate = data.energy_rate * breakdown.season_coefficient
        monthly = shiftable_kwh * rate * (BAND_COEFFICIENTS["peak"] - BAND_COEFFICIENTS["off_peak"])
        # Only a portion of load is realistically shiftable.
        monthly *= 0.45
        findings.append(
            Finding(
                code="peak_load_shift",
                severity="high" if peak_share > 0.22 else "medium",
                title_fa="سهم بالای مصرف در ساعت اوج بار",
                title_en="Too much consumption falls in the peak band",
                detail_fa=(
                    f"{peak_share * 100:.0f}٪ از انرژی سایت در ساعت اوج بار مصرف شده است، در حالی که "
                    f"هدف مطلوب حدود {HEALTHY_PEAK_SHARE * 100:.0f}٪ است. انرژی اوج بار چهار برابر کم‌باری قیمت دارد."
                ),
                detail_en=(
                    f"{peak_share * 100:.0f}% of the site's energy is consumed during peak hours against a "
                    f"{HEALTHY_PEAK_SHARE * 100:.0f}% target. Peak energy costs four times the off-peak rate."
                ),
                action_fa=(
                    "جابه‌جایی فرایندهای قابل زمان‌بندی (کوره، آسیاب، کمپرسور، شارژ) به بازه کم‌باری و "
                    "بازطراحی شیفت‌ها بر پایه تقویم تعرفه."
                ),
                action_en=(
                    "Move schedulable processes (furnaces, mills, compressors, charging) into the off-peak "
                    "window and redesign shifts around the tariff calendar."
                ),
                annual_saving=monthly * 12,
                monthly_saving=monthly,
                confidence=0.6,
                evidence={"peak_share": round(peak_share, 3), "shiftable_kwh": round(shiftable_kwh)},
            )
        )

    # 6. Energy intensity against the industry benchmark ----------------------
    if data.production_units and data.production_units > 0:
        bench = INDUSTRY_BENCHMARKS.get(data.industry, INDUSTRY_BENCHMARKS["other"])
        intensity = total_kwh / data.production_units
        if intensity > bench["median"]:
            excess_kwh = (intensity - bench["median"]) * data.production_units
            rate = data.energy_rate * breakdown.season_coefficient
            # Value the excess at the blended band price actually paid.
            blended = breakdown.energy_total / total_kwh if total_kwh else rate
            monthly = excess_kwh * blended * 0.5  # half is realistically recoverable
            findings.append(
                Finding(
                    code="energy_intensity",
                    severity="medium",
                    title_fa="شدت انرژی بالاتر از میانه صنعت",
                    title_en="Energy intensity above the industry median",
                    detail_fa=(
                        f"مصرف ویژه سایت {intensity:,.0f} کیلووات‌ساعت بر واحد تولید است، در حالی که میانه "
                        f"این صنعت {bench['median']:,.0f} و سطح مطلوب {bench['good']:,.0f} است."
                    ),
                    detail_en=(
                        f"The site uses {intensity:,.0f} kWh per production unit versus an industry median of "
                        f"{bench['median']:,.0f} and a best-practice level of {bench['good']:,.0f}."
                    ),
                    action_fa=(
                        "ممیزی تجهیزات پرمصرف، بررسی نشت هوای فشرده، بازبینی عایق‌کاری حرارتی و "
                        "نگهداشت پیشگیرانه موتورها و کوره‌ها."
                    ),
                    action_en=(
                        "Audit the largest loads, check compressed-air leaks, review thermal insulation and "
                        "run preventive maintenance on motors and furnaces."
                    ),
                    annual_saving=monthly * 12,
                    monthly_saving=monthly,
                    confidence=0.55,
                    evidence={
                        "intensity": round(intensity, 1),
                        "median": bench["median"],
                        "good": bench["good"],
                    },
                )
            )

    # Persian prose carries Persian numerals; the f-strings above produce Latin
    # ones, so they are converted once here rather than at every call site.
    for finding in findings:
        finding.title_fa = persianize(finding.title_fa)
        finding.detail_fa = persianize(finding.detail_fa)
        finding.action_fa = persianize(finding.action_fa)

    # Drop immaterial opportunities so the list stays actionable. A billing
    # error is always reported: a wrong invoice is a trust problem, not a
    # rounding one.
    threshold = max(MATERIALITY_FLOOR, breakdown.total * MATERIALITY_SHARE)
    findings = [
        f for f in findings if f.code in ALWAYS_REPORT or f.monthly_saving >= threshold
    ]
    findings.sort(key=lambda f: (SEVERITY_ORDER.get(f.severity, 3), -f.annual_saving))
    return breakdown, findings


def audit_summary(findings: list[Finding]) -> dict:
    """Aggregate the money and risk view a CFO reads first."""
    return {
        "finding_count": len(findings),
        "high_severity_count": sum(1 for f in findings if f.severity == "high"),
        "annual_saving": round(sum(f.annual_saving for f in findings)),
        "monthly_saving": round(sum(f.monthly_saving for f in findings)),
        "required_investment": round(sum(f.investment for f in findings)),
        "billing_error_saving": round(
            sum(f.annual_saving for f in findings if f.code == "bill_total_mismatch")
        ),
        "penalty_saving": round(
            sum(
                f.annual_saving
                for f in findings
                if f.code in {"low_power_factor", "demand_exceedance", "demand_oversized"}
            )
        ),
        "efficiency_saving": round(
            sum(f.annual_saving for f in findings if f.code in {"peak_load_shift", "energy_intensity"})
        ),
    }
