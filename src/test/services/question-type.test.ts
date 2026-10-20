import { describe, it, expect } from "vitest";
import { detectQuestionType } from "@/lib/services/questionType";

describe("detectQuestionType", () => {
  it("treats frequency and duration questions as free text, not dates", () => {
    // The sample questionnaire's question 4 used to be labelled DATE.
    expect(
      detectQuestionType(
        "How often do you scan your systems for vulnerabilities, and how quickly are critical findings fixed?",
      ),
    ).toBe("FREE_TEXT");
    expect(detectQuestionType("How frequently are backups restored as a test?")).toBe("FREE_TEXT");
    expect(detectQuestionType("How long do you keep audit logs?")).toBe("FREE_TEXT");
    expect(detectQuestionType("What is the frequency of access reviews?")).toBe("FREE_TEXT");
  });

  it("detects yes/no questions by their leading auxiliary verb", () => {
    expect(detectQuestionType("Do you encrypt data at rest?")).toBe("YES_NO");
    expect(detectQuestionType("Does your organization have an IR plan?")).toBe("YES_NO");
    expect(detectQuestionType("Is customer data encrypted at rest? If yes, state the algorithm.")).toBe("YES_NO");
    expect(detectQuestionType("Is all traffic between clients and your service encrypted in transit?")).toBe("YES_NO");
    expect(detectQuestionType("Has the incident response plan been tested?")).toBe("YES_NO");
    expect(detectQuestionType("Are there formal security policies?")).toBe("YES_NO");
  });

  it("detects date questions", () => {
    expect(detectQuestionType("When was your last security audit?")).toBe("DATE");
    expect(detectQuestionType("What is the date of your most recent pen test?")).toBe("DATE");
  });

  it("detects numeric questions", () => {
    expect(detectQuestionType("How many employees have access to production?")).toBe("NUMERIC");
    expect(detectQuestionType("What is the number of data centers?")).toBe("NUMERIC");
    expect(detectQuestionType("What percentage of laptops use full-disk encryption?")).toBe("NUMERIC");
  });

  it("does not read 'rate', 'count' or 'report' inside other questions as a type", () => {
    expect(detectQuestionType("Is there rate limiting on the public API?")).toBe("YES_NO");
    expect(detectQuestionType("Describe how service accounts are managed")).toBe("FREE_TEXT");
    expect(detectQuestionType("How do staff report a suspected phishing email?")).toBe("FREE_TEXT");
  });

  it("detects evidence requests", () => {
    expect(detectQuestionType("Please provide your SOC 2 report")).toBe("EVIDENCE");
    expect(detectQuestionType("Please attach the latest penetration test results")).toBe("EVIDENCE");
    expect(detectQuestionType("Provide a copy of your information security policy.")).toBe("EVIDENCE");
  });

  it("detects multiple choice questions", () => {
    expect(detectQuestionType("Which of the following certifications do you hold?")).toBe("MULTIPLE_CHOICE");
    expect(detectQuestionType("Select all applicable controls")).toBe("MULTIPLE_CHOICE");
  });

  it("defaults to free text", () => {
    expect(detectQuestionType("Describe your security architecture")).toBe("FREE_TEXT");
    expect(detectQuestionType("What are your RTO and RPO for critical systems?")).toBe("FREE_TEXT");
    expect(detectQuestionType("What are the minimum password requirements for user accounts?")).toBe("FREE_TEXT");
  });
});
