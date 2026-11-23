import { describe, expect, it } from "vitest";
import { likeTerm } from "./like-term";

describe("likeTerm", () => {
  it("removes filter and wildcard syntax", () => {
    expect(likeTerm("a,phone.eq.1)%_*\"")).toBe("a phone.eq.1");
    expect(likeTerm("  ,%() ")).toBe("");
  });
  it("keeps Urdu and normal text", () => {
    expect(likeTerm(" احمد  رضا ")).toBe("احمد رضا");
    expect(likeTerm("EMP-0001")).toBe("EMP-0001");
  });
});
