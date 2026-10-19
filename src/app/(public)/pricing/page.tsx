"use client";

import Link from "next/link";
import { Check } from "lucide-react";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Try it on real questionnaires — no card required",
    features: [
      "5 questionnaires / month",
      "100 knowledge base entries",
      "50 AI generations / month",
      "2 team members",
      "CSV export",
      "Community support",
    ],
    cta: "Get Started",
    href: "/register",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$99",
    period: "/month",
    description: "For teams answering questionnaires every week",
    features: [
      "Unlimited questionnaires",
      "Unlimited AI generations",
      "1,000 knowledge base entries",
      "10 team members",
      "CSV + Excel export",
      "Knowledge base interview",
      "Bulk approve / reject",
      "Priority support",
    ],
    cta: "Start Free Trial",
    href: "/register?plan=pro",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "$299",
    period: "/month",
    description: "For high questionnaire volume and security reviews",
    features: [
      "Everything in Pro",
      "Unlimited knowledge base entries",
      "SSO / SAML",
      "API access",
      "PDF export",
      "Audit logs",
      "Dedicated support",
      "SLA guarantee",
    ],
    cta: "Contact Sales",
    href: "mailto:sales@example.com",
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      {/* Nav */}
      <nav className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-white">
            Compli<span className="text-indigo-400">Bot</span>
          </Link>
          <Link
            href="/login"
            className="text-sm text-slate-400 hover:text-white"
          >
            Sign In
          </Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-white mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Start free. Upgrade when you need more capacity.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-8 ${
                plan.highlighted
                  ? "bg-indigo-600/10 border-2 border-indigo-500 relative"
                  : "bg-slate-800/50 border border-slate-700"
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-medium px-3 py-1 rounded-full">
                  Most Popular
                </span>
              )}
              <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
              <p className="text-sm text-slate-400 mb-4">{plan.description}</p>
              <div className="mb-6">
                <span className="text-4xl font-bold text-white">
                  {plan.price}
                </span>
                <span className="text-slate-400 text-sm">{plan.period}</span>
              </div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-2 text-sm text-slate-300"
                  >
                    <Check className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`block text-center py-2.5 rounded-lg font-medium text-sm ${
                  plan.highlighted
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                    : "bg-slate-700 hover:bg-slate-600 text-white"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
