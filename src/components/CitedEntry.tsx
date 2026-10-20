import Link from "next/link";
import { domainLabel } from "@/lib/ui/labels";

export interface CitedSource {
  id: string;
  similarity: number;
  rank: number;
  knowledgeEntry: {
    id: string;
    question: string;
    answer: string;
    domain: string;
    isVerified?: boolean;
    source?: { name: string; sourceType: string } | null;
  };
}

const SOURCE_KIND: Record<string, string> = {
  QUESTIONNAIRE: "past questionnaire",
  POLICY: "policy",
  INTERVIEW: "interview",
  MANUAL: "manual entry",
};

/**
 * One knowledge-base excerpt an answer cites, as a dark terminal-style block
 * (dark in both themes). Plain text nodes only, never HTML strings.
 */
export function CitedEntry({ n, source }: { n: number; source: CitedSource }) {
  const e = source.knowledgeEntry;
  const kind = e.source ? (SOURCE_KIND[e.source.sourceType] ?? "source") : "manual entry";
  return (
    <figure className="m-0 min-w-0">
      <figcaption className="eyebrow mb-1.5">
        [{n}] Cited entry · {kind}
      </figcaption>
      <pre className="code wrap m-0" tabIndex={0} aria-label={`Cited entry ${n}`}>
        <span className="c">
          # rank {source.rank + 1} · similarity {source.similarity.toFixed(2)}
        </span>
        {"\n"}
        <span className="k">entry</span>{"   "}
        <Link href={`/knowledge/${e.id}`} className="underline decoration-dotted underline-offset-2 hover:text-white">
          {e.id}
        </Link>
        {"\n"}
        <span className="k">source</span>{"  "}<span className="s">{e.source?.name ?? "added by hand"}</span>
        {"\n"}
        <span className="k">domain</span>{"  "}{domainLabel(e.domain)}
        {e.isVerified ? " · verified" : " · not verified"}
        {"\n"}
        <span className="k">q</span>{"  "}{e.question}
        {"\n"}
        <span className="k">a</span>{"  "}<span className="s">&quot;{e.answer}&quot;</span>
      </pre>
    </figure>
  );
}
