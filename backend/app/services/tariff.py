"""Iranian industrial energy tariff model.

Reproduces the structure of a Tavanir industrial electricity invoice so the audit
engine can recompute a bill line by line and compare it with what the utility
charged. All monetary values are in Toman.

Invoice structure modelled here:
    energy charge      = sum(kWh_band * base_rate * band_coefficient * season_coefficient)
    demand charge      = contracted_demand_kw * demand_rate
    demand penalty     = max(0, peak_demand_kw - contracted_demand_kw) * demand_rate * EXCESS_FACTOR
    reactive penalty   = (energy + demand) * (0.9 / cos_phi - 1)      when cos_phi < 0.9
    reactive bonus     = (energy + demand) * REACTIVE_BONUS_RATE      when cos_phi > 0.95
    levies             = (energy + demand) * LEVY_RATE
    VAT                = taxable_base * VAT_RATE
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

# --- Time-of-use bands ------------------------------------------------------
# Iranian industrial tariffs bill consumption in three daily bands.
BAND_COEFFICIENTS: dict[str, float] = {
    "off_peak": 0.5,   # کم‌باری   23:00 - 07:00
    "mid_peak": 1.0,   # میان‌باری 07:00 - 19:00
    "peak": 2.0,       # اوج بار   19:00 - 23:00
}

# Summer (Khordad-Shahrivar) carries a higher rate; the grid is capacity bound.
SEASON_COEFFICIENTS: dict[str, float] = {"summer": 1.35, "normal": 1.0}

# Toman per kWh, mid-peak reference rate for the industrial category.
BASE_ENERGY_RATE = 450.0
# Toman per kW of contracted demand, per month.
DEMAND_RATE = 9_500.0
# Demand drawn above the contract is billed at this multiple of the demand rate.
EXCESS_DEMAND_FACTOR = 2.0
# Power factor floor before a reactive-power penalty applies.
POWER_FACTOR_THRESHOLD = 0.90
POWER_FACTOR_BONUS_THRESHOLD = 0.95
REACTIVE_BONUS_RATE = 0.02
LEVY_RATE = 0.06          # عوارض برق
VAT_RATE = 0.10           # مالیات بر ارزش افزوده
SERVICE_CHARGE = 850_000.0  # آبونمان / هزینه خدمات ماهانه

SUMMER_MONTHS = {3, 4, 5, 6}  # Khordad(3) .. Shahrivar(6) in the Jalali calendar


class IndustryTariff(str, Enum):
    """Tariff categories with the industry multipliers used by the platform."""

    STEEL = "steel"
    CEMENT = "cement"
    CERAMIC = "ceramic"
    PLASTIC = "plastic"
    FOOD = "food"
    PHARMA = "pharma"
    TEXTILE = "textile"
    OTHER = "other"


# Energy intensity benchmarks: kWh consumed per ton (or per production unit).
# Used for the benchmark / energy-intensity findings.
INDUSTRY_BENCHMARKS: dict[str, dict[str, float]] = {
    "steel":   {"good": 480.0, "median": 610.0, "poor": 760.0, "unit": 1.0},
    "cement":  {"good": 95.0, "median": 118.0, "poor": 145.0, "unit": 1.0},
    "ceramic": {"good": 62.0, "median": 78.0, "poor": 99.0, "unit": 1.0},
    "plastic": {"good": 540.0, "median": 690.0, "poor": 870.0, "unit": 1.0},
    "food":    {"good": 210.0, "median": 285.0, "poor": 370.0, "unit": 1.0},
    "pharma":  {"good": 330.0, "median": 430.0, "poor": 560.0, "unit": 1.0},
    "textile": {"good": 390.0, "median": 505.0, "poor": 650.0, "unit": 1.0},
    "other":   {"good": 300.0, "median": 400.0, "poor": 520.0, "unit": 1.0},
}


@dataclass
class BillInput:
    """The raw values a factory reads off its monthly invoice."""

    peak_kwh: float
    mid_peak_kwh: float
    off_peak_kwh: float
    contracted_demand_kw: float
    peak_demand_kw: float
    power_factor: float
    jalali_month: int = 1
    energy_rate: float = BASE_ENERGY_RATE
    demand_rate: float = DEMAND_RATE
    billed_total: float | None = None
    production_units: float | None = None
    industry: str = "other"

    @property
    def total_kwh(self) -> float:
        return self.peak_kwh + self.mid_peak_kwh + self.off_peak_kwh


@dataclass
class BillBreakdown:
    """A fully recomputed invoice."""

    energy_peak: float = 0.0
    energy_mid_peak: float = 0.0
    energy_off_peak: float = 0.0
    energy_total: float = 0.0
    demand_charge: float = 0.0
    demand_penalty: float = 0.0
    reactive_penalty: float = 0.0
    reactive_bonus: float = 0.0
    levies: float = 0.0
    service_charge: float = 0.0
    vat: float = 0.0
    total: float = 0.0
    season: str = "normal"
    season_coefficient: float = 1.0
    lines: list[dict] = field(default_factory=list)


def season_for_month(jalali_month: int) -> str:
    return "summer" if jalali_month in SUMMER_MONTHS else "normal"


def compute_bill(data: BillInput) -> BillBreakdown:
    """Recompute an industrial invoice from its metered inputs."""
    season = season_for_month(data.jalali_month)
    season_coef = SEASON_COEFFICIENTS[season]
    rate = data.energy_rate * season_coef

    energy_peak = data.peak_kwh * rate * BAND_COEFFICIENTS["peak"]
    energy_mid = data.mid_peak_kwh * rate * BAND_COEFFICIENTS["mid_peak"]
    energy_off = data.off_peak_kwh * rate * BAND_COEFFICIENTS["off_peak"]
    energy_total = energy_peak + energy_mid + energy_off

    demand_charge = data.contracted_demand_kw * data.demand_rate
    excess_kw = max(0.0, data.peak_demand_kw - data.contracted_demand_kw)
    demand_penalty = excess_kw * data.demand_rate * EXCESS_DEMAND_FACTOR

    base = energy_total + demand_charge + demand_penalty
    reactive_penalty = 0.0
    reactive_bonus = 0.0
    pf = max(0.01, min(1.0, data.power_factor))
    if pf < POWER_FACTOR_THRESHOLD:
        reactive_penalty = base * (POWER_FACTOR_THRESHOLD / pf - 1.0)
    elif pf > POWER_FACTOR_BONUS_THRESHOLD:
        reactive_bonus = base * REACTIVE_BONUS_RATE

    levies = base * LEVY_RATE
    taxable = base + reactive_penalty - reactive_bonus + levies + SERVICE_CHARGE
    vat = taxable * VAT_RATE
    total = taxable + vat

    breakdown = BillBreakdown(
        energy_peak=round(energy_peak),
        energy_mid_peak=round(energy_mid),
        energy_off_peak=round(energy_off),
        energy_total=round(energy_total),
        demand_charge=round(demand_charge),
        demand_penalty=round(demand_penalty),
        reactive_penalty=round(reactive_penalty),
        reactive_bonus=round(reactive_bonus),
        levies=round(levies),
        service_charge=SERVICE_CHARGE,
        vat=round(vat),
        total=round(total),
        season=season,
        season_coefficient=season_coef,
    )
    breakdown.lines = [
        {"key": "energy_peak", "amount": breakdown.energy_peak, "qty": data.peak_kwh, "unit": "kWh"},
        {"key": "energy_mid_peak", "amount": breakdown.energy_mid_peak, "qty": data.mid_peak_kwh, "unit": "kWh"},
        {"key": "energy_off_peak", "amount": breakdown.energy_off_peak, "qty": data.off_peak_kwh, "unit": "kWh"},
        {"key": "demand_charge", "amount": breakdown.demand_charge, "qty": data.contracted_demand_kw, "unit": "kW"},
        {"key": "demand_penalty", "amount": breakdown.demand_penalty, "qty": excess_kw, "unit": "kW"},
        {"key": "reactive_penalty", "amount": breakdown.reactive_penalty, "qty": pf, "unit": "cosφ"},
        {"key": "reactive_bonus", "amount": -breakdown.reactive_bonus, "qty": pf, "unit": "cosφ"},
        {"key": "levies", "amount": breakdown.levies, "qty": None, "unit": None},
        {"key": "service_charge", "amount": breakdown.service_charge, "qty": None, "unit": None},
        {"key": "vat", "amount": breakdown.vat, "qty": None, "unit": None},
    ]
    return breakdown


def capacitor_bank_cost(reactive_kvar: float) -> float:
    """Installed cost of a capacitor bank sized for the given reactive demand."""
    # ~2.8 million Toman per kVAr installed, with a 40 million Toman floor for
    # the panel, controller and commissioning.
    return max(40_000_000.0, reactive_kvar * 2_800_000.0)


def required_kvar(active_kw: float, current_pf: float, target_pf: float = 0.95) -> float:
    """kVAr of correction needed to move from current_pf to target_pf."""
    import math

    current_pf = max(0.01, min(0.999, current_pf))
    target_pf = max(0.01, min(0.999, target_pf))
    tan_current = math.tan(math.acos(current_pf))
    tan_target = math.tan(math.acos(target_pf))
    return max(0.0, active_kw * (tan_current - tan_target))
