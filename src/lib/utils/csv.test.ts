import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes, keeps Urdu and starts with a BOM", () => {
    expect(toCsv([["a", 'say "hi", ok'], ["صابن", null]])).toBe('﻿a,"say ""hi"", ok"\r\nصابن,\r\n');
  });
  it("neutralises formulas but not negative numbers", () => {
    expect(toCsv([["=1+1", "@x", "-12.50", "+92", "-x"]])).toBe("﻿'=1+1,'@x,-12.50,'+92,'-x\r\n");
  });
});
