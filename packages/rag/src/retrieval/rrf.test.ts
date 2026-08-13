import { describe, expect, it } from "vitest";
import { reciprocalRankFusion, type RankedCandidate } from "./rrf.js";

describe("reciprocalRankFusion", () => {
  it("preserves relative order for a single list", () => {
    const list: RankedCandidate<string>[] = [
      { id: "x", payload: "px" },
      { id: "y", payload: "py" },
      { id: "z", payload: "pz" }
    ];

    const fused = reciprocalRankFusion([list]);

    expect(fused.map((r) => r.id)).toEqual(["x", "y", "z"]);
  });

  it("sorts results in descending order of score", () => {
    const list: RankedCandidate<string>[] = [
      { id: "a", payload: "pa" },
      { id: "b", payload: "pb" },
      { id: "c", payload: "pc" }
    ];

    const fused = reciprocalRankFusion([list]);

    for (let i = 0; i < fused.length - 1; i++) {
      expect(fused[i]!.score).toBeGreaterThanOrEqual(fused[i + 1]!.score);
    }
  });

  it("boosts an id appearing in multiple lists above its single-list score", () => {
    const listA: RankedCandidate<number>[] = [
      { id: "shared", payload: 1 },
      { id: "onlyA", payload: 2 }
    ];
    const listB: RankedCandidate<number>[] = [
      { id: "shared", payload: 3 },
      { id: "onlyB", payload: 4 }
    ];

    const fused = reciprocalRankFusion([listA, listB]);
    const shared = fused.find((r) => r.id === "shared")!;
    const onlyA = fused.find((r) => r.id === "onlyA")!;
    const onlyB = fused.find((r) => r.id === "onlyB")!;

    const soloScoreAtRank1 = 1 / (60 + 1);
    expect(shared.score).toBeGreaterThan(soloScoreAtRank1);
    expect(shared.score).toBeGreaterThan(onlyA.score);
    expect(shared.score).toBeGreaterThan(onlyB.score);
    expect(fused[0]!.id).toBe("shared");
  });

  it("keeps the payload from the first list that introduced an id", () => {
    const listA: RankedCandidate<string>[] = [{ id: "shared", payload: "from-list-A" }];
    const listB: RankedCandidate<string>[] = [{ id: "shared", payload: "from-list-B" }];

    const fused = reciprocalRankFusion([listA, listB]);

    expect(fused).toHaveLength(1);
    expect(fused[0]!.payload).toBe("from-list-A");
  });

  it("returns an empty array for empty input lists", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });

  it("respects a custom k parameter", () => {
    const list: RankedCandidate<string>[] = [{ id: "a", payload: "pa" }];

    const withDefaultK = reciprocalRankFusion([list]);
    const withSmallK = reciprocalRankFusion([list], 1);

    expect(withSmallK[0]!.score).toBeGreaterThan(withDefaultK[0]!.score);
  });
});
