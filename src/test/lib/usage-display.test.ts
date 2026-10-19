import { describe, it, expect } from "vitest";
import {
  isUnlimited,
  usagePercent,
  usageState,
  formatLimit,
} from "@/lib/usage-display";

describe("isUnlimited", () => {
  it("treats a negative limit as unlimited", () => {
    expect(isUnlimited(-1)).toBe(true);
    expect(isUnlimited(0)).toBe(false);
    expect(isUnlimited(100)).toBe(false);
  });
});

describe("usagePercent", () => {
  it("computes a rounded percentage", () => {
    expect(usagePercent(25, 50)).toBe(50);
    expect(usagePercent(1, 3)).toBe(33);
  });

  it("clamps to 0–100", () => {
    expect(usagePercent(60, 50)).toBe(100);
    expect(usagePercent(0, 50)).toBe(0);
  });

  it("returns 0 for unlimited and 100 for a zero limit", () => {
    expect(usagePercent(5, -1)).toBe(0);
    expect(usagePercent(1, 0)).toBe(100);
  });
});

describe("usageState", () => {
  it("is ok well under the limit", () => {
    expect(usageState(10, 50)).toBe("ok");
  });

  it("warns at or above 80%", () => {
    expect(usageState(40, 50)).toBe("warn"); // exactly 80%
    expect(usageState(39, 50)).toBe("ok"); // 78%
  });

  it("flags limit when reached or exceeded", () => {
    expect(usageState(50, 50)).toBe("limit");
    expect(usageState(51, 50)).toBe("limit");
    expect(usageState(1, 0)).toBe("limit");
  });

  it("is unlimited for a negative limit", () => {
    expect(usageState(9999, -1)).toBe("unlimited");
  });
});

describe("formatLimit", () => {
  it("renders Unlimited for negative, the number otherwise", () => {
    expect(formatLimit(-1)).toBe("Unlimited");
    expect(formatLimit(100)).toBe("100");
    expect(formatLimit(0)).toBe("0");
  });
});
