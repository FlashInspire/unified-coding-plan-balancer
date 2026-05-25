import { describe, expect, it } from "vitest";
import {
  generatePlaintext,
  sha256Hex,
  maskKey,
  extractBearer,
} from "@/lib/auth/apiKey";

describe("apiKey utilities", () => {
  it("generatePlaintext produces sk-y6- prefixed key", () => {
    const k = generatePlaintext();
    expect(k.startsWith("sk-y6-")).toBe(true);
    expect(k.length).toBeGreaterThan(20);
  });

  it("sha256Hex is deterministic and 64-char hex", () => {
    const a = sha256Hex("hello");
    const b = sha256Hex("hello");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("maskKey shows prefix + suffix only", () => {
    const masked = maskKey("sk-y6-ABCDEFGHIJKLMNOP");
    expect(masked).toContain("…");
    expect(masked.startsWith("sk-y")).toBe(true);
  });

  it("extractBearer parses Authorization header", () => {
    const req = new Request("http://x/", {
      headers: { Authorization: "Bearer sk-test" },
    });
    expect(extractBearer(req)).toBe("sk-test");
  });

  it("extractBearer returns null when missing", () => {
    const req = new Request("http://x/");
    expect(extractBearer(req)).toBe(null);
  });
});
