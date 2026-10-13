import test from "node:test";
import assert from "node:assert/strict";
import { BillingQuotaService } from "../dist/services/billing-quota.service.js";

test("BillingQuotaService.calculatePenaltyDistribution splits 90% platform and 10% host company", () => {
  const penalty = 50.0;
  const companyId = "company-partner-xyz";

  const split = BillingQuotaService.calculatePenaltyDistribution(penalty, companyId);

  assert.equal(split.total, 50.0);
  assert.equal(split.zigexShare, 45.0); // 90%
  assert.equal(split.companyShare, 5.0); // 10%
  assert.equal(split.companyId, "company-partner-xyz");
});

test("BillingQuotaService.calculatePenaltyDistribution handles odd decimals correctly", () => {
  const penalty = 35.75;
  const split = BillingQuotaService.calculatePenaltyDistribution(penalty, "co-1");

  assert.equal(split.total, 35.75);
  assert.equal(split.zigexShare, 32.18); // 35.75 * 0.9 = 32.175 rounded to 32.18
  assert.equal(split.companyShare, 3.58); // 35.75 * 0.1 = 3.575 rounded to 3.58
});
