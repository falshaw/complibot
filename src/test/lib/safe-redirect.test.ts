import { describe, it, expect } from "vitest";
import { safeCallbackPath } from "@/lib/safe-redirect";

describe("safeCallbackPath (login redirect)", () => {
  it("returns to the app page the user came from", () => {
    expect(safeCallbackPath("/questionnaires/abc")).toBe("/questionnaires/abc");
    expect(safeCallbackPath("/knowledge?search=mfa")).toBe("/knowledge?search=mfa");
    expect(safeCallbackPath(`${window.location.origin}/audit`)).toBe("/audit");
  });

  it("never leaves the app", () => {
    for (const bad of [
      null,
      "",
      "https://evil.example/dashboard",
      "//evil.example",
      "/\\evil",
      "/login",
      "/api/auth/signout",
      "javascript:alert(1)",
      "dashboard",
    ]) {
      expect(safeCallbackPath(bad)).toBe("/dashboard");
    }
  });
});
