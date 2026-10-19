/**
 * CompliBot - Stripe Customer Portal
 * POST /api/billing/portal
 */

import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const POST = apiHandler(async ({ organizationId }) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json(
      { error: "Billing portal not configured" },
      { status: 503 },
    );
  }

  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
  });

  if (!subscription?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No billing account found. Please subscribe first." },
      { status: 404 },
    );
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(stripeKey);

  const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3005";
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${appUrl}/settings/billing`,
  });

  logger.info("Billing portal session created", {
    organizationId,
    customerId: subscription.stripeCustomerId,
  });

  return NextResponse.json({ url: portalSession.url });
});
