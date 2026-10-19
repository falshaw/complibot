/**
 * CompliBot - Stripe Checkout Session
 * POST /api/billing/checkout
 */

import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { PLAN_PRICES } from "@/lib/billing";
import { z } from "zod";

const checkoutSchema = z.object({
  plan: z.enum(["pro", "enterprise"]),
});

type CheckoutInput = z.infer<typeof checkoutSchema>;

export const POST = apiHandler<CheckoutInput>(
  async ({ body, user, organizationId }) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json(
        { error: "Billing not configured. Contact sales@example.com" },
        { status: 503 },
      );
    }

    const planKey = body.plan.toUpperCase() as "PRO" | "ENTERPRISE";
    const planInfo = PLAN_PRICES[planKey];
    if (!planInfo || !planInfo.priceId) {
      return NextResponse.json(
        { error: "Invalid plan selected" },
        { status: 400 },
      );
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);

    // Find or create Stripe customer
    let subscription = await prisma.subscription.findUnique({
      where: { organizationId },
    });

    let customerId: string;

    if (subscription?.stripeCustomerId) {
      customerId = subscription.stripeCustomerId;
    } else {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
      });

      const customer = await stripe.customers.create({
        email: user.email,
        name: org?.name || user.name || user.email,
        metadata: {
          organizationId,
          userId: user.id,
        },
      });
      customerId = customer.id;

      // Create local subscription record
      await prisma.subscription.create({
        data: {
          organizationId,
          stripeCustomerId: customerId,
          plan: "FREE",
          status: "INCOMPLETE",
        },
      });
    }

    // Create Checkout Session
    const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3005";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price: planInfo.priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/settings/billing?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: `${appUrl}/settings/billing?canceled=true`,
      metadata: {
        organizationId,
        plan: planKey,
      },
    });

    logger.info("Checkout session created", {
      organizationId,
      plan: planKey,
      sessionId: session.id,
    });

    return NextResponse.json({ url: session.url });
  },
  { schema: checkoutSchema },
);
