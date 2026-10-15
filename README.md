# بهینه‌یار انرژی ایران — EEx Iran

**Energy cost intelligence for Iranian industry.**

A B2B platform that audits a factory's electricity invoices line by line, watches
consumption in real time, and turns both into savings the finance team can verify.

It is the implementation of the business plan in this repository
(`04-Business-plan-toolkit_EfficiencyExchange_Iran_filled.pdf`), which localises the
[Efficiency Exchange](http://www.efficiencyexchange.com) model for the Iranian market —
where the problem is not only the price of energy, but grid imbalance, seasonal
curtailment, demand penalties and tariff complexity.

---

## What it does

| Capability | What happens |
|---|---|
| **Invoice audit** | Recomputes an industrial invoice from its metered inputs — time-of-use bands, contracted demand, reactive power, levies, VAT — and reports every discrepancy against what the utility charged. |
| **Real-time analytics** | 15-minute load profiles per site, with tariff-band shading, per-feeder breakdown, power-factor tracking and demand-ceiling alerts. |
| **Verified savings** | Baseline versus actual consumption per month, priced, and marked verified — the basis for a share-of-savings contract. |
| **Savings calculator** | A public estimator that splits the number across the four levers the engine actually pulls, so the claim is explainable rather than a single opaque percentage. |

### The audit engine

`backend/app/services/bill_audit.py` detects, and prices, six classes of finding:

| Code | What it catches |
|---|---|
| `bill_total_mismatch` | The invoice total does not match a recalculation from the meter readings. |
| `low_power_factor` | cos φ below the 0.90 floor — priced with the kVAr of correction needed and the payback on a capacitor bank. |
| `demand_exceedance` | Peak demand above the contract, billed at 2× the demand rate. |
| `demand_oversized` | Contracted capacity the site never uses. |
| `peak_load_shift` | Schedulable load sitting in the peak band, where a kWh costs four times the off-peak rate. |
| `energy_intensity` | kWh per production unit above the industry median. |

Findings below a materiality threshold that scales with the invoice are dropped, so the
list stays actionable. Billing errors, demand overshoots and reactive penalties are always
reported regardless of size — they are compliance signals, not just money.

---

## Quick start

### With Docker (recommended)

```bash
cp .env.example .env
# Fill in the two secrets (compose refuses to start without them):
#   JWT_SECRET=$(openssl rand -hex 32)   POSTGRES_PASSWORD=$(openssl rand -hex 24)
# For a local demo also set SEED_ON_STARTUP=true and NEXT_PUBLIC_DEMO_MODE=true.
docker compose up --build
```

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| API | http://localhost:8000 |
| Interactive API docs | http://localhost:8000/docs (only with `ENVIRONMENT=development`) |

With `SEED_ON_STARTUP=true` the database is seeded on first boot with a demo portfolio:
20 industrial sites across eight provinces, a year of invoices each, and the findings the
audit engine produced from them.

Behind a TLS reverse proxy, set `FORWARDED_ALLOW_IPS` to the proxy's address and stop
publishing port 8000; otherwise every client shares one rate-limit bucket.

**Demo login** (demo mode only) — `demo@eex.ir` / `demo1234`. The demo users have a
published password, so never enable demo mode on a deployment that holds real data.

### Without Docker

Two terminals.

```bash
# Terminal 1 — API
cd backend
python3 -m venv .venv && ./.venv/bin/python -m pip install -r requirements-dev.txt
cp .env.example .env          # ENVIRONMENT=development, demo seed on
./.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

```bash
# Terminal 2 — web app
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

---

## Project layout

```
backend/                    FastAPI + SQLModel
  app/
    services/
      tariff.py             Iranian industrial tariff model (bands, demand, reactive, VAT)
      bill_audit.py         The audit engine: findings, savings, payback
      timeseries.py         Deterministic industrial load-profile generation
      jalali.py             Solar Hijri calendar conversion, no dependency
    routers/                auth · sites · bills · dashboard · alerts · public
    models.py               Organization · User · Site · Bill · Finding · Alert · Savings · Lead
    seed.py                 The demo portfolio
  tests/                    Engine and API tests

frontend/                   Next.js 16 (App Router) + Tailwind v4
  src/
    app/[locale]/           fa (RTL, default) and en (LTR)
      page.tsx              Marketing site
      login/
      app/                  Dashboard, sites, invoices, findings, alerts, savings, settings
    components/
      charts/               Custom SVG charts - load profile, donut, bars, gauge
      marketing/            Hero, calculator, pricing, FAQ, lead form
      app/                  Shell, KPI tiles, finding and alert rows
      ui/                   Button, card, badge, fields, toggles
    i18n/dictionaries/      Every string, in both languages
    lib/                    API client, formatting, auth, locale context
```

---

## Design notes

**Persian first.** The default locale is `fa`, right-to-left, with Persian digits and the
Jalali calendar throughout — a Gregorian date on an invoice reads as a translation
artefact to an Iranian accountant. Wording follows the
[Persian UX-writing vocabulary](https://github.com/Aylarrazzaghi/Persian-vocabulary-in-UXwriting):
«پیش‌خوان» for the dashboard, «صورت‌حساب» for an invoice, «نادرست» rather than «اشتباه» so an
error never blames the user.

**Charts are hand-built SVG**, not a charting library — which is what makes the tariff-band
strip, the contracted-demand reference line and the RTL axis mirroring possible. Every
series colour was validated for colour-vision-deficiency separation and surface contrast
in both themes; status is always carried by an icon and a label as well as colour.

**Light and dark are both designed**, not one flipped into the other. The whole system
swaps from a single `:root` / `.dark` token pair in `globals.css`.

**Motion follows the gesture.** Feedback fires on pointer-down, easing curves are custom
(the built-in ones are too weak to read as intentional), and `prefers-reduced-motion`,
`prefers-reduced-transparency` and `prefers-contrast` are all honoured.

---

## Data

Meter readings are **generated deterministically** rather than stored — seeded per site, so
any timestamp always yields the same reading and the charts stay stable across reloads.
The profile models what an Iranian factory's meter actually sees: shift structure, Friday
as the weekend, summer cooling load, tariff bands and occasional anomalies.

Invoices are built from that same generator and then run through the audit engine, so every
number in the product is internally consistent — the chart, the invoice and the finding all
agree.

> The seeded portfolio is demonstration data. Tariff rates in `tariff.py` are a calibrated
> model of the Tavanir industrial structure, not an official rate card; check them against
> the current schedule before quoting a customer.

---

## Tests

```bash
cd backend && ./.venv/bin/python -m pytest tests -q
```

Covers the tariff model, each finding type, the determinism and bounds of the load-profile
generator, Jalali round-trips, and the API surface. `tests/test_security.py` holds the
security regressions: cross-tenant access, roles, forged tokens, rate limits, hostile input
and response headers. The demo data is seeded once per session and copied per test.

```bash
cd frontend && npm run typecheck && npm run build
```

---

## Roadmap

Installable PWA is in place — manifest, service worker with offline fallback, and an
install prompt in Settings. Native packaging (APK / IPA) is the next step; the intended
route is Capacitor wrapping the same Next.js build, which is why the app section is
client-rendered against the API rather than server-coupled.
