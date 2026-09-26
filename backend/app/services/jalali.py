"""Minimal Jalali (Solar Hijri) calendar conversion.

The platform is Persian-first: bills, reports and chart axes are labelled with
Jalali months. This implements the standard algorithmic conversion so no extra
dependency is needed.
"""
from __future__ import annotations

from datetime import date

MONTHS_FA = [
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
]
MONTHS_EN = [
    "Farvardin", "Ordibehesht", "Khordad", "Tir", "Mordad", "Shahrivar",
    "Mehr", "Aban", "Azar", "Dey", "Bahman", "Esfand",
]

_G_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]


def _is_leap_gregorian(year: int) -> bool:
    return (year % 4 == 0 and year % 100 != 0) or year % 400 == 0


def gregorian_to_jalali(gy: int, gm: int, gd: int) -> tuple[int, int, int]:
    """Convert a Gregorian date to (jy, jm, jd)."""
    gy2 = gy - 1600
    gm2 = gm - 1
    gd2 = gd - 1

    g_day_no = 365 * gy2 + (gy2 + 3) // 4 - (gy2 + 99) // 100 + (gy2 + 399) // 400
    g_day_no += _G_DAYS[gm2] + gd2
    if gm2 > 1 and _is_leap_gregorian(gy):
        g_day_no += 1

    j_day_no = g_day_no - 79
    j_np = j_day_no // 12053
    j_day_no %= 12053

    jy = 979 + 33 * j_np + 4 * (j_day_no // 1461)
    j_day_no %= 1461
    if j_day_no >= 366:
        jy += (j_day_no - 1) // 365
        j_day_no = (j_day_no - 1) % 365

    for i in range(11):
        month_len = 31 if i < 6 else 30
        if j_day_no < month_len:
            return jy, i + 1, j_day_no + 1
        j_day_no -= month_len
    return jy, 12, j_day_no + 1


def jalali_to_gregorian(jy: int, jm: int, jd: int) -> tuple[int, int, int]:
    """Convert a Jalali date to (gy, gm, gd)."""
    jy2 = jy - 979
    jm2 = jm - 1
    jd2 = jd - 1

    j_day_no = 365 * jy2 + (jy2 // 33) * 8 + ((jy2 % 33) + 3) // 4
    j_day_no += sum(31 if i < 6 else 30 for i in range(jm2))
    j_day_no += jd2

    g_day_no = j_day_no + 79
    gy = 1600 + 400 * (g_day_no // 146097)
    g_day_no %= 146097

    leap = True
    if g_day_no >= 36525:
        g_day_no -= 1
        gy += 100 * (g_day_no // 36524)
        g_day_no %= 36524
        if g_day_no >= 365:
            g_day_no += 1
        else:
            leap = False

    gy += 4 * (g_day_no // 1461)
    g_day_no %= 1461

    if g_day_no >= 366:
        leap = False
        g_day_no -= 1
        gy += g_day_no // 365
        g_day_no %= 365

    gm = 0
    while True:
        month_len = 31 if gm in (0, 2, 4, 6, 7, 9, 11) else (30 if gm != 1 else (29 if leap else 28))
        if g_day_no < month_len:
            break
        g_day_no -= month_len
        gm += 1
    return gy, gm + 1, g_day_no + 1


def from_date(d: date) -> tuple[int, int, int]:
    return gregorian_to_jalali(d.year, d.month, d.day)


def month_label(jy: int, jm: int, locale: str = "fa") -> str:
    names = MONTHS_FA if locale == "fa" else MONTHS_EN
    return f"{names[jm - 1]} {jy}"


def to_persian_digits(text: str) -> str:
    table = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
    return text.translate(table)


_DIGIT_TABLE = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def persianize(text: str) -> str:
    """Render a Persian sentence with Persian numerals and separators.

    Latin digits inside Persian prose read as a translation artefact, and a
    Latin comma or full stop between them reads as the wrong punctuation
    entirely: Persian groups thousands with U+066C and marks decimals with
    U+066B.
    """
    import re

    # Separators first, while the digits around them are still recognisable.
    text = re.sub(r"(?<=\d),(?=\d)", "\u066c", text)
    text = re.sub(r"(?<=\d)\.(?=\d)", "\u066b", text)
    return text.translate(_DIGIT_TABLE)
