/**
 * CompliBot - Questionnaire Templates (CB-03)
 * Browse built-in + custom templates. Create questionnaire from template,
 * clone, preview questions, filter by framework.
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Copy,
  Plus,
  Shield,
  RefreshCw,
  Search,
  CheckCircle,
  Play,
  ChevronDown,
  ChevronUp,
  X,
  Hash,
  Tag,
} from "lucide-react";

interface TemplateQuestion {
  text: string;
  type: string;
  domain: string;
  required: boolean;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  framework: string | null;
  version: string;
  isBuiltIn: boolean;
  questionCount: number;
  domains: string[];
  questions?: TemplateQuestion[];
  createdAt: string;
}

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [frameworkFilter, setFrameworkFilter] = useState<string>("all");
  const [cloning, setCloning] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/templates");
      const json = await res.json();
      if (json.success) setTemplates(json.templates);
    } catch {
      /* silent */
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  // Load full template with questions when preview is opened
  useEffect(() => {
    if (!previewId) {
      setPreviewTemplate(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/templates/${previewId}`);
        const json = await res.json();
        if (json.success) setPreviewTemplate(json.template);
      } catch {
        /* silent */
      }
    })();
  }, [previewId]);

  const handleClone = async (id: string) => {
    setCloning(id);
    try {
      const res = await fetch(`/api/templates/${id}`, { method: "POST" });
      if (res.ok) await fetchTemplates();
    } catch {
      /* silent */
    }
    setCloning(null);
  };

  const handleCreateFromTemplate = async (
    templateId: string,
    templateName: string,
  ) => {
    setCreating(templateId);
    try {
      const res = await fetch("/api/questionnaires/from-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      const json = await res.json();
      if (json.success && json.questionnaire) {
        router.push(`/questionnaires/${json.questionnaire.id}`);
        return;
      }
    } catch {
      /* silent */
    }
    setCreating(null);
  };

  const frameworks = [
    "all",
    ...new Set(templates.map((t) => t.framework).filter(Boolean)),
  ] as string[];

  const filtered = templates.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.framework?.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase());
    const matchesFramework =
      frameworkFilter === "all" || t.framework === frameworkFilter;
    return matchesSearch && matchesFramework;
  });

  const builtIn = filtered.filter((t) => t.isBuiltIn);
  const custom = filtered.filter((t) => !t.isBuiltIn);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-indigo-400" />
            Questionnaire Templates
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Start from industry-standard frameworks or create your own
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        {frameworks.length > 2 && (
          <div className="flex gap-2 flex-wrap">
            {frameworks.map((fw) => (
              <button
                key={fw}
                onClick={() => setFrameworkFilter(fw)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  frameworkFilter === fw
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
                }`}
              >
                {fw === "all" ? "All" : fw}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Built-in Templates */}
      {builtIn.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Industry Frameworks ({builtIn.length}
            )
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {builtIn.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onClone={handleClone}
                onCreate={handleCreateFromTemplate}
                onPreview={setPreviewId}
                cloning={cloning === t.id}
                creating={creating === t.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Custom Templates */}
      {custom.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Custom Templates ({custom.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {custom.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onClone={handleClone}
                onCreate={handleCreateFromTemplate}
                onPreview={setPreviewId}
                cloning={cloning === t.id}
                creating={creating === t.id}
              />
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No templates found</p>
        </div>
      )}

      {/* Preview Modal */}
      {previewId && previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          onClose={() => setPreviewId(null)}
          onCreate={handleCreateFromTemplate}
          creating={creating === previewTemplate.id}
        />
      )}
    </div>
  );
}

function TemplateCard({
  template,
  onClone,
  onCreate,
  onPreview,
  cloning,
  creating,
}: {
  template: Template;
  onClone: (id: string) => void;
  onCreate: (id: string, name: string) => void;
  onPreview: (id: string) => void;
  cloning: boolean;
  creating: boolean;
}) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 hover:border-indigo-500/40 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate">{template.name}</h3>
          {template.framework && (
            <span className="inline-block text-xs px-2 py-0.5 mt-1 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
              {template.framework}
            </span>
          )}
        </div>
        {template.isBuiltIn && (
          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-1" />
        )}
      </div>

      {template.description && (
        <p className="text-sm text-slate-400 mb-3 line-clamp-2">
          {template.description}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
        <span className="flex items-center gap-1">
          <Hash className="w-3 h-3" />
          {template.questionCount} questions
        </span>
        <span className="flex items-center gap-1">
          <Tag className="w-3 h-3" />
          {template.domains.length} domains
        </span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onCreate(template.id, template.name)}
          disabled={creating}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600/15 border border-emerald-500/30 rounded-lg text-sm text-emerald-400 hover:bg-emerald-600/25 transition-colors disabled:opacity-50"
        >
          {creating ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          Start Assessment
        </button>
        <button
          onClick={() => onClone(template.id)}
          disabled={cloning}
          className="flex items-center justify-center gap-1 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
          title="Clone as custom template"
        >
          {cloning ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          onClick={() => onPreview(template.id)}
          className="flex items-center justify-center px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          title="Preview questions"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function TemplatePreviewModal({
  template,
  onClose,
  onCreate,
  creating,
}: {
  template: Template;
  onClose: () => void;
  onCreate: (id: string, name: string) => void;
  creating: boolean;
}) {
  const questions = (template.questions || []) as TemplateQuestion[];
  const domainGroups = questions.reduce(
    (acc, q) => {
      const d = q.domain || "GENERAL";
      if (!acc[d]) acc[d] = [];
      acc[d].push(q);
      return acc;
    },
    {} as Record<string, TemplateQuestion[]>,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-700 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{template.name}</h2>
            {template.framework && (
              <span className="inline-block text-xs px-2 py-0.5 mt-1 rounded-full bg-indigo-500/15 text-indigo-400">
                {template.framework}
              </span>
            )}
            {template.description && (
              <p className="text-sm text-slate-400 mt-2">
                {template.description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Questions by domain */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {Object.entries(domainGroups).map(([domain, qs]) => (
            <div key={domain}>
              <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">
                {domain.replace(/_/g, " ")} ({qs.length})
              </h3>
              <div className="space-y-2">
                {qs.map((q, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 bg-slate-800/40 border border-slate-700/50 rounded-lg p-3"
                  >
                    <span className="text-xs text-slate-500 mt-0.5 font-mono min-w-[2rem]">
                      {idx + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-300">{q.text}</p>
                      <div className="flex gap-2 mt-1">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                          {q.type.replace(/_/g, " ")}
                        </span>
                        {q.required && (
                          <span className="text-xs text-amber-400">
                            Required
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-700 flex gap-3">
          <button
            onClick={() => onCreate(template.id, template.name)}
            disabled={creating}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {creating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Start Assessment ({questions.length} questions)
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
