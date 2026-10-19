/**
 * CompliBot - Stripe Webhook Handler
 * POST /api/billing/webhook
 *
 * Handles: checkout.session.completed, customer.subscription.updated,
 *          customer.subscription.deleted, invoice.payment_failed
 */

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import type { PlanTier } from "@prisma/client";

/**
 * Throw when a required Stripe env var is absent so misconfiguration is
 * caught at the point of use, not silently resolved to a fake price ID.
 */
function requiredStripeEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Configure it before enabling Stripe billing.`,
    );
  }
  return val;
}

// Map Stripe price IDs to plan tiers
function getPlanFromPriceId(priceId: string): PlanTier {
  const proPriceId = requiredStripeEnv("STRIPE_PRO_PRICE_ID");
  const entPriceId = requiredStripeEnv("STRIPE_ENTERPRISE_PRICE_ID");

  if (priceId === proPriceId) return "PRO";
  if (priceId === entPriceId) return "ENTERPRISE";
  return "FREE";
}

// Map Stripe subscription status to our enum
function mapSubscriptionStatus(
  stripeStatus: string,
): "ACTIVE" | "PAST_DUE" | "CANCELED" | "INCOMPLETE" | "TRIALING" {
  switch (stripeStatus) {
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
    case "unpaid":
      return "CANCELED";
    case "trialing":
      return "TRIALING";
    default:
      return "INCOMPLETE";
  }
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!webhookSecret || !stripeKey) {
    logger.warn(
      "Stripe webhook called but STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET not configured",
    );
    return NextResponse.json(
      { error: "Billing not configured" },
      { status: 503 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  let event: Stripe.Event;

  try {
    const StripeLib = (await import("stripe")).default;
    const stripe = new StripeLib(stripeKey);
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    logger.error("Stripe webhook signature verification failed", {
      error: String(err),
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const organizationId = session.metadata?.organizationId;
        const plan = (session.metadata?.plan || "PRO") as PlanTier;

        logger.info("Checkout session completed", {
          sessionId: session.id,
          customerId,
          organizationId,
          plan,
        });

        if (organizationId) {
          // Update or create subscription
          await prisma.subscription.upsert({
            where: { organizationId },
            update: {
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              plan,
              status: "ACTIVE",
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
            create: {
              organizationId,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              plan,
              status: "ACTIVE",
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          });

          await prisma.organization.update({
            where: { id: organizationId },
            data: { planTier: plan },
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;
        const status = mapSubscriptionStatus(subscription.status);
        const priceId = subscription.items?.data?.[0]?.price?.id;
        const plan = priceId ? getPlanFromPriceId(priceId) : undefined;

        logger.info("Subscription updated", {
          subscriptionId: subscription.id,
          customerId,
          status,
          plan,
        });

        const existingSub = await prisma.subscription.findUnique({
          where: { stripeCustomerId: customerId },
        });

        if (existingSub) {
          await prisma.subscription.update({
            where: { stripeCustomerId: customerId },
            data: {
              status,
              plan: plan || existingSub.plan,
              currentPeriodEnd: subscription.current_period_end
                ? new Date(subscription.current_period_end * 1000)
                : existingSub.currentPeriodEnd,
              cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
            },
          });

          if (plan) {
            await prisma.organization.update({
              where: { id: existingSub.organizationId },
              data: { planTier: plan },
            });
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;

        logger.info("Subscription deleted", {
          subscriptionId: subscription.id,
          customerId,
        });

        const existingSub = await prisma.subscription.findUnique({
          where: { stripeCustomerId: customerId },
        });

        if (existingSub) {
          await prisma.subscription.update({
            where: { stripeCustomerId: customerId },
            data: {
              status: "CANCELED",
              plan: "FREE",
              cancelAtPeriodEnd: false,
            },
          });

          await prisma.organization.update({
            where: { id: existingSub.organizationId },
            data: { planTier: "FREE" },
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = invoice.customer as string;

        logger.warn("Invoice payment failed", {
          invoiceId: invoice.id,
          customerId,
        });

        const existingSub = await prisma.subscription.findUnique({
          where: { stripeCustomerId: customerId },
        });

        if (existingSub) {
          await prisma.subscription.update({
            where: { stripeCustomerId: customerId },
            data: { status: "PAST_DUE" },
          });
        }
        break;
      }

      default:
        logger.debug("Unhandled Stripe event", { type: event.type });
    }
  } catch (err) {
    logger.error("Stripe webhook handler error", {
      type: event.type,
      error: String(err),
    });
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
