import { describe, expect, it } from "vitest";
import { phoneHref, whatsappHref } from "./phone";

describe("phone links", () => {
  it("dials what was typed", () => {
    expect(phoneHref("0300 123-4567")).toBe("tel:03001234567");
    expect(phoneHref("+92 300 1234567")).toBe("tel:+923001234567");
    expect(phoneHref("12")).toBeNull();
    expect(phoneHref(null)).toBeNull();
  });

  it("uses the international number for WhatsApp", () => {
    for (const n of ["0300 1234567", "+92 300 1234567", "0092-300-1234567", "923001234567"]) expect(whatsappHref(n)).toBe("https://wa.me/923001234567");
    expect(whatsappHref("")).toBeNull();
  });
});
