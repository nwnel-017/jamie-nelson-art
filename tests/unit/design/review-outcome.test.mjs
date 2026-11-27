import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { reviewOutcome } from "../../../scripts/design-review-result.mjs";

const head = "a".repeat(40);
const page = "http://127.0.0.1:3010/artworks/gallery";
const review = {
  findings: [],
  inspection: {
    status: "complete",
    commit: head,
    pages: [page],
    report: "Compared gallery layout to reference.",
  },
};
const evidence = [
  { commit: head, page, tool: "browser_take_screenshot", visual: true },
];

describe("design review outcome", () => {
  test("passes a complete inspection with trusted visual evidence for the reviewed commit", () => {
    assert.equal(reviewOutcome(review, head, evidence).findings, 0);
  });

  test("reports an incomplete inspection as a finding", () => {
    assert.equal(
      reviewOutcome(
        {
          ...review,
          inspection: { ...review.inspection, status: "incomplete", pages: [] },
        },
        head,
      ).findings,
      1,
    );
  });

  test.each([
    ["missing visual evidence", review, head, undefined],
    [
      "visual evidence for another commit",
      review,
      head,
      [{ ...evidence[0], commit: "b".repeat(40) }],
    ],
    ["inspection for another commit", review, "b".repeat(40), evidence],
    [
      "no inspected page",
      { ...review, inspection: { ...review.inspection, pages: [] } },
      head,
      evidence,
    ],
    [
      "an external inspected page",
      {
        ...review,
        inspection: {
          ...review.inspection,
          pages: ["https://production.example"],
        },
      },
      head,
      evidence,
    ],
  ])("rejects %s", (_name, value, commit, captures) => {
    assert.throws(() => reviewOutcome(value, commit, captures));
  });
});
