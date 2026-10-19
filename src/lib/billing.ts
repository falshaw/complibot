/**
 * CompliBot - Billing utilities and plan limits
 */

import type { PlanTier } from "@prisma/client";
import prisma from "./prisma";
import { logger } from "./logger";

export interface PlanLimits {
  questionnairesPerMonth: number;
  kbEntries: number;
  aiGenerationsPerMonth: number;
  teamMembers: number;
  exportFormats: string[];
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  FREE: {
    questionnairesPerMonth: 5,
    kbEntries: 100,
    aiGenerationsPerMonth: 50,
    teamMembers: 2,
    exportFormats: ["csv"],
  },
  PRO: {
    questionnairesPerMonth: -1, // unlimited
    kbEntries: 1000,
    aiGenerationsPerMonth: -1,
    teamMembers: 10,
    exportFormats: ["csv", "xlsx"],
  },
  ENTERPRISE: {
    questionnairesPerMonth: -1,
    kbEntries: -1,
    aiGenerationsPerMonth: -1,
    teamMembers: -1,
    exportFormats: ["csv", "xlsx", "pdf"],
  },
};

/**
 * Throw a clear error when a required environment variable is absent.
 * Called lazily (inside getters) so startup doesn't fail for paths that
 * never reach Stripe — only the actual Stripe call fails loudly.
 */
function requiredEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in .env before enabling Stripe billing.`,
    );
  }
  return val;
}

export const PLAN_PRICES: Record<
  string,
  { name: string; price: number; readonly priceId: string }
> = {
  FREE: { name: "Free", price: 0, priceId: "" },
  PRO: {
    name: "Pro",
    price: 99,
    get priceId() {
      return requiredEnv("STRIPE_PRO_PRICE_ID");
    },
  },
  ENTERPRISE: {
    name: "Enterprise",
    price: 299,
    get priceId() {
      return requiredEnv("STRIPE_ENTERPRISE_PRICE_ID");
    },
  },
};

/**
 * Get the current billing period start (first day of current month, UTC).
 */
export function getCurrentPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Get the organization's current plan tier.
 */
export async function getOrgPlan(organizationId: string): Promise<PlanTier> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { planTier: true },
  });
  return org?.planTier || "FREE";
}

/**
 * Get current usage for a metric in the current billing period.
 */
export async function getCurrentUsage(
  organizationId: string,
  metric: string,
): Promise<number> {
  const period = getCurrentPeriodStart();
  const record = await prisma.usageRecord.findUnique({
    where: {
      organizationId_metric_period: {
        organizationId,
        metric,
        period,
      },
    },
  });
  return record?.count || 0;
}

/**
 * Increment usage for a metric. Returns the new count.
 */
export async function incrementUsage(
  organizationId: string,
  metric: string,
  amount: number = 1,
): Promise<number> {
  const period = getCurrentPeriodStart();
  const record = await prisma.usageRecord.upsert({
    where: {
      organizationId_metric_period: {
        organizationId,
        metric,
        period,
      },
    },
    update: { count: { increment: amount } },
    create: {
      organizationId,
      metric,
      period,
      count: amount,
    },
  });
  return record.count;
}

/**
 * Check if the organization can perform an action based on plan limits.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export async function checkPlanLimit(
  organizationId: string,
  metric: keyof PlanLimits,
): Promise<{
  allowed: boolean;
  reason?: string;
  current?: number;
  limit?: number;
}> {
  const plan = await getOrgPlan(organizationId);
  const limits = PLAN_LIMITS[plan];

  // Map metric to the correct usage tracking key
  const usageMetricMap: Record<string, string> = {
    questionnairesPerMonth: "questionnaires",
    aiGenerationsPerMonth: "ai_generations",
  };

  // For non-monthly limits, check counts differently
  if (metric === "kbEntries") {
    const count = await prisma.knowledgeEntry.count({
      where: { organizationId },
    });
    const limit = limits.kbEntries;
    if (limit === -1) return { allowed: true, current: count, limit: -1 };
    if (count >= limit) {
      return {
        allowed: false,
        reason: `Knowledge base entry limit reached (${count}/${limit}). Upgrade to add more.`,
        current: count,
        limit,
      };
    }
    return { allowed: true, current: count, limit };
  }

  if (metric === "teamMembers") {
    const count = await prisma.user.count({
      where: { organizationId, isActive: true },
    });
    const limit = limits.teamMembers;
    if (limit === -1) return { allowed: true, current: count, limit: -1 };
    if (count >= limit) {
      return {
        allowed: false,
        reason: `Team member limit reached (${count}/${limit}). Upgrade to add more.`,
        current: count,
        limit,
      };
    }
    return { allowed: true, current: count, limit };
  }

  // Monthly usage metrics
  const usageKey = usageMetricMap[metric] || metric;
  const limitValue = limits[metric];
  if (typeof limitValue !== "number") {
    return { allowed: true };
  }
  if (limitValue === -1) return { allowed: true, current: 0, limit: -1 };

  const current = await getCurrentUsage(organizationId, usageKey);
  if (current >= limitValue) {
    return {
      allowed: false,
      reason: `Monthly ${metric} limit reached (${current}/${limitValue}). Upgrade your plan.`,
      current,
      limit: limitValue,
    };
  }

  return { allowed: true, current, limit: limitValue };
}

/**
 * Get a full usage summary for the organization.
 */
export async function getUsageSummary(organizationId: string) {
  const plan = await getOrgPlan(organizationId);
  const limits = PLAN_LIMITS[plan];

  const [questionnaires, aiGenerations, kbEntries, teamMembers] =
    await Promise.all([
      getCurrentUsage(organizationId, "questionnaires"),
      getCurrentUsage(organizationId, "ai_generations"),
      prisma.knowledgeEntry.count({ where: { organizationId } }),
      prisma.user.count({ where: { organizationId, isActive: true } }),
    ]);

  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
  });

  return {
    plan,
    subscription: subscription
      ? {
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }
      : null,
    usage: {
      questionnaires: {
        current: questionnaires,
        limit: limits.questionnairesPerMonth,
        label: "Questionnaires",
      },
      aiGenerations: {
        current: aiGenerations,
        limit: limits.aiGenerationsPerMonth,
        label: "AI Generations",
      },
      kbEntries: {
        current: kbEntries,
        limit: limits.kbEntries,
        label: "KB Entries",
      },
      teamMembers: {
        current: teamMembers,
        limit: limits.teamMembers,
        label: "Team Members",
      },
    },
    exportFormats: limits.exportFormats,
  };
}

/**
 * Sync subscription data from Stripe to local DB.
 */
export async function syncSubscription(
  stripeCustomerId: string,
  data: {
    subscriptionId?: string;
    plan: PlanTier;
    status: string;
    currentPeriodEnd?: Date;
    cancelAtPeriodEnd?: boolean;
  },
) {
  const subscription = await prisma.subscription.findUnique({
    where: { stripeCustomerId },
  });

  if (!subscription) {
    logger.warn("No subscription found for Stripe customer", {
      stripeCustomerId,
    });
    return;
  }

  await prisma.subscription.update({
    where: { stripeCustomerId },
    data: {
      stripeSubscriptionId:
        data.subscriptionId || subscription.stripeSubscriptionId,
      plan: data.plan,
      status: data.status as
        | "ACTIVE"
        | "PAST_DUE"
        | "CANCELED"
        | "INCOMPLETE"
        | "TRIALING",
      currentPeriodEnd: data.currentPeriodEnd || subscription.currentPeriodEnd,
      cancelAtPeriodEnd:
        data.cancelAtPeriodEnd ?? subscription.cancelAtPeriodEnd,
    },
  });

  // Also update the organization's planTier
  await prisma.organization.update({
    where: { id: subscription.organizationId },
    data: { planTier: data.plan },
  });

  logger.info("Subscription synced", {
    stripeCustomerId,
    plan: data.plan,
    status: data.status,
  });
}
