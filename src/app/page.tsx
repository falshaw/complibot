import Link from "next/link";
import {
  Shield,
  Upload,
  Brain,
  FileCheck,
  Clock,
  CheckCircle,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#334155]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <Shield className="w-8 h-8 text-indigo-400" />
          <span className="text-xl font-bold text-white">CompliBot</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link
            href="/pricing"
            className="text-slate-300 hover:text-white text-sm"
          >
            Pricing
          </Link>
          <Link
            href="/login"
            className="text-slate-300 hover:text-white text-sm"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Get Started Free
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-block px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm mb-6">
          Security Questionnaire Automation
        </div>
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
          Answer Security Questionnaires
          <br />
          <span className="text-indigo-400">in Minutes, Not Weeks</span>
        </h1>
        <p className="text-xl text-slate-400 mb-8 max-w-2xl mx-auto">
          Upload any vendor security questionnaire. CompliBot uses your
          company&apos;s knowledge base to generate accurate, consistent answers
          with AI.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/register"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg text-lg font-medium transition-colors"
          >
            Start Free Trial
          </Link>
          <Link
            href="/pricing"
            className="border border-slate-600 hover:border-slate-500 text-slate-300 px-8 py-3 rounded-lg text-lg font-medium transition-colors"
          >
            View Pricing
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-12">
          How It Works
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: Brain,
              title: "1. Build Knowledge Base",
              desc: "Upload past questionnaires, policy docs, or run an AI interview to capture your security posture.",
            },
            {
              icon: Upload,
              title: "2. Upload Questionnaire",
              desc: "Drop in any vendor security questionnaire (Excel/CSV). CompliBot parses and classifies every question.",
            },
            {
              icon: FileCheck,
              title: "3. Review & Export",
              desc: "AI generates answers with confidence scores. Review side-by-side, approve or edit, and export back to Excel.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card-panel text-center">
              <div className="w-14 h-14 rounded-xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
                <Icon className="w-7 h-7 text-indigo-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
              <p className="text-slate-400 text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold text-white mb-6">
              Why Teams Choose CompliBot
            </h2>
            <div className="space-y-4">
              {[
                {
                  icon: Clock,
                  text: "Draft answers in minutes, not days",
                },
                {
                  icon: Shield,
                  text: "Self-hosted — your answers never leave your infrastructure",
                },
                {
                  icon: CheckCircle,
                  text: "Consistent, reviewable answers with a confidence score",
                },
                {
                  icon: Brain,
                  text: "Learns from every questionnaire you complete",
                },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3">
                  <Icon className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <span className="text-slate-300">{text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card-panel">
            <div className="text-center py-8">
              <div className="text-3xl font-bold text-indigo-400 mb-2">
                Your data, your servers
              </div>
              <div className="text-slate-400">
                Self-hosted with local AI (Ollama)
              </div>
              <div className="text-sm text-slate-500 mt-1">
                Questionnaire answers and security posture never leave your
                infrastructure.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 mt-16">
        <div className="max-w-6xl mx-auto px-6 py-8 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            <span className="text-sm text-slate-400">CompliBot</span>
          </div>
          <div className="text-sm text-slate-500">
            &copy; {new Date().getFullYear()} CompliBot
          </div>
        </div>
      </footer>
    </div>
  );
}
