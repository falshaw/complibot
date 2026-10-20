import { describe, it, expect } from "vitest";
import { DEMO_KNOWLEDGE } from "@/lib/demo-knowledge";
import {
  assessAnswer,
  isHedged,
  NO_SOURCE_CAP,
  parseCitations,
} from "@/lib/services/answerQuality";
import {
  applyRelevanceCutoff,
  keywordRelevance,
  semanticRelevance,
} from "@/lib/services/relevance";

/**
 * Fixtures: the model answers are real gemma4:31b output (think off) for the
 * sample questionnaire against the demo knowledge base; the relevances are
 * the ones retrieval produced for them. Default review threshold: 0.8.
 */

const THRESHOLD = 0.8;
const kb = (question: string) => {
  const e = DEMO_KNOWLEDGE.find((k) => k.question === question);
  if (!e) throw new Error(`no demo entry ${question}`);
  return e;
};
const src = (question: string, similarity: number) => ({ ...kb(question), similarity });

const AT_REST = "Do you encrypt data at rest?";
const IN_TRANSIT = "Do you encrypt data in transit?";
const PASSWORD = "What is your password policy?";
const SCANNING = "Do you perform vulnerability scanning?";
const BCP = "What is your business continuity plan?";
const ACCESS = "How do you handle access control?";
const SOC2 = "Are you SOC 2 certified?";

const WELL_GROUNDED = [
  {
    question: "Is customer data encrypted at rest? If yes, state the algorithm.",
    context: [src(AT_REST, 1), src(IN_TRANSIT, 0.726)],
    raw: "Yes. All data at rest is encrypted using AES-256 encryption.\nSources: 1",
    cites: [AT_REST],
  },
  {
    question: "Is all traffic between clients and your service encrypted in transit?",
    context: [src(IN_TRANSIT, 0.902)],
    raw: "Yes. All data in transit is encrypted using TLS 1.2 or higher, and HTTPS is enforced across all endpoints with HSTS headers.\nSources: 1",
    cites: [IN_TRANSIT],
  },
  {
    question: "What are the minimum password requirements for user accounts?",
    context: [src(PASSWORD, 0.768)],
    raw: "Password requirements include a minimum of 12 characters with complexity requirements for uppercase, lowercase, numbers, and special characters. Passwords expire every 90 days, and password history prevents the reuse of the last 12 passwords.\nSources: 1",
    cites: [PASSWORD],
  },
  {
    question:
      "How often do you scan your systems for vulnerabilities, and how quickly are critical findings fixed?",
    context: [src(SCANNING, 0.914)],
    raw: "Automated vulnerability scanning is performed weekly on all external-facing systems and monthly on internal systems. Critical vulnerabilities are remediated within 7 days.\nSources: 1",
    cites: [SCANNING],
  },
  {
    // Weak retrieval (acronyms), but the answer is fully in the cited entry.
    question: "What are your RTO and RPO for critical systems?",
    context: [src(BCP, 0.467), src(ACCESS, 0.442)],
    raw: "The recovery time objective (RTO) for critical systems is 4 hours. The recovery point objective (RPO) for critical systems is 1 hour.\nSources: 1",
    cites: [BCP],
  },
];

describe("confidence reflects answer quality", () => {
  it.each(WELL_GROUNDED)("a well-grounded draft lands above the threshold: $question", (f) => {
    const r = assessAnswer(f.question, f.raw, f.context);
    expect(r.confidence).toBeGreaterThanOrEqual(THRESHOLD);
    expect(r.cited.map((i) => f.context[i].question)).toEqual(f.cites);
    expect(r.content).not.toMatch(/Sources:/);
  });

  it("a draft the knowledge base cannot support lands below the threshold", () => {
    const context = [src(SOC2, 0.45)];
    const notCovered = assessAnswer(
      "Do you hold FedRAMP High authorization?",
      "The knowledge base does not cover it.\nSources: none",
      context,
    );
    expect(notCovered.cited).toEqual([]);
    expect(notCovered.confidence).toBeLessThanOrEqual(NO_SOURCE_CAP * 0.5);
  });

  it("an invented answer that cites a loosely related entry lands below the threshold", () => {
    const r = assessAnswer(
      "Do you hold FedRAMP High authorization?",
      "Yes. The platform holds FedRAMP High authorization granted by the JAB and is reassessed by a 3PAO every year.\nSources: 1",
      [src(SOC2, 0.45)],
    );
    expect(r.cited).toEqual([0]);
    expect(r.signals.grounding).toBeLessThan(0.3);
    expect(r.confidence).toBeLessThan(0.5);
  });

  it("a partial answer that says what is not covered lands below the threshold", () => {
    const r = assessAnswer(
      "Is customer data encrypted at rest? Which HSM vendor holds the keys?",
      "Yes. Data at rest is encrypted with AES-256 and keys are kept in a KMS. The knowledge base does not specify the HSM vendor.\nSources: 1",
      [src(AT_REST, 1)],
    );
    expect(r.signals.hedged).toBe(true);
    expect(r.confidence).toBeLessThan(THRESHOLD);
  });
});

describe("citations: only what the answer used", () => {
  it("cites only the sources named on the Sources line", () => {
    const r = assessAnswer(
      WELL_GROUNDED[0].question,
      WELL_GROUNDED[0].raw,
      WELL_GROUNDED[0].context,
    );
    expect(r.cited).toEqual([0]); // the in-transit entry was context, not used
  });

  it("parses the variants models write and ignores numbers outside the context", () => {
    expect(parseCitations("Yes.\n**Sources:** 2, 1", 3)).toEqual({ content: "Yes.", cited: [1, 0] });
    expect(parseCitations("Yes.\nSources used: [1], [3].", 3)).toEqual({ content: "Yes.", cited: [0, 2] });
    expect(parseCitations("Yes.\nSources: 1, 7", 2).cited).toEqual([0]);
    expect(parseCitations("Not covered.\nSources: none", 2).cited).toEqual([]);
    expect(parseCitations("Not covered.\nSources: N/A", 2).cited).toEqual([]);
  });

  it("strips inline source markers and uses them when there is no Sources line", () => {
    expect(parseCitations("TLS 1.2 is enforced [Source 2]. Keys rotate yearly [1, 3].", 3)).toEqual({
      content: "TLS 1.2 is enforced. Keys rotate yearly.",
      cited: [1, 0, 2],
    });
  });

  it("falls back to the entries the answer visibly draws on when nothing is declared", () => {
    const r = assessAnswer(
      "Is customer data encrypted at rest?",
      "Yes. All data at rest is encrypted with AES-256, using TDE for databases and a KMS for keys.",
      [src(AT_REST, 1), src(IN_TRANSIT, 0.726)],
    );
    expect(r.cited).toEqual([0]);
    expect(r.confidence).toBeGreaterThanOrEqual(THRESHOLD);
  });

  it("recognises drafts that say the knowledge base does not cover the question", () => {
    expect(isHedged("The knowledge base does not cover it.")).toBe(true);
    expect(isHedged("This is not covered in the knowledge base.")).toBe(true);
    expect(isHedged("No information is available on bug bounties.")).toBe(true);
    // Ordinary negatives are answers, not hedges
    expect(isHedged("Passwords are not provided to support staff.")).toBe(false);
    expect(isHedged("Customer data is not stored on laptops.")).toBe(false);
  });
});

describe("relevance cut-off", () => {
  it("maps semantic and keyword scores onto one scale", () => {
    expect(semanticRelevance(0.45)).toBe(0);
    expect(semanticRelevance(0.8)).toBe(1);
    expect(semanticRelevance(0.78)).toBeCloseTo(0.943, 3);
    expect(keywordRelevance(0.25)).toBe(0.5);
    expect(keywordRelevance(0.6)).toBe(1);
  });

  it("keeps the strong entries and drops the noise (sample question 1, semantic)", () => {
    // nomic-embed-text cosine similarities measured for question 1
    const results = [0.78, 0.704, 0.617, 0.612, 0.604].map((cos, i) => ({
      id: `e${i}`,
      similarity: semanticRelevance(cos),
    }));
    expect(applyRelevanceCutoff(results).map((r) => r.id)).toEqual(["e0", "e1"]);
  });

  it("keeps only the matching entry when one clearly wins (keyword only)", () => {
    const results = [0.519, 0.333, 0.167].map((s, i) => ({ id: `e${i}`, similarity: keywordRelevance(s) }));
    expect(applyRelevanceCutoff(results).map((r) => r.id)).toEqual(["e0"]);
  });

  it("applies the absolute minimum even when everything is weak", () => {
    const results = [0.29, 0.2].map((similarity, i) => ({ id: `e${i}`, similarity }));
    expect(applyRelevanceCutoff(results)).toEqual([]);
    expect(applyRelevanceCutoff([])).toEqual([]);
  });
});
