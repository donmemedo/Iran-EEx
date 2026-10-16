/** Typed client for the FastAPI backend. */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export const TOKEN_KEY = "eex.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage can be unavailable in a private window - not fatal */
  }
}

/** Fired on window when a request that carried a token gets 401 (session expired). */
export const UNAUTHORIZED_EVENT = "eex:unauthorized";

export class ApiError extends Error {
  status: number;
  /** Seconds to wait before retrying, from the Retry-After header (429), if sent. */
  retryAfter: number | null;
  constructor(message: string, status: number, retryAfter: number | null = null) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
    this.name = "ApiError";
  }
}

/** Retry-After in seconds. Our API only sends delay-seconds, never an HTTP date. */
function parseRetryAfter(value: string | null): number | null {
  const seconds = Number(value);
  return value && Number.isFinite(seconds) ? seconds : null;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (!response.ok) {
    if (response.status === 401 && token) {
      // The session expired. Drop the token now so no later request reuses it;
      // AuthProvider listens for the event and wipes the client data.
      setToken(null);
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    let message = response.statusText;
    try {
      const body = await response.json();
      message = typeof body.detail === "string" ? body.detail : message;
    } catch {
      /* body was not JSON */
    }
    throw new ApiError(message, response.status, parseRetryAfter(response.headers.get("Retry-After")));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** SWR fetcher. */
export const fetcher = <T,>(path: string) => apiFetch<T>(path);

// --- shapes returned by the API ---------------------------------------------
export type Band = "peak" | "mid_peak" | "off_peak";
export type Severity = "high" | "medium" | "low";
export type SiteStatus = "active" | "pilot" | "onboarding";
export type FindingStatus = "open" | "in_progress" | "done" | "dismissed";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
  locale: string;
  organization_id: number | null;
  organization_name_fa: string | null;
  organization_name_en: string | null;
}

export interface SiteLive {
  site_id: number;
  kw: number;
  kvar: number;
  power_factor: number;
  band: Band;
  load_percent: number;
  demand_headroom_percent: number;
  ts: string;
}

export interface Site {
  id: number;
  name_fa: string;
  name_en: string;
  industry: string;
  province_fa: string;
  province_en: string;
  city_fa: string;
  city_en: string;
  status: SiteStatus;
  contracted_demand_kw: number;
  peak_capacity_kw: number;
  shifts: number;
  meters_count: number;
  lat: number;
  lng: number;
  monthly_production: number;
  production_unit_fa: string;
  production_unit_en: string;
  live: SiteLive;
  open_findings: number;
  annual_saving_potential: number;
  verified_savings_ytd: number;
  last_bill_total: number | null;
  last_bill_period_fa: string | null;
}

export interface Finding {
  id: number;
  code: string;
  severity: Severity;
  title_fa: string;
  title_en: string;
  detail_fa: string;
  detail_en: string;
  action_fa: string;
  action_en: string;
  annual_saving: number;
  monthly_saving: number;
  confidence: number;
  investment: number;
  payback_months: number | null;
  evidence: Record<string, number | string>;
  status: FindingStatus;
  site_id: number;
}

export interface Bill {
  id: number;
  site_id: number;
  jalali_year: number;
  jalali_month: number;
  period_label_fa: string;
  period_label_en: string;
  issued_at: string;
  peak_kwh: number;
  mid_peak_kwh: number;
  off_peak_kwh: number;
  total_kwh: number;
  contracted_demand_kw: number;
  peak_demand_kw: number;
  power_factor: number;
  production_units: number | null;
  billed_total: number;
  recomputed_total: number;
  status: "analyzed" | "pending" | "disputed";
  finding_count: number;
  saving_potential: number;
}

export interface BillLine {
  key: string;
  amount: number;
  qty: number | null;
  unit: string | null;
}

export interface BillDetail extends Bill {
  breakdown: {
    total: number;
    season: string;
    lines: BillLine[];
    [key: string]: unknown;
  };
  findings: Finding[];
  site_name_fa: string;
  site_name_en: string;
}

export interface Alert {
  id: number;
  site_id: number;
  site_name_fa: string;
  site_name_en: string;
  kind: "peak_warning" | "power_factor" | "anomaly" | "demand_exceedance" | "outage_risk";
  severity: Severity;
  title_fa: string;
  title_en: string;
  message_fa: string;
  message_en: string;
  value: number | null;
  threshold: number | null;
  acknowledged: boolean;
  created_at: string;
}

export interface SavingsRecord {
  id: number;
  site_id: number;
  month: string;
  period_label_fa: string;
  baseline_kwh: number;
  actual_kwh: number;
  saved_kwh: number;
  saved_amount: number;
  verified: boolean;
}

export interface DashboardData {
  kpis: {
    active_sites: number;
    pilot_sites: number;
    total_kw_now: number;
    monthly_energy_cost: number;
    verified_savings_ytd: number;
    saving_potential: number;
    open_findings: number;
    high_severity_findings: number;
    avg_power_factor: number;
    peak_share: number;
    unacknowledged_alerts: number;
    energy_intensity_change: number;
  };
  portfolio_load: { ts: string; kw: number }[];
  band_split: Record<Band, number>;
  savings_trend: { month: string; saved_amount: number; saved_kwh: number }[];
  top_findings: Finding[];
  sites: Site[];
  recent_alerts: Alert[];
}

export interface ConsumptionPoint {
  ts: string;
  kw: number;
  kwh: number;
  kvar?: number;
  power_factor: number;
  band: Band;
  anomaly: boolean;
}

export interface ConsumptionSeries {
  range: string;
  resolution: string;
  points: ConsumptionPoint[];
  bands: Record<Band, number>;
  contracted_demand_kw: number;
  peak_capacity_kw: number;
  peak_kw?: number;
  avg_kw?: number;
  total_kwh?: number;
  avg_power_factor?: number;
}

export interface Feeder {
  id: string;
  name_fa: string;
  name_en: string;
  kw: number;
  share: number;
  status: "online" | "offline";
  power_factor: number;
}

export interface CalculatorResult {
  conservative_annual: number;
  expected_annual: number;
  optimistic_annual: number;
  monthly_expected: number;
  percent_expected: number;
  payback_months: number;
  breakdown: { key: string; annual: number; share: number }[];
  subscription_annual: number;
  net_annual: number;
  roi_multiple: number;
}
