"""Deterministic industrial load-profile generation.

Smart-meter data for the demo sites is synthesised rather than stored, so the
platform can serve any time range at any resolution without a multi-million row
table. The generator is seeded per site, so the same timestamp always yields the
same reading - charts stay stable across reloads and across services.

The profile models what an Iranian factory's meter actually sees:
shift structure, Friday as the weekend, summer cooling load, tariff bands,
power-factor behaviour, and occasional anomalies the alert engine picks up.
"""
from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from functools import lru_cache
from datetime import UTC, datetime, timedelta

# Tariff bands by local hour.
PEAK_HOURS = range(19, 23)
OFF_PEAK_HOURS = set(list(range(23, 24)) + list(range(0, 7)))

IRAN_UTC_OFFSET = timedelta(hours=3, minutes=30)


def band_for_hour(hour: int) -> str:
    if hour in PEAK_HOURS:
        return "peak"
    if hour in OFF_PEAK_HOURS:
        return "off_peak"
    return "mid_peak"


def _hash_unit(*parts) -> float:
    """A stable pseudo-random float in [0, 1) derived from the given parts."""
    raw = "|".join(str(p) for p in parts).encode()
    digest = hashlib.blake2b(raw, digest_size=8).digest()
    return int.from_bytes(digest, "big") / 2**64


@dataclass(frozen=True)  # hashable, so month roll-ups can be cached per profile
class SiteProfile:
    """Everything the generator needs to know about a site."""

    site_id: int
    base_load_kw: float          # load that never switches off
    peak_capacity_kw: float      # nameplate draw at full production
    shifts: int                  # 1, 2 or 3 production shifts
    power_factor: float          # typical, uncorrected
    seasonality: float = 0.12    # summer cooling uplift
    volatility: float = 0.07     # process noise


def _shift_factor(profile: SiteProfile, local_hour: int, weekday: int) -> float:
    """Production intensity 0..1 for an hour of the week."""
    # Friday (weekday 4 in Iran's week) runs a skeleton crew.
    friday = weekday == 4
    if profile.shifts >= 3:
        # Continuous process: near-flat with a mild night dip.
        base = 0.80 - 0.09 * math.cos((local_hour - 10) / 24 * 2 * math.pi)
        return base * (0.62 if friday else 1.0)
    if profile.shifts == 2:
        # 06:00-22:00 in two shifts, with a changeover dip at 14:00.
        if 6 <= local_hour < 22:
            base = 0.83
            if local_hour == 14:
                base = 0.68
        else:
            base = 0.22
        return base * (0.45 if friday else 1.0)
    # Single day shift, 07:00-17:00.
    if 7 <= local_hour < 17:
        base = 0.85 if local_hour != 12 else 0.6  # lunch break
    else:
        base = 0.14
    return base * (0.3 if friday else 1.0)


def sample(profile: SiteProfile, ts: datetime) -> dict:
    """One meter reading at an instant."""
    local = ts + IRAN_UTC_OFFSET
    hour = local.hour
    weekday = (local.weekday() + 2) % 7  # Python Mon=0 -> Iran Sat=0
    minute_slot = local.minute // 15

    load = _shift_factor(profile, hour, weekday)

    # Summer (roughly Jun-Sep) adds cooling load.
    month = local.month
    season = 1.0 + (profile.seasonality if month in (6, 7, 8, 9) else 0.0)

    # Deterministic process noise plus a slow drift, so the line breathes.
    noise = (_hash_unit(profile.site_id, ts.date(), hour, minute_slot) - 0.5) * 2
    drift = math.sin(ts.timestamp() / 8600.0 + profile.site_id) * 0.03
    # Production never exceeds nameplate, so the factor is clamped at 1.
    factor = min(1.0, max(0.0, load * season * (1 + noise * profile.volatility + drift)))

    kw = profile.base_load_kw + (profile.peak_capacity_kw - profile.base_load_kw) * factor

    # A rare anomaly: a stuck compressor or a furnace restart inrush. Even then
    # the connection cannot deliver more than a little over nameplate.
    anomaly_roll = _hash_unit("anomaly", profile.site_id, ts.date(), hour)
    anomaly = anomaly_roll > 0.985
    if anomaly:
        kw = min(kw * 1.22, profile.peak_capacity_kw * 1.15)

    # Power factor sags as motor loading drops away from nameplate.
    loading = kw / max(profile.peak_capacity_kw, 1.0)
    pf = profile.power_factor + (loading - 0.7) * 0.08
    pf = max(0.62, min(0.99, pf))

    kvar = kw * math.tan(math.acos(max(0.05, min(0.999, pf))))

    return {
        "ts": ts.replace(tzinfo=UTC).isoformat(),
        "kw": round(kw, 1),
        "kwh": round(kw * 0.25, 2),          # energy in a 15-minute slot
        "kvar": round(kvar, 1),
        "power_factor": round(pf, 3),
        "band": band_for_hour(hour),
        "anomaly": anomaly,
    }


def series(profile: SiteProfile, start: datetime, end: datetime, step_minutes: int) -> list[dict]:
    """A reading series between two instants."""
    step = timedelta(minutes=step_minutes)
    cursor = start.replace(second=0, microsecond=0)
    # Align to the step grid so points are stable regardless of "now".
    cursor -= timedelta(minutes=cursor.minute % step_minutes)
    if end < cursor:
        return []
    # The last grid point at or before `end`: the series only changes when a new
    # slot starts, so a dashboard refresh within the same slot is a cache hit.
    last = cursor + step * ((end - cursor) // step)
    return [dict(r) for r in _grid_series(profile, cursor, last, step)]


def _grid(profile: SiteProfile, first: datetime, last: datetime, step: timedelta):
    cursor = first
    while cursor <= last:
        yield sample(profile, cursor)
        cursor += step


@lru_cache(maxsize=256)
def _grid_series(profile: SiteProfile, first: datetime, last: datetime, step: timedelta) -> tuple:
    # ponytail: at most ~20 MB at maxsize with the longest (30d) series; size it to
    # sites x ranges if the portfolio grows past ~60 sites.
    return tuple(_grid(profile, first, last, step))


def aggregate_bands(readings: list[dict]) -> dict[str, float]:
    """Total kWh per tariff band across a series."""
    totals = {"peak": 0.0, "mid_peak": 0.0, "off_peak": 0.0}
    for r in readings:
        totals[r["band"]] += r["kwh"]
    return {k: round(v, 1) for k, v in totals.items()}


def downsample(readings: list[dict], max_points: int) -> list[dict]:
    """Average readings into at most max_points buckets, preserving shape."""
    if len(readings) <= max_points or max_points <= 0:
        return readings
    bucket = math.ceil(len(readings) / max_points)
    out: list[dict] = []
    for i in range(0, len(readings), bucket):
        chunk = readings[i : i + bucket]
        out.append(
            {
                "ts": chunk[0]["ts"],
                "kw": round(sum(c["kw"] for c in chunk) / len(chunk), 1),
                "kwh": round(sum(c["kwh"] for c in chunk), 2),
                "kvar": round(sum(c["kvar"] for c in chunk) / len(chunk), 1),
                "power_factor": round(sum(c["power_factor"] for c in chunk) / len(chunk), 3),
                "band": chunk[len(chunk) // 2]["band"],
                "anomaly": any(c["anomaly"] for c in chunk),
            }
        )
    return out


@lru_cache(maxsize=4096)
def _month_summary(profile: SiteProfile, month_start: datetime, month_end: datetime) -> dict:
    """kWh, band split, peak and mean power factor for one month at hourly resolution.

    Readings are deterministic, so a finished month never changes and is computed
    once per process. ponytail: unbounded by time, bounded by maxsize; 4096 entries is
    about 340 site-years, far beyond the portfolio size.
    """
    # Straight from the generator: month-long hourly series would crowd the series cache.
    readings = list(_grid(profile, month_start, month_end, timedelta(hours=1)))
    # One-hour slots, so each reading's kW is also its kWh.
    bands = {"peak": 0.0, "mid_peak": 0.0, "off_peak": 0.0}
    for r in readings:
        bands[r["band"]] += r["kw"]
    bands = {k: round(v, 1) for k, v in bands.items()}
    return {
        "month": month_start.strftime("%Y-%m"),
        "kwh": round(sum(bands.values()), 1),
        **bands,
        "peak_kw": round(max((r["kw"] for r in readings), default=0.0), 1),
        "power_factor": round(sum(r["power_factor"] for r in readings) / max(len(readings), 1), 3),
    }


def monthly_totals(profile: SiteProfile, months: int = 12, end: datetime | None = None) -> list[dict]:
    """Per-month kWh and band split, walking backwards from `end`."""
    end = end or datetime.now(UTC)
    # Hourly readings only change on the hour, so the open month caches for an hour too.
    end_hour = end.replace(minute=0, second=0, microsecond=0)
    out: list[dict] = []
    cursor = end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    for _ in range(months):
        month_start = cursor
        next_month = (month_start + timedelta(days=32)).replace(day=1)
        out.append(dict(_month_summary(profile, month_start, min(next_month, end_hour))))
        cursor = (month_start - timedelta(days=1)).replace(day=1)
    return list(reversed(out))
