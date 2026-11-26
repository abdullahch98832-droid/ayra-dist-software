import { describe, expect, it } from "vitest";
import { contributorsDoc, contributorsProblem, peopleNames, readContributors } from "./contributors";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";

describe("people who paid", () => {
  it("are two or more accounts, each once, adding up to the total", () => {
    expect(contributorsProblem([], "100")).toBeNull();
    expect(contributorsProblem([{ accountId: a, amount: "100" }], "100")).toBe("contributorsTwo");
    expect(contributorsProblem([{ accountId: a, amount: "50" }, { accountId: a, amount: "50" }], "100")).toBe("contributorsTwice");
    expect(contributorsProblem([{ accountId: a, amount: "50" }, { accountId: b, amount: "49.99" }], "100")).toBe("contributorsSum");
    expect(contributorsProblem([{ accountId: a, amount: "250,000" }, { accountId: b, amount: "250000.00" }], "500000")).toBeNull();
  });

  it("go to the database as accounts and come back with their names", () => {
    expect(contributorsDoc([{ accountId: a, amount: "10" }])).toEqual([{ account_id: a, amount: "10" }]);
    const saved = [{ account_id: a, name: "Aftab Chattha", amount: 250000 }, { name: "Mudassar Rao", amount: 250000 }];
    expect(readContributors(saved)).toEqual([{ accountId: a, name: "Aftab Chattha", amount: "250000.00" }, { accountId: "", name: "Mudassar Rao", amount: "250000.00" }]);
    expect(peopleNames(saved)).toBe("Aftab Chattha, Mudassar Rao");
    expect(peopleNames([])).toBeNull();
  });
});
