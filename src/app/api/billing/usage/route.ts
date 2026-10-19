/**
 * CompliBot - Billing Usage
 * GET /api/billing/usage
 */

import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import { getUsageSummary } from "@/lib/billing";

export const GET = apiHandler(async ({ organizationId }) => {
  const summary = await getUsageSummary(organizationId);
  return NextResponse.json(summary);
});
