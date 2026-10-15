/**
 * The client-side mirror of the backend's LeadRequest bounds
 * (backend/app/schemas.py), so a problem shows on blur instead of after a
 * round-trip. The API still validates everything; this only spares a 422.
 *
 * Pure and import-free on purpose: lead-validation.check.mjs runs it in Node.
 */

/** Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII. Both blocks start at a code point ending in 0. */
export function toLatinDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => String(digit.charCodeAt(0) & 15));
}

/** The API's ceiling for any Toman amount. */
export const MAX_TOMAN = 1e13;

export const LEAD_LIMITS = { company: 160, contact_name: 120, phone: 32, email: 254, message: 2000 } as const;

export type LeadField = "company" | "contact_name" | "phone" | "email" | "monthly_bill" | "message";
export type LeadProblem = "required" | "tooShort" | "tooLong" | "invalidPhone" | "invalidEmail" | "invalidBill";

export const LEAD_FIELDS: readonly LeadField[] = ["company", "contact_name", "phone", "email", "monthly_bill", "message"];

export function isLeadField(name: unknown): name is LeadField {
  return typeof name === "string" && (LEAD_FIELDS as readonly string[]).includes(name);
}

// The same character set the API accepts.
const PHONE = /^[0-9۰-۹٠-٩+()\-\s]+$/;
// Loose on purpose: the server's email-validator is the authority, and its 422
// still lands on this field.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What is wrong with one field's value, or null. Values are trimmed first, as the API does. */
export function leadProblem(field: LeadField, raw: string): LeadProblem | null {
  const value = raw.trim();
  switch (field) {
    case "company":
    case "contact_name":
      if (!value) return "required";
      if (value.length < 2) return "tooShort";
      return value.length > LEAD_LIMITS[field] ? "tooLong" : null;
    case "phone": {
      if (!value) return "required";
      const digits = toLatinDigits(value).replace(/\D/g, "").length;
      return value.length <= LEAD_LIMITS.phone && PHONE.test(value) && digits >= 6 ? null : "invalidPhone";
    }
    case "email":
      return !value || (value.length <= LEAD_LIMITS.email && EMAIL.test(value)) ? null : "invalidEmail";
    case "monthly_bill": {
      if (!value) return null;
      const amount = Number(toLatinDigits(value).replace(/\D/g, ""));
      return amount > 0 && amount <= MAX_TOMAN ? null : "invalidBill";
    }
    case "message":
      return value.length > LEAD_LIMITS.message ? "tooLong" : null;
  }
}
