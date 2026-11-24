import { describe, expect, it } from "vitest";
import en from "./en";
import { fill } from "./format";
import ur from "./ur";

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, path = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [[`${path}${key}`, value] as [string, string]] : leaves(value, `${path}${key}.`)
  );
}
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("dictionaries", () => {
  const english = new Map(leaves(en));
  const urdu = new Map(leaves(ur as unknown as Tree));

  it("have the same keys", () => {
    expect([...urdu.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it("have no empty strings and the same placeholders", () => {
    for (const [key, text] of english) {
      expect(text.trim(), key).not.toBe("");
      expect(urdu.get(key)?.trim(), key).not.toBe("");
      expect(placeholders(urdu.get(key) ?? ""), key).toEqual(placeholders(text));
    }
  });

  it("are translated: Urdu text contains Urdu letters", () => {
    const latinOnly = new Set(["footer.developerName"]);
    for (const [key, text] of urdu) {
      const words = text.replace(/\{\w+\}/g, "");
      if (!latinOnly.has(key) && /\p{L}/u.test(words)) expect(text, key).toMatch(/\p{Script=Arabic}/u);
    }
  });
});

describe("fill", () => {
  it("replaces known placeholders and leaves unknown ones visible", () => {
    expect(fill("{from}–{to} of {total}", { from: 1, to: 25, total: "1,200" })).toBe("1–25 of 1,200");
    expect(fill("{missing}", {})).toBe("{missing}");
  });
});
