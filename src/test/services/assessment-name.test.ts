import { describe, it, expect } from "vitest";
import { assessmentName } from "@/lib/services/assessmentName";

describe("assessmentName", () => {
  it("does not double the word Assessment", () => {
    expect(assessmentName("NIST CSF Assessment")).toBe("NIST CSF Assessment");
    expect(assessmentName("SIG Lite")).toBe("SIG Lite Assessment");
    expect(assessmentName("SOC 2 Type II Readiness")).toBe("SOC 2 Type II Readiness Assessment");
  });
});
