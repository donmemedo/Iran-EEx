// Self-check for lead-validation.ts. Run: node src/components/marketing/lead-validation.check.mjs
import assert from "node:assert/strict";

import { leadProblem, toLatinDigits } from "./lead-validation.ts";

assert.equal(toLatinDigits("۰۹۱۲ ٣٤٥-۶۷۸۹"), "0912 345-6789");
assert.equal(leadProblem("phone", "۰۹۱۲۱۲۳۴۵۶۷"), null);
assert.equal(leadProblem("phone", "+98 (21) 8888-0000"), null);
assert.equal(leadProblem("phone", "------"), "invalidPhone");
assert.equal(leadProblem("phone", "12345"), "invalidPhone");
assert.equal(leadProblem("phone", "1".repeat(33)), "invalidPhone");
assert.equal(leadProblem("phone", "  "), "required");
assert.equal(leadProblem("company", " a "), "tooShort");
assert.equal(leadProblem("company", "x".repeat(161)), "tooLong");
assert.equal(leadProblem("contact_name", "علی"), null);
assert.equal(leadProblem("email", ""), null);
assert.equal(leadProblem("email", "name@company.com"), null);
assert.equal(leadProblem("email", "name@company"), "invalidEmail");
assert.equal(leadProblem("monthly_bill", ""), null);
assert.equal(leadProblem("monthly_bill", "۵۰۰٬۰۰۰٬۰۰۰"), null);
assert.equal(leadProblem("monthly_bill", "0"), "invalidBill");
assert.equal(leadProblem("monthly_bill", "10,000,000,000,001"), "invalidBill");
assert.equal(leadProblem("message", "x".repeat(2001)), "tooLong");
console.log("lead-validation: ok");
