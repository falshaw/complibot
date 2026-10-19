"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield,
  LayoutDashboard,
  BookOpen,
  FileText,
  MessageSquare,
  ScrollText,
  Settings,
  LayoutTemplate,
  BarChart3,
  Users,
  CreditCard,
} from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/knowledge", icon: BookOpen, label: "Knowledge Base" },
  { href: "/questionnaires", icon: FileText, label: "Questionnaires" },
  { href: "/templates", icon: LayoutTemplate, label: "Templates" },
  { href: "/knowledge/interview", icon: MessageSquare, label: "AI Interview" },
  { href: "/knowledge/gap-analysis", icon: BarChart3, label: "Gap Analysis" },
  { href: "/audit", icon: ScrollText, label: "Audit Trail" },
  { href: "/team", icon: Users, label: "Team" },
  { href: "/settings/billing", icon: CreditCard, label: "Billing" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-[#0f172a] border-r border-slate-800 flex flex-col">
      <div className="px-6 py-5 border-b border-slate-800">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Shield className="w-7 h-7 text-indigo-400" />
          <span className="text-lg font-bold text-white">CompliBot</span>
        </Link>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-800",
              )}
            >
              <Icon className="w-5 h-5" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-slate-800">
        <div className="text-xs text-slate-600 text-center">
          CompliBot v0.1.0
        </div>
      </div>
    </aside>
  );
}
