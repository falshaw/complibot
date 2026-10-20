/**
 * CompliBot - Stripe Client
 * Lazy-initialized Stripe instance for server-side use.
 */

import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

/**
 * Get the Stripe client instance.
 * Returns null if STRIPE_SECRET_KEY is not configured.
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  if (!stripeInstance) {
    stripeInstance = new Stripe(key, {
      typescript: true,
    });
  }
  return stripeInstance;
}

/**
 * Get the Stripe client or throw if not configured.
 */
export function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.",
    );
  }
  return stripe;
}
